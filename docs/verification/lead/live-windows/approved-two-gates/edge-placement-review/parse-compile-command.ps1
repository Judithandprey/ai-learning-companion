$ErrorActionPreference='Stop'
$root='\\wsl.localhost\Ubuntu\tmp\lc-lead-edge-evidence-fc2fe3'
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile(($root+'\runner.ps1'),[ref]$tokens,[ref]$errors)
if (@($errors).Count -ne 0) { @{parsed=$false; errors=@($errors|ForEach-Object { @{line=$_.Extent.StartLineNumber; id=$_.ErrorId} })}|ConvertTo-Json -Compress -Depth 4;exit 2 }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$compiled=@()
foreach ($i in 0..2) {
 Add-Type -TypeDefinition ([IO.File]::ReadAllText(($root+'\types-'+$i+'.cs')))
 $compiled+=('types-'+$i+'.cs')
}
@{parsed=$true;compiled=$compiled;runner_executed=$false;native_methods_called=$false;display=$false;account=$false;audio=$false}|ConvertTo-Json -Compress
