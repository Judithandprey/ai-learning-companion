// The live desktop companion over the managed ChatGPT subscription (docs/adr/0004-live-desktop-companion.md), as this
// app speaks it: the private local envelope lc-subscription-live/1 to the shared connector. A request carries the
// WHOLE captured display as one picture, the user's focus inside it as a separate rectangle of that same frame, the
// recent conversation, and the gaps in what was observed. Pure: no I/O.
// The executable contract is packages/contracts/live_companion (Python); this is this app's side of it, checked
// against that contract's example in the tests. Nothing here captures, sends or shows anything.

import { hasLoneSurrogate } from './frame-ingress.ts';

export const LIVE_VERSION = 'lc-subscription-live/1';
/** One line from the connector in this version, and one line to it (the ADR's bounds). */
export const LIVE_LINE_FROM_CONNECTOR_MAX = 1024 * 1024;
export const LINE_TO_CONNECTOR_MAX = 12 * 1024 * 1024;
/** The bounds on the whole display's picture (the connector's own). */
export const PNG_MAX_BYTES = 8 * 1024 * 1024;
export const PIXELS_MAX = 16_000_000;
/** How much the user allows a response to disclose. A circle alone never asks for more than a hint. */
export const ASSISTANCE = ['hint', 'explain', 'full_solution'] as const;
export type Assistance = (typeof ASSISTANCE)[number];
export type Rect = { x: number; y: number; width: number; height: number };
export type Model = { id: string; label: string; image_input: boolean; default: boolean };
export const HISTORY_MAX = 24;
export const HISTORY_TEXT_MAX = 4000;
export const HISTORY_TOTAL_MAX = 32_000;
export const GAPS_MAX = 64;
export const USER_TEXT_MAX = 4000;
export const RESULT_TEXT_MAX = 32_000;

// ---- the session's local bounds (never the provider's quota) --------------------------------------------------------
/** A session's own finite bounds, chosen by the user before Start: requests, time, and the least time between two unattended looks. */
export type Policy = { max_submissions: number; max_session_ms: number; min_observation_interval_ms: number };
/** What this version of the envelope takes (an implementation boundary, not a product decision). */
export const POLICY_BOUNDS = { max_submissions: [1, 100], max_session_ms: [1000, 3_600_000], min_observation_interval_ms: [500, 60_000] } as const;
/** Where the session's bounds start in the control window: an engineering default the user changes, not a spending decision. */
export const DEFAULT_POLICY: Policy = { max_submissions: 60, max_session_ms: 30 * 60_000, min_observation_interval_ms: 30_000 };
export const isPolicy = (v: unknown): v is Policy =>
  isObj(v) && Object.keys(v).sort().join() === 'max_session_ms,max_submissions,min_observation_interval_ms' && (Object.keys(POLICY_BOUNDS) as Array<keyof Policy>).every((k) => Number.isSafeInteger(v[k]) && (v[k] as number) >= POLICY_BOUNDS[k][0] && (v[k] as number) <= POLICY_BOUNDS[k][1]);
/** The requests kept for the user's own focus and follow-ups: unattended looks never use the last fifth (at least one). */
export const reserveOf = (maxSubmissions: number): number => Math.max(1, Math.ceil(maxSubmissions / 5));

