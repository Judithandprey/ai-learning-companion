"""Independent offline transport probes; only synthetic owned RPC children."""
import asyncio
import pytest
from services.worker.connectors.chatgpt_live import LiveSubscriptionBridge
from services.worker.connectors.chatgpt_rpc import RPCError
from packages.contracts import live_companion as wire
from services.worker.connectors.tests.test_chatgpt_rpc import client, requests, MODEL, PNG
from services.worker.connectors.tests.test_chatgpt_live import start, turn


def test_cancel_during_send_intent_receipt_prevents_actual_prompt_write(tmp_path):
    async def run():
        cancelled=asyncio.Event()
        receipts=[]
        def save(row):
            receipts.append(row)
            if row['submission']=='uncertain':
                cancelled.set()
        c=client(tmp_path,isolation_verified=True,on_receipt=save)
        try:
            await c.start()
            c.begin_request('independent-receipt-cancel')
            with pytest.raises(RPCError) as caught:
                await c.ask('Synthetic explicit hint request.',PNG,model=MODEL,cancelled=cancelled)
            assert caught.value.code=='cancelled'
            assert caught.value.submission=='not_submitted'
            assert c.request_submission()=='not_submitted'
            assert receipts[-1]['submission']=='not_submitted'
            assert not any(row.get('method')=='turn/start' for row in requests(c))
        finally:
            await c.close()
        assert c._process.returncode is not None
    asyncio.run(run())

@pytest.mark.parametrize('scenario',['user_input_request','tool_item'])
def test_live_bridge_with_real_rpc_refuses_tool_activity_and_reaps_fake_child(tmp_path,scenario):
    async def run():
        c=client(tmp_path,scenario,isolation_verified=True)
        output=asyncio.Queue()
        bridge=LiveSubscriptionBridge(c,emit=output.put_nowait)
        try:
            await c.start()
            await bridge.handle({'version':wire.VERSION,'id':'start','method':'companion/start','params':start(model=MODEL)})
            first=await asyncio.wait_for(output.get(),2)
            assert 'result' in first
            await bridge.handle({'version':wire.VERSION,'id':'focus','method':'companion/turn','params':turn()})
            response=await asyncio.wait_for(output.get(),2)
            assert response=={'id':'focus','error':{'code':'unavailable','submission':'submitted'}}
            assert bridge.session.stopped and bridge.pending is None
            assert 'TOKEN-secret' not in repr(response)
            assert c._process.returncode is not None
            assert sum(row.get('method')=='turn/start' for row in requests(c))==1
            await bridge.handle({'version':wire.VERSION,'id':'repeat','method':'companion/turn','params':turn('repeat',4)})
            denied=await asyncio.wait_for(output.get(),2)
            assert 'result' not in denied
            assert sum(row.get('method')=='turn/start' for row in requests(c))==1
        finally:
            await bridge.close()
    asyncio.run(run())
