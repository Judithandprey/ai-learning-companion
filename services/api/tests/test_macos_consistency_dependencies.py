"""Mac image consistency follows the admitted descriptor/dependency selection.

MemoryStore and existing synthetic originals only; no DB, process or native run.
"""

import asyncio
from concurrent.futures import CancelledError
from copy import copy, deepcopy

import pytest

from packages.contracts import validate as validate_legacy
from packages.contracts.macos_frame import validate
from services.api.storage import _MemoryTransaction
from services.api.tests.macos_fixtures import (
    additional, denied, gap, ingest, macos_setup, raw_setup, references,
    registered, setup, upload_original, uploaded,
)
from services.api.tests.test_capture import record
from services.api.tests.test_control import documents
from services.api.tests.test_macos_cross_family_identity import old_frame, retain_old


def retain_raw_pair(c):
    """Old raw admission legitimately does not validate PNG dimensions."""
    frames, records = [], []
    for sequence, width in ((1, 200), (2, 201)):
        frame = deepcopy(c.raw_frame)
        frame.update(frame_id=f"old-raw-{sequence}", raw_width=width)
        item = record(c.batch, f"old-record-{sequence}", sequence,
                      frame_id=frame["frame_id"], artifacts=[deepcopy(c.ref)])
        frames.append(frame)
        records.append(item)
    c.registry.ingest_raw_frames(c.user, {**c.batch, "records": records}, frames, "old-raw-pair")
    return records, frames


def test_first_parentless_mac_gap_ignores_unrelated_well_formed_raw_conflict(macos_setup):
    c = macos_setup
    retained_records, retained_frames = retain_raw_pair(c)
    item = gap(c, record_id="parentless-mac-gap", sequence=3)
    before = documents(c)
    assert not any(frame.get("contract_version") == "0.2.11"
                   for (kind, _), frame in before.items() if kind == "raw_capture_frame")
    ack = ingest(c, {**c.batch, "records": [item]}, [], key="parentless-gap")
    assert ack["acknowledged"][0]["record_id"] == item["record_id"]
    assert ack["acknowledged"][0]["artifacts"] == []
    after = documents(c)
    assert ingest(c, {**c.batch, "records": [item]}, [], key="parentless-gap") == ack
    assert documents(c) == after
    for frame in retained_frames:
        identity = ("raw_capture_frame", frame["frame_id"])
        assert after[identity] == before[identity] == frame
    for stored in retained_records:
        identity = ("capture_record", stored["record_id"])
        assert after[identity] == before[identity]


def retain_raw(c, *, sequence, name, width_delta=0, role="raw"):
    frame = old_frame(c, "raw", width_delta=width_delta, role=role)
    frame["frame_id"] = name + "-frame"
    item = record(c.batch, name, sequence, frame_id=frame["frame_id"],
                  artifacts=[deepcopy(frame["artifact"])], causal_parents=[])
    c.registry.ingest_raw_frames(c.user, {**c.batch, "records": [item]}, [frame], name)
    return frame


@pytest.mark.parametrize("family", ["legacy", "raw", "desktop", "windows", "macos"])
@pytest.mark.parametrize("transitive", [False, True], ids=["direct-parent", "through-stored-gap"])
def test_gap_admission_and_replay_attest_all_stored_framed_ancestors(macos_setup, family, transitive):
    c = macos_setup
    if family == "macos":
        ingest(c)
        parent = "process-1"
    else:
        retain_old(c, family)
        parent = "older-family-record"
    if transitive:
        middle = gap(c, record_id="middle-gap", sequence=2, parents=[parent])
        ingest(c, {**c.batch, "records": [middle]}, [], "middle-gap")
        parent = middle["record_id"]
    item = gap(c, record_id="dependent-gap", sequence=4, parents=[parent])
    batch = {**c.batch, "records": [item]}
    ack = ingest(c, batch, [], "dependent-gap")
    assert ack["acknowledged"][0]["artifacts"] == []
    before = documents(c)
    assert ingest(c, batch, [], "dependent-gap") == ack
    assert documents(c) == before

    # An ordinary older writer introduces a retained contradiction. The new
    # request has no image of its own, but still relies on this framed ancestor.
    retain_raw(c, sequence=3, name="later-old-conflict", width_delta=1)
    denied(c, lambda: ingest(c, batch, [], "dependent-gap"), 503, "unavailable")
    fresh = gap(c, record_id="fresh-dependent-gap", sequence=5, parents=[parent])
    denied(c, lambda: ingest(c, {**c.batch, "records": [fresh]}, [], "fresh-dependent-gap"),
           503, "unavailable")


