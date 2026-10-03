$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaPre01Use {
 [StructLayout(LayoutKind.Sequential)] public struct LastInput { public uint Size; public uint Tick; }
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LastInput p);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out Rect rect, int size);
 public static uint IdleMilliseconds() { LastInput i=new LastInput(); i.Size=8; if (!GetLastInputInfo(ref i)) throw new InvalidOperationException("input metadata unavailable"); return unchecked((uint)Environment.TickCount-i.Tick); }
 public static bool AnyKeyHeld() { for (int k=1;k<255;k++) if ((GetAsyncKeyState(k)&0x8000)!=0) return true; return false; }
}
'@
$h=[QaPre01Use]::GetForegroundWindow(); if ($h -eq [IntPtr]::Zero) { throw 'foreground metadata unavailable' }
$owner=[uint32]0; if ([QaPre01Use]::GetWindowThreadProcessId($h,[ref]$owner) -eq 0 -or $owner -eq 0) { throw 'foreground identity unavailable' }
$name=(Get-Process -Id $owner -ErrorAction Stop).ProcessName
$rect=New-Object QaPre01Use+Rect; if ([QaPre01Use]::DwmGetWindowAttribute($h,9,[ref]$rect,16) -ne 0) { throw 'foreground physical rectangle unavailable' }
$age=[QaPre01Use]::IdleMilliseconds(); $held=[QaPre01Use]::AnyKeyHeld(); $visible=[QaPre01Use]::IsWindowVisible($h); $stable=([QaPre01Use]::GetForegroundWindow() -eq $h)
$policies=@(Get-ExecutionPolicy -List | ForEach-Object { @{scope=[string]$_.Scope;policy=[string]$_.ExecutionPolicy} })
@{kind='current-nonpixel-display-use-metadata';observed_at=[DateTime]::UtcNow.ToString('o');foreground=@{pid=$owner;process=$name;visible=$visible;stable=$stable;physical_rect=@($rect.Left,$rect.Top,$rect.Right,$rect.Bottom);dpi=[QaPre01Use]::GetDpiForWindow($h)};input=@{idle_milliseconds=$age;any_key_or_button_held=$held};explicit_execution_policies=$policies;point_in_time_only=$true;pixels_or_titles_or_typed_content_read=$false;capture_or_focus_or_input_or_account_actions=$false} | ConvertTo-Json -Depth 5 -Compress
