"""Synthetic pixels exercise the authorized Backend -> Learning composition.

MemoryStore and test-only frame insertion do not prove production capture, a
provider receipt, PostgreSQL ordering, or a real-device annotation path.
"""

import asyncio
import base64
import binascii
from concurrent.futures import CancelledError as FutureCancelledError, Future
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
from types import SimpleNamespace
import zlib

import pytest

from services.api.domain import Archive, checked, key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import MemoryStore
from services.learning.archive import ArchiveSnapshot
from services.learning.context import assemble_context
from services.learning.images import materialize_image_evidence
from services.learning.retrieval import RetrievalIndex


USER = "fixture-user"
EXAMPLES = Path(__file__).resolve().parents[3] / "packages/contracts/examples"


def png():
    """Project-authored TEST DATA: a real 2 x 2 RGB PNG, never user history."""
    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data)))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
            + chunk(b"tEXt", b"Comment\0SYNTHETIC TEST DATA, test_only.")
            + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff\0\0" * 2) * 2))
            + chunk(b"IEND", b""))


@pytest.fixture
def setup():
    core = json.loads((EXAMPLES / "core.json").read_text())
    store = MemoryStore()
    archive = Archive(store, clock=lambda: datetime(2026, 9, 29, tzinfo=timezone.utc))
    state = archive.set_authorization(USER)
    calls = []

    def guard(current):
        calls.append(deepcopy(current))
        if current["generation"] != state["generation"]:
            raise DomainError(403, "forbidden")

    archive.authorization_guard = guard
    data = png()
    frame = {**core["Frame"], "artifact_id": "synthetic-rgb-original",
             "width": 2, "height": 2, "content_hash": hashlib.sha256(data).hexdigest()}
    archive.import_fixture(USER, core["SourceSnapshot"], frame, data)
    archive.events(USER, {"contract_version": "0.1.0", "events": [core["Observation"]]})
    return SimpleNamespace(store=store, archive=archive, guard=guard, calls=calls,
                           source=core["SourceSnapshot"], frame=frame, data=data,
                           resolver=AuthorizedImageResolver(store, USER, guard))


def compose(setup, *, mode="history"):
    exported = setup.archive.export_learning_snapshot(USER, [setup.source["source_id"]])
    archive = ArchiveSnapshot(**exported, user_id=USER)
    context = assemble_context(archive, RetrievalIndex(archive),
                               {"text": "left right multiplication", "mode": mode}, user_id=USER)
    assert len(context["items"]) == 1
    return archive, context


def materialize(setup, archive, context, **kwargs):
    return materialize_image_evidence(archive, context, setup.resolver, user_id=USER, **kwargs)


def typed_frame(setup, *, data=None, kind="screen_image", media_type="image/png"):
    data = setup.data if data is None else data
    source = {field: setup.frame[field] for field in ("user_id", "source_id", "source_version")}
    reference = {"artifact_id": "typed-original", "sha256": hashlib.sha256(data).hexdigest(),
                 "byte_length": len(data), "media_type": media_type}
    OriginalArtifacts(setup.store, setup.guard).put(USER, source, kind, reference, data)
    frame = {**setup.frame, "frame_id": "typed-frame", "artifact_id": reference["artifact_id"],
             "content_hash": reference["sha256"]}
    # Explicit test-only linkage after the real upload seam. There is no
    # production frame ingress; do not weaken import_fixture's synthetic gate.
    checked("Frame", frame)
    with setup.store.transaction(USER) as tx:
        Archive._immutable(tx, "frame", frame["frame_id"], frame)
    return frame


def row(setup, kind, identity):
    """Explicit corruption injection; bypass immutability only in this test."""
    return setup.store._documents[USER][(kind, identity)]


def test_cancelled_future_guard_propagates_without_publishing_bytes(setup):
    before = deepcopy(setup.store._documents)
    future = Future()
    assert future.cancel()
    published = []

    def guard(state):
        setup.guard(state)
        future.result()

    resolver = AuthorizedImageResolver(setup.store, USER, guard)
    with pytest.raises(FutureCancelledError):
        published.append(resolver(setup.frame, max_bytes=len(setup.data)))
    assert published == [] and setup.store._documents == before


