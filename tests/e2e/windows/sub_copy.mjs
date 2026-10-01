// The private exact-source copy of the released Backend that the real connector runs from (shared by run.mjs and
// signin_launcher.mjs). The connector's question path imports more than its own files: `services/learning/` and, through
// it, `packages/contracts`. A copy without them answers Check connection and refuses every question as `unavailable`
// before anything is sent. So the copy holds both trees, every file is compared with the commit, and the connector's
// own preparation of a question is run in it, offline, before the copy is used.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, chmodSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TREES = ['services', 'packages'];
const root = () => execFileSync('git', ['-C', HERE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Extracts the commit's `services/` and `packages/` into `dir` (private, 0700). Existing files are overwritten. */
export function makeCopy(commit, dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tar = execFileSync('git', ['-C', root(), 'archive', commit, ...TREES], { maxBuffer: 512 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
}

/** Every file of the commit's two trees is in `dir` with the same bytes; nothing else is there but Python's caches. */
export function compareCopy(commit, dir) {
  const listed = execFileSync('git', ['-C', root(), 'ls-tree', '-r', commit, '--', ...TREES], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean).map((line) => { const [meta, path] = line.split('\t'); return { path, blob: meta.split(' ')[2] }; });
  const missing = listed.filter((f) => !existsSync(join(dir, f.path))).map((f) => f.path);
  const present = listed.filter((f) => !missing.includes(f.path));
  const hashes = present.length ? execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd: dir, encoding: 'utf8', input: present.map((f) => f.path).join('\n') + '\n', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean) : [];
  const differing = present.filter((f, i) => hashes[i] !== f.blob).map((f) => f.path);
  const known = new Set(listed.map((f) => f.path));
  const extra = [];
  const walk = (folder) => { for (const name of readdirSync(folder)) { const full = join(folder, name); if (name === '__pycache__') continue;
    if (statSync(full).isDirectory()) walk(full); else if (!known.has(relative(dir, full))) extra.push(relative(dir, full)); } };
  for (const tree of [...new Set(readdirSync(dir))]) { const full = join(dir, tree); if (statSync(full).isDirectory()) walk(full); else extra.push(tree); }
  return { files: listed.length, missing, differing, extra, equal: listed.length > 0 && !missing.length && !differing.length && !extra.length };
}

/**
 * Runs the connector's own preparation of a question in the copy, as the app starts the connector: that Python, the copy
 * as the working folder, no PYTHONPATH. Offline: no Codex, no account, nothing sent. Returns { ok, prompt_bytes, ... }.
 */
export function askPathCheck(python, dir) {
  const code = readFileSync(join(HERE, 'qa_sub_copy_check.py'), 'utf8');
  try {
    const out = execFileSync(python, ['-B', '-c', code], { cwd: dir, encoding: 'utf8', timeout: 60000, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, PYTHONDONTWRITEBYTECODE: '1' } });
    return JSON.parse(out.split('\n').filter((l) => l.startsWith('{')).at(-1));
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.message).split('\n').filter(Boolean).at(-1)?.slice(0, 300) ?? 'failed' };
  }
}