// ---- a turn -----------------------------------------------------------------------------------------------------------
export type LiveContext = {
  capture_session_id: string;
  /** This session's own count of whole frames taken for the AI (sent or not): a frame not sent is a gap. */
  frame_seq: number;
  frame_captured_at: string | null;
  frame_width: number;
  frame_height: number;
  display: { id: string; bounds: Rect; scale_factor: number };
  /** Always the whole display: a selection never replaces the whole-screen context. */
  region_dip: Rect;
  region_px: Rect;
  ink_revision: number | null;
  ink_sha256: string | null;
  /** Unknown on the desktop (never read from the pixels): always null here. */
  source_url: null;
  source_version: null;
  media_position: null;
};
/** The user's focus: a rectangle of the same frame, in DIP of the display and in pixels of the frame. */
export type Focus = { frame_seq: number; region_dip: Rect; region_px: Rect };
export type Presented = 'shown' | 'spoken' | 'unconfirmed' | 'not_presented';
export type HistoryEntry = { kind: 'user' | 'assistant' | 'observation' | 'source_transcript'; text: string; at: string | null; frame_seq: number | null; request_id: string | null; audio_source: null; presentation: Presented | null };
export type GapReason = 'capture_gap' | 'coalesced' | 'backpressure' | 'budget' | 'permission_lost' | 'disconnected' | 'not_observed';
export type Gap = { from_frame_seq: number; to_frame_seq: number; reason: GapReason };
export type Trigger = 'observation' | 'focus' | 'text_followup' | 'voice_followup';
export type LiveImage = { png_base64: string; sha256: string; width: number; height: number };
export type Turn = {
  request_id: string;
  session_id: string;
  epoch: number;
  permission_revision: number;
  trigger: Trigger;
  allowed_assistance: 'none' | Assistance;
  presentation: 'none' | 'silent' | 'spoken';
  user_text: string | null;
  /** No audio route is connected in this app: always null (a voice follow-up cannot be made). */
  audio_source: null;
  image: LiveImage;
  context: LiveContext;
  focus: Focus | null;
  history: HistoryEntry[];
  gaps: Gap[];
};
/** A turn without its picture's bytes: what a result must echo, whole. */
export type Provenance = Omit<Turn, 'image'> & { image: Omit<LiveImage, 'png_base64'> };
export type Start = { session_id: string; capture_session_id: string; epoch: number; model: string; policy: Policy; permissions: { screen: true; microphone: false; system_audio: false } };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0-\x1f\x7f-\x9f]/.test(v) ? v : null);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
/** Equal as JSON values, whatever the order of their members. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (!isObj(a) || !isObj(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}
/** A value as JSON with its members in a fixed order (the same value always gives the same text). */
const ordered = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

export const provenanceOf = (t: Turn): Provenance => ({ ...t, image: { sha256: t.image.sha256, width: t.image.width, height: t.image.height } });

/** The whole display as a turn's region: the frame's every pixel, and the display's whole area in DIP. */
export const wholeRegions = (frame: { width: number; height: number }, bounds: Rect): Pick<LiveContext, 'region_dip' | 'region_px'> => ({
  region_dip: { x: 0, y: 0, width: bounds.width, height: bounds.height },
  region_px: { x: 0, y: 0, width: frame.width, height: frame.height },
});
/**
 * A focus on a frame: the selected rectangle in DIP (relative to the display's own corner), and the pixels of the
 * frame it covers (outward: every pixel it touches), by the frame's actual size over the display's, never by a
 * nominal scale. Null when the rectangle is not a region inside the display.
 */
export function focusOf(region: Rect, frame: { width: number; height: number; seq: number }, bounds: Rect): Focus | null {
  const r = region;
  if (![r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n)) || !(r.width > 0) || !(r.height > 0)) return null;
  if (r.x < 0 || r.y < 0 || r.x + r.width > bounds.width || r.y + r.height > bounds.height) return null;
  const sx = frame.width / bounds.width;
  const sy = frame.height / bounds.height;
  const x = Math.floor(r.x * sx);
  const y = Math.floor(r.y * sy);
  const px = { x, y, width: Math.min(frame.width, Math.ceil((r.x + r.width) * sx)) - x, height: Math.min(frame.height, Math.ceil((r.y + r.height) * sy)) - y };
  if (px.width < 1 || px.height < 1) return null;
  return { frame_seq: frame.seq, region_dip: { x: r.x, y: r.y, width: r.width, height: r.height }, region_px: px };
}

