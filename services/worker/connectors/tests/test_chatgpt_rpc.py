"""Real private pipes and a fake child; never Codex, login, or model access."""

import asyncio
import base64
import json
from pathlib import Path
import sys

import pytest

from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError


PNG = b"\x89PNG\r\n\x1a\nsynthetic-transport-payload"
MODEL = "test-image-model"
FAKE = r'''
import json, os, sys, time
mode = os.environ['SCENARIO']
log = os.environ['LOG']
def send(value):
    print(json.dumps(value), flush=True)
def event(method, **params):
    send({'method':method, 'params':params})
def completed(status='completed', items=None, **extra):
    event('turn/completed', threadId='thread-1', turn={
        'id':'turn-1','status':status,'items':items if items is not None else [
        {'id':'answer-1','type':'agentMessage','phase':'final_answer','text':'Completed answer.'}],**extra})
for line in sys.stdin:
    request=json.loads(line)
    with open(log,'a') as out: out.write(json.dumps(request)+'\n')
    if 'method' not in request: continue
    method=request['method']
    if method=='initialized': continue
    result={}
    if method=='initialize':
        sys.stderr.write('secret@example.invalid TOKEN-secret\n'); sys.stderr.flush()
        if mode=='malformed':
            print('{"id":1,"id":1,"result":{}}',flush=True); continue
        if mode=='nonfinite':
            print('{"id":1,"result":{"value":1e999}}',flush=True); continue
        if mode=='init_hang': time.sleep(10); continue
        result={'codexHome':'/product-only','platformFamily':'unix','platformOs':'linux','userAgent':'test'}
    elif method=='account/read':
        account={'type':'chatgpt','email':'secret@example.invalid','planType':'plus'}
        if mode=='signed_out': account=None
        if mode=='api_key': account={'type':'apiKey'}
        result={'account':account,'requiresOpenaiAuth':True}
    elif method=='model/list':
        row={'id':'catalog-id','model':'test-image-model','displayName':'Test image model','isDefault':True,
            'inputModalities':['text','image']}
        if mode=='missing_modality': row.pop('inputModalities')
        if mode=='text_only': row['inputModalities']=['text']
        result={'data':[row],'nextCursor':None}
    elif method=='account/rateLimits/read':
        if mode=='quota_error':
            send({'id':request['id'],'error':{'code':-1,'message':'TOKEN-secret'}}); continue
        result={'accountId':'private-account','ordinaryUsageAllowed':None,
            'rateLimits':{'limitId':'codex','credits':{'balance':'PRIVATE'},
                'primary':{'usedPercent':23,'windowDurationMins':300,'resetsAt':0},'secondary':None}}
        if mode=='quota_denied': result['ordinaryUsageAllowed']=False
    elif method=='account/login/start':
        if mode=='early_login': event('account/login/completed',loginId='login-1',success=True,error=None)
        result={'type':'chatgpt','loginId':'login-1','authUrl':'https://auth.openai.com/oauth/authorize?private=not-logged'}
        if mode=='bad_url': result['authUrl']='https://auth.openai.com.evil.invalid/secret'
    elif method=='account/login/cancel': result={'status':'canceled'}
    elif method=='thread/start':
        if mode=='slow_thread': time.sleep(.15)
        result={'thread':{'id':'thread-1'},'model':'test-image-model','modelProvider':'openai',
            'instructionSources':[],'cwd':os.getcwd(),'approvalPolicy':'never','sandbox':{'type':'readOnly'}}
        if mode=='model_mismatch': result['model']='other-model'
        if mode=='instructions': result['instructionSources']=['/private/AGENTS.md']
        if mode=='missing_instructions': result.pop('instructionSources')
    elif method=='turn/start':
        result={'turn':{'id':'turn-1','status':'inProgress','items':[]}}
        if mode=='before_reply': completed()
        if mode=='start_hang': time.sleep(10); continue
    elif method=='turn/interrupt':
        if mode=='ignore_interrupt': continue
    send({'id':request['id'],'result':result})
    if method=='initialize' and mode=='startup_tool': event('hook/started',run={})
    if method=='turn/start':
        if mode in ('hang','ignore_interrupt'): continue
        if mode=='disconnect': sys.exit(0)
        if mode.startswith('auth_changed_'):
            auth_mode=mode.removeprefix('auth_changed_')
            event('account/updated',authMode=None if auth_mode=='null' else auth_mode,planType='plus')
            completed(); continue
        if mode=='server_request':
            send({'id':'server-request','method':'item/tool/call','params':{'secret':'TOKEN-secret'}}); continue
        if mode=='tool_item':
            event('item/started',threadId='unexpected-thread',turnId='other-turn',item={'type':'commandExecution'})
            continue
        if mode=='rerouted':
            event('model/rerouted',threadId='thread-1',turnId='turn-1',fromModel='test-image-model',toModel='other-model')
            continue
        if mode=='retry_error':
            event('error',threadId='thread-1',turnId='turn-1',willRetry=True,
                error={'message':'TOKEN-secret','codexErrorInfo':'rateLimitExceeded'})
            completed(); continue
        if mode=='failed': completed('failed',error={'message':'TOKEN-secret'}); continue
        if mode=='interrupted': completed('interrupted'); continue
        if mode=='commentary':
            completed(items=[{'id':'answer-1','type':'agentMessage','phase':'commentary','text':'Not final.'}]); continue
        if mode=='empty': completed(items=[]); continue
        if mode=='oversized_answer':
            completed(items=[{'id':'answer-1','type':'agentMessage','text':'x'*32001}]); continue
        if mode=='wrong_turn':
            event('turn/started',threadId='thread-1',turn={'id':'turn-other','status':'inProgress','items':[]}); continue
        if mode=='summary_only':
            completed(itemsView='summary'); continue
        if mode=='event_only':
            event('item/completed',threadId='thread-1',turnId='turn-1',completedAtMs=1,
                  item={'id':'answer-1','type':'agentMessage','phase':'final_answer','text':'Event answer.'})
            completed(items=[],itemsView='notLoaded'); continue
        if mode=='legacy':
            completed(items=[{'id':'answer-1','type':'agentMessage','text':'Legacy completed.'}]); continue
        if mode!='before_reply': completed()
    if method=='turn/interrupt': completed('interrupted',items=[])
'''


