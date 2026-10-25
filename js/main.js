/**
 * main.js — site-wide behavior and shared helpers.
 *
 * Owns: data loading (fetch + cache), tiny DOM helpers, the mobile nav toggle,
 * and hydration of the homepage (species spotlight + headline stats).
 * Page-specific features live in identify.js, guide.js, and adopt.js,
 * which import helpers from here.
 */
import { CONFIG } from './config.js';

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

const requests = new Map();

export function fetchJSON(url) {
  if (!requests.has(url)) {
    const request = fetch(url, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
        return response.json();
      })
      .catch((error) => {
        requests.delete(url); // allow a retry after a failure
        throw error;
      });
    requests.set(url, request);
  }
  return requests.get(url);
}

export const loadEndangered = () => fetchJSON(CONFIG.DATA.endangered);
export const loadInvasive = () => fetchJSON(CONFIG.DATA.invasive);
export const loadNative = () => fetchJSON(CONFIG.DATA.native);

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build an element without innerHTML, so dataset text is never parsed as markup.
 * h('p', { class: 'x', dataset: { id: 1 } }, 'text', childNode, [moreChildren])
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => node.replaceChildren();

export function badge(label, variant = 'neutral') {
  return h('span', { class: `badge badge--${variant}` }, label);
}

export function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86_400_000);
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Format an estimate object from the datasets: { value, qualifier }
 * qualifier: "exact" | "about" (~n) | "at_least" (n+)
 */
export function formatEstimate(estimate, { compact = false } = {}) {
  if (!estimate || typeof estimate.value !== 'number') return '—';
  const formatter = new Intl.NumberFormat(
    'en-US',
    compact ? { notation: 'compact', maximumFractionDigits: 1 } : {},
  );
  const text = formatter.format(estimate.value);
  if (estimate.qualifier === 'at_least') return `${text}+`;
  if (estimate.qualifier === 'about') return `~${text}`;
  return text;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function initNav() {
  document.documentElement.classList.add('js');

  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Homepage                                                            */
/* ------------------------------------------------------------------ */

function renderSpotlight(container, speciesList) {
  if (!speciesList.length) return;
  // Rotates once per day so the card is stable while someone reads it.
  const species = speciesList[dayOfYear() % speciesList.length];

  container.replaceChildren(
    h(
      'div',
      { class: 'hero-card-label' },
      h('span', { class: 'native-badge' }, `Native · ${species.status}`),
      h('strong', {}, species.common_name),
      h('p', {}, h('i', {}, species.scientific_name), ` — ${species.summary}`),
    ),
  );
}

/** "How invasive species cause harm" cards. Titles, text, and examples all come from invasive-species.json. */
function renderHarmTypes(container, invasive) {
  const types = invasive.meta?.harm_types ?? [];
  if (!types.length) return;

  container.replaceChildren(
    h(
      'ul',
      { class: 'harm-grid' },
      types.map((type) => {
        const examples = invasive.species
          .filter((species) => species.harm_types?.includes(type.id))
          .map((species) => species.common_name);
        return h(
          'li',
          {},
          h(
            'article',
            { class: 'harm-card' },
            h('h4', {}, type.title),
            h('p', {}, type.description),
            examples.length
              ? h('p', { class: 'harm-examples' }, h('strong', {}, 'Examples: '), examples.join(', '))
              : null,
          ),
        );
      }),
    ),
  );
}

function renderReporting(container, invasive) {
  const info = invasive.meta?.reporting;
  if (!info) return;
  container.replaceChildren(
    h('strong', {}, 'Found something? '),
    `Report invasive species in Florida by calling ${info.hotline_label} (${info.hotline_number}) or using the ${info.app_name} app. A clear photo and the location help most.`,
  );
}

function renderStats(elements, endangered, invasive) {
  const estimates = { ...endangered.meta?.home_stats, ...invasive.meta?.home_stats };
  elements.forEach((element) => {
    const estimate = estimates[element.dataset.stat];
    element.textContent = formatEstimate(estimate, {
      compact: element.dataset.format === 'compact',
    });
  });
}

async function initHome() {
  const spotlight = document.querySelector('[data-spotlight]');
  const statElements = document.querySelectorAll('[data-stat]');
  const harmTypes = document.querySelector('[data-harm-types]');
  const reporting = document.querySelector('[data-reporting]');

  try {
    const [endangered, invasive] = await Promise.all([loadEndangered(), loadInvasive()]);
    if (spotlight) renderSpotlight(spotlight, endangered.species ?? []);
    if (harmTypes) renderHarmTypes(harmTypes, invasive);
    if (reporting) renderReporting(reporting, invasive);
    renderStats(statElements, endangered, invasive);
  } catch (error) {
    console.error(error);
    const message = 'Species data could not be loaded. Refresh the page to try again.';
    if (spotlight) {
      spotlight.replaceChildren(h('p', { class: 'notice notice--error', role: 'alert' }, message));
    }
    if (harmTypes) harmTypes.replaceChildren(h('p', { class: 'notice notice--error' }, message));
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

initNav();
if (document.body.dataset.page === 'home') initHome();
