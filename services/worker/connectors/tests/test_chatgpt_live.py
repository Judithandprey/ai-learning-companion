"""Actual Learning and live bridge with an in-memory RPC; no accounts or capture."""

import asyncio
import base64
from contextlib import asynccontextmanager
from copy import deepcopy
import json
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace

import pytest

from packages.contracts import live_companion as wire
from services.learning.live_session import authorize_live_presentation, bind_live_session_response
from services.worker.connectors.chatgpt_live import LiveSubscriptionBridge
from services.worker.connectors.chatgpt_rpc import RPCError


EXAMPLE = json.loads((Path(__file__).resolve().parents[4] /
                     "packages/contracts/live_companion/examples/focus.json").read_text())["params"]
MODEL = "test-live-model"


class Clock:
    def __init__(self):
        self.now = 10.0

    def __call__(self):
        return self.now


class Client:
    def __init__(self):
        self.terminal = asyncio.Event()
        self.on_event = None
        self.closed = False
        self.submission = "not_submitted"
        self.receipts, self.calls = [], []
        self.thread_writes = self.turn_writes = self.running = self.max_running = self.interrupts = 0
        self.before_thread, self.before_turn, self.release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        for event in (self.before_thread, self.before_turn, self.release):
            event.set()
        self.thread_sent, self.sent = asyncio.Event(), asyncio.Event()
        self.failure = None
        self.failure_submission = "submitted"
        self.failure_before_send = False
        self.ignore_cancel = False
        self.text = "A synthetic contextual hint."
        self.status = {"auth": {"state": "signed_in", "mode": "chatgpt", "plan": "plus"},
            "quota": {"available": False, "ordinary_usage_allowed": None, "windows": []},
            "models": [{"id": MODEL, "label": "Synthetic model", "image_input": True, "default": True}]}

    async def connection_read_live(self):
        self.calls.append("connection/read")
        return deepcopy(self.status)

    def begin_request(self, request_id):
        self.submission = "not_submitted"
        self.receipts.append({"request_id": request_id, "outcome": "pending"})

    def finish_request(self, outcome):
        self.receipts[-1]["outcome"] = outcome

    def request_submission(self):
        return self.submission

    async def ask(self, text, image_bytes, *, model, cancelled, send_guard):
        self.running += 1
        self.max_running = max(self.max_running, self.running)
        self.calls.append(("ask", text, image_bytes, model))
        try:
            if self.failure_before_send:
                raise RPCError(self.failure or "unauthenticated")
            await self.before_thread.wait()
            send_guard("thread/start")
            self.thread_writes += 1
            self.thread_sent.set()
            await self.before_turn.wait()
            send_guard("turn/start")
            self.turn_writes += 1
            self.submission = "submitted"
            self.sent.set()
            await self.release.wait()
            if self.failure:
                self.submission = self.failure_submission
                raise RPCError(self.failure, submission=self.submission)
            if cancelled.is_set() and not self.ignore_cancel:
                raise RPCError("cancelled", submission=self.submission)
            return {"text": self.text, "model": model, "thread_id": "thread-test", "turn_id": "turn-test"}
        finally:
            self.running -= 1

    async def interrupt(self):
        self.interrupts += 1
        self.release.set()
        return not self.ignore_cancel

    async def close(self):
        self.closed = True
        self.terminal.set()


def start(**changes):
    return {"session_id": EXAMPLE["session_id"], "capture_session_id": EXAMPLE["context"]["capture_session_id"],
            "epoch": 1, "model": MODEL,
            "policy": {"max_submissions": 12, "max_session_ms": 300000, "min_observation_interval_ms": 30000},
            "permissions": {"screen": True, "microphone": False, "system_audio": False}, **changes}


def turn(name="one", frame=3, trigger="focus", **changes):
    value = deepcopy(EXAMPLE)
    value.update(request_id=name, trigger=trigger, **changes)
    value["context"]["frame_seq"] = frame
    if value["focus"] is not None:
        value["focus"]["frame_seq"] = frame
    if trigger == "observation":
        value.update(focus=None, allowed_assistance="none", presentation="none", user_text=None)
    if trigger in ("text_followup", "voice_followup") and value["user_text"] is None:
        value["user_text"] = "Please give one further hint."
    return value


