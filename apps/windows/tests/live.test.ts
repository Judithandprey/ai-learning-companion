// The live companion's envelope as this app builds and reads it (src/shared/live.ts): the whole display as the
// context, a focus as a rectangle of that same frame, a follow-up that keeps or leaves an earlier focus, the bounded
// conversation, the quota as the server states it, and an answer taken only when it is bound to the turn that was
// sent. Pure checks; with LC_BACKEND_ROOT and LC_PYTHON set, the same turns are also given to the released contract
// (packages/contracts/live_companion) and to Learning's own preparation, in Python.
// SYNTHETIC: generated pictures and made-up texts only. No capture, no connector, no Codex, no ChatGPT, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { boundedHistory, carryFocus, DEFAULT_POLICY, focusOf, GAPS_MAX, HISTORY_MAX, HISTORY_TEXT_MAX, HISTORY_TOTAL_MAX, isPolicy, LIVE_ERROR_TEXT, LIVE_VERSION, provenanceOf, readLiveAccount, readLiveError, readLiveResult, readStarted, reserveOf, sameJson, suspends, turnProblem, userTextOf, wholeRegions, type HistoryEntry, type Start, type Turn } from '../src/shared/live.ts';
import { png } from './png.ts';

const BOUNDS = { x: -200, y: 0, width: 200, height: 120 };
const FRAME = { width: 400, height: 240 };
const PNG = png(FRAME.width, FRAME.height, 200);
const image = (bytes: Uint8Array = PNG, size = FRAME) => ({ png_base64: Buffer.from(bytes).toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ...size });
/** A turn about frame `seq` (a whole 400×240 frame of a 200×120 display), as the app builds one. */
function turn(seq: number, over: Partial<Turn> = {}, bytes: Uint8Array = PNG): Turn {
  return {
    request_id: `live-0123456789abcdef.${seq}.${over.trigger ?? 'observation'}`,
    session_id: 'live-0123456789abcdef',
    epoch: 1,
    permission_revision: 1,
    trigger: 'observation',
    allowed_assistance: 'none',
    presentation: 'none',
    user_text: null,
    audio_source: null,
    image: image(bytes),
    context: { capture_session_id: '0011223344556677', frame_seq: seq, frame_captured_at: '2026-10-01T14:00:00.000Z', frame_width: FRAME.width, frame_height: FRAME.height, display: { id: '2528732444', bounds: BOUNDS, scale_factor: 2 }, ...wholeRegions(FRAME, BOUNDS), ink_revision: 0, ink_sha256: null, source_url: null, source_version: null, media_position: null },
    focus: null,
    history: [],
    gaps: [],
    ...over,
  };
}
const focusTurn = (seq: number, over: Partial<Turn> = {}): Turn => turn(seq, { trigger: 'focus', allowed_assistance: 'hint', presentation: 'silent', focus: focusOf({ x: 10, y: 20, width: 40, height: 30 }, { ...FRAME, seq }, BOUNDS), ...over });
const row = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({ kind: 'assistant', text: 'A hint.', at: '2026-10-01T14:00:05.000Z', frame_seq: 1, request_id: 'r1', audio_source: null, presentation: 'shown', ...over });

test('a focus is a rectangle of the same frame: its pixels come from the frame\'s actual size over the display\'s, outward, and never leave the frame', () => {
  // The contract's own example: a 200×120 DIP display captured as 400×240.
  assert.deepEqual(focusOf({ x: 10, y: 20, width: 40, height: 30 }, { ...FRAME, seq: 3 }, BOUNDS), { frame_seq: 3, region_dip: { x: 10, y: 20, width: 40, height: 30 }, region_px: { x: 20, y: 40, width: 80, height: 60 } });
  // A frame that is not a whole multiple of the display (125 %): every pixel the rectangle touches.
  assert.deepEqual(focusOf({ x: 10.4, y: 0.2, width: 33.3, height: 7.7 }, { width: 250, height: 150, seq: 1 }, BOUNDS)?.region_px, { x: 13, y: 0, width: 42, height: 10 });
  // The whole display, and its last column: inside the frame.
  assert.deepEqual(focusOf({ x: 0, y: 0, width: 200, height: 120 }, { ...FRAME, seq: 1 }, BOUNDS)?.region_px, { x: 0, y: 0, width: 400, height: 240 });
  assert.deepEqual(focusOf({ x: 199.5, y: 119.5, width: 0.5, height: 0.5 }, { width: 250, height: 150, seq: 1 }, BOUNDS)?.region_px, { x: 249, y: 149, width: 1, height: 1 });
  // Not a region inside the display: no focus (nothing is clamped into one).
  for (const r of [{ x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 201, height: 10 }, { x: 0, y: 115, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10, height: -1 }, { x: Number.NaN, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: Infinity, height: 10 }]) assert.equal(focusOf(r, { ...FRAME, seq: 1 }, BOUNDS), null, JSON.stringify(r));
  // The display's own place on the desktop (a negative corner) plays no part: the rectangle is relative to the display.
  assert.deepEqual(focusOf({ x: 10, y: 20, width: 40, height: 30 }, { ...FRAME, seq: 1 }, { ...BOUNDS, x: 5000, y: -900 })?.region_px, { x: 20, y: 40, width: 80, height: 60 });
});

