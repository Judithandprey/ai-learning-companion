# QA source-admission checker for the nonvoice live candidate (P0-13, Support F3; Lead interface 4f7d9fa). Windows
# PowerShell 5.1. The product's main process starts it once per capture, at arm, from the pinned configuration the QA
# runner names in LC_SOURCE_ADMISSION, and talks JSONL on stdin/stdout (lc-source-admission/1, at most 4096 bytes a line).
#
# Every request gets a FRESH full native admission: the reviewed runner's Assert-QaSurfaceAdmission (fresh browser
# geometry, exact display and Edge bounds, foreground, 16 owned points, the owned Edge identity resolved twice), with
# the normal-band predicate read on the admitted window just before and after it, all with the runner's definitions
# inserted byte for byte below, against the frozen context the runner wrote just before the product launch (the owned
# Edge process, its surface page and window, the DevTools port, the admitted display). Nothing is cached as an allow.
# Besides its facts, a request carries no instruction: the checker runs no command, reads no pixels and never changes a
# window. A request whose facts do not follow the admitted lineage (arm, then pre/post acquisition, then send of an
# admitted frame) is denied; after one deny every later request is denied (main ends the whole capture). A malformed
# line ends the checker without a reply. Each decision is written to the QA log (metadata only) before it is answered.
# An OS change between two native observations remains possible: this is not an atomic guarantee.
param(
  [Parameter(Mandatory = $true)][string]$Context,
  [Parameter(Mandatory = $true)][string]$Log
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
# The protocol owns stdout: the raw stream is taken first, then anything the host itself would print goes to stderr.
$qaStrict = New-Object System.Text.UTF8Encoding($false, $true)
$qaProtocolOut = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
$qaProtocolOut.NewLine = "`n"
$qaProtocolOut.AutoFlush = $true
$qaProtocolIn = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $qaStrict, $false)
[Console]::SetOut([Console]::Error)

# @@QA_REVIEWED_ADMISSION_DEFINITIONS@@

# The state the reviewed helpers read (as the runner holds it), rebuilt from the frozen context only.
$client = New-Object System.Net.WebClient
$client.Proxy = $null   # loopback only; never route a debugging port through a proxy
$sockets = @{}
$started = @{}
$results = @{ values = [ordered]@{} }
$script:nextId = 0
$script:qaDisplayEvidenceSequence = 0

$qaSafe = 9007199254740991
function Test-QaCheckerCount($v, [long]$min) { return ($v -is [int] -or $v -is [long]) -and $v -ge $min -and $v -le $qaSafe }
function Test-QaCheckerHex($v, [int]$n) { return $v -is [string] -and $v -cmatch ('^[0-9a-f]{' + $n + '}\z') }
function Get-QaCheckerNames($o) {
  [string[]]$names = @($o.PSObject.Properties | ForEach-Object { $_.Name })
  [Array]::Sort($names, [StringComparer]::Ordinal)
  return $names -join ','
}
function Test-QaCheckerAnySet($r, [string[]]$names) { foreach ($n in $names) { if ($null -ne $r.$n) { return $true } }; return $false }
function Test-QaCheckerObject($v) { return $v -is [System.Management.Automation.PSCustomObject] }
# A short reason with printable ASCII only; a file path or URL that an exception message may name is replaced (reasons
# reach main's log and QA's evidence: no path, command or pixel data).
function Get-QaCheckerReason([string]$text) {
  $clean = ($text -replace '[^\x20-\x7E]', ' ' -replace '(?i)file:/{2,3}[^\s''"]*', '<url>' -replace '(?i)(?<![a-z])[a-z]:\\[^\s''"]*', '<path>' -replace '\\\\[^\s''"]+', '<path>').Trim()
  if ($clean.Length -gt 300) { $clean = $clean.Substring(0, 300) }
  if (-not $clean) { $clean = 'denied' }
  return $clean
}

