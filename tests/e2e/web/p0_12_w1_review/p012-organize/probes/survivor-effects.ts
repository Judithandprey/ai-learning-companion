// Shows the concrete behavior of surviving mutants (loaded from mut/<id>/tests/p0-12/organize-model.ts)
// and one extra probe on the unmutated model.
const load = (id: string) => import(`/tmp/qa-71f/work/p012-organize/mut/${id}/tests/p0-12/organize-model.ts`);
const orig = await import('/tmp/qa-71f/work/p012-organize/apps/safari-extension/tests/p0-12/organize-model.ts');
const j = (x: unknown) => JSON.stringify(x);
const unknown = ['prepared', 'panel_opened', 'dispatch_started', 'dispatch_outcome_unknown'] as const;
for (const [id, mod] of [['orig', orig], ['N3', await load('N3')]] as const) {
  const r = mod.reportExport([...unknown]);
  console.log(`${id}: unknown-outcome export -> latest=${r.latest} everShared=${r.everShared}`);
}
const corrNotPermitted = { id: 'mf', userLayers: ['answer'], aiLayers: [{ id: 'C1', kind: 'correction', permittedNow: false }] };
const layoutNotPermitted = { id: 'mf', userLayers: ['answer'], aiLayers: [{ id: 'T1', kind: 'layout', permittedNow: false }] };
const layoutHidden = { id: 'mf', userLayers: ['answer'], aiLayers: [{ id: 'T1', kind: 'layout', permittedNow: true }] };
const content = (ids: string[]) => ({ manifestId: 'mf', previewedAiLayerIds: ids, scope: 'content' });
for (const [id, mod] of [['orig', orig], ['N6', await load('N6')]] as const) console.log(`${id}: correction failing current disclosure ->`, j(mod.mayDispatch(corrNotPermitted, content(['C1']))));
for (const [id, mod] of [['orig', orig], ['N5', await load('N5')]] as const) console.log(`${id}: layout layer failing current disclosure ->`, j(mod.mayDispatch(layoutNotPermitted, content(['T1']))));
for (const [id, mod] of [['orig', orig], ['N7', await load('N7')]] as const) console.log(`${id}: layout layer absent from preview ->`, j(mod.mayDispatch(layoutHidden, content([]))));
for (const [id, mod] of [['orig', orig], ['N1', await load('N1')], ['N2', await load('N2')]] as const) {
  const st = mod.decline({ asked: false, declined: false, problemId: 'q1' });
  console.log(`${id}: user refused organizing q1 before the prompt; q1 finished ->`, mod.answerPrompt(st, 'finished_confident', 'q1').decision);
}
const n11 = await load('N11');
console.log('N11 destinationOptions({notabilityShare:false, homeworkDocument:"matched"}) ->', j(n11.destinationOptions({ notabilityShare: false, homeworkDocument: 'matched' })));
// Extra probe on the unmutated model: AI reclassification after an explicit user correction
const s = { id: 's1', mode: 'screen', anchor: { problemId: 'q1', problemVersion: 1, sourceVersion: 3, elementId: null, mediaPosition: null }, purpose: 'unknown', purposeHistory: [], retained: true };
const userDraft = orig.correct(orig.classify(s, { purpose: 'note', confident: true, basis: 'lecture' }).stroke, 'draft', 'user: scratch, do not send');
const reclassified = orig.classify(userDraft, { purpose: 'note', confident: true, basis: 'later AI pass' }).stroke;
console.log('user corrected to draft ->', orig.route(userDraft), '; later confident AI pass ->', orig.route(reclassified), j(reclassified.purposeHistory.map((h: any) => `${h.by}:${h.purpose}`)));
