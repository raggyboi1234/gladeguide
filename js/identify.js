/**
 * identify.js — species identification page only.
 *
 * Two paths:
 *  1. Photo identification through the AI proxy (see config.js for the contract).
 *  2. A searchable, filterable browser over both species datasets.
 */
import { CONFIG, isAiConfigured, aiEndpoint } from './config.js';
import { h, clear, badge, debounce, loadEndangered, loadNative, loadInvasive } from './main.js';

const els = {
  form: document.getElementById('photo-form'),
  input: document.getElementById('photo-input'),
  preview: document.getElementById('photo-preview'),
  submit: document.getElementById('photo-submit'),
  aiStatus: document.getElementById('ai-status'),
  photoResult: document.getElementById('photo-result'),
  search: document.getElementById('species-search'),
  count: document.getElementById('search-count'),
  results: document.getElementById('species-results'),
};

const AI_UNAVAILABLE_MESSAGE =
  'Photo identification is unavailable right now. You can still search the species list below.';

let records = [];
let selectedFile = null;
let previewUrl = null;

/* ------------------------------------------------------------------ */
/* Species cards                                                       */
/* ------------------------------------------------------------------ */

function listBlock(title, items) {
  if (!items?.length) return null;
  return h(
    'details',
    { class: 'species-details' },
    h('summary', {}, title),
    h('ul', {}, items.map((item) => h('li', {}, item))),
  );
}

