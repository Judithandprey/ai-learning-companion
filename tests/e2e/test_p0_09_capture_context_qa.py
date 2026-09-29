"""Independent QA checks at main 3f37521: QA-14 repair, internal CaptureArchive and
Learning callable context.

Local in-process evidence only: memory store, ASGI transport and synthetic data.
No PostgreSQL, provider, device or G7 acceptance. Confirmed gaps are strict xfail.
"""

import asyncio
import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts import validation as v1
from packages.contracts.process_v2 import validation as v2

ROOT = Path(__file__).resolve().parents[2]
CORE = json.loads((ROOT / "packages/contracts/examples/core.json").read_text())
NOW = datetime(2026, 9, 28, tzinfo=timezone.utc)


def post_raw(path, body, scopes=("events:write", "sources:write")):
    httpx = pytest.importorskip("httpx")
    from services.api.app import create_app
    from services.api.auth import LocalTestAuthenticator, Principal
    from services.api.domain import Archive
    from services.api.storage import MemoryStore

    store = MemoryStore()
    Archive(store, clock=lambda: NOW).set_authorization("fixture-user")
    auth = LocalTestAuthenticator({"t": Principal("fixture-user", frozenset(scopes), NOW + timedelta(hours=1))})
    app = create_app(store, auth, clock=lambda: NOW)

    async def post():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://backend.test") as client:
            return await client.post(path, content=body, headers={
                "Authorization": "Bearer t", "Idempotency-Key": "qa-14-http", "Content-Type": "application/json"})

    response = asyncio.run(post())
    return response.status_code, response.json()


def nested_in(document, place, depth):
    place(document, "__QA_NEEDLE__")
    return json.dumps(document).replace('"__QA_NEEDLE__"', "[" * depth + "]" * depth)


def events_body(depth):
    return nested_in(copy.deepcopy(CORE["EventBatch"]), lambda d, v: d["events"][0].__setitem__("text", v), depth)


def sources_body(depth):
    document = {"original_url": "https://example.invalid/course/qa14", "project_id": "robotics"}
    return nested_in(document, lambda d, v: d.__setitem__("project_id", v), depth)


@pytest.mark.parametrize("make", [events_body, sources_body], ids=["events", "sources"])
@pytest.mark.parametrize("depth", [65, 52000, 1_000_000])
def test_qa14_raw_nested_http_bodies_are_422_without_echo(make, depth):
    path = "/v1/events:batch" if make is events_body else "/v1/sources"
    status, payload = post_raw(path, make(depth))
    assert (status, payload["code"]) == (422, "invalid_request")
    assert "[[" not in json.dumps(payload)


@pytest.mark.parametrize("module", [v1, v2], ids=["v1", "v2"])
def test_qa14_depth_error_is_payload_free_and_renderable(module):
    value = "qa-secret-original"
    for _ in range(52000):
        value = [value]
    with pytest.raises(ValidationError) as caught:
        module.validate("Identifier", value)
    rendered = str(caught.value) + repr(caught.value)
    assert "qa-secret-original" not in rendered and "[[" not in rendered


def test_qa14_guard_boundary_counts_the_leaf_position():
    # EventBatch.events[0].text sits at depth 3; the guard allows a leaf at depth 64.
    def chain(depth):
        value = "leaf"
        for _ in range(depth):
            value = [value]
        batch = copy.deepcopy(CORE["EventBatch"])
        batch["events"][0]["text"] = value
        return batch

    with pytest.raises(ValidationError) as schema_error:
        v1.validate("EventBatch", chain(61))
    assert "structural depth" not in str(schema_error.value)
    with pytest.raises(ValidationError, match="structural depth"):
        v1.validate("EventBatch", chain(62))


# --- Internal CaptureArchive (Backend 75f4e33 -> main 76f206c) -------------------

def capture_setup():
    from services.api.storage import MemoryStore
    from services.api.tests.test_capture import USER, capture_fixture
    return USER, capture_fixture(MemoryStore(), USER)


def domain_failure(action):
    from services.api.errors import DomainError
    try:
        action()
    except DomainError as error:
        return error.status, error.code
    return "accepted"


def test_capture_same_key_replay_after_stop_is_denied_before_the_cache():
    from services.api.tests.test_capture import control
    user, setup = capture_setup()
    setup.capture.ingest(user, setup.batch, "qa-stop")
    control(setup.store, setup.batch["stream_id"], live_capture_allowed=False)
    assert domain_failure(lambda: setup.capture.ingest(user, setup.batch, "qa-stop")) == (409, "capture_stopped")


