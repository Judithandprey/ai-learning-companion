#!/usr/bin/env python3
"""Bounded actual ASGI/archive/Learning composition of supplied Windows mapper fixtures.

Uses exact main6036026 source and unchanged Windows46dbb90 ink-original producer fixture. No listener, DB, native app, provider, or mock ACK.
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
parser.add_argument('--backend-root', type=Path, default=Path('/home/agentsdock/Projects/learning-companion/repo'))
parser.add_argument('--fixtures', type=Path, default=Path('/tmp/lead-windows-ink-46dbb90/docs/verification/web/evidence'))
parser.add_argument('--source-git', type=Path, default=Path('/home/agentsdock/Projects/learning-companion/repo'))
parser.add_argument('--output', type=Path, default=Path('/tmp/windows-ink-original-composition-results.json'))
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
results = {'backend_commit': '6036026da8de99f8e1737cbed51a18c9cdd4179e',
           'mapper_commit': '46dbb9023768d7d738b84ffca4d8f8c725b02953', 'authority': 'explicit synthetic consent, fixed injected clock, MemoryStore',
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
    # Upload only actual immutable files; never manufacture the old native placeholder.
    for aid,binding in bindings.items():
        if binding['kind']!='editable_ink': continue
        ref=binding['artifact'];file=folder/'ink'/(ref['sha256']+'.json')
        if not file.is_file(): continue
        data=file.read_bytes();assert SHA(data)==ref['sha256'] and len(data)==ref['byte_length']
        doc=json.loads(data);assert doc['format']=='lc-desktop-ink/v1'
        body={**binding,'data_base64':base64.b64encode(data).decode('ascii')}
        receipt=ingress_success(request(rt.app,'PUT',ORIGINALS+aid,body=body,token=TOKEN),'OriginalArtifactReceipt')
        assert receipt=={**binding,'status':'bytes_committed'}
        back=ingress_success(request(rt.app,'GET',original_path(c,aid),token=TOKEN),'OriginalArtifactUpload')
        assert back==body
        images[aid]=data;uploaded.append({'artifact_id':aid,'sha256':SHA(data),'bytes':len(data),'kind':'editable_ink','revision':doc['ink']['revision']})
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

# Re-execute the actual producer; both committed bodies must be exact emitted
# bytes. Do not repair any field on its way into HTTP.
fixture_script = args.fixtures.parents[3] / 'apps/windows/scripts/ingress-fixtures.ts'
node = args.source_git / '.tools/node-v24.21.0-linux-x64/bin/node'
emitted = subprocess.check_output([str(node), '--input-type=module', '-e',
    "import {build,CASES} from " + json.dumps(fixture_script.as_uri()) +
    "; console.log(JSON.stringify(CASES.map(c=>({name:c.name,body:build(c).body}))));"])
for item in json.loads(emitted):
    assert item['body'].encode() == (args.fixtures/'windows-frame-ingress'/f"{item['name']}.body.json").read_bytes()
results['exact_producer_bodies_regenerated'] = True

meta, body, payload, folder = load('harness-ink')
assert all(r['surface'] == 'external_app' and r['method'] == 'visual' for r in payload['batch']['records'])
c, rt, descriptor = fresh(meta)
images, uploads, missing = upload_available(c, rt, meta, payload, folder)
assert missing == []
# Match the stored editable bytes to each exact frame; inspect the delayed snapshot.
ink_docs=[]
for frame, entry in zip(payload['frames'],[e for e in meta['plan']['entries'] if e['kind']=='frame'],strict=True):
    binding=entry['ink'];assert binding and binding['kind']=='editable_ink'
    doc=json.loads(images[binding['artifact']['artifact_id']]);ink_docs.append(doc)
    assert doc['id']==frame['composed']['ink_session']
    assert doc['ink']['revision']==frame['composed']['ink_revision']
    assert len(doc['ink']['visible'])==frame['composed']['visible_strokes']
assert [d['ink']['revision'] for d in ink_docs]==[0,1,1,5]
assert ink_docs[1]==ink_docs[2] and ink_docs[3]!=ink_docs[2]
assert len([u for u in uploads if u.get('kind')=='editable_ink'])==3
results['exact_ink_revisions']=[d['ink']['revision'] for d in ink_docs]
results['delayed_snapshot_kept']=True
key = meta['plan']['idempotency_key']
ack = accepted(c, post(c, rt, body, key), payload)
assert all(a['disposition'] == 'accepted' for a in ack['acknowledged'])
packet = compose(c, rt, payload, descriptor, images)
assert packet['non_frame_artifacts']=='references_only'
assert all(any(a==entry['ink']['artifact'] for a in item['record']['artifacts']) for item,entry in zip(packet['items'],meta['plan']['entries'],strict=True))
before = deepcopy(c.store._documents)
assert accepted(c, post(c, rt, body, key), payload) == ack and c.store._documents == before
rotated = 'synthetic-corrected-mapper-' + ('x' * 32)
reopened = build(c, fresh_consent=False, token=rotated)
assert accepted(c, post(c, reopened, body, key, rotated), payload) == ack
assert compose(c, reopened, payload, descriptor, images, rotated) == packet
assert post(c, reopened, body, key).status_code == 401 and c.store._documents == before
stop = state(request(reopened.app, 'POST', c.stream_path+':control',
    body=command(c), request_key='corrected-mapper-stop', token=rotated), 'stopped')
assert stop['pre_stop_sequence'] is None
terminal = build(c, fresh_consent=False, token=rotated)
before = deepcopy(c.store._documents)
assert compose(c, terminal, payload, descriptor, images, rotated) == packet
response = post(c, terminal, body, key, rotated)
assert response.status_code == 409 and response.json()['error'] == 'capture_stopped'
assert c.store._documents == before
terminal.app.state.authenticator.revoke(rotated)
try:
    compose(c, terminal, payload, descriptor, images, rotated)
except DomainError as exc:
    assert exc.status == 401
else:
    raise AssertionError('Revoked caller received the Learning packet')
assert post(c, terminal, body, key, rotated).status_code == 401 and c.store._documents == before
results['tests']['unchanged_ink_original_harness'] = {
    'status': 'PASS_EXACT_PRODUCER_HTTP_LEARNING', 'body_bytes': len(body),
    'body_sha256': SHA(body), 'uploaded_originals': uploads,
    'ack': ack, 'packet': packet_summary(packet), 'replay_no_writes': True,
    'same_store_recreation_rotated_token_exact_packet': True,
    'old_token_refused': True, 'stop_historical_read_retained': True,
    'stop_cached_submit_refused': True, 'revocation_withholds_packet': True,
    'not_database_process_restart': True,
}

assert hashes(args.fixtures) == before_files
results['fixture_files_unchanged'] = True
results['overall'] = 'Unchanged ink-original harness accepted through actual in-process API and Learning, with separate exact editable bytes. Native/provider/DB not executed.'
args.output.write_text(json.dumps(results, indent=2, ensure_ascii=False)+'\n')
print(json.dumps({'overall': results['overall'],
    'checks': {k: v['status'] for k, v in results['tests'].items()},
    'results': str(args.output)}, indent=2))
