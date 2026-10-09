# PREPARED, NOT EXECUTED (Lead handoff_1698eb17: no native test yet). Runs the four PURE overlay predicate functions,
# cut unchanged from qa_overlay_predicate.ps1 by the generator (qa_live_candidate.mjs overlayFixtureCheck), against
# qa_overlay_fixtures.json. No Add-Type, no native call, no window, process or display read. Windows PowerShell 5.1:
#   powershell.exe -NoProfile -NonInteractive -File <this> -Fixtures <qa_overlay_fixtures.json>
# Prints one JSON summary line; exits 1 when any case fails, 0 when all pass.
param([Parameter(Mandatory = $true)][string]$Fixtures)
$ErrorActionPreference = 'Stop'

# @@QA_OVERLAY_PURE_FUNCTIONS@@

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
