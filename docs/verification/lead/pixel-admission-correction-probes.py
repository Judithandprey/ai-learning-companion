"""2209a11 bounded review. Keep original 81e5441 bug probes/results unchanged."""
from copy import deepcopy
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from services.api.tests import test_ingress_http as http
from services.api.tests import test_raw_frame_ingress as raw
from services.api.tests import test_producer_admission as admission
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_control import documents, control_fixture
from services.api.storage import MemoryStore
from services.api.errors import DomainError

RESULTS=[]

def fixture():
    c=http.setup.__wrapped__()
    return admission.admission.__wrapped__(raw.raw_setup.__wrapped__(http.uploaded.__wrapped__(http.registered.__wrapped__(c))))

def submit(c,family,batch,req):
    route,version,frame={'raw':(admission.RAW,'0.2.6',c.raw_frame),'legacy':(http.FRAMES,'0.2.4',c.frame)}[family]
    return http.request(c.all_routes,'POST',route,request_key=req,
        body={'contract_version':version,'batch':batch,'frames':[frame]})

def gap_then_loss(c,*,cached=False):
    admission.bind(c)
    item=gap(c,record_id='review-desktop-gap',sequence=2 if cached else 1,
             parents=['process-1'] if cached else [])
    body={'contract_version':'0.2.8','batch':{**c.honest,'records':[item]},'frames':[]}
    first=http.request(c.all_routes,'POST',admission.DESKTOP,request_key='review-gap',body=body)
    assert first.status_code==200,first.text
    assert not any(k[0]=='raw_capture_frame' and v['contract_version']=='0.2.7' for k,v in documents(c).items())
    for kind in ('control_start','control_stream'):
        del c.store._documents[c.user][(kind,c.registration['stream_id'])]['producer_profile']
    return item

for family in ('raw','legacy'):
    for cached in (False,True):
        c=fixture(); batch=deepcopy(c.structured); request_key='review-old-history'
        if cached:
            old=submit(c,family,batch,request_key)
            assert old.status_code==200,old.text
        item=gap_then_loss(c,cached=cached)
        if not cached:
            batch['records'][0].update(record_id='review-forged-reselect',sequence=2,causal_parents=[item['record_id']])
        before=documents(c)
        response=submit(c,family,batch,request_key)
        assert response.status_code==403,response.text
        assert response.json()=={'contract_version':'0.2.6' if family=='raw' else '0.2.4','error':'forbidden','retryable':False}
        assert documents(c)==before
        RESULTS.append({'case':family+('_cached_success' if cached else '_original_first_gap_repro'),'status':403,'unchanged':True})

# Genuine never-desktop structured paths remain compatible, including a client
# key mentioning the operation, with independently checked exact success replay.
for family in ('raw','legacy'):
    c=fixture(); req='generic-mentions-desktop-frames:batch'
    first=submit(c,family,c.structured,req)
    assert first.status_code==200,first.text
    before=documents(c); again=submit(c,family,c.structured,req)
    assert again.status_code==200 and again.json()==first.json(),again.text
    assert documents(c)==before
    RESULTS.append({'case':'generic_structured_'+family,'status':200,'replay_unchanged':True})

# A same-owner desktop receipt cannot restrict an independent generic stream.
c=fixture(); gap_then_loss(c); before=documents(c)
reg={**c.registration,'stream_id':'review-independent-stream'}
c.registry.authorize_start(c.user,reg,producer_id='review-generic-producer')
c.registry.register(c.user,reg,'review-independent-register')
batch=deepcopy(c.structured); batch['stream_id']=reg['stream_id']
batch['records'][0].update(record_id='review-independent-record',frame_id=None,artifacts=[],
    source={n:c.core['SourceSnapshot'][n] for n in ('user_id','source_id','source_version')})
ack=c.registry.capture.ingest(c.user,batch,'review-independent-capture')
assert ack['acknowledged'][0]['disposition']=='accepted'
assert c.registry.capture.ingest(c.user,batch,'review-independent-capture')==ack
assert all(documents(c)[k]==v for k,v in before.items())
RESULTS.append({'case':'same_actor_other_stream','status':200,'prior_rows_unchanged':True})

# Actor-scoped store isolation also allows the same stream identifier elsewhere.
c=fixture(); gap_then_loss(c); before=documents(c)
other=control_fixture(c.store,'review-other-actor')
assert other.batch['stream_id']==c.batch['stream_id']
ack=other.registry.capture.ingest(other.user,other.batch,'review-other-capture')
assert ack['acknowledged'][0]['disposition']=='accepted' and documents(c)==before
RESULTS.append({'case':'other_actor_same_stream','status':200,'prior_actor_unchanged':True})

# A recognized retained desktop receipt must be decoded before an old success can
# return. Check established unavailable/503 conventions, never a silent downgrade.
for damage in ('invalid_json','wrong_schema'):
    c=fixture(); first=submit(c,'raw',c.structured,'review-old-raw'); assert first.status_code==200
    gap_then_loss(c,cached=True)
    for (kind,identifier),row in c.store._documents[c.user].items():
        if kind=='capture_replay' and '/v2/process/desktop-frames:batch' in identifier:
            row['response_json']='{' if damage=='invalid_json' else '{}'
    before=documents(c)
    response=submit(c,'raw',c.structured,'review-old-raw')
    assert response.status_code==503,response.text
    assert response.json()=={'contract_version':'0.2.6','error':'unavailable','retryable':True}
    assert documents(c)==before
    RESULTS.append({'case':'malformed_desktop_ack_'+damage,'status':503,'unchanged':True})

print(json.dumps({'checks':len(RESULTS),'all_assertions_passed':True,'results':RESULTS}, indent=2))