test('a turn is the whole display plus what the trigger allows: what the contract refuses is found here first, and nothing is repaired', () => {
  assert.equal(turnProblem(turn(1), PNG.length), null);
  assert.equal(turnProblem(focusTurn(2), PNG.length), null);
  assert.equal(turnProblem(turn(3, { trigger: 'text_followup', allowed_assistance: 'explain', presentation: 'silent', user_text: 'Why is that?' }), PNG.length), null);
  const bad: Array<[string, Turn, number?]> = [
    ['larger than', turn(1), 8 * 1024 * 1024 + 1],
    ['larger than', turn(1), 0],
    ['not the whole frame', turn(1, { image: { ...image(), width: 399 } })],
    ['more than 16000000 pixels', turn(1, { image: { ...image(), width: 5000, height: 4000 }, context: { ...turn(1).context, frame_width: 5000, frame_height: 4000, ...wholeRegions({ width: 5000, height: 4000 }, BOUNDS) } })],
    ['not the whole display', turn(1, { context: { ...turn(1).context, region_px: { x: 20, y: 40, width: 80, height: 60 } } })],
    ['not the whole display', turn(1, { context: { ...turn(1).context, region_dip: { x: 10, y: 20, width: 40, height: 30 } } })],
    ['hash without a revision', turn(1, { context: { ...turn(1).context, ink_revision: null, ink_sha256: 'a'.repeat(64) } })],
    ['needs its rectangle', turn(1, { trigger: 'focus', allowed_assistance: 'hint', presentation: 'silent' })],
    ['does not belong to this frame', focusTurn(2, { focus: { ...focusOf({ x: 10, y: 20, width: 40, height: 30 }, { ...FRAME, seq: 1 }, BOUNDS)! } })], // an earlier frame's
    ['does not belong to this frame', focusTurn(2, { focus: { frame_seq: 2, region_dip: { x: 10, y: 20, width: 40, height: 30 }, region_px: { x: 10, y: 20, width: 40, height: 30 } } })], // DIP passed off as pixels
    ['needs the user\'s own words', turn(3, { trigger: 'text_followup', allowed_assistance: 'hint', presentation: 'silent' })],
    ['needs the user\'s own words', turn(3, { trigger: 'text_followup', allowed_assistance: 'hint', presentation: 'silent', user_text: '   ' })],
    ['no audio route', turn(3, { trigger: 'voice_followup', allowed_assistance: 'hint', presentation: 'silent', user_text: 'Spoken words' })],
    ['no more than a small hint', focusTurn(2, { allowed_assistance: 'explain' })],
    ['no more than a small hint', focusTurn(2, { allowed_assistance: 'full_solution' })],
    ['asks for no answer', turn(1, { presentation: 'silent' })],
    ['asks for no answer', turn(1, { allowed_assistance: 'hint', presentation: 'silent' })],
    ['nothing to present', focusTurn(2, { allowed_assistance: 'none', presentation: 'silent' })],
    ['conversation is over', turn(5, { history: Array.from({ length: HISTORY_MAX + 1 }, () => row()) })],
    ['conversation is over', turn(5, { history: [row({ text: 'x'.repeat(HISTORY_TEXT_MAX + 1) })] })],
    ['conversation is over', turn(5, { history: Array.from({ length: 9 }, () => row({ text: 'x'.repeat(HISTORY_TEXT_MAX) })) })],
    ['conversation is over', turn(5, { history: [row({ frame_seq: 6 })] })], // from a later frame
    ['gaps are over', turn(5, { gaps: Array.from({ length: GAPS_MAX + 1 }, () => ({ from_frame_seq: 1, to_frame_seq: 2, reason: 'coalesced' as const })) })],
    ['gaps are over', turn(5, { gaps: [{ from_frame_seq: 3, to_frame_seq: 2, reason: 'coalesced' }] })],
    ['gaps are over', turn(5, { gaps: [{ from_frame_seq: 5, to_frame_seq: 6, reason: 'coalesced' }] })],
  ];
  for (const [what, t, bytes] of bad) assert.match(turnProblem(t, bytes ?? PNG.length) ?? 'no problem found', new RegExp(what), what);
  // A focus with the user's own words may ask for more than a hint (the circle alone may not).
  assert.equal(turnProblem(focusTurn(2, { allowed_assistance: 'explain', user_text: 'Explain this step.' }), PNG.length), null);
  // The user's words: trimmed; empty, over-long or damaged ones are not sent.
  assert.deepEqual([userTextOf('  Why?  '), userTextOf(''), userTextOf('   '), userTextOf('x'.repeat(4001)), userTextOf('a\ud800b'), userTextOf(7)], ['Why?', null, null, null, null, null]);
  // The session's own bounds, and the requests kept for the user's focus and follow-ups.
  assert.equal(isPolicy(DEFAULT_POLICY), true);
  for (const p of [{ ...DEFAULT_POLICY, max_submissions: 0 }, { ...DEFAULT_POLICY, max_submissions: 101 }, { ...DEFAULT_POLICY, max_session_ms: 999 }, { ...DEFAULT_POLICY, max_session_ms: 3_600_001 }, { ...DEFAULT_POLICY, min_observation_interval_ms: 499 }, { ...DEFAULT_POLICY, min_observation_interval_ms: 60_001 }, { ...DEFAULT_POLICY, max_submissions: 1.5 }, { ...DEFAULT_POLICY, extra: 1 }, { max_submissions: 12 }, null]) assert.equal(isPolicy(p), false, JSON.stringify(p));
  assert.deepEqual([1, 2, 5, 6, 12, 60, 100].map(reserveOf), [1, 1, 1, 2, 3, 12, 20]);
});

