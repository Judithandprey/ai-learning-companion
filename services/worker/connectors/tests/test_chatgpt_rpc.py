"""Real private pipes and a fake child; never Codex, login, or model access."""

import asyncio
import base64
from hashlib import sha256
import json
from pathlib import Path
import sys

import pytest

from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError
from services.worker.connectors import chatgpt_rpc as rpc


PNG = b"\x89PNG\r\n\x1a\nsynthetic-transport-payload"
MODEL = "test-image-model"
FAKE = r'''
import json, os, sys, time
mode = os.environ['SCENARIO']
log = os.environ['LOG']
skill_reads = 0
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
    elif method=='config/read':
        result={'config':{'tool_gate':'synthetic','private':'TOKEN-secret'},'layers':[]}
    elif method=='configRequirements/read': result={'requirements':None}
    elif method=='skills/list':
        skill_reads += 1
        if mode=='skills_error':
            send({'id':request['id'],'error':{'code':-1,'message':'TOKEN-secret'}}); continue
        rows=[{'name':f'builtin-{i}','description':'Synthetic test skill.','enabled':False,
               'scope':'system','path':f'/product-only/skills/.system/builtin-{i}/SKILL.md'} for i in range(6)]
        errors=[]
        if mode=='skills_enabled' or (mode=='skills_changed' and skill_reads==2): rows[0]['enabled']=True
        if mode=='skills_extra': rows.append({**rows[0],'name':'other','scope':'user'})
        if mode=='skills_errors': errors=[{'message':'TOKEN-secret','path':'/private/other'}]
        result={'data':[{'cwd':os.getcwd(),'skills':rows,'errors':errors}]}
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
        result={'thread':{'id':'thread-1','ephemeral':True},'model':'test-image-model','modelProvider':'openai',
            'instructionSources':[],'cwd':os.getcwd(),'approvalPolicy':'never',
            'sandbox':{'type':'readOnly','networkAccess':False}}
        if mode=='provider_alias': result['modelProvider']='lc_managed_chatgpt'
        if mode=='model_mismatch': result['model']='other-model'
        if mode=='instructions': result['instructionSources']=['/private/AGENTS.md']
        if mode=='missing_instructions': result.pop('instructionSources')
        if mode=='network_enabled': result['sandbox']['networkAccess']=True
        if mode=='network_zero': result['sandbox']['networkAccess']=0
        if mode=='network_missing': result['sandbox'].pop('networkAccess')
        if mode=='sandbox_changed': result['sandbox']={'type':'dangerFullAccess'}
        if mode=='ephemeral_missing': result['thread'].pop('ephemeral')
        if mode=='ephemeral_false': result['thread']['ephemeral']=False
    elif method=='turn/start':
        result={'turn':{'id':'turn-1','status':'inProgress','items':[]}}
        if mode=='start_error':
            send({'id':request['id'],'error':{'code':-1,'message':'TOKEN-secret'}}); continue
        if mode=='before_reply': completed()
        if mode=='start_hang': time.sleep(10); continue
    elif method=='turn/interrupt':
        if mode=='ignore_interrupt': continue
    send({'id':request['id'],'result':result})
    if method=='initialize' and mode=='startup_tool': event('hook/started',run={})
    if method=='turn/start':
        if mode.startswith('many_deltas_'):
            kind=mode.removeprefix('many_deltas_')
            delta_method={'agent':'item/agentMessage/delta','reasoning':'item/reasoning/textDelta',
                          'summary':'item/reasoning/summaryTextDelta'}.get(kind,'item/agentMessage/delta')
            count=32000 if kind=='single' else 9000
            delta='' if kind=='empty' else 'x' if kind=='single' else 'abc'
            for _ in range(count):
                event(delta_method,threadId='thread-1',turnId='turn-1',itemId='stream-1',
                      delta=delta,contentIndex=0,summaryIndex=0)
            if kind=='tool':
                event('item/started',threadId='other-thread',turnId='other-turn',item={'type':'commandExecution'})
                continue
            if kind=='request':
                send({'id':'server-request','method':'item/tool/requestUserInput','params':{'threadId':'other-thread'}})
                continue
            if kind=='incomplete': continue
            text=delta*count if kind in ('agent','single') else 'Completed answer.'
            completed(items=[{'id':'answer-1','type':'agentMessage','phase':'final_answer','text':text}])
            continue
        if mode.startswith('flood_'):
            kind=mode.removeprefix('flood_')
            for _ in range(10000):
                if kind=='slow': time.sleep(.001)
                if kind=='reply': send({'id':request['id'],'result':{}})
                elif kind=='lifecycle':
                    event('item/started',threadId='thread-1',turnId='turn-1',item={'type':'reasoning'})
                else:
                    event('unknown/notification' if kind=='unknown' else 'item/agentMessage/delta',
                          threadId='foreign-thread' if kind in ('foreign','unknown') else 'thread-1',
                          turnId='turn-1',itemId='stream-1',
                          delta='' if kind in ('empty','foreign','slow') else 'x'*(16384 if kind=='line' else 256))
            continue
        if mode in ('hang','ignore_interrupt','late_complete'): continue
        if mode=='disconnect': sys.exit(0)
        if mode.startswith('auth_changed_'):
            auth_mode=mode.removeprefix('auth_changed_')
            event('account/updated',authMode=None if auth_mode=='null' else auth_mode,planType='plus')
            completed(); continue
        if mode=='server_request':
            send({'id':'server-request','method':'item/tool/call','params':{'secret':'TOKEN-secret'}}); continue
        if mode=='user_input_request':
            send({'id':'server-request','method':'item/tool/requestUserInput','params':{
                'threadId':'thread-1','turnId':'turn-1','itemId':'input-1','isBlocking':True,'questions':[]}}); continue
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
    if method=='turn/interrupt':
        if mode=='late_complete': completed()
        else: completed('interrupted',items=[])
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


@pytest.mark.parametrize("kind", ["agent", "reasoning", "summary", "single", "empty"])
def test_fragmented_stream_does_not_consume_lifecycle_event_budget(tmp_path, kind):
    async def run():
        c = client(tmp_path, "many_deltas_" + kind, isolation_verified=True)
        c.turn_timeout = 5
        try:
            await c.start()
            answer = await invoke(c)
            expected = "abc" * 9000 if kind == "agent" else "x" * 32000 if kind == "single" else "Completed answer."
            assert answer["text"] == expected
            assert c._fatal is None
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("kind", ["agent", "empty", "foreign", "unknown", "reply"])
def test_all_inbound_wire_bytes_are_charged_before_thread_or_method_filtering(tmp_path, monkeypatch, kind):
    monkeypatch.setattr(rpc, "MAX_TURN_WIRE_BYTES", 8192)

    async def run():
        c = client(tmp_path, "flood_" + kind, isolation_verified=True)
        stop = asyncio.Event()
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c, cancelled=stop)
            assert error.value.code == "protocol_error"
            assert c.terminal.is_set() and c._process.returncode is not None
            assert not stop.is_set()
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


def test_lifecycle_event_budget_still_rejects_repeated_items(tmp_path):
    async def run():
        c = client(tmp_path, "flood_lifecycle", isolation_verified=True)
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == "protocol_error" and c.terminal.is_set()
        finally:
            await c.close()
    asyncio.run(run())


def test_receive_line_limit_still_applies_before_ignored_delta_filtering(tmp_path, monkeypatch):
    monkeypatch.setattr(rpc, "MAX_LINE_BYTES", 8192)

    async def run():
        c = client(tmp_path, "flood_line", isolation_verified=True)
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == "protocol_error" and c.terminal.is_set()
            assert c._process.returncode is not None
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("cancel", [False, True])
def test_sustained_empty_stream_keeps_deadline_and_explicit_cancel_effective(tmp_path, cancel):
    async def run():
        c = client(tmp_path, "flood_slow", isolation_verified=True)
        c.turn_timeout = .1
        stop = asyncio.Event()
        try:
            await c.start()
            task = asyncio.create_task(invoke(c, cancelled=stop))
            if cancel:
                async with asyncio.timeout(1):
                    while c._active is None:
                        await asyncio.sleep(.001)
                    await c._active["known"].wait()
                stop.set()
            with pytest.raises(RPCError) as error:
                await asyncio.wait_for(task, 1)
            assert error.value.code == ("cancellation_uncertain" if cancel else "outcome_unknown")
            assert stop.is_set() is cancel
            assert c.terminal.is_set() and c._process.returncode is not None
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("kind", ["tool", "request", "incomplete"])
def test_ignored_deltas_never_authorize_tools_or_replace_a_completed_answer(tmp_path, kind):
    async def run():
        c = client(tmp_path, "many_deltas_" + kind, isolation_verified=True)
        c.turn_timeout = 1
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == ("outcome_unknown" if kind == "incomplete" else "tool_activity")
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("active", [False, True])
@pytest.mark.parametrize("payload_bytes,expected_reads", [(0, 64), (200000, 2)])
def test_buffered_reader_yields_for_deadlines_and_close_even_without_an_ask(tmp_path, active, payload_bytes, expected_reads):
    async def run():
        c = client(tmp_path)
        line = json.dumps({"method": "unknown/notification", "params": {
            "threadId": "foreign-thread", "payload": "x" * payload_bytes}}).encode() + b"\n"

        class BufferedChild:
            stdin = None
            returncode = None
            reads = 0

            def __init__(self):
                self.stdout = self

            async def readline(self):
                self.reads += 1
                # Finite even if the production fairness yield regresses.
                return line if self.reads <= 1024 else b""

            def kill(self):
                self.returncode = -9

            def terminate(self):
                self.returncode = -15

            async def wait(self):
                return self.returncode

        c._process = BufferedChild()
        if active:
            c._active = {"thread_id": "thread-1", "wire_bytes": 0,
                         "done": asyncio.get_running_loop().create_future()}
        c._reader = asyncio.create_task(c._read_loop())
        await asyncio.sleep(0)
        assert c._process.reads == expected_reads
        assert not c.terminal.is_set()
        await asyncio.wait_for(c.close(), .5)
        assert c.terminal.is_set() and c._process.returncode is not None
        assert c._reader.done()
    asyncio.run(run())


@pytest.mark.parametrize("ending", ["failure", "close"])
def test_terminal_signal_is_immediate_unusability_not_a_reaping_receipt(tmp_path, ending):
    async def run():
        c = client(tmp_path)
        await c.start()
        assert not c.terminal.is_set()
        await c._close_lock.acquire()
        if ending == "failure":
            c._fail("protocol_error")
            assert c.terminal.is_set()
        closing = asyncio.create_task(c.close())
        try:
            await asyncio.wait_for(c.terminal.wait(), .5)
            assert not closing.done()
        finally:
            c._close_lock.release()
            await closing
        assert c._process.returncode is not None
    asyncio.run(run())


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
    ("network_enabled", "isolation_unverified"), ("network_missing", "isolation_unverified"),
    ("network_zero", "isolation_unverified"),
    ("sandbox_changed", "isolation_unverified"), ("ephemeral_missing", "isolation_unverified"),
    ("ephemeral_false", "isolation_unverified"),
    ("user_input_request", "tool_activity"),
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
                assert events[-1][1]["error"] == "login_cancelled"
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
        stop = asyncio.Event()
        await c.start()
        task = asyncio.create_task(invoke(c, cancelled=stop))
        async with asyncio.timeout(1):
            while c._active is None:
                await asyncio.sleep(.001)
            await c._active["known"].wait()
        await c.close()
        with pytest.raises(RPCError):
            await task
        assert c._process.returncode is not None
        assert not stop.is_set()
    asyncio.run(run())


@pytest.mark.parametrize("mode,terminal", [
    ("hang", "interrupted"), ("ignore_interrupt", None), ("late_complete", "completed"),
])
def test_internal_timeout_cleanup_preserves_failure_intent_and_suppresses_late_answer(tmp_path, mode, terminal):
    async def run():
        receipts = []
        c = client(tmp_path, mode, isolation_verified=True, on_receipt=receipts.append)
        c.turn_timeout = .03
        stop = asyncio.Event()
        try:
            await c.start()
            c.begin_request("timed-out")
            with pytest.raises(RPCError) as error:
                await invoke(c, cancelled=stop)
            assert error.value.code == "outcome_unknown"
            assert not stop.is_set()
            c.finish_request("uncertain")
            assert receipts[-1]["outcome"] == "uncertain"
            assert receipts[-1]["terminal_status"] == terminal
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
            assert sum(row.get("method") == "turn/interrupt" for row in requests(c)) == 1
        finally:
            await c.close()
        assert not stop.is_set()
    asyncio.run(run())


def test_sent_rpc_error_cleanup_does_not_claim_user_cancellation(tmp_path):
    async def run():
        c = client(tmp_path, "start_error", isolation_verified=True)
        stop = asyncio.Event()
        try:
            await c.start()
            with pytest.raises(RPCError) as error:
                await invoke(c, cancelled=stop)
            assert error.value.code == "request_failed"
            assert not stop.is_set()
            assert c._process.returncode is not None
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        finally:
            await c.close()
    asyncio.run(run())


def test_task_unwind_interrupts_without_changing_caller_intent(tmp_path):
    async def run():
        c = client(tmp_path, "hang", isolation_verified=True)
        stop = asyncio.Event()
        try:
            await c.start()
            task = asyncio.create_task(invoke(c, cancelled=stop))
            async with asyncio.timeout(1):
                while c._active is None:
                    await asyncio.sleep(.001)
                await c._active["known"].wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert not stop.is_set()
            assert sum(row.get("method") == "turn/interrupt" for row in requests(c)) == 1
        finally:
            await c.close()
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


@pytest.mark.parametrize("asynchronous", [False, True])
def test_launch_verification_precedes_ready_accounts_and_inference(tmp_path, asynchronous):
    async def run():
        seen = []

        def verify(result, requirements, skills):
            assert c._started is (len(seen) != 0)
            assert c.isolation_verified is False
            seen.append(result)
            assert requirements == {"requirements": None}
            assert skills["data"][0]["cwd"] == c.cwd
            assert skills["data"][0]["errors"] == []
            assert len(skills["data"][0]["skills"]) == 6
            assert all(row["enabled"] is False for row in skills["data"][0]["skills"])
            assert [row["method"] for row in requests(c)][-3:] == ["config/read", "configRequirements/read", "skills/list"]
            return True

        async def async_verify(result, requirements, skills):
            await asyncio.sleep(0)
            return verify(result, requirements, skills)

        c = client(tmp_path, verify_config=async_verify if asynchronous else verify)
        try:
            await c.start()
            assert c._started is True and c.isolation_verified is True
            assert seen == [{"config": {"tool_gate": "synthetic", "private": "TOKEN-secret"}, "layers": []}]
            assert requests(c)[2]["params"] == {"includeLayers": True, "cwd": c.cwd}
            assert requests(c)[3]["params"] is None
            assert requests(c)[4]["params"] == {"cwds": [c.cwd], "forceReload": True}
            assert (await c.connection_read())["auth"]["mode"] == "chatgpt"
            assert (await invoke(c))["text"] == "Completed answer."
            assert len(seen) == 2
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("refusal", [False, None, 1, {}, "true", "exception"])
def test_verifier_refusal_overrides_test_gate_and_prevents_all_account_work(tmp_path, refusal, capfd):
    async def run():
        def verify(_result, _requirements, _skills):
            if refusal == "exception":
                raise ValueError("TOKEN-secret raw configuration")
            return refusal

        c = client(tmp_path, isolation_verified=True, verify_config=verify)
        assert c.isolation_verified is False
        with pytest.raises(RPCError) as error:
            await c.start()
        assert error.value.code == "unavailable"
        assert "TOKEN-secret" not in str(error.value)
        assert c._started is False and c.isolation_verified is False
        assert c._process.returncode is not None
        assert [row["method"] for row in requests(c)] == ["initialize", "initialized", "config/read", "configRequirements/read", "skills/list"]
        await c.close()
    asyncio.run(run())
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize("cancel", [False, True])
def test_waiting_verifier_timeout_or_cancel_reaps_child_before_any_account_work(tmp_path, cancel):
    async def run():
        entered = asyncio.Event()

        async def verify(_result, _requirements, _skills):
            entered.set()
            await asyncio.Event().wait()

        c = client(tmp_path, verify_config=verify)
        starting = asyncio.create_task(c.start())
        await asyncio.wait_for(entered.wait(), 1)
        with pytest.raises(RPCError):
            await c.connection_read()
        if cancel:
            starting.cancel()
        with pytest.raises(asyncio.CancelledError if cancel else RPCError):
            await asyncio.wait_for(starting, 1.5)
        assert c._process.returncode is not None
        assert not c.isolation_verified and not c._started
        assert [row["method"] for row in requests(c)] == ["initialize", "initialized", "config/read", "configRequirements/read", "skills/list"]
        await c.close()
    asyncio.run(run())


def test_user_input_server_request_is_denied_and_child_killed_after_verified_start(tmp_path):
    async def run():
        c = client(tmp_path, "user_input_request", verify_config=lambda _result, _requirements, _skills: True)
        denied = []
        original_send = c._send

        async def observe_denial(message, **kwargs):
            if message.get("id") == "server-request":
                denied.append(message)
            await original_send(message, **kwargs)

        c._send = observe_denial
        await c.start()
        with pytest.raises(RPCError) as error:
            await invoke(c)
        assert error.value.code == "tool_activity"
        assert denied == [{"id": "server-request", "error": {
            "code": -32601, "message": "Server requests are disabled."}}]
        assert c._process.returncode is not None
        assert c._closed is True
        assert sum(row.get("method") == "turn/start" for row in requests(c)) == 1
        await c.close()
    asyncio.run(run())


def test_changed_managed_requirements_refuse_before_thread_creation(tmp_path):
    async def run():
        checks = []

        def verify(config, requirements, skills):
            checks.append((config, requirements, skills))
            return len(checks) == 1

        receipts = []
        c = client(tmp_path, verify_config=verify, on_receipt=receipts.append)
        await c.start()
        c.begin_request("policy-changed")
        with pytest.raises(RPCError) as error:
            await invoke(c)
        assert error.value.code == "isolation_unverified"
        c.finish_request("not_submitted")
        assert len(checks) == 2
        assert c._process.returncode is not None and c.isolation_verified is False
        assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(c))
        assert receipts[-1]["thread_start_count"] == receipts[-1]["turn_start_count"] == 0
        assert receipts[-1]["submission"] == "not_submitted"
        await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode,expected,success", [
    ("success", "lc_managed_chatgpt", False),
    ("provider_alias", "lc_managed_chatgpt", True),
])
def test_exact_managed_provider_is_explicit_and_never_falls_back(tmp_path, mode, expected, success):
    async def run():
        c = client(tmp_path, mode, expected_provider=expected, isolation_verified=True)
        try:
            await c.start()
            if success:
                assert (await invoke(c))["model"] == MODEL
            else:
                with pytest.raises(RPCError) as error:
                    await invoke(c)
                assert error.value.code == "model_mismatch"
            thread = next(row for row in requests(c) if row.get("method") == "thread/start")
            assert thread["params"]["modelProvider"] == expected
            assert thread["params"]["allowProviderModelFallback"] is False
            assert sum(row.get("method") == "turn/start" for row in requests(c)) == int(success)
        finally:
            await c.close()
    asyncio.run(run())


def test_private_receipt_binds_exact_inputs_terminal_and_cumulative_writes_without_content(tmp_path):
    async def run():
        receipts = []
        c = client(tmp_path, isolation_verified=True, on_receipt=receipts.append)
        await c.start()
        try:
            for number in (1, 2):
                c.begin_request(f"request-{number}")
                initial = receipts[-1]
                assert initial["submission"] == "not_submitted" and initial["outcome"] == "pending"
                assert initial["text_bytes"] is None and initial["image_bytes"] is None
                answer = await invoke(c)
                assert answer["text"] == "Completed answer."
                # The outer bridge owns the local presentation outcome.
                assert receipts[-1]["outcome"] == "pending"
                c.finish_request("completed")
                assert receipts[-1] == {
                    "request_id": f"request-{number}", "input_types": ["text", "image"],
                    "text_bytes": len(b"An explicit ASK."), "text_sha256": sha256(b"An explicit ASK.").hexdigest(),
                    "image_bytes": len(PNG), "image_sha256": sha256(PNG).hexdigest(),
                    "submission": "acknowledged", "terminal_status": "completed", "outcome": "completed",
                    "produced_item_types": ["agentMessage"], "thread_start_count": number,
                    "turn_start_count": number, "actual_model": MODEL, "thread_id": "thread-1", "turn_id": "turn-1"}
                assert any(row["request_id"] == f"request-{number}" and row["submission"] == "written" for row in receipts)
            encoded = json.dumps(receipts)
            for private in ("An explicit ASK.", "Completed answer.", base64.b64encode(PNG).decode(), "TOKEN-secret", "https://"):
                assert private not in encoded
            # Callback-owned copies cannot mutate the next receipt.
            receipts[-1]["produced_item_types"].append("forged")
            c.finish_request("completed")
            assert receipts[-1]["produced_item_types"] == ["agentMessage"]
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("kind", ["invalid", "pre_cancelled", "sandbox"])
def test_receipt_never_claims_turn_submission_for_local_or_thread_refusal(tmp_path, kind):
    async def run():
        receipts = []
        c = client(tmp_path, "network_enabled" if kind == "sandbox" else "success",
                   isolation_verified=True, on_receipt=receipts.append)
        try:
            await c.start()
            c.begin_request("rejected")
            if kind == "invalid":
                # The outer parser can reject before it ever invokes ask().
                c.finish_request("not_submitted")
            else:
                stop = asyncio.Event()
                if kind == "pre_cancelled":
                    stop.set()
                with pytest.raises(RPCError):
                    await invoke(c, cancelled=stop)
                c.finish_request("cancelled" if kind == "pre_cancelled" else "not_submitted")
            final = receipts[-1]
            assert final["submission"] == "not_submitted" and final["terminal_status"] is None
            assert final["thread_start_count"] == int(kind == "sandbox")
            assert final["turn_start_count"] == 0
            assert not any(row.get("method") == "turn/start" for row in requests(c))
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode,status,local", [
    ("failed", "failed", "failed"), ("interrupted", "interrupted", "cancelled"),
    ("tool_item", None, "failed"),
])
def test_receipt_preserves_remote_terminal_separately_from_local_outcome(tmp_path, mode, status, local):
    async def run():
        receipts = []
        c = client(tmp_path, mode, isolation_verified=True, on_receipt=receipts.append)
        try:
            await c.start()
            c.begin_request("refused-result")
            with pytest.raises(RPCError):
                await invoke(c)
            c.finish_request(local)
            final = receipts[-1]
            assert final["terminal_status"] == status and final["outcome"] == local
            assert final["thread_start_count"] == final["turn_start_count"] == 1
            if mode == "tool_item":
                assert final["produced_item_types"] == ["commandExecution"]
            assert "TOKEN-secret" not in json.dumps(final)
        finally:
            await c.close()
    asyncio.run(run())


def test_receipt_marks_drain_failure_uncertain_without_claiming_acknowledgment(tmp_path):
    async def run():
        receipts = []
        c = client(tmp_path, "hang", isolation_verified=True, on_receipt=receipts.append)
        original_send = c._send

        async def failed_drain():
            raise BrokenPipeError("TOKEN-secret")

        async def fail_at_turn(message, **kwargs):
            if message.get("method") == "turn/start":
                c._process.stdin.drain = failed_drain
            return await original_send(message, **kwargs)

        c._send = fail_at_turn
        await c.start()
        c.begin_request("uncertain-write")
        with pytest.raises(RPCError):
            await invoke(c)
        c.finish_request("uncertain")
        final = receipts[-1]
        assert final["submission"] == "uncertain" and final["terminal_status"] is None
        assert final["thread_start_count"] == final["turn_start_count"] == 1
        assert not any(row["submission"] in ("written", "acknowledged") for row in receipts)
        assert c._process.returncode is not None
        await c.close()
    asyncio.run(run())


def test_send_intent_receipt_failure_prevents_prompt_write(tmp_path):
    async def run():
        receipts = []

        def writer(receipt):
            if receipt["submission"] == "uncertain":
                assert receipt["turn_start_count"] == 0
                assert not any(row.get("method") == "turn/start" for row in requests(c))
                raise OSError("private receipt unavailable")
            receipts.append(receipt)

        c = client(tmp_path, isolation_verified=True, on_receipt=writer)
        await c.start()
        c.begin_request("cannot-record-send")
        with pytest.raises(RPCError) as error:
            await invoke(c)
        assert error.value.code == "unavailable"
        assert c._turn_start_count == 0
        assert not any(row.get("method") == "turn/start" for row in requests(c))
        assert receipts[-1]["submission"] == "not_submitted"
        assert c._process.returncode is not None
        await c.close()
    asyncio.run(run())


def test_send_intent_precedes_write_and_written_receipt_follows_drain(tmp_path):
    async def run():
        receipts = []

        def writer(receipt):
            if receipt["submission"] == "uncertain":
                assert receipt["turn_start_count"] == 0
                assert not any(row.get("method") == "turn/start" for row in requests(c))
            if receipt["submission"] in ("written", "acknowledged"):
                assert receipt["turn_start_count"] == 1
            receipts.append(receipt)

        c = client(tmp_path, isolation_verified=True, on_receipt=writer)
        try:
            await c.start()
            c.begin_request("truthful-send-order")
            await invoke(c)
            phases = [row["submission"] for row in receipts]
            assert phases.index("uncertain") < phases.index("written") < phases.index("acknowledged")
            assert receipts[-1]["terminal_status"] == "completed"
        finally:
            await c.close()
    asyncio.run(run())


@pytest.mark.parametrize("mode", ["skills_enabled", "skills_extra", "skills_errors", "skills_error", "skills_changed"])
def test_discovered_skills_plane_must_verify_at_startup_and_before_each_thread(tmp_path, mode):
    async def run():
        checks = []

        def verify(_config, _requirements, skills):
            checks.append(skills)
            entry, = skills["data"]
            rows = entry["skills"]
            return (entry["cwd"] == c.cwd and entry["errors"] == [] and len(rows) == 6
                    and {row["name"] for row in rows} == {f"builtin-{i}" for i in range(6)}
                    and all(row["enabled"] is False and row["scope"] == "system"
                            and row["path"] == f"/product-only/skills/.system/{row['name']}/SKILL.md"
                            for row in rows))

        c = client(tmp_path, mode, verify_config=verify)
        if mode == "skills_changed":
            await c.start()
            assert c.isolation_verified is True
            with pytest.raises(RPCError) as error:
                await invoke(c)
            assert error.value.code == "isolation_unverified"
            assert len(checks) == 2
        else:
            with pytest.raises(RPCError) as error:
                await c.start()
            assert error.value.code == "unavailable"
            assert not any(row.get("method", "").startswith(("account/", "model/")) for row in requests(c))
        assert c.isolation_verified is False
        assert c._process.returncode is not None
        assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(c))
        await c.close()
    asyncio.run(run())
