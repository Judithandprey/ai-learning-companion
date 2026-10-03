// Portable provider/bundle checks. Native children, audio devices and Electron are never started here.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { bundledSystemVoice, createSystemVoice, NATIVE_SOURCE_SHA256 } from '../src/main/native-speech.ts';
import type { NativeVoiceOptions } from '../src/main/native-voice.mjs';

const defer = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let n = 0; n < 8; n += 1) await Promise.resolve(); };
const children = () => {
  const made: Array<{ options: NativeVoiceOptions; calls: Array<{ text: string; rate: number; end: ReturnType<typeof defer<boolean>> }>; stops: number; disposes: number; exit: ReturnType<typeof defer<void>>; holdExit: boolean }> = [];
  const make = (options: NativeVoiceOptions) => {
    const child = { options, calls: [] as typeof made[number]['calls'], stops: 0, disposes: 0, exit: defer<void>(), holdExit: false };
    made.push(child);
    return {
      say: (text: string, rate: number) => { const end = defer<boolean>(); child.calls.push({ text, rate, end }); return end.promise; },
      stop: () => { child.stops += 1; child.calls.at(-1)?.end.resolve(false); },
      dispose: () => { child.disposes += 1; child.calls.at(-1)?.end.resolve(false); if (!child.holdExit) child.exit.resolve(); return child.exit.promise; },
    };
  };
  return { made, make };
};

test('system provider is lazy, keeps same-language pieces, and reaps before switching language', async () => {
  const f = children();
  const voice = createSystemVoice({ helperPath: '/synthetic/NativeSpeech.exe', sink: 'memory', make: f.make });
  assert.equal(voice.audible, false);
  assert.equal(f.made.length, 0);
  let said = voice.say('English first.', 1.3, 'en-US');
  await settle();
  assert.deepEqual(f.made[0]!.options, { helperPath: '/synthetic/NativeSpeech.exe', sink: 'memory', culture: 'en-US' });
  f.made[0]!.calls[0]!.end.resolve(true);
  assert.equal(await said, true);
  said = voice.say('English again.', 1.4, 'en-US');
  await settle();
  assert.equal(f.made.length, 1);
  f.made[0]!.calls[1]!.end.resolve(true);
  assert.equal(await said, true);
  f.made[0]!.holdExit = true;
  said = voice.say('中文提示。', 1.3, 'zh-CN');
  await settle();
  assert.deepEqual([f.made.length, f.made[0]!.disposes], [1, 1], 'no replacement child before old exit');
  f.made[0]!.exit.resolve();
  await settle();
  assert.deepEqual([f.made.length, f.made[1]!.options.culture, f.made[1]!.calls[0]!.text], [2, 'zh-CN', '中文提示。']);
  f.made[1]!.calls[0]!.end.resolve(true);
  assert.equal(await said, true);
  await voice.dispose();
});

test('Stop while a language switch waits for exit drops that unsaid piece; later explicit speech uses a fresh child', async () => {
  const f = children();
  const voice = createSystemVoice({ helperPath: '/synthetic/NativeSpeech.exe', sink: 'memory', make: f.make });
  const first = voice.say('Old answer.', 1.3, 'en-US');
  await settle(); f.made[0]!.calls[0]!.end.resolve(true); assert.equal(await first, true);
  f.made[0]!.holdExit = true;
  const waiting = voice.say('旧回应。', 1.3, 'zh-CN');
  await settle();
  voice.stop();
  f.made[0]!.exit.resolve();
  assert.equal(await waiting, false);
  assert.equal(f.made.length, 1);
  const fresh = voice.say('新的回应。', 1.3, 'zh-CN');
  await settle(); assert.equal(f.made.length, 2);
  f.made[1]!.calls[0]!.end.resolve(true); assert.equal(await fresh, true);
  await voice.dispose();
});

test('session disposal cancels active speech, fences its late success and waits for actual exit before reuse', async () => {
  const f = children();
  const voice = createSystemVoice({ helperPath: '/synthetic/NativeSpeech.exe', sink: 'memory', make: f.make });
  const old = voice.say('Old response.', 1.3, 'en-US');
  await settle(); f.made[0]!.holdExit = true;
  const ended = voice.dispose();
  assert.equal(await old, false);
  const fresh = voice.say('New session.', 1.3, 'en-US');
  await settle(); assert.equal(f.made.length, 1);
  f.made[0]!.exit.resolve(); await ended; await settle();
  assert.equal(f.made.length, 2);
  f.made[1]!.calls[0]!.end.resolve(true); assert.equal(await fresh, true);
  await voice.dispose();
});

test('unobserved child exit fails closed and prevents a replacement child', async () => {
  const f = children();
  const voice = createSystemVoice({ helperPath: '/synthetic/NativeSpeech.exe', sink: 'memory', make: f.make });
  const old = voice.say('Do not restart.', 1.3, 'en-US');
  await settle(); f.made[0]!.holdExit = true;
  const ended = voice.dispose();
  f.made[0]!.exit.reject(new Error('exit not observed'));
  await assert.rejects(ended, /exit not observed/);
  assert.equal(await old, false);
  assert.equal(await voice.say('Another request.', 1.3, 'zh-CN'), false);
  assert.equal(f.made.length, 1);
});

