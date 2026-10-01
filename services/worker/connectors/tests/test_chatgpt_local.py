"""Private ASK IPC/lifecycle controls over synthetic Learning and RPC seams.

No account, real Codex child, provider inference or entitlement acceptance is
performed. Generated answers and provenance fixtures are deliberately synthetic.
"""

import asyncio
import base64
from contextlib import asynccontextmanager
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
from types import SimpleNamespace

import pytest

from services.api.tests.test_image_resolver import png


VERSION = "lc-subscription-ask/1"
PRIVATE = "SYNTHETIC-PRIVATE-TOKEN-DO-NOT-ECHO"
MODEL = "synthetic-image-model"


@pytest.fixture
def ask_request():
    data = png()
    return {
        "request_id": "request-one", "question": "Give one hint about this selected diagram.",
        "assistance": "hint",
        "image": {"png_base64": base64.b64encode(data).decode("ascii"),
                  "sha256": hashlib.sha256(data).hexdigest(), "width": 2, "height": 2},
        "context": {
            "capture_session_id": "capture-one", "frame_seq": 1,
            "frame_captured_at": "2026-10-01T12:00:00Z", "frame_width": 200, "frame_height": 100,
            "display": {"id": "synthetic-display", "bounds": {"x": 0, "y": 0, "width": 200, "height": 100},
                        "scale_factor": 1},
            "region_dip": {"x": 10, "y": 12, "width": 2, "height": 2},
            "region_px": {"x": 10, "y": 12, "width": 2, "height": 2},
            "ink_revision": 3, "ink_sha256": hashlib.sha256(b"synthetic editable ink").hexdigest(),
            "source_url": None, "source_version": None, "media_position": None,
        },
    }


def message(method, params=None, *, request_id="outer-one"):
    return {"version": VERSION, "id": request_id, "method": method, "params": params or {}}


class LearningSpy:
    """Seam contract only: the real Learning owner validates PNG/provenance."""

    def __init__(self):
        self.prepared = []
        self.bound = []

    def prepare(self, request):
        self.prepared.append(deepcopy(request))
        return {"text": "SYNTHETIC hint-only prompt", "image_bytes": base64.b64decode(request["image"]["png_base64"]),
                "provenance": {"request_id": request["request_id"], "question": request["question"],
                               "image": {name: request["image"][name] for name in ("sha256", "width", "height")},
                               "context": deepcopy(request["context"]), "assistance": request["assistance"]}}

    def bind(self, prepared, text, **details):
        self.bound.append((deepcopy(prepared), text, deepcopy(details)))
        return {"request_id": prepared["provenance"]["request_id"], "text": text,
                "provenance": deepcopy(prepared["provenance"]), **details}


class FakeClient:
    """No transport: deterministic boundaries of the documented inner seam."""

    def __init__(self):
        self.calls = []
        self.on_event = None
        self.entered = asyncio.Event()
        self.allow_send = asyncio.Event()
        self.sent = asyncio.Event()
        self.complete = asyncio.Event()
        self.terminal = asyncio.Event()
        self.started = False
        self.closed = False
        self.ignore_cancel = False
        self.failure = None
        self.status = {
            "auth": {"state": "signed_in", "mode": "chatgpt", "plan": "plus"},
            "rate_limits": [{"label": "codex", "used_percent": 35, "resets_at": "2026-09-30T20:00:00Z"}],
            "models": [{"id": MODEL, "label": "Synthetic model", "image_input": True, "default": True}],
        }

    async def start(self):
        self.calls.append(("start",))
        self.started = True

    async def connection_read(self):
        self.calls.append(("connection_read",))
        return deepcopy(self.status)

    async def login_start(self):
        self.calls.append(("login_start",))
        return {"login_id": "owned-login", "auth_url": "https://auth.openai.com/synthetic-test-login"}

    async def login_cancel(self, login_id):
        self.calls.append(("login_cancel", login_id))
        return {}

    async def ask(self, text, image_bytes, *, model, cancelled):
        self.calls.append(("ask", text, image_bytes, model))
        self.cancelled = cancelled
        self.entered.set()
        await self.allow_send.wait()
        if cancelled.is_set() and not self.ignore_cancel:
            raise asyncio.CancelledError
        self.calls.append(("turn/start",))
        self.sent.set()
        await self.complete.wait()
        if self.failure is not None:
            raise self.failure
        return {"text": "SYNTHETIC completed hint", "model": model,
                "thread_id": "synthetic-thread", "turn_id": "synthetic-turn"}

    async def interrupt(self):
        self.calls.append(("interrupt",))
        return True

    async def close(self):
        self.calls.append(("close",))
        self.closed = True
        self.terminal.set()


async def fixture_bridge():
    from services.worker.connectors import chatgpt_local

    emitted, queue = [], asyncio.Queue()
    fake, learning = FakeClient(), LearningSpy()

    def emit(value):
        emitted.append(deepcopy(value))
        queue.put_nowait(value)

    bridge = chatgpt_local.SubscriptionBridge(fake, emit=emit, prepare=learning.prepare, bind=learning.bind)
    return SimpleNamespace(bridge=bridge, client=fake, learning=learning, emitted=emitted, queue=queue)


async def response(c, request_id):
    while True:
        for item in c.emitted:
            if item.get("id") == request_id:
                return item
        item = await asyncio.wait_for(c.queue.get(), 2)
        if item.get("id") == request_id:
            return item


def assert_closed_error(value, request_id, code=None):
    assert set(value) == {"id", "error"}
    assert value["id"] == request_id
    assert set(value["error"]) == {"code", "message"}
    assert isinstance(value["error"]["message"], str)
    if code is not None:
        assert value["error"]["code"] == code
    assert PRIVATE not in json.dumps(value)


