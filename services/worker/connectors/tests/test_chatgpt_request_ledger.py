"""Bounded request-ID retirement using current synthetic clients/owned pipe children.

No managed factory, account, provider, device or historical QA fake is used.
"""

import asyncio
from contextlib import asynccontextmanager

import pytest

from services.worker.connectors import chatgpt_live as live, chatgpt_local as local
from services.worker.connectors.tests.test_chatgpt_live import (
    EXAMPLE, bridge as live_bridge, start, turn,
)
from services.worker.connectors.tests.test_chatgpt_live_stream import (
    ConnectionClient, envelope, line,
)
from services.worker.connectors.tests.test_chatgpt_local import (
    MODEL, ask_request, fixture_bridge, response, rpc_stream,
)
from services.worker.connectors.tests.test_chatgpt_rpc import MODEL as RPC_MODEL, requests


VERSIONS = (local.VERSION, local.LIVE_VERSION)


def overflow_error(value, version):
    assert set(value) == {"id", "error"}
    if version == local.VERSION:
        assert value["error"] == {"code": "unavailable", "message": local.ERRORS["unavailable"]}
    else:
        assert value["error"] == {"code": "unavailable", "submission": "not_submitted"}


async def retired(task):
    done, _ = await asyncio.wait({task}, timeout=local.TERMINAL_REPLY_SECONDS + local.SHUTDOWN_SECONDS + 1)
    assert task in done, "ID ledger exhausted, but foreground stream remains alive awaiting parent input"
    await task


@pytest.mark.parametrize("version", VERSIONS)
def test_exact_4096_id_boundary_rejects_replay_without_clearing_then_retires(monkeypatch, version):
    """Exercise the actual production bound; no seeded ledger or smaller constant."""
    module, name = ((local, "SubscriptionBridge") if version == local.VERSION
                    else (live, "LiveSubscriptionBridge"))
    original, owners = getattr(module, name), []

    class ObservedBridge(original):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            owners.append(self)

    monkeypatch.setattr(module, name, ObservedBridge)
    assert local.MAX_HISTORY == live.MAX_HISTORY == 4096

    async def run():
        client, incoming, outgoing = ConnectionClient(), asyncio.Queue(), asyncio.Queue()
        task = asyncio.create_task(local.run_stream(incoming.get, outgoing.put_nowait, client))
        try:
            for index in range(4096):
                incoming.put_nowait(line(envelope(version, f"check-{index}")))
                reply = await asyncio.wait_for(outgoing.get(), 2)
                assert reply["id"] == f"check-{index}" and "result" in reply
            owner = owners[0]
            retained = owner.rpc_ids.copy()
            assert len(retained) == 4096 and "check-0" in retained
            incoming.put_nowait(line(envelope(version, "check-0")))
            duplicate = await asyncio.wait_for(outgoing.get(), 2)
            assert duplicate["error"]["code"] == "invalid_request"
            assert owner.rpc_ids == retained
            assert sum(call[0].startswith("connection_read") for call in client.calls) == 4096
            incoming.put_nowait(line(envelope(version, "overflow")))
            overflow_error(await asyncio.wait_for(outgoing.get(), 2), version)
            await retired(task)
            assert client.closed and owner.rpc_ids == retained
            assert [call[0] for call in client.calls].count("start") == 1
            assert not any(call[0] in ("ask", "turn/start", "login_start") for call in client.calls)
            assert outgoing.empty()
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())


@asynccontextmanager
async def direct_owner(version):
    if version == local.LIVE_VERSION:
        async with live_bridge() as c:
            yield c
    else:
        c = await fixture_bridge()
        try:
            yield c
        finally:
            await c.bridge.close()


@pytest.mark.parametrize("version", VERSIONS)
@pytest.mark.parametrize("control", ["stop", "cancel"])
def test_full_ledger_still_honors_scoped_stop_or_cancel_before_submission(ask_request, version, control):
    async def run():
        async with direct_owner(version) as c:
            if version == local.VERSION:
                method, params = "ask/start", {"request": ask_request, "model": MODEL}
            else:
                c.client.before_thread.clear()
                method, params = "companion/turn", turn("active")
            await c.bridge.handle(envelope(version, "active-rpc", method, params))
            if version == local.VERSION:
                await asyncio.wait_for(c.client.entered.wait(), 1)
                method = "session/stop" if control == "stop" else "ask/cancel"
                params = ({"capture_session_id": ask_request["context"]["capture_session_id"]}
                          if control == "stop" else {"request_id": ask_request["request_id"]})
                wrong = {next(iter(params)): "unrelated"}
            else:
                await asyncio.sleep(0)
                method = "companion/stop" if control == "stop" else "companion/interrupt"
                params = {"session_id": EXAMPLE["session_id"], "epoch": 1}
                if control == "cancel":
                    params["request_id"] = "active"
                wrong = {**params, "session_id": "unrelated"}
            active = c.bridge.active
            await c.bridge.handle(envelope(version, "unrelated-control", method, wrong))
            await response(c, "unrelated-control")
            assert not active.cancelled.is_set()
            # Only this fixture setup is synthetic; the actual 4096-entry path
            # is exercised separately above. Preserve all original replay IDs.
            c.bridge.rpc_ids.update(f"retained-{i}" for i in range(4096 - len(c.bridge.rpc_ids)))
            retained = c.bridge.rpc_ids.copy()
            await c.bridge.handle(envelope(version, "matching-control", method, params))
            assert active.cancelled.is_set(), "Ledger exhaustion must not prevent a matching control fence"
            reply = await response(c, "matching-control")
            assert reply["result"] == ({} if version == local.VERSION and control == "stop"
                                       else {"cancelled": True, "uncertain": False})
            assert c.bridge.rpc_ids == retained
            if version == local.VERSION:
                c.client.allow_send.set()
                c.client.complete.set()
            else:
                c.client.before_thread.set()
            await asyncio.wait_for(active.task, 1)
            assert not any(row.get("id") == "active-rpc" and "result" in row for row in c.emitted)
            assert (not any(call[0] == "turn/start" for call in c.client.calls)
                    if version == local.VERSION else c.client.turn_writes == 0)

    asyncio.run(run())


