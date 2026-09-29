"""Synthetic control/PNG evidence for the explicit shared-display source seam.

These MemoryStore tests call production registration and upload methods. Producer
facts and pixels are synthetic; no physical capture, database, provider receipt,
foreground-app knowledge or original-screen annotation acceptance is claimed.
"""

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
import hashlib

import pytest

from packages.contracts.display_source import validate as validate_display
from packages.contracts.original_artifact import decode_upload
from services.api.control import ControlRegistry
from services.api.domain import key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.original_artifacts import OriginalArtifacts
from services.api.preview import DocumentPreview
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, control_fixture, documents,
    registration, resolve_stop_fact, start, stop_fact,
)
from services.api.tests.test_image_resolver import png
from services.api.tests.test_preview import import_body, save_body


NOW = datetime(2026, 9, 29, 12, tzinfo=timezone.utc)
SOURCE = "shared-display-test-source"


@pytest.fixture
def setup():
    c = control_fixture(MemoryStore(), USER)
    c.registry.capture.archive.clock = lambda: NOW
    c.archive.authorization_guard = lambda state: None
    c.source = {"user_id": USER, "source_id": SOURCE, "source_version": 1}
    c.data = png()
    c.ref = reference(c.data, "synthetic-display-png", "image/png")
    c.ink_data = b'{"test_only":true,"strokes":[{"points":[[1,2],[3,4]]}]}\n'
    c.ink_ref = reference(c.ink_data, "synthetic-display-ink", "application/json")
    c.frame = {**c.core["Frame"], **c.source, "frame_id": "shared-display-test-frame",
               "artifact_id": c.ref["artifact_id"], "content_hash": c.ref["sha256"],
               "width": 2, "height": 2, "representation": "screen_capture"}
    c.batch["records"][0].update(source=c.source, frame_id=c.frame["frame_id"],
                                artifacts=[c.ref, c.ink_ref], media_position=c.frame["media_position"])
    c.originals = OriginalArtifacts(c.store, lambda state: None,
                                   display_authority_resolver=c.registry.resolve_capture)
    return c


