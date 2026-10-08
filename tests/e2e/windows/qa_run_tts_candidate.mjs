#!/usr/bin/env node
// One AI-disabled display diagnostic. No execution without a separately reviewed allocation.
// --execute <new QA evidence folder> <allocation.json> <Lead-provided allocation SHA256>
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTtsCandidate } from './qa_tts_output_candidate.mjs';
import { argv, isChild, lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const candidateDir = join(repo, 'docs/verification/qa/p0-13-tts-52be105/candidate-admission-20261008');
const candidateHash = 'f580ef5c93484c4cbe89ff3d8af8c53b99571bac897d8570ad1a638f6dd6dc58';
const pins = { 'runner.ps1': '986077ec88ef8c4d3e626edbb4397e5bd1d56a587bebb5038d8e41c5ab12fad6',
  'steps.json': 'c7b8f5ed842856de42e0ddd25ac8e534f57eafb40a64e3ca2af0e1ffbef7baa3',
  'surface.html': '69e38e1bdacf8f4764a9227ebf58177f9959e83f3a03aa428c1b3e8b998be2d2' };
const psBin = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const oldApproval = 'approved-two-gates-20261002:571427dcdc434c0f820236892925aedf';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const win = path => {
  if (!path.startsWith('/mnt/c/') || /['\r\n]/.test(path)) throw Error('unexpected Windows path');
  return 'C:\\' + path.slice(7).replaceAll('/', '\\');
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// LAUNCH ADMISSION SCOPED TO THIS RUN. The same electron.exe rule is emitted into this candidate's native runner
// (qa_tts_output_candidate.mjs, Get-QaLaunchRelevance), where the full rationale is. A process is relevant if a field
// cannot be read, if it is a main process of the candidate runtime without an absolute app argument, or if its
// executable or arguments name the candidate stage or this run's new folder, or carry a port/inspect/debug switch for
// one of the two debugging ports. Every other process belongs to another owner: listed by PID only, never signalled and
// never a reason to refuse. The cleanup (releaseOwned) still gets the complete, unfiltered process list: this
// relevance is never applied to it. Unlike the runner, the wrapper also checks msedge.exe arguments (ttsEdgeRelevance).
const readable = value => typeof value === 'string' && value.length > 0;
// One Windows path, for comparison only: '/' as '\', no '\\?\' prefix, single separators, no trailing separator, dot or
// space (Windows ignores those), lower case.
export const pathKey = value => {
  let k = String(value).replaceAll('/', '\\');
  if (k.startsWith('\\\\?\\')) k = k.slice(4);
  return k.replace(/(?<=.)\\{2,}/g, '\\').replace(/[\\. ]+$/, '').toLowerCase();
};
const isSwitch = t => t.startsWith('-') || t.startsWith('/');
export function ttsAdmissionScope(candidate) {
  const refs = [win(candidate.stage), win(candidate.work)].map(pathKey), runtime = pathKey(candidate.electron);
  return { runtime, runtimeName: runtime.split('\\').at(-2), refs, names: refs.map(r => r.split('\\').at(-1)), ports: [candidate.appPort, candidate.edgePort].map(String) };
}
// An 8.3 short name: only its first six characters can be compared.
const shortNameOf = (c, names) => {
  const short = /^([^~]{6})~[0-9]+(\.[^\\]*)?$/.exec(c);
  return !!short && names.some(n => n.replaceAll(' ', '').replaceAll('.', '').startsWith(short[1]));
};
export function namesThisRun(value, scope) {
  const k = pathKey(value);
  if (scope.refs.some(r => k === r || k.startsWith(r + '\\'))) return true;
  return k.split('\\').some(c => {
    const d = c.replace(/[. ]+$/, '');
    return scope.names.includes(d) || shortNameOf(d, scope.names);
  });
}
export function isCandidateRuntime(exe, scope) {
  const k = pathKey(exe);
  if (k === scope.runtime) return true;
  const parts = k.split('\\');
  if (parts.length < 2 || parts.at(-1) !== 'electron.exe') return false;
  const dir = parts.at(-2).replace(/[. ]+$/, '');
  return dir === scope.runtimeName || shortNameOf(dir, [scope.runtimeName]);
}
export function portArgument(args, i, scope) {
  const t = args[i];
  if (!isSwitch(t)) return false;
  const eq = t.indexOf('=');
  const [key, value] = eq > 0 ? [t.slice(0, eq), t.slice(eq + 1)] : [t, args[i + 1] ?? ''];
  return /^(?:(?:.*-)?port|inspect(?:-brk|-wait)?|debug(?:-brk)?)$/i.test(key.replace(/^[-/]+/, ''))
    && new RegExp(`(?:^|:)\\+?0*(?:${scope.ports.join('|')})$`).test(value);
}
/** Why an electron.exe process is relevant to this run, or null (another owner's). */
export function ttsLaunchRelevance(p, scope) {
  if (!readable(p.created)) return 'unreadable_creation';
  if (!readable(p.exe)) return 'unreadable_executable';
  if (!readable(p.command_line)) return 'unreadable_command_line';
  const args = argv(p.command_line);
  if (isCandidateRuntime(p.exe, scope) && !isChild(p)) {
    // The candidate runtime: which app it runs decides. Without an app, or with one relative to a working folder that
    // cannot be read, it cannot be told apart from the candidate.
    const app = args.slice(1).find(a => !isSwitch(a));
    if (app === undefined) return 'candidate_runtime_without_app';
    if (!/^(?:[a-z]:\\|\\\\)/.test(pathKey(app))) return 'candidate_runtime_relative_app';
  }
  if (namesThisRun(p.exe, scope)) return 'names_this_run';
  return argumentRelevance(args, scope);
}
function argumentRelevance(args, scope) {
  for (let i = 1; i < args.length; i++) {
    const t = args[i], eq = t.indexOf('=');
    const values = isSwitch(t) && eq > 0 ? [t, t.slice(eq + 1)] : [t];
    if (values.some(v => v && namesThisRun(v, scope))) return 'names_this_run';
    if (portArgument(args, i, scope)) return 'test_port_argument';
  }
  return null;
}
/**
 * Why an msedge.exe process is relevant: only if its readable arguments name this run's folder (its profile is there) or
 * carry a debugging-port switch. The user's own browser is not this run's; an unreadable row cannot hold this run's
 * new folder (the wrapper refuses if it already exists), and a port owner is caught by the listener check. The runner
 * does not repeat this msedge.exe check.
 */
export function ttsEdgeRelevance(p, scope) {
  return readable(p.command_line) ? argumentRelevance(argv(p.command_line), scope) : null;
}
export function ttsAdmission(candidate, app, edge) {
  const scope = ttsAdmissionScope(candidate);
  const electron = app.processes.map(p => ({ p, reason: ttsLaunchRelevance(p, scope) }));
  const edgeRows = edge.processes.map(p => ({ p, reason: ttsEdgeRelevance(p, scope) }));
  const electronConflicts = electron.filter(e => e.reason), edgeConflicts = edgeRows.filter(e => e.reason);
  return { scope, electronConflicts, edgeConflicts, otherElectron: electron.filter(e => !e.reason).map(e => e.p), otherEdgeCount: edgeRows.length - edgeConflicts.length,
    blocked: app.listen.length > 0 || edge.listen.length > 0 || electronConflicts.length > 0 || edgeConflicts.length > 0 };
}

// Whitelist metadata only: unrelated command lines and paths never enter saved evidence.
export function summarizeTtsPreflight(candidate, app, edge, observedAt) {
  const samePath = (a, b) => readable(a) && readable(b) && a.toLowerCase() === b.toLowerCase();
  const process = (p, exe = candidate.electron) => {
    const child = isChild(p), executable = readable(p.exe), command = readable(p.command_line);
    return { pid: p.pid, created_ticks: p.created, metadata_present: true,
      creation_readable: readable(p.created), executable_readable: executable, command_line_readable: command,
      child_argument_present: child, executable_matches_candidate: executable ? samePath(p.exe, exe) : null,
      known_product_stage: executable && command && !child && samePath(p.exe, candidate.electron)
        && samePath(argv(p.command_line)[1], win(candidate.stage)) ? 'candidate_stage' : 'unknown' };
  };
  const port = (number, look) => ({ port: number, observed_ticks: look.now, owners: look.listen.map(pid => {
    const p = look.processes.find(p => p.pid === pid);
    return p ? process(p) : { pid, created_ticks: null, metadata_present: false,
      creation_readable: null, executable_readable: null, command_line_readable: null,
      child_argument_present: null, executable_matches_candidate: null, known_product_stage: 'unknown' };
  }) });
  const admission = ttsAdmission(candidate, app, edge);
  return { schema: 'qa-tts-preflight-metadata/2', observed_at_utc: new Date(observedAt).toISOString(), blocked: admission.blocked,
    app_port: port(candidate.appPort, app), edge_port: port(candidate.edgePort, edge),
    electron_observed_ticks: app.now, edge_observed_ticks: edge.now,
    electron_launch_conflicts: admission.electronConflicts.map(({ p, reason }) => ({ ...process(p), reason })),
    edge_launch_conflicts: admission.edgeConflicts.map(({ p, reason }) => ({ ...process(p, candidate.edge), reason })),
    // Another owner's processes: never signalled and no reason to refuse. Electron ones by PID and creation only.
    other_owner_electron: admission.otherElectron.map(p => ({ pid: p.pid, created_ticks: p.created })),
    other_owner_edge_count: admission.otherEdgeCount,
    native_attempts: 0, provider_attempts: 0, signals_sent: 0 };
}

function validateAllocation(record, candidate, wrapperHash, now) {
  if (record?.schema !== 'qa-tts-display-allocation/1' || record.state !== 'active' || record.lead_reviewed !== true
      || record.mode !== 'AI_DISABLED_GENERATED_SURFACE_ONLY' || record.exclusive_display !== true
      || record.account_access !== false || record.audio_access !== false || record.microphone_access !== false
      || record.provider_attempts !== 0 || record.max_native_attempts !== 1 || record.retry !== false
      || record.cleanup_only_after_expiry !== true
      || typeof record.allocation_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(record.allocation_id)
      || typeof record.updated_command_approval_ref !== 'string' || record.updated_command_approval_ref.length < 8
      || record.updated_command_approval_ref === oldApproval
      || record.wrapper_sha256 !== wrapperHash || record.candidate_sha256 !== candidateHash
      || !equal(record.payload_sha256, pins) || !equal(record.native_invocation, {
        executable: candidate.proposed_native_invocation.executable, arguments: candidate.proposed_native_invocation.arguments })
      || !equal(record.launch_identity, { source: candidate.production_commit, stage: candidate.stage, tree: candidate.stage_tree_sha256,
        work: candidate.work, electron: candidate.electron, edge: candidate.edge, appPort: candidate.appPort, edgePort: candidate.edgePort })) throw Error('separate exact Lead-reviewed display allocation required');
  const start = Date.parse(record.valid_from_utc), end = Date.parse(record.valid_until_utc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || now >= end || end <= start) throw Error('allocation is not currently active');
  return end;
}

export async function runTtsCandidate(options, injected = {}) {
  // Injection is for the offline boundary test, never a CLI option or a product path.
  const io = injected.fs ?? fs, runFile = injected.execFileSync ?? execFileSync, run = injected.spawnSync ?? spawnSync;
  const now = injected.now ?? Date.now, sleep = injected.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  if (options?.execute !== true) throw Error('explicit --execute and separately reviewed allocation required');
  const out = options.out && resolve(options.out), allocationPath = options.allocation && resolve(options.allocation);
  if (!out || io.existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw Error('new QA evidence folder required');
  if (!allocationPath || ![join(repo, 'docs/verification/lead') + sep, '/tmp/'].some(p => allocationPath.startsWith(p))
      || !/^[a-f0-9]{64}$/.test(options.allocationSha256 ?? '')) throw Error('independently supplied allocation file/hash required');
  const regularRead = path => {
    if (!io.lstatSync(path).isFile() || io.lstatSync(path).isSymbolicLink()) throw Error('regular pinned file required');
    return io.readFileSync(path);
  };
  const candidateBytes = regularRead(join(candidateDir, 'candidate.json'));
  if (sha(candidateBytes) !== candidateHash) throw Error('saved candidate bytes changed');
  const candidate = JSON.parse(candidateBytes), payload = Object.fromEntries(Object.keys(pins).map(name => {
    const bytes = regularRead(join(candidateDir, name));
    if (sha(bytes) !== pins[name]) throw Error('saved payload bytes changed');
    return [name, bytes];
  }));
  // This is metadata admission; checkTtsCandidate also rechecks all ten unchanged source pins.
  checkTtsCandidate(candidate, payload, JSON.parse(regularRead(join(candidateDir, '../stage-identity.json'))));
  const allocationBytes = regularRead(allocationPath);
  if (sha(allocationBytes) !== options.allocationSha256) throw Error('allocation differs from independently reviewed hash');
  const record = JSON.parse(allocationBytes), wrapperHash = sha(regularRead(fileURLToPath(import.meta.url)));
  const deadline = validateAllocation(record, candidate, wrapperHash, now());
  const stillActive = () => {
    if (now() >= deadline) throw Error('allocation expired before admission/launch; no retry');
  };
  // Linux file inspection only, freshly run after the allocation gate and before any Windows call.
  const identity = JSON.parse(runFile('python3', ['-B', join(here, 'qa_tts_stage_check.py')], { encoding: 'utf8', timeout: 30000 }));
  checkTtsCandidate(candidate, payload, identity);
  if (io.existsSync(candidate.work)) throw Error('candidate scratch already consumed; no retry');
  stillActive();
  const ps = code => runFile(psBin, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from("$ProgressPreference='SilentlyContinue'; " + code, 'utf16le').toString('base64')],
    { cwd: '/mnt/c', encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
  const appCalls = windowsCalls(ps, candidate.appPort), edgeCalls = windowsCalls(ps, candidate.edgePort);
  edgeCalls.look = async () => readLook(ps(lookCommand(candidate.edgePort, 'msedge.exe')));
  stillActive();
  const beforeApp = await appCalls.look();
  stillActive();
  const beforeEdge = await edgeCalls.look();
  if (ttsAdmission(candidate, beforeApp, beforeEdge).blocked) {
    const refusal = summarizeTtsPreflight(candidate, beforeApp, beforeEdge, now());
    try {
      io.mkdirSync(out, { recursive: false, mode: 0o700 });
      io.writeFileSync(join(out, 'preflight-refusal.json'), JSON.stringify(refusal, null, 2)+'\n', { mode: 0o600, flag: 'wx' });
    } catch { throw Error('preflight conflict found; sanitized refusal could not be saved; nothing started'); }
    throw Error('a launch or debugging-port owner relevant to this run is present; nothing started');
  }
  stillActive();
  if (ps(`[bool](Test-Path -LiteralPath '${candidate.edge}' -PathType Leaf)`).trim() !== 'True') throw Error('reviewed Edge unavailable');
  const expectedApp = { exe: candidate.electron, app: [win(candidate.stage), `--remote-debugging-port=${candidate.appPort}`, '--remote-debugging-address=127.0.0.1'],
    checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${candidate.appPort}`], notBefore: beforeApp.now };
  const expectedEdge = { exe: candidate.edge, app: candidate.edgeArgs, checker: ['unlaunched-qa-checker'],
    markers: [`--remote-debugging-port=${candidate.edgePort}`], notBefore: beforeEdge.now };
  stillActive();
  io.mkdirSync(out, { recursive: true, mode: 0o700 });
  // mkdir without recursive refuses an occupied scratch; it permanently consumes this candidate's one attempt.
  io.mkdirSync(candidate.work, { recursive: false });
  const report = { kind: 'AI-disabled generated-surface display diagnostic', passed: false, identity,
    wrapper_sha256: wrapperHash, candidate_sha256: candidateHash, allocation_sha256: options.allocationSha256,
    allocation_id: record.allocation_id, scratch: candidate.work, scratch_preserved: true,
    native_attempts: 0, provider_attempts: 0, microphone_access: false, audio_access: false, cleanup: {},
    limitation: 'Synthetic CDP/guarded Win32 input only. No physical input, speech, caption synchronization, real AI or desktop product acceptance.' };
  try {
    for (const name of ['out', 'apptemp']) io.mkdirSync(join(candidate.work, name));
    for (const [name, bytes] of Object.entries(payload)) {
      io.writeFileSync(join(candidate.work, name), bytes);
      if (sha(regularRead(join(candidate.work, name))) !== pins[name]) throw Error('copied payload differs; launch refused');
    }
    // Recheck allocation before parser and before launch; cleanup of exact owned identities is allowed after expiry.
    stillActive();
    const encodedPath = Buffer.from(win(join(candidate.work, 'runner.ps1')), 'utf8').toString('base64');
    report.native_parse = JSON.parse(ps(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')); $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors); @{ok=(@($errors).Count -eq 0);errors=@($errors | ForEach-Object { @{line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber;id=$_.ErrorId} })} | ConvertTo-Json -Depth 4 -Compress`).trim());
    if (!report.native_parse.ok) report.aborted = 'exact saved runner parser rejected source; no app launched';
    else {
      stillActive();
      if (now() + 140000 > deadline) throw Error('allocation has too little time for the bounded native attempt');
      report.native_attempts = 1;
      const invocation = candidate.proposed_native_invocation;
      const result = run(psBin, invocation.arguments, { cwd: '/mnt/c', timeout: 140000, maxBuffer: 4 * 1024 * 1024 });
      report.launcher = { status: result.status, signal: result.signal, timeout: result.error?.code === 'ETIMEDOUT' };
      io.writeFileSync(join(out, 'runner.stdout.bin'), result.stdout ?? Buffer.alloc(0));
      io.writeFileSync(join(out, 'runner.stderr.bin'), result.stderr ?? Buffer.alloc(0));
      if (result.status !== 0) report.aborted = 'native launcher failed; preserved diagnostics, no retry';
    }
  } catch (error) {
    report.aborted = String(error?.message ?? error).slice(0, 200);
  } finally {
    // Complete observations and held-process revalidation, never PID-only or name-only termination.
    for (const [label, calls, expected] of [['electron', appCalls, expectedApp], ['edge', edgeCalls, expectedEdge]]) {
      if (report.native_attempts === 0) { report.cleanup[label] = { exit: 'not_started', folder: 'kept' }; continue; }
      try { report.cleanup[label] = await releaseOwned({ ...calls, expected, ownsFolder: false, removeFolder: async () => false,
        sleep, now, waitSelfMs: 1000, waitCloseMs: 5000, waitForceMs: 5000, stepMs: 250 }); }
      catch { report.cleanup[label] = { exit: 'unknown', error: 'exact identity cleanup unavailable; scratch retained' }; }
    }
    const resultsFile = join(candidate.work, 'out/results.json');
    try {
      if (io.existsSync(resultsFile)) {
        const bytes = regularRead(resultsFile);
        io.writeFileSync(join(out, 'runner-results.json'), bytes);
        const result = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        report.aborted ??= result.aborted ?? null;
        report.steps_ok = result.steps.length === 32 && result.steps.every(s => s.ok === true);
        report.drags = result.steps.filter(s => s.kind === 'dragHandle').map(s => {
          const b = s.before, a = s.after_os ?? s.after_cdp, events = a?.events.slice(b?.events.length ?? 0) ?? [];
          return { handle: s.handle, ok: s.ok === true && !!b && !!a &&
            Math.abs(b.surface.x-a.surface.x)+Math.abs(b.surface.y-a.surface.y)>20 &&
            events.some(e=>e.type==='gotpointercapture'&&e.target===s.handle) && equal(b.doc,a.doc) &&
            b.crop_source_sha256===a.crop_source_sha256 && equal(b.pinned,a.pinned) };
        });
      }
    } catch { report.aborted ??= 'native result unreadable; scratch and raw evidence retained'; }
    report.owned_launch_cleanup_confirmed = ['electron','edge'].every(label => report.cleanup[label]?.exit === 'confirmed');
    report.passed = report.launcher?.status === 0 && !report.aborted && report.steps_ok === true &&
      report.drags?.length === 2 && report.drags.every(d=>d.ok) && report.owned_launch_cleanup_confirmed;
    // This does not close the runtime display lease; QA must explicitly report actual release to Lead.
    io.writeFileSync(join(out, 'run.json'), JSON.stringify(report, null, 2)+'\n');
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, out, allocation, allocationSha256, extra] = process.argv.slice(2);
  if (mode !== '--execute' || !out || !allocation || !allocationSha256 || extra) throw Error('no default run: --execute <new QA folder> <allocation.json> <Lead-provided SHA256>');
  const report = await runTtsCandidate({ execute: true, out, allocation, allocationSha256 });
  console.log(JSON.stringify({ passed: report.passed, aborted: report.aborted ?? null, native_attempts: report.native_attempts,
    provider_attempts: 0, cleanup: report.cleanup, scratch: report.scratch }));
  process.exitCode = report.passed ? 0 : 1;
}
