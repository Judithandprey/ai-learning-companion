// The nonvoice live run's all-action ledger and its pre-fixed evidence rules (pure functions; offline-testable).
//
// What is counted: the four released ACTIONS, each from the moment the driver assigned it (the session started for the
// unattended look; the circle's stroke, or a typed request's Send, ran), whatever came of it: submitted, unknown and proven
// not_submitted alike. Never presses of an Ask button. Any request the app made beyond its slot (a second look, an extra
// ask) counts too. The ceiling is 4; nothing is retried, so a slot is used at most once.
//
// The evidence rules are fixed here, before any run, and nothing in them is ever given to the app:
//   - transport: the connector's receipt for the request names a text and an image input, and the image hash equals the
//     app's own record of the whole frame it sent (the exact PNG bytes): the full picture reached the provider boundary;
//   - pixels: the card values exist only as canvas pixels. The first look's request carries no earlier dialogue, so card
//     values named in its text came from the picture. Later requests carry earlier AI text as history, so only values
//     that first appeared after the controlled screen change (and in no earlier AI text) prove fresh pixels. A matcher hit
//     is necessary, never sufficient: the verbatim text is read by QA and the Lead.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SLOT_PURPOSES = ['unattended whole-screen observation', 'automatic focus response', 'typed follow-up after controlled screen change', 'Stop/fence attempt'];

