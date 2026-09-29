# QA capability probe (test-only). Starts headless Edge with a fresh profile and the QA probe
# extension, reports the DevTools protocol's Extensions commands, tries Extensions.triggerAction on a
# public page tab, then reads what the probe extension recorded. Stops the browser and removes the
# profile. No product code, credentials or accounts.
param([string]$Browser, [string]$Extension, [string]$ProfileDir, [string]$Url, [string]$OutFile)
$ErrorActionPreference = 'Stop'
$result = [ordered]@{ url = $Url; steps = @() }
$browserArgs = @('--headless=new', '--do-not-de-elevate', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-sync',
  "--user-data-dir=$ProfileDir", '--remote-debugging-port=0', '--enable-unsafe-extension-debugging', "--load-extension=$Extension",
  '--window-size=1280,900', 'about:blank')
$proc = Start-Process -FilePath $Browser -ArgumentList $browserArgs -PassThru
try {
  $portFile = Join-Path $ProfileDir 'DevToolsActivePort'
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Path $portFile)) { if ((Get-Date) -gt $deadline) { throw 'no DevToolsActivePort' }; Start-Sleep -Milliseconds 200 }
  Start-Sleep -Milliseconds 500
  $lines = Get-Content $portFile; $port = $lines[0].Trim(); $browserPath = $lines[1].Trim()
  $web = New-Object System.Net.WebClient; $web.Proxy = $null
  $result.version = ($web.DownloadString("http://127.0.0.1:$port/json/version") | ConvertFrom-Json).Browser
  $protocol = $web.DownloadString("http://127.0.0.1:$port/json/protocol") | ConvertFrom-Json
  $ext = $protocol.domains | Where-Object { $_.domain -eq 'Extensions' }
  $result.extensionsDomain = if ($ext) { @($ext.commands | ForEach-Object { $_.name }) } else { @() }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]"ws://127.0.0.1:$port$browserPath", [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Cdp([string]$method, $params, [string]$session) {
    $script:id++
    $msg = [ordered]@{ id = $script:id; method = $method; params = $params }
    if ($session) { $msg.sessionId = $session }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($msg | ConvertTo-Json -Depth 10 -Compress))
    $ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, [Threading.CancellationToken]::None).Wait()
    while ($true) {
      $buffer = New-Object byte[] 1048576; $text = ''
      do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buffer, [Threading.CancellationToken]::None); if (-not $r.Wait(30000)) { throw 'CDP timeout' }; $text += [Text.Encoding]::UTF8.GetString($buffer, 0, $r.Result.Count) } while (-not $r.Result.EndOfMessage)
      $reply = $text | ConvertFrom-Json
      if ($reply.id -eq $script:id) { return $reply }
    }
  }
  $targets = (Cdp 'Target.getTargets' @{}).result.targetInfos
  $result.targets = @($targets | ForEach-Object { "$($_.type) $($_.url)" })
  $sw = $targets | Where-Object { $_.type -eq 'service_worker' -and $_.url -like 'chrome-extension://*/sw.js' } | Select-Object -First 1
  $result.extensionLoaded = [bool]$sw
  $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  $attach = Cdp 'Target.attachToTarget' @{ targetId = $page.targetId; flatten = $true }
  $session = $attach.result.sessionId
  Cdp 'Page.enable' @{} $session | Out-Null
  Cdp 'Page.navigate' @{ url = $Url } $session | Out-Null
  Start-Sleep -Seconds 6
  $loc = Cdp 'Runtime.evaluate' @{ expression = 'location.href + " | " + document.title'; returnByValue = $true } $session
  $result.pageLocation = $loc.result.result.value
  if ($sw) {
    $extId = ([Uri]$sw.url).Host
    $result.extensionId = $extId
    # Control: without an action invocation there is no activeTab grant, so capture must fail.
    $swPre = Cdp 'Target.attachToTarget' @{ targetId = $sw.targetId; flatten = $true }
    $pre = Cdp 'Runtime.evaluate' @{ expression = 'chrome.tabs.captureVisibleTab({format:"png"}).then(d => "captured " + d.length, e => "refused: " + e.message)'; awaitPromise = $true; returnByValue = $true } $swPre.result.sessionId
    $result.captureWithoutInvocation = $pre.result.result.value
    $tabs = (Cdp 'Target.getTargets' @{ filter = @(@{ type = 'tab' }) }).result.targetInfos
    $result.tabTargets = @($tabs | ForEach-Object { "$($_.type) $($_.url)" })
    $tab = $tabs | Where-Object { $_.url -eq ($loc.result.result.value -split ' \| ')[0] } | Select-Object -First 1
    if (-not $tab) { $tab = $tabs | Select-Object -First 1 }
    $trigger = Cdp 'Extensions.triggerAction' @{ id = $extId; targetId = $tab.targetId }
    $result.triggerAction = if ($trigger.error) { "error: $($trigger.error.message)" } else { 'ok' }
    Start-Sleep -Seconds 3
    $swAttach = Cdp 'Target.attachToTarget' @{ targetId = $sw.targetId; flatten = $true }
    $read = Cdp 'Runtime.evaluate' @{ expression = 'chrome.storage.session.get("probe").then(r => JSON.stringify(r.probe ?? null))'; awaitPromise = $true; returnByValue = $true } $swAttach.result.sessionId
    $result.probeRecord = $read.result.result.value
  }
  try { Cdp 'Browser.close' @{} | Out-Null } catch { }
} catch {
  $result.error = "$_"
} finally {
  Start-Sleep -Milliseconds 800
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  $result | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $OutFile
}
