// Exact owned adapter with stream/EventEmitter doubles only: never starts a helper or audio device.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createNativeVoice, type NativeVoiceDiagnostic, type NativeVoiceOptions, type NativeVoiceSpawnProcess, type NativeWaveMetadata } from '../src/main/native-voice.mjs';

const helperPath = '/synthetic-not-executed/NativeSpeech.exe';
const wave: NativeWaveMetadata = {
  bytes: 1044, audio_bytes: 1000, format: 1, channels: 1, sample_rate_hz: 22050,
  bits_per_sample: 16, duration_ms: 22.6757, sha256: 'a'.repeat(64),
};
type FakeOptions = { killCloses?: boolean; shutdownCloses?: boolean; killThrows?: boolean };
class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly commands: Record<string, unknown>[] = [];
  kills = 0;
  private readonly behavior: FakeOptions;
  constructor(behavior: FakeOptions = {}) {
    super();
    this.behavior = behavior;
    this.stdin.on('data', chunk => {
      const command = JSON.parse(String(chunk)) as Record<string, unknown>;
      this.commands.push(command);
      if (command.op === 'shutdown' && this.behavior.shutdownCloses !== false) queueMicrotask(() => this.close(0, null));
    });
  }
  kill(): boolean {
    this.kills++;
    if (this.behavior.killThrows) throw new Error('Synthetic kill failure');
    if (this.behavior.killCloses !== false) queueMicrotask(() => this.close(null, 'SIGTERM'));
    return true;
  }
  close(code: number | null = 0, signal: NodeJS.Signals | null = null): void { this.emit('close', code, signal); }
  reply(value: unknown): void { this.stdout.emit('data', JSON.stringify(value) + '\n'); }
}

function harness(options: Partial<NativeVoiceOptions> = {}, behavior: FakeOptions = {}) {
  const children: FakeChild[] = [];
  const calls: Parameters<NativeVoiceSpawnProcess>[] = [];
  const diagnostics: NativeVoiceDiagnostic[] = [];
  const voice = createNativeVoice({
    helperPath, sink: 'memory', ...options,
    spawnProcess: (...args) => { calls.push(args); const child = new FakeChild(behavior); children.push(child); return child; },
    onDiagnostic: value => { diagnostics.push(value); options.onDiagnostic?.(value); },
  });
  const child = () => children.at(-1)!;
  const ready = (target = child()) => target.reply({ type: 'ready', sink: options.sink ?? 'memory', culture: options.culture ?? 'en-US', max_text: 220 });
  const done = (id = String(child().commands.findLast(c => c.op === 'say')?.id), extra: Record<string, unknown> = {}, target = child()) => {
    target.reply({ type: 'done', id, ok: true, reason: 'completed', sink: options.sink ?? 'memory', wave: null, ...extra });
  };
  return { voice, child, children, calls, diagnostics, ready, done };
}

test('requires an absolute trusted helper, explicit sink and supported culture', () => {
  for (const options of [
    { helperPath: 'relative.exe', sink: 'memory' },
    { helperPath },
    { helperPath, sink: 'shell' },
    { helperPath, sink: 'memory', culture: 'fr-FR' },
  ]) assert.throws(() => createNativeVoice(options as NativeVoiceOptions), /Invalid trusted native speech configuration/);
});

test('invalid say never starts a child, and idle stop/dispose do not start one', async () => {
  const h = harness();
  for (const [text, rate] of [['', 1.3], ['  ', 1.3], ['a'.repeat(221), 1], ['text', 0.49], ['text', 2.01], ['text', NaN], ['text', Infinity], [null, 1]]) {
    assert.equal(await h.voice.say(text as string, rate as number), false);
  }
  h.voice.stop();
  await h.voice.dispose();
  assert.equal(await h.voice.say('After disposal.', 1.3), false);
  assert.equal(h.calls.length, 0);
});