def test_completed_ask_uses_exact_prepared_pixels_and_bound_provenance(ask_request):
    async def run():
        c = await fixture_bridge()
        original = deepcopy(ask_request)
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.entered.wait(), 2)
            assert c.emitted == [] and c.learning.bound == []
            c.client.allow_send.set()
            await asyncio.wait_for(c.client.sent.wait(), 2)
            assert c.emitted == []
            c.client.complete.set()
            completed = await response(c, "outer-one")
            assert set(completed) == {"id", "result"}
            result = completed["result"]
            assert result["request_id"] == ask_request["request_id"]
            assert result["text"] == "SYNTHETIC completed hint"
            assert result["model"] == MODEL and result["auth_mode"] == "chatgpt"
            assert result["thread_id"] == "synthetic-thread" and result["turn_id"] == "synthetic-turn"
            assert type(result["latency_ms"]) in (int, float) and result["latency_ms"] >= 0
            assert result["provenance"]["context"] == ask_request["context"]
            assert result["provenance"]["image"]["sha256"] == ask_request["image"]["sha256"]
            assert c.learning.prepared == [original] and len(c.learning.bound) == 1
            assert [call for call in c.client.calls if call[0] == "ask"] == [
                ("ask", "SYNTHETIC hint-only prompt", png(), MODEL)]
            assert ask_request == original
        finally:
            await c.bridge.close()
        assert c.client.closed

    asyncio.run(run())


def test_receipt_binding_records_eof_before_reserved_ask_coroutine_runs(ask_request):
    async def run():
        c = await fixture_bridge()
        receipts = []
        c.client.begin_request = lambda request_id: receipts.append(("begin", request_id))
        c.client.finish_request = lambda outcome: receipts.append(("finish", outcome))
        await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
        await c.bridge.close()
        assert receipts == [("begin", ask_request["request_id"]), ("finish", "cancelled")]
        assert c.learning.prepared == [] and c.learning.bound == []
        assert not any(call[0] in ("ask", "turn/start") for call in c.client.calls)

    asyncio.run(run())


@pytest.mark.parametrize("mode,outcome,terminal", [("hang", "uncertain", False),
    ("ignore_interrupt", "uncertain", True), ("late_complete", "uncertain", False),
    ("start_error", "failed", True)])
def test_real_rpc_cleanup_does_not_report_user_cancellation(tmp_path, ask_request, mode, outcome, terminal):
    from services.worker.connectors.chatgpt_local import SubscriptionBridge
    from services.worker.connectors.tests.test_chatgpt_rpc import client, requests, MODEL as rpc_model

    async def run():
        receipts, emitted = [], []
        rpc = client(tmp_path, mode, isolation_verified=True, on_receipt=receipts.append)
        learning = LearningSpy()
        bridge = SubscriptionBridge(rpc, emit=emitted.append, prepare=learning.prepare, bind=learning.bind)
        try:
            await rpc.start()
            await bridge.handle(message("ask/start", {"request": ask_request, "model": rpc_model}))
            active = bridge.active
            await asyncio.wait_for(active.task, 3)
            assert active.cancelled.is_set() is False
            assert rpc.terminal.is_set() is terminal
            if terminal:
                assert emitted == [], "the terminal outer pipe reports a lost, uncertain request"
            else:
                assert len(emitted) == 1
                assert_closed_error(emitted[0], "outer-one", "failed")
            assert receipts[-1]["outcome"] == outcome
            assert receipts[-1]["turn_start_count"] == 1
            assert sum(row.get("method") == "turn/start" for row in requests(rpc)) == 1
            assert learning.bound == []
        finally:
            await bridge.close()
        assert rpc._process.returncode is not None

    asyncio.run(run())


def test_receipt_write_failure_prevents_ask_submission(ask_request):
    async def run():
        c = await fixture_bridge()

        def refuse(_request_id):
            raise RuntimeError(PRIVATE)

        c.client.begin_request = refuse
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            assert_closed_error(await response(c, "outer-one"), "outer-one", "unavailable")
            assert c.client.calls == [] and c.learning.prepared == []
            assert c.bridge.active is None
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_one_active_ask_is_reserved_before_background_work_runs(ask_request):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            other = {**ask_request, "request_id": "request-two"}
            await c.bridge.handle(message("ask/start", {"request": other, "model": MODEL}, request_id="outer-two"))
            assert_closed_error(await response(c, "outer-two"), "outer-two", "busy")
            await asyncio.wait_for(c.client.entered.wait(), 2)
            assert len([call for call in c.client.calls if call[0] == "ask"]) == 1
            c.client.allow_send.set()
            c.client.complete.set()
            assert "result" in await response(c, "outer-one")
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_cancel_before_scheduled_work_prevents_prepare_and_submission(ask_request):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await c.bridge.handle(message("ask/cancel", {"request_id": ask_request["request_id"]}, request_id="cancel"))
            await response(c, "cancel")
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            assert c.learning.prepared == [] and c.learning.bound == []
            assert not any(call[0] in ("ask", "turn/start") for call in c.client.calls)
        finally:
            await c.bridge.close()

    asyncio.run(run())


@pytest.mark.parametrize("sent", [False, True], ids=["before-turn-start", "after-turn-start"])
def test_cancel_fences_pending_send_and_suppresses_late_completion(ask_request, sent):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.entered.wait(), 2)
            if sent:
                c.client.ignore_cancel = True  # A late provider completion cannot grant presentation.
                c.client.allow_send.set()
                await asyncio.wait_for(c.client.sent.wait(), 2)
            await c.bridge.handle(message("ask/cancel", {"request_id": ask_request["request_id"]}, request_id="cancel"))
            assert c.client.cancelled.is_set(), "invalidation must precede provider interruption"
            c.client.allow_send.set()
            c.client.complete.set()
            await response(c, "cancel")
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            assert c.learning.bound == []
            assert len([call for call in c.client.calls if call[0] == "turn/start"]) == int(sent)
        finally:
            await c.bridge.close()
        assert len([value for value in c.emitted if value.get("id") == "outer-one"]) == 1

    asyncio.run(run())


