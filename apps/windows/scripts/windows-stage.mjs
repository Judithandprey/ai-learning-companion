// Development helper (WSL2 on a Windows host): builds the app and stages it in the Windows temp directory
// next to the official Windows Electron runtime, so it runs as a real Windows process. Shared by
// self-test.mjs and launch.mjs.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const run = (cmd, argv, opts = {}) => (execFileSync(cmd, argv, { encoding: 'utf8', ...opts }) ?? '').trim();
export const toWin = (p) => run('wslpath', ['-w', p]);
/** A PowerShell single-quoted string literal. */
export const psq = (text) => `'${String(text).replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`;

/** Copies a tree by writing bytes (copyFile can fail with EPERM on the Windows drive mount). */
export function copyTree(from, to) {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) copyTree(join(from, name), join(to, name));
  } else {
    writeFileSync(to, readFileSync(from));
  }
}

/** Builds, stages into %TEMP%\<name> (replacing an earlier stage) and returns its paths and electron.exe. */
export function buildAndStage(name) {
  run(process.execPath, [join(APP, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(APP, 'tsconfig.json')], { stdio: 'inherit', cwd: APP });
  run(process.execPath, [join(APP, 'scripts', 'copy-static.mjs')], { cwd: APP });
  const electron = run(process.execPath, [join(APP, 'scripts', 'windows-runtime.mjs')], { cwd: APP });
  const winTemp = run('cmd.exe', ['/c', 'echo %TEMP%'], { cwd: '/mnt/c' });
  const stage = join(run('wslpath', ['-u', winTemp]), name);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  copyTree(join(APP, 'package.json'), join(stage, 'package.json'));
  copyTree(join(APP, 'dist'), join(stage, 'dist'));
  return { stage, electron };
}
