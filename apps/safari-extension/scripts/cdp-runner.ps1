# Minimal Chrome DevTools Protocol step runner for a headless Windows browser.
# Used only by trusted-check.mjs when the browser runs on Windows and WSL cannot
# reach its loopback debugging port. Starts the browser with a fresh temporary
# profile, executes a JSON step list, writes results, and closes the browser.
#
# Step forms (JSON array):
#   { "cdp": "Domain.method", "params": { ... } }  string values "$name.field" are substituted
#   { "eval": "expression", "as": "name" }          Runtime.evaluate, awaited, stored by value
#   { "sleep": 250 }
#   { "screenshot": "label" }                       Page.captureScreenshot -> OutDir\label.png
param(
  [Parameter(Mandatory = $true)][string]$Browser,
  [Parameter(Mandatory = $true)][string]$ProfileDir,
  [Parameter(Mandatory = $true)][string]$StepsFile,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Width = 1280,
  [int]$Height = 1000
)
$ErrorActionPreference = 'Stop'
$steps = Get-Content -Raw -Encoding UTF8 $StepsFile | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$results = [ordered]@{ steps = @(); values = [ordered]@{}; screenshots = @(); errors = @() }
$vars = @{}

$browserArgs = @(
  '--headless=new', '--do-not-de-elevate', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-sync', '--autoplay-policy=no-user-gesture-required',
  "--user-data-dir=$ProfileDir", '--remote-debugging-port=0', "--window-size=$Width,$Height", '--hide-scrollbars', 'about:blank'
)
$proc = Start-Process -FilePath $Browser -ArgumentList $browserArgs -PassThru
# Lets the caller stop the browser even if this runner is killed.
Set-Content -Encoding ASCII -Path (Join-Path $OutDir 'browser.pid') -Value $proc.Id
$ws = $null
try {
  $portFile = Join-Path $ProfileDir 'DevToolsActivePort'
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Path $portFile)) {
    if ((Get-Date) -gt $deadline) { throw 'DevToolsActivePort did not appear' }
    Start-Sleep -Milliseconds 200
  }
  Start-Sleep -Milliseconds 300
  $port = (Get-Content $portFile)[0].Trim()
  $client = New-Object System.Net.WebClient
  $client.Proxy = $null  # loopback only; never route the debugging port through a proxy
  $targets = $client.DownloadString("http://127.0.0.1:$port/json/list") | ConvertFrom-Json
  $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  if (-not $page) { throw 'no page target' }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()

  $script:nextId = 0
  function Receive-Message {
    $buffer = New-Object byte[] 262144
    $stream = New-Object System.IO.MemoryStream
    do {
      $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $buffer)
      $task = $ws.ReceiveAsync($segment, [Threading.CancellationToken]::None)
      if (-not $task.Wait(90000)) { throw 'CDP receive timeout' }
      $received = $task.Result
      $stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    return [Text.Encoding]::UTF8.GetString($stream.ToArray())
  }
  function Invoke-Cdp([string]$method, [string]$paramsJson) {
    $script:nextId++
    $id = $script:nextId
    $message = '{"id":' + $id + ',"method":"' + $method + '","params":' + $paramsJson + '}'
    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
    while ($true) {
      $text = Receive-Message
      if ($text -match ('^\{"id":' + $id + '[,}]')) { return ($text | ConvertFrom-Json) }
    }
  }
  function Expand-Vars([string]$json) {
    return [regex]::Replace($json, '"\$([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)"', {
        param($m)
        $v = $vars[$m.Groups[1].Value]
        if ($null -eq $v) { throw "unknown variable $($m.Groups[1].Value)" }
        $field = $v.($m.Groups[2].Value)
        if ($null -eq $field) { throw "unknown field $($m.Value)" }
        return ([double]$field).ToString([Globalization.CultureInfo]::InvariantCulture)
      })
  }

  $i = 0
  foreach ($step in $steps) {
    $i++
    $entry = [ordered]@{ i = $i; ok = $true }
    try {
      if ($null -ne $step.sleep) {
        $entry.kind = 'sleep'
        Start-Sleep -Milliseconds ([int]$step.sleep)
      }
      elseif ($null -ne $step.eval) {
        $entry.kind = 'eval'; $entry.as = $step.as
        $expr = ConvertTo-Json -InputObject ([string]$step.eval) -Compress
        $r = Invoke-Cdp 'Runtime.evaluate' ('{"expression":' + $expr + ',"returnByValue":true,"awaitPromise":true}')
        if ($r.result.exceptionDetails) { throw ("eval exception: " + ($r.result.exceptionDetails | ConvertTo-Json -Compress -Depth 6)) }
        $value = $r.result.result.value
        if ($step.as) { $results.values[$step.as] = $value; $vars[$step.as] = $value }
      }
      elseif ($null -ne $step.screenshot) {
        $entry.kind = 'screenshot'; $entry.label = $step.screenshot
        $r = Invoke-Cdp 'Page.captureScreenshot' '{"format":"png"}'
        $file = Join-Path $OutDir ($step.screenshot + '.png')
        [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($r.result.data))
        $results.screenshots += $file
      }
      else {
        $entry.kind = 'cdp'; $entry.method = $step.cdp
        $paramsJson = '{}'
        if ($null -ne $step.params) { $paramsJson = Expand-Vars (ConvertTo-Json -InputObject $step.params -Compress -Depth 20) }
        $r = Invoke-Cdp $step.cdp $paramsJson
        if ($r.error) { throw ("cdp error: " + ($r.error | ConvertTo-Json -Compress)) }
      }
    }
    catch {
      $entry.ok = $false
      $entry.error = $_.Exception.Message
      $results.errors += "step $i : $($_.Exception.Message)"
    }
    $results.steps += $entry
  }
  try { Invoke-Cdp 'Browser.close' '{}' | Out-Null } catch { }
}
catch {
  $results.errors += "runner: $($_.Exception.Message)"
}
finally {
  if ($ws) { $ws.Dispose() }
  if (-not $proc.WaitForExit(10000)) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  $results | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 (Join-Path $OutDir 'cdp-results.json')
}
