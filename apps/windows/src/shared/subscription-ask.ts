// The managed ChatGPT subscription, as this app uses it (docs/adr/0003-managed-subscription-ask.md): the private
// local envelope lc-subscription-ask/1 to the shared connector, the one request an ASK sends (a selected picture, the
// user's question, and the facts of where and when it was captured), and what the windows are told. Pure: no I/O.
// This is the selected-image ASK only. Nothing here watches the screen, and nothing is sent without an explicit Ask.

import { hasLoneSurrogate } from './frame-ingress.ts';

export const ASK_VERSION = 'lc-subscription-ask/1';
/** The ADR's engineering limits (defaults, not user-mandated values). */
export const QUESTION_MAX = 4000;
export const PNG_MAX_BYTES = 8 * 1024 * 1024;
export const PIXELS_MAX = 16_000_000;
/** The ADR's bound on a completed answer's text, and on one line from the connector. */
export const ANSWER_MAX = 32_000;
export const LINE_FROM_CONNECTOR_MAX = 256 * 1024;
export const LINE_TO_CONNECTOR_MAX = 12 * 1024 * 1024;

export const ASSISTANCE = ['hint', 'explain', 'full_solution'] as const;
export type Assistance = (typeof ASSISTANCE)[number];

export type Rect = { x: number; y: number; width: number; height: number };
/** The facts of a selection, supplied by the main process from what it captured and stored (never by a model). */
export type AskContext = {
  capture_session_id: string;
  frame_seq: number;
  /** When this app took the frame; null when not known (never made up from a later time). */
  frame_captured_at: string | null;
  frame_width: number;
  frame_height: number;
  display: { id: string; bounds: Rect; scale_factor: number };
  /** The selection in DIP, relative to the display's own top-left corner. */
  region_dip: Rect;
  /** The same selection in pixels of the frame. */
  region_px: Rect;
  ink_revision: number | null;
  /** SHA-256 of the exact editable ink document drawn into the selection; null when none could be retained (said). */
  ink_sha256: string | null;
  /** Unknown on the desktop (never read from the pixels): always null here. */
  source_url: null;
  source_version: null;
  media_position: null;
};
export type AskRequest = {
  request_id: string;
  question: string;
  assistance: Assistance;
  image: { png_base64: string; sha256: string; width: number; height: number };
  context: AskContext;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isRect = (v: unknown): v is Rect => isObj(v) && ['x', 'y', 'width', 'height'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k])) && (v['width'] as number) > 0 && (v['height'] as number) > 0;
const inside = (r: Rect, width: number, height: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height;

/**
 * The user's question as it is sent: trimmed; refused when empty, over the limit, or holding half of a surrogate
 * pair (text that is not valid Unicode cannot be written to the connector as it is; nothing of it is repaired).
 */
export function questionOf(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const q = text.trim();
  return q.length > 0 && q.length <= QUESTION_MAX && !hasLoneSurrogate(q) ? q : null;
}
/** Why `questionOf` refuses a question, in fixed words. */
export const questionProblem = (text: unknown): string =>
  typeof text === 'string' && hasLoneSurrogate(text.trim()) ? 'the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again' : 'the question is empty or too long';

/** What is wrong with a selection's geometry (rectangles finite, positive, inside the display and the frame), or null. */
export function contextProblem(c: Pick<AskContext, 'frame_width' | 'frame_height' | 'display' | 'region_dip' | 'region_px'>, image: { width: number; height: number }): string | null {
  if (!isInt(c.frame_width, 1) || !isInt(c.frame_height, 1)) return 'the frame size is malformed';
  if (!isObj(c.display) || !isRect(c.display.bounds) || !(typeof c.display.scale_factor === 'number' && Number.isFinite(c.display.scale_factor) && c.display.scale_factor > 0)) return 'the display is malformed';
  if (!isRect(c.region_dip) || !inside(c.region_dip, c.display.bounds.width, c.display.bounds.height)) return 'the selected region is not inside the display';
  if (!isRect(c.region_px) || ![c.region_px.x, c.region_px.y, c.region_px.width, c.region_px.height].every((n) => Number.isSafeInteger(n)) || !inside(c.region_px, c.frame_width, c.frame_height)) return 'the selected region is not inside the frame';
  if (image.width !== c.region_px.width || image.height !== c.region_px.height) return 'the picture is not the size of the selected region';
  if (image.width * image.height > PIXELS_MAX) return `the selection has more than ${PIXELS_MAX} pixels`;
  return null;
}

// ---- the connector's answers, as this app reads them (only these fields are ever used or shown) --------------------
export type Model = { id: string; label: string; image_input: boolean; default: boolean };
export type RateLimit = { label: string; used_percent: number; resets_at: string | null };
export type Account = { state: 'signed_in' | 'signed_out' | 'unknown'; plan: string | null; rate_limits: RateLimit[] | null; models: Model[] };

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0-\x1f\x7f]/.test(v) ? v : null);
/**
 * connection/read as this app takes it: managed ChatGPT sign-in state, the plan's label, quota windows and the model
 * catalog. Anything else in the answer is dropped; an answer of another shape is null (nothing is guessed from it).
 */