export const parseJsonl = text => String(text).split(/\r?\n/).filter(l => l.trim()).map(l => { try { const v = JSON.parse(l); return v && typeof v === 'object' && !Array.isArray(v) ? v : { kind: 'unreadable_line' }; } catch { return { kind: 'unreadable_line' }; } });
// Card values as an answer may write them: full-width digits, and a thousands separator inside one value ("4,821", "4 821").
const normal = text => String(text ?? '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/(?<!\d)(\d)[,\u00a0\u202f ](\d{3})(?!\d)/g, '$1$2');
const numbersIn = text => [...new Set((normal(text).match(/(?<!\d)\d{4}(?!\d)/g) ?? []).map(Number))];
const cardNumbers = truth => (truth?.cards ?? []).map(c => c.number);
const HEDGES = /\?|\b(?:not sure|unsure|maybe|might|perhaps|appears?|seems?|cannot|can't|unable|unclear|i think|or)\b/i;

/** Which of the given card values a text names, split by where they could have come from. */
export function pixelEvidence(text, { now, before = [], earlierText = [] }) {
  const named = numbersIn(text), earlier = new Set(earlierText.flatMap(numbersIn));
  const current = new Set(now), old = new Set(before);
  const fresh = named.filter(n => current.has(n) && !old.has(n) && !earlier.has(n));
  return { named, current: named.filter(n => current.has(n)), fresh_only_in_new_pixels: fresh, from_earlier_screen: named.filter(n => old.has(n)),
    also_in_earlier_ai_text: named.filter(n => current.has(n) && earlier.has(n)), not_on_any_screen: named.filter(n => !current.has(n) && !old.has(n)),
    hedged: HEDGES.test(String(text ?? '')),
    matcher: fresh.length > 0 ? 'fresh_pixel_values_named' : named.some(n => current.has(n)) ? 'current_values_named_not_pixel_only' : 'no_current_value_named',
    note: 'A matcher result is necessary, never sufficient; a hedged text and every verbatim text need a human reading.' };
}
/** QA-authored text must hold no card value (the values exist only as pixels). */
export function leaks(texts, truths) {
  const values = new Set(truths.flatMap(cardNumbers));
  return texts.flatMap((t, i) => numbersIn(t).filter(n => values.has(n)).map(n => ({ text: i, value: n })));
}
// Item types a plain question-and-answer turn produces; anything else (a tool, a command, a file change...) is a stop sign.
const PLAIN_ITEMS = new Set(['userMessage', 'agentMessage', 'reasoning']);
/** Transport of the whole picture for one request: the receipt against the app's own record, and how far it went. */
export function transport(receipt, imageSha256, { codexSha256 = null } = {}) {
  if (!receipt) return { receipt: false, verdict: 'official image input: not shown (no receipt)' };
  const types = receipt.input_types ?? [], items = receipt.produced_item_types ?? [];
  const inputs = types.includes('text') && types.includes('image') && receipt.image_sha256 === imageSha256 && typeof imageSha256 === 'string';
  const submitted = receipt.submission === 'acknowledged' || receipt.submission === 'written';
  // 'uncertain' is written before any byte is published and kept on ambiguous write/cancel paths: submission unknown.
  const phase = submitted ? 'submitted' : receipt.submission === 'not_submitted' ? 'not_submitted' : 'unknown';
  const tools = items.filter(t => !PLAIN_ITEMS.has(t));
  const identity = { codex_sha256_matches: codexSha256 === null ? null : receipt.codex_sha256 === codexSha256, explicit_bin_override: receipt.explicit_bin_override ?? null };
  return { receipt: true, input_types: types, image_sha256_matches_app_record: receipt.image_sha256 === imageSha256, submission: receipt.submission ?? null,
    outcome: receipt.outcome ?? null, terminal_status: receipt.terminal_status ?? null, actual_model: receipt.actual_model ?? null,
    produced_item_types: items, non_plain_items: tools, thread_start_count: receipt.thread_start_count ?? null, turn_start_count: receipt.turn_start_count ?? null, ...identity,
    phase, identity_ok: (codexSha256 === null || receipt.codex_sha256 === codexSha256) && receipt.explicit_bin_override === true,
    verdict: !inputs ? 'official image input: not shown' : phase === 'not_submitted' ? 'inputs prepared; not submitted'
      : phase === 'unknown' ? `inputs at the boundary; submission unknown (${receipt.submission ?? 'missing'})` : 'whole picture at the provider boundary' };
}

/**
 * The ledger. `steps`: the candidate steps; `results`: the runner's results.json; `liveLines`: every capture's live.jsonl
 * lines; `asks`: every asks/<selection>.json record; `receipts`: request_id -> receipt (absent: none found).
 */
export function buildLedger({ steps, results, liveLines = [], asks = [], receipts = {}, codexSha256 = null }) {
  const entries = new Map((results?.steps ?? []).map(s => [s.i, s]));
  const at = predicate => { const k = steps.findIndex(predicate); return k >= 0 ? entries.get(k + 1) ?? null : null; };
  const policy = at(s => s.as === 'live_policy'), start = at(s => 'captureStart' in s);
  const triggers = [null, at(s => Array.isArray(s.stroke)), at(s => s.as === 'action3_submit'), at(s => s.as === 'action4_submit')];
  const starts = liveLines.filter(l => l.kind === 'started').length, refusedStarts = liveLines.filter(l => l.kind === 'not_started');
  // Slot 1 is assigned once Start was reached: the first look may already have been sent even when every later record is
  // missing (an unknown is never a reusable zero). Known not started: the connector's own refusal of the session
  // (not_started), or the final surface admission refused, so the Start expression never ran.
  const admissions = Object.values(results?.values ?? {}).filter(v => v && typeof v === 'object');
  const startNeverRan = admissions.some(v => v.phase === 'before_capture_start' && v.accepted === false);
  const startReached = !!start && !startNeverRan && refusedStarts.length === 0;
  const assigned = [starts > 0 || policy?.ok === true || startReached, !!triggers[1], !!triggers[2], !!triggers[3]];
  const looks = liveLines.filter(l => l.kind === 'look');
  const entriesAll = asks.filter(a => Array.isArray(a?.requests)).flatMap(a => a.requests.filter(q => q && typeof q === 'object').map(q => ({ ...q })))
    .sort((a, b) => String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? '')));
  const focus = entriesAll.filter(q => q.trigger === 'focus'), typed = entriesAll.filter(q => q.trigger === 'text_followup');
  const byRequest = id => liveLines.filter(l => l.request_id === id);
  const slotRequests = [looks.slice(0, 1), focus.slice(0, 1), typed.slice(0, 1), typed.slice(1, 2)];
  const extra = [...looks.slice(1).map(l => l.request_id), ...focus.slice(1).map(q => q.request_id), ...typed.slice(2).map(q => q.request_id)];
  const slots = SLOT_PURPOSES.map((purpose, k) => {
    const reqs = slotRequests[k];
    if (!assigned[k] && reqs.length === 0) return { slot: k + 1, purpose, state: k === 0 && refusedStarts.length ? 'NOT_RUN_session_not_started' : k === 0 && startNeverRan ? 'NOT_RUN_start_not_evaluated' : 'NOT_RUN', counted: false };
    const request = reqs[0] ?? null;
    if (!request && k === 0) return { slot: 1, purpose, state: starts > 0 ? 'session_started_no_look_recorded' : 'start_reached_outcome_unknown', counted: true,
      start_step_ok: start?.ok ?? null, note: 'Start was reached; whether the first look was sent is unknown, so it is counted (conservative)' };
    if (!request) {
      const failed = triggers[k] && triggers[k].ok === false;
      return { slot: k + 1, purpose, state: failed ? 'trigger_failed_before_action' : 'assigned_no_request_recorded', counted: true, trigger_error: failed ? triggers[k].error ?? null : null,
        note: 'assigned, so counted (conservative); the app recorded no request for it' };
    }
    if (k === 0) {
      const settledLine = byRequest(request.request_id).find(l => ['looked', 'not_looked', 'settled'].includes(l.kind));
      return { slot: 1, purpose, state: settledLine?.kind ?? 'outcome_not_recorded', counted: true, request_id: request.request_id, image_sha256: request.image?.sha256,
        submission: settledLine?.kind === 'looked' ? 'submitted' : settledLine?.submission ?? null, transport: transport(receipts[request.request_id], request.image?.sha256, { codexSha256 }) };
    }
    return { slot: k + 1, purpose, state: request.outcome?.status ?? 'outcome_not_recorded', counted: true, request_id: request.request_id, trigger: request.trigger,
      question: request.question, assistance: request.assistance, asked_as: request.asked_as, spoken: request.spoken ?? null, focus: request.frame?.focus,
      frame_captured_at: request.frame?.captured_at ?? null, image_sha256: request.frame?.image?.sha256,
      submission: request.submission ?? request.outcome?.submission ?? null, shown: request.shown, presentation: request.presentation ?? null,
      transport: transport(receipts[request.request_id], request.frame?.image?.sha256, { codexSha256 }) };
  });
  const used = slots.filter(s => s.counted).length + extra.length;
  // Provider turns: each receipt carries its connector client's CUMULATIVE turn/start count, so a launch's total is its
  // largest count (never a sum of repeated counts); launches add up. It must fit the actions and cover the sent ones.
  const launches = new Map();
  for (const r of Object.values(receipts)) if (r && typeof r === 'object') launches.set(r.__launch ?? 'unknown', Math.max(launches.get(r.__launch ?? 'unknown') ?? 0, Number.isInteger(r.turn_start_count) ? r.turn_start_count : Infinity));
  const providerTurns = [...launches.values()].reduce((a, b) => a + b, 0);
  const sentReceipts = Object.values(receipts).filter(r => r && (r.submission === 'acknowledged' || r.submission === 'written')).length;
  const turnsConsistent = Number.isFinite(providerTurns) && providerTurns <= used && providerTurns <= 4 && providerTurns >= sentReceipts;
  // Incomplete evidence stays incomplete: an unreadable live line, an ask record without requests or a request without an id.
  const unreadable = liveLines.filter(l => l.kind === 'unreadable_line').length + asks.filter(a => !a || !Array.isArray(a.requests)).length
    + asks.filter(a => Array.isArray(a?.requests)).flatMap(a => a.requests).filter(q => !q || typeof q !== 'object' || typeof q.request_id !== 'string').length;
  // The app's own count (submitted + unknown), from its records and the guards' reads: it must agree with the ledger.
  const values = results?.values ?? {}, read = k => { try { return JSON.parse(values[k]); } catch { return null; } };
  const appUsed = Math.max(-1, ...liveLines.filter(l => typeof l.used === 'number').map(l => l.used), ...['action1', 'action2', 'action3', 'action4_after'].map(k => read(k)?.used).filter(n => typeof n === 'number'));
  const submittedSlots = slots.filter(s => s.counted && s.submission && s.submission !== 'not_submitted').length;
  const unwritten = Math.max(0, ...['action1', 'action2', 'action3', 'action4_after'].map(k => read(k)?.unwritten).filter(n => typeof n === 'number'));
  return { kind: 'qa-live-nonvoice-ledger/1', slots, extra_requests: extra, attempts_used: used, attempts_remaining: Math.max(0, 4 - used),
    ceiling_ok: used <= 4 && unwritten === 0 && (appUsed < 0 || appUsed <= submittedSlots + extra.length) && turnsConsistent, app_counted: appUsed < 0 ? null : appUsed, submitted_slots: submittedSlots, live_lines_unwritten: unwritten,
    provider_turns: Number.isFinite(providerTurns) ? providerTurns : null, receipt_launches: launches.size, sent_receipts: sentReceipts, turns_consistent: turnsConsistent,
    records_complete: unreadable === 0, unreadable_records: unreadable,
    sessions_started: starts, start_attempts: starts + refusedStarts.length, restarted: starts + refusedStarts.length > 1, retried: extra.length > 0,
    all_silent: slots.every(s => !s.asked_as || (s.asked_as === 'silent' && !s.spoken)),
    rule: 'Every assigned action counts once, submitted, unknown or not_submitted; not Ask presses. No retry, no restart.' };
}

