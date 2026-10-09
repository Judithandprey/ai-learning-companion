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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECTOR, POLICY_MS, checkLiveCandidate, linkNames, names } from './qa_live_candidate.mjs';
import { buildLedger, evidence, fenceVerdict, liveImportCheck, parseJsonl, sourceAdmission } from './qa_live_ledger.mjs';
import { summarizeTtsPreflight, ttsAdmission } from './qa_run_tts_candidate.mjs';
import { lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';
import { askPathCheck, compareCopy } from './sub_copy.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
export const candidateDir = join(repo, 'docs/verification/qa/p0-13-live-52be105/candidate-nonvoice-04');
export const candidateHash = '4cb6032ef8eccea7306cdd624cf2e7846e04c07ca801145dba5490eb232c7410';
export const pins = { 'runner.ps1': '3adea4670487f84215608865be9eb569b80ad7070feec5a8fb7a166ab7abfc99', 'steps.json': '4049577415ad805c11b23e3cf1009b4e071956cfe24669e807574aeb354e423c', 'surface.html': 'be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067', 'sub-live.json': '4729ca1a25ec09a64349c68c5ccb0eb41b4e9f83e161fb9c4a29b0ce26b948d4',
  'admission-checker.ps1': '9b4b3537ec84d2beb54347c5132860c8a9755c6f28b69ab07dccc160f2d6e6e1', 'admission-live.json': 'a28429bc0be901d878c5240181f94e351d74f6abbf1619a1c73b49d9b1fa818e' };
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

// F3: the reviewed production build whose main process starts QA's source-admission checker (Web's interlock). Unset
// until that build is reviewed and the candidate regenerated for it: until then every allocation is refused, whatever
// else it states. 52be105 never starts the checker, so a run of it would send real requests without source admission.
export const interlockProduction = null;
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
      || record.native_bound_ms !== candidate.native_bound_ms || candidate.native_bound_ms !== 600000 || candidate.native_worst_case_ms > candidate.native_bound_ms
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
export function connectorAdmission(io = fs, checks = { compareCopy, askPathCheck, liveImportCheck }, home = homedir()) {
  // The product's managed state and the raw-receipt root are this user's: the connector runs as this same WSL user.
  if (home !== `/home/${CONNECTOR.user}` || !managedState.startsWith(home + '/') || !rawReceiptsRoot.startsWith(home + '/')) throw Error('the connector user\'s home is not the one the receipt folders assume');
  if (!io.existsSync(CONNECTOR.copy)) throw Error('the private 52be105 Backend copy is missing (qa_live_candidate.mjs prepare-connector)');
  const same = checks.compareCopy(CONNECTOR.commit, CONNECTOR.copy);
  if (!same.equal) throw Error('the private Backend copy is not exactly 52be105 services/ and packages/');
  if (processesIn(CONNECTOR.copy, io).length) throw Error('something already runs in the private Backend copy');
  const ask = checks.askPathCheck(CONNECTOR.python, CONNECTOR.copy), livePath = checks.liveImportCheck(CONNECTOR.python, CONNECTOR.copy);
  if (!ask.ok || !livePath.ok) throw Error('the connector cannot prepare a request in the private copy');
  if (sha(io.readFileSync(CONNECTOR.codex_bin)) !== CONNECTOR.codex_sha256) throw Error('the pinned codex binary digest does not match');
  return { copy: CONNECTOR.copy, files: same.files, ask_path_ok: true, live_path_ok: true, codex_sha256: CONNECTOR.codex_sha256,
    state_dir: 'the product\'s own managed state (state_dir null). QA lists only its receipts/ folder names and reads only this run\'s receipts/<launch>/<sha256(request_id)>.json; nothing else there is listed or opened.' };
}

export async function runLiveCandidate(options, injected = {}) {
  // Injection is for the offline boundary test, never a CLI option or a product path.
  const io = injected.fs ?? fs, runFile = injected.execFileSync ?? execFileSync, run = injected.spawnSync ?? spawnSync, start = injected.spawn ?? spawn;
  const now = injected.now ?? Date.now, sleep = injected.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
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
  checkLiveCandidate(candidate, payload, JSON.parse(regularRead(join(repo, 'docs/verification/qa/p0-13-tts-52be105/stage-identity.json'))), { scratchExists: p => io.existsSync(p) });
  const allocationBytes = regularRead(allocationPath);
  if (sha(allocationBytes) !== options.allocationSha256) throw Error('allocation differs from independently reviewed hash');
  const record = JSON.parse(allocationBytes), wrapperHash = sha(regularRead(fileURLToPath(import.meta.url)));
  const deadline = validateLiveAllocation(record, candidate, wrapperHash, now(), injected.interlock ?? interlockProduction);
  const stillActive = () => { if (now() >= deadline) throw Error('allocation expired before admission/launch; no retry'); };
  // Linux file inspection only, after the allocation gate and before any Windows call.
  const identity = JSON.parse(runFile('python3', ['-B', join(here, 'qa_tts_stage_check.py')], { encoding: 'utf8', timeout: 30000 }));
  checkLiveCandidate(candidate, payload, identity, { scratchExists: p => io.existsSync(p) });
  if (io.existsSync(candidate.work)) throw Error('candidate scratch already consumed; no retry');
  const connector = connectorAdmission(io, checks);
  stillActive();
  const ps = code => runFile(psBin, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from("$ProgressPreference='SilentlyContinue'; " + code, 'utf16le').toString('base64')],
    { cwd: '/mnt/c', encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
  const appCalls = windowsCalls(ps, candidate.appPort), edgeCalls = windowsCalls(ps, candidate.edgePort);
  edgeCalls.look = async () => readLook(ps(lookCommand(candidate.edgePort, 'msedge.exe')));
  const beforeApp = await appCalls.look();
  stillActive();
  const beforeEdge = await edgeCalls.look();
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
  stillActive();
  io.mkdirSync(out, { recursive: true, mode: 0o700 });
  // The read-only watch starts first and must be ready before anything can start a connector (F5). Not ready: nothing is
  // launched and the scratch stays unused.
  const watch = await startWatch(io, start, sleep, out);
  if (!watch.ready.ready) throw Error(`the connector watch is not ready (${watch.ready.reason}); nothing launched, scratch unused`);
  const launchesBefore = watch.launchesBefore;
  // mkdir without recursive refuses an occupied scratch; it permanently consumes this candidate's one attempt. A refusal
  // here stops the watch (nothing was launched).
  try { stillActive(); io.mkdirSync(candidate.work, { recursive: false }); } catch (error) { await watch.stop(); throw error; }
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
      stillActive();
      if (now() + record.native_bound_ms > deadline) throw Error('allocation has too little time for the bounded native attempt');
      // The mandatory watch must still be running right before the launch (a point-in-time check; else nothing launches).
      await assertWatchRunning(watch, io);
      report.native_attempts = 1;
      const invocation = candidate.proposed_native_invocation;
      const result = run(psBin, invocation.arguments, { cwd: '/mnt/c', timeout: record.native_bound_ms, maxBuffer: 4 * 1024 * 1024 });
      report.launcher = { status: result.status, signal: result.signal, timeout: result.error?.code === 'ETIMEDOUT' };
      io.writeFileSync(join(out, 'runner.stdout.bin'), result.stdout ?? Buffer.alloc(0));
      io.writeFileSync(join(out, 'runner.stderr.bin'), result.stderr ?? Buffer.alloc(0));
      if (result.status !== 0) report.aborted = 'native launcher failed; preserved diagnostics, no retry';
    }
  } catch (error) {
    report.aborted = String(error?.message ?? error).slice(0, 200);
  } finally {
    // Exact identities only; the product gets time to end its AI session and its connector before any force.
    for (const [label, calls, expected, waitCloseMs] of [['electron', appCalls, expectedApp, 20000], ['edge', edgeCalls, expectedEdge, 5000]]) {
      if (report.native_attempts === 0) { report.cleanup[label] = { exit: 'not_started', folder: 'kept' }; continue; }
      try { report.cleanup[label] = await releaseOwned({ ...calls, expected, ownsFolder: false, removeFolder: async () => false,
        sleep, now, waitSelfMs: 1000, waitCloseMs, waitForceMs: 5000, stepMs: 250 }); }
      catch { report.cleanup[label] = { exit: 'unknown', error: 'exact identity cleanup unavailable; scratch retained' }; }
    }
    // The connector ends with the app (its pipes close). Observed only: nothing in the copy or below it is ever signalled.
    let left = [];
    for (let waited = 0; waited <= 15000; waited += 500) { left = processesIn(CONNECTOR.copy, io); if (!left.length) break; await sleep(500); }
    await watch.stop();
    report.watch_error = watch.state.error; report.watch_exited = watch.state.exited;
    report.connector_left_running = left;
    report.connector_watch = watchSummary(io, watch.file, report.native_attempts > 0);
    try { collect(io, regularRead, candidate, out, report, launchesBefore); }
    catch (error) { report.collect_failed = String(error?.message ?? error).slice(0, 200); }
    report.owned_launch_cleanup_confirmed = ['electron', 'edge'].every(label => report.cleanup[label]?.exit === 'confirmed');
    Object.assign(report, judgeMechanics(report));
    // This does not close the runtime display/account lease; QA must explicitly report actual release to Lead.
    io.writeFileSync(join(out, 'run.json'), JSON.stringify(report, null, 2) + '\n');
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
export async function startWatch(io, start, sleep, out) {
  const file = join(out, 'connector-watch.jsonl'), stopFile = join(out, 'connector-watch.stop');
  const watcher = start('python3', [join(here, 'qa_sub_watch.py'), '--root', CONNECTOR.copy, '--out', file, '--stop', stopFile], { cwd: '/tmp', stdio: 'ignore' });
  const state = { error: null, exited: false, pid: Number.isInteger(watcher.pid) ? watcher.pid : null };
  const exited = new Promise(r => { watcher.on?.('exit', () => { state.exited = true; r(); }); });
  watcher.on?.('error', error => { state.error = msg(error); });
  const stop = async () => {
    try { io.writeFileSync(stopFile, ''); } catch { /* the watch stops by itself after its own bound */ }
    let t;
    await Promise.race([exited, new Promise(r => { t = setTimeout(r, 5000); })]);
    clearTimeout(t);
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
  try { events = parseJsonl(io.readFileSync(file, 'utf8')); } catch { return { state: 'unknown', note: 'the watch log could not be read' }; }
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
    launcher_ok: report.launcher?.status === 0, not_aborted: !report.aborted, steps_ok: report.steps_ok === true,
    collected: !report.collect_failed && Array.isArray(report.collect_errors) && report.collect_errors.length === 0, records_complete: l?.records_complete === true,
    owned_cleanup_confirmed: report.owned_launch_cleanup_confirmed === true,
    connector_released: (report.connector_left_running ?? ['?']).length === 0 && report.connector_watch?.state === 'released',
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
    no_value_in_questions: (report.evidence?.leaks_in_questions ?? ['?']).length === 0,
  };
  return { mechanics: terms, mechanics_passed: Object.values(terms).every(Boolean), passed: Object.values(terms).every(Boolean),
    acceptance: 'NOT_JUDGED: the pixel matchers in evidence are necessary, never sufficient; QA and the Lead read every verbatim text.' };
}

const RECEIPT_FIELDS = ['request_id', 'input_types', 'text_bytes', 'image_bytes', 'image_sha256', 'submission', 'terminal_status', 'outcome', 'produced_item_types', 'thread_start_count', 'turn_start_count', 'actual_model', 'codex_version', 'codex_sha256', 'explicit_bin_override'];
/**
 * Only the receipt fields the review needs, as typed values (a scalar, or a list of strings): never thread_id, turn_id,
 * the executable path, an object or anything else (a value of another shape is left out).
 */
export function sanitizeReceipts(receipts) {
  const typed = v => v === null || ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));
  return Object.fromEntries(Object.entries(receipts).map(([rid, r]) => [rid, Object.fromEntries(RECEIPT_FIELDS.filter(k => k in (r ?? {}) && typed(r[k])).map(k => [k, Array.isArray(r[k]) ? [...r[k]] : r[k]]))]));
}
// The connector writer's own bounded schema (52be105 chatgpt_receipts.py _metadata and its identity), checked before a
// receipt is admitted or copied (Support R5). Returns the first fault, or null.
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\p{Cc}\p{Cs}]/u.test(v);
const count = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
const digest = v => v === null || (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v));
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
  return null;
}
/**
 * The files of this run's evidence folder that may go to Git after review: generated, sanitized records only. Raw receipts
 * are elsewhere; anything not listed here (for example a future private file) is excluded by default.
 */
