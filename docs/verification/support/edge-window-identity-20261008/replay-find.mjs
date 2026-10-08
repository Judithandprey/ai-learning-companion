// Offline source-bound fixture replay, not C#/Win32 execution or a proposed production selector.
// Run with Node --permission and read grants only. Every window below except observed metadata is synthetic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(process.argv[2], 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),
  '1a0dfc3f178a1d6f59233c2a7d6a836ce68b18887affd2f6431c2d4ef5c48218');
const method = source.match(/  public static IntPtr Find\(uint\[\] pids, string title, bool exact\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(method);
// Adapt only language scaffolding/API return shapes; preserve the extracted predicates and early callback return.
let body = method;
for (const [from, to] of [
  ['IntPtr found = IntPtr.Zero;', 'let found = 0;'],
  ['uint pid; GetWindowThreadProcessId(h, out pid);', 'const pid = GetWindowThreadProcessId(h);'],
  ['Array.IndexOf(pids, pid)', 'pids.indexOf(pid)'],
  ['var s = new StringBuilder(512); GetWindowText(h, s, 512);', 'const s = GetWindowText(h);'],
  ['string t = s.ToString();', 'const t = s;'],
  ['t.Contains(title)', 't.includes(title)'],
  ['}, IntPtr.Zero);', '}, 0);'],
]) {
  assert.equal(body.split(from).length, 2, `unique source fragment: ${from}`);
  body = body.replace(from, to);
}
const program = new vm.Script(`((pids, title, exact) => {${body}\n})(pids, null, false)`);
const recorded = JSON.parse(readFileSync(new URL('./saved-evidence.json', import.meta.url))).recorded_steps[1].before_window;
const narrow = { ...recorded, title: 'synthetic unspecified owned chrome' };
const surface = { handle: '200', owner: 14104, visible: true, topmost: false,
  bounds: [0, 0, 2560, 1600], title: 'synthetic intended generated surface' };
const decoy = { ...surface, handle: '300', title: 'synthetic different page, same PID and geometry' };
const fixtures = [
  ['surface_only_control', [surface], '200', '200'],
  ['recorded_narrow_window_first', [narrow, surface], narrow.handle, '200'],
  ['same_windows_reverse_order', [surface, narrow], '200', '200'],
  ['normal_decoy_first', [decoy, surface], '300', null],
  ['same_geometry_reverse_order', [surface, decoy], '200', null],
  ['foreign_and_hidden_ignored_control', [{ ...surface, handle: '400', owner: 999 }, { ...surface, handle: '500', visible: false }, surface], '200', '200'],
];
const results = fixtures.map(([name, rows, expectedSourceSelection, requiredUniqueTarget]) => {
  const row = h => rows.find(r => r.handle === h);
  const selected = program.runInNewContext({ pids: [14104],
    EnumWindows(callback) { for (const r of rows) if (!callback(r.handle, 0)) break; },
    GetWindowThreadProcessId: h => row(h).owner,
    IsWindowVisible: h => row(h).visible,
    GetWindowText: h => row(h).title,
  });
  assert.equal(selected, expectedSourceSelection);
  return { name, selected, expected_source_selection: expectedSourceSelection,
    required_unique_target_or_refusal: requiredUniqueTarget,
    meets_identity_boundary: selected === requiredUniqueTarget };
});
console.log(JSON.stringify({ kind: 'synthetic source-bound selection replay',
  source_behavior_checks: results.length, windows_calls: 0,
  limitation: 'Scaffolding translation, not native execution; synthetic alternatives do not prove which other HWNDs existed during the saved attempt.',
  results }, null, 2));