def test_unknown_cancel_does_not_cancel_or_submit_the_active_request(ask_request):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.entered.wait(), 2)
            await c.bridge.handle(message("ask/cancel", {"request_id": "not-owned"}, request_id="unknown-cancel"))
            assert (await response(c, "unknown-cancel"))["result"] == {"cancelled": False, "uncertain": False}
            assert not c.client.cancelled.is_set()
            assert not any(call[0] == "interrupt" for call in c.client.calls)
            c.client.allow_send.set()
            c.client.complete.set()
            assert "result" in await response(c, "outer-one")
            assert len([call for call in c.client.calls if call[0] == "ask"]) == 1
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_session_stop_is_permanent_and_different_explicit_session_can_ask(ask_request):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.entered.wait(), 2)
            await c.bridge.handle(message("session/stop", {"capture_session_id": "capture-one"}, request_id="stop"))
            assert c.client.cancelled.is_set()
            c.client.allow_send.set()
            c.client.complete.set()
            assert (await response(c, "stop"))["result"] == {}
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            again = {**ask_request, "request_id": "request-after-stop"}
            await c.bridge.handle(message("ask/start", {"request": again, "model": MODEL}, request_id="after-stop"))
            assert_closed_error(await response(c, "after-stop"), "after-stop", "session_stopped")
            later = deepcopy(again)
            later["request_id"] = "different-session-request"
            later["context"]["capture_session_id"] = "explicit-later-session"
            await c.bridge.handle(message("ask/start", {"request": later, "model": MODEL}, request_id="later-session"))
            assert (await response(c, "later-session"))["result"]["request_id"] == later["request_id"]
            await c.bridge.handle(message("ask/start", {"request": again, "model": MODEL}, request_id="old-session-again"))
            assert_closed_error(await response(c, "old-session-again"), "old-session-again", "session_stopped")
            assert len([call for call in c.client.calls if call[0] == "ask"]) == 2
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_uncertain_inference_failure_is_not_retried_or_bound_as_a_completion(ask_request):
    async def run():
        c = await fixture_bridge()
        c.client.failure = RuntimeError(PRIVATE + " raw RPC dump")
        c.client.allow_send.set()
        c.client.complete.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            assert_closed_error(await response(c, "outer-one"), "outer-one")
            assert c.learning.bound == []
        finally:
            await c.bridge.close()
        assert len([call for call in c.client.calls if call[0] == "ask"]) == 1
        assert len([call for call in c.client.calls if call[0] == "turn/start"]) == 1
        assert PRIVATE not in json.dumps(c.emitted)

    asyncio.run(run())


@pytest.mark.parametrize("raw", [b"", b"{}", b"{}\n\n", b"{}\n{}\n", b"[]\n", b"null\n", b"\xff\n",
                                 b'{"x":NaN}\n', b'{"x":Infinity}\n', b'{"x":1,"x":2}\n',
                                 b'{"params":{"x":1,"x":1}}\n', b'{"x":"\\ud800"}\n'])
def test_parse_line_refuses_ambiguous_nonfinite_or_non_utf8_data(raw):
    from services.worker.connectors import chatgpt_local

    with pytest.raises(chatgpt_local.LocalError) as caught:
        chatgpt_local.parse_line(raw)
    assert PRIVATE not in str(caught.value)


def test_line_boundary_includes_lf_and_retains_exact_json_content():
    from services.worker.connectors import chatgpt_local

    raw = json.dumps(message("connection/read"), separators=(",", ":")).encode() + b"\n"
    assert chatgpt_local.MAX_LINE_BYTES == 12 * 1024 * 1024
    padded = b" " * (chatgpt_local.MAX_LINE_BYTES - len(raw)) + raw
    assert chatgpt_local.parse_line(padded) == message("connection/read")
    with pytest.raises(chatgpt_local.LocalError) as caught:
        chatgpt_local.parse_line(b" " + padded)
    assert caught.value.code == "invalid_request"


@pytest.mark.parametrize("change", ["missing-version", "wrong-version", "unknown-key", "unsafe-id", "wrong-params",
                                    "unknown-method", "non-object"])
def test_bad_outer_envelopes_never_reach_client_or_learning(change):
    async def run():
        c = await fixture_bridge()
        body = message("connection/read")
        code, expected_id = "invalid_request", "outer-one"
        if change == "missing-version":
            del body["version"]
        elif change == "wrong-version":
            body["version"] = "future-subscription/2"
        elif change == "unknown-key":
            body["credentials"] = PRIVATE
        elif change == "unsafe-id":
            body["id"] = "\n" + PRIVATE
            expected_id = None
        elif change == "wrong-params":
            body["params"] = []
        elif change == "unknown-method":
            body["method"] = "account/logout"
        else:
            body = []
            expected_id = None
        try:
            await c.bridge.handle(body)
            assert_closed_error(await response(c, expected_id), expected_id, code)
            assert c.client.calls == [] and c.learning.prepared == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_preparation_refusal_withholds_submission_and_redacts_validation_details(ask_request):
    async def run():
        c = await fixture_bridge()

        def invalid_image(_request):
            raise ValueError(PRIVATE + " synthetic oversize/corrupt image refusal")

        c.bridge.prepare = invalid_image
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            assert_closed_error(await response(c, "outer-one"), "outer-one", "invalid_request")
            assert c.client.calls == [] and c.learning.bound == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


@pytest.mark.parametrize("code,expected", [("needs_auth", "unauthenticated"), ("unsupported_model", "unsupported_model"),
                                          ("quota_exhausted", "quota"), ("outcome_unknown", "failed")])
def test_inner_refusals_stay_fixed_errors_without_automatic_retry(ask_request, code, expected):
    async def run():
        c = await fixture_bridge()
        failure = RuntimeError(PRIVATE + " raw official error")
        failure.code = code
        c.client.failure = failure
        c.client.allow_send.set()
        c.client.complete.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            assert_closed_error(await response(c, "outer-one"), "outer-one", expected)
            assert c.learning.bound == []
            assert len([call for call in c.client.calls if call[0] == "ask"]) == 1
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_connection_read_preserves_frozen_safe_account_quota_catalog_result():
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("connection/read"))
            value = await response(c, "outer-one")
            assert value == {"id": "outer-one", "result": c.client.status}
            assert set(value["result"]) == {"auth", "rate_limits", "models"}
            assert c.learning.prepared == [] and c.learning.bound == []
            assert not any(call[0] in ("ask", "turn/start") for call in c.client.calls)
        finally:
            await c.bridge.close()

    asyncio.run(run())


