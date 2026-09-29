"""Synthetic PNG pixels only; no screenshot, provider or real-device acceptance."""

from copy import deepcopy
from pathlib import Path
import struct
import zlib

import pytest

from services.learning.archive import ArchiveSnapshot, canonical, digest
from services.learning.context import assemble_context
from services.learning.images import materialize_image_evidence
from services.learning.retrieval import RetrievalIndex
from test_memory import tiny_bundle

USER = "synthetic-learner"
QUERY = {"text": "basis physical arrow", "actor": "user"}


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png(*, color=2, raw=None, width=2, height=2, extra=b"", depth=8, interlace=0):
    """Project-authored TEST DATA: two rows of colored pixels, never user history."""
    channels = 4 if color == 6 else 3
    raw = raw if raw is not None else (b"\0" + bytes(range(channels)) * width) * height
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, interlace))
            + chunk(b"tEXt", b"Comment\0SYNTHETIC TEST DATA, test_only") + extra
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def build(data=None, *, mode="current", gaps=(), representation="synthetic_fixture"):
    sources, frames, events, _ = tiny_bundle()
    data = png() if data is None else data
    for frame in frames:
        frame.update(content_hash=digest(data), width=2, height=2, representation=representation)
    for event in events:
        event["gap_flags"] = list(gaps)
    artifacts = {f["artifact_id"]: data for f in frames}
    archive = ArchiveSnapshot(sources, frames, events, artifacts, user_id=USER)
    context = assemble_context(archive, RetrievalIndex(archive), {**QUERY, "mode": mode}, user_id=USER)
    return archive, context


def resolver_for(archive):
    def resolve(frame, *, max_bytes):
        data = archive.artifacts[frame["artifact_id"]]
        if len(data) > max_bytes:
            return {"status": "byte_limit"}
        return {"status": "available", "frame": frame, "media_type": "image/png", "data": data}
    return resolve


def states(archive, state="active"):
    return {(e["session_id"], e["device_id"]): state for e in archive.events.values()}


def materialize(archive, context, resolver=None, **kwargs):
    kwargs.setdefault("capture_states", states(archive))
    return materialize_image_evidence(archive, context, resolver or resolver_for(archive), user_id=USER, **kwargs)


def forbidden(*args, **kwargs):
    pytest.fail("Disallowed image resolver or filesystem access")


@pytest.mark.parametrize("color", [2, 6])
def test_actual_bytes_and_all_original_references_survive(color, monkeypatch):
    data = png(color=color)
    archive, context = build(data)
    before = canonical(context), deepcopy(archive.events), deepcopy(archive.frames), dict(archive.artifacts)
    monkeypatch.setattr(Path, "open", forbidden)
    output = materialize(archive, context)
    assert output["live_status"] == output["provider_receipt"] == "not_attested"
    assert output["presentation_permission"] == "not_granted"
    assert output["capture_completeness"] == "unknown"
    assert output["attached_bytes"] == len(data) * len(context["items"])
    assert {r["snapshot_status"] for r in output["items"]} == {"historical", "current_candidate"}
    for item, row in zip(context["items"], output["items"]):
        assert row["status"] == "attached" and row["data"] == data
        assert row["evidence_kind"] == "synthetic_image"
        assert row["reference"]["frame"] == item["evidence"]["frame"]
        for key in ("captured_at", "received_at", "media_position", "source_hash", "provenance", "actor"):
            assert row["reference"][key] == item["evidence"][key]
    output["items"][0]["reference"]["frame"]["width"] = 999
    assert before == (canonical(context), archive.events, archive.frames, dict(archive.artifacts))


@pytest.mark.parametrize("mode", ["current", "history"])
@pytest.mark.parametrize("state", ["active", "stopped", "disconnected", "stale", "unknown"])
def test_capture_restrictions_never_become_a_live_or_disclosure_grant(mode, state):
    archive, context = build(mode=mode)
    allowed = mode == "history" or state == "active"
    result = materialize(archive, context, None if allowed else forbidden, capture_states=states(archive, state))
    assert all(r["status"] == ("attached" if allowed else "capture_" + state) for r in result["items"])
    assert all(r["context_mode"] == mode for r in result["items"])
    assert result["live_status"] == "not_attested" and result["presentation_permission"] == "not_granted"


def test_unlisted_device_is_unknown_not_implicitly_enabled():
    archive, context = build()
    result = materialize(archive, context, forbidden, capture_states={("other-session", "other-device"): "active"})
    assert all(r["status"] == "capture_unknown" for r in result["items"])


