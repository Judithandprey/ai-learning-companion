"""Synthetic ASGI regressions from a64961f, with explicit desktop pixel admission."""
import asyncio
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json
import httpx
import pytest
from starlette.applications import Starlette
from starlette.routing import Mount
from packages.contracts import desktop_capture_ingress as dw
from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture_runtime import setup, options, TOKEN, NOW, uploaded
from services.api.tests.test_desktop_capture_runtime import desktop, build, submit, error, gap_payload, register_display, accepted
from services.api.tests.test_desktop_frame_ingress import pixel_record
from services.api.tests.test_raw_ingress_http import RAW_FRAMES

results=[]
def done(name, **values):
    results.append(name)
    print(json.dumps({'check':name,'result':'PASS',**values}))
def fresh():
    return desktop.__wrapped__(setup.__wrapped__())

# A new desktop opt-in cannot write foundations if its ephemeral token expires at lock entry.
c=fresh()
transaction=c.store.transaction
@contextmanager
def delayed(actor):
    c.instant[0]=NOW+timedelta(hours=2)
    with transaction(actor) as tx:
        yield tx
with pytest.MonkeyPatch.context() as patch:
    patch.setattr(c.store,'transaction',delayed)
    with pytest.raises(DomainError):
        build(c)
assert c.store._documents=={}
done('factory-expiry-at-lock-rolls-back')

# All current fences are checked again after initial transport authentication, before replay.
for form in ['frame','first-gap']:
    for fence in ['token','account']:
        c=fresh(); runtime=build(c)
        if form=='frame':
            uploaded(c,runtime); payload=c.desktop_envelope
        else:
            register_display(c,runtime); payload=gap_payload(c)
        auth=runtime.app.state.authenticator
        original=auth.authenticate
        expected=[deepcopy(c.store._documents)]
        calls=[0]
        def authenticate(token,now):
            principal=original(token,now)
            calls[0]+=1
            if calls[0]==1:
                if fence=='token': auth.revoke(token)
                else: Archive(c.store).set_authorization(c.user,False)
                expected[0]=deepcopy(c.store._documents)
            return principal
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(auth,'authenticate',authenticate)
            response=submit(c,runtime,envelope=payload,request_key='review-race')
        error(response,401 if fence=='token' else 403,'unauthenticated' if fence=='token' else 'forbidden')
        assert c.store._documents==expected[0]
        done('authentication-race',form=form,fence=fence)

# Compose both opt-in families through the real local factory, then mount them.
# Exercise cancellation after staged replay writes, including a first gap with no PNG/ink.
for family in ['raw','desktop-first-gap']:
    for prefixes in [(),('/capture',),('/outer','/inner')]:
        c=setup.__wrapped__()
        if family=='desktop-first-gap': c=desktop.__wrapped__(c)
        else:
            # This dual-route host is a pixel producer even on its raw route.
            # Derive a fresh honest sample; do not change the generic raw fixture.
            c.batch['records'][0]=pixel_record(c.batch['records'][0])
        runtime=create_local_capture_runtime(**{**options(c),'capabilities':options(c)['capabilities']|{dw.CAPABILITY},
                    'enable_raw_ingress':True,'enable_desktop_ingress':True,'fresh_consent':True,
                    'producer_profile':'desktop_pixels'})
        if family=='raw':
            uploaded(c,runtime); payload=c.raw_envelope; route=RAW_FRAMES
        else:
            register_display(c,runtime); payload=gap_payload(c); route='/v2/process/desktop-frames:batch'
        app=runtime.app
        for prefix in reversed(prefixes): app=Starlette(routes=[Mount(prefix,app=app)])
        path=''.join(prefixes)+route
        before=deepcopy(c.store._documents)
        cancellation=CancelledError('private review cancellation')
        original_put=_MemoryTransaction.put
        staged=[]
        def put(tx,kind,identifier,value):
            original_put(tx,kind,identifier,value)
            if kind=='capture_replay':
                staged.append(kind)
                raise cancellation
        async def send():
            transport=httpx.ASGITransport(app=app,raise_app_exceptions=True)
            async with httpx.AsyncClient(transport=transport,base_url='http://review.invalid') as client:
                return await client.post(path,json=payload,headers={'Authorization':'Bearer '+TOKEN,'Idempotency-Key':'same-review-key'})
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(_MemoryTransaction,'put',put)
            with pytest.raises(CancelledError) as caught: asyncio.run(send())
        assert caught.value is cancellation and staged==['capture_replay']
        assert c.store._documents==before
        response=asyncio.run(send())
        assert response.status_code==200,response.text
        assert response.json()['acknowledged'][0]['disposition']=='accepted'
        stable=deepcopy(c.store._documents)
        assert asyncio.run(send()).json()==response.json()
        assert c.store._documents==stable
        if family=='desktop-first-gap':
            assert not any(kind in {'artifact','frame','raw_capture_frame'} for kind,_ in stable[c.user])
        done('composed-mounted-cancellation-clean-retry',family=family,prefix=''.join(prefixes) or '/')

# Rotated host tokens are independent by design: account revocation must fence both hosts.
c=fresh(); first=build(c); uploaded(c,first); accepted(c,submit(c,first))
rotated='review-second-token-'+'z'*32
second=build(c,fresh_consent=False,token=rotated)
Archive(c.store).set_authorization(c.user,False)
before=deepcopy(c.store._documents)
for runtime,token in [(first,TOKEN),(second,rotated)]:
    error(submit(c,runtime,token=token),403,'forbidden')
assert c.store._documents==before
done('account-revoke-fences-both-live-hosts')
print(json.dumps({'groups':len(results),'result':'PASS','original_review_candidate':'a64961fd9d034273b8024bdd2da988018224b9c9','native_provider_db_listener':False}))