/**
 * F3: every request that may have reached the provider was sent only with an admitted source, as QA's own checker log
 * records it (the decisions are logged before they are answered): the checker started, armed this capture with a fresh
 * full admission, and for the request's exact PNG allowed a send that names an acquisition it had allowed after
 * acquiring (post_acquire) and before (pre_acquire), all with fresh full admissions, in that order, and nothing allowed
 * after a deny. Requests proven not submitted need no send. An allowed send the app's records do not hold is flagged:
 * the records would be incomplete. Logical ordering only; an OS change between two native observations remains possible.
 */
export function sourceAdmission(ledger, checkerLines) {
  const lines = (checkerLines ?? []).filter(l => l && typeof l === 'object');
  const decisions = lines.filter(l => l.event === 'decision');
  const ok = d => d.verdict === 'allow' && d.reason === null && d.admission?.accepted === true;
  const firstDeny = decisions.findIndex(d => d.verdict !== 'allow');
  const ordered = decisions.every((d, i) => Number.isSafeInteger(d.seq) && (i === 0 || d.seq > decisions[i - 1].seq));
  const arm = decisions[0]?.phase === 'arm' && ok(decisions[0]) ? decisions[0] : null;
  const same = (d, e) => d.sample_seq === e.sample_seq && d.frame_seq === e.frame_seq && d.raw_sha256 === e.raw_sha256 && d.raw_size?.width === e.raw_size?.width && d.raw_size?.height === e.raw_size?.height;
  const bind = (rid, image) => {
    const k = decisions.findIndex(d => d.phase === 'send' && d.request_id === rid);
    if (k < 0) return { bound: false, reason: 'no checker send decision for this request' };
    const send = decisions[k];
    if (!ok(send)) return { bound: false, reason: 'the send was not admitted' };
    if (send.image_sha256 !== image || typeof image !== 'string') return { bound: false, reason: 'the admitted send names another image' };
    const p = decisions.slice(0, k).findLastIndex(d => d.phase === 'post_acquire' && ok(d) && same(d, send));
    if (p < 0) return { bound: false, reason: 'no admitted acquisition before the send' };
    const q = decisions.slice(0, p).findLastIndex(d => d.phase === 'pre_acquire' && ok(d) && d.sample_seq === send.sample_seq);
    if (q < 0) return { bound: false, reason: 'no admitted check before the acquisition' };
    return { bound: true, sample_seq: send.sample_seq, frame_seq: send.frame_seq, raw_sha256: send.raw_sha256, send_admitted_at: send.admission.at, acquired_admitted_at: decisions[p].admission.at };
  };
  const requests = ledger.slots.filter(s => s.counted).map(s => ({ slot: s.slot, request_id: s.request_id ?? null, image_sha256: s.image_sha256 ?? null, submission: s.submission ?? null }))
    .concat(ledger.extra_requests.map(rid => ({ slot: null, request_id: rid, image_sha256: null, submission: null })));
  const checked = requests.map(r => !r.request_id ? { ...r, bound: false, reason: 'a counted action without a recorded request: its source is unknown' }
    : r.submission === 'not_submitted' ? { ...r, bound: null, reason: 'proven not submitted: no send needed' } : { ...r, ...bind(r.request_id, r.image_sha256) });
  const known = new Set(requests.map(r => r.request_id));
  const unrecorded = decisions.filter(d => d.phase === 'send' && d.verdict === 'allow' && !known.has(d.request_id)).map(d => d.seq);
  const all = lines[0]?.event === 'ready' && !!arm && ordered && unrecorded.length === 0
    && (firstDeny < 0 || decisions.slice(firstDeny + 1).every(d => d.verdict !== 'allow'))
    && checked.every(r => r.bound !== false);
  return { all_bound: all, checker_ready: lines[0]?.event === 'ready', armed: !!arm, decisions: decisions.length, ordered, denied: firstDeny >= 0 ? { seq: decisions[firstDeny].seq, phase: decisions[firstDeny].phase, reason: decisions[firstDeny].reason } : null,
    requests: checked, unrecorded_admitted_sends: unrecorded,
    residual: 'Logical ordering of fresh full native admissions around acquisition and send; an OS change between two native observations is not excluded.' };
}

