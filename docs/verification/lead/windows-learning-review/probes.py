#!/usr/bin/env python3
"""Independent component probes; every input/reader/resolver is synthetic.
Run with the exact candidate export as argv[1]; no Backend/native/provider calls.
"""
from copy import deepcopy
from pathlib import Path
import asyncio
import json
import sys

root = Path(sys.argv[1]).resolve()
sys.path[:0] = [str(root), str(root / 'tests/evals')]
from jsonschema import ValidationError
from services.learning.archive import canonical, digest
from services.learning.process_context import compose_process_context, prepare_stored_process_context, prepare_observation_window
from test_windows_process_context import windows_supplied, add_second
from test_raw_process_context import raw_supplied
from test_desktop_process_context import desktop_supplied
from test_process_context import supplied as legacy_supplied
from test_image_evidence import png, chunk


def forbidden(*args, **kwargs):
    raise AssertionError('Unexpected legacy resolver call')


def resolver(values):
    def resolve(frame, *, image_role, max_bytes):
        return {'status': 'available', 'frame': frame, 'image_role': image_role,
                'data': values[3][image_role], 'media_type': 'image/png'}
    return resolve


def compose(values, resolve=None, **limits):
    return compose_process_context(*values[:3], forbidden, user_id=values[1][0]['user_id'],
        windows_resolver=resolver(values) if resolve is None else resolve, **limits)


def metadata_size(packet):
    detached = deepcopy(packet)
    for item in detached['items']:
        for key in ('image', 'composed_image'):
            if key in item:
                item[key].pop('data', None)
    return len(canonical(detached))


def expect_exception(cls, fn):
    try:
        fn()
    except cls as exc:
        return str(exc)
    raise AssertionError('Expected ' + str(cls))


# 1. Cross-record swaps fail even with identical payloads, correct roles and exact
# source/incarnation. The complete descriptor, including frame identity, matters.
v = windows_supplied(alias='same_id')
add_second(v)
first, second = deepcopy(v[2])
def swap(frame, *, image_role, max_bytes):
    result = resolver(v)(frame, image_role=image_role, max_bytes=max_bytes)
    result['frame'] = second if frame['frame_id'] == first['frame_id'] else first
    return result
p = compose(v, swap)
assert p['attached_bytes'] == 0
assert all(i[key]['status'] == 'frame_mismatch' for i in p['items'] for key in ('image', 'composed_image'))
print('PASS cross-record paired descriptor swap with identical bytes')

# 2. A too-large raw PNG does not consume the independent composed allowance.
# A PNG ancillary chunk makes raw bigger without changing the declared pixels.
v = windows_supplied()
raw = png(width=4, height=2, color=6,
          raw=b'\0' + bytes(range(16)) + b'\0' + bytes(range(16, 32)),
          extra=chunk(b'tEXt', b'Independent probe\0' + b'x' * 1000))
v[3]['raw'] = raw
ref = v[2][0]['raw']['artifact']
ref.update(sha256=digest(raw), byte_length=len(raw))
v[2][0]['raw']['native_file'] = 'frames/' + digest(raw) + '.png'
v[0]['records'][0]['artifacts'][0] = deepcopy(ref)
calls = []
def bounded(frame, *, image_role, max_bytes):
    calls.append((image_role, max_bytes))
    return resolver(v)(frame, image_role=image_role, max_bytes=max_bytes)
limit = len(v[3]['composed'])
p = compose(v, bounded, max_image_bytes=limit, max_total_bytes=limit)
assert p['items'][0]['image'] == {'status': 'byte_limit', 'image_role': 'raw'}
assert p['items'][0]['composed_image']['data'] == v[3]['composed']
assert p['attached_bytes'] == limit and calls == [('composed', limit)]
assert metadata_size(p) <= p['budget']['max_metadata_bytes']
print('PASS independent role budgets with large raw / small composed PNG')

# 3. Invalid full references on the second record cannot hide behind a budget
# omission, and mutation through caller-owned metadata cannot produce a packet.
v = windows_supplied(); add_second(v)
v[0]['records'][1]['artifacts'][1]['sha256'] = 'f' * 64
expect_exception(ValidationError, lambda: compose(v, forbidden, max_metadata_bytes=1000))
v = windows_supplied()
def mutate_original(frame, *, image_role, max_bytes):
    if image_role == 'composed':
        v[2][0]['profile']['source_at_start']['label'] = 'Mutated concurrently'
    return resolver(v)(frame, image_role=image_role, max_bytes=max_bytes)
assert 'changed during composition' in expect_exception(ValueError, lambda: compose(v, mutate_original))
print('PASS omitted reference prevalidation and caller metadata mutation fence')

