#!/usr/bin/env node
// Synthetic memory synthesis only. Neither argv nor environment can select an audio device sink.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, verifyNativeBuild } from './build-native.mjs';
import { createNativeVoice } from '../src/main/native-voice.mjs';

if (process.platform !== 'win32') throw new Error('Native memory checks require installed Windows Node; no device output is permitted');
const [buildLabel, runLabel, ...extra] = process.argv.slice(2);
if (extra.length || !/^build-[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(buildLabel ?? '')
    || !/^memory-[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(runLabel ?? '')) {
  throw new Error('usage: node scripts/check-native-memory.mjs build-<label> memory-<fresh-label>');
}
const build = verifyNativeBuild(join(APP, 'native', 'build', buildLabel));
const output = join(APP, 'native', 'build', runLabel);
if (existsSync(output)) throw new Error('Refuse to overwrite native memory evidence; choose a fresh label');
mkdirSync(output);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const script = readFileSync(fileURLToPath(import.meta.url));
const adapter = readFileSync(join(APP, 'src', 'main', 'native-voice.mjs'));
const report = {
  at: new Date().toISOString(), scope: 'Synthetic native memory synthesis and observed direct-child close; no audible/microphone/model/display acceptance',
  sink: 'memory', node: process.version, platform: process.platform, build: build.receipt,
  hashes: { check_sha256: sha(script), adapter_sha256: sha(adapter), build_receipt_sha256: sha(build.files['build.json']) },
  tests: [], native: [], children: [],
};
// Retain exact executed source snapshots and metadata; never retain or play WAV bytes.
for (const [name, bytes] of Object.entries({ 'executed-NativeSpeech.cs': build.files['NativeSpeech.cs'], 'executed-native-voice.mjs': adapter,
  'executed-check-native-memory.mjs': script, 'executed-build.json': build.files['build.json'] })) writeFileSync(join(output, name), bytes, { flag: 'wx' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const test = async (name, fn) => {
  try { await fn(); report.tests.push({ name, status: 'PASS' }); }
  catch (error) { report.tests.push({ name, status: 'FAIL', error: String(error.stack ?? error) }); }
};
function memoryChild(culture) {
  assert.ok(['en-US', 'zh-CN'].includes(culture));
  const child = spawn(build.helperPath, ['memory', culture], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  const row = { pid: child.pid ?? null, sink: 'memory', culture, close_observed: false, code: null, signal: null, error: null };
  report.children.push(row);
  child.on('error', error => { row.error = String(error); });
  child.on('close', (code, signal) => { Object.assign(row, { close_observed: true, code, signal, closed_at: new Date().toISOString() }); });
  return { child, row };
}
function waveMetadata(done) {
  assert.equal(done.sink, 'memory');
  assert.equal(done.ok, true);
  assert.equal(done.reason, 'completed');
  assert.equal(done.wave.format, 1);
  assert.equal(done.wave.channels, 1);
  assert.equal(done.wave.bits_per_sample, 16);
  assert.ok(Number.isInteger(done.wave.sample_rate_hz) && done.wave.sample_rate_hz > 0);
  assert.ok(done.wave.bytes > done.wave.audio_bytes && done.wave.bytes <= 8 * 1024 * 1024 && done.wave.audio_bytes > 0);
  assert.ok(Number.isFinite(done.wave.duration_ms) && done.wave.duration_ms > 0);
  assert.match(done.wave.sha256, /^[a-f0-9]{64}$/);
}
async function synthesize(culture, text, rate) {
  const log = []; let childRecord;
  const voice = createNativeVoice({ helperPath: build.helperPath, sink: 'memory', culture, onDiagnostic: row => log.push(row),
    spawnProcess: (path, args, options) => {
      assert.equal(path, build.helperPath); assert.deepEqual(args, ['memory', culture]);
      assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
      const owned = memoryChild(culture); childRecord = owned.row; return owned.child;
    } });
  try {
    assert.equal(await voice.say(text, rate), true);
    const done = log.find(row => row.event === 'utterance_done');
    report.native.push({ culture, text, requested_rate: rate, ...done });
    waveMetadata(done);
  } finally {
    await voice.dispose();
    assert.equal(childRecord?.close_observed, true, 'dispose must observe this actual direct child close');
    assert.ok(log.some(row => row.event === 'child_closed'));
  }
}

function rawMemoryChild() {
  const { child, row } = memoryChild('en-US');
  const messages = []; let buffer = '', stdoutBytes = 0, stderrBytes = 0, failure = null;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdoutBytes += Buffer.byteLength(chunk);
    if (stdoutBytes > 8192) { failure = new Error('raw native stdout exceeded bound'); child.kill(); return; }
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const msg = JSON.parse(line);
        if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.sink !== 'memory') throw new Error('Invalid memory child protocol');
        messages.push(msg);
      } catch (error) { failure = error; child.kill(); return; }
    }
  });
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 4096) { failure = new Error('raw native stderr exceeded bound'); child.kill(); } });
  child.stdin.on('error', error => { failure = error; });
  child.on('error', error => { failure = error; });
  const wait = async predicate => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (predicate()) return;
      await delay(5);
    }
    throw new Error('Native memory test wait timed out');
  };
  const cleanup = async () => {
    if (!row.close_observed) { child.stdin.end(); child.kill(); }
    const deadline = Date.now() + 2000;
    while (!row.close_observed && Date.now() < deadline) await delay(5);
    report.native.push({ raw_child: row, stderr_bytes: stderrBytes, stdout_bytes: stdoutBytes, messages });
    assert.equal(row.close_observed, true, 'close, rather than kill(), is direct-child reaping evidence');
  };
  return { child, row, messages, wait, cleanup };
}