@asynccontextmanager
async def bridge(*, start_params=None, clock=None, **kwargs):
    client, emitted, queue = Client(), [], asyncio.Queue()

    def emit(value):
        emitted.append(deepcopy(value))
        queue.put_nowait(value)

    options = {"clock": clock} if clock is not None else {}
    owner = LiveSubscriptionBridge(client, emit=emit, **options, **kwargs)
    c = SimpleNamespace(client=client, bridge=owner, emitted=emitted, queue=queue, sequence=0)

    async def send(method, params):
        c.sequence += 1
        rpc_id = "rpc-" + str(c.sequence)
        await owner.handle({"version": wire.VERSION, "id": rpc_id, "method": method, "params": params})
        return rpc_id

    async def receive(rpc_id):
        async with asyncio.timeout(2):
            while True:
                found = next((row for row in emitted if row.get("id") == rpc_id), None)
                if found is not None:
                    return found
                await queue.get()

    c.send, c.receive = send, receive
    try:
        if start_params is not False:
            c.start_id = await send("companion/start", start_params or start())
            c.started = await receive(c.start_id)
        yield c
    finally:
        await owner.close()
        assert not owner.tasks or all(task.done() for task in owner.tasks)


def error(value, code, submission="not_submitted"):
    assert value["error"] == {"code": code, "submission": submission}
    assert set(value) == {"id", "error"}


def test_actual_learning_focus_and_internal_observation_keep_exact_source_and_authority():
    async def run():
        authorizations = []

        def authorize(result, **kwargs):
            authorizations.append(deepcopy(kwargs))
            return authorize_live_presentation(result, **kwargs)

        async with bridge(authorize=authorize) as c:
            original = turn()
            rpc_id = await c.send("companion/turn", original)
            result = (await c.receive(rpc_id))["result"]
            wire.validate("Result", result)
            assert result["kind"] == "generated_assistance" and result["model"] == MODEL
            proof = deepcopy(original)
            del proof["image"]["png_base64"]
            assert result["provenance"] == proof
            assert authorizations == [{"current_state": {"active": True, "cancelled": False, "provenance": proof}, "channel": "text"}]
            assert original == turn()
            observed = await c.send("companion/turn", turn("observe", 4, "observation"))
            assert (await c.receive(observed))["result"]["kind"] == "observation"
            assert len(authorizations) == 1 and c.client.turn_writes == 2
            assert all(row["outcome"] == "completed" for row in c.client.receipts)

    asyncio.run(run())


@pytest.mark.parametrize("permission", ["microphone", "system_audio"])
def test_start_rejects_unavailable_audio_acquisition(permission):
    async def run():
        params = start()
        params["permissions"][permission] = True
        async with bridge(start_params=params) as c:
            error(c.started, "unavailable")
            assert c.client.calls == [] and c.client.turn_writes == 0

    asyncio.run(run())


@pytest.mark.parametrize("damage,expected", [("signed_out", "unauthenticated"), ("image", "unsupported_model"),
                                            ("model", "unsupported_model")])
def test_start_checks_current_auth_and_model_capability(damage, expected):
    async def run():
        async with bridge(start_params=False) as c:
            if damage == "signed_out":
                c.client.status["auth"].update(state="signed_out", mode=None)
            elif damage == "image":
                c.client.status["models"][0]["image_input"] = False
            else:
                c.client.status["models"][0]["id"] = "another-model"
            error(await c.receive(await c.send("companion/start", start())), expected)
            assert c.bridge.session.stopped and c.client.turn_writes == 0

    asyncio.run(run())