def test_distinct_observed_images_keep_time_device_and_history_without_fabricating_steps():
    sources, frames, events, _ = tiny_bundle()
    original_data, changed_data = png(), png(raw=(b"\0" + b"\xff\0\0" * 2) * 2)
    for frame in frames:
        frame.update(width=2, height=2, content_hash=digest(original_data))
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    original = next(e for e in events if e["event_id"] == "e-02-u")
    changed_frame = {**frames[0], "frame_id": "synthetic-change-frame", "artifact_id": "synthetic-change-artifact",
                     "captured_at": correction["captured_at"], "device_id": "synthetic-second-device",
                     "content_hash": digest(changed_data)}
    correction.update(frame_id=changed_frame["frame_id"], device_id=changed_frame["device_id"])
    artifacts = {f["artifact_id"]: original_data for f in frames}
    artifacts[changed_frame["artifact_id"]] = changed_data
    frames.append(changed_frame)
    archive = ArchiveSnapshot(sources, frames, events, artifacts, user_id=USER)
    context = assemble_context(archive, RetrievalIndex(archive), QUERY, user_id=USER)
    result = materialize(archive, context)
    rows = {r["reference"]["event_id"]: r for r in result["items"]}
    assert rows["e-02-u"]["data"] == original_data and rows["e-02-u"]["snapshot_status"] == "historical"
    assert rows["e-02-c"]["data"] == changed_data and rows["e-02-c"]["snapshot_status"] == "current_candidate"
    assert rows["e-02-c"]["reference"]["frame"]["captured_at"] == correction["captured_at"]
    assert result["capture_completeness"] == "unknown" and result["presentation_permission"] == "not_granted"
    result = materialize(archive, context, capture_states={(original["session_id"], original["device_id"]): "active"})
    rows = {r["reference"]["event_id"]: r for r in result["items"]}
    assert rows["e-02-u"]["status"] == "attached" and rows["e-02-c"]["status"] == "capture_unknown"
    result = materialize_image_evidence(archive, context, forbidden, user_id=USER)
    assert all(r["status"] == "capture_unknown" for r in result["items"])


@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_resolver_gaps_never_fall_back_to_snapshot_bytes(status):
    archive, context = build(mode="history")
    result = materialize(archive, context, lambda *a, **k: {"status": status, "data": b"must not escape"})
    assert result["attached_bytes"] == 0
    assert all(r["status"] == status and "data" not in r for r in result["items"])
    assert archive.artifacts


@pytest.mark.parametrize("field,value", [("user_id", "other"), ("frame_id", "other"), ("artifact_id", "other"),
    ("content_hash", "f" * 64), ("source_version", 2), ("source_version", True), ("device_id", "other"),
    ("session_id", "other"), ("captured_at", "2026-01-01T00:00:00Z")])
def test_wrong_returned_frame_is_not_attached(field, value):
    archive, context = build()
    def resolve(frame, **kwargs):
        reply = resolver_for(archive)(frame, **kwargs)
        reply["frame"][field] = value
        return reply
    result = materialize(archive, context, resolve)
    assert all(r["status"] == "frame_mismatch" and "data" not in r for r in result["items"])


@pytest.mark.parametrize("value,status", [(b"wrong bytes", "hash_mismatch"), ("OCR text", "invalid_image_bytes"),
    (Path("/tmp/not-an-image"), "invalid_image_bytes"), (bytearray(b"mutable"), "invalid_image_bytes"),
    (b"", "byte_limit")])
def test_wrong_data_is_not_reinterpreted_or_opened(value, status):
    archive, context = build()
    def resolve(frame, **kwargs):
        return {**resolver_for(archive)(frame, **kwargs), "data": value}
    result = materialize(archive, context, resolve)
    assert all(r["status"] == status and "data" not in r for r in result["items"])


@pytest.mark.parametrize("data,status", [
    (b"OCR or DOM text", "invalid_image"), (b"<svg>mock drawing</svg>", "invalid_image"),
    (png()[:-1], "invalid_image"), (png() + b"extra", "invalid_image"),
    (png()[:-5] + b"X" + png()[-4:], "invalid_image"),
    (png(raw=b"\0"), "invalid_image"), (png(raw=b"\0" * 1000000), "invalid_image"),
    (png(raw=(b"\5" + b"\0" * 6) * 2), "invalid_image"),
    (png(width=3), "dimension_mismatch"), (png(depth=16), "unsupported_image_variant"),
    (png(interlace=1), "unsupported_image_variant"),
    (png(extra=chunk(b"acTL", struct.pack(">II", 1, 0))), "unsupported_image_variant"),
])
def test_even_hash_matching_originals_need_supported_valid_pixel_data(data, status):
    archive, context = build(data)
    original = dict(archive.artifacts)
    result = materialize(archive, context)
    assert all(r["status"] == status and "data" not in r for r in result["items"])
    assert dict(archive.artifacts) == original