await test('en-US synthetic negation and explanation at requested 1.3 rate', () => synthesize('en-US', 'The answer is not three, it is five. Please explain this step first.', 1.3));
await test('zh-CN synthetic negation and explanation at requested 1.3 rate', () => synthesize('zh-CN', '答案不是三，是五。请先解释这个步骤。', 1.3));
await test('XML and shell-looking text remains literal in native memory synthesis', () => synthesize('en-US', 'Literal <tag> & "quotes"; $(never executed), `ticks`, </prosody>.', 1.3));
await test('idle helper produces no utterance; submitted memory synthesis is cancelled; observed normal exit', async () => {
  const r = rawMemoryChild();
  try {
    await r.wait(() => r.messages.some(msg => msg.type === 'ready')); await delay(60);
    assert.equal(r.messages.length, 1);
    assert.deepEqual(r.messages[0], { type: 'ready', sink: 'memory', culture: 'en-US', max_text: 220 });
    r.child.stdin.write(`${JSON.stringify({ op: 'say', id: '7', text: 'A sufficiently long synthetic sentence for cancellation. '.repeat(3), rate: 0.5 })}\n${JSON.stringify({ op: 'stop' })}\n`);
    await r.wait(() => r.messages.some(msg => msg.type === 'done'));
    const done = r.messages.find(msg => msg.type === 'done');
    assert.equal(done.id, '7'); assert.equal(done.ok, false); assert.equal(done.reason, 'cancelled'); assert.equal(done.wave, null);
    r.child.stdin.end(); await r.wait(() => r.row.close_observed); assert.equal(r.row.code, 0);
  } finally { await r.cleanup(); }
});
await test('EOF during queued work publishes no success; oversized line/text fail closed; all children close', async () => {
  for (const kind of ['eof', 'oversized-line', 'oversized-text']) {
    const r = rawMemoryChild();
    try {
      await r.wait(() => r.messages.some(msg => msg.type === 'ready'));
      if (kind === 'oversized-line') r.child.stdin.write('x'.repeat(4097));
      else if (kind === 'oversized-text') r.child.stdin.write(`${JSON.stringify({ op: 'say', id: '8', text: 'x'.repeat(221), rate: 1.3 })}\n`);
      else r.child.stdin.end(`${JSON.stringify({ op: 'say', id: '9', text: 'Queued work must not survive EOF.', rate: 1.3 })}\n`);
      await r.wait(() => r.row.close_observed);
      assert.equal(r.row.code, kind === 'eof' ? 0 : 2);
      assert.equal(r.messages.some(msg => msg.type === 'done' && msg.ok === true), false);
      assert.equal(r.row.signal, null);
    } finally { await r.cleanup(); }
  }
});
report.ended_at = new Date().toISOString();
report.pass = report.tests.filter(row => row.status === 'PASS').length;
report.fail = report.tests.length - report.pass;
report.all_children_close_observed = report.children.length > 0 && report.children.every(row => row.close_observed);
if (!report.all_children_close_observed) report.fail++;
writeFileSync(join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ pass: report.pass, fail: report.fail, all_children_close_observed: report.all_children_close_observed, evidence: join(output, 'result.json') }));
if (report.fail) process.exitCode = 1;