@pytest.mark.parametrize("phase", ["enter", "read", "exit"])
def test_cancelled_future_transaction_propagates_without_partial_bytes(setup, monkeypatch, phase):
    before = deepcopy(setup.store._documents)
    original_transaction = setup.store.transaction
    future = Future()
    assert future.cancel()
    reached, published = [], []

    def cancel():
        reached.append(phase)
        future.result()

    @contextmanager
    def cancelled_transaction(actor):
        if phase == "enter":
            cancel()
        with original_transaction(actor) as tx:
            def get(kind, identity):
                value = tx.get(kind, identity)
                if phase == "read" and kind == "artifact":
                    cancel()
                return value

            yield SimpleNamespace(get=get)
            if phase == "exit":
                cancel()

    with monkeypatch.context() as patch:
        patch.setattr(setup.store, "transaction", cancelled_transaction)
        with pytest.raises(FutureCancelledError):
            published.append(setup.resolver(setup.frame, max_bytes=len(setup.data)))
    assert reached == [phase] and published == []
    assert setup.store._documents == before


@pytest.mark.parametrize("exception_type", [asyncio.CancelledError, KeyboardInterrupt])
def test_image_guard_base_exceptions_propagate_unchanged(setup, exception_type):
    before = deepcopy(setup.store._documents)
    exception = exception_type("synthetic cancellation")
    published = []

    def guard(state):
        setup.guard(state)
        raise exception

    resolver = AuthorizedImageResolver(setup.store, USER, guard)
    with pytest.raises(exception_type) as exc:
        published.append(resolver(setup.frame, max_bytes=len(setup.data)))
    assert exc.value is exception
    assert published == [] and setup.store._documents == before


def test_real_png_composes_from_fixture_ingest_to_learning_without_changing_originals(setup):
    archive, context = compose(setup)
    before = deepcopy(setup.store._documents), deepcopy(context)
    output = materialize(setup, archive, context)
    assert output["attached_bytes"] == len(setup.data)
    item = output["items"][0]
    assert item["status"] == "attached" and item["data"] == setup.data
    assert item["reference"]["frame"] == setup.frame
    assert item["evidence_kind"] == "synthetic_image"
    for field in ("source_hash", "captured_at", "received_at", "media_position", "actor", "provenance"):
        assert item["reference"][field] == context["items"][0]["evidence"][field]
    assert output["live_status"] == output["provider_receipt"] == "not_attested"
    assert output["presentation_permission"] == "not_granted"
    assert output["capture_completeness"] == "unknown"
    assert (setup.store._documents, context) == before
    assert not row(setup, "session", setup.frame["session_id"])["live_capture"]


def test_materializer_byte_limit_does_not_fall_back_to_detached_bytes(setup):
    archive, context = compose(setup)
    assert archive.artifacts[setup.frame["artifact_id"]] == setup.data
    result = materialize(setup, archive, context, max_image_bytes=len(setup.data) - 1)
    assert result["attached_bytes"] == 0
    assert result["items"][0]["status"] == "byte_limit"
    assert "data" not in result["items"][0]


def test_new_source_head_preserves_authorized_historical_image_without_restarting_capture(setup):
    archive, context = compose(setup)
    source = {**setup.source, "source_version": 2, "text": "A new synthetic source revision."}
    source["content_hash"] = hashlib.sha256(source["text"].encode()).hexdigest()
    frame = {**setup.frame, "source_version": 2, "frame_id": "newer-frame",
             "artifact_id": "newer-original"}
    setup.archive.import_fixture(USER, source, frame, setup.data)
    assert row(setup, "source", source["source_id"])["current_version"] == 2
    result = materialize(setup, archive, context)
    assert result["items"][0]["status"] == "attached"
    assert result["items"][0]["reference"]["frame"] == setup.frame
    assert result["items"][0]["data"] == setup.data
    assert result["items"][0]["context_mode"] == "history"
    assert not row(setup, "session", frame["session_id"])["live_capture"]


