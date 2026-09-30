#!/usr/bin/env python3
"""Actual MemoryStore/Backend/Learning composition with synthetic PNGs and authority.
Usage: PYTHONDONTWRITEBYTECODE=1 <venv>/python this.py <composed-source-root>
No HTTP, native process, provider, database or replacement storage/consumer.
"""
import base64
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(sys.argv[1]).resolve()
sys.path[:0] = [str(ROOT), str(ROOT / 'tests/evals')]
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.control import ControlRegistry
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.original_artifacts import OriginalArtifacts
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore
from services.api.tests.test_control import control_fixture, SCOPES, CAPABILITIES, apply, command, resolve_stop_fact, stop_fact
from services.api.tests.test_desktop_frame_ingress import pixel_record
from services.learning.process_context import prepare_observation_window, prepare_stored_process_context
from test_windows_process_context import windows_supplied

NOW = datetime(2026, 9, 30, 12, tzinfo=timezone.utc)
USER = 'synthetic-windows-composition-user'


def setup():
    c = control_fixture(MemoryStore(), USER)
    # The fixture above only provisions synthetic domain/control state in MemoryStore.
    # All subsequent operations use a fresh LocalTestAuthenticator guard in storage.
    c.auth = LocalTestAuthenticator({'synthetic-read-token': Principal(USER, {'sources:read'}, NOW + timedelta(hours=1))})
    c.guard_calls = 0
    def guard(state):
        assert c.store._local.in_transaction
        c.guard_calls += 1
        principal = c.auth.authenticate('synthetic-read-token', NOW)
        if principal.user_id != USER or 'sources:read' not in principal.scopes or state['generation'] != principal.authorization_generation:
            raise DomainError(403, 'forbidden')
    c.guard = guard
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
        authorization_guard=guard, stop_fact_resolver=resolve_stop_fact)
    c.archive.authorization_guard = guard
    c.registry.bind_pixel_producer(USER, c.registration, producer_id='screen')
    c.source = {'user_id': USER, 'source_id': 'synthetic-windows-source', 'source_version': 1}
    c.descriptor = c.registry.register_display_source(USER, c.source['source_id'], c.batch['stream_id'], producer_id='screen')
    values = windows_supplied()
    c.data = values[3]
    frame = deepcopy(values[2][0])
    frame.update(frame_id='synthetic-windows-composition-frame', source=c.source,
                 **{k: c.batch[k] for k in ('device_id', 'session_id', 'stream_id')})
    frame['profile']['sample'].update(state='gap', gap_ms=None)
    c.frame = frame
    raw, composed = frame['raw']['artifact'], frame['composed']['image']['artifact']
    ink_bytes = b'{"synthetic":true,"editable_strokes":[[1,2],[3,4]]}\n'
    c.ink_ref = {'artifact_id': 'synthetic-editable-ink', 'sha256': sha256(ink_bytes).hexdigest(),
                 'byte_length': len(ink_bytes), 'media_type': 'application/json'}
    originals = OriginalArtifacts(c.store, guard, display_authority_resolver=c.registry.resolve_capture)
    for ref, data, kind in ((raw, c.data['raw'], 'screen_image'), (composed, c.data['composed'], 'screen_image'),
                            (c.ink_ref, ink_bytes, 'editable_ink')):
        receipt = originals.put(USER, c.source, kind, ref, data)
        assert receipt['status'] == 'bytes_committed'
    c.record = pixel_record(c.batch['records'][0])
    c.record.update(source=c.source, frame_id=frame['frame_id'], artifacts=deepcopy([raw, composed, c.ink_ref]))
    c.batch['records'] = [c.record]
    c.frames = [frame]
    c.reader = AuthorizedProcessContextReader(c.store, USER, guard)
    c.resolver = AuthorizedImageResolver(c.store, USER, guard)
    return c


