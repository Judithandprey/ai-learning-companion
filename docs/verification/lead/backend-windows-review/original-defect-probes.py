from copy import deepcopy
import pytest
from packages.contracts.windows_frame import validate
from services.api.tests.test_control import USER, documents
from services.api.tests.test_windows_frame_ingress import (
    setup, registered, uploaded, raw_setup, windows_setup, ingest, additional,
)
from services.api.tests.test_raw_frame_readers import reader, resolver

@pytest.mark.parametrize('separate', [False, True])
def test_cross_frame_contradictory_artifact_identity(separate, windows_setup):
    c = windows_setup
    item, frame = additional(c, parents=['process-1'])
    frame['raw']['pixels_sha256'] = 'f' * 64
    validate(frame)
    if separate:
        ingest(c)
        ack = ingest(c, {**c.batch, 'records': [item]}, [frame], 'second')
    else:
        ack = ingest(c, {**c.batch, 'records': [c.batch['records'][0], item]}, [c.windows_frame, frame])
    packet = reader(c).read_windows(['process-1', item['record_id']])
    assert len(packet['frames']) == 2
    first, second = packet['frames']
    assert first['raw']['artifact'] == second['raw']['artifact']
    assert first['raw']['native_file'] == second['raw']['native_file']
    assert first['raw']['pixels_sha256'] != second['raw']['pixels_sha256']
    results = [resolver(c).resolve_windows(f, image_role='raw', max_bytes=len(c.data)) for f in packet['frames']]
    assert all(r['status'] == 'available' and r['data'] == c.data for r in results)
    assert all(a['disposition'] == 'accepted' for a in ack['acknowledged'])
    print('CONTRADICTION_ACCEPTED', 'separate' if separate else 'same-batch', 'reader=available resolver=available')

def test_empty_capture_marker_legacy_record_read(windows_setup):
    c=windows_setup
    ingest(c)
    c.store._documents[USER][('capture_tombstone', 'process-1')] = {}
    value=c.registry.capture.read_record(USER, 'process-1')
    print('RECORD_READ_WITH_EMPTY_MARKER', value)

@pytest.mark.parametrize('separate', [False, True])
def test_cross_frame_byte_alias_contradiction(separate, windows_setup):
    import base64
    from services.api.tests.test_ingress_http import ORIGINALS, request, success
    c=windows_setup
    alias={**c.ref, 'artifact_id':'review-windows-alias'}
    success(request(c.app, 'PUT', ORIGINALS+alias['artifact_id'], body={
        'contract_version':'0.2.2','source':c.source,'kind':'screen_image',
        'artifact':alias,'data_base64':base64.b64encode(c.data).decode('ascii')}), 'OriginalArtifactReceipt')
    item,frame=additional(c,parents=['process-1'])
    frame['raw']['artifact']=alias
    frame['raw']['pixels_sha256']='f'*64
    item['artifacts']=[alias if ref['artifact_id']==c.ref['artifact_id'] else ref for ref in item['artifacts']]
    validate(frame)
    if separate:
        ingest(c)
        ingest(c,{**c.batch,'records':[item]},[frame],'alias-second')
    else:
        ingest(c,{**c.batch,'records':[c.batch['records'][0],item]},[c.windows_frame,frame])
    packet=reader(c).read_windows(['process-1',item['record_id']])
    first,second=packet['frames']
    assert first['raw']['artifact']['artifact_id'] != second['raw']['artifact']['artifact_id']
    assert first['raw']['native_file']==second['raw']['native_file']
    assert first['raw']['artifact']['sha256']==second['raw']['artifact']['sha256']
    assert first['raw']['pixels_sha256']!=second['raw']['pixels_sha256']
    assert all(resolver(c).resolve_windows(f,image_role='raw',max_bytes=len(c.data))['status']=='available' for f in packet['frames'])
    print('BYTE_ALIAS_CONTRADICTION_ACCEPTED','separate' if separate else 'same-batch')
