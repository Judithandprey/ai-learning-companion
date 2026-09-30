"""Internal Windows archive with real test PNG pairs and synthetic native facts.

MemoryStore and in-process typed uploads prove neither Windows acquisition nor
actual composition, device interaction, provider receipt, or HTTP activation.
"""

import base64
from concurrent.futures import CancelledError
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct
import zlib

import pytest

from packages.contracts.process_v2 import validate_ack
from packages.contracts.windows_frame import validate_binding
from services.api.control import ControlRegistry
from services.api.domain import key as storage_key
from services.api.errors import DomainError
from services.api.storage import _MemoryTransaction
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, documents, resolve_stop_fact, stop_fact,
)
from services.api.tests.test_desktop_frame_ingress import pixel_record
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_display_sources import reference
from services.api.tests.test_ingress_http import (
    ORIGINALS, registered, request, setup, success, uploaded,
)
from services.api.tests.test_raw_frame_ingress import denied, raw_setup


EXAMPLES = Path(__file__).resolve().parents[3] / "packages/contracts/windows_frame/examples/windows-retained.json"


@pytest.fixture
def windows_setup(raw_setup):
    """Reuses typed uploads and stores a distinct green PNG alongside red raw pixels."""
    c = raw_setup
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    # Existing png() supplies the complete PNG; replace its IDAT with green pixels.
    offset = c.data.index(b"IDAT") - 4
    length = struct.unpack(">I", c.data[offset:offset + 4])[0]
    payload = zlib.compress((b"\0" + b"\0\xff\0" * 2) * 2)
    chunk = struct.pack(">I", len(payload)) + b"IDAT" + payload
    chunk += struct.pack(">I", zlib.crc32(b"IDAT" + payload))
    c.composed_data = c.data[:offset] + chunk + c.data[offset + length + 12:]
    c.composed_ref = reference(c.composed_data, "windows-composed-png", "image/png")
    body = {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
            "artifact": c.composed_ref, "data_base64": base64.b64encode(c.composed_data).decode("ascii")}
    success(request(c.app, "PUT", ORIGINALS + c.composed_ref["artifact_id"], body=body),
            "OriginalArtifactReceipt")
    c.windows_frame = json.loads(EXAMPLES.read_text())[3]
    c.windows_frame.update(
        frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source),
        **{field: c.batch[field] for field in ("device_id", "session_id", "stream_id")},
    )
    for image, ref, rgba in ((c.windows_frame["raw"], c.ref, b"\xff\0\0\xff"),
                             (c.windows_frame["composed"]["image"], c.composed_ref, b"\0\xff\0\xff")):
        image.update(artifact=deepcopy(ref), width=2, height=2,
                     pixels_sha256=hashlib.sha256(rgba * 4).hexdigest(),
                     native_file="frames/" + ref["sha256"] + ".png")
    c.windows_frame["composed"]["transformation"] = "Synthetic distinct green test image; no native composition claim."
    c.structured_batch = deepcopy(c.batch)
    c.structured_batch["records"][0].update(clock=None, observed_at=None, media_position=None)
    c.batch["records"][0] = pixel_record(c.batch["records"][0])
    c.batch["records"][0]["artifacts"] = deepcopy([c.ref, c.composed_ref, c.ink_ref])
    c.raw_frame["timing"].update(callback_clock=None, observed_at_estimate=None, estimate_basis=None)
    return c


def ingest(c, batch=None, frames=None, key="windows-frames-1"):
    return c.registry.ingest_windows_frames(
        c.user, c.batch if batch is None else batch,
        [c.windows_frame] if frames is None else frames, key,
    )


def additional(c, *, record_id="windows-record-2", sequence=2, frame_id="windows-frame-2", parents=()):
    item = record(c.batch, record_id, sequence, frame_id=frame_id, causal_parents=list(parents))
    frame = deepcopy(c.windows_frame)
    frame["frame_id"] = frame_id
    frame["profile"]["sample"]["sample_seq"] += 1
    return item, frame


@pytest.fixture
def windowscaptured(windows_setup):
    windows_setup.ack = ingest(windows_setup)
    return windows_setup


