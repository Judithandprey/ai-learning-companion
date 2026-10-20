"""QA-SUB-09/10: transport facts and outcomes over the synthetic RPC child.

Uses production bridges and private child pipes, never accounts or inference.
"""

import asyncio
import json

import pytest

from services.worker.connectors import chatgpt_local as local
from services.worker.connectors.tests.test_chatgpt_live_stream import envelope, live_turn, start_params
from services.worker.connectors.tests.test_chatgpt_local import ask_request, response, rpc_stream
from services.worker.connectors.tests.test_chatgpt_rpc import MODEL, requests


async def submit(stream, version, request):
    if version == local.LIVE_VERSION:
        stream.send(envelope(version, "start", "companion/start", start_params()))
        assert "result" in await response(stream, "start")
        stream.send(envelope(version, "ask", "companion/turn", live_turn(request)))
    else:
        stream.send(envelope(version, "ask", "ask/start", {"request": request, "model": MODEL}))


async def finalized(stream):
    async with asyncio.timeout(3):
        while not stream.receipts or stream.receipts[-1]["outcome"] == "pending":
            if stream.task.done():
                await stream.task
                pytest.fail("stream ended before finalizing its admitted request")
            await asyncio.sleep(.005)


def ask_replies(stream):
    return [row for row in stream.emitted if row.get("id") == "ask"]


def assert_private_failure(stream, outcome, terminal, submission="submitted"):
    receipt = stream.receipts[-1]
    assert receipt["outcome"] == outcome
    assert receipt["terminal_status"] == terminal
    assert stream.client.request_submission() == submission
    assert receipt["submission"] in ({"written", "acknowledged"} if submission == "submitted"
                                      else {"uncertain"})
    assert stream.learning.bound == []
    assert not any("result" in row for row in ask_replies(stream))
    assert "TOKEN-secret" not in json.dumps(stream.emitted + stream.receipts)


@pytest.mark.parametrize("version", [local.VERSION, local.LIVE_VERSION])
@pytest.mark.parametrize("mode", ["commentary", "empty", "summary_only"])
def test_completed_without_usable_answer_keeps_private_reason_and_public_failure(
        tmp_path, ask_request, version, mode):
    async def run():
        async with rpc_stream(tmp_path, mode) as stream:
            if version == local.LIVE_VERSION:
                stream.send(envelope(version, "start", "companion/start", start_params()))
                assert "result" in await response(stream, "start")
                turn = live_turn(ask_request)
                turn.update(trigger="observation", allowed_assistance="none", presentation="none", focus=None)
                stream.send(envelope(version, "ask", "companion/turn", turn))
            else:
                await submit(stream, version, ask_request)
            reply = await response(stream, "ask")
            assert reply["error"]["code"] == "failed" and "result" not in reply
            if version == local.LIVE_VERSION:
                assert reply["error"]["submission"] == "submitted"
            await finalized(stream)
            assert_private_failure(stream, "failed", "completed")
            receipt = stream.receipts[-1]
            assert receipt["failure_code"] == "incomplete_turn"
            assert receipt["terminal_items_view"] == ("summary" if mode == "summary_only" else "full")
            assert receipt["completed_commentary_count"] == int(mode == "commentary")
            assert receipt["answer_selection"] == "none"
            assert "Not final." not in json.dumps(stream.emitted + stream.receipts)
            assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1
            if version == local.LIVE_VERSION:
                turn["request_id"] = "explicit-after-failure"
                stream.send(envelope(version, "late", "companion/turn", turn))
                assert (await response(stream, "late"))["error"] == {
                    "code": "session_stopped", "submission": "not_submitted"}
                assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1
    asyncio.run(run())


