"""One exact-PID read-only observation; only fixed sanitized labels are retained."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


LABELS = {'Electron', 'Electron contributors', 'GitHub', 'GitHub, Inc.', 'AgentsDock',
          'ZionDesk', 'Visual Studio Code', 'Microsoft Corporation', 'Obsidian',
          'Discord', 'Slack', 'absent', 'unrecognized_redacted'}


def safe_observation(value):
    """Validate the fixed schema before any native output can reach disk or the terminal."""
    enums = {
        'status': {'observed', 'absent', 'creation_mismatch', 'unreadable'},
        'classification': {'unknown', 'known_project_candidate_launch',
                           'agentsdock_named_executable_resource', 'other_named_executable_resource'},
        'known_launch': {'unknown', 'project_tts_52be105', 'project_live_1755153'},
        'product': LABELS, 'company': LABELS, 'description': LABELS,
    }
    fixed = {'pid': 100568, 'expected_created_ticks': '639267186912717160',
             'creation_source': 'CIM CreationDate.ToUniversalTime().Ticks'}
    booleans = {'identity_matches', 'child_argument_present', 'executable_matches_candidate'}
    allowed = set(enums) | set(fixed) | booleans | {'observed_utc'}
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValueError('invalid_receipt')
    required = set(fixed) | {'status', 'classification', 'identity_matches', 'observed_utc'}
    if not required <= set(value):
        raise ValueError('invalid_receipt')
    for key, expected in fixed.items():
        if type(value[key]) is not type(expected) or value[key] != expected:
            raise ValueError('invalid_receipt')
    for key, options in enums.items():
        if key in value and value[key] not in options:
            raise ValueError('invalid_receipt')
    for key in booleans & value.keys():
        if type(value[key]) is not bool:
            raise ValueError('invalid_receipt')
    stamp = value['observed_utc']
    if not isinstance(stamp, str) or len(stamp) > 35:
        raise ValueError('invalid_receipt')
    datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    if value['status'] != 'observed' and value['classification'] != 'unknown':
        raise ValueError('invalid_receipt')
    if value['status'] == 'observed' and (value['identity_matches'] is not True or
            not {'known_launch', 'product', 'company', 'description',
                 'child_argument_present', 'executable_matches_candidate'} <= set(value)):
        raise ValueError('invalid_receipt')
    return value


def run(output):
    script = Path(__file__).with_suffix('.ps1').read_bytes()
    receipt = {'baseline': '4388217a3784d6979a36b0359b2a49eb6f869750',
               'script_sha256': hashlib.sha256(script).hexdigest(),
               'started_utc': datetime.now(timezone.utc).isoformat(),
               'native_invocations': 0, 'status': 'unavailable',
               'first_attempt_snapshot_reconstructed': False,
               'signals_sent': 0, 'display_acquired': False, 'provider_attempts': 0}
    # Reserve before any native call. Existing evidence never permits another observation.
    with output.open('x', encoding='utf-8') as destination:
        try:
            receipt['native_invocations'] = 1
            process = subprocess.run(
                ['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
                 '-NoProfile', '-NonInteractive', '-EncodedCommand',
                 base64.b64encode(script.decode().encode('utf-16-le')).decode('ascii')],
                capture_output=True, cwd='/mnt/c')
            # No outer kill timer: the task authorizes no process signals. CIM has an 8s operation deadline.
            receipt['native_exit_code'] = process.returncode
            if process.returncode == 0:
                receipt['observation'] = safe_observation(json.loads(process.stdout.decode('utf-8-sig')))
                receipt['status'] = 'completed'
            else:
                receipt['failure'] = 'native_nonzero_exit'
        except (OSError, UnicodeError, ValueError, TypeError):
            receipt['failure'] = 'launch_or_receipt_unavailable'
        receipt['completed_utc'] = datetime.now(timezone.utc).isoformat()
        json.dump(receipt, destination, indent=2)
        destination.write('\n')
    print(json.dumps({'status': receipt['status'], 'output': str(output)}))
    return 0 if receipt['status'] == 'completed' else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    raise SystemExit(run(parser.parse_args().output))