def test_unsupported_mime_preserves_original_without_conversion():
    archive, context = build()
    def resolve(frame, **kwargs):
        return {**resolver_for(archive)(frame, **kwargs), "media_type": "image/jpeg"}
    result = materialize(archive, context, resolve)
    assert all(r["status"] == "unsupported_media_type" and "data" not in r for r in result["items"])


@pytest.mark.parametrize("condition", ["dom", "missing", "stale"])
def test_unobservable_or_stale_frames_do_not_resolve(condition):
    archive, context = build(representation="dom_snapshot" if condition == "dom" else "synthetic_fixture",
                             gaps=[{"missing": "missing_frame", "stale": "stale_frame"}[condition]] if condition != "dom" else [])
    result = materialize(archive, context, forbidden)
    assert all(r["status"] == {"dom": "unobservable_pixels", "missing": "missing_frame", "stale": "stale_frame"}[condition]
               for r in result["items"])


def test_null_frame_stays_missing_without_fabricating_pixels():
    sources, frames, events, artifacts = tiny_bundle()
    for event in events:
        event.update(frame_id=None, gap_flags=[])
    archive = ArchiveSnapshot(sources, frames, events, artifacts, user_id=USER)
    context = assemble_context(archive, RetrievalIndex(archive), QUERY, user_id=USER)
    result = materialize(archive, context, forbidden)
    assert all(r["status"] == "missing_frame" and r["reference"]["frame"] is None for r in result["items"])


def test_exact_limits_do_not_truncate_or_replace_and_resolver_sees_remaining_budget():
    data = png()
    archive, context = build(data)
    limits = []
    def resolve(frame, *, max_bytes):
        limits.append(max_bytes)
        return resolver_for(archive)(frame, max_bytes=max_bytes)
    result = materialize(archive, context, resolve, max_image_bytes=len(data), max_total_bytes=len(data))
    assert limits == [len(data)]
    assert result["items"][0]["data"] == data
    assert result["items"][1]["status"] == "byte_limit"
    assert result["attached_bytes"] == len(data)
    result = materialize(archive, context, max_image_bytes=len(data) - 1)
    assert all(r["status"] == "byte_limit" for r in result["items"])
    result = materialize(archive, context, max_pixels=3)
    assert all(r["status"] == "pixel_limit" for r in result["items"])


def test_resolver_exceeding_bound_is_rejected_even_if_hash_and_frame_match():
    data = png()
    archive, context = build(data)
    def resolve(frame, **kwargs):
        return {"status": "available", "frame": frame, "media_type": "image/png", "data": data}
    result = materialize(archive, context, resolve, max_total_bytes=len(data) - 1)
    assert result["attached_bytes"] == 0
    assert all(r["status"] == "byte_limit" and "data" not in r for r in result["items"])


@pytest.mark.parametrize("result", [None, {"status": "unknown"}])
def test_malformed_resolver_status_cannot_be_success(result):
    archive, context = build()
    with pytest.raises(ValueError):
        materialize(archive, context, lambda *a, **k: result)


def test_resolver_exception_is_not_hidden_or_retried():
    archive, context = build()
    calls = []
    def resolve(*args, **kwargs):
        calls.append(1)
        raise PermissionError("revoked while reading")
    with pytest.raises(PermissionError):
        materialize(archive, context, resolve)
    assert calls == [1]


@pytest.mark.parametrize("damage", ["owner", "fingerprint", "frame", "source", "historical_label", "duplicate"])
def test_bad_context_binding_is_rejected_before_any_resolver(damage):
    archive, context = build()
    if damage == "owner":
        context["user_id"] = "other"
    elif damage == "fingerprint":
        context["archive_fingerprint"] = "f" * 64
    elif damage == "frame":
        context["items"][-1]["evidence"]["frame"]["artifact_id"] = "other"
    elif damage == "source":
        context["items"][-1]["evidence"]["source_hash"] = "f" * 64
    elif damage == "historical_label":
        context["items"][-1]["snapshot_status"] = "current_candidate"
    else:
        context["items"].append(deepcopy(context["items"][0]))
    with pytest.raises(ValueError):
        materialize(archive, context, forbidden)


def test_archive_mutation_during_resolve_fails_without_returning_partial_images():
    archive, context = build()
    def resolve(frame, **kwargs):
        archive.sources[(USER, frame["source_id"], frame["source_version"])]["access_status"] = "needs_auth"
        return resolver_for(archive)(frame, **kwargs)
    with pytest.raises(ValueError, match="Archive mutated|Archive changed"):
        materialize(archive, context, resolve)


@pytest.mark.parametrize("option,value", [("max_image_bytes", True), ("max_total_bytes", 0), ("max_pixels", 16_000_001),
    ("capture_states", {"device": "active"})])
def test_invalid_limits_and_state_fail_before_access(option, value):
    archive, context = build()
    with pytest.raises(ValueError):
        materialize(archive, context, forbidden, **{option: value})
