# PREPARED, NOT EXECUTED (Lead handoff_1698eb17: no native test yet). Runs the four PURE overlay predicate functions,
# cut unchanged from qa_overlay_predicate.ps1 by the generator (qa_live_candidate.mjs overlayFixtureCheck), against
# qa_overlay_fixtures.json. No Add-Type, no native call, no window, process or display read. Windows PowerShell 5.1:
#   powershell.exe -NoProfile -NonInteractive -File <this> -Fixtures <qa_overlay_fixtures.json>
# Prints one JSON summary line; exits 1 when any case fails, 0 when all pass.
param([Parameter(Mandatory = $true)][string]$Fixtures)
$ErrorActionPreference = 'Stop'

function Get-QaOverlayBindingFault($named, [uint32]$appPid, $facts, $expect) {
  if ($null -eq $named -or $null -eq $named.pid -or $null -eq $named.hwnd) { return 'main named no overlay at arm' }
  if (-not ($named.hwnd -is [string] -and $named.hwnd -cmatch '^[1-9][0-9]{0,19}\z')) { return 'the named overlay handle is malformed' }
  if (-not ($named.pid -is [int] -or $named.pid -is [long]) -or $named.pid -ne $appPid) { return 'the named overlay is not of the launched product' }
  if ($null -eq $facts) { return 'the named overlay could not be read' }
  if ($facts.Owner -ne $appPid) { return 'the named overlay window belongs to another process' }
  if ($facts.Class -cne $expect.class -or $facts.Title -cne $expect.title) { return 'the named window is not the product overlay' }
  return $null
}

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

function Get-QaStackFault([string[]]$above, [string]$overlay, [string]$what) {
  if (-not $overlay -or @($above).Count -ne 1 -or $above[0] -cne $overlay) { return ('the windows above the owned Edge are not exactly the bound overlay' + $(if ($what) { ' (' + $what + ')' } else { '' })) }
  return $null
}

function Get-QaNormalTopFault([string]$above, [string]$what) {
  if ($above -and $above -cne '0') { return ('the owned Edge is not the top of the normal band' + $(if ($what) { ' (' + $what + ')' } else { '' })) }
  return $null
}


$fx = [System.IO.File]::ReadAllText($Fixtures, (New-Object System.Text.UTF8Encoding($false, $true))) | ConvertFrom-Json
$expect = @{ owner = [uint32]$fx.expect.owner; class = [string]$fx.expect.class; title = [string]$fx.expect.title; bounds = [string]$fx.expect.bounds }
function New-QaFixtureFacts($case) {
  if ($case.PSObject.Properties.Name -ccontains 'facts') { return $null }
  $facts = [ordered]@{}
  foreach ($p in $fx.overlay.PSObject.Properties) { $facts[$p.Name] = $p.Value }
  foreach ($p in $case.change.PSObject.Properties) { $facts[$p.Name] = $p.Value }
  return [pscustomobject]$facts
}
$results = @()
foreach ($c in $fx.binding_cases) {
  $got = Get-QaOverlayBindingFault $c.named ([uint32]$fx.app_pid) (New-QaFixtureFacts $c) $expect
  $results += [ordered]@{ set = 'binding'; name = $c.name; expected = $c.fault; got = $got; ok = ($got -ceq $c.fault) }
}
foreach ($c in $fx.overlay_cases) {
  $got = Get-QaOverlayFault (New-QaFixtureFacts $c) $expect
  $results += [ordered]@{ set = 'overlay'; name = $c.name; expected = $c.fault; got = $got; ok = ($got -ceq $c.fault) }
}
foreach ($c in $fx.stack_cases) {
  $got = Get-QaStackFault ([string[]]@($c.above)) ([string]$c.overlay) ([string]$c.what)
  $results += [ordered]@{ set = 'stack'; name = $c.name; expected = $c.fault; got = $got; ok = ($got -ceq $c.fault) }
}
foreach ($c in $fx.normal_top_cases) {
  $got = Get-QaNormalTopFault ([string]$c.above) ([string]$c.what)
  $results += [ordered]@{ set = 'normal_top'; name = $c.name; expected = $c.fault; got = $got; ok = ($got -ceq $c.fault) }
}
$failed = @($results | Where-Object { -not $_.ok }).Count
[Console]::Out.WriteLine((@{ cases = $results.Count; failed = $failed; results = $results } | ConvertTo-Json -Depth 5 -Compress))
if ($failed -gt 0) { exit 1 }
exit 0
