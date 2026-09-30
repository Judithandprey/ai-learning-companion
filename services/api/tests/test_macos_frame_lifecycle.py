"""Mac history uses existing permission, Stop, erasure and receipt witnesses."""

from copy import deepcopy

import pytest

from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts, require_retained_bytes
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import apply, command, documents, stop_fact
from services.api.tests.macos_fixtures import (
    additional, denied, gap, ingest, ingest_request, macos_setup, macoscaptured,
    raw_setup, registered, setup, uploaded,
)


@pytest.mark.parametrize("cached", [False, True])
@pytest.mark.parametrize("fence,status", [("stop", 409), ("withdraw", 403), ("source_revoke", 404),
                                         ("delete", 404), ("generation", 403), ("membership", 403)])
def test_current_authority_fences_new_and_cached_mac_ingress(macos_setup, cached, fence, status):
    c = macos_setup
    if cached:
        ingest(c)
    if fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "source_revoke":
        c.archive.revoke_source(c.user, c.source["source_id"])
    elif fence == "delete":
        c.archive.delete_source(c.user, c.source["source_id"])
    elif fence == "generation":
        c.archive.set_authorization(c.user, False)
        c.archive.set_authorization(c.user)
    else:
        c.registry.set_membership(c.user, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    denied(c, lambda: ingest(c), status)


def test_sealed_historical_upload_does_not_restart_capture(macos_setup):
    c = macos_setup
    apply(c, command(c))
    batch = {**c.batch, "delivery_mode": "historical"}
    denied(c, lambda: ingest(c, batch), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = ingest(c, batch)
    assert ingest(c, batch) == ack
    assert c.registry.read(c.user, c.batch["stream_id"]) == stopped
    assert documents(c)[("session", c.batch["session_id"])]["live_capture"] is False
    child, frame = additional(c)
    denied(c, lambda: ingest(c, {**batch, "records": [child]}, [frame], "after-boundary"), 409, "capture_stopped")


def test_delete_erases_both_pngs_ink_and_frames_but_preserves_unrelated_history(macoscaptured):
    c = macoscaptured
    before = documents(c)
    c.archive.delete_source(c.user, c.source["source_id"])
    after = documents(c)
    for ref in (c.ref, c.composed_ref, c.ink_ref):
        identity = ref["artifact_id"]
        assert ("artifact", identity) not in after
        assert ("capture_artifact_ref", identity) not in after
        assert after[("original_artifact_tombstone", identity)] == {"artifact_id": identity}
        assert after[("capture_artifact_tombstone", identity)] == {"artifact_id": identity}
    assert ("raw_capture_frame", c.macos_frame["frame_id"]) not in after
    assert after[("frame_tombstone", c.macos_frame["frame_id"])] == {"frame_id": c.macos_frame["frame_id"]}
    assert after[("capture_tombstone", "process-1")] == {"record_id": "process-1"}
    receipt_key = key("internal_macos_capture_frames", "macos-frames-1")
    assert after[("capture_replay", receipt_key)] == {"key": receipt_key, "deleted": True}
    for identity in (("frame", c.core["Frame"]["frame_id"]), ("artifact", c.core["Frame"]["artifact_id"])):
        assert after[identity] == before[identity]
    denied(c, lambda: ingest(c), 404)
    c.archive.delete_source(c.user, c.source["source_id"])
    assert documents(c) == after


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_retained_descriptor_alone_blocks_reupload_of_a_lost_image(macos_setup, role):
    c = macos_setup
    ref, data = (c.ref, c.data) if role == "raw" else (c.composed_ref, c.composed_data)
    with c.store.transaction(c.user) as tx:
        Archive._immutable(tx, "raw_capture_frame", c.macos_frame["frame_id"], c.macos_frame)
        tx.delete("artifact", ref["artifact_id"])
        assert tx.scan("capture_record") == tx.scan("capture_replay") == []
    originals = OriginalArtifacts(c.store, lambda state: None,
                                  display_authority_resolver=c.registry.resolve_capture)
    denied(c, lambda: originals.put(c.user, c.source, "screen_image", ref, data), 409, "original_identity_conflict")
    with c.store.transaction(c.user) as tx:
        with pytest.raises(DomainError) as exc:
            require_retained_bytes(tx, ref["artifact_id"])
        assert (exc.value.status, exc.value.code) == (503, "original_unavailable")
    c.archive.delete_source(c.user, c.source["source_id"])
    assert documents(c)[("original_artifact_tombstone", ref["artifact_id"])] == {"artifact_id": ref["artifact_id"]}
    denied(c, lambda: originals.put(c.user, c.source, "screen_image", ref, data), 404)


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_empty_tombstone_still_means_original_was_deleted(macoscaptured, role):
    c = macoscaptured
    ref = c.ref if role == "raw" else c.composed_ref
    c.store._documents[c.user][("original_artifact_tombstone", ref["artifact_id"])] = {}
    denied(c, lambda: ingest(c), 404)


def test_parent_record_tombstone_denies_child_even_when_empty(macoscaptured):
    c = macoscaptured
    item, frame = additional(c, parents=["process-1"])
    c.store._documents[c.user][("capture_tombstone", "process-1")] = {}
    denied(c, lambda: ingest(c, {**c.batch, "records": [item]}, [frame], "child"), 404)


def test_exact_deleted_receipt_blocks_its_own_replay_without_reconstruction(macoscaptured):
    c = macoscaptured
    receipt_key = key("internal_macos_capture_frames", "macos-frames-1")
    c.store._documents[c.user][("capture_replay", receipt_key)] = {"key": receipt_key, "deleted": True}
    denied(c, lambda: ingest(c), 404, "not_found")


@pytest.mark.parametrize("cached", [False, True])
def test_final_authorization_guard_withholds_new_and_cached_ack(macos_setup, monkeypatch, cached):
    c = macos_setup
    if cached:
        ingest(c)
    original_get, original_put = _MemoryTransaction.get, _MemoryTransaction.put
    seen = []

    def get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if cached and kind == "capture_replay" and value is not None:
            seen.append("cached")
        return value

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            seen.append("staged")

    def guard(state):
        if seen:
            raise DomainError(401, "unauthenticated")

    c.registry.capture.archive.authorization_guard = guard
    monkeypatch.setattr(_MemoryTransaction, "get", get)
    monkeypatch.setattr(_MemoryTransaction, "put", put)
    denied(c, lambda: ingest(c), 401, "unauthenticated")
    assert seen == ["cached" if cached else "staged"]


def lose_profiles(c):
    for kind in ("control_start", "control_stream"):
        del c.store._documents[c.user][(kind, c.batch["stream_id"])]["producer_profile"]


def old_request(c, family, *, cached=False):
    batch = deepcopy(c.batch if cached else c.structured_batch)
    batch["records"][0].update(record_id="old-record", sequence=2)
    if family == "generic":
        batch["records"][0].update(frame_id=None, artifacts=[],
            source={name: c.core["SourceSnapshot"][name] for name in ("user_id", "source_id", "source_version")})
        return lambda: c.registry.capture.ingest(c.user, batch, "old-fallback")
    if family == "legacy":
        batch["records"][0]["media_position"] = c.frame["media_position"]
        return lambda: c.registry.ingest_frames(c.user, batch, [c.frame], "old-fallback")
    return lambda: c.registry.ingest_raw_frames(c.user, batch, [c.raw_frame], "old-fallback")


def gap_witness(c, entry, family, cached):
    item = gap(c)
    batch = {**c.batch, "records": [item]}
    if entry == "internal":
        ingest(c, batch, [], "mac-gap-witness")
        identity = ("capture_replay", key("internal_macos_capture_frames", "mac-gap-witness"))
    else:
        ingest_request(c, {**c.envelope, "batch": batch, "frames": []}, "mac-gap-witness")
        identity = ("capture_replay", key("POST", "/v2/process/macos-frames:batch", "mac-gap-witness"))
    action = old_request(c, family, cached=cached)
    # A pixels-only old-family success may predate lost policy markers. No Mac
    # descriptor exists, so the retained Mac gap receipt is the only witness.
    prior = action() if cached else None
    assert not any(kind == "raw_capture_frame" and value["contract_version"] == "0.2.11"
                   for (kind, _), value in documents(c).items())
    lose_profiles(c)
    return identity, action, prior


@pytest.mark.parametrize("entry", ["internal", "http"])
@pytest.mark.parametrize("family", ["generic", "raw", "legacy"])
@pytest.mark.parametrize("cached", [False, True])
def test_gap_receipt_prevents_old_family_downgrade_after_both_markers_lost(macos_setup, entry, family, cached):
    c = macos_setup
    _, action, _ = gap_witness(c, entry, family, cached)
    denied(c, action, 403, "forbidden")


@pytest.mark.parametrize("cached", [False, True])
@pytest.mark.parametrize("damage", ["empty", "deleted_integer", "full_deleted", "invalid_ack"])
def test_malformed_mac_gap_receipt_never_reopens_old_raw_capture(macos_setup, cached, damage):
    c = macos_setup
    identity, action, _ = gap_witness(c, "http", "raw", cached)
    row = c.store._documents[c.user][identity]
    if damage == "empty":
        c.store._documents[c.user][identity] = {}
    elif damage == "invalid_ack":
        row["response_json"] = "{}"
    else:
        row["deleted"] = 1 if damage == "deleted_integer" else True
    denied(c, action, 503, "unavailable")


@pytest.mark.parametrize("entry", ["internal", "http"])
@pytest.mark.parametrize("cached", [False, True])
def test_exact_receipt_erasure_keeps_existing_skip_semantics(macos_setup, entry, cached):
    c = macos_setup
    identity, action, ack = gap_witness(c, entry, "raw", cached)
    # Isolate the exact existing erasure shape; this privileged replacement is
    # not a claim that normal deletion preserves source access or originals.
    c.store._documents[c.user][identity] = {"key": identity[1], "deleted": True}
    before = documents(c)
    accepted = action()
    if cached:
        assert accepted == ack and documents(c) == before
    else:
        assert accepted["acknowledged"][0]["disposition"] == "accepted"
        retained = documents(c)
        assert action() == accepted and documents(c) == retained


def test_current_stop_precedes_diagnostics_for_a_corrupt_receipt(macoscaptured):
    c = macoscaptured
    c.store._documents[c.user][("capture_replay", key("internal_macos_capture_frames", "macos-frames-1"))] = {}
    apply(c, command(c, "stop"))
    denied(c, lambda: ingest(c), 409, "capture_stopped")
