// Shared pieces for foreground CDP checks driven through cdp-runner.ps1 on the
// Windows side (see trusted-check.mjs for why). Desktop headless only; never
// iPad/Pencil evidence. Fresh temporary profile per run, removed afterwards.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startFixtureServer } from './fixture-server.mjs';

// ---- step builders -----------------------------------------------------------
export const E = (expr, as) => ({ eval: expr, as });
export const sleep = (ms) => ({ sleep: ms });
export const shot = (label) => ({ screenshot: label });
export const mouse = (type, x, y, extra = {}) => ({
  cdp: 'Input.dispatchMouseEvent',
  params: { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra },
});
/** Click at a stored point variable ({x, y}). */
export const clickAt = (v, pointerType = 'mouse') => [
  mouse('mouseMoved', `$${v}.x`, `$${v}.y`, { pointerType, buttons: 0 }),
  mouse('mousePressed', `$${v}.x`, `$${v}.y`, { pointerType }),
  mouse('mouseReleased', `$${v}.x`, `$${v}.y`, { pointerType }),
  sleep(150),
];
/** Press-move-release along a stored path {x0..xn, y0..yn}. */
export const drag = (v, n, pointerType) => [
  mouse('mouseMoved', `$${v}.x0`, `$${v}.y0`, { pointerType, buttons: 0 }),
  mouse('mousePressed', `$${v}.x0`, `$${v}.y0`, { pointerType, ...(pointerType === 'pen' ? { force: 0.5 } : {}) }),
  ...Array.from({ length: n }, (_, i) => mouse('mouseMoved', `$${v}.x${i + 1}`, `$${v}.y${i + 1}`, { pointerType, button: 'left', buttons: 1, ...(pointerType === 'pen' ? { force: 0.5 } : {}) })),
  mouse('mouseReleased', `$${v}.x${n}`, `$${v}.y${n}`, { pointerType }),
  sleep(250),
];
export const touch = (type, pts) => ({ cdp: 'Input.dispatchTouchEvent', params: { type, touchPoints: pts } });
export const tap = (v) => [touch('touchStart', [{ x: `$${v}.x`, y: `$${v}.y` }]), touch('touchEnd', []), sleep(250)];
/** Types text into the focused element as real text input. */
export const typeText = (text) => [{ cdp: 'Input.insertText', params: { text } }, sleep(120)];
export const key = (k, code, keyCode) => [
  { cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: keyCode } },
  { cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode } },
  sleep(120),
];

// ---- runner --------------------------------------------------------------------
/**
 * Runs `steps` in a fresh headless Windows browser via cdp-runner.ps1 and returns
 * the runner results. Removes stale outputs of the same run name first and always
 * stops the browser and deletes the temporary profile.
 */
export async function runCdp({ moduleDir, browser, run, outDir, steps, note }) {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) {
    if (f === `${run}.json` || f === `${run}.log` || (f.startsWith(`${run}-`) && f.endsWith('.png'))) rmSync(join(outDir, f), { force: true });
  }
  const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
  const tempUnix = execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim();
  const work = join(tempUnix, `lc-web-cdp-${run}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'out'), { recursive: true });
  const toWin = (p) => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
  const server = await startFixtureServer(moduleDir, { log: note });
  let runnerCode = null;
  try {
    // copyFile can fail with EPERM on the Windows drive mount; write the bytes instead.
    writeFileSync(join(work, 'cdp-runner.ps1'), readFileSync(join(moduleDir, 'scripts', 'cdp-runner.ps1')));
    writeFileSync(join(work, 'steps.json'), JSON.stringify(steps));
    const psArgs = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWin(join(work, 'cdp-runner.ps1')),
      '-Browser', toWin(browser), '-ProfileDir', toWin(join(work, 'profile')), '-StepsFile', toWin(join(work, 'steps.json')), '-OutDir', toWin(join(work, 'out')),
    ];
    note(`powershell.exe ${psArgs.join(' ')}`);
    runnerCode = await new Promise((ok) => {
      const child = spawn('powershell.exe', psArgs, { cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (d) => note(`ps: ${String(d).trim()}`));
      child.stderr.on('data', (d) => note(`ps err: ${String(d).trim()}`));
      const timer = setTimeout(() => child.kill(), 240000);
      child.on('exit', (c) => {
        clearTimeout(timer);
        ok(c);
      });
    });
    note(`runner exit code ${runnerCode}`);
    const resultsFile = join(work, 'out', 'cdp-results.json');
    if (!existsSync(resultsFile)) throw new Error('no cdp-results.json');
    const results = JSON.parse(readFileSync(resultsFile, 'utf8').replace(/^﻿/, ''));
    const screenshots = [];
    for (const file of results.screenshots ?? []) {
      const name = String(file).split('\\').pop();
      const src = join(work, 'out', name);
      if (existsSync(src)) {
        copyFileSync(src, join(outDir, name));
        screenshots.push(name);
      }
    }
    return { ...results, screenshots };
  } finally {
    await server.close();
    // The runner closes its browser itself. Only if the runner did not finish
    // normally, stop the recorded browser process, and only while that PID still
    // belongs to msedge.exe, so a recycled PID of another program is never touched.
    const pidFile = join(work, 'out', 'browser.pid');
    if (runnerCode !== 0 && existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf8').replace(/[^0-9]/g, '');
      if (pid) spawnSync('taskkill.exe', ['/F', '/T', '/FI', `PID eq ${pid}`, '/FI', 'IMAGENAME eq msedge.exe'], { cwd: '/mnt/c', stdio: 'ignore' });
    }
    for (let i = 0; i < 5 && existsSync(work); i++) {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (existsSync(work)) note(`WARNING: could not remove ${work}`);
  }
}
