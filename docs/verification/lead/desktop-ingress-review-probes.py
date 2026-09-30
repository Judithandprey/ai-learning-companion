"""Independent synthetic contract probes; run from repository root."""
from copy import deepcopy
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from jsonschema import Draft202012Validator, ValidationError
from packages.contracts import desktop_capture_ingress as w, raw_capture_ingress as old
from packages.contracts.desktop_capture_ingress.generate import outputs,build_document
from packages.contracts.tests.test_display_source import display, observation
from packages.contracts.tests.test_capture_frame import proposal
from packages.contracts.tests.test_desktop_frame import desktop
s=display.__wrapped__(); b,r,f,s,o=desktop.__wrapped__(proposal.__wrapped__(s,observation.__wrapped__(s)))
base={'contract_version':'0.2.8','batch':b,'frames':[f]};name='DesktopFrameBatchRequest';n=0

def check(fn,good=True):
 global n
 try:fn()
 except ValidationError:assert not good,'Unexpected rejection'
 else:assert good,'Unexpected acceptance'
 n+=1

def validate(x):
 before=deepcopy(x);w.validate_frame_batch(x,user_id='user-1');assert x==before

def gap(coverage='unknown'):
 x=deepcopy(base);r=x['batch']['records'][0];x['frames']=[];r.update(frame_id=None,artifacts=[],clock=None,observed_at=None,media_position=None,evidence={'kind':'coverage','coverage':coverage,'from_clock_ms':None,'through_clock_ms':None,'missing_sequences':[],'limitations':['unknown']});return x

check(lambda:validate(base));assert w.decode_request(name,w.canonical_request(name,base))==base
for cov in ['partial','unknown','unobserved']:check(lambda cov=cov:validate(gap(cov)))
for field,v in [('observed_at','2026-09-30T12:00:00Z'),('media_position',0),('clock',{'domain_id':'clock','elapsed_ms':1,'uncertainty_ms':None}),('artifacts',[deepcopy(f['artifact'])]),('evidence',deepcopy(b['records'][0]['evidence']))]:
 x=gap();x['batch']['records'][0][field]=v;check(lambda x=x:validate(x),False)
x=gap('observed_samples');check(lambda:validate(x),False)
# A frameless source contributes no display authority: owner checks must still include it.
x=gap();x['batch']['records'][0]['source']['user_id']='foreign';check(lambda:validate(x),False)
# Gap time intervals need an actual containing clock; this profile cannot invent it.
for k in ['from_clock_ms','through_clock_ms']:
 x=gap();x['batch']['records'][0]['evidence'][k]=0;check(lambda x=x:validate(x),False)
x=gap();x['batch']['records'][0]['evidence'].update(from_clock_ms=0,through_clock_ms=0);check(lambda:validate(x),False)
# Honest missing prior process sequence survives; same-batch present sequence cannot also be missing.
x=gap('partial');r=x['batch']['records'][0];r['sequence']=3;r['evidence'].update(missing_sequences=[{'first':1,'last':2}],limitations=['missing_events']);check(lambda:validate(x))
y=deepcopy(x);extra=deepcopy(r);extra.update(record_id='present-2',sequence=2);extra['evidence'].update(missing_sequences=[]);y['batch']['records'].append(extra);check(lambda:validate(y),False)
# Empty frame array is only valid if no record names one; extras/duplicates/missing IDs fail.
for frames in [[],[deepcopy(f),deepcopy(f)]]:
 x=deepcopy(base);x['frames']=frames;check(lambda x=x:validate(x),False)
x=gap();x['frames']=[deepcopy(f)];check(lambda:validate(x),False)
x=deepcopy(base);x['frames'][0]['frame_id']='foreign-frame';check(lambda:validate(x),False)
# One frame can serve multiple records, including alongside a separate frameless gap.
x=deepcopy(base);second=deepcopy(x['batch']['records'][0]);second.update(record_id='second',sequence=2,causal_parents=[r['record_id']]);x['batch']['records'].append(second);check(lambda:validate(x))
y=gap()['batch']['records'][0];y.update(record_id='gap-3',sequence=3,causal_parents=['second']);x['batch']['records'].append(y);check(lambda:validate(x))
for part,key,value in [('frame','device_id','other-device'),('frame','stream_id','other-stream'),('record','source',{'user_id':'user-1','source_id':'other-source','source_version':1})]:
 x=deepcopy(base);target=x['frames'][0] if part=='frame' else x['batch']['records'][0];target[key]=value;check(lambda x=x:validate(x),False)
for key,value in [('byte_length',111),('sha256','f'*64),('media_type','image/jpeg'),('artifact_id','other-original')]:
 x=deepcopy(base);x['batch']['records'][0]['artifacts'][0][key]=value;check(lambda x=x:validate(x),False)
# Standalone-descriptor semantic invariants must be invoked by the HTTP wrapper.
for change in ['wrong_estimate','half_clock','backdated_callback']:
 x=deepcopy(base);f2=x['frames'][0]
 if change=='wrong_estimate':f2['timing'].update(observed_at_estimate='2026-09-30T12:00:01.251Z',estimate_basis='session_wall_plus_callback_monotonic_delta')
 elif change=='half_clock':f2['profile']['host_clock']['display_time_ticks_decimal']='17'
 else:f2['profile']['host_clock']['callback_seconds']=0
 check(lambda x=x:validate(x),False)
