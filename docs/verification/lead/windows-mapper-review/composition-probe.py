#!/usr/bin/env python3
"""Bounded actual ASGI/archive/Learning composition of supplied Windows mapper fixtures.

Uses exact 7b46bec export by default. No listener, DB, native app, provider, or mock ACK.
Synthetic authority uses a fixed injected clock. Fixture files remain untouched.
"""
import argparse
import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import subprocess
from types import SimpleNamespace

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backend-root', type=Path, default=Path('/tmp/windows-mapper-backend-7b46bec'))
parser.add_argument('--fixtures', type=Path, default=Path('/tmp/lc-windows-mapper-fixtures/docs/verification/web/evidence'))
parser.add_argument('--source-git', type=Path, default=Path('/home/agentsdock/Projects/learning-companion/repo'))
parser.add_argument('--output', type=Path, default=Path('/tmp/windows-mapper-composition-results.json'))
args = parser.parse_args()
sys.dont_write_bytecode = True
sys.path.insert(0, str(args.backend_root))
from packages.contracts import windows_capture_ingress as wire
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore
from services.api.tests.test_capture_app import NOW, ORIGINALS, ingress_success, original_path, request, state
from services.api.tests.test_capture_runtime import TOKEN, register
from services.api.tests.test_control import command
from services.api.tests.test_windows_capture_runtime import build
from services.api.tests.test_windows_ingress_http import WINDOWS_ROUTE
from services.learning.process_context import prepare_observation_window

SHA = lambda b: hashlib.sha256(b).hexdigest()

def hashes(root):
    return {p.relative_to(root).as_posix(): SHA(p.read_bytes()) for p in sorted(root.rglob('*')) if p.is_file()}

before_files = hashes(args.fixtures)
results = {'backend_commit': '7b46bec8efaca109f622541cfa551cfdf794589d',
           'mapper_commit': '80da708f21ad87a11073de0ab5749b9cb8fee468', 'authority': 'explicit synthetic consent, fixed injected clock, MemoryStore',
           'clock': NOW.isoformat(), 'tests': {}, 'fixture_hashes_before': before_files,
           'native_application_provider_database': 'not_run'}

def load(name):
    meta = json.loads((args.fixtures/'windows-frame-ingress'/f'{name}.json').read_bytes())
    body = (args.fixtures/'windows-frame-ingress'/meta['body']).read_bytes()
    assert SHA(body) == meta['body_sha256']
    manifest = args.fixtures/meta['manifest']
    assert SHA(manifest.read_bytes()) == meta['manifest_sha256']
    payload = wire.decode_request('WindowsFrameBatchRequest', body)
    wire.validate_frame_batch(payload, user_id=meta['plan']['source']['user_id'])
    assert payload['batch']['delivery_mode'] == 'historical'
    return meta, body, payload, manifest.parent

def fresh(meta):
    d = meta['display_source']
    c = SimpleNamespace(user=d['user_id'], store=MemoryStore(), instant=[NOW],
        registration={'contract_version': '0.2.1', **{k:d[k] for k in ['device_id','session_id','stream_id']},
                      'authorization_generation': 1, 'membership_revision': 1, 'continuity': {'kind':'initial'}},
        source={k:d[k] for k in ['user_id','source_id','source_version']},
        display={'contract_version': '0.2.4', **{k:d[k] for k in ['source_id','stream_id','project_id','source_timezone']}},
        display_path='/v2/process/display-sources/'+d['source_id'], stream_path='/v2/process/streams/'+d['stream_id'])
    assert c.store._documents == {}
    rt=build(c)
    assert rt.start_status == 'pending' and rt.current_state is None
    assert rt.app.state.paid_executor_enabled is False
    state(register(c,rt),'live')
    descriptor=ingress_success(request(rt.app,'PUT',c.display_path,body=c.display,token=TOKEN),'DisplaySourceSnapshot')
    assert {k:v for k,v in descriptor.items() if k!='created_at'} == {k:v for k,v in d.items() if k!='created_at'}
    return c,rt,descriptor

