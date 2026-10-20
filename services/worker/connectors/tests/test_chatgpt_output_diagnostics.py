"""Bounded output diagnostics through real RPC parsing and private receipts.

Only the existing synthetic Python child runs; no installed Codex, account,
provider, network, or device access is used.
"""

import asyncio
import base64
from hashlib import sha256
import json

import pytest

from services.worker.connectors.chatgpt_receipts import ReceiptWriter
from services.worker.connectors.chatgpt_rpc import RPCError
from services.worker.connectors.tests.test_chatgpt_rpc import PNG, client, invoke, requests


DEFAULTS = {
    "failure_code": None,
    "terminal_items_view": None,
    "terminal_error_present": None,
    "completed_message_count": 0,
    "completed_final_answer_count": 0,
    "completed_commentary_count": 0,
    "completed_unphased_count": 0,
    "answer_selection": None,
    "answer_text_state": None,
}
PRIVATE_TEXT = "SYNTHETIC private answer, provider prose, and /private/user/file"
HIDDEN_TEXT = "SYNTHETIC hidden reasoning must not enter receipts"


def diagnostics(snapshot):
    return {name: snapshot[name] for name in DEFAULTS}


def recorder(tmp_path):
    state = tmp_path / "private-receipt-state"
    state.mkdir(mode=0o700)
    writer = ReceiptWriter(
        state, "/synthetic/codex", "0.158.0", "a" * 64, False)
    snapshots = []

    def record(snapshot):
        writer(snapshot)
        snapshots.append(snapshot)

    return writer, snapshots, record


def read_receipt(writer, request_id="diagnostic-request"):
    path = writer.directory / (sha256(request_id.encode()).hexdigest() + ".json")
    return json.loads(path.read_text())


def assert_private(snapshots, persisted, instance):
    encoded = json.dumps([*snapshots, persisted])
    for private in (
        "An explicit ASK.", "Completed answer.", "Event answer.",
        "Legacy completed.", "Not final.", PRIVATE_TEXT, HIDDEN_TEXT,
        "TOKEN-secret", "secret@example.invalid", "/product-only",
        instance.cwd, base64.b64encode(PNG).decode(), "data:image/png",
    ):
        assert private not in encoded


async def exercise(tmp_path, mode, expected, *, terminal=None, completed_events=()):
    writer, snapshots, record = recorder(tmp_path)
    instance = client(tmp_path, mode, isolation_verified=True, on_receipt=record)
    original_notification = instance._notification

    async def notification(method, params):
        if method == "turn/completed" and terminal is not None:
            # Change only the synthetic terminal payload; the production parser,
            # answer selection, request lifecycle and writer all remain real.
            for item in completed_events:
                await original_notification("item/completed", {
                    "threadId": "thread-1", "turnId": "turn-1", "item": item})
            params = {**params, "turn": {**params["turn"], **terminal}}
        await original_notification(method, params)

    instance._notification = notification
    await instance.start()
    try:
        instance.begin_request("diagnostic-request")
        assert diagnostics(snapshots[-1]) == DEFAULTS
        if expected["failure_code"] is None:
            answer = await invoke(instance)
            assert answer["text"].strip()
            outcome = "completed"
        else:
            with pytest.raises(RPCError) as error:
                await invoke(instance)
            assert error.value.code == expected["failure_code"]
            # The originating failure is available before the outer bridge
            # supplies its presentation outcome.
            assert snapshots[-1]["failure_code"] == error.value.code
            outcome = "failed"
        assert diagnostics(snapshots[-1]) == expected
        assert snapshots[-1]["outcome"] == "pending"
        instance.finish_request(outcome)
        persisted = read_receipt(writer)
        assert diagnostics(persisted) == expected
        assert persisted["outcome"] == outcome
        assert persisted["terminal_status"] == "completed"
        assert persisted["submission"] == "acknowledged"
        assert persisted["thread_start_count"] == persisted["turn_start_count"] == 1
        methods = [row.get("method") for row in requests(instance)]
        assert methods.count("thread/start") == methods.count("turn/start") == 1
        assert methods.count("turn/interrupt") == 0
        assert_private(snapshots, persisted, instance)
    finally:
        await instance.close()


