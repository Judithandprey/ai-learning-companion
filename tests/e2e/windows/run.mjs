#!/usr/bin/env node
// QA P0-13 Windows behaviour pass: orchestrates qa-electron-runner.ps1 from WSL2 on the Windows host.
//
// Usage: node tests/e2e/windows/run.mjs <scenario: smoke|full> <out dir (WSL path, never committed)>
// Needs the app staged by apps/windows/scripts/windows-stage.mjs as %TEMP%\lc-qa-windows-p013 (QA_STAGE_NAME).
// Every run uses a fresh user-data folder, content folder and Edge profile inside that stage; the Windows-side
// copies are removed after they are copied to the out dir. Desktop screenshots stay in the out dir only.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_BRIDGE_SCRIPT, REHEARSAL_BRIDGE_SCRIPT, scenarios } from './scenarios.mjs';
import { askPathCheck, compareCopy } from './sub_copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// copyFile can fail with EPERM on the Windows drive mount; write the bytes instead.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));
const [scenario, outArg] = process.argv.slice(2);
if (!scenarios[scenario] || !outArg) throw new Error('usage: run.mjs <smoke|full|ink|parent|parentquit|parentfix|parentwin05|surfacecheck|subcontrols|subselect|subtype|subrehearsal|subcheck|subask> <out dir>');
const out = resolve(outArg);
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const toWin = (p) => run('wslpath', ['-w', p]);
const winTemp = run('cmd.exe', ['/c', 'echo %TEMP%']);
const stage = join(run('wslpath', ['-u', winTemp]), process.env.QA_STAGE_NAME ?? 'lc-qa-windows-p013');
if (!existsSync(join(stage, 'dist', 'apps', 'windows', 'src', 'main', 'main.js'))) throw new Error('stage the app first');
const electron = run('wslpath', ['-w', join(run('wslpath', ['-u', winTemp]), 'lc-electron-44.5.1-win32-x64', 'electron.exe')]);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// The executed harness bytes, recorded before anything runs (the committed harness must equal them).
const harness = Object.fromEntries(readdirSync(HERE).sort().filter((f) => statSync(join(HERE, f)).isFile()).map((f) => [f, createHash('sha256').update(readFileSync(join(HERE, f))).digest('hex')]));
const id = `${scenario}-${Date.now()}`;
const work = join(stage, `qa-${id}`);
// appTemp: TMP/TEMP of the app process only (spare copies of unsaved ink stay in this run's folder).
const paths = { userData: join(work, 'userdata'), content: join(work, 'content'), edgeProfile: join(work, 'edge-profile'), winOut: join(work, 'out'), appTemp: join(work, 'apptemp') };
for (const p of Object.values(paths)) mkdirSync(p, { recursive: true });
rmSync(paths.userData, { recursive: true, force: true }); // the app creates it: a fresh, empty user-data folder
copyFileSync(join(HERE, 'course.html'), join(paths.content, 'course.html'));
copyFileSync(join(HERE, 'notes.txt'), join(paths.content, 'notes.txt'));
copyFileSync(join(HERE, 'qa-electron-runner.ps1'), join(work, 'qa-electron-runner.ps1'));
// QA's generated test surface (surface.html draws random cards as pixels when it loads). Which two cards the pen circles
// is chosen here, at random, for each run; it is in the stroke coordinates only, never in a file name or a question.
copyFileSync(join(HERE, 'surface.html'), join(paths.content, 'surface.html'));
const surfaceUrl = 'file:///' + toWin(join(paths.content, 'surface.html')).replace(/\\/g, '/');
const first = randomInt(12);
const circled = [first, (first + 1 + randomInt(11)) % 12]; // two distinct cards, every pair equally likely
const courseUrl = 'file:///' + toWin(join(paths.content, 'course.html')).replace(/\\/g, '/');

