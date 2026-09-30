from copy import deepcopy
from dataclasses import replace
import pytest
from services.api.domain import key
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import USER, documents
from services.api.tests.test_windows_ingress_http import (
    setup, registered, uploaded, raw_setup, windows_setup, windows_http,
    submit, success, error, WINDOWS_ROUTE,
)
from services.api.tests.test_windows_image_identity import second_frame

@pytest.mark.parametrize('alias',[False,True])
def test_cached_http_sees_unselected_retained_image_conflict(windows_http,alias):
    c=windows_http
    success(c,submit(c))
    item,frame=second_frame(c,alias=alias)
    envelope={**c.windows_envelope,'batch':{**c.batch,'records':[item]},'frames':[frame]}
    success(c,submit(c,envelope,'second-frame'),envelope)
    c.store._documents[USER][('raw_capture_frame',frame['frame_id'])]['composed']['image']['pixels_sha256']='f'*64
    before=documents(c)
    error(submit(c),503,'unavailable')
    assert documents(c)==before

@pytest.mark.parametrize('kind',['original_artifact_tombstone','capture_artifact_tombstone'])
@pytest.mark.parametrize('role',['raw','composed'])
def test_cached_http_empty_marker_blocks_either_original(windows_http,kind,role):
    c=windows_http
    success(c,submit(c))
    ref=c.ref if role=='raw' else c.composed_ref
    c.store._documents[USER][(kind,ref['artifact_id'])]={}
    before=documents(c)
    error(submit(c),404,'not_found')
    assert documents(c)==before

def test_cached_http_rechecks_scope_reduction_under_actor_lock(windows_http,monkeypatch):
    c=windows_http
    success(c,submit(c))
    before=documents(c)
    actual_get=_MemoryTransaction.get
    hit=[]
    def get(tx,kind,identifier):
        value=actual_get(tx,kind,identifier)
        if kind=='capture_replay' and value is not None:
            hit.append(identifier)
            c.auth._tokens['control-token']=replace(c.auth._tokens['control-token'],scopes=frozenset({'sources:read'}))
        return value
    monkeypatch.setattr(_MemoryTransaction,'get',get)
    error(submit(c),403,'forbidden')
    assert hit==[key('POST',WINDOWS_ROUTE,'windows-http')]
    assert documents(c)==before

def test_present_empty_http_receipt_cannot_recreate_ack(windows_http):
    c=windows_http
    ack=success(c,submit(c))
    identity=('capture_replay',key('POST',WINDOWS_ROUTE,'windows-http'))
    c.store._documents[USER][identity]={}
    before=documents(c)
    response=submit(c)
    print('EMPTY_RECEIPT_RESPONSE',response.status_code,response.json().get('acknowledged',[{}])[0].get('disposition'))
    error(response,503,'unavailable')
    assert documents(c)==before
