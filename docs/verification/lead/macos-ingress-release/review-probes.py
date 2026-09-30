"""Independent pure 0.2.12 contract probes; no service, files-as-originals or native access."""
from copy import deepcopy
import hashlib,json
from pathlib import Path
from jsonschema import ValidationError
from packages.contracts import macos_capture_ingress as wire
from packages.contracts import macos_frame, process_v2, capture_ingress, raw_capture_ingress, desktop_capture_ingress, windows_capture_ingress

BASE=Path(__file__).parent
NAME='MacOSFrameBatchRequest'
EXAMPLE=json.loads((BASE/'packages/contracts/macos_capture_ingress/examples/retained-batch.json').read_text())
OWNER=EXAMPLE['batch']['records'][0]['source']['user_id']
RESULTS=[]

def single():
    p=deepcopy(EXAMPLE);p['frames']=[p['frames'][2]];p['batch']['records']=[p['batch']['records'][2]]
    p['batch']['records'][0]['causal_parents']=[]
    return p

def pictures(frame):
    return [frame['raw']]+([frame['composition']['image']] if frame['composition']['kind']=='composed' else [])

def positive(name,p,action=None):
    before=deepcopy(p)
    (action or (lambda:wire.validate_frame_batch(p,user_id=OWNER)))()
    assert p==before,name
    RESULTS.append({'case':name,'outcome':'accepted','input_unchanged':True})

def negative(name,p,action=None):
    before=deepcopy(p)
    try:(action or (lambda:wire.validate_frame_batch(p,user_id=OWNER)))()
    except ValidationError as exc:
        RESULTS.append({'case':name,'outcome':'ValidationError','reason':exc.message.splitlines()[0][:180]})
    else:raise AssertionError('unexpected acceptance: '+name)
    assert p==before,name

def gap(p):
    r=deepcopy(p['batch']['records'][0]);r.update(record_id='review-gap',sequence=1,frame_id=None,artifacts=[],causal_parents=[],
        evidence={'kind':'coverage','coverage':'unknown','from_clock_ms':None,'through_clock_ms':None,
                  'missing_sequences':[],'limitations':['unknown','disconnected']})
    p['batch']['records']=[r];p['frames']=[]
    return r

def two_raw(*,same_path=False,different_session=False):
    p=single(); f=p['frames'][0]; f['composition']={'kind':'unknown','reason':'no_retained_outcome'}
    p['batch']['records'][0]['artifacts']=[deepcopy(f['raw']['artifact'])]
    other=deepcopy(f);other['frame_id']='review-other-frame'
    other['raw']['artifact']['artifact_id']='review-other-artifact'
    if not same_path:
        other['callback_sequence']=8;other['raw']['native_file']='frames/00000008.png'
    if different_session:other['profile']['native_session_id']='review-other-native-session'
    r=deepcopy(p['batch']['records'][0]);r.update(record_id='review-other-record',sequence=4,frame_id=other['frame_id'],artifacts=[deepcopy(other['raw']['artifact'])])
    p['frames'].append(other);p['batch']['records'].append(r)
    return p

positive('seven_exact_descriptors_and_ordered_roundtrip',EXAMPLE,
    lambda: (wire.validate_frame_batch(EXAMPLE,user_id=OWNER),
             None if wire.decode_request(NAME,wire.canonical_request(NAME,EXAMPLE))==EXAMPLE else (_ for _ in ()).throw(AssertionError('roundtrip'))))
assert EXAMPLE['frames']==json.loads((BASE/'packages/contracts/macos_frame/examples/macos-retained.json').read_text())

# Use only declared binding fixtures; this does not read or verify any PNG bytes.
p=single();frame=p['frames'][0];record=p['batch']['records'][0]
source={'contract_version':'0.2.3',**frame['source'],'type':'shared_display',
        **{k:frame[k] for k in ('device_id','session_id','stream_id')},'project_id':None,'source_timezone':'UTC','created_at':'2026-09-30T12:00:00Z'}
