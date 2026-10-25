/**
 * config.js — constants only. No DOM access, no network calls.
 *
 * AI PROXY CONTRACT
 * -----------------
 * The browser must never hold an AI provider API key. Photo identification and
 * the chat guide talk to a small server-side proxy that you host and that holds
 * the key. Set AI.proxyUrl below to that proxy's base URL (no trailing slash).
 * While it is empty, identify.js disables photo upload and guide.js falls back
 * to an offline species lookup.
 *
 *   POST {proxyUrl}/identify
 *     request:  { image: "<base64 JPEG>", media_type: "image/jpeg",
 *                 known_species: [{ common_name, scientific_name, origin_type }] }
 *     response: { common_name: string, scientific_name?: string,
 *                 confidence?: number (0-1), reasoning?: string }
 *
 *   POST {proxyUrl}/chat
 *     request:  { messages: [{ role: "user" | "assistant", content: string }] }
 *     response: { reply: string }
 */
export const CONFIG = Object.freeze({
  DATA: Object.freeze({
    endangered: 'data/endangered-species.json',
    native: 'data/native-species.json',
    invasive: 'data/invasive-species.json',
  }),

  AI: Object.freeze({
    proxyUrl: 'https://gladeguide-proxy.raghulpillai365.workers.dev',
    identifyPath: '/identify',
    chatPath: '/chat',
    timeoutMs: 30000,
    maxImageEdgePx: 1280,
    maxUploadMB: 10,
    maxChatTurns: 20,
    maxChatChars: 800,
  }),

  STORAGE: Object.freeze({
    adoptions: 'gladeguide.adoptions.v1',
  }),
});

export const isAiConfigured = () => CONFIG.AI.proxyUrl.trim() !== '';

export const aiEndpoint = (path) => `${CONFIG.AI.proxyUrl.trim().replace(/\/+$/, '')}${path}`;
