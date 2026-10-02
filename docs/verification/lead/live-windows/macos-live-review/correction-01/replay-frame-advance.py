#!/usr/bin/env python3
"""Reconstruct and run the exact single-method review probe; existing toolchain only."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys

artifacts = Path(__file__).resolve().parent
repo = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/tmp/lc-lead-frame-advance-replay-4f6c327')
src = output / 'src'
src.mkdir(parents=True, exist_ok=True)
commit = '4f6c327018d46604b21c57ab4ebf2b0e45278f70'
evidence = 'docs/verification/platform/macos-subscription-live/correction-01/'
def read(path):
    return subprocess.check_output(['git', '-C', str(repo), 'show', f'{commit}:{path}'])
paths = subprocess.check_output(['git', '-C', str(repo), 'ls-tree', '-r', '--name-only', commit,
    'apps/macos/CompanionDesktop/Sources/DesktopCapture',
    'apps/macos/CompanionDesktop/Tests/DesktopCaptureTests'], text=True).splitlines()
for path in paths:
    if not path.endswith('.swift'):
        continue
    text = re.sub(r'^(import (CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)\n', '', read(path).decode(), flags=re.M)
    text = 'import Foundation\nimport FoundationNetworking\nimport Glibc\n' + text
    if path.endswith('/MacIngressUpload.swift'):
        text = re.sub(r'^(\s*)configuration.waitsForConnectivity = false', r'\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false', text, flags=re.M)
    (src / Path(path).name).write_text(text)
for path, name in [
    ('docs/verification/platform/macos-subscription-live/linux-apple-stand-ins.swift', 'AppleShim.swift'),
    (evidence + 'controller-probe.swift', 'ControllerProbe.swift'),
    (evidence + 'controller-ui-stand-ins.swift', 'UIStandIn.swift'),
    (evidence + 'lead-queued-presentation-probe.swift', 'ZLeadLifecycleProbe.swift'),
]:
    (src / name).write_bytes(read(path))
controller = read('apps/macos/CompanionDesktop/Sources/CompanionDesktop/LiveController.swift').decode()
controller = controller.split("/// The connection to the user's ChatGPT subscription and the AI's session, in the main window.")[0]
controller = re.sub(r'^import (AppKit|DesktopCapture|SwiftUI)\n', '', controller, flags=re.M)
(src / 'ActualLiveController.swift').write_text('import Foundation\n' + controller + '\nstruct LiveCardView: View {}\n')
(src / 'ZLeadFrameAdvancementProbe.swift').write_bytes((artifacts / 'frame-advance-probe.swift').read_bytes())
(src / 'main.swift').write_bytes((artifacts / 'frame-advance-main.swift').read_bytes())
expected = json.loads((artifacts / 'frame-advance-manifest.json').read_text())['harness_files']
actual = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(src.glob('*.swift'))}
assert actual == expected, 'Reconstructed harness differs from the exact executed source manifest'
command = ['/tmp/lc-review-0212/tc/usr/bin/swift-frontend', '-interpret', '-sdk',
    '/tmp/lc-review-0212/sysroot', '-swift-version', '5', '-module-name', 'LCLeadCorrected',
    '-lXCTest', 'src/main.swift'] + [f'src/{name}' for name in sorted(actual) if name != 'main.swift']
environment = dict(os.environ, LD_LIBRARY_PATH='/tmp/lc-review-0212/libs')
with (output / 'frame-advance.log').open('wb') as log:
    result = subprocess.run(command, cwd=output, env=environment, stdout=log, stderr=subprocess.STDOUT)
print(f'Exact source reconstructed; exit={result.returncode}; raw log={output / "frame-advance.log"}')
sys.exit(result.returncode)