test('the conversation sent is the newest whole entries that fit; what is left out is said as a gap, and nothing is cut or deleted', () => {
  const few = [row({ text: 'first', frame_seq: 1 }), row({ kind: 'user', text: 'second', frame_seq: 2, presentation: null }), row({ kind: 'observation', text: 'third', frame_seq: 3, presentation: 'not_presented' })];
  assert.deepEqual(boundedHistory(few, 3), { history: few, omitted: null });
  // More than fit: the newest, in order; the frames of the ones left out as one gap.
  const many = Array.from({ length: 30 }, (_, i) => row({ text: `entry ${i}`, frame_seq: i + 1, request_id: `r${i}` }));
  const cut = boundedHistory(many, 40);
  assert.deepEqual([cut.history.length, cut.history[0]!.text, cut.history.at(-1)!.text, cut.omitted], [HISTORY_MAX, 'entry 6', 'entry 29', { from_frame_seq: 1, to_frame_seq: 6, reason: 'budget' }]);
  assert.equal(many.length, 30, 'the originals are as they were');
  // Over the total: whole entries only, never a part of one.
  const long = Array.from({ length: 10 }, (_, i) => row({ text: String(i).repeat(HISTORY_TEXT_MAX), frame_seq: i + 1 }));
  const total = boundedHistory(long, 20);
  assert.deepEqual([total.history.length, total.history.every((h) => h.text.length === HISTORY_TEXT_MAX), total.history.reduce((n, h) => n + h.text.length, 0) <= HISTORY_TOTAL_MAX, total.omitted], [8, true, true, { from_frame_seq: 1, to_frame_seq: 2, reason: 'budget' }]);
  // An entry too long for one place is left out (and said), and the ones around it are still taken.
  const over = [row({ text: 'old', frame_seq: 1 }), row({ text: 'x'.repeat(HISTORY_TEXT_MAX + 1), frame_seq: 2 }), row({ text: 'new', frame_seq: 3 })];
  assert.deepEqual([boundedHistory(over, 3).history.map((h) => h.text), boundedHistory(over, 3).omitted], [['old', 'new'], { from_frame_seq: 2, to_frame_seq: 2, reason: 'budget' }]);
  // Room kept for one more entry (the reference to an earlier focus).
  assert.equal(boundedHistory(many, 40, 1).history.length, HISTORY_MAX - 1);
  // Nothing from a frame later than the turn's.
  assert.deepEqual(boundedHistory([row({ text: 'now', frame_seq: 2 }), row({ text: 'later', frame_seq: 9 })], 2).history.map((h) => h.text), ['now']);
  assert.deepEqual(boundedHistory([], 1), { history: [], omitted: null });
});

