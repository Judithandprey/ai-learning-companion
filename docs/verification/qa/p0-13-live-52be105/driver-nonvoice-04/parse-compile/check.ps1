$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$d = 'C:\Users\ROG\AppData\Local\Temp\lc-qa-parse-dc0ef8ffa5b848f39e5a1b480423b11a'
$out = [ordered]@{ powershell = $PSVersionTable.PSVersion.ToString(); clr = [Environment]::Version.ToString(); parse = [ordered]@{}; compile = [ordered]@{} }
foreach ($n in @('runner.ps1', 'admission-checker.ps1', 'overlay-fixture-check.ps1')) { $t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $d $n), [ref]$t, [ref]$e); $out.parse[$n] = [ordered]@{ errors = @($e | ForEach-Object { [ordered]@{ line = $_.Extent.StartLineNumber; column = $_.Extent.StartColumnNumber; id = $_.ErrorId; message = $_.Message } }) } }
foreach ($f in @(Get-ChildItem -LiteralPath $d -Filter 'cs-*.cs' | Sort-Object Name)) { try { Add-Type -TypeDefinition ([System.IO.File]::ReadAllText($f.FullName)) -OutputAssembly (Join-Path $d ($f.BaseName + '.dll')) -OutputType Library; $out.compile[$f.Name] = [ordered]@{ compiled = $true } } catch { $out.compile[$f.Name] = [ordered]@{ compiled = $false; error = $_.Exception.Message } } }
[Console]::Out.WriteLine(($out | ConvertTo-Json -Depth 6 -Compress))