function Read-QaCheckerContext([string]$path) {
  $c = [System.IO.File]::ReadAllText($path, $qaStrict) | ConvertFrom-Json
  if (-not (Test-QaCheckerObject $c) -or (Get-QaCheckerNames $c) -cne 'display_signature,edge_pid,edge_port,edge_start_ticks,format,handle,surface_url,token') { throw 'admission context fields differ' }
  if ($c.format -cne 'lc-qa-admission-context/1') { throw 'admission context format differs' }
  if (-not (Test-QaCheckerCount $c.edge_pid 1) -or $c.edge_pid -gt [uint32]::MaxValue) { throw 'admission context Edge process is malformed' }
  if (-not ($c.edge_start_ticks -is [string] -and $c.edge_start_ticks -cmatch '^[1-9][0-9]{0,18}\z')) { throw 'admission context Edge start is malformed' }
  if (-not ($c.token -is [string] -and $c.token -cmatch '^lcqa[g-v]{32}\z')) { throw 'admission context surface token is malformed' }
  if (-not ($c.handle -is [string] -and $c.handle -cmatch '^[1-9][0-9]{0,18}\z')) { throw 'admission context window is malformed' }
  if (-not ($c.surface_url -is [string] -and $c.surface_url.StartsWith('file:///', [StringComparison]::Ordinal) -and -not $c.surface_url.Contains('%'))) { throw 'admission context surface URL is malformed' }
  if (-not (Test-QaCheckerCount $c.edge_port 1024) -or $c.edge_port -gt 65535) { throw 'admission context DevTools port is malformed' }
  if (-not ($c.display_signature -is [string] -and $c.display_signature.StartsWith('{', [StringComparison]::Ordinal))) { throw 'admission context display is malformed' }
  return $c
}

function Write-QaCheckerLog($record) {
  $record.at = (Get-Date).ToUniversalTime().ToString('o')
  $qaLogWriter.WriteLine(($record | ConvertTo-Json -Compress -Depth 6))
}

