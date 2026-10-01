param([ValidatePattern('^run-\d{2}$')][string]$Run = 'run-01')
$ErrorActionPreference = 'Stop'
$qaOffscreenRoot = $PSScriptRoot
$qaElectron = 'C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe'
$qaExpectedHash = '49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa'
if ((Get-FileHash -LiteralPath $qaElectron -Algorithm SHA256).Hash.ToLowerInvariant() -ne $qaExpectedHash) { throw 'Cached Electron does not match the inspected executable' }
if (Test-Path -LiteralPath (Join-Path $qaOffscreenRoot $Run)) { throw 'Choose a new run-NN; preserve previous evidence' }
$qaOriginalTemp = $env:TEMP
$qaOriginalTmp = $env:TMP
$qaOriginalRun = $env:QA_OFFSCREEN_RUN
$qaOriginalBuild = $env:QA_OFFSCREEN_BUILD
try {
  $env:QA_OFFSCREEN_RUN = $Run
  $env:QA_OFFSCREEN_BUILD = 'build-9622b517b74020b2d9e8ffbb03f8d615ff32341d'
  $env:TEMP = Join-Path $qaOffscreenRoot 'process-temp'
  $env:TMP = $env:TEMP
  [System.IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
  $qaProcess = Start-Process -FilePath $qaElectron -ArgumentList ('"{0}"' -f $qaOffscreenRoot) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qaOffscreenRoot ('launch-' + $Run + '.stdout.txt')) -RedirectStandardError (Join-Path $qaOffscreenRoot ('launch-' + $Run + '.stderr.txt'))
  if (-not $qaProcess.WaitForExit(59000)) { throw 'Owned test exceeded its 55-second watchdog; do not terminate unrelated processes' }
  [PSCustomObject]@{ OwnedPid=$qaProcess.Id; Exited=$qaProcess.HasExited; ExitCode=$qaProcess.ExitCode; Evidence=(Join-Path $qaOffscreenRoot $Run) } | ConvertTo-Json -Compress
} finally {
  $env:TEMP = $qaOriginalTemp
  $env:TMP = $qaOriginalTmp
  $env:QA_OFFSCREEN_RUN = $qaOriginalRun
  $env:QA_OFFSCREEN_BUILD = $qaOriginalBuild
}
