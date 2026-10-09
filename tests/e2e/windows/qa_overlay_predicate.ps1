# The ONE exact-overlay predicate (Lead decisions handoff_1698eb17 and handoff_e893ca27; Support review 5083814).
# UNVERIFIED: nothing here has run natively; Support reviewed the design's premises, not its execution.
# Inserted unchanged into QA's source-admission checker and into the runner (qa_live_candidate.mjs), so every point and
# foreground consumer applies the same rule:
# - The product's full-display overlay is topmost and excluded from capture; outside NAV it takes input, so the window
#   under a point (or the foreground) can be that overlay instead of Edge.
# - ONLY the exact overlay of the current capture may stand in front of the admitted Edge: the HWND that main named at
#   arm, owned by the launched product (PID and creation frozen at launch), bound for the capture's lifetime, never
#   rebound. At every use it must still have its class, title, exact display bounds, be shown, topmost, not cloaked, and
#   positively excluded from capture (WDA_EXCLUDEFROMCAPTURE read successfully).
# - During the capture, at every point, the windows drawn above the admitted Edge (the whole top-level z-order from the
#   top down to Edge: visible, not minimized, not cloaked, holding the point) must be exactly that bound overlay, also
#   while it is click-through (NAV): hit-testing skips click-through windows, the capture does not.
# - As foreground it is accepted only with Edge at the top of the normal band.
# - Before a capture is armed there is no binding, and the reviewed hit-test rule applies unchanged.
# Read-only: nothing is moved, hidden, raised, closed or signalled. Any other window, any unreadable or changed fact,
# refuses. An OS change between native observations remains possible (no compositor atomicity).
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public sealed class QaOverlayFacts {
  public IntPtr Handle; public uint Owner; public string Class; public string Title; public int[] Bounds;
  public bool Visible; public bool Minimized; public bool Topmost; public uint Affinity; public int Cloaked;
}
public sealed class QaStackWindow { public IntPtr Window; public uint Owner; public string Class; }
public static class QaOverlayNative {
  [StructLayout(LayoutKind.Sequential)] private struct Rect { public int L, T, R, B; }
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll", EntryPoint = "GetClassNameW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint = "GetWindowTextLengthW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", EntryPoint = "GetWindowTextW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)] private static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowDisplayAffinity(IntPtr h, out uint affinity);
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetTopWindow(IntPtr parent);
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);
  [DllImport("kernel32.dll")] private static extern void SetLastError(uint code);
  private static IntPtr Physical() {
    IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    if (previous == IntPtr.Zero) throw new InvalidOperationException("native DPI awareness unavailable");
    return previous;
  }
  private static void Restore(IntPtr previous) {
    if (SetThreadDpiAwarenessContext(previous) == IntPtr.Zero) throw new InvalidOperationException("native DPI awareness restoration failed");
  }
  // DWMWA_CLOAKED (14): nonzero when the window is not drawn (another virtual desktop, a suspended app frame).
  private static int CloakOf(IntPtr h) {
    int value;
    if (DwmGetWindowAttribute(h, 14, out value, 4) != 0) throw new InvalidOperationException("window cloak state unavailable");
    return value;
  }
  private static string ClassOf(IntPtr h) {
    var name = new StringBuilder(256);
    int n = GetClassName(h, name, name.Capacity);
    if (n <= 0 || n >= name.Capacity - 1) throw new InvalidOperationException("window class unavailable");
    return name.ToString();
  }
  // GW_HWNDNEXT (2) / GW_HWNDPREV (3); a failed step throws (the end of the z-order is Zero with no error).
  private static IntPtr Step(IntPtr h, uint command) {
    SetLastError(0);
    IntPtr next = GetWindow(h, command);
    if (next == IntPtr.Zero && Marshal.GetLastWin32Error() != 0) throw new InvalidOperationException("window z-order walk failed");
    return next;
  }
  private static bool TopmostOf(IntPtr h) {
    SetLastError(0);
    IntPtr ex = GetWindowLongPtr(h, -20);
    if (ex == IntPtr.Zero && Marshal.GetLastWin32Error() != 0) throw new InvalidOperationException("window style unavailable");
    return (ex.ToInt64() & 8) != 0;
  }
  // The facts of a window, read only when it belongs to `owner` (the owner is read first and again last: nothing of
  // another process is read, and a window that changed owner while read is refused).
  public static QaOverlayFacts Read(IntPtr h, uint owner) {
    IntPtr previous = Physical();
    try {
      uint pid;
      if (h == IntPtr.Zero || GetWindowThreadProcessId(h, out pid) == 0 || pid == 0) throw new InvalidOperationException("window owner unavailable");
      var f = new QaOverlayFacts { Handle = h, Owner = pid };
      if (pid != owner) return f;
      f.Visible = IsWindowVisible(h);
      f.Minimized = IsIconic(h);
      Rect r;
      if (!GetWindowRect(h, out r)) throw new InvalidOperationException("window geometry unavailable");
      f.Bounds = new int[] { r.L, r.T, r.R, r.B };
      f.Class = ClassOf(h);
      SetLastError(0);
      int t = GetWindowTextLength(h);
      if (t < 0 || t > 512 || (t == 0 && Marshal.GetLastWin32Error() != 0)) throw new InvalidOperationException("window caption unavailable");
      var title = new StringBuilder(t + 1);
      if (GetWindowText(h, title, title.Capacity) != t || GetWindowTextLength(h) != t) throw new InvalidOperationException("window caption changed while read");
      f.Title = title.ToString();
      f.Topmost = TopmostOf(h);
      uint affinity;
      if (!GetWindowDisplayAffinity(h, out affinity)) throw new InvalidOperationException("window capture exclusion unavailable");
      f.Affinity = affinity;
      f.Cloaked = CloakOf(h);
      uint again;
      if (GetWindowThreadProcessId(h, out again) == 0 || again != pid) throw new InvalidOperationException("window owner changed while read");
      return f;
    } finally { Restore(previous); }
  }
  // Every window drawn above `target` at the physical point: the top-level z-order from the top down to `target`, each
  // visible, not minimized, not cloaked window whose rectangle holds the point (with its owner and class, metadata
  // only). A `target` not met in the walk, or any unreadable state, throws (never "nothing there").
  public static QaStackWindow[] StackAbove(IntPtr target, int x, int y) {
    IntPtr previous = Physical();
    try {
      var found = new System.Collections.Generic.List<QaStackWindow>();
      SetLastError(0);
      IntPtr h = GetTopWindow(IntPtr.Zero);
      if (h == IntPtr.Zero) throw new InvalidOperationException("window z-order unavailable");
      for (int i = 0; i < 4096; i++) {
        if (h == IntPtr.Zero) throw new InvalidOperationException("the admitted window is not in the z-order");
        if (h == target) return found.ToArray();
        if (IsWindowVisible(h) && !IsIconic(h)) {
          Rect r;
          if (!GetWindowRect(h, out r)) throw new InvalidOperationException("a window above the admitted one could not be read");
          if (x >= r.L && x < r.R && y >= r.T && y < r.B && CloakOf(h) == 0) {
            uint pid;
            if (GetWindowThreadProcessId(h, out pid) == 0 || pid == 0) throw new InvalidOperationException("the owner of a window above the admitted one is unavailable");
            found.Add(new QaStackWindow { Window = h, Owner = pid, Class = ClassOf(h) });
          }
        }
        h = Step(h, 2);
      }
      throw new InvalidOperationException("window z-order walk exceeded its bound");
    } finally { Restore(previous); }
  }
  // The first drawn window above `window` in the normal (not topmost) band: visible, not minimized, not cloaked. Window
  // Zero when the walk reaches the topmost band or the top first, i.e. `window` is the top of the normal band.
  public static QaStackWindow AboveInNormalBand(IntPtr window) {
    IntPtr previous = Physical();
    try {
      IntPtr h = window;
      for (int i = 0; i < 1024; i++) {
        h = Step(h, 3);
        if (h == IntPtr.Zero || TopmostOf(h)) return new QaStackWindow { Window = IntPtr.Zero };
        if (!IsWindowVisible(h) || IsIconic(h) || CloakOf(h) != 0) continue;
        uint pid;
        if (GetWindowThreadProcessId(h, out pid) == 0 || pid == 0) throw new InvalidOperationException("the owner of a window above the admitted one is unavailable");
        return new QaStackWindow { Window = h, Owner = pid, Class = ClassOf(h) };
      }
      throw new InvalidOperationException("window z-order walk exceeded its bound");
    } finally { Restore(previous); }
  }
}
'@

