#!/usr/bin/env node
// Explicit Windows-only local compilation. Never import a precompiled candidate helper.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APPROVED_SOURCE_SHA256 = 'c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd';
const FRAMEWORK = String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319`;
const COMPILER = `${FRAMEWORK}\\csc.exe`;
const REFERENCES = [`${FRAMEWORK}\\WPF\\System.Speech.dll`, `${FRAMEWORK}\\System.Web.Extensions.dll`];
const SCHEMA = 'lc-native-speech-build/1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readRegular = file => {
  if (!lstatSync(file).isFile()) throw new Error(`Expected a regular native build file: ${file}`);
  return readFileSync(file);
};

/** Verify fixed artifact names and return the bytes actually checked, so packaging cannot reread changed files. */
export function verifyNativeBuild(directory) {
  const root = resolve(directory);
  const files = Object.fromEntries(['NativeSpeech.cs', 'NativeSpeech.exe', 'build.json'].map(name => [name, readRegular(join(root, name))]));
  const receipt = JSON.parse(files['build.json'].toString('utf8'));
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
      || receipt.schema !== SCHEMA || receipt.mode !== 'local-compilation' || receipt.status !== 0 || receipt.error !== null
      || receipt.source_sha256 !== APPROVED_SOURCE_SHA256 || sha256(files['NativeSpeech.cs']) !== APPROVED_SOURCE_SHA256
      || !hash(receipt.executable_sha256) || sha256(files['NativeSpeech.exe']) !== receipt.executable_sha256
      || receipt.compiler?.path !== COMPILER || !hash(receipt.compiler?.sha256)
      || !Array.isArray(receipt.references) || receipt.references.length !== REFERENCES.length
      || REFERENCES.some((path, i) => receipt.references[i]?.path !== path || !hash(receipt.references[i]?.sha256))) {
    throw new Error('Native helper must match a successful local compilation receipt and the approved source');
  }
  return { root, receipt, files, helperPath: join(root, 'NativeSpeech.exe') };
}

function compile(label) {
  if (process.platform !== 'win32') throw new Error('Local native compilation requires the installed Windows Node and .NET compiler');
  if (!/^build-[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(label)) throw new Error('Use a fresh build-<label>');
  const source = readRegular(join(APP, 'native', 'NativeSpeech.cs'));
  if (sha256(source) !== APPROVED_SOURCE_SHA256) throw new Error('Native speech source does not match the human-approved source pin');
  const compiler = { path: COMPILER, sha256: sha256(readRegular(COMPILER)) };
  const references = REFERENCES.map(path => ({ path, sha256: sha256(readRegular(path)) }));
  const builderSha = sha256(readRegular(fileURLToPath(import.meta.url)));
  const parent = join(APP, 'native', 'build');
  const output = join(parent, label);
  if (existsSync(output)) throw new Error('Refuse to overwrite existing native build evidence; choose a fresh label');
  mkdirSync(parent, { recursive: true });
  mkdirSync(output); // Atomic refusal even if another compilation chose the same name.
  const sourcePath = join(output, 'NativeSpeech.cs');
  const executablePath = join(output, 'NativeSpeech.exe');
  writeFileSync(sourcePath, source, { flag: 'wx' });
  const result = spawnSync(COMPILER, ['/nologo', '/target:exe', '/optimize+', `/out:${executablePath}`,
    ...REFERENCES.map(path => `/reference:${path}`), sourcePath],
  { windowsHide: true, shell: false, timeout: 30_000, encoding: 'utf8', maxBuffer: 65_536 });
  let error = result.error?.code ?? null;
  let executableSha = null;
  try {
    if (existsSync(executablePath)) executableSha = sha256(readRegular(executablePath));
    if (result.status === 0 && !executableSha) error = 'missing_executable';
    else if (result.status === 0 && (sha256(readRegular(sourcePath)) !== APPROVED_SOURCE_SHA256
        || sha256(readRegular(COMPILER)) !== compiler.sha256
        || references.some(r => sha256(readRegular(r.path)) !== r.sha256))) error = 'build_input_changed';
  } catch { error = 'build_artifact_read_failed'; }
  const receipt = {
    schema: SCHEMA, mode: 'local-compilation', at: new Date().toISOString(), node: process.version,
    builder_sha256: builderSha,
    source_sha256: APPROVED_SOURCE_SHA256, executable_sha256: executableSha,
    compiler, references, status: result.status, signal: result.signal, error,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
  };
  writeFileSync(join(output, 'build.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, ...receipt }, null, 2));
  if (receipt.status !== 0 || receipt.error !== null) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length === 4 && process.argv[2] === '--verify') {
      const { root, receipt } = verifyNativeBuild(process.argv[3]);
      console.log(JSON.stringify({ output: root, status: receipt.status, source_sha256: receipt.source_sha256, executable_sha256: receipt.executable_sha256 }));
    } else if (process.argv.length === 3) compile(process.argv[2]);
    else throw new Error('usage: node scripts/build-native.mjs build-<fresh-label> | --verify <build-directory>');
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