def reference(data, identifier, media_type):
    return {"artifact_id": identifier, "media_type": media_type,
            "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data)}


def register(c, source_id=SOURCE, stream_id=None, **options):
    options.setdefault("producer_id", "screen")
    return c.registry.register_display_source(
        c.user, source_id, stream_id or c.batch["stream_id"], **options)


def upload(c):
    c.originals.put(USER, c.source, "screen_image", c.ref, c.data)
    c.originals.put(USER, c.source, "editable_ink", c.ink_ref, c.ink_data)


def ingest(c, batch=None, frames=None, request_key="display-frames"):
    return c.registry.ingest_frames(USER, batch or c.batch, frames or [c.frame], request_key)


def denied(c, action, status=None, code=None):
    before = documents(c)
    with pytest.raises(DomainError) as error:
        action()
    if status is not None:
        assert error.value.status == status
    if code is not None:
        assert error.value.code == code
    assert documents(c) == before
    return error.value


@pytest.fixture
def registered(setup):
    setup.descriptor = register(setup)
    return setup


@pytest.fixture
def captured(registered):
    upload(registered)
    registered.ack = ingest(registered)
    return registered


def test_registration_returns_exact_descriptor_without_invented_source_content(setup):
    c = setup
    descriptor = register(c, project_id="robotics", source_timezone="America/Los_Angeles")
    expected = {"contract_version": "0.2.3", **c.source, "type": "shared_display",
                "device_id": c.batch["device_id"], "session_id": c.batch["session_id"],
                "stream_id": c.batch["stream_id"], "project_id": "robotics",
                "source_timezone": "America/Los_Angeles", "created_at": "2026-09-29T12:00:00Z"}
    assert descriptor == expected
    validate_display(descriptor)
    with c.store.transaction(USER) as tx:
        assert tx.get("snapshot", key(SOURCE, 1)) == expected
        head = tx.get("source", SOURCE)
        assert head["source_id"] == SOURCE and head["current_version"] == 1
        assert not {"original_url", "canonical_url", "text", "content_hash", "foreground_app", "live"} & head.keys()
        assert tx.scan("event") == tx.scan("capture_record") == []
    before = documents(c)
    descriptor["project_id"] = "changed-outside-store"
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    c.registry.capture.archive.clock = lambda: datetime(2030, 1, 1, tzinfo=timezone.utc)
    assert register(c, project_id="robotics", source_timezone="America/Los_Angeles") == expected
    assert c.registry.read_display_source(USER, SOURCE) == expected
    assert documents(c) == before


def test_callable_display_to_typed_originals_to_frame_record_to_current_image(captured):
    c = captured
    assert all(a["status"] == "verified" for a in c.ack["acknowledged"][0]["artifacts"])
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.batch["records"][0]
    assert ingest(c) == c.ack
    assert decode_upload(c.originals.read(USER, c.source, c.ink_ref["artifact_id"]), user_id=USER) == c.ink_data
    result = AuthorizedImageResolver(c.store, USER, lambda state: None)(c.frame, max_bytes=len(c.data))
    assert result == {"status": "available", "frame": c.frame, "media_type": "image/png", "data": c.data}
    with c.store.transaction(USER) as tx:
        assert tx.get("frame", c.frame["frame_id"]) == c.frame
        assert tx.get("snapshot", key(SOURCE, 1)) == c.descriptor
        assert tx.scan("event") == []


@pytest.mark.parametrize("change", ["project", "timezone", "stream"])
def test_source_id_is_exact_replay_identity_and_cannot_change_binding(registered, change):
    c = registered
    options = {"project_id": "robotics"} if change == "project" else {"source_timezone": "America/Los_Angeles"}
    if change == "stream":
        body = registration(c, "other-stream")
        start(c, body, producer="other-producer", request_key="other-stream")
        options = {"stream_id": body["stream_id"], "producer_id": "other-producer"}
    denied(c, lambda: register(c, **options), 409)


@pytest.mark.parametrize("condition,status", [
    ("missing_stream", 404), ("wrong_producer", 403), ("missing_project", 404),
    ("foreign_project", 404), ("legacy_collision", 409), ("invalid_timezone", 422),
])
def test_registration_rejects_identity_and_owned_project_failures(setup, condition, status):
    c = setup
    options = {}
    if condition == "missing_stream":
        options["stream_id"] = "missing-stream"
    elif condition == "wrong_producer":
        options["producer_id"] = "not-this-producer"
    elif condition == "missing_project":
        options["project_id"] = "missing-project"
    elif condition == "foreign_project":
        c.store._documents[USER][("project", "robotics")]["user_id"] = "other-user"
        options["project_id"] = "robotics"
    elif condition == "legacy_collision":
        options["source_id"] = c.core["SourceSnapshot"]["source_id"]
    else:
        options["source_timezone"] = "not-a-timezone"
    denied(c, lambda: register(c, **options), status)


@pytest.mark.parametrize("condition", ["control_scope", "capture_scope", "control_capability",
    "capture_capability", "guard", "generation", "membership", "stop", "withdraw", "producer_stop"])
def test_registration_new_and_replay_recheck_current_control_authority(registered, condition):
    c = registered
    if condition.endswith("scope"):
        c.registry.scopes -= {"process:" + condition.split("_")[0]}
    elif condition.endswith("capability"):
        value = "process.control.v0.2.1" if condition.startswith("control") else "process.capture.v0.2"
        c.registry.capabilities -= {value}
    elif condition == "guard":
        def expired(state):
            raise DomainError(401, "unauthenticated")
        c.registry.capture.archive.authorization_guard = expired
    elif condition == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    elif condition == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    elif condition == "producer_stop":
        stop_fact(c, 1)
    else:
        apply(c, command(c, condition))
    status = 401 if condition == "guard" else 409 if condition == "producer_stop" else 403
    for source_id in (SOURCE, "new-display-after-fence"):
        denied(c, lambda: register(c, source_id), status)


def test_registration_replay_rechecks_project_ownership(setup):
    c = setup
    register(c, project_id="robotics")
    c.store._documents[USER][("project", "robotics")]["user_id"] = "another-user"
    denied(c, lambda: register(c, project_id="robotics"), 404)


@pytest.mark.parametrize("missing", ["snapshot", "head", "head_and_snapshot"])
def test_registration_never_recreates_missing_original_identity(captured, missing):
    c = captured
    if missing != "snapshot":
        del c.store._documents[USER][("source", SOURCE)]
    if missing != "head":
        del c.store._documents[USER][("snapshot", key(SOURCE, 1))]
    denied(c, lambda: register(c), 404 if missing == "snapshot" else 409)


def test_registration_authority_and_both_source_rows_share_one_transaction(setup, monkeypatch):
    c = setup
    original = c.store.transaction
    calls = []

    @contextmanager
    def counted(actor):
        with original(actor) as tx:
            calls.append(actor)
            yield tx

    monkeypatch.setattr(c.store, "transaction", counted)
    register(c)
    assert calls == [USER]


@pytest.mark.parametrize("failure", ["snapshot", "source", "commit"])
def test_registration_failed_write_or_commit_cannot_leave_partial_descriptor(setup, monkeypatch, failure):
    c = setup
    before = documents(c)
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction

    def fail_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure:
            raise RuntimeError("synthetic display write failure")

    @contextmanager
    def fail_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            raise RuntimeError("synthetic display commit failure")

    with monkeypatch.context() as patch:
        if failure == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", fail_write)
        with pytest.raises(RuntimeError, match="synthetic display"):
            register(c)
    assert documents(c) == before
    assert register(c)["source_id"] == SOURCE


def test_original_upload_requires_opted_in_live_resolver_but_historical_read_does_not(captured):
    c = captured
    ordinary = OriginalArtifacts(c.store, lambda state: None)
    denied(c, lambda: ordinary.put(USER, c.source, "screen_image", c.ref, c.data), 403)
    assert decode_upload(ordinary.read(USER, c.source, c.ref["artifact_id"]), user_id=USER) == c.data


@pytest.mark.parametrize("field,value", [
    ("source_versions", {(SOURCE, 1): True}),
    ("source_versions", frozenset({(SOURCE, True)})),
    ("scopes", frozenset({"process:capture", 1})),
    ("capabilities", frozenset({"process.capture.v0.2", 1})),
])
def test_malformed_injected_capture_authority_cannot_grant_display_upload(registered, field, value):
    c = registered

    def malformed(tx, user_id, stream_id):
        return replace(c.registry.resolve_capture(tx, user_id, stream_id), **{field: value})

    originals = OriginalArtifacts(c.store, lambda state: None, display_authority_resolver=malformed)
    denied(c, lambda: originals.put(USER, c.source, "screen_image", c.ref, c.data), 403)


@pytest.mark.parametrize("fence", ["stop", "withdraw", "membership", "generation", "producer_stop"])
def test_display_upload_rechecks_live_authority_even_for_exact_byte_replay(captured, fence):
    c = captured
    if fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "membership":
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    else:
        stop_fact(c, 1)
    for ref in (c.ref, {**c.ref, "artifact_id": "late-display-bytes"}):
        denied(c, lambda: c.originals.put(USER, c.source, "screen_image", ref, c.data))
    assert c.registry.read_display_source(USER, SOURCE) == c.descriptor
    assert decode_upload(c.originals.read(USER, c.source, c.ref["artifact_id"]), user_id=USER) == c.data
    assert AuthorizedImageResolver(c.store, USER, lambda state: None)(c.frame, max_bytes=len(c.data))["status"] == "available"


@pytest.mark.parametrize("change", ["revoked", "deleted", "account_disabled"])
def test_current_source_and_account_access_still_fence_historical_reads(captured, change):
    c = captured
    if change == "revoked":
        c.archive.revoke_source(USER, SOURCE)
    elif change == "deleted":
        c.archive.delete_source(USER, SOURCE)
    else:
        c.archive.set_authorization(USER, False)
    for operation in (
        lambda: c.registry.read_display_source(USER, SOURCE),
        lambda: c.originals.read(USER, c.source, c.ref["artifact_id"]),
    ):
        denied(c, operation)
    assert AuthorizedImageResolver(c.store, USER, lambda state: None)(c.frame, max_bytes=len(c.data))["status"] in {"revoked", "missing"}


def test_unknown_version_and_actor_cannot_read_or_attach_display_source(captured):
    c = captured
    denied(c, lambda: c.registry.read_display_source(USER, SOURCE, 2), 404)
    denied(c, lambda: c.originals.put(USER, {**c.source, "source_version": 2}, "screen_image", c.ref, c.data), 404)
    c.archive.set_authorization("other-user")
    with pytest.raises(DomainError) as error:
        c.registry.read_display_source("other-user", SOURCE)
    assert error.value.status == 404


@pytest.mark.parametrize("field,value", [("contract_version", "9.9.9"), ("type", "web")])
def test_unknown_stored_descriptor_versions_never_coerce_into_legacy_source(captured, field, value):
    c = captured
    c.store._documents[USER][("snapshot", key(SOURCE, 1))][field] = value
    denied(c, lambda: c.registry.read_display_source(USER, SOURCE))
    denied(c, lambda: c.originals.put(USER, c.source, "screen_image", c.ref, c.data))
    denied(c, lambda: ingest(c))
    assert AuthorizedImageResolver(c.store, USER, lambda state: None)(c.frame, max_bytes=len(c.data))["status"] == "unavailable"


def test_restart_needs_new_display_source_and_preserves_old_historical_read(captured):
    c = captured
    apply(c, command(c))
    body = registration(c, "screen-next", predecessor=c.batch["stream_id"])
    start(c, body, request_key="screen-next")
    denied(c, lambda: register(c, stream_id=body["stream_id"]), 409)
    next_descriptor = register(c, "next-display-source", stream_id=body["stream_id"])
    assert next_descriptor["stream_id"] == "screen-next" and next_descriptor["source_id"] != SOURCE
    assert c.registry.read_display_source(USER, SOURCE) == c.descriptor
    wrong = {**c.batch, "stream_id": "screen-next",
             "records": [record(c.batch, "wrong-incarnation-record", 2)]}
    denied(c, lambda: ingest(c, wrong, request_key="wrong-incarnation"), 422)
    assert decode_upload(c.originals.read(USER, c.source, c.ref["artifact_id"]), user_id=USER) == c.data


def test_unframed_display_record_cannot_hide_in_valid_frame_batch(registered):
    c = registered
    upload(c)
    unframed = record(c.batch, "unframed", 2, frame_id=None, artifacts=[])
    batch = {**c.batch, "records": [c.batch["records"][0], unframed]}
    denied(c, lambda: ingest(c, batch), 409, "unsupported_source")
    ordinary = {**c.batch, "records": [unframed]}
    denied(c, lambda: c.registry.capture.ingest(USER, ordinary, "default-display"), 409)
    assert c.registry.capture.allow_artifact_references is False


def test_sealed_historical_frame_ingress_uses_existing_pre_stop_bytes_without_starting_capture(registered):
    c = registered
    upload(c)
    stop_fact(c, 1)
    stopped = apply(c, command(c, boundary=1))
    historical = {**c.batch, "delivery_mode": "historical"}
    assert ingest(c, historical)["acknowledged"][0]["disposition"] == "accepted"
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    assert c.registry.read_display_source(USER, SOURCE) == c.descriptor
    denied(c, lambda: c.originals.put(USER, c.source, "screen_image", c.ref, c.data))


def test_deletion_erases_pending_and_committed_originals_without_touching_other_display(captured):
    c = captured
    pending = {**c.ink_ref, "artifact_id": "pending-display-ink"}
    c.originals.put(USER, c.source, "editable_ink", pending, c.ink_data)
    body = registration(c, "other-device-stream")
    start(c, body, producer="independent-test-producer", request_key="other-stream")
    other = register(c, "independent-display", stream_id=body["stream_id"], producer_id="independent-test-producer")
    other_source = {field: other[field] for field in ("user_id", "source_id", "source_version")}
    other_ref = {**c.ref, "artifact_id": "independent-display-png"}
    c.originals.put(USER, other_source, "screen_image", other_ref, c.data)
    c.archive.delete_source(USER, SOURCE)
    with c.store.transaction(USER) as tx:
        assert not {"original_url", "canonical_url", "text", "content_hash"} & tx.get("source", SOURCE).keys()
        assert tx.get("snapshot", key(SOURCE, 1)) is None
        assert tx.get("frame", c.frame["frame_id"]) is None
        assert tx.get("frame_tombstone", c.frame["frame_id"]) is not None
        assert tx.scan("capture_record") == []
        assert all(row["deleted"] for row in tx.scan("capture_replay"))
        for ref in (c.ref, c.ink_ref, pending):
            assert tx.get("artifact", ref["artifact_id"]) is None
            assert tx.get("original_artifact_tombstone", ref["artifact_id"]) is not None
        assert tx.get("snapshot", key(other_source["source_id"], 1)) == other
    assert c.registry.read_display_source(USER, other_source["source_id"]) == other
    assert decode_upload(c.originals.read(USER, other_source, other_ref["artifact_id"]), user_id=USER) == c.data
    denied(c, lambda: register(c), 404)
    denied(c, lambda: upload(c), 404)


@pytest.mark.parametrize("consumer", ["source", "read_source", "snapshot", "export", "preview_import", "preview_save"])
def test_legacy_consumers_explicitly_reject_display_source(registered, consumer):
    c = registered
    preview = DocumentPreview(c.store, lambda state: None,
                              device_id=c.batch["device_id"], session_id=c.batch["session_id"])
    if consumer == "source":
        action = lambda: c.archive.get_source(USER, SOURCE)
    elif consumer == "read_source":
        action = lambda: c.archive.read_source(USER, SOURCE)
    elif consumer == "snapshot":
        action = lambda: c.archive.get_snapshot(USER, SOURCE, 1)
    elif consumer == "export":
        action = lambda: c.archive.export_learning_snapshot(USER, [SOURCE])
    elif consumer == "preview_import":
        body = import_body(source_id=SOURCE)
        body.update(device_id=c.batch["device_id"], session_id=c.batch["session_id"])
        action = lambda: preview.import_document(USER, body, "display-as-document")
    else:
        body = save_body(source_id=SOURCE)
        for bound in (body["frame"], body["bridge_request"]["selection"]):
            bound.update(user_id=USER, device_id=c.batch["device_id"], session_id=c.batch["session_id"])
        body["request"]["user_id"] = USER
        action = lambda: preview.save(USER, body, "display-as-preview")
    denied(c, action, 409, "unsupported_source")


@pytest.mark.parametrize("revoked", [False, True])
def test_unrelated_legacy_export_remains_exact_with_display_sources_present(captured, revoked):
    c = captured
    if revoked:
        c.archive.revoke_source(USER, SOURCE)
    legacy_id = c.core["SourceSnapshot"]["source_id"]
    exported = c.archive.export_learning_snapshot(USER, [legacy_id])
    assert exported["sources"] == [c.core["SourceSnapshot"]]
    assert exported["frames"] == [c.core["Frame"]]
    assert exported["observations"] == []
    assert SOURCE not in {source["source_id"] for source in exported["sources"]}


@pytest.mark.parametrize("corruption", ["malformed_descriptor", "foreign_snapshot", "foreign_head"])
def test_unselected_display_corruption_is_not_silently_omitted_from_legacy_inventory(registered, corruption):
    c = registered
    if corruption == "foreign_head":
        c.store._documents[USER][("source", SOURCE)]["user_id"] = "another-user"
    else:
        snapshot = c.store._documents[USER][("snapshot", key(SOURCE, 1))]
        snapshot["created_at" if corruption == "malformed_descriptor" else "user_id"] = (
            "not-a-timestamp" if corruption == "malformed_descriptor" else "another-user")
    denied(c, lambda: c.archive.export_learning_snapshot(USER, [c.core["SourceSnapshot"]["source_id"]]), 503)


def test_pending_original_alone_fences_lost_display_source_identity(registered):
    c = registered
    c.originals.put(USER, c.source, "editable_ink", c.ink_ref, c.ink_data)
    del c.store._documents[USER][("source", SOURCE)]
    del c.store._documents[USER][("snapshot", key(SOURCE, 1))]
    denied(c, lambda: register(c), 409)
