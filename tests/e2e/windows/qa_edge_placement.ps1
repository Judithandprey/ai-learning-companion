# Candidate-only, non-pixel window metadata. No titles, screenshots or foreign-window mutations.
# The existing admission helper supplies physical geometry and restores its thread DPI context.
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
$script:qaPlacementCaptureAttempted = $false

function Read-QaPlacementWindow([IntPtr]$window, [IntPtr]$edge) {
  $geometry = [QaDisplayAdmissionNative]::ReadWindow($window)
  $metadata = [QaPlacementNative]::Read($window)
  return [ordered]@{ handle = $window.ToInt64().ToString(); owner = $geometry.Owner;
    bounds = @($geometry.Bounds); visible = $true; foreground = $geometry.Foreground;
    class = $metadata.Class; topmost = $metadata.Topmost; minimized = $metadata.Minimized;
    above_edge = [QaPlacementNative]::Above($window, $edge) }
}

function Assert-QaNormalEdge([IntPtr]$window, $entry = $null, [string]$key = 'window') {
  try {
    $snapshot = Read-QaPlacementWindow $window $window
    if ($null -ne $entry) { $entry[$key] = $snapshot }
    if ($window -eq [IntPtr]::Zero -or (Window-Handle 'edge') -ne $window) { throw 'owned Edge handle changed' }
    if ($snapshot.topmost -or $snapshot.minimized) { throw 'owned Edge must remain visible in the normal window band' }
    return $snapshot
  } catch {
    if ($null -ne $entry) { $entry[($key + '_error')] = $_.Exception.Message }
    throw
  }
}

function Read-QaPlacementPoints([IntPtr]$window, $points) {
  $observations = @()
  foreach ($point in $points) {
    $record = [ordered]@{ point = @([int]$point[0], [int]$point[1]); owned = $false }
    try {
      $root = [QaWin]::RootAt([int]$point[0], [int]$point[1])
      $record.window = Read-QaPlacementWindow $root $window
      $record.process = $(try { (Get-Process -Id ([int]$record.window.owner) -ErrorAction Stop).ProcessName } catch { 'unknown' })
      $record.owned = ($root -eq $window)
    } catch { $record.error = $_.Exception.Message }
    $observations += $record
  }
  return ,$observations
}

function Raise-QaEdgeNormal($entry, [IntPtr]$window) {
  Assert-QaDisplayUnchanged 'before_edge_raise'
  $entry.before_window = Assert-QaNormalEdge $window $entry 'before_window'
  # Same existing Raise path, without its temporary TOPMOST/NOTOPMOST pair for Edge.
  $foreground = [QaWin]::Raise($window, $false)
  $entry.after_window = Assert-QaNormalEdge $window $entry 'after_window'
  if ($entry.after_window.owner -ne $entry.before_window.owner -or -not $foreground -or -not $entry.after_window.foreground) { throw 'owned Edge raise did not retain identity and foreground' }
  return $foreground
}

function Reset-QaEdgeFullscreen($entry) {
  # Exactly one transition before product startup. Never shrink the surface while capture is running.
  if ($script:app) { throw 'Edge fullscreen placement must precede product launch' }
  $socket = Get-Socket 'edge'
  $window = Window-Handle 'edge'
  Assert-QaDisplayUnchanged 'before_edge_fullscreen'
  $entry.before_window = Assert-QaNormalEdge $window $entry 'before_window'
  if (-not $entry.before_window.foreground) { throw 'owned Edge is no longer foreground before placement' }
  $before = Invoke-Cdp $socket 'Browser.getWindowForTarget' '{}'
  if ($before.error -or $null -eq $before.result.windowId) { throw 'owned Edge CDP window identity unavailable' }
  $entry.before = [string]$before.result.bounds.windowState
  $entry.before_bounds = $before.result.bounds
  $id = $before.result.windowId
  foreach ($state in @('normal', 'fullscreen')) {
    $reply = Invoke-Cdp $socket 'Browser.setWindowBounds' ('{"windowId":' + $id + ',"bounds":{"windowState":"' + $state + '"}}')
    if ($null -eq $reply -or $reply.error -or $null -eq $reply.result) { throw 'owned Edge placement acknowledgement unavailable or refused' }
    Start-Sleep -Milliseconds 800
    $observed = Invoke-Cdp $socket 'Browser.getWindowForTarget' '{}'
    $entry[$state] = $observed.result
    if ($observed.error -or $observed.result.windowId -ne $id -or $observed.result.bounds.windowState -cne $state) { throw 'owned Edge placement state or identity disagrees' }
    $current = Assert-QaNormalEdge $window $entry ($state + '_window')
    if ($current.owner -ne $entry.before_window.owner) { throw 'owned Edge process changed during placement' }
  }
  $entry.after = [string]$observed.result.bounds.windowState
  $entry.after_window = $current
  $entry.browser_geometry = (Eval 'edge' 'JSON.stringify({x:screenX,y:screenY,outer_width:outerWidth,outer_height:outerHeight,inner_width:innerWidth,inner_height:innerHeight,dpr:devicePixelRatio})') | ConvertFrom-Json
  if (-not $current.foreground) { throw 'owned Edge lost foreground during placement' }
  Assert-QaDisplayUnchanged 'after_edge_fullscreen'
}

