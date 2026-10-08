"""Parse exact saved runner text; compile only QaArgv and exercise literal strings.

Never evaluates/dot-sources the runner or calls its admission functions.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

REVISION = '1aea6b24aac6517a09b014408cc9db6bc3bb1625'
RUNNER = 'docs/verification/qa/p0-13-tts-52be105/candidate-admission-20261008/runner.ps1'
RUNNER_HASH = '6728ec6cf8a5a2030059f8b31bddaa2b7d059f757730698ef38d5a2fad6c1c28'
HARNESS = r"""
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$report = [ordered]@{runner_executed=$false; admission_invoked=$false; process_queries=0;
    display_access=$false; application_launches=0; signals=0; phase='parse'; completed=$false}
try {
    $tokens=$null; $errors=$null
    $null = [Management.Automation.Language.Parser]::ParseInput([string]$request.runner,[ref]$tokens,[ref]$errors)
    $report.parse_errors = @($errors | ForEach-Object {
        [ordered]@{id=$_.ErrorId;line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber}
    })
    $report.phase='compile_QaArgv_only'
    Add-Type -TypeDefinition ([string]$request.argv_class) -ErrorAction Stop
    $report.argv_class_compiled=$true
    $report.phase='synthetic_literal_argv'
    $report.cases = @($request.cases | ForEach-Object {
        $actual = @([QaArgv]::Split([string]$_.line))
        [ordered]@{name=$_.name;passed=((ConvertTo-Json -InputObject $actual -Compress) -ceq
            (ConvertTo-Json -InputObject @($_.expected) -Compress));actual=$actual}
    })
    $report.completed=$true
} catch {
    $report.error_type=$_.Exception.GetType().FullName
    $report.error_id=$_.FullyQualifiedErrorId
}
$report | ConvertTo-Json -Depth 6 -Compress
"""


def run(output):
    runner = subprocess.check_output(['git', 'show', f'{REVISION}:{RUNNER}'])
    assert hashlib.sha256(runner).hexdigest() == RUNNER_HASH
    source = runner.decode('utf-8')
    blocks = re.findall(r"Add-Type @'\r?\n(.*?)\r?\n'@", source, re.S)
    classes = [body for body in blocks if 'public static class QaArgv {' in body]
    assert len(classes) == 1
    cases = [
        ('single_program', 'e.exe', ['e.exe']),
        ('quoted_paths', r'"C:\a b\e.exe" "C:\s t" --x=1 --y', [r'C:\a b\e.exe', r'C:\s t', '--x=1', '--y']),
        ('plain_path', r'e.exe C:\d\f.js --p=1', ['e.exe', r'C:\d\f.js', '--p=1']),
        ('trailing_backslash', r'e.exe "C:\d\\" a', ['e.exe', 'C:\\d\\', 'a']),
        ('program_backslashes', r'"C:\d\\" a', ['C:\\d\\\\', 'a']),
        ('doubled_quote', 'e.exe "S""" --p=1 --q', ['e.exe', 'S" --p=1 --q']),
        ('escaped_empty', r'e.exe a\"b "" c', ['e.exe', 'a"b', '', 'c']),
        ('ambiguous_option_tokens', r'e.exe --user-data-dir C:\Other\Profile .', ['e.exe', '--user-data-dir', r'C:\Other\Profile', '.']),
    ]
    request = {'runner': source, 'argv_class': classes[0],
               'cases': [dict(name=name, line=line, expected=expected) for name,line,expected in cases]}
    receipt = {'revision': REVISION, 'runner_sha256': RUNNER_HASH,
               'argv_class_sha256': hashlib.sha256(classes[0].encode()).hexdigest(),
               'harness_sha256': hashlib.sha256(HARNESS.encode()).hexdigest(),
               'started_utc': datetime.now(timezone.utc).isoformat(), 'native_invocations': 0}
    with output.open('x', encoding='utf-8') as destination:
        receipt['native_invocations'] = 1
        process = subprocess.run(
            ['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
             '-NoProfile', '-NonInteractive', '-EncodedCommand',
             base64.b64encode(HARNESS.encode('utf-16-le')).decode()],
            input=json.dumps(request).encode(), capture_output=True, cwd='/mnt/c')
        receipt['native_exit_code'] = process.returncode
        try:
            receipt['result'] = json.loads(process.stdout.decode('utf-8-sig'))
        except (ValueError, UnicodeError):
            receipt['result'] = {'completed': False, 'failure': 'unreadable_result'}
        receipt['stderr_bytes'] = len(process.stderr)
        receipt['completed_utc'] = datetime.now(timezone.utc).isoformat()
        json.dump(receipt, destination, indent=2)
        destination.write('\n')
    print(json.dumps({'native_exit_code': process.returncode, 'output': str(output)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args().output)