test('valid say lazily uses direct hidden spawn and transports literal text only as JSON stdin', async () => {
  const h = harness({ culture: 'zh-CN' });
  const text = '<tag>& 中文 "quote"\n`whoami` $(whoami)';
  assert.equal(h.calls.length, 0);
  const pending = h.voice.say(text, 1.3);
  assert.deepEqual(h.calls, [[helperPath, ['memory', 'zh-CN'], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }]]);
  assert.equal(h.child().commands.length, 0);
  h.ready();
  assert.deepEqual(h.child().commands, [{ op: 'say', id: '1', text, rate: 1.3 }]);
  h.done('1', { wave });
  assert.equal(await pending, true);
  assert.deepEqual(h.diagnostics.find(d => 'event' in d && d.event === 'utterance_done'), { event: 'utterance_done', sink: 'memory', ok: true, reason: 'completed', wave });
  await h.voice.dispose();
});

for (const line of ['not-json', 'null', 'true', 'false', '42', '"text"', '[]', '[{"type":"ready"}]']) {
  test(`malformed child reply ${line} is contained, settles false and closes the child`, async () => {
    const h = harness();
    const pending = h.voice.say('Synthetic text.', 1.3);
    assert.doesNotThrow(() => h.child().stdout.emit('data', line + '\n'));
    assert.equal(await pending, false);
    assert.equal(h.child().kills, 1);
    await h.voice.dispose();
    assert.ok(h.diagnostics.some(d => !('event' in d) && d.reason === 'malformed_reply'));
    assert.ok(h.diagnostics.some(d => 'event' in d && d.event === 'child_closed'));
  });
}

for (const extra of [{ ok: 'true' }, { reason: null }, { sink: 'device' }, { wave: [] }, { wave: { ...wave, duration_ms: '22' } }, { wave: { ...wave, sha256: 'invalid' } }]) {
  test(`invalid done envelope fails closed: ${JSON.stringify(extra)}`, async () => {
    const h = harness();
    const pending = h.voice.say('Synthetic text.', 1.3);
    h.ready();
    assert.doesNotThrow(() => h.done('1', extra));
    assert.equal(await pending, false);
    assert.equal(h.child().kills, 1);
    assert.ok(h.diagnostics.some(d => !('event' in d) && d.reason === 'unexpected_reply'));
    await h.voice.dispose();
  });
}

test('fragmented ready and completion lines are buffered without requiring one data event per reply', async () => {
  const h = harness();
  const pending = h.voice.say('Synthetic text.', 1);
  h.child().stdout.emit('data', '{"type":"rea');
  assert.equal(h.child().commands.length, 0);
  h.child().stdout.emit('data', 'dy","sink":"memory","culture":"en-US","max_text":220}\n{"type":"done","id":"1","ok":true,"reason":"completed","sink":"memory","wave":null}\n');
  assert.equal(await pending, true);
  await h.voice.dispose();
});

test('stop settles immediately and ignores a late successful completion', async () => {
  const h = harness();
  const pending = h.voice.say('Old utterance.', 1);
  h.ready();
  h.voice.stop();
  assert.equal(await pending, false);
  assert.deepEqual(h.child().commands.map(c => c.op), ['say', 'stop']);
  h.done('1');
  assert.equal(h.diagnostics.some(d => 'event' in d && d.event === 'utterance_done'), false);
  await h.voice.dispose();
});

test('replacement sends stop before say and an old ID cannot settle the replacement', async () => {
  const h = harness();
  const old = h.voice.say('Old utterance.', 1);
  h.ready();
  const next = h.voice.say('New utterance.', 1.3);
  let settled = false;
  void next.then(() => { settled = true; });
  assert.equal(await old, false);
  assert.deepEqual(h.child().commands.map(c => [c.op, c.id]), [['say', '1'], ['stop', undefined], ['say', '2']]);
  h.done('1');
  await Promise.resolve();
  assert.equal(settled, false);
  h.done('2');
  assert.equal(await next, true);
  await h.voice.dispose();
});

test('stop during startup prevents a later ready from submitting the stopped utterance', async () => {
  const h = harness();
  const old = h.voice.say('Old startup utterance.', 1);
  h.voice.stop();
  assert.equal(await old, false);
  h.ready();
  assert.deepEqual(h.child().commands, []);
  const next = h.voice.say('New utterance.', 1);
  assert.equal(h.calls.length, 1);
  h.done('2');
  assert.equal(await next, true);
  await h.voice.dispose();
});

