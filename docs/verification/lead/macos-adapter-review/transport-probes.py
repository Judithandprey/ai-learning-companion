"""Bounded independent 0.2.12 transport/schema probes: no listener or provider."""
import asyncio
from copy import deepcopy
from datetime import timedelta
from itertools import product
import json
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/lc-macos-adapter-40ab')
sys.path.insert(0, str(ROOT))
import httpx
from services.api.ingress_app import create_ingress_app, MACOS_ROUTE
from services.api.tests import macos_fixtures as f
from services.api.tests.test_macos_ingress_http import app, CAPABILITIES
from services.api.tests.test_control import documents
from services.api.tests.test_control_http import request
from packages.contracts import macos_capture_ingress as wire

results = []
# Expand the entire request/response ref graphs, not only the two renamed leaves.
# Every enabled route must still describe its own released payload and responses.
families = [('raw_capture_ingress', '/v2/process/raw-frames:batch', 'enable_raw_ingress'),
            ('desktop_capture_ingress', '/v2/process/desktop-frames:batch', 'enable_desktop_ingress'),
            ('windows_capture_ingress', '/v2/process/windows-frames:batch', 'enable_windows_ingress'),
            ('macos_capture_ingress', MACOS_ROUTE, 'enable_macos_ingress')]
released = {name: json.loads((ROOT / 'packages/contracts' / name / 'generated/openapi.json').read_text()) for name, _, _ in families}
def expand(value, document, active=()):
    if isinstance(value, list):
        return [expand(v, document, active) for v in value]
    if not isinstance(value, dict):
        return value
    if '$ref' in value:
        ref = value['$ref']
        assert ref.startswith('#/'), ref
        assert ref not in active, f'Unexpected recursive fixture schema: {ref}'
        target = document
        for part in ref[2:].split('/'):
            target = target[part.replace('~1', '/').replace('~0', '~')]
        return expand({**target, **{k:v for k,v in value.items() if k != '$ref'}}, document, active + (ref,))
    return {k:expand(v, document, active) for k,v in value.items()}
comparisons = 0
for flags in product([False, True], repeat=4):
    instance = create_ingress_app(**{field: enabled for (_,_,field),enabled in zip(families,flags)})
    combined = instance.openapi()
    assert instance.state.paid_executor_enabled is False
    for (name,route,_),enabled in zip(families,flags):
        assert (route in combined['paths']) == enabled
        if enabled:
            actual = combined['paths'][route]['post']
            expected = released[name]['paths'][route]['post']
            for section in ('requestBody','responses'):
                assert expand(actual[section],combined) == expand(expected[section],released[name]), (flags,name,section)
                comparisons += 1
    if flags[-1]:
        actual = combined['paths'][MACOS_ROUTE]['post']['parameters']
        expected = released['macos_capture_ingress']['paths'][MACOS_ROUTE]['post']['parameters']
        assert expand(actual, combined) == expand(expected, released['macos_capture_ingress'])
results.append({'case':'16 independent gate combinations: complete released request/response ref graphs and macOS ordered header', 'result':'PASS', 'schema_comparisons':comparisons})

# Existing synthetic identity/registration fixtures, real upload handlers/MemoryStore/consumer.
c = f.macos_setup.__wrapped__(f.raw_setup.__wrapped__(f.uploaded.__wrapped__(f.registered.__wrapped__(f.setup.__wrapped__()))))
c.macos_app = app(c)
envelope = deepcopy(c.macos_envelope)
headers = [('Content-Type','application/json')]
def post(content, key='independent-ordered', **kwargs):
    return request(c.macos_app,'POST',MACOS_ROUTE,token='capture-token',request_key=key,content=content,headers=headers,**kwargs)
encoded = json.dumps(envelope, separators=(',',':')).encode()
response = post(encoded)
assert response.status_code == 200, response.text
ack = response.json()
refs = [ref for r in envelope['batch']['records'] for ref in r['artifacts']]
wire.validate_ack(envelope['batch'],ack,user_id=c.user,verified_artifacts={tuple(a[k] for k in ('artifact_id','sha256','byte_length','media_type')) for a in refs})
before = documents(c)
response = post(json.dumps(envelope,sort_keys=True,indent=1).encode())
assert response.status_code == 200 and response.json() == ack
assert documents(c) == before
changed = deepcopy(envelope)
artifacts = changed['batch']['records'][0]['artifacts']
assert len(artifacts) > 1
artifacts.reverse()
response = post(json.dumps(changed).encode())
assert response.status_code == 409 and response.json()['error'] == 'idempotency_conflict',response.text
assert documents(c) == before
results.append({'case':'real committed ACK; object-member reordering replays, artifact-array reordering conflicts without mutation', 'result':'PASS'})

# Compound negatives, including a later descriptor with an explicit wrong version.
wrong = {'contract_version':'0.2.12','batch':{'contract_version':'0.2.0','records':[]},'frames':[{}, {'contract_version':'0.2.9'}]}
for label,data,code,status in [
    ('explicit later version before generic shape', json.dumps(wrong).encode(), 'unsupported_version',422),
    ('duplicate member before version', b'{"contract_version":"9.9.9","contract_version":"0.2.12"}', 'invalid_json',400),
    ('invalid UTF-8 before version', b'{"contract_version":"9.9.9","x":"\xff"}', 'invalid_json',400),
]:
    response = post(data,key='compound-negative')
    assert response.status_code == status, response.text
    assert response.json() == {'contract_version':'0.2.12','error':code,'retryable':False}
    assert documents(c) == before
results.append({'case':'three independent JSON/version/shape precedence combinations', 'result':'PASS'})

# Authentication/capability/default-off errors must not consume even the first body chunk.
for label,instance,token,status,version in [
    ('missing auth',c.macos_app,None,401,'0.2.12'),
    ('missing capability',app(c,capabilities=CAPABILITIES-{wire.CAPABILITY}),'capture-token',403,'0.2.12'),
    ('default off',app(c,enabled=False),'capture-token',404,'0.2.4'),
]:
    def forbidden_body():
        raise AssertionError('Body consumed before authority/routing decision')
        yield b'{}'
    response = request(instance,'POST',MACOS_ROUTE,token=token,request_key='early-refusal',headers=headers,chunks=forbidden_body())
    assert response.status_code == status,response.text
    assert response.json()['contract_version'] == version
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert documents(c) == before
results.append({'case':'auth/capability/default-off refusal before any body consumption', 'result':'PASS'})

# Expire the real principal after initial auth, while the valid replay body streams.
# No private guard/storage is replaced; clock remains the fixture's explicit host clock.
async def expire_during_read():
    async def data():
        yield encoded[:30]
        c.instant[0] += timedelta(hours=2)
        yield encoded[30:]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=c.macos_app),base_url='http://in-process.test') as client:
        return await client.post(MACOS_ROUTE,content=data(),headers={
            'Authorization':'Bearer capture-token','Content-Type':'application/json','Idempotency-Key':'independent-ordered'})
response = asyncio.run(expire_during_read())
assert response.status_code == 401,response.text
assert response.json() == {'contract_version':'0.2.12','error':'unauthenticated','retryable':False}
assert response.headers['www-authenticate'] == 'Bearer'
assert documents(c) == before
results.append({'case':'real token expires during replay body read: current guard refuses cached ACK, archive unchanged', 'result':'PASS'})

out = {'candidate':'40ab42e4819bf725fd970cc330b8eb6fed7da73f','export':str(ROOT),'results':results}
Path('/tmp/macos-adapter-40ab-transport-probe-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