@pytest.mark.parametrize("typed", [False, True])
def test_available_image_returns_exact_immutable_bytes_and_detached_frame(setup, typed):
    frame = typed_frame(setup) if typed else deepcopy(setup.frame)
    request = deepcopy(frame)
    result = setup.resolver(request, max_bytes=len(setup.data))
    assert result == {"status": "available", "frame": frame,
                      "media_type": "image/png", "data": setup.data}
    assert type(result["data"]) is bytes and result["frame"] is not request
    request["width"] = 300
    result["frame"]["height"] = 400
    assert setup.resolver(frame, max_bytes=len(setup.data))["frame"] == frame


@pytest.mark.parametrize("change,status", [("source_revoke", "revoked"), ("disable", "revoked"),
    ("generation", "revoked"), ("delete", "missing"), ("blob_loss", "missing"),
    ("corrupt_bytes", "unavailable")])
def test_materialization_rechecks_current_store_after_context_build(setup, change, status):
    archive, context = compose(setup)
    assert archive.artifacts[setup.frame["artifact_id"]] == setup.data
    if change == "source_revoke":
        setup.archive.revoke_source(USER, setup.source["source_id"])
    elif change in {"disable", "generation"}:
        setup.archive.set_authorization(USER, enabled=change == "generation")
    elif change == "delete":
        setup.archive.delete_source(USER, setup.source["source_id"])
    elif change == "blob_loss":
        with setup.store.transaction(USER) as tx:
            tx.delete("artifact", setup.frame["artifact_id"])
    else:
        row(setup, "artifact", setup.frame["artifact_id"])["data_base64"] = "broken"
    output = materialize(setup, archive, context)
    assert output["attached_bytes"] == 0
    assert output["items"][0]["status"] == status and "data" not in output["items"][0]


@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_id", "another-source"), ("source_version", 2),
    ("source_version", True), ("artifact_id", "another-artifact"), ("content_hash", "0" * 64),
    ("device_id", "another-device"), ("session_id", "another-session"),
    ("captured_at", "2026-01-01T00:00:00Z"), ("source_timezone", "UTC"),
    ("media_position", 13.5), ("width", 3), ("height", 3), ("representation", "screen_capture"),
])
def test_no_partial_frame_match_can_read_an_original(setup, field, value):
    frame = {**deepcopy(setup.frame), field: value}
    assert setup.resolver(frame, max_bytes=4096) == {"status": "unavailable"}


@pytest.mark.parametrize("kind,identity,field,value", [
    ("frame", "frame-1", "user_id", "other-user"),
    ("frame", "frame-1", "width", 3),
    ("source", "linear-algebra", "user_id", "other-user"),
    ("source", "linear-algebra", "source_id", "another-source"),
    ("snapshot", key("linear-algebra", 1), "user_id", "other-user"),
    ("snapshot", key("linear-algebra", 1), "source_id", "another-source"),
    ("snapshot", key("linear-algebra", 1), "source_version", 2),
    ("snapshot", key("linear-algebra", 1), "content_hash", "0" * 64),
    ("artifact", "synthetic-rgb-original", "user_id", "other-user"),
    ("artifact", "synthetic-rgb-original", "id", "another-artifact"),
    ("artifact", "synthetic-rgb-original", "content_hash", "0" * 64),
])
def test_corrupted_authoritative_links_cannot_supply_bytes(setup, kind, identity, field, value):
    row(setup, kind, identity)[field] = value
    assert setup.resolver(setup.frame, max_bytes=4096) == {"status": "unavailable"}


@pytest.mark.parametrize("kind,identity", [("frame", "frame-1"), ("source", "linear-algebra"),
    ("snapshot", key("linear-algebra", 1)), ("artifact", "synthetic-rgb-original")])
