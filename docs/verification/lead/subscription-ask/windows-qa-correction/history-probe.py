"""Actual integrated Backend source, in-process fake only; no Codex or state."""
import asyncio,hashlib,json,sys
from pathlib import Path
root=Path('/tmp/backend-subscription-1b27a91-y9i71opk')
assert hashlib.sha256((root/'services/worker/connectors/chatgpt_local.py').read_bytes()).hexdigest()=='eee3f784687111971f6859a071cfef7a397b6b29c818d2bede92a57ac9a12e29' # matches 39620fa
sys.path.insert(0,str(root))
from services.worker.connectors.chatgpt_local import SubscriptionBridge,MAX_HISTORY
from services.worker.connectors.tests.test_chatgpt_local import FakeClient,LearningSpy,ask_request,message,MODEL
async def run():
 c,learning,emitted=FakeClient(),LearningSpy(),[]
 b=SubscriptionBridge(c,emit=emitted.append,prepare=learning.prepare,bind=learning.bind)
 c.allow_send.set();await b.handle(message('ask/start',{'request':ask_request.__wrapped__(),'model':MODEL}));active=b.active
 await asyncio.wait_for(c.sent.wait(),1)
 # Equivalent state after 4096 admitted envelope IDs, without running a request loop.
 b.rpc_ids.update(str(i) for i in range(MAX_HISTORY-1));assert len(b.rpc_ids)==MAX_HISTORY
 await b.handle(message('connection/read',request_id='limit-trigger'))
 c.complete.set();await asyncio.wait_for(active.task,1)
 result={'integrated_backend':'39620fa','history_limit':MAX_HISTORY,'emitted':emitted,'interrupt_calls':sum(x[0]=='interrupt' for x in c.calls),'provider_turn_starts':sum(x[0]=='turn/start' for x in c.calls),'fake_remote_completed':c.complete.is_set()}
 assert emitted[-1]['error']['code']=='cancelled' and result['interrupt_calls']==0
 await b.close();Path('/tmp/web-qa-subscription-history-probe.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
asyncio.run(run())