def test_two_png_originals_and_editable_ink_survive_exact_replay(windows_setup):
    c = windows_setup
    original = deepcopy((c.batch, c.windows_frame))
    before = documents(c)
    bindings = [{"contract_version": "0.2.2", "source": c.source, "kind": "screen_image", "artifact": ref}
                for ref in (c.ref, c.composed_ref)]
    validate_binding(c.batch, "process-1", c.windows_frame, c.descriptor, bindings)
    ack = ingest(c)
    refs = [c.ref, c.composed_ref, c.ink_ref]
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for ref in refs}
    validate_ack(c.batch, ack, user_id=USER, verified_artifacts=verified)
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in refs]
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert (c.batch, c.windows_frame) == original
    after = documents(c)
    assert after[("raw_capture_frame", c.windows_frame["frame_id"])] == c.windows_frame
    assert ("frame", c.windows_frame["frame_id"]) not in after
    assert c.data != c.composed_data
    for ref, data in ((c.ref, c.data), (c.composed_ref, c.composed_data), (c.ink_ref, c.ink_data)):
        row = after[("artifact", ref["artifact_id"])]
        assert row == before[("artifact", ref["artifact_id"])]
        assert base64.b64decode(row["data_base64"], validate=True) == data
    replay_id = ("capture_replay", storage_key("internal_windows_capture_frames", "windows-frames-1"))
    assert json.loads(after[replay_id]["response_json"]) == ack
    assert ("capture_replay", storage_key("internal_desktop_capture_frames", "windows-frames-1")) not in after
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                 authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    assert ingest(c) == ack
    assert documents(c) == after
    duplicate = ingest(c, key="new-key-same-originals")
    assert duplicate["acknowledged"] == [{**receipt, "disposition": "duplicate"} for receipt in ack["acknowledged"]]


@pytest.mark.parametrize("variant", ["same-artifact", "same-bytes-alias", "raw-only"])
def test_png_dedup_and_absent_composition_preserve_exact_roles(windows_setup, variant):
    c = windows_setup
    refs = [c.ref, c.ink_ref]
    if variant == "raw-only":
        c.windows_frame["composed"] = None
    else:
        c.windows_frame["composed"]["image"] = deepcopy(c.windows_frame["raw"])
        if variant == "same-bytes-alias":
            alias = {**c.ref, "artifact_id": "windows-raw-alias"}
            body = {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
                    "artifact": alias, "data_base64": base64.b64encode(c.data).decode("ascii")}
            success(request(c.app, "PUT", ORIGINALS + alias["artifact_id"], body=body), "OriginalArtifactReceipt")
            c.windows_frame["composed"]["image"]["artifact"] = alias
            refs.insert(1, alias)
    c.batch["records"][0]["artifacts"] = refs
    ack = ingest(c)
    assert ack["acknowledged"][0]["artifacts"] == [{**ref, "status": "verified"} for ref in refs]
    assert documents(c)[("raw_capture_frame", c.windows_frame["frame_id"])] == c.windows_frame
    assert ingest(c) == ack


def test_metadata_and_record_order_are_bound_but_frame_order_is_not(windows_setup):
    c = windows_setup
    item, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [c.batch["records"][0], item]}
    frames = [c.windows_frame, frame]
    ack = ingest(c, batch, frames)
    assert ingest(c, batch, list(reversed(frames))) == ack
    changed = deepcopy(frames)
    changed[0]["composed"]["ink_revision"] += 1
    denied(c, lambda: ingest(c, batch, changed), 409, "idempotency_conflict")
    denied(c, lambda: ingest(c, {**batch, "records": list(reversed(batch["records"]))}, frames),
           409, "idempotency_conflict")
    denied(c, lambda: ingest(c, batch, changed, "changed-metadata"), 409, "record_conflict")


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage", ["missing", "corrupt", "substituted", "binding", "missing-record-ref"])
@pytest.mark.parametrize("replay", [False, True])
def test_both_pngs_require_exact_typed_original_bytes(windows_setup, role, damage, replay):
    c = windows_setup
    if replay:
        ingest(c)
    ref = c.ref if role == "raw" else c.composed_ref
    rows = c.store._documents[USER]
    identity = ("artifact", ref["artifact_id"])
    if damage == "missing":
        del rows[identity]
    elif damage == "corrupt":
        rows[identity]["data_base64"] = "YQ=="
    elif damage == "substituted":
        other = c.composed_data if role == "raw" else c.data
        rows[identity]["data_base64"] = base64.b64encode(other).decode("ascii")
    elif damage == "binding":
        rows[identity]["original_binding"]["kind"] = "editable_ink"
    else:
        c.batch["records"][0]["artifacts"] = [r for r in c.batch["records"][0]["artifacts"] if r != ref]
    # Cached requests bind complete client references; known missing originals
    # are unavailable, never treated as an opportunity to reupload history.
    status = 503
    if damage == "missing" and not replay:
        status = 404
    elif damage == "missing-record-ref":
        status = 409 if replay else 422
    denied(c, lambda: ingest(c), status)


