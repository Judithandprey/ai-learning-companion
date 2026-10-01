#!/usr/bin/env node
// The USER's own entry to the managed ChatGPT subscription on the released Windows candidate (WSL2 on a Windows host).
// QA never signs in: this only puts a start file on the Windows side and checks that it leads to the app's own
// "Sign in with ChatGPT" button. Pressing that button and the browser consent are the user's.
//
//   node signin_launcher.mjs prepare <released commit>   a private exact-source copy of the connector (kept, outside /tmp),
//                                                         the trusted configuration and a start file next to the staged app
//   node signin_launcher.mjs check <released commit>     starts the app THROUGH that start file, presses only "Check
//                                                         connection", reads what the app then says, closes the app
//
// Needs the app staged as %TEMP%\<QA_STAGE_NAME> (apps/windows/scripts/windows-stage.mjs). The check never presses Sign
// in, opens no browser, and reads nothing of the connector's product state.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [action, commit] = process.argv.slice(2);
if (!['prepare', 'check'].includes(action) || !/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('usage: signin_launcher.mjs <prepare|check> <released commit, 40 hex>');
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const winTemp = run('cmd.exe', ['/c', 'echo %TEMP%']);
const temp = run('wslpath', ['-u', winTemp]);
const stageName = process.env.QA_STAGE_NAME;
if (!stageName || !/^[A-Za-z0-9._-]+$/.test(stageName) || !existsSync(join(temp, stageName, 'dist', 'apps', 'windows', 'src', 'main', 'main.js'))) throw new Error('set QA_STAGE_NAME to the staged released app');
const ELECTRON = 'lc-electron-44.5.1-win32-x64';
if (!existsSync(join(temp, ELECTRON, 'electron.exe'))) throw new Error('the Electron 44.5.1 runtime is not staged');
const short = commit.slice(0, 12);
const source = join(process.env.HOME, '.local', 'share', 'lc-qa', `subscription-source-${short}`);
const launcherName = `lc-subscription-signin-${short}`;
const launcher = join(temp, launcherName);
const START = 'Start-Learning-Companion-Subscription.cmd';
const PY = '/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python';
const CODEX = '/home/agentsdock/.local/bin/codex';
const FILES = ['services/worker/connectors/chatgpt_local.py', 'services/worker/connectors/chatgpt_rpc.py', 'services/worker/connectors/chatgpt_launch.py', 'services/worker/connectors/chatgpt_receipts.py', 'services/learning/subscription_ask.py'];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The copy's five connector files are the commit's (their hashes are printed).
const sourceFiles = () => Object.fromEntries(FILES.map((f) => {
  const here = sha(readFileSync(join(source, f)));
  if (here !== sha(execFileSync('git', ['-C', HERE, 'show', `${commit}:${f}`], { maxBuffer: 16 * 1024 * 1024 }))) throw new Error(`${f} in the copy is not the file of ${commit}`);
  return [f, here];
}));

if (action === 'prepare') {
  if (!existsSync(join(source, 'services'))) {
    mkdirSync(source, { recursive: true, mode: 0o700 });
    const root = execFileSync('git', ['-C', HERE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const tar = execFileSync('git', ['-C', root, 'archive', commit, 'services'], { maxBuffer: 256 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', source], { input: tar });
  }
  chmodSync(source, 0o700);
  const files = sourceFiles();
  mkdirSync(launcher, { recursive: true });
  // The trusted configuration (ADR 0003): which Python runs which connector copy in WSL, the connector's own product
  // state, and the official codex binary (admitted by the connector only by its pinned sha256). It names no credential.
  const config = JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: 'Ubuntu', user: 'agentsdock', cd: source, python: PY }, state_dir: null, codex_bin: CODEX }, null, 1);
  writeFileSync(join(launcher, 'connector.json'), config);
  const cmd = ['@echo off',
    `rem Learning Companion, released candidate ${commit}, with the managed ChatGPT subscription connection.`,
    'rem 1. Press "Check connection".  2. If it says "Not signed in": press "Sign in with ChatGPT" and finish in your browser.',
    'rem 3. Press "Check connection" again: it should say "Signed in with ChatGPT".  4. Close the window.',
    'rem The app never shows or stores your password; nothing is asked of ChatGPT by signing in.',
    'set "LC_SUBSCRIPTION_CONNECTOR=%~dp0connector.json"',
    'set "LC_USER_DATA=%~dp0profile"',
    'set "LC_DEV_CAPTURE_HOST="',
    `start "" "%TEMP%\\${ELECTRON}\\electron.exe" "%TEMP%\\${stageName}" %*`, ''].join('\r\n');
  writeFileSync(join(launcher, START), cmd);
  console.log(JSON.stringify({ start_file: `%TEMP%\\${launcherName}\\${START}`, configuration_sha256: sha(config), start_file_sha256: sha(cmd), connector_copy: source.replace(process.env.HOME, '~'),
    connector_files_sha256: files, staged_app: `%TEMP%\\${stageName}`, electron: `%TEMP%\\${ELECTRON}\\electron.exe` }, null, 1));
} else {
  if (!existsSync(join(launcher, START)) || !existsSync(join(launcher, 'connector.json'))) throw new Error('prepare first');
  sourceFiles();
  const inside = readdirSync('/proc').filter((n) => /^\d+$/.test(n)).filter((n) => { try { const cwd = readlinkSync(`/proc/${n}/cwd`); return cwd === source || cwd.startsWith(`${source}/`); } catch { return false; } });
  if (inside.length) throw new Error('a connector is running from the copy (the app is open?): close it first');
  // Run on Windows by the staged Electron as plain Node: start the app through the start file (with a DevTools port for
  // this check only), press Check connection, read, close the app's window.
  const script = `
const { spawn } = require('node:child_process');
const path = require('node:path');
const port = 43000 + Math.floor(Math.random() * 2000);
const env = { ...process.env };
for (const k of ['ELECTRON_RUN_AS_NODE', 'LC_SUBSCRIPTION_CONNECTOR', 'LC_USER_DATA', 'LC_DEV_CAPTURE_HOST']) delete env[k];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = async () => { try { return await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); } catch { return null; } };
(async () => {
  const out = { started_at: new Date().toISOString(), start_file: ${JSON.stringify(START)} };
  spawn('cmd.exe', ['/c', path.join(__dirname, ${JSON.stringify(START)}), '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'], { env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  let page = null;
  for (let i = 0; i < 100 && !page; i++) { await sleep(300); page = ((await list()) || []).find((t) => t.type === 'page' && /control\\.html$/.test(t.url)); }
  if (!page) { out.error = 'the app window did not appear'; return console.log(JSON.stringify(out)); }
  out.window = { title: page.title, url: page.url };
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('DevTools socket')); });
  let id = 0; const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const evaluate = (expression) => new Promise((ok) => { const n = ++id; waiting.set(n, ok); ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
  const r = await evaluate(\`(async () => {
    const t = (id, text = true) => { const e = document.getElementById(id); return e ? { ...(text ? { text: e.textContent } : {}), hidden: e.hidden || e.closest('[hidden]') !== null, disabled: e.disabled === true } : null; };
    await new Promise((r) => setTimeout(r, 1500));
    const before = await window.lc.subState();
    document.getElementById('subCheck').click();
    const end = Date.now() + 60000; let s;
    do { await new Promise((r) => setTimeout(r, 300)); s = await window.lc.subState(); } while ((s.state === 'not_checked' || s.state === 'checking') && Date.now() < end);
    await new Promise((r) => setTimeout(r, 500));
    return JSON.stringify({ before: before && { mode: before.mode, state: before.state, login: before.login },
      after: { mode: s.mode, state: s.state, plan: s.plan, login: s.login, detail: s.detail, model: s.model, picture_models: (s.models || []).filter((m) => m.image_input).length },
      section: t('subscription', false), state_text: t('subState'), check_button: t('subCheck'), sign_in_button: t('subLogin'), cancel_sign_in_button: t('subLoginCancel', false) });
  })()\`);
  out.check = r.result && r.result.result && r.result.result.value ? JSON.parse(r.result.result.value) : { error: JSON.stringify(r).slice(0, 400) };
  out.sign_in_pressed = false;
  try { await Promise.race([evaluate('window.close(), true'), sleep(2000)]); } catch { }
  let gone = false;
  for (let i = 0; i < 100 && !gone; i++) { await sleep(300); gone = (await list()) === null; }
  out.app_closed_itself = gone;
  out.ended_at = new Date().toISOString();
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ error: String(e && e.message) })); process.exit(1); });
`;
  const checkFile = join(launcher, 'qa-check.js');
  writeFileSync(checkFile, script);
  const r = spawnSync(join(temp, ELECTRON, 'electron.exe'), [`${winTemp}\\${launcherName}\\qa-check.js`], { cwd: '/mnt/c', encoding: 'utf8', timeout: 150000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WSLENV: 'ELECTRON_RUN_AS_NODE' } });
  rmSync(checkFile, { force: true });
  // The profile the check used is removed: the user's own start gets a fresh one.
  rmSync(join(launcher, 'profile'), { recursive: true, force: true });
  const line = (r.stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith('{')).at(-1);
  if (!line) throw new Error(`the check wrote no result (status ${r.status}, ${String(r.stderr ?? '').slice(0, 300)})`);
  console.log(JSON.stringify({ commit, ...JSON.parse(line), start_file: `%TEMP%\\${launcherName}\\${START}` }, null, 1));
}
