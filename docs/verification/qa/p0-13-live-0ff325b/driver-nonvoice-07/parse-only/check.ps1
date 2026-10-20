$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$p = 'C:\Users\ROG\AppData\Local\Temp\lc-qa-parse-cd5725d65e71456780c4d153e86e7421\runner.ps1'
$out = [ordered]@{ powershell = $PSVersionTable.PSVersion.ToString(); clr = [Environment]::Version.ToString(); sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower(); parse = $null }
$t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$t, [ref]$e); $out.parse = [ordered]@{ errors = @($e | ForEach-Object { [ordered]@{ line = $_.Extent.StartLineNumber; column = $_.Extent.StartColumnNumber; id = $_.ErrorId; message = $_.Message } }) }
[Console]::Out.WriteLine(($out | ConvertTo-Json -Depth 6 -Compress))
