#!/usr/bin/env node
// The USER's own entry to the managed ChatGPT subscription on the released Windows candidate (WSL2 on a Windows host).
// QA never signs in: this only puts a start file on the Windows side and checks that it leads to the app's own
// "Sign in with ChatGPT" button. Pressing that button and the browser consent are the user's.
//
//   node signin_launcher.mjs prepare <released commit>   a private exact-source copy of the Backend (services/ and packages/; kept, outside /tmp),
//                                                         the trusted configuration and a start file next to the staged app
//   node signin_launcher.mjs check <released commit>     starts the app THROUGH that start file, presses only "Check
//                                                         connection", reads what the app then says, closes the app.
//                                                         It runs a byte-identical copy of the start file in a folder
//                                                         of its own, so the user's entry folder and its profile are
//                                                         never touched; it refuses to run beside an open Electron
//                                                         app; and it lets go only of what it owns (signin_cleanup.mjs).
//                                                         It normally ends within about 4 minutes; give the caller a
//                                                         limit of 10 minutes (the bounded steps add up to about 9):
//                                                         a launcher cut during the release reports nothing.
//                                                         Exit codes: 0 checked and released; 1 the check failed;
//                                                         2 refused before anything was started; 3 not released.
//
// Needs the app staged as %TEMP%\<QA_STAGE_NAME> (apps/windows/scripts/windows-stage.mjs). The check never presses Sign
// in, opens no browser, and reads nothing of the connector's product state.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askPathCheck, compareCopy, makeCopy } from './sub_copy.mjs';
import { releaseOwned } from './signin_cleanup.mjs';

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
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The copy is the commit's `services/` and `packages/`, file for file, and the connector's own preparation of a question
// works in it (offline; see sub_copy.mjs). A copy that only answers Check connection is refused here.
const checkedCopy = () => {
  const same = compareCopy(commit, source);
  if (!same.equal) throw new Error(`the copy is not the commit's services/ and packages/: ${JSON.stringify({ missing: same.missing.slice(0, 5), differing: same.differing.slice(0, 5), extra: same.extra.slice(0, 5) })}`);
  const ask = askPathCheck(PY, source);
  if (!ask.ok) throw new Error(`the connector cannot prepare a question in the copy: ${JSON.stringify(ask)}`);
  return { files_equal_to_the_commit: same.files, ask_path: ask };
};