test('replacement during startup submits only the newest utterance after ready', async () => {
  const h = harness();
  const old = h.voice.say('Old startup utterance.', 1);
  const next = h.voice.say('New startup utterance.', 1);
  assert.equal(await old, false);
  h.ready();
  assert.deepEqual(h.child().commands, [{ op: 'say', id: '2', text: 'New startup utterance.', rate: 1 }]);
  h.done('2');
  assert.equal(await next, true);
  await h.voice.dispose();
});

test('timeout settles false, kills once, and ignores a success while closing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness({ timeoutMs: 35 }, { killCloses: false });
  const pending = h.voice.say('Timed-out utterance.', 1);
  h.ready();
  t.mock.timers.tick(35);
  assert.equal(await pending, false);
  assert.equal(h.child().kills, 1);
  h.done('1');
  assert.equal(await h.voice.say('Before close.', 1), false);
  assert.equal(h.calls.length, 1);
  h.child().close(null, 'SIGTERM');
  await h.voice.dispose();
  assert.ok(h.diagnostics.some(d => !('event' in d) && d.reason === 'timeout'));
});

test('a closed old child cannot ready, submit or complete a new child generation', async () => {
  const h = harness();
  const old = h.voice.say('Old child.', 1);
  const first = h.child();
  first.close();
  assert.equal(await old, false);
  const next = h.voice.say('New child.', 1);
  let settled = false;
  void next.then(() => { settled = true; });
  h.ready(first);
  h.done('2', {}, first);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(first.commands, []);
  assert.deepEqual(h.child().commands, []);
  h.ready();
  h.done('2');
  assert.equal(await next, true);
  await h.voice.dispose();
});

test('a diagnostic callback starting another utterance cannot let old completion settle it', async () => {
  let next: Promise<boolean> | undefined;
  let once = false;
  const h = harness({ onDiagnostic: value => {
    if ('event' in value && value.event === 'utterance_done' && !once) { once = true; next = h.voice.say('From diagnostic.', 1); }
  } });
  const first = h.voice.say('First utterance.', 1);
  h.ready();
  h.done('1');
  assert.equal(await first, true);
  let settled = false;
  void next!.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  h.done('2', { ok: false, reason: 'native_failure' });
  assert.equal(await next, false);
  await h.voice.dispose();
});

test('a buffered old-child reply cannot complete a generation replaced inside a diagnostic callback', async () => {
  let next: Promise<boolean> | undefined;
  let once = false;
  const h = harness({ onDiagnostic: value => {
    if ('event' in value && value.event === 'utterance_done' && !once) {
      once = true;
      h.child().close();
      next = h.voice.say('Replacement child.', 1);
      h.ready();
    }
  } });
  const first = h.voice.say('First utterance.', 1);
  h.ready();
  const reply = (id: string) => JSON.stringify({ type: 'done', id, ok: true, reason: 'completed', sink: 'memory', wave: null }) + '\n';
  h.child().stdout.emit('data', reply('1') + reply('2'));
  assert.equal(await first, true);
  let settled = false;
  void next!.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  h.done('2', { ok: false, reason: 'native_failure' });
  assert.equal(await next, false);
  await h.voice.dispose();
});

test('diagnostic callback exceptions do not escape or change completion', async () => {
  const h = harness({ onDiagnostic: () => { throw new Error('Synthetic observer failure'); } });
  const pending = h.voice.say('Synthetic text.', 1);
  assert.doesNotThrow(() => h.ready());
  assert.doesNotThrow(() => h.done('1'));
  assert.equal(await pending, true);
  await h.voice.dispose();
});

for (const [sink, culture, reason] of [['memory', 'zh-CN', 'voice_unavailable'], ['device', 'en-US', 'native_failure'], ['device', 'en-US', 'cancelled_or_failed']] as const) {
  test(`${culture}/${sink} failure ${reason} remains false`, async () => {
    const h = harness({ sink, culture });
    const pending = h.voice.say('Synthetic text.', 1);
    h.ready();
    h.done('1', { ok: false, reason });
    assert.equal(await pending, false);
    assert.equal(h.child().kills, 0);
    await h.voice.dispose();
  });
}

test('a non-completed reason cannot produce success even when ok is true', async () => {
  const h = harness();
  const pending = h.voice.say('Synthetic text.', 1);
  h.ready();
  h.done('1', { reason: 'cancelled' });
  assert.equal(await pending, false);
  await h.voice.dispose();
});

