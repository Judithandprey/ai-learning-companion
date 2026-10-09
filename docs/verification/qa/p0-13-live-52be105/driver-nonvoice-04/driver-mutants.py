# Targeted mutants of the corrected driver (Support HOLD 38230e1, F3, Support 5083814 R1-R5, the arm-bound overlay predicate), each applied to one file in a /tmp copy without
# execution-* folders; the test file then runs with child processes withheld. CAUGHT: a test fails that does not merely
# refuse a changed source pin. Usage: LC_QA_WT=<worktree> LC_QA_NODE=<node> python3 driver-mutants.py
import subprocess, shutil, os, tempfile, re
from concurrent.futures import ThreadPoolExecutor
WT = os.environ.get('LC_QA_WT', os.getcwd()); NODE = os.environ.get('LC_QA_NODE', 'node')
L = 'tests/e2e/windows/qa_live_ledger.mjs'; W = 'tests/e2e/windows/qa_run_live_candidate.mjs'; G = 'tests/e2e/windows/qa_live_candidate.mjs'
C = 'tests/e2e/windows/qa_admission_checker.ps1'; P = 'tests/e2e/windows/qa_overlay_predicate.ps1'
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
 ('ledger: extra typed not detected', L, " ...typed.slice(2).map(q => q.request_id),", ""),
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
 ('F4: cumulative counts summed', L, "max = valid ? Math.max(...counts) : null;", "max = valid ? counts.reduce((a, b) => a + b, 0) : null;"),
 ('F4: turns above four accepted', L, "&& providerTurns <= 4 && providerTurns <= possiblySent && providerTurns <= used;", "&& providerTurns <= possiblySent && providerTurns <= used;"),
 ('F4: lifecycle correlation not required', W, "connector_lifecycle_correlated: !!l && (l.sent_receipts === 0 || report.connector_watch?.descendants > 0),", "connector_lifecycle_correlated: true,"),
 # F5: watch readiness and release
 ('F5: release without a start record', W, "const missing = !start ? 'the watch recorded no start first' : ", "const missing = "),
 ('F5: release without the connector seen', W, ": !facts.connector_seen ? 'the connector was never seen'", ""),
 ('F5: release without every exit', W, ": facts.not_seen_exiting.length ? 'a process was not seen exiting'", ""),
 ('F5: readiness not awaited', W, "  const ready = await watchReady(io, file, sleep);", "  const ready = { ready: true };"),
 ('F5: already-running process accepted at start', W, ": !Array.isArray(start.already_there) || start.already_there.length ? { ready: false, reason: 'a process already runs in the private copy' }", ""),
 # F6: uncertainty kept
 ('F6: uncertain read as not submitted', L, "const phase = submitted ? 'submitted' : receipt.submission === 'not_submitted' ? 'not_submitted' : 'unknown';", "const phase = submitted ? 'submitted' : 'not_submitted';"),
 ('F6: conflicting phases accepted', L, "const phase = definite.size > 1 || identity === 'different' ? 'conflicting'", "const phase = identity === 'different' ? 'conflicting'"),
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
 ('F3: display choice not compared', L, "const all = lines[0]?.event === 'ready' && !!arm && displayMatches && mainAgrees", "const all = lines[0]?.event === 'ready' && !!arm && mainAgrees"),
 ('F3: main record not required', L, "const all = lines[0]?.event === 'ready' && !!arm && displayMatches && mainAgrees", "const all = lines[0]?.event === 'ready' && !!arm && displayMatches"),
 ('F3: main violation ignored', L, " && !main.some(l => l.kind === 'violation')", ""),
 ('F3: QA sends missing from main accepted', L, "&& decisions.filter(d => d.phase === 'send' && ok(d)).every(d => mainAllowed.includes(facts(d)));", ";"),
 ('F3: acquisition after the send accepted', L, "const p = decisions.slice(0, k).findLastIndex(", "const p = decisions.findLastIndex("),
 ('F3: pre-acquisition check not required', L, "if (q < 0) return { bound: false, reason: 'no admitted check before the acquisition' };", ""),
 ('F3: unrecorded admitted sends ignored', L, "&& unrecorded.length === 0", ""),
 ('F3: allows after a deny accepted', L, "&& (firstDeny < 0 || decisions.slice(firstDeny + 1).every(d => d.verdict !== 'allow'))", ""),
 ('F3: runner leaves the variable for later processes', G, "; Remove-Item Env:\\\\LC_SOURCE_ADMISSION -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;", "; Remove-Item Env:\\\\LC_UNRELATED -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP;"),
 ('F3: checker foreground guard dropped', G, "const CHECKER_FUNCTIONS = ['Receive-Message',", "const CHECKER_FUNCTIONS = ['Receive-Message',"),   # placeholder, replaced below
 ('F3: checker band before the admission dropped', C, "        Assert-QaCheckerBand\n        $null = Assert-QaCheckerAdmission", "        $null = Assert-QaCheckerAdmission"),
 ('F3: checker band after the admission dropped', C, "        Assert-QaCheckerBand\n        # During the capture", "        # During the capture"),
 ('F3: checker extra window resolution reintroduced', C, "        Assert-QaCheckerBand\n        $null = Assert-QaCheckerAdmission", "        $null = Window-Handle 'edge'\n        Assert-QaCheckerBand\n        $null = Assert-QaCheckerAdmission"),
 ('F3: band without the Edge process revalidated', C, "  if ($p.HasExited -or $p.StartTime -ne $script:qaEdgeIdentity.start) { throw 'owned Edge ended or changed' }\n", ""),
 ('F3: checker arm binds no overlay', C, "        if ($r.phase -ceq 'arm') { $script:qaOverlayBinding = New-QaOverlayBinding $r.overlay $script:qaApp.pid $script:qaApp.start_ticks $script:qaApp.process $script:qaOverlayExpect }\n", ""),
 ('F3: checker overlay not revalidated each decision', C, "          if ($null -ne $fault) { throw ('the bound overlay changed during the check: ' + $fault) }\n", ""),
 ('F3: checker arm overlay shape not checked', C, "    if (-not (Test-QaCheckerObject $o) -or (Get-QaCheckerNames $o) -cne 'hwnd,pid') { return 'arm overlay is malformed' }\n", ""),
 ('F3: checker overlay on other phases accepted', C, "  if ($null -ne $r.display -or $null -ne $r.overlay) { return 'only arm carries a display or an overlay' }", "  if ($null -ne $r.display) { return 'only arm carries a display or an overlay' }"),
 ('F3: checker parent not required', C, "  if ($parent.Count -ne 1 -or [int]$parent[0].ParentProcessId -ne [int]$qaContext.app_pid) { throw 'the checker was not started by the launched product' }\n", ""),
 ('F3: checker reply drops the overlay', C, "display = $r.display; overlay = $r.overlay; sample_seq = $r.sample_seq;", "display = $r.display; sample_seq = $r.sample_seq;"),
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
M += [
 # Support 5083814 R1-R5
 ('R1: unclassified asks dropped', L, "    ...unclassified.map((q, k) => (typeof q.request_id === 'string' ? q.request_id : `unidentified-request-${k + 1}`)), ...orphanIds];", "    ...orphanIds];"),
 ('R1: orphan request ids dropped', L, "`unidentified-request-${k + 1}`)), ...orphanIds];", "`unidentified-request-${k + 1}`))];"),
 ('R1: id-less request lines accepted', L, "(REQUEST_KINDS.has(l.kind) && typeof l.request_id !== 'string')", "(l.kind === 'look' && typeof l.request_id !== 'string')"),
 ('R1: unknown live kinds accepted', L, "l.kind === 'unreadable_line' || !LIVE_KINDS.has(l.kind) || ", "l.kind === 'unreadable_line' || "),
 ('R2: repeated published counts accepted', L, " && new Set(sentCounts).size === sentCounts.length", ""),
 ('R2: a zero published count accepted', L, "valid && sentCounts.every(c => c >= 1) && ", "valid && "),
 ('R2: unexplained turns in a launch accepted', L, " && max <= sent.length + uncertain;", ";"),
 ('R2: turns beyond the possibly sent actions accepted', L, " && providerTurns <= possiblySent", ""),
 ('R3: only the first settlement read', L, "const settledLines = liveLines.filter(l => l.kind === 'settled' && l.request_id === slot.request_id);", "const settledLines = liveLines.filter(l => l.kind === 'settled' && l.request_id === slot.request_id).slice(0, 1);"),
 ('R3: a missing phase left out', L, "...settledLines.map(l => l.submission)", "...settledLines.map(l => l.submission).filter(p => p !== undefined)"),
 ('R3: session identity not checked', L, ": settledLines.every(l => l.session_id === session) && ended?.session_id === session ? 'same' : 'different';", ": 'same';"),
 ('R4: an exited watcher counted ready', W, "  if (ready.ready && (state.exited || state.error)) Object.assign(", "  if (false) Object.assign("),
 ('R4: no launch-time watch check', W, "      await assertWatchRunning(watch, io);\n", ""),
 ('R4: launch-time check without the /proc probe', W, "    try { alive = !/^\\d+ \\(.*\\) Z /.test(io.readFileSync(`/proc/${watch.state.pid}/stat`, 'utf8')); } catch { alive = false; }", "    alive = true;"),
 ('R4: lifecycle order not judged', W, " : disorder ? 'the watch lifecycle is out of order: ' + disorder", ""),
 ('R4: exit before appearance accepted', W, "      if (!p || p.exited) { disorder = 'an exit without an earlier appearance'; return; }", "      if (!p) return;"),
 ('R5: receipt types not checked', W, "        const fault = receiptFault(r);\n", "        const fault = null;\n"),
 ('R5: nested values published', W, "  const typed = v => v === null || ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));", "  const typed = v => true;"),
 ('R5: actual_model type not checked', W, "  if (r.actual_model !== null && !(typeof r.actual_model === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(r.actual_model))) return 'actual_model';\n", ""),
 ('R5: counts not bounded', W, "  if (!count(r.turn_start_count, 4096)) return 'turn_start_count';\n", ""),
 # the one exact-overlay predicate
 ('P: affinity not required', P, "  if ($f.Affinity -ne 17) { return 'the overlay is not excluded from capture (WDA_EXCLUDEFROMCAPTURE)' }\n", ""),
 ('P: bounds not required', P, "  if ((@($f.Bounds) -join ',') -cne $expect.bounds) { return 'the overlay does not cover exactly the admitted display' }\n", ""),
 ('P: binding owner not checked', P, "  if ($facts.Owner -ne $appPid) { return 'the named overlay window belongs to another process' }\n", ""),
 ('P: binding without the frozen creation', P, " -or $appProcess.StartTime.Ticks -ne $appStartTicks", ""),
 ('P: state without the frozen creation', P, " -or $binding.process.StartTime.Ticks -ne $binding.start_ticks", ""),
 ('P: another root accepted', P, "    if ($root -ne $edge -and $root -ne $binding.hwnd) { $fault = 'a window other than the bound overlay covers the surface' }\n", ""),
 ('P: stack not checked', P, "      $fault = Get-QaStackFault ", "      $null = Get-QaStackFault "),
 ('P: stack accepts extra windows', P, "  if (-not $overlay -or @($above).Count -ne 1 -or $above[0] -cne $overlay) {", "  if (-not $overlay -or $above -cnotcontains $overlay) {"),
 ('P: no-binding rule relaxed', P, "  if ($null -eq $binding) { return ($root -eq $edge) }", "  if ($null -eq $binding) { return $true }"),
 ('P: foreground without the normal-band top', P, "      $fault = Get-QaNormalTopFault ", "      $null = Get-QaNormalTopFault "),
 ('P: foreground for another window', P, "    if ($fg -ne $binding.hwnd) { return $false }\n", ""),
 ('P: z-order step errors ignored', P, "    if (next == IntPtr.Zero && Marshal.GetLastWin32Error() != 0) throw new InvalidOperationException(\"window z-order walk failed\");\n", ""),
 # the runner's consumers and context
 ('runner: point check without the predicate', G, "\"      $record.owned = (Test-QaPointAdmitted $root $window ([int]$point[0]) ([int]$point[1]) $script:qaRunnerOverlayBinding $record)\\n\"", "\"      $record.owned = ($root -eq $window) -or $true\\n\""),
 ('runner: binding not refreshed per onTop', G, "\\n        if ($script:app -and -not $script:app.HasExited) { $script:qaRunnerOverlayBinding = Get-QaRunnerOverlayBinding }", ""),
 ('runner: binding not correlated with the checker arm', G, " -or [string]$arm.overlay.hwnd -cne [string]$state.overlay.hwnd", ""),
 ('runner: context without the launched product', G, "\n    app_pid = [int]$script:app.Id; app_start_ticks = $script:app.StartTime.Ticks.ToString() }", " }"),
 ('runner: display choice step removed', G, "      return JSON.stringify({ display_id: d[0].display_id, bounds: d[0].bounds, scale_factor: d[0].scale_factor, primary: d[0].primary }); })()`, 'display_choice'),", "      return JSON.stringify({ display_id: d[0].display_id, bounds: d[0].bounds, scale_factor: d[0].scale_factor, primary: d[0].primary }); })()`, 'display_pick'),"),
]
# Left out as equivalent (no input distinguishes them): a missing turn count read as valid (Math.max then yields NaN and every
# comparison fails anyway); the 'unreadable_line' kind removed from the unreadable test (it is not a LIVE_KINDS kind, so
# it is counted anyway); max >= sent dropped (distinct published counts of at least one already imply it).
# The foreground mutant: the checker's admission would lose its foreground predicate if the generator patched it.
M = [m for m in M if m[0] != 'F3: checker foreground guard dropped'] + [
 ('F3: checker foreground passes for any window', G, "(Test-QaOverlayForeground $window $script:qaOverlayBinding $entry)) -or ($state.Bounds", "$true) -or ($state.Bounds")]
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
    pinned = f in (L, G, C, P)   # the candidate pins these sources, so its pinned-candidate checks fail on any change; the wrapper is pinned by the allocation instead
    beyond = [x for x in fails if not pinned or ('still refuses at the connector checks' not in x and 'the candidate is offline-only' not in x)]
    shutil.rmtree(d)
    return (name, 'CAUGHT' if beyond else ('PIN ONLY' if fails else 'SURVIVED'), beyond)
with ThreadPoolExecutor(6) as ex: res = list(ex.map(run, M))
for n, v, b in res:
    print(f'{n}: {v}')
    for x in b[:2]: print('    -', x[:140])
print(f"\n{sum(v == 'CAUGHT' for _, v, _ in res)}/{len(res)} caught by a test other than the pinned-candidate checks")
