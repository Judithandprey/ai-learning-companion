# QA runner for the Windows app (P0-13): starts the staged app as a real Windows process with an isolated
# user-data folder and a loopback DevTools port, opens real native windows with QA-authored course content,
# and runs a JSON step list against them. Written for Windows PowerShell 5.1, started from WSL.
#
# Input kinds are labelled in the results: overlay strokes are DevTools-injected mouse/pen events and toolbar
# or control actions are DOM clicks (neither is physical hardware or a human); window switching uses Win32
# ShowWindow/SetForegroundWindow and never moves the user's cursor. Desktop screenshots are physical-pixel
# GDI copies saved only to -OutDir (a temporary folder the caller never commits).
#
# Step forms (JSON array):
#   { "sleep": ms }
#   { "eval": "expr", "target": "control|overlay|edge", "as": "name" }         awaited, stored by value
#   { "waitEval": "expr", "target": ..., "timeoutMs": n, "as": "name" }        polls until truthy
#   { "stroke": [[x,y],...], "pointerType": "mouse|pen", "release": true, "delayMs": 12 }   overlay input
#     ("continue": true skips the press and continues a held gesture from its first point; "release": false keeps it held)
#   { "raceStop": [[x,y],...], "pointerType": "pen", "releaseFirst": [x,y] }    Stop click + new stroke, unawaited
#   { "edgeStart": "file:///...", "profile": "C:\\...", "as": "edge" }          real Edge app window
#   { "consoleStart": "C:\\...\\notes.txt", "title": "...", "as": "console" }   real conhost window
#   { "window": "edge|console|control", "show": "maximize|minimize|restore|front" }
#   { "desktopShot": "label" }                                                  physical pixels -> OutDir (BMP), cursor read
#   { "snapshot": "label" }                                                     copy ink JSON -> OutDir
#   { "targets": "app|edge", "as": "name" }                                    DevTools target list (type/url/title)
#   { "closeApp": true }                                                        close control window, await exit
param(
  [Parameter(Mandatory = $true)][string]$Electron,
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$UserData,
  [Parameter(Mandatory = $true)][string]$StepsFile,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$Edge
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class QaWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [StructLayout(LayoutKind.Sequential)] public struct Pt { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);
  // Read-only: where the user's cursor is (physical px). It is never moved; a cursor over a stroke is in the frames.
  public static int[] Cursor() { Pt p; return GetCursorPos(out p) ? new int[] { p.X, p.Y } : null; }
  // Brings a window to the front without synthetic input: attach to the foreground thread's input state for
  // the call (the documented foreground-lock rule), then fall back to SwitchToThisWindow.
  public static bool Front(IntPtr h) {
    IntPtr fg = GetForegroundWindow(); uint ignored;
    uint fgThread = GetWindowThreadProcessId(fg, out ignored), me = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    ShowWindow(h, 3); BringWindowToTop(h); SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fgThread, false);
    if (GetForegroundWindow() != h) { SwitchToThisWindow(h, true); System.Threading.Thread.Sleep(150); }
    return GetForegroundWindow() == h;
  }
  public static IntPtr Find(uint[] pids, string title, bool exact) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!IsWindowVisible(h) || Array.IndexOf(pids, pid) < 0) return true;
      var s = new StringBuilder(512); GetWindowText(h, s, 512);
      string t = s.ToString();
      if (title == null || (exact ? t == title : t.Contains(title))) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
[void][QaWin]::SetProcessDPIAware()

$steps = Get-Content -Raw -Encoding UTF8 $StepsFile | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$results = [ordered]@{ steps = @(); values = [ordered]@{}; errors = @(); processes = [ordered]@{}; foreign = [ordered]@{}; cursor = [ordered]@{} }
$client = New-Object System.Net.WebClient
$client.Proxy = $null   # loopback only; never route a debugging port through a proxy