def upload_available(c,rt,meta,payload,folder):
    bindings={}
    for entry in meta['plan']['entries']:
        if entry['kind'] != 'frame':continue
        for role in ['raw','composed','ink']:
            binding=entry.get(role)
            if binding:
                old=bindings.setdefault(binding['artifact']['artifact_id'],binding)
                assert old==binding
    images={};uploaded=[]
    for frame in payload['frames']:
        for image in [frame['raw']] + ([frame['composed']['image']] if frame['composed'] else []):
            ref=image['artifact'];aid=ref['artifact_id'];data=(folder/image['native_file']).read_bytes()
            assert SHA(data)==ref['sha256'] and len(data)==ref['byte_length']
            if aid in images:assert images[aid]==data;continue
            binding=bindings[aid]
            assert binding['artifact']==ref
            body={**binding,'data_base64':base64.b64encode(data).decode('ascii')}
            receipt=ingress_success(request(rt.app,'PUT',ORIGINALS+aid,body=body,token=TOKEN),'OriginalArtifactReceipt')
            assert receipt=={**binding,'status':'bytes_committed'}
            back=ingress_success(request(rt.app,'GET',original_path(c,aid),token=TOKEN),'OriginalArtifactUpload')
            assert back==body
            images[aid]=data;uploaded.append({'artifact_id':aid,'sha256':SHA(data),'bytes':len(data)})
    missing=[b for aid,b in bindings.items() if b['kind']=='editable_ink' and aid not in images]
    return images,uploaded,missing

def post(c,rt,body,key,token=TOKEN):
    return request(rt.app,'POST',WINDOWS_ROUTE,content=body,
                   headers=[('Content-Type','application/json')],request_key=key,token=token)

def accepted(c,response,payload):
    assert response.status_code==200,response.text
    refs=[a for r in payload['batch']['records'] for a in r['artifacts']]
    verified={tuple(a[k] for k in ['artifact_id','sha256','byte_length','media_type']) for a in refs}
    ack=response.json();wire.validate_ack(payload['batch'],ack,user_id=c.user,verified_artifacts=verified)
    assert response.headers['cache-control']=='no-store'
    return ack

def consumers(c,rt,token=TOKEN):
    def guard(state):
        principal=rt.app.state.authenticator.authenticate(token,c.instant[0])
        if principal != rt.principal or state.get('generation')!=principal.authorization_generation:
            raise DomainError(403,'forbidden')
    return AuthorizedProcessContextReader(c.store,c.user,guard).read_windows, AuthorizedImageResolver(c.store,c.user,guard)

def compose(c,rt,payload,descriptor,images,token=TOKEN):
    records=payload['batch']['records'];frames={f['frame_id']:f for f in payload['frames']};ids=[r['record_id'] for r in records]
    read,resolve=consumers(c,rt,token)
    snapshot=read(ids)
    assert snapshot['batch']['records']==records and snapshot['sources']==[descriptor]
    assert {f['frame_id']:f for f in snapshot['frames']}==frames
    packet=prepare_observation_window(ids,read,resolve,user_id=c.user,windows_resolver=resolve.resolve_windows)
    assert [i['record'] for i in packet['items']]==records
    assert packet['counts']['omitted']==0
    assert packet['provider_receipt']=='not_attested' and packet['presentation_permission']=='not_granted'
    assert packet['observation_window']['capture_chronology']=='unknown'
    assert packet['observation_window']['capture_intervals']=='unknown'
    for pair in packet['observation_window']['comparisons']:assert pair['clock_readings']['status']=='unknown'
    for item in packet['items']:
        assert item['source']==descriptor
        record=item['record'];assert record['clock'] is None and record['observed_at'] is None
        if record['frame_id'] is None:
            assert item['frame'] is None and item['image']=={'status':'missing_frame'}
            assert record['artifacts']==[]
            continue
        frame=frames[record['frame_id']];assert item['frame']==frame
        assert frame['captured_at'] is None and frame['media_position'] is None and frame['capture_latency_ms'] is None
        for role in ['raw','composed']:
            img=frame['raw'] if role=='raw' else frame['composed']['image']
            got=item['image' if role=='raw' else 'composed_image']
            assert got['status']=='attached' and got['image_role']==role
            assert got['data']==images[img['artifact']['artifact_id']]
    return packet

