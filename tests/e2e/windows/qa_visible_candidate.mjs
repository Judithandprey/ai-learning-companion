// Pure candidate assembly: reads QA source files, never starts a process or accesses a display.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export function buildVisibleCandidate({ appPort, edgePort, edgeArgs, surfaceUrl, profile, edgePlacement = false }) {
  if (typeof edgePlacement !== 'boolean') throw Error('invalid owned Edge placement option');
  if (![appPort, edgePort].every(p => Number.isInteger(p) && p >= 43000 && p < 46500) || appPort === edgePort) throw Error('invalid QA debug ports');
let runner = readFileSync(join(here, 'qa-electron-runner.ps1'), 'utf8');
const originalHash = createHash('sha256').update(runner).digest('hex');
const replaceOnce = (from, to) => {
  if (runner.split(from).length !== 2) throw new Error('QA runner source changed; substitution refused');
  runner = runner.replace(from, () => to);
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
// The guard is part of the exact emitted runner, not a caller's stale preflight.
replaceOnce('$i = 0\ntry {', readFileSync(join(here, 'qa_display_admission.ps1'), 'utf8') + '\n$i = 0\ntry {\n  Initialize-QaDisplayAdmission');
replaceOnce('try { $script:app = Start-Process', "try { Assert-QaSurfaceAdmission 'before_product_launch'; $script:app = Start-Process");
replaceOnce("$p = Start-Process -FilePath $Edge -ArgumentList $edgeArgs -PassThru", "Assert-QaDisplayUnchanged 'before_browser_launch'\n        $p = Start-Process -FilePath $Edge -ArgumentList $edgeArgs -PassThru");
replaceOnce('elseif ($null -ne $step.waitEval) {', String.raw`elseif ($null -ne $step.captureStart) {
        $entry.kind = 'captureStart'; $entry.as = $step.as
        # Resolve the control target before the final native admission, never afterwards.
        $captureSocket = Get-Socket 'control'
        $expr = ConvertTo-Json -InputObject ([string]$step.captureStart) -Compress
        Assert-QaSurfaceAdmission 'before_capture_start'
        $r = Invoke-Cdp $captureSocket 'Runtime.evaluate' ('{"expression":' + $expr + ',"returnByValue":true,"awaitPromise":true}')
        if ($r.result.exceptionDetails) { throw 'guarded capture Start failed' }
        $results.values[[string]$step.as] = $r.result.result.value
      }
      elseif ($null -ne $step.waitEval) {`);
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
  // Startup already listed displays. A second listDisplays() would read thumbnails again.
  { captureStart: `(() => { const items = document.querySelectorAll('#displays li[role=option]'); if (items.length !== 1) throw Error('display selection is ambiguous'); items[0].click(); const box = document.getElementById('aiOn'); box.checked = false; if (document.getElementById('start').disabled) throw Error('capture Start unavailable'); document.getElementById('start').click(); return true; })()`, as: 'capture_start' },
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

if (edgePlacement) {
  // This diagnostic alone avoids Raise's TOPMOST pulse for its owned Edge window.
  // Generic callers, product windows and the historical default runner retain their behavior.
  replaceOnce('public static bool Raise(IntPtr h) {', 'public static bool Raise(IntPtr h) { return Raise(h, true); }\n  public static bool Raise(IntPtr h, bool pulseTopmost) {');
  replaceOnce('if (((long)GetWindowLongPtr(h, -20) & 0x8) == 0) {', 'if (pulseTopmost && ((long)GetWindowLongPtr(h, -20) & 0x8) == 0) {');
  replaceOnce('$i = 0\ntry {\n  Initialize-QaDisplayAdmission', readFileSync(join(here, 'qa_edge_placement.ps1'), 'utf8') + '\n$i = 0\ntry {\n  Initialize-QaDisplayAdmission');
  replaceOnce("'raise'    { $entry.foreground = [QaWin]::Raise($h) }", "'raise'    { if ([string]$step.window -eq 'edge') { $entry.foreground = Raise-QaEdgeNormal $entry $h } else { $entry.foreground = [QaWin]::Raise($h) } }");
  const fullscreenBranch = runner.slice(runner.indexOf('        # Edge\'s own window, through its DevTools'), runner.indexOf('      elseif ($null -ne $step.keys) {'));
  if (!fullscreenBranch.startsWith('        # Edge\'s own window') || !fullscreenBranch.endsWith('      }\n')) throw Error('Edge fullscreen branch changed');
  replaceOnce(fullscreenBranch, "        $entry.kind = 'edgeFullscreen'\n        Reset-QaEdgeFullscreen $entry\n      }\n");
  // Preserve the existing PID predicate; add exact-root observations and a stricter check before it.
  replaceOnce('$entry.points = @($step.points).Count', '$entry.points = @($step.points).Count\n        Assert-QaEdgePoints $entry $h @($step.points)');
  replaceOnce('$r = Invoke-Cdp $captureSocket', '$script:qaPlacementCaptureAttempted = $true\n        $r = Invoke-Cdp $captureSocket');
  replaceOnce('elseif ($null -ne $step.waitEval) {', "elseif ($null -ne $step.productPlacement) {\n        $entry.kind = 'productPlacement'; $entry.phase = [string]$step.productPlacement\n        Assert-QaProductPlacement $entry ([string]$step.productPlacement)\n      }\n      elseif ($null -ne $step.waitEval) {");
  // Focus/raise control only before capture; the existing Edge raise/16 points then restore safe-surface admission.
  steps.splice(steps.findIndex(s => s.as === 'before_capture') + 1, 0, { productPlacement: 'control' });
  steps.splice(steps.findIndex(s => s.as === 'drag_hook'), 0, { productPlacement: 'overlay' });
}

return { runner, steps, originalHash };
}