bindings=[{'contract_version':'0.2.2','kind':'screen_image','source':deepcopy(frame['source']),'artifact':deepcopy(a['artifact'])} for a in pictures(frame)]
positive('binding_accepts_each_exact_distinct_png_in_reverse_order',p,
    lambda:macos_frame.validate_binding(p['batch'],record['record_id'],frame,source,list(reversed(bindings))))
wrong=deepcopy(bindings);wrong[1]['kind']='editable_ink'
negative('png_binding_cannot_be_replaced_by_ink_role',p,lambda:macos_frame.validate_binding(p['batch'],record['record_id'],frame,source,wrong))

for field,value in [('source_id','foreign-source'),('user_id','foreign-owner')]:
    p=single();p['frames'][0]['source'][field]=value;macos_frame.validate(p['frames'][0]);negative('record_frame_'+field+'_mismatch',p)
p=single();p['frames'][0]['stream_id']='foreign-stream';macos_frame.validate(p['frames'][0]);negative('record_frame_stream_mismatch',p)
p=single();p['batch']['records'][0]['artifacts'].pop();negative('missing_composed_png_reference',p)
p=single();p['batch']['records'][0]['clock']={'domain_id':'review-clock','elapsed_ms':1234,'uncertainty_ms':None};process_v2.validate('ProcessBatch',p['batch']);negative('invented_process_clock',p)

p=two_raw();positive('same_bytes_distinct_archive_ids_and_native_paths',p)
p=two_raw(same_path=True);positive('one_native_path_same_bytes_two_archive_ids',p)
p=two_raw(same_path=True,different_session=True)
p['frames'][1]['raw']['artifact']['sha256']='a'*64;p['batch']['records'][1]['artifacts']=[deepcopy(p['frames'][1]['raw']['artifact'])]
positive('same_relative_path_different_native_sessions_different_bytes',p)
p['frames'][1]['profile']['native_session_id']=p['frames'][0]['profile']['native_session_id']
for f in p['frames']:macos_frame.validate(f)
process_v2.validate('ProcessBatch',p['batch']);negative('same_native_session_path_conflicting_bytes',p)
p=two_raw();p['frames'][1]['raw']['width']+=1
for f in p['frames']:macos_frame.validate(f)
process_v2.validate('ProcessBatch',p['batch']);negative('same_png_hash_conflicting_dimensions',p)
p=two_raw();p['frames'][1]['raw']['artifact']=deepcopy(p['frames'][0]['raw']['artifact']);p['batch']['records'][1]['artifacts']=[deepcopy(p['frames'][1]['raw']['artifact'])];p['frames'][1]['raw']['height']+=1
for f in p['frames']:macos_frame.validate(f)
negative('same_archive_id_conflicting_dimensions',p)

for coverage in ('partial','unobserved','unknown'):
    p=single();gap(p)['evidence']['coverage']=coverage;positive('frameless_'+coverage,p)
p=single();r=gap(p);r['evidence']['coverage']='observed_samples';negative('frameless_cannot_claim_observed_samples',p)
p=single();r=gap(p);r['source']['user_id']='foreign-owner';wire.validate(NAME,p);negative('frameless_trusted_owner_mismatch',p)
p=single();g=deepcopy(json.loads((BASE/'packages/contracts/process_v2/examples/capture.json').read_text())['ProcessBatch']['records'][0]);p['batch']['records'][0].update(surface=g['surface'],method=g['method'],evidence=g['evidence']);positive('generic_framed_structured_vocabulary_preserved_not_attested',p)

# Strict raw decode rejects ambiguity before any normalization/shape acceptance.
encoded=wire.canonical_request(NAME,single())
strict_cases={'escaped_duplicate_key':encoded.replace(b'"batch":',b'"b\\u0061tch":{},"batch":',1),
  'nonfinite_exponent':encoded.replace(b'"callback_sequence":3',b'"callback_sequence":1e309',1),
  'unsafe_integral_float':encoded.replace(b'"callback_sequence":3',b'"callback_sequence":9007199254740992.0',1),
  'invalid_utf8':b'\xff','mutable_bytes':bytearray(encoded),'excessive_depth':b'['*80+b']'*80,
  'unpaired_surrogate':encoded.replace(b'"batch_id":',b'"extra":"\\ud800","batch_id":',1)}
