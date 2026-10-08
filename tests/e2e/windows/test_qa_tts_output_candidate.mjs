// Focused offline identity/admission mutations only; no product or native calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { applyScopedAdmission, assertReviewedPlacement, checkTtsCandidate, prepareTtsCandidate, revertScopedAdmission, scopedAdmissionBlocks } from './qa_tts_output_candidate.mjs';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';

if (!process.env.LC_QA_TTS_STATIC_RECEIPT) throw Error('explicit saved static stage receipt required');
const identity = JSON.parse(readFileSync(process.env.LC_QA_TTS_STATIC_RECEIPT));
const base = prepareTtsCandidate();
const fresh = () => ({ manifest: structuredClone(base.manifest), payload: { ...base.payload }, identity: structuredClone(identity) });
const accepts = v => checkTtsCandidate(v.manifest, v.payload, v.identity);
function rejects(name, mutate) { test(name, () => { const v = fresh(); mutate(v); assert.throws(() => accepts(v)); }); }

test('valid new-package descriptor admits identity only, with no execution path', () => {
  const result = accepts(fresh());
  assert.equal(result.identity_passed, true);
  assert.equal(result.execution_admitted, false);
  assert.equal(result.native_executed, false);
  assert.equal(result.provider_attempts, 0);
  const steps = JSON.parse(base.payload['steps.json']);
  assert.equal(steps.length, 32);
  assert.equal(steps.filter(s => s.onTop === 'edge').length, 3);
  assert.ok(steps.filter(s => s.onTop === 'edge').every(s => s.points.length === 16));
  assert.ok(steps.findIndex(s => s.productPlacement === 'control') < steps.findIndex(s => s.captureStart));
  assert.equal(base.manifest.app_entry.app_arguments.length, 1);
});
rejects('manifest execution flag cannot activate execution', v => { v.manifest.execution_authorized = true; });
rejects('historical approval cannot be rebound', v => { v.manifest.prior_approval_rebound_to_this_candidate = true; });
rejects('old package is rejected', v => { v.manifest.stage = v.manifest.stage.replace('tts-52be105', 'live-1755153'); });
rejects('wrong entry or launch argument is rejected', v => { v.manifest.app_entry.app_arguments.push('--unexpected'); });
rejects('altered planned PowerShell arguments are rejected', v => { v.manifest.proposed_native_invocation.arguments[3] = 'Bypass'; });
rejects('wrong source pin is rejected', v => { v.manifest.source_files['qa_edge_placement.ps1'] = '0'.repeat(64); });
rejects('missing placement step is rejected', v => { const s = JSON.parse(v.payload['steps.json']); v.payload['steps.json'] = JSON.stringify(s.filter(x => x.productPlacement !== 'control')); });
rejects('historical runner mixture is rejected', v => { v.payload['runner.ps1'] = readFileSync('docs/verification/qa/p0-13-live-1755153/edge-placement-offline/candidate/runner.ps1'); });
rejects('changed surface is rejected', v => { v.payload['surface.html'] = Buffer.from('different source'); });
rejects('missing package file receipt is rejected', v => { delete v.identity.file_sha256['package.json']; });
rejects('extra package file receipt is rejected', v => { v.identity.unexpected_files.push('extra'); });
rejects('altered package file receipt is rejected', v => { v.identity.file_sha256['package.json'] = '0'.repeat(64); });
rejects('different compiled helper is rejected', v => { v.identity.native_executable_sha256 = '0'.repeat(64); });
rejects('different Electron bytes are rejected', v => { v.identity.electron_runtime.file_sha256['electron.exe'] = '0'.repeat(64); });
test('a same-length change to the reviewed physical point set is rejected', () => {
  const built = { runner: base.payload['runner.ps1'], steps: JSON.parse(base.payload['steps.json']) };
  built.steps.find(s => s.onTop === 'edge').points[0][0] += 1;
  assert.throws(() => assertReviewedPlacement(base.manifest, built));
});

