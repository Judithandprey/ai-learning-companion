"""Offline schedule probe: exact released bridge, synthetic serialized Mac IPC queue.

The queue models AskProcess.send's single DispatchQueue. No Swift/AppKit or provider
is executed: this establishes the consequence of the statically observed queue order.
"""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("review_chatgpt_local", HERE / "chatgpt_local_39620fa.py")
bridge_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge_module
spec.loader.exec_module(bridge_module)


async def main():
    trace = []
    stop_clicked = False

    class SyntheticClient:
        def __init__(self):
            self.terminal = asyncio.Event()
            self.finished = asyncio.Event()

        async def ask(self, text, image_bytes, *, model, cancelled):
            trace.append({"event": "synthetic_inference_started", "after_local_stop": stop_clicked})
            await self.finished.wait()
            raise asyncio.CancelledError

        async def interrupt(self):
            trace.append({"event": "connector_received_interrupt"})
            self.finished.set()
            return True

    client = SyntheticClient()
    emitted = []
    bridge = bridge_module.SubscriptionBridge(
        client, emit=emitted.append,
        prepare=lambda request: {"text": "synthetic", "image_bytes": b"synthetic-no-image"},
    )
    def envelope(identifier, method, params):
        return {"version": bridge_module.VERSION, "id": identifier, "method": method, "params": params}

    # A submitted image line is queued on AskProcess.writes but has not reached
    # the connector. The serial queue may be delayed by scheduling/backpressure.
    writes = [envelope("c1", "ask/start", {
        "request": {"request_id": "r1", "context": {"capture_session_id": "s1"}},
        "model": "synthetic-model",
    })]
    trace.append({"event": "image_line_queued_before_delivery"})
    stop_clicked = True
    trace.append({"event": "local_stop_and_presentation_fence"})
    # fenceLocally -> settle -> call(ask/cancel) queues behind the image line.
    writes.append(envelope("c2", "ask/cancel", {"request_id": "r1"}))
    for message in writes:
        trace.append({"event": "delivered", "method": message["method"]})
        await bridge.handle(message)
        # This is the yield in the exact run_stream loop after bridge.handle.
        await asyncio.sleep(0)
    await asyncio.gather(*list(bridge.tasks), return_exceptions=True)
    assert any(item.get("after_local_stop") is True for item in trace)
    print(json.dumps({"trace": trace, "emitted": emitted,
                      "scope": "actual Backend 39620fa bridge; synthetic desktop write schedule; no native/provider execution"}, indent=2))


asyncio.run(main())