# Pure (fixture-testable): why the main-named arm overlay cannot be bound ($null when it can): the launched product's
# PID, a positive decimal HWND, the window owned by that PID, with the overlay's class and title.
function Get-QaOverlayBindingFault($named, [uint32]$appPid, $facts, $expect) {
  if ($null -eq $named -or $null -eq $named.pid -or $null -eq $named.hwnd) { return 'main named no overlay at arm' }
  if (-not ($named.hwnd -is [string] -and $named.hwnd -cmatch '^[1-9][0-9]{0,19}\z')) { return 'the named overlay handle is malformed' }
  if (-not ($named.pid -is [int] -or $named.pid -is [long]) -or $named.pid -ne $appPid) { return 'the named overlay is not of the launched product' }
  if ($null -eq $facts) { return 'the named overlay could not be read' }
  if ($facts.Owner -ne $appPid) { return 'the named overlay window belongs to another process' }
  if ($facts.Class -cne $expect.class -or $facts.Title -cne $expect.title) { return 'the named window is not the product overlay' }
  return $null
}
# Pure: why the bound overlay's current facts are not the exact overlay ($null when they are).
function Get-QaOverlayFault($f, $expect) {
  if ($null -eq $f) { return 'the covering window could not be read' }
  if ($f.Owner -ne $expect.owner) { return 'a window of another process covers the surface' }
  if ($f.Class -cne $expect.class -or $f.Title -cne $expect.title) { return 'a product window other than the overlay covers the surface' }
  if (-not $f.Visible -or $f.Minimized) { return 'the overlay is not shown' }
  if (-not $f.Topmost) { return 'the overlay is not topmost' }
  if ((@($f.Bounds) -join ',') -cne $expect.bounds) { return 'the overlay does not cover exactly the admitted display' }
  if ($f.Affinity -ne 17) { return 'the overlay is not excluded from capture (WDA_EXCLUDEFROMCAPTURE)' }
  if ($f.Cloaked -ne 0) { return 'the overlay is cloaked' }
  return $null
}
# Pure: during the capture, the windows drawn above the admitted Edge at a point must be exactly the bound overlay:
# one observed entry "handle/owner/class" equal to the binding's "handle/pid/class" (the handle alone is not enough).
function Get-QaStackFault([string[]]$above, [string]$overlay, [string]$what) {
  if (-not $overlay -or @($above).Count -ne 1 -or $above[0] -cne $overlay) { return ('the windows above the owned Edge are not exactly the bound overlay' + $(if ($what) { ' (' + $what + ')' } else { '' })) }
  return $null
}
function Get-QaStackEntry($window) { return ('{0}/{1}/{2}' -f $window.Window.ToInt64(), $window.Owner, $window.Class) }
# Pure: with the overlay as foreground, nothing drawn may stand above Edge in the normal band.
function Get-QaNormalTopFault([string]$above, [string]$what) {
  if ($above -and $above -cne '0') { return ('the owned Edge is not the top of the normal band' + $(if ($what) { ' (' + $what + ')' } else { '' })) }
  return $null
}
function Get-QaOverlayReason([string]$text) {
  $clean = ($text -replace '[^\x20-\x7E]', ' ' -replace '(?i)file:/{2,3}[^\s''"]*', '<url>' -replace '(?i)(?<![a-z])[a-z]:\\[^\s''"]*', '<path>' -replace '\\\\[^\s''"]+', '<path>').Trim()
  if ($clean.Length -gt 300) { $clean = $clean.Substring(0, 300) }
  return $clean
}
# What the product's overlay must be: the class, title and full display bounds the accepted diagnostic recorded for it.
function New-QaOverlayExpect([uint32]$appPid, $monitorBounds) {
  return @{ owner = $appPid; class = 'Chrome_WidgetWin_1'; title = 'Learning Companion overlay'; bounds = (@($monitorBounds) -join ',') }
}
# The binding, frozen for the capture: the launched product (PID, native creation ticks) and the HWND main named at arm.
function New-QaOverlayBinding($named, [uint32]$appPid, [long]$appStartTicks, $appProcess, $expect) {
  if ($null -eq $appProcess -or $appProcess.HasExited -or $appProcess.StartTime.Ticks -ne $appStartTicks -or [uint32]$appProcess.Id -ne $appPid) { throw 'the launched product ended or changed' }
  $facts = $null
  if ($null -ne $named -and $named.hwnd -is [string] -and $named.hwnd -cmatch '^[1-9][0-9]{0,19}\z') { $facts = [QaOverlayNative]::Read([IntPtr][long]$named.hwnd, $appPid) }
  $fault = Get-QaOverlayBindingFault $named $appPid $facts $expect
  if ($null -ne $fault) { throw $fault }
  return @{ hwnd = [IntPtr][long]$named.hwnd; hwnd_text = [string]$named.hwnd; pid = $appPid; start_ticks = $appStartTicks; process = $appProcess; expect = $expect }
}
# The bound overlay as it is now ($null when it is still the exact overlay; else the reason).
function Get-QaOverlayStateFault($binding) {
  if ($binding.process.HasExited -or $binding.process.StartTime.Ticks -ne $binding.start_ticks) { return 'the launched product ended or changed' }
  return Get-QaOverlayFault ([QaOverlayNative]::Read($binding.hwnd, [uint32]$binding.pid)) $binding.expect
}
# One required point. Before a capture is armed (no binding): the reviewed rule, the top-level window under the point is
# the admitted Edge. During the capture: that window is Edge or the bound overlay, the overlay is still exactly itself,
# and the windows drawn above Edge at the point are exactly that overlay.
function Test-QaPointAdmitted([IntPtr]$root, [IntPtr]$edge, [int]$x, [int]$y, $binding, $entry) {
  if ($null -eq $binding) { return ($root -eq $edge) }
  try {
    $fault = $null
    if ($root -ne $edge -and $root -ne $binding.hwnd) { $fault = 'a window other than the bound overlay covers the surface' }
    if ($null -eq $fault) { $fault = Get-QaOverlayStateFault $binding }
    if ($null -eq $fault) {
      $stack = @([QaOverlayNative]::StackAbove($edge, $x, $y))
      $expected = '{0}/{1}/{2}' -f $binding.hwnd_text, $binding.pid, $binding.expect.class
      $other = @($stack | Where-Object { (Get-QaStackEntry $_) -cne $expected }) | Select-Object -First 1
      $fault = Get-QaStackFault ([string[]]@($stack | ForEach-Object { Get-QaStackEntry $_ })) $expected $(if ($null -ne $other) { 'class ' + $other.Class + ', owner ' + $other.Owner } else { '' })
    }
    if ($null -ne $fault) { $entry.overlay_refused = Get-QaOverlayReason $fault; return $false }
    $entry.overlay_handle = $binding.hwnd_text
    $entry.overlay_points = [int]$entry.overlay_points + 1
    if ($root -eq $binding.hwnd) { $entry.overlay_hit_points = [int]$entry.overlay_hit_points + 1 }
    return $true
  } catch { $entry.overlay_refused = Get-QaOverlayReason $_.Exception.Message; return $false }
}
# The foreground may be the bound overlay instead of the admitted Edge, with Edge the top of the normal band.
function Test-QaOverlayForeground([IntPtr]$edge, $binding, $entry) {
  try {
    if ($null -eq $binding) { return $false }
    $fg = [QaWin]::GetForegroundWindow()
    if ($fg -ne $binding.hwnd) { return $false }
    $fault = Get-QaOverlayStateFault $binding
    if ($null -eq $fault) {
      $above = [QaOverlayNative]::AboveInNormalBand($edge)
      $fault = Get-QaNormalTopFault $above.Window.ToInt64().ToString() $(if ($above.Window -ne [IntPtr]::Zero) { 'class ' + $above.Class + ', owner ' + $above.Owner } else { '' })
    }
    if ($null -ne $fault) { $entry.overlay_refused = Get-QaOverlayReason $fault; return $false }
    $entry.overlay_handle = $binding.hwnd_text
    $entry.overlay_foreground = $true
    return $true
  } catch { $entry.overlay_refused = Get-QaOverlayReason $_.Exception.Message; return $false }
}