def client(tmp_path, mode="success", **kwargs):
    directory = tmp_path / mode
    directory.mkdir(exist_ok=True)
    instance = ChatGPTAppServer(
        [sys.executable, "-u", "-c", FAKE], cwd=str(directory),
        env={"SCENARIO": mode, "LOG": str(directory / "requests.jsonl")},
        rpc_timeout=.4, turn_timeout=.6, shutdown_timeout=.2, **kwargs)
    return instance


def requests(instance):
    path = Path(instance.env["LOG"])
    return [] if not path.exists() else [json.loads(line) for line in path.read_text().splitlines()]


async def invoke(instance, *, cancelled=None):
    return await instance.ask("An explicit ASK.", PNG, model=MODEL,
                              cancelled=cancelled if cancelled is not None else asyncio.Event())


def test_account_catalog_quota_are_exact_and_redacted(tmp_path, capfd):
    async def run():
        c = client(tmp_path)
        try:
            await c.start()
            result = await c.connection_read()
            assert result == {"auth": {"state": "signed_in", "mode": "chatgpt", "plan": "plus"},
                              "rate_limits": [{"label": "codex/primary", "used_percent": 23,
                                               "resets_at": "1970-01-01T00:00:00Z"}],
                              "models": [{"id": MODEL, "label": "Test image model",
                                          "image_input": True, "default": True}]}
        finally:
            await c.close()
        assert c._process.returncode is not None
    asyncio.run(run())
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize("mode,expected", [("signed_out", "signed_out"), ("api_key", "unknown")])
def test_non_managed_auth_stays_unsigned(tmp_path, mode, expected):
    async def run():
        c = client(tmp_path, mode, isolation_verified=True)
        try:
            await c.start()
            assert (await c.connection_read())["auth"]["state"] == expected
            with pytest.raises(RPCError, match="Managed ChatGPT login"):
                await invoke(c)
            assert not any(row.get("method") == "thread/start" for row in requests(c))
        finally:
            await c.close()
    asyncio.run(run())