test('a follow-up keeps an earlier focus only on the same unchanged frame; on a later frame the focus stays null and the conversation says where it was, without its pixels', () => {
  const origin = provenanceOf(focusTurn(3));
  const followup = (seq: number, over: Partial<Turn> = {}, bytes: Uint8Array = PNG): Turn => turn(seq, { trigger: 'text_followup', allowed_assistance: 'explain', presentation: 'silent', user_text: 'And why?', ...over }, bytes);
  // The same frame, unchanged: the rectangle is kept as it was.
  const same = carryFocus(followup(3), origin);
  assert.equal(typeof same, 'object');
  assert.deepEqual([(same as Turn).focus, (same as Turn).history], [origin.focus, []]);
  assert.equal(turnProblem(same as Turn, PNG.length), null);
  // The same frame number with another picture, another ink, or another time is not the same frame.
  assert.equal(carryFocus(followup(3, {}, png(FRAME.width, FRAME.height, 90)), origin), 'the frame of the kept focus has changed');
  assert.equal(carryFocus(followup(3, { context: { ...followup(3).context, ink_revision: 1 } }), origin), 'the frame of the kept focus has changed');
  assert.equal(carryFocus(followup(3, { context: { ...followup(3).context, frame_captured_at: '2026-10-01T14:00:09.000Z' } }), origin), 'the frame of the kept focus has changed');
  // A later frame: the current focus stays null; one entry says where the earlier focus was and what is not attached.
  const later = carryFocus(followup(5, { history: [row({ frame_seq: 3 })] }, png(FRAME.width, FRAME.height, 90)), origin) as Turn;
  assert.deepEqual([later.focus, later.history.length, later.history[0], later.context.frame_seq], [null, 2, row({ frame_seq: 3 }), 5]);
  const reference = later.history[1]!;
  assert.deepEqual([reference.kind, reference.frame_seq, reference.request_id, reference.presentation, reference.at], ['observation', 3, origin.request_id, 'not_presented', origin.context.frame_captured_at]);
  const said = JSON.parse(reference.text) as Record<string, unknown>;
  assert.deepEqual([said['kind'], said['pixels_attached_to_this_request'], said['provider_retention'], said['focus'], said['image'], said['context'], said['request_id']], ['historical_focus_reference', false, 'unverified', origin.focus, origin.image, origin.context, origin.request_id]);
  assert.match(String(said['limitation']), /pixels are unavailable in this request/);
  assert.equal(turnProblem(later, PNG.length), null);
  // Said once: carrying it again adds nothing.
  assert.equal((carryFocus(later, origin) as Turn).history.length, 2);
  // Never an old rectangle on a newer frame, never over a new focus, never across sessions or backwards.
  assert.equal(carryFocus(followup(5, { focus: origin.focus }), origin), 'a new focus is not replaced by an old one');
  assert.equal(carryFocus(followup(3, { focus: focusOf({ x: 1, y: 1, width: 5, height: 5 }, { ...FRAME, seq: 3 }, BOUNDS) }), origin), 'a new focus is not replaced by an old one');
  assert.equal(carryFocus(followup(2), origin), 'the kept focus cannot come from a later frame');
  assert.equal(carryFocus(followup(5, { session_id: 'live-ffffffffffffffff' }), origin), 'the kept focus belongs to another session');
  assert.equal(carryFocus(followup(5, { epoch: 2 }), origin), 'the kept focus belongs to another session');
  assert.equal(carryFocus(followup(5, { context: { ...followup(5).context, capture_session_id: 'ffffffffffffffff' } }), origin), 'the kept focus belongs to another session');
  assert.equal(carryFocus(turn(5), origin), 'a kept focus is only used for a follow-up');
  assert.equal(carryFocus(followup(5), provenanceOf(turn(3))), 'the earlier request had no focus');
});

