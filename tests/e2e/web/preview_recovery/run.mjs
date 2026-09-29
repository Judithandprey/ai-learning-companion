// QA P0-07 focused acceptance: the document preview's recovery and unsaved-work boundary after a
// controlled transport loss, in real Edge against the real preview API and PostgreSQL.
//
// The real API (exact source copy, `python -m services.api.preview_local`) listens on loopback
// 8175. A transparent relay on 8174, the only API address the page and its CSP allow, forwards every
// request unchanged. The harness arms and disarms labeled conditions explicitly (a browser may resend
// a request on a new connection, so a condition stays armed until disarmed):
//   drop_after_commit: forward the save, wait for the API's full answer, then cut the connection
//                      without answering (the commit happened; the browser gets no response);
//   drop_before_forward: cut the connection before the save reaches the API (never committed);
//   block_reads: cut GET /preview/v1/saves/* reads before they reach the API (API unreachable).
// The relay never creates or edits an answer. Desktop Edge headless only; no Safari, iPad or AI.
//
// Usage: QA_SOURCE=<exact source copy with built dist> node run.mjs <evidence dir>

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest, createServer } from 'node:http';
import { connect as connectSocket } from 'node:net';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const SOURCE = process.env.QA_SOURCE;
const OUT = process.argv[2];
const HERE = new URL('.', import.meta.url).pathname;
const { E, clickAt, drag, runCdp, shot, sleep, typeText } = await import(join(SOURCE, 'apps/safari-extension/scripts/cdp-harness.mjs'));
const MODULE = join(SOURCE, 'apps/safari-extension');
const PYTHON = join(SOURCE, '.venv/bin/python');
const EDGE = '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DSN = readFileSync('/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn', 'utf8').trim();
const UI_PORT = 4173, RELAY_PORT = 8174, API_PORT = 8175;
mkdirSync(OUT, { recursive: true });

const hex = randomBytes(4).toString('hex');
const run = `qa-preview-recovery-${hex}`;
const identity = { user_id: `qachk-${hex}-user`, device_id: `qachk-${hex}-device`, session_id: `qachk-${hex}-session` };
const token = randomBytes(32).toString('base64url');
const control = randomBytes(24).toString('hex');
const secrets = [DSN, token, control];
const redact = (text) => secrets.reduce((s, secret) => s.split(secret).join('[redacted]'), String(text));
const log = [];
const note = (line) => { const safe = redact(line); log.push(safe); console.log(safe); };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const db = (...args) => JSON.parse(execFileSync(PYTHON, [join(HERE, 'db_ops.py'), ...args], { encoding: 'utf8', env: { ...process.env, QA_SOURCE: SOURCE, PYTHONDONTWRITEBYTECODE: '1' } }));
const busy = (port) => new Promise((ok) => { const s = connectSocket({ host: '127.0.0.1', port }, () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); });

// ---- a fresh, QA-authored, non-fixture UTF-8 document (and a second one for the replacement guard)
// The three phrases are far apart, so the card shown beside one selection never covers the next.
const filler = (n) => 'Filler that is not part of any selection, 保留原文。\r\n'.repeat(n);
const doc = '\uFEFFQA recovery document — 线性代数 review\r\n\r\n'
  + 'First claim: the eigenvalue check uses det(A − λI) = 0. Café, λ² and 🙂 stay as written.\r\n\r\n'
  + filler(40) + '\r\nSecond claim: the null space argument needs a nonzero vector.\n\n'
  + filler(40) + '\r\nThird claim: the rank condition is rank(A) < n.\tTabs and <b>markup</b> stay literal.\r\n\r\n'
  + filler(20) + 'Final line keeps trailing spaces   ';
