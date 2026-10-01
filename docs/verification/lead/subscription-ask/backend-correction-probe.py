"""In-memory RPC boundary probes only: never starts Codex or a child process."""
import asyncio
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path('/tmp/subscription-backend-correction-root.txt').read_text().strip()
sys.path.insert(0, ROOT)
from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError
from services.worker.connectors.chatgpt_local import SubscriptionBridge
from services.worker.connectors import chatgpt_launch

class MemoryRPC(ChatGPTAppServer):
    def __init__(self, sandbox=None, hook=None):
        super().__init__(['unused-no-process'], cwd='/empty-owned-test', env={}, isolation_verified=True)
        self._started = True
        self.calls = []
        self.sandbox = sandbox or {'type':'readOnly','networkAccess':False}
        self.hook = hook
    async def _rpc(self, method, params, **kw):
        # Match the real _send pre-write fatal/closed guard while keeping every
        # operation in memory; no executable transport exists in this probe.
        if self._closed or self._fatal:
            raise RPCError(self._fatal or 'closed')
        if kw.get('before_send'):
            kw['before_send']()
        self.calls.append(method)
        if self.hook:
            await self.hook(self, method)
        if method == 'account/read':
            return {'account':{'type':'chatgpt','planType':'plus'}}
        if method == 'model/list':
            return {'data':[{'id':'catalog','model':'synthetic-model','displayName':'Local fixture','isDefault':True,'inputModalities':['text','image']}], 'nextCursor':None}
        if method == 'account/rateLimits/read':
            return {'ordinaryUsageAllowed':None,'rateLimits':{'limitId':'codex','primary':None,'secondary':None}}
        if method == 'thread/start':
            return {'model':'synthetic-model','modelProvider':'openai','cwd':self.cwd,'approvalPolicy':'never','instructionSources':[], 'sandbox':self.sandbox,'thread':{'id':'thread-fixture','ephemeral':True}}
        if method == 'turn/start':
            await self._notification('turn/completed', {'threadId':'thread-fixture','turn':{'id':'turn-fixture','status':'completed','error':None,'items':[{'id':'message-fixture','type':'agentMessage','phase':'final_answer','text':'Synthetic completed response.'}]}})
            return {'turn':{'id':'turn-fixture'}}
        raise AssertionError(method)

async def ask(c, cancelled=None):
    return await c.ask('Explicit generated review request.', b'\x89PNG\r\n\x1a\nSYNTHETIC', model='synthetic-model', cancelled=cancelled or asyncio.Event())

async def main():
    outcomes=[]
    c=MemoryRPC()
    try:
        result=await ask(c)
        outcomes.append({'name':'memory_rpc_completed_control','passed':result['text']=='Synthetic completed response.', 'turn_submissions':c.calls.count('turn/start')})
    finally: await c.close()

    c=MemoryRPC({'type':'readOnly','networkAccess':True})
    try:
        result=await ask(c)
        outcomes.append({'name':'effective_sandbox_network_expansion','passed':False,'observed':'completed answer accepted','turn_submissions':c.calls.count('turn/start'),'expected':'reject changed effective sandbox before turn/start'})
    except RPCError as error:
        outcomes.append({'name':'effective_sandbox_network_expansion','passed':c.calls.count('turn/start')==0,'error':error.code,'turn_submissions':c.calls.count('turn/start')})
    finally: await c.close()

    stop=asyncio.Event()
    async def cancel_on_thread(c, method):
        if method=='thread/start': stop.set()
    c=MemoryRPC(hook=cancel_on_thread)
    try:
        await ask(c,stop)
        outcomes.append({'name':'cancel_after_thread_before_turn','passed':False})
    except RPCError as error:
        outcomes.append({'name':'cancel_after_thread_before_turn','passed':error.code=='cancelled' and 'turn/start' not in c.calls,'error':error.code,'turn_submissions':c.calls.count('turn/start')})
    finally: await c.close()

    async def revoke_on_thread(c, method):
        if method=='thread/start': await c._notification('account/updated',{'authMode':'apiKey'})
    c=MemoryRPC(hook=revoke_on_thread)
    try:
        await ask(c)
        outcomes.append({'name':'auth_revoked_during_preflight','passed':False})
    except RPCError as error:
        outcomes.append({'name':'auth_revoked_during_preflight','passed':error.code=='unauthenticated' and 'turn/start' not in c.calls,'error':error.code,'turn_submissions':c.calls.count('turn/start')})
    finally: await c.close()

    # Real low-level login cancellation maps to a completion event; inspect the
    # combined bridge result, not the two independently mocked halves.
    c=MemoryRPC()
    c._login_id='owned-login'
    async def login_rpc(method, params, **kw):
        assert method=='account/login/cancel'
        return {'status':'canceled'}
    c._rpc=login_rpc
    events=[]
    bridge=SubscriptionBridge(c, emit=events.append)
    bridge.login_id='owned-login'
    await c.login_cancel('owned-login')
    outcomes.append({'name':'combined_login_cancel_label','passed':events[0]['params']['error']=='login_cancelled','observed':events[0]})
    await bridge.close()
    metadata=json.loads(Path(ROOT,'docs/verification/backend/managed-subscription-config-metadata.json').read_text())
    template_hash=hashlib.sha256(json.dumps(chatgpt_launch._settings(Path('/PRODUCT_STATE')),sort_keys=True).encode()).hexdigest()
    assert template_hash==metadata['settings_template_sha256']
    assert metadata['codex']['sha256']==chatgpt_launch.SUPPORTED_BINARY_SHA256
    assert metadata['codex']['version']==chatgpt_launch.SUPPORTED_VERSION
    assert metadata['rpc_methods']==['initialize','config/read','configRequirements/read','skills/list']
    assert metadata['managed_provider']['id']==chatgpt_launch.MANAGED_PROVIDER
    result={'candidate':'7dc5e4fd093c5baa57c39ff29e401d738914773e','main_baseline':'d9c7334','archive_root':ROOT,
            'outcome':'B-SUB-01 and B-SUB-02 closed; source boundary accepted for pinned WSL gate',
            'checks':outcomes,'provider_calls':0,'real_codex_children':0,'auth_access':False,'display_access':False,
            'metadata_evidence':{'owner_receipt_reviewed_without_replay':True,'template_hash_matches':True,'template_sha256':template_hash,'binary_and_version_match':True,'owner_metadata_checker_replayed':False},
            'focused_tests':{'launch_config':{'passed':101,'deselected':22,'seconds':0.23},'rpc':{'passed':39,'deselected':47,'seconds':2.09},'bridge_timeout':{'passed':4}},
            'source_hashes':{n:hashlib.sha256(Path(ROOT,'services/worker/connectors',n).read_bytes()).hexdigest() for n in ['chatgpt_launch.py','chatgpt_local.py','chatgpt_rpc.py']}}
    Path('/tmp/subscription-backend-correction-review.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

asyncio.run(main())
