// Exact r2 evidence. Retains original failure expectations; adapts model inputs and emitted C# method signatures.
// Source-bound JS fixtures only: no PowerShell, native methods, process or window calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = resolve(process.argv[2]);
const base = join(root, 'docs/verification/qa/p0-13-tts-52be105/candidate-edge-identity-r2-20261008');
const hash = b => createHash('sha256').update(b).digest('hex');
const bytes = readFileSync(join(base, 'candidate.json'));
assert.equal(hash(bytes), '03344f776afb4ff2110e7450b8c48d86fd0b9d7b394e5473e3ccd7959770cde9');
const manifest = JSON.parse(bytes), runner = readFileSync(join(base, 'runner.ps1'), 'utf8');
assert.equal(hash(runner), '301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa');
const source = join(root, 'tests/e2e/windows/qa_tts_output_candidate.mjs');
assert.equal(hash(readFileSync(source)), manifest.source_files['qa_tts_output_candidate.mjs']);
const { edgeRaiseModel } = await import(pathToFileURL(source));
const fn = name => runner.match(new RegExp(`function ${name}[^\\n]*\\{([\\s\\S]*?)\\n\\}`))?.[1];
const lookup = fn('Get-QaEdgeSurfaceWindow'), pageCheck = fn('Assert-QaEdgeSurfacePage');
assert.equal(lookup.split('Assert-QaEdgeSurfacePage $script:qaEdgeIdentity').length, 3);
assert.ok(lookup.indexOf('Assert-QaEdgeSurfacePage') < lookup.indexOf('Find-QaEdgeSurface'));
assert.ok(lookup.lastIndexOf('Assert-QaEdgeSurfacePage') > lookup.indexOf('$found[0] -ne'));
assert.ok(pageCheck.includes("Eval 'edge'") && pageCheck.includes('document.title.endsWith'));
assert.ok(!pageCheck.includes('document.title ='));
const receipt = fn('Get-QaEdgeWindowReceipt');
assert.ok(receipt.includes('Caption($h, $ids, [string]$identity.token)'));
assert.ok(!receipt.includes('@($g.Owner)'));
assert.ok(receipt.indexOf("$caption -eq -2") < receipt.indexOf('ReadWindow($h)'));

const token = 'lcqaghijklmnopqrstuvghijklmnopqrstuv';
const surface = { handle: 'A', pid: 14104, visible: true, title: `QA test surface ${token}`, topmost: false, minimized: false };
const state = { launched: { pid: 14104, start: 1000, exited: false }, windows: [surface],
  identity: { token, pid: 14104, start: 1000, handle: 'A' },
  target: { url: manifest.surfaceUrl, cachedId: 'page-A', pages: [{ type: 'page', id: 'page-A', url: manifest.surfaceUrl }] },
  page: { href: manifest.surfaceUrl, truth: true, title: surface.title } };
const otherUrl = 'file:///C:/synthetic-other-page.html';
const actionCases = [
  ['valid_bound_page_control', state, true],
  ['original_navigation_counterexample', { ...state,
    target: { ...state.target, pages: [{ type: 'page', id: 'page-A', url: otherUrl }] }, page: { ...state.page, href: otherUrl } }, false],
  ['target_replaced_same_url', { ...state, target: { ...state.target, pages: [{ type: 'page', id: 'page-B', url: manifest.surfaceUrl }] } }, false],
  ['same_url_reload_lost_token', { ...state, page: { ...state.page, title: 'QA test surface' } }, false],
  ['actual_target_topmost', { ...state, windows: [{ ...surface, topmost: true }] }, false],
].map(([name, input, allow]) => {
  const result = edgeRaiseModel(input);
  assert.deepEqual(result.actions, allow ? [['raise', 'A']] : []);
  if (!allow) assert.ok(result.refused);
  return { name, ...result };
});