def test_missing_required_record_is_missing_not_an_empty_image(setup, kind, identity):
    with setup.store.transaction(USER) as tx:
        tx.delete(kind, identity)
    assert setup.resolver(setup.frame, max_bytes=4096) == {"status": "missing"}


@pytest.mark.parametrize("tombstone", ["original_artifact_tombstone", "capture_artifact_tombstone"])
def test_tombstones_fence_remaining_typed_bytes(setup, tombstone):
    frame = typed_frame(setup)
    with setup.store.transaction(USER) as tx:
        tx.put(tombstone, frame["artifact_id"], {"artifact_id": frame["artifact_id"]})
    assert setup.resolver(frame, max_bytes=4096) == {"status": "missing"}


@pytest.mark.parametrize("change", ["source", "version", "owner", "hash", "length", "media", "lost_binding"])
def test_typed_binding_and_legacy_aliases_must_agree(setup, change):
    frame = typed_frame(setup)
    blob = row(setup, "artifact", frame["artifact_id"])
    binding = blob["original_binding"]
    if change in {"source", "version", "owner"}:
        field, value = {"source": ("source_id", "another-source"),
                        "version": ("source_version", 2), "owner": ("user_id", "other-user")}[change]
        binding["source"][field] = value
    elif change == "hash":
        binding["artifact"]["sha256"] = "0" * 64
    elif change == "length":
        binding["artifact"]["byte_length"] += 1
    elif change == "media":
        blob["media_type"] = "image/jpeg"
    else:
        del blob["original_binding"]
    assert setup.resolver(frame, max_bytes=4096) == {"status": "unavailable"}


@pytest.mark.parametrize("data,media_type,kind,status", [
    (b"\xff\xd8synthetic JPEG\xff\xd9", "image/jpeg", "screen_image", "unobservable"),
    (b"<svg>synthetic TEST DATA</svg>", "image/png", "screen_image", "unobservable"),
    # A Frame referencing ink is a corrupt authoritative binding, unlike JPEG.
    (b'{"strokes":[]}', "application/json", "editable_ink", "unavailable"),
])
def test_unsupported_or_wrongly_bound_originals_cannot_become_images(setup, data, media_type, kind, status):
    frame = typed_frame(setup, data=data, media_type=media_type, kind=kind)
    assert setup.resolver(frame, max_bytes=4096) == {"status": status}


def test_legacy_svg_and_dom_are_not_rendered_as_pixels(setup):
    core = json.loads((EXAMPLES / "core.json").read_text())
    svg_frame = {**core["Frame"], "frame_id": "svg-frame"}
    setup.archive.import_fixture(USER, setup.source, svg_frame, (EXAMPLES / "frame.svg").read_bytes())
    assert setup.resolver(svg_frame, max_bytes=4096) == {"status": "unobservable"}
    dom_frame = {**setup.frame, "frame_id": "dom-frame", "representation": "dom_snapshot"}
    checked("Frame", dom_frame)
    with setup.store.transaction(USER) as tx:
        Archive._immutable(tx, "frame", dom_frame["frame_id"], dom_frame)
    assert setup.resolver(dom_frame, max_bytes=4096) == {"status": "unobservable"}


@pytest.mark.parametrize("typed", [False, True])
@pytest.mark.parametrize("encoding", ["broken", "whitespace", "padding_bits"])
def test_base64_is_strict_and_canonical(setup, typed, encoding):
    frame = typed_frame(setup) if typed else setup.frame
    blob = row(setup, "artifact", frame["artifact_id"])
    if encoding == "broken":
        blob["data_base64"] = "@@@="
    elif encoding == "whitespace":
        blob["data_base64"] += "\n"
    else:
        # Alter only unused padding bits: bytes and original hashes still match.
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        encoded = blob["data_base64"]
        assert encoded.endswith("==")
        changed = alphabet[alphabet.index(encoded[-3]) + 1]
        blob["data_base64"] = encoded[:-3] + changed + "=="
        assert base64.b64decode(blob["data_base64"], validate=True) == setup.data
    assert setup.resolver(frame, max_bytes=4096) == {"status": "unavailable"}