test('an answer is taken only when it is bound to the turn that was sent: its whole provenance, its kind, the session\'s model and the managed subscription', () => {
  const sent = focusTurn(3, { history: [row({ frame_seq: 2 })], gaps: [{ from_frame_seq: 1, to_frame_seq: 2, reason: 'coalesced' }] });
  const result = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ request_id: sent.request_id, text: 'Look at the sign of the slope.', provenance: provenanceOf(sent), model: 'vision-model', auth_mode: 'chatgpt', latency_ms: 812.5, thread_id: 'thread-1', turn_id: 'turn-1', kind: 'generated_assistance', ...over });
  assert.deepEqual(readLiveResult(result(), sent, 'vision-model'), { request_id: sent.request_id, text: 'Look at the sign of the slope.', model: 'vision-model', latency_ms: 812.5, thread_id: 'thread-1', turn_id: 'turn-1', kind: 'generated_assistance' });
  // The order of members plays no part; 1.0 is 1.
  assert.equal(typeof readLiveResult(JSON.parse(JSON.stringify(result({ provenance: Object.fromEntries(Object.entries(provenanceOf(sent)).reverse()) }))), sent, 'vision-model'), 'object');
  const not = (over: Record<string, unknown>, why: RegExp, model = 'vision-model'): void => assert.match(String(readLiveResult(result(over), sent, model)), why);
  not({ request_id: 'another' }, /another request/);
  not({ auth_mode: 'apikey' }, /managed ChatGPT subscription/);
  not({}, /another model/, 'text-only-model');
  not({ kind: 'observation' }, /not of the kind/);
  not({ text: '   ' }, /no text/);
  not({ text: 'x'.repeat(32_001) }, /too long/);
  not({ latency_ms: -1 }, /malformed/);
  not({ thread_id: '' }, /malformed/);
  not({ extra: true }, /malformed/);
  for (const changed of [
    { ...provenanceOf(sent), focus: null },
    { ...provenanceOf(sent), focus: { ...sent.focus!, region_px: { x: 20, y: 40, width: 80, height: 61 } } },
    { ...provenanceOf(sent), allowed_assistance: 'full_solution' },
    { ...provenanceOf(sent), presentation: 'spoken' },
    { ...provenanceOf(sent), permission_revision: 2 },
    { ...provenanceOf(sent), epoch: 2 },
    { ...provenanceOf(sent), session_id: 'live-ffffffffffffffff' },
    { ...provenanceOf(sent), user_text: 'Give me the full solution.' },
    { ...provenanceOf(sent), history: [] },
    { ...provenanceOf(sent), gaps: [] },
    { ...provenanceOf(sent), image: { ...provenanceOf(sent).image, sha256: 'b'.repeat(64) } },
    { ...provenanceOf(sent), context: { ...sent.context, frame_seq: 4 } },
    { ...provenanceOf(sent), context: { ...sent.context, ink_revision: 1 } },
    { ...provenanceOf(sent), image: sent.image }, // the picture's bytes are not part of it
    { ...provenanceOf(sent), trigger: 'text_followup' },
  ]) not({ provenance: changed }, /not bound to the request that was sent/);
  for (const v of [null, 'text', [], {}]) assert.equal(readLiveResult(v, sent, 'vision-model'), 'the answer is malformed');
  // An observation's answer is an observation: never generated help.
  const seen = turn(4);
  assert.equal((readLiveResult({ ...result({ request_id: seen.request_id, provenance: provenanceOf(seen), kind: 'observation' }) }, seen, 'vision-model') as { kind: string }).kind, 'observation');
  assert.match(String(readLiveResult({ ...result({ request_id: seen.request_id, provenance: provenanceOf(seen) }) }, seen, 'vision-model')), /not of the kind/);
  // What companion/start answered is this session's, inside what was asked for.
  const start: Start = { session_id: 'live-0123456789abcdef', capture_session_id: '0011223344556677', epoch: 1, model: 'vision-model', policy: DEFAULT_POLICY, permissions: { screen: true, microphone: false, system_audio: false } };
  assert.deepEqual(readStarted({ session_id: start.session_id, epoch: 1, remaining_submissions: 60, expires_in_ms: 1_799_990 }, start), { remaining_submissions: 60, expires_in_ms: 1_799_990 });
  for (const v of [{ session_id: 'live-other', epoch: 1, remaining_submissions: 60, expires_in_ms: 1 }, { session_id: start.session_id, epoch: 2, remaining_submissions: 60, expires_in_ms: 1 }, { session_id: start.session_id, epoch: 1, remaining_submissions: 61, expires_in_ms: 1 }, { session_id: start.session_id, epoch: 1, remaining_submissions: 60, expires_in_ms: 1_800_001 }, { session_id: start.session_id, epoch: 1, remaining_submissions: -1, expires_in_ms: 1 }, { session_id: start.session_id, epoch: 1, remaining_submissions: 60 }, {}, null]) assert.equal(readStarted(v, start), null, JSON.stringify(v));
  assert.equal(sameJson({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] }), true);
  assert.equal(sameJson({ a: [1, 2] }, { a: [2, 1] }), false);
});

