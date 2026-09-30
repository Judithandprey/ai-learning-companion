#!/usr/bin/env node
// Development helper (WSL2 on a Windows host): builds the app, stages it in the Windows temp directory and
// starts it on the Windows desktop for manual use. It returns at once; close the app window to quit.
// Ink is kept in the app's normal Windows user-data folder (%APPDATA%\Learning Companion\ink).
// On Windows itself, use `npm install`, `npm run build` and `npm start` in apps/windows instead.
//
// Usage: node scripts/launch.mjs

import { spawnSync } from 'node:child_process';
import { buildAndStage, psq, toWin } from './windows-stage.mjs';

const { stage, electron } = buildAndStage('lc-windows-app');
const ps = `Start-Process -FilePath ${psq(electron)} -ArgumentList ${psq(`"${toWin(stage)}"`)}`;
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: '/mnt/c', encoding: 'utf8', stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`started ${electron} "${toWin(stage)}"`);
