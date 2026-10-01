"""Versioned foreground transport, using synthetic clients and private pipes only."""

import asyncio
import base64
from contextlib import asynccontextmanager, contextmanager
from copy import deepcopy
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading

import pytest

from packages.contracts.live_companion import validate
from services.worker.connectors import chatgpt_local as local
from services.worker.connectors.tests.test_chatgpt_local import FakeClient, ask_request
from services.worker.connectors.tests.test_chatgpt_rpc import MODEL, client as rpc_client, requests


class ConnectionClient(FakeClient):
    async def connection_read_live(self):
        self.calls.append(("connection_read_live",))
        return {"auth": deepcopy(self.status["auth"]), "models": deepcopy(self.status["models"]),
                "quota": {"available": False, "ordinary_usage_allowed": None, "windows": []}}


def envelope(version, request_id="one", method="connection/read", params=None):
    return {"version": version, "id": request_id, "method": method, "params": params or {}}


def line(value):
    return json.dumps(value).encode() + b"\n"


async def exchange(first, *, second=None, malformed=False):
    client, incoming, outgoing, selected = ConnectionClient(), asyncio.Queue(), asyncio.Queue(), []
    task = asyncio.create_task(local.run_stream(incoming.get, outgoing.put_nowait, client,
                                                select_version=selected.append))
    try:
        await incoming.put(line(first))
        replies = [await asyncio.wait_for(outgoing.get(), 2)]
        if second is not None or malformed:
            await incoming.put(b'{"duplicate":1,"duplicate":2}\n' if malformed else line(second))
            replies.append(await asyncio.wait_for(outgoing.get(), 2))
        await incoming.put(b"")
        await asyncio.wait_for(task, 2)
        assert client.closed
        assert not any(call[0] in ("ask", "turn/start", "login_start") for call in client.calls)
        return replies, client, selected
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize("version", [local.VERSION, local.LIVE_VERSION])
def test_one_foreground_child_uses_the_selected_connection_shape(version):
    replies, client, selected = asyncio.run(exchange(envelope(version)))
    assert selected == [version]
    result = replies[0]["result"]
    if version == local.VERSION:
        assert result == client.status
        assert set(result) == {"auth", "rate_limits", "models"}
    else:
        assert validate("Connection", result) == result
        assert set(result) == {"auth", "quota", "models"}


@pytest.mark.parametrize("version,other", [(local.VERSION, local.LIVE_VERSION),
                                           (local.LIVE_VERSION, local.VERSION)])
def test_mixed_versions_never_reinterpret_or_renegotiate_the_child(version, other):
    replies, client, selected = asyncio.run(exchange(envelope(version), second=envelope(other, "two")))
    assert selected == [version]
    assert replies[1]["error"]["code"] == "invalid_request"
    assert set(replies[1]["error"]) == ({"code", "submission"} if version == local.LIVE_VERSION else {"code", "message"})
    assert sum(call[0].startswith("connection_read") for call in client.calls) == 1


def test_malformed_live_line_has_typed_no_submission_error_and_bounded_shutdown():
    replies, _, selected = asyncio.run(exchange(envelope(local.LIVE_VERSION), malformed=True))
    assert selected == [local.LIVE_VERSION]
    assert replies[1] == {"id": None, "error": {"code": "invalid_request", "submission": "not_submitted"}}


def test_unrecognized_initial_version_closes_without_choosing_a_protocol():
    replies, client, selected = asyncio.run(exchange(envelope("unknown/version")))
    assert selected == []
    assert replies[0]["error"]["code"] == "invalid_request"
    assert not any(call[0].startswith("connection_read") for call in client.calls)


def test_live_output_bound_does_not_expand_the_legacy_pipe_bound():
    async def run():
        pipes = object.__new__(local._Pipes)
        pipes.version, pipes.output_limit = None, local.MAX_OUTPUT_BYTES
        pipes.outgoing, pipes.failed = queue.Queue(maxsize=8), asyncio.Event()
        value = {"id": "synthetic", "result": {"text": "x" * local.MAX_OUTPUT_BYTES}}
        pipes.emit(value)
        assert pipes.failed.is_set() and pipes.outgoing.empty()
        pipes.failed.clear()
        pipes.select_version(local.LIVE_VERSION)
        pipes.emit(value)
        encoded = pipes.outgoing.get_nowait()
        assert not pipes.failed.is_set() and len(encoded) > local.MAX_OUTPUT_BYTES
        assert len(encoded) <= local.MAX_LIVE_OUTPUT_BYTES
        with pytest.raises(local.LocalError):
            pipes.select_version(local.VERSION)
        pipes.emit({"result": "x" * local.MAX_LIVE_OUTPUT_BYTES})
        assert pipes.failed.is_set() and pipes.outgoing.empty()
    asyncio.run(run())