# Another Electron app (for example an author self-test) on this shared desktop changes what is on screen.
# Its presence is recorded at the start, at every desktop screenshot and at the end; paths are not kept.
function Foreign-Electron {
  $mine = [IO.Path]::GetFullPath($Stage).TrimEnd('\')
  @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine.IndexOf($mine, [StringComparison]::OrdinalIgnoreCase) -lt 0
    } | ForEach-Object { [ordered]@{ pid = $_.ProcessId; stage = ([regex]::Match($_.CommandLine, 'lc-[A-Za-z0-9_-]+')).Value } })
}
function Free-Port { $l = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop(); return $p }
function Receive-Message($socket) {
  $buffer = New-Object byte[] 1048576
  $stream = New-Object System.IO.MemoryStream
  do {
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $buffer)
    $task = $socket.ReceiveAsync($segment, [Threading.CancellationToken]::None)
    if (-not $task.Wait(60000)) { throw 'CDP receive timeout' }
    $received = $task.Result
    if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP socket closed' }
    $stream.Write($buffer, 0, $received.Count)
  } while (-not $received.EndOfMessage)
  return [Text.Encoding]::UTF8.GetString($stream.ToArray())
}
$script:nextId = 0
function Send-Cdp($socket, [string]$method, [string]$paramsJson) {
  # Sends without waiting for the reply (for a Stop racing new input); returns the message id.
  $script:nextId++
  $bytes = [Text.Encoding]::UTF8.GetBytes('{"id":' + $script:nextId + ',"method":"' + $method + '","params":' + $paramsJson + '}')
  $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
  $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
  return $script:nextId
}
function Invoke-Cdp($socket, [string]$method, [string]$paramsJson) {
  $script:nextId++
  $id = $script:nextId
  $bytes = [Text.Encoding]::UTF8.GetBytes('{"id":' + $id + ',"method":"' + $method + '","params":' + $paramsJson + '}')
  $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
  $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
  while ($true) {
    $text = Receive-Message $socket
    if ($text -match ('^\{"id":' + $id + '[,}]')) { return ($text | ConvertFrom-Json) }
  }
}

