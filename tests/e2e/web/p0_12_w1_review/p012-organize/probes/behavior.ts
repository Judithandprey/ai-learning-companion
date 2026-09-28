// QA probe: behavior of the P0-12 organize/export TEST-ONLY model at 71f1389 (scratch copy).
import { answerPrompt, decline, reportExport, externalExposure, mayDispatch, route, correct, classify, destinationOptions, organize, type PromptState, type Stroke, type ExportEvent } from '../apps/safari-extension/tests/p0-12/organize-model.ts';
const j = (x: unknown) => JSON.stringify(x);
const rep = (ev: ExportEvent[]) => { const r = reportExport(ev); return `attempts=${j(r.attempts)} latest=${r.latest} everShared=${r.everShared} everImported=${r.everImported} everDispatched=${r.everDispatched} exposure(help)=${externalExposure(ev, true).exposure}`; };

console.log('--- P1 refusal de-dup across problem switch');
let st: PromptState = { asked: false, declined: false, problemId: 'q1' };
let r = answerPrompt(st, 'finished_confident', 'q1'); console.log('q1 finished ->', r.decision);
st = decline(r.state); console.log('user declines q1 ->', j(st));
r = answerPrompt(st, 'pause', 'q2'); console.log('visit q2 (pause) ->', r.decision, j(r.state));
r = answerPrompt(r.state, 'finished_confident', 'q1'); console.log('back to q1, finished again ->', r.decision, '(spec: no repeat after refusal)');

console.log('--- P2 delayed refusal of the displayed Q1 prompt arrives after moving to Q2');
st = { asked: false, declined: false, problemId: 'q1' };
r = answerPrompt(st, 'finished_confident', 'q1'); console.log('q1 finished ->', r.decision);
r = answerPrompt(r.state, 'still_editing', 'q2'); console.log('user moves to q2 ->', j(r.state));
st = decline(r.state); console.log('delayed Q1 refusal applied ->', j(st));
console.log('q2 finished ->', answerPrompt(st, 'finished_confident', 'q2').decision, '(Q2 wrongly suppressed)');
console.log('q1 finished again ->', answerPrompt(answerPrompt(st, 'pause', 'q1').state, 'finished_confident', 'q1').decision, '(Q1 refusal lost)');

console.log('--- P3 refusal before any prompt (declined but not asked)');
st = decline({ asked: false, declined: false, problemId: 'q1' });
console.log('q1 finished ->', answerPrompt(st, 'finished_confident', 'q1').decision);

console.log('--- P4 export event races / evidence without local dispatch_started');
for (const ev of [
  ['prepared', 'panel_opened', 'dispatch_completed'],
  ['prepared', 'panel_opened', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_started'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_completed'],
  ['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_completed'],
] as ExportEvent[][]) console.log(j(ev), '=>', rep(ev));

console.log('--- P5 late evidence for an earlier attempt after a reopen (no attempt identity)');
for (const ev of [
  ['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'panel_opened', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'panel_opened', 'dispatch_started', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'dispatch_started', 'panel_opened', 'dispatch_started', 'dispatch_completed'],
] as ExportEvent[][]) console.log(j(ev), '=>', rep(ev));

console.log('--- P6 retry after unknown outcome (duplicate risk)');
const retry: ExportEvent[] = ['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed'];
console.log(j(retry), '=>', rep(retry));
const m = { id: 'mf-2', userLayers: ['derivation', 'answer'], aiLayers: [{ id: 'L1', kind: 'layout' as const, permittedNow: true }] };
const c = { manifestId: 'mf-2', previewedAiLayerIds: ['L1'], scope: 'layout_only' as const };
console.log('mayDispatch for the retry with the same confirmation (no history input exists):', j(mayDispatch(m, c)));

console.log('--- P7 old confirmation vs changed bytes / version with the same manifest id');
console.log('user answer edited after confirmation:', j(mayDispatch({ ...m, userLayers: ['derivation', 'EDITED answer'] }, c)));
console.log('user derivation dropped from export:', j(mayDispatch({ ...m, userLayers: ['answer'] }, c)));
console.log('same AI layer id, regenerated content, kind still layout:', j(mayDispatch({ ...m, aiLayers: [{ id: 'L1', kind: 'layout' as const, permittedNow: true }] }, c)));

console.log('--- P8 layout-only consent with an answer-bearing AI addition');
const answerAdd = { id: 'mf-3', userLayers: ['answer'], aiLayers: [{ id: 'A1', kind: 'addition' as const, permittedNow: true }] };
console.log(j(mayDispatch(answerAdd, { manifestId: 'mf-3', previewedAiLayerIds: ['A1'], scope: 'layout_only' })));

console.log('--- P9 purpose correction racing an export');
const s: Stroke = { id: 's1', mode: 'screen', anchor: { problemId: 'q1', problemVersion: 1, sourceVersion: 3, elementId: null, mediaPosition: null }, purpose: 'unknown', purposeHistory: [], retained: true };
const note = classify(s, { purpose: 'note', confident: true, basis: 'lecture' }).stroke;
const conf = { manifestId: 'mf-n', previewedAiLayerIds: [], scope: 'layout_only' as const };
const noteManifest = { id: 'mf-n', userLayers: ['s1'], aiLayers: [] };
console.log('confirmed while note:', route(note), j(mayDispatch(noteManifest, conf)));
const nowDraft = correct(note, 'draft', 'user: scratch, do not send');
console.log('after correction:', route(nowDraft), j(mayDispatch(noteManifest, conf)), '(mayDispatch has no purpose/source/version input)');

console.log('--- held checks');
console.log('panel only:', rep(['prepared', 'panel_opened']));
console.log('timeout w/o dispatch:', rep(['prepared', 'panel_opened', 'no_response']));
console.log('timeout after dispatch:', rep(['prepared', 'panel_opened', 'dispatch_started', 'no_response']));
console.log('late no_response after shared:', rep(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'no_response']));
console.log('reopen+cancel after imported:', rep(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'target_import_confirmed', 'panel_opened', 'cancelled_before_dispatch']));
console.log('reopen+fail after unknown:', rep(['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown', 'panel_opened', 'failed_before_dispatch']));
console.log('new prepared after dispatching:', rep(['prepared', 'panel_opened', 'dispatch_started', 'prepared', 'cancelled_before_dispatch']));
console.log('draft->final_answer:', route(correct(classify(s, { purpose: 'draft', confident: true, basis: 'arith' }).stroke, 'final_answer', 'user finished')));
const all: string[] = [];
for (const n of [true, false]) for (const h of ['matched', 'ambiguous', 'none'] as const) all.push(...destinationOptions({ notabilityShare: n, homeworkDocument: h }));
console.log('any submit option over all 6 capability combos:', all.some((o) => /submit/i.test(o)), 'organize.submitted:', organize(['a'], []).submitted);
console.log('correction + layout_only:', j(mayDispatch({ id: 'x', userLayers: [], aiLayers: [{ id: 'C', kind: 'correction', permittedNow: true }] }, { manifestId: 'x', previewedAiLayerIds: ['C'], scope: 'layout_only' })));