@pytest.mark.parametrize("shape", ["mapping", "empty", "duplicate", "unreferenced"])
def test_explicit_frames_have_exact_unique_referenced_identities(windows_setup, shape):
    c = windows_setup
    frames = {"mapping": {c.windows_frame["frame_id"]: c.windows_frame}, "empty": [],
              "duplicate": [c.windows_frame, deepcopy(c.windows_frame)],
              "unreferenced": [c.windows_frame, {**c.windows_frame, "frame_id": "not-referenced"}]}[shape]
    denied(c, lambda: ingest(c, frames=frames), 422)


@pytest.mark.parametrize("path,value", [
    (("source", "user_id"), "other-user"), (("source", "source_id"), "other-source"),
    (("source", "source_version"), 2), (("device_id",), "other-device"),
    (("session_id",), "other-session"), (("stream_id",), "other-stream"),
    (("frame_id",), "another-frame"), (("contract_version",), "0.2.99"),
    (("captured_at",), "2026-09-29T12:00:00Z"), (("capture_latency_ms",), 0),
    (("raw", "artifact", "byte_length"), 1), (("composed", "image", "artifact", "byte_length"), 1),
])
def test_released_metadata_requires_exact_source_and_identity(windows_setup, path, value):
    c = windows_setup
    frame = deepcopy(c.windows_frame)
    parent = frame
    for name in path[:-1]:
        parent = parent[name]
    parent[path[-1]] = value
    denied(c, lambda: ingest(c, frames=[frame]), 422)


@pytest.mark.parametrize("field,value", [
    ("observed_at", "2026-09-29T12:00:00Z"), ("media_position", 0),
    ("clock", {"domain_id": "windows-local", "elapsed_ms": 100, "uncertainty_ms": None}),
])
def test_local_windows_metadata_cannot_claim_process_capture_time(windows_setup, field, value):
    c = windows_setup
    c.batch["records"][0][field] = value
    denied(c, lambda: ingest(c), 422)


@pytest.mark.parametrize("coverage", ["unknown", "unobserved", "partial"])
def test_frameless_gap_is_explicit_and_survives_later_framed_sample(windows_setup, coverage):
    c = windows_setup
    item = gap(c, coverage=coverage)
    batch = {**c.batch, "records": [item]}
    before = documents(c)
    ack = ingest(c, batch, [], "windows-gap")
    assert ack["acknowledged"][0]["artifacts"] == []
    assert not any(kind == "raw_capture_frame" for kind, _ in documents(c))
    assert ingest(c, batch, [], "windows-gap") == ack
    child, frame = additional(c, parents=[item["record_id"]])
    assert ingest(c, {**c.batch, "records": [child]}, [frame], "after-gap")["acknowledged"][0]["disposition"] == "accepted"
    assert all(documents(c)[identity] == value for identity, value in before.items())


def test_first_gap_requires_no_uploaded_png_or_ink(registered):
    c = registered
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    before = documents(c)
    batch = {**c.batch, "records": [gap(c)]}
    ack = ingest(c, batch, [], "first-gap-without-originals")
    assert ack["acknowledged"][0]["artifacts"] == []
    after = documents(c)
    for kind in ("frame", "raw_capture_frame", "artifact", "capture_artifact_ref"):
        assert {k: v for k, v in after.items() if k[0] == kind} == {k: v for k, v in before.items() if k[0] == kind}
    assert ingest(c, batch, [], "first-gap-without-originals") == ack


@pytest.mark.parametrize("claim", ["observed", "clock", "artifact", "method"])
def test_frameless_gap_cannot_invent_observations_or_originals(windows_setup, claim):
    c = windows_setup
    item = gap(c)
    if claim == "observed":
        item["evidence"]["coverage"] = "observed_samples"
    elif claim == "clock":
        item["clock"] = {"domain_id": "fake-clock", "elapsed_ms": 1, "uncertainty_ms": None}
    elif claim == "artifact":
        item["artifacts"] = [c.ref]
    else:
        item["method"] = "input_event"
    denied(c, lambda: ingest(c, {**c.batch, "records": [item]}, []), 422)