# 4. The final authorized read still receives a budget-omitted record. Both a
# permission error and cancellation there withhold the complete prepared packet.
v = windows_supplied(); add_second(v)
v[2][1]['composed']['transformation'] = 'Second explicit descriptor ' + 'x' * 3500
single = windows_supplied()
budget = metadata_size(compose(single)) + 200
p = compose(v, max_metadata_bytes=budget)
assert [i['record']['record_id'] for i in p['items']] == ['process-1']
assert p['counts']['omitted'] == 1
snapshot = dict(batch=deepcopy(v[0]), sources=deepcopy(v[1]), frames=deepcopy(v[2]))
snapshot['batch']['delivery_mode'] = 'historical'
selection = [r['record_id'] for r in v[0]['records']]
for error in (PermissionError, asyncio.CancelledError):
    reads = []
    def read(ids, *, max_metadata_bytes):
        reads.append(list(ids))
        assert ids == selection and max_metadata_bytes == 4 * 1024 * 1024
        if len(reads) == 2:
            raise error('Second selected record no longer available')
        return deepcopy(snapshot)
    expect_exception(error, lambda: prepare_stored_process_context(selection, read, forbidden,
        user_id=v[1][0]['user_id'], windows_resolver=resolver(v), max_metadata_bytes=budget))
    assert reads == [selection, selection]
print('PASS full-selection recheck/cancellation includes metadata-omitted record')

# 5. Every prior descriptor family keeps its old resolver signature alongside
# Windows in one supplied historical window; no descriptor becomes a legacy Frame.
v = windows_supplied()
payloads = {}
for index, other in enumerate((legacy_supplied(display=True), raw_supplied(), desktop_supplied()), 2):
    record, frame = deepcopy(other[0]['records'][0]), deepcopy(other[2][0])
    record.update(record_id='old-record-' + str(index), sequence=index,
                  frame_id='old-frame-' + str(index), causal_parents=[])
    frame['frame_id'] = record['frame_id']
    new_id = 'old-artifact-' + str(index)
    record['artifacts'][0]['artifact_id'] = new_id
    if 'artifact' in frame:
        frame['artifact']['artifact_id'] = new_id
    else:
        frame['artifact_id'] = new_id
    v[0]['records'].append(record); v[2].append(frame)
    payloads[frame['frame_id']] = other[3]
snapshot = dict(batch=deepcopy(v[0]), sources=deepcopy(v[1]), frames=deepcopy(v[2]))
snapshot['batch']['delivery_mode'] = 'historical'
selection = [r['record_id'] for r in v[0]['records']]
old_calls, new_calls, reads = [], [], []
def old_resolve(frame, *, max_bytes):
    old_calls.append(frame['frame_id'])
    return {'status': 'available', 'frame': frame, 'media_type': 'image/png', 'data': payloads[frame['frame_id']]}
def new_resolve(frame, *, image_role, max_bytes):
    new_calls.append((frame['contract_version'], image_role))
    return resolver(v)(frame, image_role=image_role, max_bytes=max_bytes)
def read(ids, *, max_metadata_bytes):
    reads.append(list(ids)); assert ids == selection
    return deepcopy(snapshot)
p = prepare_observation_window(selection, read, old_resolve, user_id=v[1][0]['user_id'], windows_resolver=new_resolve)
assert len(old_calls) == 3 and new_calls == [('0.2.9', 'raw'), ('0.2.9', 'composed')]
assert [i['frame'] for i in p['items']] == v[2]
assert all(i['image']['status'] == 'attached' for i in p['items'])
assert p['attached_bytes'] == sum(map(len, payloads.values())) + sum(map(len, v[3].values()))
assert reads == [selection, selection]
assert p['observation_window']['capture_chronology'] == 'unknown'
assert p['observation_window']['comparisons'][0]['clock_readings'] == {'status': 'unknown', 'reason': 'no_process_capture_clock'}
assert p['observation_window']['comparisons'][0]['retained_composed_image_bytes'] == 'unknown'
assert p['authorization_status'] == p['live_status'] == p['provider_receipt'] == 'not_attested'
print('PASS mixed 0.1.0 / 0.2.5 / 0.2.7 / 0.2.9 dispatch, bytes and unknown clocks')

# 6. Metadata counts every role/status and all retained JSON, across different
# result states at the minimum whole-item admission boundary; binary-only removal.
v = windows_supplied(alias='same_id')
base = metadata_size(compose(v))
statuses = ('missing', 'revoked', 'unavailable', 'unobservable', 'byte_limit', 'unexpected')
for budget in range(base - 2, base + 151, 13):
    for status in statuses:
        def gaps(frame, *, image_role, max_bytes):
            return {'status': status, 'frame': frame, 'image_role': image_role, 'data': b'stale bytes'}
        p = compose(v, gaps, max_metadata_bytes=budget)
        assert metadata_size(p) <= budget and p['attached_bytes'] == 0
        assert all('data' not in item[key] for item in p['items'] for key in ('image', 'composed_image'))
print('PASS independent metadata measurement across role failures and budget boundaries')
print('6 independent synthetic probe groups passed')