def packet_summary(packet):
    return {'items':len(packet['items']),'counts':packet['counts'],'attached_bytes':packet['attached_bytes'],
            'images':[{'record_id':i['record']['record_id'],'frame_id':i['record']['frame_id'],
                       'raw':{'status':i['image']['status'],**({'sha256':SHA(i['image']['data']),'bytes':len(i['image']['data'])} if 'data' in i['image'] else {})},
                       'composed':({'status':i['composed_image']['status'],'sha256':SHA(i['composed_image']['data']),'bytes':len(i['composed_image']['data'])} if 'composed_image' in i else None),
                       'coverage':i['record']['evidence']} for i in packet['items']],
            'window':packet['observation_window'],'provider_receipt':packet['provider_receipt'],
            'presentation_permission':packet['presentation_permission']}

# Verify exact exported bytes against the declared committed source; no checkout mutations.
fixture_paths=[]
for relative in before_files:
    name='docs/verification/web/evidence/'+relative
    committed=subprocess.check_output(['git','show',results['mapper_commit']+':'+name],cwd=args.source_git)
    assert committed==(args.fixtures/relative).read_bytes(),name
    fixture_paths.append(name)
roots=['services/api','services/learning','packages/contracts'];counts={}
entries=subprocess.check_output(['git','ls-tree','-r','-z',results['backend_commit'],'--',*roots],cwd=args.source_git).split(b'\0')
for entry in entries:
    if not entry:continue
    meta,path=entry.split(b'\t',1);mode,kind,digest=meta.split();name=path.decode()
    if kind!=b'blob':continue
    data=(args.backend_root/name).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==digest.decode(),name
    for root in roots:
        if name.startswith(root+'/'):counts[root]=counts.get(root,0)+1
results['source_provenance']={'fixture_git_commit':results['mapper_commit'],
    'fixture_raw_git_blobs_verified':len(fixture_paths),'fixture_paths':fixture_paths,
    'backend_git_commit':results['backend_commit'],'export_raw_git_blobs_verified':sum(counts.values()),'export_counts':counts}

# Both original emitted bodies: preserve their different first refusal boundaries.
primary = None
for name in ['harness', 'native']:
    meta,body,payload,folder=load(name);c,rt,descriptor=fresh(meta)
    images,uploads,missing=upload_available(c,rt,meta,payload,folder)
    assert len(missing)==(1 if name=='native' else 0)
    before=deepcopy(c.store._documents)
    response=post(c,rt,body,meta['plan']['idempotency_key'])
    expected = (403, 'forbidden') if name=='harness' else (409, 'dependency_missing')
    assert (response.status_code, response.json()['error'])==expected,response.text
    assert response.headers['cache-control']=='no-store'
    assert c.store._documents==before
    assert not any(k[0] in {'capture_record','raw_capture_frame','capture_replay'} for k in before[c.user])
    results['tests']['unchanged_'+name]={'status':('BLOCKED_403_PIXEL_ADMISSION' if name=='harness' else 'EXPECTED_NO_ACK_MISSING_INK'),'body_sha256':SHA(body),'body_bytes':len(body),
        'uploaded_originals':uploads,'missing_originals':missing,'http_status':response.status_code,'error':response.json(),
        'no_capture_or_replay_writes':True,'surface':sorted({r['surface'] for r in payload['batch']['records']}),
        'manifest_only_unrepresented':meta['unrepresented']}
    if name=='harness':primary=(meta,body,payload,folder,c,rt,descriptor,images,uploads)

