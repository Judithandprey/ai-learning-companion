#!/usr/bin/env node
// The ONE allocated four-action nonvoice live run (real subscription, generated surface only). No execution without a
// separately reviewed Lead allocation for this exact candidate.
// --execute <new QA evidence folder> <allocation.json> <Lead-provided allocation SHA256>
//
// Reuse: the scoped launch preflight and the exact-identity cleanup are the accepted diagnostic's (qa_run_tts_candidate,
// signin_cleanup); the connector copy checks are run.mjs's (sub_copy). Added for the real branch only: the allocation's
// account/submission bounds, the codex digest and private-copy checks, a read-only watch of the connector processes,
// and the copy of this run's own records (live.jsonl, asks/*.json) and receipts, from which the all-action ledger is made.
// Nothing here retries, restarts, signs in, opens the account state or signals a process it did not start.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECTOR, NATIVE_BOUND_MS, NATIVE_WORK_MS, POLICY_MS, RUNNER_CLOSE_MS, checkLiveCandidate, linkNames, names } from './qa_live_candidate.mjs';
import { buildLedger, evidence, fenceVerdict, liveImportCheck, parseJsonl, sourceAdmission } from './qa_live_ledger.mjs';
import { summarizeTtsPreflight, ttsAdmission } from './qa_run_tts_candidate.mjs';
import { lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';
import { askPathCheck, compareCopy } from './sub_copy.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
export const candidateDir = join(repo, 'docs/verification/qa/p0-13-live-0ff325b/candidate-nonvoice-09');
export const candidateHash = '9dad7058fa43becf5c76f76f816e85646a014af8a6398e377d33f62c2e73c5cf';
export const pins = { 'runner.ps1': '45063b37328c65771f1c5d431af291a5586e560b57658e4ef9778115e498e36f', 'steps.json': '8e3e7357ef4902adeccd6fb9148f61dc6bfd8f2c6afe82f976ccd89e71edc19a', 'surface.html': 'be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067', 'sub-live.json': 'c38aaae0e38070c805972f71ebed085610427ddc8a2883ee52f1ee5ceec47478',
  'admission-checker.ps1': '9637db613373ef5ba63bc10753033aedaab90bf749aeaa982fed9b65c91eccf1', 'admission-live.json': 'f2c209e94c3b5cecb7f5c2f7e709b27d799c9007c7fc3e763376a9a364763964' };
const psBin = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const managedState = '/home/agentsdock/.local/share/LearningCompanion/managed-chatgpt';   // state_dir null: the product's own
// Raw provider receipts (thread/turn ids) stay outside the repository and Git: one 0700 folder per run (Lead D8).
export const rawReceiptsRoot = '/home/agentsdock/.local/state/lc-qa-live';
// Approvals that cover only AI-disabled runs: never a permission for this real-subscription runner.
const AI_DISABLED_APPROVALS = ['approved-two-gates-20261002:571427dcdc434c0f820236892925aedf', 'human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44',
  'human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172', 'human-approve-admission-20261008:2dde43ea7f4842619709d034fb8b0534'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const msg = error => String(error?.message ?? error).slice(0, 120);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const win = path => {
  if (!path.startsWith('/mnt/c/') || /['\r\n]/.test(path)) throw Error('unexpected Windows path');
  return 'C:\\' + path.slice(7).replaceAll('/', '\\');
};
/** The processes whose working folder is inside the private copy (the connector and its children), read-only. */
export function processesIn(dir, io = fs) {
  return io.readdirSync('/proc').filter(n => /^\d+$/.test(n)).filter(n => { try { const cwd = io.readlinkSync(`/proc/${n}/cwd`); return cwd === dir || cwd.startsWith(`${dir}/`); } catch { return false; } }).map(Number);
}

// F3: the reviewed production build whose main process starts QA's source-admission checker (Web's interlock), as the
// Lead integrated and staged it (0ff325b, 194986d). An allocation for a candidate of any other build is refused (52be105
// never starts the checker). Naming it here is not an execution allocation.
export const interlockProduction = '0ff325beadb7c689244610307b6aa16d638fd2e6';
// The whole foreground invocation fits the tool's 600 s maximum (Support 7723f82, Lead handoff_b9b8ebe1): one monotonic
// budget from entry, with explicit phase ends. Engineering ceilings, not measured durations: the preparation (stage and
// connector checks, looks, watch, payload copy, parse), the native runner with its own wind-down, the owned cleanup and
// the watch, the bounded evidence and report, and headroom no phase uses.
export const BUDGET_MS = { preparation: 60000, native: NATIVE_BOUND_MS, cleanup: 150000, evidence: 20000, headroom: 10000 };
// The preparation also needs this much of the allocation on top of the native bound. Not a lease, never an extension.
export const PRELAUNCH_MARGIN_MS = BUDGET_MS.preparation;
// After the scratch: the payload copy, the 8 s parse and the last checks must still fit in the preparation budget.
const LAUNCH_TAIL_MS = 10000;
// The native ceiling includes the end of the child: in its last 12 s a runner still there is signalled (SIGTERM, then
// SIGKILL, each awaited this long), and after an exit its output is awaited (its pipes close) this long.
const NATIVE_GRACE_MS = 5000, NATIVE_CLOSE_MS = 2000;
// The evidence copied from the scratch, each file and count bounded (more is an error and stays in place), and the report.
const EVIDENCE_MAX = { results: 16 << 20, live: 8 << 20, admission: 8 << 20, ask: 1 << 20, checker: 8 << 20, watch: 4 << 20, captures: 8, asks: 64, requests: 64, launches: 8, total: 64 << 20 };
const REPORT_MAX = 8 << 20;
export function validateLiveAllocation(record, candidate, wrapperHash, now, interlock = interlockProduction) {
  if (typeof interlock !== 'string' || !/^[0-9a-f]{40}$/.test(interlock) || candidate?.production_commit !== interlock) {
    throw Error('the candidate does not pin a reviewed production build that starts the source-admission checker; no allocation is accepted');
  }
  if (record?.schema !== 'qa-live-nonvoice-allocation/1' || record.state !== 'active' || record.lead_reviewed !== true
      || record.mode !== 'REAL_SUBSCRIPTION_NONVOICE_GENERATED_SURFACE' || record.exclusive_display !== true
      || record.account_access !== 'official_managed_lock_through_the_product' || record.audio_access !== false || record.microphone_access !== false
      || record.voice !== false || record.max_native_attempts !== 1 || record.retry !== false || record.restart !== false
      || !equal(record.policy, POLICY_MS) || record.max_real_actions !== 4 || !Number.isInteger(record.real_actions_already_used) || record.real_actions_already_used !== 0
      || record.cleanup_only_after_expiry !== true
      || record.native_bound_ms !== candidate.native_bound_ms || candidate.native_bound_ms !== BUDGET_MS.native || candidate.native_work_ms !== NATIVE_WORK_MS || candidate.native_close_ms !== RUNNER_CLOSE_MS
      || typeof record.allocation_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(record.allocation_id)
      || record.approval_scope !== 'real_subscription_nonvoice_four_actions'
      || typeof record.command_approval_ref !== 'string' || record.command_approval_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.command_approval_ref)
      || typeof record.script_permission_ref !== 'string' || record.script_permission_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.script_permission_ref)
      || record.wrapper_sha256 !== wrapperHash || record.candidate_sha256 !== candidateHash || !equal(record.payload_sha256, pins)
      || !equal(record.connector, CONNECTOR)
      || !equal(record.native_invocation, { executable: candidate.proposed_native_invocation.executable, arguments: candidate.proposed_native_invocation.arguments })
      || !equal(record.launch_identity, { source: candidate.production_commit, stage: candidate.stage, tree: candidate.stage_tree_sha256,
        work: candidate.work, electron: candidate.electron, edge: candidate.edge, appPort: candidate.appPort, edgePort: candidate.edgePort })) throw Error('separate exact Lead-reviewed live allocation required');
  const start = Date.parse(record.valid_from_utc), end = Date.parse(record.valid_until_utc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || now >= end || end <= start) throw Error('allocation is not currently active');
  return end;
}

/** The connector side, before any Windows call: the exact private copy, its question and live paths, the codex digest. */
export function connectorAdmission(io = fs, checks = { compareCopy, askPathCheck, liveImportCheck }, home = homedir(), limit = ms => ({ timeout: ms })) {
  // The product's managed state and the raw-receipt root are this user's: the connector runs as this same WSL user.
  if (home !== `/home/${CONNECTOR.user}` || !managedState.startsWith(home + '/') || !rawReceiptsRoot.startsWith(home + '/')) throw Error('the connector user\'s home is not the one the receipt folders assume');
  if (!io.existsSync(CONNECTOR.copy)) throw Error('the private Backend copy is missing (qa_live_candidate.mjs prepare-connector)');
  const same = checks.compareCopy(CONNECTOR.commit, CONNECTOR.copy, limit);
  if (!same.equal) throw Error(`the private Backend copy is not exactly ${CONNECTOR.commit.slice(0, 7)} services/ and packages/`);
  if (processesIn(CONNECTOR.copy, io).length) throw Error('something already runs in the private Backend copy');
  const ask = checks.askPathCheck(CONNECTOR.python, CONNECTOR.copy, limit), livePath = checks.liveImportCheck(CONNECTOR.python, CONNECTOR.copy, limit);
  if (!ask.ok || !livePath.ok) throw Error('the connector cannot prepare a request in the private copy');
  if (sha(io.readFileSync(CONNECTOR.codex_bin)) !== CONNECTOR.codex_sha256) throw Error('the pinned codex binary digest does not match');
  return { copy: CONNECTOR.copy, files: same.files, ask_path_ok: true, live_path_ok: true, codex_sha256: CONNECTOR.codex_sha256,
    state_dir: 'the product\'s own managed state (state_dir null). QA lists only its receipts/ folder names and reads only this run\'s receipts/<launch>/<sha256(request_id)>.json; nothing else there is listed or opened.' };
}

export async function runLiveCandidate(options, injected = {}) {
  // Injection is for the offline boundary test, never a CLI option or a product path.
  const io = injected.fs ?? fs, runFile = injected.execFileSync ?? execFileSync, start = injected.spawn ?? spawn;
  const now = injected.now ?? Date.now, sleep = injected.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  // The foreground budget's phase ends from entry (BUDGET_MS), on a monotonic clock apart from the allocation's wall clock.
  // A child call gets at most what is left of its phase (never a fresh full timeout) and is killed, not asked, at that end.
  const mono = injected.monotonic ?? (() => performance.now()), t0 = mono(), ends = {}, marks = { preparation: 0 };
  let end = t0, phase = 'preparation';
  for (const p of ['preparation', 'native', 'cleanup', 'evidence']) { end += BUDGET_MS[p]; ends[p] = end; }
  const enter = p => { phase = p; marks[p] = Math.round(mono() - t0); };
  const remaining = () => ends[phase] - mono();
  const within = ms => {
    const rest = Math.floor(remaining());
    if (rest < 1000) throw Error(`the ${phase} budget is spent; nothing more is started in it`);
    return { timeout: Math.min(ms, rest), killSignal: 'SIGKILL' };
  };
  const checks = injected.checks ?? { compareCopy, askPathCheck, liveImportCheck };
  if (options?.execute !== true) throw Error('explicit --execute and separately reviewed allocation required');
  const out = options.out && resolve(options.out), allocationPath = options.allocation && resolve(options.allocation);
  if (!out || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p)) || io.existsSync(out)) throw Error('new QA evidence folder required');
  if (!allocationPath || ![join(repo, 'docs/verification/lead') + sep, '/tmp/'].some(p => allocationPath.startsWith(p))
      || !/^[a-f0-9]{64}$/.test(options.allocationSha256 ?? '')) throw Error('independently supplied allocation file/hash required');
  const regularRead = path => {
    if (!io.lstatSync(path).isFile() || io.lstatSync(path).isSymbolicLink()) throw Error('regular pinned file required');
    return io.readFileSync(path);
  };
  const candidateBytes = regularRead(join(candidateDir, 'candidate.json'));
  if (sha(candidateBytes) !== candidateHash) throw Error('saved candidate bytes changed');
  const candidate = JSON.parse(candidateBytes), payload = Object.fromEntries(names.map(name => {
    const bytes = regularRead(join(candidateDir, name));
    if (sha(bytes) !== pins[name]) throw Error('saved payload bytes changed');
    return [name, bytes];
  }));
  checkLiveCandidate(candidate, payload, JSON.parse(regularRead(join(repo, 'docs/verification/qa/p0-13-live-0ff325b/stage-identity.json'))), { scratchExists: p => io.existsSync(p) });
  const allocationBytes = regularRead(allocationPath);
  if (sha(allocationBytes) !== options.allocationSha256) throw Error('allocation differs from independently reviewed hash');
  const record = JSON.parse(allocationBytes), wrapperHash = sha(regularRead(fileURLToPath(import.meta.url)));
  const deadline = validateLiveAllocation(record, candidate, wrapperHash, now(), injected.interlock ?? interlockProduction);
  const stillActive = () => { if (now() >= deadline) throw Error('allocation expired before admission/launch; no retry'); };
  // The allocation must still hold the margin and the whole native bound: on entry, before a preflight record, before
  // the watch and the output folder, and before the scratch is consumed. Exactly enough passes; a millisecond less
  // refuses. The same points need the rest of the preparation budget. The final checks right before the launch are apart.
  const enoughTimeToPrepare = () => {
    if (now() + PRELAUNCH_MARGIN_MS + record.native_bound_ms > deadline) throw Error('allocation has too little time for the bounded native attempt and its pre-launch margin; nothing launched, scratch unused; no retry');
    if (remaining() < LAUNCH_TAIL_MS) throw Error('the preparation budget is spent; nothing launched, scratch unused; no retry');
  };
  enoughTimeToPrepare();
  // Linux file inspection only, after the allocation gate and before any Windows call.
  const identity = JSON.parse(runFile('python3', ['-B', join(here, 'qa_admission_stage_check.py')], { encoding: 'utf8', ...within(30000) }));
  checkLiveCandidate(candidate, payload, identity, { scratchExists: p => io.existsSync(p) });
  if (io.existsSync(candidate.work)) throw Error('candidate scratch already consumed; no retry');
  const connector = (injected.connectorAdmission ?? connectorAdmission)(io, checks, homedir(), within);
  stillActive();
  const ps = code => runFile(psBin, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from("$ProgressPreference='SilentlyContinue'; " + code, 'utf16le').toString('base64')],
    { cwd: '/mnt/c', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...within(8000) });
  const appCalls = windowsCalls(ps, candidate.appPort), edgeCalls = windowsCalls(ps, candidate.edgePort);
  edgeCalls.look = async () => readLook(ps(lookCommand(candidate.edgePort, 'msedge.exe')));
  const beforeApp = await appCalls.look();
  stillActive();
  const beforeEdge = await edgeCalls.look();
  enoughTimeToPrepare();
  if (ttsAdmission(candidate, beforeApp, beforeEdge).blocked) {
    const refusal = summarizeTtsPreflight(candidate, beforeApp, beforeEdge, now());
    try {
      io.mkdirSync(out, { recursive: false, mode: 0o700 });
      io.writeFileSync(join(out, 'preflight-refusal.json'), JSON.stringify(refusal, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    } catch { throw Error('preflight conflict found; sanitized refusal could not be saved; nothing started'); }
    throw Error('a launch or debugging-port owner relevant to this run is present; nothing started');
  }
  stillActive();
  if (ps(`[bool](Test-Path -LiteralPath '${candidate.edge}' -PathType Leaf)`).trim() !== 'True') throw Error('reviewed Edge unavailable');
  const expectedApp = { exe: candidate.electron, app: [win(candidate.stage), `--remote-debugging-port=${candidate.appPort}`, '--remote-debugging-address=127.0.0.1'],
    checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${candidate.appPort}`], notBefore: beforeApp.now };
  const expectedEdge = { exe: candidate.edge, app: candidate.edgeArgs, checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${candidate.edgePort}`], notBefore: beforeEdge.now };
  // The Windows runner by its exact identity (Support H1): powershell.exe with exactly this invocation, created since the
  // preflight. Any other process that names this runner file is unresolved (never signalled). It holds no port of its own,
  // so the look's listeners (the app's) are not its. Its launcher's exit proves nothing about it.
  const runnerCalls = { look: async () => ({ ...readLook(ps(lookCommand(candidate.appPort, 'powershell.exe'))), listen: [] }), signal: appCalls.signal };
  const expectedRunner = { exe: candidate.proposed_native_invocation.executable, app: candidate.proposed_native_invocation.arguments, checker: ['unlaunched-qa-checker'],
    markers: [win(join(candidate.work, 'runner.ps1'))], notBefore: beforeApp.now };
  enoughTimeToPrepare();
  io.mkdirSync(out, { recursive: true, mode: 0o700 });
  // The read-only watch starts first and must be ready before anything can start a connector (F5). Not ready: nothing is
  // launched and the scratch stays unused.
  // The watch ends by itself at the cleanup's end at the latest (its own --max-seconds).
  const watch = await startWatch(io, start, sleep, out, Math.max(1, Math.ceil((ends.cleanup - mono()) / 1000)), mono);
  if (!watch.ready.ready) throw Error(`the connector watch is not ready (${watch.ready.reason}); nothing launched, scratch unused`);
  const launchesBefore = watch.launchesBefore;
  // mkdir without recursive refuses an occupied scratch; it permanently consumes this candidate's one attempt. A refusal
  // here (too little time left after the watch's start, or an occupied scratch) stops the watch; nothing was launched.
  try { enoughTimeToPrepare(); io.mkdirSync(candidate.work, { recursive: false }); } catch (error) { await watch.stop(); throw error; }
  const report = { kind: 'four-action nonvoice live run (real subscription, generated surface)', passed: false, identity, connector,
    wrapper_sha256: wrapperHash, candidate_sha256: candidateHash, allocation_sha256: options.allocationSha256, allocation_id: record.allocation_id,
    scratch: candidate.work, scratch_preserved: true, native_attempts: 0, watch_ready: watch.ready, receipt_launches_before: launchesBefore.length, microphone_access: false, audio_access: false, voice: false, cleanup: {},
    limitation: 'CDP/DOM input inside the product windows; one display configuration; no speech, captions, physical pen or full-product acceptance.' };
  try {
    for (const name of ['out', 'apptemp', 'link']) io.mkdirSync(join(candidate.work, name));
    for (const name of names) {
      const target = linkNames.includes(name) ? join(candidate.work, 'link', name) : join(candidate.work, name);
      io.writeFileSync(target, payload[name]);
      if (sha(regularRead(target)) !== pins[name]) throw Error('copied payload differs; launch refused');
    }
    stillActive();
    const encodedPath = Buffer.from(win(join(candidate.work, 'runner.ps1')), 'utf8').toString('base64');
    report.native_parse = JSON.parse(ps(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')); $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors); @{ok=(@($errors).Count -eq 0);errors=@($errors | ForEach-Object { @{line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber;id=$_.ErrorId} })} | ConvertTo-Json -Depth 4 -Compress`).trim());
    if (!report.native_parse.ok) report.aborted = 'exact saved runner parser rejected source; no app launched';
    else {
      // The mandatory watch must still be running right before the launch (a point-in-time check; else nothing launches).
      await assertWatchRunning(watch, io);
      // After the watch's check, right before the launch: the allocation (wall clock), then the preparation budget.
      stillActive();
      if (now() + record.native_bound_ms > deadline) throw Error('allocation has too little time for the bounded native attempt');
      if (mono() > ends.preparation) throw Error('the preparation budget is spent before the launch; nothing launched');
      report.native_attempts = 1;
      enter('native');
      const invocation = candidate.proposed_native_invocation;
      const result = await runAttached(start, psBin, invocation.arguments, Math.min(record.native_bound_ms, remaining()), { sleep, mono, graceMs: NATIVE_GRACE_MS, closeMs: NATIVE_CLOSE_MS });
      report.launcher = { status: result.status, signal: result.signal, timeout: result.timed_out, exit_seen: result.exit_seen, signalled: result.signalled, error: result.error, output_complete: result.output_complete };
      io.writeFileSync(join(out, 'runner.stdout.bin'), result.stdout);
      io.writeFileSync(join(out, 'runner.stderr.bin'), result.stderr);
      if (result.timed_out) report.aborted = `the native runner reached its ${record.native_bound_ms} ms ceiling and was signalled (${result.signalled.join(', ')}); ${result.exit_seen ? 'its WSL launcher process then exited (the Windows runner\'s own end is not observed)' : 'its exit was not seen'}; no retry`;
      else if (result.status !== 0) report.aborted = 'native launcher failed; preserved diagnostics, no retry';
    }
  } catch (error) {
    report.aborted = String(error?.message ?? error).slice(0, 200);
  } finally {
    enter('cleanup');
    // Exact identities only, the Windows runner first: it must be seen gone (or be ended by its exact identity, verified)
    // before the app's cleanup can be final. The product gets time to end its AI session and its connector before any force.
    for (const [label, calls, expected, waitSelfMs, waitCloseMs] of [['runner', runnerCalls, expectedRunner, 5000, 1000], ['electron', appCalls, expectedApp, 1000, 20000], ['edge', edgeCalls, expectedEdge, 1000, 5000]]) {
      if (report.native_attempts === 0) { report.cleanup[label] = { exit: 'not_started', folder: 'kept' }; continue; }
      try { report.cleanup[label] = await releaseOwned({ ...calls, expected, ownsFolder: false, removeFolder: async () => false,
        sleep, now, waitSelfMs, waitCloseMs, waitForceMs: 5000, stepMs: 250 }); }
      catch { report.cleanup[label] = { exit: 'unknown', error: 'exact identity cleanup unavailable; scratch retained' }; }
    }
    // The connector ends with the app (its pipes close). Observed only: nothing in the copy or below it is ever signalled.
    let left = processesIn(CONNECTOR.copy, io);
    for (let waited = 0; left.length && waited < 15000 && remaining() > 0; waited += 500) { await sleep(500); left = processesIn(CONNECTOR.copy, io); }
    await watch.stop(Math.max(0, Math.min(5000, remaining())));
    report.watch_error = watch.state.error; report.watch_exited = watch.state.exited; report.watch_stop = watch.state.stop ?? null;
    report.connector_left_running = left;
    report.connector_watch = watchSummary(io, watch.file, report.native_attempts > 0);
    report.owned_launch_cleanup_confirmed = ['runner', 'electron', 'edge'].every(label => report.cleanup[label]?.exit === 'confirmed');
    // Nothing is claimed released while any of these stands (QA's explicit DISPLAY/ACCOUNT RELEASE quotes it): a launcher
    // that did not end cleanly by itself (any signal, error or the ceiling), no proof of the Windows runner's end, or any
    // signal QA sent it (Support H2).
    const launcher = report.launcher ?? {}, ran = report.native_attempts > 0;
    report.release_blockers = [
      ...(ran && !(launcher.exit_seen === true && launcher.status === 0 && launcher.signal === null && launcher.timeout !== true && (launcher.signalled ?? []).length === 0 && !launcher.error) ? ['the native launcher did not end cleanly by itself (a signal, an error or its ceiling)'] : []),
      ...(ran && report.cleanup.runner?.exit !== 'confirmed' ? ['the Windows runner\'s end is not proven'] : []),
      ...(ran && ((report.cleanup.runner?.signals ?? []).length > 0 || (report.cleanup.runner?.errors ?? []).length > 0) ? ['the Windows runner was signalled by QA, or a look or signal about it failed'] : []),
      ...(ran && !['electron', 'edge'].every(label => report.cleanup[label]?.exit === 'confirmed') ? ['the owned app and Edge are not confirmed gone'] : []),
      ...(left.length > 0 || (ran && report.connector_watch?.state !== 'released') ? ['the connector is not seen released'] : []),
      ...(watch.state.exited !== true ? ['the read-only watch was not seen ending'] : []),
    ];
    enter('evidence');
    // A small bounded record first: the outcome survives even if the collection that follows overruns.
    const status = () => ({ kind: 'qa-live-run-status/1', native_attempts: report.native_attempts, aborted: report.aborted ?? null, launcher: report.launcher ?? null,
      cleanup: Object.fromEntries(Object.entries(report.cleanup).map(([k, v]) => [k, v?.exit ?? null])), watch_exited: report.watch_exited, release_blockers: report.release_blockers,
      budget: { ceilings_ms: { ...BUDGET_MS }, phase_started_after_ms: { ...marks }, status_after_ms: Math.round(mono() - t0) }, evidence_kept_in_place: candidate.work });
    try { io.writeFileSync(join(out, 'run-status.json'), JSON.stringify(status(), null, 2) + '\n'); } catch (error) { report.status_record_error = msg(error); }
    try { collect(io, regularRead, candidate, out, report, launchesBefore, () => remaining() > 2000); }
    catch (error) { report.collect_failed = String(error?.message ?? error).slice(0, 200); }
    report.budget = { ceilings_ms: { ...BUDGET_MS }, phase_started_after_ms: { ...marks }, report_after_ms: Math.round(mono() - t0) };
    Object.assign(report, judgeMechanics(report));
    // This does not close the runtime display/account lease; QA must explicitly report actual release to Lead. Bounded: a
    // report over REPORT_MAX characters is replaced by the status record.
    io.writeFileSync(join(out, 'run.json'), reportText(report, status()));
    try { io.writeFileSync(join(out, 'publish-allowlist.json'), JSON.stringify(publishAllowlist(io, out), null, 2) + '\n'); } catch { /* run.json says what was collected */ }
  }
  return report;
}

/**
 * The read-only watch of the connector and every descendant (qa_sub_watch.py lists /proc and signals nothing), started
 * and awaited until it records its own start with the private copy present and nothing in it; then the names of the
 * receipt launches already present (so that only later ones are this run's). Not ready: the watch is stopped and a
 * refusal written. Nothing here starts a connector.
 */
export async function startWatch(io, start, sleep, out, maxSeconds = 3600, mono = () => performance.now()) {
  const file = join(out, 'connector-watch.jsonl'), stopFile = join(out, 'connector-watch.stop');
  const watcher = start('python3', [join(here, 'qa_sub_watch.py'), '--root', CONNECTOR.copy, '--out', file, '--stop', stopFile, '--max-seconds', String(maxSeconds)], { cwd: '/tmp', stdio: 'ignore' });
  const state = { error: null, exited: false, pid: Number.isInteger(watcher.pid) ? watcher.pid : null, stop: null };
  watcher.on?.('exit', () => { state.exited = true; });
  watcher.on?.('error', error => { state.error = msg(error); });
  // Stops and joins this exact watcher (QA's own child) within ms (Support H3): its stop file, then SIGTERM, then
  // SIGKILL, each awaited; nothing else is signalled. state.stop records what it took.
  const stop = async (ms = 5000) => {
    const record = state.stop = { requested: false, error: null, signalled: [], exited: state.exited };
    try { io.writeFileSync(stopFile, ''); record.requested = true; } catch (error) { record.error = msg(error); }
    // Each wait at most its share of ms, by the clock and by the number of its sleeps.
    const joined = async waitMs => {
      const until = mono() + waitMs;
      for (let waited = 0; !state.exited && waited < waitMs && mono() < until; waited += 50) await sleep(Math.min(50, waitMs - waited));
      return state.exited;
    };
    const signalWait = Math.min(1000, ms / 4);
    if (!(await joined(ms - 2 * signalWait))) {
      for (const how of ['SIGTERM', 'SIGKILL']) {
        try { watcher.kill?.(how); record.signalled.push(how); } catch (error) { record.error ??= msg(error); }
        if (await joined(signalWait)) break;
      }
    }
    record.exited = state.exited;
  };
  const ready = await watchReady(io, file, sleep);
  // Ready means running: a watcher that already exited or failed to start covers nothing (Support R4).
  if (ready.ready && (state.exited || state.error)) Object.assign(ready, { ready: false, reason: state.error ? 'the watch failed: ' + state.error : 'the watch exited before the launch' });
  let launchesBefore = null;
  try { if (ready.ready) launchesBefore = receiptLaunches(io); } catch (error) { Object.assign(ready, { ready: false, reason: msg(error) }); }
  if (!ready.ready) {
    await stop();
    io.writeFileSync(join(out, 'watch-refusal.json'), JSON.stringify({ ready, watch_error: state.error, native_attempts: 0, scratch_consumed: false }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return { file, ready, launchesBefore, state, stop };
}
/**
 * The native runner as an attached child of this same foreground process (never detached, unreferenced or handed to
 * another executor), awaited within its ceiling ms, which includes its end: ms - 2 graceMs - closeMs after the launch a
 * child still there gets SIGTERM, then SIGKILL, each awaited graceMs; after an exit its output is awaited up to closeMs
 * (its pipes close). The waits are short polls, so no timer outlives the child. Output past maxBuffer, or not closed in
 * time, makes output_complete false. A child not seen exiting is reported so.
 */
export async function runAttached(start, file, args, ms, { sleep, mono, graceMs = 5000, closeMs = 2000, stepMs = 250, maxBuffer = 4 * 1024 * 1024 }) {
  const r = { status: null, signal: null, exit_seen: false, timed_out: false, signalled: [], error: null, output_complete: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  const parts = { stdout: [], stderr: [] };
  let child, kept = 0, failed = false, closed = false, truncated = false;
  try { child = start(file, args, { cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (error) { r.error = msg(error); return r; }
  for (const name of ['stdout', 'stderr']) child[name]?.on('data', chunk => {
    const room = maxBuffer - kept;
    if (chunk.length > room) truncated = true;
    if (room > 0) { parts[name].push(chunk.subarray(0, room)); kept += Math.min(room, chunk.length); }
  });
  child.on('exit', (code, signal) => { r.exit_seen = true; r.status = code; r.signal = signal; });
  child.on('close', () => { closed = true; });
  child.on('error', error => { r.error = msg(error); if (!Number.isInteger(child.pid)) failed = true; });   // never started
  const wait = async (done, waitMs) => {
    const end = mono() + waitMs;
    while (!done() && mono() < end) await sleep(Math.min(stepMs, Math.max(1, end - mono())));
    return done();
  };
  const ended = () => r.exit_seen || failed;
  if (!(await wait(ended, ms - 2 * graceMs - closeMs))) {
    r.timed_out = true;
    for (const how of ['SIGTERM', 'SIGKILL']) {
      try { child.kill(how); r.signalled.push(how); } catch (error) { r.error ??= msg(error); }
      if (await wait(ended, graceMs)) break;
    }
  }
  if (r.exit_seen) await wait(() => closed, closeMs);
  r.output_complete = closed && !truncated;
  r.stdout = Buffer.concat(parts.stdout); r.stderr = Buffer.concat(parts.stderr);
  return r;
}
/**
 * Whether the watch still runs, read right now (Support R4): a short wait lets the event loop deliver an exit or error
 * of the watcher that happened during the synchronous work before the launch, and the watcher's own /proc entry is read
 * (present, not a zombie). Read-only; nothing is signalled. Throws when it is not running.
 */
export async function assertWatchRunning(watch, io = fs) {
  await new Promise(r => setTimeout(r, 50));
  let alive = !watch.state.exited && !watch.state.error;
  if (alive && Number.isInteger(watch.state.pid)) {
    try { alive = !/^\d+ \(.*\) Z /.test(io.readFileSync(`/proc/${watch.state.pid}/stat`, 'utf8')); } catch { alive = false; }
  }
  if (!alive) throw Error('the connector watch is no longer running; nothing launched');
}
/** The watch's own start record, awaited (bounded) before anything can start a connector. */
export async function watchReady(io, file, sleep, limitMs = 5000) {
  for (let waited = 0; waited <= limitMs; waited += 100) {
    let start = null;
    try { start = parseJsonl(io.readFileSync(file, 'utf8')).find(e => e.event === 'watch_start') ?? null; } catch { /* not written yet */ }
    if (start) return start.root_exists !== true ? { ready: false, reason: 'the private copy is missing' }
      : !Array.isArray(start.already_there) || start.already_there.length ? { ready: false, reason: 'a process already runs in the private copy' } : { ready: true, at: start.at ?? null };
    await sleep(100);
  }
  return { ready: false, reason: 'the watch recorded no start in time' };
}
/**
 * The read-only watch of the connector and every descendant (the Codex app server runs in its own folder). Released only
 * with the whole lifecycle observed: the watch started before the launch, saw the connector itself appear, saw every
 * appeared process exit, and ended with nothing left. Anything less is unknown, never released.
 */
export function watchSummary(io, file, expected) {
  if (!expected) return { state: 'not_started' };
  let events;
  try { events = parseJsonl(boundedRead(io, file, EVIDENCE_MAX.watch).toString('utf8')); } catch { return { state: 'unknown', note: 'the watch log could not be read' }; }
  const start = events[0]?.event === 'watch_start' ? events[0] : null, end = events.findLast(e => e.event === 'watch_end');
  // One ordered lifecycle (Support R4): the start first, the end last, and between them each process (pid and start
  // ticks, a known role) appears once and then exits once; an exit before its appearance, a repeat, or a record after
  // the end is out of order.
  const key = e => `${e.pid}/${e.start_ticks}`, life = new Map();
  let disorder = null;
  events.forEach((e, i) => {
    if (disorder) return;
    if (e.event === 'watch_start') { if (i !== 0) disorder = 'a second start record'; return; }
    if (e.event === 'watch_end') { if (i !== events.length - 1) disorder = 'records after the end'; return; }
    if (e.event !== 'appear' && e.event !== 'exit') { disorder = 'an unknown record'; return; }
    if (!Number.isSafeInteger(e.pid) || e.pid <= 0 || !Number.isSafeInteger(e.start_ticks) || e.start_ticks < 0) { disorder = 'a process without a usable identity'; return; }
    if (e.event === 'appear') {
      if (life.has(key(e)) || (e.role !== 'in_root' && e.role !== 'descendant')) { disorder = 'a repeated or unknown appearance'; return; }
      life.set(key(e), { role: e.role, pid: e.pid, exited: false });
    } else {
      const p = life.get(key(e));
      if (!p || p.exited) { disorder = 'an exit without an earlier appearance'; return; }
      p.exited = true;
    }
  });
  const procs = [...life.values()];
  const facts = { appeared: procs.length, connector_seen: procs.some(p => p.role === 'in_root'), descendants: procs.filter(p => p.role === 'descendant').length,
    not_seen_exiting: procs.filter(p => !p.exited).map(p => p.pid), unreadable_lines: events.filter(e => e.kind === 'unreadable_line').length, disorder };
  if (end && Array.isArray(end.remaining) && end.remaining.length) return { state: 'left_running', remaining: end.remaining, ...facts };
  const missing = !start ? 'the watch recorded no start first' : start.root_exists !== true || !Array.isArray(start.already_there) || start.already_there.length ? 'the watch did not start clean'
    : !end || !Array.isArray(end.remaining) ? 'the watch recorded no end' : facts.unreadable_lines ? 'the watch log has unreadable lines' : disorder ? 'the watch lifecycle is out of order: ' + disorder
    : !facts.connector_seen ? 'the connector was never seen' : facts.not_seen_exiting.length ? 'a process was not seen exiting' : null;
  return missing ? { state: 'unknown', note: missing, ...facts } : { state: 'released', remaining: [], ...facts };
}
/**
 * The mechanical result: every step, complete collection and records, the exact cleanup, the connector and its children
 * observed gone, the ledger within the ceiling with the provider's turns reconciled and no retry or restart, silent
 * requests, the whole picture at the provider boundary with clean receipt facts for the three answered actions, the Stop
 * attempt's own facts, the Stop fenced, every possibly sent request bound to admitted source checks (F3), and no card
 * value in QA's questions. Acceptance stays NOT_JUDGED: the texts are read.
 */
export function judgeMechanics(report) {
  const l = report.ledger, slots = l?.slots ?? [], stop = slots[3]?.transport;
  // A receipt's facts: no item beyond a plain question and answer, the pinned codex digest and the explicit binary.
  const clean = t => t?.receipt === true && Array.isArray(t.non_plain_items) && t.non_plain_items.length === 0 && t.identity_ok === true;
  const terms = {
    launcher_ok: report.launcher?.status === 0 && report.launcher.timeout !== true && report.launcher.output_complete !== false, not_aborted: !report.aborted, steps_ok: report.steps_ok === true,
    collected: !report.collect_failed && Array.isArray(report.collect_errors) && report.collect_errors.length === 0, records_complete: l?.records_complete === true,
    owned_cleanup_confirmed: report.owned_launch_cleanup_confirmed === true,
    // ... and the read-only watch that saw it was itself seen ending.
    connector_released: (report.connector_left_running ?? ['?']).length === 0 && report.connector_watch?.state === 'released' && report.watch_exited !== false,
    // A request sent through the connector ran in its Codex child: the watch must have seen a descendant.
    connector_lifecycle_correlated: !!l && (l.sent_receipts === 0 || report.connector_watch?.descendants > 0),
    ceiling_ok: l?.ceiling_ok === true, provider_turns_reconciled: l?.turns_consistent === true, no_retry_or_restart: !!l && !l.restarted && !l.retried, all_silent: l?.all_silent === true,
    four_actions_counted: slots.length === 4 && slots.every(s => s.counted),
    whole_picture_at_provider: slots.length === 4 && slots.slice(0, 3).every(s => s.transport?.verdict === 'whole picture at the provider boundary' && clean(s.transport)),
    // The Stop attempt: its receipt's facts when it has one (inputs, when set, are the app's frame); without one, every
    // record must say not submitted (a genuinely unsent attempt need not have a receipt).
    stop_attempt_facts_ok: slots.length === 4 && (stop?.receipt ? clean(stop) && (stop.input_types.length === 0 || stop.image_sha256_matches_app_record === true) : report.fence?.phase === 'not_submitted'),
    fenced: typeof report.fence?.verdict === 'string' && report.fence.verdict.startsWith('fenced'),
    // F3: every request that may have reached the provider went out only with an admitted source (QA's checker log).
    source_admission_bound: report.source_admission?.all_bound === true,
    // The capture's checker exited by itself, cleanly, as main recorded it, after QA's last decision.
    checker_lifecycle_released: report.source_admission?.checker_released === true,
    no_value_in_questions: (report.evidence?.leaks_in_questions ?? ['?']).length === 0,
  };
  return { mechanics: terms, mechanics_passed: Object.values(terms).every(Boolean), passed: Object.values(terms).every(Boolean),
    acceptance: 'NOT_JUDGED: the pixel matchers in evidence are necessary, never sufficient; QA and the Lead read every verbatim text.' };
}

const RECEIPT_FIELDS = ['request_id', 'input_types', 'text_bytes', 'image_bytes', 'image_sha256', 'submission', 'terminal_status', 'outcome', 'produced_item_types', 'thread_start_count', 'turn_start_count', 'actual_model', 'codex_version', 'codex_sha256', 'explicit_bin_override'];
/**
 * Only the receipt fields the review needs, as typed values (a scalar, or a list of strings), and the connector's output
 * diagnostics (Backend 4e840a4), each only with a valid bounded value: never thread_id, turn_id, the executable path, an
 * object, content or anything else (a value of another shape is left out).
 */
export function sanitizeReceipts(receipts) {
  const typed = v => v === null || ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));
  return Object.fromEntries(Object.entries(receipts).map(([rid, r]) => [rid, Object.fromEntries(RECEIPT_FIELDS.filter(k => k in (r ?? {}) && typed(r[k])).map(k => [k, Array.isArray(r[k]) ? [...r[k]] : r[k]])
    .concat(DIAGNOSTIC_KEYS.filter(k => k in (r ?? {}) && DIAGNOSTICS[k](r[k])).map(k => [k, r[k]])))]));
}
// The connector writer's own bounded schema (52be105 chatgpt_receipts.py _metadata and its identity), checked before a
// receipt is admitted or copied (Support R5). Returns the first fault, or null.
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\p{Cc}\p{Cs}]/u.test(v);
const count = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
const digest = v => v === null || (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v));
// Backend 4e840a4 (handoff_1b30e743): the private output diagnostics the connector may add, all of them or none. Each is a
// nullable fixed enum, a nullable boolean, or a count 0..MAX_TURN_EVENTS**2 (4096**2), and the completed messages add up
// by phase. Never content.
const FAILURE_CODES = ['unavailable', 'protocol_error', 'request_failed', 'timeout', 'outcome_unknown', 'cancelled', 'cancellation_uncertain', 'isolation_unverified',
  'unauthenticated', 'unsupported_model', 'model_mismatch', 'tool_activity', 'incomplete_turn', 'quota_exhausted', 'rate_limited', 'workspace_limit', 'usage_not_allowed',
  'session_budget_exceeded', 'context_limit', 'overloaded', 'session_stopped', 'budget_reached', 'stale_context', 'busy', 'invalid_request', 'login_not_found', 'login_failed', 'closed'];
const oneOf = values => v => v === null || (typeof v === 'string' && values.includes(v));
const completed = v => count(v, 4096 ** 2);
export const DIAGNOSTICS = { failure_code: oneOf(FAILURE_CODES), terminal_items_view: oneOf(['full', 'summary', 'notLoaded', 'invalid']),
  terminal_error_present: v => v === null || typeof v === 'boolean', completed_message_count: completed, completed_final_answer_count: completed,
  completed_commentary_count: completed, completed_unphased_count: completed, answer_selection: oneOf(['final_answer', 'unphased', 'none']),
  answer_text_state: oneOf(['empty', 'whitespace', 'nonempty']) };
const DIAGNOSTIC_KEYS = Object.keys(DIAGNOSTICS);
export function receiptFault(r) {
  if (!text(r.request_id, 128)) return 'request_id';
  if (!Array.isArray(r.input_types) || r.input_types.length > 2 || new Set(r.input_types).size !== r.input_types.length || !r.input_types.every(x => x === 'text' || x === 'image')) return 'input_types';
  if (!Array.isArray(r.produced_item_types) || r.produced_item_types.length > 64 || !r.produced_item_types.every(x => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(x))) return 'produced_item_types';
  for (const [p, max] of [['text', 4 * 65536], ['image', 8 * 1024 * 1024]]) {
    if ((r[`${p}_bytes`] === null && r[`${p}_sha256`] !== null) || (r[`${p}_bytes`] !== null && !count(r[`${p}_bytes`], max))) return `${p}_bytes`;
    if (!digest(r[`${p}_sha256`])) return `${p}_sha256`;
  }
  if (!count(r.thread_start_count, 4096)) return 'thread_start_count';
  if (!count(r.turn_start_count, 4096)) return 'turn_start_count';
  if (!['not_submitted', 'written', 'acknowledged', 'uncertain'].includes(r.submission)) return 'submission';
  if (r.terminal_status !== null && !['inProgress', 'completed', 'interrupted', 'failed'].includes(r.terminal_status)) return 'terminal_status';
  if (!['pending', 'completed', 'cancelled', 'failed', 'not_submitted', 'uncertain'].includes(r.outcome)) return 'outcome';
  if (r.actual_model !== null && !(typeof r.actual_model === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(r.actual_model))) return 'actual_model';
  for (const k of ['thread_id', 'turn_id']) if (r[k] !== null && !text(r[k], 128)) return k;
  if (r.format !== 'lc-subscription-ask-receipt/1') return 'format';
  if (!text(r.codex_executable, 4096) || !/^\//.test(r.codex_executable)) return 'codex_executable';
  if (!(typeof r.codex_version === 'string' && /^(?:codex-cli )?[0-9][A-Za-z0-9._+-]{0,63}$/.test(r.codex_version))) return 'codex_version';
  if (!(typeof r.codex_sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.codex_sha256))) return 'codex_sha256';
  if (typeof r.explicit_bin_override !== 'boolean') return 'explicit_bin_override';
  // The output diagnostics: all of them or none, each valid, and the completed messages adding up by phase.
  const present = DIAGNOSTIC_KEYS.filter(k => k in r);
  if (present.length > 0 && present.length !== DIAGNOSTIC_KEYS.length) return DIAGNOSTIC_KEYS.find(k => !(k in r));
  if (present.length > 0) {
    const invalid = DIAGNOSTIC_KEYS.find(k => !DIAGNOSTICS[k](r[k]));
    if (invalid) return invalid;
    if (r.completed_message_count !== r.completed_final_answer_count + r.completed_commentary_count + r.completed_unphased_count) return 'completed_message_count';
  }
  return null;
}
/**
 * The files of this run's evidence folder that may go to Git after review: generated, sanitized records only. Raw receipts
 * are elsewhere; anything not listed here (for example a future private file) is excluded by default.
 */
export function publishAllowlist(io, out) {
  let seen = 0;
  const allowed = [], walk = (dir, rel) => { for (const name of io.readdirSync(dir)) { const full = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (++seen > 1024) throw Error('more than 1024 entries in the evidence folder');
    if (io.statSync(full).isDirectory()) walk(full, r);
    else if (/^(run|run-status|ledger|receipts-sanitized|runner-results|connector-watch|admission-checker)\.json(l)?$|^runner\.(stdout|stderr)\.bin$|^captures\/[0-9a-f]+\/(live\.jsonl|admission\.jsonl|asks\/[A-Za-z0-9._-]+\.json)$/.test(r)) allowed.push(r); } };
  walk(out, '');
  return { kind: 'qa-live-publish-allowlist/1', files: allowed.sort(), excluded_by_default: 'everything else; raw receipts are outside the repository', review: 'QA and the Lead read each listed file before commit' };
}

const RECEIPT_KEYS = ['request_id', 'input_types', 'text_bytes', 'text_sha256', 'image_bytes', 'image_sha256', 'submission', 'terminal_status', 'outcome', 'produced_item_types',
  'thread_start_count', 'turn_start_count', 'actual_model', 'thread_id', 'turn_id', 'format', 'codex_executable', 'codex_version', 'codex_sha256', 'explicit_bin_override'].sort();
// ... or exactly these and every output diagnostic (Backend 4e840a4); a mixed, partial or extra set is no receipt.
const RECEIPT_KEYS_EXTENDED = [...RECEIPT_KEYS, ...DIAGNOSTIC_KEYS].sort();
/** The launch folder names under the product's receipts/ (names only; nothing opened), or none. */
export function receiptLaunches(io = fs, root = join(managedState, 'receipts')) {
  if (!io.existsSync(root)) return [];
  const st = io.lstatSync(root);
  if (!st.isDirectory() || st.isSymbolicLink() || io.realpathSync(root) !== root) throw Error('the receipts folder is not the product\'s own real folder');
  return io.readdirSync(root).sort();
}
/**
 * This run's own receipts, each checked before a byte of it is copied: only launch folders that did not exist just before
 * the native launch, each a real folder named as the connector names it, inside the real receipts/ folder; only
 * <launch>/<sha256(request_id)>.json for this run's request ids, opened without following a link, a regular single-link
 * file of at most 16 KiB, in the connector's receipt format with exactly its fields (the legacy set, or that set and every
 * output diagnostic), naming that request id, and found in
 * one launch only. Anything else is an error, never a receipt. (The codex digest is judged in the ledger, not here.)
 */
export function readOwnReceipts(io, before, requestIds, root = join(managedState, 'receipts'), enough = () => true) {
  const receipts = {}, raw = [], errors = [];
  let launches = [];
  try { launches = receiptLaunches(io, root).filter(n => !before.includes(n)); } catch (error) { return { receipts, raw, errors: ['receipts: ' + msg(error)], launches }; }
  if (launches.length > EVIDENCE_MAX.launches) errors.push(`receipts: ${launches.length} new launches; only the first ${EVIDENCE_MAX.launches} are read`);
  for (const launch of launches.slice(0, EVIDENCE_MAX.launches)) {
    const dir = join(root, launch);
    try {
      if (!/^[0-9a-f]{32}$/.test(launch)) throw Error('an entry not named as the connector names a launch');
      const st = io.lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink() || io.realpathSync(dir) !== dir) throw Error('not a real folder inside receipts/');
    } catch (error) { errors.push(`receipts/${launch.slice(0, 40)}: ${msg(error)}`); continue; }
    for (const rid of requestIds) {
      if (!enough()) { errors.push('the evidence budget is spent: the receipts are incomplete'); return { receipts, raw, errors, launches }; }
      const name = `${sha(Buffer.from(rid, 'utf8'))}.json`;
      let fd = null;
      try {
        try { fd = io.openSync(join(dir, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
        const st = io.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || st.size > 16384) throw Error('not a regular single-link file of at most 16 KiB');
        const bytes = readAtMost(io, fd, st.size), r = JSON.parse(bytes.toString('utf8'));
        if (!r || typeof r !== 'object' || Array.isArray(r) || r.format !== 'lc-subscription-ask-receipt/1' || r.request_id !== rid || ![RECEIPT_KEYS, RECEIPT_KEYS_EXTENDED].some(keys => equal(Object.keys(r).sort(), keys))) throw Error('not this request\'s receipt in the connector\'s format');
        const fault = receiptFault(r);
        if (fault) throw Error(`the receipt's ${fault} is not of the connector's bounded type`);
        if (rid in receipts) throw Error('the request has receipts in two launches');
        receipts[rid] = { ...r, __launch: launch };
        raw.push({ launch, name, bytes });
      } catch (error) { errors.push(`receipts/${launch}/${name.slice(0, 12)}: ${msg(error)}`); }
      finally { if (fd !== null) try { io.closeSync(fd); } catch { /* closed */ } }
    }
  }
  return { receipts, raw, errors, launches };
}

/** At most size bytes from an open file; more means it grew while it was read (not read, kept in place). */
function readAtMost(io, fd, size) {
  const buffer = Buffer.alloc(size + 1);
  let n = 0, got;
  while (n < buffer.length && (got = io.readSync(fd, buffer, n, buffer.length - n, n)) > 0) n += got;
  if (n > size) throw Error('the file grew while it was read: not read (kept in place)');
  return buffer.subarray(0, n);
}
/**
 * One evidence file, read only while its phase has time left, opened without following a link, and at most maxBytes
 * through that open file (a larger or growing one is an error and stays in place).
 */
export function boundedRead(io, path, maxBytes, enough = () => true) {
  if (!enough()) throw Error('the evidence budget is spent: not read (kept in place)');
  const fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = io.fstatSync(fd);
    if (!st.isFile()) throw Error('regular file required');
    if (!(st.size <= maxBytes)) throw Error(`not read: over ${maxBytes} bytes or of unknown size (kept in place)`);
    return readAtMost(io, fd, st.size);
  } finally { try { io.closeSync(fd); } catch { /* closed */ } }
}
/** The report as written: within max characters, or else the bounded status record and the reason. */
export function reportText(report, status, max = REPORT_MAX) {
  const text = JSON.stringify(report, null, 2) + '\n';
  return text.length <= max ? text : JSON.stringify({ ...status, error: `the full report exceeded ${max} characters; the evidence is kept in place` }, null, 2) + '\n';
}
/**
 * This run's own results, records and receipts (a failed copy is reported, never fatal to the report), within the
 * evidence budget (enough) and EVIDENCE_MAX: whatever is not read or copied in time, or is over a bound, is an error and
 * stays in the scratch, never a skipped success.
 */
function collect(io, regularRead, candidate, out, report, launchesBefore, enough = () => true) {
  const errors = [];
  let total = 0;
  const take = (path, max) => { const bytes = boundedRead(io, path, Math.min(max, EVIDENCE_MAX.total - total), enough); total += bytes.length; return bytes; };
  const put = (path, data, options) => { if (!enough()) throw Error('the evidence budget is spent: not copied (kept in place)'); io.writeFileSync(path, typeof data === 'function' ? data() : data, options); };
  let results = null;
  try {
    const bytes = take(join(candidate.work, 'out/results.json'), EVIDENCE_MAX.results);
    put(join(out, 'runner-results.json'), bytes);
    results = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    report.aborted ??= typeof results.aborted === 'string' ? results.aborted.slice(0, 2000) : null;
  } catch (error) { errors.push('runner results: ' + msg(error)); report.aborted ??= 'native result unreadable; scratch and raw evidence retained'; }
  const steps = JSON.parse(regularRead(join(candidateDir, 'steps.json')));
  report.steps_ok = !!results && results.steps.length === steps.length && results.steps.every(s => s.ok === true);
  // The runner's own work deadline: the waits and sleeps it shortened, and whether it stopped the steps (later steps NOT_RUN).
  report.work_deadline = results ? { stopped_the_steps: String(results.aborted ?? '').includes('QA work deadline'), limited_steps: results.steps.filter(s => s.work_deadline_limited === true).map(s => s.i) } : null;
  const liveLines = [], asks = [], mainAdmission = {};
  const captures = join(candidate.work, 'userdata', 'captures');
  // Every record file on its own: one unreadable file is an error (the evidence incomplete), never a skipped success.
  try {
    const folders = io.existsSync(captures) ? io.readdirSync(captures) : [];
    if (folders.length > EVIDENCE_MAX.captures) errors.push(`records: ${folders.length} capture folders; only the first ${EVIDENCE_MAX.captures} are read (the rest kept in place)`);
    for (const cap of folders.slice(0, EVIDENCE_MAX.captures)) {
      if (!enough()) { errors.push('the evidence budget is spent: the records are incomplete'); break; }
      const liveFile = join(captures, cap, 'live.jsonl');
      try {
        if (io.existsSync(liveFile)) {
          const text = take(liveFile, EVIDENCE_MAX.live);
          io.mkdirSync(join(out, 'captures', cap), { recursive: true, mode: 0o700 });
          put(join(out, 'captures', cap, 'live.jsonl'), text);
          liveLines.push(...parseJsonl(text));
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/live.jsonl: ${msg(error)}`); }
      const admissionFile = join(captures, cap, 'admission.jsonl');
      try {
        if (io.existsSync(admissionFile)) {
          const text = take(admissionFile, EVIDENCE_MAX.admission);
          io.mkdirSync(join(out, 'captures', cap), { recursive: true, mode: 0o700 });
          put(join(out, 'captures', cap, 'admission.jsonl'), text);
          mainAdmission[cap] = parseJsonl(text);                                   // kept per capture folder (provenance)
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/admission.jsonl: ${msg(error)}`); }
      const askDir = join(captures, cap, 'asks');
      try {
        const names = io.existsSync(askDir) ? io.readdirSync(askDir).filter(n => n.endsWith('.json')) : [];
        if (names.length > EVIDENCE_MAX.asks) errors.push(`records ${cap.slice(0, 40)}/asks: ${names.length} records; only the first ${EVIDENCE_MAX.asks} are read (the rest kept in place)`);
        for (const name of names.slice(0, EVIDENCE_MAX.asks)) {
          try {
            const bytes = take(join(askDir, name), EVIDENCE_MAX.ask);
            io.mkdirSync(join(out, 'captures', cap, 'asks'), { recursive: true, mode: 0o700 });
            put(join(out, 'captures', cap, 'asks', name), bytes);
            asks.push(JSON.parse(bytes));
          } catch (error) { errors.push(`records ${cap.slice(0, 40)}/asks/${name.slice(0, 40)}: ${msg(error)}`); }
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/asks: ${msg(error)}`); }
    }
  } catch (error) { errors.push('records: ' + msg(error)); }
  const ids = new Set();
  for (const l of liveLines) if (typeof l.request_id === 'string') ids.add(l.request_id);
  for (const a of asks) for (const q of Array.isArray(a?.requests) ? a.requests : []) if (typeof q?.request_id === 'string') ids.add(q.request_id);
  const requestIds = [...ids].slice(0, EVIDENCE_MAX.requests);
  if (ids.size > EVIDENCE_MAX.requests) errors.push(`receipts: ${ids.size} request ids; only the first ${EVIDENCE_MAX.requests} are looked up`);
  // Only the receipts of this run's requests, in launches new since just before the native launch, each checked before it
  // is copied (readOwnReceipts). Nothing else in the product's managed state is opened or copied.
  const own = enough() ? readOwnReceipts(io, launchesBefore ?? [], requestIds, undefined, enough) : { receipts: {}, raw: [], launches: [], errors: ['the evidence budget is spent: the receipts are not read'] };
  errors.push(...own.errors);
  report.receipt_launches_new = own.launches.length;
  try {
    for (const { launch, name, bytes } of own.raw) {
      // Raw (they hold provider thread/turn ids): outside the repository, never in the evidence folder.
      const raw = join(rawReceiptsRoot, out.split('/').at(-1), 'receipts', launch);
      io.mkdirSync(raw, { recursive: true, mode: 0o700 });
      put(join(raw, name), bytes, { mode: 0o600, flag: 'wx' });
    }
  } catch (error) { errors.push('raw receipts: ' + msg(error)); }
  const receipts = own.receipts;
  const values = results?.values ?? {}, read = k => { try { return JSON.parse(values[k]); } catch { return null; } };
  // Never launched: nothing ran (no slot is counted). Launched without readable results: the ledger counts every slot as unknown.
  report.ledger = buildLedger({ steps, results: results ?? (report.native_attempts > 0 ? null : { steps: [], values: {} }), liveLines, asks, receipts, codexSha256: CONNECTOR.codex_sha256 });
  report.fence = fenceVerdict(report.ledger, liveLines, values);
  // QA's own source-admission checker log (metadata only: phases, verdicts, sequences, hashes and admission times).
  let checkerLines = [];
  if (!enough()) errors.push('the evidence budget is spent: the checker log is not read');
  else try {
    const bytes = take(join(candidate.work, 'out', 'admission-checker.jsonl'), EVIDENCE_MAX.checker);
    put(join(out, 'admission-checker.jsonl'), bytes);
    checkerLines = parseJsonl(bytes.toString('utf8'));
    if (checkerLines.some(l => l.kind === 'unreadable_line')) errors.push('admission checker log: unreadable lines');
  } catch (error) { errors.push('admission checker log: ' + msg(error)); }
  if (Object.values(mainAdmission).some(lines => lines.some(l => l.kind === 'unreadable_line'))) errors.push('main admission record: unreadable lines');
  report.source_admission = sourceAdmission(report.ledger, checkerLines, read('display_choice'), mainAdmission);
  report.evidence = evidence({ ledger: report.ledger, liveLines, cards: { action2: read('action2_card'), action3: read('action3_card') }, truthBefore: read('surface_before'), truthAfter: read('surface_changed') });
  report.collect_errors = errors;
  put(join(out, 'ledger.json'), () => JSON.stringify(report.ledger, null, 2) + '\n');
  // Sanitized receipt facts (no thread or turn id, no executable path) for review; the raw files stay outside Git.
  put(join(out, 'receipts-sanitized.json'), () => JSON.stringify(sanitizeReceipts(receipts), null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, out, allocation, allocationSha256, extra] = process.argv.slice(2);
  if (mode !== '--execute' || !out || !allocation || !allocationSha256 || extra) throw Error('no default run: --execute <new QA folder> <allocation.json> <Lead-provided SHA256>');
  const report = await runLiveCandidate({ execute: true, out, allocation, allocationSha256 });
  console.log(JSON.stringify({ mechanics_passed: report.mechanics_passed, acceptance: report.acceptance, aborted: report.aborted ?? null, native_attempts: report.native_attempts,
    attempts_used: report.ledger?.attempts_used ?? null, fence: report.fence?.verdict ?? null, cleanup: report.cleanup, connector: report.connector_watch, scratch: report.scratch, release_blockers: report.release_blockers, budget: report.budget }));
  // The report is written: a child not seen exiting (a release blocker in it) must not hold this foreground invocation
  // past its budget.
  process.exit(report.mechanics_passed ? 0 : 1);
}