@pytest.mark.parametrize("success,error,expected", [(True, None, None), (False, PRIVATE, "login_failed"),
                                                    (False, "login_cancelled", "login_cancelled")])
def test_login_completion_is_owned_sanitized_and_forwarded_once(success, error, expected):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("connection/login/start"))
            assert (await response(c, "outer-one"))["result"] == {
                "login_id": "owned-login", "auth_url": "https://auth.openai.com/synthetic-test-login"}
            c.client.on_event("connection/login/completed", {"login_id": "another-client", "success": True})
            assert len(c.emitted) == 1
            event = {"login_id": "owned-login", "success": success, "error": error,
                     "email": "synthetic-private@example.invalid", "access_token": PRIVATE}
            c.client.on_event("connection/login/completed", event)
            c.client.on_event("connection/login/completed", event)
            assert c.emitted[1:] == [{"method": "connection/login/completed", "params": {
                "login_id": "owned-login", "success": success, "error": expected}}]
            assert PRIVATE not in json.dumps(c.emitted)
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_login_completed_before_start_response_is_not_lost():
    async def run():
        c = await fixture_bridge()

        async def immediately_completed():
            c.client.on_event("connection/login/completed", {"login_id": "owned-login", "success": True})
            return {"login_id": "owned-login", "auth_url": "https://auth.openai.com/synthetic-test-login"}

        c.client.login_start = immediately_completed
        try:
            await c.bridge.handle(message("connection/login/start"))
            await response(c, "outer-one")
            assert c.emitted == [
                {"id": "outer-one", "result": {"login_id": "owned-login", "auth_url": "https://auth.openai.com/synthetic-test-login"}},
                {"method": "connection/login/completed", "params": {"login_id": "owned-login", "success": True, "error": None}},
            ]
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_login_cancel_only_calls_inner_for_owned_pending_login(ask_request):
    async def run():
        c = await fixture_bridge()
        try:
            await c.bridge.handle(message("connection/login/start"))
            await response(c, "outer-one")
            await c.bridge.handle(message("connection/login/cancel", {"login_id": "another-client"}, request_id="foreign"))
            assert_closed_error(await response(c, "foreign"), "foreign", "invalid_request")
            assert not any(call[0] == "login_cancel" for call in c.client.calls)
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}, request_id="ask-during-login"))
            assert_closed_error(await response(c, "ask-during-login"), "ask-during-login", "busy")
            await c.bridge.handle(message("connection/login/cancel", {"login_id": "owned-login"}, request_id="owned"))
            assert (await response(c, "owned"))["result"] == {}
            assert [call for call in c.client.calls if call[0] == "login_cancel"] == [("login_cancel", "owned-login")]
            c.client.on_event("connection/login/completed", {"login_id": "owned-login", "success": False, "error": "login_cancelled"})
            assert c.emitted[-1]["params"]["error"] == "login_cancelled"
        finally:
            await c.bridge.close()
        assert not any(call[0] == "logout" for call in c.client.calls)

    asyncio.run(run())


def test_interrupt_uncertainty_never_unfences_presentation(ask_request):
    async def run():
        c = await fixture_bridge()

        async def failed_interrupt():
            raise RuntimeError(PRIVATE)

        c.client.interrupt = failed_interrupt
        c.client.ignore_cancel = True
        c.client.allow_send.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.sent.wait(), 2)
            await c.bridge.handle(message("ask/cancel", {"request_id": ask_request["request_id"]}, request_id="cancel"))
            cancelled = (await response(c, "cancel"))["result"]
            assert cancelled == {"cancelled": True, "uncertain": True}
            c.client.complete.set()
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            assert c.learning.bound == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_stream_eof_closes_owned_client_and_suppresses_pending_answer(ask_request):
    from services.worker.connectors import chatgpt_local

    async def run():
        client, learning, incoming, emitted = FakeClient(), LearningSpy(), asyncio.Queue(), []
        client.allow_send.set()
        task = asyncio.create_task(chatgpt_local.run_stream(incoming.get, emitted.append, client,
                                                           prepare=learning.prepare, bind=learning.bind))
        try:
            incoming.put_nowait(json.dumps(message("ask/start", {"request": ask_request, "model": MODEL})).encode() + b"\n")
            await asyncio.wait_for(client.sent.wait(), 2)
            incoming.put_nowait(b"")
            await asyncio.wait_for(task, 2)
            assert client.closed and client.cancelled.is_set()
            client.complete.set()
            assert emitted == [] and learning.bound == []
            assert [call[0] for call in client.calls] == ["start", "ask", "turn/start", "close"]
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())


@asynccontextmanager
async def rpc_stream(tmp_path, mode="success"):
    """The production bridge and RPC over the existing synthetic pipe child."""
    from services.worker.connectors import chatgpt_local
    from services.worker.connectors.tests.test_chatgpt_rpc import client

    incoming, outgoing, emitted, receipts = asyncio.Queue(), asyncio.Queue(), [], []
    rpc = client(tmp_path, mode, isolation_verified=True, on_receipt=receipts.append)
    learning, reading, read_cancelled = LearningSpy(), asyncio.Event(), asyncio.Event()

    async def read_line():
        reading.set()
        try:
            return await incoming.get()
        except asyncio.CancelledError:
            read_cancelled.set()
            raise

    def emit(value):
        emitted.append(value)
        outgoing.put_nowait(value)

    task = asyncio.create_task(chatgpt_local.run_stream(read_line, emit, rpc,
                                prepare=learning.prepare, bind=learning.bind))
    stream = SimpleNamespace(client=rpc, task=task, emitted=emitted, queue=outgoing,
                             incoming=incoming, receipts=receipts, learning=learning,
                             reading=reading, read_cancelled=read_cancelled)
    stream.send = lambda value: incoming.put_nowait(json.dumps(value).encode() + b"\n")
    try:
        yield stream
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await rpc.close()


