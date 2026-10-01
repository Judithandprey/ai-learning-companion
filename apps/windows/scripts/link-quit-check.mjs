#!/usr/bin/env node
// Author check on the Windows host (from WSL2) of the real app with the development capture link configured: that it
// exits by itself when its window is closed, that the same profile then starts again, and what its texts say while
// the test service is not available. It builds and stages the app as self-test.mjs does and starts it as a normal
// Windows process (not the self-test mode, whose own exit skips will-quit); the control window is closed with
// window.close() over DevTools, as a user's close. No database is used: the link's DSN file names a socket that does
// not exist, so the released host ends as "unavailable". The cursor is never moved.
//
// The "failure" case shows this app's windows and captures the primary display in memory for a few seconds; its
// retained frames are in a temporary folder that is removed afterwards, and the report keeps texts and times only.
//
// Usage: node scripts/link-quit-check.mjs --backend <Backend root in WSL> --python <its python> [--out <dir>]
//          [--cases control,idle,failure] [--prebuilt <app dir with package.json and dist>] [--name <report name>]
// (On Windows this same file is the driver the staged run starts.)

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));

if (process.platform === 'win32') await driver();
else await orchestrate();

// ---- WSL: build, stage, run the driver on Windows, collect its report ---------------------------------------------
async function orchestrate() {
  const { APP, buildAndStage, copyTree, psq, run, toWin } = await import('./windows-stage.mjs');
  if (!args.backend || !args.python) throw new Error('usage: --backend <Backend root in WSL> --python <its python>');
  const electronRunning = () => /electron\.exe/i.test(spawnSync('tasklist.exe', ['/FI', 'IMAGENAME eq electron.exe'], { cwd: '/mnt/c', encoding: 'latin1' }).stdout);
  if (electronRunning()) throw new Error('an Electron app is running on this Windows desktop: the display is shared, so this check does not start');
  const name = args.name ?? 'link-quit-check';
  const outDir = resolve(args.out ?? join(APP, '..', '..', 'docs', 'verification', 'web', 'evidence', 'windows-capture-link', 'qa-win-03-04'));
  let stage, electron;
  if (args.prebuilt) {
    electron = run(process.execPath, [join(APP, 'scripts', 'windows-runtime.mjs')], { cwd: APP });
    stage = join(run('wslpath', ['-u', run('cmd.exe', ['/c', 'echo %TEMP%'], { cwd: '/mnt/c' })]), 'lc-windows-linkcheck');
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    copyTree(join(args.prebuilt, 'package.json'), join(stage, 'package.json'));
    copyTree(join(args.prebuilt, 'dist'), join(stage, 'dist'));
  } else {
    ({ stage, electron } = buildAndStage('lc-windows-linkcheck'));
  }
  const work = `${stage}-work`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  // A DSN that passes the app's rule (lc_p0_test, one local endpoint) and reaches nothing: its socket does not exist.
  writeFileSync(join(work, 'unavailable.dsn'), 'host=/nonexistent-lc-linkcheck-socket port=5432 dbname=lc_p0_test connect_timeout=5\n');
  writeFileSync(join(work, 'link.json'), JSON.stringify({ format: 'lc-windows-dev-capture-host/v1', launch: { kind: 'wsl', distribution: 'Ubuntu', user: run('id', ['-un']), cd: args.backend, python: args.python }, dsn_file: toWin(join(work, 'unavailable.dsn')) }));
  copyTree(fileURLToPath(import.meta.url), join(work, 'driver.mjs'));
  // electron.exe is a windowed program, which PowerShell's call operator does not wait for: it is started with its
  // PID kept, waited for (longer than the driver's own bounds add up to), and its own process tree ended if it is late.
  const q = (p) => `"${p}"`;
  const driverArgs = [q(toWin(join(work, 'driver.mjs'))), '--electron', q(electron), '--stage', q(toWin(stage)), '--work', q(toWin(work)), '--cases', args.cases ?? 'control,idle,failure'].join(' ');
  const ps = [
    `$env:ELECTRON_RUN_AS_NODE='1'`,
    `$p = Start-Process -FilePath ${psq(electron)} -ArgumentList ${psq(driverArgs)} -PassThru`,
    `if (-not $p.WaitForExit(600000)) { taskkill.exe /PID $p.Id /T /F | Out-Null; exit 124 }`,
    'exit $p.ExitCode',
  ].join('; ');
  const started = new Date().toISOString();
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: '/mnt/c', encoding: 'utf8' });
  const reportFile = join(work, 'report.json');
  // The report names no folder of this machine: the Windows temp folder (it holds the user's name) is written <temp>.
  const winTemp = toWin(join(stage, '..'));
  const scrub = (text) => [JSON.stringify(winTemp).slice(1, -1), winTemp, winTemp.replace(/\\/g, '/')].reduce((t, p) => t.split(p).join('<temp>'), text);
  const report = existsSync(reportFile) ? JSON.parse(scrub(readFileSync(reportFile, 'utf8'))) : null;
  // What ran: every staged file, by its SHA-256, and one hash over them all.
  const files = {};
  const walk = (d) => readdirSync(d).sort().forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : (files[relative(stage, join(d, n)).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(join(d, n))).digest('hex'))));
  walk(stage);
  const tree = createHash('sha256').update(Object.entries(files).map(([f, h]) => `${h}  ${f}\n`).join('')).digest('hex');
  const stillRunning = electronRunning();
  /** Last: the stage and the work folder (with it the retained frames of the failure case) are removed. */
  const remove = () => {
    for (const d of [stage, work]) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        console.log(`not removed (still in use): ${toWin(d).split(winTemp).join('<temp>')}; remove it once no Electron process remains`);
      }
    }
  };
  const displayLine = `display released: ${stillRunning ? 'NO, an Electron process is still running' : 'no Electron process remains'}`;
  if (!report) {
    console.error(`no report was written (driver exit ${result.status})`);
    console.log(displayLine);
    remove();
    process.exit(1);
  }
  const git = (...a) => spawnSync('git', a, { cwd: APP, encoding: 'utf8' }).stdout.trim();
  const whole = {
    what: 'the real app on the Windows desktop (Electron, a normal start), driven over DevTools; no database, no AI',
    source: args.prebuilt ? { prebuilt: args.prebuilt_label ?? 'a prebuilt app' } : { commit: git('rev-parse', 'HEAD'), uncommitted_app_changes: git('status', '--porcelain', '--', '.').length > 0 },
    staged_files: Object.keys(files).length,
    staged_tree_sha256: tree,
    started,
    ended: new Date().toISOString(),
    electron_left_running: stillRunning,
    driver_exit: result.status,
    ...report,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(whole, null, 1)}\n`);
  for (const c of whole.checks) console.log(`${c.pass ? 'pass' : 'FAIL'} ${c.id}: ${c.actual}`);
  if (whole.error) console.log(`error: ${whole.error}`);
  console.log(displayLine);
  remove();
  process.exitCode = whole.checks.length > 0 && whole.checks.every((c) => c.pass) && !whole.error && !stillRunning ? 0 : 1;
}

// ---- Windows: start the real app, drive it over DevTools, time its exit ---------------------------------------------
async function driver() {
  const work = args.work;
  const cases = String(args.cases).split(',');
  const checks = [];
  const observed = {};
  const check = (id, pass, actual) => checks.push({ id, pass: Boolean(pass), actual });
  let error = null;
  const live = new Set();

  const freePort = () => new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
  /** Starts the app as a normal Windows process (never the self-test mode). */
  async function launch(userData, link) {
    const port = await freePort();
    const env = { ...process.env, LC_USER_DATA: userData };
    for (const k of ['ELECTRON_RUN_AS_NODE', 'LC_SELFTEST', 'LC_DEV_CAPTURE_HOST']) delete env[k];
    if (link) env.LC_DEV_CAPTURE_HOST = link;
    const child = spawn(args.electron, [`--remote-debugging-port=${port}`, args.stage], { env, stdio: 'ignore' });
    live.add(child);
    const app = { child, port, exit: null };
    app.exited = new Promise((ok) => child.once('exit', (code, signal) => {
      live.delete(child);
      ok((app.exit = { code, signal }));
    }));
    return app;
  }
  /** A DevTools session on this app's page whose URL contains `page`. */
  async function page(app, name, ms = 20_000) {
    const by = Date.now() + ms;
    for (;;) {
      if (app.exit) throw new Error(`the app exited (${JSON.stringify(app.exit)}) before its ${name} page appeared`);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();
        const t = targets.find((x) => x.type === 'page' && String(x.url).includes(`${name}.html`));
        if (t) return await attach(t.webSocketDebuggerUrl);
      } catch {
        // not listening yet
      }
      if (Date.now() > by) throw new Error(`the ${name} page did not appear`);
      await sleep(200);
    }
  }
  function attach(url) {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(url);
      const waiting = new Map();
      let n = 0;
      const send = (method, params = {}) => new Promise((done, failed) => {
        const id = ++n;
        waiting.set(id, { done, failed });
        ws.send(JSON.stringify({ id, method, params }));
      });
      ws.addEventListener('message', (m) => {
        const v = JSON.parse(m.data);
        const w = waiting.get(v.id);
        if (!w) return;
        waiting.delete(v.id);
        if (v.error) w.failed(new Error(v.error.message));
        else w.done(v.result);
      });
      ws.addEventListener('close', () => waiting.forEach((w) => w.failed(new Error('the page closed'))));
      ws.addEventListener('error', () => fail(new Error('the DevTools connection failed')));
      ws.addEventListener('open', () => ok({
        send,
        /** The value of `expression` in the page. */
        value: async (expression) => {
          const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
          if (r.exceptionDetails) throw new Error(`in the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          return r.result.value;
        },
        close: () => ws.close(),
      }));
    });
  }
  /**
   * The link is on and idle (a configuration that was refused shows a line too: "off", and that is not this). The
   * second wording is the one builds up to 5871981 had, so that such a build can be checked for comparison.
   */
  const linkIdle = (t) => /^Capture storage \(development\): (not connected yet \(a connection is tried when you press Start\)|connected when you press Start)/.test(t.link ?? '');
  const texts = (control) => control.value(`({ header: document.getElementById('ai').textContent, link: document.getElementById('link').hidden ? null : document.getElementById('link').textContent })`);
  async function until(what, read, ok, ms = 30_000) {
    const by = Date.now() + ms;
    for (;;) {
      const v = await read();
      if (ok(v)) return v;
      if (Date.now() > by) throw new Error(`timed out waiting for ${what}`);
      await sleep(200);
    }
  }
  /** Closes the control window as a user does, and times the app's own exit; an app still alive is ended by its PID. */
  async function closeAndWait(app, control, boundMs) {
    const at = Date.now();
    control.send('Runtime.evaluate', { expression: 'window.close()' }).catch(() => undefined);
    const exit = await Promise.race([app.exited, sleep(boundMs).then(() => null)]);
    const result = { exited_by_itself: exit !== null, exit_code: exit?.code ?? null, ms: Date.now() - at };
    if (!exit) await kill(app);
    return result;
  }
  async function kill(app) {
    if (app.exit) return;
    spawnSync('taskkill.exe', ['/PID', String(app.child.pid), '/T', '/F'], { stdio: 'ignore' }); // this app's own process tree only
    await Promise.race([app.exited, sleep(5000)]);
  }

  try {
    if (cases.includes('control')) {
      // Without the link: the app as it always was.
      const app = await launch(join(work, 'profile-control'), null);
      const control = await page(app, 'control');
      observed.control = { before_close: await texts(control) };
      const closed = await closeAndWait(app, control, 15_000);
      observed.control.close = closed;
      check('control.exits_without_link', closed.exited_by_itself && closed.exit_code === 0, `without the link the app ${closed.exited_by_itself ? `exited by itself (code ${closed.exit_code}) ${closed.ms} ms after its window closed` : `had not exited ${closed.ms} ms after its window closed`}`);
    }
    if (cases.includes('idle')) {
      // The link configured, never started (QA-WIN-03's shortest case); then the same profile again.
      const profile = join(work, 'profile-idle');
      const app = await launch(profile, join(work, 'link.json'));
      const control = await page(app, 'control');
      const before = await until('the link on and idle', () => texts(control), linkIdle);
      const closed = await closeAndWait(app, control, 30_000);
      observed.idle = { before_close: before, close: closed };
      check('idle.linked_app_exits', closed.exited_by_itself && closed.exit_code === 0, `with the link configured and never started the app ${closed.exited_by_itself ? `exited by itself (code ${closed.exit_code}) ${closed.ms} ms after its window closed` : `had not exited ${closed.ms} ms after its window closed, and was ended by its PID`}`);
      // The same profile starts again (the single-instance lock was released), and exits again.
      const again = await launch(profile, join(work, 'link.json'));
      let reopened = null;
      try {
        const control2 = await page(again, 'control', 15_000);
        const t2 = await until('the link on and idle', () => texts(control2), linkIdle);
        const closed2 = await closeAndWait(again, control2, 30_000);
        reopened = { started: true, before_close: t2, close: closed2 };
      } catch (e) {
        reopened = { started: false, reason: String(e.message), exit: again.exit };
        await kill(again);
      }
      observed.idle.relaunch = reopened;
      check('idle.same_profile_relaunch', reopened.started && reopened.close.exited_by_itself && reopened.close.exit_code === 0, reopened.started ? `the same profile started again and ${reopened.close.exited_by_itself ? `exited by itself (code ${reopened.close.exit_code}) after ${reopened.close.ms} ms` : 'did not exit by itself'}` : `the same profile did not start again: ${reopened.reason}`);
    }
    if (cases.includes('failure')) {
      // An explicit Start while the test service is not available: what the app says, then Stop and close.
      const app = await launch(join(work, 'profile-failure'), join(work, 'link.json'));
      const control = await page(app, 'control');
      const idle = await until('the link on and idle', () => texts(control), linkIdle);
      await until('the Start button', () => control.value(`!document.getElementById('start').disabled && document.querySelectorAll('#displays li').length > 0`), Boolean);
      await control.value(`document.getElementById('start').click()`);
      const overlay = await page(app, 'overlay');
      const failed = await until('the link to say it is not connected', () => texts(control), (t) => /^Capture storage \(development\): not connected/.test(t.link ?? ''), 60_000);
      // ASK: a circle on the display, by window-scoped input (never the cursor).
      await until('a captured frame', () => overlay.value(`typeof __lcOverlay === 'undefined' ? 0 : __lcOverlay.state().samples.filter((x) => x.raw).length`), (n) => n >= 1, 30_000);
      const mouse = (type, x, y, buttons = 1) => overlay.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1, pointerType: 'mouse' });
      const click = async (selector) => {
        const r = await overlay.value(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await mouse('mouseMoved', r.x, r.y, 0);
        await mouse('mousePressed', r.x, r.y);
        await mouse('mouseReleased', r.x, r.y);
        await sleep(150);
      };
      await click('[data-mode="ASK"]');
      const circle = [[60, 310], [380, 310], [380, 510], [60, 510], [62, 312]];
      await mouse('mouseMoved', circle[0][0], circle[0][1], 0);
      await mouse('mousePressed', circle[0][0], circle[0][1]);
      for (const [x, y] of circle.slice(1)) await mouse('mouseMoved', x, y);
      await mouse('mouseReleased', circle.at(-1)[0], circle.at(-1)[1]);
      const card = await until('the ASK card', () => overlay.value(`__lcOverlay.state().card`), (c) => c !== null, 15_000);
      await click('#close');
      await control.value(`document.getElementById('stop').click()`);
      const stopped = await until('the link to say stopped', () => texts(control), (t) => /Capture storage \(development\): stopped/.test(t.link ?? ''), 60_000);
      await until('the session to end', () => control.value(`document.getElementById('session').textContent`), (t) => /^Not capturing/.test(t), 30_000);
      const closed = await closeAndWait(app, control, 30_000);
      observed.failure = { before_start: idle, service_unavailable: failed, ask_card: card.text.split('\n')[0], after_stop: stopped, close: closed };
      const claims = /also (being )?stored in a local test capture service/;
      check('failure.link_line_truthful', /not connected \(the frames stay on this device\)\. 0 record\(s\) stored\. the host ended without READY \(unavailable\)\. AI: not connected\.$/.test(failed.link), failed.link);
      check('failure.header_does_not_claim_storage', !claims.test(failed.header) && !claims.test(idle.header) && !claims.test(stopped.header) && /No AI is connected/.test(failed.header), failed.header);
      check('failure.ask_card_does_not_claim_storage', !claims.test(card.text) && /No AI is connected: this selection was not sent to any AI\. \(Development mode: the local test capture service is not storing frames now\./.test(card.text), card.text.split('\n')[0]);
      check('failure.linked_app_exits_after_stop', closed.exited_by_itself && closed.exit_code === 0, `after Start and Stop with the service unavailable the app ${closed.exited_by_itself ? `exited by itself (code ${closed.exit_code}) ${closed.ms} ms after its window closed` : `had not exited ${closed.ms} ms after its window closed, and was ended by its PID`}`);
    }
  } catch (e) {
    error = String(e?.message ?? e).slice(0, 500);
  } finally {
    for (const child of live) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  writeFileSync(join(work, 'report.json'), JSON.stringify({ runtime: { electron: process.versions.electron, node: process.versions.node, platform: `${process.platform}-${process.arch}` }, cases, checks, observed, error }));
  process.exit(error || checks.some((c) => !c.pass) ? 1 : 0);
}