$qaReqNames = 'capture_id,display,format,frame_seq,id,image_sha256,phase,raw_sha256,raw_size,request_id,sample_seq,sent_at,seq'
# The facts of one well-formed request against the lineage admitted so far: $null when they follow it, else the reason.
function Get-QaCheckerLineageFault($r, $state) {
  if ($r.phase -ceq 'arm') {
    if ($state.armed -or $state.count -ne 1) { return 'arm must be the first and only arm request' }
    if (Test-QaCheckerAnySet $r @('sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256')) { return 'arm carries only display and capture facts' }
    $d = $r.display
    # The main-owned display id: a decimal string, as the product keeps it (52be105 display_id, the capture source's
    # display_id string), or the same number; echoed unchanged either way.
    $idOk = ($d.id -is [string] -and $d.id -cmatch '^[0-9]{1,20}\z') -or (Test-QaCheckerCount $d.id 0)
    if (-not (Test-QaCheckerObject $d) -or (Get-QaCheckerNames $d) -cne 'bounds,id,scale_factor' -or -not $idOk) { return 'arm display is malformed' }
    $b = $d.bounds
    if (-not (Test-QaCheckerObject $b) -or (Get-QaCheckerNames $b) -cne 'height,width,x,y') { return 'arm display bounds are malformed' }
    # The admitted display in DIP: the frozen native bounds over the frozen system scale.
    $base = $script:qaDisplayBaseline
    $scale = [int]$base.dpi / 96
    foreach ($k in @('x', 'y', 'width', 'height')) { if (-not ($b.$k -is [int] -or $b.$k -is [long])) { return 'arm display bounds are not whole numbers' } }
    if ($b.x -ne $base.monitor_bounds[0] / $scale -or $b.y -ne $base.monitor_bounds[1] / $scale -or $b.width -ne ($base.monitor_bounds[2] - $base.monitor_bounds[0]) / $scale -or $b.height -ne ($base.monitor_bounds[3] - $base.monitor_bounds[1]) / $scale) { return 'arm display is not the admitted display' }
    if (-not ($d.scale_factor -is [int] -or $d.scale_factor -is [long] -or $d.scale_factor -is [decimal] -or $d.scale_factor -is [double]) -or $d.scale_factor -ne $scale) { return 'arm display scale is not the admitted scale' }
    return $null
  }
  if (-not $state.armed) { return 'no admitted arm for this capture' }
  if ($r.capture_id -cne $state.capture) { return 'another capture' }
  if ($null -ne $r.display) { return 'only arm carries a display' }
  if (-not (Test-QaCheckerCount $r.sample_seq 1)) { return 'sample sequence is malformed' }
  if ($r.phase -ceq 'pre_acquire') {
    if (Test-QaCheckerAnySet $r @('frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256')) { return 'pre_acquire carries no acquired frame or request' }
    if ($r.sample_seq -le $state.last_sample) { return 'sample sequence did not increase' }
    return $null
  }
  if (-not (Test-QaCheckerCount $r.frame_seq 1) -or -not (Test-QaCheckerHex $r.raw_sha256 64)) { return 'acquired frame facts are malformed' }
  $z = $r.raw_size
  if (-not (Test-QaCheckerObject $z) -or (Get-QaCheckerNames $z) -cne 'height,width' -or -not (Test-QaCheckerCount $z.width 1) -or -not (Test-QaCheckerCount $z.height 1)) { return 'acquired frame size is malformed' }
  $frame = '{0}|{1}|{2}|{3}x{4}' -f $r.sample_seq, $r.frame_seq, $r.raw_sha256, $z.width, $z.height
  if ($r.phase -ceq 'post_acquire') {
    if (Test-QaCheckerAnySet $r @('request_id', 'image_sha256')) { return 'post_acquire carries no request' }
    if (-not $state.pending.Contains([string]$r.sample_seq)) { return 'post_acquire names no admitted pre_acquire' }
    return $null
  }
  # send: an admitted acquisition, a new request, the exact PNG named.
  if (-not $state.admitted.Contains($frame)) { return 'send names no admitted acquisition' }
  if (-not ($r.request_id -is [string]) -or $r.request_id.Length -lt 1 -or $r.request_id.Length -gt 128 -or $r.request_id -cmatch '[\x00-\x1F\x7F]') { return 'request identity is malformed' }
  if ($state.sent.Contains([string]$r.request_id)) { return 'this request was already admitted for sending' }
  if (-not (Test-QaCheckerHex $r.image_sha256 64)) { return 'sent image hash is malformed' }
  return $null
}

