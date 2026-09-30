#!/usr/bin/env python3
"""Read saved hosted evidence only. No builds, test runners, extraction or app execution."""
from pathlib import Path, PurePosixPath
from collections import Counter
import hashlib
import json
import plistlib
import re
import struct
import subprocess
import tarfile
import zipfile

REPO = Path('/home/agentsdock/Projects/learning-companion/repo')
P = Path('/tmp/lc-macos-36752548728')
COMMIT = 'ef487cfcfaa7110ddb86c339c2065d0b12f21221'
APPROVED = '49e5b75fe7a0ddda5aa2f82930fa0ea3a6512107'
RUN = 36752548728
OUT = Path('/tmp/macos-retained-36752548728-audit.json')
ROOT = 'apps/macos/CompanionDesktop/'
issues = []
result = {'commit': COMMIT, 'run': RUN, 'scope': 'Saved artifact inspection, no native execution or test rerun'}

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
check(owner_tree == actual_tree, 'Hosted native tree differs from reviewed 49e5b75')
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
                   'mapper_tests': mapper_tests, 'swift_testing_footer': [line for line in test_log.splitlines() if 'Test run with 0 tests' in line],
                   'paired_ending_evidence': 'Assertions in exact-source testIncompleteSessionsNeverImplyEmptyInkOrLiveState executed successfully; its scratch conflicting session is not an exported fixture'}

# Summarize actual logged checker categories; do not relabel them XCTest cases.
checker_summaries = {'ingress-fixture.log': 'all desktop ingress fixture checks passed',
                     'composed-fixture.log': 'all composed fixture checks passed',
                     'mac-frame-fixture.log': 'all Mac retained-frame fixture checks passed'}
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
                                    'negative_control_lines': sum(line.startswith('PASS negative control') for line in lines)}

# Bounded original-byte/header inspection across all four retained native fixture families.
# No new pixel renderer, image library, mutation suite, or owner checker is run here.
result['sessions'] = []
session_data = {}
for family in ['macos-fixture', 'macos-ingress-fixture', 'macos-composed-fixture', 'macos-retained-frame-fixture']:
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
        rows.append({'sequence': seq, 'kind': outcome['kind'], 'binding_count': len(item['bindings']), 'revision': outcome.get('ink', {}).get('revision'),
                     'revision_host_seconds': outcome.get('ink', {}).get('revision_host_seconds'), 'pixels_time': outcome.get('ink', {}).get('pixels_time')})
    mapping_summaries.append({'name': case['name'], 'described': len(rows), 'rows': rows, 'unrepresented': mapping['unrepresented']})
jpeg = [case for case in evidence['cases'] if case['type'] == 'refusal' and 'jpeg' in case['name']]
check({case['name'] for case in jpeg} == {'jpeg_bytes_helper', 'raw_jpeg_as_png', 'composed_jpeg_as_png'}, 'JPEG native regression case missing')
result['retained_mapping'] = {'mapping_cases': mapping_summaries, 'jpeg_native_refusals': jpeg,
                              'native_fixture_open_ended': 'ending' not in status,
                              'actual_ink_sha256': sha((directory / 'ink/ink.json').read_bytes()),
                              'byte_and_record_linkage': 'All saved mapped PNG/binding facts, native clocks, outcomes and ink pairing fields compared directly to retained session bytes/events'}

# Saved run/artifact receipts, without external querying. Outer ZIP service digest is reported, not independently recomputed.
run_path = Path(str(P) + '-run.json'); artifact_path = Path(str(P) + '-artifacts.json')
run = load(run_path); artifacts = load(artifact_path)
check(run['headSha'] == COMMIT and run['status'] == 'completed' and run['conclusion'] == 'success', 'Run source/result differs')
check(len(run['jobs']) == 1 and run['jobs'][0]['name'] == 'desktop (macos)' and run['jobs'][0]['conclusion'] == 'success', 'Unexpected hosted job')
for name in ['Check and package exact desktop source', 'Upload available source, checks and development artifacts']:
    check(any(step['name'] == name and step['conclusion'] == 'success' for step in run['jobs'][0]['steps']), 'Required hosted step did not succeed: ' + name)
check(artifacts['total_count'] == len(artifacts['artifacts']) == 1, 'Unexpected artifact receipt count')
artifact = artifacts['artifacts'][0]
check(artifact['workflow_run']['id'] == RUN and artifact['workflow_run']['head_sha'] == COMMIT and artifact['workflow_run']['head_branch'] == 'main', 'Artifact source receipt differs')
check(artifact['name'] == f'desktop-macos-{COMMIT}-1' and artifact['expired'] is False, 'Artifact name/expiry differs')
hosted = load(P / 'result.json')
check(hosted['state'] == 'checks-completed' and hosted['exit_code'] == 0 and hosted['last_phase'] == 'complete', 'Hosted result incomplete')
for key in ['interactive_runtime_verified', 'provider_verified', 'project_signing_performed']:
    check(hosted[key] is False, 'Unexpected runtime/provider/signing claim: ' + key)
result['hosted'] = {'result': hosted, 'run_receipt': run, 'artifact_receipt': artifact,
                    'receipt_hashes': {path.name: sha(path.read_bytes()) for path in [run_path, artifact_path]},
                    'outer_service_zip_digest_independently_verified': False}
result['anomalies'] = issues
result['verdict'] = 'APPROVE bounded hosted build/test/artifact evidence' if not issues else 'HOLD for listed discrepancies'
OUT.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'verdict': result['verdict'], 'checksummed_files': len(checksums), 'git_files': len(archived),
                  'native_tree': actual_tree, 'xctests_passed': len(passed), 'checkers': result['checkers'],
                  'native_mac_refusals': len(result['fixture_manifests']['macos-retained-frame-fixture']['native_refusals']),
                  'jpeg_refusals': len(jpeg), 'anomalies': issues, 'json': str(OUT)}, indent=2))
raise SystemExit(bool(issues))