/** The Stop/fence verdict for slot 4: the app's records, the out count when Stop was clicked, and the actual card after it. */
export function fenceVerdict(ledger, liveLines, values = {}) {
  const slot = ledger.slots[3];
  if (slot.state.startsWith('NOT_RUN')) return { verdict: 'NOT_RUN' };
  const read = k => { try { return JSON.parse(values[k]); } catch { return null; } };
  const stop = read('action4_stop'), cardAfter = read('action4_card'), before = read('action3_card');
  const ended = liveLines.find(l => l.kind === 'ended');
  const afterEnd = ended ? liveLines.slice(liveLines.indexOf(ended) + 1) : [];
  const settledAfterStop = !!slot.request_id && afterEnd.some(l => l.kind === 'settled' && l.request_id === slot.request_id);
  const recorded = !!slot.request_id && slot.state !== 'outcome_not_recorded' && slot.state !== 'answered';
  const stopped = !!ended && ended.reason === 'stopped by you';
  const outAtStop = stop?.out_at_stop === 1;
  const noLater = ledger.extra_requests.length === 0 && !afterEnd.some(l => l.kind === 'looked' || l.kind === 'look');
  const cardClean = !!cardAfter && (cardAfter.answer_hidden === true || cardAfter.answer === (before?.answer ?? null));
  const notShown = slot.shown !== true && slot.presentation !== 'shown' && cardClean;
  const facts = { stop_scope: 'the AI session (#liveStop); the capture kept running until the wind-down capture Stop', stopped_by_user: stopped, request_recorded: recorded, out_at_stop: stop?.out_at_stop ?? null, settled_after_stop: settledAfterStop, request_outcome: slot.state,
    submission: slot.submission ?? null, shown: slot.shown ?? null, presentation: slot.presentation ?? null, card_after_stop_clean: cardClean, no_later_request: noLater, end_reason: ended?.reason ?? null };
  // The phase from every record that has one: the ask entry, the settled line, the receipt. They must agree (F6).
  const settledLine = afterEnd.find(l => l.kind === 'settled' && l.request_id === slot.request_id);
  const phases = [slot.submission, settledLine?.submission, slot.transport?.receipt ? slot.transport.phase : undefined].filter(p => p !== undefined && p !== null)
    .map(p => (p === 'unknown' || p === 'uncertain' ? 'unknown' : p));
  const phase = phases.length && phases.every(p => p === phases[0]) ? phases[0] : 'conflicting';
  Object.assign(facts, { phases_seen: phases, phase, receipt: !!slot.transport?.receipt });
  if (!stopped || !recorded || !outAtStop || !settledAfterStop || phase === 'conflicting') return { verdict: 'unknown', ...facts };
  if (!notShown || !noLater) return { verdict: 'not_fenced', ...facts };
  return { verdict: phase === 'not_submitted' ? 'fenced_before_submission' : phase === 'submitted' ? 'fenced_in_flight' : 'fenced_submission_unknown', ...facts };
}