# ---- start: the frozen context, the owned Edge as it was frozen, the log; then ready ----
try {
  $qaContext = Read-QaCheckerContext $Context
  $edgeProcess = [System.Diagnostics.Process]::GetProcessById([int]$qaContext.edge_pid)
  if ($edgeProcess.HasExited -or $edgeProcess.StartTime.Ticks -ne [long]$qaContext.edge_start_ticks) { throw 'owned Edge identity changed' }
  $started['edge'] = $edgeProcess
  $script:edgePort = [int]$qaContext.edge_port
  $script:qaEdgeSurfaceUrl = [string]$qaContext.surface_url
  $script:qaEdgeIdentity = [ordered]@{ token = [string]$qaContext.token; pid = [uint32]$edgeProcess.Id; start = $edgeProcess.StartTime; handle = [IntPtr][long]$qaContext.handle }
  $script:qaDisplayBaselineSignature = [string]$qaContext.display_signature
  $script:qaDisplayBaseline = $script:qaDisplayBaselineSignature | ConvertFrom-Json
  if ($null -eq $script:qaDisplayBaseline -or $script:qaDisplayBaseline.dpi -isnot [int] -or @($script:qaDisplayBaseline.monitor_bounds).Count -ne 4) { throw 'admission context display is malformed' }
  $qaLogStream = New-Object System.IO.FileStream($Log, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  $qaLogWriter = New-Object System.IO.StreamWriter($qaLogStream, (New-Object System.Text.UTF8Encoding($false)))
  $qaLogWriter.AutoFlush = $true
  # Read-only warm-up within the ready bound (process listing, the DevTools connection to the surface page), so the first
  # decision is not spent on start-up; it decides nothing.
  $null = Get-QaOwnedEdgeIds $script:qaEdgeIdentity
  $null = Get-QaEdgeSocket
  Write-QaCheckerLog ([ordered]@{ event = 'ready'; edge_pid = [int]$edgeProcess.Id; edge_port = $script:edgePort })
  $qaProtocolOut.WriteLine('{"format":"lc-source-admission/1","ready":true}')
} catch {
  [Console]::Error.WriteLine('lc-source-admission checker unavailable: ' + (Get-QaCheckerReason $_.Exception.Message))
  exit 1
}

# ---- the finite loop: one request at a time until EOF, the lifetime bound or the request bound ----
$qaDeadline = [DateTime]::UtcNow.AddSeconds(1800)
$qaState = @{ armed = $false; capture = $null; count = 0; last_seq = 0; last_sample = 0; denied = $null
  pending = New-Object 'System.Collections.Generic.HashSet[string]'; admitted = New-Object 'System.Collections.Generic.HashSet[string]'
  ids = New-Object 'System.Collections.Generic.HashSet[string]'; sent = New-Object 'System.Collections.Generic.HashSet[string]' }
while ($true) {
  $left = ($qaDeadline - [DateTime]::UtcNow).TotalMilliseconds
  if ($left -le 0) { try { Write-QaCheckerLog ([ordered]@{ event = 'lifetime_bound' }) } catch { }; exit 3 }
  $read = $qaProtocolIn.ReadLineAsync()
  if (-not $read.Wait([int][Math]::Min($left, 2147483647))) { try { Write-QaCheckerLog ([ordered]@{ event = 'lifetime_bound' }) } catch { }; exit 3 }
  $line = $read.Result
  if ($null -eq $line) { try { Write-QaCheckerLog ([ordered]@{ event = 'eof'; requests = $qaState.count }) } catch { }; exit 0 }
  $received = (Get-Date).ToUniversalTime().ToString('o')
  # Well-formed: one JSON object of at most 4096 bytes with exactly the request fields, each of its kind. Anything else
  # ends the checker without a reply (main ends the capture).
  $r = $null
  $fault = $null
  if ($qaStrict.GetByteCount($line) -gt 4096) { $fault = 'request line too long' }
  else { try { $r = $line | ConvertFrom-Json } catch { $fault = 'request is not JSON' } }
  if (-not $fault -and (-not (Test-QaCheckerObject $r) -or (Get-QaCheckerNames $r) -cne $qaReqNames)) { $fault = 'request fields differ' }
  # (PowerShell continues a condition only after an operator at a line's end, never before one at the next line's start.)
  if (-not $fault -and ($r.format -cne 'lc-source-admission/1' -or -not (Test-QaCheckerHex $r.id 32) -or -not (Test-QaCheckerCount $r.seq 1) -or
      @('arm', 'pre_acquire', 'post_acquire', 'send') -cnotcontains $r.phase -or -not (Test-QaCheckerHex $r.capture_id 16) -or
      -not ($r.sent_at -is [string] -and $r.sent_at -cmatch '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z\z'))) { $fault = 'request facts are malformed' }
  if ($fault) { try { Write-QaCheckerLog ([ordered]@{ event = 'malformed'; reason = $fault }) } catch { }; exit 2 }
  $qaState.count++
  # The decision: replay and order first, then the lineage, then the fresh full admission; a deny latches.
  $verdict = 'deny'
  $reason = $null
  $admission = $null
  if ($null -ne $qaState.denied) { $reason = 'an earlier decision denied this capture' }
  elseif ($qaState.count -gt 4096) { $reason = 'the checker request bound is reached' }
  elseif (-not $qaState.ids.Add([string]$r.id)) { $reason = 'request identity replayed' }
  elseif ($r.seq -le $qaState.last_seq) { $reason = 'request sequence did not increase' }
  else {
    $reason = Get-QaCheckerLineageFault $r $qaState
    if ($null -eq $reason) {
      $results.values = [ordered]@{}
      # The reviewed admission resolves and re-resolves the owned Edge window itself (two full identity resolutions, the
      # measured bulk of a decision: about 1.5 s each in the accepted diagnostic). The normal window band (not topmost,
      # not minimized; Assert-QaNormalEdge's predicate) is read on that same frozen window just before and just after it,
      # with the reviewed native read and no further resolution.
      try {
        $before = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)
        if ($before.Topmost -or $before.Minimized) { throw 'owned Edge must remain visible in the normal window band' }
        $null = Assert-QaSurfaceAdmission ('checker_' + $r.phase)
        $after = [QaPlacementNative]::Read($script:qaEdgeIdentity.handle)
        if ($after.Topmost -or $after.Minimized) { throw 'owned Edge must remain visible in the normal window band' }
      } catch { $reason = 'source admission refused: ' + $_.Exception.Message }
      $admission = @($results.values.Values) | Select-Object -First 1
      if ($null -eq $reason -and -not ($null -ne $admission -and $admission.accepted -eq $true)) { $reason = 'source admission did not complete' }
    }
  }
  if ($r.seq -gt $qaState.last_seq) { $qaState.last_seq = $r.seq }
  if ($null -eq $reason) {
    $verdict = 'allow'
    switch -CaseSensitive ($r.phase) {
      'arm' { $qaState.armed = $true; $qaState.capture = [string]$r.capture_id }
      'pre_acquire' { $qaState.last_sample = $r.sample_seq; $null = $qaState.pending.Add([string]$r.sample_seq) }
      'post_acquire' { $null = $qaState.pending.Remove([string]$r.sample_seq); $null = $qaState.admitted.Add(('{0}|{1}|{2}|{3}x{4}' -f $r.sample_seq, $r.frame_seq, $r.raw_sha256, $r.raw_size.width, $r.raw_size.height)) }
      'send' { $null = $qaState.sent.Add([string]$r.request_id) }
    }
  } else {
    $reason = Get-QaCheckerReason $reason
    if ($null -eq $qaState.denied) { $qaState.denied = $reason }
  }
  # Logged before it is answered: an unlogged decision is never an allow.
  try {
    Write-QaCheckerLog ([ordered]@{ event = 'decision'; seq = $r.seq; id = $r.id; phase = $r.phase; capture_id = $r.capture_id; sample_seq = $r.sample_seq; frame_seq = $r.frame_seq
      raw_sha256 = $r.raw_sha256; raw_size = $r.raw_size; request_id = $r.request_id; image_sha256 = $r.image_sha256; sent_at = $r.sent_at; received_at = $received; verdict = $verdict; reason = $reason
      admission = $(if ($null -ne $admission) { [ordered]@{ phase = $admission.phase; at = $admission.at; accepted = $admission.accepted; error = $admission.error; owned_points = $admission.owned_points; window = $admission.window } } else { $null }) })
  } catch {
    if ($verdict -ceq 'allow') { $verdict = 'deny'; $reason = 'the checker evidence log is unavailable'; $qaState.denied = $reason }
  }
  $reply = [ordered]@{ format = $r.format; id = $r.id; seq = $r.seq; phase = $r.phase; capture_id = $r.capture_id; display = $r.display; sample_seq = $r.sample_seq; frame_seq = $r.frame_seq
    raw_sha256 = $r.raw_sha256; raw_size = $r.raw_size; request_id = $r.request_id; image_sha256 = $r.image_sha256; verdict = $verdict; reason = $reason }
  $out = $reply | ConvertTo-Json -Compress -Depth 5
  if ($qaStrict.GetByteCount($out) -gt 4096) { try { Write-QaCheckerLog ([ordered]@{ event = 'reply_too_long'; seq = $r.seq }) } catch { }; exit 2 }
  try { $qaProtocolOut.WriteLine($out) } catch { exit 4 }
}
