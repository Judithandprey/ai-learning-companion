"""Test fixture for tests/live-bridge.test.ts.

The RELEASED live bridge (services.worker.connectors.chatgpt_local.run_stream, which pins lc-subscription-live/1 and
runs chatgpt_live.LiveSubscriptionBridge) and Learning's own preparation and binding, over this process's stdin and
stdout, with a stand-in for the provider client ONLY. SYNTHETIC: no Codex, no ChatGPT, no account and no network; a
"response" is text the test put into the control folder.

Usage: python live-bridge-child.py <backend root> <control folder>

The control folder (files the test writes; their names use the request id as it is):
  answer-<request id>   the text that provider turn completes with
  fail-<request id>     the provider's failure code for that turn (after it was submitted)
  unconfirmed           an interruption is NOT confirmed by the provider
The fixture appends what the provider was asked to provider.jsonl there.
"""
import asyncio
import hashlib
import json
import os
import sys
import threading

BACKEND, CONTROL = sys.argv[1], sys.argv[2]
sys.dont_write_bytecode = True
sys.path.insert(0, BACKEND)
from services.worker.connectors.chatgpt_local import run_stream  # noqa: E402
from services.worker.connectors.chatgpt_rpc import RPCError  # noqa: E402


def there(name):
    return os.path.exists(os.path.join(CONTROL, name))


def read(name):
    with open(os.path.join(CONTROL, name), encoding="utf-8") as file:
        return file.read()


def note(**event):
    with open(os.path.join(CONTROL, "provider.jsonl"), "a", encoding="utf-8") as file:
        file.write(json.dumps(event) + "\n")


class Provider:
    """In place of the Codex app-server client only: what the bridge asks of it, answered from the control folder."""

    def __init__(self):
        self.terminal = asyncio.Event()
        self.on_event = None
        self._request = None
        self._submission = "not_submitted"

    async def start(self):
        return None

    async def connection_read_live(self):
        return {
            "auth": {"state": "signed_in", "mode": "chatgpt", "plan": "synthetic"},
            "quota": {"available": False, "ordinary_usage_allowed": None, "windows": []},
            "models": [
                {"id": "text-only-model", "label": "Text only", "image_input": False, "default": True},
                {"id": "vision-model", "label": "Vision", "image_input": True, "default": False},
            ],
        }

    async def login_start(self):
        raise RPCError("login_failed")

    async def login_cancel(self, login_id):
        raise RPCError("login_not_found")

    def begin_request(self, request_id):
        self._request, self._submission = request_id, "not_submitted"

    def finish_request(self, outcome):
        note(event="finished", request_id=self._request, outcome=outcome)

    def request_submission(self):
        return self._submission

    def request_failure(self):
        return None

    async def ask(self, text, image_bytes, *, model, cancelled, send_guard=None):
        request = self._request
        if send_guard is not None:
            send_guard("thread/start")
            send_guard("turn/start")  # the bridge counts one of the session's requests here
        self._submission = "submitted"
        note(event="submitted", request_id=request, model=model, image_bytes=len(image_bytes),
             image_sha256=hashlib.sha256(image_bytes).hexdigest(), prompt_chars=len(text))
        while True:
            if there("fail-" + request):
                raise RPCError(read("fail-" + request).strip(), submission="submitted")
            if there("answer-" + request):
                break
            if cancelled.is_set():
                confirmed = not there("unconfirmed")
                note(event="interrupted", request_id=request, confirmed=confirmed)
                raise RPCError("cancelled" if confirmed else "cancellation_uncertain", submission="submitted")
            await asyncio.sleep(0.005)
        return {"text": read("answer-" + request), "model": model, "thread_id": "thread-synthetic", "turn_id": "turn-synthetic"}

    async def interrupt(self):
        return not there("unconfirmed")

    async def close(self):
        self.terminal.set()


async def main():
    loop = asyncio.get_running_loop()
    lines = asyncio.Queue()

    def reader():
        rest = b""
        while True:
            chunk = os.read(0, 1 << 20)
            if not chunk:
                loop.call_soon_threadsafe(lines.put_nowait, b"")  # the end of the input ends the stream
                return
            rest += chunk
            while b"\n" in rest:
                line, rest = rest.split(b"\n", 1)
                loop.call_soon_threadsafe(lines.put_nowait, line + b"\n")

    threading.Thread(target=reader, daemon=True).start()

    def emit(value):
        os.write(1, json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8") + b"\n")

    await run_stream(lines.get, emit, Provider())


asyncio.run(main())