def test_default_isolation_gate_prevents_inference(tmp_path):
    async def run():
        c = client(tmp_path)
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == "isolation_unverified"
            assert [row["method"] for row in requests(c)] == ["initialize", "initialized"]
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode,answer", [("success", "Completed answer."), ("before_reply", "Completed answer."),
                                       ("event_only", "Event answer."), ("legacy", "Legacy completed.")])
def test_exact_image_and_authoritative_completed_answer(tmp_path, mode, answer):
    async def run():
        c = client(tmp_path, mode, isolation_verified=True)
        try:
            await c.start()
            assert await invoke(c) == {"text": answer, "model": MODEL, "thread_id": "thread-1", "turn_id": "turn-1"}
            turns = [row for row in requests(c) if row.get("method") == "turn/start"]
            assert len(turns) == 1
            image = turns[0]["params"]["input"][1]
            assert image == {"type": "image", "url": "data:image/png;base64," + base64.b64encode(PNG).decode()}
            assert turns[0]["params"]["model"] == MODEL
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode,code", [
    ("text_only", "unsupported_model"), ("missing_modality", "unsupported_model"),
    ("quota_denied", "quota_exhausted"),
    ("model_mismatch", "model_mismatch"), ("instructions", "isolation_unverified"),
    ("missing_instructions", "isolation_unverified"), ("server_request", "tool_activity"),
    ("tool_item", "tool_activity"), ("rerouted", "model_mismatch"),
    ("retry_error", "quota_exhausted"), ("failed", "incomplete_turn"),
    ("interrupted", "incomplete_turn"), ("commentary", "incomplete_turn"),
    ("empty", "incomplete_turn"), ("summary_only", "incomplete_turn"),
    ("oversized_answer", "protocol_error"), ("wrong_turn", "protocol_error"),
    ("disconnect", "unavailable"), ("start_hang", "outcome_unknown"),
    ("auth_changed_apikey", "unauthenticated"), ("auth_changed_null", "unauthenticated"),
    ("auth_changed_chatgptAuthTokens", "unauthenticated"),
])
def test_refusals_never_publish_or_retry(tmp_path, mode, code):
    async def run():
        c = client(tmp_path, mode, isolation_verified=True)
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == code
            assert "TOKEN-secret" not in str(error.value)
            assert sum(row.get("method") == "turn/start" for row in requests(c)) <= 1
        finally:
            await c.close()
        assert c._process.returncode is not None
    asyncio.run(run())


@pytest.mark.parametrize("mode", ["malformed", "nonfinite", "init_hang", "startup_tool"])
def test_bad_or_stuck_handshake_has_bounded_own_child_cleanup(tmp_path, mode):
    async def run():
        c = client(tmp_path, mode)
        with pytest.raises(RPCError):
            await asyncio.wait_for(c.start(), 1.5)
            await c.connection_read()
        await c.close()
        assert c._process.returncode is not None
        await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode", ["success", "early_login"])