def test_fatal_rpc_ends_stream_and_only_explicit_new_check_creates_fresh_client(tmp_path, ask_request):
    from services.worker.connectors.tests.test_chatgpt_rpc import requests, MODEL as rpc_model

    async def run():
        async with rpc_stream(tmp_path, "retry_error") as old:
            old.send(message("connection/read", request_id="first-check"))
            assert "result" in await response(old, "first-check")
            old.send(message("ask/start", {"request": ask_request, "model": rpc_model}))
            await asyncio.wait_for(asyncio.shield(old.task), 1)
            assert [row["id"] for row in old.emitted] == ["first-check"]
            assert old.read_cancelled.is_set() and old.client._process.returncode is not None
            assert old.receipts[-1]["outcome"] == "failed"
            assert old.receipts[-1]["turn_start_count"] == 1
            assert old.learning.bound == []
            before = requests(old.client)
            assert sum(row.get("method") == "turn/start" for row in before) == 1
            old.send(message("connection/read", request_id="obsolete-check"))
            await asyncio.sleep(0)
            assert requests(old.client) == before
            assert not any(row.get("id") == "obsolete-check" for row in old.emitted)
        # A new user Check creates a distinct owner. It never replays the ASK.
        async with rpc_stream(tmp_path) as new:
            new.send(message("connection/read", request_id="explicit-check"))
            checked = await response(new, "explicit-check")
            assert checked["result"]["auth"]["state"] == "signed_in"
            assert new.client._process.pid != old.client._process.pid
            assert not new.task.done()
            assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(new.client))
            assert new.receipts == []
            new.incoming.put_nowait(b"")
            await asyncio.wait_for(new.task, 1)

    asyncio.run(run())


@pytest.mark.parametrize("mode", ["init_hang", "malformed"])
@pytest.mark.parametrize("method", ["connection/read", "ask/start"])
def test_startup_failure_wakes_parent_read_and_finalizes_admitted_request(tmp_path, ask_request, mode, method):
    from services.worker.connectors.tests.test_chatgpt_rpc import requests, MODEL as rpc_model

    async def run():
        async with rpc_stream(tmp_path, mode) as c:
            params = {"request": ask_request, "model": rpc_model} if method == "ask/start" else {}
            c.send(message(method, params))
            await asyncio.wait_for(asyncio.shield(c.task), 2)
            assert c.read_cancelled.is_set() and c.client._process.returncode is not None
            assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(c.client))
            if method == "connection/read":
                assert len(c.emitted) == 1
                assert_closed_error(c.emitted[0], "outer-one", "unavailable")
                assert c.receipts == []
            else:
                assert c.emitted == []
                assert c.receipts[-1]["outcome"] == c.receipts[-1]["submission"] == "not_submitted"
                assert c.receipts[-1]["turn_start_count"] == 0

    asyncio.run(run())


def test_idle_inner_eof_closes_outer_stream_without_waiting_for_parent_input(tmp_path):
    from services.worker.connectors.tests.test_chatgpt_rpc import requests

    async def run():
        async with rpc_stream(tmp_path) as c:
            c.send(message("connection/read"))
            assert "result" in await response(c, "outer-one")
            c.client._process.terminate()  # Inject exit only into this test-owned fake.
            await asyncio.wait_for(asyncio.shield(c.task), 1)
            assert c.client._process.returncode is not None and c.read_cancelled.is_set()
            assert len(c.emitted) == 1 and c.receipts == []
            assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(c.client))

    asyncio.run(run())


@pytest.mark.parametrize("mode,code", [("failed", "failed"), ("text_only", "unsupported_model"),
                                      ("signed_out", "unauthenticated")])
def test_nonfatal_refusal_keeps_stream_usable_and_preserves_stop_and_duplicate_fences(tmp_path, ask_request, mode, code):
    from services.worker.connectors.tests.test_chatgpt_rpc import requests, MODEL as rpc_model

    async def run():
        async with rpc_stream(tmp_path, mode) as c:
            c.send(message("ask/start", {"request": ask_request, "model": rpc_model}))
            assert_closed_error(await response(c, "outer-one"), "outer-one", code)
            assert not c.task.done() and not c.client.terminal.is_set()
            before = sum(row.get("method") == "turn/start" for row in requests(c.client))
            c.send(message("ask/start", {"request": ask_request, "model": rpc_model}, request_id="duplicate"))
            assert_closed_error(await response(c, "duplicate"), "duplicate", "invalid_request")
            c.send(message("connection/read", request_id="check-again"))
            assert "result" in await response(c, "check-again")
            c.send(message("session/stop", {"capture_session_id": ask_request["context"]["capture_session_id"]},
                           request_id="stop"))
            assert (await response(c, "stop"))["result"] == {}
            c.send(message("ask/start", {"request": {**ask_request, "request_id": "after-stop"},
                                          "model": rpc_model}, request_id="after-stop"))
            assert_closed_error(await response(c, "after-stop"), "after-stop", "session_stopped")
            assert sum(row.get("method") == "turn/start" for row in requests(c.client)) == before
            c.incoming.put_nowait(b"")
            await asyncio.wait_for(c.task, 1)

    asyncio.run(run())


