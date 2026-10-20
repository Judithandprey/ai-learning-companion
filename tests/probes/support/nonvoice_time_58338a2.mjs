// Focused independent wrapper ordering review. Every operational effect is injected memory.
// Run with Node --permission, exact export/probe read grants, and no child-process/write grants.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
assert.ok(root, 'exact Git-object export required');
const base = join(root, 'tests/e2e/windows');
const sha = value => createHash('sha256').update(value).digest('hex');
const wrapperFile = join(base, 'qa_run_live_candidate.mjs');
const wrapperHash = sha(fs.readFileSync(wrapperFile));
assert.equal(wrapperHash, 'ed58fe5d9fe3f1a4cd786303ab105a1f58bf42162c6f6d1ac145aaaf936c775b');
const wrapper = await import(pathToFileURL(wrapperFile));
const candidate = JSON.parse(fs.readFileSync(join(wrapper.candidateDir, 'candidate.json')));
const identity = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/stage-identity.json')));
const driver = join(root, 'docs/verification/qa/p0-13-live-0ff325b/driver-nonvoice-06-time');
const template = JSON.parse(fs.readFileSync(join(driver, 'allocation.template.json')));
const deadline = Date.parse('2026-10-20T12:30:00Z');
const latest = deadline - 600000 - 60000;
assert.equal(wrapper.PRELAUNCH_MARGIN_MS, 60000);
const active = { ...template, state: 'active', lead_reviewed: true,
  allocation_id: 'support-synthetic-memory-only', command_approval_ref: 'synthetic:not-an-approval',
  script_permission_ref: 'synthetic:not-a-permission', valid_from_utc: '2026-10-20T12:00:00Z',
  valid_until_utc: new Date(deadline).toISOString() };

