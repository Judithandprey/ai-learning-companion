import asyncio, json
from datetime import datetime,timedelta,timezone
from pathlib import Path
import httpx
from services.api.auth import LocalTestAuthenticator,Principal
from services.api.preview_app import create_preview_app
from services.api.preview_local import PREVIEW_SCOPES,_bootstrap
from services.api.storage import MemoryStore
from services.api.tests.test_preview import USER,DEVICE,SESSION,import_body,save_body
NOW=datetime(2026,9,28,tzinfo=timezone.utc)
async def main():
    state=MemoryStore();_bootstrap(state,USER,DEVICE,SESSION)
    auth=LocalTestAuthenticator({'review-synthetic-token':Principal(USER,PREVIEW_SCOPES,NOW+timedelta(hours=1))})
    app=create_preview_app(state,auth,lambda:NOW,user_id=USER,device_id=DEVICE,session_id=SESSION)
    entered,release=asyncio.Event(),asyncio.Event()
    body=json.dumps(save_body()).encode()
    async def slow_body():
        yield body[:len(body)//2]
        entered.set()
        await release.wait()
        yield body[len(body)//2:]
    headers={'Authorization':'Bearer review-synthetic-token','Content-Type':'application/json','Idempotency-Key':'review-import'}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,client=('127.0.0.1',5000)),base_url='http://127.0.0.1:8174') as client:
        imported=await client.post('/preview/v1/documents',headers=headers,json=import_body())
        assert imported.status_code==200
        headers['Idempotency-Key']='saved-note'
        pending=asyncio.create_task(client.post('/preview/v1/saves',headers=headers,content=slow_body()))
        await asyncio.wait_for(entered.wait(),2)
        before=await client.get('/preview/v1/saves/saved-note',headers=headers)
        release.set()
        saved=await asyncio.wait_for(pending,2)
        after=await client.get('/preview/v1/saves/saved-note',headers=headers)
        out={'transport':'in-process actual ASGI app, MemoryStore, no DB/socket service','import_status':imported.status_code,'lookup_while_POST_body_in_flight':before.status_code,'later_POST_status':saved.status_code,'later_POST_persistence':saved.json().get('persistence'),'lookup_after_POST':after.status_code}
        print(json.dumps(out,indent=2));Path('review-pending-race.json').write_text(json.dumps(out,indent=2)+'\n')
asyncio.run(main())
