// Focused offline identity/admission mutations only; no product or native calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { applyEdgeIdentity, applyScopedAdmission, assertReviewedPlacement, checkTtsCandidate, edgeBindGeometryModel, edgeIdentityBlocks, edgeRaiseModel, edgeSurfaceModel, edgeTargetModel, prepareTtsCandidate, revertEdgeIdentity, revertScopedAdmission, scopedAdmissionBlocks } from './qa_tts_output_candidate.mjs';
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
const REVIEWED_IDENTITY_BLOCKS = { socket: '9ef77d2c3110b3fbc110d9062243a954e8c991c789e405d201eab4d7e9ec6e9c', lookup: 'ab7e45d85d61d4996c178da132e4d3db7fa0917f312252b9350cb4457ca352aa', bind: 'fb8a41b80ea87ef4c7050ebcdc341bbc2f25f68f3e5154c70216440c02b7686b' };
const REVIEWED_BLOCKS = { listing: '8669891a7eae6e4f3d641dee6ec2320390a78c36c2d8b0f2cde540480eb7ed50', guard: '1222e15da6e564ccda5fbf5d49c11c841c2cd8c7d0a51bfc3836715a1b6c8287' };
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
  assert.ok(runner.includes("$d = $c.TrimEnd([char[]]@('.', ' '))"));                    // each component's trailing dot/space, as Windows ignores them
  assert.ok(runner.includes(`[regex]::IsMatch($name, '^(?:(?:.*-)?port|inspect(?:-brk|-wait)?|debug(?:-brk)?)\\z', 'IgnoreCase, CultureInvariant') -and [regex]::IsMatch($val, '(?:^|:)\\+?0*(?:${ctx.appPort}|${ctx.edgePort})\\z')`));
  assert.ok(runner.includes("if (Test-QaSwitch $a[1]) { return 'candidate_runtime_app_unresolved' }"));
  assert.ok(runner.includes("if (-not [regex]::IsMatch((ConvertTo-QaPathKey $a[1]), '^(?:[a-z]:\\\\|\\\\\\\\)')) { return 'candidate_runtime_relative_app' }"));
  assert.ok(runner.includes(`foreach ($port in @(${ctx.appPort}, ${ctx.edgePort})) {`));
  assert.ok(runner.includes('$qaRefs = @((ConvertTo-QaPathKey ([IO.Path]::GetFullPath($Stage))), (ConvertTo-QaPathKey ([IO.Path]::GetFullPath((Split-Path -Parent $StepsFile)))))'));
  for (const reason of ['unreadable_creation', 'unreadable_executable', 'unreadable_command_line', 'unparsable_command_line', 'candidate_runtime_without_app', 'candidate_runtime_app_unresolved', 'candidate_runtime_relative_app', 'names_this_run', 'test_port_argument'])
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
test('the deltas are exactly the scoped admission and the owned Edge surface identity: reverting both gives the reviewed runner; each applies once', () => {
  const built = buildVisibleCandidate(ctx);
  assert.equal(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)), runner);
  assert.equal(revertScopedAdmission(revertEdgeIdentity(runner), ctx), built.runner);
  assert.throws(() => applyScopedAdmission(runner, ctx), /already present/);
  assert.throws(() => applyEdgeIdentity(runner), /already present/);
  assert.throws(() => applyScopedAdmission(built.runner.replace("exit 3\n}\n$script:wslSeen", "exit 4\n}\n$script:wslSeen"), ctx), /substitution refused/);
  assert.throws(() => revertScopedAdmission(runner.replace("reason = 'port_listener'", "reason = 'x'"), ctx), /missing or changed/);
  assert.throws(() => revertEdgeIdentity(runner.replace("{ throw 'owned generated surface window changed' }", "{ throw 'x' }")), /missing or changed/);
});

