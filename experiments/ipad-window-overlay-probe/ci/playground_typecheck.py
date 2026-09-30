"""Compare exact old/new Playground source with the Apple iOS SDK compiler.

This does not validate the Playground importer, app signing or physical behavior.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess

root = Path(__file__).resolve().parents[1]
out = Path(os.environ['PROBE_OUT'])
out.mkdir(parents=True, exist_ok=True)
baseline = root / 'evidence/playground-v1/GlassProbe.swift'
candidate = root / 'playground/GlassPlayground.swiftpm/Sources/GlassProbe.swift'

def capture(args):
    return subprocess.check_output(args, text=True).strip()

result = {
    'scope': 'Exact Swift source only, Swift 5 language mode, Apple iOS SDK. No Playground app import or real-device runtime claim.',
    'xcode': capture(['xcodebuild', '-version']),
    'swift': capture(['xcrun', 'swiftc', '--version']),
    'commit': capture(['git', 'rev-parse', 'HEAD']),
    'checks': [],
}
for name, source, sdk, target in [
    ('baseline-iphoneos', baseline, 'iphoneos', 'arm64-apple-ios16.0'),
    ('candidate-iphoneos', candidate, 'iphoneos', 'arm64-apple-ios16.0'),
    ('candidate-iphonesimulator', candidate, 'iphonesimulator', 'arm64-apple-ios16.0-simulator'),
]:
    args = ['xcrun', '--sdk', sdk, 'swiftc', '-typecheck', '-parse-as-library',
            '-swift-version', '5', '-target', target,
            '-sdk', capture(['xcrun', '--sdk', sdk, '--show-sdk-path']),
            str(source)]
    item = {'name': name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'sdk_version': capture(['xcrun', '--sdk', sdk, '--show-sdk-version']),
            'target': target, 'args': args}
    try:
        run = subprocess.run(args, text=True, capture_output=True, timeout=180)
        log = run.stdout + run.stderr
        item.update(exit_code=run.returncode, passed=run.returncode == 0, timed_out=False)
    except subprocess.TimeoutExpired as error:
        log = str(error.stdout or '') + str(error.stderr or '')
        item.update(exit_code=None, passed=False, timed_out=True)
    (out / (name + '.log')).write_text(log)
    result['checks'].append(item)
    (out / 'playground-typecheck.json').write_text(json.dumps(result, indent=2) + '\n')
    print(name, {k: item[k] for k in ['passed', 'exit_code', 'timed_out']}, flush=True)
    print(log[-5000:], flush=True)

result['candidate_passed'] = all(r['passed'] for r in result['checks'] if r['name'].startswith('candidate-'))
result['baseline_diagnostic_reproduced'] = 'unable to type-check this expression in reasonable time' in (out / 'baseline-iphoneos.log').read_text()
(out / 'playground-typecheck.json').write_text(json.dumps(result, indent=2) + '\n')
raise SystemExit(0 if result['candidate_passed'] else 1)
