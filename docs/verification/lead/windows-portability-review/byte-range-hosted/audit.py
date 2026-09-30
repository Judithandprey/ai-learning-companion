"""Read the exact downloaded hosted artifact; do not build or run the app."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import subprocess
import tarfile
import zipfile

HERE = Path(__file__).resolve().parent
ARTIFACT = Path('/tmp/windows-byte-range-36773932867')
HEAD = '4038e4144135aff0efa9ce0bb9ef40a418dc3bcc'
RUN = 36773932867
URL = f'https://github.com/Judithandprey/ai-learning-companion/actions/runs/{RUN}'
sha = lambda data: hashlib.sha256(data).hexdigest()
blob = lambda data: hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
run = json.loads(Path(f'/tmp/windows-byte-range-{RUN}-run.json').read_text())
artifacts = json.loads(Path(f'/tmp/windows-byte-range-{RUN}-artifacts.json').read_text())
assert run['headSha'] == HEAD and run['url'] == URL and run['conclusion'] == 'success'
assert run['status'] == 'completed' and len(run['jobs']) == 1
job, = run['jobs']
assert job['name'] == 'desktop (windows)' and job['conclusion'] == 'success'
assert job['databaseId'] == 110086987539
artifact, = artifacts['artifacts']
assert artifacts['total_count'] == 1 and artifact['id'] == 11125345379
assert artifact['name'] == f'desktop-windows-{HEAD}-1'
assert artifact['workflow_run']['id'] == RUN and artifact['workflow_run']['head_sha'] == HEAD
hashes = {}
for line in (ARTIFACT / 'SHA256SUMS').read_text().splitlines():
    match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
    assert match, line
    digest, name = match.groups()
    assert not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
    assert name not in hashes and sha((ARTIFACT / name).read_bytes()) == digest
    hashes[name] = digest
assert set(hashes) == {p.name for p in ARTIFACT.iterdir() if p.is_file() and p.name != 'SHA256SUMS'}

git = {}
for entry in subprocess.check_output(['git', 'ls-tree', '-rz', HEAD]).split(b'\0'):
    if entry:
        meta, name = entry.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        assert kind == 'blob'
        git[name.decode()] = (mode, oid)
seen = set()
raw_count = crlf_count = 0
with tarfile.open(ARTIFACT / 'source.tar.gz') as source:
    assert source.pax_headers.get('comment') == HEAD
    for member in source:
        if member.isdir():
            continue
        assert member.name not in seen and member.name in git
        seen.add(member.name)
        assert member.isfile() or member.issym()
        data = source.extractfile(member).read() if member.isfile() else member.linkname.encode()
        mode = '120000' if member.issym() else ('100755' if member.mode & 0o111 else '100644')
        assert mode == git[member.name][0]
        if blob(data) == git[member.name][1]:
            raw_count += 1
        else:
            assert blob(data.replace(b'\r\n', b'\n')) == git[member.name][1], member.name
            crlf_count += 1
assert seen == set(git)
env = (ARTIFACT / 'environment.txt').read_text()
assert f'commit={HEAD}\n' in env and f'run={URL}\n' in env and 'attempt=1\n' in env
inputs = ['apps/windows', 'scripts/desktop-checks.sh', '.github/workflows/desktop-checks.yml',
          'apps/safari-extension/src/ink.ts', 'apps/safari-extension/src/mode.ts']
assert re.findall(r'^[0-9a-f]{40}$', env, re.M) == [
    subprocess.check_output(['git', 'rev-parse', f'{HEAD}:{path}']).decode().strip() for path in inputs]
result = json.loads((ARTIFACT / 'result.json').read_text())
assert result['state'] == 'checks-completed' and result['exit_code'] == 0
for flag in ('interactive_runtime_verified', 'provider_verified', 'project_signing_performed'):
    assert result[flag] is False
log = (ARTIFACT / 'tests.log').read_text()
summary = {key: float(value) if key == 'duration_ms' else int(value)
           for key, value in re.findall(r'^ℹ (tests|pass|fail|cancelled|skipped|todo|duration_ms) ([0-9.]+)$', log, re.M)}
assert summary['tests'] == 140 and summary['pass'] == 135 and summary['skipped'] == 5
assert all(summary[key] == 0 for key in ('fail', 'cancelled', 'todo'))
assert re.search(r'^  ✔ an ink original that is unreadable \([0-9.]+ms\)$', log, re.M)
assert re.search(r'^✔ nothing is sent unless the origin, bearer, owner, incarnation and every original check out ', log, re.M)
skips = [line for line in log.splitlines() if '# SKIP' in line]
assert len(skips) == 5 and sum('the real Backend:' in line for line in skips) == 4
assert sum('a pipe put in place' in line for line in skips) == 1
assert 'tsc -p tsconfig.json && node scripts/copy-static.mjs' in (ARTIFACT / 'build.log').read_text()
with zipfile.ZipFile(ARTIFACT / 'WindowsDesktop.zip') as package:
    assert package.testzip() is None
    manifest = json.loads(package.read('WindowsDesktop/resources/app/package.json'))
    assert 'WindowsDesktop/resources/app/' + manifest['main'] in package.namelist()
    assert package.read('WindowsDesktop/version').decode().strip() == '44.5.1'
    assert b'cannot be read' in package.read('WindowsDesktop/resources/app/dist/apps/windows/src/main/uploader.js')
audit = {'status': 'PASS exact-source hosted Windows build and test evidence; not live product acceptance',
         'commit': HEAD, 'run': RUN, 'artifact_id': artifact['id'], 'checksums': hashes,
         'source': {'git_blobs': len(git), 'raw_matches': raw_count, 'CRLF_only': crlf_count},
         'tests': summary, 'unreadable_case_passed': True, 'skips': skips, 'result': result,
         'package': {'crc': 'pass', 'runtime': '44.5.1', 'main_and_uploader_present': True},
         'scope': 'Existing Windows gate only. No GUI, physical pen, provider, DB or Mac execution. No independent rebuild or new complete package qualification.'}
(HERE / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps({key: audit[key] for key in ('status', 'commit', 'source', 'tests', 'unreadable_case_passed')}, indent=2))