// Parent mode: the app's development capture link to the local test service (lc_p0_test) through a private
// exact-source Backend copy (QA_BACKEND, made with git archive) and the released WSL private-stdin host.
const parent = scenario.startsWith('parent');
const PY = '/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python';
const HELPER = join(HERE, 'qa_parent_db.py');
let actor = null, watcher = null, preflightFile = null, watchFile = null, stopFile = null;
const extraArgs = [];
if (parent) {
  const backendCopy = process.env.QA_BACKEND;
  if (!backendCopy || !backendCopy.startsWith('/') || !existsSync(join(backendCopy, 'services', 'api', 'desktop_local.py'))) throw new Error('set QA_BACKEND to the absolute private Backend copy');
  if (existsSync(out) && readdirSync(out).length) throw new Error('the out dir must be new and empty');
  mkdirSync(out, { recursive: true });
  preflightFile = join(out, 'preflight.json');
  // Guards and a pristine QA-minted actor; the helper reads the DSN itself and prints only non-secret facts.
  execFileSync(PY, [HELPER, 'preflight', '--backend', backendCopy, '--out', preflightFile], { cwd: '/tmp', stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  actor = JSON.parse(readFileSync(preflightFile, 'utf8')).actor;
  const linkDir = join(work, 'link');
  mkdirSync(linkDir, { recursive: true });
  const launch = { kind: 'wsl', distribution: 'Ubuntu', user: 'agentsdock', cd: backendCopy, python: PY };
  const dsnFile = toWin('/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn');
  writeFileSync(join(linkDir, 'link-main.json'), JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', dsn_file: dsnFile, launch }));
  // The controlled failure: the same host, pointed at a test service that does not exist (no secret in this file).
  writeFileSync(join(linkDir, 'unavailable.dsn'), 'host=/nonexistent-qa-socket port=5432 dbname=lc_p0_test\n');
  writeFileSync(join(linkDir, 'link-unavail.json'), JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', dsn_file: toWin(join(linkDir, 'unavailable.dsn')), launch }));
  extraArgs.push('-LinkDir', toWin(linkDir));
  watchFile = join(out, 'host-watch.jsonl');
  stopFile = join(out, 'host-watch.stop');
  const { openSync } = await import('node:fs');
  // --control: the runner's hostPause/hostResume requests (this run's out folder on the Windows side), for this run's host only.
  watcher = spawn(PY, [HELPER, 'watch', '--backend', backendCopy, '--out', watchFile, '--stop', stopFile, '--control', paths.winOut], { cwd: '/tmp', stdio: ['ignore', 'ignore', openSync(join(out, 'host-watch.stderr'), 'w')], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
}
// Subscription mode (ADR 0003): the app's connector, named for one app process by a trusted configuration file.
//   subcontrols  QA's stand-in bridge only (qa_fake_bridge.py as launch.python in a QA-owned folder). No real configuration
//                is even written in that run: it cannot reach Codex, ChatGPT, a sign-in or the allowance.
//   subcheck     the REAL connector, for "Check connection" only. Needs QA_SUB_ALLOW_REAL_CONNECTOR=1 (the lead's release).
//   subask       the REAL connector and ONE question. Also needs QA_SUB_ALLOW_REAL_TURN=<the id of the lead's allocation>.
//                An allocation is used ONCE: a ledger file outside the run folders records each run made under it and
//                whether Ask was pressed. Another run under the same id starts only if every earlier one provably
//                stopped before the press (the press step never ran and the app recorded no request).
//   subselect    a probe with the stand-in bridge that asks nothing; subtype: the same for OS clicks and keys on the question box.
//   subrehearsal the steps of subask with the stand-in bridge: a rehearsal, no real connector, no allowance.
// QA never signs in, opens no browser and reads no auth file; after a real turn only the authorized receipt of each
// request this run made is copied (receipts/<launch>/<sha256(request_id)>.json).
const sub = scenario.startsWith('sub');
let subInfo = null, subRoot = null, subState = null, ledgerFile = null, ledger = null;
const assistance = process.env.QA_SUB_ASSISTANCE || 'full_solution';
if (sub) {
  if (existsSync(out) && readdirSync(out).length) throw new Error('the out dir must be new and empty');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  chmodSync(out, 0o700); // private: selection pictures, records and receipts are copied here
  const linkDir = join(work, 'link');
  mkdirSync(linkDir, { recursive: true });
  // The distribution and user the app names to wsl.exe are checked against this WSL itself (it is the one this run is in).
  const { userInfo } = await import('node:os');
  const distros = spawnSync('wsl.exe', ['-l', '-q'], { cwd: '/mnt/c' }).stdout.toString('utf16le').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const wsl = { distribution: 'Ubuntu', user: 'agentsdock', distributions_listed: distros, this_user: userInfo().username };
  if (!distros.includes(wsl.distribution) || wsl.this_user !== wsl.user) throw new Error(`the WSL distribution or user is not the documented one: ${JSON.stringify(wsl)}`);
  const config = (launch, state_dir, codex_bin) => JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: wsl.distribution, user: wsl.user, ...launch }, state_dir, codex_bin });
  if (['subcontrols', 'subselect', 'subtype', 'subrehearsal'].includes(scenario)) {
    subRoot = mkdtempSync('/tmp/qa-sub-bridge-'); // new, private (0700), removed after its logs are copied
    copyFileSync(join(HERE, 'qa_fake_bridge.py'), join(subRoot, 'qa-fake-bridge'));
    chmodSync(join(subRoot, 'qa-fake-bridge'), 0o755);
    writeFileSync(join(subRoot, 'bridge-script.json'), JSON.stringify(scenario === 'subrehearsal' ? REHEARSAL_BRIDGE_SCRIPT : FAKE_BRIDGE_SCRIPT));
    writeFileSync(join(linkDir, 'sub-fake.json'), config({ cd: subRoot, python: join(subRoot, 'qa-fake-bridge') }, null, null));
    subInfo = { kind: 'fake', note: 'QA stand-in bridge: no Codex, no ChatGPT, no sign-in, no allowance', assistance, wsl };
  } else {
    const backend = process.env.QA_SUB_BACKEND && existsSync(process.env.QA_SUB_BACKEND) ? realpathSync(process.env.QA_SUB_BACKEND) : null; // as /proc names it
    const turn = process.env.QA_SUB_ALLOW_REAL_TURN ?? '';
    if (process.env.QA_SUB_ALLOW_REAL_CONNECTOR !== '1') throw new Error('the real connector is started only after the lead releases it: set QA_SUB_ALLOW_REAL_CONNECTOR=1');
    if (scenario === 'subask' && !/^[A-Za-z0-9_.-]{8,80}$/.test(turn)) throw new Error('a real question is asked only within the lead\'s allocation: set QA_SUB_ALLOW_REAL_TURN=<allocation id>');
    if (!['hint', 'explain', 'full_solution'].includes(assistance)) throw new Error('QA_SUB_ASSISTANCE must be hint, explain or full_solution');
    if (!backend || !backend.startsWith('/') || !existsSync(join(backend, 'services', 'worker', 'connectors', 'chatgpt_local.py'))) throw new Error('set QA_SUB_BACKEND to a private exact-source copy of the released Backend');
    // The process watch counts what runs inside that folder: it must be a private copy in which nothing else runs.
    const inside = readdirSync('/proc').filter((n) => /^\d+$/.test(n)).filter((n) => { try { const cwd = readlinkSync(`/proc/${n}/cwd`); return cwd === backend || cwd.startsWith(`${backend}/`); } catch { return false; } });
    if (inside.length) throw new Error(`QA_SUB_BACKEND must be a private copy in which nothing runs; ${inside.length} process(es) have their working folder inside it`);
    // Which connector this is: QA_SUB_SOURCE names the released commit, and the copy must be that commit's services/ and
    // packages/, file for file. The connector's question path loads both; a copy without them answers Check connection
    // and refuses every question, which would spend the one attempt on nothing.
    const FILES = ['services/worker/connectors/chatgpt_local.py', 'services/worker/connectors/chatgpt_rpc.py', 'services/worker/connectors/chatgpt_launch.py', 'services/worker/connectors/chatgpt_receipts.py', 'services/learning/subscription_ask.py'];
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const source = process.env.QA_SUB_SOURCE || null;
    if (!source || !/^[0-9a-f]{40}$/.test(source)) throw new Error('set QA_SUB_SOURCE to the released commit (40 hex) the private Backend copy was made from');
    const connector = Object.fromEntries(FILES.map((f) => [f, sha(readFileSync(join(backend, f)))]));
    const same = compareCopy(source, backend);
    if (!same.equal) throw new Error(`QA_SUB_BACKEND is not ${source}'s services/ and packages/: ${JSON.stringify({ missing: same.missing.slice(0, 5), differing: same.differing.slice(0, 5), extra: same.extra.slice(0, 5) })}`);
    subRoot = backend;
    subState = process.env.QA_SUB_STATE_DIR || null;
    // wsl.exe --exec starts the connector without a login shell: `codex` is then not on PATH on this machine, so the
    // trusted configuration names the official binary (the connector admits it only by its pinned sha256).
    const python = process.env.QA_SUB_PYTHON || PY, codexBin = process.env.QA_SUB_CODEX_BIN || null;
    // The connector's own preparation of a question, run in the copy with that Python (offline; nothing is sent).
    const askPath = askPathCheck(python, backend);
    if (!askPath.ok) throw new Error(`the connector cannot prepare a question in QA_SUB_BACKEND: ${JSON.stringify(askPath)}`);
    if (!codexBin || !codexBin.startsWith('/') || !existsSync(codexBin)) throw new Error('set QA_SUB_CODEX_BIN to the absolute path of the official codex binary (the lead\'s trusted configuration)');
    writeFileSync(join(linkDir, 'sub-real.json'), config({ cd: backend, python }, subState, codexBin));
    subInfo = { kind: 'real', python, state_dir: subState ?? 'the connector\'s default product state (state_dir null)', codex_bin: codexBin, backend_copy: backend, source,
                connector_files_sha256: connector, copy_is_the_commits_services_and_packages: same.equal, copy_files: same.files, ask_path: askPath, model: process.env.QA_SUB_MODEL || null, assistance, real_turn_allowed: scenario === 'subask', wsl };
    if (scenario === 'subask') {
      // The allocation's ledger: one file per allocation id, outside every run folder.
      const dir = join(process.env.HOME, '.local', 'state', 'lc-qa-subscription');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      ledgerFile = join(dir, `turn-${turn}.json`);
      ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { allocation: turn, runs: [] };
      const spent = ledger.runs.filter((x) => x.ask_pressed !== false);
      if (spent.length) throw new Error(`the allocation ${turn} was used, or it is not known whether it was (${spent.map((x) => `${x.out}: ask_pressed ${x.ask_pressed}`).join('; ')}); no second question is asked under it`);
      ledger.runs.push({ out, started: new Date().toISOString(), ask_pressed: null, note: 'started; not yet known whether Ask was pressed' });
      writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1), ledger.runs.length === 1 ? { flag: 'wx', mode: 0o600 } : { mode: 0o600 });
      subInfo.allocation = turn;
    }
  }
  extraArgs.push('-LinkDir', toWin(linkDir));
  stopFile = join(out, 'connector-watch.stop');
  const { openSync } = await import('node:fs');
  // Read-only: when the connector (or the bridge) and its children appear and exit. It signals nothing.
  watcher = spawn('python3', [join(HERE, 'qa_sub_watch.py'), '--root', subRoot, '--out', join(out, 'connector-watch.jsonl'), '--stop', stopFile], { cwd: '/tmp', stdio: ['ignore', 'ignore', openSync(join(out, 'connector-watch.stderr'), 'w')] });
}
const steps = scenarios[scenario]({ courseUrl, surfaceUrl, circled, model: process.env.QA_SUB_MODEL || null, assistance, notes: toWin(join(paths.content, 'notes.txt')), edgeProfile: toWin(paths.edgeProfile), userData: toWin(paths.userData), actor });
writeFileSync(join(work, 'steps.json'), JSON.stringify(steps, null, 1));

const started = new Date().toISOString();
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-electron-runner.ps1')),
  '-Electron', electron, '-Stage', toWin(stage), '-UserData', toWin(paths.userData), '-StepsFile', toWin(join(work, 'steps.json')),
  '-OutDir', toWin(paths.winOut), '-Edge', edge, '-AppTemp', toWin(paths.appTemp), ...extraArgs], { cwd: '/mnt/c', encoding: 'utf8', timeout: sub ? 570000 : scenario === 'parentfix' ? 520000 : 900000 }); // parentfix (about 6 min) must end inside one 10 min foreground call
