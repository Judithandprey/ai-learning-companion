// Focused offline identity/admission mutations only; no product or native calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { admissionPointsBlock, applyAdmissionPoints, applyEdgeIdentity, applyPlacementClient, applyScopedAdmission, assertReviewedPlacement, checkTtsCandidate, edgeBindGeometryModel, edgeIdentityBlocks, edgeLookupModel, edgePageModel, edgeRaiseModel, edgeReceiptModel, edgeScanModel, edgeSurfaceModel, edgeTargetModel, placementClientBlock, prepareTtsCandidate, revertAdmissionPoints, revertEdgeIdentity, revertPlacementClient, revertScopedAdmission, scopedAdmissionBlocks } from './qa_tts_output_candidate.mjs';
import vm from 'node:vm';
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
const REVIEWED_IDENTITY_BLOCKS = { socket: '9ef77d2c3110b3fbc110d9062243a954e8c991c789e405d201eab4d7e9ec6e9c', lookup: '0107b4da53eb342c627f9462a4603aec566e55fe67e22b227706030a743bea0b', bind: 'fb8a41b80ea87ef4c7050ebcdc341bbc2f25f68f3e5154c70216440c02b7686b', fullscreen: '27aaa0bc0b7b321f5e3e94dab17a8ff3062475fa9d6f413ec3d751259efa48ee' };
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
test('the deltas are exactly the scoped admission, the owned Edge surface identity, the admission points and the placement client area: reverting all gives the reviewed runner; each applies once', () => {
  const built = buildVisibleCandidate(ctx);
  assert.equal(applyPlacementClient(applyAdmissionPoints(applyEdgeIdentity(applyScopedAdmission(built.runner, ctx)))), runner);
  assert.equal(revertScopedAdmission(revertEdgeIdentity(revertAdmissionPoints(revertPlacementClient(runner))), ctx), built.runner);
  assert.throws(() => applyAdmissionPoints(runner), /already present/);
  assert.throws(() => applyPlacementClient(runner), /already present/);
  assert.throws(() => revertPlacementClient(revertPlacementClient(runner)), /missing or changed/);
  assert.throws(() => revertAdmissionPoints(revertAdmissionPoints(runner)), /missing or changed/);
  assert.throws(() => applyScopedAdmission(runner, ctx), /already present/);
  assert.throws(() => applyEdgeIdentity(runner), /already present/);
  assert.throws(() => applyScopedAdmission(built.runner.replace("exit 3\n}\n$script:wslSeen", "exit 4\n}\n$script:wslSeen"), ctx), /substitution refused/);
  assert.throws(() => revertScopedAdmission(runner.replace("reason = 'port_listener'", "reason = 'x'"), ctx), /missing or changed/);
  assert.throws(() => revertEdgeIdentity(runner.replace("{ throw 'owned generated surface window changed' }", "{ throw 'x' }")), /missing or changed/);
});

