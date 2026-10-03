#!/usr/bin/env node
// Copies the app's static files (including main-only .mjs adapters, which tsc does not emit)
// next to the compiled modules in dist/, keeping the source layout.
import { cpSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeBuild } from './build-native.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(APP, 'dist', 'apps', 'windows');
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--native-build')) throw new Error('usage: node scripts/copy-static.mjs [--native-build <local-build-directory>]');
// Validate before changing dist. Ordinary builds explicitly omit/remove prior native helpers.
const nativeBuild = args.length ? resolve(args[1]) : null;
if (nativeBuild && (dirname(nativeBuild) !== join(APP, 'native', 'build')
    || !/^build-[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(basename(nativeBuild)) || realpathSync(nativeBuild) !== nativeBuild)) {
  throw new Error('Bundle only a fresh local build under this app\'s native/build directory');
}
const native = nativeBuild ? verifyNativeBuild(nativeBuild) : null;
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
for (const file of walk(join(APP, 'src')).filter((f) => /\.(html|css|cjs|mjs)$/.test(f))) {
  cpSync(file, join(OUT, relative(APP, file)));
  console.log(`copied ${relative(APP, file)}`);
}
const nativeOut = join(OUT, 'native');
rmSync(nativeOut, { recursive: true, force: true });
if (native) {
  mkdirSync(nativeOut, { recursive: true });
  for (const [name, bytes] of Object.entries(native.files)) writeFileSync(join(nativeOut, name), bytes, { flag: 'wx' });
  verifyNativeBuild(nativeOut);
  console.log(`bundled native helper ${native.receipt.executable_sha256}`);
} else console.log('native helper omitted (explicit verified --native-build required)');
