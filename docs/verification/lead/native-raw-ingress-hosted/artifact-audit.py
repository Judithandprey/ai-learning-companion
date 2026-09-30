"""Read-only integrity audit of downloaded evidence. No check suite is executed."""
from pathlib import Path
import base64
import collections
import hashlib
import json
import plistlib
import re
import subprocess
import zipfile

repo = Path('/home/agentsdock/Projects/learning-companion/repo')
evidence = Path('/tmp/lead-native-raw-ingress-36677566096')
commit = '81b7e182550d9f70ddc3bf4357bbab935488d6ea'
source_paths = ['apps/ios/ScreenObserver', 'apps/ios/checks/ScreenObserverCheck',
                'apps/ios/checks/CaptureIngressCheck', 'apps/ios/checks/RawCaptureFrameCheck',
                'apps/ios/checks/RawFrameIngressCheck', 'packages/contracts', 'pyproject.toml',
                'uv.lock', '.github/workflows/ios-screen-observer.yml']
def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo)

def digest(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()

listed = {}
for line in (evidence / 'SHA256SUMS').read_text().splitlines():
    hexdigest, name = line.split('  ', 1)
    assert name not in listed and Path(name).name == name
    listed[name] = hexdigest
assert set(listed) == {p.name for p in evidence.iterdir() if p.is_file() and p.name != 'SHA256SUMS'}
for name, expected_hash in listed.items():
    assert digest(evidence / name) == expected_hash, name
print('CHECKSUMS', len(listed), 'matched; every artifact file except SHA256SUMS covered')

expected = set(git('ls-tree', '-r', '--name-only', '-z', commit, '--', *source_paths).decode().split('\0')) - {''}
with zipfile.ZipFile(evidence / 'source.zip') as archive:
    entries = [i.filename for i in archive.infolist() if not i.is_dir()]
    assert len(entries) == len(set(entries))
    assert set(entries) == expected, {'missing': sorted(expected-set(entries)), 'extra': sorted(set(entries)-expected)}
    for name in entries:
        assert archive.read(name) == git('show', f'{commit}:{name}'), name
    assert archive.comment.decode() == commit
print('SOURCE', len(expected), 'files; exact set and byte equality to git show; archive comment matches commit')

inputs = (evidence / 'inputs.log').read_text()
assert f'commit={commit}\n' in inputs
assert 'run=https://github.com/Judithandprey/ai-learning-companion/actions/runs/36677566096\n' in inputs
assert 'attempt=1\n' in inputs and 'CODE_SIGNING_ALLOWED=NO\n' in inputs
source_tree = git('rev-parse', f'{commit}:apps/ios/ScreenObserver').decode().strip()
assert f'source_tree={source_tree}\n' in inputs
results = json.loads((evidence / 'build-results.json').read_text())
assert results['code_signing_allowed'] is False and results['device_install_verified'] is False
for name, value in results.items():
    if name.endswith('_outcome'):
        assert value == 'success', (name, value)

logs = ['boundary-checks.log', 'ingress-native-checks.log', 'ingress-contract-checks.log',
        'raw-frame-native-checks.log', 'raw-frame-contract-checks.log',
        'raw-frame-ingress-native-checks.log', 'raw-frame-ingress-contract-checks.log']
counts = {}
for name in logs:
    text = (evidence / name).read_text()
    passed = len(re.findall(r'^PASS\b', text, re.M))
    failed = len(re.findall(r'^FAIL\b', text, re.M))
    assert passed and not failed
    counts[name] = {'PASS': passed, 'FAIL': failed}
print('COUNTS', json.dumps(counts, sort_keys=True))

warnings=[]
for path in sorted(evidence.glob('*.log')):
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        if not line.startswith('PASS '):
            assert not re.search(r'^FAIL\b|::error::|\berror:|^Traceback|BUILD FAILED|^\s*mismatch:', line, re.I), (path.name, lineno, line)
        if 'warning:' in line:
            warnings.append([path.name, lineno, line.split('warning:', 1)[1].strip()])
print('WARNINGS', json.dumps(warnings))

bundle_details=[]
for result in results['builds']:
    sdk = result['sdk']
    assert result['compile_outcome'] == 'success'
    log = (evidence / f'build-{sdk}.log').read_text()
    assert '** BUILD SUCCEEDED **' in log and 'RawFrameIngress.swift' in log
    with zipfile.ZipFile(evidence / result['archive']) as archive:
        for bundle in result['bundles']:
            assert bundle['executable_present']
            prefix=bundle['path']
            info=plistlib.loads(archive.read(prefix + '/Info.plist'))
            assert info['CFBundleIdentifier'] == bundle['bundle_id']
            executable=archive.read(prefix + '/' + info['CFBundleExecutable'])
            assert executable[:4].hex() in {'cffaedfe','cafebabe','bebafeca','feedfacf','cefaedfe','feedface','cafebabf','bfbafeca'}
            bundle_details.append({'sdk':sdk,'bundle':prefix,'bytes':len(executable),'magic':executable[:4].hex(),
                                   'DTSDKName':info.get('DTSDKName'),'DTXcodeBuild':info.get('DTXcodeBuild')})
print('BUNDLES',json.dumps(bundle_details))

with zipfile.ZipFile(evidence/'raw-frame-ingress-fixtures.zip') as archive:
    prefix='raw-frame-ingress-fixtures/'
    manifest=json.loads(archive.read(prefix+'manifest.json'))
    kinds=collections.Counter(x['type'] for x in manifest)
    print('FIXTURE_MANIFEST',json.dumps(kinds,sort_keys=True))
    acks=[x for x in manifest if x['type']=='ack']
    assert len(acks)==35 and all(x['request']=='request-live.json' for x in acks)
    print('ACK_VERDICTS',json.dumps(collections.Counter(x['swift_verdict'] for x in acks),sort_keys=True))
    fixture_detail=[]
    for case in manifest:
        if case['type']!='request':
            continue
        request=json.loads(archive.read(prefix+case['body']))
        upload=json.loads(archive.read(prefix+case['original']))
        binding={k:upload[k] for k in ('contract_version','source','artifact','kind')}
        png=base64.b64decode(upload['data_base64'], validate=True)
        frame=request['frames'][0]
        record=request['batch']['records'][0]
        assert binding==case['binding']
        assert binding['artifact']==frame['artifact']==record['artifacts'][0]
        assert binding['source']==frame['source']==record['source']
        assert len(png)==binding['artifact']['byte_length']
        assert hashlib.sha256(png).hexdigest()==binding['artifact']['sha256']
        assert png.startswith(b'\x89PNG\r\n\x1a\n')
        assert case['posted'] is (case['name']=='live')
        assert frame['captured_at'] is None and frame['media_position'] is None
        fixture_detail.append({'name':case['name'],'posted':case['posted'],'png_bytes':len(png),
                               'sha256':binding['artifact']['sha256'],'orientation':frame['orientation'],
                               'captured_at':frame['captured_at'],'media_position':frame['media_position']})
    print('RAW_ORIGINAL_PAIRS',json.dumps(fixture_detail))

# Detect accidental mutation during this read-only audit.
for name, expected_hash in listed.items():
    assert digest(evidence / name) == expected_hash, name
print('PASS read-only audit completed; artifact bytes unchanged; no suites rerun')