// ---- the owned Edge surface identity -------------------------------------------------------------------------------
const TOKEN = 'lcqaghijklmnopqrstuvghijklmnopqrstuv';
const launched = { pid: 14104, start: 1000, exited: false };
const surface = { handle: 'S', pid: 14104, visible: true, title: `QA test surface ${TOKEN}` };
const popup = { handle: 'P', pid: 14104, visible: true, title: '' };                       // e.g. a topmost bubble, first in z-order
const ID = { token: TOKEN, pid: 14104, start: 1000, handle: 'S' };
const model = (over = {}) => edgeSurfaceModel({ launched, children: [], windows: [popup, surface], identity: ID, ...over });
test('identity model: an owned popup first in z-order is never taken; the window showing the generated surface is', () => {
  assert.equal(model(), 'S');
  assert.equal(model({ windows: [popup, { ...surface, title: `QA test surface ${TOKEN} - Microsoft Edge` }] }), 'S');   // the token anywhere in the caption
  assert.throws(() => model({ windows: [popup, { ...surface, title: `${'x'.repeat(4096)} ${TOKEN}` }] }), /not found/); // an over-long caption is not read
  assert.equal(model({ windows: [{ ...popup, title: 'Restore pages?' }, surface] }), 'S');
});
test('identity model: another window of the same Edge process, a hidden window, and another app\'s window with the same title are not the surface', () => {
  assert.throws(() => model({ windows: [popup, { ...surface, title: 'QA test surface' }] }), /not found/);            // same PID, no token
  assert.throws(() => model({ windows: [popup, { ...surface, visible: false }] }), /not found/);
  assert.throws(() => model({ windows: [popup, { ...surface, pid: 23092 }] }), /not found/);                           // the user's Edge
  assert.equal(model({ windows: [{ ...surface, handle: 'U', pid: 23092 }, popup, surface] }), 'S');
});
test('identity model: a child process window counts only if the child was created after the launched Edge', () => {
  const child = { ...surface, pid: 777 };
  assert.equal(model({ windows: [child], children: [{ pid: 777, created: 1001 }] }), 'S');
  assert.throws(() => model({ windows: [child], children: [{ pid: 777, created: 999 }] }), /not found/);
  assert.throws(() => model({ windows: [child], children: [{ pid: 777, created: null }] }), /not found/);
  assert.equal(model({ windows: [child], children: [{ pid: 777, created: 1000 }] }), 'S');                       // created at the same instant counts
});
test('identity model: no match, two matches, an ended or replaced Edge, a missing identity and a changed window all refuse', () => {
  assert.throws(() => model({ windows: [popup] }), /not found/);
  assert.throws(() => model({ windows: [surface, { ...surface, handle: 'T' }] }), /ambiguous/);
  assert.throws(() => model({ launched: { ...launched, exited: true } }), /has ended/);
  assert.throws(() => model({ launched: { ...launched, start: 2000 } }), /identity changed/);
  assert.throws(() => model({ launched: { ...launched, pid: 15000 } }), /identity changed/);
  assert.throws(() => model({ launched: null }), /not started/);
  assert.throws(() => model({ identity: null }), /not established/);
  assert.throws(() => model({ identity: { ...ID, handle: 'OLD' } }), /window changed/);
  assert.throws(() => model({ identity: null, launched: { ...launched, exited: true } }), /not established/);   // the native order: identity first
});
test('the emitted rule is the model: lookup redirected for edge, PID before title, same refusals in the same order, bound right after the surface loads', () => {
  const lookup = runner.slice(runner.indexOf('public static class QaEdgeSurface'), runner.indexOf("if ($name -eq 'control')"));
  assert.ok(runner.includes("function Window-Handle([string]$name) {\n  if ($name -eq 'edge') { return Get-QaEdgeSurfaceWindow }\n  if ($name -eq 'control')"));
  const csharp = lookup.slice(0, lookup.indexOf("'@"));
  assert.ok(csharp.indexOf('Array.IndexOf(pids, pid) < 0) return true;') < csharp.indexOf('GetWindowTextLength(h)'));   // no title read for other processes
  assert.ok(csharp.includes('if (!IsWindowVisible(h) || Array.IndexOf(pids, pid) < 0) return true;'));
  assert.ok(csharp.includes('if (s.ToString().IndexOf(token, StringComparison.Ordinal) >= 0) found.Add(h);'));
  const order = ["throw 'owned Edge was not started'", "throw 'owned Edge has ended'", "throw 'owned Edge identity changed'", '$_.CreationDate -ge $p.StartTime',
    "throw 'owned Edge surface identity is not established'", "throw 'owned generated surface window not found'", "throw 'owned generated surface window is ambiguous'", "throw 'owned generated surface window changed'"];
  let at = -1;
  for (const o of order) { const k = lookup.indexOf(o, at + 1); assert.ok(k > at, o); at = k; }
  assert.ok(lookup.includes("location.href.toLowerCase() !== \" + $expected + \" || typeof window.__qaSurfaceTruth !== 'function') throw Error('generated surface target mismatch')"));
  assert.ok(lookup.includes("$letters = 'ghijklmnopqrstuv'"));                                // the token holds no digit (the surface's values never appear in its title)
  assert.ok(lookup.includes("if ($found.Count -eq 1) {") === false && lookup.includes("if ($found.Count -gt 1) { throw 'owned generated surface window is ambiguous' }"));
  const branch = runner.slice(runner.indexOf('elseif ($null -ne $step.edgeStart) {'), runner.indexOf('elseif ($null -ne $step.consoleStart) {'));
  assert.ok(branch.trimEnd().endsWith("        $script:qaEdgeSurfaceUrl = [string]$step.edgeStart\n        [void](Eval 'edge' 'new Promise(r => document.readyState === \"complete\" ? r(true) : addEventListener(\"load\", () => r(true)))')\n        Set-QaEdgeSurfaceIdentity $entry ([string]$step.edgeStart)\n      }"));
  assert.ok(runner.includes("function Get-Socket([string]$target) {\n  if ($target -eq 'edge') { return Get-QaEdgeSocket }\n  $cached = $sockets[$target]"));
  const sock = runner.slice(runner.indexOf('function Get-QaEdgeSocket {'), runner.indexOf('function Get-QaOwnedEdgeIds($identity) {'));
  assert.ok(sock.length > 0 && sock.length < 3000);
  let k = -1;
  for (const o of ["throw 'generated surface URL is not known'", "Where-Object { (ConvertTo-QaUrlKey ([string]$_.url)) -eq $want }", "throw 'generated surface DevTools target is ambiguous'",
    "throw 'generated surface DevTools target navigated or ended'", "throw 'no DevTools target for the generated surface'", "throw 'generated surface DevTools target changed'", "throw 'generated surface DevTools connection closed'"]) { const at = sock.indexOf(o, k + 1); assert.ok(at > k, o); k = at; }
  const bind = runner.slice(runner.indexOf('function Set-QaEdgeSurfaceIdentity'), runner.indexOf("function Window-Handle([string]$name) {"));
  k = -1;
  for (const o of ["throw 'generated surface URL changed or escaped'", "throw 'generated surface title identity was not set'", "throw 'generated surface viewport unavailable'", '$identity = [ordered]@{ token = $token;',
    "throw 'owned generated surface window not found'", "throw 'owned generated surface window is ambiguous'", '$area = [QaPlacementNative]::ClientBounds($found[0])',
    "throw 'owned generated surface window DPI disagrees with its page'", "throw 'owned generated surface window cannot hold its page'", '$identity.handle = $found[0]', '$script:qaEdgeIdentity = $identity']) { const at = bind.indexOf(o, k + 1); assert.ok(at > k, o); k = at; }
  assert.equal(bind.split('$script:qaEdgeIdentity =').length, 2);                         // the identity is published once, after every check
  assert.equal(/Raise|SetWindowPos|ShowWindow|setWindowBounds|MoveWindow/.test(sock + bind + runner.slice(runner.indexOf('public static class QaEdgeSurface'), runner.indexOf('function Get-QaEdgeSocket {'))), false);   // the identity path never acts on a window
  assert.equal(runner.split('Set-QaEdgeSurfaceIdentity $entry').length, 2);
  assert.equal(base.manifest.surfaceUrl, JSON.parse(base.payload['steps.json'])[0].edgeStart);
});
test('the two emitted identity blocks are pinned by their reviewed hashes', () => {
  const blocks = edgeIdentityBlocks(), h = t => createHash('sha256').update(t).digest('hex');
  assert.ok(runner.includes(blocks.socket) && runner.includes(blocks.lookup) && runner.includes(blocks.bind));
  assert.deepEqual({ socket: h(blocks.socket), lookup: h(blocks.lookup), bind: h(blocks.bind) }, REVIEWED_IDENTITY_BLOCKS);
});