// Extract actual IsOwned/Caption/Find bodies. Adapt C# scaffolding, never replace the branch predicates.
const edgeClassStart = runner.indexOf('public static class QaEdgeSurface {');
assert.ok(edgeClassStart > 0);
const edgeClass = runner.slice(edgeClassStart, runner.indexOf("\n'@", edgeClassStart));
function method(name, args) {
  const body = edgeClass.match(new RegExp(`public static [^\\n]+ ${name}\\([^\\n]*\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1];
  assert.ok(body, name);
  return `function ${name}(${args}) {${body}\n}`;
}
let translated = method('IsOwned', 'h, pids') + method('Caption', 'h, pids, token') + method('Find', 'pids, token');
translated = translated
  .replace('uint pid;\n    GetWindowThreadProcessId(h, out pid);', 'const pid = GetWindowThreadProcessId(h);')
  .replaceAll('Array.IndexOf(pids, pid)', 'pids.indexOf(pid)')
  .replaceAll('Marshal.GetLastWin32Error()', 'GetLastWin32Error()')
  .replaceAll('s.ToString().IndexOf(token, StringComparison.Ordinal)', 's.ToString().indexOf(token)')
  .replace(/\b(?:int|var) (\w+) =/g, 'let $1 =')
  .replaceAll('new List<IntPtr>()', '[]')
  .replaceAll('EnumProc each =', 'const each =')
  .replaceAll('.Add(h)', '.push(h)')
  .replaceAll('IntPtr.Zero', '0')
  .replaceAll('new InvalidOperationException(', 'new Error(')
  .replaceAll('GC.KeepAlive(each);', '')
  .replace('new QaEdgeScan { Matches = matches.ToArray(), Unknown = unknown.ToArray() }', '{ Matches: matches, Unknown: unknown }');
const compile = operation => new vm.Script(`${translated}\n${operation}`);
const scanProgram = compile('Find(pids, token)'), captionProgram = compile('Caption(handle, pids, token)');
function replay(rows, captionOnly = false) {
  const data = structuredClone(rows), row = h => data.find(w => w.handle === h);
  const reads = [], lengths = new Map(); let lastError = 0;
  const api = { pids: [14104], token, handle: data[0].handle,
    EnumWindows(callback) { for (const w of data) if (!callback(w.handle, 0)) break; return true; },
    GetWindowThreadProcessId: h => row(h).pid,
    IsWindowVisible: h => row(h).visible,
    SetLastError: e => { lastError = e; }, GetLastWin32Error: () => lastError,
    GetWindowTextLength(h) {
      const w = row(h), count = (lengths.get(h) ?? 0) + 1; lengths.set(h, count);
      reads.push({ operation: 'length', pid: w.pid }); lastError = w.lengthError ?? 0;
      const n = count > 1 && w.lengthAfter !== undefined ? w.lengthAfter : w.lengthResult ?? w.title.length;
      if (w.reuseAfterLength) w.pid = 23092;
      return n;
    },
    GetWindowText(h, buffer) {
      const w = row(h); reads.push({ operation: 'text', pid: w.pid });
      if (w.readFails) return 0;
      buffer.value = w.title; return buffer.value.length;
    },
    StringBuilder: class { constructor(n) { this.Capacity = n; } ToString() { return this.value; } },
  };
  const result = (captionOnly ? captionProgram : scanProgram).runInNewContext(api);
  return { result: JSON.parse(JSON.stringify(result)), caption_reads: reads };
}
const scanCases = [
  ['empty_caption_control', { ...surface, handle: 'B', title: '' }, []],
  ['two_readable_tokens_control', { ...surface, handle: 'B' }, []],
  ['original_second_caption_read_failure', { ...surface, handle: 'B', readFails: true }, ['B']],
  ['original_second_caption_over_limit', { ...surface, handle: 'B', lengthResult: 5000 }, ['B']],
  ['length_failure_is_not_empty', { ...surface, handle: 'B', lengthResult: 0, lengthError: 5 }, ['B']],
  ['caption_changed_during_read', { ...surface, handle: 'B', lengthAfter: 7 }, ['B']],
].map(([name, second, unknown]) => {
  const actual = replay([surface, second]);
  assert.deepEqual(actual.result.Unknown, unknown);
  assert.deepEqual(actual.result.Matches, name === 'two_readable_tokens_control' ? ['A', 'B'] : ['A']);
  const lookupAccepts = actual.result.Unknown.length === 0 && actual.result.Matches.length === 1 && actual.result.Matches[0] === 'A';
  assert.equal(lookupAccepts, name === 'empty_caption_control');
  return { name, ...actual, lookup_accepts: lookupAccepts };
});
const changedOwner = replay([{ ...surface, pid: 23092 }], true);
assert.equal(changedOwner.result, -2); assert.deepEqual(changedOwner.caption_reads, []);
const unchangedOwner = replay([surface], true);
assert.equal(unchangedOwner.result, 1); assert.ok(unchangedOwner.caption_reads.length > 0);
const residualRace = replay([{ ...surface, reuseAfterLength: true }], true);
assert.equal(residualRace.result, -2);
assert.ok(residualRace.caption_reads.some(r => r.pid === 23092));
console.log(JSON.stringify({ revision: '151f7d741e2b88912a94f0b24473594e236d0076', windows_calls: 0,
  adaptations: ['R1 passes valid nested target and page inputs with unchanged HWND/PID/token and valid control.',
    'R2 uses actual emitted IsOwned/Caption/Find return codes and Matches/Unknown interface; old unsafe expectations remain refusal.',
    'R3 uses fixed owned IDs and Caption before metadata; tests both unchanged and already-changed owners.'],
  limitations: 'Exported action model plus source call trace; mechanically adapted C# predicates with literal API results, not native method execution.',
  r1: actionCases, r2: scanCases, r3: { unchanged_owner_control: unchangedOwner, already_changed_owner: changedOwner },
  residual_check_read_race: { ...residualRace, interpretation: 'Rejected afterwards, but one foreign text read occurred in the injected gap; no atomic zero-read claim.' },
}, null, 2));
