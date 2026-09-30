#!/usr/bin/env python3
"""Audit saved hosted Mac uploader evidence, with no build/test rerun or app execution.

  .venv/bin/python docs/verification/lead/macos-upload-integration/audit.py \
    --artifact-dir /tmp/lc-macos-RUN --commit FULL_HOSTED_SHA \
    --approved FULL_REVIEWED_NATIVE_SHA --run RUN --output /tmp/mac-upload-audit.json

Run only after actual hosted output and both raw metadata receipts have arrived.
Expected milestone: 55 declared/executed XCTests in 7 source files, and the new
upload checker with 24 PASS lines including 18 negative controls. Counts are
requirements checked against actual source/logs, never a prepared-result claim.
The retained upload transcript used an in-process synthetic host, not a socket,
Backend, provider, system capture, or automatic restart/replay integration.
"""
from pathlib import Path, PurePosixPath
from collections import Counter
import argparse
import base64
import hashlib
import json
import plistlib
import re
import struct
import subprocess
import tarfile
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path.cwd())
parser.add_argument('--artifact-dir', type=Path, required=True)
parser.add_argument('--commit', required=True, help='exact full hosted source SHA')
parser.add_argument('--approved', required=True, help='exact full reviewed native SHA')
parser.add_argument('--run', type=int, required=True)
parser.add_argument('--output', type=Path, required=True, help='new receipt outside the artifact directory')
parser.add_argument('--run-metadata', type=Path)
parser.add_argument('--artifact-metadata', type=Path)
args = parser.parse_args()
if not all(re.fullmatch(r'[0-9a-f]{40}', value) for value in (args.commit, args.approved)):
    parser.error('--commit and --approved must be complete Git SHAs')
REPO, P, OUT = args.repo.resolve(), args.artifact_dir.resolve(), args.output.resolve()
COMMIT, APPROVED, RUN = args.commit, args.approved, args.run
RUN_URL = f'https://github.com/Judithandprey/ai-learning-companion/actions/runs/{RUN}'
if OUT.is_relative_to(P) or OUT.exists():
    parser.error('output must be a new file outside the immutable downloaded evidence')
ROOT = 'apps/macos/CompanionDesktop/'
issues = []
result = {'commit': COMMIT, 'run': RUN, 'artifact_directory': str(P), 'approved_commit': APPROVED, 'scope': 'Saved artifact inspection, no native execution or test rerun'}

def check(ok, message):
    if not ok:
        issues.append(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)

def git_identity(commit, path):
    return git('rev-parse', commit + ':' + path).decode().strip()

