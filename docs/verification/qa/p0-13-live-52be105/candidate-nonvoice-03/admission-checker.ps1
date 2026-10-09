# QA source-admission checker for the nonvoice live candidate (P0-13, Support F3; Lead interface 4f7d9fa). Windows
# PowerShell 5.1. The product's main process starts it once per capture, at arm, from the pinned configuration the QA
# runner names in LC_SOURCE_ADMISSION, and talks JSONL on stdin/stdout (lc-source-admission/1, at most 4096 bytes a line).
#
# Every request gets a FRESH full native admission: the reviewed runner's Assert-QaSurfaceAdmission (fresh browser
# geometry, exact display and Edge bounds, foreground, 16 owned points, the owned Edge identity resolved twice), with
# the normal-band predicate read on the admitted window just before and after it, all with the runner's definitions
# inserted byte for byte below, against the frozen context the runner wrote just before the product launch (the owned
# Edge process, its surface page and window, the DevTools port, the admitted display). Nothing is cached as an allow.
# Besides its facts, a request carries no instruction: the checker runs no command, reads no pixels and never changes a
# window. A request whose facts do not follow the admitted lineage (arm, then pre/post acquisition, then send of an
# admitted frame) is denied; after one deny every later request is denied (main ends the whole capture). A malformed
# line ends the checker without a reply. Each decision is written to the QA log (metadata only) before it is answered.
# An OS change between two native observations remains possible: this is not an atomic guarantee.
param(
  [Parameter(Mandatory = $true)][string]$Context,
  [Parameter(Mandatory = $true)][string]$Log
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
# The protocol owns stdout: the raw stream is taken first, then anything the host itself would print goes to stderr.
$qaStrict = New-Object System.Text.UTF8Encoding($false, $true)
$qaProtocolOut = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
$qaProtocolOut.NewLine = "`n"
$qaProtocolOut.AutoFlush = $true
$qaProtocolIn = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $qaStrict, $false)
[Console]::SetOut([Console]::Error)