@pytest.mark.parametrize("failure_kind", ["raw_capture_frame", "capture_record", "capture_replay", "commit", "cancel"])
def test_all_staged_writes_roll_back_on_failure(windows_setup, monkeypatch, failure_kind):
    c = windows_setup
    before = documents(c)
    original_put, transaction = _MemoryTransaction.put, c.store.transaction
    seen = []

    def fail_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == ("capture_replay" if failure_kind == "cancel" else failure_kind):
            seen.append(failure_kind)
            if failure_kind == "cancel":
                raise CancelledError()
            raise RuntimeError("synthetic Windows write failure")

    @contextmanager
    def fail_commit(actor):
        with transaction(actor) as tx:
            yield tx
            seen.append("commit")
            raise RuntimeError("synthetic Windows write failure")

    with monkeypatch.context() as patch:
        if failure_kind == "commit":
            patch.setattr(c.store, "transaction", fail_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", fail_write)
        with pytest.raises(CancelledError if failure_kind == "cancel" else RuntimeError):
            ingest(c)
    assert seen == [failure_kind]
    assert documents(c) == before
    assert ingest(c)["acknowledged"][0]["disposition"] == "accepted"


def test_invalid_later_frame_cannot_partially_commit_valid_earlier_frame(windowscaptured):
    c = windowscaptured
    item, frame = additional(c)
    changed = deepcopy(c.windows_frame)
    changed["composed"]["ink_revision"] += 1
    batch = {**c.batch, "records": [item, c.batch["records"][0]]}
    denied(c, lambda: ingest(c, batch, [frame, changed], "partial-conflict"), 409, "record_conflict")


@pytest.mark.parametrize("missing", ["raw_capture_frame", "raw", "composed", "capture_record", "capture_slot",
                                     "capture_binding", "capture_artifact_ref"])
def test_replay_cannot_reconstruct_lost_originals_or_commit_witnesses(windowscaptured, missing):
    c = windowscaptured
    identities = {
        "raw_capture_frame": ("raw_capture_frame", c.windows_frame["frame_id"]),
        "raw": ("artifact", c.ref["artifact_id"]), "composed": ("artifact", c.composed_ref["artifact_id"]),
        "capture_record": ("capture_record", "process-1"),
        "capture_slot": ("capture_slot", storage_key(c.batch["device_id"], c.batch["stream_id"], 1)),
        "capture_binding": ("capture_binding", c.batch["stream_id"]),
        "capture_artifact_ref": ("capture_artifact_ref", c.composed_ref["artifact_id"]),
    }
    del c.store._documents[USER][identities[missing]]
    denied(c, lambda: ingest(c), 503, "original_unavailable" if missing in {"raw", "composed"} else "unavailable")
    assert identities[missing] not in documents(c)


@pytest.mark.parametrize("replay", [False, True])
@pytest.mark.parametrize("fence,status", [
    ("stop", 409), ("withdraw", 403), ("source_revoke", 404), ("delete", 404),
    ("generation", 403), ("membership", 403),
])
def test_current_lifecycle_fences_precede_new_and_cached_windows_ingress(windows_setup, replay, fence, status):
    c = windows_setup
    if replay:
        ingest(c)
    if fence in {"stop", "withdraw"}:
        apply(c, command(c, fence))
    elif fence == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif fence == "delete":
        c.archive.delete_source(USER, c.source["source_id"])
    elif fence == "generation":
        c.archive.set_authorization(USER, False)
        c.archive.set_authorization(USER)
    else:
        c.registry.set_membership(USER, c.batch["device_id"], c.batch["session_id"], active=False, expected_revision=1)
    denied(c, lambda: ingest(c), status)


def test_sealed_historical_windows_upload_preserves_stop(windows_setup):
    c = windows_setup
    apply(c, command(c))
    batch = {**c.batch, "delivery_mode": "historical"}
    denied(c, lambda: ingest(c, batch), 409, "capture_stopped")
    stop_fact(c, 1)
    stopped = apply(c, command(c, "seal_stop", revision=2, boundary=1), "seal")
    ack = ingest(c, batch)
    assert ingest(c, batch) == ack
    assert c.registry.read(USER, c.batch["stream_id"]) == stopped
    assert documents(c)[("session", c.batch["session_id"])]["live_capture"] is False
    item, frame = additional(c)
    denied(c, lambda: ingest(c, {**batch, "records": [item]}, [frame], "late-after-boundary"), 409, "capture_stopped")


@pytest.mark.parametrize("cached", [False, True])
def test_gap_witness_prevents_missing_profile_from_downgrading_admission(windows_setup, cached):
    c = windows_setup
    item = gap(c)
    batch = {**c.batch, "records": [item]}
    ingest(c, batch, [], "gap-profile-witness")
    rows = c.store._documents[USER]
    for kind in ("control_start", "control_stream"):
        del rows[(kind, c.batch["stream_id"])]["producer_profile"]
    if cached:
        denied(c, lambda: ingest(c, batch, [], "gap-profile-witness"), 403, "forbidden")
    else:
        child, frame = additional(c, parents=[item["record_id"]])
        denied(c, lambda: ingest(c, {**c.batch, "records": [child]}, [frame], "after-lost-profile"), 403, "forbidden")


@pytest.mark.parametrize("family", ["generic", "raw", "legacy"])
@pytest.mark.parametrize("cached", [False, True])
def test_gap_only_windows_witness_blocks_generic_old_family_fallback(windows_setup, family, cached):
    c = windows_setup
    structured = deepcopy(c.structured_batch)
    if family == "generic":
        structured["records"][0].update(
            frame_id=None, artifacts=[],
            source={name: c.core["SourceSnapshot"][name] for name in ("user_id", "source_id", "source_version")},
        )
        action = lambda: c.registry.capture.ingest(USER, structured, "lost-profile-fallback")
    elif family == "raw":
        action = lambda: c.registry.ingest_raw_frames(USER, structured, [c.raw_frame], "lost-profile-fallback")
    else:
        structured["records"][0]["media_position"] = c.frame["media_position"]
        action = lambda: c.registry.ingest_frames(USER, structured, [c.frame], "lost-profile-fallback")
    if cached:
        # Establish generic historical success before adopting desktop policy.
        for kind in ("control_start", "control_stream"):
            del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]
        assert action()["acknowledged"][0]["disposition"] == "accepted"
        c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    item = gap(c, sequence=2 if cached else 1,
               parents=["process-1"] if cached and family != "generic" else [])
    ingest(c, {**c.batch, "records": [item]}, [], "windows-gap-profile-witness")
    for kind in ("control_start", "control_stream"):
        del c.store._documents[USER][(kind, c.batch["stream_id"])]["producer_profile"]
    assert not any(kind == "raw_capture_frame" and row.get("contract_version") == "0.2.9"
                   for (kind, _), row in documents(c).items())
    if not cached:
        structured["records"][0].update(record_id="old-path-fallback", sequence=2,
                                        causal_parents=[item["record_id"]])
    denied(c, action, 403, "forbidden")


