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
// The first TTS candidate. Its one attempt stopped at the wrapper's preflight on 2026-10-07; that refusal's snapshot was
// discarded, so its cause is unknown. A later observation found another owner's Electron app running.
const firstTtsCandidateHash = 'f5a55d6edabe33c0b4fa5cc3e299e4f79d6c0304f1e36fd76dc3cc1547f3e2bd';
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
// LAUNCH ADMISSION SCOPED TO THIS RUN (this TTS candidate only; the shared runner and its other callers are unchanged).
// The shared runner refuses to start beside ANY other readable Electron main process, by image name. This diagnostic
// replaces that one refusal, and the Foreign-Electron listing it uses, in its emitted runner only. An electron.exe
// process still refuses when:
//   - its creation time, executable path or command line cannot be read, or Windows cannot split its command line;
//   - it is a main process of the candidate runtime (the pinned path, or an electron.exe in a folder of that runtime's
//     name or 8.3 short name) without an app argument, or with a relative one (its working folder cannot be read);
//   - its executable, or any argument (split by Windows' own CommandLineToArgvW; the value of a '-' or '/' switch too),
//     names the candidate stage or this run's new folder (which holds its user data, Edge profile, steps and output) as a
//     whole path component: in any letter case, with '/' or '\', a \\?\ or UNC prefix, a trailing dot or space, or an
//     8.3 short name sharing the folder name's first six characters. Junctions, subst drives and hashed short names are
//     not resolved;
//   - a port, inspect or debug switch ('-' or '/') carries the app or Edge debugging port (leading zeros allowed);
//   - anything listens on either port, or the listeners cannot be read.
// Any other electron.exe process, readable children of the candidate runtime included (their main process is judged
// on its own), belongs to another owner: listed by PID only (no path or command line), never signalled, and no reason to
// refuse. What it shows over the generated surface is still refused by the unchanged 16 controlled-surface checks.
// Rows that are only unreadable are read once more 300 ms later before the runner refuses (a process caught starting
// or exiting). The product's user data is set through LC_USER_DATA in its environment, which cannot be read here: its
// isolation rests on this run's folder being new and created exclusively by the wrapper. -AllowForeign is not used or
// read. The wrapper (qa_run_tts_candidate.mjs) applies the same electron.exe rule before the runner, and also checks
// msedge.exe arguments for this run's folder and the test ports.
const broadListing = String.raw`# Another Electron app (for example an author self-test) on this shared desktop changes what is on screen.
# Its presence is recorded at the start, at every desktop screenshot and at the end; paths are not kept.
function Foreign-Electron {
  $mine = [IO.Path]::GetFullPath($Stage).TrimEnd('\')
  @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine.IndexOf($mine, [StringComparison]::OrdinalIgnoreCase) -lt 0
    } | ForEach-Object { [ordered]@{ pid = $_.ProcessId; stage = ([regex]::Match($_.CommandLine, 'lc-[A-Za-z0-9_-]+')).Value } })
}`;
const broadGuard = String.raw`if ($results.foreign.start -and -not $AllowForeign) {
  $results.aborted = 'another Electron app is running on the shared display; nothing was started'
  $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path (Join-Path $OutDir 'results.json')
  exit 3
}`;
const scopedListing = ({ appPort, edgePort }) => String.raw`# TTS candidate only (qa_tts_output_candidate.mjs): every electron.exe process with the reason it is relevant to THIS
# run, or none. Never a path or a command line. Recorded at the start (it gates the run), at a desktop screenshot and at
# the end. This run's own app (the exact PID and start time) and its descendants are counted apart, never classified.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaArgv {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(string lpCmdLine, out int pNumArgs);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr hMem);
  public static string[] Split(string line) {
    int n;
    IntPtr p = CommandLineToArgvW(line, out n);
    if (p == IntPtr.Zero) return null;
    try {
      string[] a = new string[n];
      for (int i = 0; i < n; i++) a[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(p, i * IntPtr.Size));
      return a;
    } finally { LocalFree(p); }
  }
}
'@
function ConvertTo-QaPathKey([string]$value) {
  $k = $value.Replace('/', '\')
  if ($k.StartsWith('\\?\', [StringComparison]::Ordinal)) { $k = $k.Substring(4) }
  $k = [regex]::Replace($k, '(?<=.)\\{2,}', '\')
  return $k.TrimEnd([char[]]@('\', '.', ' ')).ToLowerInvariant()
}
$qaRuntime = ConvertTo-QaPathKey $Electron
$qaRuntimeName = $qaRuntime.Split('\')[-2]
$qaRefs = @((ConvertTo-QaPathKey ([IO.Path]::GetFullPath($Stage))), (ConvertTo-QaPathKey ([IO.Path]::GetFullPath((Split-Path -Parent $StepsFile)))))
$qaNames = @($qaRefs | ForEach-Object { $_.Split('\')[-1] })
function Test-QaSwitch([string]$t) { return $t.StartsWith('-', [StringComparison]::Ordinal) -or $t.StartsWith('/', [StringComparison]::Ordinal) }
function Test-QaShortName([string]$c, [string[]]$names) {
  if ($c -match '^([^~]{6})~[0-9]+(\.[^\\]*)?$') {
    $prefix = $Matches[1]
    foreach ($n in $names) { if ($n.Replace(' ', '').Replace('.', '').StartsWith($prefix, [StringComparison]::Ordinal)) { return $true } }
  }
  return $false
}
function Test-QaNamesThisRun([string]$value) {
  $k = ConvertTo-QaPathKey $value
  foreach ($r in $qaRefs) { if ($k -eq $r -or $k.StartsWith($r + '\', [StringComparison]::Ordinal)) { return $true } }
  foreach ($c in $k.Split('\')) {
    $d = $c.TrimEnd([char[]]@('.', ' '))
    if (($qaNames -contains $d) -or (Test-QaShortName $d $qaNames)) { return $true }
  }
  return $false
}
function Test-QaRuntime([string]$exe) {
  $k = ConvertTo-QaPathKey $exe
  if ($k -eq $qaRuntime) { return $true }
  $parts = $k.Split('\')
  if ($parts.Count -lt 2 -or $parts[-1] -ne 'electron.exe') { return $false }
  $dir = $parts[-2].TrimEnd([char[]]@('.', ' '))
  return ($dir -eq $qaRuntimeName) -or (Test-QaShortName $dir @($qaRuntimeName))
}
function Test-QaPortArgument([string[]]$a, [int]$i) {
  $t = $a[$i]
  if (-not (Test-QaSwitch $t)) { return $false }
  $eq = $t.IndexOf([char]'=')
  if ($eq -gt 0) { $key = $t.Substring(0, $eq); $val = $t.Substring($eq + 1) }
  else { $key = $t; $val = $(if ($i + 1 -lt $a.Count) { $a[$i + 1] } else { '' }) }
  $name = $key.TrimStart([char[]]@('-', '/'))
  return [regex]::IsMatch($name, '^(?:(?:.*-)?port|inspect(?:-brk|-wait)?|debug(?:-brk)?)\z', 'IgnoreCase, CultureInvariant') -and [regex]::IsMatch($val, '(?:^|:)\+?0*(?:${appPort}|${edgePort})\z')
}
function Get-QaLaunchRelevance($p) {
  if (-not $p.CreationDate) { return 'unreadable_creation' }
  if (-not $p.ExecutablePath) { return 'unreadable_executable' }
  if (-not $p.CommandLine) { return 'unreadable_command_line' }
  $a = [QaArgv]::Split([string]$p.CommandLine)
  if ($null -eq $a) { return 'unparsable_command_line' }
  $child = @($a | Select-Object -Skip 1 | Where-Object { $_.StartsWith('--type=', [StringComparison]::Ordinal) }).Count -gt 0
  if ((Test-QaRuntime ([string]$p.ExecutablePath)) -and -not $child) {
    # The candidate runtime: which app it runs decides. Without an app, or with one relative to a working folder that
    # cannot be read, it cannot be told apart from the candidate.
    $app = @($a | Select-Object -Skip 1 | Where-Object { -not (Test-QaSwitch $_) }) | Select-Object -First 1
    if ($null -eq $app) { return 'candidate_runtime_without_app' }
    if (-not [regex]::IsMatch((ConvertTo-QaPathKey $app), '^(?:[a-z]:\\|\\\\)')) { return 'candidate_runtime_relative_app' }
  }
  if (Test-QaNamesThisRun ([string]$p.ExecutablePath)) { return 'names_this_run' }
  for ($i = 1; $i -lt $a.Count; $i++) {
    $t = $a[$i]
    $values = @($t)
    $eq = $t.IndexOf([char]'=')
    if ((Test-QaSwitch $t) -and $eq -gt 0) { $values += $t.Substring($eq + 1) }
    foreach ($v in $values) { if ($v -and (Test-QaNamesThisRun $v)) { return 'names_this_run' } }
    if (Test-QaPortArgument $a $i) { return 'test_port_argument' }
  }
  return $null
}
function Foreign-Electron {
  $rows = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'")
  $own = @{}
  if ($script:app) {
    $start = $null
    try { $start = $script:app.StartTime } catch { $start = $null }
    if ($start) {
      foreach ($r in $rows) {
        if ([uint32]$r.ProcessId -eq [uint32]$script:app.Id -and $r.CreationDate -and [Math]::Abs(($r.CreationDate - $start).Ticks) -lt 10000) { $own[[uint32]$r.ProcessId] = $true }
      }
      $added = $true
      while ($added) {
        $added = $false
        foreach ($r in $rows) {
          if (-not $own[[uint32]$r.ProcessId] -and $own[[uint32]$r.ParentProcessId] -and $r.CreationDate -and $r.CreationDate -ge $start) { $own[[uint32]$r.ProcessId] = $true; $added = $true }
        }
      }
    }
  }
  $out = [ordered]@{ relevant = @(); other_owner = @(); this_run = 0 }
  foreach ($r in $rows) {
    if ($own[[uint32]$r.ProcessId]) { $out.this_run++; continue }
    $why = Get-QaLaunchRelevance $r
    if ($why) { $out.relevant += [ordered]@{ pid = [int]$r.ProcessId; reason = $why } } else { $out.other_owner += [int]$r.ProcessId }
  }
  return $out
}`;
const scopedGuard = ({ appPort, edgePort }) => String.raw`# TTS candidate only: the start-up refusal is scoped to this run (qa_tts_output_candidate.mjs); -AllowForeign is not read.
$results.admission = [ordered]@{ relevant_electron = @($results.foreign.start.relevant); other_owner_electron = @($results.foreign.start.other_owner).Count; port_owners = @(); rechecked = $false }
# Only rows that could not be read: once more, 300 ms later (a process caught while it starts or exits). Still unreadable,
# or relevant when read, refuses as before; gone, or another owner's when read, does not.
if (@($results.admission.relevant_electron).Count -gt 0 -and @($results.admission.relevant_electron | Where-Object { -not ([string]$_.reason).StartsWith('unreadable_', [StringComparison]::Ordinal) }).Count -eq 0) {
  Start-Sleep -Milliseconds 300
  $results.foreign.start_recheck = Foreign-Electron
  $results.admission.relevant_electron = @($results.foreign.start_recheck.relevant)
  $results.admission.rechecked = $true
}
foreach ($port in @(${appPort}, ${edgePort})) {
  $ev = $null
  $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue -ErrorVariable ev | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique)
  if (@($ev | Where-Object { $_.CategoryInfo.Category -ne 'ObjectNotFound' }).Count -gt 0) { $results.admission.port_owners += [ordered]@{ port = $port; pid = $null; reason = 'listeners_unreadable' } }
  foreach ($o in $owners) { $results.admission.port_owners += [ordered]@{ port = $port; pid = $o; reason = 'port_listener' } }
}
if (@($results.admission.relevant_electron).Count -gt 0 -or @($results.admission.port_owners).Count -gt 0) {
  $results.aborted = 'a launch or debugging-port owner relevant to this run is present; nothing was started'
  $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path (Join-Path $OutDir 'results.json')
  exit 3
}`;
const emittedBlocks = ctx => [[broadListing, scopedListing(ctx)], [broadGuard, scopedGuard(ctx)]];
/** The two emitted blocks, for the reviewed-hash pin in the focused test. */
export const scopedAdmissionBlocks = ctx => ({ listing: scopedListing(ctx), guard: scopedGuard(ctx) });
export function applyScopedAdmission(runner, ctx) {
  if (runner.includes('Get-QaLaunchRelevance')) throw Error('scoped launch admission already present');
  for (const [from, to] of emittedBlocks(ctx)) {
    if (runner.split(from).length !== 2) throw Error('runner start-up listing or guard changed; substitution refused');
    runner = runner.replace(from, () => to);
  }
  return runner;
}
export function revertScopedAdmission(runner, ctx) {
  for (const [from, to] of emittedBlocks(ctx)) {
    if (runner.split(to).length !== 2) throw Error('scoped launch admission missing or changed');
    runner = runner.replace(to, () => from);
  }
  if (runner.includes('Get-QaLaunchRelevance') || runner.includes('QaArgv')) throw Error('scoped launch admission duplicated');
  return runner;
}
export function assertReviewedPlacement(ctx, built) {
  // Only the literal, isolated Edge profile and the scoped launch admission change in the emitted runner.
  // The previous parse/compile receipt applies to its saved bytes, not this new file.
  if (sha(revertScopedAdmission(built.runner, ctx).replaceAll(ctx.profile, priorCandidate.profile)) !== priorRunnerHash || built.steps.length !== 32) throw Error('reviewed placement runner/steps changed');
  if (built.steps[0].edgeStart !== ctx.surfaceUrl || built.steps[0].profile !== ctx.profile) throw Error('owned Edge first step changed');
  const normalized = structuredClone(built.steps);
  normalized[0].edgeStart = priorCandidate.surfaceUrl;
  normalized[0].profile = priorCandidate.profile;
  if (sha(JSON.stringify(normalized, null, 2) + '\n') !== 'b1576400458635eba3e630f707edb5c0b818306980cbec471f08c821ae9f922c') throw Error('reviewed placement steps changed');
}
function payloadFor(ctx) {
  const built = buildVisibleCandidate(ctx);
  built.runner = applyScopedAdmission(built.runner, ctx);
  assertReviewedPlacement(ctx, built);
  return { 'runner.ps1': built.runner, 'steps.json': JSON.stringify(built.steps, null, 2) + '\n', 'surface.html': readFileSync(join(here, 'surface.html')) };
}
export function prepareTtsCandidate(work = stage.replace(/lc-windows-tts-52be105$/, 'lc-qa-tts-output-' + randomUUID().replaceAll('-', ''))) {
  if (!/^\/mnt\/c\/Users\/ROG\/AppData\/Local\/Temp\/lc-qa-tts-output-[0-9a-f]{32}$/.test(work) || existsSync(work)) throw Error('new uncreated TTS scratch required');
  const ctx = context(work), payload = payloadFor(ctx);
  const fileArgs = ['-File', win(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', win(stage), '-UserData', win(join(work, 'userdata')), '-StepsFile', win(join(work, 'steps.json')), '-OutDir', win(join(work, 'out')), '-Edge', edge, '-AppTemp', win(join(work, 'apptemp'))];
  const manifest = {
    kind: 'qa-tts-output-offline-candidate/v2', prepared_only: true, execution_authorized: false,
    production_commit: source, release_commit: release, placement_review_commit: '21a9b6ba3a5c60ffc84cc7a0b9e50a05294aacd9',
    work, stage, stage_payload_files: 77, stage_tree_sha256: tree, ...ctx, electron, edge,
    files: Object.fromEntries(Object.entries(payload).map(([n, bytes]) => [n, sha(bytes)])),
    prior_placement_runner_sha256: priorRunnerHash, prior_placement_descriptor_sha256: sha(priorCandidateBytes),
    prior_tts_candidate_sha256: firstTtsCandidateHash,
    runner_delta: 'literal isolated Edge profile, and the start-up Foreign-Electron listing and refusal replaced by a launch admission scoped to this run',
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
  if (manifest.kind !== 'qa-tts-output-offline-candidate/v2' || manifest.production_commit !== source || manifest.release_commit !== release
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
