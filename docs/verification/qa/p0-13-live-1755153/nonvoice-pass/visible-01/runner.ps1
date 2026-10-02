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
#     ("fullscreen": true starts it full screen, so QA's page is the whole visible display)
#   { "edgeFullscreen": true }              asks Edge (DevTools Browser.setWindowBounds) to make its window full screen
#   { "cursorOutside": [x0,y0,x1,y1] }      physical px: fails if the user's mouse pointer is inside (it is never moved)
#   { "window": "edge", "show": "raise" }   bring to the front without maximizing (a full-screen window stays as it is)
#   { "launchApp": true, "as": "x", "sub": "fake" }   ... with LC_SUBSCRIPTION_CONNECTOR=<LinkDir>\sub-fake.json for that process only
#   { "keys": "text", "window": "overlay" }   OS-level synthetic keystrokes (SendKeys), sent ONLY if that owned window is the
#     foreground window at that moment (otherwise nothing is typed anywhere and the step says so); letters, digits, spaces
#   { "consoleStart": "C:\\...\\notes.txt", "title": "...", "as": "console" }   real conhost window
#   { "window": "edge|console|control", "show": "maximize|minimize|restore|front" }
#   { "desktopShot": "label" }                                                  physical pixels -> OutDir (BMP), cursor read
#   { "snapshot": "label" }                                                     copy ink JSON -> OutDir
#   { "targets": "app|edge", "as": "name" }                                    DevTools target list (type/url/title)
#   { "closeApp": true }                                                        close control window, await exit
#   { "launchApp": true, "as": "app2" }         relaunch the same staged app with the SAME user data (previous one must have exited)
#   { "hashTree": ["ink", ...], "frames": false, "as": "name" }   read-only sha256/size/mtime of files under user-data roots
#   { "plantFile": "ink/context/{value}.png", "fromValue": "name", "fill": "text" }   TEST corruption: same-length bytes in place
#   { "moveAside": "ink/context/{value}.png", "fromValue": "name", "expectValue": "name", "to": "qa-aside" }   move a TEST entry
#   { "copyTree": "apptemp|userdata", "path": "relative", "to": "label" }       copy a test-owned folder into OutDir
#   { "launchApp": true, "as": "x", "link": "main" }   ... with LC_DEV_CAPTURE_HOST=<LinkDir>\link-main.json for that process only
#   { "seedLinkRecord": true, "actor": {user_id,...}, "as": "seed" }   write a QA-minted actor as a fresh coordination record
#   { "children": true, "as": "name" }                                  the app's child processes (name, pid, start; no command line)
#   { "endHungApp": true, "as": "name" }   if the owned app did not exit after closeApp: record it, then end that PID only
#   { "closeApp": true, "via": "page|wm_close", "again": true, "waitMs": 30000 }   close request -> own exit, timed; never kills
#     ("page" is the page's own window.close(); "wm_close" posts WM_CLOSE to the control window, as its title-bar X does,
#      so the app's own close handler runs; "again" posts a second WM_CLOSE to that window right behind the first)
#   { "hostPause": true, "as": "name" } / { "hostResume": true, "as": "name" }   ask this run's WSL watcher to pause/resume
#     only this run's own test-service host (a send then gets no answer); the watcher resumes it on its own in any case
#   { "osClick": "#selector", "target": "overlay", "window": "overlay" }   one OS mouse click on that element, only if the window under the point is this app's
#   { "cursorBack": true }                     the pointer back to where it was before the first osClick
#   { "onTop": "edge", "points": [[x,y],...] }   physical px: fails unless the top-level window under every point is that owned window
# The file steps only touch paths inside this run's user-data folder (or its test-owned temp folder), never elsewhere.
param(
  [Parameter(Mandatory = $true)][string]$Electron,
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$UserData,
  [Parameter(Mandatory = $true)][string]$StepsFile,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$Edge,
  [string]$AppTemp = '',
  [string]$LinkDir = '',
  [switch]$AllowForeign
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$qaElapsed = [Diagnostics.Stopwatch]::StartNew()
foreach ($k in @('LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'ELECTRON_RUN_AS_NODE')) { Remove-Item ('Env:\' + $k) -ErrorAction SilentlyContinue }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
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
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [StructLayout(LayoutKind.Sequential)] public struct Pt { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Pt p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  // A small injected mouse movement (there and back). SetCursorPos alone only places the pointer: a window that lets the
  // mouse through until the pointer moves over its controls (the app's overlay in NAV) is told of movement only by this.
  public static void Nudge() { mouse_event(0x0001, 2, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(40); mouse_event(0x0001, -2, 0, 0, UIntPtr.Zero); }
  // The process that owns the top-level window under a screen point (physical px); 0 when there is none.
  public static uint PidAt(int x, int y) { Pt p; p.X = x; p.Y = y; IntPtr h = WindowFromPoint(p); if (h == IntPtr.Zero) return 0;
    IntPtr root = GetAncestor(h, 2); uint pid; GetWindowThreadProcessId(root == IntPtr.Zero ? h : root, out pid); return pid; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  // Puts a window above every other normal window WITHOUT changing its size or state (a full-screen window stays full
  // screen): first the ordinary way; if another app keeps the foreground (the foreground lock), the window is made
  // topmost and at once not topmost again, which leaves it at the top of the normal windows. Nothing is closed or moved.
  public static bool Raise(IntPtr h) {
    IntPtr fg = GetForegroundWindow(); uint ignored;
    uint fgThread = GetWindowThreadProcessId(fg, out ignored), me = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    BringWindowToTop(h); SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fgThread, false);
    // (a window that is always-on-top already, as the app's overlay is, keeps that state: it is not touched here)
    if (((long)GetWindowLongPtr(h, -20) & 0x8) == 0) {
      SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
      SetWindowPos(h, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    }
    System.Threading.Thread.Sleep(200);
    return GetForegroundWindow() == h;
  }
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  // The top-level window under a screen point (physical px).
  public static IntPtr RootAt(int x, int y) { Pt p; p.X = x; p.Y = y; IntPtr h = WindowFromPoint(p); if (h == IntPtr.Zero) return h; IntPtr root = GetAncestor(h, 2); return root == IntPtr.Zero ? h : root; }
  public static void LeftClick() { mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(60); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); }
  // Read-only: where the user's cursor is (physical px). It is moved only by the osClick step (and put back by cursorBack).
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
$started = @{}      # name -> process (edge, console)
$sockets = @{}      # target -> @{ ws; id }
# The app: real Windows process, isolated user data, DevTools on loopback only. With -AppTemp, TMP/TEMP point to a
# test-owned folder for the app process only (its spare copies of unsaved ink land there, not in the user's %TEMP%).
function Start-App([string]$key, [string]$link = '', [string]$sub = '') {
  $linkFile = $null
  $subFile = $null
  if ($sub) {
    # The subscription connector's trusted launch configuration, for this app process only (it names no credential).
    if ($sub -notmatch '^[a-z0-9-]+$' -or -not $LinkDir) { throw "bad subscription config name $sub" }
    $subFile = Join-Path $LinkDir "sub-$sub.json"
    if (-not (Test-Path -LiteralPath $subFile -PathType Leaf)) { throw "no subscription config $sub" }
  }
  if ($link) {
    # The development capture link, for this app process only (the file names no secret; the app reads the DSN itself).
    if ($link -notmatch '^[a-z0-9-]+$' -or -not $LinkDir) { throw "bad link name $link" }
    $linkFile = Join-Path $LinkDir "link-$link.json"
    if (-not (Test-Path -LiteralPath $linkFile -PathType Leaf)) { throw "no link config $link" }
  }
  $script:appPort = 44122
  $saved = @{ TMP = $env:TMP; TEMP = $env:TEMP }
  $env:LC_USER_DATA = $UserData
  if ($AppTemp) { New-Item -ItemType Directory -Force -Path $AppTemp | Out-Null; $env:TMP = $AppTemp; $env:TEMP = $AppTemp }
  if ($linkFile) { $env:LC_DEV_CAPTURE_HOST = $linkFile }
  Remove-Item Env:\LC_SUBSCRIPTION_CONNECTOR -ErrorAction SilentlyContinue   # never inherited: on only when this launch asks for it
  if ($subFile) { $env:LC_SUBSCRIPTION_CONNECTOR = $subFile }
  try { $script:app = Start-Process -FilePath $Electron -ArgumentList @("`"$Stage`"", "--remote-debugging-port=$($script:appPort)", '--remote-debugging-address=127.0.0.1') -PassThru }
  finally { Remove-Item Env:\LC_USER_DATA; Remove-Item Env:\LC_DEV_CAPTURE_HOST -ErrorAction SilentlyContinue; Remove-Item Env:\LC_SUBSCRIPTION_CONNECTOR -ErrorAction SilentlyContinue; $env:TMP = $saved.TMP; $env:TEMP = $saved.TEMP }
  $script:appKey = $key
  foreach ($t in @('control', 'overlay')) { if ($sockets[$t]) { try { $sockets[$t].ws.Dispose() } catch { }; $sockets.Remove($t) } }
  $results.processes[$key] = [ordered]@{ pid = $script:app.Id; devtools = "127.0.0.1:$($script:appPort)"; started_at = (Get-Date).ToUniversalTime().ToString('o'); link = $link }
  if ($linkFile) { $results.processes[$key].link_config_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $linkFile).Hash.ToLower() }
  $results.processes[$key].sub = $sub
  if ($subFile) { $results.processes[$key].sub_config_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $subFile).Hash.ToLower() }
  # Every app PID of this run with its start time, on disk at once: if the runner itself is cut short, the owned process
  # can be confirmed (PID and start time) before anyone ends it.
  try { Add-Content -Encoding ASCII -Path (Join-Path $OutDir 'app-pids.txt') -Value "$key $($script:app.Id) $($script:app.StartTime.ToUniversalTime().ToString('o'))" } catch { }
}
# The shared display: another Electron app (for example a self-test) means another owner; do not start over it.
if ($results.foreign.start -and -not $AllowForeign) {
  $results.aborted = 'another Electron app is running on the shared display; nothing was started'
  $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path (Join-Path $OutDir 'results.json')
  exit 3
}
$script:wslSeen = @{}
# Product launch is an explicit step after generated-surface admission.
$UdFull = [IO.Path]::GetFullPath($UserData).TrimEnd('\')
# A relative path under this run's user data (or test temp): no rooted path, '..', wildcard or colon; no reparse point.
function Inside([string]$rel, [string]$root = $UdFull) {
  if (-not $rel -or [IO.Path]::IsPathRooted($rel) -or $rel -match '(^|[\\/])\.\.([\\/]|$)|[:*?"<>|]') { throw "refused path $rel" }
  $f = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $f.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) { throw "outside the test folder: $rel" }
  for ($q = $f; $q.Length -gt $root.Length; $q = Split-Path $q) {
    if ((Test-Path -LiteralPath $q) -and ((Get-Item -LiteralPath $q -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "reparse point: $rel" }
  }
  return $f
}
# Read with read/write/delete sharing, so the app's atomic renames and appends are never blocked by a QA read; the hash and
# the length come from the same bytes (a manifest line appended meanwhile cannot split them).
function Read-Shared([string]$f) {
  $st = [IO.File]::Open($f, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]'ReadWrite, Delete')
  try { $m = New-Object IO.MemoryStream; $st.CopyTo($m); return ,$m.ToArray() } finally { $st.Dispose() }
}
function Sha-Of([byte[]]$b) { return ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($b)) -replace '-').ToLower() }
function Sha([string]$f) { return Sha-Of (Read-Shared $f) }
function Value-Of([string]$name) { $v = [string]$results.values[$name]; if ($v -notmatch '^[0-9a-f]{64}$') { throw "value $name is not a sha256" }; return $v }
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
    $port = if ($target -eq 'edge') { $script:edgePort } else { $script:appPort }
    $list = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
    if (@($list | Where-Object { $_.id -eq $cached.id }).Count -eq 1) { return $cached.ws }
  }
  $port = if ($target -eq 'edge') { $script:edgePort } else { $script:appPort }
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
  if ($name -eq 'control') { return [QaWin]::Find(@([uint32]$script:app.Id), 'Learning Companion', $true) }
  if ($name -eq 'overlay') { return [QaWin]::Find(@([uint32]$script:app.Id), 'Learning Companion overlay', $true) }
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
        $edgeArgs = @( '--user-data-dir=C:\Users\ROG\AppData\Local\Temp\lc-qa-visible-drag-4abc3b21defe455b8a42a2751a9a77e0\edge-profile', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-features=Translate,msTranslate,TranslateUI,MediaRouter,OptimizationHints', '--lang=en-US', '--remote-debugging-port=46381', '--remote-debugging-address=127.0.0.1' )
        if ($step.fullscreen) { $edgeArgs += '--start-fullscreen' }
        $edgeArgs += "--app=$($step.edgeStart)"
        $p = Start-Process -FilePath $Edge -ArgumentList $edgeArgs -PassThru
        $started[[string]$step.as] = $p
        $portFile = Join-Path $prof 'DevToolsActivePort'
        $deadline = (Get-Date).AddSeconds(30)
        $script:edgePort = 46381
        Start-Sleep -Milliseconds 600
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
      elseif ($null -ne $step.window -and $null -eq $step.keys -and $null -eq $step.osClick) {
        $entry.kind = 'window'; $entry.window = $step.window; $entry.show = $step.show
        $h = Window-Handle ([string]$step.window)
        if ($h -eq [IntPtr]::Zero) { throw "window $($step.window) not found" }
        switch ([string]$step.show) {
          'raise'    { $entry.foreground = [QaWin]::Raise($h) }
          'maximize' { [void][QaWin]::ShowWindow($h, 3) }
          'minimize' { [void][QaWin]::ShowWindow($h, 6) }
          'restore'  { [void][QaWin]::ShowWindow($h, 9) }
          'front'    { $entry.foreground = [QaWin]::Front($h) }
        }
        Start-Sleep -Milliseconds 200
        $entry.is_foreground = ([QaWin]::GetForegroundWindow() -eq $h)
      }
      elseif ($null -ne $step.edgeClose) {
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
      elseif ($null -ne $step.edgeFullscreen) {
        # Edge's own window, through its DevTools page socket; the state it then reports is recorded, nothing is assumed.
        $entry.kind = 'edgeFullscreen'
        $ws = Get-Socket 'edge'
        $win = Invoke-Cdp $ws 'Browser.getWindowForTarget' '{}'
        if ($win.error) { throw ('Browser.getWindowForTarget: ' + $win.error.message) }
        $entry.before = [string]$win.result.bounds.windowState
        if ($entry.before -ne 'fullscreen') {
          if ($entry.before -ne 'normal') { [void](Invoke-Cdp $ws 'Browser.setWindowBounds' ('{"windowId":' + $win.result.windowId + ',"bounds":{"windowState":"normal"}}')) }
          $set = Invoke-Cdp $ws 'Browser.setWindowBounds' ('{"windowId":' + $win.result.windowId + ',"bounds":{"windowState":"fullscreen"}}')
          if ($set.error) { throw ('Browser.setWindowBounds: ' + $set.error.message) }
          Start-Sleep -Milliseconds 800
        }
        $entry.after = [string](Invoke-Cdp $ws 'Browser.getWindowForTarget' '{}').result.bounds.windowState
      }
      elseif ($null -ne $step.keys) {
        # Synthetic OS keystrokes into an owned window. They go wherever the keyboard focus is, so they are sent only while
        # that window is the foreground window; otherwise nothing is typed and the step records why.
        $entry.kind = 'keys'; $entry.window = $step.window
        $text = [string]$step.keys
        if ($text -notmatch '^[A-Za-z0-9 ]{1,80}$') { throw 'keys: only letters, digits and spaces' }
        $h = Window-Handle ([string]$step.window)
        $entry.window_found = ($h -ne [IntPtr]::Zero)
        $entry.is_foreground = ($entry.window_found -and [QaWin]::GetForegroundWindow() -eq $h)
        $entry.sent = $false; $entry.sent_chars = 0
        if ($entry.is_foreground) {
          # One character at a time, each only while that window still is the foreground window.
          foreach ($ch in $text.ToCharArray()) {
            if ([QaWin]::GetForegroundWindow() -ne $h) { break }
            [System.Windows.Forms.SendKeys]::SendWait([string]$ch)
            $entry.sent_chars++
          }
          $entry.sent = ($entry.sent_chars -eq $text.Length)
          $entry.still_foreground = ([QaWin]::GetForegroundWindow() -eq $h)
        }
      }
      elseif ($null -ne $step.onTop) {
        # What is really on the screen: the top-level window under each given point (physical px) must be the named owned
        # window's process. A page that says it is full screen can still be covered by another app's window; then the
        # app's frames would show that other window. Fails (nothing is started after it) and names only the process.
        $entry.kind = 'onTop'; $entry.window = [string]$step.onTop
        $h = Window-Handle ([string]$step.onTop)
        if ($h -eq [IntPtr]::Zero) { throw "window $($step.onTop) not found" }
        $owner = [uint32]0; [void][QaWin]::GetWindowThreadProcessId($h, [ref]$owner)
        $entry.points = @($step.points).Count
        $other = @()
        foreach ($pt in @($step.points)) {
          $at = [QaWin]::PidAt([int]$pt[0], [int]$pt[1])
          if ($at -ne $owner) { $other += [ordered]@{ point = @([int]$pt[0], [int]$pt[1]); process = $(try { (Get-Process -Id ([int]$at) -ErrorAction Stop).ProcessName } catch { 'unknown' }) } }
        }
        $entry.covered = $other
        if ($other.Count -gt 0) { throw "the $($step.onTop) window is covered at $($other.Count) of $($entry.points) points by: $((@($other | ForEach-Object { $_.process }) | Sort-Object -Unique) -join ', ')" }
      }
      elseif ($null -ne $step.osClick) {
        # ONE real OS mouse click (synthetic input through the OS, not a physical mouse) on an element of an owned page: what
        # a user's click does to the window's keyboard focus cannot be seen with DOM clicks. The pointer is moved there
        # first; the click is made only if the top-level window under that point belongs to this run's app, else nothing
        # is clicked. The point is the element's centre (page CSS px = DIP) times the display's scale.
        $entry.kind = 'osClick'; $entry.selector = [string]$step.osClick; $entry.target = [string]$step.target
        $sel = ConvertTo-Json -InputObject ([string]$step.osClick) -Compress
        # The element's centre, only if the page itself says that the element (or something inside it) is what is there.
        $box = (Eval ([string]$step.target) "(() => { const e = document.querySelector($sel); if (!e) return null; const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); return JSON.stringify({ x: window.screenX + cx, y: window.screenY + cy, w: r.width, h: r.height, dpr: devicePixelRatio, is_there: top === e || (top !== null && e.contains(top)) }); })()") | ConvertFrom-Json
        if (-not $box -or $box.w -le 0 -or $box.h -le 0) { throw "osClick: $($step.osClick) is not shown" }
        if (-not $box.is_there) { throw "osClick: $($step.osClick) is covered or clipped at its centre" }
        $x = [int][Math]::Round($box.x * $box.dpr); $y = [int][Math]::Round($box.y * $box.dpr)
        $entry.point_px = @($x, $y); $entry.cursor_before = [QaWin]::Cursor()
        if ($null -eq $script:cursorHome) { $script:cursorHome = $entry.cursor_before }
        $h = Window-Handle ([string]$step.window)
        if ($h -eq [IntPtr]::Zero) { throw "window $($step.window) not found" }
        $entry.foreground_before = ([QaWin]::GetForegroundWindow() -eq $h)
        [void][QaWin]::SetCursorPos($x, $y)
        [QaWin]::Nudge()               # the pointer arrives moving, as a mouse does
        Start-Sleep -Milliseconds 150
        [void][QaWin]::SetCursorPos($x, $y)
        Start-Sleep -Milliseconds 400
        # Clicked only if the pointer still is at that point and the top-level window under it is that very window
        # (the click goes wherever the pointer is).
        $now = [QaWin]::Cursor()
        $entry.pointer_still_there = ($null -ne $now -and $now[0] -eq $x -and $now[1] -eq $y)
        $entry.window_at_point_is_ours = ([QaWin]::RootAt($x, $y) -eq $h)
        $entry.clicked = $false
        if ($entry.pointer_still_there -and $entry.window_at_point_is_ours) {
          [QaWin]::LeftClick()
          $entry.clicked = $true
          Start-Sleep -Milliseconds 400
        }
        $entry.foreground_after = ($h -ne [IntPtr]::Zero -and [QaWin]::GetForegroundWindow() -eq $h)
      }
      elseif ($null -ne $step.cursorBack) {
        # The pointer goes back to where it was before the first osClick of this run.
        $entry.kind = 'cursorBack'
        if ($null -ne $script:cursorHome) { [void][QaWin]::SetCursorPos([int]$script:cursorHome[0], [int]$script:cursorHome[1]); Start-Sleep -Milliseconds 300 }
        $entry.cursor = [QaWin]::Cursor(); $entry.home = $script:cursorHome
      }
      elseif ($null -ne $step.cursorOutside) {
        # The user's pointer is in every captured frame and is never moved by QA: a test region must be free of it.
        $entry.kind = 'cursorOutside'
        $c = [QaWin]::Cursor(); $r = @($step.cursorOutside)
        $entry.cursor = $c
        if ($null -eq $c) { throw 'the cursor position could not be read' }
        if ($c[0] -ge [int]$r[0] -and $c[0] -le [int]$r[2] -and $c[1] -ge [int]$r[1] -and $c[1] -le [int]$r[3]) { throw "the mouse pointer is inside the test region ($($c[0]), $($c[1]) px)" }
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
        $port = if ([string]$step.targets -eq 'edge') { $script:edgePort } else { $script:appPort }
        $list = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
        $results.values[$step.as] = @($list | ForEach-Object { [ordered]@{ type = $_.type; url = $_.url; title = $_.title } })
      }
      elseif ($null -ne $step.closeApp) {
        # Only a close request and a wait: the app must end by itself. exit_ms runs from just before the request to the
        # moment the wait returned (an upper bound of the app's own time to exit); a process still alive is left alone.
        $entry.kind = 'closeApp'
        $via = if ($step.via) { [string]$step.via } else { 'page' }
        $wait = if ($step.waitMs) { [int]$step.waitMs } else { 30000 }
        $entry.via = $via
        $pr = $results.processes[$script:appKey]
        if ($step.again -and $via -ne 'wm_close') { throw 'a repeated close request needs wm_close' }
        $h = [IntPtr]::Zero
        if ($via -eq 'wm_close') { $h = Window-Handle 'control'; if ($h -eq [IntPtr]::Zero) { throw 'control window not found' } }
        elseif ($via -ne 'page') { throw "unknown close $via" }
        $entry.close_requested_at = (Get-Date).ToUniversalTime().ToString('o')
        $sw = [Diagnostics.Stopwatch]::StartNew()
        if ($via -eq 'wm_close') { $entry.posted = [QaWin]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
        else { try { [void](Eval 'control' 'window.close(), true') } catch { $entry.closeNote = 'control socket closed while closing' } }
        if ($step.again) {
          # The same window handle again, shortly after: whether Windows accepted the post is recorded, nothing more is claimed.
          Start-Sleep -Milliseconds 60
          $entry.again = [ordered]@{ after_ms = [int]$sw.ElapsedMilliseconds; posted = [QaWin]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
        }
        $entry.exited = $script:app.WaitForExit($wait)
        $entry.exit_ms = [int]$sw.ElapsedMilliseconds
        $pr.exited = $entry.exited; $pr.close_via = $via; $pr.close_requested_at = $entry.close_requested_at; $pr.exit_ms = $entry.exit_ms
        if ($entry.exited) {
          $entry.exit_code = $script:app.ExitCode
          $pr.exit_code = $script:app.ExitCode
          $pr.exited_at = $(try { $script:app.ExitTime.ToUniversalTime().ToString('o') } catch { (Get-Date).ToUniversalTime().ToString('o') })
        }
      }
      elseif ($null -ne $step.endHungApp) {
        # QA-WIN-03: after closeApp the window is gone but the owned app process may not exit. Recorded, then only that
        # owned PID is ended (never by name); its remaining DevTools pages are listed first.
        $entry.kind = 'endHungApp'
        $entry.was_running = -not $script:app.HasExited
        if ($entry.was_running) {
          try { $entry.pages_left = @(($client.DownloadString("http://127.0.0.1:$($script:appPort)/json/list") | ConvertFrom-Json) | Where-Object { $_.type -eq 'page' }).Count } catch { $entry.pages_left = 'no DevTools answer' }
          $entry.children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($script:app.Id)" | ForEach-Object { $_.Name })
          Stop-Process -Id $script:app.Id -Force -ErrorAction SilentlyContinue
          $entry.ended = $script:app.WaitForExit(10000)
          $results.processes[$script:appKey].killed = $true
          $results.processes[$script:appKey].hung_after_close = $true
          $results.processes[$script:appKey].exited_at = (Get-Date).ToUniversalTime().ToString('o')
        }
        $results.values[[string]$step.as] = [ordered]@{ was_running = $entry.was_running; pages_left = $entry.pages_left; children = $entry.children; ended = $entry.ended }
      }
      elseif ($null -ne $step.launchApp) {
        $entry.kind = 'launchApp'
        if ($script:app -and -not $script:app.HasExited) { throw 'the previous app process has not exited' }
        # What the previous owned process did, as recorded: it ended by itself or QA ended it (never hidden here).
        $prev = if ($script:app) { $results.processes[$script:appKey] } else { $null }
        if ($script:app) { $entry.previous = [ordered]@{ key = $script:appKey; pid = $script:app.Id; exit_code = $script:app.ExitCode; killed = [bool]$prev.killed } }
        Start-Sleep -Milliseconds 1500
        Start-App ([string]$step.as) ([string]$step.link) ([string]$step.sub)
        $entry.pid = $script:app.Id
      }
      elseif ($null -ne $step.seedLinkRecord) {
        # A QA-minted actor (checked pristine in the test database first) as a new coordination record.
        $entry.kind = 'seedLinkRecord'
        $dir = Inside 'capture-host'
        if (Test-Path -LiteralPath $dir) { throw 'a capture link record already exists' }
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $a = $step.actor
        $record = [ordered]@{ format = 'lc-windows-capture-link/v1'; actor = [ordered]@{ user_id = [string]$a.user_id; device_id = [string]$a.device_id;
          session_id = [string]$a.session_id; producer_id = [string]$a.producer_id }; last_registered_stream = $null; streams = @() }
        $json = ($record | ConvertTo-Json -Depth 5 -Compress) + "`n"
        [IO.File]::WriteAllBytes((Join-Path $dir 'coordination.json'), [Text.Encoding]::UTF8.GetBytes($json))
        $results.values[[string]$step.as] = [ordered]@{ sha256 = (Sha (Join-Path $dir 'coordination.json')); user_id = [string]$a.user_id }
      }
      elseif ($null -ne $step.hostPause -or $null -ne $step.hostResume) {
        # The WSL watcher of this run (qa_parent_db.py watch --control) pauses/resumes only this run's own host; this
        # step only writes or removes the request in this run's out folder and waits for the watcher's answer.
        $pause = $null -ne $step.hostPause
        $entry.kind = if ($pause) { 'hostPause' } else { 'hostResume' }
        if (-not $LinkDir) { throw 'no development link in this run' }
        $req = Join-Path $OutDir 'host-pause.request'; $ack = Join-Path $OutDir 'host-pause.ack'
        if ($pause) { [IO.File]::WriteAllText($req, 'pause') } else { Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue }
        $deadline = (Get-Date).AddSeconds(10)
        while ((Test-Path -LiteralPath $ack) -ne $pause) {
          if ((Get-Date) -gt $deadline) { Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue; throw "the watcher did not answer the host $($entry.kind)" }
          Start-Sleep -Milliseconds 100
        }
        $entry.answered_at = (Get-Date).ToUniversalTime().ToString('o')
        if ($pause) {
          $answer = $null
          while (-not $answer) {
            try { $answer = Get-Content -Raw -LiteralPath $ack | ConvertFrom-Json } catch { $answer = $null }
            if (-not $answer) { if ((Get-Date) -gt $deadline) { Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue; throw 'the watcher answer could not be read' }; Start-Sleep -Milliseconds 100 }
          }
          $entry.hosts = @($answer.hosts).Count
          if ($entry.hosts -lt 1) { Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue; throw 'no host of this run was running to pause' }
        }
        if ($step.as) { $results.values[[string]$step.as] = [ordered]@{ at = $entry.answered_at; hosts = $entry.hosts } }
      }
      elseif ($null -ne $step.children) {
        # Read-only: the app's direct child processes (no command line is read); every wsl.exe seen is remembered.
        $entry.kind = 'children'
        $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($script:app.Id)" | ForEach-Object {
            if ($_.Name -eq 'wsl.exe') { $script:wslSeen[[string]$_.ProcessId] = $true }
            [ordered]@{ name = $_.Name; pid = $_.ProcessId; created = $_.CreationDate.ToUniversalTime().ToString('o') } })
        $results.values[[string]$step.as] = [ordered]@{ app_pid = $script:app.Id; at = (Get-Date).ToUniversalTime().ToString('o'); children = $kids }
      }
      elseif ($null -ne $step.hashTree) {
        $entry.kind = 'hashTree'; $entry.as = $step.as
        $tree = [ordered]@{}
        foreach ($root in @($step.hashTree)) {
          $dir = Inside ([string]$root)
          if (-not (Test-Path -LiteralPath $dir)) { continue }
          Get-ChildItem -LiteralPath $dir -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
            $rel = $_.FullName.Substring($UdFull.Length + 1) -replace '\\', '/'
            if (-not $step.frames -and $rel -match '^captures/[^/]+/frames/') { return }
            try { $b = Read-Shared $_.FullName; $tree[$rel] = [ordered]@{ sha256 = (Sha-Of $b); bytes = $b.Length; mtime_utc = $_.LastWriteTimeUtc.ToString('o') } }
            catch { $tree[$rel] = 'vanished' }
          }
        }
        $results.values[$step.as] = $tree
      }
      elseif ($null -ne $step.plantFile) {
        # TEST corruption inside this run's profile only: an existing entry whose bytes are exactly the named sha256 is
        # overwritten in place with other bytes of the same length (so it occupies the address with foreign content).
        $entry.kind = 'plantFile'
        $v = Value-Of ([string]$step.fromValue)
        $f = Inside (([string]$step.plantFile).Replace('{value}', $v))
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { throw "nothing at $($step.plantFile)" }
        $before = Sha $f
        if ($before -ne $v) { throw 'the entry is not the expected picture' }
        $len = (Get-Item -LiteralPath $f).Length
        $fill = [Text.Encoding]::ASCII.GetBytes([string]$step.fill)
        $bytes = New-Object byte[] $len
        for ($k = 0; $k -lt $len; $k++) { $bytes[$k] = $fill[$k % $fill.Length] }
        [IO.File]::WriteAllBytes($f, $bytes)
        $item = Get-Item -LiteralPath $f
        $results.values[[string]$step.as] = [ordered]@{ rel = ($f.Substring($UdFull.Length + 1) -replace '\\', '/'); before = $before; bytes = $len; after = (Sha $f); after_bytes = $item.Length; after_mtime_utc = $item.LastWriteTimeUtc.ToString('o') }
      }
      elseif ($null -ne $step.moveAside) {
        # Moves only the planted TEST entry (its current bytes must be the planted ones), to a new name inside the profile.
        $entry.kind = 'moveAside'
        $v = Value-Of ([string]$step.fromValue)
        $f = Inside (([string]$step.moveAside).Replace('{value}', $v))
        $expect = $results.values[[string]$step.expectValue].after
        $before = Sha $f
        if ($before -ne $expect) { throw 'the entry is not the planted test entry' }
        $destDir = Inside ([string]$step.to)
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        $dest = Inside ((Join-Path ([string]$step.to) ((Split-Path $f -Leaf) + '.qa-bad')))
        if (Test-Path -LiteralPath $dest) { throw 'destination exists' }
        [IO.File]::Move($f, $dest)
        $results.values[[string]$step.as] = [ordered]@{ from = ($f.Substring($UdFull.Length + 1) -replace '\\', '/'); to = ($dest.Substring($UdFull.Length + 1) -replace '\\', '/'); before = $before; after = (Sha $dest); source_absent = -not (Test-Path -LiteralPath $f) }
      }
      elseif ($null -ne $step.copyTree) {
        $entry.kind = 'copyTree'
        $root = if ([string]$step.copyTree -eq 'apptemp') { if (-not $AppTemp) { throw 'no test temp folder' }; [IO.Path]::GetFullPath($AppTemp).TrimEnd('\') } else { $UdFull }
        $src = Inside ([string]$step.path) $root
        $dest = Join-Path $OutDir ('copy-' + [string]$step.to)
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        $entry.files = 0
        # Shared-delete reads (never blocking the app's atomic renames); its temporary files are not copied.
        if (Test-Path -LiteralPath $src) { Get-ChildItem -LiteralPath $src -File -Force | Where-Object { $_.Name -notlike '*.tmp' } | ForEach-Object {
            try { [IO.File]::WriteAllBytes((Join-Path $dest $_.Name), (Read-Shared $_.FullName)); $entry.files++ } catch { $entry.vanished++ } } }
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
  # A host pause never outlives the steps (the watcher also resumes on its own).
  try { Remove-Item -LiteralPath (Join-Path $OutDir 'host-pause.request') -Force -ErrorAction SilentlyContinue } catch { }
  # An app still running (for example after an aborted step) is asked to close itself first: its close ends a running
  # session gracefully, with the capture link's Stop, instead of being killed.
  if ($script:app -and -not $script:app.HasExited) { try { [void](Eval 'control' 'window.close(), true') } catch { } }
  foreach ($s in $sockets.Values) { try { $s.ws.Dispose() } catch { } }
  # The foreground wrapper releases only exact Electron/Edge launch identities.
  if ($script:app -and -not $script:app.HasExited) {
    # The app holds its quit while the capture link's Stop runs (bounded at 20 s); wait for that before any kill.
    $results.processes[$script:appKey].closed_in_finally = $true
    if (-not $script:app.WaitForExit(3000)) { $results.processes[$script:appKey].awaits_identity_cleanup = $true }
  }
  if ($script:app) { $results.processes[$script:appKey].exit_code = $(try { $script:app.ExitCode } catch { $null }) }
  $results.foreign.end = Foreign-Electron
  $results.wsl_seen = @($script:wslSeen.Keys | ForEach-Object { [ordered]@{ pid = [int]$_; running_at_end = [bool](Get-Process -Id ([int]$_) -ErrorAction SilentlyContinue) } })
  # The pointer goes back to where it was before the first OS click, also when the steps were cut short.
  if ($null -ne $script:cursorHome) { try { [void][QaWin]::SetCursorPos([int]$script:cursorHome[0], [int]$script:cursorHome[1]) } catch { } }
  $results.cursor.end = [QaWin]::Cursor()
  $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path (Join-Path $OutDir 'results.json')
}
