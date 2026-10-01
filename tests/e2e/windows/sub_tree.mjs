// The released source exactly as committed, in a folder of its own, for the offline changed-path checks
// (sub_changed_*.test.mjs), and the one way those checks write their evidence. Nothing here touches Windows, a window,
// an account or a network.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..', '..');
/**
 * The source the lead released for the changed-path work (handoff_e8b0cc78): the combined correction below plus the
 * Windows lifecycle follow-up (Web 0b42bbc as ba30b46). Its `services` and `packages` are those of FIRST_RELEASE.
 */
export const RELEASED = 'c44e6204b3e0c49f710fc7bb73d540ef6daa7b06';
/** The first combined correction (handoff_8f88fafe): Windows 0fae135 as 44f5fa6, Backend 39620fa. */
export const FIRST_RELEASE = '8eac9fc02ebf10e2e2fca7c164b6c33c2f99698b';
/** The candidate on which QA found QA-SUB-01 to 08: the "before" of every negative control. */
export const BEFORE = '3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e';
export const PYTHON = process.env.QA_PYTHON ?? '/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python';
const PARTS = ['apps/windows', 'services', 'packages', 'pyproject.toml'];

const git = (args, more = {}) => execFileSync('git', ['-C', REPO, ...args], { maxBuffer: 1 << 30, ...more });

/** The tree ids of the commit's parts, so a result names the bytes it was taken on. */
export const treeIds = (commit) => Object.fromEntries(PARTS.map((part) => [part, git(['rev-parse', `${commit}:${part}`], { encoding: 'utf8' }).trim()]));

const made = new Map();
process.on('exit', () => { for (const dir of made.values()) rmSync(dir, { recursive: true, force: true }); });

/**
 * The commit's `apps/windows`, `services`, `packages` and `pyproject.toml` (git archive) in a new folder under the
 * system's temporary folder: made anew by each run, every file compared with the commit's own blob id, and removed when
 * the run ends. Returns the folder. The worktree's own files are never used, and no earlier export is trusted.
 */
export function exportTree(commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('a whole commit id is needed');
  if (made.has(commit)) return made.get(commit);
  const dir = mkdtempSync(join(tmpdir(), `lc-qa-tree-${commit.slice(0, 12)}-`));
  made.set(commit, dir);
  execFileSync('tar', ['-x', '-C', dir], { input: git(['archive', '--format=tar', commit, ...PARTS]) });
  const listed = git(['ls-tree', '-r', '-z', commit, '--', ...PARTS], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const line of listed) {
    const [, kind, id, path] = /^\d+ (\w+) ([0-9a-f]{40})\t(.*)$/s.exec(line);
    if (kind !== 'blob') continue;
    const bytes = readFileSync(join(dir, path));
    if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== id) throw new Error(`the export of ${path} is not the commit's file`);
  }
  if (listed.length < 100) throw new Error('the export is not whole');
  return dir;
}

/**
 * The evidence of one test file. Call `seen(t)` from `afterEach` and `write(observed)` from the last `after`.
 *   - Nothing is written unless QA_EVIDENCE is set; if it is set it must be an existing folder (else this throws).
 *   - A run in which any test did not pass writes NO observation: only the names of those tests, as `failed`.
 *   - The file names the commits and their tree ids, and the sha256 of the harness files that produced it.
 *   - No path of this machine may be in it (this throws instead of writing).
 * Two passing runs of the same files write the same bytes.
 */
export function evidence(stem, harnessFiles, commits) {
  const failed = [];
  let tests = 0;
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  return {
    seen: (t) => { tests += 1; if (!t.passed) failed.push(t.name); },
    write: (observed) => {
      const dir = process.env.QA_EVIDENCE;
      if (!dir) return null;
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error('QA_EVIDENCE is set but is not an existing folder: no evidence was written');
      const harness = Object.fromEntries(harnessFiles.map((name) => [name, createHash('sha256').update(readFileSync(join(HERE, name))).digest('hex')]));
      const trees = Object.fromEntries(Object.entries(commits).map(([name, commit]) => [name, treeIds(commit)]));
      const text = `${JSON.stringify(sorted({ result: { tests, passed: tests - failed.length, failed: [...failed].sort() }, commits, trees, harness,
        observed: failed.length ? 'NOT WRITTEN: a test of this run did not pass, so what it saw is no evidence' : observed }), null, 1)}\n`;
      if (/\/home\/|\/tmp\/|\/mnt\//.test(text) || text.includes(tmpdir())) throw new Error('a path of this machine is in the evidence: not written');
      writeFileSync(join(dir, `${stem}.json`), text);
      return join(dir, `${stem}.json`);
    },
  };
}
