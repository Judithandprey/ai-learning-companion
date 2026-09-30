#!/usr/bin/env node
// QA P0-13 Windows behaviour pass: orchestrates qa-electron-runner.ps1 from WSL2 on the Windows host.
//
// Usage: node tests/e2e/windows/run.mjs <scenario: smoke|full> <out dir (WSL path, never committed)>
// Needs the app staged by apps/windows/scripts/windows-stage.mjs as %TEMP%\lc-qa-windows-p013 (QA_STAGE_NAME).
// Every run uses a fresh user-data folder, content folder and Edge profile inside that stage; the Windows-side
// copies are removed after they are copied to the out dir. Desktop screenshots stay in the out dir only.

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenarios.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// copyFile can fail with EPERM on the Windows drive mount; write the bytes instead.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));
const [scenario, outArg] = process.argv.slice(2);
if (!scenarios[scenario] || !outArg) throw new Error('usage: run.mjs <smoke|full> <out dir>');
const out = resolve(outArg);
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const toWin = (p) => run('wslpath', ['-w', p]);
const winTemp = run('cmd.exe', ['/c', 'echo %TEMP%']);
const stage = join(run('wslpath', ['-u', winTemp]), process.env.QA_STAGE_NAME ?? 'lc-qa-windows-p013');
if (!existsSync(join(stage, 'dist', 'apps', 'windows', 'src', 'main', 'main.js'))) throw new Error('stage the app first');
const electron = run('wslpath', ['-w', join(run('wslpath', ['-u', winTemp]), 'lc-electron-44.5.1-win32-x64', 'electron.exe')]);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const id = `${scenario}-${Date.now()}`;
const work = join(stage, `qa-${id}`);
const paths = { userData: join(work, 'userdata'), content: join(work, 'content'), edgeProfile: join(work, 'edge-profile'), winOut: join(work, 'out') };
for (const p of Object.values(paths)) mkdirSync(p, { recursive: true });
rmSync(paths.userData, { recursive: true, force: true }); // the app creates it: a fresh, empty user-data folder
copyFileSync(join(HERE, 'course.html'), join(paths.content, 'course.html'));
copyFileSync(join(HERE, 'notes.txt'), join(paths.content, 'notes.txt'));
copyFileSync(join(HERE, 'qa-electron-runner.ps1'), join(work, 'qa-electron-runner.ps1'));
const courseUrl = 'file:///' + toWin(join(paths.content, 'course.html')).replace(/\\/g, '/');
const steps = scenarios[scenario]({ courseUrl, notes: toWin(join(paths.content, 'notes.txt')), edgeProfile: toWin(paths.edgeProfile), userData: toWin(paths.userData) });
writeFileSync(join(work, 'steps.json'), JSON.stringify(steps, null, 1));

const started = new Date().toISOString();
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-electron-runner.ps1')),
  '-Electron', electron, '-Stage', toWin(stage), '-UserData', toWin(paths.userData), '-StepsFile', toWin(join(work, 'steps.json')),
  '-OutDir', toWin(paths.winOut), '-Edge', edge], { cwd: '/mnt/c', encoding: 'utf8', timeout: 600000 });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(join(out, 'runner-stdio.txt'), `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\nstatus ${r.status} signal ${r.signal}\n`);
  cpSync(paths.winOut, join(out, 'out'), { recursive: true });
  // Context pictures and the ASK crop are converted to BMP on Windows (System.Drawing) for pixel analysis.
  const convert = join(work, 'convert');
  mkdirSync(convert, { recursive: true });
  const ctxDir = join(paths.userData, 'ink', 'context');
  if (existsSync(ctxDir)) for (const name of readdirSync(ctxDir)) copyFileSync(join(ctxDir, name), join(convert, name));
  try {
    const results = JSON.parse(readFileSync(join(paths.winOut, 'results.json'), 'utf8').replace(/^\uFEFF/, ''));
    const card = results.values?.askCard ? JSON.parse(results.values.askCard) : null;
    if (card?.src?.startsWith('data:image/png;base64,')) writeFileSync(join(convert, 'ask-crop.png'), Buffer.from(card.src.slice(22), 'base64'));
  } catch (error) { console.error('no ASK crop:', error.message); }
  copyFileSync(join(HERE, 'qa-png-to-bmp.ps1'), join(work, 'qa-png-to-bmp.ps1'));
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'qa-png-to-bmp.ps1')), '-Folder', toWin(convert)], { cwd: '/mnt/c', encoding: 'utf8', timeout: 120000 });
  cpSync(convert, join(out, 'pictures'), { recursive: true });
  const ink = join(paths.userData, 'ink'); // only the app's saved ink and context pictures are kept
  if (existsSync(ink)) cpSync(ink, join(out, 'ink'), { recursive: true });
  writeFileSync(join(out, 'run.json'), JSON.stringify({ scenario, started, ended: new Date().toISOString(), work: toWin(work), steps: steps.length }, null, 1));
  writeFileSync(join(out, 'steps.json'), JSON.stringify(steps, null, 1));
} finally {
  rmSync(work, { recursive: true, force: true }); // fresh per run; nothing stays on the Windows side
}
console.log(readFileSync(join(out, 'out', 'results.json'), 'utf8').slice(0, 400));