test('the account is read as the server states it: buckets apart, credits as exact text and flags, unknown never as zero, and no other shape guessed at', () => {
  const window = { used_percent: 100, window_duration_mins: 10_080, resets_at: '2026-10-05T00:00:00Z' };
  const bucket = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ limit_id: 'codex', normal_model_slug: null, primary: window, secondary: null, credits: null, rate_limit_reached_type: null, spend_control_reached: null, individual_limit: null, ...over });
  const account = (quota: unknown, auth: unknown = { state: 'signed_in', mode: 'chatgpt', plan: 'Pro' }): unknown => ({ auth, quota, models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }, { id: 'text-model', label: 'Text', image_input: false, default: false }] });
  const read = readLiveAccount(account({ available: true, ordinary_usage_allowed: false, windows: [bucket({ credits: { has_credits: true, unlimited: false, balance: '1234.5600' } }), bucket({ limit_id: 'other', normal_model_slug: 'gpt-x', primary: null, secondary: { used_percent: 3, window_duration_mins: null, resets_at: null }, rate_limit_reached_type: 'workspace_member_usage_limit_reached', spend_control_reached: true, individual_limit: { limit: '50.00', used: '50.00', remaining_percent: -4, resets_at: '2026-11-01T00:00:00Z' } })] }));
  assert.deepEqual(read, {
    state: 'signed_in', plan: 'Pro',
    quota: { available: true, ordinary_usage_allowed: false, windows: [
      { limit_id: 'codex', normal_model_slug: null, primary: window, secondary: null, credits: { has_credits: true, unlimited: false, balance: '1234.5600' }, rate_limit_reached_type: null, spend_control_reached: null, individual_limit: null },
      { limit_id: 'other', normal_model_slug: 'gpt-x', primary: null, secondary: { used_percent: 3, window_duration_mins: null, resets_at: null }, credits: null, rate_limit_reached_type: 'workspace_member_usage_limit_reached', spend_control_reached: true, individual_limit: { limit: '50.00', used: '50.00', remaining_percent: -4, resets_at: '2026-11-01T00:00:00Z' } },
    ] },
    models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }, { id: 'text-model', label: 'Text', image_input: false, default: false }],
  }, 'the first bucket\'s credits are not the second\'s; the balance is the server\'s text');
  // Not known is not zero: an unavailable quota states nothing, a null stays null, and a known zero is a known zero.
  assert.deepEqual(readLiveAccount(account({ available: false, ordinary_usage_allowed: null, windows: [] }))?.quota, { available: false, ordinary_usage_allowed: null, windows: [] });
  assert.deepEqual(readLiveAccount(account({ available: true, ordinary_usage_allowed: null, windows: [bucket({ credits: { has_credits: false, unlimited: false, balance: null } })] }))?.quota.windows[0]!.credits, { has_credits: false, unlimited: false, balance: null });
  assert.deepEqual(readLiveAccount(account({ available: true, ordinary_usage_allowed: true, windows: [bucket({ credits: { has_credits: false, unlimited: false, balance: '0' } })] }))?.quota.windows[0]!.credits, { has_credits: false, unlimited: false, balance: '0' });
  // Another sign-in mode is not this subscription.
  assert.equal(readLiveAccount(account({ available: false, ordinary_usage_allowed: null, windows: [] }, { state: 'signed_in', mode: null, plan: null }))?.state, 'signed_out');
  // Any other shape: nothing is read from it.
  for (const quota of [
    undefined, null, { available: true, windows: [] }, { available: 'yes', ordinary_usage_allowed: null, windows: [] },
    { available: false, ordinary_usage_allowed: true, windows: [] }, { available: false, ordinary_usage_allowed: null, windows: [bucket()] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ credits: { has_credits: true, unlimited: false } })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ credits: { has_credits: 1, unlimited: false, balance: null } })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ credits: { has_credits: true, unlimited: false, balance: 12 } })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ primary: { used_percent: '100', window_duration_mins: null, resets_at: null } })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ primary: { ...window, resets_at: 'soon' } })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ rate_limit_reached_type: 'something_else' })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ spend_control_reached: 'no' })] },
    { available: true, ordinary_usage_allowed: null, windows: [bucket({ individual_limit: { limit: '5', used: '1', remaining_percent: 1.5, resets_at: '2026-11-01T00:00:00Z' } })] },
    { available: true, ordinary_usage_allowed: null, windows: ['bucket'] },
    { available: true, ordinary_usage_allowed: null, windows: Array.from({ length: 101 }, () => bucket()) },
  ]) assert.equal(readLiveAccount(account(quota)), null, JSON.stringify(quota)?.slice(0, 120));
  for (const v of [null, {}, { auth: { state: 'maybe' }, quota: { available: false, ordinary_usage_allowed: null, windows: [] }, models: [] }, { auth: { state: 'signed_in', mode: 'chatgpt', plan: null }, quota: { available: false, ordinary_usage_allowed: null, windows: [] }, models: [{ label: 'no id' }] }]) assert.equal(readLiveAccount(v), null);
});

test('an error is read as a known code and whether the request reached ChatGPT; anything that is not simply "not taken" ends what the app sends by itself', () => {
  assert.deepEqual(readLiveError({ code: 'rate_limited', submission: 'submitted' }), { code: 'rate_limited', submission: 'submitted' });
  assert.deepEqual(readLiveError({ code: 'made_up', submission: 'maybe', message: 'raw provider text' }), { code: 'failed', submission: 'unknown' });
  assert.deepEqual([readLiveError(null), readLiveError('x'), readLiveError({})], Array.from({ length: 3 }, () => ({ code: 'failed', submission: 'unknown' })));
  // Every code of the contract has its fixed text here (the connector's own message is never shown).
  const codes = ['invalid_request', 'busy', 'cancelled', 'session_stopped', 'unavailable', 'unauthenticated', 'unsupported_model', 'allowance_exhausted', 'rate_limited', 'allowance_unknown', 'workspace_limit', 'ordinary_usage_not_allowed', 'context_limit', 'overloaded', 'interrupt_unconfirmed', 'failed', 'budget_reached', 'stale_context'];
  assert.deepEqual(Object.keys(LIVE_ERROR_TEXT).sort(), [...codes].sort());
  // Not taken, replaced, cancelled here, or over the session's own bound: the session itself goes on.
  for (const code of ['busy', 'cancelled', 'stale_context', 'budget_reached', 'invalid_request']) assert.equal(suspends({ code, submission: 'not_submitted' }), false, code);
  // Sign-in, allowance, rate, overload, the connector, an unconfirmed interruption, a failure: nothing more by itself.
  for (const code of ['unauthenticated', 'allowance_exhausted', 'rate_limited', 'allowance_unknown', 'workspace_limit', 'ordinary_usage_not_allowed', 'overloaded', 'unavailable', 'interrupt_unconfirmed', 'failed', 'session_stopped', 'unsupported_model', 'context_limit']) assert.equal(suspends({ code, submission: 'not_submitted' }), true, code);
  // A request whose fate is not known, whatever its code.
  for (const code of ['busy', 'cancelled', 'stale_context', 'budget_reached']) assert.equal(suspends({ code, submission: 'unknown' }), true, code);
  assert.equal(suspends({ code: 'cancelled', submission: 'submitted' }), false);
});

