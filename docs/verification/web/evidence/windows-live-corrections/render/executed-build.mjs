import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const [rootArg, outArg, commitArg] = process.argv.slice(2);
if (!rootArg || !outArg) throw new Error('build.mjs <read-only source root> <new external build directory>');
const root = resolve(rootArg), out = resolve(outArg);
const commit = commitArg; // input tree is exact `git archive` exported by the shell; Node spawnSync is unavailable in the sandbox
const sourceBytes = name => readFileSync(join(root, name));
if (existsSync(out)) throw new Error('Refuse to replace an existing build/evidence directory');
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = new Map();
function read(name) {
  const full = resolve(root, name);
  if (!full.startsWith(root + '/')) throw new Error('Import leaves project');
  const rel = relative(root, full);
  if (sources.has(rel)) return;
  const bytes = sourceBytes(rel);
  sources.set(rel, bytes);
  if (rel.endsWith('.ts')) {
    for (const m of bytes.toString('utf8').matchAll(/(?:from\s+|import\s*)['"]([^'"]+\.ts)['"]/g)) {
      if (!m[1].startsWith('.')) throw new Error('Unexpected non-local renderer import');
      read(relative(root, resolve(dirname(full), m[1])));
    }
  }
}
read('apps/windows/src/renderer/overlay.ts');
read('apps/windows/src/renderer/overlay.html');
read('apps/windows/src/renderer/overlay.css');
mkdirSync(out, { recursive: true });
const emitted = {}, captured = {};
for (const [name, bytes] of sources) {
  const snapshot = join(out, 'source', name);
  mkdirSync(dirname(snapshot), { recursive: true });
  writeFileSync(snapshot, bytes);
  captured[name] = sha(bytes);
  let data = bytes, targetName = name;
  if (name.endsWith('.ts')) {
    // The repo already uses this Node builtin in its source harness. Erase types
    // only, then change module filenames as a normal browser build does.
    const code = stripTypeScriptTypes(bytes.toString('utf8'), {mode:'strip',sourceUrl:name})
      .replace(/((?:from\s+|import\s*)['"][^'"]+)\.ts(['"])/g,'$1.js$2');
    data = Buffer.from(code);
    if (/(?:from\s+|import\s*)['"][^'"]+\.ts['"]/.test(code)) throw new Error('TypeScript import not rewritten');
    targetName = name.replace(/\.ts$/, '.js');
  }
  const target = join(out, 'dist', targetName);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  emitted[targetName] = sha(data);
}
const after = Object.fromEntries([...sources.keys()].map(name => [name, sha(sourceBytes(name))]));
const stable = JSON.stringify(captured) === JSON.stringify(after);
const manifest = { source_root: root, head: commit ?? execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), snapshot_kind: 'stable read-only snapshot of current corrected working tree; HEAD 9622b51 plus uncommitted corrections',
  at: new Date().toISOString(), compiler: `Node ${process.versions.node} stripTypeScriptTypes`, kind: 'type-erasure and relative import extension rewrite only; no product typecheck',
  source_stable_during_snapshot: stable, source_sha256: captured, source_after_sha256: after, emitted_sha256: emitted,
  worktree_status: commit ? 'uncommitted retained Windows corrections reviewed read-only' : execFileSync('git', ['-C', root, 'status', '--short', '--', ...sources.keys()], {encoding:'utf8'}).trim() };
writeFileSync(join(out, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({head:manifest.head, stable, files:sources.size, compiler:manifest.compiler, wip:manifest.worktree_status !== ''}));
if (!stable) process.exitCode = 1;
