# Read-only Windows prerequisite observation. Never starts apps, captures pixels,
# reads window titles/command lines/authentication, or changes focus, windows or DPI.
# A process name is not proof that an approved QA surface is visible.
param(
  [string]$Electron = 'C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe',
  [string]$Edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaLivePreflight {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect rect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out Rect rect, int size);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
}
'@

function Rect-Value($r) {
  [ordered]@{ x = $r.Left; y = $r.Top; width = $r.Right - $r.Left; height = $r.Bottom - $r.Top }
}
function Available-File([string]$path) {
  try { return [bool](Test-Path -LiteralPath $path -PathType Leaf) } catch { return $false }
}

$report = [ordered]@{
  kind = 'read-only-windows-prerequisite-observation'
  observed_at = (Get-Date).ToUniversalTime().ToString('o')
  screens = [ordered]@{ count = $null; primary_bounds = $null; primary_work_area = $null; coordinate_units = 'as returned to this helper; physical-pixel identity not established' }
  foreground = [ordered]@{ pid = $null; process_name = $null; visible = $null; visible_screen_rectangle = $null; rectangle_source = $null; coordinate_units = $null; stable_during_read = $false; uncertainty = @() }
  dpi = [ordered]@{ helper_awareness = $null; system_for_helper = $null; foreground_window = $null; changed = $false }
  cached_paths = [ordered]@{ electron_available = (Available-File $Electron); edge_available = (Available-File $Edge); file_identity_verified = $false }
  errors = @()
  capture_admission = 'not_assessed'
  limitation = 'Point-in-time metadata only. No approved-surface ownership, unobscured pixels, exclusive display/account lease, executable authenticity or capture permission is established.'
}

try {
  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  $report.screens.count = $screens.Count
  $primary = $screens | Where-Object { $_.Primary } | Select-Object -First 1
  if ($primary) {
    $report.screens.primary_bounds = Rect-Value $primary.Bounds
    $report.screens.primary_work_area = Rect-Value $primary.WorkingArea
  } else { $report.errors += 'primary display unavailable' }
} catch { $report.errors += 'display metadata unavailable' }

# These getters may be absent on older Windows; unavailable values stay null.
try {
  $context = [QaLivePreflight]::GetThreadDpiAwarenessContext()
  $awareness = [QaLivePreflight]::GetAwarenessFromDpiAwarenessContext($context)
  $report.dpi.helper_awareness = switch ($awareness) { 0 { 'unaware' }; 1 { 'system' }; 2 { 'per-monitor' }; default { 'unknown' } }
} catch { $report.errors += 'helper DPI awareness unavailable' }
try {
  $systemDpi = [QaLivePreflight]::GetDpiForSystem()
  if ($systemDpi -gt 0) { $report.dpi.system_for_helper = $systemDpi }
} catch { $report.errors += 'system DPI unavailable' }

$handle = [QaLivePreflight]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) {
  $report.foreground.uncertainty += 'no foreground window returned'
} else {
  $ownerPid = [uint32]0
  [void][QaLivePreflight]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
  if ($ownerPid -gt 0) {
    $report.foreground.pid = $ownerPid
    try { $report.foreground.process_name = (Get-Process -Id $ownerPid -ErrorAction Stop).ProcessName }
    catch { $report.foreground.uncertainty += 'foreground process name unavailable' }
  } else { $report.foreground.uncertainty += 'foreground process identity unavailable' }
  $report.foreground.visible = [QaLivePreflight]::IsWindowVisible($handle)
  $rect = New-Object QaLivePreflight+Rect
  $gotRect = $false
  try {
    # DWM extended frame bounds are physical pixels; GetWindowRect can be DPI virtualized.
    $gotRect = [QaLivePreflight]::DwmGetWindowAttribute($handle, 9, [ref]$rect, 16) -eq 0
    if ($gotRect) {
      $report.foreground.rectangle_source = 'DWM extended frame bounds'
      $report.foreground.coordinate_units = 'physical pixels'
    }
  } catch { }
  if (-not $gotRect) {
    $gotRect = [QaLivePreflight]::GetWindowRect($handle, [ref]$rect)
    if ($gotRect) {
      $report.foreground.rectangle_source = 'GetWindowRect'
      $report.foreground.coordinate_units = 'helper DPI context; physical-pixel identity not established'
    }
  }
  if ($gotRect -and $report.foreground.visible -and $rect.Right -gt $rect.Left -and $rect.Bottom -gt $rect.Top) {
    $report.foreground.visible_screen_rectangle = Rect-Value $rect
  } else { $report.foreground.uncertainty += 'visible foreground rectangle unavailable' }
  try {
    $windowDpi = [QaLivePreflight]::GetDpiForWindow($handle)
    if ($windowDpi -gt 0) { $report.dpi.foreground_window = $windowDpi }
    else { $report.foreground.uncertainty += 'foreground DPI unavailable' }
  } catch { $report.foreground.uncertainty += 'foreground DPI unavailable' }
  $ownerAfter = [uint32]0
  [void][QaLivePreflight]::GetWindowThreadProcessId($handle, [ref]$ownerAfter)
  $report.foreground.stable_during_read = ($ownerPid -gt 0 -and $ownerAfter -eq $ownerPid -and [QaLivePreflight]::GetForegroundWindow() -eq $handle)
  if (-not $report.foreground.stable_during_read) { $report.foreground.uncertainty += 'foreground changed or could not be revalidated during read' }
}
$report | ConvertTo-Json -Depth 6 -Compress