// ---- the owned Edge surface identity -------------------------------------------------------------------------------
const TOKEN = 'lcqaghijklmnopqrstuvghijklmnopqrstuv';
const URL_ = base.manifest.surfaceUrl;
const launched = { pid: 14104, start: 1000, exited: false };
const surface = { handle: 'S', pid: 14104, visible: true, title: `QA test surface ${TOKEN}` };
const popup = { handle: 'P', pid: 14104, visible: true, title: '' };                       // e.g. a topmost bubble, first in z-order
const ID = { token: TOKEN, pid: 14104, start: 1000, handle: 'S' };
const page = (id, url = URL_) => ({ id, type: 'page', url });
const target = { url: URL_, pages: [page('T')], cachedId: 'T' };
const livePage = { href: URL_, truth: true, title: `QA test surface ${TOKEN}` };
const model = (over = {}) => edgeSurfaceModel({ launched, children: [], windows: [popup, surface], identity: ID, ...over });
test('identity model: an owned popup first in z-order is never taken; the window showing the generated surface is', () => {
  assert.equal(model(), 'S');
  assert.equal(model({ windows: [popup, { ...surface, title: `QA test surface ${TOKEN} - Microsoft Edge` }] }), 'S');   // the token anywhere in the caption
  assert.equal(model({ windows: [{ ...popup, title: 'Restore pages?' }, surface] }), 'S');
});
test('identity model: another window of the same Edge process, a hidden window, and another app\'s window with the same title are not the surface', () => {
  assert.throws(() => model({ windows: [popup, { ...surface, title: 'QA test surface' }] }), /not found/);            // same PID, no token
  assert.throws(() => model({ windows: [popup, { ...surface, visible: false }] }), /not found/);
  assert.throws(() => model({ windows: [popup, { ...surface, pid: 23092 }] }), /not found/);                           // the user's Edge
  assert.equal(model({ windows: [{ ...surface, handle: 'U', pid: 23092, title: null }, popup, surface] }), 'S');      // a foreign unreadable window is not ours to read
});
test('identity model: a child process window counts only if the child was created after the launched Edge', () => {
  const child = { ...surface, pid: 777 };
  assert.equal(model({ windows: [child], children: [{ pid: 777, created: 1001 }] }), 'S');
  assert.equal(model({ windows: [child], children: [{ pid: 777, created: 1000 }] }), 'S');
  assert.throws(() => model({ windows: [child], children: [{ pid: 777, created: 999 }] }), /not found/);
  assert.throws(() => model({ windows: [child], children: [{ pid: 777, created: null }] }), /not found/);
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
test('R2 model: a readable token window PLUS an eligible owned window whose caption cannot be read is unresolved, never unique', () => {
  for (const second of [{ ...popup, handle: 'B', title: null }, { ...popup, handle: 'B', title: 'x'.repeat(5000) }])
    assert.throws(() => model({ windows: [surface, second] }), /unresolved/);
  assert.deepEqual(edgeScanModel({ launched, windows: [surface, { ...popup, handle: 'B', title: null }], identity: ID }), { matches: ['S'], unknown: ['B'] });
  assert.equal(model({ windows: [surface, { ...popup, handle: 'B', title: '' }] }), 'S');                          // a successful empty caption is a nonmatch
  assert.throws(() => model({ windows: [popup, { ...surface, title: `${'x'.repeat(4096)} ${TOKEN}` }] }), /unresolved/);   // an over-long caption is not read
  assert.equal(model({ windows: [surface, { ...popup, handle: 'B', title: null, visible: false }] }), 'S');       // a hidden window is not eligible
});
test('target model: only the page showing the generated surface, the same one every time; another page first, two, none or a navigation refuses', () => {
  assert.equal(edgeTargetModel({ url: URL_, pages: [page('other', 'edge://newtab/'), page('A')] }), 'A');
  assert.equal(edgeTargetModel({ url: URL_, pages: [page('A', URL_.toLowerCase())] }), 'A');
  assert.equal(edgeTargetModel({ url: URL_, pages: [{ id: 'W', type: 'service_worker', url: URL_ }, page('A')] }), 'A');
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('other', 'edge://newtab/')] }), /no DevTools target/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A'), page('B')] }), /ambiguous/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A', 'file:///C:/elsewhere.html')], cachedId: 'A' }), /navigated or ended/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('B')], cachedId: 'A' }), /target changed/);
  assert.throws(() => edgeTargetModel({ url: null, pages: [page('A')] }), /URL is not known/);
  assert.throws(() => edgeTargetModel({ url: URL_, pages: [page('A', URL_.replace('surface.html', 'surface%2Ehtml'))] }), /no DevTools target/);
});
test('page model: the bound page must still be at the URL, still the generated surface and still carry the token (a reloaded page is not tagged again)', () => {
  assert.equal(edgePageModel({ target, page: livePage, identity: ID }), true);
  assert.throws(() => edgePageModel({ target, page: { ...livePage, title: 'QA test surface' }, identity: ID }), /lost its identity/);   // reloaded: token gone
  assert.throws(() => edgePageModel({ target, page: { ...livePage, href: 'file:///C:/elsewhere.html' }, identity: ID }), /navigated/);
  assert.throws(() => edgePageModel({ target, page: { ...livePage, truth: false }, identity: ID }), /changed/);
  assert.throws(() => edgePageModel({ target: { ...target, pages: [page('T2')] }, page: livePage, identity: ID }), /target changed/);
});
test('bind model: the found window must have the page\'s DPI and a client area that holds its viewport; unreadable geometry refuses', () => {
  const p = { inner_width: 1280, inner_height: 800, dpr: 2 };
  assert.equal(edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 192], page: p }), true);
  assert.equal(edgeBindGeometryModel({ area: [100, 50, 2660, 1730, 192], page: p }), true);                      // a normal window with its title bar
  assert.throws(() => edgeBindGeometryModel({ area: [670, 88, 1888, 202, 192], page: p }), /cannot hold/);        // the 2026-10-08 window's size
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 400, 192], page: p }), /cannot hold/);
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 1000, 1600, 192], page: p }), /cannot hold/);
  assert.equal(edgeBindGeometryModel({ area: [0, 0, 2558, 1598, 192], page: p }), true);
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 96], page: p }), /DPI/);
  assert.throws(() => edgeBindGeometryModel({ area: null, page: p }), /unavailable/);
  assert.throws(() => edgeBindGeometryModel({ area: [0, 0, 2560, 1600, 192], page: { ...p, dpr: 0 } }), /viewport unavailable/);
});
test('R1 action model: bind, then the page or target changes before a raise, full-screen write or front: refusal and zero actions', () => {
  const bound = (over = {}) => ({ launched, children: [], identity: ID, windows: [{ ...popup, topmost: true }, surface], target, page: livePage, ...over });
  for (const action of ['raise', 'fullscreen', 'front']) {
    assert.deepEqual(edgeRaiseModel(bound(), action).actions, [[action, 'S']]);
    for (const [over, why] of [
      [{ page: { ...livePage, href: 'file:///C:/elsewhere.html' }, target: { ...target, pages: [page('T', 'file:///C:/elsewhere.html')] } }, /navigated or ended/],
      [{ target: { ...target, pages: [page('T2')] } }, /target changed/],                                           // target replaced, caption and HWND kept
      [{ page: { ...livePage, title: 'QA test surface' } }, /lost its identity/],                                  // the page reloaded
      [{ page: { ...livePage, truth: false } }, /lost its identity/],                                              // another page at the same URL
      [{ target: undefined }, /target is not known/],
      [{ windows: [surface, { ...popup, handle: 'B', title: null }] }, /unresolved/],
      [{ windows: [{ ...popup, topmost: true }] }, /not found/],
      [{ windows: [surface, { ...surface, handle: 'D' }] }, /ambiguous/],
      [{ windows: [{ ...surface, handle: 'S2' }] }, /window changed/],
      [{ launched: { ...launched, exited: true } }, /has ended/],
      [{ launched: { ...launched, start: 1001 } }, /identity changed/],                                            // Edge replaced under the same PID
      [{ windows: [{ ...surface, topmost: true }] }, /normal window band/],                                       // the identified surface itself is topmost
      [{ windows: [{ ...surface, minimized: true }] }, /normal window band/],
    ]) { const r = edgeRaiseModel(bound(over), action); assert.deepEqual(r.actions, [], `${action} ${why}`); assert.match(r.refused, why); }
  }
});
test("R1, Support's 6c7872d fixture in the model's {target, page} input: the same window, owner, band and token caption; only the page's URL/target changed", () => {
  const token = 'lcqaghijklmnopqrstuvghijklmnopqrstuv', A_ = { handle: 'A', pid: 14104, visible: true, title: `QA test surface ${token}`, topmost: false, minimized: false };
  const state = { launched: { pid: 14104, start: 1000, exited: false }, windows: [A_], identity: { token, pid: 14104, start: 1000, handle: 'A' } };
  const url = base.manifest.surfaceUrl, other = 'file:///C:/synthetic-other-page.html';
  const kept = { url, cachedId: 'page-A', pages: [{ type: 'page', id: 'page-A', url }] };
  assert.deepEqual(edgeRaiseModel({ ...state, target: kept, page: { href: url, truth: true, title: A_.title } }).actions, [['raise', 'A']]);   // control: the bound page
  const changed = { url, cachedId: 'page-A', pages: [{ type: 'page', id: 'page-A', url: other }] };                 // Support's changed target
  const r = edgeRaiseModel({ ...state, target: changed, page: { href: other, truth: true, title: A_.title } });
  assert.deepEqual(r.actions, []);
  assert.match(r.refused, /navigated or ended/);
});
test('R3 receipt model: the processes are fixed before the walk; a window whose owner changed to another process gets no caption read', () => {
  const r = edgeReceiptModel({ ids: [14104], enumerated: [{ handle: 'H' }, { handle: 'S' }], owners: { H: 23092, S: 14104 } });
  assert.deepEqual(r.rows, [{ handle: 'H', status: 'owner_changed' }, { handle: 'S', status: 'owned' }]);
  assert.deepEqual(r.captionReads, [14104]);
});