@pytest.mark.parametrize("mode,terminal", [("ignore_interrupt", True), ("late_complete", False)])
def test_stop_uncertainty_and_late_answer_never_resurrect_request(tmp_path, ask_request, mode, terminal):
    from services.worker.connectors.tests.test_chatgpt_rpc import requests, MODEL as rpc_model

    async def run():
        async with rpc_stream(tmp_path, mode) as c:
            c.send(message("ask/start", {"request": ask_request, "model": rpc_model}))
            async with asyncio.timeout(2):
                while not c.receipts or c.receipts[-1]["submission"] != "acknowledged":
                    await asyncio.sleep(0.005)
            c.send(message("session/stop", {"capture_session_id": ask_request["context"]["capture_session_id"]},
                           request_id="stop"))
            assert_closed_error(await response(c, "stop"), "stop", "interrupt_unconfirmed")
            if terminal:
                await asyncio.wait_for(asyncio.shield(c.task), 1)
                assert not any(row.get("id") == "outer-one" for row in c.emitted)
            else:
                assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
                assert c.receipts[-1]["terminal_status"] == "completed"
            assert c.client.terminal.is_set() is terminal
            assert c.receipts[-1]["outcome"] == "cancelled"
            assert c.learning.bound == [] and sum(row.get("method") == "turn/start" for row in requests(c.client)) == 1

    asyncio.run(run())


def test_terminal_grace_expiry_preserves_unknown_receipt_without_forging_cancel(ask_request, monkeypatch):
    from services.worker.connectors import chatgpt_local

    monkeypatch.setattr(chatgpt_local, "TERMINAL_REPLY_SECONDS", 0.01)

    async def run():
        client, learning, incoming, emitted, outcomes = FakeClient(), LearningSpy(), asyncio.Queue(), [], []
        client.allow_send.set()
        client.finish_request = outcomes.append
        task = asyncio.create_task(chatgpt_local.run_stream(incoming.get, emitted.append, client,
                                      prepare=learning.prepare, bind=learning.bind))
        try:
            incoming.put_nowait(json.dumps(message("ask/start", {"request": ask_request, "model": MODEL})).encode() + b"\n")
            await asyncio.wait_for(client.sent.wait(), 1)
            client.terminal.set()  # The submitted fake deliberately never settles.
            await asyncio.wait_for(task, 1)
            assert client.closed and not client.cancelled.is_set()
            assert outcomes == ["uncertain"] and emitted == [] and learning.bound == []
            assert not [pending for pending in asyncio.all_tasks() if pending is not asyncio.current_task()]
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())


def test_terminal_event_wins_before_its_waiter_task_resumes(monkeypatch):
    from services.worker.connectors import chatgpt_local

    async def run():
        client, incoming, emitted = FakeClient(), asyncio.Queue(), []
        incoming.put_nowait(json.dumps(message("connection/read")).encode() + b"\n")
        wait, injected = asyncio.wait, False

        async def race(*args, **kwargs):
            nonlocal injected
            result = await wait(*args, **kwargs)
            if not injected:
                injected = True
                client.terminal.set()  # Its waiter cannot resume before we return.
            return result

        monkeypatch.setattr(chatgpt_local.asyncio, "wait", race)
        await asyncio.wait_for(chatgpt_local.run_stream(incoming.get, emitted.append, client), 1)
        assert injected and client.closed and emitted == []
        assert not any(row[0] == "connection_read" for row in client.calls)

    asyncio.run(run())


@pytest.mark.parametrize("when", ["before_bind", "during_finish"])
def test_terminal_wins_answer_publication_and_receipt_finalization(ask_request, when):
    async def run():
        c = await fixture_bridge()
        outcomes = []

        def finish(outcome):
            outcomes.append(outcome)
            if when == "during_finish" and outcome == "completed":
                c.client.terminal.set()

        c.client.finish_request = finish
        c.client.allow_send.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            active = c.bridge.active
            await asyncio.wait_for(c.client.sent.wait(), 1)
            if when == "before_bind":
                c.client.terminal.set()
            c.client.complete.set()
            await asyncio.wait_for(active.task, 1)
            assert c.emitted == [] and not active.cancelled.is_set()
            assert outcomes[-1] == "failed"
            if when == "before_bind":
                assert c.learning.bound == []
            else:
                assert outcomes == ["completed", "failed"]
        finally:
            await c.bridge.close(terminal_failure=True)

    asyncio.run(run())


def test_terminal_close_before_reserved_coroutine_runs_is_not_user_cancel(ask_request):
    async def run():
        c = await fixture_bridge()
        outcomes = []
        c.client.finish_request = outcomes.append
        await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
        active = c.bridge.active
        c.client.terminal.set()
        await c.bridge.close(terminal_failure=True)
        assert outcomes == ["not_submitted"] and not active.cancelled.is_set()
        assert c.learning.prepared == c.learning.bound == c.emitted == []

    asyncio.run(run())


@pytest.mark.parametrize("raw", [b"invalid-json\n", b'{"version":"lc-subscription-ask/1"}\n',
                                 b"x" * 1025], ids=["malformed-json", "invalid-envelope", "oversized-line"])
def test_stream_protocol_refusal_never_calls_ask_and_closes_its_client(raw, monkeypatch):
    from services.worker.connectors import chatgpt_local

    monkeypatch.setattr(chatgpt_local, "MAX_LINE_BYTES", 1024)

    async def run():
        client, learning, emitted = FakeClient(), LearningSpy(), []
        lines = iter([raw, b""])

        async def read_line():
            return next(lines)

        await chatgpt_local.run_stream(read_line, emitted.append, client, prepare=learning.prepare, bind=learning.bind)
        assert client.closed and learning.prepared == [] and learning.bound == []
        calls = [call[0] for call in client.calls]
        # Concurrent initialization can be cancelled before it begins.
        assert calls in (["close"], ["start", "close"])
        assert len(emitted) == 1
        assert_closed_error(emitted[0], None, "invalid_request")

    asyncio.run(run())


def test_close_deadline_does_not_wait_forever_on_a_nonresponsive_client(monkeypatch):
    from services.worker.connectors import chatgpt_local

    monkeypatch.setattr(chatgpt_local, "SHUTDOWN_SECONDS", 0.05)

    async def run():
        c = await fixture_bridge()
        interrupted = asyncio.Event()

        async def blocked_close():
            try:
                await asyncio.Event().wait()
            finally:
                interrupted.set()

        c.client.close = blocked_close
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(c.bridge.close(), 1)
        assert interrupted.is_set() and c.bridge.closed
        await c.bridge.handle(message("connection/read"))
        assert_closed_error(await response(c, "outer-one"), "outer-one", "unavailable")

    asyncio.run(run())


