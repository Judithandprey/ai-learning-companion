"""Retained Windows identity contradictions must never produce readable context.

These synthetic MemoryStore states model inconsistent retained metadata. PNG
decoding and actual renderer RGBA attestation remain outside this identity check.
"""

from copy import deepcopy

import pytest

from services.api.errors import DomainError
from services.api.storage import _MemoryTransaction
from services.api.tests.test_control import USER, documents
from services.api.tests.test_raw_frame_readers import reader, resolver, refused
from services.api.tests.test_windows_frame_ingress import (
    ingest, raw_setup, registered, setup, uploaded, windows_setup,
)
from services.api.tests.test_windows_image_identity import contradict, second_frame


def retain_pair(c, *, alias, swap_roles):
    item, frame = second_frame(c, alias=alias, swap_roles=swap_roles)
    batch = {**c.batch, "records": [*c.batch["records"], item]}
    ingest(c, batch, [c.windows_frame, frame])
    return item, frame


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "different-id-byte-alias"])
@pytest.mark.parametrize("swap_roles", [False, True], ids=["same-role", "cross-role"])
@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("fact", ["pixels_sha256", "dimensions"])
def test_retained_image_contradiction_blocks_single_and_combined_reads(
        windows_setup, alias, swap_roles, role, fact):
    c = windows_setup
    item, frame = retain_pair(c, alias=alias, swap_roles=swap_roles)
    damaged = deepcopy(frame)
    contradict(damaged, role, fact)
    c.store._documents[USER][("raw_capture_frame", frame["frame_id"])] = damaged
    before = documents(c)

    for selection in (["process-1"], [item["record_id"]],
                      ["process-1", item["record_id"]], [item["record_id"], "process-1"]):
        refused(c, lambda: reader(c).read_windows(selection), 503)
    for retained in (c.windows_frame, damaged):
        for selected_role in ("raw", "composed"):
            assert resolver(c).resolve_windows(
                retained, image_role=selected_role,
                max_bytes=max(len(c.data), len(c.composed_data)),
            ) == {"status": "unavailable"}
    assert documents(c) == before


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "different-id-byte-alias"])
@pytest.mark.parametrize("swap_roles", [False, True], ids=["same-role", "cross-role"])
def test_valid_reused_images_remain_exact_and_roles_stay_explicit(windows_setup, alias, swap_roles):
    c = windows_setup
    item, frame = retain_pair(c, alias=alias, swap_roles=swap_roles)
    before = documents(c)
    packet = reader(c).read_windows(["process-1", item["record_id"]])
    assert packet["frames"] == [c.windows_frame, frame]
    assert packet["batch"]["records"] == [*c.batch["records"], item]
    for retained, swapped in ((c.windows_frame, False), (frame, swap_roles)):
        for role in ("raw", "composed"):
            data = c.data if (role == "raw") != swapped else c.composed_data
            assert resolver(c).resolve_windows(retained, image_role=role, max_bytes=len(data)) == {
                "status": "available", "frame": retained, "image_role": role,
                "media_type": "image/png", "data": data,
            }
    assert documents(c) == before


@pytest.mark.parametrize("empty", [False, True], ids=["nonempty-marker", "empty-marker"])
@pytest.mark.parametrize("revoked", [False, True], ids=["authorized", "revoked-caller"])
def test_single_record_tombstone_follows_authorization_and_precedes_record_body(
        windows_setup, monkeypatch, empty, revoked):
    c = windows_setup
    ingest(c)
    marker = {} if empty else {"record_id": "process-1"}
    c.store._documents[USER][("capture_tombstone", "process-1")] = marker
    before, reads, guards = documents(c), [], []
    actual_get = _MemoryTransaction.get

    def guard(state):
        assert c.store._local.in_transaction
        guards.append("authorized")
        if revoked:
            raise DomainError(401, "unauthenticated")

    def get(tx, kind, identifier):
        assert kind != "capture_record", "tombstoned record body was accessed"
        if kind == "capture_tombstone":
            assert guards == ["authorized"]
        reads.append((kind, identifier))
        return actual_get(tx, kind, identifier)

    c.registry.capture.archive.authorization_guard = guard
    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "get", get)
        with pytest.raises(DomainError) as error:
            c.registry.capture.read_record(USER, "process-1")
    assert (error.value.status, error.value.code) == (
        (401, "unauthenticated") if revoked else (404, "not_found"))
    assert guards == ["authorized"]
    assert reads == [("authorization", "state")] + (
        [] if revoked else [("capture_tombstone", "process-1")])
    assert documents(c) == before
