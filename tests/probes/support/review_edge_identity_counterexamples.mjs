// Offline evidence for exact b9ce4cc. No child-process/write permission; no PowerShell or native methods.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = resolve(process.argv[2]);
const base = join(root, 'docs/verification/qa/p0-13-tts-52be105/candidate-edge-identity-20261008');
const hash = b => createHash('sha256').update(b).digest('hex');
const manifestBytes = readFileSync(join(base, 'candidate.json'));
assert.equal(hash(manifestBytes), 'd8d87df4c9cc9b32782e634dab963f83ace4960221db19508b4c877c9059f3f8');
const manifest = JSON.parse(manifestBytes);
const runner = readFileSync(join(base, 'runner.ps1'), 'utf8');
assert.equal(hash(runner), 'f739487b513cc4f749ac4cc95cfa0a64ba58e23670d9fdc4d14753df4ae3e44f');
const generator = join(root, 'tests/e2e/windows/qa_tts_output_candidate.mjs');
assert.equal(hash(readFileSync(generator)), manifest.source_files['qa_tts_output_candidate.mjs']);
const { edgeRaiseModel, edgeTargetModel } = await import(pathToFileURL(generator));
const fn = name => runner.match(new RegExp(`function ${name}[^\\n]*\\{([\\s\\S]*?)\\n\\}`))?.[1];
const lookup = fn('Get-QaEdgeSurfaceWindow');
assert.ok(lookup.includes('Find-QaEdgeSurface $script:qaEdgeIdentity'));
assert.equal(/Get-QaEdgeSocket|Get-Socket|\bEval\b|Invoke-Cdp/.test(lookup + fn('Find-QaEdgeSurface') + fn('Get-QaOwnedEdgeIds')), false);

const token = 'lcqaghijklmnopqrstuvghijklmnopqrstuv';
const window = { handle: 'A', pid: 14104, visible: true, title: `QA test surface ${token}`, topmost: false, minimized: false };
const state = { launched: { pid: 14104, start: 1000, exited: false }, windows: [window],
  identity: { token, pid: 14104, start: 1000, handle: 'A' } };
const target = { url: manifest.surfaceUrl, cachedId: 'page-A',
  pages: [{ type: 'page', id: 'page-A', url: 'file:///C:/synthetic-other-page.html' }] };
let pageRefusal;
try { edgeTargetModel(target); } catch (e) { pageRefusal = e.message; }
assert.match(pageRefusal, /navigated or ended/);
const action = edgeRaiseModel({ ...state, ...target });
assert.deepEqual(action.actions, [['raise', 'A']]);

// Preserve native Find's predicates; translate language scaffolding/API return shapes into injected JS only.
let body = runner.match(/public static IntPtr\[\] Find\(uint\[\] pids, string token\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(body);
for (const [from, to] of [
  ['var found = new List<IntPtr>();', 'const found = [];'],
  ['EnumProc each =', 'const each ='],
  ['uint pid;\n      GetWindowThreadProcessId(h, out pid);', 'const pid = GetWindowThreadProcessId(h);'],
  ['Array.IndexOf(pids, pid)', 'pids.indexOf(pid)'],
  ['int n = GetWindowTextLength(h);', 'const n = GetWindowTextLength(h);'],
  ['var s = new StringBuilder(n + 1);', 'const s = new StringBuilder(n + 1);'],
  ['s.ToString().IndexOf(token, StringComparison.Ordinal)', 's.ToString().indexOf(token)'],
  ['found.Add(h)', 'found.push(h)'],
  ['IntPtr.Zero', '0'],
  ['new InvalidOperationException(', 'new Error('],
  ['GC.KeepAlive(each);', ''],
  ['found.ToArray()', 'found'],
]) {
  assert.equal(body.split(from).length, 2, from);
  body = body.replace(from, to);
}
const find = new vm.Script(`((pids, token) => {${body}\n})(pids, token)`);
function replay(rows, pids = [14104]) {
  const row = h => rows.find(w => w.handle === h), captionReads = [];
  const result = find.runInNewContext({ pids, token,
    EnumWindows(callback) { for (const w of rows) if (!callback(w.handle, 0)) break; return true; },
    GetWindowThreadProcessId: h => row(h).pid,
    IsWindowVisible: h => row(h).visible,
    GetWindowTextLength(h) { captionReads.push(row(h).pid); return row(h).lengthResult ?? row(h).title.length; },
    GetWindowText(h, buffer) { if (row(h).readFails) return 0; buffer.value = row(h).title; return buffer.value.length; },
    StringBuilder: class { constructor(n) { this.Capacity = n; } ToString() { return this.value; } },
  });
  return { matches: Array.from(result), caption_reads_for_pids: captionReads };
}
const cases = [
  ['empty_caption_control', { ...window, handle: 'B', title: '' }, 1, false],
  ['two_readable_tokens_control', { ...window, handle: 'B' }, 2, true],
  ['owned_second_caption_read_failure', { ...window, handle: 'B', readFails: true }, 1, true],
  ['owned_second_caption_over_limit', { ...window, handle: 'B', lengthResult: 5000 }, 1, true],
].map(([name, second, expectedCount, requiredRefusal]) => {
  const actual = replay([window, second]);
  assert.equal(actual.matches.length, expectedCount);
  const currentLookupAccepts = actual.matches.length === 1 && actual.matches[0] === 'A';
  return { name, ...actual, required_refusal: requiredRefusal,
    lookup_accepts: currentLookupAccepts, violates_boundary: requiredRefusal && currentLookupAccepts };
});
const receipt = fn('Get-QaEdgeWindowReceipt');
assert.ok(receipt.includes('[QaEdgeSurface]::Find([uint32[]]@($g.Owner), [string]$identity.token)'));
const foreignOwner = 23092; // Synthetic reuse between Owned(...) and ReadWindow(...).
const staleReceipt = replay([{ ...window, pid: foreignOwner }], [foreignOwner]);
assert.ok(staleReceipt.caption_reads_for_pids.includes(foreignOwner));
console.log(JSON.stringify({ revision: 'b9ce4cc56c375909befea38d410bc9e233ebc953', windows_calls: 0,
  limitation: 'Source call-graph plus exact exported model and scaffolding-translated Find fixtures; not runtime PowerShell/C# execution or an observed navigation/API failure.',
  r1: { hwnd_lookup_revalidates_page: false, isolated_page_check_refuses: pageRefusal, action_model: action },
  r2: cases,
  r3: { scenario: 'Owned returns owned HWND A, then ReadWindow(A) reports foreign PID 23092; receipt uses that PID as new Find whitelist', ...staleReceipt },
}, null, 2));