// ---- the scoped launch admission in the emitted runner ---------------------------------------------------------------
const runner = base.payload['runner.ps1'].toString();
const REVIEWED_BLOCKS = { listing: '4632e764ea307acaf840b7469d9fe0e850612267b44a800e9e32d1ab61cbbdfb', guard: '1222e15da6e564ccda5fbf5d49c11c841c2cd8c7d0a51bfc3836715a1b6c8287' };
const ctx = { appPort: base.manifest.appPort, edgePort: base.manifest.edgePort, edgeArgs: base.manifest.edgeArgs, surfaceUrl: base.manifest.surfaceUrl, profile: base.manifest.profile, edgePlacement: true };
test('the emitted runner no longer refuses beside every other Electron app, and never reads -AllowForeign', () => {
  assert.equal(runner.includes('another Electron app is running on the shared display'), false);
  assert.equal(runner.includes('$_.CommandLine.IndexOf($mine'), false);
  assert.deepEqual(runner.match(/\$AllowForeign\b/g), ['$AllowForeign']);                 // the parameter declaration only
  assert.ok(runner.includes('[switch]$AllowForeign'));
  assert.equal(runner.split('function Get-QaLaunchRelevance').length, 2);
  assert.equal(runner.split("$results.aborted = 'a launch or debugging-port owner relevant to this run is present; nothing was started'").length, 2);
});
test('Foreign-Electron keeps its three call sites (start gate, desktop screenshot, end record) and lists PIDs and reasons only', () => {
  assert.equal(runner.split('function Foreign-Electron {').length, 2);
  for (const site of ['$results.foreign.start = Foreign-Electron', '$entry.foreign = Foreign-Electron', '$results.foreign.end = Foreign-Electron']) assert.equal(runner.split(site).length, 2, site);
  const body = runner.slice(runner.indexOf('function Foreign-Electron {'), runner.indexOf('function Free-Port'));
  assert.equal(/CommandLine|ExecutablePath|stage =/.test(body.replace('Get-QaLaunchRelevance $r', '')), false);   // nothing of the process text is recorded
  assert.ok(body.includes('$out.relevant += [ordered]@{ pid = [int]$r.ProcessId; reason = $why }'));
  assert.ok(body.includes('$out.other_owner += [int]$r.ProcessId'));
  assert.ok(body.includes('[Math]::Abs(($r.CreationDate - $start).Ticks) -lt 10000'));   // this run's app: its PID AND its start time, never a PID alone
  assert.ok(body.includes('$r.CreationDate -ge $start'));                                 // a reused parent PID cannot adopt an older process
});
test('the native rule is the wrapper\'s: Windows\' own argument splitter, the same path, short-name, runtime and port patterns, the two ports, the stage and this run\'s folder', () => {
  assert.ok(runner.includes('[DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]'));
  assert.ok(runner.includes('private static extern IntPtr CommandLineToArgvW(string lpCmdLine, out int pNumArgs);'));
  assert.ok(runner.includes("$k = [regex]::Replace($k, '(?<=.)\\\\{2,}', '\\')"));
  assert.ok(runner.includes("return $k.TrimEnd([char[]]@('\\', '.', ' ')).ToLowerInvariant()"));
  assert.ok(runner.includes("if ($c -match '^([^~]{6})~[0-9]+(\\.[^\\\\]*)?$') {"));
  assert.ok(runner.includes(`[regex]::IsMatch($name, '^(?:(?:.*-)?port|inspect(?:-brk|-wait)?|debug(?:-brk)?)\\z', 'IgnoreCase, CultureInvariant') -and [regex]::IsMatch($val, '(?:^|:)\\+?0*(?:${ctx.appPort}|${ctx.edgePort})\\z')`));
  assert.ok(runner.includes("if (-not [regex]::IsMatch((ConvertTo-QaPathKey $app), '^(?:[a-z]:\\\\|\\\\\\\\)')) { return 'candidate_runtime_relative_app' }"));
  assert.ok(runner.includes(`foreach ($port in @(${ctx.appPort}, ${ctx.edgePort})) {`));
  assert.ok(runner.includes('$qaRefs = @((ConvertTo-QaPathKey ([IO.Path]::GetFullPath($Stage))), (ConvertTo-QaPathKey ([IO.Path]::GetFullPath((Split-Path -Parent $StepsFile)))))'));
  for (const reason of ['unreadable_creation', 'unreadable_executable', 'unreadable_command_line', 'unparsable_command_line', 'candidate_runtime_without_app', 'candidate_runtime_relative_app', 'names_this_run', 'test_port_argument'])
    assert.ok(runner.includes(`return '${reason}'`), reason);
  assert.equal(/\.StartsWith\('[^']*'\)|\.IndexOf\('/.test(runner.slice(runner.indexOf('function ConvertTo-QaPathKey'), runner.indexOf('function Foreign-Electron'))), false);   // ordinal only
  const args = base.manifest.proposed_native_invocation.arguments;
  assert.equal(args[args.indexOf('-StepsFile') + 1], base.manifest.work.replace('/mnt/c/', 'C:\\').replaceAll('/', '\\') + '\\steps.json');
});
test('the runner reads only-unreadable rows once more before refusing, and refuses on any relevant row or listener', () => {
  const guard = runner.slice(runner.indexOf('# TTS candidate only: the start-up refusal'), runner.indexOf('$script:wslSeen = @{}'));
  assert.ok(guard.includes("Where-Object { -not ([string]$_.reason).StartsWith('unreadable_', [StringComparison]::Ordinal) }).Count -eq 0) {"));
  assert.ok(guard.includes('Start-Sleep -Milliseconds 300') && guard.includes('$results.foreign.start_recheck = Foreign-Electron'));
  assert.ok(guard.includes('if (@($results.admission.relevant_electron).Count -gt 0 -or @($results.admission.port_owners).Count -gt 0) {'));
  assert.ok(guard.trimEnd().endsWith('exit 3\n}'));
});
test('the two emitted blocks are pinned by their reviewed hashes (any change to the native rule must be reviewed again)', () => {
  const blocks = scopedAdmissionBlocks(ctx), h = t => createHash('sha256').update(t).digest('hex');
  assert.ok(runner.includes(blocks.listing) && runner.includes(blocks.guard));
  assert.deepEqual({ listing: h(blocks.listing), guard: h(blocks.guard) }, REVIEWED_BLOCKS);
});
test('the controlled-surface gates and the owned-only termination paths of the runner are unchanged', () => {
  for (const gate of ["Assert-QaSurfaceAdmission 'before_product_launch'", "Assert-QaSurfaceAdmission 'before_capture_start'", "Assert-QaDisplayUnchanged 'before_browser_launch'", 'Initialize-QaDisplayAdmission'])
    assert.ok(runner.includes(gate), gate);
  assert.deepEqual(runner.match(/Stop-Process[^\n]*/g), ['Stop-Process -Id $script:app.Id -Force -ErrorAction SilentlyContinue']);   // the owned app only (endHungApp, not among the 32 steps)
  assert.equal(/taskkill|\.Kill\(\)|Get-Process[^\n]*\| *Stop/.test(runner), false);
});
test('the delta is exactly the scoped admission: reverting it gives the reviewed runner, and it applies once to that runner only', () => {
  const built = buildVisibleCandidate(ctx);
  assert.equal(applyScopedAdmission(built.runner, ctx), runner);
  assert.equal(revertScopedAdmission(runner, ctx), built.runner);
  assert.throws(() => applyScopedAdmission(runner, ctx), /already present/);
  assert.throws(() => applyScopedAdmission(built.runner.replace("exit 3\n}\n$script:wslSeen", "exit 4\n}\n$script:wslSeen"), ctx), /substitution refused/);
  assert.throws(() => revertScopedAdmission(runner.replace("reason = 'port_listener'", "reason = 'x'"), ctx), /missing or changed/);
});
