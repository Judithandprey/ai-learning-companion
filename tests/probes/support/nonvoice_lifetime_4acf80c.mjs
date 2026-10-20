// Candidate 08: only the previously disputed lifecycle/evidence boundaries.
// All processes and operational files are fakes. Use exact read grants, no process/write grants.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2], sha = b => createHash('sha256').update(b).digest('hex');
assert.ok(root);
const wrapperFile = join(root, 'tests/e2e/windows/qa_run_live_candidate.mjs');
const wrapperHash = sha(fs.readFileSync(wrapperFile));
assert.equal(wrapperHash, 'efa634ca881b9aaf71f424879f1e0836981a4d83925dbc6ab9a753c7605fcef5');
const w = await import(pathToFileURL(wrapperFile));
const c = JSON.parse(fs.readFileSync(join(w.candidateDir, 'candidate.json')));
const identity = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/stage-identity.json')));
const template = JSON.parse(fs.readFileSync(join(root, 'docs/verification/qa/p0-13-live-0ff325b/driver-nonvoice-08/allocation.template.json')));
const epoch = Date.parse('2026-10-20T12:00:00Z');
const active = { ...template, state: 'active', lead_reviewed: true,
  allocation_id: 'support-memory-lifetime-only', command_approval_ref: 'synthetic:not-approval',
  script_permission_ref: 'synthetic:not-permission', valid_from_utc: new Date(epoch).toISOString(),
  valid_until_utc: new Date(epoch + 1800000).toISOString() };

