#!/usr/bin/env python3
"""Bounded source/Backend alignment only; does not execute Swift or any socket."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/tmp/lc-macos-upload-fb1')
REPO = Path('/home/agentsdock/Projects/learning-companion/repo')
COMMIT = 'fb1d1ed3f3f0d35f88367a03551c15ca705f6f12'
PATH = 'apps/macos/CompanionDesktop/Sources/DesktopCapture/MacIngressUpload.swift'
sys.path.insert(0, str(ROOT))
from packages.contracts import capture_ingress, macos_capture_ingress
from services.api.ingress_app import _error

source = (ROOT / PATH).read_bytes()
exact = subprocess.check_output(['git', 'show', f'{COMMIT}:{PATH}'], cwd=REPO)
assert source == exact
text = source.decode()
block = text.split('static let codes: [Int: Set<String>] = [', 1)[1].split('\n    ]', 1)[0]
codes = {status: set(re.findall(r'"([a-z_]+)"', body))
         for status, body in re.findall(r'(\d+): \[(.*?)\]', block, re.S)}
checked = []
for wire, name in [(capture_ingress, 'IngressError'), (macos_capture_ingress, 'MacOSIngressError')]:
    assert codes == {key: set(value) for key, value in wire.ERROR_CODES.items()}
    for status, items in codes.items():
        for code in sorted(items):
            response = _error(int(status), code, contract=wire)
            assert response.status_code == int(status)
            body = response.body
            assert body.startswith(b'{') and b'\0' not in body and len(body) <= 4096
            parsed = json.loads(body.decode('utf-8'))
            wire.validate(name, parsed)
            assert parsed == {'contract_version': wire.CONTRACT_VERSION, 'error': code,
                              'retryable': code in {'unavailable', 'dependency_missing'}}
            checked.append({'version': wire.CONTRACT_VERSION, 'status': int(status), 'code': code})

receipt = {
    'candidate': COMMIT,
    'source': PATH,
    'sha256': hashlib.sha256(source).hexdigest(),
    'source_exact': True,
    'groups_passed': 2,
    'backend_error_replies_checked': len(checked),
    'replies': checked,
    'swift_executed': False,
    'http_or_native_executed': False,
    'scope': 'Exact source bytes, extracted Swift status/code table, actual Backend error serialization and released validators only.',
}
Path('/tmp/macos-upload-transport-probes.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(f'PASS: exact candidate source SHA256 {receipt["sha256"]}')
print(f'PASS: both route error tables and {len(checked)} actual Backend error replies agree')
print('NOT_RUN: Swift compilation/tests, URLSession, socket, app, DB, providers')
