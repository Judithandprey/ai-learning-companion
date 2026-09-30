"""Bounded read-only candidate checks; writes only this /tmp evidence.
Run with pinned Python and exact-export directory as argv[1].
Synthetic archive and audited PNG bytes; no native/display/DB/provider.
"""
import sys, json, hashlib, traceback
from pathlib import Path
from copy import deepcopy
ROOT = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(ROOT))
from packages.contracts import windows_frame, macos_frame
from services.api.tests.macos_fixtures import (
    setup, registered, uploaded, raw_setup, macos_setup, ingest, ingest_request,
    additional, references, upload_original, gap,
)
from services.api.tests.test_control import documents
from services.api.errors import DomainError
from services.api.domain import key

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
        assert documents(c) == before, 'failure mutated archive'
        return {'status': exc.status, 'code': exc.code, 'no_write': True}
    raise AssertionError('unexpected acceptance')

def case(name, fn):
    try:
        detail = fn()
        RESULTS.append({'name': name, 'passed': True, 'detail': detail})
    except Exception as exc:
        RESULTS.append({'name': name, 'passed': False, 'error': repr(exc), 'trace': traceback.format_exc()})
    print(json.dumps(RESULTS[-1], sort_keys=True))

def win_descriptor(c, width_delta=0):
    f = json.loads((ROOT / 'packages/contracts/windows_frame/examples/windows-retained.json').read_text())[0]
    f.update(frame_id='independent-windows-frame', source=deepcopy(c.source),
             **{n:c.batch[n] for n in ('device_id','session_id','stream_id')})
    f['raw'].update(artifact=deepcopy(c.ref), width=c.macos_frame['raw']['width'] + width_delta,
                    height=c.macos_frame['raw']['height'], native_file='frames/'+c.ref['sha256']+'.png')
    f['composed'] = None
    windows_frame.validate(f)
    return f

def cross_family(*, contradiction, alias=False):
    c = fixture()
    win = win_descriptor(c, int(contradiction))
    old_record = deepcopy(c.batch['records'][0])
    old_record.update(record_id='independent-windows-record', frame_id=win['frame_id'], artifacts=[deepcopy(c.ref)])
    first = {**c.batch, 'records':[old_record]}
    old_ack = c.registry.ingest_windows_frames(c.user, first, [win], 'independent-windows')
    item, mac = additional(c, parents=[old_record['record_id']])
    if alias:
        mac['raw']['artifact']['artifact_id'] = 'independent-mac-png-alias'
        upload_original(c, mac['raw']['artifact'], c.data)
        item['artifacts'] = references(mac) + [deepcopy(c.ink_ref)]
    macos_frame.validate(mac)
    envelope = {'contract_version':'0.2.12', 'batch':{**c.batch,'records':[item]}, 'frames':[mac]}
    ack = ingest_request(c, envelope, key='independent-cross-family')
    before = documents(c)
    assert ingest_request(c, envelope, key='independent-cross-family') == ack
    assert documents(c) == before
    retained_win = before[('raw_capture_frame',win['frame_id'])]
    retained_mac = before[('raw_capture_frame',mac['frame_id'])]
    assert retained_win['raw']['artifact']['sha256'] == retained_mac['raw']['artifact']['sha256']
    assert retained_win['raw']['width'] - retained_mac['raw']['width'] == int(contradiction)
    return {'ordinary_client_submissions': True, 'windows_ack':old_ack['acknowledged'][0]['disposition'],
            'macos_ack':ack['acknowledged'][0]['disposition'], 'exact_replay_accepted_without_write':True,
            'same_archive_id':not alias, 'same_png_sha256':True,
            'windows_width':win['raw']['width'],'macos_width':mac['raw']['width'],
            'demonstrated_inconsistent_cross_family_admission':contradiction}

case('cross_family_consistent_original_is_compatible', lambda:cross_family(contradiction=False))
case('cross_family_same_artifact_conflict_is_accepted', lambda:cross_family(contradiction=True))
case('cross_family_same_hash_alias_conflict_is_accepted', lambda:cross_family(contradiction=True,alias=True))

if __name__ == '__main__':
    evidence={'candidate':'40ab42e4819bf725fd970cc330b8eb6fed7da73f', 'export':str(ROOT),
              'probe_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'checks':RESULTS,
              'passed':sum(r['passed'] for r in RESULTS),'failed':sum(not r['passed'] for r in RESULTS)}
    Path('/tmp/macos-adapter-40ab-archive-review-probes.json').write_text(json.dumps(evidence,indent=2)+'\n')
    sys.exit(bool(evidence['failed']))