function speciesCard(record, headingLevel = 3) {
  const isNative = record.origin_type === 'native';

  return h(
    'article',
    { class: `species-card species-card--${record.origin_type}` },
    h(
      'div',
      { class: 'species-card-head' },
      h(`h${headingLevel}`, { class: 'species-name' }, record.common_name),
      h('p', { class: 'species-sci' }, h('i', {}, record.scientific_name)),
    ),
    h(
      'div',
      { class: 'badge-row' },
      isNative ? badge(`Native · ${record.status}`, 'native') : badge('Invasive', 'invasive'),
      !isNative && record.threat_level ? badge(`${record.threat_level} threat`, 'warn') : null,
      record.group ? badge(record.group, 'neutral') : null,
    ),
    h('p', {}, record.description),
    listBlock('How to recognize it', record.identification_tips),
    listBlock(isNative ? 'Threats it faces' : 'Why it matters', isNative ? record.threats : record.impact),
    listBlock('Native look-alikes', isNative ? null : record.native_lookalikes),
    listBlock(
      isNative ? 'How you can help' : 'What to do if you see it',
      isNative ? record.how_to_help : record.what_to_do,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Search + filter                                                     */
/* ------------------------------------------------------------------ */

function searchableText(record) {
  return [
    record.common_name,
    record.scientific_name,
    record.group,
    record.summary,
    ...(record.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

function currentMatches() {
  const terms = els.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const origin = document.querySelector('input[name="origin-filter"]:checked')?.value ?? 'all';

  return records.filter((record) => {
    if (origin !== 'all' && record.origin_type !== origin) return false;
    const text = searchableText(record);
    return terms.every((term) => text.includes(term));
  });
}

function renderResults() {
  const matches = currentMatches();
  clear(els.results);
  matches.forEach((record) => els.results.append(h('li', {}, speciesCard(record, 3))));

  els.count.textContent =
    matches.length === 0
      ? 'No species match your search. Try a shorter word or switch the filter to All.'
      : `${matches.length} of ${records.length} species shown`;
}

/* ------------------------------------------------------------------ */
/* Photo identification                                                */
/* ------------------------------------------------------------------ */

function setAiStatus(message, kind = 'info') {
  els.aiStatus.textContent = message;
  els.aiStatus.dataset.kind = kind;
}

function revokePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function onFileChange() {
  const file = els.input.files?.[0];
  revokePreview();
  clear(els.preview);
  clear(els.photoResult);
  selectedFile = null;
  els.submit.disabled = true;
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setAiStatus('That file is not an image. Choose a JPG, PNG, or WebP photo.', 'error');
    return;
  }
  if (file.size > CONFIG.AI.maxUploadMB * 1024 * 1024) {
    setAiStatus(`That photo is larger than ${CONFIG.AI.maxUploadMB} MB. Choose a smaller one.`, 'error');
    return;
  }

  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  els.preview.append(
    h('img', { class: 'photo-preview-img', src: previewUrl, alt: 'Preview of the photo you selected' }),
  );

  if (isAiConfigured()) {
    els.submit.disabled = false;
    setAiStatus('Photo ready. Select "Identify this photo".');
  } else {
    setAiStatus(AI_UNAVAILABLE_MESSAGE, 'error');
  }
}

async function toBase64Jpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CONFIG.AI.maxImageEdgePx / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function findRecord({ common_name: commonName, scientific_name: scientificName }) {
  const scientific = scientificName?.trim().toLowerCase();
  const common = commonName?.trim().toLowerCase();

  return (
    records.find(
      (record) =>
        scientific &&
        record.scientific_name
          .toLowerCase()
          .split('/')
          .map((part) => part.trim())
          .includes(scientific),
    ) ??
    records.find((record) => common && record.common_name.toLowerCase() === common) ??
    null
  );
}

function renderIdentification(data) {
  const match = findRecord(data);
  const confidence =
    typeof data.confidence === 'number'
      ? Math.round(Math.min(Math.max(data.confidence, 0), 1) * 100)
      : null;

  els.photoResult.replaceChildren(
    h('h3', { class: 'result-title' }, 'Best match'),
    confidence !== null ? h('p', { class: 'muted' }, `AI confidence: ${confidence}%`) : null,
    match
      ? speciesCard(match, 4)
      : h(
          'div',
          { class: 'notice' },
          h('strong', {}, data.common_name),
          ' is not in our Everglades species list, so we cannot say whether it is native or invasive. Check with a local expert or FWC before removing or reporting it.',
        ),
    data.reasoning ? h('p', { class: 'muted' }, data.reasoning) : null,
    h('p', { class: 'muted' }, 'AI identifications can be wrong. Confirm before you act on one.'),
  );
}

async function onSubmit(event) {
  event.preventDefault();
  if (!selectedFile || !isAiConfigured()) return;

  els.submit.disabled = true;
  els.submit.setAttribute('aria-busy', 'true');
  setAiStatus('Analyzing your photo…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.AI.timeoutMs);

  try {
    const image = await toBase64Jpeg(selectedFile);
    const response = await fetch(aiEndpoint(CONFIG.AI.identifyPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        media_type: 'image/jpeg',
        known_species: records.map(({ common_name, scientific_name, origin_type }) => ({
          common_name,
          scientific_name,
          origin_type,
        })),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Identification service returned HTTP ${response.status}`);

    const data = await response.json();
    if (typeof data?.common_name !== 'string') throw new Error('Unexpected identification response');

    renderIdentification(data);
    setAiStatus('Identification complete.');
  } catch (error) {
    console.error(error);
    setAiStatus(
      error.name === 'AbortError'
        ? 'The request timed out. Try again, or search the species list below.'
        : 'We could not identify that photo. Try a clearer photo, or search the species list below.',
      'error',
    );
  } finally {
    clearTimeout(timer);
    els.submit.removeAttribute('aria-busy');
    els.submit.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  if (!isAiConfigured()) {
    console.warn('GladeGuide: AI.proxyUrl is empty in js/config.js; photo identification is disabled.');
    setAiStatus(AI_UNAVAILABLE_MESSAGE, 'error');
    els.input.disabled = true;
  }
  els.submit.disabled = true;

  els.input.addEventListener('change', onFileChange);
  els.form.addEventListener('submit', onSubmit);
  window.addEventListener('pagehide', revokePreview);

  try {
        const [endangered, native, invasive] = await Promise.all([loadEndangered(), loadNative(), loadInvasive()]);
    records = [
      ...endangered.species.map((s) => ({ ...s, origin_type: 'native' })),
      ...native.species.map((s) => ({ ...s, origin_type: 'native' })),
      ...invasive.species.map((s) => ({ ...s, origin_type: 'invasive' })),
    ].sort((a, b) => a.common_name.localeCompare(b.common_name));

    els.search.addEventListener('input', debounce(renderResults, 150));
    document
      .querySelectorAll('input[name="origin-filter"]')
      .forEach((radio) => radio.addEventListener('change', renderResults));
    renderResults();
  } catch (error) {
    console.error(error);
    els.count.textContent = '';
    els.results.replaceChildren(
      h(
        'li',
        {},
        h('p', { class: 'notice notice--error', role: 'alert' }, 'The species list could not be loaded. Refresh the page to try again.'),
      ),
    );
  }
}

init();