export function publishAllowlist(io, out) {
  const allowed = [], walk = (dir, rel) => { for (const name of io.readdirSync(dir)) { const full = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (io.statSync(full).isDirectory()) walk(full, r);
    else if (/^(run|ledger|receipts-sanitized|runner-results|connector-watch|admission-checker)\.json(l)?$|^runner\.(stdout|stderr)\.bin$|^captures\/[0-9a-f]+\/(live\.jsonl|admission\.jsonl|asks\/[A-Za-z0-9._-]+\.json)$/.test(r)) allowed.push(r); } };
  walk(out, '');
  return { kind: 'qa-live-publish-allowlist/1', files: allowed.sort(), excluded_by_default: 'everything else; raw receipts are outside the repository', review: 'QA and the Lead read each listed file before commit' };
}

const RECEIPT_KEYS = ['request_id', 'input_types', 'text_bytes', 'text_sha256', 'image_bytes', 'image_sha256', 'submission', 'terminal_status', 'outcome', 'produced_item_types',
  'thread_start_count', 'turn_start_count', 'actual_model', 'thread_id', 'turn_id', 'format', 'codex_executable', 'codex_version', 'codex_sha256', 'explicit_bin_override'].sort();
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
 * file of at most 16 KiB, in the connector's receipt format with exactly its fields, naming that request id, and found in
 * one launch only. Anything else is an error, never a receipt. (The codex digest is judged in the ledger, not here.)
 */