def test_caller_policy_cannot_expand_hard_limits_or_renew_same_session():
    async def run():
        clock = Clock()
        params = start(policy={"max_submissions": 100, "max_session_ms": 3600000, "min_observation_interval_ms": 500})
        async with bridge(start_params=params, clock=clock) as c:
            assert c.started["result"]["remaining_submissions"] == 12
            assert c.started["result"]["expires_in_ms"] == 300000
            assert c.bridge.session.interval == 30
            for number in range(12):
                result = await c.receive(await c.send("companion/turn", turn(str(number), number + 3)))
                assert "result" in result
            error(await c.receive(await c.send("companion/turn", turn("thirteen", 15))), "budget_reached")
            assert c.client.turn_writes == c.bridge.session.submissions == 12
            clock.now += 301
            error(await c.receive(await c.send("companion/turn", turn("expired", 16))), "budget_reached")
            error(await c.receive(await c.send("companion/start", start(epoch=2))), "session_stopped")
            assert c.client.turn_writes == 12

    asyncio.run(run())


def test_one_pending_latest_observation_and_explicit_priority_never_overlap():
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            old = await c.send("companion/turn", turn("old", 4, "observation"))
            newer = await c.send("companion/turn", turn("newer", 5, "observation"))
            error(await c.receive(old), "stale_context")
            focus = await c.send("companion/turn", turn("focus", 6))
            error(await c.receive(newer), "stale_context")
            latest = deepcopy(c.bridge.session.latest)
            blocked = await c.send("companion/turn", turn("busy", 7, "observation"))
            error(await c.receive(blocked), "busy")
            assert c.bridge.session.latest == latest
            c.client.release.set()
            error(await c.receive(active), "stale_context", "submitted")
            assert (await c.receive(focus))["result"]["request_id"] == "focus"
            assert c.client.max_running == 1 and c.client.turn_writes == 2
            assert [row["request_id"] for row in c.client.receipts] == ["active", "focus"]

    asyncio.run(run())


def test_observation_interval_holds_only_newest_and_focus_bypasses_delay():
    async def run():
        clock = Clock()
        async with bridge(clock=clock) as c:
            observed = await c.send("companion/turn", turn("observed", 3, "observation"))
            await c.receive(observed)
            pending = await c.send("companion/turn", turn("pending", 4, "observation"))
            await asyncio.sleep(0)
            assert c.client.turn_writes == 1
            focused = await c.send("companion/turn", turn("focused", 5))
            error(await c.receive(pending), "stale_context")
            await c.receive(focused)
            clock.now += 29
            early = await c.send("companion/turn", turn("early", 6, "observation"))
            await asyncio.sleep(0)
            assert c.client.turn_writes == 2
            clock.now += 1
            due = await c.send("companion/turn", turn("due", 7, "observation"))
            error(await c.receive(early), "stale_context")
            assert (await c.receive(due))["result"]["kind"] == "observation"
            assert c.client.turn_writes == 3

    asyncio.run(run())


@pytest.mark.parametrize("change", ["epoch", "capture", "session", "revision", "frame", "same-frame-image", "same-frame-context"])
def test_rejected_context_never_replaces_latest_caller_state(change):
    async def run():
        async with bridge() as c:
            await c.receive(await c.send("companion/turn", turn("first", 4, permission_revision=2)))
            original = deepcopy(c.bridge.session.latest)
            value = turn("bad", 4, permission_revision=2)
            if change == "epoch": value["epoch"] = 2
            elif change == "capture": value["context"]["capture_session_id"] = "other-capture"
            elif change == "session": value["session_id"] = "other-session"
            elif change == "revision": value["permission_revision"] = 1
            elif change == "frame": value = turn("bad", 3, permission_revision=2)
            elif change == "same-frame-image": value["image"]["sha256"] = "0" * 64
            else: value["context"]["source_url"] = "https://example.invalid/new"
            error(await c.receive(await c.send("companion/turn", value)), "stale_context")
            assert c.bridge.session.latest == original and c.client.turn_writes == 1

    asyncio.run(run())


def test_higher_revision_withdrawal_bypasses_busy_and_suppresses_all_help():
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            pending = await c.send("companion/turn", turn("explicit-pending", 4))
            withdraw = turn("withdraw", 5, permission_revision=2, allowed_assistance="none", presentation="none")
            withdrawn = await c.send("companion/turn", withdraw)
            error(await c.receive(withdrawn), "cancelled")
            error(await c.receive(pending), "cancelled")
            error(await c.receive(active), "stale_context", "submitted")
            assert c.bridge.session.latest == withdraw
            assert c.client.turn_writes == 1 and not any("result" in row for row in c.emitted[1:])

    asyncio.run(run())