def retain_raw_only_mac(c):
    frame = deepcopy(c.macos_frame)
    frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    item = deepcopy(c.batch["records"][0])
    item["artifacts"] = references(frame)
    ingest(c, {**c.batch, "records": [item]}, [frame], "raw-only-mac")
    return frame


def different_source_image(c, *, different_session):
    descriptor = c.registry.register_display_source(
        c.user, "other-native-display", c.batch["stream_id"], producer_id="screen")
    bound = copy(c)
    bound.source = {name: descriptor[name] for name in ("user_id", "source_id", "source_version")}
    item, frame = additional(c)
    frame["source"] = deepcopy(bound.source)
    frame["raw"] = deepcopy(c.macos_frame["composition"]["image"])
    frame["raw"]["artifact"]["artifact_id"] = "other-source-other-image"
    frame["raw"]["native_file"] = c.macos_frame["raw"]["native_file"]
    frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    if different_session:
        frame["profile"]["native_session_id"] = "second-native-session"
    upload_original(bound, frame["raw"]["artifact"], c.composed_data)
    item.update(source=deepcopy(bound.source), artifacts=references(frame), causal_parents=[])
    validate(frame)
    return item, frame


@pytest.mark.parametrize("different_session", [False, True], ids=["same-session-conflict", "other-session-reuse"])
def test_native_path_scope_crosses_sources_without_requiring_shared_images(macos_setup, different_session):
    c = macos_setup
    stored = retain_raw_only_mac(c)
    item, frame = different_source_image(c, different_session=different_session)
    assert stored["source"] != frame["source"]
    assert stored["raw"]["artifact"]["sha256"] != frame["raw"]["artifact"]["sha256"]
    assert stored["raw"]["artifact"]["artifact_id"] != frame["raw"]["artifact"]["artifact_id"]
    batch = {**c.batch, "records": [item]}
    if different_session:
        ack = ingest(c, batch, [frame], "native-path")
        retained = documents(c)
        assert ingest(c, batch, [frame], "native-path") == ack
        assert documents(c) == retained
    else:
        denied(c, lambda: ingest(c, batch, [frame], "native-path"), 409, "record_conflict")


def test_gap_dependency_includes_same_session_path_conflict_with_other_source(macos_setup):
    c = macos_setup
    stored = retain_raw_only_mac(c)
    item, frame = different_source_image(c, different_session=True)
    ingest(c, {**c.batch, "records": [item]}, [frame], "other-native-session")
    # Explicit immutable-store damage: distinct valid sessions were admitted,
    # then the second descriptor's native-session identity was corrupted.
    damaged = c.store._documents[c.user][("raw_capture_frame", frame["frame_id"])]
    damaged["profile"]["native_session_id"] = stored["profile"]["native_session_id"]
    validate(damaged)
    dependent = gap(c, record_id="native-dependent-gap", sequence=3, parents=["process-1"])
    denied(c, lambda: ingest(c, {**c.batch, "records": [dependent]}, [], "native-dependent-gap"),
           503, "unavailable")


@pytest.mark.parametrize("representation", ["dom_snapshot", "synthetic_fixture"])
@pytest.mark.parametrize("width_delta", [0, 1], ids=["partial-facts-compatible", "full-facts-conflict"])
def test_partial_legacy_facts_neither_invent_dimensions_nor_hide_retained_conflicts(
        macos_setup, representation, width_delta):
    c = macos_setup
    retain_raw(c, sequence=1, name="ancestor")
    retain_raw(c, sequence=2, name="other-full-facts", width_delta=width_delta)
    # Retained-legacy metadata fixture: viewport/fixture dimensions are not
    # measured PNG dimensions. Only its hash is comparable to these images.
    legacy = deepcopy(c.core["Frame"])
    legacy.update(frame_id="partial-legacy", artifact_id="partial-byte-alias",
                  content_hash=c.ref["sha256"], representation=representation, width=901, height=503)
    validate_legacy("Frame", legacy)
    with c.store.transaction(c.user) as tx:
        tx.put("frame", legacy["frame_id"], legacy)
    item = gap(c, record_id="partial-facts-gap", sequence=3, parents=["ancestor"])
    action = lambda: ingest(c, {**c.batch, "records": [item]}, [], "partial-facts-gap")
    if width_delta:
        denied(c, action, 503, "unavailable")
    else:
        ack = action()
        retained = documents(c)
        assert action() == ack
        assert documents(c) == retained


