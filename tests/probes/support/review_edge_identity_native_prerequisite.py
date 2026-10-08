"""Parse pinned runner as data; compile its five isolated C# blocks, invoke none."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

REVISION = '151f7d741e2b88912a94f0b24473594e236d0076'
RUNNER = 'docs/verification/qa/p0-13-tts-52be105/candidate-edge-identity-r2-20261008/runner.ps1'
RUNNER_HASH = '301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa'
HARNESS = r"""
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$report = [ordered]@{runner_executed=$false; emitted_methods_invoked=0; process_queries=0;
    window_calls=0; signals=0; phase='parse'; completed=$false; compiled_blocks=@()}
try {
    $tokens=$null; $errors=$null
    $null = [Management.Automation.Language.Parser]::ParseInput([string]$request.runner,[ref]$tokens,[ref]$errors)
    $report.parse_errors = @($errors | ForEach-Object {
        [ordered]@{id=$_.ErrorId;line=$_.Extent.StartLineNumber;column=$_.Extent.StartColumnNumber}
    })
    foreach ($block in $request.blocks) {
        $report.phase='compile_' + $block.index
        $types = @(Add-Type -TypeDefinition ([string]$block.source) -PassThru -ErrorAction Stop)
        $report.compiled_blocks += [ordered]@{index=$block.index;types=@($types | ForEach-Object { $_.FullName })}
    }
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
    source = runner.decode()
    blocks = re.findall(r"Add-Type @'\r?\n(.*?)\r?\n'@", source, re.S)
    assert len(blocks) == 5
    names = ['QaWin', 'QaArgv', 'QaEdgeSurface', 'QaDisplayAdmissionNative', 'QaPlacementNative']
    assert all(f'public static class {name} {{' in block for name, block in zip(names, blocks))
    request = {'runner': source, 'blocks': [dict(index=i, source=b) for i, b in enumerate(blocks)]}
    receipt = {'revision': REVISION, 'runner_sha256': RUNNER_HASH,
               'blocks': [dict(index=i, name=names[i], sha256=hashlib.sha256(b.encode()).hexdigest()) for i, b in enumerate(blocks)],
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