def test_capture_same_key_replay_after_source_deletion_is_404_and_keeps_no_body():
    user, setup = capture_setup()
    setup.batch["records"][0]["evidence"]["reason_quote"] = "QA-SECRET-QUOTE"
    setup.capture.ingest(user, setup.batch, "qa-delete")
    setup.archive.delete_source(user, setup.core["SourceSnapshot"]["source_id"])
    assert domain_failure(lambda: setup.capture.ingest(user, setup.batch, "qa-delete")) == (404, "not_found")
    with setup.store.transaction(user) as tx:
        assert "QA-SECRET-QUOTE" not in repr(tx.documents)


@pytest.mark.parametrize("field, value", [("scopes", "xprocess:capturex"), ("capabilities", "process.capture.v0.20")])
@pytest.mark.xfail(strict=True, reason="CAPTURE-AUTH-01 (prior AUTH-01): string scopes/capabilities pass by substring membership")
def test_capture_rejects_non_set_authority_scopes(field, value):
    import dataclasses
    user, setup = capture_setup()
    resolver = setup.capture.resolve
    setup.capture.resolve = lambda tx, user_id, stream_id: dataclasses.replace(resolver(tx, user_id, stream_id), **{field: value})
    assert domain_failure(lambda: setup.capture.ingest(user, setup.batch, "qa-scope")) != "accepted"


# --- Learning callable context (d25efe8/a299477 -> 772e579/4e7242f) ---------------

def context_inputs():
    from services.learning.archive import FixtureArchive
    from services.learning.retrieval import RetrievalIndex
    archive = FixtureArchive.load(ROOT / "tests/fixtures/memory")
    return archive, RetrievalIndex(archive)


def test_context_budget_is_exact_whole_item_and_truthful_across_a_sweep():
    from services.learning.archive import canonical
    from services.learning.context import assemble_context
    archive, index = context_inputs()
    query = {"text": "basis physical arrow", "project_id": "algebra", "actor": "user"}
    full = assemble_context(archive, index, query, user_id="synthetic-learner", top_k=2, max_bytes=10**6)
    originals = {item["evidence"]["event_id"]: item for item in full["items"]}
    assert [item["origin"] for item in full["items"]] == ["retrieval", "retrieval", "correction_neighbor"]
    envelope = None
    for max_bytes in range(1000, len(canonical(full)) + 2, 37):
        try:
            packet = assemble_context(archive, index, query, user_id="synthetic-learner", top_k=2, max_bytes=max_bytes)
        except ValueError:
            assert envelope is None
            continue
        envelope = envelope or max_bytes
        budget, items = packet["budget"], packet["items"]
        assert len(canonical(packet)) <= max_bytes
        assert all(item == originals[item["evidence"]["event_id"]] for item in items)
        ranked = sum(item["origin"] == "retrieval" for item in items)
        assert budget["included_item_count"] == len(items) and budget["eligible_item_count"] == 3
        assert budget["omitted_retrieval_items"] == 2 - ranked >= 0
        assert budget["omitted_correction_items"] == 1 - (len(items) - ranked) >= 0
        assert budget["status"] == ("complete_for_eligible_items" if len(items) == 3 else "limited")


@pytest.mark.xfail(strict=True, reason="CONTEXT-ACCESS-03: a retrieval hit rejected by the context re-check is counted as budget-omitted and the neighbor count goes negative")
def test_context_omission_counts_stay_non_negative_when_a_hit_is_rejected():
    from services.learning.context import assemble_context
    archive, index = context_inputs()
    search = index.search

    def with_out_of_scope_hit(query, **kwargs):
        found = search(query, **kwargs)
        found["hits"].append({**found["hits"][0], "user_id": "other-user"})
        return found

    index.search = with_out_of_scope_hit
    packet = assemble_context(archive, index, {"text": "basis physical arrow", "project_id": "algebra", "actor": "user"},
                              user_id="synthetic-learner", top_k=2, max_bytes=10**6)
    assert packet["budget"]["omitted_correction_items"] >= 0
    assert packet["budget"]["status"] == "complete_for_eligible_items" or packet["budget"]["omitted_retrieval_items"] == 0