@pytest.mark.parametrize("damage", ["unknown-version", "malformed-known", "malformed-legacy"])
def test_empty_image_scope_still_refuses_unknown_or_corrupt_retained_variants(macos_setup, damage):
    c = macos_setup
    if damage == "malformed-legacy":
        frame = deepcopy(c.core["Frame"])
        frame["representation"] = "unreleased_variant"
        kind = "frame"
    else:
        frame = old_frame(c, "raw")
        kind = "raw_capture_frame"
        if damage == "unknown-version":
            frame["contract_version"] = "0.2.99"
        else:
            del frame["raw_width"]
    # Explicit storage damage, never an accepted ordinary contract submission.
    c.store._documents[c.user][(kind, "unrelated-corrupt-row")] = frame
    item = gap(c, record_id="no-image-target", sequence=1)
    denied(c, lambda: ingest(c, {**c.batch, "records": [item]}, [], "no-image-target"),
           503, "unavailable")


def test_dependency_alias_closure_finds_damage_before_its_bridge_in_scan_order(macos_setup):
    c = macos_setup
    retain_raw_only_mac(c)
    # Explicit immutable-store bypass creates A/hash -> B/hash -> B/other.
    # The B/other row sorts first, before its connection to target A is known.
    bridge = old_frame(c, "raw")
    bridge["frame_id"] = "zz-bridge"
    bridge["artifact"]["artifact_id"] = "transitive-artifact"
    damaged = deepcopy(bridge)
    damaged.update(frame_id="aa-damage", raw_width=201)
    damaged["artifact"]["sha256"] = "f" * 64
    for frame in (bridge, damaged):
        c.store._documents[c.user][("raw_capture_frame", frame["frame_id"])] = frame
    dependent = gap(c, record_id="transitive-alias-gap", sequence=2, parents=["process-1"])
    denied(c, lambda: ingest(c, {**c.batch, "records": [dependent]}, [], "transitive-alias-gap"),
           503, "unavailable")


def test_matching_retained_image_does_not_select_its_unrelated_composed_sibling(macos_setup):
    c = macos_setup
    raw_only = retain_raw_only_mac(c)
    item, full_frame = additional(c)
    ingest(c, {**c.batch, "records": [item]}, [full_frame], "full-sibling")
    assert raw_only["raw"] == full_frame["raw"]
    assert full_frame["composition"]["image"]["artifact"]["sha256"] != raw_only["raw"]["artifact"]["sha256"]
    retain_raw(c, sequence=3, name="composed-sibling-conflict", width_delta=1, role="composed")

    # Matching this retained row's raw image may extend image identities, but
    # does not make the row's independent composed sibling a dependency.
    selected = gap(c, record_id="raw-only-dependent-gap", sequence=4, parents=["process-1"])
    batch = {**c.batch, "records": [selected]}
    before = documents(c)
    ack = ingest(c, batch, [], "raw-only-dependent-gap")
    retained = documents(c)
    assert ingest(c, batch, [], "raw-only-dependent-gap") == ack
    assert documents(c) == retained
    assert all(retained[identity] == value for identity, value in before.items())

    # Depending on the complete dual-image frame attests both roles and fails.
    affected = gap(c, record_id="full-dependent-gap", sequence=5, parents=[item["record_id"]])
    denied(c, lambda: ingest(c, {**c.batch, "records": [affected]}, [], "full-dependent-gap"),
           503, "unavailable")


@pytest.mark.parametrize("failure", [CancelledError, asyncio.CancelledError])
def test_cancellation_during_dependency_metadata_scan_never_commits_a_gap(macos_setup, monkeypatch, failure):
    c = macos_setup
    retain_old(c, "raw")
    item = gap(c, record_id="cancelled-dependent-gap", sequence=2, parents=["older-family-record"])
    before = documents(c)
    original_scan = _MemoryTransaction.scan
    reached = []

    def cancel_scan(tx, kind):
        if kind == "raw_capture_frame":
            reached.append(kind)
            raise failure("synthetic metadata-scan cancellation")
        return original_scan(tx, kind)

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "scan", cancel_scan)
        with pytest.raises(failure):
            ingest(c, {**c.batch, "records": [item]}, [], "cancelled-dependent-gap")
    assert reached == ["raw_capture_frame"]
    assert documents(c) == before
    ack = ingest(c, {**c.batch, "records": [item]}, [], "cancelled-dependent-gap")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
