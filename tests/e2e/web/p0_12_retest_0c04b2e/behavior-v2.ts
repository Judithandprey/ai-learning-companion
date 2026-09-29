// QA probe (27f553e..0c04b2e retest): original ORG-1 P1/P2/P3 and ORG-3 P4-P6 cases on the NEW organize-model API.
import { answerPrompt, decline, reopen, initialPromptState, reportExport, externalExposure, type ExportEvent } from '../apps/safari-extension/tests/p0-12/organize-model.ts';
const j = (x: unknown) => JSON.stringify(x);
const rep = (ev: ExportEvent[]) => { const r = reportExport(ev); const x = externalExposure(ev, true); return `attempts=${j(r.attempts)} everShared=${r.everShared} everImported=${r.everImported} everExternalEffect=${r.everExternalEffect} exposure(help)=${x.exposure} learnerRead=${x.learnerRead}`; };

console.log('--- ORG-1 P1 refusal survives a visit to another question');
let r = answerPrompt(initialPromptState, 'finished_confident', 'q1'); console.log('q1 finished ->', r.decision, r.promptId);
let st = decline(r.state, r.promptId!, 'ipad#7');
r = answerPrompt(st, 'finished_confident', 'q2'); console.log('q2 finished ->', r.decision, r.promptId);
console.log('back to q1, finished again ->', answerPrompt(r.state, 'finished_confident', 'q1').decision, '(expected no_prompt)');

console.log('--- ORG-1 P2 delayed Q1 refusal after moving to Q2');
r = answerPrompt(initialPromptState, 'finished_confident', 'q1'); const q1p = r.promptId!;
r = answerPrompt(r.state, 'still_editing', 'q2');
st = decline(r.state, q1p, 'ipad#8');
console.log('q2 finished ->', answerPrompt(st, 'finished_confident', 'q2').decision, '(expected ask_organize: Q2 not suppressed)');
console.log('q1 refusals ->', j(st.questions['q1']));

console.log('--- ORG-1 P3 refusal of a never-shown prompt is ignored');
console.log(j(decline(initialPromptState, 'q1#1', 'x')) === j(initialPromptState));

console.log('--- ORG-1 reopening causality');
r = answerPrompt(initialPromptState, 'finished_confident', 'q1'); st = decline(r.state, r.promptId!, 'ipad#1');
st = decline(st, r.promptId!, 'iphone#1');
console.log('reopen seeing only ipad#1 ->', j(reopen(st, 'q1', ['ipad#1']).allowed), '(expected false: unseen refusal kept)');
const ro = reopen(st, 'q1', ['ipad#1', 'iphone#1']); console.log('reopen seeing both ->', ro.allowed, j(ro.state.questions['q1']));
console.log('replayed superseded refusal ->', j(decline(ro.state, r.promptId!, 'ipad#1').questions['q1']));
const ro2 = reopen(r.state, 'q1', ['late#9']); console.log('reopen naming a not-yet-arrived refusal, then it arrives ->', j(decline(ro2.state, r.promptId!, 'late#9').questions['q1']));

console.log('--- ORG-3 P4 evidence without local dispatch_started / after pre-dispatch end');
for (const ev of [
  ['prepared', 'panel_opened', 'dispatch_completed'],
  ['prepared', 'panel_opened', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_started'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_completed'],
  ['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_completed'],
  ['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_outcome_unknown'],
  ['dispatch_completed'],
] as ExportEvent[][]) console.log(j(ev), '=>', rep(ev));
console.log('--- ORG-3 P5 late evidence for an earlier attempt after a reopen (no attempt identity: documented)');
for (const ev of [
  ['prepared', 'panel_opened', 'dispatch_started', 'dispatch_completed', 'panel_opened', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'panel_opened', 'dispatch_completed'],
] as ExportEvent[][]) console.log(j(ev), '=>', rep(ev));
console.log('--- held: no external effect');
for (const ev of [['prepared', 'panel_opened'], ['prepared', 'panel_opened', 'no_response'], ['prepared', 'panel_opened', 'cancelled_before_dispatch']] as ExportEvent[][]) console.log(j(ev), '=>', rep(ev));