// The DevTools page target (Get-QaEdgeSocket), the bind-time agreement and the first window action, as models.
const URL_ = 'file:///C:/Users/ROG/AppData/Local/Temp/lc-qa-tts-output-x/surface.html';
const page = (id, url = URL_) => ({ id, type: 'page', url });
test('target model: only the page showing the generated surface, the same one every time; another page first, two, none or a navigation refuses', () => {
  assert.equal(edgeTargetModel({ url: URL_, pages: [page('other', 'edge://newtab/'), page('A')] }), 'A');
  assert.equal(edgeTargetModel({ url: URL_, pages: [page('A', URL_.toLowerCase())] }), 'A');
  assert.equal(edgeTargetModel({ url: URL_, pages: [{ id: 'W', type: 'service_worker', url: URL_ }, page('A')] }), 'A');
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('other', 'edge://newtab/')] }), /no DevTools target/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A'), page('B')] }), /ambiguous/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A', 'file:///C:/elsewhere.html')], cachedId: 'A' }), /navigated or ended/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('B')], cachedId: 'A' }), /target changed/);
  assert.throws(() => edgeTargetModel({ url: null, pages: [page('A')] }), /URL is not known/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A', URL_.replace('surface.html', 'surface%2Ehtml'))] }), /no DevTools target/);   // an escaped form is not the surface
});
test('bind model: the found window must have the page\'s DPI and a client area that holds its viewport; unreadable geometry refuses', () => {
  const p = { inner_width: 1280, inner_height: 800, dpr: 2 };
  assert.equal(edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 192], page: p }), true);
  assert.equal(edgeBindGeometryModel({ area: [100, 50, 2660, 1730, 192], page: p }), true);                      // a normal window with its title bar
  assert.throws(() => edgeBindGeometryModel({ area: [670, 88, 1888, 202, 192], page: p }), /cannot hold/);        // the 2026-10-08 window's size
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 400, 192], page: p }), /cannot hold/);           // wide but short
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 1000, 1600, 192], page: p }), /cannot hold/);          // tall but narrow
  assert.equal(edgeBindGeometryModel({ area: [0, 0, 2558, 1598, 192], page: p }), true);                          // the 2 px tolerance
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 96], page: p }), /DPI/);
  assert.throws(() => edgeBindGeometryModel({ area: null, page: p }), /unavailable/);
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 192], page: { ...p, dpr: 0 } }), /viewport unavailable/);
});
test('action model: nothing is raised unless the identity holds and the identified window is in the normal band; every refusal leaves no action', () => {
  const state = (over = {}) => ({ launched, children: [], identity: { token: TOKEN, pid: 14104, start: 1000, handle: 'S' }, windows: [{ ...popup, topmost: true }, surface], ...over });
  assert.deepEqual(edgeRaiseModel(state()).actions, [['raise', 'S']]);                                              // owned topmost popup first: the surface is raised
  for (const [over, why] of [
    [{ windows: [{ ...popup, topmost: true }] }, /not found/],
    [{ windows: [surface, { ...surface, handle: 'D' }] }, /ambiguous/],                                             // a same-size decoy with the token
    [{ windows: [{ ...surface, handle: 'S2' }], identity: { token: TOKEN, pid: 14104, start: 1000, handle: 'S' } }, /window changed/],
    [{ launched: { ...launched, exited: true } }, /has ended/],
    [{ launched: { ...launched, start: 1001 } }, /identity changed/],
    [{ windows: [{ ...surface, topmost: true }] }, /normal window band/],                                         // the identified surface itself is topmost
    [{ windows: [{ ...surface, minimized: true }] }, /normal window band/],
  ]) { const r = edgeRaiseModel(state(over)); assert.deepEqual(r.actions, []); assert.match(r.refused, why); }
});

