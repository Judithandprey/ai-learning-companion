// Re-evaluates entries-check.mjs evaluate() (extracted verbatim) on the committed Edge evidence.
import { readFileSync } from 'node:fs';
import { evaluate } from './evaluate-extract.mjs';
const rep = JSON.parse(readFileSync('/tmp/qa-71f/repo/docs/verification/web/evidence/p0-12-edge-entries.json', 'utf8'));
const obs = Object.fromEntries(rep.checks.map((c) => [c.id, c.observed]));
const v = { records: rep.records, frameRecords: rep.frame_records, valuesAfterUser: obs['entries.observer_never_writes'].afterUser, valuesFinal: obs['entries.observer_never_writes'].final,
  passwordTyped: obs['entries.password_never_recorded'].typedIntoField, passwordField: obs['entries.password_never_recorded'].field, overlayState: obs['entries.write_overlay_keeps_answering'].state, inkEvents: obs['entries.write_overlay_keeps_answering'].ink };
const base = evaluate(v);
console.log('recomputed on committed records:', base.filter((c) => c.pass).length, '/', base.length);
// Record-level mutations: does any browser check notice?
const mutants = {
  closedHostActorUserEvenIfSite: (r) => r.map((x) => x.control === '#closed-host' ? { ...x, actor: 'site_script' } : x),
  siteFeedbackDropped: (r) => r.filter((x) => x.kind !== 'site_feedback' || /grading/.test(x.after)),
  q2ClearRecordsBoundToQ1: (r) => r.map((x) => x.kind === 'change_without_event' && x.problem?.id === 'set1-q2' ? { ...x, problem: { id: 'set1-q1', version: '1' } } : x),
  problemNullEverywhere: (r) => r.map((x) => x.kind === 'text_edit' && x.control === '#q-why' ? { ...x, problem: null } : x),
};
for (const [name, f] of Object.entries(mutants)) {
  const res = evaluate({ ...v, records: f(v.records) });
  console.log(name, '->', res.filter((c) => !c.pass).map((c) => c.id).join(',') || 'NO CHECK FAILS');
}