export function readAccount(v: unknown): Account | null {
  if (!isObj(v) || !isObj(v['auth']) || !Array.isArray(v['models'])) return null;
  const auth = v['auth'];
  if (!['signed_in', 'signed_out', 'unknown'].includes(auth['state'] as string)) return null;
  // Only the managed ChatGPT mode is this subscription: another mode (an API key, say) is not signed in to it.
  const state = auth['state'] === 'signed_in' && auth['mode'] !== 'chatgpt' ? 'signed_out' : (auth['state'] as Account['state']);
  const models: Model[] = [];
  for (const m of v['models'].slice(0, 100)) {
    const id = isObj(m) ? text(m['id'], 256) : null; // the connector's own bound on a model's name
    if (!isObj(m) || !id) return null;
    models.push({ id, label: text(m['label'], 80) ?? id.slice(0, 80), image_input: m['image_input'] === true, default: m['default'] === true });
  }
  let limits: RateLimit[] | null = null;
  if (Array.isArray(v['rate_limits'])) {
    limits = [];
    for (const r of v['rate_limits'].slice(0, 8)) {
      if (!isObj(r) || typeof r['used_percent'] !== 'number' || !Number.isFinite(r['used_percent'])) return null;
      const resets = text(r['resets_at'], 40);
      limits.push({ label: text(r['label'], 40) ?? 'quota', used_percent: Math.min(100, Math.max(0, r['used_percent'])), resets_at: resets !== null && !Number.isNaN(Date.parse(resets)) ? resets : null });
    }
  }
  return { state, plan: text(auth['plan'], 40), rate_limits: limits, models };
}

/** Whether a sign-in URL is one this app opens: https on openai.com or chatgpt.com (or a subdomain), nothing else. */
export function officialLoginUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return null;
  return /(^|\.)(openai\.com|chatgpt\.com)$/.test(u.hostname) ? u.toString() : null;
}

/** What an answer must echo, whole: the request without its picture's bytes. */
export const provenanceOf = (r: AskRequest): Record<string, unknown> => ({ request_id: r.request_id, question: r.question, assistance: r.assistance, image: { sha256: r.image.sha256, width: r.image.width, height: r.image.height }, context: r.context });
/** Equal as JSON values, whatever the order of their members. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (!isObj(a) || !isObj(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

/**
 * A completed answer as the connector returns it, read only if it is bound to the request this app sent: its whole
 * provenance (the question, the assistance, the picture's hash and size, and every fact of the context) is the
 * retained request's. A changed selection, ink or session is another request, and its answer is not this one's.
 */
export type Answer = { request_id: string; text: string; model: string; latency_ms: number; thread_id: string; turn_id: string };
export function readAnswer(v: unknown, sent: AskRequest): Answer | string {
  if (!isObj(v)) return 'the answer is malformed';
  if (v['request_id'] !== sent.request_id) return 'the answer is for another request';
  if (v['auth_mode'] !== 'chatgpt') return 'the answer did not come through the managed ChatGPT subscription';
  if (typeof v['text'] !== 'string' || v['text'].trim().length === 0) return 'the answer has no text';
  if (v['text'].length > ANSWER_MAX && [...v['text']].length > ANSWER_MAX) return 'the answer is too long to show'; // characters, as the connector counts
  if (!text(v['model'], 128) || !(typeof v['latency_ms'] === 'number' && Number.isFinite(v['latency_ms']) && v['latency_ms'] >= 0) || !text(v['thread_id'], 128) || !text(v['turn_id'], 128)) return 'the answer is malformed';
  if (!sameJson(v['provenance'], provenanceOf(sent))) return 'the answer is not bound to the request that was sent';
  return { request_id: sent.request_id, text: v['text'], model: v['model'] as string, latency_ms: v['latency_ms'], thread_id: v['thread_id'] as string, turn_id: v['turn_id'] as string };
}

/**
 * The connector's closed codes as said for an account read and for a sign-in's start: no question is involved in
 * either, so nothing is said of one. (Its own message is never shown.)
 */
export const readErrorText = (code: string): string =>
  ({ busy: 'the connector is busy, so the account was not read; check again', unavailable: ERROR_TEXT['unavailable']!, unauthenticated: 'the account could not be read: the connector says ChatGPT is not signed in' })[code] ?? 'the account could not be read';
export const loginErrorText = (code: string): string =>
  ({ busy: 'a sign-in or a question is already pending in the connector, so no sign-in was started', unavailable: ERROR_TEXT['unavailable']! })[code] ?? 'the sign-in could not be started';

/** The connector's closed error codes, as fixed texts for a question (its own message is never shown). */
export const ERROR_TEXT: Readonly<Record<string, string>> = {
  busy: 'another question is still being answered',
  unauthenticated: 'ChatGPT is not signed in (sign in from the control window)',
  unsupported_model: 'the chosen model does not take pictures',
  invalid_request: 'the connector refused the request as malformed',
  session_stopped: 'this capture session was stopped',
  cancelled: 'the question was cancelled',
  interrupt_unconfirmed: 'the question was cancelled, but whether ChatGPT stopped working on it is not confirmed',
  quota: 'the subscription\'s usage limit was reached',
  failed: 'ChatGPT did not complete an answer',
  unavailable: 'the connector, or the official Codex app server it runs, is not available',
};
