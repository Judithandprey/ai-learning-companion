#!/usr/bin/env python3
"""Compose actual supplied Swift MacRetainedFramesTests output through the API and Learning.

From the repository, with its existing locked backend/test Python environment:
  .venv/bin/python /tmp/macos-ink-http-composition.py FIXTURE_DIR --artifact-audit AUDIT.json --output RECEIPT.json
Use --repo when running elsewhere. Missing files fail; no substitute fixture is generated.
The owner checker/Swift run and artifact provenance are verified separately, not rerun here.

Descriptors and supplied original bindings stay unchanged. Only a Process envelope is
constructed, using the existing owner's batch_for helper. Each alternate mapping plan
uses a pristine MemoryStore because their immutable frame IDs deliberately overlap.
Runtime consent, identity authority and token are explicitly synthetic. No listener,
database, display capture or provider. Only emitted immutable ink_original_bindings
are uploaded as editable_ink. Mutable ink paths are never substituted; native
association fields stay outside the wire descriptor. Generic artifact schemas do
not certify native paired/snapshot revision or gesture state.
"""
import argparse
import base64
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fixture_hashes(directory):
    return {p.relative_to(directory).as_posix(): digest(p.read_bytes())
            for p in sorted(directory.rglob('*')) if p.is_file()}


def require_refusal(call, status):
    try:
        call()
    except DomainError as error:
        assert error.status == status, (error.status, error.code)
        return {'status': error.status, 'error': error.code, 'packet_returned': False}
    raise AssertionError('Current authorization unexpectedly returned a packet')


def consumers(c, runtime):
    def guard(state):
        principal = runtime.app.state.authenticator.authenticate(TOKEN, c.instant[0])
        if (principal != runtime.principal or 'sources:read' not in principal.scopes
                or state.get('generation') != principal.authorization_generation):
            raise DomainError(403, 'forbidden')
    return (AuthorizedProcessContextReader(c.store, c.user, guard).read_macos,
            AuthorizedImageResolver(c.store, c.user, guard))


def prepare(c, runtime, ids):
    actual_read, images = consumers(c, runtime)
    selections = []

    def read(selection, **limits):
        selections.append(selection.copy())
        return actual_read(selection, **limits)

    packet = prepare_observation_window(ids, read, images, user_id=c.user,
                                        macos_resolver=images.resolve_macos,
                                        max_metadata_bytes=1024 * 1024)
    assert selections == [ids, ids], 'Learning must recheck the complete ordered selection'
    return packet


def submit(runtime, body, *, request_key='retained-mac-composition'):
    return request(runtime.app, 'POST', '/v2/process/macos-frames:batch', content=body,
                   headers=[('Content-Type', 'application/json')], request_key=request_key, token=TOKEN)


def accepted(c, response, envelope):
    assert response.status_code == 200, response.text
    verified = {tuple(ref[k] for k in ('artifact_id', 'sha256', 'byte_length', 'media_type'))
                for record in envelope['batch']['records'] for ref in record['artifacts']}
    ack = response.json()
    wire.validate_ack(envelope['batch'], ack, user_id=c.user, verified_artifacts=verified)
    assert all(item['disposition'] == 'accepted' for item in ack['acknowledged'])
    assert response.headers['cache-control'] == 'no-store'
    return ack


def packet_receipt(packet):
    result = deepcopy(packet)
    for item in result['items']:
        for role in ('image', 'composed_image'):
            if 'data' in item[role]:
                item[role]['data_sha256'] = digest(item[role].pop('data'))
    return result