/**
 * The user's words as they are sent: trimmed; null when empty, over the limit, or holding half of a surrogate pair
 * (text that is not valid Unicode cannot be written to the connector as it is; nothing of it is repaired).
 */
export function userTextOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const q = value.trim();
  return q.length > 0 && q.length <= USER_TEXT_MAX && !hasLoneSurrogate(q) ? q : null;
}
/** Why `userTextOf` refuses the words, in fixed words. */
export const userTextProblem = (value: unknown): string =>
  typeof value === 'string' && hasLoneSurrogate(value.trim()) ? 'the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again' : 'the question is empty or too long';

/** What is wrong with a turn as this app would send it (the contract's own rules), or null. Nothing is repaired. */
export function turnProblem(t: Turn, pngBytes: number): string | null {
  const c = t.context;
  const b = c.display.bounds;
  if (pngBytes <= 0 || pngBytes > PNG_MAX_BYTES) return `the picture of the whole display is larger than ${PNG_MAX_BYTES / 1024 / 1024} MiB as a PNG, so it cannot be sent`;
  if (t.image.width !== c.frame_width || t.image.height !== c.frame_height || c.frame_width * c.frame_height > PIXELS_MAX) return `the display's picture has more than ${PIXELS_MAX} pixels, or is not the whole frame`;
  if (!(b.width > 0) || !(b.height > 0) || !sameJson(wholeRegions({ width: c.frame_width, height: c.frame_height }, b), { region_dip: c.region_dip, region_px: c.region_px })) return 'the context is not the whole display';
  if (c.ink_sha256 !== null && c.ink_revision === null) return 'the ink has a hash without a revision';
  if (t.trigger === 'focus' && t.focus === null) return 'a focus needs its rectangle';
  if (t.focus !== null && !sameJson(t.focus, focusOf(t.focus.region_dip, { width: c.frame_width, height: c.frame_height, seq: c.frame_seq }, b))) return 'the focus does not belong to this frame';
  if ((t.trigger === 'text_followup' || t.trigger === 'voice_followup') && (t.user_text === null || userTextOf(t.user_text) !== t.user_text)) return 'a follow-up needs the user\'s own words';
  if (t.trigger === 'voice_followup') return 'no audio route is connected, so a spoken follow-up cannot be sent';
  if (t.trigger === 'focus' && t.user_text === null && t.allowed_assistance !== 'none' && t.allowed_assistance !== 'hint') return 'a circle alone asks for no more than a small hint';
  if (t.trigger === 'observation' && (t.presentation !== 'none' || t.allowed_assistance !== 'none')) return 'an observation asks for no answer';
  if (t.allowed_assistance === 'none' && t.presentation !== 'none') return 'no help means nothing to present';
  if (t.history.length > HISTORY_MAX || t.history.some((h) => h.text.length < 1 || h.text.length > HISTORY_TEXT_MAX || (h.frame_seq !== null && h.frame_seq > c.frame_seq)) || t.history.reduce((n, h) => n + h.text.length, 0) > HISTORY_TOTAL_MAX) return 'the recent conversation is over its bounds';
  if (t.gaps.length > GAPS_MAX || t.gaps.some((g) => g.from_frame_seq > g.to_frame_seq || g.to_frame_seq > c.frame_seq)) return 'the gaps are over their bounds';
  return null;
}

/**
 * The newest whole entries that fit a turn (never a cut entry), oldest first; and, when older ones or over-long ones
 * were left out, the frames they belong to as gaps, so that what is sent never passes for the complete memory. A gap
 * never covers a frame of which an entry IS sent: the frames left out are given as runs between the kept ones. The
 * originals stay where they are kept; nothing is deleted.
 */
