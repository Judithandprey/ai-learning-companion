# PRE-01: QA-only, non-pixel admission for the frozen single-display diagnostic.
# Dot-source after the runner's helpers/results exist. Initialization precedes every launch;
# Assert-QaSurfaceAdmission belongs directly before product launch or the cached capture action.
# These fresh checks do not make Windows topology/window changes atomic with capture.
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

function Initialize-QaDisplayAdmission {
  $entry = New-QaAdmissionEvidence 'initialize'
  try {
    if ($null -ne $script:qaDisplayBaseline) { throw 'native display admission is already initialized' }
    if ($script:app -or ($started -and $started.Count -gt 0)) { throw 'native display admission must precede owned launches' }
    $entry.native = Read-QaDisplaySnapshot
    $script:qaDisplayBaseline = $entry.native
    $script:qaDisplayBaselineSignature = $entry.native | ConvertTo-Json -Depth 5 -Compress
    $entry.accepted = $true
  } catch { $entry.error = $_.Exception.Message; throw }
}

function Assert-QaDisplayUnchanged([string]$phase) {
  $entry = New-QaAdmissionEvidence $phase
  try {
    $entry.native = Read-QaDisplaySnapshot
    Assert-QaDisplayBaseline $entry.native
    $entry.accepted = $true
  } catch { $entry.error = $_.Exception.Message; throw }
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
    for ($card = 0; $card -lt 12; $card++) { $points += ,@((40 + $card % 4 * 210 + 95) * 2, (90 + [Math]::Floor($card / 4) * 170 + 75) * 2) }
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