for name,data in strict_cases.items():negative('strict_'+name,single(),lambda data=data:wire.decode_request(NAME,data))
limit=wire.body_limit(NAME)
positive('exact_raw_4mib_bound',single(),lambda:wire.decode_request(NAME,b' '*(limit-len(encoded))+encoded))
negative('raw_4mib_plus_one',single(),lambda:wire.decode_request(NAME,b' '*(limit-len(encoded)+1)+encoded))

canonical=wire.canonical_request(NAME,EXAMPLE)
for name,change in [('frames',lambda p:p['frames'].reverse()),('records',lambda p:p['batch']['records'].reverse()),
  ('raw_composed_refs',lambda p:p['batch']['records'][2]['artifacts'].reverse()),
  ('stroke_order',lambda p:p['frames'][2]['composition']['ink']['strokes'].reverse()),
  ('dirty_null_vs_empty',lambda p:p['frames'][2]['profile']['sample'].__setitem__('dirty_rects',[]))]:
    p=deepcopy(EXAMPLE);change(p);assert p!=EXAMPLE,name
    assert wire.canonical_request(NAME,p)!=canonical,name
    RESULTS.append({'case':'ordered_replay_'+name,'outcome':'distinct_canonical_bytes'})
assert wire.canonical_request(NAME,json.loads(json.dumps(EXAMPLE,sort_keys=True)))==canonical
RESULTS.append({'case':'object_member_order','outcome':'same_canonical_bytes'})

batch=single()['batch'];record=batch['records'][0]
ack={'contract_version':'0.2.0','user_id':OWNER,**{k:batch[k] for k in ('batch_id','device_id','session_id','stream_id')},
 'acknowledged':[{'record_id':record['record_id'],'sequence':record['sequence'],'disposition':'accepted','received_at':'2026-09-30T12:00:00Z','envelope':'committed','artifacts':[{**a,'status':'verified'} for a in record['artifacts']]}]}
verified=frozenset(tuple(a[k] for k in ('artifact_id','sha256','byte_length','media_type')) for a in record['artifacts'])
positive('ack_exact_verified_correspondence',ack,lambda:wire.validate_ack(batch,ack,user_id=OWNER,verified_artifacts=verified))
negative('ack_cannot_self_attest_bytes',ack,lambda:wire.validate_ack(batch,ack,user_id=OWNER))
changed=deepcopy(ack);changed['acknowledged'][0]['artifacts'][0]['status']='pending'
negative('ack_no_pending_originals',changed,lambda:wire.validate_ack(batch,changed,user_id=OWNER,verified_artifacts=verified))
changed=deepcopy(ack);changed['acknowledged'][0]['sequence']+=1
negative('ack_sequence_exact',changed,lambda:wire.validate_ack(batch,changed,user_id=OWNER,verified_artifacts=verified))
err={'contract_version':'0.2.12','error':'forbidden','retryable':True}
negative('forbidden_cannot_authorize_retry',err,lambda:wire.validate('MacOSIngressError',err))

for old,name,version in [(capture_ingress,'FrameBatchRequest','0.2.4'),(raw_capture_ingress,'RawFrameBatchRequest','0.2.6'),(desktop_capture_ingress,'DesktopFrameBatchRequest','0.2.8'),(windows_capture_ingress,'WindowsFrameBatchRequest','0.2.10')]:
    p=single();p['contract_version']=version
    negative('old_family_'+version+'_rejects_mac_descriptor',p,lambda old=old,name=name,p=p:old.validate(name,p))

path=BASE/'review-probes-results.json';path.write_text(json.dumps({'commit':'cc580c88dcddb631018a8107c9b26a076988aeab','checks':RESULTS},indent=2)+'\n')
print(json.dumps({'checks':len(RESULTS),'negative_checks':sum(r['outcome']=='ValidationError' for r in RESULTS),'all_assertions_passed':True,'result_file':str(path)}))