for (const channel of ['stdout', 'stderr'] as const) {
  test(`${channel} output bounds fail closed`, async () => {
    const h = harness();
    const pending = h.voice.say('Synthetic text.', 1);
    assert.doesNotThrow(() => h.child()[channel].emit('data', 'x'.repeat(channel === 'stdout' ? 8193 : 4097)));
    assert.equal(await pending, false);
    assert.equal(h.child().kills, 1);
    await h.voice.dispose();
  });
}

test('spawn exceptions and child/pipe errors settle false without escaped errors', async () => {
  const refused = createNativeVoice({ helperPath, sink: 'memory', spawnProcess: () => { throw new Error('Synthetic spawn failure'); } });
  assert.equal(await refused.say('Synthetic text.', 1), false);
  await refused.dispose();
  for (const target of ['child', 'stdin'] as const) {
    const h = harness();
    const pending = h.voice.say('Synthetic text.', 1);
    assert.doesNotThrow(() => (target === 'child' ? h.child() : h.child().stdin).emit('error', new Error('Synthetic stream failure')));
    assert.equal(await pending, false);
    assert.equal(h.child().kills, 1);
    await h.voice.dispose();
  }
  const h = harness();
  const pending = h.voice.say('Synthetic text.', 1);
  h.child().stdin.write = () => { throw new Error('Synthetic write failure'); };
  assert.doesNotThrow(() => h.ready());
  assert.equal(await pending, false);
  await h.voice.dispose();
});

test('dispose stops active speech, ends stdin and requires observed graceful close', async () => {
  const h = harness();
  const pending = h.voice.say('Synthetic text.', 1);
  h.ready();
  const disposed = h.voice.dispose();
  assert.equal(await pending, false);
  await disposed;
  assert.deepEqual(h.child().commands.map(c => c.op), ['say', 'stop', 'shutdown']);
  assert.equal(h.child().stdin.writableEnded, true);
  assert.equal(h.child().kills, 0);
  assert.ok(h.diagnostics.some(d => 'event' in d && d.event === 'child_closed'));
  assert.equal(await h.voice.say('After dispose.', 1), false);
  await h.voice.dispose();
});

test('dispose during startup never submits speech after a late ready', async () => {
  const h = harness();
  const pending = h.voice.say('Startup utterance.', 1);
  const disposed = h.voice.dispose();
  h.ready();
  assert.equal(await pending, false);
  await disposed;
  assert.deepEqual(h.child().commands.map(c => c.op), ['shutdown']);
});

test('dispose waits one grace period, then kills and resolves only after observed close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness({}, { shutdownCloses: false });
  const pending = h.voice.say('Synthetic text.', 1);
  const disposed = h.voice.dispose();
  assert.equal(await pending, false);
  let settled = false;
  void disposed.then(() => { settled = true; });
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(h.child().kills, 0);
  t.mock.timers.tick(1);
  await disposed;
  assert.equal(h.child().kills, 1);
  assert.ok(h.diagnostics.some(d => !('event' in d) && d.reason === 'dispose_timeout'));
});

for (const killThrows of [false, true]) {
  test(`dispose rejects when child close is unobserved (killThrows=${killThrows})`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = harness({}, { shutdownCloses: false, killCloses: false, killThrows });
    const pending = h.voice.say('Synthetic text.', 1);
    const disposed = h.voice.dispose();
    const rejection = assert.rejects(disposed, /Native speech child exit not observed/);
    assert.equal(await pending, false);
    t.mock.timers.tick(1000);
    await Promise.resolve();
    assert.equal(h.child().kills, 1);
    t.mock.timers.tick(1000);
    await rejection;
    assert.equal(h.diagnostics.some(d => 'event' in d && d.event === 'child_closed'), false);
    assert.equal(await h.voice.say('After failed dispose.', 1), false);
    h.child().close(null, 'SIGTERM');
  });
}

test('throwing stdin end is contained and disposal still observes killed child close', async () => {
  const h = harness({}, { shutdownCloses: false });
  const pending = h.voice.say('Synthetic text.', 1);
  h.child().stdin.end = () => { throw new Error('Synthetic end failure'); };
  await h.voice.dispose();
  assert.equal(await pending, false);
  assert.equal(h.child().kills, 1);
  assert.ok(h.diagnostics.some(d => !('event' in d) && d.reason === 'stdin_failure'));
});