export function boundedHistory(all: readonly HistoryEntry[], frameSeq: number, reserve = 0): { history: HistoryEntry[]; omitted: Gap[] } {
  const kept: HistoryEntry[] = [];
  const left: HistoryEntry[] = [];
  let total = 0;
  let full = false;
  for (const h of [...all].reverse()) {
    if (h.frame_seq !== null && h.frame_seq > frameSeq) continue; // of a later frame than this turn's: not its past
    const fits = !full && h.text.length <= HISTORY_TEXT_MAX && kept.length < HISTORY_MAX - reserve && total + h.text.length <= HISTORY_TOTAL_MAX - reserve * HISTORY_TEXT_MAX;
    if (fits) {
      kept.push(h);
      total += h.text.length;
    } else {
      left.push(h);
      if (h.text.length <= HISTORY_TEXT_MAX) full = true; // nothing older than the first one that did not fit is taken (no holes in the recent past)
    }
  }
  const sent = new Set(kept.map((h) => h.frame_seq));
  const omitted: Gap[] = [];
  for (const n of [...new Set(left.map((h) => h.frame_seq).filter((x): x is number => x !== null && !sent.has(x)))].sort((a, b) => a - b)) {
    const last = omitted.at(-1);
    if (last && ![...sent].some((k) => k !== null && k > last.to_frame_seq && k < n)) last.to_frame_seq = n;
    else omitted.push({ from_frame_seq: n, to_frame_seq: n, reason: 'budget' });
  }
  return { history: kept.reverse(), omitted };
}

/**
 * A follow-up that continues a focus (the contract's carry_focus_into_followup): on the SAME unchanged frame the
 * focus's rectangle is kept; on a LATER frame the current focus stays null, and one entry of the conversation says
 * where the earlier focus was, on which frame, and that its pixels are not attached to this request and that nothing
 * shows the provider kept them. Old coordinates are never moved onto a newer frame. A problem is returned as text.
 */
export function carryFocus(followup: Turn, origin: Provenance): Turn | string {
  if (followup.trigger !== 'text_followup' && followup.trigger !== 'voice_followup') return 'a kept focus is only used for a follow-up';
  if (origin.focus === null) return 'the earlier request had no focus';
  if (followup.session_id !== origin.session_id || followup.epoch !== origin.epoch || followup.context.capture_session_id !== origin.context.capture_session_id) return 'the kept focus belongs to another session';
  const now = followup.context;
  const old = origin.context;
  if (now.frame_seq < old.frame_seq) return 'the kept focus cannot come from a later frame';
  if (now.frame_seq === old.frame_seq) {
    if (!sameJson(now, old) || !sameJson(provenanceOf(followup).image, origin.image)) return 'the frame of the kept focus has changed';
    if (followup.focus !== null && !sameJson(followup.focus, origin.focus)) return 'a new focus is not replaced by an old one';
    return { ...followup, focus: origin.focus };
  }
  if (followup.focus !== null) return 'a new focus is not replaced by an old one';
  const reference = {
    kind: 'historical_focus_reference',
    request_id: origin.request_id,
    image: origin.image,
    context: old,
    focus: origin.focus,
    pixels_attached_to_this_request: false,
    provider_retention: 'unverified',
    limitation: 'This is an earlier focus, not a rectangle on the current image. Its pixels are unavailable in this request. Do not infer their content from these coordinates or claim a provider thread retained them.',
  };
  const row: HistoryEntry = { kind: 'observation', text: ordered(reference), at: old.frame_captured_at, frame_seq: old.frame_seq, request_id: origin.request_id, audio_source: null, presentation: 'not_presented' };
  return followup.history.some((h) => sameJson(h, row)) ? followup : { ...followup, history: [...followup.history, row] };
}

// ---- the connector's answers, as this app reads them (only these fields are ever used or shown) --------------------
export type LiveAnswer = { request_id: string; text: string; model: string; latency_ms: number; thread_id: string; turn_id: string; kind: 'observation' | 'generated_assistance' };
/**
 * A completed turn as the connector returns it, read only if it is bound to the turn this app sent and retained: its
 * whole provenance (the session, the frame, the focus, the user's words, the conversation, the gaps, what help and
 * what presentation were allowed) is the retained turn's. The result's own copy is never taken as the current state.
 */
