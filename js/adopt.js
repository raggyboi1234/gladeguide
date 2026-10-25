/**
 * adopt.js — "Adopt a Species" page only.
 *
 * A symbolic adoption: the visitor picks a species, names themselves, and chooses
 * one concrete action from that species' `how_to_help` list. Adoptions are stored
 * in this browser's localStorage. No payment or account is involved.
 */
import { CONFIG } from './config.js';
import { h, clear, badge, loadEndangered } from './main.js';

const els = {
  grid: document.getElementById('adopt-grid'),
  filter: document.getElementById('status-filter'),
  count: document.getElementById('adopt-count'),
  status: document.getElementById('adopt-status'),
  main: document.getElementById('main'),
  adoptedHeading: document.getElementById('adopted-heading'),
  adoptedList: document.getElementById('adopted-list'),
  adoptedEmpty: document.getElementById('adopted-empty'),
  dialog: document.getElementById('pledge-dialog'),
  form: document.getElementById('pledge-form'),
  dialogTitle: document.getElementById('pledge-title'),
  name: document.getElementById('pledge-name'),
  action: document.getElementById('pledge-action'),
  cancel: document.getElementById('pledge-cancel'),
};

let species = [];
let adoptions = readAdoptions();
let activeId = null;

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function readAdoptions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG.STORAGE.adoptions) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.speciesId === 'string') : [];
  } catch {
    return [];
  }
}

function writeAdoptions() {
  try {
    localStorage.setItem(CONFIG.STORAGE.adoptions, JSON.stringify(adoptions));
    return true;
  } catch {
    return false;
  }
}

const findAdoption = (id) => adoptions.find((a) => a.speciesId === id);
const findSpecies = (id) => species.find((s) => s.id === id);
const announce = (message) => { els.status.textContent = message; };

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function speciesCard(record) {
  const adopted = Boolean(findAdoption(record.id));

  return h(
    'article',
    { class: 'species-card species-card--native' },
    h(
      'div',
      { class: 'species-card-head' },
      h('h3', { class: 'species-name' }, record.common_name),
      h('p', { class: 'species-sci' }, h('i', {}, record.scientific_name)),
    ),
    h(
      'div',
      { class: 'badge-row' },
      badge(record.status, record.status === 'Endangered' ? 'invasive' : 'warn'),
      record.group ? badge(record.group, 'neutral') : null,
      adopted ? badge('Adopted', 'native') : null,
    ),
    h('p', {}, record.summary),
    h(
      'details',
      { class: 'species-details' },
      h('summary', {}, 'Threats it faces'),
      h('ul', {}, record.threats.map((threat) => h('li', {}, threat))),
    ),
    h(
      'button',
      {
        type: 'button',
        class: adopted ? 'btn btn-outline' : 'btn btn-primary',
        dataset: { adoptId: record.id },
        'aria-label': `${adopted ? 'Update pledge for' : 'Adopt'} the ${record.common_name}`,
      },
      adopted ? 'Update pledge' : 'Adopt this species',
    ),
  );
}

function renderGrid() {
  const status = els.filter.value;
  const visible = species.filter((s) => status === 'all' || s.status === status);

  clear(els.grid);
  visible.forEach((record) => els.grid.append(h('li', {}, speciesCard(record))));
  els.count.textContent = `${visible.length} species shown`;
}

function renderAdopted() {
  clear(els.adoptedList);
  const entries = adoptions
    .map((adoption) => ({ adoption, record: findSpecies(adoption.speciesId) }))
    .filter((entry) => entry.record);

  els.adoptedEmpty.hidden = entries.length > 0;

  entries.forEach(({ adoption, record }) => {
    const date = new Date(adoption.adoptedOn);
    const dateText = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    els.adoptedList.append(
      h(
        'li',
        { class: 'adoption' },
        h(
          'div',
          { class: 'adoption-body' },
          h('h3', { class: 'species-name' }, record.common_name),
          h('p', {}, `Adopted by ${adoption.adopterName}${dateText ? ` on ${dateText}` : ''}`),
          h('p', { class: 'muted' }, `My pledge: ${adoption.pledge}`),
        ),
        h(
          'div',
          { class: 'adoption-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-outline btn-sm',
              dataset: { adoptId: record.id },
              'aria-label': `Update pledge for the ${record.common_name}`,
            },
            'Update',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet btn-sm',
              dataset: { removeId: record.id },
              'aria-label': `Remove adoption of the ${record.common_name}`,
            },
            'Remove',
          ),
        ),
      ),
    );
  });
}

function renderAll() {
  renderGrid();
  renderAdopted();
}

/* ------------------------------------------------------------------ */
/* Pledge dialog                                                       */
/* ------------------------------------------------------------------ */

function openDialog(id) {
  const record = findSpecies(id);
  if (!record) return;

  activeId = id;
  const existing = findAdoption(id);

  els.dialogTitle.textContent = `${existing ? 'Update your pledge for' : 'Adopt'} the ${record.common_name}`;
  els.name.value = existing?.adopterName ?? '';

  clear(els.action);
  record.how_to_help.forEach((action) => {
    els.action.append(h('option', { value: action }, action));
  });
  if (existing) els.action.value = existing.pledge;

  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  else els.dialog.setAttribute('open', '');
  els.name.focus();
}

function closeDialog() {
  if (typeof els.dialog.close === 'function') els.dialog.close();
  else els.dialog.removeAttribute('open');
}

function onPledgeSubmit(event) {
  event.preventDefault();
  if (!els.form.reportValidity()) return;

  const record = findSpecies(activeId);
  const entry = {
    speciesId: activeId,
    adopterName: els.name.value.trim(),
    pledge: els.action.value,
    adoptedOn: new Date().toISOString(),
  };
  adoptions = [...adoptions.filter((a) => a.speciesId !== activeId), entry];
  const saved = writeAdoptions();

  closeDialog();
  renderAll();
  announce(
    saved
      ? `You adopted the ${record.common_name}. It is listed under Your adopted species.`
      : `You adopted the ${record.common_name}, but your browser blocked saving it, so it will be gone when you leave this page.`,
  );
  els.adoptedHeading.focus();
}

function removeAdoption(id) {
  const record = findSpecies(id);
  adoptions = adoptions.filter((a) => a.speciesId !== id);
  writeAdoptions();
  renderAll();
  announce(`Removed your adoption of the ${record?.common_name ?? 'species'}.`);
  els.adoptedHeading.focus();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  els.main.addEventListener('click', (event) => {
    const adoptButton = event.target.closest('[data-adopt-id]');
    if (adoptButton) openDialog(adoptButton.dataset.adoptId);

    const removeButton = event.target.closest('[data-remove-id]');
    if (removeButton) removeAdoption(removeButton.dataset.removeId);
  });

  els.cancel.addEventListener('click', closeDialog);
  els.form.addEventListener('submit', onPledgeSubmit);
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) closeDialog(); // click on the backdrop
  });
  els.filter.addEventListener('change', renderGrid);

  try {
    const data = await loadEndangered();
    species = data.species ?? [];

    [...new Set(species.map((s) => s.status))].sort().forEach((status) => {
      els.filter.append(h('option', { value: status }, status));
    });
    renderAll();
  } catch (error) {
    console.error(error);
    els.grid.replaceChildren(
      h(
        'li',
        {},
        h('p', { class: 'notice notice--error', role: 'alert' }, 'The species list could not be loaded. Refresh the page to try again.'),
      ),
    );
  }
}

init();