if (action === 'prepare') {
  if (!existsSync(source)) mkdirSync(source, { recursive: true, mode: 0o700 });
  if (!compareCopy(commit, source).equal) makeCopy(commit, source);
  const copy = checkedCopy();
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
    copy, staged_app: `%TEMP%\\${stageName}`, electron: `%TEMP%\\${ELECTRON}\\electron.exe` }, null, 1));
} else {
  const refuse = (why) => { console.error(`REFUSED, nothing was started: ${why}`); process.exit(2); };
  if (!existsSync(join(launcher, START)) || !existsSync(join(launcher, 'connector.json'))) refuse('prepare first');
  let copy;
  try { copy = checkedCopy(); } catch (error) { refuse(String(error?.message ?? error).slice(0, 400)); }
  const connectorsInCopy = () => readdirSync('/proc').filter((n) => /^\d+$/.test(n)).filter((n) => { try { const cwd = readlinkSync(`/proc/${n}/cwd`); return cwd === source || cwd.startsWith(`${source}/`); } catch { return false; } }).map(Number);
  if (connectorsInCopy().length) refuse('a connector is running from the copy (the product is open?): the check does not run beside it');
  // What this check owns on Windows is known by its own port: the app's main process (started through the start file
  // with --remote-debugging-port=<port>) and the checker (--qa-check-port=<port>). Nothing else is ever ended.
  const port = 43000 + randomInt(2000);
  const ps = (command) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: '/mnt/c', encoding: 'utf8', timeout: 30000 });
  // owned: electron.exe main processes with one of this check's two markers. others: whatever else listens on the port.
  // foreign: every other electron.exe main process (also one whose command line cannot be read). Throws if it cannot look.
  const look = async () => {
    const out = JSON.parse(ps(`$ErrorActionPreference = 'Stop'; `
      + `$main = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { -not $_.CommandLine -or -not $_.CommandLine.Contains('--type=') }); `
      + `$mine = @($main | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('--remote-debugging-port=${port} ') -or $_.CommandLine.Contains('--qa-check-port=${port}')) } | ForEach-Object { [int]$_.ProcessId }); `
      + `$foreign = @($main | ForEach-Object { [int]$_.ProcessId } | Where-Object { $mine -notcontains $_ }); `
      + `$ev = $null; $listen = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue -ErrorVariable ev | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique); `
      + `if (@($ev | Where-Object { $_.CategoryInfo.Category -ne 'ObjectNotFound' }).Count -gt 0) { throw 'the listeners could not be read' }; `
      + `ConvertTo-Json -Compress @{ mine = $mine; listen = $listen; foreign = $foreign }`).trim().split(/\r?\n/).at(-1));
    const pids = (v) => [].concat(v ?? []).map(Number);
    const owned = pids(out.mine), listening = pids(out.listen), foreign = pids(out.foreign);
    if (![...owned, ...listening, ...foreign].every((n) => Number.isInteger(n) && n > 0)) throw new Error('unreadable process list');
    return { owned, others: listening.filter((pid) => !owned.includes(pid)), foreign };
  };
  // By PID only, and without the process tree: a tree is read from recorded parent PIDs, which Windows reuses. The app's
  // own children and its wsl.exe child are expected to end when its main process ends (the force path is not yet shown
  // on a display run; a failure would show as FOLDER LEFT or CONNECTOR STILL RUNNING).
  const taskkill = (pid, force) => { if (!Number.isInteger(pid) || pid <= 0) throw new Error('not a PID'); execFileSync('taskkill.exe', ['/PID', String(pid), ...(force ? ['/F'] : [])], { cwd: '/mnt/c', encoding: 'utf8', timeout: 20000, stdio: 'pipe' }); };
  // Before anything is made or started: the look must work, nothing may hold this port, and no other Electron app may
  // be open (it could be the product with the user signing in: the check does not run beside it and ends nothing).
  let before;
  try { before = await look(); } catch (error) { refuse(`the processes could not be looked at (${String(error?.message ?? error).slice(0, 200)})`); }
  if (before.owned.length || before.others.length) refuse('the port chosen for this check is in use: run the check again');
  if (before.foreign.length) refuse('an Electron app is open (perhaps the product, with the user signing in): the check does not run beside it');
  // The checker, run on Windows by the staged Electron as plain Node: it starts the app through the start file (with a
  // DevTools port for this check only), presses Check connection, reads, and asks the app's window to close. It gives
  // up by itself after 120 s and writes one result line however it ends.
  const script = `
const { spawn } = require('node:child_process');
const path = require('node:path');
const port = Number((process.argv.find((a) => a.startsWith('--qa-check-port=')) || '').slice(16));
const env = { ...process.env };
for (const k of ['ELECTRON_RUN_AS_NODE', 'LC_SUBSCRIPTION_CONNECTOR', 'LC_USER_DATA', 'LC_DEV_CAPTURE_HOST']) delete env[k];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The DevTools page list: null when nothing listens (the app is gone), undefined when it did not answer in 2 s.
const list = async () => { try { return await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(2000) })).json(); } catch (e) { return e && e.name === 'TimeoutError' ? undefined : null; } };
const out = { started_at: new Date().toISOString(), start_file: ${JSON.stringify(START)}, sign_in_pressed: false };
let ws = null, evaluate = null, finishing = false;
// However the check ends, the app's window is asked to close when it can be reached, and ONE result line is written.
const finish = async (code) => {
  if (finishing) return;
  finishing = true;
  out.close_request = 'not_sent';
  if (evaluate && ws && ws.readyState === 1) { try { await Promise.race([evaluate('window.close(), true'), sleep(2000)]); out.close_request = 'sent'; } catch { } }
  if (out.close_request === 'sent') {   // whether it then went away is said only when it was asked to
    let gone = false;
    for (const end = Date.now() + 10000; !gone && Date.now() < end;) { await sleep(300); gone = (await list()) === null; }
    out.app_closed_itself = gone;
  }
  out.ended_at = new Date().toISOString();
  console.log(JSON.stringify(out));
  process.exit(code);
};
setTimeout(() => { if (finishing) return; out.error = 'the check gave up after 120 s'; finish(2); }, 120000);
(async () => {
  if (!Number.isInteger(port) || port < 1024) throw new Error('no port given');
  spawn('cmd.exe', ['/c', path.join(__dirname, ${JSON.stringify(START)}), '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'], { env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  let page = null;
  for (let i = 0; i < 100 && !page; i++) { await sleep(300); page = ((await list()) || []).find((t) => t.type === 'page' && /control\\.html$/.test(t.url)); }
  if (!page) { out.error = 'the app window did not appear'; return finish(1); }
  out.window = { title: page.title, url: page.url };
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('DevTools socket')); });
  let id = 0; const waiting = new Map();
  ws.onclose = () => { if (!finishing) { out.error = 'the DevTools socket closed during the check'; finish(1); } };
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  evaluate = (expression) => new Promise((ok) => { const n = ++id; waiting.set(n, ok); ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
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
  if (finishing) return;
  if (!(r.result && r.result.result && r.result.result.value)) { out.error = 'the page did not run the check: ' + JSON.stringify(r).slice(0, 300); return finish(1); }
  out.check = JSON.parse(r.result.result.value);
  return finish(0);
})().catch((e) => { if (finishing) return; out.error = String(e && e.message); return finish(1); });
`;
  // The check runs in a folder of its own, with byte-identical copies of the user's start file and configuration: the
  // start file's "%~dp0profile" is then this folder's, never the user's. The folder is removed only once everything the
  // check started is confirmed gone.
  const checkName = `${launcherName}-check-${port}`;
  const checkDir = join(temp, checkName);
  let made = false, r = null, cleanup = null, connectors = [], failure = null, foreignAtEnd = [];
  const copied = {};
  try {
    mkdirSync(checkDir);            // must be new: an existing folder is not this check's
    made = true;
    for (const name of [START, 'connector.json']) {
      const bytes = readFileSync(join(launcher, name));
      writeFileSync(join(checkDir, name), bytes);
      copied[name] = sha(bytes);
      if (sha(readFileSync(join(checkDir, name))) !== copied[name]) throw new Error(`the copy of ${name} is not its bytes`);
    }
    writeFileSync(join(checkDir, 'qa-check.js'), script);
    console.error(`check: port ${port}; the app carries --remote-debugging-port=${port}, the checker --qa-check-port=${port}; folder %TEMP%\\${checkName}`);
    r = spawnSync(join(temp, ELECTRON, 'electron.exe'), [`${winTemp}\\${checkName}\\qa-check.js`, `--qa-check-port=${port}`], { cwd: '/mnt/c', encoding: 'utf8', timeout: 150000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WSLENV: 'ELECTRON_RUN_AS_NODE' } });
  } catch (error) {
    failure = String(error?.message ?? error).slice(0, 300);
  } finally {
    // Whatever happened above (a DevTools failure, the 150 s limit, an exception): the app and the checker this check
    // started are let go of here, and its folder is removed only once they are confirmed gone. If the folder could not
    // even be made, this run started nothing and lets go of nothing.
    cleanup = made
      ? await releaseOwned({ look: async () => { const seen = await look(); foreignAtEnd = seen.foreign; return seen; }, askToClose: async (pid) => taskkill(pid, false), endByForce: async (pid) => taskkill(pid, true),
          sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), ownsFolder: true,
          removeFolder: async () => { const there = existsSync(checkDir); rmSync(checkDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); return there; } })
      : { owned_seen: [], asked_to_close: [], ended_by_force: [], errors: [], exit: 'nothing_started', left_running: [], not_owned_on_the_port: [], folder: 'kept', folder_reason: 'this run could not make its folder and started nothing' };
    // The connector in WSL ends within its own bound (8 s) after the app; it is only looked at, never ended here.
    connectors = connectorsInCopy();
    for (let i = 0; i < 24 && connectors.length; i++) { await new Promise((ok) => setTimeout(ok, 500)); connectors = connectorsInCopy(); }
  }
  let result;
  try {
    const line = (r?.stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith('{')).at(-1);
    result = line ? JSON.parse(line) : { error: failure ?? `the check wrote no result (${r?.error?.code ?? r?.signal ?? `status ${r?.status}`})` };
  } catch { result = { error: 'the check\'s result line could not be read' }; }
  console.log(JSON.stringify({ commit, copy, checked_bytes_sha256: copied, ...result, cleanup, connector_left_in_wsl: connectors, electron_apps_not_this_checks: foreignAtEnd, start_file: `%TEMP%\\${launcherName}\\${START}` }, null, 1));
  if (foreignAtEnd.length) console.error(`NOTE: an Electron app that is not this check's was open at the end (PIDs ${JSON.stringify(foreignAtEnd)}). It was not touched. If it is the product, the two shared the connector's state and one of them may have been refused: that app then says the connector is not available (state "unavailable").`);
  if (cleanup.exit === 'nothing_started') { console.error(`NOT RUN: ${failure}. Nothing was started; the folder %TEMP%\\${checkName} is not this run's and was left alone.`); process.exitCode = 2; }
  else if (cleanup.exit !== 'confirmed') {
    const what = cleanup.exit === 'unknown' ? 'whether what this check started is gone is NOT KNOWN (the look failed)'
      : cleanup.left_running.length ? `what this check started is still running (PIDs ${JSON.stringify(cleanup.left_running)})`
      : `a process that is not this check's holds its port (PIDs ${JSON.stringify(cleanup.not_owned_on_the_port)}); it was not ended`;
    console.error(`NOT RELEASED: ${what}. Seen as this check's: ${JSON.stringify(cleanup.owned_seen)}. Its folder %TEMP%\\${checkName} is kept as it is.`);
    process.exitCode = 3;
  } else if (cleanup.folder === 'kept') { console.error(`FOLDER LEFT: %TEMP%\\${checkName}: ${cleanup.folder_reason}. It is this check's own folder, not the user's.`); process.exitCode = 3; }
  else if (connectors.length) {
    console.error(`CONNECTOR STILL RUNNING IN WSL: ${JSON.stringify(connectors)} run from the copy; this check ended none of them.${foreignAtEnd.length ? ' They may belong to the other Electron app named above: do not end them.' : ''}`);
    process.exitCode = 3;
  } else if (result.error || result.check?.error) process.exitCode = 1;
}
