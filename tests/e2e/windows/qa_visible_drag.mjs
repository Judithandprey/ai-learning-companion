#!/usr/bin/env node
// AI-disabled visible-window diagnostic of the frozen 1755153 package. No real-run mode.
// Run only with a newly assigned exclusive lease and explicit script permission.
// Usage: node tests/e2e/windows/qa_visible_drag.mjs <new evidence folder> <reviewed candidate.json>
// Native scratch, userdata and evidence are preserved. Input is synthetic CDP/Win32, not hardware.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';
import { launches, lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = process.argv[2] && resolve(process.argv[2]);
if (!out || existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw new Error('a new QA evidence folder or /tmp folder is required');
if (!process.argv[3]) throw Error('an exact reviewed offline candidate.json is required');
const candidateDir = dirname(resolve(process.argv[3]));
const candidate = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
if (candidate.kind !== 'qa-visible-pre01-offline-candidate/v1' || !/^\/mnt\/c\/Users\/ROG\/AppData\/Local\/Temp\/lc-qa-visible-pre01-[0-9a-f]{32}$/.test(candidate.work)) throw Error('unexpected offline candidate');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const name of ['qa_visible_candidate.mjs', 'qa_display_admission.ps1', 'qa_visible_drag.mjs', 'signin_cleanup.mjs', 'qa-electron-runner.ps1', 'surface.html']) {
  if (sha(readFileSync(join(here, name))) !== candidate.source_files[name]) throw Error('reviewed QA source bytes changed');
}
const payload = Object.fromEntries(['runner.ps1', 'steps.json', 'surface.html'].map(name => {
  const bytes = readFileSync(join(candidateDir, name));
  if (sha(bytes) !== candidate.files[name]) throw Error('reviewed candidate bytes changed');
  return [name, bytes];
}));
if (sha(payload['surface.html']) !== sha(readFileSync(join(here, 'surface.html')))) throw Error('candidate surface differs from the reviewed QA template');
const identity = JSON.parse(execFileSync('python3', ['-B', join(here, 'qa_live_stage_check.py')], { encoding: 'utf8', timeout: 30000 }));
if (!identity.passed || identity.source_commit_as_recorded !== '175515308f509fb8c0f531dbdb10e57313fcde5a' || identity.complete_payload_tree_sha256 !== '3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154' || identity.electron_runtime.file_sha256['electron.exe'] !== '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa') throw new Error('frozen package/runtime identity failed');
const psBin = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const ps = code => execFileSync(psBin, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference='SilentlyContinue'; " + code, 'utf16le').toString('base64')], { cwd: '/mnt/c', encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
const win = p => {
  if (!p.startsWith('/mnt/c/') || /['\r\n]/.test(p)) throw Error('unexpected Windows path');
  return 'C:\\' + p.slice(7).replaceAll('/', '\\');
};
const stage = identity.stage, electron = win(join(identity.runtime, 'electron.exe'));
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
if (candidate.stage !== stage || candidate.electron !== electron || candidate.edge !== edge) throw Error('candidate launch identity differs');
const { appPort, edgePort, work } = candidate;
if (appPort !== 43123 || edgePort !== 45123 || existsSync(work)) throw Error('candidate ports or unused scratch identity unavailable');
const userData = join(work, 'userdata'), profile = win(join(work, 'edge-profile'));
const surfaceUrl = 'file:///' + win(join(work, 'surface.html')).replaceAll('\\', '/');
const edgeArgs = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', `--remote-debugging-port=${edgePort}`, '--remote-debugging-address=127.0.0.1', '--start-fullscreen', `--app=${surfaceUrl}`];
if (JSON.stringify(edgeArgs) !== JSON.stringify(candidate.edgeArgs)) throw Error('candidate Edge arguments differ');
const appCalls = windowsCalls(ps, appPort), edgeCalls = windowsCalls(ps, edgePort);
edgeCalls.look = async () => readLook(ps(lookCommand(edgePort, 'msedge.exe')));
const beforeApp = await appCalls.look(), beforeEdge = await edgeCalls.look();
if (beforeApp.listen.length || beforeEdge.listen.length || launches(beforeApp.processes).length) throw new Error('another Electron launch or a selected debugging port is present; nothing started');
if (ps(`[bool](Test-Path -LiteralPath '${edge}' -PathType Leaf)`).trim() !== 'True') throw new Error('cached Edge unavailable');
const expectedApp = { exe: electron, app: [win(stage), `--remote-debugging-port=${appPort}`, '--remote-debugging-address=127.0.0.1'], checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${appPort}`], notBefore: beforeApp.now };
const expectedEdge = { exe: edge, app: edgeArgs, checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${edgePort}`], notBefore: beforeEdge.now };

const { runner, steps, originalHash } = buildVisibleCandidate({ appPort, edgePort, edgeArgs, surfaceUrl, profile });
if (sha(runner) !== candidate.files['runner.ps1'] || sha(JSON.stringify(steps, null, 2)+'\n') !== candidate.files['steps.json']) throw Error('candidate does not reproduce the reviewed guarded runner');

mkdirSync(out, { recursive: true, mode: 0o700 });
mkdirSync(work, { recursive: false });
for (const name of ['out', 'apptemp']) mkdirSync(join(work, name));
for (const [name, bytes] of Object.entries(payload)) writeFileSync(join(work, name), bytes);
const report = { kind: 'AI-disabled visible drag diagnostic', provider_attempts: 0, identity, scratch: work, scratch_preserved: true, runner_original_sha256: originalHash, runner_adapted_sha256: createHash('sha256').update(runner).digest('hex'), input: 'synthetic CDP pointer; guarded synthetic Win32 fallback if needed', cleanup: {}, limitation: 'No real AI, speech, microphone, physical pen, full layout/DPI/monitor acceptance, or product gate. Browser background networking is disabled; no external URLs are requested by this diagnostic.' };
try {
  const encodedPath = Buffer.from(win(join(work, 'runner.ps1')), 'utf8').toString('base64');
  report.native_parse = JSON.parse(ps(`$ProgressPreference='SilentlyContinue'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')); $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors); @{ok=(@($errors).Count -eq 0);errors=@($errors | ForEach-Object { @{line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber;id=$_.ErrorId} })} | ConvertTo-Json -Depth 4 -Compress`).trim());
  if (!report.native_parse.ok) report.aborted = 'adapted PowerShell parser rejected source; no app launched';
  else {
    const run = spawnSync(psBin, ['-NoProfile', '-NonInteractive', '-File', win(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', win(stage), '-UserData', win(userData), '-StepsFile', win(join(work, 'steps.json')), '-OutDir', win(join(work, 'out')), '-Edge', edge, '-AppTemp', win(join(work, 'apptemp'))], { cwd: '/mnt/c', timeout: 140000, maxBuffer: 4 * 1024 * 1024 });
    report.launcher = { status: run.status, signal: run.signal, timeout: run.error?.code === 'ETIMEDOUT' };
    writeFileSync(join(out, 'runner.stdout.bin'), run.stdout ?? Buffer.alloc(0)); writeFileSync(join(out, 'runner.stderr.bin'), run.stderr ?? Buffer.alloc(0));
    if (run.status !== 0) report.aborted = 'native launcher failed; read preserved native diagnostics';
  }
} finally {
  for (const [label, calls, expected] of [['electron', appCalls, expectedApp], ['edge', edgeCalls, expectedEdge]]) {
    try { report.cleanup[label] = await releaseOwned({ ...calls, expected, ownsFolder: false, removeFolder: async () => false, sleep: ms => new Promise(r => setTimeout(r, ms)), waitSelfMs: 1000, waitCloseMs: 5000, waitForceMs: 5000, stepMs: 250 }); }
    catch { report.cleanup[label] = { exit: 'unknown', error: 'exact-identity cleanup unavailable; scratch preserved' }; }
  }
  report.passed = false;
  if (existsSync(join(work, 'out/results.json'))) {
    const bytes = readFileSync(join(work, 'out/results.json')); writeFileSync(join(out, 'runner-results.json'), bytes);
    const result = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    report.aborted ??= result.aborted ?? null;
    report.drags = result.steps.filter(s => s.kind === 'dragHandle').map(s => {
      const b = s.before, a = s.after_os ?? s.after_cdp;
      const moved = !!b && !!a && Math.abs(b.surface.x-a.surface.x)+Math.abs(b.surface.y-a.surface.y)>20;
      const events = a?.events.slice(b?.events.length ?? 0) ?? [];
      return { handle:s.handle, ok:s.ok, os_fallback:s.os_fallback, moved, got_pointer_capture:events.some(e=>e.type==='gotpointercapture'&&e.target===s.handle), ink_unchanged:!!b&&!!a&&JSON.stringify(b.doc)===JSON.stringify(a.doc), selection_unchanged:!!b&&!!a&&b.crop_source_sha256===a.crop_source_sha256&&JSON.stringify(b.pinned)===JSON.stringify(a.pinned) };
    });
    report.passed = report.launcher?.status === 0 && !report.aborted && result.steps.length === steps.length && result.steps.every(s=>s.ok) && report.drags.length===2 && report.drags.every(s=>s.ok&&s.moved&&s.got_pointer_capture&&s.ink_unchanged&&s.selection_unchanged) && Object.values(report.cleanup).every(c=>c.exit==='confirmed');
  }
  writeFileSync(join(out, 'run.json'), JSON.stringify(report, null, 2)+'\n');
}
console.log(JSON.stringify({ passed:report.passed===true, aborted:report.aborted??null, drags:report.drags??[], cleanup:Object.fromEntries(Object.entries(report.cleanup).map(([k,v])=>[k,v.exit])), scratch:work }));
process.exitCode = report.passed ? 0 : 1;