$results.foreign.start = Foreign-Electron
$results.cursor.start = [QaWin]::Cursor()
# The app: real Windows process, isolated user data, DevTools on loopback only.
$appPort = Free-Port
$env:LC_USER_DATA = $UserData
$app = Start-Process -FilePath $Electron -ArgumentList @("`"$Stage`"", "--remote-debugging-port=$appPort", '--remote-debugging-address=127.0.0.1') -PassThru
Remove-Item Env:\LC_USER_DATA
$results.processes.app = [ordered]@{ pid = $app.Id; devtools = "127.0.0.1:$appPort" }
Set-Content -Encoding ASCII -Path (Join-Path $OutDir 'app.pid') -Value $app.Id
$started = @{}      # name -> process (edge, console)
$sockets = @{}      # target -> @{ ws; id }
$edgePort = $null

function Target-Url([string]$target) {
  if ($target -eq 'control') { return '/renderer/control.html' }
  if ($target -eq 'overlay') { return '/renderer/overlay.html' }
  return $null
}
function Get-Socket([string]$target) {
  $cached = $sockets[$target]
  if ($cached -and $cached.ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    # The overlay window is replaced per session: reconnect when its target id changed.
    $port = if ($target -eq 'edge') { $script:edgePort } else { $appPort }
    $list = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
    if (@($list | Where-Object { $_.id -eq $cached.id }).Count -eq 1) { return $cached.ws }
  }
  $port = if ($target -eq 'edge') { $script:edgePort } else { $appPort }
  $deadline = (Get-Date).AddSeconds(20)
  while ($true) {
    try {
      $list = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
      $url = Target-Url $target
      $t = if ($url) { $list | Where-Object { $_.type -eq 'page' -and $_.url.StartsWith('app://bundle/') -and $_.url.EndsWith($url) } | Select-Object -First 1 }
           else { $list | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
      if ($t) { break }
    } catch { }
    if ((Get-Date) -gt $deadline) { throw "no DevTools target for $target" }
    Start-Sleep -Milliseconds 150
  }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$t.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $sockets[$target] = @{ ws = $ws; id = $t.id }
  return $ws
}
function Eval([string]$target, [string]$expression) {
  $expr = ConvertTo-Json -InputObject $expression -Compress
  $r = Invoke-Cdp (Get-Socket $target) 'Runtime.evaluate' ('{"expression":' + $expr + ',"returnByValue":true,"awaitPromise":true}')
  if ($r.result.exceptionDetails) { throw ('eval exception: ' + ($r.result.exceptionDetails | ConvertTo-Json -Compress -Depth 6)) }
  return $r.result.result.value
}
function Window-Handle([string]$name) {
  if ($name -eq 'control') { return [QaWin]::Find(@([uint32]$app.Id), 'Learning Companion', $true) }
  $p = $started[$name]
  if (-not $p) { throw "unknown window $name" }
  $pids = @([uint32]$p.Id) + @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | ForEach-Object { [uint32]$_.ProcessId })
  return [QaWin]::Find($pids, $null, $false)
}

$i = 0
try {
  foreach ($step in $steps) {
    $i++
    $entry = [ordered]@{ i = $i; ok = $true; at = (Get-Date).ToUniversalTime().ToString('o') }
    try {
      if ($null -ne $step.sleep) { $entry.kind = 'sleep'; Start-Sleep -Milliseconds ([int]$step.sleep) }
      elseif ($null -ne $step.eval) {
        $entry.kind = 'eval'; $entry.target = $step.target; $entry.as = $step.as
        $value = Eval ([string]$step.target) ([string]$step.eval)
        if ($step.as) { $results.values[$step.as] = $value }
      }
      elseif ($null -ne $step.waitEval) {
        $entry.kind = 'waitEval'; $entry.target = $step.target; $entry.as = $step.as
        $timeout = if ($step.timeoutMs) { [int]$step.timeoutMs } else { 15000 }
        $deadline = (Get-Date).AddMilliseconds($timeout)
        while ($true) {
          $value = $null
          try { $value = Eval ([string]$step.target) ([string]$step.waitEval) } catch { }
          if ($value) { break }
          if ((Get-Date) -gt $deadline) { throw "waitEval timed out: $($step.waitEval)" }
          Start-Sleep -Milliseconds 100
        }
        if ($step.as) { $results.values[$step.as] = $value }
      }
      elseif ($null -ne $step.stroke) {
        # DevTools-injected pointer input into the overlay page (not physical hardware).
        $entry.kind = 'stroke'; $entry.pointerType = $step.pointerType; $entry.points = @($step.stroke).Count
        $ws = Get-Socket 'overlay'
        $pt = [string]$step.pointerType
        $delay = if ($step.delayMs) { [int]$step.delayMs } else { 12 }
        $pts = @($step.stroke)
        $mk = { param($type, $p, $buttons) '{"type":"' + $type + '","x":' + $p[0] + ',"y":' + $p[1] + ',"button":"left","buttons":' + $buttons + ',"clickCount":1,"pointerType":"' + $pt + '"}' }
        if (-not $step.continue) { [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $mk 'mouseMoved' $pts[0] 0)); [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $mk 'mousePressed' $pts[0] 1)) }
        if ($pts.Count -lt 2) { throw 'a stroke needs at least two points' }
        foreach ($p in $pts[1..($pts.Count - 1)]) { Start-Sleep -Milliseconds $delay; [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $mk 'mouseMoved' $p 1)) }
        if ($step.release -ne $false) { [void](Invoke-Cdp $ws 'Input.dispatchMouseEvent' (& $mk 'mouseReleased' $pts[$pts.Count - 1] 0)) }
      }
      elseif ($null -ne $step.raceStop) {
        # Stop (a DOM click in the control page) and new injected overlay input sent back to back, with no
        # waiting in between; replies are collected afterwards. Records which overlay events got a reply.
        $entry.kind = 'raceStop'; $entry.pointerType = $step.pointerType
        $ov = Get-Socket 'overlay'; $ctl = Get-Socket 'control'
        $pt = [string]$step.pointerType
        $mk = { param($type, $p, $buttons) '{"type":"' + $type + '","x":' + $p[0] + ',"y":' + $p[1] + ',"button":"left","buttons":' + $buttons + ',"clickCount":1,"pointerType":"' + $pt + '"}' }
        $stopId = Send-Cdp $ctl 'Runtime.evaluate' '{"expression":"document.getElementById(\"stop\").click(), true","returnByValue":true}'
        $entry.stop_sent_at = (Get-Date).ToUniversalTime().ToString('o')
        $sent = @(); $sendErrors = 0
        $pts = @($step.raceStop)
        try {
          # Optionally end the gesture that was in progress when Stop was clicked, so the new stroke starts
          # with a real pen-down rather than a second press of a held button.
          if ($null -ne $step.releaseFirst) { $sent += Send-Cdp $ov 'Input.dispatchMouseEvent' (& $mk 'mouseReleased' @($step.releaseFirst) 0) }
          $sent += Send-Cdp $ov 'Input.dispatchMouseEvent' (& $mk 'mousePressed' $pts[0] 1)
          foreach ($p in $pts[1..($pts.Count - 1)]) { $sent += Send-Cdp $ov 'Input.dispatchMouseEvent' (& $mk 'mouseMoved' $p 1) }
          $sent += Send-Cdp $ov 'Input.dispatchMouseEvent' (& $mk 'mouseReleased' $pts[$pts.Count - 1] 0)
        } catch { $sendErrors++ }
        $entry.input_sent_at = (Get-Date).ToUniversalTime().ToString('o')
        $entry.overlay_events_sent = $sent.Count; $entry.overlay_send_errors = $sendErrors
        $replies = 0; $errors = 0
        try {
          while ($replies + $errors -lt $sent.Count) {
            $text = Receive-Message $ov
            if ($text -match '^\{"id":\d+,"error"') { $errors++ } elseif ($text -match '^\{"id":\d+') { $replies++ }
          }
        } catch { $entry.overlay_receive_note = $_.Exception.Message }
        $entry.overlay_replies = $replies; $entry.overlay_errors = $errors
        try { while ($true) { $t = Receive-Message $ctl; if ($t -match ('^\{"id":' + $stopId + '[,}]')) { break } } } catch { }
      }
      elseif ($null -ne $step.edgeStart) {
        $entry.kind = 'edgeStart'
        $prof = [string]$step.profile
        $p = Start-Process -FilePath $Edge -ArgumentList @("--user-data-dir=$prof", '--no-first-run', '--no-default-browser-check',
          '--disable-sync', '--disable-extensions', '--disable-features=Translate,msTranslate,TranslateUI', '--lang=en-US', '--remote-debugging-port=0', "--app=$($step.edgeStart)") -PassThru
        $started[[string]$step.as] = $p
        $portFile = Join-Path $prof 'DevToolsActivePort'
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-Path $portFile)) { if ((Get-Date) -gt $deadline) { throw 'Edge DevToolsActivePort did not appear' }; Start-Sleep -Milliseconds 200 }
        Start-Sleep -Milliseconds 300
        $script:edgePort = (Get-Content $portFile)[0].Trim()
        $results.processes.edge = [ordered]@{ pid = $p.Id }
        [void](Eval 'edge' 'new Promise(r => document.readyState === "complete" ? r(true) : addEventListener("load", () => r(true)))')
      }
      elseif ($null -ne $step.consoleStart) {
        $entry.kind = 'consoleStart'
        $cmd = "/k title $($step.title) & type `"$($step.consoleStart)`""
        $p = Start-Process -FilePath 'conhost.exe' -ArgumentList @('cmd.exe', $cmd) -PassThru
        $started[[string]$step.as] = $p
        $results.processes.console = [ordered]@{ pid = $p.Id }
        $deadline = (Get-Date).AddSeconds(15)
        while ((Window-Handle ([string]$step.as)) -eq [IntPtr]::Zero) { if ((Get-Date) -gt $deadline) { throw 'console window did not appear' }; Start-Sleep -Milliseconds 200 }
      }
      elseif ($null -ne $step.window) {
        $entry.kind = 'window'; $entry.window = $step.window; $entry.show = $step.show
        $h = Window-Handle ([string]$step.window)
        if ($h -eq [IntPtr]::Zero) { throw "window $($step.window) not found" }
        switch ([string]$step.show) {
          'maximize' { [void][QaWin]::ShowWindow($h, 3) }
          'minimize' { [void][QaWin]::ShowWindow($h, 6) }
          'restore'  { [void][QaWin]::ShowWindow($h, 9) }
          'front'    { $entry.foreground = [QaWin]::Front($h) }
        }
        Start-Sleep -Milliseconds 200
        $entry.is_foreground = ([QaWin]::GetForegroundWindow() -eq $h)
      }
      elseif ($null -ne $step.desktopShot) {
        $entry.kind = 'desktopShot'; $entry.label = $step.desktopShot
        $entry.foreign = Foreign-Electron
        $entry.cursor = [QaWin]::Cursor()
        $w = [QaWin]::GetSystemMetrics(0); $hgt = [QaWin]::GetSystemMetrics(1)
        $bmp = New-Object System.Drawing.Bitmap($w, $hgt)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
        $bmp.Save((Join-Path $OutDir ("desk-" + $step.desktopShot + ".bmp")), [System.Drawing.Imaging.ImageFormat]::Bmp)
        $g.Dispose(); $bmp.Dispose()
        $entry.size = "$w x $hgt"
      }
      elseif ($null -ne $step.snapshot) {
        $entry.kind = 'snapshot'; $entry.label = $step.snapshot
        $dest = Join-Path $OutDir ("snap-" + $step.snapshot)
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        $ink = Join-Path $UserData 'ink'
        if (Test-Path $ink) { Get-ChildItem -Path $ink -Filter '*.json' -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $dest $_.Name) } }
        $ctx = Join-Path $ink 'context'
        $entry.contextPictures = if (Test-Path $ctx) { @(Get-ChildItem -Path $ctx -Filter '*.png' -File).Count } else { 0 }
      }
      elseif ($null -ne $step.targets) {
        $entry.kind = 'targets'; $entry.as = $step.as
        $port = if ([string]$step.targets -eq 'edge') { $script:edgePort } else { $appPort }
        $list = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
        $results.values[$step.as] = @($list | ForEach-Object { [ordered]@{ type = $_.type; url = $_.url; title = $_.title } })
      }
      elseif ($null -ne $step.closeApp) {
        $entry.kind = 'closeApp'
        try { [void](Eval 'control' 'window.close(), true') } catch { $entry.closeNote = 'control socket closed while closing' }
        $entry.exited = $app.WaitForExit(30000)
        $results.processes.app.exited = $entry.exited
      }
      else { throw 'unknown step' }
    }
    catch {
      $entry.ok = $false
      $entry.error = $_.Exception.Message
      $results.errors += "step ${i}: $($_.Exception.Message)"
      if ($step.required -ne $false) { $results.steps += $entry; throw }
    }
    $results.steps += $entry
  }
}
catch { $results.aborted = $_.Exception.Message }
finally {
  foreach ($s in $sockets.Values) { try { $s.ws.Dispose() } catch { } }
  foreach ($name in @($started.Keys)) { try { Stop-Process -Id $started[$name].Id -Force -ErrorAction SilentlyContinue } catch { } }
  if (-not $app.HasExited) {
    if (-not $app.WaitForExit(5000)) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue; $results.processes.app.killed = $true }
  }
  $results.processes.app.exit_code = $(try { $app.ExitCode } catch { $null })
  $results.foreign.end = Foreign-Electron
  $results.cursor.end = [QaWin]::Cursor()
  $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path (Join-Path $OutDir 'results.json')
}