# ONE diagnostic clone: only ProcessRecord.surface changes, keeping exact PNGs,
# every WindowsFrame field, all gaps, record/stream/batch IDs and same request key.
# Success here is not acceptance of either unchanged emitted body.
meta,original_body,payload,folder,c,rt,descriptor,images,uploads=primary
original_payload=deepcopy(payload)
for record in payload['batch']['records']:
    assert record['surface']=='original_screen_overlay'
    record['surface']='external_app'
check=deepcopy(payload)
for record in check['batch']['records']:record['surface']='original_screen_overlay'
assert check==original_payload
body=wire.canonical_request('WindowsFrameBatchRequest',payload)
Path('/tmp/windows-mapper-diagnostic-external-app.body.json').write_bytes(body)
key=meta['plan']['idempotency_key'];ack=accepted(c,post(c,rt,body,key),payload)
assert all(a['disposition']=='accepted' for a in ack['acknowledged'])
for r in payload['batch']['records']:
    assert json.loads(c.store._documents[c.user][('capture_record',r['record_id'])]['canonical_json'])['record']==r
for f in payload['frames']:assert c.store._documents[c.user][('raw_capture_frame',f['frame_id'])]==f
packet=compose(c,rt,payload,descriptor,images)
before=deepcopy(c.store._documents)
assert accepted(c,post(c,rt,body,key),payload)==ack and c.store._documents==before
rotated='synthetic-mapper-reopen-'+('y'*32)
reopened=build(c,fresh_consent=False,token=rotated)
assert accepted(c,post(c,reopened,body,key,rotated),payload)==ack
assert compose(c,reopened,payload,descriptor,images,rotated)==packet
assert post(c,reopened,body,key).status_code==401 and c.store._documents==before
stop=state(request(reopened.app,'POST',c.stream_path+':control',body=command(c),request_key='mapper-stop',token=rotated),'stopped')
assert stop['pre_stop_sequence'] is None
terminal=build(c,fresh_consent=False,token=rotated);before=deepcopy(c.store._documents)
assert compose(c,terminal,payload,descriptor,images,rotated)==packet
response=post(c,terminal,body,key,rotated)
assert response.status_code==409 and response.json()['error']=='capture_stopped' and c.store._documents==before
terminal.app.state.authenticator.revoke(rotated)
try:compose(c,terminal,payload,descriptor,images,rotated)
except DomainError as e:assert e.status==401
else:raise AssertionError('revoked caller received Learning packet')
assert post(c,terminal,body,key,rotated).status_code==401 and c.store._documents==before
results['tests']['diagnostic_harness_surface_only']={'status':'PASS_DIAGNOSTIC_ONLY','body_sha256':SHA(body),'body_bytes':len(body),
    'changed_fields':['/batch/records/'+str(i)+'/surface' for i in range(len(payload['batch']['records']))],
    'scope':'Only surface changed to external_app; no admission bypass or production edit. NOT acceptance of original mapper output.',
    'same_key_clean_retry_after_refusal':True,'ack':ack,'packet':packet_summary(packet),
    'replay_same_store_no_writes':True,'recreated_runtime_rotated_token_exact_packet':True,
    'old_token_refused':True,'stop_unknown_boundary':stop,'stopped_historical_read_exact':True,
    'post_stop_cached_submission':response.json(),'revoked_current_token_withholds_packet':True}
assert hashes(args.fixtures)==before_files,'Supplied fixture bytes changed'
results['fixture_files_unchanged']=True
results['overall']='HOLD unchanged mapper: harness fails current pixel admission; native refuses missing original. Surface-only harness diagnostic composes successfully; native ink original unavailable.'
args.output.write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'overall':results['overall'],'checks':{k:v['status'] for k,v in results['tests'].items()},'results':str(args.output)},indent=2))