@pytest.mark.parametrize("typed", [False, True])
def test_byte_limit_is_enforced_before_base64_decode(setup, typed, monkeypatch):
    frame = typed_frame(setup) if typed else setup.frame
    calls = []

    def no_decode(*args, **kwargs):
        calls.append(True)
        raise AssertionError("oversized original must not be decoded")

    monkeypatch.setattr(binascii, "a2b_base64", no_decode)
    assert setup.resolver(frame, max_bytes=len(setup.data) - 1) == {"status": "byte_limit"}
    assert calls == []


@pytest.mark.parametrize("value", [0, -1, True, False, 1.5, "100", None])
def test_max_bytes_requires_positive_integer(setup, value):
    with pytest.raises(ValueError):
        setup.resolver(setup.frame, max_bytes=value)


@pytest.mark.parametrize("guard", [None, False, "guard"])
def test_resolver_requires_callable_current_authorization_guard(setup, guard):
    with pytest.raises((TypeError, ValueError)):
        AuthorizedImageResolver(setup.store, USER, guard)


@pytest.mark.parametrize("status", [401, 403])
def test_guard_denial_is_revoked_and_returns_no_bytes(setup, status):
    def guard(state):
        raise DomainError(status, "forbidden")

    resolver = AuthorizedImageResolver(setup.store, USER, guard)
    assert resolver(setup.frame, max_bytes=4096) == {"status": "revoked"}


def test_point_reads_and_current_guard_share_one_actor_transaction(setup, monkeypatch):
    real_transaction = setup.store.transaction
    activity, reads, guards = [], [], []

    @contextmanager
    def transaction(user_id):
        assert user_id == USER and activity == []
        activity.append("active")
        with real_transaction(user_id) as tx:
            def get(kind, identity):
                assert activity == ["active"]
                reads.append((kind, identity))
                return tx.get(kind, identity)

            def scan(*args):
                pytest.fail("image resolution must not scan unrelated originals")

            yield SimpleNamespace(get=get, scan=scan)
        activity.append("closed")

    def guard(state):
        assert activity == ["active"]
        guards.append(deepcopy(state))
        setup.guard(state)

    monkeypatch.setattr(setup.store, "transaction", transaction)
    result = AuthorizedImageResolver(setup.store, USER, guard)(setup.frame, max_bytes=4096)
    assert result["status"] == "available"
    assert activity == ["active", "closed"] and len(guards) == 1
    assert {("authorization", "state"), ("frame", setup.frame["frame_id"]),
            ("source", setup.source["source_id"]),
            ("snapshot", key(setup.source["source_id"], setup.source["source_version"])),
            ("artifact", setup.frame["artifact_id"])} <= set(reads)


@pytest.mark.parametrize("failure", ["open", "read", "commit", "guard"])
def test_unexpected_failure_cannot_use_detached_snapshot_bytes(setup, monkeypatch, failure):
    archive, context = compose(setup)
    real_transaction = setup.store.transaction
    calls = []

    @contextmanager
    def fail_transaction(user_id):
        calls.append(user_id)
        if failure == "open":
            raise RuntimeError("synthetic open failure")
        with real_transaction(user_id) as tx:
            if failure == "read":
                def get(*args):
                    raise RuntimeError("synthetic read failure")
                yield SimpleNamespace(get=get)
            else:
                yield tx
                raise RuntimeError("synthetic commit failure")

    if failure == "guard":
        def guard(state):
            calls.append(state)
            raise RuntimeError("synthetic guard failure")
        setup.resolver = AuthorizedImageResolver(setup.store, USER, guard)
    else:
        monkeypatch.setattr(setup.store, "transaction", fail_transaction)
    result = materialize(setup, archive, context)
    assert len(calls) == 1 and result["attached_bytes"] == 0
    assert result["items"][0]["status"] == "unavailable"
    assert "data" not in result["items"][0]