const other = 'A different file that must not replace unsaved work.\n';
const docPath = `/tmp/${run}-original.txt`, otherPath = `/tmp/${run}-other.txt`;
writeFileSync(docPath, doc);
writeFileSync(otherPath, other);
const win = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
const expected = { sha256: sha(Buffer.from(doc)), bytes: Buffer.byteLength(doc) };
const texts = {
  x: { phrase: 'eigenvalue check', request: 'Is my determinant step right? 只检查这一步。', note: 'My attempt: λ = 2 or λ = 3.\nKeep my words exactly. 🙂  ' },
  y: { phrase: 'null space argument', request: 'Only a hint, please; let me try first.', note: 'Idea: pick v with Av = 0.\n我自己的想法' },
  z: { phrase: 'rank condition', request: 'This save is cut before the API receives it.', note: 'Should never be committed.' },
};

// Phrase selected (and refused) while X is unknown. Default: a phrase not selected again later.
// QA_REFUSED=y reproduces QA-P07-01: the phrase refused earlier is the one selected next.
const REFUSED_PHRASE = process.env.QA_REFUSED === 'y' ? texts.y.phrase : texts.z.phrase;

// ---- relay with one-shot / armed injected conditions --------------------------------------------
const relayLog = [];
const rules = new Set(); // 'drop_after_commit' | 'drop_before_forward' | 'block_reads'
const relay = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const isSave = req.method === 'POST' && req.url === '/preview/v1/saves';
    const isRead = req.method === 'GET' && req.url.startsWith('/preview/v1/saves/');
    const entry = { at: new Date().toISOString(), method: req.method, path: req.url, condition: null, upstream_status: null };
    relayLog.push(entry);
    if ((rules.has('drop_before_forward') && isSave) || (rules.has('block_reads') && isRead)) {
      entry.condition = isRead ? 'INJECTED block_reads: cut before forwarding' : 'INJECTED drop_before_forward: save never reached the API';
      req.socket.destroy();
      return;
    }
    const dropAfter = rules.has('drop_after_commit') && isSave;
    const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
    const upstream = httpRequest({ host: '127.0.0.1', port: API_PORT, method: req.method, path: req.url, headers }, (up) => {
      const parts = [];
      up.on('data', (c) => parts.push(c));
      up.on('end', () => {
        entry.upstream_status = up.statusCode;
        if (dropAfter) {
          let receipt = null;
          try { const r = JSON.parse(Buffer.concat(parts).toString('utf8')); receipt = { persistence: r.persistence, note_id: r.note_id, replayed: r.replayed }; } catch { receipt = 'unparsed'; }
          entry.condition = 'INJECTED drop_after_commit: API answered, connection cut without a response';
          entry.upstream_receipt = receipt;
          req.socket.destroy();
          return;
        }
        res.writeHead(up.statusCode, up.headers);
        res.end(Buffer.concat(parts));
      });
    });
    upstream.on('error', (e) => { entry.upstream_error = String(e); req.socket.destroy(); });
    upstream.end(body);
  });
});

