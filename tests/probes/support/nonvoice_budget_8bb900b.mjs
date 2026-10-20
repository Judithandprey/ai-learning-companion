// Independent changed-boundary review. Operational I/O and every process are in-memory fakes.
// Run with --permission and only exact export/probe read grants; no process or write grants.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
assert.ok(root, 'exact Git-object export required');
const base = join(root, 'tests/e2e/windows');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const wrapperFile = join(base, 'qa_run_live_candidate.mjs');
const wrapperHash = sha(fs.readFileSync(wrapperFile));
assert.equal(wrapperHash, '691d5bebe61cfcf63a345a58386847329166d2596f78a31e8490d9d988e17e17');
const w = await import(pathToFileURL(wrapperFile));
const candidate = JSON.parse(fs.readFileSync(join(w.candidateDir, 'candidate.json')));
const identity = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/stage-identity.json')));
const template = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/driver-nonvoice-07/allocation.template.json')));
const epoch = Date.parse('2026-10-20T12:00:00Z');
const active = { ...template, state: 'active', lead_reviewed: true,
  allocation_id: 'support-memory-only-budget', command_approval_ref: 'synthetic:not-an-approval',
  script_permission_ref: 'synthetic:not-a-permission', valid_from_utc: new Date(epoch).toISOString(),
  valid_until_utc: new Date(epoch + 1800000).toISOString() };
assert.equal(Object.values(w.BUDGET_MS).reduce((a, b) => a + b, 0), 600000);

