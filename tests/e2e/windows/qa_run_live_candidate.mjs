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
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECTOR, POLICY_MS, checkLiveCandidate, names } from './qa_live_candidate.mjs';
import { buildLedger, evidence, fenceVerdict, liveImportCheck, parseJsonl } from './qa_live_ledger.mjs';
import { summarizeTtsPreflight, ttsAdmission } from './qa_run_tts_candidate.mjs';
import { lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';
import { askPathCheck, compareCopy } from './sub_copy.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
export const candidateDir = join(repo, 'docs/verification/qa/p0-13-live-52be105/candidate-nonvoice-02');
export const candidateHash = '74ebc3942022fe0549aa691b45ff5cc4949a56041b2f424b22f4786eb4374fbc';
export const pins = { 'runner.ps1': '0f5c23f03e8900b96f0e3c29ea6494af3b510bde3de6b1aefe335f747c6e9590', 'steps.json': '560461adeb84bfb7e614bd29c337b3e72b3363a6c643047fc533b96fc84c4d7a', 'surface.html': 'be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067', 'sub-live.json': '4729ca1a25ec09a64349c68c5ccb0eb41b4e9f83e161fb9c4a29b0ce26b948d4' };
const psBin = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const managedState = '/home/agentsdock/.local/share/LearningCompanion/managed-chatgpt';   // state_dir null: the product's own
// Raw provider receipts (thread/turn ids) stay outside the repository and Git: one 0700 folder per run (Lead D8).
export const rawReceiptsRoot = '/home/agentsdock/.local/state/lc-qa-live';
// Approvals that cover only AI-disabled runs: never a permission for this real-subscription runner.
const AI_DISABLED_APPROVALS = ['approved-two-gates-20261002:571427dcdc434c0f820236892925aedf', 'human-bounded-retest-20261008:d41dbbfae11448f7847e26cb54afcd44',
  'human-approve-read-arithmetic:1341e2b5d73b432eaefa988058e79172', 'human-approve-admission-20261008:2dde43ea7f4842619709d034fb8b0534'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const win = path => {
  if (!path.startsWith('/mnt/c/') || /['\r\n]/.test(path)) throw Error('unexpected Windows path');
  return 'C:\\' + path.slice(7).replaceAll('/', '\\');
};
/** The processes whose working folder is inside the private copy (the connector and its children), read-only. */
export function processesIn(dir, io = fs) {
  return io.readdirSync('/proc').filter(n => /^\d+$/.test(n)).filter(n => { try { const cwd = io.readlinkSync(`/proc/${n}/cwd`); return cwd === dir || cwd.startsWith(`${dir}/`); } catch { return false; } }).map(Number);
}

export function validateLiveAllocation(record, candidate, wrapperHash, now) {
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
export function connectorAdmission(io = fs, checks = { compareCopy, askPathCheck, liveImportCheck }) {
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
  const deadline = validateLiveAllocation(record, candidate, wrapperHash, now());
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
  // mkdir without recursive refuses an occupied scratch; it permanently consumes this candidate's one attempt.
  io.mkdirSync(candidate.work, { recursive: false });
  const report = { kind: 'four-action nonvoice live run (real subscription, generated surface)', passed: false, identity, connector,
    wrapper_sha256: wrapperHash, candidate_sha256: candidateHash, allocation_sha256: options.allocationSha256, allocation_id: record.allocation_id,
    scratch: candidate.work, scratch_preserved: true, native_attempts: 0, microphone_access: false, audio_access: false, voice: false, cleanup: {},
    limitation: 'CDP/DOM input inside the product windows; one display configuration; no speech, captions, physical pen or full-product acceptance.' };
  let watcher = null;
  const watchFile = join(out, 'connector-watch.jsonl'), stopFile = join(out, 'connector-watch.stop');
  try {
    for (const name of ['out', 'apptemp', 'link']) io.mkdirSync(join(candidate.work, name));
    for (const name of names) {
      const target = name === 'sub-live.json' ? join(candidate.work, 'link', name) : join(candidate.work, name);
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
      // Read-only: when the connector and its children appear and exit (qa_sub_watch.py signals nothing).
      watcher = start('python3', [join(here, 'qa_sub_watch.py'), '--root', CONNECTOR.copy, '--out', watchFile, '--stop', stopFile], { cwd: '/tmp', stdio: 'ignore' });
      watcher.on?.('error', error => { report.watch_error = String(error?.message ?? error).slice(0, 120); });
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
    try { io.writeFileSync(stopFile, ''); } catch { /* the watch stops by itself after its own bound */ }
    if (watcher) await new Promise(r => { const t = setTimeout(r, 5000); watcher.on?.('exit', () => { clearTimeout(t); r(); }); });
    report.connector_left_running = left;
    report.connector_watch = watchSummary(io, watchFile, report.native_attempts > 0);
    try { collect(io, regularRead, candidate, out, report); }
    catch (error) { report.collect_failed = String(error?.message ?? error).slice(0, 200); }
    report.owned_launch_cleanup_confirmed = ['electron', 'edge'].every(label => report.cleanup[label]?.exit === 'confirmed');
    Object.assign(report, judgeMechanics(report));
    // This does not close the runtime display/account lease; QA must explicitly report actual release to Lead.
    io.writeFileSync(join(out, 'run.json'), JSON.stringify(report, null, 2) + '\n');
    try { io.writeFileSync(join(out, 'publish-allowlist.json'), JSON.stringify(publishAllowlist(io, out), null, 2) + '\n'); } catch { /* run.json says what was collected */ }
  }
  return report;
}

/** The read-only watch of the connector and every descendant (the Codex app server runs in its own folder). */
export function watchSummary(io, file, expected) {
  if (!expected) return { state: 'not_started' };
  try {
    const events = parseJsonl(io.readFileSync(file, 'utf8'));
    const end = events.findLast(e => e.event === 'watch_end');
    const appeared = events.filter(e => e.event === 'appear').length;
    if (!end) return { state: 'unknown', appeared, note: 'the watch did not record its end' };
    return { state: end.remaining.length ? 'left_running' : 'released', appeared, remaining: end.remaining };
  } catch { return { state: 'unknown', note: 'the watch log could not be read' }; }
}
/**
 * The mechanical result: every step, the exact cleanup, the connector and its children gone, the ledger within the
 * ceiling with no retry or restart, silent requests, the whole picture at the provider boundary for the three answered
 * actions, the Stop fenced, and no card value in QA's questions. Acceptance itself stays NOT_JUDGED: the texts are read.
 */
export function judgeMechanics(report) {
  const l = report.ledger, slots = l?.slots ?? [];
  const terms = {
    launcher_ok: report.launcher?.status === 0, not_aborted: !report.aborted, steps_ok: report.steps_ok === true, collected: !report.collect_failed,
    owned_cleanup_confirmed: report.owned_launch_cleanup_confirmed === true,
    connector_released: (report.connector_left_running ?? ['?']).length === 0 && report.connector_watch?.state === 'released',
    ceiling_ok: l?.ceiling_ok === true, no_retry_or_restart: !!l && !l.restarted && !l.retried, all_silent: l?.all_silent === true,
    four_actions_counted: slots.length === 4 && slots.every(s => s.counted),
    whole_picture_at_provider: slots.slice(0, 3).every(s => s.transport?.verdict === 'whole picture at the provider boundary' && s.transport.non_plain_items.length === 0),
    fenced: typeof report.fence?.verdict === 'string' && report.fence.verdict.startsWith('fenced'),
    no_value_in_questions: (report.evidence?.leaks_in_questions ?? ['?']).length === 0,
  };
  return { mechanics: terms, mechanics_passed: Object.values(terms).every(Boolean), passed: Object.values(terms).every(Boolean),
    acceptance: 'NOT_JUDGED: the pixel matchers in evidence are necessary, never sufficient; QA and the Lead read every verbatim text.' };
}

const RECEIPT_FIELDS = ['request_id', 'input_types', 'text_bytes', 'image_bytes', 'image_sha256', 'submission', 'terminal_status', 'outcome', 'produced_item_types', 'thread_start_count', 'turn_start_count', 'actual_model', 'codex_version', 'codex_sha256', 'explicit_bin_override'];
/** Only the receipt fields the review needs: never thread_id, turn_id, the executable path or anything else. */
export function sanitizeReceipts(receipts) {
  return Object.fromEntries(Object.entries(receipts).map(([rid, r]) => [rid, Object.fromEntries(RECEIPT_FIELDS.filter(k => k in (r ?? {})).map(k => [k, r[k]]))]));
}
/**
 * The files of this run's evidence folder that may go to Git after review: generated, sanitized records only. Raw receipts
 * are elsewhere; anything not listed here (for example a future private file) is excluded by default.
 */
export function publishAllowlist(io, out) {
  const allowed = [], walk = (dir, rel) => { for (const name of io.readdirSync(dir)) { const full = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (io.statSync(full).isDirectory()) walk(full, r);
    else if (/^(run|ledger|receipts-sanitized|runner-results|connector-watch)\.json(l)?$|^runner\.(stdout|stderr)\.bin$|^captures\/[0-9a-f]+\/(live\.jsonl|asks\/[A-Za-z0-9._-]+\.json)$/.test(r)) allowed.push(r); } };
  walk(out, '');
  return { kind: 'qa-live-publish-allowlist/1', files: allowed.sort(), excluded_by_default: 'everything else; raw receipts are outside the repository', review: 'QA and the Lead read each listed file before commit' };
}

/** This run's own results, records and receipts (a failed copy is reported, never fatal to the report). */
function collect(io, regularRead, candidate, out, report) {
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
  const liveLines = [], asks = [], requestIds = [];
  const captures = join(candidate.work, 'userdata', 'captures');
  try {
    if (io.existsSync(captures)) for (const cap of io.readdirSync(captures)) {
      const liveFile = join(captures, cap, 'live.jsonl');
      if (io.existsSync(liveFile)) {
        const text = regularRead(liveFile);
        io.mkdirSync(join(out, 'captures', cap), { recursive: true, mode: 0o700 });
        io.writeFileSync(join(out, 'captures', cap, 'live.jsonl'), text);
        liveLines.push(...parseJsonl(text));
      }
      const askDir = join(captures, cap, 'asks');
      if (io.existsSync(askDir)) for (const name of io.readdirSync(askDir).filter(n => n.endsWith('.json'))) {
        const bytes = regularRead(join(askDir, name));
        io.mkdirSync(join(out, 'captures', cap, 'asks'), { recursive: true, mode: 0o700 });
        io.writeFileSync(join(out, 'captures', cap, 'asks', name), bytes);
        asks.push(JSON.parse(bytes));
      }
    }
  } catch (error) { errors.push('records: ' + String(error?.message ?? error).slice(0, 120)); }
  for (const l of liveLines) if (l.request_id && !requestIds.includes(l.request_id)) requestIds.push(l.request_id);
  for (const a of asks) for (const q of a.requests ?? []) if (!requestIds.includes(q.request_id)) requestIds.push(q.request_id);
  // Only the receipts of this run's requests: receipts/<launch>/<sha256(request_id)>.json. Nothing else in the product's
  // managed state is listed, opened or copied.
  const receipts = {};
  try {
    const root = join(managedState, 'receipts');
    if (io.existsSync(root)) for (const launch of io.readdirSync(root)) for (const rid of requestIds) {
      const name = `${sha(Buffer.from(rid, 'utf8'))}.json`, file = join(root, launch, name);
      if (io.existsSync(file)) {
        const bytes = regularRead(file);
        // Raw (they hold provider thread/turn ids): outside the repository, never in the evidence folder.
        const raw = join(rawReceiptsRoot, out.split('/').at(-1), 'receipts', launch);
        io.mkdirSync(raw, { recursive: true, mode: 0o700 });
        io.writeFileSync(join(raw, name), bytes);
        receipts[rid] = JSON.parse(bytes);
      }
    }
  } catch (error) { errors.push('receipts: ' + String(error?.message ?? error).slice(0, 120)); }
  const values = results?.values ?? {}, read = k => { try { return JSON.parse(values[k]); } catch { return null; } };
  report.ledger = buildLedger({ steps, results, liveLines, asks, receipts, codexSha256: CONNECTOR.codex_sha256 });
  report.fence = fenceVerdict(report.ledger, liveLines, values);
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