# Authored native clocks stay separate from process clocks even on a framed record.
x=deepcopy(base);x['batch']['records'][0]['clock']={'domain_id':'invented','elapsed_ms':1,'uncertainty_ms':None};check(lambda:validate(x),False)
# Wrapper closure, explicit versions and hostile JSON parsing.
for path,v in [(('contract_version',),'0.2.6'),(('batch','contract_version'),'0.2.8'),(('frames',0,'contract_version'),'0.2.5'),(('unexpected',),'secret')]:
 x=deepcopy(base);t=x
 for k in path[:-1]:t=t[k]
 t[path[-1]]=v;check(lambda x=x:validate(x),False)
blob=w.canonical_request(name,base)
for data in [bytearray(blob),memoryview(blob),blob.decode(),b'\xff',b'{"x":1,"x":2}',b'NaN',b'Infinity',b'-Infinity',blob+b'{}',b'['*100+b'0'+b']'*100]:check(lambda data=data:w.decode_request(name,data),False)
# Raw-byte limit includes whitespace; canonical limit does not make raw surplus acceptable.
check(lambda:w.decode_request(name,b' '*(w.body_limit(name)-len(blob))+blob))
check(lambda:w.decode_request(name,b' '*(w.body_limit(name)-len(blob)+1)+blob),False)
# Replay ignores object order, preserving array order even where both batches are semantically valid.
x=deepcopy(base);f2=deepcopy(f);f2['frame_id']='frame-2';r2=deepcopy(b['records'][0]);r2.update(record_id='record-2',sequence=2,frame_id='frame-2');x['frames'].append(f2);x['batch']['records'].append(r2)
check(lambda:validate(x));canonical=w.canonical_request(name,x);y=deepcopy(x);y['frames'].reverse();check(lambda:validate(y));assert canonical!=w.canonical_request(name,y)
y=deepcopy(x);y['batch']['records'].reverse();check(lambda:validate(y));assert canonical!=w.canonical_request(name,y)
y=json.loads(json.dumps(x,sort_keys=True));assert canonical==w.canonical_request(name,y)
# Coverage ACK may have no artifacts; missing/extra receipts or another owner cannot pass.
g=gap();rec=g['batch']['records'][0]
ack={'contract_version':'0.2.0','user_id':'user-1',**{k:g['batch'][k] for k in ['batch_id','device_id','session_id','stream_id']},'acknowledged':[{'record_id':rec['record_id'],'sequence':rec['sequence'],'received_at':'2026-09-30T12:00:00Z','disposition':'accepted','envelope':'committed','artifacts':[]}]}
check(lambda:w.validate_ack(g['batch'],ack,user_id='user-1'))
for key,value in [('user_id','other'),('acknowledged',[])]:
 a=deepcopy(ack);a[key]=value;check(lambda a=a:w.validate_ack(g['batch'],a,user_id='user-1'),False)
# Framed ACKs require exact separately supplied verification facts; pending receipts still fail.
a=deepcopy(ack);a['acknowledged'][0].update(record_id=b['records'][0]['record_id'],sequence=b['records'][0]['sequence'],artifacts=[{**deepcopy(f['artifact']),'status':'verified'}]);a['batch_id']=b['batch_id']
verified=frozenset({tuple(f['artifact'][k] for k in ['artifact_id','sha256','byte_length','media_type'])})
check(lambda:w.validate_ack(b,a,user_id='user-1',verified_artifacts=verified))
check(lambda:w.validate_ack(b,a,user_id='user-1'),False)
a['acknowledged'][0]['artifacts'][0]['status']='pending'
check(lambda:w.validate_ack(b,a,user_id='user-1',verified_artifacts=verified),False)
a['acknowledged'][0]['artifacts']=[]
check(lambda:w.validate_ack(b,a,user_id='user-1',verified_artifacts=verified),False)
# Errors are content-free and only two codes allow retry.
for error in [v for codes in w.ERROR_CODES.values() for v in codes]:
 check(lambda error=error:w.validate('DesktopIngressError',{'contract_version':'0.2.8','error':error,'retryable':True}),error in {'unavailable','dependency_missing'})
# Generated evidence: isolated route/security/capability, all refs resolvable, outputs exact.
doc=build_document();assert list(doc['paths'])==['/v2/process/desktop-frames:batch'];op=next(iter(doc['paths'].values()))['post'];assert op['x-required-capabilities']==['process.desktop-ingress.v0.2.8','process.capture.v0.2'];assert doc['security']==[{'BearerAuth':[]}]
Draft202012Validator.check_schema(w.SCHEMA)
for name2,data in outputs().items():assert Path('packages/contracts/desktop_capture_ingress/generated',name2).read_text()==data
pending=[doc]
while pending:
 obj=pending.pop()
 if isinstance(obj,dict):
  if '$ref' in obj:
   ref=obj['$ref'];assert ref.startswith('#/');target=doc
   for key in ref[2:].split('/'):target=target[key]
  pending.extend(obj.values())
 elif isinstance(obj,list):pending.extend(obj)
check(lambda:old.validate('RawFrameBatchRequest',base),False)
sha=hashlib.sha256(Path('packages/contracts/desktop_capture_ingress/__init__.py').read_bytes()).hexdigest()
print(json.dumps({'independent_checks':n,'schema_openapi_types':'consistent','validator_sha256':sha,'status':'PASS'}))