def _foreground_child(report_path, scenario):
    """Production foreground main with only its launcher replaced by a fake RPC child."""
    from services.worker.connectors import chatgpt_launch

    @asynccontextmanager
    async def fake_factory():
        if scenario == "launch_failure":
            raise RuntimeError("SYNTHETIC-PRIVATE-DO-NOT-ECHO")
        rpc = rpc_client(Path(report_path).parent, scenario, isolation_verified=True)
        if "SYNTHETIC_QUOTA" in os.environ:
            rpc.env["QUOTA_RESPONSE"] = os.environ["SYNTHETIC_QUOTA"]
        try:
            yield rpc
        finally:
            await rpc.close()
            Path(report_path).write_text(json.dumps({
                "child_reaped": rpc._process is not None and rpc._process.returncode is not None,
                "turn_starts": sum(row.get("method") == "turn/start" for row in requests(rpc)),
            }))

    chatgpt_launch.create_client = fake_factory
    sys.argv = ["synthetic-live-foreground"]
    raise SystemExit(local.main())


@contextmanager
def foreground(tmp_path, scenario="success", quota=None):
    report = tmp_path / "owned-child.json"
    bootstrap = ("from services.worker.connectors.tests.test_chatgpt_live_stream import _foreground_child; "
                 "import sys; _foreground_child(sys.argv[1], sys.argv[2])")
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    if quota is not None:
        env["SYNTHETIC_QUOTA"] = json.dumps(quota)
    process = subprocess.Popen([sys.executable, "-u", "-c", bootstrap, str(report), scenario],
        cwd=Path(__file__).resolve().parents[4], env=env,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output = queue.Queue()

    def read():
        for value in process.stdout:
            output.put(value)
        output.put(b"")

    reader = threading.Thread(target=read, daemon=True)
    reader.start()

    def send(request):
        process.stdin.write(line(request))
        process.stdin.flush()

    def receive():
        raw = output.get(timeout=8)
        assert raw, "Unexpected foreground EOF"
        assert len(raw) <= local.MAX_LIVE_OUTPUT_BYTES
        return json.loads(raw)

    try:
        yield process, send, receive, output, report
    finally:
        if process.stdin is not None:
            process.stdin.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=3)
        reader.join(timeout=1)
        process.stdout.close()
        process.stderr.close()


def live_turn(frame):
    frame = deepcopy(frame)
    frame["context"].update(frame_width=2, frame_height=2,
        region_dip={"x": 0, "y": 0, "width": 200, "height": 100},
        region_px={"x": 0, "y": 0, "width": 2, "height": 2})
    return {"request_id": "focus-one", "session_id": "live-one", "epoch": 1, "permission_revision": 1,
        "trigger": "focus", "allowed_assistance": "hint", "presentation": "silent",
        "user_text": None, "audio_source": None, "image": frame["image"], "context": frame["context"],
        "focus": {"frame_seq": 1, "region_dip": {"x": 100, "y": 0, "width": 100, "height": 100},
                  "region_px": {"x": 1, "y": 0, "width": 1, "height": 2}},
        "history": [{"kind": "source_transcript", "text": "Original uncertain teacher words.", "at": None,
            "frame_seq": 0, "request_id": None, "audio_source": {"source_id": "track-one",
            "track": "system_playback", "speaker": "unknown", "attribution": "unknown",
            "started_at": None, "ended_at": None}, "presentation": None}],
        "gaps": [{"from_frame_seq": 0, "to_frame_seq": 0, "reason": "not_observed"}]}


def start_params():
    return {"session_id": "live-one", "capture_session_id": "capture-one", "epoch": 1, "model": MODEL,
        "policy": {"max_submissions": 2, "max_session_ms": 30000, "min_observation_interval_ms": 30000},
        "permissions": {"screen": True, "microphone": False, "system_audio": False}}


@pytest.mark.parametrize("credits", [None, {"hasCredits": False, "unlimited": False, "balance": "0"},
                                    {"hasCredits": True, "unlimited": False, "balance": "7.50"}])
