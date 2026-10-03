#!/usr/bin/env node
// Offline assembly/admission only. No process, native, GUI, account or audio calls.
// prepare <new QA folder>; check <candidate.json> <saved stage-identity.json>
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisibleCandidate } from './qa_visible_candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const source = '52be105a148a28e677f83cc4b7077665f2ff372c';
const release = 'ad7bd72a8e902b366fbbb71d90f530c18043a251';
const stage = '/mnt/c/Users/ROG/AppData/Local/Temp/lc-windows-tts-52be105';
const tree = '531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669';
const entry = '9969b8afa2b3f3df82d3733c5d6e8adec5c34393af49d2d10c88704d68982128';
const helper = '21c7bed3fedcdefdccc2f45b799bfebb417df7a56f44f656523d303e7b349e10';
const runtime = '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa';
const priorRunnerHash = '2558ecee93191506b890472a80b5306f055bf22abe64ce24615d03e35b86fe84';
const priorCandidateBytes = readFileSync(join(repo, 'docs/verification/qa/p0-13-live-1755153/edge-placement-offline/candidate/candidate.json'));
const priorCandidate = JSON.parse(priorCandidateBytes);
const electron = String.raw`C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe`;
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const sourceNames = ['qa_tts_output_candidate.mjs', 'qa_tts_stage_check.py', 'qa_live_stage_check.py', 'qa_visible_candidate.mjs', 'qa_edge_placement.ps1', 'qa_display_admission.ps1', 'qa-electron-runner.ps1', 'signin_cleanup.mjs', 'qa_visible_drag.mjs', 'surface.html'];
const names = ['runner.ps1', 'steps.json', 'surface.html'];
const sha = data => createHash('sha256').update(data).digest('hex');
const win = p => {
  if (!p.startsWith('/mnt/c/') || /['\r\n]/.test(p)) throw Error('unexpected Windows path');
  return 'C:\\' + p.slice(7).replaceAll('/', '\\');
};
function context(work) {
  const appPort = 43123, edgePort = 45123, profile = win(join(work, 'edge-profile'));
  const surfaceUrl = 'file:///' + win(join(work, 'surface.html')).replaceAll('\\', '/');
  const edgeArgs = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', `--remote-debugging-port=${edgePort}`, '--remote-debugging-address=127.0.0.1', '--start-fullscreen', `--app=${surfaceUrl}`];
  return { appPort, edgePort, profile, surfaceUrl, edgeArgs, edgePlacement: true };
}
export function assertReviewedPlacement(ctx, built) {
  // Only the literal, isolated Edge profile changes in the emitted runner.
  // The previous parse/compile receipt applies to its saved bytes, not this new file.
  if (sha(built.runner.replaceAll(ctx.profile, priorCandidate.profile)) !== priorRunnerHash || built.steps.length !== 32) throw Error('reviewed placement runner/steps changed');
  if (built.steps[0].edgeStart !== ctx.surfaceUrl || built.steps[0].profile !== ctx.profile) throw Error('owned Edge first step changed');
  const normalized = structuredClone(built.steps);
  normalized[0].edgeStart = priorCandidate.surfaceUrl;
  normalized[0].profile = priorCandidate.profile;
  if (sha(JSON.stringify(normalized, null, 2) + '\n') !== 'b1576400458635eba3e630f707edb5c0b818306980cbec471f08c821ae9f922c') throw Error('reviewed placement steps changed');
}
function payloadFor(ctx) {
  const built = buildVisibleCandidate(ctx);
  assertReviewedPlacement(ctx, built);
  return { 'runner.ps1': built.runner, 'steps.json': JSON.stringify(built.steps, null, 2) + '\n', 'surface.html': readFileSync(join(here, 'surface.html')) };
}
export function prepareTtsCandidate(work = stage.replace(/lc-windows-tts-52be105$/, 'lc-qa-tts-output-' + randomUUID().replaceAll('-', ''))) {
  if (!/^\/mnt\/c\/Users\/ROG\/AppData\/Local\/Temp\/lc-qa-tts-output-[0-9a-f]{32}$/.test(work) || existsSync(work)) throw Error('new uncreated TTS scratch required');
  const ctx = context(work), payload = payloadFor(ctx);
  const fileArgs = ['-File', win(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', win(stage), '-UserData', win(join(work, 'userdata')), '-StepsFile', win(join(work, 'steps.json')), '-OutDir', win(join(work, 'out')), '-Edge', edge, '-AppTemp', win(join(work, 'apptemp'))];
  const manifest = {
    kind: 'qa-tts-output-offline-candidate/v1', prepared_only: true, execution_authorized: false,
    production_commit: source, release_commit: release, placement_review_commit: '21a9b6ba3a5c60ffc84cc7a0b9e50a05294aacd9',
    work, stage, stage_payload_files: 77, stage_tree_sha256: tree, ...ctx, electron, edge,
    files: Object.fromEntries(Object.entries(payload).map(([n, bytes]) => [n, sha(bytes)])),
    prior_placement_runner_sha256: priorRunnerHash, prior_placement_descriptor_sha256: sha(priorCandidateBytes), runner_delta: 'literal isolated Edge profile only',
    source_files: Object.fromEntries(sourceNames.map(n => [n, sha(readFileSync(join(here, n)))])),
    app_entry: { executable: electron, app_arguments: [win(stage)], package_main: 'dist/apps/windows/src/main/main.js', main_sha256: entry, native_helper_sha256: helper, electron_sha256: runtime },
    proposed_native_invocation: { executable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, arguments: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', ...fileArgs], status: 'NOT_ALLOCATED_NOT_EXECUTED', persistent_policy_changes: false },
    capture_prerequisite_mode: 'AI_DISABLED_GENERATED_SURFACE_ONLY',
    output_acceptance_plan: '../README.md#changed-output-cases',
    prior_approval_record: 'approved-two-gates-20261002:571427dcdc434c0f820236892925aedf', prior_approval_rebound_to_this_candidate: false,
    provider_attempts: 0, native_script_executed: false, display_account_audio_lease: 'NONE',
    execution_block: 'Admission-only wrapper has no execution path. Lead must review this exact package/payload, allocate resources and release a separately pinned execution wrapper; the legacy wrapper rejects this kind.',
  };
  return { manifest, payload };
}
export function checkTtsCandidate(manifest, payload, identity) {
  if (manifest.kind !== 'qa-tts-output-offline-candidate/v1' || manifest.production_commit !== source || manifest.release_commit !== release
      || manifest.stage !== stage || manifest.stage_payload_files !== 77 || manifest.stage_tree_sha256 !== tree
      || manifest.execution_authorized !== false || manifest.prepared_only !== true || manifest.prior_approval_rebound_to_this_candidate !== false
      || manifest.display_account_audio_lease !== 'NONE' || manifest.native_script_executed !== false || manifest.provider_attempts !== 0) throw Error('exact offline-only TTS manifest required');
  const expected = prepareTtsCandidate(manifest.work);
  if (JSON.stringify(manifest) !== JSON.stringify(expected.manifest)) throw Error('candidate metadata or source pins changed');
  if (Object.keys(payload).sort().join() !== names.slice().sort().join()) throw Error('exact three candidate payloads required');
  for (const name of names) if (sha(payload[name]) !== manifest.files[name] || sha(payload[name]) !== sha(expected.payload[name])) throw Error('candidate payload changed');
  if (identity?.kind !== 'qa-tts-static-file-identity/v1' || identity.passed !== true || identity.source_commit !== source || identity.release_commit !== release
      || identity.stage !== stage || identity.tree_sha256 !== tree || identity.matching_payload_files !== 77 || identity.actual_payload_files !== 77
      || identity.entrypoint?.sha256 !== entry || identity.entrypoint?.package_main !== manifest.app_entry.package_main || identity.entrypoint?.path !== manifest.app_entry.package_main
      || identity.native_executable_sha256 !== helper || identity.native_local_build_receipt_and_source_match !== true
      || identity.electron_runtime?.file_sha256?.['electron.exe'] !== runtime || identity.electron_runtime?.version_file_value !== '44.5.1'
      || identity.app_or_helper_launched !== false || identity.windows_process_invoked !== false || identity.provider_requests !== 0
      || identity.resource_lease !== 'NONE' || identity.stage_or_runtime_modified !== false
      || identity.sidecar_matches_committed_bytes !== true
      || !['missing_files', 'unexpected_files', 'nonregular_entries', 'differing_files'].every(k => Array.isArray(identity[k]) && identity[k].length === 0)
      || Object.keys(identity.file_sha256 ?? {}).length !== 77
      || sha(Object.entries(identity.file_sha256 ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([p, h]) => `${p}\0${h}\n`).join('')) !== tree) throw Error('matching static package receipt required');
  return { kind: 'qa-tts-offline-admission/v1', identity_passed: true, execution_admitted: false, native_executed: false,
    provider_attempts: 0, source_commit: source, stage_tree_sha256: tree, runner_sha256: manifest.files['runner.ps1'], prerequisite_steps: 32,
    limitation: 'Saved point-in-time static receipt and candidate identity only; not a live launch gate, resource lease or speech/device acceptance.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path, receipt, extra] = process.argv.slice(2);
  if (mode === 'prepare' && path && !receipt && !extra) {
    const out = resolve(path);
    if (existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw Error('new QA evidence or /tmp folder required');
    const { manifest, payload } = prepareTtsCandidate();
    mkdirSync(out, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of Object.entries(payload)) writeFileSync(join(out, name), bytes);
    writeFileSync(join(out, 'candidate.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ prepared: true, execution_authorized: false, out, files: manifest.files }));
  } else if (mode === 'check' && path && receipt && !extra) {
    const folder = dirname(resolve(path)), manifest = JSON.parse(readFileSync(path));
    console.log(JSON.stringify(checkTtsCandidate(manifest, Object.fromEntries(names.map(n => [n, readFileSync(join(folder, n))])), JSON.parse(readFileSync(receipt))), null, 2));
  } else throw Error('use prepare <new QA folder> or check <candidate.json> <static receipt>; execution is unavailable');
}