export function readOwnReceipts(io, before, requestIds, root = join(managedState, 'receipts')) {
  const receipts = {}, raw = [], errors = [];
  let launches = [];
  try { launches = receiptLaunches(io, root).filter(n => !before.includes(n)); } catch (error) { return { receipts, raw, errors: ['receipts: ' + msg(error)], launches }; }
  for (const launch of launches) {
    const dir = join(root, launch);
    try {
      if (!/^[0-9a-f]{32}$/.test(launch)) throw Error('an entry not named as the connector names a launch');
      const st = io.lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink() || io.realpathSync(dir) !== dir) throw Error('not a real folder inside receipts/');
    } catch (error) { errors.push(`receipts/${launch.slice(0, 40)}: ${msg(error)}`); continue; }
    for (const rid of requestIds) {
      const name = `${sha(Buffer.from(rid, 'utf8'))}.json`;
      let fd = null;
      try {
        try { fd = io.openSync(join(dir, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
        const st = io.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || st.size > 16384) throw Error('not a regular single-link file of at most 16 KiB');
        const bytes = io.readFileSync(fd), r = JSON.parse(bytes.toString('utf8'));
        if (!r || typeof r !== 'object' || Array.isArray(r) || r.format !== 'lc-subscription-ask-receipt/1' || r.request_id !== rid || !equal(Object.keys(r).sort(), RECEIPT_KEYS)) throw Error('not this request\'s receipt in the connector\'s format');
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

/** This run's own results, records and receipts (a failed copy is reported, never fatal to the report). */
function collect(io, regularRead, candidate, out, report, launchesBefore) {
  const errors = [];
  let results = null;
  try {
    const bytes = regularRead(join(candidate.work, 'out/results.json'));
    io.writeFileSync(join(out, 'runner-results.json'), bytes);
    results = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    report.aborted ??= results.aborted ?? null;
  } catch { report.aborted ??= 'native result unreadable; scratch and raw evidence retained'; }
  const steps = JSON.parse(regularRead(join(candidateDir, 'steps.json')));
  report.steps_ok = !!results && results.steps.length === steps.length && results.steps.every(s => s.ok === true);
  const liveLines = [], asks = [], requestIds = [], mainAdmission = [];
  const captures = join(candidate.work, 'userdata', 'captures');
  // Every record file on its own: one unreadable file is an error (the evidence incomplete), never a skipped success.
  try {
    if (io.existsSync(captures)) for (const cap of io.readdirSync(captures)) {
      const liveFile = join(captures, cap, 'live.jsonl');
      try {
        if (io.existsSync(liveFile)) {
          const text = regularRead(liveFile);
          io.mkdirSync(join(out, 'captures', cap), { recursive: true, mode: 0o700 });
          io.writeFileSync(join(out, 'captures', cap, 'live.jsonl'), text);
          liveLines.push(...parseJsonl(text));
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/live.jsonl: ${msg(error)}`); }
      const admissionFile = join(captures, cap, 'admission.jsonl');
      try {
        if (io.existsSync(admissionFile)) {
          const text = regularRead(admissionFile);
          io.mkdirSync(join(out, 'captures', cap), { recursive: true, mode: 0o700 });
          io.writeFileSync(join(out, 'captures', cap, 'admission.jsonl'), text);
          mainAdmission.push(...parseJsonl(text));
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/admission.jsonl: ${msg(error)}`); }
      const askDir = join(captures, cap, 'asks');
      try {
        if (io.existsSync(askDir)) for (const name of io.readdirSync(askDir).filter(n => n.endsWith('.json'))) {
          try {
            const bytes = regularRead(join(askDir, name));
            io.mkdirSync(join(out, 'captures', cap, 'asks'), { recursive: true, mode: 0o700 });
            io.writeFileSync(join(out, 'captures', cap, 'asks', name), bytes);
            asks.push(JSON.parse(bytes));
          } catch (error) { errors.push(`records ${cap.slice(0, 40)}/asks/${name.slice(0, 40)}: ${msg(error)}`); }
        }
      } catch (error) { errors.push(`records ${cap.slice(0, 40)}/asks: ${msg(error)}`); }
    }
  } catch (error) { errors.push('records: ' + msg(error)); }
  for (const l of liveLines) if (l.request_id && !requestIds.includes(l.request_id)) requestIds.push(l.request_id);
  for (const a of asks) for (const q of Array.isArray(a?.requests) ? a.requests : []) if (typeof q?.request_id === 'string' && !requestIds.includes(q.request_id)) requestIds.push(q.request_id);
  // Only the receipts of this run's requests, in launches new since just before the native launch, each checked before it
  // is copied (readOwnReceipts). Nothing else in the product's managed state is opened or copied.
  const own = readOwnReceipts(io, launchesBefore ?? [], requestIds);
  errors.push(...own.errors);
  report.receipt_launches_new = own.launches.length;
  try {
    for (const { launch, name, bytes } of own.raw) {
      // Raw (they hold provider thread/turn ids): outside the repository, never in the evidence folder.
      const raw = join(rawReceiptsRoot, out.split('/').at(-1), 'receipts', launch);
      io.mkdirSync(raw, { recursive: true, mode: 0o700 });
      io.writeFileSync(join(raw, name), bytes, { mode: 0o600, flag: 'wx' });
    }
  } catch (error) { errors.push('raw receipts: ' + msg(error)); }
  const receipts = own.receipts;
  const values = results?.values ?? {}, read = k => { try { return JSON.parse(values[k]); } catch { return null; } };
  report.ledger = buildLedger({ steps, results, liveLines, asks, receipts, codexSha256: CONNECTOR.codex_sha256 });
  report.fence = fenceVerdict(report.ledger, liveLines, values);
  // QA's own source-admission checker log (metadata only: phases, verdicts, sequences, hashes and admission times).
  let checkerLines = [];
  try {
    const bytes = regularRead(join(candidate.work, 'out', 'admission-checker.jsonl'));
    io.writeFileSync(join(out, 'admission-checker.jsonl'), bytes);
    checkerLines = parseJsonl(bytes.toString('utf8'));
    if (checkerLines.some(l => l.kind === 'unreadable_line')) errors.push('admission checker log: unreadable lines');
  } catch (error) { errors.push('admission checker log: ' + msg(error)); }
  if (mainAdmission.some(l => l.kind === 'unreadable_line')) errors.push('main admission record: unreadable lines');
  report.source_admission = sourceAdmission(report.ledger, checkerLines, read('display_choice'), mainAdmission);
  report.evidence = evidence({ ledger: report.ledger, liveLines, cards: { action2: read('action2_card'), action3: read('action3_card') }, truthBefore: read('surface_before'), truthAfter: read('surface_changed') });
  report.collect_errors = errors;
  io.writeFileSync(join(out, 'ledger.json'), JSON.stringify(report.ledger, null, 2) + '\n');
  // Sanitized receipt facts (no thread or turn id, no executable path) for review; the raw files stay outside Git.
  io.writeFileSync(join(out, 'receipts-sanitized.json'), JSON.stringify(sanitizeReceipts(receipts), null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, out, allocation, allocationSha256, extra] = process.argv.slice(2);
  if (mode !== '--execute' || !out || !allocation || !allocationSha256 || extra) throw Error('no default run: --execute <new QA folder> <allocation.json> <Lead-provided SHA256>');
  const report = await runLiveCandidate({ execute: true, out, allocation, allocationSha256 });
  console.log(JSON.stringify({ mechanics_passed: report.mechanics_passed, acceptance: report.acceptance, aborted: report.aborted ?? null, native_attempts: report.native_attempts,
    attempts_used: report.ledger?.attempts_used ?? null, fence: report.fence?.verdict ?? null, cleanup: report.cleanup, connector: report.connector_watch, scratch: report.scratch }));
  process.exitCode = report.mechanics_passed ? 0 : 1;
}