def safe(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError('unsafe evidence path: ' + name)
    return path

def load(path):
    return json.loads(path.read_text())

# Require actual downloaded evidence before doing anything. Original files are never changed.
if not (P / 'SHA256SUMS').is_file():
    raise SystemExit('Artifact is not available; no audit was performed')
checksums = {}
for line in (P / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    safe(name)
    check(name not in checksums, 'Duplicate checksum entry: ' + name)
    check(re.fullmatch('[0-9a-f]{64}', digest) is not None, 'Invalid SHA256: ' + name)
    file = P / name
    check(file.is_file() and not file.is_symlink(), 'Missing/nonregular checksum file: ' + name)
    check(sha(file.read_bytes()) == digest, 'Checksum mismatch: ' + name)
    checksums[name] = digest
actual = {f.relative_to(P).as_posix() for f in P.rglob('*') if f.is_file() and f != P / 'SHA256SUMS'}
check(actual == set(checksums), 'Checksum coverage missing/extra: ' + repr(actual ^ set(checksums)))
result['checksums'] = {'listed': len(checksums), 'actual': len(actual), 'coverage_exact': actual == set(checksums),
                       'manifest_sha256': sha((P / 'SHA256SUMS').read_bytes()), 'hashes': checksums}

# Raw byte, executable mode, and path equality for the complete committed snapshot.
expected = {}
for row in git('ls-tree', '-rz', COMMIT).split(b'\0'):
    if row:
        meta, name = row.split(b'\t', 1)
        expected[name.decode()] = tuple(meta.decode().split())
archived = {}
source = {}
with tarfile.open(P / 'source.tar.gz', 'r:gz') as archive:
    pax = archive.pax_headers
    for member in archive:
        safe(member.name)
        if member.isdir():
            continue
        check(member.name not in archived, 'Duplicate tar member: ' + member.name)
        if not (member.isfile() or member.issym()):
            raise ValueError('Unsupported archive type: ' + member.name)
        data = archive.extractfile(member).read() if member.isfile() else member.linkname.encode()
        mode = '120000' if member.issym() else ('100755' if member.mode & 0o111 else '100644')
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        archived[member.name] = (mode, 'blob', blob)
        check(archived[member.name] == expected.get(member.name), 'Raw Git blob/mode mismatch: ' + member.name)
        if member.name.startswith(ROOT):
            source[member.name] = data
check(set(archived) == set(expected), 'Source archive file set differs from Git')
check(pax.get('comment') == COMMIT, 'Source archive commit metadata differs')
owner_tree = git_identity(APPROVED, ROOT[:-1])
actual_tree = git_identity(COMMIT, ROOT[:-1])
check(owner_tree == actual_tree, 'Hosted native tree differs from reviewed ' + APPROVED)
result['source'] = {'archive_files': len(archived), 'git_files': len(expected), 'raw_blobs_modes_paths_exact': archived == expected,
                    'pax': pax, 'native_files': len(source), 'native_tree': actual_tree, 'approved_native_tree': owner_tree}

# Complete app bundle built from the same source package. Inspect Mach-O metadata, never load it.
with zipfile.ZipFile(P / 'MacDesktop.zip') as archive:
    entries = archive.infolist()
    names = [entry.filename for entry in entries]
    check(len(names) == len(set(names)), 'Duplicate package member')
    for name in names:
        safe(name)
    bad = archive.testzip()
    check(bad is None, 'Package CRC failure: ' + str(bad))
    prefix = 'CompanionDesktop.app/Contents/'
    plist_bytes = archive.read(prefix + 'Info.plist')
    plist = plistlib.loads(plist_bytes)
    binary = archive.read(prefix + 'MacOS/CompanionDesktop')
    binary_entry = archive.getinfo(prefix + 'MacOS/CompanionDesktop')
    check(plist_bytes == source[ROOT + 'Packaging/Info.plist'], 'Bundle plist differs from source')
    check(plist['CFBundleExecutable'] == 'CompanionDesktop' and plist['LSMinimumSystemVersion'] == '15.0', 'Bundle product identity/minOS differs')
    check(bool((binary_entry.external_attr >> 16) & 0o111), 'Packaged binary lacks executable mode')
    magic, cpu, subtype, filetype, ncmds, extent, flags, reserved = struct.unpack_from('<8I', binary)
    check(magic == 0xfeedfacf and cpu == 0x100000c and filetype == 2, 'Expected arm64 Mach-O executable')
    offset = 32
    versions, dylibs, rpaths = [], [], []
    signature = False
    for _ in range(ncmds):
        cmd, size = struct.unpack_from('<II', binary, offset)
        if size < 8 or offset + size > len(binary):
            raise ValueError('Invalid Mach-O command size')
        block = binary[offset:offset + size]
        if cmd in (0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023, 0x8000001c):
            start = struct.unpack_from('<I', block, 8)[0]
            name = block[start:].split(b'\0', 1)[0].decode()
            (rpaths if cmd == 0x8000001c else dylibs).append(name)
        if cmd == 0x32:
            platform, minimum, sdk, tools = struct.unpack_from('<4I', block, 8)
            def version(value):
                return f'{value >> 16}.{value >> 8 & 255}.{value & 255}'
            versions.append({'platform': platform, 'minimum': version(minimum), 'sdk': version(sdk)})
        signature |= cmd == 0x1d
        offset += size
    check(offset == 32 + extent, 'Mach-O command extent differs')
    check(all(d.startswith(('/System/Library/', '/usr/lib/', '@rpath/libswift')) for d in dylibs), 'Unexpected nonplatform dylib')
    result['app'] = {'zip_crc_ok': bad is None, 'entries': names, 'binary_sha256': sha(binary), 'binary_bytes': len(binary),
                     'architecture': 'arm64', 'plist': plist, 'plist_exact_source': plist_bytes == source[ROOT + 'Packaging/Info.plist'],
                     'build_versions': versions, 'dylibs': dylibs, 'rpaths': rpaths, 'linker_signature_present': signature}
manifest = load(P / 'manifest.json')
for target in manifest['targets']:
    prefix = ROOT + target['path'] + '/'
    observed = {name[len(prefix):] for name in source if name.startswith(prefix) and name.endswith('.swift')}
    check(observed == set(target['sources']), 'Build manifest source closure differs: ' + target['name'])
check(manifest['dependencies'] == [] and manifest['swift_languages_versions'] == ['5'], 'Package dependencies/language differ')
check(manifest['platforms'] == [{'name': 'macos', 'version': '15.0'}], 'Package platform differs')
check(any(p['name'] == 'CompanionDesktop' and p['type'] == {'executable': None} for p in manifest['products']), 'Missing executable product')
inputs = [ROOT[:-1], 'scripts/desktop-checks.sh', '.github/workflows/desktop-checks.yml', 'pyproject.toml', 'uv.lock']
input_ids = {name: git_identity(COMMIT, name) for name in inputs}
environment = (P / 'environment.txt').read_text()
check(re.findall(r'^[0-9a-f]{40}$', environment, re.M) == list(input_ids.values()), 'Build input identities differ')
check('commit=' + COMMIT in environment and 'platform=macos' in environment and 'source=' + ROOT[:-1] in environment, 'Wrong build environment source')
check(re.findall(r'^run=(.*)$', environment, re.M) == [RUN_URL], 'Build environment run URL differs')
attempts = re.findall(r'^attempt=(.*)$', environment, re.M)
check(len(attempts) == 1 and re.fullmatch(r'[1-9][0-9]*', attempts[0]) is not None, 'Build environment run attempt differs')
expected_artifact_name = f'desktop-macos-{COMMIT}-{attempts[0]}' if len(attempts) == 1 else None
build_log = (P / 'build-package.log').read_text()
check("Build of product 'CompanionDesktop' complete!" in build_log and 'Linking CompanionDesktop' in build_log, 'No completed executable build')
result['build'] = {'inputs': input_ids, 'manifest': manifest, 'toolchain': (P / 'toolchain.log').read_text(),
                   'product': (P / 'product.txt').read_text(), 'build_log': build_log, 'environment': environment}

# Derive actual XCTest names/counts from logs and compare all declared source tests.
test_log = (P / 'tests.log').read_text()
started = re.findall(r"Test Case '-\[([^]]+)\]' started", test_log)
passed = re.findall(r"Test Case '-\[([^]]+)\]' passed", test_log)
failed = re.findall(r"Test Case '-\[([^]]+)\]' failed", test_log)
source_tests = {name: re.findall(r'func (test\w+)\(', data.decode()) for name, data in source.items() if '/Tests/' in name and name.endswith('.swift')}
declared = [test for tests in source_tests.values() for test in tests]
observed = [name.split()[-1] for name in passed]
check(started == passed and not failed and len(passed) == len(set(passed)), 'Started/passed/failed XCTest set differs')
check(Counter(observed) == Counter(declared), 'Native tests do not exhaust source declarations')
check(len(source_tests) == 7 and len(declared) == 55, 'Uploader milestone must declare 55 tests in 7 source files')
upload_test_file = ROOT + 'Tests/DesktopCaptureTests/MacIngressUploadTests.swift'
upload_test_source = source[upload_test_file].decode()
upload_tests = source_tests[upload_test_file]
check(len(upload_tests) == 8 and all(name in observed for name in upload_tests), 'Uploader tests not fully executed')
check('testUploadsEveryOriginalThenTheExactBatch' in observed, 'Native upload fixture generator test not executed')
check('"status": replies[index].status' in upload_test_source and
      'answers.append((status: reply.status, body: reply.body))' in upload_test_source,
      'Uploaded transcript source does not retain each actual reply status')
summaries = re.findall(r'Executed (\d+) tests?, with (\d+) failures? \((\d+) unexpected\)', test_log)
check(any(int(n) == len(passed) and failures == unexpected == '0' for n, failures, unexpected in summaries), 'No clean full XCTest summary')
mapper_test_file = ROOT + 'Tests/DesktopCaptureTests/MacRetainedFramesTests.swift'
mapper_source = source[mapper_test_file].decode()
mapper_tests = source_tests[mapper_test_file]
check(all(name in observed for name in mapper_tests), 'New native mapper test not executed')
paired_marker = 'the endings recorded in status.json and events.jsonl disagree on reason, detail, live_ended_host; both are kept above and neither is chosen'
check(paired_marker in mapper_source and 'testIncompleteSessionsNeverImplyEmptyInkOrLiveState' in observed, 'Paired-ending native regression evidence missing')
result['tests'] = {'started': len(started), 'passed': len(passed), 'failed': failed, 'names': passed, 'source_declared': len(declared),
                   'source_file_counts': {name: len(tests) for name, tests in source_tests.items()}, 'suite_summaries': summaries,
                   'mapper_tests': mapper_tests, 'upload_tests': upload_tests, 'swift_testing_footer': [line for line in test_log.splitlines() if 'Test run with 0 tests' in line],
                   'paired_ending_evidence': 'Assertions in exact-source testIncompleteSessionsNeverImplyEmptyInkOrLiveState executed successfully; its scratch conflicting session is not an exported fixture'}

# Summarize actual logged checker categories; do not relabel them XCTest cases.
checker_summaries = {'ingress-fixture.log': 'all desktop ingress fixture checks passed',
                     'composed-fixture.log': 'all composed fixture checks passed',
                     'mac-frame-fixture.log': 'all Mac retained-frame fixture checks passed',
                     'mac-upload-fixture.log': 'all Mac upload fixture checks passed'}
result['checkers'] = {}
checker_lines = {}
for filename, summary in checker_summaries.items():
    lines = (P / filename).read_text().splitlines()
    checker_lines[filename] = lines
    positive = [line for line in lines if line.startswith('PASS ')]
    negative = [line for line in lines if line.startswith(('FAIL', 'ERROR'))]
    check(lines[-1] == summary and not negative, 'Incomplete/failed checker: ' + filename)
    result['checkers'][filename] = {'pass_lines': len(positive), 'fail_lines': len(negative), 'summary': lines[-1],
                                    'native_refusal_lines': sum(line.startswith('PASS refusal ') for line in lines),
                                    'python_refusal_mutations': sum(line.startswith(('PASS mapping ', 'PASS request ')) and 'is refused' in line for line in lines),
                                    'negative_control_lines': sum(line.startswith(('PASS negative control', 'PASS control: ')) for line in lines)}

upload_lines = checker_lines['mac-upload-fixture.log']
upload_pass = [line for line in upload_lines if line.startswith('PASS ')]
upload_controls = [line for line in upload_pass if line.startswith('PASS control: ')]
check(len(upload_pass) == 24 and len(upload_controls) == 18 and len(set(upload_pass)) == 24,
      'Upload checker must log 24 distinct passes including 18 controls')
for method in ['PUT', 'POST']:
    check(f'PASS control: a {method} answered 403 with its unchanged success body is refused' in upload_controls,
          'Missing wrong-status upload checker control: ' + method)
check(any(line.startswith('PASS the fixture set is not vacuous') for line in upload_pass),
      'Upload checker non-vacuity evidence missing')

# Bounded original-byte/header inspection across all five retained native fixture families.
# No new pixel renderer, image library, mutation suite, or owner checker is run here.
result['sessions'] = []
session_data = {}
for family in ['macos-fixture', 'macos-ingress-fixture', 'macos-composed-fixture', 'macos-retained-frame-fixture', 'macos-upload-fixture']:
    statuses = list((P / family).rglob('status.json'))
    check(len(statuses) == 1, 'Unexpected retained session count: ' + family)
    for status_path in statuses:
        directory = status_path.parent
        status = load(status_path)
        events = [json.loads(line) for line in (directory / 'events.jsonl').read_text().splitlines()]
        kept = [event['frame'] for event in events if event['event'] == 'kept']
        composed = [event['composed'] for event in events if event['event'] == 'composed']
        refused = [event for event in events if event['event'] == 'not_composed']
        facts = {}
        for item in kept + composed:
            name = item['file']; safe(name)
            data = (directory / name).read_bytes()
            check(sha(data) == item['sha256'] and len(data) == item['byteLength'], 'Retained original hash/length differs: ' + str(directory / name))
            check(data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR', 'Retained file is not PNG: ' + name)
            width, height, depth, color = struct.unpack_from('>IIBB', data, 16)
            check((width, height) == (item['width'], item['height']), 'Retained PNG geometry differs: ' + name)
            facts[name] = {'sha256': sha(data), 'bytes': len(data), 'width': width, 'height': height, 'bit_depth': depth, 'color_type': color}
        actual_pngs = {file.relative_to(directory).as_posix() for file in directory.rglob('*.png')}
        check(actual_pngs == set(facts), 'Unreferenced/missing fixture PNG: ' + family)
        check(status['keptFrames'] == len(kept) and status['bytesKept'] == sum(item['byteLength'] for item in kept), 'Status kept counters differ: ' + family)
        check(status.get('composedFrames', 0) == len(composed), 'Status composed count differs: ' + family)
        check(status.get('notComposed', {}) == dict(Counter(event['detail']['reason'] for event in refused)), 'Status refusal count differs: ' + family)
        check(status.get('composedBytes', 0) == sum(value['bytes'] for name, value in facts.items() if name.startswith('composed/')), 'Status composed byte count differs: ' + family)
        check(status['eventWriteFailures'] == status['statusWriteFailures'] == 0, 'Fixture write failure: ' + family)
        gaps = [event['run']['kind'] if event['event'] == 'run' else event['detail']['kind'] for event in events
                if (event['event'] == 'run' and event['run']['isGap']) or event['event'] == 'gap']
        result['sessions'].append({'family': family, 'path': directory.relative_to(P).as_posix(), 'events': len(events),
                                   'kept_sequences': [item['sequence'] for item in kept], 'composed_sequences': [item['rawSequence'] for item in composed],
                                   'refusals': refused, 'gaps': gaps, 'status': status, 'pngs': facts})
        session_data[family] = (directory, status, events, kept, composed, refused)

# Exhaust saved old ingress refusal records, plus all new native Swift refusal records.
result['fixture_manifests'] = {}
for family, checker in [('macos-ingress-fixture', 'ingress-fixture.log'), ('macos-retained-frame-fixture', 'mac-frame-fixture.log')]:
    evidence = load(P / family / 'manifest.json')
    refusals = [case for case in evidence['cases'] if case['type'] == 'refusal']
    check(len({case['name'] for case in refusals}) == len(refusals), 'Duplicate Swift refusal name: ' + family)
    for case in refusals:
        check(bool(case['expected']) and case['expected'] in case['reason'] and not case['reason'].startswith(('unexpected error', 'NOT REFUSED')),
              'Missing expected native refusal: ' + case['name'])
    logged_names = [re.match(r'PASS refusal ([^:]+):', line).group(1) for line in checker_lines[checker] if line.startswith('PASS refusal ')]
    check(Counter(logged_names) == Counter(case['name'] for case in refusals), 'Native refusal records/checker names differ: ' + family)
    result['fixture_manifests'][family] = {'generator': evidence['generator'], 'synthetic_label': evidence['synthetic'],
                                          'case_types': dict(Counter(case['type'] for case in evidence['cases'])),
                                          'native_refusals': refusals, 'manifest_sha256': sha((P / family / 'manifest.json').read_bytes())}

# Immutable ink originals remain separate from the released Mac descriptor and PNG bindings.
# Compare their actual JSON bytes and native association; do not substitute mutable ink/ink.json.
def ink_original(item, composed, session_dir, source_ref):
    supplied = item.get('ink_original_bindings')
    check(isinstance(supplied, list), 'Missing explicit ink_original_bindings list')
    if not isinstance(supplied, list):
        return {'status': 'malformed'}
    original = composed.get('inkOriginal') if composed else None
    if original is None or original.get('status') != 'retained':
        check(supplied == [], 'Ink binding offered without a retained native original')
        state = 'not_recorded' if original is None else original['status']
        check(state in {'not_recorded', 'no_document', 'unavailable'}, 'Unknown native ink-original status')
        if state == 'no_document':
            check(composed['ink'].get('document') is None and original.get('file') is None,
                  'No-document original contradicts paired ink')
        if state == 'unavailable':
            check(bool(original.get('problem')) and original.get('file') is None,
                  'Unavailable original lacks its reason or claims a file')
        return {'status': state, 'native_record': original, 'bindings': supplied}
    name, digest, length = original['file'], original['sha256'], original['byteLength']
    check(re.fullmatch('[0-9a-f]{64}', digest) is not None and name == f'ink-originals/{digest}.json',
          'Immutable ink filename/digest differs')
    safe(name)
    folder, file = session_dir / 'ink-originals', session_dir / name
    check(not folder.is_symlink() and folder.is_dir() and not file.is_symlink() and file.is_file(),
          'Immutable ink file/directory is missing or linked')
    check(file.resolve().is_relative_to(session_dir.resolve()), 'Immutable ink resolves outside native session')
    data = file.read_bytes()
    check(sha(data) == digest and len(data) == length and 1 <= length <= 33_554_432,
          'Immutable ink bytes differ from native identity')
    check(original['mediaType'] == 'application/json', 'Immutable original is not JSON')
    document = json.loads(data)
    paired, reference = composed['ink'], composed['ink']['document']
    check([document['revision'], document['createdInSession'], document['displayID'], original['documentFile'],
           original['createdInSession'], original['pairedRevision']] ==
          [original['documentRevision'], reference['createdInSession'], reference['displayID'], reference['file'],
           reference['createdInSession'], paired['revision']], 'Immutable document/paired identity differs')
    revision = original['pairedRevision']
    check(type(revision) is int and 0 <= revision <= document['revision'], 'Paired revision is outside frozen history')
    visible = set()
    for operation in document['operations']:
        if operation['kind'] in {'stroke', 'erase', 'undo', 'redo'} and operation['revision'] <= revision:
            visible.difference_update(operation['removed'])
            visible.update(operation['added'])
    check([stroke['id'] for stroke in document['strokes'] if stroke['id'] in visible] == paired['strokes'],
          'Frozen history does not reproduce paired visible strokes')
    check(all(type(original.get(key)) is bool for key in ['pendingGesture', 'pendingAskRegion']),
          'Pending gesture/ASK flags are not explicit booleans')
    check(len(supplied) == 1, 'Retained original does not have exactly one editable binding')
    for binding in supplied:
        ref = binding['artifact']
        check(set(binding) == {'contract_version', 'source', 'kind', 'artifact'} and
              set(ref) == {'artifact_id', 'sha256', 'byte_length', 'media_type'} and
              binding['contract_version'] == '0.2.2' and binding['kind'] == 'editable_ink' and binding['source'] == source_ref,
              'Immutable ink binding shape/kind/source differs')
        check(isinstance(ref['artifact_id'], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', ref['artifact_id']) is not None,
              'Immutable artifact identifier malformed')
        check([ref['sha256'], ref['byte_length'], ref['media_type']] == [digest, length, 'application/json'],
              'Editable binding does not name exact immutable bytes')
    return {'status': 'retained', 'native_record': original, 'bindings': supplied, 'sha256': sha(data), 'bytes': len(data),
            'document_revision': document['revision'], 'paired_revision': revision,
            'operations': document['operations'], 'strokes': document['strokes'], 'selections': document['selections'],
            'undo_stack': document['undoStack'], 'redo_stack': document['redoStack']}

# Link every new saved descriptor and binding directly to emitted native records/originals.
family = 'macos-retained-frame-fixture'
evidence = load(P / family / 'manifest.json')
directory, status, events, kept, composed, refused = session_data[family]
check(P / family / safe(evidence['native_session']) == directory, 'New manifest native session differs')
raw_by_seq = {item['sequence']: item for item in kept}
composed_by_seq = {item['rawSequence']: item for item in composed}
refused_by_seq = {int(event['detail']['sequence']): event for event in refused}
source_ref = {key: evidence['display_source'][key] for key in ['source_id', 'source_version', 'user_id']}
mapping_summaries = []
for case in evidence['cases']:
    if case['type'] != 'mapping':
        continue
    mapping = case['mapping']
    check(not mapping['refused'], 'Saved positive mapping contains refused entries: ' + case['name'])
    check([item['callback_sequence'] for item in mapping['described']] == list(raw_by_seq), 'Mapping misses/reorders retained callbacks')
    rows = []
    for item in mapping['described']:
        frame = item['frame']; seq = item['callback_sequence']; raw = raw_by_seq[seq]
        check(frame['frame_id'] == item['frame_id'] and frame['callback_sequence'] == seq, 'Wrapper frame identity differs')
        check(frame['contract_version'] == '0.2.11' and frame['source'] == source_ref, 'Descriptor source/version differs')
        for key in ['session_id', 'device_id', 'stream_id']:
            check(frame[key] == evidence['display_source'][key], 'Descriptor incarnation differs: ' + key)
        check(all(frame[key] is None for key in ['captured_at', 'capture_latency_ms', 'media_position', 'pixel_orientation']), 'Unknown timing/geometry invented')
        profile = frame['profile']; clock = profile['host_clock']
        check(profile['native_session_id'] == status['session'] == directory.name, 'Native session identity differs')
        expected_clock = {'basis': 'mach_absolute_time_seconds', 'callback_seconds': raw['callbackHost'],
                          'display_time_seconds': raw['facts'].get('displayTimeSeconds'),
                          'display_time_ticks_decimal': str(raw['facts']['displayTimeTicks']) if 'displayTimeTicks' in raw['facts'] else None,
                          'session_started_seconds': status['startedHost'], 'session_started_wall_utc': status['startedWall'],
                          'source_seconds': raw.get('sourceHost'), 'source_time_lead_tolerance_seconds': status['settings']['sourceTimeLeadTolerance']}
        check(clock == expected_clock, 'Native clock preservation differs: ' + str(seq))
        check(profile['display_at_start']['scope'] == status['display']['scope'], 'Capture scope differs')
        images = [(frame['raw'], raw)]
        outcome = frame['composition']
        if seq in composed_by_seq:
            native = composed_by_seq[seq]
            check(outcome['kind'] == 'composed', 'Lost composed outcome')
            images.append((outcome['image'], native))
            for key, native_key in [('raw_file', 'rawFile'), ('raw_sha256', 'rawSHA256'), ('raw_byte_length', 'rawByteLength'), ('raw_sequence', 'rawSequence'), ('composed_host_seconds', 'composedHost')]:
                check(outcome[key] == native[native_key], 'Composition identity differs: ' + key)
            for key, native_key in [('revision', 'revision'), ('revision_host_seconds', 'revisionHost'), ('pixels_host_seconds', 'pixelsHost'), ('pixels_time', 'pixelsTime'), ('strokes', 'strokes'), ('mapping', 'mapping'), ('rendering', 'rendering'), ('limits', 'limits')]:
                check(outcome['ink'][key] == native['ink'].get(native_key), 'Ink pairing differs: ' + key)
            doc = native['ink'].get('document')
            expected_doc = None if doc is None else {'created_in_session': doc['createdInSession'], 'display_id': doc['displayID'], 'file': doc['file']}
            check(outcome['ink']['document'] == expected_doc, 'Editable document identity differs')
            if doc:
                safe(doc['file'])
                check((directory.parent / doc['file']).is_file(), 'Named editable document missing')
        elif seq in refused_by_seq:
            event = refused_by_seq[seq]
            check(outcome == {'kind': 'not_composed', 'callback_sequence': seq, 'host_seconds': event['host'],
                              'reason': event['detail']['reason'], 'detail': event['detail']['detail']}, 'Lost refusal details')
        else:
            check(outcome == {'kind': 'unknown', 'reason': 'no_retained_outcome'}, 'Missing outcome represented as known')
        expected_bindings = {}
        for image, native in images:
            artifact = image['artifact']
            check((image['native_file'], image['width'], image['height'], image['encoding']) == (native['file'], native['width'], native['height'], native['encoding']), 'PNG metadata differs')
            check((artifact['sha256'], artifact['byte_length'], artifact['media_type']) == (native['sha256'], native['byteLength'], 'image/png'), 'Original artifact facts differ')
            expected_bindings[artifact['artifact_id']] = {'artifact': artifact, 'contract_version': '0.2.2', 'kind': 'screen_image', 'source': source_ref}
        check({binding['artifact']['artifact_id']: binding for binding in item['bindings']} == expected_bindings and len(item['bindings']) == len(expected_bindings), 'Original bindings/alias dedup differ')
        immutable = ink_original(item, composed_by_seq.get(seq), directory, source_ref)
        rows.append({'sequence': seq, 'kind': outcome['kind'], 'ink_original': immutable, 'binding_count': len(item['bindings']), 'revision': outcome.get('ink', {}).get('revision'),
                     'revision_host_seconds': outcome.get('ink', {}).get('revision_host_seconds'), 'pixels_time': outcome.get('ink', {}).get('pixels_time')})
    mapping_summaries.append({'name': case['name'], 'described': len(rows), 'rows': rows, 'unrepresented': mapping['unrepresented']})
# Every retained JSON file is accounted for by native records, including byte reuse.
retained_records = [value['inkOriginal'] for value in composed if value.get('inkOriginal', {}).get('status') == 'retained']
retained_names = {value['file'] for value in retained_records}
ink_folder = directory / 'ink-originals'
actual_ink_names = {file.relative_to(directory).as_posix() for file in ink_folder.iterdir()} if ink_folder.is_dir() else set()
check(retained_names == actual_ink_names and bool(retained_names), 'Missing/extra immutable ink files or vacuous old fixture')
check(status.get('inkOriginalFiles') == len(retained_names), 'Status immutable file count differs')
check(status.get('inkOriginalBytes') == sum((directory / name).stat().st_size for name in retained_names), 'Status immutable byte count differs')
check(status.get('inkOriginalsUnavailable') == sum(value.get('inkOriginal', {}).get('status') == 'unavailable' for value in composed),
      'Status unavailable-ink count differs')
result['immutable_ink'] = {'files': sorted(retained_names), 'native_retained_associations': len(retained_records),
                           'native_states': dict(Counter(value.get('inkOriginal', {}).get('status', 'not_recorded') for value in composed)),
                           'limits': 'Native association/pending/freeze fields remain evidence here, not invented descriptor or transport fields'}
jpeg = [case for case in evidence['cases'] if case['type'] == 'refusal' and 'jpeg' in case['name']]
check({case['name'] for case in jpeg} == {'jpeg_bytes_helper', 'raw_jpeg_as_png', 'composed_jpeg_as_png'}, 'JPEG native regression case missing')
result['retained_mapping'] = {'mapping_cases': mapping_summaries, 'jpeg_native_refusals': jpeg,
                              'native_fixture_open_ended': 'ending' not in status,
                              'mutable_live_ink_sha256': sha((directory / 'ink/ink.json').read_bytes()),
                              'byte_and_record_linkage': 'All saved mapped PNG/binding facts, native clocks, outcomes and ink pairing fields compared directly to retained session bytes/events'}

# Bind the new uploader transcript to its Swift generator, saved session and exact bytes.
# Do not rerun its checker, mutate controls, or replay anything; the separate composition
# consumes these same hashes and runs the unchanged Swift requests through actual ASGI.
upload_dir = P / 'macos-upload-fixture'
upload_manifest = load(upload_dir / 'manifest.json')
generator = 'DesktopCaptureTests.testUploadsEveryOriginalThenTheExactBatch'
check(upload_manifest['generator'] == generator and f'"generator": "{generator}"' in upload_test_source,
      'Upload fixture generator differs from executed native source')
label = upload_manifest['synthetic']
check(isinstance(label, str) and bool(label) and f'"synthetic": "{label}"' in upload_test_source,
      'Upload fixture provenance label differs from exact native source')
check('in-process stand-in host, not HTTP or the Backend' in label,
      'Upload fixture omits its synthetic transport boundary')
upload_session, upload_status, upload_events, upload_kept, upload_composed, upload_refused = session_data['macos-upload-fixture']
check(upload_dir / safe(upload_manifest['native_session']) == upload_session,
      'Upload manifest points at another retained session')

def upload_bytes(name):
    file = upload_dir / safe(name)
    if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(upload_dir.resolve()):
        raise ValueError('Upload evidence is missing, linked or outside the fixture: ' + name)
    return file.read_bytes()

request_bytes = upload_bytes(upload_manifest['request_file'])
upload_request = json.loads(request_bytes)
batch = upload_request['batch']
records = batch['records']
check(upload_manifest['request_file'] == 'request.json' and 1 <= len(request_bytes) <= 4_194_304,
      'Upload prepared request path/byte bound differs')
check(upload_request['contract_version'] == '0.2.12' and batch['contract_version'] == '0.2.0',
      'Upload request versions differ')
check(len(records) == len(upload_request['frames']) == len(upload_kept) == 8,
      'Upload fixture does not preserve all eight native kept frames')
check([{'record_id': item['record_id'], 'sequence': item['sequence']} for item in records] == upload_manifest['records'],
      'Upload records differ from saved plan identities')
source_ref = records[0]['source']
check(source_ref['user_id'] == upload_manifest['user_id'] and all(item['source'] == source_ref for item in records),
      'Upload records do not share the declared source owner')
ordered_refs = {}
for record in records:
    for reference in record['artifacts']:
        check(ordered_refs.setdefault(reference['artifact_id'], reference) == reference,
              'Upload record artifact identity changes')
originals = upload_manifest['originals']
check(len(originals) == len(ordered_refs) == 14 and [item['artifact_id'] for item in originals] == list(ordered_refs),
      'Upload original plan does not exhaust references once in record order')
exchanges = upload_manifest['exchanges']
check([item['method'] for item in exchanges] == ['PUT'] * len(originals) + ['POST'],
      'Upload transcript is not every distinct original before the batch')
check(all(type(item['status']) is int and item['status'] == 200 for item in exchanges),
      'Upload transcript includes an unconfirmed actual reply status')
headers = {'Authorization': 'Bearer <synthetic token>', 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json'}
transcript_files = set()
exchange_receipts = []
original_bindings = {}
for index, exchange in enumerate(exchanges):
    expected_files = [f'exchanges/{index:02d}-request.json', f'exchanges/{index:02d}-reply.json']
    check([exchange['request_file'], exchange['reply_file']] == expected_files,
          'Upload transcript file ordinal differs')
    transcript_files.update(expected_files)
    request_data, reply_data = [upload_bytes(name) for name in expected_files]
    exchange_receipts.append({'method': exchange['method'], 'path': exchange['path'], 'status': exchange['status'],
                              'request_sha256': sha(request_data), 'reply_sha256': sha(reply_data)})
    if exchange['method'] == 'PUT':
        planned = originals[index]
        identifier = planned['artifact_id']
        reference = ordered_refs[identifier]
        check(exchange['path'] == '/v2/process/originals/' + identifier and exchange['headers'] == headers,
              'Original PUT route or exact headers differ')
        body = json.loads(request_data)
        binding = {key: body[key] for key in ['contract_version', 'source', 'artifact', 'kind']}
        original_bindings[identifier] = binding
        native_file = upload_session / safe(planned['file'])
        if not native_file.is_file() or native_file.is_symlink() or not native_file.resolve().is_relative_to(upload_session.resolve()):
            raise ValueError('Planned original is missing, linked or outside the session')
        data = native_file.read_bytes()
        decoded = base64.b64decode(body['data_base64'], validate=True)
        check(decoded == data and base64.b64encode(decoded).decode() == body['data_base64'],
              'Original PUT does not contain canonical exact native bytes')
        check(binding == {'contract_version': '0.2.2', 'source': source_ref, 'artifact': reference, 'kind': planned['kind']},
              'Original PUT binding differs from the Process source/reference')
        check([reference['sha256'], reference['byte_length'], reference['media_type']] ==
              [sha(data), len(data), planned['media_type']] ==
              [planned['sha256'], planned['byte_length'], planned['media_type']], 'Planned/uploaded original facts differ')
        if planned['kind'] == 'editable_ink':
            check(planned['file'] == f"ink-originals/{sha(data)}.json" and planned['media_type'] == 'application/json' and
                  data != (upload_session / 'ink/ink.json').read_bytes(), 'Mutable or non-JSON ink substituted in upload')
        else:
            check(planned['kind'] == 'screen_image' and planned['media_type'] == 'image/png', 'Unknown uploaded original kind')
        check(json.loads(reply_data) == dict(binding, status='bytes_committed'), 'Saved PUT receipt differs from exact binding')
    else:
        check(exchange['path'] == '/v2/process/macos-frames:batch' and request_data == request_bytes and
              exchange['headers'] == dict(headers, **{'Idempotency-Key': upload_manifest['idempotency_key']}),
              'POST differs from prepared request/key/headers')
        ack = json.loads(reply_data)
        expected_ack = {'contract_version': '0.2.0', 'batch_id': batch['batch_id'], 'user_id': upload_manifest['user_id'],
                        **{key: batch[key] for key in ['device_id', 'session_id', 'stream_id']}}
        check({key: value for key, value in ack.items() if key != 'acknowledged'} == expected_ack and
              len(ack['acknowledged']) == len(records), 'Saved ACK identity/count differs')
        for record, receipt in zip(records, ack['acknowledged']):
            check(receipt == {'record_id': record['record_id'], 'sequence': record['sequence'], 'disposition': 'accepted',
                              'received_at': '2026-09-30T19:40:00.123456Z', 'envelope': 'committed',
                              'artifacts': [dict(reference, status='verified') for reference in record['artifacts']]},
                  'Saved stand-in ACK does not acknowledge the exact ordered record')
actual_exchanges = {file.relative_to(upload_dir).as_posix() for file in (upload_dir / 'exchanges').rglob('*') if file.is_file()}
check(actual_exchanges == transcript_files, 'Upload transcript file set differs')
check(upload_manifest['result'] == 'committed' and upload_manifest['committed_originals'] == list(ordered_refs),
      'Swift upload result disagrees with the transcript')
frames = {item['frame_id']: item for item in upload_request['frames']}
composed_by_sequence = {item['rawSequence']: item for item in upload_composed}
ink_associations = []
for record in records:
    frame = frames[record['frame_id']]
    bindings = [original_bindings[ref['artifact_id']] for ref in record['artifacts'] if ref['media_type'] == 'application/json']
    ink_associations.append(ink_original({'ink_original_bindings': bindings},
                                       composed_by_sequence.get(frame['callback_sequence']), upload_session, source_ref))
corpus = upload_manifest['utc_corpus']
check(len(corpus) == 40_320 and {item['swift_valid'] for item in corpus} == {True, False} and
      all(type(item['swift_valid']) is bool for item in corpus), 'Actual Swift UTC corpus missing/vacuous')
check(f'PASS UtcTimestamp verdicts equal the released validator on {len(corpus)} strings' in upload_pass,
      'Logged checker did not compare the actual Swift UTC corpus')
result['upload_fixture'] = {'generator': generator, 'synthetic_label': label,
                            'manifest_sha256': sha((upload_dir / 'manifest.json').read_bytes()),
                            'request_sha256': sha(request_bytes), 'request_bytes': len(request_bytes),
                            'native_session': upload_session.relative_to(P).as_posix(), 'records': len(records),
                            'frames': len(frames), 'originals': originals, 'exchange_count': len(exchanges),
                            'exchanges': exchange_receipts, 'immutable_ink_associations': ink_associations,
                            'utc_corpus_size': len(corpus),
                            'transport': 'Actual Swift-emitted bytes to an in-process synthetic host; not HTTP/Backend or provider execution'}

# Saved run/artifact receipts, without external querying. Outer ZIP service digest is reported, not independently recomputed.
run_path = args.run_metadata or Path(str(P) + '-run.json')
artifact_path = args.artifact_metadata or Path(str(P) + '-artifacts.json')
run = load(run_path); artifacts = load(artifact_path)
check(run['headSha'] == COMMIT and run['status'] == 'completed' and run['conclusion'] in {'success', 'failure'}, 'Run source/result differs')
check(run['url'] == RUN_URL, 'Run receipt URL differs')
mac_jobs = [job for job in run['jobs'] if job['name'] == 'desktop (macos)']
check(len(mac_jobs) == 1, 'Expected exactly one macOS hosted job')
mac_job = mac_jobs[0] if len(mac_jobs) == 1 else {}
check(mac_job.get('status') == 'completed' and mac_job.get('conclusion') == 'success', 'macOS hosted job did not succeed')
check(re.fullmatch(re.escape(RUN_URL) + r'/job/[1-9][0-9]*', mac_job.get('url', '')) is not None, 'macOS job run URL differs')
for name in ['Check and package exact desktop source', 'Upload available source, checks and development artifacts']:
    check(any(step['name'] == name and step['conclusion'] == 'success' for step in mac_job.get('steps', [])), 'Required hosted step did not succeed: ' + name)
check(artifacts['total_count'] == len(artifacts['artifacts']), 'Artifact receipt listing is incomplete')
mac_artifacts = [artifact for artifact in artifacts['artifacts'] if artifact['name'] == expected_artifact_name]
check(len(mac_artifacts) == 1, 'Expected exactly one macOS artifact for this source and run attempt')
artifact = mac_artifacts[0] if len(mac_artifacts) == 1 else {}
artifact_run = artifact.get('workflow_run', {})
check(artifact_run.get('id') == RUN and artifact_run.get('head_sha') == COMMIT and artifact_run.get('head_branch') == 'main', 'Artifact source receipt differs')
check(artifact.get('expired') is False, 'macOS artifact is expired or missing')
hosted = load(P / 'result.json')
check(hosted['state'] == 'checks-completed' and hosted['exit_code'] == 0 and hosted['last_phase'] == 'complete', 'Hosted result incomplete')
for key in ['interactive_runtime_verified', 'provider_verified', 'project_signing_performed']:
    check(hosted[key] is False, 'Unexpected runtime/provider/signing claim: ' + key)
siblings = [{key: job.get(key) for key in ['name', 'status', 'conclusion', 'url']} for job in run['jobs'] if job is not mac_job]
result['hosted'] = {'evidence_scope': 'macOS job and artifact only; not an overall workflow gate pass',
                    'overall_run_conclusion': run['conclusion'], 'overall_run_success': run['conclusion'] == 'success',
                    'selected_macos_job': mac_job, 'sibling_jobs': siblings,
                    'result': hosted, 'run_receipt': run, 'artifact_receipt': artifact,
                    'receipt_hashes': {path.name: sha(path.read_bytes()) for path in [run_path, artifact_path]},
                    'outer_service_zip_digest_independently_verified': False}
result['anomalies'] = issues
result['verdict'] = 'APPROVE bounded macOS hosted build/test/artifact evidence' if not issues else 'HOLD for listed discrepancies'
OUT.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'verdict': result['verdict'], 'checksummed_files': len(checksums), 'git_files': len(archived),
                  'overall_run_conclusion': run['conclusion'], 'sibling_jobs': siblings,
                  'native_tree': actual_tree, 'xctests_passed': len(passed), 'checkers': result['checkers'],
                  'native_mac_refusals': len(result['fixture_manifests']['macos-retained-frame-fixture']['native_refusals']),
                  'jpeg_refusals': len(jpeg), 'upload_exchanges': len(exchanges), 'anomalies': issues, 'json': str(OUT)}, indent=2))
raise SystemExit(bool(issues))
