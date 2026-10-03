#!/usr/bin/env node
// Development helper (WSL2 on a Windows host): builds the app and stages it in a NEW directory of the Windows temp
// directory, named as given, next to the official Windows Electron runtime. It never replaces an earlier stage (an
// existing directory of that name is refused and left as it is), starts nothing, and touches no user-data folder,
// profile or sign-in: an earlier package stays where it is and can be opened again as before.
// It writes stage-manifest.json into the stage: every staged file with its SHA-256, and one hash of the whole tree.
//
// Usage: node scripts/stage.mjs <name> [--native-build <verified-local-build-directory>]
// To open the staged app (from PowerShell on Windows; set LC_SUBSCRIPTION_CONNECTOR first to enable the subscription,
// and LC_USER_DATA to keep its data apart from another package's):
//   & '<electron.exe as printed>' '<stage as printed>'

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildAndStage, toWin } from './windows-stage.mjs';

const name = process.argv[2] ?? '';
const args = process.argv.slice(3);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) || (args.length !== 0 && (args.length !== 2 || args[0] !== '--native-build'))) {
  console.error('usage: node scripts/stage.mjs <name> [--native-build <verified-local-build-directory>] (a fresh name for each version)');
  process.exit(2);
}
const { stage, electron } = buildAndStage(name, { fresh: true, nativeBuild: args.length ? args[1] : null });
const walk = (dir) => readdirSync(dir).sort().flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const files = Object.fromEntries(walk(stage).map((f) => [relative(stage, f).split('\\').join('/'), sha(readFileSync(f))]));
// One hash of the whole tree: every path with its file's hash, in order.
const tree = sha(Object.entries(files).map(([path, hash]) => `${path}\0${hash}\n`).join(''));
writeFileSync(join(stage, 'stage-manifest.json'), `${JSON.stringify({ name, tree_sha256: tree, files }, null, 1)}\n`);
console.log(JSON.stringify({ stage: toWin(stage), electron, files: Object.keys(files).length, tree_sha256: tree }, null, 1));
