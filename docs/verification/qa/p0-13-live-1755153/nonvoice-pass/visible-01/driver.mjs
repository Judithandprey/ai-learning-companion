#!/usr/bin/env node
// AI-disabled visible-window diagnostic of the frozen 1755153 package. No real-run mode.
// Usage: node tests/e2e/windows/qa_visible_drag.mjs <new QA evidence folder or /tmp folder>
// Native scratch, userdata and evidence are preserved. Input is synthetic CDP/Win32, not hardware.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launches, lookCommand, readLook, releaseOwned, windowsCalls } from './signin_cleanup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = process.argv[2] && resolve(process.argv[2]);
if (!out || existsSync(out) || ![join(repo, 'docs/verification/qa') + sep, '/tmp/'].some(p => out.startsWith(p))) throw new Error('a new QA evidence folder or /tmp folder is required');
const identity = JSON.parse(execFileSync('python3', ['-B', join(here, 'qa_live_stage_check.py')], { encoding: 'utf8', timeout: 30000 }));
if (!identity.passed || identity.source_commit_as_recorded !== '175515308f509fb8c0f531dbdb10e57313fcde5a' || identity.complete_payload_tree_sha256 !== '3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154' || identity.electron_runtime.file_sha256['electron.exe'] !== '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa') throw new Error('frozen package/runtime identity failed');
const psBin = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const ps = code => execFileSync(psBin, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { cwd: '/mnt/c', encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
const win = p => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
const stage = identity.stage, electron = win(join(identity.runtime, 'electron.exe'));
const edge = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const appPort = 43000 + randomInt(1500), edgePort = 45000 + randomInt(1500);
const work = join(dirname(stage), 'lc-qa-visible-drag-' + randomUUID().replaceAll('-', ''));
const userData = join(work, 'userdata'), profile = win(join(work, 'edge-profile'));
const surfaceUrl = 'file:///' + win(join(work, 'surface.html')).replaceAll('\\', '/');
const edgeArgs = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', `--remote-debugging-port=${edgePort}`, '--remote-debugging-address=127.0.0.1', '--start-fullscreen', `--app=${surfaceUrl}`];
const appCalls = windowsCalls(ps, appPort), edgeCalls = windowsCalls(ps, edgePort);
edgeCalls.look = async () => readLook(ps(lookCommand(edgePort, 'msedge.exe')));
const beforeApp = await appCalls.look(), beforeEdge = await edgeCalls.look();
if (beforeApp.listen.length || beforeEdge.listen.length || launches(beforeApp.processes).length) throw new Error('another Electron launch or a selected debugging port is present; nothing started');
if (ps(`[bool](Test-Path -LiteralPath '${edge}' -PathType Leaf)`).trim() !== 'True') throw new Error('cached Edge unavailable');
const expectedApp = { exe: electron, app: [win(stage), `--remote-debugging-port=${appPort}`, '--remote-debugging-address=127.0.0.1'], checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${appPort}`], notBefore: beforeApp.now };
const expectedEdge = { exe: edge, app: edgeArgs, checker: ['unlaunched-qa-checker'], markers: [`--remote-debugging-port=${edgePort}`], notBefore: beforeEdge.now };

let runner = readFileSync(join(here, 'qa-electron-runner.ps1'), 'utf8');
const originalHash = createHash('sha256').update(runner).digest('hex');
const replaceOnce = (from, to) => {
  if (runner.split(from).length !== 2) throw new Error('QA runner source changed; substitution refused');
  runner = runner.replace(from, to);
};
replaceOnce("$ErrorActionPreference = 'Stop'\nAdd-Type", "$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n$qaElapsed = [Diagnostics.Stopwatch]::StartNew()\nforeach ($k in @('LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'ELECTRON_RUN_AS_NODE')) { Remove-Item ('Env:\\' + $k) -ErrorAction SilentlyContinue }\nAdd-Type");
replaceOnce('$script:appPort = Free-Port', `$script:appPort = ${appPort}`);
replaceOnce('[DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);', '[DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);\n  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);');
replaceOnce(`$edgeArgs = @("--user-data-dir=$prof", '--no-first-run', '--no-default-browser-check',
          '--disable-sync', '--disable-extensions', '--disable-features=Translate,msTranslate,TranslateUI', '--lang=en-US', '--remote-debugging-port=0')`, `$edgeArgs = @( ${edgeArgs.slice(0, -2).map(a => `'${a}'`).join(', ')} )`);
// Fixed debug ports do not produce DevToolsActivePort; the existing page/socket helpers still work.
replaceOnce("while (-not (Test-Path $portFile)) { if ((Get-Date) -gt $deadline) { throw 'Edge DevToolsActivePort did not appear' }; Start-Sleep -Milliseconds 200 }\n        Start-Sleep -Milliseconds 300\n        $script:edgePort = (Get-Content $portFile)[0].Trim()", `$script:edgePort = ${edgePort}\n        Start-Sleep -Milliseconds 600`);
replaceOnce("foreach ($name in @($started.Keys)) { try { Stop-Process -Id $started[$name].Id -Force -ErrorAction SilentlyContinue } catch { } }", '# The foreground wrapper releases only exact Electron/Edge launch identities.');
replaceOnce("if (-not $script:app.WaitForExit(30000)) { Stop-Process -Id $script:app.Id -Force -ErrorAction SilentlyContinue; $results.processes[$script:appKey].killed = $true }", "if (-not $script:app.WaitForExit(3000)) { $results.processes[$script:appKey].awaits_identity_cleanup = $true }");
// Startup enumerates screen thumbnails: product launch follows safe-surface admission.
replaceOnce("Start-App 'app'\nSet-Content -Encoding ASCII -Path (Join-Path $OutDir 'app.pid') -Value $app.Id", '# Product launch is an explicit step after generated-surface admission.');
replaceOnce('if (-not $script:app.HasExited) {\n    # The app holds', 'if ($script:app -and -not $script:app.HasExited) {\n    # The app holds');
replaceOnce("$results.processes[$script:appKey].exit_code = $(try { $script:app.ExitCode } catch { $null })", "if ($script:app) { $results.processes[$script:appKey].exit_code = $(try { $script:app.ExitCode } catch { $null }) }");
replaceOnce("if (-not $script:app.HasExited) { throw 'the previous app process has not exited' }", "if ($script:app -and -not $script:app.HasExited) { throw 'the previous app process has not exited' }");
replaceOnce('$prev = $results.processes[$script:appKey]', '$prev = if ($script:app) { $results.processes[$script:appKey] } else { $null }');
replaceOnce("$entry.previous = [ordered]@{ key = $script:appKey; pid = $script:app.Id; exit_code = $script:app.ExitCode; killed = [bool]$prev.killed }", "if ($script:app) { $entry.previous = [ordered]@{ key = $script:appKey; pid = $script:app.Id; exit_code = $script:app.ExitCode; killed = [bool]$prev.killed } }");
replaceOnce("elseif ($null -ne $step.edgeFullscreen) {", String.raw`elseif ($null -ne $step.edgeClose) {
        $entry.kind = 'edgeClose'
        [void](Send-Cdp (Get-Socket 'edge') 'Browser.close' '{}')
      }
      elseif ($null -ne $step.dragHandle) {
        $entry.kind = 'dragHandle'; $id = [string]$step.dragHandle; $entry.handle = $id
        if ($id -notin @('toolbarHandle', 'cardHandle')) { throw 'unknown drag handle' }
        $read = "window.__qaDragRead('$id')"
        $entry.before = (Eval 'overlay' $read) | ConvertFrom-Json
        $b = $entry.before.handle
        if (-not $entry.before.uncovered -or $b.width -le 0 -or $b.height -le 0) { throw 'drag handle unavailable or covered' }
        $x = $b.x + $b.width / 2; $y = $b.y + $b.height / 2
        $dx = if ($x -ge 120) { -100 } else { 100 }
        $dy = if ($y -ge 100) { -80 } else { 80 }
        $ws = Get-Socket 'overlay'
        $packet = { param($type, $px, $py, $buttons) @{type=$type;x=$px;y=$py;button='left';buttons=$buttons;clickCount=1;pointerType='mouse'} | ConvertTo-Json -Compress }
        try {
          [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $packet 'mouseMoved' $x $y 0))
          [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $packet 'mousePressed' $x $y 1))
          foreach ($n in 1..10) { [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $packet 'mouseMoved' ($x + $dx * $n / 10) ($y + $dy * $n / 10) 1)); Start-Sleep -Milliseconds 20 }
        } finally { try { [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $packet 'mouseReleased' ($x + $dx) ($y + $dy) 0)) } catch { } }
        Start-Sleep -Milliseconds 250
        $entry.after_cdp = (Eval 'overlay' $read) | ConvertFrom-Json
        $events = @($entry.after_cdp.events | Select-Object -Skip @($entry.before.events).Count)
        $moved = [Math]::Abs($entry.after_cdp.surface.x - $entry.before.surface.x) + [Math]::Abs($entry.after_cdp.surface.y - $entry.before.surface.y) -gt 20
        $captured = @($events | Where-Object { $_.type -eq 'gotpointercapture' -and $_.target -eq $id }).Count -gt 0
        $entry.os_fallback = -not ($moved -and $captured)
        if ($entry.os_fallback) {
          if ($qaElapsed.ElapsedMilliseconds -gt 100000) { throw 'OS drag skipped near launcher time bound' }
          foreach ($button in @(1, 2, 4)) { if (([QaWin]::GetAsyncKeyState($button) -band 0x8000) -ne 0) { throw 'OS drag skipped: a mouse button is already held' } }
          # Synthetic Win32 input, admitted only at this run's owned overlay handle.
          $native = (Eval 'overlay' $read) | ConvertFrom-Json; $b = $native.handle
          if (-not $native.uncovered) { throw 'OS drag handle is covered' }
          $x = $b.x + $b.width / 2; $y = $b.y + $b.height / 2
          $scale = [double]$native.dpr
          if ($scale -ne 2) { throw 'OS drag display scaling changed' }
          $h = Window-Handle 'overlay'; $owner = [uint32]0
          [void][QaWin]::GetWindowThreadProcessId($h, [ref]$owner)
          if ($h -eq [IntPtr]::Zero -or $owner -ne $script:app.Id) { throw 'OS drag window ownership unavailable' }
          if ($null -eq $script:cursorHome) { $script:cursorHome = [QaWin]::Cursor() }
          if ($null -eq $script:cursorHome) { throw 'cursor restoration position unavailable' }
          $pressed = $false
          try {
            [void][QaWin]::SetCursorPos([int]($x * $scale), [int]($y * $scale)); [QaWin]::Nudge(); Start-Sleep -Milliseconds 250
            [void][QaWin]::SetCursorPos([int]($x * $scale), [int]($y * $scale))
            if ([QaWin]::RootAt([int]($x * $scale), [int]($y * $scale)) -ne $h) { throw 'OS drag start does not belong to the owned overlay' }
            [QaWin]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); $pressed = $true
            foreach ($n in 1..10) {
              $current = [QaWin]::Cursor()
              if ($null -eq $current -or [QaWin]::RootAt($current[0], $current[1]) -ne $h) { throw 'owned overlay lost during OS drag' }
              [void][QaWin]::SetCursorPos([int](($x + $dx * $n / 10) * $scale), [int](($y + $dy * $n / 10) * $scale)); Start-Sleep -Milliseconds 30
            }
          } finally {
            if ($pressed) { [QaWin]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
            [void][QaWin]::SetCursorPos([int]$script:cursorHome[0], [int]$script:cursorHome[1])
          }
          Start-Sleep -Milliseconds 250
          $entry.after_os = (Eval 'overlay' $read) | ConvertFrom-Json
        }
      }
      elseif ($null -ne $step.edgeFullscreen) {`);

const evalStep = (target, evalText, as) => ({ target, eval: evalText, ...(as ? { as } : {}) });
const ctl = (s, as) => evalStep('control', s, as), ov = (s, as) => evalStep('overlay', s, as);
const truth = as => evalStep('edge', `(() => { const t = JSON.parse(window.__qaSurfaceTruth()); if (!t.fits || !t.full_screen || t.viewport.dpr !== 2 || t.viewport.screen[0] !== 1280 || t.viewport.screen[1] !== 800) throw Error('generated surface geometry unavailable'); return JSON.stringify(t); })()`, as);
const points = Array.from({ length: 12 }, (_, i) => [(40 + i % 4 * 210 + 95) * 2, (90 + Math.floor(i / 4) * 170 + 75) * 2]);
const onTop = { onTop: 'edge', points: [...points, [20, 20], [2540, 20], [20, 1580], [2540, 1580]] };
const captureOnly = as => ctl(`(async () => { const s = await lc.sessionState(), a = await lc.subState(), l = await lc.linkState(); if (a.mode !== 'off' || l.mode !== 'off' || s.running && !['none','off'].includes(s.live.state)) throw Error('AI or development connector unexpectedly enabled'); return JSON.stringify({session:s,subscription:a.mode,link:l.mode}); })()`, as);
const hook = String.raw`(() => {
  window.__qaDragEvents = [];
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture']) document.addEventListener(type, e => {
    if (__qaDragEvents.length < 1000) __qaDragEvents.push({type,target:e.target.id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now()});
  }, true);
  window.__qaDragRead = async id => {
    const h = document.getElementById(id), surface = document.getElementById(id === 'toolbarHandle' ? 'toolbar' : 'card');
    const r = h.getBoundingClientRect(), p = surface.getBoundingClientRect(), top = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height});
    const st = __lcOverlay.state(), src = document.getElementById('crop').src;
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(src)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    return JSON.stringify({handle:rect(r),surface:rect(p),uncovered:top===h||h.contains(top),dpr:devicePixelRatio,doc:st.doc,pinned:st.pinned,mode:st.mode,crop_source_sha256:hash,events:__qaDragEvents.slice()});
  };
  return true;
})()`;
const circle = Array.from({ length: 41 }, (_, i) => [135 + 90 * Math.cos(i * Math.PI / 20), 165 + 65 * Math.sin(i * Math.PI / 20)]);
const steps = [
  { edgeStart: surfaceUrl, profile, as: 'edge', fullscreen: true }, { window: 'edge', show: 'raise' }, { edgeFullscreen: true }, truth('surface_before'), onTop,
  { launchApp: true, as: 'app' },
  { target:'control', waitEval:'document.querySelectorAll("#displays li[role=option]").length === 1', timeoutMs:15000 },
  captureOnly('before_capture'),
  { window:'edge', show:'raise' }, truth('surface_at_start'), onTop,
  ctl(`(async () => { const d = await lc.listDisplays(); if (d.length !== 1 || d[0].bounds.width !== 1280 || d[0].bounds.height !== 800 || d[0].scale_factor !== 2) throw Error('released display geometry unavailable'); const items = document.querySelectorAll('#displays li[role=option]'); if (items.length !== 1) throw Error('display selection is ambiguous'); items[0].click(); const box = document.getElementById('aiOn'); box.checked = false; if (document.getElementById('start').disabled) throw Error('capture Start unavailable'); document.getElementById('start').click(); return true; })()`, 'capture_start'),
  { target: 'control', waitEval: '(async () => { const s = await lc.sessionState(); return s.running && !s.starting; })()', timeoutMs: 15000 },
  { target: 'overlay', waitEval: 'typeof __lcOverlay !== "undefined" && __lcOverlay.state().frame !== null', timeoutMs: 15000 },
  captureOnly('capture_only'), ov(hook, 'drag_hook'),
  { dragHandle: 'toolbarHandle' },
  ov("document.querySelector('[data-mode=ASK]').click(), true"), { stroke: circle, pointerType: 'pen' },
  { target: 'overlay', waitEval: '!document.getElementById("card").hidden', timeoutMs: 10000 },
  { dragHandle: 'cardHandle' }, captureOnly('after_drags'),
  ov("document.getElementById('close').click(); document.querySelector('[data-mode=NAV]').click(); true"),
  { window: 'edge', show: 'raise' }, truth('surface_after'), onTop,
  ctl("document.getElementById('stop').click(), true", 'stop_pressed'),
  { target: 'control', waitEval: '(async () => !(await lc.sessionState()).running)()', timeoutMs: 12000 },
  { closeApp: true, via: 'wm_close', waitMs: 3000, required: false }, { edgeClose: true, required: false },
];

mkdirSync(out, { recursive: true, mode: 0o700 });
mkdirSync(work, { recursive: false });
for (const name of ['out', 'apptemp']) mkdirSync(join(work, name));
writeFileSync(join(work, 'surface.html'), readFileSync(join(here, 'surface.html')));
writeFileSync(join(work, 'runner.ps1'), runner);
writeFileSync(join(work, 'steps.json'), JSON.stringify(steps, null, 2));
const report = { kind: 'AI-disabled visible drag diagnostic', provider_attempts: 0, identity, scratch: work, scratch_preserved: true, runner_original_sha256: originalHash, runner_adapted_sha256: createHash('sha256').update(runner).digest('hex'), input: 'synthetic CDP pointer; guarded synthetic Win32 fallback if needed', cleanup: {}, limitation: 'No real AI, speech, microphone, physical pen, full layout/DPI/monitor acceptance, or product gate. Browser background networking is disabled; no external URLs are requested by this diagnostic.' };
try {
  const encodedPath = Buffer.from(win(join(work, 'runner.ps1')), 'utf8').toString('base64');
  report.native_parse = JSON.parse(ps(`$ProgressPreference='SilentlyContinue'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')); $tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors); @{ok=(@($errors).Count -eq 0);errors=@($errors | ForEach-Object { @{line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber;id=$_.ErrorId} })} | ConvertTo-Json -Depth 4 -Compress`).trim());
  if (!report.native_parse.ok) report.aborted = 'adapted PowerShell parser rejected source; no app launched';
  else {
    const run = spawnSync(psBin, ['-NoProfile', '-NonInteractive', '-File', win(join(work, 'runner.ps1')), '-Electron', electron, '-Stage', win(stage), '-UserData', win(userData), '-StepsFile', win(join(work, 'steps.json')), '-OutDir', win(join(work, 'out')), '-Edge', edge, '-AppTemp', win(join(work, 'apptemp'))], { cwd: '/mnt/c', encoding: 'utf8', timeout: 140000, maxBuffer: 4 * 1024 * 1024 });
    report.launcher = { status: run.status, signal: run.signal, timeout: run.error?.code === 'ETIMEDOUT' };
    writeFileSync(join(out, 'runner.stdout.txt'), run.stdout ?? ''); writeFileSync(join(out, 'runner.stderr.txt'), run.stderr ?? '');
  }
} finally {
  for (const [label, calls, expected] of [['electron', appCalls, expectedApp], ['edge', edgeCalls, expectedEdge]]) {
    try { report.cleanup[label] = await releaseOwned({ ...calls, expected, ownsFolder: false, removeFolder: async () => false, sleep: ms => new Promise(r => setTimeout(r, ms)), waitSelfMs: 1000, waitCloseMs: 5000, waitForceMs: 5000, stepMs: 250 }); }
    catch { report.cleanup[label] = { exit: 'unknown', error: 'exact-identity cleanup unavailable; scratch preserved' }; }
  }
  if (existsSync(join(work, 'out/results.json'))) {
    const bytes = readFileSync(join(work, 'out/results.json')); writeFileSync(join(out, 'runner-results.json'), bytes);
    const result = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    report.aborted = result.aborted ?? null;
    report.drags = result.steps.filter(s => s.kind === 'dragHandle').map(s => {
      const b = s.before, a = s.after_os ?? s.after_cdp;
      const moved = !!b && !!a && Math.abs(b.surface.x-a.surface.x)+Math.abs(b.surface.y-a.surface.y)>20;
      const events = a?.events.slice(b?.events.length ?? 0) ?? [];
      return { handle:s.handle, ok:s.ok, os_fallback:s.os_fallback, moved, got_pointer_capture:events.some(e=>e.type==='gotpointercapture'&&e.target===s.handle), ink_unchanged:!!b&&!!a&&JSON.stringify(b.doc)===JSON.stringify(a.doc), selection_unchanged:!!b&&!!a&&b.crop_source_sha256===a.crop_source_sha256&&JSON.stringify(b.pinned)===JSON.stringify(a.pinned) };
    });
    report.passed = !result.aborted && result.steps.length === steps.length && result.steps.every(s=>s.ok) && report.drags.length===2 && report.drags.every(s=>s.ok&&s.moved&&s.got_pointer_capture&&s.ink_unchanged&&s.selection_unchanged) && Object.values(report.cleanup).every(c=>c.exit==='confirmed');
  }
  writeFileSync(join(out, 'run.json'), JSON.stringify(report, null, 2)+'\n');
}
console.log(JSON.stringify({ passed:report.passed===true, aborted:report.aborted??null, drags:report.drags??[], cleanup:Object.fromEntries(Object.entries(report.cleanup).map(([k,v])=>[k,v.exit])), scratch:work }));
process.exitCode = report.passed ? 0 : 1;
