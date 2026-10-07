// Injected boundary checks. Run directly with Node child-process permission withheld.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runTtsCandidate, summarizeTtsPreflight } from './qa_run_tts_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const base = join(repo, 'docs/verification/qa/p0-13-tts-52be105');
const candidateFile = join(base, 'candidate/candidate.json');
const candidate = JSON.parse(fs.readFileSync(candidateFile));
const identity = fs.readFileSync(join(base, 'stage-identity.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const start = Date.parse('2030-01-01T00:00:00Z');

function setup(change = () => {}) {
  const trace = [], files = new Map(), directories = new Set();
  const allocation = '/tmp/lc-qa-tts-wrapper-synthetic-allocation.json', out = '/tmp/lc-qa-tts-wrapper-synthetic-output';
  const record = {
    schema: 'qa-tts-display-allocation/1', state: 'active', lead_reviewed: true,
    allocation_id: 'synthetic-boundary-test', mode: 'AI_DISABLED_GENERATED_SURFACE_ONLY', exclusive_display: true,
    account_access: false, audio_access: false, microphone_access: false, provider_attempts: 0,
    max_native_attempts: 1, retry: false, cleanup_only_after_expiry: true,
    updated_command_approval_ref: 'SYNTHETIC_ONLY_NOT_AN_APPROVAL',
    wrapper_sha256: sha(fs.readFileSync(join(here, 'qa_run_tts_candidate.mjs'))), candidate_sha256: sha(fs.readFileSync(candidateFile)),
    payload_sha256: candidate.files,
    native_invocation: { executable: candidate.proposed_native_invocation.executable, arguments: candidate.proposed_native_invocation.arguments },
    launch_identity: { source: candidate.production_commit, stage: candidate.stage, tree: candidate.stage_tree_sha256,
      work: candidate.work, electron: candidate.electron, edge: candidate.edge, appPort: candidate.appPort, edgePort: candidate.edgePort },
    valid_from_utc: '2029-12-31T23:59:00Z', valid_until_utc: '2030-01-01T01:00:00Z',
  };
  const emptyLook = () => ({ now: '640000000000000000', processes: [], listen: [] });
  const state = { record, parserOk: true, runMode: 'ok', identity: JSON.parse(identity), clock: start,
    appLook: emptyLook(), edgeLook: emptyLook() };
  change(state);
  files.set(allocation, Buffer.from(JSON.stringify(record)));
  const io = {
    existsSync: p => files.has(p) || directories.has(p) || (p.startsWith(repo) && fs.existsSync(p)),
    lstatSync: p => files.has(p) ? { isFile: () => true, isSymbolicLink: () => false } : fs.lstatSync(p),
    readFileSync: p => files.has(p) ? files.get(p) : fs.readFileSync(p),
    mkdirSync: (p, opts) => { trace.push(['mkdir', p, opts]); if (state.mkdirFails || directories.has(p)) throw Error('synthetic mkdir failure'); directories.add(p); },
    writeFileSync: (p, bytes, opts) => { trace.push(['write', p, opts]); if (state.writeFails || opts?.flag === 'wx' && files.has(p)) throw Error('synthetic write failure'); files.set(p, Buffer.from(bytes)); },
  };
  const options = { execute: true, out, allocation, allocationSha256: sha(files.get(allocation)) };
  const injected = {
    fs: io, now: () => state.clock, sleep: async ms => { state.clock += ms; },
    execFileSync: (exe, args) => {
      if (exe === 'python3') { trace.push(['fresh-identity']); return JSON.stringify(state.identity); }
      assert.match(exe, /WindowsPowerShell/);
      const code = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      trace.push(['windows', code]);
      if (code.includes('ParseFile')) return JSON.stringify({ ok: state.parserOk, errors: [] });
      if (code.includes('Test-Path')) return 'True';
      if (code.includes('Get-CimInstance')) {
        if (state.expireOnFirstLook && trace.filter(e => e[0] === 'windows').length === 1) state.clock = Date.parse(record.valid_until_utc) + 1;
        if (state.occupyOutputAfterLook && code.includes("Name='msedge.exe'")) {
          directories.add(out); files.set(join(out, 'preflight-refusal.json'), Buffer.from('preserved concurrent evidence'));
        }
        return Buffer.from(JSON.stringify(code.includes("Name='msedge.exe'") ? state.edgeLook : state.appLook)).toString('base64');
      }
      throw Error('unexpected injected Windows command');
    },
    spawnSync: (exe, args) => {
      trace.push(['runner', exe, args]);
      assert.equal(args.includes('Bypass'), false);
      assert.equal(args[args.indexOf('-ExecutionPolicy') + 1], 'RemoteSigned');
      if (state.runMode === 'throw') throw Error('synthetic launch error');
      if (state.runMode === 'timeout') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      const steps = Array.from({ length: 32 }, () => ({ kind: 'synthetic', ok: true }));
      for (const [i, handle] of ['toolbarHandle', 'cardHandle'].entries()) {
        steps[i] = { kind: 'dragHandle', ok: true, handle,
          before: { surface: { x: 0, y: 0 }, doc: { original: true }, pinned: null, crop_source_sha256: 'synthetic', events: [] },
          after_cdp: { surface: { x: 40, y: 0 }, doc: { original: true }, pinned: null, crop_source_sha256: 'synthetic', events: [{ type: 'gotpointercapture', target: handle }] } };
      }
      if (state.runMode === 'incomplete') steps.pop();
      files.set(join(candidate.work, 'out/results.json'), Buffer.from(JSON.stringify({ aborted: null, steps })));
      return { status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  };
  return { options, injected, trace, files, state };
}
const windows = v => v.trace.filter(e => e[0] === 'windows');
const runs = v => v.trace.filter(e => e[0] === 'runner');
function refusal(name, mutate, after = () => {}) {
  test(name, async () => {
    const v = setup(mutate); after(v);
    await assert.rejects(runTtsCandidate(v.options, v.injected));
    assert.equal(windows(v).length, 0); assert.equal(runs(v).length, 0);
    assert.equal(v.trace.some(e => e[0] === 'mkdir'), false);
  });
}
test('actual child-process permission is withheld', () => {
  assert.throws(() => spawnSync(process.execPath, ['-e', 'process.exit(0)']), e => e.code === 'ERR_ACCESS_DENIED');
});
refusal('no explicit execute mode', () => {}, v => { v.options.execute = false; });
refusal('independent allocation hash required', () => {}, v => { delete v.options.allocationSha256; });
refusal('self-reviewed altered record cannot replace the independent hash', () => {}, v => { v.options.allocationSha256 = '0'.repeat(64); });
refusal('released allocation', s => { s.record.state = 'released'; });
refusal('expired allocation', s => { s.record.valid_until_utc = '2029-12-31T23:59:59Z'; });
refusal('historical approval cannot authorize the updated command', s => { s.record.updated_command_approval_ref = candidate.prior_approval_record; });
refusal('wrong wrapper source', s => { s.record.wrapper_sha256 = '0'.repeat(64); });
refusal('wrong runner binding', s => { s.record.payload_sha256 = { ...candidate.files, 'runner.ps1': '0'.repeat(64) }; });
refusal('Bypass cannot replace the exact process-only RemoteSigned command', s => {
  s.record.native_invocation = structuredClone(s.record.native_invocation);
  s.record.native_invocation.arguments[3] = 'Bypass';
});
refusal('alternate PowerShell engine cannot replace the pinned command', s => {
  s.record.native_invocation = { ...s.record.native_invocation, executable: 'C:\\different\\pwsh.exe' };
});
refusal('wrong launch work/port', s => { s.record.launch_identity.work += '-other'; s.record.launch_identity.appPort += 1; });
refusal('nonexclusive display', s => { s.record.exclusive_display = false; });
refusal('sound/model scope expansion', s => { s.record.audio_access = true; s.record.provider_attempts = 1; });
refusal('fresh package failure must precede every Windows call/cleanup', s => { s.identity.passed = false; });
refusal('altered saved candidate rejects before fresh identity or Windows', () => {}, v => {
  v.files.set(candidateFile, Buffer.from('{}'));
});
refusal('altered saved steps reject before fresh identity or Windows', () => {}, v => {
  v.files.set(join(base, 'candidate/steps.json'), Buffer.from('[]'));
});
test('valid injected admission orders fresh identity, preflight, copies, parser, one runner and both cleanup looks', async () => {
  const v = setup(), r = await runTtsCandidate(v.options, v.injected);
  assert.equal(r.passed, true); assert.equal(r.native_attempts, 1); assert.equal(r.provider_attempts, 0);
  assert.equal(v.trace[0][0], 'fresh-identity');
  const parser = v.trace.findIndex(e => e[0] === 'windows' && e[1].includes('ParseFile'));
  const copies = v.trace.filter(e => e[0] === 'write' && e[1].startsWith(candidate.work) && !e[1].endsWith('results.json'));
  assert.equal(copies.length, 3); assert.ok(parser > v.trace.findIndex(e => e[0] === 'mkdir'));
  assert.equal(runs(v).length, 1);
  assert.ok(v.trace.findIndex(e => e[0] === 'runner') > parser);
  assert.equal(r.cleanup.electron.exit, 'confirmed'); assert.equal(r.cleanup.edge.exit, 'confirmed');
  assert.ok(windows(v).at(-2)[1].includes("Name='electron.exe'"));
  assert.ok(windows(v).at(-1)[1].includes("Name='msedge.exe'"));
});
test('parser rejection starts nothing and performs no termination/cleanup queries', async () => {
  const v = setup(s => { s.parserOk = false; }), r = await runTtsCandidate(v.options, v.injected);
  assert.equal(r.passed, false); assert.equal(runs(v).length, 0);
  assert.equal(r.cleanup.electron.exit, 'not_started'); assert.equal(r.cleanup.edge.exit, 'not_started');
  assert.ok(windows(v).at(-1)[1].includes('ParseFile'));
});
test('expiry during the first lookup prevents all later non-cleanup Windows calls', async () => {
  const v = setup(s => { s.expireOnFirstLook = true; });
  await assert.rejects(runTtsCandidate(v.options, v.injected));
  assert.equal(windows(v).length, 1); assert.equal(runs(v).length, 0);
  assert.equal(v.trace.some(e => e[0] === 'mkdir'), false);
});
for (const mode of ['throw', 'timeout']) test(`${mode} performs both exact cleanup observations with no retry`, async () => {
  const v = setup(s => { s.runMode = mode; }), r = await runTtsCandidate(v.options, v.injected);
  assert.equal(r.passed, false); assert.equal(runs(v).length, 1);
  assert.equal(r.cleanup.electron.exit, 'confirmed'); assert.equal(r.cleanup.edge.exit, 'confirmed');
});
test('incomplete native result cannot pass the diagnostic', async () => {
  const v = setup(s => { s.runMode = 'incomplete'; }), r = await runTtsCandidate(v.options, v.injected);
  assert.equal(r.passed, false); assert.equal(r.steps_ok, false);
});

const processRow = extra => ({ pid: 123, created: '639269000000000000', exe: candidate.electron,
  command_line: `"${candidate.electron}" "C:\\Users\\ROG\\AppData\\Local\\Temp\\lc-windows-tts-52be105"`, ...extra });
function assertPreflightStop(v) {
  assert.equal(windows(v).length, 2); assert.equal(runs(v).length, 0);
  assert.equal(v.trace.some(e => e[0] === 'mkdir' && e[1].startsWith(candidate.work)), false);
  assert.equal(v.trace.some(e => e[0] === 'windows' && /Test-Path|ParseFile|GetProcessById/.test(e[1])), false);
  assert.equal(v.files.has(join(v.options.out, 'run.json')), false);
}
for (const [name, mutate] of [
  ['app port only', s => { s.appLook.listen = [901]; }],
  ['Edge port only', s => { s.edgeLook.listen = [902]; }],
  ['both ports', s => { s.appLook.listen = [901]; s.edgeLook.listen = [902]; }],
  ['non-child Electron launch', s => { s.appLook.processes = [processRow()]; }],
  ['unreadable command and executable', s => { s.appLook.processes = [processRow({ exe: null, command_line: null })]; }],
  ['child missing creation', s => { s.appLook.processes = [processRow({ created: null, command_line: 'electron.exe --type=renderer' })]; }],
]) test(`sanitized preflight refusal: ${name}`, async () => {
  const v = setup(mutate);
  await assert.rejects(runTtsCandidate(v.options, v.injected), /another launch or debugging-port owner/);
  assertPreflightStop(v);
  const r = JSON.parse(v.files.get(join(v.options.out, 'preflight-refusal.json')));
  assert.equal(v.trace.find(e => e[0] === 'mkdir')[2].recursive, false);
  assert.equal(v.trace.find(e => e[0] === 'write')[2].flag, 'wx');
  assert.equal(r.blocked, true); assert.equal(r.native_attempts, 0); assert.equal(r.signals_sent, 0);
  assert.deepEqual(r.app_port.owners.map(p => p.pid), v.state.appLook.listen);
  assert.deepEqual(r.edge_port.owners.map(p => p.pid), v.state.edgeLook.listen);
  assert.equal(r.electron_launch_conflicts.length, v.state.appLook.processes.length);
  for (const p of [...r.app_port.owners, ...r.edge_port.owners]) {
    assert.equal(p.metadata_present, false); assert.equal(p.created_ticks, null);
    assert.equal(p.command_line_readable, null);
  }
});
test('readable child with creation time remains ignored by launch admission', async () => {
  const v = setup(s => { s.appLook.processes = [processRow({ command_line: 'electron.exe --type=renderer' })]; });
  const r = await runTtsCandidate(v.options, v.injected);
  assert.equal(r.passed, true); assert.equal(runs(v).length, 1);
  assert.equal(v.files.has(join(v.options.out, 'preflight-refusal.json')), false);
});
for (const [flag, label] of [['mkdirFails','mkdir'], ['writeFails','write']]) test(`refusal ${label} failure still starts and signals nothing`, async () => {
  const v = setup(s => { s.appLook.listen = [901]; s[flag] = true; });
  await assert.rejects(runTtsCandidate(v.options, v.injected), /sanitized refusal could not be saved/);
  assertPreflightStop(v);
  assert.equal(v.files.has(join(v.options.out, 'preflight-refusal.json')), false);
});
test('output occupied during preflight is preserved without starting or signalling anything', async () => {
  const v = setup(s => { s.appLook.listen = [901]; s.occupyOutputAfterLook = true; });
  await assert.rejects(runTtsCandidate(v.options, v.injected), /sanitized refusal could not be saved/);
  assertPreflightStop(v);
  assert.equal(v.files.get(join(v.options.out, 'preflight-refusal.json')).toString(), 'preserved concurrent evidence');
});
test('metadata allowlist preserves separate snapshot clocks and safe known-stage classification', () => {
  const secret = 'PRIVATE_TOKEN_TITLE_PATH_DO_NOT_SAVE';
  const exact = processRow({ command_line: processRow().command_line.toUpperCase() + ' --token=' + secret });
  const rows = [exact,
    processRow({ pid: 124, command_line: processRow().command_line.replace('lc-windows-tts-52be105','lc-windows-tts-52be105-sibling') }),
    processRow({ pid: 125, command_line: `electron.exe C:\\${secret} --label="${candidate.stage}"` }),
    processRow({ pid: 126, exe: `C:\\${secret}\\electron.exe` }),
    processRow({ pid: 127, created: null, command_line: 'electron.exe --type=renderer' }),
    processRow({ pid: 128, command_line: null }),
  ];
  const r = summarizeTtsPreflight(candidate, { now: '100', processes: rows, listen: [123,900] },
    { now: '200', processes: [], listen: [902] }, start);
  assert.equal(r.app_port.observed_ticks, '100'); assert.equal(r.edge_port.observed_ticks, '200');
  assert.equal(r.electron_launch_conflicts[0].known_product_stage, 'candidate_stage');
  assert.ok(r.electron_launch_conflicts.slice(1).every(p => p.known_product_stage === 'unknown'));
  assert.equal(r.electron_launch_conflicts[4].reason, 'unreadable_creation');
  assert.equal(r.electron_launch_conflicts[5].reason, 'unreadable_command_line');
  assert.equal(r.app_port.owners[0].created_ticks, rows[0].created);
  assert.equal(r.app_port.owners[1].metadata_present, false);
  const allowed = ['pid','created_ticks','metadata_present','creation_readable','executable_readable',
    'command_line_readable','child_argument_present','executable_matches_candidate','known_product_stage'];
  for (const p of [...r.app_port.owners,...r.edge_port.owners]) assert.deepEqual(Object.keys(p).sort(),allowed.toSorted());
  for (const p of r.electron_launch_conflicts) assert.deepEqual(Object.keys(p).sort(), [...allowed,'reason'].toSorted());
  const json = JSON.stringify(r);
  for (const value of [secret,'C:\\',candidate.stage,'"command_line":','"exe":']) assert.equal(json.includes(value),false);
});
