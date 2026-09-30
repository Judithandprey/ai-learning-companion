#!/usr/bin/env python3
"""Compose supplied native fixtures through real ASGI/MemoryStore/readers/Learning.

No fixture is generated or edited. All authority/start facts below are explicitly
synthetic and independent of the supplied files. No listener, DB or provider.
The caller supplies fixture provenance; this script cannot attest its native origin.

  PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/native-fixture-http-composition.py \
      FIXTURE_DIR --repo "$PWD" --fixture-provenance 'actual hosted run ID / commit'
"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('fixture_dir', type=Path)
parser.add_argument('--repo', type=Path, default=Path.cwd())
parser.add_argument('--fixture-provenance', required=True,
                    help='Caller-supplied label; use script-only smoke for synthetic wrappers')
args = parser.parse_args()
repo, directory = args.repo.resolve(), args.fixture_dir.resolve()
sys.path.insert(0, str(repo))

from packages.contracts import capture_ingress as legacy, raw_capture_ingress as raw
from packages.contracts.process_control import validate as validate_control
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.capture_app import create_capture_app
from services.api.control import ControlRegistry
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore
from services.api.tests.test_control_http import request
from services.learning.process_context import prepare_stored_process_context

# Declared test authority, not inferred from JSON or source pixels. Unexpected IDs fail.
USER, DEVICE, SESSION, STREAM = 'user-1', 'ipad-1', 'learning-session-1', 'capture-stream-1'
SOURCE = {'user_id': USER, 'source_id': 'display-source-1', 'source_version': 1}
SCOPES = frozenset({'sources:read', 'sources:write', 'process:control', 'process:capture'})
CAPS = frozenset({'process.control.v0.2.1', 'process.capture.v0.2',
                  'process.ingress.v0.2.4', 'process.raw-ingress.v0.2.6'})
TOKEN = 'composition-test-only'
NOW = datetime(2026, 9, 30, 6, tzinfo=timezone.utc)  # Service clock, never pixel capture UTC.
RAW_PATH, STREAM_PATH = '/v2/process/raw-frames:batch', '/v2/process/streams'
file_hashes = {}


def fixture_file(name, limit):
    assert isinstance(name, str), 'fixture filename must be a string'
    path = (directory / name).resolve()
    assert path.is_relative_to(directory) and path.is_file(), 'fixture path escapes directory or is missing'
    with path.open('rb') as handle:
        data = handle.read(limit + 1)
    assert len(data) <= limit, 'fixture exceeds released input bound'
    digest = sha256(data).hexdigest()
    assert file_hashes.setdefault(name, digest) == digest, 'fixture changed during read'
    return data


def response(response, status=200):
    assert response.status_code == status, f'expected HTTP {status}, got {response.status_code}'
    assert response.headers.get('cache-control') == 'no-store'
    return response.json()


def run_case(case):
    body = fixture_file(case['body'], raw.body_limit('RawFrameBatchRequest'))
    original = fixture_file(case['original'], legacy.body_limit('OriginalArtifactUpload'))
    value = raw.decode_request('RawFrameBatchRequest', body)
    raw.validate_frame_batch(value, user_id=USER)
    upload = legacy.decode_request('OriginalArtifactUpload', original)
    batch, frames = value['batch'], value['frames']
    assert case['user_id'] == USER and type(case['posted']) is bool
    assert case['method'] == 'POST' and case['path'] == RAW_PATH
    assert (batch['device_id'], batch['session_id'], batch['stream_id']) == (DEVICE, SESSION, STREAM)
    assert len(batch['records']) == len(frames) == 1
    record, frame = batch['records'][0], frames[0]
    assert record['sequence'] == 101 and record['source'] == frame['source'] == SOURCE
    assert frame['captured_at'] is frame['media_position'] is record['observed_at'] is record['media_position'] is None
    assert frame['orientation']['applied_to_pixels'] is False
    assert case['binding'] == {k: upload[k] for k in ('contract_version', 'source', 'artifact', 'kind')}
    assert upload['source'] == SOURCE and upload['artifact'] == frame['artifact']
    assert record['artifacts'] == [upload['artifact']] and upload['kind'] == 'screen_image'
    artifact_id = upload['artifact']['artifact_id']
    data = legacy.validate_upload(upload, artifact_id=artifact_id, user_id=USER)
    legacy.validate('IdempotencyKey', case['idempotency_key'])
    assert data.startswith(b'\x89PNG\r\n\x1a\n')

    store = MemoryStore()  # Separate actor store for each unchanged native request.
    Archive(store).set_authorization(USER)
    with store.transaction(USER) as tx:
        tx.put('device', DEVICE, {'user_id': USER, 'id': DEVICE})
        tx.put('session', SESSION, {'user_id': USER, 'id': SESSION, 'live_capture': False})
    principal = Principal(USER, SCOPES, NOW + timedelta(hours=1))
    auth = LocalTestAuthenticator({TOKEN: principal})

    def guard(state):
        assert store._local.in_transaction
        current = auth.authenticate(TOKEN, NOW)
        if (current != principal or 'sources:read' not in current.scopes
                or state['enabled'] is not True or state['generation'] != current.authorization_generation):
            raise DomainError(403, 'forbidden')

    registry = ControlRegistry(store, scopes=SCOPES, capabilities=CAPS, authorization_guard=guard)
    registry.set_membership(USER, DEVICE, SESSION, active=True, expected_revision=0)
    registration = {'contract_version': '0.2.1', 'device_id': DEVICE, 'session_id': SESSION,
                    'stream_id': STREAM, 'authorization_generation': 1, 'membership_revision': 1,
                    'continuity': {'kind': 'initial'}}
    registry.authorize_start(USER, registration, producer_id='synthetic-native-fixture-producer')

    def make_app():
        return create_capture_app(store, auth, capabilities=CAPS, clock=lambda: NOW, enable_raw_ingress=True)

    app = make_app()
    live = response(request(app, 'POST', STREAM_PATH, token=TOKEN, request_key='fixture-register', body=registration))
    validate_control('StreamState', live)
    assert live['state'] == 'live'
    display_request = {'contract_version': '0.2.4', 'source_id': SOURCE['source_id'], 'stream_id': STREAM,
                       'project_id': None, 'source_timezone': 'UTC'}
    descriptor = response(request(app, 'PUT', '/v2/process/display-sources/' + SOURCE['source_id'],
                                  token=TOKEN, body=display_request))
    legacy.validate('DisplaySourceSnapshot', descriptor)
    assert {k: descriptor[k] for k in SOURCE} == SOURCE

    put = request(app, 'PUT', '/v2/process/originals/' + artifact_id, token=TOKEN,
                  headers=[('Content-Type', 'application/json')], content=original)
    receipt = response(put)
    legacy.validate('OriginalArtifactReceipt', receipt)
    assert put.request.content == original and receipt == {**case['binding'], 'status': 'bytes_committed'}
    verified = {tuple(upload['artifact'][k] for k in ('artifact_id', 'sha256', 'byte_length', 'media_type'))}

    def post_raw():
        post = request(app, 'POST', RAW_PATH, token=TOKEN, request_key=case['idempotency_key'],
                       headers=[('Content-Type', 'application/json')], content=body)
        assert post.request.content == body
        return post

    ack = response(post_raw())
    raw.validate_ack(batch, ack, user_id=USER, verified_artifacts=verified)
    assert all(a['status'] == 'verified' for r in ack['acknowledged'] for a in r['artifacts'])
    app = make_app()  # Recreate only the ASGI object, keeping this case's MemoryStore.
    assert response(post_raw()) == ack
    read_path = f"/v2/process/sources/{SOURCE['source_id']}/versions/1/originals/{artifact_id}"

    def check_history():
        before = deepcopy(store._documents)
        got = response(request(app, 'GET', read_path, token=TOKEN))
        assert got == upload
        assert legacy.validate_original_read(got, source_id=SOURCE['source_id'], source_version=1,
                                             artifact_id=artifact_id, user_id=USER) == data
        reader = AuthorizedProcessContextReader(store, USER, guard)
        resolver = AuthorizedImageResolver(store, USER, guard)
        ids = [record['record_id']]
        snapshot = reader.read_raw(ids)
        assert snapshot['batch']['records'] == batch['records']
        assert snapshot['batch']['delivery_mode'] == 'historical'
        assert snapshot['frames'] == frames and snapshot['sources'] == [descriptor]
        resolved = resolver.resolve_raw(frame, max_bytes=len(data))
        assert resolved == {'status': 'available', 'frame': frame, 'media_type': 'image/png', 'data': data}
        reads = []

        def traced_read(*args, **kwargs):
            reads.append((deepcopy(args), deepcopy(kwargs)))
            return reader.read_raw(*args, **kwargs)

        packet = prepare_stored_process_context(ids, traced_read, resolver.resolve_raw, user_id=USER)
        assert len(reads) == 2 and reads[0] == reads[1] == ((ids,), {'max_metadata_bytes': 4 * 1024 * 1024})
        # Learning keeps batch metadata here; complete records live in ordered items.
        assert packet['batch'] == {k: v for k, v in snapshot['batch'].items() if k != 'records'}
        assert [item['record'] for item in packet['items']] == snapshot['batch']['records']
        assert packet['counts'] == {'supplied': 1, 'included': 1, 'omitted': 0}
        assert len(packet['items']) == 1
        item = packet['items'][0]
        assert item['record'] == record and item['frame'] == frame and item['source'] == descriptor
        assert item['image'] == {'status': 'attached', 'data': data, 'media_type': 'image/png', 'byte_length': len(data)}
        assert item['pixel_orientation'] == 'raw_unapplied' and item['provider_image_alignment'] == 'not_attested'
        assert all(packet[k] == 'not_attested' for k in ('authorization_status','commit_status','live_status','provider_receipt'))
        assert packet['presentation_permission'] == 'not_granted' and packet['capture_completeness'] == 'unknown'
        assert packet['non_frame_artifacts'] == 'references_only' and store._documents == before
        return packet

    before_stop = check_history()
    stop = {'contract_version': '0.2.1', 'device_id': DEVICE, 'session_id': SESSION, 'stream_id': STREAM,
            'expected_revision': live['revision'], 'action': {'kind': 'stop', 'pre_stop_sequence': None}}
    stopped = response(request(app, 'POST', STREAM_PATH + '/' + STREAM + ':control', token=TOKEN,
                               request_key='fixture-stop', body=stop))
    validate_control('StreamState', stopped)
    assert stopped['state'] == 'stopped' and stopped['pre_stop_sequence'] is None
    # Unknown producer boundary grants no new historical ingest, either. No native body is rewritten.
    after_stop = deepcopy(store._documents)
    error = response(post_raw(), 409)
    assert error == {'contract_version': '0.2.6', 'error': 'capture_stopped', 'retryable': False}
    assert check_history() == before_stop and store._documents == after_stop
    return {'name': case['name'], 'input_delivery_mode': batch['delivery_mode'],
            'native_manifest_posted': case['posted'], 'http_checks': 'registration / exact PUT / raw POST / exact replay / GET / Stop',
            'context_checks': 'current reader + exact resolver + Learning equality before/after Stop; honest flags',
            'original_bytes': len(data), 'original_sha256': sha256(data).hexdigest(),
            'request_sha256': sha256(body).hexdigest(), 'put_sha256': sha256(original).hexdigest()}


manifest_bytes = fixture_file('manifest.json', 1024 * 1024)
manifest = json.loads(manifest_bytes)
assert isinstance(manifest, list)
cases = [entry for entry in manifest if entry.get('type') == 'request']
assert len(cases) == 2, 'expected one live and one historical native request fixture'
results = [run_case(case) for case in cases]
assert {item['input_delivery_mode'] for item in results} == {'live', 'historical'}
for name, digest in file_hashes.items():
    assert sha256((directory / name).read_bytes()).hexdigest() == digest, 'input fixture was modified'
try:
    revision = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
except subprocess.CalledProcessError:
    revision = 'archive without Git metadata; see module hashes'
modules = ['services/api/capture_app.py','services/api/ingress_app.py','services/api/control_app.py',
           'services/api/process_context.py','services/api/image_resolver.py','services/learning/process_context.py']
print(json.dumps({'result': 'PASS', 'caller_supplied_fixture_provenance': args.fixture_provenance,
                  'repo': str(repo), 'repo_head': revision, 'fixture_directory': str(directory),
                  'authority': 'synthetic fixed test identity/membership/start; not native consent or production auth',
                  'runtime': 'real production ASGI + MemoryStore + readers/resolver/Learning; no network/DB/provider/device',
                  'fixture_hashes': file_hashes,
                  'module_sha256': {p: sha256((repo/p).read_bytes()).hexdigest() for p in modules},
                  'cases': results}, indent=2, sort_keys=True))