def test_live_binding_failure_is_diagnosed_after_completed_nonempty_answer(
        tmp_path, ask_request, monkeypatch):
    from services.learning import live_session

    def invalid_binding(*args, **kwargs):
        raise ValueError("SYNTHETIC PRIVATE BINDING CONTENT")

    monkeypatch.setattr(live_session, "bind_live_session_response", invalid_binding)

    async def run():
        async with rpc_stream(tmp_path) as stream:
            await submit(stream, local.LIVE_VERSION, ask_request)
            assert (await response(stream, "ask"))["error"] == {
                "code": "stale_context", "submission": "submitted"}
            await finalized(stream)
            receipt = stream.receipts[-1]
            assert receipt["outcome"] == "failed" and receipt["terminal_status"] == "completed"
            assert receipt["failure_code"] == "stale_context"
            assert receipt["completed_final_answer_count"] == 1
            assert receipt["answer_selection"] == "final_answer" and receipt["answer_text_state"] == "nonempty"
            assert not any("result" in row for row in ask_replies(stream))
            assert "PRIVATE" not in json.dumps(stream.emitted + stream.receipts)
            assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1
    asyncio.run(run())


def test_internal_live_shutdown_does_not_invent_cancellation_cause():
    from services.worker.connectors.tests.test_chatgpt_live import bridge, turn

    async def run():
        async with bridge() as c:
            recorded = []
            c.client.finish_request = lambda outcome, *, failure_code=None: recorded.append((outcome, failure_code))
            c.client.release.clear()
            await c.send("companion/turn", turn())
            await asyncio.wait_for(c.client.sent.wait(), 2)
            c.client.terminal.set()
            await c.bridge.close(terminal_failure=True)
            assert recorded == [("uncertain", None)]
    asyncio.run(run())


def test_internal_legacy_retirement_does_not_invent_cancellation_cause(ask_request):
    from services.worker.connectors.tests.test_chatgpt_local import fixture_bridge, message, MODEL

    async def run():
        c = await fixture_bridge()
        recorded = []
        c.client.finish_request = lambda outcome, *, failure_code=None: recorded.append((outcome, failure_code))
        try:
            c.client.allow_send.set()
            await c.bridge.handle(message("ask/start", {"request": ask_request, "model": MODEL}))
            await asyncio.wait_for(c.client.sent.wait(), 2)
            c.bridge._retire()
            await c.bridge.close(terminal_failure=True)
            assert recorded == [("uncertain", None)]
        finally:
            await c.bridge.close()
    asyncio.run(run())


@pytest.mark.parametrize("version", [local.VERSION, local.LIVE_VERSION])
@pytest.mark.parametrize("mode,terminal,code,outcome", [
    ("hang", "interrupted", "failed", "uncertain"),
    ("ignore_interrupt", None, "failed", "uncertain"),
    ("late_complete", "completed", "failed", "uncertain"),
    ("disconnect", None, "unavailable", "uncertain"),
    # A generic JSON-RPC error does not prove that inference never began.
    ("start_error", None, "failed", "uncertain"),
    # willRetry=true supplies a cause, not a terminal completion receipt.
    ("structured_error_notification", None, "allowance_exhausted", "uncertain"),
    ("structured_error_terminal", "failed", "allowance_exhausted", "failed"),
])
def test_actual_rpc_failures_keep_submission_cause_and_outcome_distinct(
        tmp_path, ask_request, version, mode, terminal, code, outcome):
    async def run():
        async with rpc_stream(tmp_path, mode) as stream:
            stream.client.env["ERROR_INFO"] = json.dumps("usageLimitExceeded")
            stream.client.turn_timeout = .04
            await submit(stream, version, ask_request)
            if version == local.VERSION and outcome == "uncertain":
                # V1 has no independent unknown-outcome field. EOF is its
                # existing uncertainty signal; do not invent a known refusal.
                await asyncio.wait_for(asyncio.shield(stream.task), 3)
                assert ask_replies(stream) == []
                assert stream.client._process.returncode is not None
            else:
                reply = await response(stream, "ask")
                expected = ({"code": code, "submission": "submitted"} if version == local.LIVE_VERSION
                            else {"code": "quota", "message": local.ERRORS["quota"]})
                assert reply == {"id": "ask", "error": expected}
            await finalized(stream)
            assert_private_failure(stream, outcome, terminal)
            assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1
            assert len(ask_replies(stream)) == int(version == local.LIVE_VERSION or outcome == "failed")
            # Give queued work a chance to run: no late answer, replay or retry.
            await asyncio.sleep(.02)
            assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1
            assert_private_failure(stream, outcome, terminal)

    asyncio.run(run())


