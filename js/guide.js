/**
 * guide.js — AI nature guide chat page only.
 *
 * Online: sends the conversation to the AI proxy (contract in config.js).
 * Offline (no proxy configured): answers from the species datasets only.
 */
import { CONFIG, isAiConfigured, aiEndpoint } from './config.js';
import { h, clear, dayOfYear, loadEndangered, loadNative, loadInvasive } from './main.js';

const els = {
  log: document.getElementById('chat-log'),
  form: document.getElementById('chat-form'),
  input: document.getElementById('chat-input'),
  send: document.getElementById('chat-send'),
  chips: document.getElementById('prompt-chips'),
  mode: document.getElementById('guide-mode'),
};

const GENERIC_PROMPTS = [
  'How do I report an invasive species?',
  'Why do invasive species matter in the Everglades?',
  'How can I help protect the Everglades?',
];

let records = [];
let reporting = null;
let history = [];
let pending = false;

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function appendMessage(role, text) {
  const node = h(
    'div',
    { class: `msg msg--${role}` },
    h('span', { class: 'msg-role' }, role === 'user' ? 'You' : 'GladeGuide'),
    h(
      'div',
      { class: 'msg-body' },
      text.split(/\n{2,}/).map((paragraph) => h('p', {}, paragraph)),
    ),
  );
  els.log.append(node);
  els.log.scrollTop = els.log.scrollHeight;
  return node;
}

function setPending(value) {
  pending = value;
  els.send.disabled = value;
  els.form.setAttribute('aria-busy', String(value));
}

function renderChips() {
  const chips = [...GENERIC_PROMPTS];
  const natives = records.filter((r) => r.origin_type === 'native');
  const invasives = records.filter((r) => r.origin_type === 'invasive');
  const day = dayOfYear();
  if (natives.length) chips.push(`Tell me about the ${natives[day % natives.length].common_name}`);
  if (invasives.length) chips.push(`Why is the ${invasives[day % invasives.length].common_name} a problem?`);

  clear(els.chips);
  chips.forEach((text) => {
    els.chips.append(
      h('li', {}, h('button', { type: 'button', class: 'chip', dataset: { prompt: text } }, text)),
    );
  });
}

/* ------------------------------------------------------------------ */
/* Offline answers (dataset lookup only)                               */
/* ------------------------------------------------------------------ */

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (question, term) => new RegExp(`\\b${escapeRegExp(term)}s?\\b`, 'i').test(question);

function describe(record) {
  if (record.origin_type === 'native') {
    return [
          record.federally_listed === false
        ? `${record.common_name} (${record.scientific_name}) is native to the Everglades.`
        : `${record.common_name} (${record.scientific_name}) is native to the Everglades and listed as ${record.status} under the U.S. Endangered Species Act.`,
      record.description,
      `How you can help: ${record.how_to_help.slice(0, 2).join('. ')}.`,
    ].join('\n\n');
  }
  return [
    `${record.common_name} (${record.scientific_name}) is an invasive species from ${record.origin}, rated a ${record.threat_level.toLowerCase()} threat here.`,
    record.description,
    `Why it matters: ${record.impact[0]}.`,
    `What to do: ${record.what_to_do.slice(0, 2).join('. ')}.`,
  ].join('\n\n');
}

function reportingAnswer() {
  if (!reporting) return 'To report an invasive species, contact Florida Fish and Wildlife (FWC).';
  return `To report an invasive species in Florida, call ${reporting.hotline_label} (${reporting.hotline_number}) or use the ${reporting.app_name} app. A photo and the location help most. Do not try to handle animals such as pythons yourself.`;
}

function localAnswer(question) {
  if (/\b(report|hotline|who do i (call|contact))\b/i.test(question)) return reportingAnswer();

  const hits = records.filter((record) =>
    [record.common_name, record.scientific_name, ...(record.keywords ?? [])].some((term) =>
      mentions(question, term),
    ),
  );
  if (hits.length) return hits.slice(0, 2).map(describe).join('\n\n');

  const examples = records.slice(0, 3).map((r) => r.common_name).join(', ');
  return `The full AI guide is unavailable right now, but I can look up species in our database. Try naming one, for example: ${examples}. You can also ask how to report an invasive species.`;
}

/* ------------------------------------------------------------------ */
/* Online answers                                                      */
/* ------------------------------------------------------------------ */

async function askAI() {
  const messages = history.slice(-CONFIG.AI.maxChatTurns);
  while (messages[0]?.role === 'assistant') messages.shift();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.AI.timeoutMs);
  try {
    const response = await fetch(aiEndpoint(CONFIG.AI.chatPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Guide service returned HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data?.reply !== 'string' || !data.reply.trim()) throw new Error('Unexpected guide response');
    return data.reply.trim();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

async function ask(text) {
  const question = text.trim().slice(0, CONFIG.AI.maxChatChars);
  if (!question || pending) return;

  setPending(true);
  appendMessage('user', question);
  history.push({ role: 'user', content: question });
  const thinking = appendMessage('assistant', 'Thinking…');
  thinking.classList.add('msg--pending');

  try {
    const reply = isAiConfigured() ? await askAI() : localAnswer(question);
    thinking.remove();
    appendMessage('assistant', reply);
    history.push({ role: 'assistant', content: reply });
  } catch (error) {
    console.error(error);
    thinking.remove();
    history.pop(); // keep user/assistant turns alternating for the next request
    appendMessage(
      'assistant',
      error.name === 'AbortError'
        ? 'That took too long. Send your question again in a moment.'
        : 'I could not reach the guide. Send your question again in a moment.',
    );
  } finally {
    setPending(false);
    els.input.focus();
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  if (!isAiConfigured()) {
    console.warn('GladeGuide: AI.proxyUrl is empty in js/config.js; the guide is in offline mode.');
    els.mode.hidden = false;
  }

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.input.value;
    els.input.value = '';
    ask(text);
  });

  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      els.form.requestSubmit();
    }
  });

  els.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-prompt]');
    if (chip) ask(chip.dataset.prompt);
  });

  appendMessage(
    'assistant',
    'Hi, I\'m the GladeGuide nature guide. Ask me about Everglades wildlife, invasive species, or how to help.',
  );

  try {
    const [endangered, native, invasive] = await Promise.all([loadEndangered(), loadNative(), loadInvasive()]);
    reporting = invasive.meta?.reporting ?? null;
    records = [
      ...endangered.species.map((s) => ({ ...s, origin_type: 'native' })),
      ...native.species.map((s) => ({ ...s, origin_type: 'native' })),
      ...invasive.species.map((s) => ({ ...s, origin_type: 'invasive' })),
    ];
    renderChips();
  } catch (error) {
    console.error(error);
    renderChips(); // generic prompts still work
  }
}

init();