# ---- reviewed runner definitions, unchanged (qa_live_candidate.mjs checkerDefinitions) ----
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
  public static bool Raise(IntPtr h) { return Raise(h, true); }
  public static bool Raise(IntPtr h, bool pulseTopmost) {
    IntPtr fg = GetForegroundWindow(); uint ignored;
    uint fgThread = GetWindowThreadProcessId(fg, out ignored), me = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
    BringWindowToTop(h); SetForegroundWindow(h);
    if (attached) AttachThreadInput(me, fgThread, false);
    // (a window that is always-on-top already, as the app's overlay is, keeps that state: it is not touched here)
    if (pulseTopmost && ((long)GetWindowLongPtr(h, -20) & 0x8) == 0) {
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

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public sealed class QaEdgeScan {
  public IntPtr[] Matches;
  public IntPtr[] Unknown;
}
public static class QaEdgeSurface {
  private delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("kernel32.dll")] private static extern void SetLastError(uint code);
  public static bool IsOwned(IntPtr h, uint[] pids) {
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    return pid != 0 && Array.IndexOf(pids, pid) >= 0;
  }
  // 1 the caption carries the token, 2 it does not, 0 an empty caption, -1 unknown (failed, over 4096, changed while
  // read) for a window still of the given processes, -2 not (or no longer) a window of those processes: before any read
  // it is checked first, so nothing of another process is read.
  public static int Caption(IntPtr h, uint[] pids, string token) {
    if (!IsOwned(h, pids)) return -2;
    SetLastError(0);
    int n = GetWindowTextLength(h);
    if (n == 0) return Marshal.GetLastWin32Error() == 0 ? 0 : (IsOwned(h, pids) ? -1 : -2);
    if (n < 0 || n > 4096) return IsOwned(h, pids) ? -1 : -2;
    var s = new StringBuilder(n + 1);
    int r = GetWindowText(h, s, s.Capacity);
    if (!IsOwned(h, pids)) return -2;
    if (r != n || GetWindowTextLength(h) != n) return -1;
    return s.ToString().IndexOf(token, StringComparison.Ordinal) >= 0 ? 1 : 2;
  }
  public static QaEdgeScan Find(uint[] pids, string token) {
    var matches = new List<IntPtr>();
    var unknown = new List<IntPtr>();
    EnumProc each = (h, l) => {
      if (!IsWindowVisible(h) || !IsOwned(h, pids)) return true;
      int c = Caption(h, pids, token);
      if (c == 1) matches.Add(h);
      else if (c == -1) unknown.Add(h);
      return true;
    };
    if (!EnumWindows(each, IntPtr.Zero)) throw new InvalidOperationException("top-level windows could not be enumerated");
    GC.KeepAlive(each);
    return new QaEdgeScan { Matches = matches.ToArray(), Unknown = unknown.ToArray() };
  }
  // Every visible top-level window of the owned processes, for the receipt only.
  public static IntPtr[] OwnedWindows(uint[] pids) {
    var found = new List<IntPtr>();
    EnumProc each = (h, l) => {
      if (IsWindowVisible(h) && IsOwned(h, pids)) found.Add(h);
      return true;
    };
    if (!EnumWindows(each, IntPtr.Zero)) throw new InvalidOperationException("top-level windows could not be enumerated");
    GC.KeepAlive(each);
    return found.ToArray();
  }
}
'@

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public sealed class QaAdmissionMonitor {
  public string Device;
  public string Handle;
  public uint Flags;
  public int[] Bounds;
  public int[] Work;
}
public sealed class QaAdmissionDisplaySnapshot {
  public QaAdmissionMonitor[] Monitors;
  public uint Dpi;
}
public sealed class QaAdmissionWindowSnapshot {
  public int[] Bounds;
  public uint Owner;
  public bool Foreground;
}
public static class QaDisplayAdmissionNative {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MonitorInfo {
    public uint Size;
    public Rect Bounds;
    public Rect Work;
    public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device;
  }
  private delegate bool MonitorCallback(IntPtr monitor, IntPtr dc, ref Rect bounds, IntPtr data);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorCallback callback, IntPtr data);
  [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] private static extern uint GetDpiForSystem();
  [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint owner);
  private static int[] Coordinates(Rect r) { return new int[] { r.Left, r.Top, r.Right, r.Bottom }; }
  private static IntPtr EnterPhysicalCoordinates() {
    IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    if (previous == IntPtr.Zero) throw new InvalidOperationException("native DPI awareness unavailable");
    return previous;
  }
  private static void RestoreCoordinates(IntPtr previous) {
    if (SetThreadDpiAwarenessContext(previous) == IntPtr.Zero) throw new InvalidOperationException("native DPI awareness restoration failed");
  }
  public static QaAdmissionDisplaySnapshot ReadDisplays() {
    IntPtr previous = EnterPhysicalCoordinates();
    try {
      var monitors = new List<QaAdmissionMonitor>();
      string failure = null;
      MonitorCallback callback = delegate(IntPtr monitor, IntPtr dc, ref Rect bounds, IntPtr data) {
        // Never throw across the unmanaged callback boundary.
        try {
          var info = new MonitorInfo();
          info.Size = (uint)Marshal.SizeOf(typeof(MonitorInfo));
          if (monitor == IntPtr.Zero || !GetMonitorInfo(monitor, ref info)) { failure = "native monitor information unavailable"; return true; }
          if (bounds.Left != info.Bounds.Left || bounds.Top != info.Bounds.Top || bounds.Right != info.Bounds.Right || bounds.Bottom != info.Bounds.Bottom) {
            failure = "native monitor geometry changed during enumeration";
          }
          monitors.Add(new QaAdmissionMonitor { Device = info.Device, Handle = monitor.ToInt64().ToString(), Flags = info.Flags,
            Bounds = Coordinates(info.Bounds), Work = Coordinates(info.Work) });
        } catch (Exception) { failure = "native monitor metadata unavailable"; }
        return true;
      };
      if (!EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero)) throw new InvalidOperationException("native display enumeration failed");
      if (failure != null) throw new InvalidOperationException(failure);
      uint dpi = GetDpiForSystem();
      if (dpi == 0) throw new InvalidOperationException("native system DPI unavailable");
      return new QaAdmissionDisplaySnapshot { Monitors = monitors.ToArray(), Dpi = dpi };
    } finally { RestoreCoordinates(previous); }
  }
  public static QaAdmissionWindowSnapshot ReadWindow(IntPtr window) {
    IntPtr previous = EnterPhysicalCoordinates();
    try {
      Rect bounds;
      uint owner;
      if (window == IntPtr.Zero || !IsWindowVisible(window) || !GetWindowRect(window, out bounds)) throw new InvalidOperationException("owned window geometry unavailable");
      if (GetWindowThreadProcessId(window, out owner) == 0 || owner == 0) throw new InvalidOperationException("owned window identity unavailable");
      IntPtr foreground = GetForegroundWindow();
      if (foreground == IntPtr.Zero) throw new InvalidOperationException("foreground window unavailable");
      return new QaAdmissionWindowSnapshot { Bounds = Coordinates(bounds), Owner = owner, Foreground = foreground == window };
    } finally { RestoreCoordinates(previous); }
  }
}
'@

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public sealed class QaPlacementMetadata {
  public string Class;
  public bool Topmost;
  public bool Minimized;
}
public static class QaPlacementNative {
  [StructLayout(LayoutKind.Sequential)] private struct Rect { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] private struct Info {
    public uint Size; public Rect Window, Client;
    public uint Style, ExStyle, Status, BorderX, BorderY; public ushort Atom, Version;
  }
  [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowInfo(IntPtr window, ref Info info);
  [DllImport("user32.dll", EntryPoint = "GetClassNameW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetClassName(IntPtr window, StringBuilder value, int count);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  public static QaPlacementMetadata Read(IntPtr window) {
    var info = new Info(); info.Size = (uint)Marshal.SizeOf(typeof(Info));
    var name = new StringBuilder(256);
    if (window == IntPtr.Zero || !GetWindowInfo(window, ref info)) throw new InvalidOperationException("window style unavailable");
    int length = GetClassName(window, name, name.Capacity);
    if (length <= 0 || length >= name.Capacity - 1) throw new InvalidOperationException("window class unavailable");
    return new QaPlacementMetadata { Class = name.ToString(), Topmost = (info.ExStyle & 8) != 0, Minimized = IsIconic(window) };
  }
  public static bool Above(IntPtr window, IntPtr reference) {
    if (window == IntPtr.Zero || reference == IntPtr.Zero || window == reference) return false;
    IntPtr next = reference;
    for (int i = 0; i < 512; i++) {
      next = GetWindow(next, 3); // GW_HWNDPREV: read the top-level z-order, without titles/content.
      if (next == IntPtr.Zero) return false;
      if (next == window) return true;
    }
    throw new InvalidOperationException("window z-order observation exceeded its bound");
  }
  public static int[] ClientBounds(IntPtr window) {
    IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    if (previous == IntPtr.Zero) throw new InvalidOperationException("client DPI awareness unavailable");
    try {
      Rect r;
      if (!GetClientRect(window, out r)) throw new InvalidOperationException("client geometry unavailable");
      var start = new Point { X = r.L, Y = r.T }; var end = new Point { X = r.R, Y = r.B };
      if (!ClientToScreen(window, ref start) || !ClientToScreen(window, ref end)) throw new InvalidOperationException("client origin unavailable");
      uint dpi = GetDpiForWindow(window);
      if (dpi == 0) throw new InvalidOperationException("client DPI unavailable");
      return new int[] { start.X, start.Y, end.X, end.Y, (int)dpi };
    } finally {
      if (SetThreadDpiAwarenessContext(previous) == IntPtr.Zero) throw new InvalidOperationException("client DPI restoration failed");
    }
  }
}
'@

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

function Target-Url([string]$target) {
  if ($target -eq 'control') { return '/renderer/control.html' }
  if ($target -eq 'overlay') { return '/renderer/overlay.html' }
  return $null
}

function Get-Socket([string]$target) {
  if ($target -eq 'edge') { return Get-QaEdgeSocket }
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

function ConvertTo-QaUrlKey([string]$u) { return $u.ToLowerInvariant() }

function Get-QaEdgeSocket {
  if (-not $script:qaEdgeSurfaceUrl) { throw 'generated surface URL is not known' }
  $want = ConvertTo-QaUrlKey $script:qaEdgeSurfaceUrl
  $cached = $sockets['edge']
  $deadline = (Get-Date).AddSeconds(20)
  while ($true) {
    $pages = $null
    try { $pages = @(($client.DownloadString("http://127.0.0.1:$($script:edgePort)/json/list") | ConvertFrom-Json) | Where-Object { $_.type -eq 'page' }) } catch { $pages = $null }
    if ($null -ne $pages) {
      $match = @($pages | Where-Object { (ConvertTo-QaUrlKey ([string]$_.url)) -eq $want })
      if ($match.Count -gt 1) { throw 'generated surface DevTools target is ambiguous' }
      if ($match.Count -eq 1) { break }
      if ($cached) { throw 'generated surface DevTools target navigated or ended' }
    }
    if ((Get-Date) -gt $deadline) { throw 'no DevTools target for the generated surface' }
    Start-Sleep -Milliseconds 150
  }
  $t = $match[0]
  if ($cached) {
    if ([string]$cached.id -cne [string]$t.id) { throw 'generated surface DevTools target changed' }
    if ($cached.ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { throw 'generated surface DevTools connection closed' }
    return $cached.ws
  }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$t.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $sockets['edge'] = @{ ws = $ws; id = $t.id }
  return $ws
}

function Assert-QaEdgeSurfacePage($identity) {
  if ($null -eq $identity) { throw 'owned Edge surface identity is not established' }
  $p = $started['edge']
  if (-not $p -or $p.HasExited) { throw 'owned Edge has ended' }
  $socket = Get-QaEdgeSocket
  $expected = ConvertTo-Json -InputObject (ConvertTo-QaUrlKey $script:qaEdgeSurfaceUrl) -Compress
  $same = Eval 'edge' ("(() => location.href.toLowerCase() === " + $expected + " && typeof window.__qaSurfaceTruth === 'function' && document.title.endsWith(' ' + '" + [string]$identity.token + "'))()")
  if (-not ($same -is [bool] -and $same)) { throw 'generated surface page changed, navigated or lost its identity' }
  [void](Get-QaEdgeSocket)                                   # still the same single target after the read (it refuses otherwise)
  return $socket
}

function Get-QaOwnedEdgeIds($identity) {
  $p = $started['edge']
  if (-not $p) { throw 'owned Edge was not started' }
  if ($p.HasExited) { throw 'owned Edge has ended' }
  if ([uint32]$p.Id -ne $identity.pid -or $p.StartTime -ne $identity.start) { throw 'owned Edge identity changed' }
  $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | Where-Object { $_.CreationDate -and $_.CreationDate -ge $p.StartTime } | ForEach-Object { [uint32]$_.ProcessId })
  return @([uint32]$p.Id) + $kids
}

function Find-QaEdgeSurface($identity) {
  return [QaEdgeSurface]::Find([uint32[]]@(Get-QaOwnedEdgeIds $identity), [string]$identity.token)
}

function Get-QaEdgeSurfaceWindow {
  if ($null -eq $script:qaEdgeIdentity) { throw 'owned Edge surface identity is not established' }
  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)
  $scan = Find-QaEdgeSurface $script:qaEdgeIdentity
  if (@($scan.Unknown).Count -gt 0) { throw 'an owned Edge window caption could not be read: the surface window is unresolved' }
  $found = @($scan.Matches)
  if ($found.Count -eq 0) { throw 'owned generated surface window not found' }
  if ($found.Count -gt 1) { throw 'owned generated surface window is ambiguous' }
  if ($found[0] -ne $script:qaEdgeIdentity.handle) { throw 'owned generated surface window changed' }
  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)     # and still the same page after the window scan
  return $found[0]
}

function Window-Handle([string]$name) {
  if ($name -eq 'edge') { return Get-QaEdgeSurfaceWindow }
  if ($name -eq 'control') { return [QaWin]::Find(@([uint32]$script:app.Id), 'Learning Companion', $true) }
  if ($name -eq 'overlay') { return [QaWin]::Find(@([uint32]$script:app.Id), 'Learning Companion overlay', $true) }
  $p = $started[$name]
  if (-not $p) { throw "unknown window $name" }
  $pids = @([uint32]$p.Id) + @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" | ForEach-Object { [uint32]$_.ProcessId })
  return [QaWin]::Find($pids, $null, $false)
}

function New-QaAdmissionEvidence([string]$phase) {
  if (-not $phase -or $phase -notmatch '^[A-Za-z0-9_.:-]{1,80}$') { throw 'invalid display admission phase' }
  if ($null -eq $results -or $null -eq $results.values) { throw 'QA result storage unavailable' }
  $script:qaDisplayEvidenceSequence++
  $key = 'qa_display_admission_{0:D3}' -f $script:qaDisplayEvidenceSequence
  if ($results.values.Contains($key)) { throw 'QA display evidence key already exists' }
  $entry = [ordered]@{ phase = $phase; at = (Get-Date).ToUniversalTime().ToString('o'); accepted = $false }
  $results.values[$key] = $entry
  return $entry
}

function Read-QaDisplaySnapshot {
  # EnumDisplayMonitors and GetMonitorInfo are called anew; no Screen.AllScreens cache.
  $native = [QaDisplayAdmissionNative]::ReadDisplays()
  if ($null -eq $native -or $null -eq $native.Monitors -or @($native.Monitors).Count -ne 1) {
    throw 'native topology must contain exactly one known display'
  }
  $monitor = $native.Monitors[0]
  if ($null -eq $monitor -or $monitor.Device -notmatch '^\\\\\.\\DISPLAY[1-9][0-9]*$' -or -not $monitor.Handle -or $monitor.Handle -eq '0' -or $monitor.Flags -ne 1) {
    throw 'native primary display identity unavailable'
  }
  if (($monitor.Bounds -join ',') -ne '0,0,2560,1600' -or $native.Dpi -ne 192) { throw 'native display geometry or DPI is outside the admitted diagnostic' }
  $work = $monitor.Work
  if ($null -eq $work -or $work.Count -ne 4 -or $work[0] -lt 0 -or $work[1] -lt 0 -or $work[2] -gt 2560 -or $work[3] -gt 1600 -or $work[2] -le $work[0] -or $work[3] -le $work[1]) {
    throw 'native display work rectangle is malformed'
  }
  return [ordered]@{ count = 1; device = $monitor.Device; monitor_handle = $monitor.Handle; primary = $true;
    monitor_bounds = @($monitor.Bounds); work_bounds = @($work); dpi = $native.Dpi }
}

function Assert-QaDisplayBaseline($snapshot) {
  if ($null -eq $script:qaDisplayBaseline) { throw 'native display admission has not been initialized' }
  $signature = $snapshot | ConvertTo-Json -Depth 5 -Compress
  if ($signature -cne $script:qaDisplayBaselineSignature) { throw 'native topology, identity, geometry, work rectangle or DPI changed since admission' }
}

function Assert-QaSurfaceAdmission([string]$phase) {
  $entry = New-QaAdmissionEvidence $phase
  try {
    if ($null -eq $script:qaDisplayBaseline) { throw 'native display admission has not been initialized' }
    # Resolve sockets/process-backed handles before the fresh observations; these helpers can wait.
    $edgeSocket = Get-Socket 'edge'
    $window = Window-Handle 'edge'
    if ($window -eq [IntPtr]::Zero) { throw 'owned Edge window unavailable' }
    $entry.native_before = Read-QaDisplaySnapshot
    Assert-QaDisplayBaseline $entry.native_before
    $expression = @'
(() => {
  const g = { x: screenX, y: screenY, outer_width: outerWidth, outer_height: outerHeight,
    inner_width: innerWidth, inner_height: innerHeight, screen_width: screen.width, screen_height: screen.height, dpr: devicePixelRatio };
  if (g.x !== 0 || g.y !== 0 || g.outer_width !== 1280 || g.outer_height !== 800 || g.inner_width !== 1280 || g.inner_height !== 800 || g.screen_width !== 1280 || g.screen_height !== 800 || g.dpr !== 2) throw Error('fresh owned browser geometry changed');
  if (typeof window.__qaSurfaceTruth !== 'function') throw Error('generated surface truth unavailable');
  const truth = JSON.parse(window.__qaSurfaceTruth()), canvas = document.getElementById('surface');
  if (truth.format !== 'qa-subscription-surface/2' || truth.fits !== true || truth.full_screen !== true || !Array.isArray(truth.cards) || truth.cards.length !== 12 || !canvas || canvas.width !== 2560 || canvas.height !== 1600) throw Error('generated surface is incomplete');
  if (truth.viewport.width !== g.inner_width || truth.viewport.height !== g.inner_height || truth.viewport.dpr !== g.dpr || truth.viewport.screen[0] !== g.screen_width || truth.viewport.screen[1] !== g.screen_height) throw Error('generated surface truth geometry disagrees');
  truth.cards.forEach((card, i) => {
    const r = card.rect_dip;
    if (card.index !== i || !r || r.x !== 40 + i % 4 * 210 || r.y !== 90 + Math.floor(i / 4) * 170 || r.width !== 190 || r.height !== 150) throw Error('generated card geometry changed');
  });
  return JSON.stringify({ geometry: g, truth });
})()
'@
    $encoded = ConvertTo-Json -InputObject $expression -Compress
    $reply = Invoke-Cdp $edgeSocket 'Runtime.evaluate' ('{"expression":' + $encoded + ',"returnByValue":true,"awaitPromise":true}')
    if ($null -eq $reply -or $reply.error -or $reply.result.exceptionDetails -or $reply.result.result.type -ne 'string') { throw 'fresh browser geometry evaluation failed' }
    $entry.browser = $reply.result.result.value | ConvertFrom-Json
    $state = [QaDisplayAdmissionNative]::ReadWindow($window)
    if (-not $state.Foreground -or ($state.Bounds -join ',') -ne '0,0,2560,1600') { throw 'owned foreground window does not cover the admitted display' }
    $entry.window = [ordered]@{ handle = $window.ToInt64().ToString(); owner = $state.Owner; bounds = @($state.Bounds); foreground = $state.Foreground }
    $points = @()
    for ($card = 0; $card -lt 12; $card++) { $points += ,@(((40 + $card % 4 * 210 + 95) * 2), ((90 + [Math]::Floor($card / 4) * 170 + 75) * 2)) }
    $points += ,@(20, 20); $points += ,@(2540, 20); $points += ,@(20, 1580); $points += ,@(2540, 1580)
    $entry.owned_points = 0
    foreach ($point in $points) {
      if ([QaWin]::RootAt([int]$point[0], [int]$point[1]) -ne $window) { throw 'owned surface lost at a required card or corner point' }
      $entry.owned_points++
    }
    # Re-resolve ownership and foreground after CDP/point checks, before the final fresh metadata.
    if ((Window-Handle 'edge') -ne $window) { throw 'owned Edge window changed during admission' }
    $lastWindow = [QaDisplayAdmissionNative]::ReadWindow($window)
    if ($lastWindow.Owner -ne $state.Owner -or -not $lastWindow.Foreground -or ($lastWindow.Bounds -join ',') -ne '0,0,2560,1600') { throw 'owned window identity, position or foreground changed during admission' }
    $entry.native_final = Read-QaDisplaySnapshot
    Assert-QaDisplayBaseline $entry.native_final
    $entry.accepted = $true
  } catch { $entry.error = $_.Exception.Message; throw }
}
# ---- end of reviewed definitions ----

# The state the reviewed helpers read (as the runner holds it), rebuilt from the frozen context only.
$client = New-Object System.Net.WebClient
$client.Proxy = $null   # loopback only; never route a debugging port through a proxy
$sockets = @{}
$started = @{}
$results = @{ values = [ordered]@{} }
$script:nextId = 0
$script:qaDisplayEvidenceSequence = 0

$qaSafe = 9007199254740991
function Test-QaCheckerCount($v, [long]$min) { return ($v -is [int] -or $v -is [long]) -and $v -ge $min -and $v -le $qaSafe }
function Test-QaCheckerHex($v, [int]$n) { return $v -is [string] -and $v -cmatch ('^[0-9a-f]{' + $n + '}\z') }
function Get-QaCheckerNames($o) {
  [string[]]$names = @($o.PSObject.Properties | ForEach-Object { $_.Name })
  [Array]::Sort($names, [StringComparer]::Ordinal)
  return $names -join ','
}
function Test-QaCheckerAnySet($r, [string[]]$names) { foreach ($n in $names) { if ($null -ne $r.$n) { return $true } }; return $false }
function Test-QaCheckerObject($v) { return $v -is [System.Management.Automation.PSCustomObject] }
# A short reason with printable ASCII only; a file path or URL that an exception message may name is replaced (reasons
# reach main's log and QA's evidence: no path, command or pixel data).
function Get-QaCheckerReason([string]$text) {
  $clean = ($text -replace '[^\x20-\x7E]', ' ' -replace '(?i)file:/{2,3}[^\s''"]*', '<url>' -replace '(?i)(?<![a-z])[a-z]:\\[^\s''"]*', '<path>' -replace '\\\\[^\s''"]+', '<path>').Trim()
  if ($clean.Length -gt 300) { $clean = $clean.Substring(0, 300) }
  if (-not $clean) { $clean = 'denied' }
  return $clean
}

function Read-QaCheckerContext([string]$path) {
  $c = [System.IO.File]::ReadAllText($path, $qaStrict) | ConvertFrom-Json
  if (-not (Test-QaCheckerObject $c) -or (Get-QaCheckerNames $c) -cne 'display_signature,edge_pid,edge_port,edge_start_ticks,format,handle,surface_url,token') { throw 'admission context fields differ' }
  if ($c.format -cne 'lc-qa-admission-context/1') { throw 'admission context format differs' }
  if (-not (Test-QaCheckerCount $c.edge_pid 1) -or $c.edge_pid -gt [uint32]::MaxValue) { throw 'admission context Edge process is malformed' }
  if (-not ($c.edge_start_ticks -is [string] -and $c.edge_start_ticks -cmatch '^[1-9][0-9]{0,18}\z')) { throw 'admission context Edge start is malformed' }
  if (-not ($c.token -is [string] -and $c.token -cmatch '^lcqa[g-v]{32}\z')) { throw 'admission context surface token is malformed' }
  if (-not ($c.handle -is [string] -and $c.handle -cmatch '^[1-9][0-9]{0,18}\z')) { throw 'admission context window is malformed' }
  if (-not ($c.surface_url -is [string] -and $c.surface_url.StartsWith('file:///', [StringComparison]::Ordinal) -and -not $c.surface_url.Contains('%'))) { throw 'admission context surface URL is malformed' }
  if (-not (Test-QaCheckerCount $c.edge_port 1024) -or $c.edge_port -gt 65535) { throw 'admission context DevTools port is malformed' }
  if (-not ($c.display_signature -is [string] -and $c.display_signature.StartsWith('{', [StringComparison]::Ordinal))) { throw 'admission context display is malformed' }
  return $c
}

function Write-QaCheckerLog($record) {
  $record.at = (Get-Date).ToUniversalTime().ToString('o')
  $qaLogWriter.WriteLine(($record | ConvertTo-Json -Compress -Depth 6))
}

$qaReqNames = 'capture_id,display,format,frame_seq,id,image_sha256,phase,raw_sha256,raw_size,request_id,sample_seq,sent_at,seq'
# The facts of one well-formed request against the lineage admitted so far: $null when they follow it, else the reason.
function Get-QaCheckerLineageFault($r, $state) {
  if ($r.phase -ceq 'arm') {
    if ($state.armed -or $state.count -ne 1) { return 'arm must be the first and only arm request' }
    if (Test-QaCheckerAnySet $r @('sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256')) { return 'arm carries only display and capture facts' }
    $d = $r.display
    # The main-owned display id: a decimal string, as the product keeps it (52be105 display_id, the capture source's
    # display_id string), or the same number; echoed unchanged either way.
    $idOk = ($d.id -is [string] -and $d.id -cmatch '^[0-9]{1,20}\z') -or (Test-QaCheckerCount $d.id 0)
    if (-not (Test-QaCheckerObject $d) -or (Get-QaCheckerNames $d) -cne 'bounds,id,scale_factor' -or -not $idOk) { return 'arm display is malformed' }
    $b = $d.bounds
    if (-not (Test-QaCheckerObject $b) -or (Get-QaCheckerNames $b) -cne 'height,width,x,y') { return 'arm display bounds are malformed' }
    # The admitted display in DIP: the frozen native bounds over the frozen system scale.
    $base = $script:qaDisplayBaseline
    $scale = [int]$base.dpi / 96
    foreach ($k in @('x', 'y', 'width', 'height')) { if (-not ($b.$k -is [int] -or $b.$k -is [long])) { return 'arm display bounds are not whole numbers' } }
    if ($b.x -ne $base.monitor_bounds[0] / $scale -or $b.y -ne $base.monitor_bounds[1] / $scale -or $b.width -ne ($base.monitor_bounds[2] - $base.monitor_bounds[0]) / $scale -or $b.height -ne ($base.monitor_bounds[3] - $base.monitor_bounds[1]) / $scale) { return 'arm display is not the admitted display' }
    if (-not ($d.scale_factor -is [int] -or $d.scale_factor -is [long] -or $d.scale_factor -is [decimal] -or $d.scale_factor -is [double]) -or $d.scale_factor -ne $scale) { return 'arm display scale is not the admitted scale' }
    return $null
  }
  if (-not $state.armed) { return 'no admitted arm for this capture' }
  if ($r.capture_id -cne $state.capture) { return 'another capture' }
  if ($null -ne $r.display) { return 'only arm carries a display' }
  if (-not (Test-QaCheckerCount $r.sample_seq 1)) { return 'sample sequence is malformed' }
  if ($r.phase -ceq 'pre_acquire') {
    if (Test-QaCheckerAnySet $r @('frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256')) { return 'pre_acquire carries no acquired frame or request' }
    if ($r.sample_seq -le $state.last_sample) { return 'sample sequence did not increase' }
    return $null
  }
  if (-not (Test-QaCheckerCount $r.frame_seq 1) -or -not (Test-QaCheckerHex $r.raw_sha256 64)) { return 'acquired frame facts are malformed' }
  $z = $r.raw_size
  if (-not (Test-QaCheckerObject $z) -or (Get-QaCheckerNames $z) -cne 'height,width' -or -not (Test-QaCheckerCount $z.width 1) -or -not (Test-QaCheckerCount $z.height 1)) { return 'acquired frame size is malformed' }
  $frame = '{0}|{1}|{2}|{3}x{4}' -f $r.sample_seq, $r.frame_seq, $r.raw_sha256, $z.width, $z.height
  if ($r.phase -ceq 'post_acquire') {
    if (Test-QaCheckerAnySet $r @('request_id', 'image_sha256')) { return 'post_acquire carries no request' }
    if (-not $state.pending.Contains([string]$r.sample_seq)) { return 'post_acquire names no admitted pre_acquire' }
    return $null
  }
  # send: an admitted acquisition, a new request, the exact PNG named.
  if (-not $state.admitted.Contains($frame)) { return 'send names no admitted acquisition' }
  if (-not ($r.request_id -is [string]) -or $r.request_id.Length -lt 1 -or $r.request_id.Length -gt 128 -or $r.request_id -cmatch '[\x00-\x1F\x7F]') { return 'request identity is malformed' }
  if ($state.sent.Contains([string]$r.request_id)) { return 'this request was already admitted for sending' }
  if (-not (Test-QaCheckerHex $r.image_sha256 64)) { return 'sent image hash is malformed' }
  return $null
}

# ---- start: the frozen context, the owned Edge as it was frozen, the log; then ready ----
try {
  $qaContext = Read-QaCheckerContext $Context
  $edgeProcess = [System.Diagnostics.Process]::GetProcessById([int]$qaContext.edge_pid)
  if ($edgeProcess.HasExited -or $edgeProcess.StartTime.Ticks -ne [long]$qaContext.edge_start_ticks) { throw 'owned Edge identity changed' }
  $started['edge'] = $edgeProcess
  $script:edgePort = [int]$qaContext.edge_port
  $script:qaEdgeSurfaceUrl = [string]$qaContext.surface_url
  $script:qaEdgeIdentity = [ordered]@{ token = [string]$qaContext.token; pid = [uint32]$edgeProcess.Id; start = $edgeProcess.StartTime; handle = [IntPtr][long]$qaContext.handle }
  $script:qaDisplayBaselineSignature = [string]$qaContext.display_signature
  $script:qaDisplayBaseline = $script:qaDisplayBaselineSignature | ConvertFrom-Json
  if ($null -eq $script:qaDisplayBaseline -or $script:qaDisplayBaseline.dpi -isnot [int] -or @($script:qaDisplayBaseline.monitor_bounds).Count -ne 4) { throw 'admission context display is malformed' }
  $qaLogStream = New-Object System.IO.FileStream($Log, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  $qaLogWriter = New-Object System.IO.StreamWriter($qaLogStream, (New-Object System.Text.UTF8Encoding($false)))
  $qaLogWriter.AutoFlush = $true
  # Read-only warm-up within the ready bound (process listing, the DevTools connection to the surface page), so the first
  # decision is not spent on start-up; it decides nothing.
  $null = Get-QaOwnedEdgeIds $script:qaEdgeIdentity
  $null = Get-QaEdgeSocket
  Write-QaCheckerLog ([ordered]@{ event = 'ready'; edge_pid = [int]$edgeProcess.Id; edge_port = $script:edgePort })
  $qaProtocolOut.WriteLine('{"format":"lc-source-admission/1","ready":true}')
} catch {
  [Console]::Error.WriteLine('lc-source-admission checker unavailable: ' + (Get-QaCheckerReason $_.Exception.Message))
  exit 1
}

# ---- the finite loop: one request at a time until EOF, the lifetime bound or the request bound ----
$qaDeadline = [DateTime]::UtcNow.AddSeconds(1800)
$qaState = @{ armed = $false; capture = $null; count = 0; last_seq = 0; last_sample = 0; denied = $null
  pending = New-Object 'System.Collections.Generic.HashSet[string]'; admitted = New-Object 'System.Collections.Generic.HashSet[string]'
  ids = New-Object 'System.Collections.Generic.HashSet[string]'; sent = New-Object 'System.Collections.Generic.HashSet[string]' }
while ($true) {
  $left = ($qaDeadline - [DateTime]::UtcNow).TotalMilliseconds
  if ($left -le 0) { try { Write-QaCheckerLog ([ordered]@{ event = 'lifetime_bound' }) } catch { }; exit 3 }
  $read = $qaProtocolIn.ReadLineAsync()
  if (-not $read.Wait([int][Math]::Min($left, 2147483647))) { try { Write-QaCheckerLog ([ordered]@{ event = 'lifetime_bound' }) } catch { }; exit 3 }
  $line = $read.Result
  if ($null -eq $line) { try { Write-QaCheckerLog ([ordered]@{ event = 'eof'; requests = $qaState.count }) } catch { }; exit 0 }
  $received = (Get-Date).ToUniversalTime().ToString('o')
  # Well-formed: one JSON object of at most 4096 bytes with exactly the request fields, each of its kind. Anything else
  # ends the checker without a reply (main ends the capture).
  $r = $null
  $fault = $null
  if ($qaStrict.GetByteCount($line) -gt 4096) { $fault = 'request line too long' }
  else { try { $r = $line | ConvertFrom-Json } catch { $fault = 'request is not JSON' } }
  if (-not $fault -and (-not (Test-QaCheckerObject $r) -or (Get-QaCheckerNames $r) -cne $qaReqNames)) { $fault = 'request fields differ' }
  # (PowerShell continues a condition only after an operator at a line's end, never before one at the next line's start.)
  if (-not $fault -and ($r.format -cne 'lc-source-admission/1' -or -not (Test-QaCheckerHex $r.id 32) -or -not (Test-QaCheckerCount $r.seq 1) -or
      @('arm', 'pre_acquire', 'post_acquire', 'send') -cnotcontains $r.phase -or -not (Test-QaCheckerHex $r.capture_id 16) -or
      -not ($r.sent_at -is [string] -and $r.sent_at -cmatch '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z\z'))) { $fault = 'request facts are malformed' }
  if ($fault) { try { Write-QaCheckerLog ([ordered]@{ event = 'malformed'; reason = $fault }) } catch { }; exit 2 }
  $qaState.count++
  # The decision: replay and order first, then the lineage, then the fresh full admission; a deny latches.
  $verdict = 'deny'
  $reason = $null
  $admission = $null
  if ($null -ne $qaState.denied) { $reason = 'an earlier decision denied this capture' }
  elseif ($qaState.count -gt 4096) { $reason = 'the checker request bound is reached' }
  elseif (-not $qaState.ids.Add([string]$r.id)) { $reason = 'request identity replayed' }
  elseif ($r.seq -le $qaState.last_seq) { $reason = 'request sequence did not increase' }
  else {
    $reason = Get-QaCheckerLineageFault $r $qaState
    if ($null -eq $reason) {
      $results.values = [ordered]@{}
      # The reviewed admission resolves and re-resolves the owned Edge window itself (two full identity resolutions, the
      # measured bulk of a decision: about 1.5 s each in the accepted diagnostic). The normal window band (not topmost,
      # not minimized; Assert-QaNormalEdge's predicate) is read on that same frozen window just before and just after it,
      # with the reviewed native read and no further resolution.
      try {
        $before = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)
        if ($before.Topmost -or $before.Minimized) { throw 'owned Edge must remain visible in the normal window band' }
        $null = Assert-QaSurfaceAdmission ('checker_' + $r.phase)
        $after = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)
        if ($after.Topmost -or $after.Minimized) { throw 'owned Edge must remain visible in the normal window band' }
      } catch { $reason = 'source admission refused: ' + $_.Exception.Message }
      $admission = @($results.values.Values) | Select-Object -First 1
      if ($null -eq $reason -and -not ($null -ne $admission -and $admission.accepted -eq $true)) { $reason = 'source admission did not complete' }
    }
  }
  if ($r.seq -gt $qaState.last_seq) { $qaState.last_seq = $r.seq }
  if ($null -eq $reason) {
    $verdict = 'allow'
    switch -CaseSensitive ($r.phase) {
      'arm' { $qaState.armed = $true; $qaState.capture = [string]$r.capture_id }
      'pre_acquire' { $qaState.last_sample = $r.sample_seq; $null = $qaState.pending.Add([string]$r.sample_seq) }
      'post_acquire' { $null = $qaState.pending.Remove([string]$r.sample_seq); $null = $qaState.admitted.Add(('{0}|{1}|{2}|{3}x{4}' -f $r.sample_seq, $r.frame_seq, $r.raw_sha256, $r.raw_size.width, $r.raw_size.height)) }
      'send' { $null = $qaState.sent.Add([string]$r.request_id) }
    }
  } else {
    $reason = Get-QaCheckerReason $reason
    if ($null -eq $qaState.denied) { $qaState.denied = $reason }
  }
  # Logged before it is answered: an unlogged decision is never an allow.
  try {
    Write-QaCheckerLog ([ordered]@{ event = 'decision'; seq = $r.seq; id = $r.id; phase = $r.phase; capture_id = $r.capture_id; sample_seq = $r.sample_seq; frame_seq = $r.frame_seq
      raw_sha256 = $r.raw_sha256; raw_size = $r.raw_size; request_id = $r.request_id; image_sha256 = $r.image_sha256; sent_at = $r.sent_at; received_at = $received; verdict = $verdict; reason = $reason
      admission = $(if ($null -ne $admission) { [ordered]@{ phase = $admission.phase; at = $admission.at; accepted = $admission.accepted; error = $admission.error; owned_points = $admission.owned_points; window = $admission.window } } else { $null }) })
  } catch {
    if ($verdict -ceq 'allow') { $verdict = 'deny'; $reason = 'the checker evidence log is unavailable'; $qaState.denied = $reason }
  }
  $reply = [ordered]@{ format = $r.format; id = $r.id; seq = $r.seq; phase = $r.phase; capture_id = $r.capture_id; display = $r.display; sample_seq = $r.sample_seq; frame_seq = $r.frame_seq
    raw_sha256 = $r.raw_sha256; raw_size = $r.raw_size; request_id = $r.request_id; image_sha256 = $r.image_sha256; verdict = $verdict; reason = $reason }
  $out = $reply | ConvertTo-Json -Compress -Depth 5
  if ($qaStrict.GetByteCount($out) -gt 4096) { try { Write-QaCheckerLog ([ordered]@{ event = 'reply_too_long'; seq = $r.seq }) } catch { }; exit 2 }
  try { $qaProtocolOut.WriteLine($out) } catch { exit 4 }
}
