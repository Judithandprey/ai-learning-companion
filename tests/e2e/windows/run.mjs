#!/usr/bin/env node
// QA P0-13 Windows behaviour pass: orchestrates qa-electron-runner.ps1 from WSL2 on the Windows host.
//
// Usage: node tests/e2e/windows/run.mjs <scenario: smoke|full> <out dir (WSL path, never committed)>
// Needs the app staged by apps/windows/scripts/windows-stage.mjs as %TEMP%\lc-qa-windows-p013 (QA_STAGE_NAME).
// Every run uses a fresh user-data folder, content folder and Edge profile inside that stage; the Windows-side
// copies are removed after they are copied to the out dir. Desktop screenshots stay in the out dir only.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenarios.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// copyFile can fail with EPERM on the Windows drive mount; write the bytes instead.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));
const [scenario, outArg] = process.argv.slice(2);
if (!scenarios[scenario] || !outArg) throw new Error('usage: run.mjs <smoke|full|ink|parent|parentquit|parentfix|parentwin05|surfacecheck> <out dir>');
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
const steps = scenarios[scenario]({ courseUrl, surfaceUrl, circled, notes: toWin(join(paths.content, 'notes.txt')), edgeProfile: toWin(paths.edgeProfile), userData: toWin(paths.userData), actor });
writeFileSync(join(work, 'steps.json'), JSON.stringify(steps, null, 1));

const started = new Date().toISOString();
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-electron-runner.ps1')),
  '-Electron', electron, '-Stage', toWin(stage), '-UserData', toWin(paths.userData), '-StepsFile', toWin(join(work, 'steps.json')),
  '-OutDir', toWin(paths.winOut), '-Edge', edge, '-AppTemp', toWin(paths.appTemp), ...extraArgs], { cwd: '/mnt/c', encoding: 'utf8', timeout: scenario === 'parentfix' ? 520000 : 900000 }); // parentfix (about 6 min) must end inside one 10 min foreground call
mkdirSync(out, { recursive: true });
// The runner was cut short (the time limit): its own cleanup may not have run, so this run's app may still be on the display.
const cutShort = Boolean(r.error || r.signal);
try {
  writeFileSync(join(out, 'runner-stdio.txt'), `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\nstatus ${r.status} signal ${r.signal}\n`);
  cpSync(paths.winOut, join(out, 'out'), { recursive: true });
  // Context pictures and the ASK crop are converted to BMP on Windows (System.Drawing) for pixel analysis.
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
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-png-to-bmp.ps1')), '-Folder', toWin(convert)], { cwd: '/mnt/c', encoding: 'utf8', timeout: 300000 });
  cpSync(convert, join(out, 'pictures'), { recursive: true });
  const ink = join(paths.userData, 'ink'); // only the app's saved ink and context pictures are kept
  if (existsSync(ink)) cpSync(ink, join(out, 'ink'), { recursive: true });
  for (const [from, to] of [[join(paths.userData, 'qa-aside'), 'qa-aside'], [paths.appTemp, 'apptemp'], [join(paths.userData, 'capture-host'), 'capture-host']]) if (existsSync(from)) cpSync(from, join(out, to), { recursive: true });
  if (parent && existsSync(join(paths.userData, 'captures'))) cpSync(join(paths.userData, 'captures'), join(out, 'captures'), { recursive: true }); // private: whole-display frames
  writeFileSync(join(out, 'run.json'), JSON.stringify({ scenario, started, ended: new Date().toISOString(), work: toWin(work), steps: steps.length, ...(scenario.startsWith('surface') ? { surface_circled_card: circled } : {}), harness_sha256: harness }, null, 1));
  writeFileSync(join(out, 'steps.json'), JSON.stringify(steps, null, 1));
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
  } else rmSync(work, { recursive: true, force: true }); // fresh per run; nothing stays on the Windows side
}
console.log(readFileSync(join(out, 'out', 'results.json'), 'utf8').slice(0, 400));

