#!/usr/bin/env node
// Offline preparation only. No child processes, Win32 calls, Windows writes or account access.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const edgePlacement = process.argv[3] === '--edge-placement';
if (process.argv[3] && !edgePlacement || process.argv.length > 4) throw Error('only --edge-placement is supported');
const out = process.argv[2] && resolve(process.argv[2]);
if (!out || existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw Error('a new QA evidence folder or /tmp folder is required');
const toWin = p => {
  if (!p.startsWith('/mnt/c/') || /['\r\n]/.test(p)) throw Error('unexpected scratch path');
  return 'C:\\' + p.slice(7).replaceAll('/', '\\');
};
const appPort = 43123, edgePort = 45123;
const work = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-visible-' + (edgePlacement ? 'placement-' : 'pre01-') + randomUUID().replaceAll('-', '');
const stage = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-windows-live-1755153';
const electron = String.raw`C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe`;
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const profile = toWin(join(work, 'edge-profile'));
const surfaceUrl = 'file:///' + toWin(join(work, 'surface.html')).replaceAll('\\', '/');
const edgeArgs = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', `--remote-debugging-port=${edgePort}`, '--remote-debugging-address=127.0.0.1', '--start-fullscreen', `--app=${surfaceUrl}`];
const { runner, steps, originalHash } = buildVisibleCandidate({ appPort, edgePort, edgeArgs, surfaceUrl, profile, edgePlacement });
const payload = { 'runner.ps1': runner, 'steps.json': JSON.stringify(steps, null, 2) + '\n', 'surface.html': readFileSync(join(here, 'surface.html')) };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileArgs = ['-File', toWin(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', toWin(stage), '-UserData', toWin(join(work, 'userdata')), '-StepsFile', toWin(join(work, 'steps.json')), '-OutDir', toWin(join(work, 'out')), '-Edge', edge, '-AppTemp', toWin(join(work, 'apptemp'))];
const manifest = {
  kind: 'qa-visible-pre01-offline-candidate/v1', prepared_only: true, execution_authorized: false,
  production_commit: '175515308f509fb8c0f531dbdb10e57313fcde5a', source_review_baseline: edgePlacement ? '47fd01fbdfe5e75a7fb37c74c0ba0edc07ae6146' : '55312b5d4d87dd425574573acec8f108a474ec6e',
  appPort, edgePort, work, stage, electron, edge, profile, surfaceUrl, edgeArgs,
  files: Object.fromEntries(Object.entries(payload).map(([name, bytes]) => [name, hash(bytes)])),
  source_files: Object.fromEntries(['qa_visible_candidate.mjs', 'qa_display_admission.ps1', 'qa_visible_drag.mjs', 'signin_cleanup.mjs', 'qa-electron-runner.ps1', 'surface.html', ...(edgePlacement ? ['qa_edge_placement.ps1', 'qa_prepare_visible.mjs'] : [])].map(name => [name, hash(readFileSync(join(here, name)))])),
  runner_original_sha256: originalHash,
  normal_native_invocation: { executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, arguments: ['-NoProfile', '-NonInteractive', ...fileArgs] },
  requested_process_only_invocation: { executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, arguments: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', ...fileArgs], status: 'REQUEST_ONLY_NOT_EXECUTED', permission_owner: 'Lead obtains explicit approval before any renewed lease', persistent_policy_changes: false },
  future_trusted_connector_setting: { codex_bin: '/home/agentsdock/.codex/packages/standalone/releases/0.158.0-x86_64-unknown-linux-musl/bin/codex', required_sha256: '167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9', active_in_this_ai_disabled_candidate: false, recheck_before_use: true },
  provider_attempts: 0, native_script_executed: false, display_account_lease: 'NONE',
};
if (edgePlacement) {
  manifest.kind = 'qa-visible-edge-placement-offline-candidate/v1';
  manifest.edge_placement = true;
  manifest.previous_actual_result = '6903beb2c0e2adeec0298a15ffe2bc329d8a097c';
  manifest.requested_process_only_invocation.status = 'PRIOR_PROCESS_SCOPE_APPROVED_NEW_CANDIDATE_NOT_ALLOCATED';
  manifest.requested_process_only_invocation.permission_owner = 'Lead reviews this exact delta before a fresh substantive display allocation';
  manifest.prior_process_scope_approval = 'approved-two-gates-20261002:571427dcdc434c0f820236892925aedf';
  manifest.execution_block = 'Current wrapper admits only the historical runner; this candidate has no display/account/audio lease or execution admission.';
}
mkdirSync(out, { recursive: true, mode: 0o700 });
for (const [name, bytes] of Object.entries(payload)) writeFileSync(join(out, name), bytes);
writeFileSync(join(out, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ prepared: true, native_executed: false, out, files: manifest.files }));