@pytest.mark.parametrize("code,expected,submission", [("rate_limited", "rate_limited", "submitted"),
    ("quota_exhausted", "allowance_exhausted", "submitted"), ("unauthenticated", "unauthenticated", "submitted"),
    ("outcome_unknown", "failed", "unknown"), ("workspace_limit", "workspace_limit", "submitted")])
def test_provider_failure_suspends_queue_without_retry_or_budget_refund(code, expected, submission):
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            c.client.failure, c.client.failure_submission = code, submission
            failed = await c.send("companion/turn", turn("failed"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("queued", 4, "observation"))
            c.client.release.set()
            error(await c.receive(failed), expected, submission)
            error(await c.receive(queued), expected)
            assert c.bridge.session.stopped and c.bridge.session.submissions == 1
            error(await c.receive(await c.send("companion/turn", turn("tick", 5, "observation"))), "session_stopped")
            await c.receive(await c.send("connection/read", {}))
            assert c.bridge.session.stopped and c.client.turn_writes == 1
            error(await c.receive(await c.send("companion/start", start(epoch=2))), "session_stopped")
            assert "result" in await c.receive(await c.send("companion/start", start(session_id="explicit-new")))
            assert c.client.turn_writes == 1 and c.bridge.session.submissions == 0

    asyncio.run(run())


@pytest.mark.parametrize("stage", ["thread", "turn", "completion"])
def test_monotonic_deadline_rechecked_at_actual_writes_and_completion(stage):
    async def run():
        clock = Clock()
        async with bridge(clock=clock) as c:
            gate = c.client.before_thread if stage == "thread" else c.client.before_turn if stage == "turn" else c.client.release
            gate.clear()
            rpc_id = await c.send("companion/turn", turn())
            if stage == "thread":
                await asyncio.sleep(0)
            else:
                await asyncio.wait_for((c.client.thread_sent if stage == "turn" else c.client.sent).wait(), 1)
            clock.now += 301
            gate.set()
            error(await c.receive(rpc_id), "budget_reached", "submitted" if stage == "completion" else "not_submitted")
            assert c.client.turn_writes == c.bridge.session.submissions == int(stage == "completion")

    asyncio.run(run())


def test_deadline_actively_interrupts_inflight_request_without_another_input():
    async def run():
        params = start(policy={"max_submissions": 1, "max_session_ms": 1000, "min_observation_interval_ms": 30000})
        async with bridge(start_params=params) as c:
            c.client.release.clear()
            rpc_id = await c.send("companion/turn", turn())
            await asyncio.wait_for(c.client.sent.wait(), 1)
            error(await c.receive(rpc_id), "budget_reached", "submitted")
            assert c.client.interrupts and c.bridge.session.stopped and c.client.turn_writes == 1

    asyncio.run(run())


def test_guard_rejects_superseded_context_before_turn_write_without_consuming_slot():
    async def run():
        async with bridge() as c:
            c.client.before_turn.clear()
            old = await c.send("companion/turn", turn("old"))
            await asyncio.wait_for(c.client.thread_sent.wait(), 1)
            fresh = await c.send("companion/turn", turn("fresh", 4))
            c.client.before_turn.set()
            error(await c.receive(old), "stale_context")
            assert (await c.receive(fresh))["result"]["request_id"] == "fresh"
            assert c.bridge.session.submissions == c.client.turn_writes == 1

    asyncio.run(run())


def test_transcript_voice_followup_is_explicit_talk_without_audio_capture():
    async def run():
        async with bridge() as c:
            source = {"source_id": "transcript-source", "track": "unknown", "speaker": "user",
                      "attribution": "confirmed", "started_at": None, "ended_at": None}
            value = turn(trigger="voice_followup", audio_source=source, presentation="spoken")
            result = (await c.receive(await c.send("companion/turn", value)))["result"]
            assert result["provenance"]["audio_source"] == source
            assert c.bridge.session.start["permissions"] == {"screen": True, "microphone": False, "system_audio": False}

    asyncio.run(run())


def test_provider_result_cannot_supply_its_own_current_authority():
    async def run():
        def forged(prepared, text, **metadata):
            result = bind_live_session_response(prepared, text, **metadata)
            result["provenance"]["permission_revision"] += 1
            return result

        async with bridge(bind=forged) as c:
            error(await c.receive(await c.send("companion/turn", turn())), "stale_context", "submitted")
            assert c.bridge.session.latest["permission_revision"] == 1
            assert c.client.turn_writes == 1

    asyncio.run(run())


def test_full_result_envelope_is_bounded_before_publication(monkeypatch):
    from services.worker.connectors import chatgpt_live

    assert chatgpt_live.MAX_OUTPUT_BYTES == 1024 * 1024
    monkeypatch.setattr(chatgpt_live, "MAX_OUTPUT_BYTES", 4096)

    async def run():
        async with bridge() as c:
            c.client.text = "x" * 4000
            error(await c.receive(await c.send("companion/turn", turn())), "context_limit", "submitted")
            assert c.client.receipts[-1]["outcome"] == "failed"
            assert all(len(json.dumps(row).encode()) < 4096 for row in c.emitted)

    asyncio.run(run())


@pytest.mark.parametrize("confirmed", [True, False])
def test_matching_interrupt_preserves_unrelated_pending_only_when_confirmed(confirmed):
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            c.client.ignore_cancel = not confirmed
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("queued", 4))
            control = await c.send("companion/interrupt", {"session_id": EXAMPLE["session_id"],
                "epoch": 1, "request_id": "active"})
            result = (await c.receive(control))["result"]
            assert result == {"cancelled": True, "uncertain": not confirmed}
            error(await c.receive(active), "cancelled", "submitted")
            if confirmed:
                assert (await c.receive(queued))["result"]["request_id"] == "queued"
                assert c.client.turn_writes == 2 and not c.bridge.session.stopped
            else:
                error(await c.receive(queued), "interrupt_unconfirmed")
                assert c.client.turn_writes == 1 and c.bridge.session.stopped

    asyncio.run(run())