@pytest.mark.parametrize("mode,view,counts,selection,text_state,failure", [
    ("commentary", "full", (1, 0, 1, 0), "none", "empty", "incomplete_turn"),
    ("empty", "full", (0, 0, 0, 0), "none", "empty", "incomplete_turn"),
    ("summary_only", "summary", (0, 0, 0, 0), "none", "empty", "incomplete_turn"),
    ("success", "full", (1, 1, 0, 0), "final_answer", "nonempty", None),
    ("before_reply", "full", (1, 1, 0, 0), "final_answer", "nonempty", None),
    ("event_only", "notLoaded", (1, 1, 0, 0), "final_answer", "nonempty", None),
    ("legacy", "full", (1, 0, 0, 1), "unphased", "nonempty", None),
])
def test_completed_turn_branches_remain_distinct_without_content(
        tmp_path, capfd, mode, view, counts, selection, text_state, failure):
    expected = {
        **DEFAULTS, "failure_code": failure, "terminal_items_view": view,
        "terminal_error_present": False,
        **dict(zip((
            "completed_message_count", "completed_final_answer_count",
            "completed_commentary_count", "completed_unphased_count",
        ), counts)),
        "answer_selection": selection, "answer_text_state": text_state,
    }
    asyncio.run(exercise(tmp_path, mode, expected))
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize("text,text_state,failure", [
    ("", "empty", "incomplete_turn"),
    (" \t\n", "whitespace", "incomplete_turn"),
    (PRIVATE_TEXT, "nonempty", None),
])
def test_selected_final_text_state_is_bounded_and_preserves_final_precedence(
        tmp_path, text, text_state, failure):
    items = [
        {"id": "commentary", "type": "agentMessage", "phase": "commentary", "text": PRIVATE_TEXT},
        {"id": "legacy", "type": "agentMessage", "text": PRIVATE_TEXT},
        {"id": "final", "type": "agentMessage", "phase": "final_answer", "text": text},
        {"id": "reasoning", "type": "reasoning", "text": HIDDEN_TEXT},
    ]
    expected = {
        **DEFAULTS, "failure_code": failure, "terminal_items_view": "full",
        "terminal_error_present": False, "completed_message_count": 3,
        "completed_final_answer_count": 1, "completed_commentary_count": 1,
        "completed_unphased_count": 1, "answer_selection": "final_answer",
        "answer_text_state": text_state,
    }
    asyncio.run(exercise(tmp_path, "success", expected, terminal={"items": items}))


@pytest.mark.parametrize("view", ["full", "summary", "notLoaded"])
def test_completed_events_are_authoritative_and_duplicate_full_items_count_once(tmp_path, view):
    item = {
        "id": "answer-1", "type": "agentMessage",
        "phase": "final_answer", "text": PRIVATE_TEXT,
    }
    expected = {
        **DEFAULTS, "terminal_items_view": view, "terminal_error_present": False,
        "completed_message_count": 1, "completed_final_answer_count": 1,
        "answer_selection": "final_answer", "answer_text_state": "nonempty",
    }
    asyncio.run(exercise(
        tmp_path, "success", expected,
        terminal={"items": [item, item], "itemsView": view, "error": None},
        completed_events=(item, item)))


def test_event_plus_full_terminal_preserves_4097_messages_and_answer(tmp_path):
    async def run():
        writer, snapshots, _ = recorder(tmp_path)
        # Collect bounded metadata in memory during parsing, then exercise the
        # real writer once; this regression must not perform thousands of fsyncs.
        instance = client(tmp_path, isolation_verified=True, on_receipt=snapshots.append)
        original_notification = instance._notification

        async def notification(method, params):
            if method == "turn/completed":
                await original_notification("item/completed", {
                    "threadId": "thread-1", "turnId": "turn-1",
                    "item": {"id": "event-answer", "type": "agentMessage",
                             "phase": "final_answer", "text": "x"}})
                params = {**params, "turn": {**params["turn"], "items": [
                    {"id": f"terminal-{index}", "type": "agentMessage",
                     "phase": "final_answer", "text": ""}
                    for index in range(4096)
                ]}}
            await original_notification(method, params)

        instance._notification = notification
        await instance.start()
        try:
            instance.begin_request("diagnostic-request")
            answer = await invoke(instance)
            assert answer["text"] == "x" + "\n" * 4096
            instance.finish_request("completed")
            writer(snapshots[-1])
            persisted = read_receipt(writer)
            assert diagnostics(persisted) == {
                **DEFAULTS, "terminal_items_view": "full",
                "terminal_error_present": False, "completed_message_count": 4097,
                "completed_final_answer_count": 4097,
                "answer_selection": "final_answer", "answer_text_state": "nonempty",
            }
            assert persisted["terminal_status"] == persisted["outcome"] == "completed"
            methods = [row.get("method") for row in requests(instance)]
            assert methods.count("thread/start") == methods.count("turn/start") == 1
            assert methods.count("turn/interrupt") == 0
            assert_private(snapshots, persisted, instance)
        finally:
            await instance.close()

    asyncio.run(run())


