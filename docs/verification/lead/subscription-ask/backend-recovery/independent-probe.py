"""Independent bounded lifecycle probes, entirely in-process and synthetic."""
import asyncio
import json
from pathlib import Path
import sys
import time

ARCHIVE = Path('/tmp/backend-subscription-1b27a91-y9i71opk')
sys.path.insert(0, str(ARCHIVE))
from services.worker.connectors import chatgpt_local as local
from services.worker.connectors.tests.test_chatgpt_local import FakeClient, LearningSpy, ask_request, message, MODEL

local.TERMINAL_REPLY_SECONDS = 0.02  # Exercise expiry without the production one-second wait.

async def scenario(control):
    client, learning, incoming, emitted, outcomes = FakeClient(), LearningSpy(), asyncio.Queue(), [], []
    client.allow_send.set()
    client.finish_request = outcomes.append
    task = asyncio.create_task(local.run_stream(incoming.get, emitted.append, client,
                                  prepare=learning.prepare, bind=learning.bind))
    request = ask_request.__wrapped__()
    incoming.put_nowait(json.dumps(message('ask/start', {'request': request, 'model': MODEL})).encode()+b'\n')
    await asyncio.wait_for(client.sent.wait(), 1)
    if control is not None:
        method = 'ask/cancel' if control == 'cancel' else 'session/stop'
        params = {'request_id': request['request_id']} if control == 'cancel' else {'capture_session_id': request['context']['capture_session_id']}
        incoming.put_nowait(json.dumps(message(method, params, request_id='control')).encode()+b'\n')
        async with asyncio.timeout(1):
            while not any(row.get('id') == 'control' for row in emitted):
                await asyncio.sleep(0)
    before = time.monotonic()
    client.terminal.set()
    # Parent queue remains open and contains no EOF. A later request must never run.
    incoming.put_nowait(json.dumps(message('ask/start', {'request': {**request, 'request_id': 'late'}, 'model': MODEL}, request_id='late')).encode()+b'\n')
    await asyncio.wait_for(task, 1)
    elapsed_ms = round((time.monotonic()-before)*1000, 2)
    assert client.closed
    assert not any(row.get('id') in ('outer-one','late') for row in emitted)
    assert sum(row[0]=='turn/start' for row in client.calls) == 1
    assert outcomes == (['uncertain'] if control is None else ['cancelled'])
    assert client.cancelled.is_set() is (control is not None)
    assert learning.bound == []
    return {'control':control,'outcomes':outcomes,'emitted_ids':[row['id'] for row in emitted],
            'turn_starts':1,'closed_without_parent_eof':True,'user_cancel_flag':client.cancelled.is_set(),
            'elapsed_ms_with_20ms_test_grace':elapsed_ms,'late_answer_bound':False}

async def reserved():
    client, learning, emitted, outcomes = FakeClient(), LearningSpy(), [], []
    client.finish_request=outcomes.append
    bridge=local.SubscriptionBridge(client,emit=emitted.append,prepare=learning.prepare,bind=learning.bind)
    await bridge.handle(message('ask/start',{'request':ask_request.__wrapped__(),'model':MODEL}))
    active=bridge.active
    client.terminal.set()
    await bridge.close(terminal_failure=True)
    assert outcomes==['not_submitted'] and not active.cancelled.is_set()
    assert learning.prepared==[] and emitted==[]
    return {'control':'reserved_not_run','outcomes':outcomes,'user_cancel_flag':False,'provider_calls':0}

async def main():
    results=[await scenario(control) for control in (None,'cancel','stop')]
    results.append(await reserved())
    assert not [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    report={'candidate':'1b27a918f265349929d6344f0bbe163c6a854b99','synthetic_only':True,'passed':4,'results':results,'pending_tasks_after':0}
    Path('/tmp/backend-subscription-recovery-probe.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

asyncio.run(main())
