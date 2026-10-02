// P0-13: exact staged main/preloads/renderers, real Electron IPC and local files.
// Display, provider and OS geometry are synthetic. No account, audio or desktop.
// Run only through qa_live_rehearsal.py; it verifies the package and isolates data.
const electron = require('electron');
const { app, ipcMain, session, protocol } = electron;
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const [stage, out, slice = 'all'] = process.argv.slice(2);
if (!['all', 'lifecycle', 'controls'].includes(slice)) throw new Error('Unknown bounded slice');
if (!stage || !out || path.basename(stage) !== 'lc-windows-live-1755153' || !path.basename(out).startsWith('lc-qa-live-offscreen-')) throw new Error('Explicit candidate and new QA output folder required');
const report = {
  kind: 'exact staged Electron entrypoint; synthetic display/provider; NOT device/model acceptance',
  slice,
  evidence_commit: '24c48c38aee660b606ebff5285acbd2ccb300392',
  production_commit: '175515308f509fb8c0f531dbdb10e57313fcde5a',
  started_at: new Date().toISOString(),
  electron: process.versions.electron,
  checks: [], safety: [], errors: [], turns: [], screenshots: [],
  actual_provider_requests: 0, actual_display_capture: false, actual_audio: false,
};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
report.harness_sha256 = sha(fs.readFileSync(__filename));
report.runtime_sha256 = sha(fs.readFileSync(process.execPath));
const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'stage-manifest.json')));
report.stage_tree_sha256 = manifest.tree_sha256;
for (const [name, hash] of Object.entries(manifest.files)) {
  if (sha(fs.readFileSync(path.join(stage, name))) !== hash) throw new Error('Stage differs: ' + name);
}
report.verified_staged_files = Object.keys(manifest.files).length;
if (report.verified_staged_files !== 70 || manifest.tree_sha256 !== '3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154') throw new Error('Wrong manifest');
for (const key of Object.keys(process.env)) if (key.startsWith('LC_') || key.startsWith('QA_SUB_')) delete process.env[key];
for (const name of ['userData', 'sessionData', 'crashDumps', 'temp']) {
  const folder = path.join(out, name); fs.mkdirSync(folder); app.setPath(name, folder);
}
process.env.LC_USER_DATA = app.getPath('userData');
const config = path.join(out, 'synthetic-connector.json');
fs.writeFileSync(config, JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: 'QA-SYNTHETIC', user: 'QA-SYNTHETIC', cd: '/synthetic-only', python: '/synthetic-only' }, state_dir: null, codex_bin: null }));
process.env.LC_SUBSCRIPTION_CONNECTOR = config;
app.disableHardwareAcceleration();
for (const name of ['disable-background-networking', 'disable-component-update', 'disable-sync', 'no-pings', 'disable-default-apps']) app.commandLine.appendSwitch(name);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,Translate,AutofillServerCommunication');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (id, pass, details = {}, stopOnFailure = true) => {
  report.checks.push({ id, status: pass ? 'PASS' : 'FAIL', details });
  if (!pass && stopOnFailure) throw new Error('Check failed: ' + id);
};
const windows = [];
const RealWindow = electron.BrowserWindow;
const trace = (phase, details = {}) => {
  report.phase = phase;
  report.trace ??= []; report.trace.push({ at: new Date().toISOString(), phase, ...details });
  fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
};
process.on('uncaughtException', error => { report.fatal = String(error.stack || error); finish(2); });
process.on('unhandledRejection', error => { report.fatal = String(error.stack || error); finish(2); });
const display = { id: 987654, bounds: { x: 0, y: 0, width: 1000, height: 700 }, workArea: { x: 0, y: 0, width: 1000, height: 700 }, scaleFactor: 1, rotation: 0 };
const fakeSource = { id: 'screen:987654:0', display_id: String(display.id), name: 'QA generated offscreen display', thumbnail: { toDataURL: () => '' } };
let connector, holdAnswers = false, permissionHandler, displayHandler, syntheticGrants = 0;
const generatedMedia = `(${function () {
  const define = (target, key, value) => Object.defineProperty(target, key, { value, configurable: false, writable: false });
  const deny = name => { throw new Error('QA blocked ' + name); };
  define(globalThis, 'fetch', () => Promise.reject(new Error('QA blocked fetch')));
  for (const key of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'AudioContext', 'webkitAudioContext', 'Audio', 'SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesisUtterance']) define(globalThis, key, class { constructor() { deny(key); } });
  define(globalThis, 'speechSynthesis', Object.freeze({ speak: () => deny('speech'), cancel() {}, getVoices: () => [] }));
  define(navigator, 'sendBeacon', () => false);
  let canvas, stream, version = 1, timer;
  const draw = () => {
    const g = canvas.getContext('2d');
    g.fillStyle = version === 1 ? '#ecf4ff' : '#ffefd9'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#193857'; g.font = '24px sans-serif';
    g.fillText('GENERATED OFFSCREEN QA: ' + version, 35, 280);
    g.fillText(version === 1 ? 'MANGO 17' : 'CEDAR 42', 760, 630);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#5f81c7' : '#4c9a85'; g.fillRect(30 + i * 115, 350, 75, 90); }
  };
  const syntheticDisplay = async () => {
    canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700; draw();
    stream = canvas.captureStream(10); const track = stream.getVideoTracks()[0];
    const settings = track.getSettings.bind(track);
    define(track, 'getSettings', () => ({ ...settings(), displaySurface: 'monitor' }));
    timer = setInterval(draw, 100);
    addEventListener('unload', () => { clearInterval(timer); track.stop(); }, { once: true });
    return stream;
  };
  define(navigator, 'mediaDevices', Object.freeze({ getDisplayMedia: syntheticDisplay, getUserMedia: () => Promise.reject(new Error('QA blocked microphone/camera')), enumerateDevices: async () => [] }));
  for (const key of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia']) define(navigator, key, () => deny(key));
  const events = [];
  for (const type of ['pointerdown','pointermove','pointerup','gotpointercapture','lostpointercapture','click']) document.addEventListener(type, e => {
    events.push({ type, target: e.target.id, x: e.clientX, y: e.clientY, buttons: e.buttons, pointerId: e.pointerId, primary: e.isPrimary, trusted: e.isTrusted }); if(events.length > 120) events.shift();
  }, true);
  define(globalThis, '__qaSynthetic', Object.freeze({ safe: true, change: () => { version++; draw(); return version; }, version: () => version, events: () => [...events], clearEvents: () => { events.length = 0; } }));
}.toString()})();`;
// Electron 44's BrowserWindow export is immutable. Both exact production
// constructors already request show:false: intercept visibility on its native
// prototype, retaining the real constructor/preloads and honestly calling this
// a HIDDEN renderer run (not webPreferences.offscreen=true).
for (const name of ['show', 'showInactive', 'focus', 'restore', 'maximize', 'setFullScreen', 'setAlwaysOnTop']) {
  RealWindow.prototype[name] = function () { report.safety.push({ suppressed_native_method: name, kind: this.kind }); };
}
const nativeLoadURL = RealWindow.prototype.loadURL;
RealWindow.prototype.loadURL = async function (url, options) {
  // Electron 44 does not service CDP commands until a renderer exists. Start a
  // blank hidden page (original preload has only passive bridge registration),
  // then install the main-world media guard before the actual product page.
  trace('hidden blank renderer bootstrap', { kind: this.kind });
  await nativeLoadURL.call(this, 'about:blank');
  this.webContents.debugger.attach('1.3');
  await this.webContents.debugger.sendCommand('Page.enable');
  await this.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await this.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: generatedMedia });
  this.syntheticInjectionInstalled = true;
  trace('synthetic CDP injection installed', { kind: this.kind });
  trace('native loadURL', { kind: this.kind, url });
  const loaded = await nativeLoadURL.call(this, url, options);
  trace('loadURL done', { kind: this.kind, url }); return loaded;
};
app.on('browser-window-created', (_e, win) => {
  windows.push(win);
  const preferences = win.webContents.getLastWebPreferences();
  win.kind = win.getTitle() === 'Learning Companion overlay' ? 'overlay' : 'control';
  win.__qaHidden = true;
  if (win.isVisible()) throw new Error('Candidate constructor created a visible window');
  win.setFocusable(false); win.setSkipTaskbar(true); win.webContents.setAudioMuted(true);
  win.webContents.setBackgroundThrottling(false);
  win.on('show', () => { report.fatal = 'Unexpected native show'; finish(3); });
  win.webContents.on('preload-error', (_e, _p, error) => report.errors.push({ preload: String(error) }));
  win.webContents.on('console-message', (_event, details, message, line, source) => report.errors.push({ renderer_console: typeof details === 'object' ? { level: details.level, message: details.message, line: details.lineNumber, source: details.sourceId } : { level: details, message, line, source } }));
  win.webContents.on('render-process-gone', (_e, details) => report.errors.push({ renderer: details.reason }));
  report.safety.push({ guarded_native_constructor: true, kind: win.kind, offscreen: win.webContents.isOffscreen(), context_isolation: preferences.contextIsolation, sandbox: preferences.sandbox, preference_keys: Object.keys(preferences) });
});
electron.desktopCapturer.getSources = async () => [fakeSource];
// Scheme privileges are required before ready. Verify the production repeat,
// which occurs after the runner installs its ready-only native safety guards.
const schemes = [{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }];
protocol.registerSchemesAsPrivileged(schemes);
protocol.registerSchemesAsPrivileged = value => {
  if (JSON.stringify(value) !== JSON.stringify(schemes)) throw new Error('Unexpected protocol privileges');
};
electron.shell.openExternal = async () => { throw new Error('QA blocks opening browsers/URLs'); };
for (const name of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) electron.dialog[name] = async () => { throw new Error('QA blocks OS dialogs'); };
const evaluate = (win, expression) => Promise.race([
  win.webContents.executeJavaScript(expression).catch(error => { throw new Error('Renderer evaluation failed: ' + expression.slice(0,180) + ': ' + error.message); }),
  delay(7000).then(() => { throw new Error('Bounded renderer evaluation timed out: ' + expression.slice(0,100)); }),
]);
const until = async (fn, label, timeout = 7000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await delay(40); }
  throw new Error('Timed out: ' + label);
};
const domUntil = (win, expression, label = expression) => until(() => evaluate(win, expression), label);
const snap = win => evaluate(win, 'JSON.parse(JSON.stringify(__lcOverlay.state()))');
const rect = (win, selector) => evaluate(win, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,width:r.width,height:r.height,hidden:el.hidden,disabled:el.disabled===true,hit:document.elementFromPoint(x,y)===el,top:document.elementFromPoint(x,y)?.id};})()`);
const pointer = async (win, type, x, y, pressed = false) => {
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: pressed ? 1 : 0, clickCount: 1 });
};
const click = async (win, selector) => {
  let r = await rect(win, selector);
  // Reach off-viewport controls by actual UI wheel input, retaining the hit-test
  // guard. This never calls a business handler or forces a DOM element click.
  for (let attempt = 0; r && !r.hidden && !r.disabled && !r.hit && attempt < 5; attempt++) {
    const scroll = await evaluate(win, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});let p=el.parentElement;while(p && !(p.scrollHeight>p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY)))p=p.parentElement;const b=p?.getBoundingClientRect();const box=b?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:{left:0,right:innerWidth,top:0,bottom:innerHeight};const r=el.getBoundingClientRect();return {x:(box.left+box.right)/2,y:Math.max(1,Math.min(innerHeight-1,(box.top+box.bottom)/2)),delta:r.y+r.height/2>box.bottom?r.y+r.height/2-box.bottom+80:r.y+r.height/2<box.top?r.y+r.height/2-box.top-80:0};})()`);
    if (!scroll.delta) break;
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', x: scroll.x, y: scroll.y, deltaX: 0, deltaY: scroll.delta });
    await delay(120); r = await rect(win, selector);
  }
  if (!r || r.hidden || r.disabled || !r.hit || r.width <= 0) throw new Error('Not clickable: ' + selector + ' ' + JSON.stringify(r));
  await pointer(win, 'mouseMoved', r.x, r.y); await pointer(win, 'mousePressed', r.x, r.y, true); await pointer(win, 'mouseReleased', r.x, r.y);
  await delay(70);
};
const stroke = async (win, points) => {
  await pointer(win, 'mouseMoved', ...points[0]); await pointer(win, 'mousePressed', ...points[0], true);
  for (const p of points.slice(1)) { await pointer(win, 'mouseMoved', ...p, true); await delay(15); }
  await pointer(win, 'mouseReleased', ...points.at(-1)); await delay(150);
};
const drag = async (win, selector, dx, dy) => {
  const r = await rect(win, selector); if (!r.hit) throw new Error('Handle occluded');
  await stroke(win, [[r.x, r.y], [r.x + dx / 2, r.y + dy / 2], [r.x + dx, r.y + dy]]);
};
let finishing = false;
function finish(code) {
  if (finishing) return; finishing = true;
  report.ended_at = new Date().toISOString();
  report.pass = report.checks.filter(c => c.status === 'PASS').length;
  report.fail = report.checks.filter(c => c.status === 'FAIL').length;
  report.fake_connector_exit_seen = connector?.exited ?? null;
  report.window_visibility_at_end = windows.filter(w => !w.isDestroyed()).map(w => ({ kind: w.kind, visible: w.isVisible() }));
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, fail: report.fail, fatal: report.fatal ?? null, turns: report.turns.length }));
  for (const win of windows) if (!win.isDestroyed()) win.destroy();
  app.exit(code);
}
const watchdog = setTimeout(() => { report.fatal = '90-second bounded rehearsal watchdog'; finish(2); }, 90000);
async function run() {
  await app.whenReady();
  electron.screen.getAllDisplays = () => [display];
  electron.screen.getPrimaryDisplay = () => display;
  electron.screen.getDisplayMatching = () => display;
  const ses = session.defaultSession;
  // The native handlers always deny. Product handlers are kept for synthetic
  // state transitions only; no source object is ever passed to a native grant.
  ses.setPermissionCheckHandler(() => false);
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.setDisplayMediaRequestHandler((_r, cb) => { report.safety.push({ denied_native_display_request: true }); cb({}); });
  ses.setPermissionRequestHandler = fn => { permissionHandler = fn; };
  ses.setPermissionCheckHandler = () => undefined;
  ses.setDisplayMediaRequestHandler = fn => { displayHandler = fn; };
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const allowed = ['app:', 'file:', 'data:', 'blob:'].some(s => details.url.startsWith(s));
    if (!allowed) report.safety.push({ blocked_network_scheme: details.url.split(':')[0] });
    cb({ cancel: !allowed });
  });
  const realHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (name, handler) => realHandle(name, name !== 'lc:arm-capture' ? handler : async (...args) => {
    const armed = await handler(...args);
    if (armed) {
      const event = args[0]; let granted = false;
      permissionHandler(event.sender, 'media', value => { granted = value; }, { isMainFrame: true, mediaTypes: [] });
      if (!granted) throw new Error('Synthetic permission transition refused');
      await displayHandler({ frame: event.sender.mainFrame, videoRequested: true, audioRequested: false }, answer => {
        if (answer.video?.id !== fakeSource.id) throw new Error('Wrong synthetic source');
        syntheticGrants++;
      });
    }
    return armed;
  });
  const originalProtocolHandle = protocol.handle.bind(protocol);
  protocol.handle = (scheme, handler) => {
    if (scheme !== 'app') throw new Error('Unexpected production protocol');
    originalProtocolHandle(scheme, async request => {
      const url = new URL(request.url);
      const file = path.resolve(stage, 'dist', decodeURIComponent(url.pathname).slice(1));
      if (url.host !== 'bundle' || !file.startsWith(path.join(stage, 'dist') + path.sep)) return new Response('Blocked', { status: 403 });
      if (file.endsWith('.js')) {
        // executeJavaScript waits for page load, so evaluating the safety probe
        // while serving that page's script deadlocks. CDP confirms installation
        // BEFORE loadURL; verify that receipt here and probe the loaded page below.
        if (!windows.length || windows.some(w => !w.isDestroyed() && !w.syntheticInjectionInstalled)) throw new Error('Synthetic injection not installed before scripts');
      }
      return handler(request);
    });
  };
  const { FakeConnector } = await import(pathToFileURL(path.join(stage, 'dist/apps/windows/tests/subscription-fakes.js')));
  const launches = [];
  childProcess.spawn = (command, args) => {
    if (command !== 'wsl.exe' || !args.includes('/synthetic-only')) throw new Error('QA blocks unexpected OS child');
    launches.push({ command, synthetic: true });
    connector = new FakeConnector();
    connector.account = { ...connector.account, auth: { state: 'signed_in', mode: 'chatgpt', plan: 'QA SYNTHETIC; NO ACCOUNT' } };
    connector.onCall = call => {
      if (call.method !== 'companion/turn') return;
      const t = call.params;
      report.turns.push({ ordinal: report.turns.length + 1, request_id: t.request_id, session_id: t.session_id, trigger: t.trigger, user_text: t.user_text, allowed_assistance: t.allowed_assistance, context: t.context, focus: t.focus, history: t.history, image: { sha256: t.image.sha256, width: t.image.width, height: t.image.height }, synthetic: true });
      if (!holdAnswers) setTimeout(() => connector.answer('SYNTHETIC QA hint: inspect the selected relationship; no model or audio was used.', undefined, call), 25);
    };
    return connector;
  };
  syncBuiltinESMExports();
  await import(pathToFileURL(path.join(stage, 'dist/apps/windows/src/main/main.js')));
  trace('production main imported');
  await until(() => windows.some(w => w.kind === 'control'), 'production control window');
  const control = windows.find(w => w.kind === 'control');
  trace('production control created');
  await domUntil(control, '!!globalThis.lc && !!document.getElementById("subCheck")');
  check('production-entrypoint-preload-hidden', control.__qaHidden && !control.isVisible() && await evaluate(control, '!!__qaSynthetic.safe && !!lc.subState'));
  await click(control, '#subCheck');
  await until(async () => (await evaluate(control, 'lc.subState()')).state === 'signed_in', 'synthetic connection read');
  await domUntil(control, '!!document.querySelector("#displays [aria-selected=true]") && !document.getElementById("aiOn").disabled');
  await evaluate(control, `document.getElementById('aiOn').checked=true;document.getElementById('aiRequests').value='12';document.getElementById('aiMinutes').value='1';document.getElementById('aiInterval').value='1';`);
  await click(control, '#start');
  await until(() => windows.some(w => w.kind === 'overlay'), 'production overlay');
  const overlay = windows.find(w => w.kind === 'overlay');
  await domUntil(overlay, '!!globalThis.__lcOverlay && __lcOverlay.state().frame !== null');
  await until(() => connector.looks().length === 1, 'fresh first observation');
  const sessionId = connector.looks()[0].params.session_id;
  check('start-fresh-whole-frame-no-card', (await snap(overlay)).card === null && report.turns[0].trigger === 'observation' && report.turns[0].image.width === 1000 && report.turns[0].image.height === 700 && syntheticGrants === 1, report.turns[0]);
  const firstHash = report.turns[0].image.sha256;
  await evaluate(overlay, '__qaSynthetic.change()');
  await until(() => connector.looks().length >= 2, 'changed whole-frame observation');
  check('changed-frame-new-hash-same-session', connector.looks()[1].params.image.sha256 !== firstHash && connector.looks()[1].params.session_id === sessionId);
  await click(overlay, '[data-mode="WRITE"]'); await click(overlay, '#mouse');
  await stroke(overlay, [[180, 300], [210, 325], [240, 300], [270, 335]]);
  await until(async () => (await snap(overlay)).doc.visible.length > 0, 'saved synthetic ink');
  const inkBefore = (await snap(overlay)).doc;
  const inkFile = id => path.join(app.getPath('userData'), 'ink', id + '.json');
  await until(() => fs.existsSync(inkFile(inkBefore.id)) && JSON.parse(fs.readFileSync(inkFile(inkBefore.id))).ink.revision === inkBefore.revision, 'original stroke persisted');
  const originalStrokes = JSON.parse(fs.readFileSync(inkFile(inkBefore.id))).ink.strokes;
  await click(overlay, '#undo');
  const undone = (await snap(overlay)).doc;
  check('undo-removes-visible-stroke-keeps-original', undone.visible.length === inkBefore.visible.length - 1 && JSON.stringify(undone.strokes) === JSON.stringify(inkBefore.strokes));
  await click(overlay, '#redo');
  check('redo-restores-visible-original', JSON.stringify((await snap(overlay)).doc.visible) === JSON.stringify(inkBefore.visible) && JSON.stringify((await snap(overlay)).doc.strokes) === JSON.stringify(inkBefore.strokes));
  // The ink edit can schedule another unattended observation. Count focus turns,
  // rather than treating that legitimate observation as a second typed Ask.
  await delay(1200);
  const asksBeforeCircle = connector.asks().length;
  await click(overlay, '[data-mode="ASK"]');
  await stroke(overlay, [[310, 345], [410, 345], [410, 450], [310, 450], [310, 345]]);
  await domUntil(overlay, '!document.getElementById("answerBox").hidden');
  const focus = connector.asks().at(-1).params;
  check('circle-auto-hint-no-typed-ask', focus.trigger === 'focus' && focus.user_text === null && focus.allowed_assistance === 'hint' && focus.focus !== null && connector.asks().length === asksBeforeCircle + 1 && (await snap(overlay)).mode === 'WRITE', { trigger: focus.trigger, allowed_assistance: focus.allowed_assistance, user_text: focus.user_text, focus: focus.focus });
  check('ink-and-full-frame-in-context', focus.image.width === 1000 && focus.image.height === 700 && focus.context.ink_revision > 0 && focus.context.ink_sha256 !== null, focus.context);
  const follow = async text => {
    await evaluate(overlay, `document.getElementById('question').value=${JSON.stringify(text)}`);
    const before = connector.asks().length;
    await click(overlay, '#askSubmit');
    await until(() => connector.asks().length === before + 1, 'typed follow-up received');
    await domUntil(overlay, '!document.getElementById("answerBox").hidden && document.getElementById("askCancel").hidden');
    return connector.asks().at(-1).params;
  };
  if (slice === 'all') {
  const same = await follow('SYNTHETIC same-frame follow-up');
  check('same-frame-follow-up-keeps-focus', same.session_id === sessionId && same.focus !== null && same.image.sha256 === focus.image.sha256 && same.history.length > 0, { focus: same.focus, frame_seq: same.context.frame_seq, history_entries: same.history.length });
  await evaluate(overlay, '__qaSynthetic.change()'); await delay(1250);
  const later = await follow('SYNTHETIC later-frame follow-up');
  const historical = later.history.map(row => { try { return JSON.parse(row.text); } catch { return null; } }).find(row => row?.kind === 'historical_focus_reference');
  check('later-frame-follow-up-retains-historical-anchor', later.session_id === sessionId && later.context.frame_seq > same.context.frame_seq && later.focus === null && historical?.context.frame_seq === focus.context.frame_seq && historical.pixels_attached_to_this_request === false && historical.provider_retention === 'unverified', { context: later.context, focus: later.focus, historical });
  }
  if (slice !== 'lifecycle') {
  await evaluate(overlay, '__qaSynthetic.clearEvents()');
  const beforeDrag = await snap(overlay); const turnCount = connector.turns().length;
  const handleBefore = await rect(overlay, '#toolbarHandle');
  // CDP packets in these hidden native windows do not route moves/up to the
  // captured handle (run-13). Stay within its original hit target to exercise
  // movement/persistence without substituting a fake capture implementation.
  report.pointer_capture_boundary = { status: 'BLOCKED', evidence: 'run-13', limitation: 'CDP pointerdown reached handles, subsequent outside-handle moves/up went elsewhere; no gotpointercapture was observed. Physical/native dragging remains unverified.' };
  await drag(overlay, '#toolbarHandle', -8, 6);
  const handleAfter = await rect(overlay, '#toolbarHandle');
  const cardBefore = await rect(overlay, '#cardHandle');
  await drag(overlay, '#cardHandle', -8, -6);
  const cardAfter = await rect(overlay, '#cardHandle'); const afterDrag = await snap(overlay);
  check('drag-does-not-write-or-submit', afterDrag.doc.revision === beforeDrag.doc.revision && connector.turns().length === turnCount, { revisionBefore: beforeDrag.doc.revision, revisionAfter: afterDrag.doc.revision, turnsBefore: turnCount, turnsAfter: connector.turns().length });
  check('within-handle-pointer-drag-moves-controls', (handleAfter.x !== handleBefore.x || handleAfter.y !== handleBefore.y) && (cardAfter.x !== cardBefore.x || cardAfter.y !== cardBefore.y), { handleBefore, handleAfter, cardBefore, cardAfter, pointerEvents: await evaluate(overlay, '__qaSynthetic.events()') }, false);
  display.workArea = { x: 0, y: 0, width: 440, height: 320 };
  electron.screen.emit('display-metrics-changed', {}, display, ['workArea']); await delay(150);
  const targets = {};
  for (const selector of ['#toolbarHandle', '[data-mode="NAV"]', '[data-mode="ASK"]', '[data-mode="WRITE"]', '#cardHandle', '#close']) targets[selector] = await rect(overlay, selector);
  check('synthetic-work-area-control-hit-targets', Object.values(targets).every(r => r.hit && r.x >= 0 && r.y >= 0 && r.x <= 440 && r.y <= 320), targets, false);
  const shot = await overlay.webContents.capturePage(); fs.writeFileSync(path.join(out, 'generated-offscreen-controls.png'), shot.toPNG()); report.screenshots.push({ file: 'generated-offscreen-controls.png', scope: 'hidden owned renderer; offscreen flag disabled; no desktop' });
  report.speech = { status: 'NOT_RUN', production_voice: null, microphone: 'UNCONNECTED', system_audio: 'UNCONNECTED', actual_spoken_caption: 'NOT_RUN', unavailable_controls: await evaluate(overlay, `({talk:document.getElementById('talkControls').hidden,interrupt:document.getElementById('interrupt').hidden})`) };
  // Restore usable synthetic area for the pending typed request and stop controls.
  display.workArea = { ...display.bounds }; electron.screen.emit('display-metrics-changed', {}, display, ['workArea']); await delay(100);
  }
  if (slice === 'controls') {
    await click(control, '#stop');
    await until(async () => !(await evaluate(control, 'lc.sessionState()')).running, 'controls slice Stop');
    report.unverified = ['cancel/restart slice not run here', 'real pointer/device/DPI/capture/provider', 'voice/TTS/captions/audio', 'Mac/Notability'];
    return;
  }
  holdAnswers = true;
  await evaluate(overlay, `document.getElementById('question').value='SYNTHETIC held then cancelled'`); await click(overlay, '#askSubmit');
  try { await until(() => connector.heldAsks().length === 1, 'pending cancellable follow-up'); }
  catch (error) { report.pending_diagnostic = { state: await snap(overlay), session: await evaluate(control, 'lc.sessionState()'), pointerEvents: await evaluate(overlay, '__qaSynthetic.events()'), askStatus: await evaluate(overlay, 'document.getElementById("askStatus").textContent') }; throw error; }
  const cancelled = connector.heldAsks()[0]; await click(overlay, '#askCancel');
  await until(() => connector.heldAsks().length === 0, 'cancel acknowledgement');
  connector.answer('SYNTHETIC LATE CANCELLED ANSWER', undefined, cancelled); await delay(100);
  check('cancel-fences-late-answer', !(await evaluate(overlay, 'document.body.textContent')).includes('LATE CANCELLED ANSWER'));
  await evaluate(overlay, `document.getElementById('question').value='SYNTHETIC held at Stop'`); await click(overlay, '#askSubmit');
  await until(() => connector.heldAsks().length === 1, 'pending Stop turn'); const stopped = connector.heldAsks()[0];
  const keptDoc = (await snap(overlay)).doc;
  await click(control, '#stop');
  await until(async () => !(await evaluate(control, 'lc.sessionState()')).running, 'Stop and saved ink');
  const stoppedCount = connector.turns().length;
  connector.answer('SYNTHETIC LATE STOP ANSWER', undefined, stopped); await delay(1100);
  check('stop-fences-auto-work-and-late-answer', connector.turns().length === stoppedCount && connector.count('companion/stop') > 0);
  const saved = await evaluate(control, 'lc.listInk()');
  const kept = JSON.parse(fs.readFileSync(inkFile(keptDoc.id)));
  const { parseDesktopInk } = await import(pathToFileURL(path.join(stage, 'dist/apps/windows/src/shared/desktop-ink.js')));
  const readback = parseDesktopInk(kept, sha(Buffer.from(keptDoc.id)));
  check('stop-retains-editable-original', saved.unreadable === 0 && saved.sessions.some(s => s.id === keptDoc.id && s.strokes === keptDoc.visible.length && s.revision === keptDoc.revision) && readback.ok && JSON.stringify(kept.ink.strokes) === JSON.stringify(originalStrokes) && JSON.stringify(kept.ink.visible) === JSON.stringify(keptDoc.visible), { saved_sessions: saved.sessions, id: keptDoc.id, readback: { ok: readback.ok, reason: readback.reason } });
  const askDir = path.join(app.getPath('userData'), 'captures', stopped.params.context.capture_session_id, 'asks');
  const askRecords = fs.readdirSync(askDir).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(askDir, name))));
  const retainedAsk = askRecords.find(record => record.requests.some(request => request.request_id === stopped.params.request_id));
  const retainedStop = retainedAsk?.requests.find(request => request.request_id === stopped.params.request_id);
  check('stop-retained-record-excludes-late-duplicate', retainedStop?.outcome?.status === 'cancelled' && retainedStop.outcome.uncertain === false && retainedStop.shown === false && retainedStop.submission === 'submitted' && !JSON.stringify(retainedAsk).includes('LATE STOP ANSWER'), { retainedStop });
  holdAnswers = false; await click(control, '#start');
  await until(() => connector.looks().some(c => c.params.session_id !== sessionId), 'explicit restart gets new live session');
  check('explicit-restart-new-session-fresh-first-look', connector.looks().at(-1).params.session_id !== sessionId);
  const restarted = windows.findLast(w => w.kind === 'overlay' && !w.isDestroyed());
  const reopened = await evaluate(control, `lc.openInk(${JSON.stringify(keptDoc.id)})`);
  const afterOpen = (await snap(restarted)).doc;
  check('restart-reopens-editable-original', reopened.ok && afterOpen.id === keptDoc.id && afterOpen.revision === keptDoc.revision && JSON.stringify(afterOpen.visible) === JSON.stringify(keptDoc.visible) && JSON.stringify(afterOpen.history) === JSON.stringify(keptDoc.history), { reopened, afterOpen });
  await click(control, '#stop'); await until(async () => !(await evaluate(control, 'lc.sessionState()')).running, 'final Stop');
  check('all-windows-remain-hidden', windows.every(w => w.isDestroyed() || !w.isVisible()) && launches.every(l => l.synthetic));
  await connector.stdin.end(); await delay(100);
  report.synthetic_grants = syntheticGrants; report.fake_child_launches = launches;
  report.unverified = ['real display/device/pen/permission/DPI/monitors', 'real provider semantics and private pipe', 'voice/TTS/microphone/system audio and spoken captions', 'Mac', 'Notability import', 'content-anchored ink'];
}
run().catch(error => { report.fatal = String(error.stack || error); }).finally(() => { clearTimeout(watchdog); finish(report.fatal || report.checks.some(check => check.status === 'FAIL') ? 2 : 0); });