@pytest.mark.parametrize("kind", ["original_artifact_tombstone", "capture_artifact_tombstone"])
@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("replay", [False, True])
def test_empty_tombstone_presence_blocks_both_originals_and_cached_receipts(windows_setup, kind, role, replay):
    c = windows_setup
    if replay:
        ingest(c)
    ref = c.ref if role == "raw" else c.composed_ref
    c.store._documents[USER][(kind, ref["artifact_id"])] = {}
    denied(c, lambda: ingest(c), 404)


@pytest.mark.parametrize("variant", ["current-new", "current-cached", "ancestor-new", "ancestor-cached"])
def test_empty_capture_tombstone_blocks_current_or_parent_record(windows_setup, variant):
    c = windows_setup
    batch, frames, request_key = c.batch, [c.windows_frame], "windows-frames-1"
    if variant != "current-new":
        ingest(c)
    if variant.startswith("ancestor"):
        item, frame = additional(c, parents=["process-1"])
        batch, frames, request_key = {**c.batch, "records": [item]}, [frame], "windows-child"
        if variant == "ancestor-cached":
            ingest(c, batch, frames, request_key)
    c.store._documents[USER][("capture_tombstone", "process-1")] = {}
    denied(c, lambda: ingest(c, batch, frames, request_key), 404)