def compose_case(case, manifest, native, checker):
    mapping, source = case['mapping'], manifest['display_source']
    assert mapping['refused'] == [], 'Do not reinterpret a mapping refusal as an image'
    identity = {k: source[k] for k in ('device_id', 'session_id', 'stream_id')}
    c = SimpleNamespace(user=source['user_id'], store=MemoryStore(), instant=[NOW],
        registration={'contract_version': '0.2.1', **identity, 'authorization_generation': 1,
                      'membership_revision': 1, 'continuity': {'kind': 'initial'}},
        source={k: source[k] for k in ('user_id', 'source_id', 'source_version')},
        display={'contract_version': '0.2.4', 'source_id': source['source_id'],
                 'stream_id': source['stream_id'], 'project_id': source['project_id'],
                 'source_timezone': source['source_timezone']},
        display_path='/v2/process/display-sources/' + source['source_id'],
        stream_path='/v2/process/streams/' + source['stream_id'])
    runtime = build(c)  # explicit synthetic desktop_pixels consent/profile, no physical producer
    assert runtime.start_status == 'pending' and runtime.current_state is None
    assert runtime.app.state.paid_executor_enabled is False
    descriptor = register_display(c, runtime)
    # created_at belongs to actual server registration, not the proposed native snapshot.
    assert {k: v for k, v in descriptor.items() if k != 'created_at'} == {
        k: v for k, v in source.items() if k != 'created_at'}

    _, kept, outcomes, _, _, _ = checker.native_session(native)
    composed_records = checker.single_composed(outcomes, kept)
    frames, records, bindings, originals = [], [], {}, {}
    immutable_associations = []
    for item in mapping['described']:
        frame = item['frame']
        assert (item['frame_id'], item['callback_sequence']) == (frame['frame_id'], frame['callback_sequence'])
        one, record_id = checker.batch_for(frame)
        # Same released Process record: extra 0.2.2 originals, never a new Mac descriptor field.
        composed = composed_records.get(item['callback_sequence'])
        problems = checker.ink_original_problems(item, composed, native)
        assert not problems, problems
        ink_bindings = item['ink_original_bindings']
        for binding in ink_bindings:
            original_artifact.validate('OriginalArtifactBinding', binding)
            assert binding['kind'] == 'editable_ink' and binding['source'] == c.source
            ref = binding['artifact']
            assert ref['artifact_id'] not in {r['artifact_id'] for r in one['records'][0]['artifacts']}
            one['records'][0]['artifacts'].append(deepcopy(ref))
            original = composed['inkOriginal']
            data, problem = checker.read_ink_original(native, original['file'], original['sha256'])
            assert problem is None, problem
            assert digest(data) == ref['sha256'] and len(data) == ref['byte_length']
            assert bindings.setdefault(ref['artifact_id'], binding) == binding
            assert originals.setdefault(ref['artifact_id'], data) == data
        immutable_associations.append({'callback_sequence': item['callback_sequence'],
                                       'native_record': composed.get('inkOriginal') if composed else None,
                                       'bindings': deepcopy(ink_bindings)})
        # This released validator certifies PNG references; the ink association above is a native-evidence audit.
        macos_frame.validate_binding(one, record_id, frame, source, item['bindings'])
        macos_frame.validate_binding(one, record_id, frame, descriptor, item['bindings'])
        frames.append(frame)
        records.extend(one['records'])
        pictures = [frame['raw']]
        if frame['composition']['kind'] == 'composed':
            pictures.append(frame['composition']['image'])
        by_id = {picture['artifact']['artifact_id']: picture for picture in pictures}
        for binding in item['bindings']:
            original_artifact.validate('OriginalArtifactBinding', binding)
            ref = binding['artifact']
            artifact_id = ref['artifact_id']
            assert binding['kind'] == 'screen_image' and binding['source'] == c.source
            file = (native / by_id[artifact_id]['native_file']).resolve()
            assert file.is_relative_to(native) and file.is_file()
            data = file.read_bytes()
            assert digest(data) == ref['sha256'] and len(data) == ref['byte_length']
            assert bindings.setdefault(artifact_id, binding) == binding
            assert originals.setdefault(artifact_id, data) == data

    assert [f['callback_sequence'] for f in frames] == list(kept)
    assert any(row['bindings'] for row in immutable_associations), 'Old/no-ink fixture cannot establish editable-original upload'
    assert {f['composition']['kind'] for f in frames} == {'composed', 'not_composed', 'unknown'}
    assert all(all(f[k] is None for k in ('captured_at', 'media_position', 'pixel_orientation', 'capture_latency_ms'))
               for f in frames)
    assert all(all(r[k] is None for k in ('clock', 'observed_at', 'media_position')) for r in records)
    batch = {'contract_version': '0.2.0', 'batch_id': 'composition-' + case['name'],
             **identity, 'delivery_mode': 'historical', 'records': records}
    envelope = {'contract_version': '0.2.12', 'batch': batch, 'frames': frames}
    wire.validate_frame_batch(envelope, user_id=c.user)
    body = wire.canonical_request('MacOSFrameBatchRequest', envelope)
    for artifact_id, binding in bindings.items():
        upload = {**binding, 'data_base64': base64.b64encode(originals[artifact_id]).decode('ascii')}
        receipt = ingress_success(request(runtime.app, 'PUT', ORIGINALS + artifact_id, body=upload, token=TOKEN),
                                  'OriginalArtifactReceipt')
        assert receipt == {**binding, 'status': 'bytes_committed'}
        readback = ingress_success(request(runtime.app, 'GET', original_path(c, artifact_id), token=TOKEN),
                                   'OriginalArtifactUpload')
        assert readback == upload
    ack = accepted(c, submit(runtime, body), envelope)
    saved = deepcopy(c.store._documents)
    assert accepted(c, submit(runtime, body), envelope) == ack and c.store._documents == saved
    rows = saved[c.user]
    for record, frame in zip(records, frames):
        assert json.loads(rows[('capture_record', record['record_id'])]['canonical_json'])['record'] == record
        assert rows[('raw_capture_frame', frame['frame_id'])] == frame
    assert {identifier for kind, identifier in rows if kind == 'artifact'} == set(bindings)
    for artifact_id, binding in bindings.items():
        stored = rows[('artifact', artifact_id)]
        assert stored['original_binding'] == binding
        assert base64.b64decode(stored['data_base64'], validate=True) == originals[artifact_id]

    ids = [r['record_id'] for r in records]
    read, images = consumers(c, runtime)
    snapshot = read(ids)
    assert snapshot['batch']['records'] == records
    assert snapshot['sources'] == [descriptor] and snapshot['frames'] == frames
    packet = prepare(c, runtime, ids)
    assert packet['counts'] == {'supplied': len(frames), 'included': len(frames), 'omitted': 0}
    attached = 0
    for item, record, frame in zip(packet['items'], records, frames):
        assert item['record'] == record and item['frame'] == frame and item['source'] == descriptor
        for role, field in (('raw', 'image'), ('composed', 'composed_image')):
            outcome = frame['composition']
            if role == 'composed' and outcome['kind'] != 'composed':
                assert images.resolve_macos(frame, image_role=role, max_bytes=4 * 1024 * 1024) == {'status': 'unobservable'}
                assert item[field] == {'status': outcome['kind'], 'reason': outcome['reason'], 'image_role': role}
                continue
            picture = frame['raw'] if role == 'raw' else outcome['image']
            data = originals[picture['artifact']['artifact_id']]
            resolved = images.resolve_macos(frame, image_role=role, max_bytes=len(data))
            assert resolved['status'] == 'available' and resolved['data'] == data and resolved['frame'] == frame
            assert item[field]['status'] == 'attached' and item[field]['data'] == data and item[field]['image_role'] == role
            attached += len(data)  # Aliased raw/composed roles both count; never silently deduplicate.
    assert packet['attached_bytes'] == attached
    for field in ('authorization_status', 'commit_status', 'live_status', 'provider_receipt'):
        assert packet[field] == 'not_attested'
    assert packet['presentation_permission'] == 'not_granted' and packet['capture_completeness'] == 'unknown'
    window = packet['observation_window']
    assert window['capture_chronology'] == window['capture_intervals'] == 'unknown'
    for left, right, comparison in zip(packet['items'], packet['items'][1:], window['comparisons']):
        assert comparison['clock_readings'] == {'status': 'unknown', 'reason': 'no_process_capture_clock'}
        assert comparison['retained_image_bytes'] == ('identical' if left['image']['data'] == right['image']['data'] else 'different')
        a, b = left['composed_image'], right['composed_image']
        expected = ('identical' if a['data'] == b['data'] else 'different') if a['status'] == b['status'] == 'attached' else 'unknown'
        assert comparison['retained_composed_image_bytes'] == expected
    assert c.store._documents == saved
    reopened = build(c, fresh_consent=False)
    assert accepted(c, submit(reopened, body), envelope) == ack
    assert prepare(c, reopened, ids) == packet and c.store._documents == saved
    for artifact_id, binding in bindings.items():
        readback = ingress_success(request(reopened.app, 'GET', original_path(c, artifact_id), token=TOKEN),
                                   'OriginalArtifactUpload')
        assert readback == {**binding, 'data_base64': base64.b64encode(originals[artifact_id]).decode('ascii')}
    assert c.store._documents == saved

    if case['name'] == 'every_kept_frame':
        terminal = stopped(c, reopened)  # No native callback number is used to invent a sealed Stop boundary.
        assert terminal['pre_stop_sequence'] is None
        after_stop = build(c, fresh_consent=False)
        assert after_stop.current_state == terminal
        before = deepcopy(c.store._documents)
        assert prepare(c, after_stop, ids) == packet
        for artifact_id, binding in bindings.items():
            if binding['kind'] == 'editable_ink':
                readback = ingress_success(request(after_stop.app, 'GET', original_path(c, artifact_id), token=TOKEN),
                                           'OriginalArtifactUpload')
                assert readback == {**binding, 'data_base64': base64.b64encode(originals[artifact_id]).decode('ascii')}
        http_error(submit(after_stop, body), 409, 'capture_stopped')
        live = deepcopy(envelope)
        live['batch']['delivery_mode'] = 'live'
        http_error(submit(after_stop, wire.canonical_request('MacOSFrameBatchRequest', live), request_key='live-after-stop'),
                   409, 'capture_stopped')
        assert c.store._documents == before
        after_stop.app.state.authenticator.revoke(TOKEN)
        fences = {'stop_replay_and_live': '409 capture_stopped; historical context unchanged',
                  'revoked_token_read': require_refusal(lambda: prepare(c, after_stop, ids), 401)}
        http_error(submit(after_stop, body), 401, 'unauthenticated')
        for artifact_id, binding in bindings.items():
            if binding['kind'] == 'editable_ink':
                ingress_error(request(after_stop.app, 'GET', original_path(c, artifact_id), token=TOKEN), 401, 'unauthenticated')
        assert c.store._documents == before
    else:
        Archive(c.store).revoke_source(c.user, c.source['source_id'])
        before = deepcopy(c.store._documents)
        fences = {'revoked_source_read': require_refusal(lambda: prepare(c, reopened, ids), 403)}
        http_error(submit(reopened, body), 404, 'not_found')
        for artifact_id, binding in bindings.items():
            if binding['kind'] == 'editable_ink':
                ingress_error(request(reopened.app, 'GET', original_path(c, artifact_id), token=TOKEN), 403, 'forbidden')
        assert images.resolve_macos(frames[0], image_role='raw', max_bytes=4 * 1024 * 1024) == {'status': 'revoked'}
        assert c.store._documents == before
    assert TOKEN not in repr(c.store._documents)
    assert c.store._documents[c.user][('session', identity['session_id'])]['live_capture'] is False
    return {'name': case['name'], 'status': 'PASS', 'records': len(records), 'frames': len(frames),
            'original_artifacts': len(originals), 'attached_bytes': attached, 'http_envelope_sha256': digest(body),
            'ack': ack, 'supplied_display_source': source, 'registered_display_source': descriptor,
            'fences': fences, 'learning': packet_receipt(packet),
            'unrepresented_preserved_in_receipt_only': mapping['unrepresented'],
            'editable_original_ingress': {
                'status': 'actual supplied immutable bytes uploaded, HTTP-read back, replayed and reopened',
                'distinct_originals': sum(b['kind'] == 'editable_ink' for b in bindings.values()),
                'native_associations_preserved_in_receipt_only': immutable_associations,
                'originals': {key: {'binding': bindings[key], 'data_sha256': digest(value), 'bytes': len(value),
                                    'document': json.loads(value)} for key, value in originals.items()
                              if bindings[key]['kind'] == 'editable_ink'},
                'learning_boundary': 'Exact references remain in Process.artifacts; Learning attaches PNG roles only. Generic artifact schemas do not certify native pairing; no editable-ink renderer or provider receipt'}}