// ---- replays of the emitted C# (mechanical translation of its source text; injected Win32; not native execution) ----
const before = readFileSync(new URL('../../../docs/verification/qa/p0-13-tts-52be105/candidate-edge-identity-20261008/runner.ps1', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(before).digest('hex'), 'f739487b513cc4f749ac4cc95cfa0a64ba58e23670d9fdc4d14753df4ae3e44f');   // b9ce4cc, Support's HOLD
const method = (text, signature) => { const m = text.split(signature + ' {'); assert.equal(m.length, 2, signature); return m[1].slice(0, m[1].indexOf('\n  }\n')); };
function translate(body, pairs) {
  for (const [from, to] of pairs) { assert.ok(body.includes(from), from); body = body.split(from).join(to); }
  return body;
}
function winApi(rows, owners = {}) {
  const row = h => rows.find(w => w.handle === h), reads = [];
  let lastError = 0;
  const api = {
    EnumWindows(cb) { for (const w of rows) if (!cb(w.handle, 0)) break; return true; },
    GetWindowThreadProcessId: h => (row(h)?.gone ? 0 : owners[h] ?? row(h).pid),
    IsWindowVisible: h => row(h).visible !== false,
    SetLastError(c) { lastError = c; },
    GetLastWin32Error: () => lastError,
    GetWindowTextLength(h) {
      reads.push(owners[h] ?? row(h).pid);
      const w = row(h);
      if (w.lengthFails) { lastError = 5; if (w.vanishes) w.gone = true; return 0; }
      return w.lengthResult ?? w.title.length;
    },
    GetWindowText(h, s) { const w = row(h); if (w.readFails) return 0; s.value = w.title; return w.title.length; },
    StringBuilder: class { constructor(n) { this.Capacity = n; } ToString() { return this.value; } },
  };
  return { api, reads };
}
function newRule(rows, owners) {
  const isOwned = translate(method(runner, 'public static bool IsOwned(IntPtr h, uint[] pids)'), [['uint pid;\n    GetWindowThreadProcessId(h, out pid);', 'const pid = GetWindowThreadProcessId(h);'], ['Array.IndexOf(pids, pid)', 'pids.indexOf(pid)']]);
  const caption = translate(method(runner, 'public static int Caption(IntPtr h, uint[] pids, string token)'), [['int n =', 'const n ='], ['Marshal.GetLastWin32Error()', 'GetLastWin32Error()'],
    ['var s = new StringBuilder(n + 1);', 'const s = new StringBuilder(n + 1);'], ['int r =', 'const r ='], ['s.ToString().IndexOf(token, StringComparison.Ordinal)', 's.ToString().indexOf(token)']]);
  const find = translate(method(runner, 'public static QaEdgeScan Find(uint[] pids, string token)'), [['var matches = new List<IntPtr>();', 'const matches = [];'], ['var unknown = new List<IntPtr>();', 'const unknown = [];'],
    ['EnumProc each =', 'const each ='], ['int c =', 'const c ='], ['.Add(h)', '.push(h)'], ['IntPtr.Zero', '0'], ['new InvalidOperationException(', 'new Error('], ['GC.KeepAlive(each);', ''],
    ['return new QaEdgeScan { Matches = matches.ToArray(), Unknown = unknown.ToArray() };', 'return { Matches: matches, Unknown: unknown };']]);
  const owned = translate(method(runner, 'public static IntPtr[] OwnedWindows(uint[] pids)'), [['var found = new List<IntPtr>();', 'const found = [];'], ['EnumProc each =', 'const each ='], ['found.Add(h)', 'found.push(h)'],
    ['IntPtr.Zero', '0'], ['new InvalidOperationException(', 'new Error('], ['GC.KeepAlive(each);', ''], ['found.ToArray()', 'found']]);
  const { api, reads } = winApi(rows, owners);
  const fn = new vm.Script(`(() => { function IsOwned(h, pids) {${isOwned}\n} function Caption(h, pids, token) {${caption}\n} function Find(pids, token) {${find}\n} function OwnedWindows(pids) {${owned}\n} return { IsOwned, Caption, Find, OwnedWindows }; })()`).runInNewContext(api);
  return { ...fn, reads };
}
function oldFind(rows, pids) {
  const body = translate(method(before, 'public static IntPtr[] Find(uint[] pids, string token)'), [['var found = new List<IntPtr>();', 'const found = [];'], ['EnumProc each =', 'const each ='],
    ['uint pid;\n      GetWindowThreadProcessId(h, out pid);', 'const pid = GetWindowThreadProcessId(h);'], ['Array.IndexOf(pids, pid)', 'pids.indexOf(pid)'], ['int n =', 'const n ='],
    ['var s = new StringBuilder(n + 1);', 'const s = new StringBuilder(n + 1);'], ['s.ToString().IndexOf(token, StringComparison.Ordinal)', 's.ToString().indexOf(token)'], ['found.Add(h)', 'found.push(h)'],
    ['IntPtr.Zero', '0'], ['new InvalidOperationException(', 'new Error('], ['GC.KeepAlive(each);', ''], ['found.ToArray()', 'found']]);
  const { api, reads } = winApi(rows);
  return { matches: Array.from(new vm.Script(`((pids, token) => {${body}\n})(pids, token)`).runInNewContext({ ...api, pids, token: TOKEN })), reads };
}
const A = { handle: 'A', pid: 14104, visible: true, title: `QA test surface ${TOKEN}` };
test('R2 before/after (replayed C#): a readable match plus an unreadable second owned window was taken as unique at b9ce4cc; now it is carried as unknown', () => {
  for (const second of [{ handle: 'B', pid: 14104, title: 'x', readFails: true }, { handle: 'B', pid: 14104, title: 'x', lengthResult: 5000 }, { handle: 'B', pid: 14104, title: 'x', lengthFails: true }]) {
    assert.deepEqual(oldFind([A, second], [14104]).matches, ['A']);                                              // before: false uniqueness
    const now = newRule([A, second]).Find([14104], TOKEN);
    assert.deepEqual([Array.from(now.Matches), Array.from(now.Unknown)], [['A'], ['B']]);                         // after: unresolved
  }
  const empty = newRule([A, { handle: 'B', pid: 14104, title: '' }]).Find([14104], TOKEN);
  assert.deepEqual([Array.from(empty.Matches), Array.from(empty.Unknown)], [['A'], []]);                          // a successful empty caption stays a nonmatch
  const two = newRule([A, { ...A, handle: 'B' }]).Find([14104], TOKEN);
  assert.deepEqual(Array.from(two.Matches), ['A', 'B']);
  const grew = newRule([A, { handle: 'B', pid: 14104, title: 'abc', lengthResult: 2 }]).Find([14104], TOKEN);    // read returned more than the length said
  assert.deepEqual(Array.from(grew.Unknown), ['B']);
  const cleared = newRule([A, { handle: 'B', pid: 14104, title: 'x', lengthFails: true }, { handle: 'C', pid: 14104, title: '' }]).Find([14104], TOKEN);
  assert.deepEqual([Array.from(cleared.Matches), Array.from(cleared.Unknown)], [['A'], ['B']]);                     // an earlier failure does not make a later empty caption unknown
  const vanished = newRule([A, { handle: 'B', pid: 14104, title: 'x', lengthFails: true, vanishes: true }]);
  assert.equal(vanished.Caption('B', [14104], TOKEN), -2);                                                            // a window gone during the read is no longer a candidate
});
test('R2: the PowerShell lookup and bind refuse while any owned caption is unknown, before using the matches', () => {
  const lookup = runner.slice(runner.indexOf('function Get-QaEdgeSurfaceWindow {'), runner.indexOf('function Get-QaEdgeWindowReceipt('));
  assert.ok(lookup.indexOf("if (@($scan.Unknown).Count -gt 0) { throw 'an owned Edge window caption could not be read: the surface window is unresolved' }") < lookup.indexOf('$found = @($scan.Matches)'));
  const bind = runner.slice(runner.indexOf('function Set-QaEdgeSurfaceIdentity'), runner.indexOf("function Window-Handle([string]$name) {"));
  assert.ok(bind.indexOf("if (@($scan.Unknown).Count -gt 0) { throw") < bind.indexOf("if ($found.Count -eq 0) { throw"));
  assert.ok(bind.includes("if (@($scan.Matches).Count -gt 0 -and @($scan.Unknown).Count -eq 0) { break }"));   // unknown captions may settle during the 5 s
});
test('R3 before/after (replayed C#): at b9ce4cc the receipt read captions of a foreign process found by HWND reuse; now Caption reads nothing for it', () => {
  assert.ok(before.includes('[QaEdgeSurface]::Find([uint32[]]@($g.Owner), [string]$identity.token)'));          // before: observed owner became a whitelist
  assert.ok(oldFind([{ ...A, pid: 23092 }], [23092]).reads.includes(23092));
  const now = newRule([A], { A: 23092 });                                                                            // enumerated as 14104's, now 23092's
  assert.equal(now.Caption('A', [14104], TOKEN), -2);
  assert.deepEqual(now.reads, []);                                                                                   // zero caption reads for the foreign process
  assert.deepEqual(Array.from(newRule([{ ...A, pid: 23092 }]).Find([14104], TOKEN).Matches), []);
  const receipt = runner.slice(runner.indexOf('function Get-QaEdgeWindowReceipt('), runner.indexOf('function Set-QaEdgeSurfaceIdentity'));
  assert.equal(/\$g\.Owner|\$row\.owner|TitleLength/.test(receipt), false);                                          // never a whitelist from an observed owner
  assert.ok(receipt.indexOf('$caption = [QaEdgeSurface]::Caption($h, $ids, [string]$identity.token)') < receipt.indexOf('[QaDisplayAdmissionNative]::ReadWindow($h)'));
  const shortCircuit = receipt.indexOf("if ($caption -eq -2) { $row.status = 'owner_changed' }");                     // no metadata read either once the owner changed
  assert.ok(shortCircuit > 0 && shortCircuit < receipt.indexOf('[QaDisplayAdmissionNative]::ReadWindow($h)'));
  const walk = newRule([A, { handle: 'F', pid: 23092, title: 'another app' }, { handle: 'H', pid: 14104, visible: false, title: '' }]);
  assert.deepEqual(Array.from(walk.OwnedWindows([14104])), ['A']);                                                 // the receipt walks only visible windows of the owned processes
  assert.deepEqual(walk.reads, []);
  assert.ok(receipt.indexOf('[QaDisplayAdmissionNative]::ReadWindow($h)') < receipt.indexOf("if (-not [QaEdgeSurface]::IsOwned($h, $ids)) { $row.status = 'owner_changed' }"));
  const csharp = method(runner, 'public static int Caption(IntPtr h, uint[] pids, string token)');
  assert.ok(csharp.indexOf('if (!IsOwned(h, pids)) return -2;') < csharp.indexOf('GetWindowTextLength(h)'));
});
test('R1 before/after (source path): at b9ce4cc the window lookup never touched the page; now every lookup and every full-screen write checks the bound page first', () => {
  const fn = (text, name) => { const k = text.indexOf(`function ${name}`); return text.slice(k, text.indexOf('\n}\n', k)); };
  const touchesPage = text => /Assert-QaEdgeSurfacePage|Get-QaEdgeSocket|Get-Socket|\bEval\b|Invoke-Cdp/.test(fn(text, 'Get-QaEdgeSurfaceWindow') + fn(text, 'Find-QaEdgeSurface') + fn(text, 'Get-QaOwnedEdgeIds'));
  assert.equal(touchesPage(before), false);                                                                            // before: the lookup never reached the page
  assert.equal(touchesPage(runner), true);                                                                             // the same test on the corrected rule
  const lookup = fn(runner, 'Get-QaEdgeSurfaceWindow');
  assert.ok(lookup.indexOf('[void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)') > 0 && lookup.indexOf('[void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)') < lookup.indexOf('$scan = Find-QaEdgeSurface $script:qaEdgeIdentity'));
  assert.ok(lookup.lastIndexOf('[void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)') > lookup.indexOf("throw 'owned generated surface window changed'"));   // and again after the scan
  const pageCheck = fn(runner, 'Assert-QaEdgeSurfacePage');
  for (const part of ["if (-not $p -or $p.HasExited) { throw 'owned Edge has ended' }", '$socket = Get-QaEdgeSocket', "document.title.endsWith(' ' + '\" + [string]$identity.token + \"')", "typeof window.__qaSurfaceTruth === 'function'", 'location.href.toLowerCase() === " + $expected + "',
    "throw 'generated surface page changed, navigated or lost its identity'", '[void](Get-QaEdgeSocket)']) assert.ok(pageCheck.includes(part), part);
  assert.equal(/document\.title\s*=/.test(pageCheck), false);                                                        // an unknown page is never tagged again
  const writes = runner.split('\n').map((l, i, all) => [l, all[i - 1]]).filter(([l]) => l.includes("'Browser.setWindowBounds'"));
  assert.equal(writes.length, 1);
  const guard = runner.slice(runner.indexOf('    $socket = Assert-QaEdgeSurfacePage $script:qaEdgeIdentity   # the bound page'), runner.indexOf("'Browser.setWindowBounds'"));
  for (const part of ["if ((Window-Handle 'edge') -ne $window) { throw 'owned Edge window changed before placement' }", "$cdpNow = Invoke-Cdp $socket 'Browser.getWindowForTarget' '{}'",
    "if ($null -eq $cdpNow -or $cdpNow.error -or $cdpNow.result.windowId -ne $id) { throw 'owned Edge CDP window identity changed before placement' }"]) assert.ok(guard.includes(part), part);
  assert.ok(guard.length < 600);                                                                                      // directly before the write
  const bind = fn(runner, 'Set-QaEdgeSurfaceIdentity');
  assert.ok(bind.indexOf('[void](Assert-QaEdgeSurfacePage $identity)') > bind.indexOf("throw 'owned generated surface window cannot hold its page'") && bind.indexOf('[void](Assert-QaEdgeSurfacePage $identity)') < bind.indexOf('$script:qaEdgeIdentity = $identity'));
  // Every Edge window action goes through Window-Handle 'edge' (and so through the page check): raise, show, onTop, placement.
  assert.ok(runner.includes("function Window-Handle([string]$name) {\n  if ($name -eq 'edge') { return Get-QaEdgeSurfaceWindow }"));
  assert.equal(runner.split('[QaWin]::Raise($window, $false)').length, 2);
  assert.ok(fn(runner, 'Raise-QaEdgeNormal').indexOf("$entry.before_window = Assert-QaNormalEdge $window $entry 'before_window'") < fn(runner, 'Raise-QaEdgeNormal').indexOf('[QaWin]::Raise($window, $false)'));
  assert.ok(fn(runner, 'Assert-QaNormalEdge').includes("(Window-Handle 'edge') -ne $window"));
});
test('the emitted rule is bound to the models: lookup redirected, refusals in order, bound right after the surface loads, nothing acts in the identity path', () => {
  const lookup = runner.slice(runner.indexOf('public static class QaEdgeSurface'), runner.indexOf("if ($name -eq 'control')"));
  const order = ["throw 'generated surface DevTools target is ambiguous'", "throw 'generated surface page changed, navigated or lost its identity'", "throw 'owned Edge was not started'", "throw 'owned Edge has ended'",
    "throw 'owned Edge identity changed'", '$_.CreationDate -ge $p.StartTime', "throw 'owned Edge surface identity is not established' }\n  [void](Assert-QaEdgeSurfacePage", "throw 'an owned Edge window caption could not be read: the surface window is unresolved'",
    "throw 'owned generated surface window not found'", "throw 'owned generated surface window is ambiguous'", "throw 'owned generated surface window changed'"];
  let at = -1;
  for (const o of order) { const k = lookup.indexOf(o, at + 1); assert.ok(k > at, o); at = k; }
  assert.ok(lookup.includes("location.href.toLowerCase() !== \" + $expected + \" || typeof window.__qaSurfaceTruth !== 'function') throw Error('generated surface target mismatch')"));
  assert.ok(lookup.includes("$letters = 'ghijklmnopqrstuv'"));
  const sock = runner.slice(runner.indexOf('function Get-QaEdgeSocket {'), runner.indexOf('function Assert-QaEdgeSurfacePage($identity) {'));
  assert.ok(sock.length > 0 && sock.length < 3000);
  let k = -1;
  for (const o of ["throw 'generated surface URL is not known'", "Where-Object { (ConvertTo-QaUrlKey ([string]$_.url)) -eq $want }", "throw 'generated surface DevTools target is ambiguous'",
    "throw 'generated surface DevTools target navigated or ended'", "throw 'no DevTools target for the generated surface'", "throw 'generated surface DevTools target changed'", "throw 'generated surface DevTools connection closed'"]) { const at = sock.indexOf(o, k + 1); assert.ok(at > k, o); k = at; }
  const bindFn = runner.slice(runner.indexOf('function Set-QaEdgeSurfaceIdentity'), runner.indexOf("function Window-Handle([string]$name) {"));
  k = -1;
  for (const o of ["throw 'generated surface URL changed or escaped'", "throw 'generated surface title identity was not set'", "throw 'generated surface viewport unavailable'", '$identity = [ordered]@{ token = $token;',
    "throw 'an owned Edge window caption could not be read: the surface window is unresolved'", "throw 'owned generated surface window not found'", "throw 'owned generated surface window is ambiguous'", '$area = [QaPlacementNative]::ClientBounds($found[0])',
    "throw 'owned generated surface window DPI disagrees with its page'", "throw 'owned generated surface window cannot hold its page'", '[void](Assert-QaEdgeSurfacePage $identity)', '$identity.handle = $found[0]', '$script:qaEdgeIdentity = $identity']) { const at = bindFn.indexOf(o, k + 1); assert.ok(at > k, o); k = at; }
  const branch = runner.slice(runner.indexOf('elseif ($null -ne $step.edgeStart) {'), runner.indexOf('elseif ($null -ne $step.consoleStart) {'));
  assert.ok(branch.trimEnd().endsWith("        $script:qaEdgeSurfaceUrl = [string]$step.edgeStart\n        [void](Eval 'edge' 'new Promise(r => document.readyState === \"complete\" ? r(true) : addEventListener(\"load\", () => r(true)))')\n        Set-QaEdgeSurfaceIdentity $entry ([string]$step.edgeStart)\n      }"));
  assert.ok(runner.includes("function Get-Socket([string]$target) {\n  if ($target -eq 'edge') { return Get-QaEdgeSocket }\n  $cached = $sockets[$target]"));
  assert.equal(runner.split('Set-QaEdgeSurfaceIdentity $entry').length, 2);
  const bind = runner.slice(runner.indexOf('function Set-QaEdgeSurfaceIdentity'), runner.indexOf("function Window-Handle([string]$name) {"));
  assert.equal(bind.split('$script:qaEdgeIdentity =').length, 2);
  assert.equal(/Raise|SetWindowPos|ShowWindow|setWindowBounds|MoveWindow/.test(lookup), false);                       // the identity path never acts on a window
  assert.equal(base.manifest.surfaceUrl, JSON.parse(base.payload['steps.json'])[0].edgeStart);
});
test('the emitted identity blocks are pinned by their reviewed hashes', () => {
  const blocks = edgeIdentityBlocks(), h = t => createHash('sha256').update(t).digest('hex');
  for (const b of Object.values(blocks)) assert.ok(runner.includes(b));
  assert.deepEqual(Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, h(v)])), REVIEWED_IDENTITY_BLOCKS);
});
test('every guard of the emitted identity rule is present as an exact line, as often as it should be', () => {
  const block = Object.values(edgeIdentityBlocks()).join('\n');
  for (const [line, n] of [
    ["    if (n == 0) return Marshal.GetLastWin32Error() == 0 ? 0 : (IsOwned(h, pids) ? -1 : -2);", 1],
    ["    if (n < 0 || n > 4096) return IsOwned(h, pids) ? -1 : -2;", 1],
    ["    if (!IsOwned(h, pids)) return -2;", 2],
    ["    if (r != n || GetWindowTextLength(h) != n) return -1;", 1],
    ["      if (!IsWindowVisible(h) || !IsOwned(h, pids)) return true;", 1],
    ["      else if (c == -1) unknown.Add(h);", 1],
    ["function ConvertTo-QaUrlKey([string]$u) { return $u.ToLowerInvariant() }", 1],
    ["      $match = @($pages | Where-Object { (ConvertTo-QaUrlKey ([string]$_.url)) -eq $want })", 1],
    ["      if ($match.Count -gt 1) { throw 'generated surface DevTools target is ambiguous' }", 1],
    ["      if ($cached) { throw 'generated surface DevTools target navigated or ended' }", 1],
    ["    if ([string]$cached.id -cne [string]$t.id) { throw 'generated surface DevTools target changed' }", 1],
    ["  if (-not ($same -is [bool] -and $same)) { throw 'generated surface page changed, navigated or lost its identity' }", 1],
    ["  if ([uint32]$p.Id -ne $identity.pid -or $p.StartTime -ne $identity.start) { throw 'owned Edge identity changed' }", 1],
    ["  $kids = @(Get-CimInstance Win32_Process -Filter \"ParentProcessId=$($p.Id)\" | Where-Object { $_.CreationDate -and $_.CreationDate -ge $p.StartTime } | ForEach-Object { [uint32]$_.ProcessId })", 1],
    ["  return [QaEdgeSurface]::Find([uint32[]]@(Get-QaOwnedEdgeIds $identity), [string]$identity.token)", 1],
    ["  if ($null -eq $script:qaEdgeIdentity) { throw 'owned Edge surface identity is not established' }", 1],
    ["  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)", 1],
    ["  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)     # and still the same page after the window scan", 1],
    ["    if ((Window-Handle 'edge') -ne $window) { throw 'owned Edge window changed before placement' }", 1],
    ["  if (@($scan.Unknown).Count -gt 0) { throw 'an owned Edge window caption could not be read: the surface window is unresolved' }", 2],
    ["  if ($found.Count -eq 0) { throw 'owned generated surface window not found' }", 2],
    ["  if ($found.Count -gt 1) { throw 'owned generated surface window is ambiguous' }", 2],
    ["  if ($found[0] -ne $script:qaEdgeIdentity.handle) { throw 'owned generated surface window changed' }", 1],
    ["  if ($url.Contains('%') -or $url -cne $script:qaEdgeSurfaceUrl) { throw 'generated surface URL changed or escaped' }", 1],
    ["  $token = 'lcqa' + (-join ([Guid]::NewGuid().ToString('N').ToCharArray() | ForEach-Object { $letters[[Convert]::ToInt32([string]$_, 16)] }))", 1],
    ["  if (-not ([string]$page.title).EndsWith(' ' + $token, [StringComparison]::Ordinal)) { throw 'generated surface title identity was not set' }", 1],
    ["  if ($area[4] -ne [int][Math]::Round([double]$page.dpr * 96)) { throw 'owned generated surface window DPI disagrees with its page' }", 1],
    ["  if (($area[2] - $area[0]) -lt [Math]::Round([double]$page.inner_width * [double]$page.dpr) - 2 -or ($area[3] - $area[1]) -lt [Math]::Round([double]$page.inner_height * [double]$page.dpr) - 2) { throw 'owned generated surface window cannot hold its page' }", 1],
    ["  [void](Assert-QaEdgeSurfacePage $identity)", 1],
    ["  $script:qaEdgeIdentity = $identity", 1],
    ["      $caption = [QaEdgeSurface]::Caption($h, $ids, [string]$identity.token)", 1],
    ["      if ($caption -eq -2) { $row.status = 'owner_changed' }", 1],
    ["        if (-not [QaEdgeSurface]::IsOwned($h, $ids)) { $row.status = 'owner_changed' }", 1],
    ["      if (IsWindowVisible(h) && IsOwned(h, pids)) found.Add(h);", 1],
    ["  if ($target -eq 'edge') { return Get-QaEdgeSocket }", 1],
    ["  if ($name -eq 'edge') { return Get-QaEdgeSurfaceWindow }", 1],
    ["    $socket = Assert-QaEdgeSurfacePage $script:qaEdgeIdentity   # the bound page, freshly, right before each window change", 1],
  ]) {
    assert.equal(block.split('\n').filter(l => l === line).length, n, line);
    assert.ok(runner.includes(line), line);
  }
});

