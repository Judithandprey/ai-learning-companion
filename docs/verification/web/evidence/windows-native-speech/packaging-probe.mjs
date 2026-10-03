import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APPROVED_SOURCE_SHA256, verifyNativeBuild } from '/home/agentsdock/Projects/learning-companion/wt-web/apps/windows/scripts/build-native.mjs';
const root = mkdtempSync('/tmp/lc-native-packaging-');
const app = '/home/agentsdock/Projects/learning-companion/wt-web/apps/windows';
const build = join(root, 'native', 'build', 'build-fixture');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
mkdirSync(build, { recursive: true });
mkdirSync(join(root, 'scripts'));
mkdirSync(join(root, 'src', 'main'), { recursive: true });
for (const name of ['build-native.mjs', 'copy-static.mjs']) copyFileSync(join(app, 'scripts', name), join(root, 'scripts', name));
const source = readFileSync(join(app, 'native', 'NativeSpeech.cs'));
const exe = Buffer.from('Synthetic packaging fixture only. Not an executable.');
writeFileSync(join(build, 'NativeSpeech.cs'), source);
writeFileSync(join(build, 'NativeSpeech.exe'), exe);
const framework = String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319`;
const receipt = { schema: 'lc-native-speech-build/1', mode: 'local-compilation', status: 0, error: null,
  source_sha256: APPROVED_SOURCE_SHA256, executable_sha256: sha(exe), compiler: { path: framework + '\\csc.exe', sha256: 'a'.repeat(64) },
  references: ['\\WPF\\System.Speech.dll', '\\System.Web.Extensions.dll'].map(p => ({ path: framework + p, sha256: 'b'.repeat(64) })) };
const save = value => writeFileSync(join(build, 'build.json'), JSON.stringify(value));
save(receipt);
assert.equal(verifyNativeBuild(build).receipt.executable_sha256, sha(exe));
let checks = 1;
for (const invalid of [null, [], { ...receipt, status: 2 }, { ...receipt, error: 'compile_failed' }, { ...receipt, mode: 'external-executable' },
  { ...receipt, source_sha256: 'a'.repeat(64) }, { ...receipt, executable_sha256: 'a'.repeat(64) },
  { ...receipt, compiler: { path: framework + '\\csc.exe', sha256: 'invalid' } }, { ...receipt, references: [] }]) {
  save(invalid); assert.throws(() => verifyNativeBuild(build)); checks++;
}
save(receipt);
writeFileSync(join(build, 'NativeSpeech.exe'), Buffer.from('modified'));
assert.throws(() => verifyNativeBuild(build)); checks++;
writeFileSync(join(build, 'NativeSpeech.exe'), exe);
writeFileSync(join(build, 'NativeSpeech.cs'), Buffer.concat([source, Buffer.from('\n//tampered')]));
assert.throws(() => verifyNativeBuild(build)); checks++;
writeFileSync(join(build, 'NativeSpeech.cs'), source);
unlinkSync(join(build, 'NativeSpeech.exe'));
mkdirSync(join(build, 'NativeSpeech.exe'));
assert.throws(() => verifyNativeBuild(build)); checks++;
rmSync(join(build, 'NativeSpeech.exe'), { recursive: true }); writeFileSync(join(build, 'NativeSpeech.exe'), exe);
copyFileSync(join(app, 'src', 'main', 'native-voice.mjs'), join(root, 'src', 'main', 'native-voice.mjs'));
writeFileSync(join(root, 'src', 'main', 'static.html'), '<p>test</p>');
const nativeOut = join(root, 'dist', 'apps', 'windows', 'native');
mkdirSync(nativeOut, { recursive: true });
mkdirSync(join(root, 'dist', 'apps', 'windows', 'src', 'main'), { recursive: true });
writeFileSync(join(nativeOut, 'NativeSpeech.exe'), 'stale');
process.argv = ['node', join(root, 'scripts', 'copy-static.mjs')];
await import(pathToFileURL(join(root, 'scripts', 'copy-static.mjs')).href + '?ordinary');
assert.equal(existsSync(nativeOut), false); checks++;
assert.deepEqual(readFileSync(join(root, 'dist', 'apps', 'windows', 'src', 'main', 'native-voice.mjs')), readFileSync(join(root, 'src', 'main', 'native-voice.mjs'))); checks++;
process.argv = ['node', join(root, 'scripts', 'copy-static.mjs'), '--native-build', build];
await import(pathToFileURL(join(root, 'scripts', 'copy-static.mjs')).href + '?native');
assert.equal(verifyNativeBuild(nativeOut).receipt.executable_sha256, sha(exe)); checks++;
for (const name of ['NativeSpeech.cs', 'NativeSpeech.exe', 'build.json']) assert.deepEqual(readFileSync(join(nativeOut, name)), readFileSync(join(build, name)));
checks++;
save({ ...receipt, status: 2 });
await assert.rejects(() => import(pathToFileURL(join(root, 'scripts', 'copy-static.mjs')).href + '?invalid'), /successful local compilation/);
assert.equal(verifyNativeBuild(nativeOut).receipt.executable_sha256, sha(exe)); checks++;
const result = { pass: checks, fail: 0, scope: 'Portable synthetic receipt/packaging only. No compiler, executable, helper or Windows process executed.', fixture_root: root };
writeFileSync('/tmp/lc-native-packaging-probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
