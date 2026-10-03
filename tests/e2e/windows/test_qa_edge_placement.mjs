// Focused source/assembly checks and the actual browser predicate on synthetic DOM geometry.
// No PowerShell, C#, Win32, browser, product, screen, account or sound is executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const historical = join(here, '../../../docs/verification/qa/p0-13-live-1755153/pre01-correction/candidate');
const old = JSON.parse(readFileSync(join(historical, 'candidate.json')));
const sha = b => createHash('sha256').update(b).digest('hex');
const legacy = buildVisibleCandidate(old), changed = buildVisibleCandidate({ ...old, edgePlacement: true });
const helper = readFileSync(join(here, 'qa_edge_placement.ps1'), 'utf8');
const cases = [];
function check(name, test) { test(); cases.push(name); }
function functionText(name) {
  const start = helper.indexOf(`function ${name}(`);
  assert(start >= 0);
  const end = helper.indexOf('\nfunction ', start + 1);
  return helper.slice(start, end < 0 ? undefined : end);
}
function assertPlacementBounds(source, plan) {
  assert.match(source, /public static bool Raise\(IntPtr h\) \{ return Raise\(h, true\); \}/);
  assert.match(source, /if \(pulseTopmost && \(\(long\)GetWindowLongPtr\(h, -20\) & 0x8\) == 0\)/);
  assert.match(source, /if \(\[string\]\$step.window -eq 'edge'\) \{ \$entry.foreground = Raise-QaEdgeNormal \$entry \$h \} else \{ \$entry.foreground = \[QaWin\]::Raise\(\$h\) \}/);
  assert.match(source, /\$foreground = \[QaWin\]::Raise\(\$window, \$false\)/);
  assert.match(source, /if \(\$script:app\) \{ throw 'Edge fullscreen placement must precede product launch' \}/);
  const resets = plan.map((s, i) => s.edgeFullscreen ? i : -1).filter(i => i >= 0);
  assert.equal(resets.length, 1);
  assert(resets[0] < plan.findIndex(s => s.launchApp));
  assert.equal(plan.filter(s => s.window === 'edge' && s.show === 'raise').length, 3);
  assert.match(source, /if \(\$phase -eq 'control' -and \$script:qaPlacementCaptureAttempted\) \{ throw/);
}
check('historical default runner/steps remain byte-identical and surface retained', () => {
  assert.equal(sha(legacy.runner), '0f6d0b28b7a7bf92adf437dc4d679ea3e53daea73e56c450a5cf34bd7b1f10ec');
  assert.equal(sha(JSON.stringify(legacy.steps, null, 2) + '\n'), old.files['steps.json']);
  for (const name of ['runner.ps1', 'steps.json', 'surface.html']) assert.equal(sha(readFileSync(join(historical, name))), old.files[name]);
  assert.equal(sha(readFileSync(join(here, 'surface.html'))), old.files['surface.html']);
});
check('actual new assembly bounds Edge raises and the single fullscreen transition', () => assertPlacementBounds(changed.runner, changed.steps));
check('Edge TOPMOST pulse regression is detected', () => assert.throws(() => assertPlacementBounds(changed.runner.replace('Raise($window, $false)', 'Raise($window, $true)'), changed.steps)));
check('a fullscreen transition after capture is detected', () => assert.throws(() => assertPlacementBounds(changed.runner, [...changed.steps, { edgeFullscreen: true }])));
check('native admission and exact cleanup are preserved verbatim', () => {
  assert(changed.runner.includes(readFileSync(join(here, 'qa_display_admission.ps1'), 'utf8')));
  for (const gate of ["Assert-QaSurfaceAdmission 'before_product_launch';", "Assert-QaSurfaceAdmission 'before_capture_start'", "Assert-QaDisplayUnchanged 'before_browser_launch'"]) assert(changed.runner.includes(gate));
  // Only two product-placement steps are added; the original sensitive operations and points are unchanged.
  assert.deepEqual(changed.steps.filter(s => !s.productPlacement), legacy.steps);
  assert(changed.runner.includes('# The foreground wrapper releases only exact Electron/Edge launch identities.'));
});
check('control raise precedes fresh capture admission; overlay observation follows the first frame', () => {
  const placements = changed.steps.map((s, i) => s.productPlacement ? i : -1).filter(i => i >= 0);
  assert.equal(placements.length, 2);
  const start = changed.steps.findIndex(s => s.captureStart);
  assert(changed.steps[placements[0]].productPlacement === 'control');
  assert(placements[0] < start);
  assert(changed.steps[placements[0] + 1].window === 'edge');
  assert(changed.steps.slice(placements[0]+1, start).some(s => s.onTop === 'edge'));
  assert(changed.steps[placements[1]].productPlacement === 'overlay');
  assert(placements[1] > changed.steps.findIndex(s => s.target === 'overlay' && s.waitEval?.includes('frame !== null')));
  assert(placements[1] < changed.steps.findIndex(s => s.dragHandle));
});
check('capture attempt is marked before the call and blocks later control raises, including unknown results', () => {
  const call = changed.runner.indexOf('$r = Invoke-Cdp $captureSocket');
  const flag = changed.runner.indexOf('$script:qaPlacementCaptureAttempted = $true');
  const guard = changed.runner.indexOf("Assert-QaSurfaceAdmission 'before_capture_start'");
  assert(guard < flag && flag < call);
  const f = functionText('Assert-QaProductPlacement');
  assert(f.indexOf("throw 'control placement must precede any capture attempt'") < f.indexOf('[QaWin]::Raise($control)'));
  const overlayBranch = f.slice(f.indexOf("if ($phase -eq 'overlay')"), f.indexOf("$socket = Get-Socket 'control'"));
  assert.match(overlayBranch, /return/);
  assert(!/Raise\(|SetWindow|ShowWindow|Reset-QaEdgeFullscreen/.test(overlayBranch));
});
check('removing the control-before-capture fence is detected', () => assert.throws(() => assertPlacementBounds(changed.runner.replace("if ($phase -eq 'control' -and $script:qaPlacementCaptureAttempted)", 'if ($false)'), changed.steps)));
check('all sixteen root records precede rejection, with unchanged card/corner positions', () => {
  const points = legacy.steps.find(s => s.onTop).points;
  assert.equal(points.length, 16);
  assert.deepEqual(points.slice(-4), [[20,20],[2540,20],[20,1580],[2540,1580]]);
  const record = functionText('Read-QaPlacementPoints'), guard = functionText('Assert-QaEdgePoints');
  assert.match(record, /\$record.owned = \(\$root -eq \$window\)/);
  assert.match(record, /catch \{ \$record.error = \$_\.Exception.Message \}/);
  assert(guard.indexOf('$entry.point_windows =') < guard.indexOf("throw 'owned Edge is absent"));
  assert.match(guard, /\$_.owned -and -not \$_.error/);
  assert.match(guard, /\$entry.owned_points -ne 16/);
  assert.match(guard, /Assert-QaDisplayUnchanged 'after_edge_points'/);
});
check('window validation failures retain point records and native observations', () => {
  const guard = functionText('Assert-QaEdgePoints'), normal = functionText('Assert-QaNormalEdge');
  assert(guard.indexOf('$entry.point_windows =') < guard.indexOf('Assert-QaNormalEdge'));
  assert(normal.indexOf('$entry[$key] = $snapshot') < normal.indexOf('if ($snapshot.topmost'));
  assert.match(normal, /\$entry\[\(\$key \+ '_error'\)\] = \$_\.Exception.Message/);
});
check('owned CDP normal/fullscreen replies and identity are checked even from fullscreen', () => {
  const reset = functionText('Reset-QaEdgeFullscreen');
  assert.match(reset, /foreach \(\$state in @\('normal', 'fullscreen'\)\)/);
  assert.match(reset, /if \(\$null -eq \$reply -or \$reply.error -or \$null -eq \$reply.result\) \{ throw/);
  assert.match(reset, /\$observed.result.windowId -ne \$id/);
  assert.match(reset, /\$observed.result.bounds.windowState -cne \$state/);
  assert(!reset.includes("$entry.before -ne 'fullscreen'"));
  assert(reset.indexOf('Assert-QaNormalEdge $window') < reset.indexOf("'Browser.setWindowBounds'"));
  assert.match(reset, /\$current.owner -ne \$entry.before_window.owner/);
});
check('new helper has bounded read-only foreign metadata and no pixels/global mutation', () => {
  const code = helper.replace(/^\s*#.*$/gm, '');
  assert(!/SetWindowPos|ShowWindow|PostMessage|Stop-Process|CopyFromScreen|BitBlt|GetWindowText|SendKeys|desktopCapturer|screen.capture|Set-ExecutionPolicy|Unblock-File/.test(code));
  assert.match(code, /i < 512/);
  assert.match(code, /GetWindowInfo\(window, ref info\)/);
  assert.match(code, /GetClassName\(window, name, name.Capacity\)/);
  assert.match(code, /window z-order observation exceeded its bound/);
  assert.match(code, /finally \{\s+if \(SetThreadDpiAwarenessContext\(previous\) == IntPtr.Zero\)/);
});
check('product operability checks normal Edge, higher controls/overlay and framed client origin', () => {
  const f = functionText('Assert-QaProductPlacement');
  assert.match(f, /\$entry.control_before.owner -ne \$script:app.Id/);
  assert.match(f, /-not \$entry.control.above_edge/);
  assert.match(f, /-not \$entry.overlay.above_edge/);
  assert.match(f, /ClientBounds\(\$control\)/);
  assert.match(f, /\$entry.point_window.handle -ne \$control.ToInt64\(\).ToString\(\)/);
  assert.match(f, /\$entry.control_client -join ','/);
  assert(!f.includes('screenX+') && !f.includes('screenY+'));
});

// Execute the actual embedded DOM-center predicate, not a parallel implementation.
const controlExpression = helper.match(/\$box = \(Eval 'control' "([^\n]+)"\)/)[1];
function control(overrides = {}) {
  const e = { getBoundingClientRect: () => ({x:30,y:600,width:100,height:36}), contains: () => false, ...overrides };
  const context = { innerWidth:440, innerHeight:682, devicePixelRatio:2,
    document: {querySelector: () => e, elementFromPoint: () => e} };
  if (overrides.covered) context.document.elementFromPoint = () => ({});
  return JSON.parse(vm.runInNewContext(controlExpression, context, {timeout:100}));
}
check('actual display-option predicate uses client CSS center and identifies DOM cover/zero size', () => {
  assert.deepEqual(control(), {x:80,y:618,width:100,height:36,viewport:[440,682],dpr:2,shown:true});
  assert.equal(control({covered:true}).shown, false);
  assert.equal(control({getBoundingClientRect: () => ({x:0,y:0,width:0,height:0})}).shown, false);
});
check('new candidate cannot inherit historical wrapper admission', () => {
  const wrapper = readFileSync(join(here, 'qa_visible_drag.mjs'), 'utf8');
  const auth = wrapper.indexOf('candidate.execution_authorized !== true');
  assert(auth >= 0 && auth < wrapper.indexOf("execFileSync('python3'"));
  assert(wrapper.includes("candidate.files['runner.ps1'] !== '0f6d0b28b7a7bf92adf437dc4d679ea3e53daea73e56c450a5cf34bd7b1f10ec'"));
  assert.notEqual(sha(changed.runner), old.files['runner.ps1']);
  const preparer = readFileSync(join(here, 'qa_prepare_visible.mjs'), 'utf8');
  assert(preparer.includes('execution_authorized: false'));
  assert(preparer.includes("manifest.kind = 'qa-visible-edge-placement-offline-candidate/v1'"));
  assert(!preparer.includes('node:child_process'));
});
console.log(JSON.stringify({kind:'offline-owned-edge-placement-checks',passed:cases.length,failed:0,cases,
  native_executed:false,product_launched:false,provider_requests:0,
  limitation:'Assembly/source mutation checks plus the actual display-option browser predicate on synthetic Node VM geometry. No PowerShell/C# parser, compilation, Win32, z-order, browser, placement or device verification.'}, null, 2));