/** The pre-fixed pixel readings per action (the truths are the runner's private DevTools reads; never given to the app). */
export function evidence({ ledger, liveLines, cards, truthBefore, truthAfter }) {
  const before = cardNumbers(truthBefore), after = cardNumbers(truthAfter);
  const lookText = liveLines.filter(l => l.kind === 'looked').map(l => l.text);
  const a2 = cards.action2?.answer ?? '', a3 = cards.action3?.answer ?? '';
  const frame3 = Date.parse(ledger.slots[2]?.frame_captured_at ?? ''), changed = Date.parse(truthAfter?.generated_at ?? '');
  return {
    action1: { text_source: 'live.jsonl looked (never shown on a card, by design)', ...pixelEvidence(lookText[0] ?? '', { now: before }),
      note: 'The first look carries no earlier dialogue: card values named here came from the picture. Necessary, not sufficient.' },
    action2: { text_source: 'card #answer (hint)', ...pixelEvidence(a2, { now: before, earlierText: lookText }),
      note: 'A hint may name no value; values the first look already named are not pixel-only proof.' },
    action3: { text_source: 'card #answer (typed follow-up after the screen change)', ...pixelEvidence(a3, { now: after, before, earlierText: [...lookText, a2] }),
      top_row_now: after.slice(0, 4), top_row_named: after.slice(0, 4).filter(n => numbersIn(a3).includes(n)),
      frame_after_change: Number.isFinite(frame3) && Number.isFinite(changed) ? frame3 >= changed : null },
    leaks_in_questions: leaks([ledger.slots[2]?.question ?? '', ledger.slots[3]?.question ?? ''], [truthBefore, truthAfter].filter(Boolean)),
    acceptance: 'NOT_JUDGED: QA and the Lead read every verbatim text; the matchers above are necessary, never sufficient.',
  };
}

/** The connector copy's live path: the live modules load from the copy (offline; nothing is sent). Not for the tests. */
export function liveImportCheck(python, dir) {
  const code = readFileSync(join(HERE, 'qa_live_copy_check.py'), 'utf8');
  try {
    const out = execFileSync(python, ['-B', '-c', code], { cwd: dir, encoding: 'utf8', timeout: 60000, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, PYTHONDONTWRITEBYTECODE: '1' } });
    return JSON.parse(out.split('\n').filter(l => l.startsWith('{')).at(-1));
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).split('\n').filter(Boolean).at(-1)?.slice(0, 300) ?? 'failed' };
  }
}