// ---- API process (exact source copy) ------------------------------------------------------------
let api = null;
const startApi = async () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', LC_ENABLE_DOCUMENT_PREVIEW: '1',
    LC_DATABASE_URL: DSN, LC_PREVIEW_TOKEN: token, LC_PREVIEW_USER_ID: identity.user_id, LC_PREVIEW_DEVICE_ID: identity.device_id,
    LC_PREVIEW_SESSION_ID: identity.session_id, LC_PREVIEW_UI_ORIGIN: `http://127.0.0.1:${UI_PORT}` };
  api = spawn(PYTHON, ['-m', 'services.api.preview_local', '--port', String(API_PORT)], { cwd: SOURCE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [api.stdout, api.stderr]) { s.setEncoding('utf8'); s.on('data', (d) => d.split(/\r?\n/).filter((l) => l.trim()).forEach((l) => note(`api: ${l}`))); }
  api.on('exit', (code, signal) => note(`api exited (${code ?? signal})`));
  for (const until = Date.now() + 30000; Date.now() < until;) {
    try { if ((await fetch(`http://127.0.0.1:${API_PORT}/preview/v1/session`, { headers: { Authorization: `Bearer ${token}` } })).status === 200) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('API did not become ready');
};
const stopApi = async () => {
  if (!api || api.exitCode !== null) return;
  const gone = new Promise((ok) => api.once('exit', ok));
  api.kill('SIGINT');
  const t = setTimeout(() => api.kill('SIGKILL'), 10000);
  await gone;
  clearTimeout(t);
};

// ---- browser steps ------------------------------------------------------------------------------
const p = 'window.__lcPreview';
const state = (as) => E(`(async()=>{const s=${p}.state();const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.renderedText));return {...s,renderedText:undefined,renderedSha:Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('')};})()`, as);
const wait = (condition, as) => E(`(async()=>{const until=Date.now()+30000;while(Date.now()<until){const s=${p}.state();if(${condition})return true;await new Promise(r=>setTimeout(r,100));}return false;})()`, as);
const centerOf = (selectorExpr) => `(()=>{const e=${selectorExpr};if(!e)throw new Error('missing element');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`;
const click = (selector, as) => [E(centerOf(`document.querySelector(${JSON.stringify(selector)})`), as), ...clickAt(as)];
const ctl = (action, as) => E(`fetch('/__control/${action}?token=${control}',{method:'POST'}).then(r=>r.status)`, as);
const connect = (as) => [...click('#api-token', `${as}Field`), ...typeText(token), ...click('#connect', `${as}Button`), wait("s.api.status === 'connected'", `${as}Settled`)];
const select = (phrase, as) => [
  E(`(()=>{const w=document.createTreeWalker(document.getElementById('document'),NodeFilter.SHOW_TEXT);for(let t=w.nextNode();t;t=w.nextNode()){const i=t.textContent.indexOf(${JSON.stringify(phrase)});if(i<0)continue;const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+${phrase.length});t.parentElement.scrollIntoView({block:'center'});const q=r.getBoundingClientRect();const a={};for(let k=0;k<=6;k++){a['x'+k]=q.left+1+(q.width-2)*k/6;a['y'+k]=q.top+q.height/2;}return a;}throw new Error('phrase absent');})()`, as),
  ...drag(as, 6, 'mouse'), sleep(600),
];
// ASK ends after one selection, and pressing ASK while asking cancels it. An explicit NAV press
// always settles to NAV, so each selection presses NAV and then ASK (trusted clicks).
const toolbar = (mode) => [E(`(()=>{const r=${p}.probe.toolbarRects().${mode};return{x:r.x+r.width/2,y:r.y+r.height/2};})()`, `tool${mode}`), ...clickAt(`tool${mode}`)];
const askFor = (label) => [...toolbar('NAV'), ...toolbar('ASK'), E(`({mode:${p}.session.state.mode,card:${p}.probe.cardSnapshot()})`, `beforeSelect${label}`)];
const typeInto = (selector, text, as) => [...click(selector, as), ...typeText(text)];
const beforeUnloadPrevented = (as) => E(`(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()`, as);
const url = `http://127.0.0.1:${UI_PORT}/preview/`;
const listButton = (key) => `document.querySelector('ul.saved button[data-item="'+sessionStorage.getItem(${JSON.stringify(key)})+'"]')`;

const steps = [
  { cdp: 'Page.navigate', params: { url } }, sleep(1200),
  { files: [win(docPath)], selector: '#open-file' }, sleep(700),
  ...connect('connect1'), wait("s.sourceState === 'registered'", 'registered'), state('connected'),
  // X: a real commit whose answer is lost -> unknown; then the unsaved-work guards; then Retry.
  ...askFor('X'), ...select(texts.x.phrase, 'selX'), state('askedX'),
  ...typeInto('#request-text', texts.x.request, 'reqX'), ...typeInto('#note', texts.x.note, 'noteX'),
  ctl('arm-drop-after-commit', 'armX'), ...click('#save', 'saveX'), wait("s.attempt && s.attempt.status === 'unknown'", 'unknownXSettled'),
  E(`(()=>{sessionStorage.setItem('qa-x',${p}.state().attempt.item_id);return ${p}.attemptPayload();})()`, 'payloadX'),
  state('unknownX'), shot(`${run}-1-unknown-after-commit`), ctl('disarm-saves', 'disarmX'), ctl('db-after-unknown-x', 'dbUnknownX'),
  beforeUnloadPrevented('guardUnloadX'),
  { files: [win(otherPath)], selector: '#open-file' }, sleep(700), state('guardOpenX'),
  ...askFor('WhileUnknown'), ...select(REFUSED_PHRASE, 'selWhileUnknown'), state('guardSelectX'),
  ...click('#retry-save', 'retryX'), wait("s.attempt && s.attempt.status === 'committed'", 'retryXSettled'),
  state('retriedX'), shot(`${run}-2-retry-confirmed`), ctl('db-after-retry-x', 'dbRetryX'),
  // Typed but not yet saved: replacement stays guarded.
  ...askFor('Y'), ...select(texts.y.phrase, 'selY'), state('selectedY'), E(`${p}.events.slice(-6)`, 'eventsAfterY'), shot(`${run}-diag-after-select-y`), ...typeInto('#request-text', texts.y.request, 'reqY'), state('typedY'),
  beforeUnloadPrevented('guardUnloadTyped'),
  { files: [win(otherPath)], selector: '#open-file' }, sleep(700), state('guardOpenTyped'),
  // Y: a real commit whose answer is lost; the user discards the unsaved view while reads are
  // also cut, so its id can only be recovered later from the page's pending index.
  ...typeInto('#note', texts.y.note, 'noteY'),
  ctl('arm-drop-after-commit', 'armY'), ...click('#save', 'saveY'), wait("s.attempt && s.attempt.status === 'unknown'", 'unknownYSettled'),
  E(`(()=>{sessionStorage.setItem('qa-y',${p}.state().attempt.item_id);return ${p}.attemptPayload();})()`, 'payloadY'),
  state('unknownY'), ctl('disarm-saves', 'disarmY'), ctl('db-after-unknown-y', 'dbUnknownY'),
  ctl('arm-block-reads', 'armBlockY'), ...click('#discard', 'discardY'), sleep(1500), state('discardedY'), shot(`${run}-3-discarded-pending`),
  // Z: cut before the API receives it (never committed), then discarded; reads still cut.
  ...askFor('Z'), ...select(texts.z.phrase, 'selZ'), state('selectedZ'), ...typeInto('#request-text', texts.z.request, 'reqZ'), ...typeInto('#note', texts.z.note, 'noteZ'),
  ctl('arm-drop-before-forward', 'armZ'), ...click('#save', 'saveZ'), wait("s.attempt && s.attempt.status === 'unknown'", 'unknownZSettled'),
  E(`(()=>{sessionStorage.setItem('qa-z',${p}.state().attempt.item_id);return ${p}.attemptPayload().item_id;})()`, 'idZ'),
  state('unknownZ'), ctl('disarm-saves', 'disarmZ'), ...click('#discard', 'discardZ'), sleep(1500), state('discardedZ'),
  // Reload (token forgotten), reads restored, reconnect: the pending ids are asked about again.
  ...click('#close-doc', 'closeDoc'), state('closed'), ctl('disarm', 'disarm'),
  { cdp: 'Page.navigate', params: { url } }, sleep(1500), state('reloaded'),
  ...connect('connect2'), wait("s.savedItems.length === 3 && /2 saved item\\(s\\), 1 not confirmed/.test(s.savedStatus)", 'listResolved'),
  state('reconnected'), shot(`${run}-4-reconnected-list`),
  E(centerOf(listButton('qa-y')), 'reopenY'), ...clickAt('reopenY'), wait('s.document && s.document.reopened', 'reopenYDone'),
  state('reopenedY'), shot(`${run}-5-reopened-recovered`),
  ...click('#close-doc', 'closeReopened'),
  E(centerOf(listButton('qa-z')), 'reopenZ'), ...clickAt('reopenZ'), sleep(1500), state('reopenZ'),
  ctl('db-final', 'dbFinal'),
];

// ---- run ----------------------------------------------------------------------------------------
const evidence = { run, baseline: '9eb6bd53cd95f2da7ea9db34a82d45043a1ef415', identity, document: expected, db_snapshots: {} };
let exitCode = 0;
try {
  for (const port of [UI_PORT, RELAY_PORT, API_PORT]) assert.equal(await busy(port), false, `port ${port} occupied; not touching another process`);
  evidence.database = db('verify');
  await new Promise((ok) => relay.listen(RELAY_PORT, '127.0.0.1', ok));
  await startApi();
  const onControl = async (action) => {
    if (action === 'arm-drop-after-commit') rules.add('drop_after_commit');
    else if (action === 'arm-drop-before-forward') rules.add('drop_before_forward');
    else if (action === 'arm-block-reads') rules.add('block_reads');
    else if (action === 'disarm-saves') { rules.delete('drop_after_commit'); rules.delete('drop_before_forward'); }
    else if (action === 'disarm') rules.clear();
    else if (action.startsWith('db-')) evidence.db_snapshots[action] = { inventory: db('inventory', identity.user_id), keys: db('keys', identity.user_id) };
    else throw new Error(`unknown control ${action}`);
    relayLog.push({ at: new Date().toISOString(), control: action });
  };
  const result = await runCdp({ moduleDir: MODULE, browser: EDGE, run, outDir: OUT, steps, note, server: { controlToken: control, control: onControl } });
  evidence.browser = { errors: result.errors, screenshots: result.screenshots };
  const v = result.values;
  evidence.values = v;
  assert.deepEqual(result.errors, [], 'browser runner errors');
  const idX = v.payloadX.item_id, idY = v.payloadY.item_id, idZ = v.idZ;
  evidence.ids = { x: idX, y: idY, z: idZ };
  // Direct readback bypasses the relay (fresh Python client to the API port).
  evidence.readback = {};
  for (const [k, id] of Object.entries(evidence.ids)) {
    const r = JSON.parse(execFileSync(PYTHON, [join(HERE, 'db_ops.py'), 'readback', id, String(API_PORT)], { input: token, encoding: 'utf8', env: { ...process.env, QA_SOURCE: SOURCE, PYTHONDONTWRITEBYTECODE: '1' } }));
    evidence.readback[k] = { status: r.status, code: r.body?.code ?? null, body: r.status === 200 ? r.body : null };
  }
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.error = String(error?.stack ?? error);
  note(`FAIL: ${error}`);
  exitCode = 1;
} finally {
  try { await stopApi(); } catch (e) { evidence.api_stop_error = String(e); exitCode = 1; }
  await new Promise((ok) => relay.close(ok));
  evidence.relay_log = relayLog;
  try { evidence.cleanup = db('cleanup', identity.user_id); } catch (e) { evidence.cleanup_error = String(e); exitCode = 1; }
  evidence.ports_released = !(await busy(UI_PORT)) && !(await busy(RELAY_PORT)) && !(await busy(API_PORT));
  if (!evidence.ports_released) exitCode = 1;
  writeFileSync(join(OUT, 'result.json'), redact(JSON.stringify(evidence, null, 2)) + '\n');
  writeFileSync(join(OUT, 'run.log'), log.join('\n') + '\n');
  note(`done: passed=${evidence.passed} cleanup=${JSON.stringify(evidence.cleanup)} ports_released=${evidence.ports_released}`);
  process.exit(exitCode);
}