def test_login_ownership_completion_race_and_cancellation(tmp_path, mode):
    async def run():
        events = []
        c = client(tmp_path, mode, on_event=lambda *event: events.append(event))
        try:
            await c.start()
            result = await c.login_start()
            assert result == {"login_id": "login-1", "auth_url": "https://auth.openai.com/oauth/authorize?private=not-logged"}
            if mode == "early_login":
                assert events == [("connection/login/completed", {"login_id": "login-1", "success": True, "error": None})]
            else:
                with pytest.raises(RPCError) as error:
                    await c.login_cancel("other-login")
                assert error.value.code == "login_not_found"
                assert await c.login_cancel("login-1") == {}
                assert events[-1][1]["success"] is False
            assert not any(row.get("method") == "account/logout" for row in requests(c))
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("early", [True, False])
def test_cancellation_before_actual_submission(tmp_path, early):
    async def run():
        c = client(tmp_path, "slow_thread", isolation_verified=True)
        stop = asyncio.Event()
        if early:
            stop.set()
        try:
            await c.start()
            task = asyncio.create_task(invoke(c, cancelled=stop))
            if not early:
                await asyncio.sleep(.05)
                stop.set()
                assert await c.interrupt() is True
            with pytest.raises(RPCError) as error:
                await task
            assert error.value.code == "cancelled"
            assert not any(row.get("method") == "turn/start" for row in requests(c))
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode,code", [("hang", "cancelled"), ("ignore_interrupt", "cancellation_uncertain")])
def test_cancellation_after_submission_is_confirmed_or_explicitly_uncertain(tmp_path, mode, code):
    async def run():
        c = client(tmp_path, mode, isolation_verified=True)
        stop = asyncio.Event()
        try:
            await c.start()
            task = asyncio.create_task(invoke(c, cancelled=stop))
            async with asyncio.timeout(1):
                while c._active is None:
                    await asyncio.sleep(.001)
                await c._active["known"].wait()
            stop.set()
            with pytest.raises(RPCError) as error:
                await task
            assert error.value.code == code
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
            assert sum(row.get("method") == "turn/interrupt" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


def test_close_during_ask_reaps_child_and_suppresses_answer(tmp_path):
    async def run():
        c = client(tmp_path, "hang", isolation_verified=True)
        await c.start()
        task = asyncio.create_task(invoke(c))
        async with asyncio.timeout(1):
            while c._active is None:
                await asyncio.sleep(.001)
            await c._active["known"].wait()
        await c.close()
        with pytest.raises(RPCError):
            await task
        assert c._process.returncode is not None
    asyncio.run(run())


def test_cancellation_while_waiting_for_write_lock_prevents_prompt(tmp_path):
    async def run():
        c = client(tmp_path, isolation_verified=True)
        stop = asyncio.Event()
        original_rpc = c._rpc
        blocked = asyncio.Event()

        async def lock_before_turn(method, params, **kwargs):
            if method == "turn/start":
                await c._write_lock.acquire()
                blocked.set()
            return await original_rpc(method, params, **kwargs)

        c._rpc = lock_before_turn
        try:
            await c.start()
            task = asyncio.create_task(invoke(c, cancelled=stop))
            await asyncio.wait_for(blocked.wait(), 1)
            stop.set()
            c._write_lock.release()
            with pytest.raises(RPCError) as error:
                await task
            assert error.value.code == "cancelled"
            assert not any(row.get("method") == "turn/start" for row in requests(c))
        finally:
            await c.close()
    asyncio.run(run())


def test_unknown_quota_is_not_zero_or_a_false_allowance(tmp_path):
    async def run():
        c = client(tmp_path, "quota_error", isolation_verified=True)
        try:
            await c.start()
            assert (await c.connection_read())["rate_limits"] is None
            assert (await invoke(c))["text"] == "Completed answer."
        finally:
            await c.close()
    asyncio.run(run())


def test_bad_login_url_never_reaches_the_browser_seam(tmp_path):
    async def run():
        c = client(tmp_path, "bad_url")
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await c.login_start()
            assert error.value.code == "login_failed"
            assert "evil.invalid" not in str(error.value)
        finally:
            await c.close()
    asyncio.run(run())


def test_queued_interrupt_never_retargets_the_next_ask(tmp_path):
    async def run():
        c = client(tmp_path)
        old = {"cancelled": asyncio.Event(), "submitted": False}
        newer = {"cancelled": asyncio.Event(), "submitted": False}
        c._active = old
        await c._interrupt_lock.acquire()
        pending = asyncio.create_task(c.interrupt())
        await asyncio.sleep(0)
        c._active = newer
        c._interrupt_lock.release()
        assert await pending is True
        assert old["cancelled"].is_set()
        assert not newer["cancelled"].is_set()
        c._active = None
        await c.close()
    asyncio.run(run())
