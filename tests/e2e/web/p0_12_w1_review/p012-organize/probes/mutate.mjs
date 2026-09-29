// QA mutation runner: applies one exact-string replacement to a scratch copy of organize-model.ts,
// runs the unchanged tests/p0-12-organize.test.ts against it, and reports killed/survived.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = '/tmp/qa-71f/work/p012-organize';
const SRC = `${ROOT}/apps/safari-extension/tests/p0-12/organize-model.ts`;
const TEST = `${ROOT}/apps/safari-extension/tests/p0-12-organize.test.ts`;
const orig = readFileSync(SRC, 'utf8');
const M = [
  // documented export-model mutations (plan §7 claims 6/6 detected)
  ['E1 open panel counts as dispatch', "new Set(['dispatching', 'shared_pending_import', 'dispatch_unknown', 'imported'])", "new Set(['panel_open', 'dispatching', 'shared_pending_import', 'dispatch_unknown', 'imported'])"],
  ['E2 timeout manufactures dispatch', "if (cur === 'dispatching') set('dispatch_unknown');", "if (cur === 'dispatching' || cur === 'panel_open') set('dispatch_unknown');"],
  ['E3 reopen overwrites earlier attempt', "else if (cur === undefined || ENDED.has(cur)) attempts.push('panel_open');", "else if (cur === undefined) attempts.push('panel_open'); else if (ENDED.has(cur)) set('panel_open');"],
  ['E4 late cancel erases dispatch', "if (cur !== undefined && PRE_DISPATCH.has(cur)) set('cancelled');", "if (cur !== undefined) set('cancelled');"],
  ['E5 import accepted without dispatch', "if (cur !== undefined && DISPATCHED.has(cur)) set('imported');", "if (cur !== undefined) set('imported');"],
  ['E6 exposure from latest attempt only', 'helpBearing && reportExport(events).everDispatched', 'helpBearing && DISPATCHED.has(reportExport(events).latest as AttemptState)'],
  // documented alignment mutations (plan §7 claims 7/7 detected)
  ['A1 screen-fixed ink only at its video moment', "if (s.mode === 'screen') return", "if (s.mode === 'screen' && writtenAt !== null && (page.mediaPosition === null || Math.abs(page.mediaPosition - writtenAt) > SAME_FRAME_TOLERANCE_S)) return { shown: false, notice: 'placement_unresolved' }; if (s.mode === 'screen') return"],
  ['A2 no uncertain-problem notice', "if (page.problemId === null) return { shown: false, notice: 'problem_uncertain' };", ''],
  ['A3 unauthorized history sync', "if (!out.separatelyAuthorized) return { allowed: false, reason: 'history_sync_not_authorized' };", ''],
  ['A4 live-looking history sync', "if (!out.labeledAsHistory) return { allowed: false, reason: 'would_appear_live' };", ''],
  ['A5 preview check dropped', 'if (c && !c.previewedAiLayerIds.includes(l.id)) reasons.push(`layer_not_previewed:${l.id}`);', ''],
  ['A6 layout consent covers corrections', "if (l.kind === 'correction' && c?.scope !== 'content') reasons.push(`correction_needs_content_consent:${l.id}`);", ''],
  ['A7 unknown dispatch outcome ignored for exposure', 'helpBearing && reportExport(events).everDispatched', 'helpBearing && reportExport(events).everShared'],
  // QA survivor hunt
  ['N1 decline() is a no-op', 'return { ...state, declined: true };', 'return { ...state };'],
  ['N2 declined guard removed from answerPrompt', 'if (s.declined || s.asked)', 'if (s.asked)'],
  ['N3 unknown outcome reported as shared', "attempts.some((a) => a === 'shared_pending_import' || a === 'imported')", "attempts.some((a) => a === 'shared_pending_import' || a === 'imported' || a === 'dispatch_unknown')"],
  ['N5 layout layers skip current disclosure check', 'if (!l.permittedNow)', "if (!l.permittedNow && l.kind !== 'layout')"],
  ['N6 correction layers skip current disclosure check', 'if (!l.permittedNow)', "if (!l.permittedNow && l.kind !== 'correction')"],
  ['N7 layout layers skip preview binding', 'if (c && !c.previewedAiLayerIds.includes(l.id))', "if (c && l.kind !== 'layout' && !c.previewedAiLayerIds.includes(l.id))"],
  ['N8 only first AI layer checked', 'for (const l of m.aiLayers)', 'for (const l of m.aiLayers.slice(0, 1))'],
  ['N9 unknown never resolved by later completion', "if (cur === 'dispatching' || cur === 'dispatch_unknown') set('shared_pending_import');", "if (cur === 'dispatching') set('shared_pending_import');"],
  ['N10 import only accepted after share-sheet completion', "if (cur !== undefined && DISPATCHED.has(cur)) set('imported');", "if (cur === 'shared_pending_import') set('imported');"],
  ['N11 submit option when only a matched document exists', "if (c.homeworkDocument === 'matched') out.push('homework_document');", "if (c.homeworkDocument === 'matched') out.push('homework_document'); if (c.homeworkDocument === 'matched' && !c.notabilityShare) out.push('submit_homework' as Option);"],
  ['N12 manifest-id check removed', "if (!c || c.manifestId !== m.id)", 'if (!c)'],
  ['N13 AI classify overrides user decisions (already so) -> sanity: classify ignores confidence', "const purpose = c.confident ? c.purpose : 'unknown';", 'const purpose = c.purpose;'],
];
const only = process.argv[2];
let killed = 0, survived = 0;
for (const [name, from, to] of M) {
  if (only && !name.startsWith(only)) continue;
  const n = orig.split(from).length - 1;
  if (n < 1) { console.log(`INVALID  ${name}: pattern count ${n}`); continue; }
  const dir = `${ROOT}/mut/${name.split(' ')[0]}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/tests/p0-12`, { recursive: true });
  // replace first occurrence only (all our patterns are unique except where noted)
  writeFileSync(`${dir}/tests/p0-12/organize-model.ts`, orig.replace(from, to));
  copyFileSync(TEST, `${dir}/tests/p0-12-organize.test.ts`);
  const r = spawnSync(process.execPath, ['--test', '--test-isolation=none', 'tests/p0-12-organize.test.ts'], { cwd: dir, encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  const fails = [...out.matchAll(/^✖ (.+?) \(/gm)].map((x) => x[1]).filter((x) => !x.startsWith('failing tests'));
  const pass = /ℹ pass (\d+)/.exec(out)?.[1], fail = /ℹ fail (\d+)/.exec(out)?.[1];
  if (r.status === 0) { survived++; console.log(`SURVIVED ${name} (occurrences=${n}; pass ${pass}, fail ${fail})`); }
  else { killed++; console.log(`KILLED   ${name} (pass ${pass}, fail ${fail}) :: ${[...new Set(fails)].join(' | ').slice(0, 160)}`); }
}
console.log(`killed ${killed}, survived ${survived}`);