@pytest.mark.parametrize("replay", [False, True])
def test_last_authorization_check_withholds_new_or_cached_ack(windows_setup, monkeypatch, replay):
    c = windows_setup
    if replay:
        ingest(c)
    original_get, original_put = _MemoryTransaction.get, _MemoryTransaction.put
    seen = []

    def observe_get(tx, kind, identifier):
        value = original_get(tx, kind, identifier)
        if replay and kind == "capture_replay" and value is not None:
            seen.append("cached")
        return value

    def observe_put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "capture_replay":
            seen.append("staged")

    def guard(state):
        if seen:
            raise DomainError(401, "unauthenticated")

    c.registry.capture.archive.authorization_guard = guard
    monkeypatch.setattr(_MemoryTransaction, "get", observe_get)
    monkeypatch.setattr(_MemoryTransaction, "put", observe_put)
    denied(c, lambda: ingest(c), 401, "unauthenticated")
    assert seen == ["cached" if replay else "staged"]


@pytest.mark.parametrize("entry", ["legacy", "raw", "desktop", "legacy_http", "raw_http", "desktop_http"])
def test_windows_metadata_does_not_widen_old_internal_or_http_entries(windows_setup, entry):
    c = windows_setup
    if not entry.endswith("_http"):
        submit = {"legacy": c.registry.ingest_frames, "raw": c.registry.ingest_raw_frames,
                  "desktop": c.registry.ingest_desktop_frames}[entry]
        denied(c, lambda: submit(USER, c.batch, [c.windows_frame], "wrong-family"), 422)
        return
    from services.api.tests.test_desktop_ingress_http import app, DESKTOP_ROUTE
    from services.api.tests.test_ingress_http import FRAMES
    from services.api.tests.test_raw_ingress_http import app as raw_app, RAW_FRAMES
    route, version = {"legacy_http": (FRAMES, "0.2.4"), "raw_http": (RAW_FRAMES, "0.2.6"),
                      "desktop_http": (DESKTOP_ROUTE, "0.2.8")}[entry]
    before = documents(c)
    response = request(raw_app(c) if entry == "raw_http" else app(c), "POST", route,
                       body={"contract_version": version, "batch": c.batch, "frames": [c.windows_frame]},
                       request_key="windows-through-old-http")
    assert response.status_code == 422
    assert documents(c) == before


@pytest.mark.parametrize("parent_family", ["raw", "desktop"])
def test_known_old_typed_ancestors_remain_readable_to_windows_writer(windows_setup, parent_family):
    c = windows_setup
    if parent_family == "raw":
        c.registry.ingest_raw_frames(USER, c.batch, [c.raw_frame], "old-parent")
    else:
        path = EXAMPLES.parents[2] / "desktop_frame/examples/macos-synthetic.json"
        frame = json.loads(path.read_text())
        frame.update(frame_id=c.raw_frame["frame_id"], source=deepcopy(c.source), artifact=deepcopy(c.ref),
                     raw_width=2, raw_height=2,
                     **{field: c.batch[field] for field in ("device_id", "session_id", "stream_id")})
        c.registry.ingest_desktop_frames(USER, c.batch, [frame], "old-parent")
    child, frame = additional(c, parents=["process-1"])
    batch = {**c.batch, "records": [child]}
    ack = ingest(c, batch, [frame], "windows-child")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert ingest(c, batch, [frame], "windows-child") == ack


@pytest.mark.parametrize("first", ["windows", "raw", "legacy"])
def test_frame_identity_is_shared_across_windows_and_old_families(windows_setup, first):
    c = windows_setup
    if first == "windows":
        ingest(c)
        denied(c, lambda: c.registry.ingest_raw_frames(USER, c.batch, [c.raw_frame], "colliding-frame"),
               409, "record_conflict")
    elif first == "raw":
        c.registry.ingest_raw_frames(USER, c.batch, [c.raw_frame], "old-frame-first")
        denied(c, lambda: ingest(c), 409, "record_conflict")
    else:
        batch = deepcopy(c.batch)
        batch["records"][0]["media_position"] = c.frame["media_position"]
        c.registry.ingest_frames(USER, batch, [c.frame], "legacy-frame-first")
        denied(c, lambda: ingest(c), 409, "frame_identity_conflict")


@pytest.mark.parametrize("damage", ["unknown-version", "missing-composition"])
def test_corrupt_retained_ancestor_blocks_child_without_partial_writes(windowscaptured, damage):
    c = windowscaptured
    frame = c.store._documents[USER][("raw_capture_frame", c.windows_frame["frame_id"])]
    if damage == "unknown-version":
        frame["contract_version"] = "0.2.99"
    else:
        del frame["composed"]
    item, child = additional(c, parents=["process-1"])
    denied(c, lambda: ingest(c, {**c.batch, "records": [item]}, [child], "corrupt-ancestor-child"),
           503, "unavailable")