async function drive(mode = 'normal') {
  let clock = 0, native = null, watcher = null, launched = false, runnerAlive = false;
  let watcherAlive = false, watchEndedNaturally = false, nextFd = 100;
  const events = [], memory = new Map(), dirs = new Set(), fds = new Map();
  const out = '/tmp/support-synthetic-lifetime-out', allocation = '/tmp/support-synthetic-lifetime-allocation.json';
  const allocationBytes = Buffer.from(JSON.stringify(active));
  const mark = (kind, extra = {}) => events.push({ kind, at_ms: clock, ...extra });
  const source = p => typeof p === 'string' && p.startsWith(root + '/');
  const watchLog = () => Buffer.from([
    { event: 'watch_start', root_exists: true, already_there: [] },
    ...(launched ? [{ event: 'appear', role: 'in_root', pid: 9901, start_ticks: 5 }, { event: 'exit', pid: 9901, start_ticks: 5 }] : []),
    ...(watchEndedNaturally ? [{ event: 'watch_end', remaining: [] }] : []),
  ].map(x => JSON.stringify(x)).join('\n') + '\n');
  const content = p => {
    if (p === `${out}/connector-watch.jsonl`) return watchLog();
    if (memory.has(p)) return memory.get(p);
    throw Object.assign(Error('synthetic absent ' + p), { code: 'ENOENT' });
  };
  const io = {
    existsSync(p) { return memory.has(p) || dirs.has(p) || (source(p) && fs.existsSync(p)); },
    lstatSync(p) {
      if (p === allocation || memory.has(p)) return { isFile: () => true, isSymbolicLink: () => false };
      assert.ok(source(p), `unexpected stat ${p}`); return fs.lstatSync(p);
    },
    readFileSync(p, options) {
      if (p === allocation) return allocationBytes;
      if (p === '/proc/4321/stat') return '4321 (python3) S 1 2 3';
      if (source(p)) return fs.readFileSync(p, options);
      const b = content(p); return options === 'utf8' ? b.toString() : b;
    },
    openSync(p) { const b = content(p); fds.set(nextFd, b); return nextFd++; },
    fstatSync(fd) { return { isFile: () => true, nlink: 1, size: fds.get(fd).length }; },
    readSync(fd, b, off, len, pos) { return fds.get(fd).copy(b, off, pos, pos + len); },
    closeSync(fd) { fds.delete(fd); },
    readdirSync(p) { assert.ok(p === '/proc' || p === out); return []; },
    readlinkSync() { throw Error('real process inspection forbidden'); },
    mkdirSync(p) { dirs.add(p); },
    writeFileSync(p, data) {
      mark('write', { file: p.split('/').at(-1) });
      if (p === `${out}/connector-watch.stop`) {
        if (mode === 'watch-term') throw Error('synthetic stop-file failure');
        watcherAlive = false; watchEndedNaturally = true; watcher.emit('exit', 0);
      }
      memory.set(p, Buffer.from(data));
    },
  };
  const inv = c.proposed_native_invocation, quote = s => /\s/.test(s) ? `"${s}"` : s;
  const runnerFile = inv.arguments[inv.arguments.indexOf('-File') + 1];
  const runnerRow = { pid: 888, created: '2', exe: inv.executable,
    command_line: mode === 'unresolved' ? `${inv.executable} -File ${runnerFile}`
      : [inv.executable, ...inv.arguments].map(quote).join(' ') };
  const checkerRow = { pid: 889, created: '2', exe: inv.executable,
    command_line: `${inv.executable} -NoProfile -File C:\\unrelated\\admission-checker.ps1` };
  const execFileSync = (file, args) => {
    if (file === 'python3') return JSON.stringify(identity);
    assert.equal(file, '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
    const code = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    if (code.includes('GetProcessById')) {
      assert.ok(code.includes('GetProcessById(888)'), 'only the exact owned runner may be signalled');
      const how = code.includes('CloseMainWindow') ? 'close' : 'force'; mark('runner-signal', { how });
      if (how === 'force') runnerAlive = false;
      return how === 'close' ? 'no_window' : 'signalled';
    }
    if (code.includes('Win32_Process')) {
      const image = /Name='([a-z.]+)'/.exec(code)[1]; mark('look', { image });
      const processes = image === 'powershell.exe' ? [checkerRow, ...(runnerAlive ? [runnerRow] : [])] : [];
      return Buffer.from(JSON.stringify({ now: '1', listen: [], processes })).toString('base64');
    }
    if (code.includes('Test-Path')) return 'True';
    if (code.includes('ParseFile')) return '{"ok":true,"errors":[]}';
    throw Error('unexpected command; none was executed');
  };
  const injected = {
    fs: io, now: () => epoch + clock, monotonic: () => clock, execFileSync,
    connectorAdmission: () => ({ synthetic: true }),
    async sleep(ms) {
      clock += ms;
      if (native && !native.ended) {
        native.ended = true;
        native.emit('exit', mode === 'early-signal' ? null : 0, mode === 'early-signal' ? 'SIGKILL' : null);
        native.emit('close');
      }
    },
    spawn(file, args, options) {
      assert.ok(!options.detached);
      if (file === 'python3') {
        assert.ok(args[0].endsWith('qa_sub_watch.py'));
        mark('watch-start', { max_seconds: args.at(-1) });
        watcher = new EventEmitter(); watcher.pid = 4321; watcherAlive = true;
        watcher.kill = signal => { mark('watch-signal', { signal }); watcherAlive = false; watcher.emit('exit', null, signal); return true; };
        return watcher;
      }
      assert.equal(file, '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
      launched = true; runnerAlive = ['owned-stays', 'unresolved'].includes(mode); mark('native');
      native = new EventEmitter(); native.pid = 7788; native.stdout = new EventEmitter(); native.stderr = new EventEmitter();
      native.kill = () => { throw Error('no timeout path needed in this focused probe'); };
      return native;
    },
  };
  const report = await w.runLiveCandidate({ execute: true, out, allocation, allocationSha256: sha(allocationBytes) }, injected);
  assert.ok(memory.has(`${out}/run-status.json`) && memory.has(`${out}/run.json`));
  const writes = events.filter(e => e.kind === 'write').map(e => e.file);
  assert.ok(writes.indexOf('run-status.json') < writes.indexOf('ledger.json'));
  return { mode, events, elapsed_ms: clock, runner_alive: runnerAlive, watcher_alive: watcherAlive,
    cleanup: Object.fromEntries(Object.entries(report.cleanup).map(([k, v]) => [k, v.exit])),
    release_blockers: report.release_blockers, launcher: report.launcher, watch_stop: report.watch_stop,
    mechanics_passed: report.mechanics_passed, attempts_used: report.ledger.attempts_used };
}

const rows = [];
for (const mode of ['normal', 'early-signal', 'owned-stays', 'unresolved', 'watch-term']) {
  const r = await drive(mode);
  assert.equal(r.attempts_used, 4); // Missing synthetic runner results: conservative unknown accounting.
  assert.equal(r.mechanics_passed, false);
  if (mode === 'normal') assert.deepEqual(r.release_blockers, []);
  if (mode === 'early-signal') assert.ok(r.release_blockers.some(s => s.includes('launcher did not end cleanly')));
  if (mode === 'owned-stays') {
    assert.equal(r.runner_alive, false); assert.equal(r.cleanup.runner, 'confirmed');
    assert.deepEqual(r.events.filter(e => e.kind === 'runner-signal').map(e => e.how), ['close', 'force']);
    const force = r.events.findIndex(e => e.kind === 'runner-signal' && e.how === 'force');
    const app = r.events.findIndex((e, i) => i > force && e.kind === 'look' && e.image === 'electron.exe');
    assert.ok(app > force); assert.ok(r.release_blockers.some(s => s.includes('runner was signalled')));
  }
  if (mode === 'unresolved') {
    assert.equal(r.runner_alive, true); assert.equal(r.cleanup.runner, 'unknown');
    assert.equal(r.events.filter(e => e.kind === 'runner-signal').length, 0);
    assert.ok(r.release_blockers.some(s => s.includes("runner's end is not proven")));
  }
  if (mode === 'watch-term') {
    assert.equal(r.watcher_alive, false); assert.deepEqual(r.watch_stop.signalled, ['SIGTERM']);
    assert.equal(r.watch_stop.exited, true);
    assert.ok(r.release_blockers.some(s => s.includes('connector is not seen released')));
  }
  rows.push(r);
}

// Disputed H3 read boundary only: no actual filesystem use.
const readCases = [];
for (const mode of ['exact', 'oversize', 'growing', 'no-time']) {
  let opened = 0, read = 0, closed = 0;
  const bytes = Buffer.from(mode === 'growing' ? 'abcd' : 'abc');
  const io = {
    openSync() { opened++; return 1; },
    fstatSync: () => ({ isFile: () => true, size: 3 }),
    readSync(fd, b, off, len, pos) { read++; return bytes.copy(b, off, pos, pos + len); },
    closeSync() { closed++; },
  };
  const run = () => w.boundedRead(io, '/memory', mode === 'oversize' ? 2 : 3, () => mode !== 'no-time');
  if (mode === 'exact') assert.equal(run().toString(), 'abc');
  else assert.throws(run, mode === 'growing' ? /grew/ : mode === 'oversize' ? /over 2 bytes/ : /budget is spent/);
  if (mode === 'no-time') assert.equal(opened, 0);
  if (mode === 'oversize') assert.equal(read, 0);
  assert.equal(closed, opened);
  readCases.push({ mode, opened, read, closed });
}
console.log(JSON.stringify({ source: '4acf80c1b32e282520bffe19a641e2f4626a919e',
  scope: 'Five focused mocked lifecycle cases and four pure bounded-read controls; no native/Windows/process/account activity.',
  rows, read_cases: readCases, actual_native_or_account_operations: 0, real_allocation_created: false }, null, 2));