mkdirSync(out, { recursive: true });
// The runner was cut short (the time limit): its own cleanup may not have run, so this run's app may still be on the display.
const cutShort = Boolean(r.error || r.signal);
let copied = false;
try {
  writeFileSync(join(out, 'runner-stdio.txt'), `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\nstatus ${r.status} signal ${r.signal}\n`);
  cpSync(paths.winOut, join(out, 'out'), { recursive: true });
  if (sub) { // FIRST: the selection records, exact pictures and receipts must not be lost to a later copy that fails
    // Private: each selection's record and exact picture (asks/), as the app kept them. Only hashes go into evidence.
    const captures = join(paths.userData, 'captures');
    const requestIds = [];
    if (existsSync(captures)) for (const cap of readdirSync(captures)) {
      const asks = join(captures, cap, 'asks');
      if (!existsSync(asks)) continue;
      cpSync(asks, join(out, 'captures', cap, 'asks'), { recursive: true });
      for (const name of readdirSync(asks).filter((n) => n.endsWith('.json'))) {
        try { for (const q of JSON.parse(readFileSync(join(asks, name), 'utf8')).requests ?? []) requestIds.push(q.request_id); } catch { /* reported by the analysis */ }
      }
    }
    if (subInfo.kind === 'fake') {
      mkdirSync(join(out, 'bridge'), { recursive: true });
      for (const name of ['bridge-log.jsonl', 'bridge-script.json', 'bridge-launches']) if (existsSync(join(subRoot, name))) copyFileSync(join(subRoot, name), join(out, 'bridge', name));
      if (/^\/tmp\/qa-sub-bridge-[A-Za-z0-9]{6}$/.test(subRoot)) rmSync(subRoot, { recursive: true, force: true }); // this run's own stand-in folder
    } else {
      // Only the receipts of the requests this run made: receipts/<launch>/<sha256(request_id)>.json. The launch folders'
      // names under receipts/ are listed to find them; nothing else in the product state is listed, opened or copied.
      const receipts = join(subState ?? join(process.env.HOME, '.local', 'share', 'LearningCompanion', 'managed-chatgpt'), 'receipts');
      const found = [];
      if (existsSync(receipts)) for (const launch of readdirSync(receipts)) for (const rid of requestIds) {
        const name = `${createHash('sha256').update(rid, 'utf8').digest('hex')}.json`;
        if (existsSync(join(receipts, launch, name))) {
          mkdirSync(join(out, 'receipts', launch), { recursive: true, mode: 0o700 });
          copyFileSync(join(receipts, launch, name), join(out, 'receipts', launch, name));
          found.push({ request_id: rid, launch, file: name });
        }
      }
      writeFileSync(join(out, 'receipts-found.json'), JSON.stringify({ request_ids: requestIds, found }, null, 1));
    }
    if (ledger) {
      // Was Ask pressed? Not pressed only when the runner's results exist, the press step never ran and the app recorded no
      // request. Anything else counts as pressed or unknown: the allocation is then used.
      const pressAt = steps.findIndex((x) => typeof x.eval === 'string' && x.eval.includes('#askSubmit') && x.eval.includes('.click()')) + 1;
      let ran = null;
      try { ran = JSON.parse(readFileSync(join(paths.winOut, 'results.json'), 'utf8').replace(/^\uFEFF/, '')).steps.map((x) => x.i); } catch { /* unknown */ }
      const pressed = ran === null ? null : ran.includes(pressAt) || requestIds.length > 0;
      Object.assign(ledger.runs.at(-1), { ended: new Date().toISOString(), ask_pressed: pressed, press_step: pressAt, last_step_run: ran ? Math.max(0, ...ran) : null, requests_recorded: requestIds.length,
        note: pressed === false ? 'stopped before the press: no question was asked' : pressed ? 'Ask was pressed: the allocation is used' : 'unknown whether Ask was pressed: the allocation counts as used' });
      writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1), { mode: 0o600 });
      subInfo.ask_pressed = pressed;
      console.error(`ALLOCATION ${ledger.allocation}: Ask pressed = ${pressed === null ? 'UNKNOWN (counts as used)' : pressed}`);
    }
  }
  // Context pictures and the ASK crop are converted to BMP on Windows (System.Drawing) for pixel analysis (not for the
  // subscription runs: their picture is checked in the page and kept as the app's own PNG).
  const convert = join(work, 'convert');
  mkdirSync(convert, { recursive: true });
  const ctxDir = join(paths.userData, 'ink', 'context');
  // Only pictures whose bytes are their name (a test-corrupted entry is never converted).
  if (existsSync(ctxDir)) for (const name of readdirSync(ctxDir)) {
    const bytes = readFileSync(join(ctxDir, name));
    if (name === `${createHash('sha256').update(bytes).digest('hex')}.png`) writeFileSync(join(convert, name), bytes);
  }
  try {
    const results = JSON.parse(readFileSync(join(paths.winOut, 'results.json'), 'utf8').replace(/^\uFEFF/, ''));
    const card = results.values?.askCard ? JSON.parse(results.values.askCard) : null;
    if (card?.src?.startsWith('data:image/png;base64,')) writeFileSync(join(convert, 'ask-crop.png'), Buffer.from(card.src.slice(22), 'base64'));
    const card4 = results.values?.askCard4 ? JSON.parse(results.values.askCard4) : null;
    if (card4?.src?.startsWith('data:image/png;base64,')) writeFileSync(join(convert, 'ask-crop-4.png'), Buffer.from(card4.src.slice(22), 'base64'));
    // The app's retained whole-display frames: all manifests are kept (private out dir); only the raw and composed
    // PNGs of the retained frame that stood for each observed state (the last retained sample of that ink session
    // sampled no later than the state's latest sample) are copied and converted.
    const captures = join(paths.userData, 'captures');
    const lines = [];
    if (existsSync(captures)) for (const cap of readdirSync(captures)) {
      const manifest = join(captures, cap, 'manifest.jsonl');
      if (!existsSync(manifest)) continue;
      mkdirSync(join(out, 'captures', cap), { recursive: true });
      copyFileSync(manifest, join(out, 'captures', cap, 'manifest.jsonl'));
      const originals = join(captures, cap, 'ink'); // frame-bound ink originals (JSON) of this capture
      if (existsSync(originals)) cpSync(originals, join(out, 'captures', cap, 'ink'), { recursive: true });
      for (const text of readFileSync(manifest, 'utf8').split('\n').filter(Boolean)) {
        try { const line = JSON.parse(text); if (line.kind === 'retained') lines.push({ cap, line }); } catch { /* reported by the analysis */ }
      }
    }
    const selection = {};
    for (const [key, value] of Object.entries(results.values ?? {})) {
      if (!key.startsWith('app_') || /^app_s4-cap-\d+$/.test(key)) continue; // per-step cap reads need no pictures
      const last = JSON.parse(value).last;
      if (!last?.composed) { selection[key] = null; continue; }
      const earlier = lines.filter(({ line }) => line.composed?.ink_session === last.composed.ink_session && Date.parse(line.sampled_at) <= Date.parse(last.sampled_at))
        .sort((a, b) => Date.parse(b.line.sampled_at) - Date.parse(a.line.sampled_at));
      // Prefer the latest retained frame of the same ink revision as the state's latest sample.
      const pick = earlier.find(({ line }) => line.composed.ink_revision === last.composed.ink_revision) ?? earlier[0];
      selection[key] = pick ? { cap: pick.cap, sample_seq: pick.line.sample_seq, sampled_at: pick.line.sampled_at, raw: pick.line.raw.sha256, composed: pick.line.composed.sha256 } : null;
      if (pick) for (const sha of [pick.line.raw.sha256, pick.line.composed.sha256]) {
        const from = join(captures, pick.cap, 'frames', `${sha}.png`);
        if (existsSync(from) && !existsSync(join(convert, `frame-${sha}.png`))) copyFileSync(from, join(convert, `frame-${sha}.png`));
      }
    }
    writeFileSync(join(out, 'retained-selection.json'), JSON.stringify(selection, null, 1));
  } catch (error) { console.error('pictures:', error.message); }
  copyFileSync(join(HERE, 'qa-png-to-bmp.ps1'), join(work, 'qa-png-to-bmp.ps1'));
  if (!sub) spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-png-to-bmp.ps1')), '-Folder', toWin(convert)], { cwd: '/mnt/c', encoding: 'utf8', timeout: 300000 });
  cpSync(convert, join(out, 'pictures'), { recursive: true });
  const ink = join(paths.userData, 'ink'); // only the app's saved ink and context pictures are kept
  if (existsSync(ink)) cpSync(ink, join(out, 'ink'), { recursive: true });
  for (const [from, to] of [[join(paths.userData, 'qa-aside'), 'qa-aside'], [paths.appTemp, 'apptemp'], [join(paths.userData, 'capture-host'), 'capture-host']]) if (existsSync(from)) cpSync(from, join(out, to), { recursive: true });
  if (parent && existsSync(join(paths.userData, 'captures'))) cpSync(join(paths.userData, 'captures'), join(out, 'captures'), { recursive: true }); // private: whole-display frames
  writeFileSync(join(out, 'run.json'), JSON.stringify({ scenario, started, ended: new Date().toISOString(), work: toWin(work), steps: steps.length, ...(scenario.startsWith('surface') || sub ? { surface_circled_cards: circled } : {}), ...(sub ? { subscription: subInfo } : {}), harness_sha256: harness }, null, 1));
  writeFileSync(join(out, 'steps.json'), JSON.stringify(steps, null, 1));
  copied = true;
} finally {
  if (watcher) {
    // Hosts end within their own bounds after the app closes; keep watching briefly, then stop this run's watcher only.
    await new Promise((res) => setTimeout(res, 15000));
    writeFileSync(stopFile, 'stop');
    await new Promise((res) => (watcher.exitCode !== null || watcher.signalCode !== null ? res() : watcher.on('exit', res)));
  }
  if (cutShort) {
    const pids = join(paths.winOut, 'app-pids.txt');
    console.error(`RUNNER CUT SHORT (${r.error?.code ?? r.signal}): this run's app may still be running; its work folder is kept.\nOwned app PIDs (key pid start):\n${existsSync(pids) ? readFileSync(pids, 'utf8') : '(none recorded)'}`);
    process.exitCode = 4;
  } else if (copied) rmSync(work, { recursive: true, force: true }); // fresh per run; nothing stays on the Windows side
  else { console.error(`EVIDENCE COPY FAILED: this run's work folder is kept on the Windows side (${id})`); process.exitCode = 5; }
}
if (existsSync(join(out, 'out', 'results.json'))) console.log(readFileSync(join(out, 'out', 'results.json'), 'utf8').slice(0, 400));
else console.error('the runner wrote no results.json');

