// Injected boundary checks. Run directly with Node child-process permission withheld.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isCandidateRuntime, namesThisRun, pathKey, runTtsCandidate, summarizeTtsPreflight, ttsAdmissionScope, ttsEdgeRelevance, ttsLaunchRelevance } from './qa_run_tts_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const base = join(repo, 'docs/verification/qa/p0-13-tts-52be105');
const candidateFile = join(base, 'candidate-r4-20261009/candidate.json');
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
    appLook: emptyLook(), edgeLook: emptyLook(), signals: [], afterRun: null, beforeSignal: null };
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
      if (code.includes('GetProcessById')) {
        // A held-handle signal (signalCommand): validated against the current world as the real command does.
        const pid = Number(/GetProcessById\((\d+)\)/.exec(code)[1]), created = /Ticks, '(\d+)'/.exec(code)[1];
        state.beforeSignal?.(state, pid);
        const looks = [state.appLook, state.edgeLook], look = looks.find(l => l.processes.some(p => p.pid === pid));
        const row = look?.processes.find(p => p.pid === pid);
        const answer = !row ? 'gone' : row.created !== created ? 'stale' : 'signalled';
        state.signals.push({ pid, created, how: code.includes('CloseMainWindow') ? 'close' : 'force', answer });
        if (answer === 'signalled') { look.processes = look.processes.filter(p => p !== row); look.listen = look.listen.filter(x => x !== pid); }
        return `${answer}\r\n`;
      }
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
      if (state.runMode === 'throw') { state.afterRun?.(state); throw Error('synthetic launch error'); }
      if (state.runMode === 'timeout') return { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      const steps = Array.from({ length: 32 }, () => ({ kind: 'synthetic', ok: true }));
      for (const [i, handle] of ['toolbarHandle', 'cardHandle'].entries()) {
        steps[i] = { kind: 'dragHandle', ok: true, handle,
          before: { surface: { x: 0, y: 0 }, doc: { original: true }, pinned: null, crop_source_sha256: 'synthetic', events: [] },
          after_cdp: { surface: { x: 40, y: 0 }, doc: { original: true }, pinned: null, crop_source_sha256: 'synthetic', events: [{ type: 'gotpointercapture', target: handle }] } };
      }
      if (state.runMode === 'incomplete') steps.pop();
      state.afterRun?.(state);
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
  v.files.set(join(dirname(candidateFile), 'steps.json'), Buffer.from('[]'));
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

// Another owner's Electron app, shaped like the AgentsDock development client the operator identified (its own runtime
// and its own app folder; no personal path is used here).
const OTHER_EXE = 'C:\\Dev\\AgentsDock\\electron\\node_modules\\electron\\dist\\electron.exe';
const otherMain = (pid = 100568, extra = {}) => ({ pid, created: '639267186912717160', exe: OTHER_EXE, command_line: `"${OTHER_EXE}" "C:\\Dev\\AgentsDock\\electron"`, ...extra });
const otherChild = (pid, type = 'renderer') => ({ pid, created: '639267186912717999', exe: OTHER_EXE, command_line: `"${OTHER_EXE}" --type=${type} --user-data-dir=C:\\Dev\\AgentsDockData` });
const WORK = 'C:\\' + candidate.work.slice(7).replaceAll('/', '\\');
const STAGE = 'C:\\' + candidate.stage.slice(7).replaceAll('/', '\\');
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
  ['the candidate stage on the candidate runtime', s => { s.appLook.processes = [processRow()]; }],
  ['unreadable command and executable', s => { s.appLook.processes = [processRow({ exe: null, command_line: null })]; }],
  ['child missing creation', s => { s.appLook.processes = [processRow({ created: null, command_line: 'electron.exe --type=renderer' })]; }],
]) test(`sanitized preflight refusal: ${name}`, async () => {
  const v = setup(mutate);
  await assert.rejects(runTtsCandidate(v.options, v.injected), /relevant to this run/);
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
test('readable children are judged by their own arguments: a plain child (of another runtime or of the candidate runtime) is admitted; one naming the stage refuses', async () => {
  for (const row of [processRow({ exe: OTHER_EXE, command_line: `"${OTHER_EXE}" --type=renderer` }), processRow({ command_line: 'electron.exe --type=renderer' })]) {
    const v = setup(s => { s.appLook.processes = [row]; });
    const r = await runTtsCandidate(v.options, v.injected);
    assert.equal(r.passed, true); assert.equal(runs(v).length, 1);
    assert.equal(v.files.has(join(v.options.out, 'preflight-refusal.json')), false);
  }
  const mine = setup(s => { s.appLook.processes = [processRow({ command_line: `electron.exe --type=renderer --app-path=${STAGE}` })]; });
  await assert.rejects(runTtsCandidate(mine.options, mine.injected), /relevant to this run/);
  assertPreflightStop(mine);
  assert.equal(JSON.parse(mine.files.get(join(mine.options.out, 'preflight-refusal.json'))).electron_launch_conflicts[0].reason, 'names_this_run');
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
test('metadata allowlist preserves separate snapshot clocks, reasons and safe known-stage classification', () => {
  const secret = 'PRIVATE_TOKEN_TITLE_PATH_DO_NOT_SAVE';
  const exact = processRow({ command_line: processRow().command_line.toUpperCase() + ' --token=' + secret });
  const rows = [exact,
    processRow({ pid: 124, command_line: processRow().command_line.replace('lc-windows-tts-52be105','lc-windows-tts-52be105-sibling') }),
    processRow({ pid: 125, exe: OTHER_EXE, command_line: `electron.exe C:\\${secret} --label="${STAGE}"` }),
    processRow({ pid: 126, exe: `C:\\${secret}\\electron.exe` }),
    processRow({ pid: 127, created: null, command_line: 'electron.exe --type=renderer' }),
    processRow({ pid: 128, command_line: null }),
    otherMain(129, { command_line: `"${OTHER_EXE}" C:\\${secret}` }),
  ];
  const r = summarizeTtsPreflight(candidate, { now: '100', processes: rows, listen: [123,900] },
    { now: '200', processes: [{ pid: 300, created: '1', exe: candidate.edge, command_line: `"${candidate.edge}" --user-data-dir=C:\\${secret}` }], listen: [902] }, start);
  assert.equal(r.schema, 'qa-tts-preflight-metadata/2');
  assert.equal(r.app_port.observed_ticks, '100'); assert.equal(r.edge_port.observed_ticks, '200');
  assert.equal(r.electron_observed_ticks, '100'); assert.equal(r.edge_observed_ticks, '200');
  assert.deepEqual(r.electron_launch_conflicts.map(p => [p.pid, p.reason]),
    [[123, 'names_this_run'], [125, 'names_this_run'], [126, 'names_this_run'], [127, 'unreadable_creation'], [128, 'unreadable_command_line']]);
  assert.equal(r.electron_launch_conflicts[0].known_product_stage, 'candidate_stage');
  assert.ok(r.electron_launch_conflicts.slice(1).every(p => p.known_product_stage === 'unknown'));
  // 124 runs a sibling stage (an absolute, different app) on the candidate runtime: another owner's.
  assert.deepEqual(r.other_owner_electron, [{ pid: 124, created_ticks: '639269000000000000' }, { pid: 129, created_ticks: '639267186912717160' }]);
  assert.deepEqual(r.edge_launch_conflicts, []); assert.equal(r.other_owner_edge_count, 1);
  assert.equal(r.app_port.owners[0].created_ticks, rows[0].created);
  assert.equal(r.app_port.owners[1].metadata_present, false);
  const allowed = ['pid','created_ticks','metadata_present','creation_readable','executable_readable',
    'command_line_readable','child_argument_present','executable_matches_candidate','known_product_stage'];
  for (const p of [...r.app_port.owners,...r.edge_port.owners]) assert.deepEqual(Object.keys(p).sort(),allowed.toSorted());
  for (const p of r.electron_launch_conflicts) assert.deepEqual(Object.keys(p).sort(), [...allowed,'reason'].toSorted());
  const json = JSON.stringify(r);
  for (const value of [secret,'C:\\','AgentsDock',candidate.stage,'"command_line":','"exe":']) assert.equal(json.includes(value),false);
});

// ---- the scoped admission rule itself ------------------------------------------------------------------------------
const scope = ttsAdmissionScope(candidate);
const rel = (command_line, extra = {}) => ttsLaunchRelevance({ pid: 1, created: '5', exe: OTHER_EXE, command_line, ...extra }, scope);
test('path keys follow Windows: letter case, / or \\, a \\\\?\\ prefix, doubled and trailing separators, trailing dots and spaces', () => {
  for (const v of [STAGE, STAGE.toUpperCase(), STAGE.replaceAll('\\', '/'), STAGE + '\\', STAGE + '\\\\', STAGE + '.', STAGE + ' ', '\\\\?\\' + STAGE, STAGE.replace('\\Temp\\', '\\Temp\\\\')])
    assert.equal(pathKey(v), pathKey(STAGE), v);
  assert.notEqual(pathKey(STAGE + '-sibling'), pathKey(STAGE));
  assert.equal(pathKey('\\\\server\\share\\x'), '\\\\server\\share\\x');       // a UNC start keeps its two separators
});
test('the candidate stage or this run\'s folder named in any form is relevant; quoting is read by Windows\' rules', () => {
  const forms = [
    `"${OTHER_EXE}" "${STAGE}"`, `"${OTHER_EXE}" ${STAGE.toUpperCase()}`, `"${OTHER_EXE}" "${STAGE.replaceAll('\\', '/')}/"`,
    `"${OTHER_EXE}" --app-path="${STAGE}\\dist"`, `"${OTHER_EXE}" lc-windows-tts-52be105`, `"${OTHER_EXE}" ..\\Temp\\LC-WINDOWS-TTS-52BE105\\`,
    `"${OTHER_EXE}" C:\\Users\\ROG\\AppData\\Local\\Temp\\LC-WIN~1`, `"${OTHER_EXE}" --user-data-dir=${WORK}\\userdata`,
    `"${OTHER_EXE}" --app=file:///${WORK.replaceAll('\\', '/')}/surface.html`, `"${OTHER_EXE}" C:\\Users\\ROG\\AppData\\Local\\Temp\\LC-QA-~1\\edge-profile`,
    `"${OTHER_EXE}" "a"" ${STAGE}"`,                                 // one argument to Windows: it still names the stage
    `"${OTHER_EXE}" "${STAGE}\\..\\lc-windows-tts-52be105"`,
    `"${OTHER_EXE}" --label=lc-windows-tts-52be105`, `"${OTHER_EXE}" --user-data-dir=LC-QA-~1`,   // only the '=value' split finds these
    `"${OTHER_EXE}" /app-path=lc-windows-tts-52be105`, `"${OTHER_EXE}" "${STAGE}.\\dist\\main.js"`,
    `"${OTHER_EXE}" "C:\\Test\\lc-windows-tts-52be105 \\package.json"`, `"${OTHER_EXE}" "C:\\Test\\lc-windows-tts-52be105. .\\x"`,   // a middle component's trailing dot/space (lead counterexample)
    `"${OTHER_EXE}" "--user-data-dir=${WORK} \\userdata"`,
  ];
  for (const f of forms) assert.equal(rel(f), 'names_this_run', f);
});
test('arguments that only resemble the stage or folder are not relevant (whole path components are compared)', () => {
  for (const f of [`"${OTHER_EXE}" "${STAGE}-sibling"`, `"${OTHER_EXE}" ${STAGE}x`, `"${OTHER_EXE}" "${STAGE}.old"`, `"${OTHER_EXE}" --label=lc-windows-tts-52be10`,
    `"${OTHER_EXE}" C:\\X\\TTS-52~1`, `"${OTHER_EXE}" C:\\X\\LC-WINDOWS~1`, `"${OTHER_EXE}" C:\\data\\l~1`,
    `"${OTHER_EXE}" "C:\\Dev\\AgentsDock\\electron"`, `"${OTHER_EXE}" C:\\PROGRA~1\\App`, `"${OTHER_EXE}" --type=gpu-process --user-data-dir=C:\\Dev\\Data`])
    assert.equal(rel(f), null, f);
});
test('a debugging-port argument for either test port is relevant; other numbers, other keys and a bare number are not', () => {
  for (const f of ['--remote-debugging-port=43123', '--remote-debugging-port=45123', '--inspect=127.0.0.1:45123', '--inspect-brk=43123', '--port 43123', '--DEBUG-PORT=45123',
    '--debug=43123', '/remote-debugging-port=43123', '--remote-debugging-port=043123', '--remote-debugging-port=+45123', '--inspect-port 43123', '--REMOTE-DEBUGGING-PORT 43123'])
    assert.equal(rel(`"${OTHER_EXE}" ${f}`), 'test_port_argument', f);
  for (const f of ['--remote-debugging-port=431234', '--remote-debugging-port=143123', '--remote-debugging-port=43124', '--port=4312', '--count 43123', '43123',
    'report 43123', 'port 43123', 'inspect=127.0.0.1:43123', '--report 43123', '--import=x:45123', '--support=43123', '--remote-debugging-address=127.0.0.1', '--renderer-client-id=43123', '--mojo-platform-channel-handle=45123'])
    assert.equal(rel(`"${OTHER_EXE}" ${f}`), null, f);
});
test('a main process of the candidate runtime refuses unless its FIRST argument is an absolute app path; with another absolute app it is another owner\'s; unreadable fields refuse', () => {
  const rt = (command_line, exe = candidate.electron) => rel(command_line, { exe });
  assert.equal(rt('electron.exe'), 'candidate_runtime_without_app');
  assert.equal(rt('electron.exe --inspect=9229'), 'candidate_runtime_app_unresolved');
  // A switch first: the next token may be its value, not the app (lead and Support counterexamples, handoff_56cec023).
  assert.equal(rt('electron.exe --user-data-dir C:\\Other\\Profile .'), 'candidate_runtime_app_unresolved');
  assert.equal(rt('electron.exe --require C:\\Other\\preload.cjs .'), 'candidate_runtime_app_unresolved');
  assert.equal(rt('electron.exe --user-data-dir C:\\Other\\Profile'), 'candidate_runtime_app_unresolved');
  assert.equal(rt('electron.exe /inspect C:\\Other\\app'), 'candidate_runtime_app_unresolved');
  assert.equal(rt('electron.exe "C:\\Other\\app" --user-data-dir C:\\Other\\Profile'), null);   // an absolute app FIRST stays another owner's
  assert.equal(rt('electron.exe .'), 'candidate_runtime_relative_app');
  assert.equal(rt('electron.exe dist\\apps\\windows\\src\\main\\main.js'), 'candidate_runtime_relative_app');
  assert.equal(rt('electron.exe ""'), 'candidate_runtime_relative_app');
  assert.equal(rt(`electron.exe "${STAGE}"`), 'names_this_run');
  assert.equal(rt('electron.exe "C:\\Users\\ROG\\AppData\\Local\\Temp\\lc-windows-web-selftest" --remote-debugging-port=9333'), null);   // a Web self-test: another owner's
  assert.equal(rt('electron.exe "\\\\server\\share\\app"'), null);
  assert.equal(rt('electron.exe', candidate.electron.toUpperCase().replaceAll('\\', '/')), 'candidate_runtime_without_app');
  assert.equal(rt('electron.exe', 'C:\\Users\\ROG\\AppData\\Local\\Temp\\LC-ELE~1\\electron.exe'), 'candidate_runtime_without_app');
  assert.equal(rt('electron.exe .', 'D:\\cache\\lc-electron-44.5.1-win32-x64\\electron.exe'), 'candidate_runtime_relative_app');
  assert.equal(rt('electron.exe --type=renderer'), null);                                     // a child: its main is judged on its own
  assert.equal(rel('x', { exe: `${STAGE}\\electron.exe` }), 'names_this_run');               // an executable inside the stage
  assert.equal(isCandidateRuntime('C:\\Dev\\node_modules\\electron\\dist\\electron.exe', scope), false);
  assert.equal(isCandidateRuntime('C:\\X\\LC-ELEC~1\\other.exe', scope), false);
  assert.equal(rel('x', { created: null }), 'unreadable_creation');
  assert.equal(rel('x', { exe: null }), 'unreadable_executable');
  assert.equal(rel(null), 'unreadable_command_line');
  assert.equal(rel(''), 'unreadable_command_line');
});
test('Edge: only this run\'s folder or a test-port argument is relevant; the user\'s browser and unreadable rows are not', () => {
  const edgeRel = command_line => ttsEdgeRelevance({ pid: 2, created: '5', exe: candidate.edge, command_line }, scope);
  assert.equal(edgeRel(`"${candidate.edge}" --user-data-dir=${WORK}\\edge-profile`), 'names_this_run');
  assert.equal(edgeRel(`"${candidate.edge}" --remote-debugging-port=45123`), 'test_port_argument');
  assert.equal(edgeRel(`"${candidate.edge}" --type=renderer --user-data-dir=C:\\Users\\Someone\\Edge`), null);
  assert.equal(edgeRel(null), null);
});
test('namesThisRun compares 8.3 short names by their six-character prefix only, and only for components with ~N', () => {
  assert.equal(namesThisRun('C:\\X\\LC-WIN~2', scope), true);                         // fail-closed: any lc-win* short name
  assert.equal(namesThisRun('C:\\X\\LC-QA-~3.TMP', scope), true);
  for (const v of ['C:\\X\\LCWIN~1', 'C:\\X\\LC-WIN', 'C:\\X\\TTS-52~1', 'C:\\X\\LC-WINDOWS~1', 'C:\\X\\l~1', 'C:\\X\\LC-W~1']) assert.equal(namesThisRun(v, scope), false, v);
});

for (const [name, mutate, reason, list = 'electron_launch_conflicts'] of [
  ['another runtime naming the stage', s => { s.appLook.processes = [otherMain(51, { command_line: `"${OTHER_EXE}" "${STAGE.toUpperCase()}"` })]; }, 'names_this_run'],
  ['another runtime naming this run\'s user data', s => { s.appLook.processes = [otherMain(52, { command_line: `"${OTHER_EXE}" --user-data-dir=${WORK}\\userdata` })]; }, 'names_this_run'],
  ['another runtime with the app port argument', s => { s.appLook.processes = [otherMain(53, { command_line: `"${OTHER_EXE}" x --remote-debugging-port=43123` })]; }, 'test_port_argument'],
  ['an unreadable executable', s => { s.appLook.processes = [otherMain(54, { exe: null })]; }, 'unreadable_executable'],
  ['the candidate runtime with a relative app', s => { s.appLook.processes = [processRow({ pid: 56, command_line: 'electron.exe .' })]; }, 'candidate_runtime_relative_app'],
  ['the candidate runtime with a switch before its app', s => { s.appLook.processes = [processRow({ pid: 57, command_line: 'electron.exe --user-data-dir C:\\Other\\Profile .' })]; }, 'candidate_runtime_app_unresolved'],
  ['Edge using this run\'s profile', s => { s.edgeLook.processes = [{ pid: 55, created: '1', exe: candidate.edge, command_line: `"${candidate.edge}" --user-data-dir=${WORK}\\edge-profile` }]; }, 'names_this_run', 'edge_launch_conflicts'],
]) test(`scoped refusal before anything starts: ${name}`, async () => {
  const v = setup(s => { mutate(s); s.appLook.processes.push(otherMain(), otherChild(100570)); });
  await assert.rejects(runTtsCandidate(v.options, v.injected), /relevant to this run/);
  assertPreflightStop(v);
  const r = JSON.parse(v.files.get(join(v.options.out, 'preflight-refusal.json')));
  assert.equal(r[list].length, 1); assert.equal(r[list][0].reason, reason);
  assert.deepEqual(r.other_owner_electron.map(p => p.pid), [100568, 100570]);
  assert.equal(v.state.signals.length, 0);
});

// Our own launches as the cleanup sees them after the run (exact launch identities, created after the check began).
const ourApp = (pid = 41) => ({ pid, created: '640000000000000500', exe: candidate.electron,
  command_line: `"${candidate.electron}" "${STAGE}" --remote-debugging-port=${candidate.appPort} --remote-debugging-address=127.0.0.1` });
const ourEdge = (pid = 61) => ({ pid, created: '640000000000000400', exe: candidate.edge, command_line: `"${candidate.edge}" ${candidate.edgeArgs.join(' ')}` });
const usersEdge = { pid: 70, created: '639000000000000000', exe: candidate.edge, command_line: `"${candidate.edge}" --profile-directory=Default` };
test('another owner\'s readable Electron app (main and children) is admitted, seen by the complete cleanup look, and never signalled; only this run\'s exact launches are', async () => {
  const v = setup(s => {
    s.appLook.processes = [otherMain(), otherChild(100570), otherChild(100571, 'gpu-process')];
    s.edgeLook.processes = [usersEdge];
    s.afterRun = st => { st.appLook.processes.push(ourApp()); st.edgeLook.processes.push(ourEdge()); };
  });
  const r = await runTtsCandidate(v.options, v.injected);
  assert.equal(runs(v).length, 1); assert.equal(r.passed, true);
  assert.equal(v.files.has(join(v.options.out, 'preflight-refusal.json')), false);
  assert.deepEqual(v.state.signals.map(x => [x.pid, x.how, x.answer]), [[41, 'close', 'signalled'], [61, 'close', 'signalled']]);
  assert.deepEqual(r.cleanup.electron.owned_seen.map(p => p.pid), [41]);
  assert.deepEqual(r.cleanup.electron.foreign, [100568]); assert.deepEqual(r.cleanup.electron.children, [100570, 100571]);
  assert.deepEqual(r.cleanup.edge.owned_seen.map(p => p.pid), [61]); assert.deepEqual(r.cleanup.edge.foreign, [70]);
  assert.deepEqual(v.state.appLook.processes.map(p => p.pid), [100568, 100570, 100571]);   // still there, untouched
});
test('a PID of another owner\'s app reused by this run\'s launch is owned by its new identity only', async () => {
  const v = setup(s => {
    s.appLook.processes = [otherMain(4242)];
    s.afterRun = st => { st.appLook.processes = [ourApp(4242)]; };          // the other app ended; Windows gave its PID to ours
  });
  const r = await runTtsCandidate(v.options, v.injected);
  assert.deepEqual(v.state.signals.map(x => [x.pid, x.created, x.answer]), [[4242, '640000000000000500', 'signalled']]);
  assert.equal(r.cleanup.electron.exit, 'confirmed');
});
test('this run\'s PID taken by another process between the look and the signal: the signal finds it stale and nothing is signalled', async () => {
  const v = setup(s => {
    s.afterRun = st => { st.appLook.processes = [ourApp(41)]; };
    s.beforeSignal = (st, pid) => { if (pid === 41) st.appLook.processes = [otherMain(41, { created: '640000000000000900' })]; };
  });
  const r = await runTtsCandidate(v.options, v.injected);
  assert.deepEqual(v.state.signals.map(x => [x.pid, x.answer]), [[41, 'stale']]);
  assert.deepEqual(v.state.appLook.processes.map(p => p.pid), [41]);       // the other process is untouched
  assert.equal(r.cleanup.electron.asked_to_close.length, 0);
});
test('cleanup bounds are unchanged: complete looks of both images, held-handle signals, 1 s / 5 s / 5 s waits in 250 ms steps', async () => {
  const source = fs.readFileSync(join(here, 'qa_run_tts_candidate.mjs'), 'utf8');
  assert.equal(source.split("sleep, now, waitSelfMs: 1000, waitCloseMs: 5000, waitForceMs: 5000, stepMs: 250 }); }").length, 2);
  assert.equal(source.split("edgeCalls.look = async () => readLook(ps(lookCommand(candidate.edgePort, 'msedge.exe')));").length, 2);
  assert.equal(source.split('const appCalls = windowsCalls(ps, candidate.appPort), edgeCalls = windowsCalls(ps, candidate.edgePort);').length, 2);
  assert.equal(/ttsAdmission|ttsLaunchRelevance|ttsEdgeRelevance/.test(source.slice(source.indexOf('} finally {'))), false);   // never applied to cleanup
});

test('a staged app of another owner on the same cached runtime (another absolute stage, its own port) is admitted and never signalled', async () => {
  const web = (pid, extra = {}) => ({ pid, created: '639267186912700000', exe: candidate.electron,
    command_line: `"${candidate.electron}" "C:\\Users\\ROG\\AppData\\Local\\Temp\\lc-windows-web-selftest" --remote-debugging-port=9333`, ...extra });
  const v = setup(s => {
    s.appLook.processes = [web(800), web(801, { command_line: `"${candidate.electron}" --type=renderer --user-data-dir=C:\\Users\\ROG\\AppData\\Roaming\\lc-web` })];
    s.afterRun = st => { st.appLook.processes.push(ourApp()); };
  });
  const r = await runTtsCandidate(v.options, v.injected);
  assert.equal(runs(v).length, 1); assert.equal(r.passed, true);
  assert.deepEqual(v.state.signals.map(x => x.pid), [41]);
  assert.deepEqual(r.cleanup.electron.foreign, [800]); assert.deepEqual(r.cleanup.electron.children, [801]);
});
test('after the run the cleanup still sees everything: a young unreadable row makes the exit unknown (passed false), a listener that is not ours is said', async () => {
  const blind = setup(s => { s.afterRun = st => { st.appLook.processes.push(ourApp(), { pid: 77, created: '640000000000000600', exe: null, command_line: null }); }; });
  const b = await runTtsCandidate(blind.options, blind.injected);
  assert.equal(b.cleanup.electron.exit, 'unknown'); assert.deepEqual(b.cleanup.electron.unresolved.map(p => p.pid), [77]);
  assert.equal(b.passed, false); assert.equal(blind.state.signals.length, 0);
  const port = setup(s => { s.afterRun = st => { st.appLook.listen.push(999); }; });
  const q = await runTtsCandidate(port.options, port.injected);
  assert.equal(q.cleanup.electron.exit, 'still_running'); assert.deepEqual(q.cleanup.electron.not_owned_on_the_port, [999]);
  assert.equal(q.passed, false); assert.equal(port.state.signals.length, 0);
});