test('every guard of the emitted identity rule is present as an exact line, as often as it should be', () => {
  for (const [line, n] of [
    ["      if (!IsWindowVisible(h) || Array.IndexOf(pids, pid) < 0) return true;", 1],
    ["      if (s.ToString().IndexOf(token, StringComparison.Ordinal) >= 0) found.Add(h);", 1],
    ["      if (n <= 0 || n > 4096) return true;", 1],
    ["function ConvertTo-QaUrlKey([string]$u) { return $u.ToLowerInvariant() }", 1],
    ["      $match = @($pages | Where-Object { (ConvertTo-QaUrlKey ([string]$_.url)) -eq $want })", 1],
    ["      if ($match.Count -gt 1) { throw 'generated surface DevTools target is ambiguous' }", 1],
    ["      if ($cached) { throw 'generated surface DevTools target navigated or ended' }", 1],
    ["    if ([string]$cached.id -cne [string]$t.id) { throw 'generated surface DevTools target changed' }", 1],
    ["  if ([uint32]$p.Id -ne $identity.pid -or $p.StartTime -ne $identity.start) { throw 'owned Edge identity changed' }", 1],
    ["  $kids = @(Get-CimInstance Win32_Process -Filter \"ParentProcessId=$($p.Id)\" | Where-Object { $_.CreationDate -and $_.CreationDate -ge $p.StartTime } | ForEach-Object { [uint32]$_.ProcessId })", 1],
    ["  return [QaEdgeSurface]::Find([uint32[]]@(Get-QaOwnedEdgeIds $identity), [string]$identity.token)", 1],
    ["  if ($found.Count -eq 0) { throw 'owned generated surface window not found' }", 2],
    ["  if ($found.Count -gt 1) { throw 'owned generated surface window is ambiguous' }", 2],
    ["  if ($found[0] -ne $script:qaEdgeIdentity.handle) { throw 'owned generated surface window changed' }", 1],
    ["  if ($url.Contains('%') -or $url -cne $script:qaEdgeSurfaceUrl) { throw 'generated surface URL changed or escaped' }", 1],
    ["  $token = 'lcqa' + (-join ([Guid]::NewGuid().ToString('N').ToCharArray() | ForEach-Object { $letters[[Convert]::ToInt32([string]$_, 16)] }))", 1],
    ["  if (-not ([string]$page.title).EndsWith(' ' + $token, [StringComparison]::Ordinal)) { throw 'generated surface title identity was not set' }", 1],
    ["  if ($area[4] -ne [int][Math]::Round([double]$page.dpr * 96)) { throw 'owned generated surface window DPI disagrees with its page' }", 1],
    ["  if (($area[2] - $area[0]) -lt [Math]::Round([double]$page.inner_width * [double]$page.dpr) - 2 -or ($area[3] - $area[1]) -lt [Math]::Round([double]$page.inner_height * [double]$page.dpr) - 2) { throw 'owned generated surface window cannot hold its page' }", 1],
    ["    $found = @(Find-QaEdgeSurface $identity)", 1],
    ["  $found = @(Find-QaEdgeSurface $script:qaEdgeIdentity)", 1],
    ["  if ($null -eq $script:qaEdgeIdentity) { throw 'owned Edge surface identity is not established' }", 1],
    ["  if ($target -eq 'edge') { return Get-QaEdgeSocket }", 1],
    ["  if ($name -eq 'edge') { return Get-QaEdgeSurfaceWindow }", 1],
  ]) {
    const block = Object.values(edgeIdentityBlocks()).join('\n');                         // the reviewed blocks, which the emitted runner contains (pinned above)
    assert.equal(block.split('\n').filter(l => l === line).length, n, line);
    assert.ok(runner.includes(line), line);
  }
});