def run(directory, repo, output, audit_path):
    manifest_file = directory / 'manifest.json' if directory.is_dir() else directory
    directory = manifest_file.parent.resolve()
    if output is not None:
        assert not output.resolve().is_relative_to(directory), 'Receipt must not modify the supplied fixture'
    assert output is not None and not output.exists(), 'Supply a new output file; preserve earlier evidence'
    audit = json.loads(audit_path.read_bytes())
    assert audit['anomalies'] == [] and audit['source']['raw_blobs_modes_paths_exact'] is True
    assert audit['source']['native_tree'] == audit['source']['approved_native_tree']
    assert audit['tests']['passed'] == audit['tests']['source_declared'] and audit['tests']['failed'] == []
    assert audit['immutable_ink']['files'], 'Audit must establish actual new native immutable originals'
    before = fixture_hashes(directory)
    expected = {key.removeprefix('macos-retained-frame-fixture/'): value
                for key, value in audit['checksums']['hashes'].items() if key.startswith('macos-retained-frame-fixture/')}
    assert before == expected, 'Supplied fixture differs from successfully audited native artifact'
    manifest = json.loads(manifest_file.read_bytes())
    assert manifest['generator'] == 'DesktopCaptureTests.testMapsEveryRetainedOutcomeToMacFrameMetadata'
    cases = [case for case in manifest['cases'] if case['type'] == 'mapping']
    assert [case['name'] for case in cases] == ['every_kept_frame', 'raw_alias_two_references']
    native = (directory / manifest['native_session']).resolve()
    assert native.is_relative_to(directory) and native.is_dir()
    checker_file = repo / 'apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py'
    checker_path = 'apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py'
    audited_checker = subprocess.check_output(['git', 'show', audit['commit'] + ':' + checker_path], cwd=repo)
    assert checker_file.read_bytes() == audited_checker, 'Checker differs from exact audited native source'
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', 'services/api', 'services/learning', 'packages/contracts'],
                   cwd=repo, check=True, stdout=subprocess.DEVNULL)
    spec = importlib.util.spec_from_file_location('retained_fixture_checker', checker_file)
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)  # Reuse batch_for/native association helpers; no checker.main or mutation campaign.
    results = [compose_case(case, manifest, native, checker) for case in cases]
    assert fixture_hashes(directory) == before, 'Supplied native originals or manifest changed'
    receipt = {'status': 'PASS', 'repo_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip(),
               'probe_sha256': digest(Path(__file__).read_bytes()), 'hosted_commit': audit['commit'], 'hosted_run': audit['run'],
               'artifact_audit_sha256': digest(audit_path.read_bytes()), 'fixture_directory': str(directory),
               'fixture_sha256': before, 'fixture_generator': manifest['generator'],
               'fixture_origin_statement': manifest['synthetic'], 'checker_helper_sha256': digest(checker_file.read_bytes()),
               'native_refusal_receipts_preserved_only': [case for case in manifest['cases'] if case['type'] == 'refusal'],
               'mapping_cases': results, 'authority': 'synthetic trusted desktop_pixels runtime; MemoryStore; in-process HTTP',
               'unrepresented_boundary': 'Native prose and inkOriginal association/pending/freeze facts retained in receipt only; editable_ink bytes uploaded through existing originals and references appended to Process.artifacts',
               'native_database_provider_execution': 'not_run by this probe; hosted Swift provenance audited separately'}
    if output is not None:
        output.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'status': receipt['status'], 'repo_head': receipt['repo_head'], 'fixture_directory': str(directory),
                      'cases': [{k: r[k] for k in ('name', 'status', 'frames', 'original_artifacts', 'attached_bytes', 'fences')}
                                for r in results], 'fixture_files_unchanged': len(before), 'output': str(output) if output else None}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path, help='actual macos-retained-frame-fixture directory or manifest.json')
    parser.add_argument('--repo', type=Path, default=Path.cwd(), help='integrated source checkout (default: working directory)')
    parser.add_argument('--output', type=Path, required=True, help='write new JSON evidence outside the fixture directory')
    parser.add_argument('--artifact-audit', type=Path, required=True, help='successful new hosted artifact audit receipt')
    args = parser.parse_args()
    sys.path.insert(0, str(args.repo.resolve()))
    from packages.contracts import macos_capture_ingress as wire, macos_frame, original_artifact
    from services.api.domain import Archive
    from services.api.errors import DomainError
    from services.api.image_resolver import AuthorizedImageResolver
    from services.api.process_context import AuthorizedProcessContextReader
    from services.api.storage import MemoryStore
    from services.api.tests.test_capture_app import NOW, ORIGINALS, ingress_error, ingress_success, original_path, request
    from services.api.tests.test_capture_runtime import TOKEN, stopped
    from services.api.tests.test_desktop_capture_runtime import register_display
    from services.api.tests.test_macos_capture_runtime import build
    from services.api.tests.test_macos_ingress_http import error as http_error
    from services.learning.process_context import prepare_observation_window
    run(args.fixture.resolve(), args.repo.resolve(), args.output.resolve(), args.artifact_audit.resolve())