def test_completed_with_provider_error_records_presence_without_error_content(tmp_path):
    expected = {
        **DEFAULTS, "failure_code": "incomplete_turn", "terminal_items_view": "full",
        "terminal_error_present": True, "completed_message_count": 1,
        "completed_final_answer_count": 1,
    }
    asyncio.run(exercise(
        tmp_path, "success", expected,
        terminal={"error": {"message": PRIVATE_TEXT, "reasoning": HIDDEN_TEXT}}))


@pytest.mark.parametrize("view", [PRIVATE_TEXT, None, {"private": PRIVATE_TEXT}])
def test_invalid_terminal_view_records_only_fixed_invalid_marker(tmp_path, view):
    expected = {
        **DEFAULTS, "failure_code": "protocol_error",
        "terminal_items_view": "invalid", "terminal_error_present": False,
    }
    asyncio.run(exercise(
        tmp_path, "success", expected, terminal={"itemsView": view}))


@pytest.mark.parametrize("bad_item", [
    {"id": "bad", "type": "agentMessage", "phase": PRIVATE_TEXT, "text": PRIVATE_TEXT},
    {"id": "bad", "type": "agentMessage", "phase": "final_answer", "text": [PRIVATE_TEXT]},
    {"id": "answer-1", "type": "agentMessage", "phase": "commentary", "text": PRIVATE_TEXT},
])
def test_malformed_or_conflicting_message_does_not_increment_completed_counts(tmp_path, bad_item):
    good_item = {
        "id": "answer-1", "type": "agentMessage",
        "phase": "final_answer", "text": PRIVATE_TEXT,
    }
    expected = {
        **DEFAULTS, "failure_code": "protocol_error", "terminal_items_view": "full",
        "terminal_error_present": False, "completed_message_count": 1,
        "completed_final_answer_count": 1,
    }
    asyncio.run(exercise(
        tmp_path, "success", expected, terminal={"items": [good_item, bad_item]}))


def test_failure_is_recorded_before_interrupt_cleanup_and_cannot_be_overwritten(tmp_path):
    async def run():
        writer, snapshots, record = recorder(tmp_path)
        instance = client(tmp_path, "hang", isolation_verified=True, on_receipt=record)
        entered, release = asyncio.Event(), asyncio.Event()
        original_interrupt = instance._interrupt_request

        async def delayed_interrupt(active):
            entered.set()
            await release.wait()
            return await original_interrupt(active)

        instance._interrupt_request = delayed_interrupt
        await instance.start()
        task = None
        try:
            instance.begin_request("diagnostic-request")
            task = asyncio.create_task(invoke(instance))
            await asyncio.wait_for(entered.wait(), 2)
            assert not task.done()
            assert snapshots[-1]["failure_code"] == "outcome_unknown"
            assert read_receipt(writer)["failure_code"] == "outcome_unknown"
            assert snapshots[-1]["terminal_status"] is None
            assert snapshots[-1]["answer_selection"] is None
            release.set()
            with pytest.raises(RPCError) as error:
                await task
            assert error.value.code == "outcome_unknown"
            instance.finish_request("uncertain", failure_code="closed")
            assert read_receipt(writer)["failure_code"] == "outcome_unknown"
            methods = [row.get("method") for row in requests(instance)]
            assert methods.count("thread/start") == methods.count("turn/start") == 1
            assert_private(snapshots, read_receipt(writer), instance)
        finally:
            release.set()
            if task is not None:
                await asyncio.gather(task, return_exceptions=True)
            await instance.close()

    asyncio.run(run())


def test_finish_maps_unknown_failure_to_safe_code_and_new_request_resets_diagnostics(tmp_path):
    writer, snapshots, record = recorder(tmp_path)
    instance = client(tmp_path, on_receipt=record)
    instance.begin_request("diagnostic-request")
    instance.finish_request("not_submitted", failure_code=PRIVATE_TEXT)
    assert diagnostics(read_receipt(writer)) == {**DEFAULTS, "failure_code": "unavailable"}
    instance.finish_request("failed", failure_code="protocol_error")
    assert snapshots[-1]["failure_code"] == "unavailable"
    instance.begin_request("next-request")
    assert diagnostics(snapshots[-1]) == DEFAULTS
    assert_private(snapshots, read_receipt(writer), instance)
    assert requests(instance) == []