export function readLiveResult(v: unknown, sent: Turn, model: string): LiveAnswer | string {
  if (!isObj(v) || Object.keys(v).sort().join() !== 'auth_mode,kind,latency_ms,model,provenance,request_id,text,thread_id,turn_id') return 'the answer is malformed';
  if (v['request_id'] !== sent.request_id) return 'the answer is for another request';
  if (v['auth_mode'] !== 'chatgpt') return 'the answer did not come through the managed ChatGPT subscription';
  if (v['model'] !== model) return 'the answer came from another model than the session\'s';
  if (v['kind'] !== (sent.trigger === 'observation' ? 'observation' : 'generated_assistance')) return 'the answer is not of the kind that was asked for';
  if (typeof v['text'] !== 'string' || v['text'].trim().length === 0) return 'the answer has no text';
  if (v['text'].length > RESULT_TEXT_MAX && [...v['text']].length > RESULT_TEXT_MAX) return 'the answer is too long to show';
  if (!(typeof v['latency_ms'] === 'number' && Number.isFinite(v['latency_ms']) && v['latency_ms'] >= 0) || !text(v['thread_id'], 128) || !text(v['turn_id'], 128)) return 'the answer is malformed';
  if (!sameJson(v['provenance'], provenanceOf(sent))) return 'the answer is not bound to the request that was sent';
  return { request_id: sent.request_id, text: v['text'], model, latency_ms: v['latency_ms'], thread_id: v['thread_id'] as string, turn_id: v['turn_id'] as string, kind: v['kind'] as LiveAnswer['kind'] };
}

/** What companion/start answered, if it is this session's: its remaining requests and time, as the connector counts them. */
export function readStarted(v: unknown, start: Start): { remaining_submissions: number; expires_in_ms: number } | null {
  if (!isObj(v) || Object.keys(v).sort().join() !== 'epoch,expires_in_ms,remaining_submissions,session_id' || v['session_id'] !== start.session_id || v['epoch'] !== start.epoch) return null;
  if (!isCount(v['remaining_submissions']) || v['remaining_submissions'] > start.policy.max_submissions || !isCount(v['expires_in_ms']) || v['expires_in_ms'] > start.policy.max_session_ms) return null;
  return { remaining_submissions: v['remaining_submissions'], expires_in_ms: v['expires_in_ms'] };
}

// ---- the account and its quota: the server's own facts, never worked out here ---------------------------------------
/** One window of a quota bucket. Null: the server gave none (unknown, not zero). */
export type QuotaWindow = { used_percent: number; window_duration_mins: number | null; resets_at: string | null } | null;
/** Credits as the server states them: exact text and flags. Null: not stated (unknown, never zero). */
export type Credits = { has_credits: boolean; unlimited: boolean; balance: string | null } | null;
export type Bucket = {
  limit_id: string | null;
  normal_model_slug: string | null;
  primary: QuotaWindow;
  secondary: QuotaWindow;
  credits: Credits;
  /** Why this bucket is reached, in the server's own closed words; null when it is not said. */
  rate_limit_reached_type: string | null;
  spend_control_reached: boolean | null;
  individual_limit: { limit: string; used: string; remaining_percent: number; resets_at: string } | null;
};
/**
 * `available` false: the quota could not be read (nothing is known; it is not zero). `ordinary_usage_allowed` is the
 * server's word on INCLUDED usage only (null: unknown); it neither proves that credits are used up nor that they
 * may be spent.
 */
