# Targeted mutants of the corrected driver (Support HOLD 38230e1 + F3), each applied to one file in a /tmp copy without
# execution-* folders; the test file then runs with child processes withheld. CAUGHT: a test fails that does not merely
# refuse a changed source pin. Usage: LC_QA_WT=<worktree> LC_QA_NODE=<node> python3 driver-mutants.py
import subprocess, shutil, os, tempfile, re
from concurrent.futures import ThreadPoolExecutor
WT = os.environ.get('LC_QA_WT', os.getcwd()); NODE = os.environ.get('LC_QA_NODE', 'node')
L = 'tests/e2e/windows/qa_live_ledger.mjs'; W = 'tests/e2e/windows/qa_run_live_candidate.mjs'; G = 'tests/e2e/windows/qa_live_candidate.mjs'
C = 'tests/e2e/windows/qa_admission_checker.ps1'
M = [
 # carried over from driver-nonvoice-02 (anchors updated where the amendment changed the line)
 ('transport: not-submitted counted as at provider', L, "const submitted = receipt.submission === 'acknowledged' || receipt.submission === 'written';", "const submitted = true;"),
 ('transport: text input not required', L, "types.includes('text') && types.includes('image')", "types.includes('image')"),
 ('transport: tools not flagged', L, "const tools = items.filter(t => !PLAIN_ITEMS.has(t));", "const tools = [];"),
 ('fence: later requests ignored', L, "if (!notShown || !noLater) return", "if (!notShown) return"),
 ('fence: out at Stop not required', L, "if (!stopped || !recorded || !outAtStop || !settledAfterStop || phase === 'conflicting')", "if (!stopped || !recorded || !settledAfterStop || phase === 'conflicting')"),
 ('fence: settling after Stop not required', L, "if (!stopped || !recorded || !outAtStop || !settledAfterStop || phase === 'conflicting')", "if (!stopped || !recorded || !outAtStop || phase === 'conflicting')"),
 ('fence: actual card ignored', L, "const notShown = slot.shown !== true && slot.presentation !== 'shown' && cardClean;", "const notShown = slot.shown !== true && slot.presentation !== 'shown';"),
 ('fence: user Stop not required', L, "const stopped = !!ended && ended.reason === 'stopped by you';", "const stopped = !!ended;"),
 ('ledger: extra focus not detected', L, "...focus.slice(1).map(q => q.request_id), ", ""),
 ('ledger: extra typed not detected', L, ", ...typed.slice(2).map(q => q.request_id)]", "]"),
 ('ledger: slot 1 from a failed live_policy', L, "starts > 0 || policy?.ok === true", "starts > 0 || !!policy"),
 ('ledger: failed trigger not named', L, "const failed = triggers[k] && triggers[k].ok === false;", "const failed = false;"),
 ('ledger: app count not cross-checked', L, "used <= 4 && unwritten === 0 && (appUsed < 0 || appUsed <= submittedSlots + extra.length) && turnsConsistent", "used <= 4 && turnsConsistent"),
 ('ledger: spoken requests pass as silent', L, "all_silent: slots.every(s => !s.asked_as || (s.asked_as === 'silent' && !s.spoken)),", "all_silent: true,"),
 ('ledger: restart via not_started ignored', L, "restarted: starts + refusedStarts.length > 1,", "restarted: starts > 1,"),
 ('evidence: earlier AI text not excluded in action 3', L, "pixelEvidence(a3, { now: after, before, earlierText: [...lookText, a2] })", "pixelEvidence(a3, { now: after })"),
 ('evidence: formatted numbers not read', L, ".replace(/(?<!\\d)(\\d)[,\\u00a0\\u202f ](\\d{3})(?!\\d)/g, '$1$2')", ""),
 ('wrapper: connector admission skipped', W, "  const connector = connectorAdmission(io, checks);\n", "  const connector = null;\n"),
 ('wrapper: connector release not required', W, "    connector_released: (report.connector_left_running ?? ['?']).length === 0 && report.connector_watch?.state === 'released',", "    connector_released: true,"),
 ('wrapper: question leaks not required', W, "    no_value_in_questions: (report.evidence?.leaks_in_questions ?? ['?']).length === 0,", "    no_value_in_questions: true,"),
 ('wrapper: exclusive display not required', W, "|| record.exclusive_display !== true", ""),
 ('wrapper: script permission not required', W, "      || typeof record.script_permission_ref !== 'string' || record.script_permission_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.script_permission_ref)", ""),
 ('wrapper: AI-disabled approvals accepted', W, "record.command_approval_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.command_approval_ref)", "record.command_approval_ref.length < 8"),
 ('wrapper: any native bound accepted (D6)', W, "|| record.native_bound_ms !== candidate.native_bound_ms ", "|| false "),
 ('wrapper: askPathCheck refusal dropped', W, "if (!ask.ok || !livePath.ok)", "if (!livePath.ok)"),
 ('L2: a reached Start not counted', L, "const startReached = !!start && !startNeverRan && refusedStarts.length === 0;", "const startReached = false;"),
 ('L2: refused admission counted as reached', L, "const startNeverRan = admissions.some(v => v.phase === 'before_capture_start' && v.accepted === false);", "const startNeverRan = false;"),
 ('L2: not_started counted as reached', L, "const startReached = !!start && !startNeverRan && refusedStarts.length === 0;", "const startReached = !!start && !startNeverRan;"),
 ('D8: thread id kept in sanitized receipts', W, "const RECEIPT_FIELDS = ['request_id',", "const RECEIPT_FIELDS = ['thread_id', 'request_id',"),
 ('D8: raw receipts inside the repository', W, "export const rawReceiptsRoot = '/home/agentsdock/.local/state/lc-qa-live';", "export const rawReceiptsRoot = '/home/agentsdock/Projects/learning-companion/wt-review/docs/verification/qa/raw';"),
 ('D8: allowlist admits everything', W, "if (io.statSync(full).isDirectory()) walk(full, r);\n    else if (", "if (io.statSync(full).isDirectory()) walk(full, r);\n    else if (true || "),
 # F1: the applicable bucket
 ('F1: any bucket\'s spend control vetoes', G, "if (applicable.length === 1 && (applicable[0].spend_control_reached === true", "if (windows.some(b => b.spend_control_reached === true) || applicable.length === 1 && (applicable[0].spend_control_reached === true"),
 ('F1: workspace limits ignored', G, " || workspace.includes(applicable[0].rate_limit_reached_type)))", "))"),
 ('F1: another model\'s Codex bucket applies', G, "b.limit_id === 'codex' && (b.normal_model_slug === null || b.normal_model_slug === a.model)", "b.limit_id === 'codex'"),
 ('F1: the single unnamed bucket ignored', G, "if (!applicable.length && windows.length === 1 && windows[0].limit_id === null) applicable = windows.filter(b => b.normal_model_slug === null || b.normal_model_slug === a.model);", ""),
 # F4: collection, records, receipts, turns
 ('F4: collect errors ignored', W, "collected: !report.collect_failed && Array.isArray(report.collect_errors) && report.collect_errors.length === 0,", "collected: !report.collect_failed,"),
 ('F4: incomplete records pass', W, "records_complete: l?.records_complete === true,", "records_complete: true,"),
 ('F4: receipt identity not judged', W, "&& t.non_plain_items.length === 0 && t.identity_ok === true;", "&& t.non_plain_items.length === 0;"),
 ('F4: Stop attempt facts not judged', W, "stop_attempt_facts_ok: slots.length === 4 && (stop?.receipt ?", "stop_attempt_facts_ok: true || (stop?.receipt ?"),
 ('F4: turns not reconciled in the verdict', W, "provider_turns_reconciled: l?.turns_consistent === true,", "provider_turns_reconciled: true,"),
 ('F4: cumulative counts summed', L, "launches.set(r.__launch ?? 'unknown', Math.max(launches.get(r.__launch ?? 'unknown') ?? 0, Number.isInteger(r.turn_start_count) ? r.turn_start_count : Infinity));",
   "launches.set(r.__launch ?? 'unknown', (launches.get(r.__launch ?? 'unknown') ?? 0) + (Number.isInteger(r.turn_start_count) ? r.turn_start_count : Infinity));"),
 ('F4: turns above the actions accepted', L, "Number.isFinite(providerTurns) && providerTurns <= used && providerTurns <= 4 && providerTurns >= sentReceipts", "Number.isFinite(providerTurns) && providerTurns >= sentReceipts"),
 ('F4: a missing turn count read as zero', L, "Number.isInteger(r.turn_start_count) ? r.turn_start_count : Infinity", "Number.isInteger(r.turn_start_count) ? r.turn_start_count : 0"),
 ('F4: unreadable live lines ignored', L, "const unreadable = liveLines.filter(l => l.kind === 'unreadable_line').length + ", "const unreadable = 0 + "),
 ('F4: lifecycle correlation not required', W, "connector_lifecycle_correlated: !!l && (l.sent_receipts === 0 || report.connector_watch?.descendants > 0),", "connector_lifecycle_correlated: true,"),
 # F5: watch readiness and release
 ('F5: release without a start record', W, "const missing = !start ? 'the watch recorded no start' : ", "const missing = "),
 ('F5: release without the connector seen', W, ": !facts.connector_seen ? 'the connector was never seen'", ""),
 ('F5: release without every exit', W, ": facts.not_seen_exiting.length ? 'a process was not seen exiting'", ""),
 ('F5: readiness not awaited', W, "  const ready = await watchReady(io, file, sleep);", "  const ready = { ready: true };"),
 ('F5: already-running process accepted at start', W, ": !Array.isArray(start.already_there) || start.already_there.length ? { ready: false, reason: 'a process already runs in the private copy' }", ""),
 # F6: uncertainty kept
 ('F6: uncertain read as not submitted', L, "const phase = submitted ? 'submitted' : receipt.submission === 'not_submitted' ? 'not_submitted' : 'unknown';", "const phase = submitted ? 'submitted' : 'not_submitted';"),
 ('F6: conflicting phases accepted', L, "const phase = phases.length && phases.every(p => p === phases[0]) ? phases[0] : 'conflicting';", "const phase = phases[0] ?? 'unknown';"),
 # receipt reader
 ('reader: earlier launches read', W, "launches = receiptLaunches(io, root).filter(n => !before.includes(n));", "launches = receiptLaunches(io, root);"),
 ('reader: links followed', W, "fd = io.openSync(join(dir, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);", "fd = io.openSync(join(dir, name), fs.constants.O_RDONLY);"),
 ('reader: request id not checked', W, "|| r.request_id !== rid ", ""),
 ('reader: extra fields accepted', W, " || !equal(Object.keys(r).sort(), RECEIPT_KEYS)", ""),
 ('reader: linked launch folder accepted', W, "if (!st.isDirectory() || st.isSymbolicLink() || io.realpathSync(dir) !== dir) throw Error('not a real folder inside receipts/');", ""),
 ('reader: hard links accepted', W, "if (!st.isFile() || st.nlink !== 1 || st.size > 16384)", "if (!st.isFile() || st.size > 16384)"),
 # F3: source admission
 ('F3: binding not required', W, "source_admission_bound: report.source_admission?.all_bound === true,", "source_admission_bound: true,"),
 ('F3: send image not compared', L, "if (send.image_sha256 !== image || typeof image !== 'string') return", "if (false) return"),
 ('F3: acquisition after the send accepted', L, "const p = decisions.slice(0, k).findLastIndex(", "const p = decisions.findLastIndex("),
 ('F3: pre-acquisition check not required', L, "if (q < 0) return { bound: false, reason: 'no admitted check before the acquisition' };", ""),
 ('F3: unrecorded admitted sends ignored', L, "&& unrecorded.length === 0", ""),
 ('F3: allows after a deny accepted', L, "&& (firstDeny < 0 || decisions.slice(firstDeny + 1).every(d => d.verdict !== 'allow'))", ""),
 ('F3: runner leaves the variable for later processes', G, "; Remove-Item Env:\\\\LC_SOURCE_ADMISSION -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;", "; Remove-Item Env:\\\\LC_UNRELATED -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;"),
 ('F3: checker foreground guard dropped', G, "const CHECKER_FUNCTIONS = ['Receive-Message',", "const CHECKER_FUNCTIONS = ['Receive-Message',"),   # placeholder, replaced below
 ('F3: checker band before the admission dropped', C, "        if ($before.Topmost -or $before.Minimized) { throw 'owned Edge must remain visible in the normal window band' }\n", ""),
 ('F3: checker band after the admission dropped', C, "        if ($after.Topmost -or $after.Minimized) { throw 'owned Edge must remain visible in the normal window band' }\n", ""),
 ('F3: checker extra window resolution reintroduced', C, "        $before = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)\n", "        $null = Window-Handle 'edge'\n        $before = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)\n"),
 ('F3: checker leading-operator continuation (parse error)', C, " -or -not (Test-QaCheckerCount $r.seq 1) -or\n      @('arm',", " -or -not (Test-QaCheckerCount $r.seq 1)\n      -or @('arm',"),
 ('F3: checker numeric display id only', C, "$idOk = ($d.id -is [string] -and $d.id -cmatch '^[0-9]{1,20}\\z') -or (Test-QaCheckerCount $d.id 0)", "$idOk = (Test-QaCheckerCount $d.id 0)"),
 ('F3: interlock gate removed', W, "  if (typeof interlock !== 'string' || !/^[0-9a-f]{40}$/.test(interlock) || candidate?.production_commit !== interlock) {", "  if (false) {"),
 ('pins: the checker not pinned', W, ",\n  'admission-checker.ps1': ", ",\n  'admission-checker-unpinned.ps1': "),
 ('F3: checker reply echo drops a field', C, "raw_sha256 = $r.raw_sha256; raw_size = $r.raw_size; request_id = $r.request_id; image_sha256 = $r.image_sha256; verdict = $verdict; reason = $reason }",
   "raw_sha256 = $r.raw_sha256; request_id = $r.request_id; image_sha256 = $r.image_sha256; verdict = $verdict; reason = $reason }"),
 ('F3: checker deny not latched', C, "  if ($null -ne $qaState.denied) { $reason = 'an earlier decision denied this capture' }\n  elseif", "  if ($false) { }\n  elseif"),
 ('F3: checker answers before logging', C, "  # Logged before it is answered: an unlogged decision is never an allow.\n", "  $qaProtocolOut.WriteLine('{}')\n  # Logged before it is answered: an unlogged decision is never an allow.\n"),
 ('F3: checker DPI awareness dropped', G, "const CHECKER_FOLLOWING = { QaWin: '[void][QaWin]::SetProcessDPIAware()\\n' };", "const CHECKER_FOLLOWING = {};"),
]
# The foreground mutant: the checker's admission would lose its foreground predicate if the generator patched it.
M = [m for m in M if m[0] != 'F3: checker foreground guard dropped'] + [
 ('F3: checker foreground guard dropped', G, "    blocks.push(runner.slice(heads[0], end) + '\\n');", "    blocks.push(runner.slice(heads[0], end).replace('-not $state.Foreground -or ', '') + '\\n');")]
