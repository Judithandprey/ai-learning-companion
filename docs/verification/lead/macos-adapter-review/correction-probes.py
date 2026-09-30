"""Independent bounded correction controls, adapted from preserved 40ab evidence.
Run with the existing project Python and exact-export directory as argv[1].
Uses actual typed MemoryStore admission/read/resolution, audited PNG fixture
bytes and synthetic descriptors. No native, database, listener or provider run.
"""
import hashlib
import json
import sys
import traceback
from copy import deepcopy
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT))
from packages.contracts import macos_frame, windows_frame
from services.api.errors import DomainError
from services.api.tests.macos_fixtures import (
    additional, ingest_request, macos_setup, raw_setup, references,
    registered, setup, upload_original, uploaded,
)
from services.api.tests.test_control import documents
from services.api.tests.test_raw_frame_readers import reader, resolver

OLD = Path('/tmp/macos-adapter-40ab-archive-review-probes.py')
OLD_HASH = hashlib.sha256(OLD.read_bytes()).hexdigest()
RESULTS = []


def fixture():
    c = setup.__wrapped__()
    for fn in (registered, uploaded, raw_setup, macos_setup):
        c = fn.__wrapped__(c)
    return c


def deny(c, fn, expected):
    before = documents(c)
    try:
        fn()
    except DomainError as exc:
        actual = (exc.status, exc.code)
        assert actual == expected, (actual, expected)
        assert documents(c) == before, 'refusal mutated archive'
        return {'status': exc.status, 'code': exc.code, 'no_write': True}
    raise AssertionError('unexpected acceptance')


def windows(c, width_delta=0):
    frame = json.loads((ROOT / 'packages/contracts/windows_frame/examples/windows-retained.json').read_text())[0]
    frame.update(frame_id='independent-windows-frame', source=deepcopy(c.source),
                 **{name: c.batch[name] for name in ('device_id', 'session_id', 'stream_id')})
    frame['raw'].update(artifact=deepcopy(c.ref),
                        width=c.macos_frame['raw']['width'] + width_delta,
                        height=c.macos_frame['raw']['height'],
                        native_file='frames/' + c.ref['sha256'] + '.png')
    frame['composed'] = None
    windows_frame.validate(frame)
    return frame


def retain_windows(c, frame, sequence=1):
    record = deepcopy(c.batch['records'][0])
    record.update(record_id='independent-windows-record', sequence=sequence,
                  frame_id=frame['frame_id'], artifacts=[deepcopy(c.ref)])
    batch = {**c.batch, 'records': [record]}
    ack = c.registry.ingest_windows_frames(c.user, batch, [frame], 'independent-windows')
    assert ack['acknowledged'][0]['disposition'] == 'accepted'
    assert documents(c)[('raw_capture_frame', frame['frame_id'])] == frame
    return record


def cross_family(*, contradiction, alias=False):
    c = fixture()
    win = windows(c, int(contradiction))
    record = retain_windows(c, win)
    item, mac = additional(c, parents=[record['record_id']])
    if alias:
        mac['raw']['artifact']['artifact_id'] = 'independent-mac-png-alias'
        upload_original(c, mac['raw']['artifact'], c.data)
        item['artifacts'] = references(mac) + [deepcopy(c.ink_ref)]
    macos_frame.validate(mac)
    assert win['raw']['artifact']['sha256'] == mac['raw']['artifact']['sha256']
    assert (win['raw']['artifact']['artifact_id'] == mac['raw']['artifact']['artifact_id']) == (not alias)
    envelope = {'contract_version': '0.2.12', 'batch': {**c.batch, 'records': [item]}, 'frames': [mac]}
    outcome = {'ordinary_typed_submissions': True, 'same_archive_id': not alias,
               'same_png_sha256': True, 'windows_width': win['raw']['width'],
               'macos_width': mac['raw']['width']}
    if contradiction:
        outcome['macos_refusal'] = deny(c, lambda: ingest_request(c, envelope, key='independent-cross-family'),
                                       (409, 'record_conflict'))
        assert ('raw_capture_frame', mac['frame_id']) not in documents(c)
    else:
        ack = ingest_request(c, envelope, key='independent-cross-family')
        assert ack['acknowledged'][0]['disposition'] == 'accepted'
        retained = documents(c)
        assert ingest_request(c, envelope, key='independent-cross-family') == ack
        assert reader(c).read_macos([item['record_id']])['frames'] == [mac]
        for role, data in (('raw', c.data), ('composed', c.composed_data)):
            assert resolver(c).resolve_macos(mac, image_role=role, max_bytes=len(data))['data'] == data
        assert documents(c) == retained
        outcome.update(macos_ack='accepted', exact_replay_without_write=True,
                       exact_descriptor_read=True, raw_and_composed_bytes_unchanged=True)
    assert documents(c)[('raw_capture_frame', win['frame_id'])] == win
    return outcome


def later_contradiction():
    c = fixture()
    ack = ingest_request(c, c.envelope, key='independent-prior-mac')
    assert ack['acknowledged'][0]['disposition'] == 'accepted'
    # The old Windows path remains unchanged and can accept a later conflicting
    # declaration. No private-store mutation is used to simulate this boundary.
    win = windows(c, 1)
    retain_windows(c, win, sequence=2)
    result = {'initial_macos_ack': 'accepted', 'later_windows_ack': 'accepted',
              'old_writer_boundary_unchanged': True}
    result['exact_replay'] = deny(c, lambda: ingest_request(c, c.envelope, key='independent-prior-mac'),
                                  (503, 'unavailable'))
    result['read'] = deny(c, lambda: reader(c).read_macos(['process-1']), (503, 'unavailable'))
    retained = documents(c)
    for role, data in (('raw', c.data), ('composed', c.composed_data)):
        assert resolver(c).resolve_macos(c.macos_frame, image_role=role, max_bytes=len(data)) == {'status': 'unavailable'}
    assert documents(c) == retained
    result['both_resolvers_unavailable_without_write'] = True
    return result


def case(name, fn):
    try:
        RESULTS.append({'name': name, 'passed': True, 'detail': fn()})
    except Exception as exc:
        RESULTS.append({'name': name, 'passed': False, 'error': repr(exc), 'trace': traceback.format_exc()})
    print(json.dumps(RESULTS[-1], sort_keys=True))


case('consistent_same_artifact_control', lambda: cross_family(contradiction=False))
case('contradictory_same_artifact_refused_atomically', lambda: cross_family(contradiction=True))
case('contradictory_same_sha_alias_refused_atomically', lambda: cross_family(contradiction=True, alias=True))
case('consistent_same_sha_alias_control', lambda: cross_family(contradiction=False, alias=True))
case('later_old_family_conflict_blocks_exact_replay_read_and_both_roles', later_contradiction)
assert hashlib.sha256(OLD.read_bytes()).hexdigest() == OLD_HASH
receipt = {
    'candidate': 'b83ee3e6de8275713dddce37f2be0b58376cc0be', 'export': str(ROOT),
    'probe_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'preserved_old_probe_sha256': OLD_HASH,
    'checks': RESULTS, 'passed': sum(r['passed'] for r in RESULTS),
    'failed': sum(not r['passed'] for r in RESULTS),
}
Path('/tmp/macos-adapter-b83-correction-probes.json').write_text(json.dumps(receipt, indent=2) + '\n')
sys.exit(bool(receipt['failed']))