async function drive({ initial = latest, advance = {}, conflict = false, inactive = false, nativeMs = 0 } = {}) {
  let clock = initial, looks = 0, watchReads = 0, didNative = false;
  const events = [], memory = new Map(), directories = new Set(), exitHandlers = [];
  const out = '/tmp/support-synthetic-time-output', allocation = '/tmp/support-synthetic-time-allocation.json';
  const allocationBytes = Buffer.from(JSON.stringify(inactive ? template : active));
  const mark = kind => {
    events.push({ kind, elapsed_ms: clock - initial });
    clock += advance[kind] ?? 0;
  };
  const sourcePath = path => typeof path === 'string' && path.startsWith(root + '/');
  const io = {
    existsSync(path) { return memory.has(path) || directories.has(path) || (sourcePath(path) && fs.existsSync(path)); },
    lstatSync(path) {
      if (path === allocation || memory.has(path)) return { isFile: () => true, isSymbolicLink: () => false };
      assert.ok(sourcePath(path), `unexpected stat ${path}`); return fs.lstatSync(path);
    },
    readFileSync(path, options) {
      if (path === allocation) return allocationBytes;
      if (path === `${out}/connector-watch.jsonl`) {
        mark(watchReads++ === 0 ? 'watch-ready' : 'watch-summary');
        return '{"event":"watch_start","root_exists":true,"already_there":[]}\n';
      }
      if (path === '/proc/4321/stat') { mark('watch-stat'); return '4321 (python3) S 1 2 3'; }
      if (memory.has(path)) return memory.get(path);
      if (sourcePath(path)) return fs.readFileSync(path, options);
      throw Error(`synthetic absent file ${path}`);
    },
    readdirSync(path) { assert.ok(path === '/proc' || path === out, path); return []; },
    readlinkSync() { throw Error('no actual process inspection permitted'); },
    mkdirSync(path) { mark(path === candidate.work ? 'scratch' : path === out ? 'output' : 'scratch-child'); directories.add(path); },
    writeFileSync(path, data) {
      const kind = path.endsWith('connector-watch.stop') ? 'watch-stop'
        : path.endsWith('preflight-refusal.json') ? 'conflict-record'
        : path.endsWith('run.json') ? 'run-record' : 'write';
      mark(kind); memory.set(path, Buffer.from(data));
      if (kind === 'watch-stop') exitHandlers.splice(0).forEach(f => f(0));
    },
  };
  const fakeExec = (file, args) => {
    if (file === 'python3') { mark('stage'); return JSON.stringify(identity); }
    assert.equal(file, '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
    const code = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    if (code.includes('Win32_Process')) {
      mark(didNative ? 'cleanup-look' : `look${++looks}`);
      return Buffer.from(JSON.stringify({ now: '1', processes: [], listen: conflict ? [999] : [] })).toString('base64');
    }
    if (code.includes('Test-Path')) { mark('edge-path'); return 'True'; }
    if (code.includes('ParseFile')) { mark('parse'); return '{"ok":true,"errors":[]}'; }
    throw Error('unexpected operational command; nothing was executed');
  };
  const injected = { fs: io, now: () => clock, sleep: async ms => { clock += ms; },
    connectorAdmission: () => { mark('connector'); return { synthetic: true }; },
    execFileSync: fakeExec,
    spawn(file, args) {
      assert.equal(file, 'python3'); assert.ok(args[0].endsWith('qa_sub_watch.py')); mark('watch-start');
      return { pid: 4321, on(event, callback) { if (event === 'exit') exitHandlers.push(callback); } };
    },
    spawnSync(file, args, options) {
      assert.equal(options.timeout, 600000); mark('native'); didNative = true; clock += nativeMs;
      return { status: nativeMs ? null : 0, signal: null, error: nativeMs ? { code: 'ETIMEDOUT' } : undefined,
        stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  };
  let report = null, error = null;
  try { report = await wrapper.runLiveCandidate({ execute: true, out, allocation, allocationSha256: sha(allocationBytes) }, injected); }
  catch (e) { error = e.message; }
  return { events, error, aborted: report?.aborted ?? null, native_attempts: report?.native_attempts ?? 0,
    scratch_consumed: directories.has(candidate.work), watch_stop: events.some(e => e.kind === 'watch-stop'),
    elapsed_ms: clock - initial, report_written: memory.has(`${out}/run.json`) };
}

const rows = [];
const effects = r => r.events.filter(e => ['output', 'watch-start', 'watch-stop', 'scratch', 'scratch-child', 'write', 'native', 'conflict-record', 'run-record'].includes(e.kind)).map(e => e.kind);
const marginRefusal = /too little time.*pre-launch margin/;
async function check(name, config, verify) {
  const result = await drive(config); verify(result); rows.push({ name, ...result });
}
await check('inactive saved template', { inactive: true }, r => { assert.match(r.error, /separate exact Lead-reviewed/); assert.equal(r.events.length, 0); });
await check('late entry by one ms', { initial: latest + 1 }, r => { assert.match(r.error, marginRefusal); assert.equal(r.events.length, 0); });
await check('expired allocation', { initial: deadline }, r => { assert.match(r.error, /not currently active/); assert.equal(r.events.length, 0); });
await check('equality preserves output-watch-scratch-launch order', {}, r => {
  assert.equal(r.error, null); assert.equal(r.native_attempts, 1);
  assert.deepEqual(effects(r).slice(0, 3), ['output', 'watch-start', 'scratch']);
  assert.equal(r.events.filter(e => e.kind === 'native').length, 1); assert.ok(r.watch_stop && r.report_written);
});
await check('clock exhausted during conflicting look', { conflict: true, advance: { look2: 1 } }, r => {
  assert.match(r.error, marginRefusal); assert.deepEqual(effects(r), []); assert.equal(r.scratch_consumed, false);
});
await check('enough time preserves conflict evidence', { conflict: true }, r => {
  assert.match(r.error, /debugging-port owner/); assert.deepEqual(effects(r), ['output', 'conflict-record']);
});
await check('clock exhausted after executable check', { advance: { 'edge-path': 1 } }, r => {
  assert.match(r.error, marginRefusal); assert.deepEqual(effects(r), []);
});
await check('time lost while awaiting watcher readiness', { advance: { 'watch-ready': 1 } }, r => {
  assert.match(r.error, marginRefusal); assert.deepEqual(effects(r), ['output', 'watch-start', 'watch-stop']);
  assert.equal(r.scratch_consumed, false); assert.equal(r.native_attempts, 0);
});
await check('final native-bound check refuses after scratch', { advance: { parse: 60001 } }, r => {
  assert.equal(r.error, null); assert.equal(r.aborted, 'allocation has too little time for the bounded native attempt');
  assert.equal(r.native_attempts, 0); assert.ok(r.scratch_consumed && r.watch_stop && r.report_written);
});
await check('final native-bound equality on mocked clock', { advance: { parse: 60000 } }, r => {
  assert.equal(r.error, null); assert.equal(r.native_attempts, 1); assert.ok(r.watch_stop);
});
await check('virtual full native budget reaches cleanup after foreground cap', {
  initial: latest - 10000, advance: { stage: 1000, 'cleanup-look': 1000 }, nativeMs: 600000,
}, r => {
  assert.equal(r.native_attempts, 1);
  assert.ok(r.events.find(e => e.kind === 'cleanup-look').elapsed_ms > 600000);
  assert.ok(r.elapsed_ms > 600000); assert.ok(r.watch_stop && r.report_written);
});
const oldTemplate = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/driver-nonvoice-06/allocation.template.json')));
assert.equal(wrapper.validateLiveAllocation(active, candidate, wrapperHash, latest), deadline);
assert.throws(() => wrapper.validateLiveAllocation({ ...active, wrapper_sha256: oldTemplate.wrapper_sha256 }, candidate, wrapperHash, latest), /separate exact Lead-reviewed/);
console.log(JSON.stringify({ source: '58338a2fe8467125f00f0231abf5cfa194e71915',
  scope: 'Exact wrapper with injected clocks, process functions and memory I/O; no real allocation, resource operation or native/timing/model experiment.',
  wrapper_rows: rows.length, pure_gate_controls: 2, rows,
  gate_results: { active_shaped_memory_control: 'accepted shape only', old_wrapper_pin: 'refused' },
  actual_native_or_account_operations: 0, real_allocation_created: false }, null, 2));