function Assert-QaEdgePoints($entry, [IntPtr]$window, $points) {
  if (@($points).Count -ne 16) { throw 'all sixteen surface points are required' }
  $entry.point_windows = Read-QaPlacementPoints $window $points
  $entry.owned_points = @($entry.point_windows | Where-Object { $_.owned -and -not $_.error }).Count
  $entry.native_window = Assert-QaNormalEdge $window $entry 'native_window'
  # Record every point, including failures, before rejecting. These are metadata, never pixel reads.
  if ($entry.owned_points -ne 16) { throw 'owned Edge is absent or unknown at a required card or corner point; see point_windows' }
  $last = Assert-QaNormalEdge $window
  if ($last.owner -ne $entry.native_window.owner) { throw 'owned Edge process changed during point checks' }
  Assert-QaDisplayUnchanged 'after_edge_points'
}

function Assert-QaProductPlacement($entry, [string]$phase) {
  if ($phase -notin @('control', 'overlay')) { throw 'unknown product placement phase' }
  if ($phase -eq 'control' -and $script:qaPlacementCaptureAttempted) { throw 'control placement must precede any capture attempt' }
  $edge = Window-Handle 'edge'
  $entry.edge = Assert-QaNormalEdge $edge $entry 'edge'
  if ($phase -eq 'overlay') {
    # NAV can be click-through: observe ordering only. Existing guarded pointer/drag steps test input separately.
    $overlay = Window-Handle 'overlay'
    $entry.overlay = Read-QaPlacementWindow $overlay $edge
    if ($entry.overlay.owner -ne $script:app.Id -or -not $entry.overlay.above_edge -or -not $entry.overlay.topmost) { throw 'owned overlay identity or ordering unavailable' }
    if ((Window-Handle 'overlay') -ne $overlay) { throw 'owned overlay changed during placement checks' }
    Assert-QaDisplayUnchanged 'after_overlay_placement'
    return
  }
  $socket = Get-Socket 'control'
  $control = Window-Handle 'control'
  $entry.control_before = Read-QaPlacementWindow $control $edge
  if ($entry.control_before.owner -ne $script:app.Id -or $entry.control_before.topmost) { throw 'owned normal control identity unavailable' }
  # Capture has never been attempted. Restore only the owned control; the following Edge raise/guard restores the surface.
  $entry.control_raised = [QaWin]::Raise($control)
  $entry.control = Read-QaPlacementWindow $control $edge
  if (-not $entry.control_raised -or $entry.control.owner -ne $script:app.Id -or $entry.control.topmost -or -not $entry.control.above_edge) { throw 'owned normal control is below Edge or changed' }
  # This control window is framed: use its native client origin, not screenX/screenY (outer origin).
  $box = (Eval 'control' "(() => { const e=document.querySelector('#displays li[role=option]'),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y); return JSON.stringify({x,y,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,shown:r.width>0&&r.height>0&&(top===e||e.contains(top))}); })()") | ConvertFrom-Json
  if (-not $box.shown -or $box.dpr -ne 2) { throw 'owned display-option geometry unavailable' }
  $entry.control_client = [QaPlacementNative]::ClientBounds($control)
  $client = $entry.control_client
  if ($client[4] -ne 192 -or $client[2] - $client[0] -ne $box.viewport[0] * $box.dpr -or $client[3] - $client[1] -ne $box.viewport[1] * $box.dpr -or $box.x -le 0 -or $box.x -ge $box.viewport[0] -or $box.y -le 0 -or $box.y -ge $box.viewport[1]) { throw 'owned control client and browser geometry disagree' }
  $point = @(($client[0] + [int][Math]::Round($box.x * $box.dpr)), ($client[1] + [int][Math]::Round($box.y * $box.dpr)))
  $entry.control_point = $point
  $entry.point_window = Read-QaPlacementWindow ([QaWin]::RootAt($point[0], $point[1])) $edge
  if ($entry.point_window.handle -ne $control.ToInt64().ToString()) { throw 'owned display option is covered at its centre' }
  if ((Window-Handle 'control') -ne $control) { throw 'owned control changed during placement checks' }
  if (($entry.control_client -join ',') -ne ([QaPlacementNative]::ClientBounds($control) -join ',')) { throw 'owned control client geometry changed during point checks' }
  $last = Assert-QaNormalEdge $edge
  if ($last.owner -ne $entry.edge.owner) { throw 'owned Edge process changed during product checks' }
  Assert-QaDisplayUnchanged 'after_product_placement'
}