async function drive(config = {}) {
  let clock = 0, native = null, nativeStarted = false, cleanupLooks = 0;
  let watcher = null, watcherAlive = false, nativeWindowsAlive = false, stopRequested = false;
  const events = [], memory = new Map(), dirs = new Set();
  const out = '/tmp/support-synthetic-budget-output', allocation = '/tmp/support-synthetic-budget-allocation.json';
  const allocationBytes = Buffer.from(JSON.stringify(config.inactive ? template : active));
  const mark = (kind, extra = {}) => {
    events.push({ kind, at_ms: clock, ...extra });
    clock += config.advance?.[kind] ?? 0;
  };
  const sourcePath = p => typeof p === 'string' && p.startsWith(root + '/');
  const watchLog = () => [
    { event: 'watch_start', root_exists: true, already_there: [] },
    ...(nativeStarted ? [
      { event: 'appear', role: 'in_root', pid: 9901, start_ticks: 5 },
      { event: 'exit', pid: 9901, start_ticks: 5 },
    ] : []),
    ...(stopRequested && !watcherAlive ? [{ event: 'watch_end', remaining: [] }] : []),
  ].map(x => JSON.stringify(x)).join('\n') + '\n';
  const io = {
    existsSync(p) { return memory.has(p) || dirs.has(p) || (sourcePath(p) && fs.existsSync(p)); },
    lstatSync(p) {
      if (p === allocation || memory.has(p) || p === join(candidate.work, 'out/results.json')) {
        return { isFile: () => true, isSymbolicLink: () => false };
      }
      assert.ok(sourcePath(p), `unexpected stat ${p}`); return fs.lstatSync(p);
    },
    readFileSync(p, options) {
      if (p === allocation) return allocationBytes;
      if (p === `${out}/connector-watch.jsonl`) return watchLog();
      if (p === '/proc/4321/stat') return '4321 (python3) S 1 2 3';
      if (p === join(candidate.work, 'out/results.json')) {
        mark('results-read');
        if (config.readableResults) return Buffer.from('{"steps":[],"values":{}}');
        throw Error('synthetic absent runner result');
      }
      if (memory.has(p)) return memory.get(p);
      if (sourcePath(p)) return fs.readFileSync(p, options);
      throw Error(`synthetic absent ${p}`);
    },
    readdirSync(p) { assert.ok(p === '/proc' || p === out, `unexpected list ${p}`); return []; },
    readlinkSync() { throw Error('no real process inspection permitted'); },
    mkdirSync(p) { mark(p === out ? 'output' : p === candidate.work ? 'scratch' : 'scratch-child'); dirs.add(p); },
    writeFileSync(p, data) {
      if (p === `${out}/connector-watch.stop`) {
        mark('watch-stop'); stopRequested = true;
        if (config.watchStopFails) throw Error('synthetic stop-file write failure');
        watcherAlive = false; watcher.emit('exit', 0);
      } else if (p.endsWith('/run.json')) mark('report-write');
      memory.set(p, Buffer.from(data));
    },
  };
  const execFileSync = (file, args, options) => {
    if (file === 'python3') { mark('stage', { timeout: options.timeout, killSignal: options.killSignal }); return JSON.stringify(identity); }
    assert.equal(file, '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
    const code = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    if (code.includes('Win32_Process')) {
      const kind = nativeStarted ? `cleanup-look-${++cleanupLooks}` : 'preflight-look';
      mark(kind, { timeout: options.timeout, killSignal: options.killSignal });
      return Buffer.from(JSON.stringify({ now: '1', processes: [], listen: [] })).toString('base64');
    }
    if (code.includes('Test-Path')) { mark('edge-path', { timeout: options.timeout }); return 'True'; }
    if (code.includes('ParseFile')) { mark('parse', { timeout: options.timeout }); return '{"ok":true,"errors":[]}'; }
    throw Error('unexpected operational command; none was executed');
  };
  const endLauncher = (code, signal, close = true) => {
    if (native.ended) return;
    native.ended = true; mark('launcher-exit', { code, signal }); native.emit('exit', code, signal);
    if (close) native.emit('close', code, signal);
  };
  const injected = {
    fs: io, now: () => epoch + clock, monotonic: () => clock, execFileSync,
    connectorAdmission(io, checks, home, limit) {
      mark('connector', { timeout: limit(60000).timeout });
      return { synthetic: true };
    },
    async sleep(ms) {
      clock += ms;
      if (native && !native.ended && clock >= native.started + 250) {
        if (config.nativeMode === 'early-signal') endLauncher(null, 'SIGKILL');
        else if (!config.nativeMode || config.nativeMode === 'normal' || config.nativeMode === 'no-close') {
          nativeWindowsAlive = false; endLauncher(0, null, config.nativeMode !== 'no-close');
        }
      }
    },
    spawn(file, args, options) {
      assert.ok(!options.detached && !options.unref);
      if (file === 'python3') {
        assert.ok(args[0].endsWith('qa_sub_watch.py')); mark('watch-start');
        watcher = new EventEmitter(); watcher.pid = 4321; watcherAlive = true; return watcher;
      }
      assert.equal(file, '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
      mark('native-start'); nativeStarted = true; nativeWindowsAlive = true;
      native = new EventEmitter(); native.pid = 7788; native.started = clock;
      native.stdout = new EventEmitter(); native.stderr = new EventEmitter();
      native.kill = signal => {
        mark('launcher-signal', { signal });
        if (config.nativeMode === 'term-exit' && signal === 'SIGTERM'
            || config.nativeMode === 'kill-exit' && signal === 'SIGKILL') endLauncher(null, signal);
        return true; // A successful launcher signal is deliberately not a Windows exit event.
      };
      return native;
    },
  };
  let report = null, error = null;
  try { report = await w.runLiveCandidate({ execute: true, out, allocation, allocationSha256: sha(allocationBytes) }, injected); }
  catch (e) { error = e.message; }
  return { events, error, report_written: memory.has(`${out}/run.json`), scratch_consumed: dirs.has(candidate.work),
    elapsed_ms: clock, hypothetical_windows_runner_alive: nativeWindowsAlive, mock_watcher_alive: watcherAlive,
    report: report && { native_attempts: report.native_attempts, launcher: report.launcher, aborted: report.aborted,
      cleanup: Object.fromEntries(Object.entries(report.cleanup).map(([k, v]) => [k, v.exit])),
      watch_exited: report.watch_exited, connector_watch: report.connector_watch?.state,
      release_blockers: report.release_blockers, budget: report.budget, mechanics_passed: report.mechanics_passed,
      attempts_used: report.ledger?.attempts_used, slot_states: report.ledger?.slots.map(s => s.state),
      collect_errors: report.collect_errors } };
}

const rows = [];
async function check(name, config, verify) {
  const r = await drive(config); verify(r); rows.push({ name, ...r });
}
await check('inactive template refuses without effects', { inactive: true }, r => {
  assert.match(r.error, /separate exact Lead-reviewed/); assert.equal(r.events.length, 0);
});
await check('normal attached launcher and complete output', {}, r => {
  assert.equal(r.error, null); assert.equal(r.report.launcher.status, 0);
  assert.equal(r.report.launcher.output_complete, true); assert.equal(r.report.attempts_used, 4);
  assert.equal(r.mock_watcher_alive, false); assert.equal(r.report.mechanics_passed, false);
});
for (const mode of ['term-exit', 'kill-exit', 'never-exit']) {
  await check(`timeout ${mode} remains blocked`, { nativeMode: mode }, r => {
    assert.equal(r.report.launcher.timeout, true); assert.equal(r.hypothetical_windows_runner_alive, true);
    assert.ok(r.report.release_blockers.includes('the native runner did not end by itself within its ceiling'));
    assert.equal(r.report.attempts_used, 4); assert.equal(r.report.mechanics_passed, false);
    assert.ok(r.elapsed_ms <= 590000);
  });
}
await check('counterexample: early SIGKILL has no runner release blocker', { nativeMode: 'early-signal' }, r => {
  assert.equal(r.report.launcher.signal, 'SIGKILL'); assert.equal(r.report.launcher.timeout, false);
  assert.equal(r.hypothetical_windows_runner_alive, true); assert.deepEqual(r.report.release_blockers, []);
  assert.equal(r.report.mechanics_passed, false); assert.equal(r.report.attempts_used, 4);
});
await check('exit without output close fails launcher completeness', { nativeMode: 'no-close' }, r => {
  assert.equal(r.report.launcher.output_complete, false); assert.equal(r.report.mechanics_passed, false);
});
await check('shared preparation phase clamps calls then refuses', { advance: { stage: 25000, connector: 28000 } }, r => {
  assert.match(r.error, /preparation budget is spent/); assert.equal(r.scratch_consumed, false);
  assert.deepEqual(r.events.filter(e => e.timeout).map(e => e.timeout), [30000, 35000, 7000, 7000]);
});
await check('post-scratch preparation expiry never launches or counts slots', { advance: { parse: 60001 } }, r => {
  assert.equal(r.report.native_attempts, 0); assert.equal(r.report.attempts_used, 0);
  assert.equal(r.mock_watcher_alive, false); assert.equal(r.scratch_consumed, true);
});
await check('unended watch remains alive and is honestly blocked', { watchStopFails: true, advance: { 'cleanup-look-1': 570000 } }, r => {
  assert.equal(r.mock_watcher_alive, true); assert.equal(r.report.watch_exited, false);
  assert.ok(r.report.release_blockers.includes('the read-only watch was not seen ending'));
});
await check('counterexample: unbounded results read crosses whole-call cap', {
  readableResults: true, advance: { 'cleanup-look-1': 568750, 'results-read': 40000 },
}, r => {
  assert.equal(r.events.find(e => e.kind === 'results-read').at_ms, 569000);
  assert.equal(r.report.budget.report_after_ms, 609000);
  assert.ok(r.report.collect_errors.some(e => e.includes('evidence budget')));
  assert.ok(r.report_written); assert.equal(r.report.mechanics_passed, false);
});

console.log(JSON.stringify({ source: '8bb900b7a773c9ec7790d0854d863a157285f777',
  scope: 'Exact wrapper, injected clocks/process functions/memory I/O only. Hypothetical Windows survival is an input, not an observed interop result.',
  rows, cases: rows.length, actual_native_or_account_operations: 0, real_allocation_created: false }, null, 2));
