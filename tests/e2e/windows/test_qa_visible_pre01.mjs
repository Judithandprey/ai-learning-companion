// Focused offline controls. Native calls and the product are never executed.
// The native-operation harness below is an ordering model, not Win32 validation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = { appPort:43123, edgePort:45123, edgeArgs:['--user-data-dir=C:\\qa', '--start-fullscreen', '--app=file:///C:/qa/surface.html'], surfaceUrl:'file:///C:/qa/surface.html', profile:'C:\\qa' };
const { runner, steps } = buildVisibleCandidate(config);
const helper = readFileSync(join(here, 'qa_display_admission.ps1'), 'utf8');
const passed = [];
function check(name, body) { body(); passed.push(name); }

function assertOrdering(source, plan) {
  assert.match(source, /\$i = 0\ntry \{\n  Initialize-QaDisplayAdmission\s+foreach \(\$step in \$steps\)/);
  assert.match(source, /try \{ Assert-QaSurfaceAdmission 'before_product_launch'; \$script:app = Start-Process/);
  assert.match(source, /Start-Sleep -Milliseconds 1500\s+Start-App/);
  assert.match(source, /Assert-QaDisplayUnchanged 'before_browser_launch'\s+\$p = Start-Process -FilePath \$Edge/);
  assert.doesNotMatch(source, /\nStart-App 'app'\n/);
  const start = source.indexOf("$entry.kind = 'captureStart'");
  const end = source.indexOf('elseif ($null -ne $step.waitEval)', start);
  const action = source.slice(start, end);
  assert(start > 0 && end > start);
  assert(action.indexOf("Get-Socket 'control'") < action.indexOf("Assert-QaSurfaceAdmission 'before_capture_start'"));
  assert(action.indexOf("Assert-QaSurfaceAdmission 'before_capture_start'") < action.indexOf("Invoke-Cdp $captureSocket 'Runtime.evaluate'"));
  assert.doesNotMatch(action.slice(action.indexOf("Assert-QaSurfaceAdmission 'before_capture_start'") + 1), /Get-Socket/);
  assert.equal(plan.filter(s => s.launchApp).length, 1);
  assert.equal(plan.filter(s => s.captureStart).length, 1);
  assert(!plan.some(s => s.eval?.includes('lc.listDisplays')));
  assert(!plan.some(s => s.eval?.includes("getElementById('start').click")));
  assert(plan.findIndex(s => s.captureStart) > plan.findIndex(s => s.launchApp));
}
check('actual emitted plan and PowerShell launch/capture ordering', () => assertOrdering(runner, steps));
check('removed product guard mutation is detected', () => assert.throws(() => assertOrdering(runner.replace("Assert-QaSurfaceAdmission 'before_product_launch'; ", ''), steps)));
check('removed capture guard mutation is detected', () => assert.throws(() => assertOrdering(runner.replace("Assert-QaSurfaceAdmission 'before_capture_start'", '# guard omitted'), steps)));
check('unguarded thumbnail enumeration mutation is detected', () => assert.throws(() => assertOrdering(runner, [...steps, {target:'control',eval:'lc.listDisplays()'}])));
check('initialization after launch-loop mutation is detected', () => assert.throws(() => assertOrdering(runner.replace('\n  Initialize-QaDisplayAdmission', ''), steps)));
check('actual native source uses fresh non-pixel enumeration and restores thread awareness', () => {
  assert.match(helper, /EnumDisplayMonitors\(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero\)/);
  assert.match(helper, /finally \{ RestoreCoordinates\(previous\); \}/);
  assert.match(helper, /info.Size = \(uint\)Marshal.SizeOf\(typeof\(MonitorInfo\)\)/);
  assert.match(helper, /native.Monitors\)\.Count -ne 1/);
  assert.match(helper, /entry.native_final = Read-QaDisplaySnapshot\s+Assert-QaDisplayBaseline/);
  assert(!/CopyFromScreen|desktopCapturer|getSources|Screen\.AllScreens|BitBlt/.test(helper.replace(/^\s*#.*$/gm, '')), 'native admission must not read pixels');
});

const good = () => ({ monitors:[{device:String.raw`\\.\DISPLAY1`,handle:'101',flags:1,bounds:[0,0,2560,1600],work:[0,0,2560,1504]}], dpi:192 });
function admit(snapshot, baseline) {
  assert(snapshot && Array.isArray(snapshot.monitors) && snapshot.monitors.length === 1, 'unknown or multiple displays');
  const m = snapshot.monitors[0], w = m?.work;
  assert(m && /^\\\\\.\\DISPLAY[1-9][0-9]*$/.test(m.device) && m.handle && m.handle !== '0' && m.flags === 1, 'unknown monitor identity');
  assert.deepEqual(m.bounds, [0,0,2560,1600]); assert.equal(snapshot.dpi, 192);
  assert(Array.isArray(w) && w.length === 4 && w.every(Number.isInteger) && w[0]>=0 && w[1]>=0 && w[2]<=2560 && w[3]<=1600 && w[2]>w[0] && w[3]>w[1], 'unknown work area');
  if (baseline) assert.deepEqual(snapshot, baseline, 'display changed since admission');
  return structuredClone(snapshot);
}
function operations({initial=good(), beforeBrowser=initial, beforeLaunch=initial, beforeCapture=initial, surface=true} = {}) {
  // Interpret only the emitted plan's sensitive operations. Before-launch includes the real launch-step sleep.
  const counts = {browser:0,product:0,thumbnail:0,capture:0}; let rejected = null, baseline;
  try {
    baseline = admit(initial);
    for (const step of steps) {
      if (step.edgeStart) { admit(beforeBrowser, baseline); counts.browser++; }
      if (step.launchApp) { admit(beforeLaunch, baseline); assert(surface); counts.product++; counts.thumbnail++; }
      if (step.captureStart) { admit(beforeCapture, baseline); assert(surface); counts.thumbnail++; counts.capture++; break; }
    }
  } catch (error) { rejected = error.message; }
  return {counts,rejected};
}
function blocked(name, options, expected) {
  check(name, () => { const r=operations(options); assert(r.rejected); assert.deepEqual(r.counts, expected); });
}
const zero = {browser:0,product:0,thumbnail:0,capture:0}, browserOnly = {...zero,browser:1}, launched = {...browserOnly,product:1,thumbnail:1};
const second = good(); second.monitors.push({...second.monitors[0],device:String.raw`\\.\DISPLAY2`,handle:'202',bounds:[2560,0,5120,1600],flags:0});
blocked('owned primary plus private second display rejects before all launches', {initial:second}, zero);
blocked('unknown native snapshot rejects before all launches', {initial:null}, zero);
blocked('incomplete native metadata rejects before all launches', {initial:{monitors:[{}],dpi:192}}, zero);
const noWork=good(); noWork.monitors[0].work=null;
blocked('missing work area rejects before all launches', {initial:noWork}, zero);
blocked('second display appearing before browser launch rejects before all launches', {beforeBrowser:second}, zero);
blocked('second display appearing during launch delay rejects before product startup', {beforeLaunch:second}, browserOnly);
for (const [name, mutate] of [
  ['origin', s=>s.monitors[0].bounds[0]=10], ['extent',s=>s.monitors[0].bounds[2]=2559],
  ['DPI',s=>s.dpi=144], ['identity',s=>s.monitors[0].handle='202'], ['work area',s=>s.monitors[0].work[3]=1503],
]) {
  const changed=good(); mutate(changed);
  blocked(`${name} changed during launch delay blocks product/thumbnails`, {beforeLaunch:changed}, browserOnly);
  blocked(`${name} changed after launch blocks subsequent thumbnails/capture`, {beforeCapture:changed}, launched);
}
blocked('second display after launch blocks subsequent enumeration/capture', {beforeCapture:second}, launched);
blocked('surface ownership loss blocks product startup', {surface:false}, browserOnly);
check('stable single-display path reaches each modeled sensitive operation once', () => assert.deepEqual(operations().counts, {browser:1,product:1,thumbnail:2,capture:1}));

// Execute the actual embedded browser predicate in Node VM with synthetic geometry.
const browserExpr = helper.match(/\$expression = @'\n([\s\S]*?)\n'@/)[1];
function browser(overrides={}) {
  const cards=Array.from({length:12},(_,i)=>({index:i,rect_dip:{x:40+i%4*210,y:90+Math.floor(i/4)*170,width:190,height:150}}));
  const truth={format:'qa-subscription-surface/2',fits:true,full_screen:true,cards,viewport:{width:1280,height:800,dpr:2,screen:[1280,800]}};
  const c={screenX:0,screenY:0,outerWidth:1280,outerHeight:800,innerWidth:1280,innerHeight:800,devicePixelRatio:2,screen:{width:1280,height:800},document:{getElementById:()=>({width:2560,height:1600})},window:{__qaSurfaceTruth:()=>JSON.stringify(truth)},...overrides};
  return {run:()=>vm.runInNewContext(browserExpr,c,{timeout:100}),truth};
}
check('actual browser predicate accepts matching generated synthetic geometry',()=>assert(browser().run()));
for (const [name, overrides] of [['moved origin',{screenX:10}],['outer size',{outerWidth:1279}],['DPR',{devicePixelRatio:1}],['missing generated truth',{window:{}}]]) {
  check(`actual browser predicate rejects ${name} despite cached fullscreen truth`,()=>assert.throws(()=>browser(overrides).run()));
}
check('actual browser predicate rejects changed card geometry',()=>{ const b=browser(); b.truth.cards[0].rect_dip.x++; assert.throws(b.run); });

check('preserved d91 driver demonstrates the original reverse ordering',()=>{
  const old=readFileSync(join(here,'../../../docs/verification/qa/p0-13-live-1755153/nonvoice-pass/visible-01/runner.ps1'),'utf8');
  assert.throws(()=>assertOrdering(old,steps));
  assert.doesNotMatch(old,/Initialize-QaDisplayAdmission/);
  // Its owned-primary Edge checks can pass; product startup reads both thumbnails before the later list-length assertion.
  const oldPlan=JSON.parse(readFileSync(join(here,'../../../docs/verification/qa/p0-13-live-1755153/nonvoice-pass/visible-01/steps.json'),'utf8'));
  const oldCounts={product:0,thumbnail:0,capture:0}; let failedDisplayCheck=false;
  for (const step of oldPlan) {
    if (step.launchApp) { oldCounts.product++; oldCounts.thumbnail += second.monitors.length; }
    if (step.target==='control' && step.waitEval?.includes('#displays')) { failedDisplayCheck=second.monitors.length!==1; break; }
  }
  assert(failedDisplayCheck); assert.deepEqual(oldCounts,{product:1,thumbnail:2,capture:0});
});
console.log(JSON.stringify({kind:'offline-pre01-ordering-controls',passed:passed.length,failed:0,cases:passed,native_executed:false,product_launched:false,provider_requests:0,limitation:'Native-operation counters are a source-bound ordering model. Only the actual browser predicate executes, on synthetic Node VM geometry. No Win32/device/capture verification.'},null,2));
