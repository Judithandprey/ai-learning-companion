# One read-only observation of the exact lead-assigned CIM process identity.
# No process search, parent lookup, signal, device, window or title access.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding

function Known-Label($value) {
    # File resources are untrusted too. Only literal public product/vendor names leave memory.
    foreach ($label in @('Electron', 'Electron contributors', 'GitHub', 'GitHub, Inc.',
                         'AgentsDock', 'ZionDesk', 'Visual Studio Code',
                         'Microsoft Corporation', 'Obsidian', 'Discord', 'Slack')) {
        if ($value -ceq $label) { return $label }
    }
    if ([string]::IsNullOrWhiteSpace($value)) { return 'absent' }
    return 'unrecognized_redacted'
}

function Observe-Target {
    $result = [ordered]@{
        status = 'unreadable'
        pid = 100568
        expected_created_ticks = '639267186912717160'
        creation_source = 'CIM CreationDate.ToUniversalTime().Ticks'
        identity_matches = $false
        classification = 'unknown'
        observed_utc = [DateTime]::UtcNow.ToString('o')
    }
    try {
        # Match the historical source and exact ticks; do not round or substitute StartTime.
        $rows = @(Get-CimInstance Win32_Process -Filter 'ProcessId=100568' -OperationTimeoutSec 8 `
            -Property ProcessId,CreationDate,ExecutablePath,CommandLine)
        if ($rows.Count -eq 0) { $result.status = 'absent'; return $result }
        if ($rows.Count -ne 1 -or $null -eq $rows[0].CreationDate) { return $result }
        $row = $rows[0]
        if ([string]$row.CreationDate.ToUniversalTime().Ticks -cne $result.expected_created_ticks) {
            $result.status = 'creation_mismatch'; return $result
        }
        $result.identity_matches = $true
        if ([string]::IsNullOrWhiteSpace($row.ExecutablePath) -or
            [string]::IsNullOrWhiteSpace($row.CommandLine)) { return $result }

        $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($row.ExecutablePath)
        $result.product = Known-Label $version.ProductName
        $result.company = Known-Label $version.CompanyName
        $result.description = Known-Label $version.FileDescription

        # Native argument parsing keeps all unrelated command text inside this process.
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SupportIdentityArguments {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern IntPtr CommandLineToArgvW(string command, out int count);
    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);
    public static string[] Parse(string command) {
        int count;
        IntPtr memory = CommandLineToArgvW(command, out count);
        if (memory == IntPtr.Zero) throw new InvalidOperationException();
        try {
            string[] args = new string[count];
            for (int i=0; i<count; i++)
                args[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i*IntPtr.Size));
            return args;
        } finally { LocalFree(memory); }
    }
}
'@
        $parsed = [SupportIdentityArguments]::Parse($row.CommandLine)
        $result.child_argument_present = @($parsed | Select-Object -Skip 1 |
            Where-Object { $_.StartsWith('--type=', [StringComparison]::Ordinal) }).Count -gt 0

        # Exact known candidates from main 4388217 QA manifests. No substring/path discovery.
        $candidateExe = 'C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe'
        $result.executable_matches_candidate = $row.ExecutablePath -ieq $candidateExe
        $result.known_launch = 'unknown'
        if (-not $result.child_argument_present -and $parsed.Count -gt 1) {
            if ($parsed[1] -ieq 'C:\Users\ROG\AppData\Local\Temp\lc-windows-tts-52be105') {
                $result.known_launch = 'project_tts_52be105'
            } elseif ($parsed[1] -ieq 'C:\Users\ROG\AppData\Local\Temp\lc-windows-live-1755153') {
                $result.known_launch = 'project_live_1755153'
            }
        }
        if ($result.known_launch -ne 'unknown' -and $result.executable_matches_candidate) {
            $result.classification = 'known_project_candidate_launch'
        } elseif ($result.product -in @('AgentsDock', 'ZionDesk')) {
            $result.classification = 'agentsdock_named_executable_resource'
        } elseif ($result.product -in @('Visual Studio Code', 'Obsidian', 'Discord', 'Slack')) {
            $result.classification = 'other_named_executable_resource'
        }
        $result.status = 'observed'
    } catch {
        # Never serialize exception text, raw executable paths or command arguments.
        $result.status = 'unreadable'
        $result.classification = 'unknown'
    }
    return $result
}

Observe-Target | ConvertTo-Json -Depth 4 -Compress
