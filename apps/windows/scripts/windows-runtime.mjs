#!/usr/bin/env node
// Development helper (WSL2 on a Windows host): puts the official Electron runtime for Windows next to
// the Windows temp directory, so checks can start this app as a real Windows process. It downloads
// electron-v<version>-win32-x64.zip with the Electron package's own @electron/get (checksums verified,
// cached), expands it with PowerShell once, and prints the Windows path of electron.exe.
//
// Usage: node scripts/windows-runtime.mjs   (prints: <windows path to electron.exe>)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { version } = require('electron/package.json');
const { downloadArtifact } = require('@electron/get');

const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
const tempUnix = execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim();
const dir = join(tempUnix, `lc-electron-${version}-win32-x64`);
const exe = join(dir, 'electron.exe');
if (!existsSync(exe) || readFileSync(join(dir, 'version'), 'utf8').trim().replace(/^v/, '') !== version) {
  const zip = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64' });
  const zipOnWindows = join(tempUnix, `electron-v${version}-win32-x64.zip`);
  writeFileSync(zipOnWindows, readFileSync(zip));
  const toWin = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
  const psq = (text) => `'${String(text).replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -Force -LiteralPath ${psq(toWin(zipOnWindows))} -DestinationPath ${psq(toWin(dir))}`], { cwd: '/mnt/c', stdio: 'inherit' });
}
console.log(execFileSync('wslpath', ['-w', exe], { encoding: 'utf8' }).trim());