@pytest.mark.parametrize("version", VERSIONS)
@pytest.mark.parametrize("terminal_request", ["read", "stop", "cancel"])
def test_overflow_reaps_owned_child_and_only_explicit_new_connector_can_continue(
    tmp_path, monkeypatch, ask_request, version, terminal_request,
):
    """Real RPC pipes to the current fake child; smaller cap keeps this focused."""
    monkeypatch.setattr(local, "MAX_HISTORY", 3)
    monkeypatch.setattr(live, "MAX_HISTORY", 3)

    async def run():
        async with rpc_stream(tmp_path, "hang") as old:
            old.send(envelope(version, "check"))
            assert "result" in await response(old, "check")
            if version == local.VERSION:
                old.send(envelope(version, "second-check"))
                assert "result" in await response(old, "second-check")
                request_method, params = "ask/start", {"request": ask_request, "model": RPC_MODEL}
            else:
                old.send(envelope(version, "start", "companion/start", start(model=RPC_MODEL)))
                assert "result" in await response(old, "start")
                request_method, params = "companion/turn", turn("active")
            old.send(envelope(version, "active-rpc", request_method, params))
            async with asyncio.timeout(2):
                while not old.receipts or old.receipts[-1]["submission"] != "acknowledged":
                    await asyncio.sleep(.001)
            if terminal_request == "read":
                old.send(envelope(version, "overflow"))
                overflow_error(await response(old, "overflow"), version)
            else:
                if version == local.VERSION:
                    method = "session/stop" if terminal_request == "stop" else "ask/cancel"
                    params = ({"capture_session_id": ask_request["context"]["capture_session_id"]}
                              if terminal_request == "stop" else {"request_id": ask_request["request_id"]})
                else:
                    method = "companion/stop" if terminal_request == "stop" else "companion/interrupt"
                    params = {"session_id": EXAMPLE["session_id"], "epoch": 1}
                    if terminal_request == "cancel":
                        params["request_id"] = "active"
                old.send(envelope(version, "overflow-control", method, params))
                control_result = (await response(old, "overflow-control"))["result"]
                assert control_result == ({} if version == local.VERSION and terminal_request == "stop"
                                          else {"cancelled": True, "uncertain": False})
            await retired(old.task)
            assert old.client._process.returncode is not None
            assert old.receipts[-1]["outcome"] == ("uncertain" if terminal_request == "read" else "cancelled")
            assert old.receipts[-1]["submission"] in ("written", "acknowledged", "uncertain")
            assert not any(row.get("id") == "active-rpc" and "result" in row for row in old.emitted)
            if terminal_request == "read":
                active_replies = [row for row in old.emitted if row.get("id") == "active-rpc"]
                if version == local.VERSION:
                    assert active_replies == [], "Legacy EOF must preserve the submitted ASK's unknown outcome"
                else:
                    for reply in active_replies:
                        assert reply["error"]["submission"] in ("submitted", "unknown")
                        assert reply["error"]["code"] != "cancelled"
            before = requests(old.client)
            assert sum(row.get("method") == "turn/start" for row in before) == 1
            old.send(envelope(version, "obsolete-check"))
            await asyncio.sleep(0)
            assert requests(old.client) == before
            assert not any(row.get("id") == "obsolete-check" for row in old.emitted)
        # No automatic new owner exists: this explicit test action is the next
        # user Check. It does not resume or replay the previous ASK/session.
        async with rpc_stream(tmp_path) as new:
            new.send(envelope(version, "explicit-new-check"))
            assert "result" in await response(new, "explicit-new-check")
            assert new.client._process.pid != old.client._process.pid and not new.task.done()
            assert new.receipts == []
            assert not any(row.get("method") in ("thread/start", "turn/start") for row in requests(new.client))
            new.incoming.put_nowait(b"")
            await asyncio.wait_for(new.task, 1)

    asyncio.run(run())