const folders: string[] = [];
after(() => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); });
test('only a consistent approved-source local build bundle enables the lazy Windows provider', () => {
  const folder = mkdtempSync(join(tmpdir(), 'lc-native-bundle-test-')); folders.push(folder);
  const source = readFileSync(new URL('../native/NativeSpeech.cs', import.meta.url));
  const executable = Buffer.from('synthetic executable bytes: NEVER executed');
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(source), NATIVE_SOURCE_SHA256);
  writeFileSync(join(folder, 'NativeSpeech.cs'), source);
  writeFileSync(join(folder, 'NativeSpeech.exe'), executable);
  const framework = String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319`;
  const build = { schema: 'lc-native-speech-build/1', mode: 'local-compilation', status: 0, error: null, source_sha256: NATIVE_SOURCE_SHA256, executable_sha256: hash(executable),
    compiler: { path: `${framework}\\csc.exe`, sha256: 'a'.repeat(64) }, references: [`${framework}\\WPF\\System.Speech.dll`, `${framework}\\System.Web.Extensions.dll`].map(path => ({ path, sha256: 'b'.repeat(64) })) };
  const receipt = (value: unknown) => writeFileSync(join(folder, 'build.json'), JSON.stringify(value));
  receipt(build);
  assert.equal(bundledSystemVoice(folder, 'linux'), null);
  assert.equal(bundledSystemVoice(folder, 'win32')?.audible, true, 'configured device route only; it starts nothing');
  for (const value of [null, [], { ...build, status: 1 }, { ...build, error: 'input_changed' }, { ...build, mode: 'imported-binary' }, { ...build, source_sha256: '0'.repeat(64) }, { ...build, executable_sha256: '0'.repeat(64) }, { ...build, compiler: null }, { ...build, references: [] }, { ...build, references: [null, build.references[1]] }]) {
    receipt(value); assert.equal(bundledSystemVoice(folder, 'win32'), null);
  }
  receipt(build); writeFileSync(join(folder, 'NativeSpeech.cs'), 'changed');
  assert.equal(bundledSystemVoice(folder, 'win32'), null);
});

test('bundle bytes are checked before first spawn and adapter restart after a same-language idle exit', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'lc-native-spawn-test-')); folders.push(folder);
  const source = readFileSync(new URL('../native/NativeSpeech.cs', import.meta.url));
  const executable = Buffer.from('synthetic executable bytes, only stream doubles can be spawned');
  const framework = String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319`;
  writeFileSync(join(folder, 'NativeSpeech.cs'), source);
  writeFileSync(join(folder, 'NativeSpeech.exe'), executable);
  writeFileSync(join(folder, 'build.json'), JSON.stringify({ schema: 'lc-native-speech-build/1', mode: 'local-compilation', status: 0, error: null, source_sha256: NATIVE_SOURCE_SHA256,
    executable_sha256: createHash('sha256').update(executable).digest('hex'), compiler: { path: `${framework}\\csc.exe`, sha256: 'a'.repeat(64) },
    references: [`${framework}\\WPF\\System.Speech.dll`, `${framework}\\System.Web.Extensions.dll`].map(path => ({ path, sha256: 'b'.repeat(64) })) }));
  const spawned: Array<{ child: EventEmitter; stdout: PassThrough }> = [];
  const fakeSpawn = (path: string, args: string[]) => {
    assert.equal(path, join(folder, 'NativeSpeech.exe')); assert.deepEqual(args, ['device', 'en-US']);
    const stdout = new PassThrough(); const child = new EventEmitter();
    const stdin = new Writable({ write(bytes, _encoding, done) {
      const msg = JSON.parse(String(bytes)) as { op: string; id: string };
      if (msg.op === 'say') stdout.write(`${JSON.stringify({ type: 'done', id: msg.id, sink: 'device', ok: true, reason: 'completed', wave: null })}\n`);
      done();
    } });
    spawned.push({ child, stdout });
    return Object.assign(child, { stdin, stdout, stderr: new PassThrough(), kill: () => { child.emit('close', 0, null); return true; } });
  };
  const before = bundledSystemVoice(folder, 'win32', fakeSpawn)!;
  writeFileSync(join(folder, 'NativeSpeech.exe'), 'changed before first say');
  assert.equal(await before.say('No child.', 1.3, 'en-US'), false);
  assert.equal(spawned.length, 0);
  await before.dispose();
  writeFileSync(join(folder, 'NativeSpeech.exe'), executable);
  const voice = bundledSystemVoice(folder, 'win32', fakeSpawn)!;
  const first = voice.say('One authorized piece.', 1.3, 'en-US');
  await settle(); assert.equal(spawned.length, 1);
  spawned[0]!.stdout.write(`${JSON.stringify({ type: 'ready', sink: 'device', culture: 'en-US', max_text: 220 })}\n`);
  assert.equal(await first, true);
  spawned[0]!.child.emit('close', 0, null); // native helper's normal idle exit, without disposing its adapter
  writeFileSync(join(folder, 'NativeSpeech.exe'), 'changed before idle restart');
  assert.equal(await voice.say('Must not restart changed bytes.', 1.3, 'en-US'), false);
  assert.equal(spawned.length, 1);
  await voice.dispose();
});