def test_wrong_session_epoch_or_request_interrupt_cannot_cancel_new_work():
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("queued", 4))
            for params in ({"session_id": "old-session", "epoch": 1, "request_id": None},
                           {"session_id": EXAMPLE["session_id"], "epoch": 2, "request_id": None},
                           {"session_id": EXAMPLE["session_id"], "epoch": 1, "request_id": "old-request"}):
                assert (await c.receive(await c.send("companion/interrupt", params)))["result"] == {
                    "cancelled": False, "uncertain": False}
            assert c.client.interrupts == 0 and c.bridge.pending.turn["request_id"] == "queued"
            only_pending = await c.send("companion/interrupt", {"session_id": EXAMPLE["session_id"],
                "epoch": 1, "request_id": "queued"})
            assert (await c.receive(only_pending))["result"] == {"cancelled": True, "uncertain": False}
            error(await c.receive(queued), "cancelled")
            assert c.client.interrupts == 0 and not c.bridge.active.cancelled.is_set()
            c.client.release.set()
            error(await c.receive(active), "stale_context", "submitted")

    asyncio.run(run())


def test_stop_immediately_fences_queue_outputs_and_session_id_even_at_higher_epoch():
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            c.client.ignore_cancel = True
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("queued", 4))
            stopped = await c.send("companion/stop", {"session_id": EXAMPLE["session_id"], "epoch": 1})
            error(await c.receive(queued), "session_stopped")
            assert (await c.receive(stopped))["result"] == {"cancelled": True, "uncertain": True}
            error(await c.receive(active), "session_stopped", "submitted")
            error(await c.receive(await c.send("companion/start", start(epoch=2))), "session_stopped")
            assert c.client.turn_writes == 1

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["rate_limited", "unauthenticated", "outcome_unknown"])
def test_permission_change_cannot_mask_provider_failure_and_auto_dispatch_pending(failure):
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            c.client.failure = failure
            c.client.failure_submission = "unknown" if failure == "outcome_unknown" else "submitted"
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("new-permission", 4, permission_revision=2))
            error(await c.receive(active), "stale_context", c.client.failure_submission)
            expected = "failed" if failure == "outcome_unknown" else failure
            error(await c.receive(queued), expected)
            assert c.bridge.session.stopped and c.client.turn_writes == 1

    asyncio.run(run())