export type Quota = { available: boolean; ordinary_usage_allowed: boolean | null; windows: Bucket[] };
export type LiveAccount = { state: 'signed_in' | 'signed_out' | 'unknown'; plan: string | null; quota: Quota; models: Model[] };
const REACHED = ['rate_limit_reached', 'workspace_owner_credits_depleted', 'workspace_member_credits_depleted', 'workspace_owner_usage_limit_reached', 'workspace_member_usage_limit_reached'];
const nullable = <T>(v: unknown, read: (x: unknown) => T | undefined): T | null | undefined => (v === null ? null : read(v));
const utc = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 40 && /Z$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const id = (v: unknown): string | undefined => text(v, 128) ?? undefined;
function readWindow(v: unknown): NonNullable<QuotaWindow> | undefined {
  if (!isObj(v) || !isCount(v['used_percent'])) return undefined;
  const mins = nullable(v['window_duration_mins'], (x) => (isCount(x) ? x : undefined));
  const resets = nullable(v['resets_at'], utc);
  return mins === undefined || resets === undefined ? undefined : { used_percent: v['used_percent'], window_duration_mins: mins, resets_at: resets };
}
function readBucket(v: unknown): Bucket | null {
  if (!isObj(v)) return null;
  const credits = nullable(v['credits'], (c) => {
    if (!isObj(c) || typeof c['has_credits'] !== 'boolean' || typeof c['unlimited'] !== 'boolean') return undefined;
    const balance = nullable(c['balance'], (x) => (typeof x === 'string' && x.length <= 128 && !/[\0-\x1f\x7f-\x9f]/.test(x) ? x : undefined));
    return balance === undefined ? undefined : { has_credits: c['has_credits'], unlimited: c['unlimited'], balance };
  });
  const individual = nullable(v['individual_limit'], (x) => {
    if (!isObj(x) || !Number.isSafeInteger(x['remaining_percent'])) return undefined;
    const [limit, used, resets] = [text(x['limit'], 128), text(x['used'], 128), utc(x['resets_at'])];
    return limit === null || used === null || resets === undefined ? undefined : { limit, used, remaining_percent: x['remaining_percent'] as number, resets_at: resets };
  });
  const bucket = {
    limit_id: nullable(v['limit_id'], id),
    normal_model_slug: nullable(v['normal_model_slug'], id),
    primary: nullable(v['primary'], readWindow),
    secondary: nullable(v['secondary'], readWindow),
    credits,
    rate_limit_reached_type: nullable(v['rate_limit_reached_type'], (x) => (REACHED.includes(x as string) ? (x as string) : undefined)),
    spend_control_reached: nullable(v['spend_control_reached'], bool),
    individual_limit: individual,
  };
  return Object.values(bucket).includes(undefined) ? null : (bucket as Bucket);
}
/**
 * connection/read in this version, as this app takes it: managed ChatGPT sign-in state, the plan's label, the model
 * catalog and the quota as the server states it, bucket by bucket. An answer of another shape is null (nothing is
 * guessed from it, and no bucket is made up or merged with another).
 */
export function readLiveAccount(v: unknown): LiveAccount | null {
  if (!isObj(v) || !isObj(v['auth']) || !Array.isArray(v['models']) || !isObj(v['quota'])) return null;
  const auth = v['auth'];
  if (!['signed_in', 'signed_out', 'unknown'].includes(auth['state'] as string)) return null;
  // Only the managed ChatGPT mode is this subscription: another mode is not signed in to it.
  const state = auth['state'] === 'signed_in' && auth['mode'] !== 'chatgpt' ? 'signed_out' : (auth['state'] as LiveAccount['state']);
  const models: Model[] = [];
  for (const m of v['models'].slice(0, 256)) {
    const mid = isObj(m) ? text(m['id'], 128) : null;
    if (!isObj(m) || !mid) return null;
    models.push({ id: mid, label: text(m['label'], 80) ?? mid.slice(0, 80), image_input: m['image_input'] === true, default: m['default'] === true });
  }
  const q = v['quota'];
  const allowed = nullable(q['ordinary_usage_allowed'], bool);
  if (typeof q['available'] !== 'boolean' || allowed === undefined || !Array.isArray(q['windows']) || q['windows'].length > 100) return null;
  const windows = q['windows'].map(readBucket);
  if (windows.includes(null)) return null;
  if (!q['available'] && (allowed !== null || windows.length > 0)) return null; // an unavailable quota states nothing
  return { state, plan: text(auth['plan'], 40), quota: { available: q['available'], ordinary_usage_allowed: allowed, windows: windows as Bucket[] }, models };
}