def ingest_and_check_archive(c):
    ack = c.registry.ingest_windows_frames(USER, c.batch, c.frames, 'synthetic-windows-batch')
    assert all(a['status'] == 'verified' for r in ack['acknowledged'] for a in r['artifacts'])
    with c.store.transaction(USER) as tx:
        for record in c.batch['records']:
            stored = tx.get('capture_record', record['record_id'])
            assert json.loads(stored['canonical_json'])['record'] == record
        for frame in c.frames:
            assert tx.get('raw_capture_frame', frame['frame_id']) == frame
            assert tx.get('frame', frame['frame_id']) is None
            for role, image in [('raw', frame['raw'])] + ([('composed', frame['composed']['image'])] if frame['composed'] else []):
                ref = image['artifact']
                row = tx.get('artifact', ref['artifact_id'])
                assert row['original_binding'] == {'contract_version': '0.2.2', 'kind': 'screen_image',
                    'source': c.source, 'artifact': ref}
                data = base64.b64decode(row['data_base64'], validate=True)
                assert sha256(data).hexdigest() == ref['sha256'] and len(data) == ref['byte_length']
        ink = tx.get('artifact', c.ink_ref['artifact_id'])
        assert ink['original_binding']['kind'] == 'editable_ink'
    return ack


def prepare(c, ids=None, *, windows_resolver=None, window=False):
    function = prepare_observation_window if window else prepare_stored_process_context
    return function(ids or [r['record_id'] for r in c.batch['records']], c.reader.read_windows, c.resolver,
        user_id=USER, windows_resolver=c.resolver.resolve_windows if windows_resolver is None else windows_resolver)


def denied(action, status):
    published = []
    try:
        published.append(action())
    except DomainError as exc:
        assert exc.status == status, (exc.status, exc.code)
        assert published == []
        return
    raise AssertionError('Expected whole result refusal')


# One real archive stores distinct, identical-alias, raw-only and frameless records.
c = setup()
for sequence, variant in ((2, 'alias'), (3, 'raw-only')):
    frame, record = deepcopy(c.frame), deepcopy(c.record)
    frame['frame_id'] = variant + '-frame'
    record.update(record_id=variant, sequence=sequence, frame_id=frame['frame_id'], causal_parents=[])
    if variant == 'alias':
        frame['composed']['image'] = deepcopy(frame['raw'])
    else:
        frame['composed'] = None
    record['artifacts'] = [deepcopy(frame['raw']['artifact']), deepcopy(c.ink_ref)]
    c.frames.append(frame); c.batch['records'].append(record)
gap = pixel_record(deepcopy(c.record), coverage='unknown')
gap.update(record_id='frameless-gap', sequence=4, frame_id=None, artifacts=[], causal_parents=['process-1'])
c.batch['records'].append(gap)
ingest_and_check_archive(c)
ids = ['frameless-gap', 'raw-only', 'process-1', 'alias']
snapshot = c.reader.read_windows(ids)
assert snapshot['batch']['records'] == [c.batch['records'][i] for i in (3, 2, 0, 1)]
assert snapshot['batch']['delivery_mode'] == 'historical'
c.guard_calls = 0
packet = prepare(c, ids, window=True)
assert c.guard_calls == 14  # two full metadata reads + five images, each authorizes twice
assert [i['record']['record_id'] for i in packet['items']] == ids
gap_item, raw_only, distinct, alias = packet['items']
assert gap_item['frame'] is None and gap_item['image']['status'] == 'missing_frame'
assert gap_item['record'] == gap and 'composed_image' not in gap_item
assert raw_only['composed_image'] == {'status': 'not_present', 'image_role': 'composed'}
for item in (raw_only, distinct, alias):
    assert item['image']['data'] == c.data['raw'] and item['image']['image_role'] == 'raw'
    assert item['frame']['profile']['sample']['state'] == 'gap'
    assert item['frame']['profile']['sample']['gap_ms'] is None
    assert item['record']['clock'] is item['record']['observed_at'] is item['frame']['captured_at'] is None
    assert c.ink_ref in item['record']['artifacts']
assert c.data['raw'] != c.data['composed']
assert distinct['composed_image']['data'] == c.data['composed']
assert alias['composed_image']['data'] == c.data['raw']
assert all(i['composed_image']['image_role'] == 'composed' for i in (distinct, alias))
assert packet['attached_bytes'] == 4 * len(c.data['raw']) + len(c.data['composed'])
comparisons = packet['observation_window']['comparisons']
assert all(item['clock_readings'] == {'status': 'unknown', 'reason': 'no_process_capture_clock'} for item in comparisons)
assert comparisons[-1]['retained_image_bytes'] == 'identical'
assert comparisons[-1]['retained_composed_image_bytes'] == 'different'
assert packet['observation_window']['capture_chronology'] == 'unknown'
assert packet['authorization_status'] == packet['live_status'] == packet['provider_receipt'] == 'not_attested'
assert packet['presentation_permission'] == 'not_granted'
print('PASS stored distinct/alias/raw-only/frameless composition, roles, bytes, exact records and unknown clocks')