// ---- the released contract and Learning's own preparation, in Python (when a Backend checkout is given) --------------
const BACKEND = process.env['LC_BACKEND_ROOT'];
const PYTHON = process.env['LC_PYTHON'];
const contract = Boolean(BACKEND && PYTHON && fs.existsSync(path.join(BACKEND, 'packages', 'contracts', 'live_companion', 'focus.py')));
/** Runs a small Python program in the Backend checkout with `input` as JSON on its input; its output as JSON. */
function python(program: string, input: unknown): unknown {
  const r = spawnSync(PYTHON!, ['-B', '-c', program], { cwd: BACKEND!, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  return JSON.parse(r.stdout);
}
const VALIDATE = `
import json, sys
from jsonschema import ValidationError
from packages.contracts.live_companion import validate_request, validate
out = []
for item in json.load(sys.stdin):
    try:
        (validate_request(item["value"]) if item["kind"] == "request" else validate(item["kind"], item["value"]))
        out.append(None)
    except (ValidationError, ValueError, TypeError) as exc:
        out.append(str(exc)[:200])
json.dump(out, sys.stdout)
`;

test('[released contract, Python] the turns this app builds are the contract\'s: an observation, a focus, both follow-ups and the start are accepted, and what this app refuses the contract refuses too', { skip: !contract }, () => {
  const origin = focusTurn(3);
  const same = carryFocus(turn(3, { trigger: 'text_followup', allowed_assistance: 'explain', presentation: 'silent', user_text: 'And why?' }), provenanceOf(origin)) as Turn;
  const later = carryFocus(turn(5, { trigger: 'text_followup', allowed_assistance: 'hint', presentation: 'spoken', user_text: 'What about now?', history: [row({ frame_seq: 3, request_id: origin.request_id })], gaps: [{ from_frame_seq: 4, to_frame_seq: 4, reason: 'coalesced' }] }, png(FRAME.width, FRAME.height, 90)), provenanceOf(origin)) as Turn;
  const start: Start = { session_id: 'live-0123456789abcdef', capture_session_id: '0011223344556677', epoch: 1, model: 'vision-model', policy: DEFAULT_POLICY, permissions: { screen: true, microphone: false, system_audio: false } };
  const request = (method: string, params: unknown) => ({ kind: 'request', value: { version: LIVE_VERSION, id: 'r1', method, params } });
  const good = [turn(1), origin, same, later, turn(6, { history: boundedHistory(Array.from({ length: 30 }, (_, i) => row({ text: `entry ${i}`, frame_seq: 1, request_id: `r${i}` })), 6).history })];
  assert.deepEqual(good.map((t) => turnProblem(t, PNG.length)), good.map(() => null));
  const answers = python(VALIDATE, [
    ...good.map((t) => request('companion/turn', t)),
    request('companion/start', start),
    request('companion/interrupt', { session_id: start.session_id, epoch: 1, request_id: origin.request_id }),
    request('companion/interrupt', { session_id: start.session_id, epoch: 1, request_id: null }),
    request('companion/stop', { session_id: start.session_id, epoch: 1 }),
    request('connection/read', {}),
    ...good.map((t) => ({ kind: 'Provenance', value: provenanceOf(t) })),
  ]) as Array<string | null>;
  assert.deepEqual(answers, answers.map(() => null));
  // What this app refuses, the contract refuses too (so nothing this app would send is narrower than it thinks).
  const refused = [
    turn(1, { context: { ...turn(1).context, region_px: { x: 20, y: 40, width: 80, height: 60 } } }),
    focusTurn(2, { focus: { frame_seq: 2, region_dip: { x: 10, y: 20, width: 40, height: 30 }, region_px: { x: 10, y: 20, width: 40, height: 30 } } }),
    focusTurn(2, { allowed_assistance: 'explain' }),
    turn(1, { presentation: 'silent' }),
    turn(3, { trigger: 'text_followup', allowed_assistance: 'hint', presentation: 'silent' }),
    turn(5, { history: [row({ frame_seq: 6 })] }),
    turn(5, { gaps: [{ from_frame_seq: 5, to_frame_seq: 6, reason: 'coalesced' }] }),
  ];
  assert.equal(refused.every((t) => turnProblem(t, PNG.length) !== null), true);
  const no = python(VALIDATE, refused.map((t) => request('companion/turn', t))) as Array<string | null>;
  assert.equal(no.every((x) => typeof x === 'string'), true, JSON.stringify(no));
  // The focus rectangles of many sizes and scales are the ones the contract computes.
  const cases: Turn[] = [];
  for (const [fw, fh, bw, bh] of [[400, 240, 200, 120], [250, 150, 200, 120], [1920, 1080, 1536, 864], [2560, 1600, 1707, 1067], [3840, 2160, 2560, 1440], [1366, 768, 1366, 768]] as const) {
    const bounds = { x: 0, y: 0, width: bw, height: bh };
    const bytes = png(fw, fh, 7);
    for (const r of [{ x: 0.5, y: 0.25, width: 10.3, height: 9.9 }, { x: bw / 3, y: bh / 7, width: bw / 2.3, height: bh / 3.1 }, { x: bw - 1.01, y: bh - 1.01, width: 1.01, height: 1.01 }, { x: 0, y: 0, width: bw, height: bh }]) {
      const focus = focusOf(r, { width: fw, height: fh, seq: 2 }, bounds);
      assert.notEqual(focus, null, JSON.stringify([fw, fh, bw, bh, r]));
      cases.push(turn(2, { trigger: 'focus', allowed_assistance: 'hint', presentation: 'silent', focus, image: { ...image(bytes), width: fw, height: fh }, context: { ...turn(2).context, frame_width: fw, frame_height: fh, display: { id: 'd', bounds, scale_factor: fw / bw }, ...wholeRegions({ width: fw, height: fh }, bounds) } }));
    }
  }
  const mapped = python(VALIDATE, cases.map((t) => request('companion/turn', t))) as Array<string | null>;
  assert.deepEqual(mapped, mapped.map(() => null));
});

test('[released contract and Learning, Python] the follow-up this app carries a focus into is what the released helper makes of it, and Learning prepares the whole picture with its focus', { skip: !contract }, () => {
  const origin = focusTurn(3);
  const sameIn = turn(3, { trigger: 'text_followup', allowed_assistance: 'explain', presentation: 'silent', user_text: 'And why?' });
  const laterIn = turn(5, { trigger: 'text_followup', allowed_assistance: 'hint', presentation: 'silent', user_text: 'What about now?', history: [row({ frame_seq: 3, request_id: origin.request_id })] }, png(FRAME.width, FRAME.height, 90));
  const out = python(`
import json, sys
from packages.contracts.live_companion.focus import carry_focus_into_followup
from services.learning.live_session import prepare_live_session_context
d = json.load(sys.stdin)
res = {"carried": [carry_focus_into_followup(f, d["origin"]) for f in d["followups"]], "prepared": []}
for t in d["turns"]:
    p = prepare_live_session_context(t)
    res["prepared"].append({"provenance": p["provenance"], "bytes": len(p["image_bytes"]), "response_allowed": p["response_allowed"], "prompt_has_focus": json.dumps(t["focus"], sort_keys=True, separators=(",", ":")) in p["text"] if t["focus"] else None})
json.dump(res, sys.stdout)
`, { origin: provenanceOf(origin), followups: [sameIn, laterIn], turns: [turn(1), origin, carryFocus(sameIn, provenanceOf(origin)), carryFocus(laterIn, provenanceOf(origin))] }) as { carried: Turn[]; prepared: Array<{ provenance: unknown; bytes: number; response_allowed: boolean; prompt_has_focus: boolean | null }> };
  const [same, later] = [carryFocus(sameIn, provenanceOf(origin)) as Turn, carryFocus(laterIn, provenanceOf(origin)) as Turn];
  // The same frame: the very same turn. A later frame: the same turn, with the reference saying the same things.
  assert.equal(sameJson(out.carried[0], same), true);
  const theirs = out.carried[1]!;
  assert.equal(sameJson({ ...theirs, history: theirs.history.slice(0, -1) }, { ...later, history: later.history.slice(0, -1) }), true);
  const [a, b] = [theirs.history.at(-1)!, later.history.at(-1)!];
  assert.equal(sameJson({ ...a, text: JSON.parse(a.text) }, { ...b, text: JSON.parse(b.text) }), true, 'the reference to the earlier focus states the same facts as the released helper\'s');
  // Learning takes the whole picture, keeps the turn as its provenance, and allows a response only where one was asked for.
  assert.deepEqual(out.prepared.map((p) => [p.bytes > 0, p.response_allowed]), [[true, false], [true, true], [true, true], [true, true]]);
  assert.equal(sameJson(out.prepared[1]!.provenance, provenanceOf(origin)), true);
  assert.equal(sameJson(out.prepared[3]!.provenance, provenanceOf(later)), true);
});