def test_eof_during_initialize_does_not_wait_for_provider_readiness():
    from services.worker.connectors import chatgpt_local

    async def run():
        client = FakeClient()
        initializing, cancelled = asyncio.Event(), asyncio.Event()

        async def blocked_start():
            initializing.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        async def eof():
            await initializing.wait()
            return b""

        client.start = blocked_start
        emitted = []
        await asyncio.wait_for(chatgpt_local.run_stream(eof, emitted.append, client), 1)
        assert cancelled.is_set() and client.closed and emitted == []

    asyncio.run(run())


def test_identifiers_allow_bounded_unicode_but_no_control_characters(ask_request):
    from services.worker.connectors import chatgpt_local

    assert chatgpt_local.identifier("外部/请求 1")
    assert chatgpt_local.identifier("é" * 128)
    for bad in ("", "é" * 129, "contains\x00null", "tab\t", "del\x7f", "c1\x85", True, 7):
        assert not chatgpt_local.identifier(bad)


def test_outgoing_limit_refuses_without_truncating_json_or_exposing_payload():
    from services.worker.connectors import chatgpt_local

    assert chatgpt_local.MAX_OUTPUT_BYTES == 256 * 1024
    overhead = len(chatgpt_local.encode_line({"text": ""}))
    exact = {"text": "x" * (chatgpt_local.MAX_OUTPUT_BYTES - overhead)}
    result = chatgpt_local.encode_line(exact)
    assert len(result) == chatgpt_local.MAX_OUTPUT_BYTES and json.loads(result) == exact
    with pytest.raises(chatgpt_local.LocalError):
        chatgpt_local.encode_line({"text": exact["text"] + PRIVATE})


def _fake_stream_child(report_path):
    """Foreground test process and its own inert pipe child; never real Codex."""
    from services.worker.connectors import chatgpt_launch, chatgpt_local

    class PipeClient(FakeClient):
        async def start(self):
            await super().start()
            self.process = await asyncio.create_subprocess_exec(
                sys.executable, "-c", "import sys; sys.stdin.buffer.read()",
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )

        async def close(self):
            if hasattr(self, "process"):
                self.process.stdin.close()
                try:
                    await asyncio.wait_for(self.process.wait(), 1)
                except TimeoutError:
                    self.process.kill()
                    await self.process.wait()
                Path(report_path).write_text(json.dumps({"child_reaped": self.process.returncode is not None}))
            await super().close()

    @asynccontextmanager
    async def fake_factory():
        yield PipeClient()

    chatgpt_launch.create_client = fake_factory
    sys.argv = ["synthetic-chatgpt-local"]
    raise SystemExit(chatgpt_local.main())


def test_actual_private_pipe_handshake_then_eof_reaps_only_test_owned_child(tmp_path):
    root = Path(__file__).resolve().parents[4]
    report = tmp_path / "fake-child-close.json"
    bootstrap = ("from services.worker.connectors.tests.test_chatgpt_local import _fake_stream_child; "
                 "import sys; _fake_stream_child(sys.argv[1])")
    process = subprocess.Popen([sys.executable, "-u", "-c", bootstrap, str(report)], cwd=root,
                               env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        process.stdin.write(json.dumps(message("connection/read")).encode() + b"\n")
        process.stdin.flush()
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
        line = lines.get(timeout=5)
        decoded = json.loads(line)
        assert set(decoded) == {"id", "result"} and decoded["id"] == "outer-one"
        assert decoded["result"]["auth"]["mode"] == "chatgpt"
        process.stdin.close()
        process.stdin = None
        stdout, stderr = process.communicate(timeout=5)
        assert process.returncode == 0 and stdout == stderr == b""
        assert json.loads(report.read_text()) == {"child_reaped": True}
    finally:
        if process.stdin is not None:
            process.stdin.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=3)
        process.stdout.close()
        process.stderr.close()


def _fatal_rpc_stream_child(report_path):
    """Run the foreground entrypoint with only a test-owned synthetic RPC child."""
    from services.worker.connectors import chatgpt_launch, chatgpt_local
    from services.worker.connectors.tests.test_chatgpt_rpc import client, requests

    @asynccontextmanager
    async def fake_factory():
        receipts = []
        rpc = client(Path(report_path).parent, "retry_error", isolation_verified=True,
                     on_receipt=receipts.append)
        try:
            yield rpc
        finally:
            await rpc.close()
            Path(report_path).write_text(json.dumps({
                "child_reaped": rpc._process is not None and rpc._process.returncode is not None,
                "turn_starts": sum(row.get("method") == "turn/start" for row in requests(rpc)),
                "outcome": receipts[-1]["outcome"] if receipts else None,
            }))

    chatgpt_launch.create_client = fake_factory
    sys.argv = ["synthetic-chatgpt-local"]
    raise SystemExit(chatgpt_local.main())


def test_fatal_inner_child_closes_real_outer_pipe_with_parent_still_open(tmp_path, ask_request):
    from services.worker.connectors.tests.test_chatgpt_rpc import MODEL as rpc_model

    root = Path(__file__).resolve().parents[4]
    report = tmp_path / "terminal-child-close.json"
    bootstrap = ("from services.worker.connectors.tests.test_chatgpt_local import _fatal_rpc_stream_child; "
                 "import sys; _fatal_rpc_stream_child(sys.argv[1])")
    process = subprocess.Popen([sys.executable, "-u", "-c", bootstrap, str(report)], cwd=root,
                               env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    lines = queue.Queue()

    def read_output():
        for line in process.stdout:
            lines.put(line)
        lines.put(b"")

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    try:
        process.stdin.write(json.dumps(message("connection/read")).encode() + b"\n")
        process.stdin.flush()
        assert json.loads(lines.get(timeout=5))["result"]["auth"]["state"] == "signed_in"
        process.stdin.write(json.dumps(message("ask/start", {"request": ask_request, "model": rpc_model},
                                              request_id="fatal-ask")).encode() + b"\n")
        process.stdin.flush()
        assert lines.get(timeout=5) == b"", "terminal ASK must end the pipe, not claim a known refusal"
        assert not process.stdin.closed
        assert process.wait(timeout=5) == 0
        assert process.stderr.read() == b""
        assert json.loads(report.read_text()) == {"child_reaped": True, "turn_starts": 1, "outcome": "failed"}
    finally:
        process.stdin.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=3)
        reader.join(timeout=1)
        process.stdout.close()
        process.stderr.close()


