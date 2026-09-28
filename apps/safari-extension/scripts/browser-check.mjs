#!/usr/bin/env node
// Foreground-only desktop browser check of the owned fixture. Starts a static
// server on 127.0.0.1:4173 (lead-allocated probe port), runs the in-page
// self-test in a headless browser with a fresh temporary profile, collects the
// JSON report and a real headless screenshot, then stops everything.
//
// This is a desktop check. It is not iPad Safari, Pencil or device evidence.
//
// Usage: node scripts/browser-check.mjs --browser <exe> [--out <dir>] [--run <name>] [--stop <check-id-prefix>]
//   On WSL the browser may be a Windows executable (e.g. msedge.exe); its
//   profile and screenshot then live in the Windows temp directory.

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, startFixtureServer } from './fixture-server.mjs';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const browser = args.browser;
if (!browser) {
  console.error('missing --browser <executable>');
  process.exit(2);
}
const run = (args.run ?? `run-${process.pid}`).replace(/[^A-Za-z0-9_.-]/g, '_');
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const host = args.host ?? 'localhost';
const stop = args.stop ?? null;
const timeoutMs = Number(args.timeout ?? 90000);

let report = null;
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};

function windowsPath(unixPath) {
  return execFileSync('wslpath', ['-w', unixPath], { encoding: 'utf8' }).trim();
}

function tempRoot() {
  if (!browser.startsWith('/mnt/')) return { unix: '/tmp', forBrowser: (p) => p };
  const winTemp = execFileSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8', cwd: '/mnt/c' }).trim();
  const unix = execFileSync('wslpath', ['-u', winTemp], { encoding: 'utf8' }).trim();
  return { unix, forBrowser: windowsPath };
}

const outputs = () => [join(outDir, `${run}.json`), join(outDir, `${run}.png`), join(outDir, `${run}.log`)];

async function main() {
  mkdirSync(outDir, { recursive: true });
  // A failed run must never leave an earlier run's passing evidence in place.
  for (const f of outputs()) rmSync(f, { force: true });
  const token = randomUUID();
  const server = await startFixtureServer(MODULE, {
    token,
    log: note,
    onReport: (r) => {
      report = r;
      note(`self-test report received: ${r.summary?.passed}/${r.summary?.total}`);
    },
  });
  note(`server on http://127.0.0.1:${PORT} (fixture + dist only)`);
  const tmp = tempRoot();
  const profileUnix = join(tmp.unix, `lc-web-probe-profile-${run}`);
  const shotUnix = join(tmp.unix, `lc-web-probe-${run}.png`);
  rmSync(profileUnix, { recursive: true, force: true });
  rmSync(shotUnix, { force: true });
  const page = `http://${host}:${PORT}/fixture/index.html?selftest=1&run=${encodeURIComponent(run)}&token=${token}${stop ? `&stop=${encodeURIComponent(stop)}` : ''}`;
  const browserArgs = [
    '--headless=new',
    // WSL interop may start Windows browsers elevated; without this flag Edge
    // relaunches itself de-elevated and drops the headless arguments.
    ...(browser.startsWith('/mnt/') ? ['--do-not-de-elevate'] : []),
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${tmp.forBrowser(profileUnix)}`,
    '--window-size=1280,1400',
    '--hide-scrollbars',
    `--screenshot=${tmp.forBrowser(shotUnix)}`,
    page,
  ];
  note(`launch: ${browser} ${browserArgs.join(' ')}`);
  const child = spawn(browser, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'], cwd: browser.startsWith('/mnt/') ? '/mnt/c' : MODULE });
  let childOut = '';
  child.stdout.on('data', (d) => (childOut += d));
  child.stderr.on('data', (d) => (childOut += d));
  const exited = new Promise((ok) => child.on('exit', (code) => ok(code)));
  const timer = setTimeout(() => {
    note(`timeout after ${timeoutMs} ms; stopping browser`);
    child.kill();
  }, timeoutMs);
  const code = await exited;
  clearTimeout(timer);
  server.release();
  note(`browser exit code ${code}`);
  if (childOut.trim()) note(`browser output: ${childOut.trim().split('\n').slice(-8).join(' | ')}`);

  const shotOut = join(outDir, `${run}.png`);
  if (existsSync(shotUnix)) {
    copyFileSync(shotUnix, shotOut);
    note(`screenshot: ${shotOut}`);
  } else {
    note('no screenshot produced');
  }
  if (report) writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify(report, null, 2)}\n`);
  else {
    note('no self-test report received');
    writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify({ kind: 'lc-web-probe-selftest/v1', run, status: 'no_report', summary: { total: 0, passed: 0, failed: ['no_report'] } }, null, 2)}\n`);
  }
  writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  rmSync(shotUnix, { force: true });
  rmSync(profileUnix, { recursive: true, force: true });
  await server.close();
  const failed = !report || report.summary.failed.length > 0;
  if (report) note(`checks passed ${report.summary.passed}/${report.summary.total}; failed: ${report.summary.failed.join(', ') || 'none'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  note(`harness error: ${error?.stack ?? error}`);
  try {
    writeFileSync(join(outDir, `${run}.json`), `${JSON.stringify({ kind: 'lc-web-probe-selftest/v1', run, status: 'harness_error', error: String(error), summary: { total: 0, passed: 0, failed: ['harness_error'] } }, null, 2)}\n`);
    writeFileSync(join(outDir, `${run}.log`), `${log.join('\n')}\n`);
  } catch {
    // output directory unavailable
  }
  process.exit(3);
});
