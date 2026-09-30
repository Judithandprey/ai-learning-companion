// Foreground native Windows parent. Config on stdin contains executable paths,
// argv/cwd and bounded case lists only; no credentials or product configuration.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const config = JSON.parse(readFileSync(0, 'utf8'));
assert.equal(process.platform, 'win32', 'Must execute with native Windows Node');

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timeout')), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function get(origin, probeId) {
  return new Promise((resolve, reject) => {
    const request = http.get(origin + '/support-probe/' + probeId, { agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', data => {
        body += data;
        if (body.length > 4096) request.destroy(new Error('oversized HTTP response'));
      });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', reject);
    });
    request.setTimeout(2000, () => request.destroy(new Error('HTTP timeout')));
    request.on('error', reject);
  });
}

async function runCase(route, kind) {
  const result = { route: route.name, case: kind, passed: false };
  const started = performance.now();
  const child = spawn(route.executable, route.args, {
    cwd: route.cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  result.owned_launcher_pid = child.pid;
  let stdout = '';
  let stderr = '';
  let readyResolve;
  const firstRecord = new Promise(resolve => { readyResolve = resolve; });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => {
    if (result.output_error) return;
    stdout += data;
    if (Buffer.byteLength(stdout, 'utf8') > 8192) {
      stdout = stdout.slice(0, 4096);
      result.output_error = 'stdout exceeded probe bound';
      readyResolve(null);
      child.stdin.end();
      return;
    }
    if (stdout.includes('\n')) readyResolve(stdout.split('\n')[0]);
  });
  child.stderr.on('data', data => {
    if (result.output_error) return;
    stderr += data;
    if (Buffer.byteLength(stderr, 'utf8') > 8192) {
      stderr = stderr.slice(0, 4096);
      result.output_error = 'stderr exceeded probe bound';
      readyResolve(null);
      child.stdin.end();
    }
  });
  child.stdin.on('error', error => { result.stdin_error = error.code; });
  child.on('error', error => { result.spawn_error = error.code; });
  const closed = new Promise(resolve => child.on('close', (code, signal) => {
    readyResolve(null);
    resolve({ code, signal });
  }));
  try {
    const probeId = randomUUID();
    const record = { format: 'support-pipe-probe-v1', probe_id: probeId,
      text: 'Synthetic only: α中文🙂', mode: kind === 'owned-force-cleanup' ? 'ignore_eof' : 'normal' };
    const raw = Buffer.from(JSON.stringify(record) + '\n', 'utf8');
    const cut = raw.indexOf(Buffer.from('中')) + 1; // Deliberately split a multibyte code point.
    child.stdin.write(raw.subarray(0, cut));
    await delay(25);
    child.stdin.write(raw.subarray(cut, kind === 'incomplete-eof' ? raw.length - 1 : raw.length));
    if (kind === 'incomplete-eof') {
      child.stdin.end();
      result.exit = await bounded(closed, 8000, 'incomplete input exit');
      assert.notEqual(result.exit.code, 0, 'Incomplete input must fail');
      assert.equal(stdout, '', 'Incomplete input must not announce readiness');
    } else {
      const line = await bounded(firstRecord, 8000, 'readiness');
      assert.ok(line, 'Child exited without readiness');
      assert.ok(line.length <= 4096, 'Readiness must be bounded');
      const ready = JSON.parse(line);
      assert.equal(ready.format, 'support-pipe-ready-v1');
      assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(ready.probe_id, probeId);
      assert.equal(ready.input_sha256, createHash('sha256').update(raw).digest('hex'));
      assert.equal(ready.input_bytes, raw.length);
      assert.equal(ready.stdin_is_fifo, true);
      assert.equal(ready.stdin_is_tty, false);
      assert.equal(child.stdin.writableEnded, false);
      result.ready = ready;
      const httpDelay = route.http_delay_ms ?? 0;
      assert.ok(Number.isInteger(httpDelay) && httpDelay >= 0 && httpDelay <= 1000);
      if (httpDelay) await delay(httpDelay); // One delayed diagnostic request, never a polling loop.
      const response = await get(ready.origin, probeId);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { probe_id: probeId, input_sha256: ready.input_sha256 });
      result.windows_parent_http = response.status;
      const ending = performance.now();
      if (kind === 'extra-input') {
        child.stdin.write(Buffer.from('!'));
        result.exit = await bounded(closed, 5000, 'extra input exit');
        assert.notEqual(result.exit.code, 0, 'Further input must fail');
        assert.ok(stderr.includes('unexpected_input'));
      } else if (kind === 'owned-force-cleanup') {
        assert.equal(route.name, 'native-python', 'Do not force-kill a WSL relay');
        assert.equal(ready.pid, child.pid, 'Forced cleanup requires the directly owned Python process');
        child.stdin.end();
        const early = await Promise.race([closed.then(() => true), delay(400).then(() => false)]);
        assert.equal(early, false, 'This synthetic child deliberately ignores EOF');
        result.force_kill_returned = child.kill('SIGTERM');
        assert.equal(result.force_kill_returned, true);
        result.exit = await bounded(closed, 5000, 'owned native child cleanup');
        result.cleanup_classification = 'abnormal forced termination; not graceful SIGTERM or product Stop';
        assert.equal(stderr.includes('signal_handler'), false);
      } else {
        child.stdin.end();
        result.exit = await bounded(closed, 5000, 'EOF exit');
        assert.equal(result.exit.code, 0);
        assert.ok(stderr.includes('normal_eof'));
      }
      result.exit_after_action_ms = Math.round(performance.now() - ending);
      let refusal;
      try { await get(ready.origin, probeId); } catch (error) { refusal = error.code; }
      result.after_exit_http_error = refusal;
      if (route.name === 'native-python') {
        assert.equal(refusal, 'ECONNREFUSED', 'The directly owned listener must close');
      } else {
        // WSL may keep its forwarding listener after Python exits, resetting
        // requests to the closed backend. Do not claim that Windows proxy closed.
        assert.ok(['ECONNREFUSED', 'ECONNRESET'].includes(refusal), 'Exited WSL child must not serve HTTP');
        result.forwarder_closed = 'not established; only Python exit and no serving response are checked';
      }
      assert.equal(stdout.trim().split('\n').length, 1, 'Only one stdout readiness record');
    }
    assert.equal(stderr.includes('Synthetic only:'), false, 'Input must not be echoed');
    assert.equal(result.spawn_error, undefined);
    assert.equal(result.output_error, undefined);
    result.passed = true;
  } catch (error) {
    result.error = error.message;
  } finally {
    child.stdin.end();
    // Only this exact child is owned. WSL's relay is not evidence of Linux child
    // termination; allow this probe's own 12-second failsafe to close it instead.
    try {
      if (child.exitCode === null && child.signalCode === null && route.name === 'native-python') {
        child.kill('SIGTERM');
      }
      result.cleanup_exit = await bounded(closed, 15000, 'owned probe failsafe');
    } catch (error) {
      result.cleanup_error = error.message;
      result.passed = false;
    }
    result.stderr_records = stderr.trim().split('\n').filter(Boolean);
    result.duration_ms = Math.round(performance.now() - started);
  }
  return result;
}

const report = {
  scope: 'Synthetic stdlib private-pipe/network/owned-child probe only; no product host, DB, GUI or capture',
  date_utc: new Date().toISOString(),
  parent: { platform: process.platform, version: process.version, executable: process.execPath, cwd: process.cwd() },
  routes: config.routes,
  results: [],
};
for (const route of config.routes) {
  for (const kind of route.cases) report.results.push(await runCase(route, kind));
}
report.passed = report.results.every(result => result.passed);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