def test_delayed_cancel_task_cannot_interrupt_a_later_active_request(ask_request):
    async def run():
        c = await fixture_bridge()
        held = []
        spawn = c.bridge._spawn

        def defer_interrupt(coroutine):
            if coroutine.cr_code.co_name == "_interrupt":
                held.append(coroutine)
                return None
            return spawn(coroutine)

        c.bridge._spawn = defer_interrupt
        c.client.allow_send.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.sent.wait(), 2)
            await c.bridge.handle(message("ask/cancel", {"request_id": ask_request["request_id"]}, request_id="old-cancel"))
            assert c.client.cancelled.is_set() and len(held) == 1
            c.client.complete.set()
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            c.client.complete.clear()
            c.client.entered = asyncio.Event()
            later = {**ask_request, "request_id": "request-two"}
            await c.bridge.handle(message("ask/start", {"request": later, "model": MODEL}, request_id="outer-two"))
            await asyncio.wait_for(c.client.entered.wait(), 2)
            await held.pop()
            assert not any(call[0] == "interrupt" for call in c.client.calls)
            assert not c.client.cancelled.is_set()
            # No interrupt was sent for the old turn; do not claim remote rollback.
            assert (await response(c, "old-cancel"))["result"] == {"cancelled": True, "uncertain": True}
            c.client.complete.set()
            assert (await response(c, "outer-two"))["result"]["request_id"] == "request-two"
        finally:
            for coroutine in held:
                coroutine.close()
            await c.bridge.close()

    asyncio.run(run())


def test_actual_learning_preparation_and_binding_preserve_complete_request(ask_request):
    from services.worker.connectors import chatgpt_local

    async def run():
        c = await fixture_bridge()
        c.bridge.prepare, c.bridge.bind = chatgpt_local._prepare, chatgpt_local._bind
        c.client.allow_send.set()
        c.client.complete.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            value = await response(c, "outer-one")
            expected = deepcopy(ask_request)
            del expected["image"]["png_base64"]
            assert value["result"]["provenance"] == expected
            assert value["result"]["kind"] == "generated_assistance"
            assert value["result"]["text"] == "SYNTHETIC completed hint"
            asks = [call for call in c.client.calls if call[0] == "ask"]
            assert len(asks) == 1 and asks[0][2] == png()
            assert "Allowed assistance: hint" in asks[0][1]
            assert c.learning.prepared == c.learning.bound == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


@pytest.mark.parametrize("damage", ["malformed", "oversized"])
def test_actual_learning_rejects_invalid_original_before_inner_submission(ask_request, damage):
    from services.worker.connectors import chatgpt_local

    async def run():
        c = await fixture_bridge()
        c.bridge.prepare, c.bridge.bind = chatgpt_local._prepare, chatgpt_local._bind
        data = b"not-a-PNG" if damage == "malformed" else b"x" * (8 * 1024 * 1024 + 1)
        ask_request["image"].update(png_base64=base64.b64encode(data).decode(), sha256=hashlib.sha256(data).hexdigest())
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            assert_closed_error(await response(c, "outer-one"), "outer-one", "invalid_request")
            assert c.client.calls == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


def test_cancellation_prevents_actual_learning_binding_after_preparation(ask_request):
    from services.worker.connectors import chatgpt_local

    async def run():
        c = await fixture_bridge()
        bound = []

        def bind(*args, **kwargs):
            bound.append(True)
            return chatgpt_local._bind(*args, **kwargs)

        c.bridge.prepare, c.bridge.bind = chatgpt_local._prepare, bind
        c.client.ignore_cancel = True
        c.client.allow_send.set()
        try:
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.sent.wait(), 2)
            await c.bridge.handle(message("ask/cancel", {"request_id": ask_request["request_id"]}, request_id="cancel"))
            c.client.complete.set()
            assert_closed_error(await response(c, "outer-one"), "outer-one", "cancelled")
            assert bound == []
        finally:
            await c.bridge.close()

    asyncio.run(run())


@pytest.mark.parametrize("input_kind", ["argv", "regular-file"])
def test_real_cli_refuses_non_private_launch_without_initializing_child(tmp_path, input_kind):
    root = Path(__file__).resolve().parents[4]
    command = [sys.executable, "-m", "services.worker.connectors.chatgpt_local"]
    if input_kind == "argv":
        result = subprocess.run([*command, "--help"], input=b"", capture_output=True, cwd=root, timeout=3)
    else:
        path = tmp_path / "not-a-parent-pipe.jsonl"
        path.write_text(json.dumps(message("connection/read")) + "\n")
        with path.open("rb") as stream:
            result = subprocess.run(command, stdin=stream, capture_output=True, cwd=root, timeout=3)
    assert result.returncode == 2 and result.stdout == result.stderr == b""


def test_oversized_inner_catalog_yields_fixed_error_instead_of_partial_json():
    async def run():
        c = await fixture_bridge()
        c.client.status["models"] = [{"id": PRIVATE + str(index), "label": "x" * 2000,
                                      "image_input": True, "default": False} for index in range(150)]
        try:
            await c.bridge.handle(message("connection/read"))
            assert_closed_error(await response(c, "outer-one"), "outer-one", "unavailable")
            assert len(c.emitted) == 1 and PRIVATE not in json.dumps(c.emitted)
        finally:
            await c.bridge.close()

    asyncio.run(run())