def test_actual_live_public_pipe_preserves_each_bucket_credit_and_reached_fact(tmp_path, credits):
    quota = {"ordinaryUsageAllowed": False, "rateLimitsByLimitId": {
        "codex": {"limitId": "codex", "normalModelSlug": MODEL, "primary": {
            "usedPercent": 100, "windowDurationMins": 300, "resetsAt": 0}, "credits": credits,
            "rateLimitReachedType": "rate_limit_reached", "spendControlReached": False,
            "individualLimit": {"limit": "100.0", "used": "101.0", "remainingPercent": -1, "resetsAt": 0}},
        "other": {"limitId": "other", "normalModelSlug": "other-model", "spendControlReached": True,
            "credits": {"hasCredits": True, "unlimited": True, "balance": "123.00"},
            "rateLimitReachedType": "workspace_member_usage_limit_reached"}}}
    with foreground(tmp_path, quota=quota) as (process, send, receive, output, report):
        send(envelope(local.LIVE_VERSION))
        result = receive()["result"]
        validate("Connection", result)
        assert result["quota"]["ordinary_usage_allowed"] is False
        first, other = result["quota"]["windows"]
        assert first["credits"] == (None if credits is None else {
            "has_credits": credits["hasCredits"], "unlimited": credits["unlimited"], "balance": credits["balance"]})
        assert first["limit_id"] == "codex" and first["normal_model_slug"] == MODEL
        assert first["rate_limit_reached_type"] == "rate_limit_reached"
        assert first["spend_control_reached"] is False
        assert first["primary"]["resets_at"] == "1970-01-01T00:00:00Z"
        assert first["individual_limit"] == {"limit": "100.0", "used": "101.0", "remaining_percent": -1,
                                             "resets_at": "1970-01-01T00:00:00Z"}
        assert other["limit_id"] == "other" and other["spend_control_reached"] is True
        assert other["credits"]["balance"] == "123.00"
        assert other["rate_limit_reached_type"] == "workspace_member_usage_limit_reached"
        assert "private-account" not in json.dumps(result)
        process.stdin.close()
        assert output.get(timeout=8) == b"" and process.wait(timeout=8) == 0
        assert process.stderr.read() == b""
        assert json.loads(report.read_text()) == {"child_reaped": True, "turn_starts": 0}


def test_actual_live_pipe_full_frame_focus_history_and_stop_use_real_learning(tmp_path, ask_request):
    turn = live_turn(ask_request)
    with foreground(tmp_path) as (process, send, receive, output, report):
        send(envelope(local.LIVE_VERSION, method="companion/start", params=start_params()))
        assert receive()["result"]["remaining_submissions"] == 2
        send(envelope(local.LIVE_VERSION, "focus", "companion/turn", turn))
        response = receive()
        assert response["id"] == "focus"
        result = validate("Result", response["result"])
        expected = deepcopy(turn)
        del expected["image"]["png_base64"]
        assert result["provenance"] == expected and result["kind"] == "generated_assistance"
        assert result["text"] == "Completed answer."
        records = [json.loads(row) for row in (tmp_path / "success" / "requests.jsonl").read_text().splitlines()]
        submitted = next(row["params"] for row in records if row.get("method") == "turn/start")
        assert submitted["input"][1]["url"] == "data:image/png;base64," + turn["image"]["png_base64"]
        assert "Original uncertain teacher words." in submitted["input"][0]["text"]
        assert base64.b64decode(submitted["input"][1]["url"].split(",", 1)[1]) == base64.b64decode(turn["image"]["png_base64"])
        send(envelope(local.LIVE_VERSION, "stop", "companion/stop", {"session_id": "live-one", "epoch": 1}))
        assert receive()["result"] == {"cancelled": False, "uncertain": False}
        turn["request_id"] = "after-stop"
        send(envelope(local.LIVE_VERSION, "late", "companion/turn", turn))
        assert receive()["error"] == {"code": "session_stopped", "submission": "not_submitted"}
        process.stdin.close()
        assert output.get(timeout=8) == b"" and process.wait(timeout=8) == 0
        assert process.stderr.read() == b""
        assert json.loads(report.read_text()) == {"child_reaped": True, "turn_starts": 1}


@pytest.mark.parametrize("scenario,code,submission", [("retry_error", "rate_limited", "submitted"),
                                                    ("start_error", "failed", "submitted"),
                                                    ("failed", "failed", "submitted")])
def test_actual_live_pipe_provider_failures_never_replay(tmp_path, ask_request, scenario, code, submission):
    with foreground(tmp_path, scenario) as (process, send, receive, output, report):
        send(envelope(local.LIVE_VERSION, method="companion/start", params=start_params()))
        assert "result" in receive()
        send(envelope(local.LIVE_VERSION, "turn", "companion/turn", live_turn(ask_request)))
        assert receive() == {"id": "turn", "error": {"code": code, "submission": submission}}
        if scenario == "failed":
            send(envelope(local.LIVE_VERSION, "check"))
            assert "result" in receive()
            send(envelope(local.LIVE_VERSION, "repeat", "companion/start", start_params()))
            assert receive()["error"]["code"] == "session_stopped"
            process.stdin.close()
        assert output.get(timeout=8) == b"" and process.wait(timeout=8) == 0
        assert process.stderr.read() == b""
        assert json.loads(report.read_text()) == {"child_reaped": True, "turn_starts": 1}


@pytest.mark.parametrize("version", [local.VERSION, local.LIVE_VERSION])
def test_actual_launch_failure_returns_selected_sanitized_error(tmp_path, version):
    with foreground(tmp_path, "launch_failure") as (process, send, receive, output, report):
        send(envelope(version))
        error = receive()["error"]
        assert error["code"] == "unavailable"
        assert set(error) == ({"code", "submission"} if version == local.LIVE_VERSION else {"code", "message"})
        assert output.get(timeout=8) == b"" and process.wait(timeout=8) == 0
        assert process.stderr.read() == b"" and not report.exists()