# Old read adapters reject the new family; actual stored 0.2.5 remains consumable.
for read, status in ((c.reader, 409), (c.reader.read_raw, 503), (c.reader.read_desktop, 503)):
    denied(lambda: read(['process-1']), status)
for resolve in (c.resolver, c.resolver.resolve_raw, c.resolver.resolve_desktop):
    assert resolve(c.frame, max_bytes=4096) == {'status': 'unavailable'}
old = {'contract_version': '0.2.5', 'kind': 'raw_capture_frame', 'frame_id': 'old-raw-frame', 'source': c.source,
       **{k: c.batch[k] for k in ('device_id', 'session_id', 'stream_id')}, 'artifact': c.frame['raw']['artifact'],
       'raw_width': 4, 'raw_height': 2, 'buffer_sequence': 1, 'captured_at': None, 'media_position': None,
       'timing': {'observed_at_estimate': None, 'estimate_basis': None, 'uncertainty_ms': None,
                  'callback_clock': None, 'sample_pts_seconds': None},
       'orientation': {'system': 'CGImagePropertyOrientation', 'value': None, 'applied_to_pixels': False}}
old_record = {**deepcopy(c.record), 'record_id': 'old-raw', 'sequence': 5, 'frame_id': old['frame_id'],
              'artifacts': [deepcopy(old['artifact']), deepcopy(c.ink_ref)]}
c.registry.ingest_raw_frames(USER, {**c.batch, 'records': [old_record]}, [old], 'old-raw')
old_packet = prepare_stored_process_context(['old-raw'], c.reader.read_raw, c.resolver.resolve_raw, user_id=USER)
assert old_packet['items'][0]['frame'] == old and old_packet['items'][0]['image']['data'] == c.data['raw']
assert 'image_role' not in old_packet['items'][0]['image']
stop_fact(c, 5)
apply(c, command(c, boundary=5))
assert prepare(c, ids, window=True) == packet
print('PASS old adapters remain closed to Windows, actual raw 0.2.5 still works, Stop retains authorized history')

# Each independent loss starts with actual committed originals and a successful read.
for loss, status in (('composed-original-loss', 503), ('source-delete', 404), ('source-revoke', 403), ('token-revoke', 401)):
    c = setup(); ingest_and_check_archive(c)
    assert prepare(c)['items'][0]['composed_image']['data'] == c.data['composed']
    if loss == 'composed-original-loss':
        # Explicit retained-original loss injected through a real storage transaction.
        with c.store.transaction(USER) as tx:
            tx.delete('artifact', c.frame['composed']['image']['artifact']['artifact_id'])
    elif loss == 'source-delete':
        c.archive.delete_source(USER, c.source['source_id'])
        with c.store.transaction(USER) as tx:
            assert tx.get('artifact', c.frame['raw']['artifact']['artifact_id']) is None
            assert tx.get('artifact', c.frame['composed']['image']['artifact']['artifact_id']) is None
    elif loss == 'source-revoke':
        c.archive.revoke_source(USER, c.source['source_id'])
    else:
        c.auth.revoke('synthetic-read-token')
    denied(lambda: prepare(c), status)
    assert c.resolver.resolve_windows(c.frame, image_role='raw', max_bytes=4096)['status'] != 'available'
print('PASS missing composed original, source deletion/revocation and current token failure withhold complete output')

# Interpose only to revoke a real token after the actual composed-byte read returns.
# Reader, storage, resolver results and Learning are not stubbed or replaced.
c = setup(); ingest_and_check_archive(c)
roles = []
def revoke_after_actual_composed(frame, *, image_role, max_bytes):
    result = c.resolver.resolve_windows(frame, image_role=image_role, max_bytes=max_bytes)
    assert result['status'] == 'available'
    roles.append(image_role)
    if image_role == 'composed':
        c.auth.revoke('synthetic-read-token')
    return result
denied(lambda: prepare(c, windows_resolver=revoke_after_actual_composed), 401)
assert roles == ['raw', 'composed']
print('PASS actual final metadata read rejects revocation after both actual images resolved')
print('4 stored Backend + Learning composition groups passed; synthetic MemoryStore only')
