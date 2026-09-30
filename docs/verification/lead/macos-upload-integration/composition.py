#!/usr/bin/env python3
"""Submit one audited Swift upload transcript unchanged to Backend/MemoryStore and Learning.

  .venv/bin/python docs/verification/lead/macos-upload-integration/composition.py \
    MACOS_UPLOAD_FIXTURE --artifact-audit AUDIT.json --output NEW_RECEIPT.json

PUT body files and POST body/key are the actual Swift-emitted bytes, never a Python
reconstruction. Only the redacted synthetic Authorization marker is replaced by
the in-process runtime's synthetic token. Registration/consent are explicitly
synthetic. No listener, DB, native process, provider or fixture mutation occurs.
Requires a successful independent hosted artifact audit; missing input fails and
never falls back to a simulated fixture. The owner checker is not rerun here.
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
HELPER_PATH = 'docs/verification/lead/macos-ink-originals-integration/composition.py'
FIXTURE_PREFIX = 'macos-upload-fixture/'
GENERATOR = 'DesktopCaptureTests.testUploadsEveryOriginalThenTheExactBatch'
PUT_HEADERS = {'Authorization': 'Bearer <synthetic token>',
               'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json'}
POST_PATH = '/v2/process/macos-frames:batch'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.check_output(['git', *args], cwd=repo)


def retained_file(root, relative):
    """Only regular nonsymlink fixture members; never rewrite or repair them."""
    relative = Path(relative)
    assert not relative.is_absolute() and '..' not in relative.parts
    file = root / relative
    assert file.resolve().is_relative_to(root) and file.is_file()
    assert all(not part.is_symlink() for part in (file, *file.parents) if part.is_relative_to(root))
    return file


def load_helpers(repo, baseline):
    path = repo / HELPER_PATH
    assert path.read_bytes() == git(repo, 'show', baseline + ':' + HELPER_PATH), 'Shared probe helper changed'
    spec = importlib.util.spec_from_file_location('previous_mac_composition', path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    # Reuse the existing current-authority guard, Learning selection recheck and
    # receipt byte redaction; importing that script does not run its campaign.
    for name in ('DomainError', 'AuthorizedProcessContextReader', 'AuthorizedImageResolver',
                 'TOKEN', 'prepare_observation_window'):
        setattr(helper, name, globals()[name])
    return helper


def actual_request(runtime, exchange, body):
    """Replay the recorded headers/body, replacing only the synthetic bearer marker."""
    headers = exchange['headers']
    assert headers['Authorization'] == PUT_HEADERS['Authorization']
    response = request(runtime.app, exchange['method'], exchange['path'], content=body,
                       headers=[(k, v) for k, v in headers.items() if k != 'Authorization'], token=TOKEN)
    assert response.request.content == body, 'The ASGI request did not carry the exact Swift bytes'
    for name, value in headers.items():
        if name != 'Authorization':
            assert response.request.headers[name] == value
    return response


def accepted(response, envelope, user, verified):
    assert response.status_code == 200, response.text
    ack = response.json()
    wire.validate_ack(envelope['batch'], ack, user_id=user, verified_artifacts=verified)
    assert all(row['disposition'] == 'accepted' for row in ack['acknowledged'])
    assert response.headers['cache-control'] == 'no-store'
    return ack


def check_learning(helper, c, runtime, envelope, descriptor, originals):
    records, frames = envelope['batch']['records'], envelope['frames']
    ids = [r['record_id'] for r in records]
    read, images = helper.consumers(c, runtime)
    snapshot = read(ids)
    assert snapshot['batch']['records'] == records
    assert snapshot['sources'] == [descriptor] and snapshot['frames'] == frames
    packet = helper.prepare(c, runtime, ids)
    assert packet['counts'] == {'supplied': len(records), 'included': len(records), 'omitted': 0}
    assert {f['composition']['kind'] for f in frames} == {'composed', 'not_composed', 'unknown'}
    assert all(all(f[k] is None for k in ('captured_at', 'media_position', 'pixel_orientation', 'capture_latency_ms'))
               for f in frames)
    assert all(all(r[k] is None for k in ('clock', 'observed_at', 'media_position')) for r in records)
    attached = 0
    for item, record, frame in zip(packet['items'], records, frames):
        assert item['record'] == record and item['frame'] == frame and item['source'] == descriptor
        for role, field in (('raw', 'image'), ('composed', 'composed_image')):
            outcome = frame['composition']
            if role == 'composed' and outcome['kind'] != 'composed':
                assert images.resolve_macos(frame, image_role=role, max_bytes=4 * 1024 * 1024) == {'status': 'unobservable'}
                assert item[field] == {'status': outcome['kind'], 'reason': outcome['reason'], 'image_role': role}
                continue
            image = frame['raw'] if role == 'raw' else outcome['image']
            data = originals[image['artifact']['artifact_id']]['data']
            resolved = images.resolve_macos(frame, image_role=role, max_bytes=len(data))
            assert resolved['status'] == 'available' and resolved['data'] == data and resolved['frame'] == frame
            assert item[field]['status'] == 'attached' and item[field]['data'] == data and item[field]['image_role'] == role
            attached += len(data)  # Raw/composed aliases are both actual attached roles.
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
    return packet


def compose(helper, directory, manifest, envelope, body):
    records, frames = envelope['batch']['records'], envelope['frames']
    source = records[0]['source']
    identity = {k: envelope['batch'][k] for k in ('device_id', 'session_id', 'stream_id')}
    assert all(r['source'] == source for r in records) and source['user_id'] == manifest['user_id']
    assert source['source_version'] == 1
    c = SimpleNamespace(user=source['user_id'], store=MemoryStore(), instant=[NOW], source=source,
        registration={'contract_version': '0.2.1', **identity, 'authorization_generation': 1,
                      'membership_revision': 1, 'continuity': {'kind': 'initial'}},
        display={'contract_version': '0.2.4', 'source_id': source['source_id'],
                 'stream_id': identity['stream_id'], 'project_id': None, 'source_timezone': 'UTC'},
        display_path='/v2/process/display-sources/' + source['source_id'],
        stream_path='/v2/process/streams/' + identity['stream_id'])
    runtime = build(c)
    assert runtime.start_status == 'pending' and runtime.current_state is None
    assert runtime.app.state.paid_executor_enabled is False
    descriptor = register_display(c, runtime)
    assert {k: descriptor[k] for k in source} == source
    assert {k: descriptor[k] for k in identity} == identity
    native = (directory / manifest['native_session']).resolve()
    assert native.is_relative_to(directory) and native.is_dir()
    mutable = retained_file(native, 'ink/ink.json').read_bytes()
    planned = {row['artifact_id']: row for row in manifest['originals']}
    assert len(planned) == len(manifest['originals'])
    ordered_refs = {}
    for record in records:
        for ref in record['artifacts']:
            assert ordered_refs.setdefault(ref['artifact_id'], ref) == ref
    assert list(planned) == list(ordered_refs) == manifest['committed_originals']
    exchanges = manifest['exchanges']
    assert [e['method'] for e in exchanges] == ['PUT'] * len(planned) + ['POST']
    assert len(planned) == 14 and len(records) == len(frames) == 8, 'Wrong/non-vacuous audited transcript'
    originals, receipts, executed = {}, {}, []
    for exchange, (artifact_id, ref) in zip(exchanges[:-1], ordered_refs.items()):
        assert exchange['path'] == ORIGINALS + artifact_id and exchange['headers'] == PUT_HEADERS
        assert exchange['status'] == 200
        sent = retained_file(directory, exchange['request_file']).read_bytes()
        upload = capture_wire.decode_request('OriginalArtifactUpload', sent)
        data = capture_wire.validate_upload(upload, artifact_id=artifact_id, user_id=c.user)
        binding = {k: upload[k] for k in ('contract_version', 'source', 'artifact', 'kind')}
        assert binding['artifact'] == ref and binding['source'] == source
        plan = planned[artifact_id]
        assert all(plan[k] == ref[k] for k in ('artifact_id', 'sha256', 'byte_length', 'media_type'))
        assert plan['kind'] == binding['kind'] and data == retained_file(native, plan['file']).read_bytes()
        if binding['kind'] == 'editable_ink':
            assert plan['file'] == 'ink-originals/' + ref['sha256'] + '.json' and data != mutable
        response = actual_request(runtime, exchange, sent)
        receipt = ingress_success(response, 'OriginalArtifactReceipt')
        original_artifact.validate_receipt(binding, receipt)
        assert receipt == {**binding, 'status': 'bytes_committed'}
        readback = ingress_success(request(runtime.app, 'GET', original_path(c, artifact_id), token=TOKEN),
                                   'OriginalArtifactUpload')
        assert readback == upload and base64.b64decode(readback['data_base64'], validate=True) == data
        originals[artifact_id] = {'binding': binding, 'data': data, 'upload': upload, 'request': sent,
                                 'file': plan['file'], 'exchange': exchange}
        receipts[artifact_id] = receipt
        executed.append({'method': 'PUT', 'path': exchange['path'], 'request_sha256': digest(sent),
                         'status': response.status_code, 'receipt': receipt, 'readback_sha256': digest(data)})
    inks = [value for value in originals.values() if value['binding']['kind'] == 'editable_ink']
    assert len(inks) == 2 and len({value['file'] for value in inks}) == 2
    post = exchanges[-1]
    assert post['path'] == POST_PATH and post['status'] == 200
    assert post['headers'] == dict(PUT_HEADERS, **{'Idempotency-Key': manifest['idempotency_key']})
    assert retained_file(directory, post['request_file']).read_bytes() == body
    verified = {tuple(ref[k] for k in ('artifact_id', 'sha256', 'byte_length', 'media_type')) for ref in ordered_refs.values()}
    response = actual_request(runtime, post, body)
    ack = accepted(response, envelope, c.user, verified)
    executed.append({'method': 'POST', 'path': post['path'], 'request_sha256': digest(body),
                     'idempotency_key': manifest['idempotency_key'], 'status': response.status_code, 'ack': ack})
    saved = deepcopy(c.store._documents)
    rows = saved[c.user]
    for record, frame in zip(records, frames):
        assert record['frame_id'] == frame['frame_id']
        assert json.loads(rows[('capture_record', record['record_id'])]['canonical_json'])['record'] == record
        assert rows[('raw_capture_frame', frame['frame_id'])] == frame
    assert {identifier for kind, identifier in rows if kind == 'artifact'} == set(originals)
    for artifact_id, item in originals.items():
        stored = rows[('artifact', artifact_id)]
        assert stored['original_binding'] == item['binding']
        assert base64.b64decode(stored['data_base64'], validate=True) == item['data']
        assert ingress_success(actual_request(runtime, item['exchange'], item['request']),
                               'OriginalArtifactReceipt') == receipts[artifact_id]
    assert accepted(actual_request(runtime, post, body), envelope, c.user, verified) == ack
    assert c.store._documents == saved, 'Exact PUT/POST replay changed stored content'
    packet = check_learning(helper, c, runtime, envelope, descriptor, originals)
    assert c.store._documents == saved
    reopened = build(c, fresh_consent=False)
    assert reopened.start_status == 'consumed' and reopened.current_state['state'] == 'live'
    assert accepted(actual_request(reopened, post, body), envelope, c.user, verified) == ack
    assert check_learning(helper, c, reopened, envelope, descriptor, originals) == packet
    for artifact_id, item in originals.items():
        assert ingress_success(request(reopened.app, 'GET', original_path(c, artifact_id), token=TOKEN),
                               'OriginalArtifactUpload') == item['upload']
    assert c.store._documents == saved

    # One successful transcript, followed by current fences. Never alter its body/key
    # or invent a producer Stop boundary from its callback or Process ordinals.
    terminal = stopped(c, reopened)
    assert terminal['pre_stop_sequence'] is None
    after_stop = build(c, fresh_consent=False)
    assert after_stop.current_state == terminal
    stopped_snapshot = deepcopy(c.store._documents)
    assert check_learning(helper, c, after_stop, envelope, descriptor, originals) == packet
    http_error(actual_request(after_stop, post, body), 409, 'capture_stopped')
    first_ink = inks[0]
    ingress_error(actual_request(after_stop, first_ink['exchange'], first_ink['request']), 403, 'forbidden')
    assert c.store._documents == stopped_snapshot
    Archive(c.store).revoke_source(c.user, source['source_id'])
    revoked_snapshot = deepcopy(c.store._documents)
    ids = [r['record_id'] for r in records]
    source_fence = helper.require_refusal(lambda: helper.prepare(c, after_stop, ids), 403)
    _, images = helper.consumers(c, after_stop)
    assert images.resolve_macos(frames[0], image_role='raw', max_bytes=4 * 1024 * 1024) == {'status': 'revoked'}
    for item in inks:
        ingress_error(request(after_stop.app, 'GET', original_path(c, item['binding']['artifact']['artifact_id']),
                              token=TOKEN), 403, 'forbidden')
    assert c.store._documents == revoked_snapshot
    after_stop.app.state.authenticator.revoke(TOKEN)
    token_fence = helper.require_refusal(lambda: helper.prepare(c, after_stop, ids), 401)
    http_error(actual_request(after_stop, post, body), 401, 'unauthenticated')
    assert c.store._documents == revoked_snapshot
    assert TOKEN not in repr(c.store._documents)
    # Runtime provisioning deliberately leaves this legacy session flag false;
    # current admission is the independently checked control-stream state.
    assert rows[('session', identity['session_id'])]['live_capture'] is False
    assert c.store._documents[c.user][('session', identity['session_id'])]['live_capture'] is False
    for artifact_id, item in originals.items():
        assert c.store._documents[c.user][('artifact', artifact_id)] == rows[('artifact', artifact_id)]
    return {'status': 'PASS', 'executed_initial_transcript': executed, 'registered_display_source': descriptor,
            'records': len(records), 'frames': len(frames), 'originals': len(originals),
            'exact_put_post_replay': 'same bytes/key; same receipts/ACK; store unchanged',
            'same_store_reopen': 'same ACK, original readbacks, context and Learning packet; no fresh consent',
            'fences': {'stop_exact_post': '409 capture_stopped', 'stop_ink_put': '403 forbidden',
                       'source_revoked_context': source_fence, 'source_revoked_image': 'revoked',
                       'source_revoked_ink_get': '403 forbidden', 'token_revoked_context': token_fence,
                       'token_revoked_exact_post': '401 unauthenticated'},
            'learning': helper.packet_receipt(packet),
            'immutable_ink': [{'binding': item['binding'], 'native_file': item['file'],
                              'data_sha256': digest(item['data']), 'byte_length': len(item['data']),
                              'document': json.loads(item['data'])} for item in inks],
            'preservation': 'all original artifact rows unchanged through replay/reopen/Stop/revocation; no fixture writes'}


def run(args):
    repo, directory = args.repo.resolve(), args.fixture.resolve()
    output, audit_path = args.output.resolve(), args.artifact_audit.resolve()
    assert directory.is_dir(), 'Actual hosted upload fixture is required; no substitute is generated'
    assert not output.exists() and not output.is_relative_to(directory), 'Use a new receipt outside the fixture'
    audit = json.loads(audit_path.read_bytes())
    assert audit['anomalies'] == [] and audit['source']['raw_blobs_modes_paths_exact'] is True
    assert audit['source']['native_tree'] == audit['source']['approved_native_tree']
    assert audit['tests']['passed'] == audit['tests']['source_declared'] and audit['tests']['failed'] == []
    assert audit['hosted']['selected_macos_job']['conclusion'] == 'success'
    assert audit['upload_fixture'], 'Audit must specifically cover the emitted upload transcript'
    for commit in (audit['commit'], audit['approved_commit'], 'HEAD'):
        assert git(repo, 'rev-parse', commit + ':apps/macos/CompanionDesktop').decode().strip() == audit['source']['native_tree'], \
            'The audited, approved and current native source trees must be identical'
    baseline = git(repo, 'rev-parse', args.consumer_baseline).decode().strip()
    trees = {}
    for path in ('services/api', 'services/learning', 'packages/contracts'):
        subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', path], cwd=repo, check=True,
                       stdout=subprocess.DEVNULL)
        tree = git(repo, 'rev-parse', 'HEAD:' + path).decode().strip()
        assert tree == git(repo, 'rev-parse', baseline + ':' + path).decode().strip(), path + ' changed from assigned baseline'
        trees[path] = tree
    helper = load_helpers(repo, baseline)
    before = helper.fixture_hashes(directory)
    expected = {key.removeprefix(FIXTURE_PREFIX): value for key, value in audit['checksums']['hashes'].items()
                if key.startswith(FIXTURE_PREFIX)}
    assert expected and before == expected, 'Fixture differs from the successfully audited native artifact'
    manifest = json.loads(retained_file(directory, 'manifest.json').read_bytes())
    assert manifest['generator'] == GENERATOR and manifest['result'] == 'committed'
    body = retained_file(directory, manifest['request_file']).read_bytes()
    envelope = wire.decode_request('MacOSFrameBatchRequest', body)
    wire.validate_frame_batch(envelope, user_id=manifest['user_id'])
    assert manifest['records'] == [{k: r[k] for k in ('record_id', 'sequence')} for r in envelope['batch']['records']]
    try:
        result = compose(helper, directory, manifest, envelope, body)
    finally:
        assert helper.fixture_hashes(directory) == before, 'The supplied Swift fixture changed'
    receipt = {'status': 'PASS', 'repo_head': git(repo, 'rev-parse', 'HEAD').decode().strip(),
               'consumer_baseline': baseline, 'consumer_trees': trees,
               'probe_sha256': digest(Path(__file__).read_bytes()), 'helper_sha256': digest((repo / HELPER_PATH).read_bytes()),
               'hosted_commit': audit['commit'], 'hosted_run': audit['run'],
               'approved_native_commit': audit['approved_commit'], 'approved_native_tree': audit['source']['approved_native_tree'],
               'artifact_audit_sha256': digest(audit_path.read_bytes()), 'fixture_directory': str(directory),
               'fixture_sha256': before, 'fixture_generator': manifest['generator'],
               'fixture_origin_statement': manifest['synthetic'], 'http_body_sha256': digest(body),
               'idempotency_key': manifest['idempotency_key'], 'composition': result,
               'authority': 'synthetic desktop_pixels runtime and token; MemoryStore; in-process actual ASGI handlers',
               'boundary': 'Actual Swift-emitted PUT/POST bytes, not reconstructed; redacted bearer marker replaced only. Native labels and editable-ink JSON are not device/provider/Notability acceptance.',
               'native_database_provider_execution': 'NOT_RUN by this probe; hosted Swift provenance audited separately'}
    output.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'status': 'PASS', 'hosted_run': audit['run'], 'fixture_files_unchanged': len(before),
                      'records': result['records'], 'originals': result['originals'], 'fences': result['fences'],
                      'output': str(output)}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path, help='actual audited macos-upload-fixture directory')
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--consumer-baseline', default='0704fff', help='assigned Backend/Learning/contracts baseline')
    parser.add_argument('--artifact-audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.repo.resolve()))
    from packages.contracts import capture_ingress as capture_wire, macos_capture_ingress as wire, original_artifact
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
    run(args)