// ---- errors ---------------------------------------------------------------------------------------------------------------
export type Submission = 'not_submitted' | 'submitted' | 'unknown';
export type LiveError = { code: string; submission: Submission };
/** The connector's closed codes in this version, as fixed texts (its own message is never shown). */
export const LIVE_ERROR_TEXT: Readonly<Record<string, string>> = {
  invalid_request: 'the connector refused the request as malformed',
  busy: 'another request of yours is still waiting, so this one was not taken',
  cancelled: 'it was cancelled',
  session_stopped: 'the AI session has stopped; start it again to go on',
  unavailable: 'the ChatGPT connection is not available',
  unauthenticated: 'ChatGPT is not signed in',
  unsupported_model: 'the chosen model is not available for pictures',
  allowance_exhausted: 'ChatGPT says the account\'s allowance is used up',
  rate_limited: 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance)',
  allowance_unknown: 'ChatGPT refused the request, and what is left of the allowance is not known',
  workspace_limit: 'ChatGPT says a workspace limit was reached',
  ordinary_usage_not_allowed: 'ChatGPT says included usage is not allowed for this request now',
  context_limit: 'the request or its answer is too large',
  overloaded: 'ChatGPT says it is overloaded for now',
  interrupt_unconfirmed: 'an interruption was not confirmed by ChatGPT, so the AI session was stopped',
  failed: 'the request failed',
  budget_reached: 'this session\'s own bound (requests or time) was reached',
  stale_context: 'it was replaced by a newer request, or what it was about is no longer current',
};
/** A request's error as it is read: a known code (else `failed`), and whether the request reached ChatGPT (else unknown). */
export function readLiveError(v: unknown): LiveError {
  const e = isObj(v) ? v : {};
  const code = typeof e['code'] === 'string' && Object.hasOwn(LIVE_ERROR_TEXT, e['code']) ? e['code'] : 'failed';
  const submission = e['submission'] === 'not_submitted' || e['submission'] === 'submitted' ? e['submission'] : 'unknown';
  return { code, submission };
}
/**
 * Whether an error ends the AI session as far as this app sends anything by itself: every failure that is not a
 * request simply not taken (busy, replaced, cancelled here, over the session's own bound), and every request whose
 * fate is not known. Nothing is sent again by itself after one of these; the user starts the AI again.
 */
export const suspends = (e: LiveError): boolean => e.submission === 'unknown' || !['busy', 'cancelled', 'stale_context', 'budget_reached', 'invalid_request'].includes(e.code);

/**
 * The connector's closed codes as said for an account read and for a sign-in's start: no turn is involved in either,
 * so nothing is said of one. (Its own message is never shown.)
 */
export const readErrorText = (code: string): string =>
  ({ busy: 'the connector is busy, so the account was not read; check again', unavailable: LIVE_ERROR_TEXT['unavailable']!, unauthenticated: 'the account could not be read: the connector says ChatGPT is not signed in' })[code] ?? 'the account could not be read';
/** The connector's closed codes as said for a Start of the AI session that it refused (no request is involved). */
export const startErrorText = (code: string): string =>
  ({ busy: 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment', session_stopped: 'the connector refused that session as already used, so the AI was not started' })[code] ?? LIVE_ERROR_TEXT[code] ?? LIVE_ERROR_TEXT['failed']!;
export const loginErrorText = (code: string): string =>
  ({ busy: 'a sign-in is already pending in the connector, or the AI session is running, so no sign-in was started', unavailable: LIVE_ERROR_TEXT['unavailable']! })[code] ?? 'the sign-in could not be started';

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