def test_signed_out_ask_is_not_submitted_even_after_entering_provider_preflight(tmp_path, ask_request):
    async def run():
        async with rpc_stream(tmp_path, "signed_out") as stream:
            await submit(stream, local.VERSION, ask_request)
            assert (await response(stream, "ask"))["error"] == {
                "code": "unauthenticated", "message": local.ERRORS["unauthenticated"]}
            await finalized(stream)
            receipt = stream.receipts[-1]
            assert receipt["outcome"] == receipt["submission"] == "not_submitted"
            assert stream.client.request_submission() == "not_submitted"
            assert receipt["terminal_status"] is None
            assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(stream.client))
            assert stream.learning.bound == [] and not stream.client.terminal.is_set()

    asyncio.run(run())


@pytest.mark.parametrize("version", [local.VERSION, local.LIVE_VERSION])
def test_turn_write_failure_preserves_unknown_transport_without_fake_ack(tmp_path, ask_request, version):
    async def run():
        async with rpc_stream(tmp_path) as stream:
            original_send = stream.client._send

            async def send(message, **kwargs):
                writer = stream.client._process.stdin
                original_write = writer.write

                def fail_write(_encoded):
                    raise BrokenPipeError("TOKEN-secret synthetic write failure")

                if message.get("method") == "turn/start":
                    writer.write = fail_write
                try:
                    return await original_send(message, **kwargs)
                finally:
                    writer.write = original_write

            stream.client._send = send
            await submit(stream, version, ask_request)
            if version == local.VERSION:
                await asyncio.wait_for(asyncio.shield(stream.task), 3)
                assert ask_replies(stream) == []
            else:
                assert await response(stream, "ask") == {
                    "id": "ask", "error": {"code": "unavailable", "submission": "unknown"}}
            await finalized(stream)
            assert_private_failure(stream, "uncertain", None, "unknown")
            assert stream.receipts[-1]["turn_start_count"] == 0
            assert not any(row.get("method") == "turn/start" for row in requests(stream.client))

    asyncio.run(run())


@pytest.mark.parametrize("version,mode,internal_code,public_code", [
    (local.VERSION, "structured_error_notification", "quota_exhausted", "allowance_exhausted"),
    (local.LIVE_VERSION, "structured_error_notification", "quota_exhausted", "allowance_exhausted"),
    (local.LIVE_VERSION, "ignore_interrupt", "outcome_unknown", "failed"),
])
def test_terminal_grace_expiry_keeps_typed_cause_and_uncertain_receipt(
        tmp_path, ask_request, monkeypatch, version, mode, internal_code, public_code):
    monkeypatch.setattr(local, "TERMINAL_REPLY_SECONDS", .01)

    async def run():
        async with rpc_stream(tmp_path, mode) as stream:
            stream.client.env["ERROR_INFO"] = json.dumps("usageLimitExceeded")
            stream.client.turn_timeout = .04
            original_close = stream.client.close
            close_started = asyncio.Event()
            close_calls = 0

            async def slow_close():
                nonlocal close_calls
                close_calls += 1
                if close_calls == 1:
                    close_started.set()
                    # Delay the first owned-child cleanup beyond the reply
                    # grace. The outer owner must recover the retained error
                    # before cancelling that task and completing cleanup.
                    await asyncio.sleep(.1)
                await original_close()

            stream.client.close = slow_close
            await submit(stream, version, ask_request)
            await asyncio.wait_for(close_started.wait(), 2)
            await asyncio.wait_for(asyncio.shield(stream.task), 3)
            assert close_calls >= 2 and stream.client._process.returncode is not None
            failure = stream.client.request_failure()
            assert failure.__traceback__ is None  # Retained facts must not hold prompt/image stack frames.
            assert failure.code == internal_code and failure.outcome == "uncertain"
            assert failure.submission == "submitted"
            expected = [] if version == local.VERSION else [
                {"id": "ask", "error": {"code": public_code, "submission": "submitted"}}]
            assert ask_replies(stream) == expected
            assert_private_failure(stream, "uncertain", None)
            assert sum(row.get("method") == "turn/start" for row in requests(stream.client)) == 1

    asyncio.run(run())