// ---- the product-launch admission's 16 points: attempt 1 of the bounded diagnostic stopped at step 6 with op_Multiply; ----
// ---- from source reading only (step 6's record was not read), they are the likely site, not a confirmed one         ----
// A static lint, not a PowerShell parse: in PowerShell the comma operator binds more tightly than + - * / %, so a comma
// list whose element holds an unparenthesized binary arithmetic operator pairs the wrong operands (`a * 2, b` is
// `a * (2, b)`). Strings, comments and here-strings are skipped; so are method-call argument lists (`.Name(` and
// `::Name(`), where each comma-separated argument is a whole expression. One line at a time. Limits: only operators with
// a space on each side are seen; a comma and an operator on different lines, "$(...)" subexpressions and lines with
// backtick-escaped quotes are not checked; text that looks like a method call (a dotted type name given to New-Object
// included) is skipped.
function commaArithmeticHazards(text) {
  const hits = [];
  let here = null;
  text.split('\n').forEach((line, n) => {
    if (here) { if (line.startsWith(here)) here = null; return; }
    if (/@['"]\s*$/.test(line)) here = line.trimEnd().endsWith("@'") ? "'@" : '"@';
    let out = '', q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q && line[i + 1] === q) { out += '  '; i++; } else if (c === q) { q = null; out += c; } else out += ' '; continue; }
      if (c === "'" || c === '"') { q = c; out += c; continue; }
      if (c === '#') break;
      out += c;
    }
    const stack = [{ segs: [''], commas: 0, call: false }];
    const check = g => { if (g.commas && !g.call && g.segs.some(s => / [*\/%+-] /.test(` ${s.replace(/[+\-*\/]=/g, '=')} `))) hits.push(n + 1); };
    for (let i = 0; i < out.length; i++) {
      const c = out[i], top = stack[stack.length - 1];
      if ('({['.includes(c)) { top.segs[top.segs.length - 1] += ' X '; stack.push({ segs: [''], commas: 0, call: c === '(' && /(\.|::)[A-Za-z_]\w*$/.test(out.slice(0, i)) }); }
      else if (')}];'.includes(c)) { check(stack.pop()); if (c === ';' || !stack.length) stack.push({ segs: [''], commas: 0, call: false }); }
      else if (c === ',') { top.segs.push(''); top.commas++; }
      else top.segs[top.segs.length - 1] += c;
    }
    while (stack.length) check(stack.pop());
  });
  return [...new Set(hits)];
}
const attempt1Runner = readFileSync(new URL('../../../docs/verification/qa/p0-13-tts-52be105/candidate-edge-identity-r2-20261008/runner.ps1', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(attempt1Runner).digest('hex'), '301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa');   // ran as attempt 1
const POINTS_OLD = '    for ($card = 0; $card -lt 12; $card++) { $points += ,@((40 + $card % 4 * 210 + 95) * 2, (90 + [Math]::Floor($card / 4) * 170 + 75) * 2) }';
const POINTS_NEW = '    for ($card = 0; $card -lt 12; $card++) { $points += ,@(((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)) }';
test('comma-precedence lint: flags arithmetic beside a list comma, not parenthesized coordinates, method arguments, strings, comments or here-strings', () => {
  for (const bad of [POINTS_OLD, '$p = @($a + 1, 2)', '$p = 1, 2 * 3', '$q += ,@($x - 1, $y)', 'Foo (1 / 2, 3)'])
    assert.deepEqual(commaArithmeticHazards(bad), [1], bad);
  for (const good of [POINTS_NEW, '$points += ,@(20, 20); $points += ,@(2540, 1580)', "$s.StartsWith($r + '\\', [StringComparison]::Ordinal)",
    "[Math]::Max($a + 1, $b * 2)", "$t = 'a * 2, b'", '$n = 1 # x * 2, y', '$a += 1, 2', '$p = @(-1, -2)', '$c = $a -lt 2, 3', "@'\n$a * 2, $b\n'@"])
    assert.deepEqual(commaArithmeticHazards(good), [], good);
});
test('attempt 1 (before): its runner has exactly one comma-precedence hazard, the admission point list; the new runner has none', () => {
  const hits = commaArithmeticHazards(attempt1Runner);
  assert.equal(hits.length, 1);
  assert.equal(attempt1Runner.split('\n')[hits[0] - 1], POINTS_OLD);
  assert.deepEqual(commaArithmeticHazards(runner), []);
  const shared = readFileSync(new URL('qa_display_admission.ps1', import.meta.url), 'utf8');
  assert.equal(shared.split('\n').filter(l => l === POINTS_OLD).length, 1);                                        // the shared helper is unchanged
});
const CLIENT_OLD = placementClientBlock().replaceAll('$clientArea', '$client');
test('the new runner differs from the runner that ran as attempt 1 only in the point-list line, the placement client-area name and its work folder', () => {
  const work = base.manifest.work.split('/').pop();
  assert.equal(attempt1Runner.split(CLIENT_OLD).length, 2);
  assert.equal(attempt1Runner.replaceAll('lc-qa-tts-output-77fadf1af4554e9dbd361e200b896aaa', work).replace(POINTS_OLD, POINTS_NEW).replace(CLIENT_OLD, placementClientBlock()), runner);
  assert.equal(runner.split('\n').filter(l => l === POINTS_NEW).length, 1);
  assert.equal(runner.includes(POINTS_OLD), false);
  const admission = runner.slice(runner.indexOf('function Assert-QaSurfaceAdmission('), runner.indexOf('\n# Candidate-only, non-pixel window metadata.'));
  let at = -1;
  for (const part of ['$points = @()', POINTS_NEW, '$points += ,@(20, 20); $points += ,@(2540, 20); $points += ,@(20, 1580); $points += ,@(2540, 1580)', '$entry.owned_points = 0',
    "if ([QaWin]::RootAt([int]$point[0], [int]$point[1]) -ne $window) { throw 'owned surface lost at a required card or corner point' }", '$entry.owned_points++']) { const k = admission.indexOf(part, at + 1); assert.ok(k > at, part); at = k; }
});
test('the 16 admission points, computed from the emitted coordinates, are exactly the on-top points that passed on the display', () => {
  // The emitted line itself: the list inside `,@( … )`, split at its top-level commas.
  const lines = runner.split('\n').filter(l => l.startsWith('    for ($card = 0; $card -lt 12; $card++) { $points += ,@('));
  assert.equal(lines.length, 1);
  const inner = lines[0].slice(lines[0].indexOf(',@(') + 3, lines[0].lastIndexOf(') }'));
  const parts = [];
  let d = 0, from = 0;
  for (let i = 0; i < inner.length; i++) { d += inner[i] === '(' ? 1 : inner[i] === ')' ? -1 : 0; if (inner[i] === ',' && d === 0) { parts.push(inner.slice(from, i).trim()); from = i + 1; } }
  parts.push(inner.slice(from).trim());
  assert.equal(parts.length, 2);                                                                                   // one x and one y, as PowerShell pairs them
  const whole = e => { let k = 0; for (let i = 0; i < e.length; i++) { k += e[i] === '(' ? 1 : e[i] === ')' ? -1 : 0; if (k === 0 && i < e.length - 1) return false; } return k === 0; };
  assert.ok(parts.every(whole), parts.join(' | '));                                                                // each coordinate one parenthesized expression
  const m = [null, ...parts];
  // Fully parenthesized, with only + * % / and Floor on numbers, the coordinates mean the same in JS as in PowerShell.
  const js = e => new Function('card', 'return ' + e.replaceAll('$card', 'card').replaceAll('[Math]::Floor(', 'Math.floor('));
  const points = Array.from({ length: 12 }, (_, card) => [js(m[1])(card), js(m[2])(card)]);
  const corners = runner.match(/\$points \+= ,@\(20, 20\); .*$/m)[0];
  for (const c of corners.matchAll(/,@\((\d+), (\d+)\)/g)) points.push([Number(c[1]), Number(c[2])]);
  const onTop = JSON.parse(base.payload['steps.json']).filter(s => s.onTop === 'edge').map(s => s.points);
  assert.equal(onTop.length, 3);
  for (const p of onTop) assert.deepEqual(points, p);
  assert.equal(new Set(points.map(String)).size, 16);
});
test('the emitted point-list line and the renamed client-area lines are pinned by their reviewed hashes', () => {
  assert.equal(createHash('sha256').update(placementClientBlock()).digest('hex'), 'd30e56a28b09cbd6ab1cf87a08946c3b3bb1476ee2672a7bfa8166a927b9e34e');
  assert.equal(admissionPointsBlock(), POINTS_NEW);
  assert.equal(createHash('sha256').update(admissionPointsBlock()).digest('hex'), 'd37acc4bd1f07ce53f2e2dcd0c7918d4a6066ed5d568777d462786c5e0baa1e3');
});

// ---- dynamic scope: PowerShell resolves an unqualified variable through the CALLER's scopes ----
// A static text scan, not a PowerShell parse. Reports (caller, variable, reader) where the caller has a local $v (assigned
// or a parameter), $v is a script-level variable (assigned outside functions or a script parameter), and a function the
// caller reaches (transitively, by name) reads $v before assigning it itself, without receiving it as a parameter
// (parameter default values count as reads). The caller's statement order is ignored, which is conservative for the
// caller. Limits: single-quoted text is masked, double-quoted text is kept (it interpolates); scriptblocks, dot-sourcing,
// Set-Variable, -ErrorVariable/-OutVariable and $script:/$global: writes inside functions are not modelled; calls are
// found by function name only.
function scopeShadowHazards(text) {
  const lines = text.split('\n'), fns = new Map(), top = [];
  const mask = line => {                                   // single-quoted text and comments blanked, double-quoted kept
    let out = '', q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q === "'") { if (c === "'" && line[i + 1] === "'") { out += '  '; i++; } else if (c === "'") { q = null; out += c; } else out += ' '; continue; }
      if (q === '"') { if (c === '`') { out += c + (line[i + 1] ?? ''); i++; } else { if (c === '"') q = null; out += c; } continue; }
      if (c === '#') break;
      if (c === "'" || c === '"') q = c;
      out += c;
    }
    return out;
  };
  let here = null, cur = null;
  for (const raw of lines) {
    if (here) { if (raw.startsWith(here)) here = null; continue; }
    if (/@['"]\s*$/.test(raw)) here = raw.trimEnd().endsWith("@'") ? "'@" : '"@';
    const line = mask(raw), m = !cur && line.match(/^function ([A-Za-z][\w-]*)\s*(\((.*?)\))?\s*\{/);
    if (m) {
      cur = { name: m[1], head: m[3] ?? '', body: [] }; fns.set(m[1], cur);
      const rest = line.slice(line.indexOf('{', m[0].length - 1));
      if (rest.split('{').length > 1 && rest.split('{').length === rest.split('}').length) { cur.body.push(rest.slice(1, rest.lastIndexOf('}'))); cur = null; }   // one line
      continue;
    }
    if (cur && /^}\s*$/.test(line)) { cur = null; continue; }
    (cur ? cur.body : top).push(line);
  }
  const ASSIGN = /(?<![:\w])\$(\w+)\s*(?:=(?!=)|\+=|-=|\*=|\/=|\+\+|--)|foreach\s*\(\s*\$(\w+)\s+in/gi, READ = /(?<![:\w])\$(\w+)(?![\w:])/g;
  const builtin = new Set(['null', 'true', 'false', '_', 'psitem', 'args', 'input', 'this', 'lastexitcode', 'error', 'erroractionpreference', 'matches', 'pscmdlet', 'psboundparameters', 'pwd', 'home', 'host', 'pid']);
  // A parameter list: each top-level comma piece declares its first $name; any other $name in it is a default-value read.
  const paramList = head => {
    const pieces = [], names = new Set(), defaults = [];
    let d = 0, from = 0;
    for (let i = 0; i <= head.length; i++) { const c = head[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if ((c === ',' && d === 0) || i === head.length) { pieces.push(head.slice(from, i)); from = i + 1; } }
    for (const p of pieces) { const all = [...p.matchAll(READ)].map(x => x[1].toLowerCase()); if (all.length) { names.add(all[0]); defaults.push(...all.slice(1)); } }
    return { names, defaults };
  };
  const firstWrite = body => { const w = new Map(); for (const x of body.matchAll(ASSIGN)) { const v = (x[1] ?? x[2]).toLowerCase(); if (!w.has(v)) w.set(v, x.index); } return w; };
  const topWrites = firstWrite(top.join('\n')), scriptParams = paramList(lines.slice(0, 80).join('\n').match(/^param\(([\s\S]*?)^\)/m)?.[1] ?? '').names;
  const scriptVars = new Set([...topWrites.keys(), ...scriptParams]);
  const info = new Map();
  for (const [name, f] of fns) {
    const body = f.body.join('\n'), block = body.match(/^\s*param\s*\(([^)]*)\)/im)?.[1] ?? '';
    const head = paramList(f.head), inner = paramList(block), params = new Set([...head.names, ...inner.names]), writes = firstWrite(body);
    const reads = new Set([...head.defaults, ...inner.defaults].filter(v => !builtin.has(v)));
    for (const x of body.matchAll(READ)) {
      const v = x[1].toLowerCase();
      if (builtin.has(v) || params.has(v)) continue;
      if (!writes.has(v) || x.index < writes.get(v)) reads.add(v);                                     // read before its own first write
    }
    const calls = [...fns.keys()].filter(g => g !== name && new RegExp(`(^|[\\s(;{|=,@])${g.replace(/-/g, '\\-')}(?=[\\s)(;}|,]|$)`, 'm').test(body));
    info.set(name, { locals: new Set([...writes.keys(), ...params]), reads, calls });
  }
  const reach = name => { const seen = new Set(), todo = [...info.get(name).calls]; while (todo.length) { const g = todo.pop(); if (!seen.has(g)) { seen.add(g); todo.push(...info.get(g).calls); } } return seen; };
  const hits = [];
  for (const [name, i] of info) for (const v of i.locals) if (scriptVars.has(v)) for (const g of reach(name)) if (info.get(g).reads.has(v)) hits.push(`${name} $${v} -> ${g}`);
  return [...new Set(hits)].sort();
}
test('scope scan: a caller local that hides a script variable from a function it reaches is found; renamed, received or own locals are not', () => {
  const script = (a, b = '  $client.DownloadString(1)') => `$client = New-Object Net.WebClient\nfunction A($entry) {\n${a}\n  C\n}\nfunction C {\n  B\n}\nfunction B {\n${b}\n}\nA 1`;
  assert.deepEqual(scopeShadowHazards(script('  $client = $entry.area')), ['A $client -> B']);
  assert.deepEqual(scopeShadowHazards(script('  $clientArea = $entry.area')), []);
  assert.deepEqual(scopeShadowHazards(script('  $client = $entry.area', '  $client = 2; $client.X()')), []);                       // B has its own local
  assert.deepEqual(scopeShadowHazards(script('  $client = $entry.area', '  param($client) $client.X()')), []);                   // B receives it
  assert.deepEqual(scopeShadowHazards(script('  $script:client = 3')), []);                                                     // a script write is not a local
  assert.deepEqual(scopeShadowHazards(script("  $x = '$client = 1'")), []);                                                     // single-quoted text
  assert.deepEqual(scopeShadowHazards(`$client = 1\nfunction One { $client = 2; Two }\nfunction Two { return $client }`), ['One $client -> Two']);   // one-line functions
  const plain = (a, b) => `$client = 1\nfunction A${a} {\n  B\n}\nfunction B${b}\nA 2`;
  assert.deepEqual(scopeShadowHazards(plain('([int[]]$client)', ' {\n  $client.X()\n}')), ['A $client -> B']);                // a caller parameter hides it too
  assert.deepEqual(scopeShadowHazards(plain('($x) {\n  $client = 2', ' {\n  $client.X(); $client = $null\n}')), ['A $client -> B']);   // read before the reader's own write
  assert.deepEqual(scopeShadowHazards(plain('($x) {\n  $client = 2', '($c = $client) {\n  $c\n}')), ['A $client -> B']);       // a parameter default reads it
  assert.deepEqual(scopeShadowHazards(plain('($x) {\n  $client = 2', ' {\n  "it\'s $client"\n}')), ['A $client -> B']);    // inside a double-quoted string
  assert.deepEqual(scopeShadowHazards(`$client = 1\nfunction A {\n  $client++\n  B|Out-Null\n}\nfunction B {\n  $client\n}`), ['A $client -> B']);   // ++ and a piped call
});
test('attempt 1 (before): its runner hides the script WebClient from the Edge socket lookup in step 9; the new runner has no such case', () => {
  // Get-Socket is listed because the scan ignores order: its own $client reads (non-edge targets) all run before the local is set.
  assert.deepEqual(scopeShadowHazards(attempt1Runner), ['Assert-QaProductPlacement $client -> Get-QaEdgeSocket', 'Assert-QaProductPlacement $client -> Get-Socket']);
  assert.deepEqual(scopeShadowHazards(runner), []);
  // The concrete path: after the local is set, Assert-QaNormalEdge -> Window-Handle 'edge' -> ... -> Get-QaEdgeSocket reads $client.
  const fn = (text, name) => { const k = text.indexOf(`function ${name}`); return text.slice(k, text.indexOf('\n}\n', k)); };
  const before = fn(attempt1Runner, 'Assert-QaProductPlacement');
  assert.ok(before.indexOf('  $client = $entry.control_client') < before.lastIndexOf('$last = Assert-QaNormalEdge $edge'));
  assert.ok(fn(attempt1Runner, 'Assert-QaNormalEdge').includes("(Window-Handle 'edge') -ne $window"));
  assert.ok(fn(attempt1Runner, 'Get-QaEdgeSocket').includes('$client.DownloadString('));
  const after = fn(runner, 'Assert-QaProductPlacement');
  assert.equal(/\$client\b(?!Area)/.test(after), false);                                                             // no unqualified $client left in it
  assert.ok(after.includes('  $clientArea = $entry.control_client') && after.includes('$point = @(($clientArea[0] + [int][Math]::Round($box.x * $box.dpr)), ($clientArea[1] + [int][Math]::Round($box.y * $box.dpr)))'));
  assert.equal(runner.split('$clientArea').length - 1, placementClientBlock().split('$clientArea').length - 1);      // only in the renamed lines
});
