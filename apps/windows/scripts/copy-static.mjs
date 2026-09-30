#!/usr/bin/env node
// Copies the app's static files (HTML, CSS and the CommonJS preload scripts, which tsc does not emit)
// next to the compiled modules in dist/, keeping the source layout.
import { cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(APP, 'dist', 'apps', 'windows');
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
for (const file of walk(join(APP, 'src')).filter((f) => /\.(html|css|cjs)$/.test(f))) {
  cpSync(file, join(OUT, relative(APP, file)));
  console.log(`copied ${relative(APP, file)}`);
}