def test_repeated_final_write_guard_reserves_only_once_and_never_refunds_unknown():
    async def run():
        async with bridge() as c:
            original = c.client.ask

            async def repeated(text, image_bytes, **kwargs):
                guard = kwargs["send_guard"]

                def twice(method):
                    guard(method)
                    if method == "turn/start":
                        guard(method)

                kwargs["send_guard"] = twice
                return await original(text, image_bytes, **kwargs)

            c.client.ask = repeated
            c.client.failure = "outcome_unknown"
            c.client.failure_submission = "unknown"
            error(await c.receive(await c.send("companion/turn", turn())), "failed", "unknown")
            assert c.bridge.session.submissions == c.client.turn_writes == 1

    asyncio.run(run())


@pytest.mark.parametrize("damage", ["png", "hash"])
@pytest.mark.parametrize("pending", [False, True])
def test_invalid_original_never_replaces_current_or_pending_authority(damage, pending):
    async def run():
        async with bridge() as c:
            c.client.release.clear()
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            if pending:
                queued = await c.send("companion/turn", turn("queued", 4, "observation"))
            current = deepcopy(c.bridge.session.latest)
            retained = c.bridge.pending
            corrupt = turn("corrupt", 5)
            if damage == "hash":
                corrupt["image"]["sha256"] = "0" * 64
            else:
                raw = b"synthetic bytes that are not a PNG"
                corrupt["image"].update(png_base64=base64.b64encode(raw).decode(), sha256=sha256(raw).hexdigest())
            error(await c.receive(await c.send("companion/turn", corrupt)), "invalid_request")
            assert c.bridge.session.latest == current and c.bridge.pending is retained
            assert "corrupt" not in c.bridge.request_ids
            c.client.release.set()
            if pending:
                error(await c.receive(active), "stale_context", "submitted")
                assert (await c.receive(queued))["result"]["request_id"] == "queued"
            else:
                assert (await c.receive(active))["result"]["request_id"] == "active"

    asyncio.run(run())


def test_accepted_turn_is_prepared_once_before_queueing():
    from services.learning.live_session import prepare_live_session_context

    async def run():
        calls = []

        def prepare(value):
            calls.append(value["request_id"])
            return prepare_live_session_context(value)

        async with bridge(prepare=prepare) as c:
            c.client.release.clear()
            first = await c.send("companion/turn", turn("first"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            second = await c.send("companion/turn", turn("second", 4))
            assert calls == ["first", "second"]
            c.client.release.set()
            await c.receive(first)
            await c.receive(second)
            assert calls == ["first", "second"]

    asyncio.run(run())


@pytest.mark.parametrize("method", ["companion/stop", "companion/interrupt"])
def test_history_exhaustion_never_disables_stop_or_interrupt(monkeypatch, method):
    from services.worker.connectors import chatgpt_live

    monkeypatch.setattr(chatgpt_live, "MAX_HISTORY", 3)

    async def run():
        async with bridge() as c:
            c.client.release.clear()
            active = await c.send("companion/turn", turn("active"))
            await asyncio.wait_for(c.client.sent.wait(), 1)
            queued = await c.send("companion/turn", turn("queued", 4))
            params = {"session_id": EXAMPLE["session_id"], "epoch": 1}
            if method == "companion/interrupt": params["request_id"] = None
            stopped = await c.send(method, params)
            assert (await c.receive(stopped))["result"] == {"cancelled": True, "uncertain": False}
            code = "session_stopped" if method == "companion/stop" else "cancelled"
            error(await c.receive(active), code, "submitted")
            error(await c.receive(queued), code)
            assert len(c.bridge.rpc_ids) == 3 and c.client.turn_writes == 1

    asyncio.run(run())