def run(m):
    name, f, a, b = m
    d = tempfile.mkdtemp(prefix='qa-livemut-')
    for sub in ['tests/e2e/windows', 'docs/verification/qa/p0-13-tts-52be105', 'docs/verification/qa/p0-13-live-1755153', 'docs/verification/qa/p0-13-live-52be105']:
        shutil.copytree(os.path.join(WT, sub), os.path.join(d, sub), ignore=shutil.ignore_patterns('execution-*'))
    p = os.path.join(d, f); s = open(p, encoding='utf-8').read()
    if s.count(a) != 1: shutil.rmtree(d); return (name, f'BAD MUTANT ({s.count(a)})', [])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b))
    g = subprocess.run([NODE, '--permission', '--allow-fs-read=' + d, '--allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-*', 'tests/e2e/windows/test_qa_live_candidate.mjs'], capture_output=True, text=True, cwd=d)
    fails = sorted({re.sub(r' \([\d.]+ms\)$', '', l[2:]) for l in g.stdout.splitlines() if l.startswith('✖') and 'failing tests' not in l})
    if not any(l.startswith(('✔', '✖')) for l in g.stdout.splitlines()):
        shutil.rmtree(d); return (name, 'LOAD REFUSED: ' + (g.stderr.strip().splitlines() or ['?'])[-1][:120], [])
    pinned = f in (L, G, C)   # the candidate pins these sources, so its pinned-candidate checks fail on any change; the wrapper is pinned by the allocation instead
    beyond = [x for x in fails if not pinned or ('still refuses at the connector checks' not in x and 'the candidate is offline-only' not in x)]
    shutil.rmtree(d)
    return (name, 'CAUGHT' if beyond else ('PIN ONLY' if fails else 'SURVIVED'), beyond)
with ThreadPoolExecutor(6) as ex: res = list(ex.map(run, M))
for n, v, b in res:
    print(f'{n}: {v}')
    for x in b[:2]: print('    -', x[:140])
print(f"\n{sum(v == 'CAUGHT' for _, v, _ in res)}/{len(res)} caught by a test other than the pinned-candidate checks")
