"""Synthetic 0.2.9 role-aware adapters; no actual producer or Backend acceptance."""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
import json
from pathlib import Path

from jsonschema import ValidationError
import pytest

from services.learning.archive import canonical, digest
from services.learning.process_context import (
    compose_process_context, prepare_stored_process_context, prepare_observation_window,
)
from test_image_evidence import png
from test_process_context import coverage, forbidden
from test_raw_process_context import raw_supplied, changed


def windows_supplied(*, alias=None, composed=True):
    """Retained-shape test data with project-authored raw/overlaid pixels."""
    def make_png(pixels):
        return png(width=4, height=2, color=6, raw=b"\0" + pixels[:16] + b"\0" + pixels[16:])
    pixels = {"raw": bytes(range(32)), "composed": bytes(reversed(range(32)))}
    if alias:
        pixels["composed"] = pixels["raw"]
    data = {role: make_png(value) for role, value in pixels.items()}
    batch, sources, _, _ = raw_supplied(data["raw"])
    record = batch["records"][0]
    path = Path(__file__).resolve().parents[2] / "packages/contracts/windows_frame/examples/windows-retained.json"
    frame = json.loads(path.read_text())[0]
    frame.update(frame_id=record["frame_id"], source=deepcopy(record["source"]),
                 **{key: batch[key] for key in ("device_id", "session_id", "stream_id")})
    frame["profile"]["capture_session"] = "synthetic-capture"
    frame["profile"]["source_at_start"]["label"] = "Synthetic test-only display"
    frame["composed"].update(ink_session="synthetic-ink", transformation="Synthetic test-only composition")
    refs = {}
    for role, picture in (("raw", frame["raw"]), ("composed", frame["composed"]["image"])):
        ref = {"artifact_id": "synthetic-" + ("raw" if alias == "same_id" else role),
               "sha256": digest(data[role]), "byte_length": len(data[role]), "media_type": "image/png"}
        picture.update(artifact=ref, width=4, height=2, pixels_sha256=digest(pixels[role]),
                       native_file="frames/" + ref["sha256"] + ".png")
        if role == "raw" or composed:
            refs[ref["artifact_id"]] = ref
    if not composed:
        frame["composed"] = None
    record["artifacts"] = [*deepcopy(list(refs.values())), {
        "artifact_id": "separate-editable-ink", "sha256": "a" * 64,
        "byte_length": 52, "media_type": "application/json",
    }]
    record["evidence"]["reason_quote"] = "Synthetic original explanation 原话。"
    return batch, sources, [frame], data


def resolver_for(values, calls=None):
    def resolve(frame, *, image_role, max_bytes):
        assert frame in values[2] and all(frame is not original for original in values[2])
        assert image_role in ("raw", "composed")
        if calls is not None:
            calls.append((frame["frame_id"], image_role, max_bytes))
        return {"status": "available", "frame": frame, "image_role": image_role,
                "media_type": "image/png", "data": values[3][image_role]}
    return resolve


def supplied(values, *, resolve=None, **limits):
    return compose_process_context(*values[:3], forbidden, user_id=values[1][0]["user_id"],
        windows_resolver=resolver_for(values) if resolve is None else resolve, **limits)


def stored(values, *, function=prepare_observation_window, read=None, resolve=None, **limits):
    batch, sources, frames, _ = values
    snapshot = {"batch": {**deepcopy(batch), "delivery_mode": "historical"},
                "sources": deepcopy(sources), "frames": deepcopy(frames)}
    def reader(ids, **kwargs):
        assert ids == [r["record_id"] for r in batch["records"]]
        assert kwargs == {"max_metadata_bytes": 4 * 1024 * 1024}
        return deepcopy(snapshot)
    return function([r["record_id"] for r in batch["records"]], reader if read is None else read,
        forbidden, user_id=sources[0]["user_id"],
        windows_resolver=resolver_for(values) if resolve is None else resolve, **limits)


def metadata_size(packet):
    # Independently measure both known attachments, retaining every other field.
    copied = deepcopy(packet)
    for item in copied["items"]:
        for key in ("image", "composed_image"):
            if key in item:
                item[key].pop("data", None)
    return len(canonical(copied))


def add_second(values):
    record, frame = deepcopy(values[0]["records"][0]), deepcopy(values[2][0])
    record.update(record_id="second", sequence=2, frame_id="second-frame", causal_parents=["process-1"])
    frame["frame_id"] = "second-frame"
    values[0]["records"].append(record)
    values[2].append(frame)


@pytest.mark.parametrize("alias", [None, "same_id", "different_id"])
@pytest.mark.parametrize("entry", [supplied, stored])
def test_two_originals_are_separate_exact_and_counted_even_with_identical_aliases(alias, entry):
    values, calls = windows_supplied(alias=alias), []
    before = deepcopy(values)
    packet = entry(values, resolve=resolver_for(values, calls))
    item = packet["items"][0]
    assert item["record"] == values[0]["records"][0] and item["frame"] == values[2][0]
    for role, key in (("raw", "image"), ("composed", "composed_image")):
        assert item[key] == {"status": "attached", "image_role": role,
                             "media_type": "image/png", "data": values[3][role],
                             "byte_length": len(values[3][role])}
    assert packet["attached_bytes"] == sum(len(data) for data in values[3].values())
    assert [call[1] for call in calls] == ["raw", "composed"]
    assert packet["presentation_permission"] == "not_granted"
    assert packet["live_status"] == packet["provider_receipt"] == "not_attested"
    assert packet["non_frame_artifacts"] == "references_only"
    assert item["provider_image_alignment"] == "not_attested"
    item["frame"]["composed"]["ink_revision"] = 99
    assert values == before


def test_raw_only_composition_is_explicitly_absent_and_not_resolved():
    values, calls = windows_supplied(composed=False), []
    result = stored(values, resolve=resolver_for(values, calls))
    assert result["items"][0]["composed_image"] == {"status": "not_present", "image_role": "composed"}
    assert [call[1] for call in calls] == ["raw"]
    assert result["attached_bytes"] == len(values[3]["raw"])


@pytest.mark.parametrize("wrong", [None, "raw", "composed", "other"])
def test_exact_role_is_required_even_for_identical_bytes(wrong):
    values = windows_supplied(alias="same_id")
    def swapped(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if wrong is None:
            result.pop("image_role")
        else:
            result["image_role"] = wrong
        return result
    packet = supplied(values, resolve=swapped)
    for role, key in (("raw", "image"), ("composed", "composed_image")):
        assert packet["items"][0][key]["status"] == ("attached" if wrong == role else "image_role_mismatch")
    assert packet["attached_bytes"] == (len(values[3][wrong]) if wrong in values[3] else 0)


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage,expected", [
    ("descriptor", "frame_mismatch"), ("other_pixels", "hash_mismatch"),
    ("type", "invalid_image_bytes"), ("mime", "unsupported_media_type"),
])
def test_substitution_never_falls_back_to_the_other_image(role, damage, expected):
    values = windows_supplied()
    def damaged(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if image_role == role:
            if damage == "descriptor":
                result["frame"]["profile"]["capture_session"] = "replaced"
            elif damage == "other_pixels":
                result["data"] = values[3]["composed" if role == "raw" else "raw"]
            elif damage == "type":
                result["data"] = bytearray(result["data"])
            else:
                result["media_type"] = "image/jpeg"
        return result
    item = supplied(values, resolve=damaged)["items"][0]
    assert item["image" if role == "raw" else "composed_image"] == {"status": expected, "image_role": role}
    assert item["composed_image" if role == "raw" else "image"]["status"] == "attached"


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_per_image_gaps_keep_metadata_and_other_original(role, status):
    values = windows_supplied()
    def missing(frame, *, image_role, max_bytes):
        if image_role == role:
            return {"status": status, "data": b"ignored stale pixels"}
        return resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
    packet = supplied(values, resolve=missing)
    item = packet["items"][0]
    assert item["image" if role == "raw" else "composed_image"] == {"status": status, "image_role": role}
    assert item["composed_image" if role == "raw" else "image"]["status"] == "attached"
    assert item["frame"] == values[2][0]


@pytest.mark.parametrize("damage", ["crc", "length", "dimensions", "pixels"])
def test_existing_bounded_png_checks_apply_to_both_roles(damage):
    values = windows_supplied()
    pictures = [values[2][0]["raw"], values[2][0]["composed"]["image"]]
    expected = {"crc": "invalid_image", "length": "artifact_mismatch", "dimensions": "dimension_mismatch", "pixels": "pixel_limit"}[damage]
    for role, picture in zip(("raw", "composed"), pictures):
        ref = picture["artifact"]
        if damage == "crc":
            data = values[3][role]
            values[3][role] = data[:-1] + bytes([data[-1] ^ 1])
            ref["sha256"] = digest(values[3][role])
            picture["native_file"] = "frames/" + ref["sha256"] + ".png"
        elif damage == "length":
            ref["byte_length"] -= 1
        elif damage == "dimensions":
            picture.update(width=2, height=4)
        for i, old in enumerate(values[0]["records"][0]["artifacts"]):
            if old["artifact_id"] == ref["artifact_id"]:
                values[0]["records"][0]["artifacts"][i] = deepcopy(ref)
    packet = supplied(values, **({"max_pixels": 7} if damage == "pixels" else {}))
    assert packet["items"][0]["image"]["status"] == expected
    assert packet["items"][0]["composed_image"]["status"] == expected
    assert packet["attached_bytes"] == 0


@pytest.mark.parametrize("alias", [None, "same_id"])
def test_exact_byte_edges_count_every_attachment_and_metadata_excludes_only_payloads(alias):
    values = windows_supplied(alias=alias)
    raw, composed = map(len, (values[3]["raw"], values[3]["composed"]))
    for limit, statuses in ((raw - 1, ("byte_limit", "byte_limit")),
                            (raw, ("attached", "byte_limit")),
                            (raw + composed - 1, ("attached", "byte_limit")),
                            (raw + composed, ("attached", "attached"))):
        result = stored(values, max_total_bytes=limit)
        item = result["items"][0]
        assert (item["image"]["status"], item["composed_image"]["status"]) == statuses
        assert result["attached_bytes"] == sum(image.get("byte_length", 0) for image in (item["image"], item["composed_image"])) <= limit
    result = stored(values)
    size = metadata_size(result)
    successes = 0
    for limit in range(size - 10, size + 2):
        try:
            bounded = stored(values, max_metadata_bytes=limit)
        except ValueError as error:
            assert "withheld" in str(error)
        else:
            successes += 1
            assert bounded["counts"]["omitted"] == 0 and metadata_size(bounded) <= limit
            assert bounded["items"][0]["composed_image"]["data"] == values[3]["composed"]
    assert successes
    for limit in (1000, 2000, 4000, size):
        bounded = supplied(values, max_metadata_bytes=limit)
        assert metadata_size(bounded) <= limit


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.8"), (("contract_version",), "0.3.0"),
    (("kind",), "raw_capture_frame"), (("source", "user_id"), "foreign"),
    (("source", "source_version"), 2), (("device_id",), "other"), (("session_id",), "other"),
    (("stream_id",), "other"), (("profile", "kind"), "macos_screencapturekit"),
    (("composed", "ink_revision"), -1), (("composed", "image", "artifact", "byte_length"), 1),
])
def test_all_bindings_and_versions_are_checked_before_either_resolver(path, value):
    values = windows_supplied()
    changed(values[2][0], path, value)
    with pytest.raises((ValidationError, ValueError)):
        supplied(values, resolve=forbidden, max_metadata_bytes=1000)


def test_explicit_resolver_and_both_original_refs_are_required_without_widening_old_resolver():
    values = windows_supplied()
    with pytest.raises(ValueError, match="windows_resolver"):
        compose_process_context(*values[:3], forbidden, user_id=values[1][0]["user_id"])
    values[0]["records"][0]["artifacts"].pop(1)
    with pytest.raises(ValidationError):
        supplied(values, resolve=forbidden)


def test_frameless_gaps_stay_frameless_and_no_capture_clock_or_freshness_is_inferred():
    values = windows_supplied()
    gap = coverage(values[0])
    values[0]["records"].append(gap)
    sample = values[2][0]["profile"]["sample"]
    sample.update(state="gap", gap_ms=None, taken_at="2026-10-01T00:00:00Z",
                  presented_frames=0, presentation_ms=None, frame_age_ms=None)
    result = stored(values)
    first, missing = result["items"]
    assert first["frame"]["profile"]["sample"] == sample
    assert first["record"]["clock"] is first["record"]["observed_at"] is None
    assert missing["frame"] is None and missing["record"] == gap and "composed_image" not in missing
    pair = result["observation_window"]["comparisons"][0]
    assert pair["retained_image_role"] == "raw"
    assert pair["retained_image_bytes"] == pair["retained_composed_image_bytes"] == "unknown"
    assert pair["clock_readings"] == {"status": "unknown", "reason": "no_process_capture_clock"}
    assert result["capture_completeness"] == "unknown" and result["live_status"] == "not_attested"


def test_adjacent_raw_and_composed_comparisons_are_independent():
    values = windows_supplied()
    add_second(values)
    # The second composition uses the same raw original, with an explicitly
    # changed/forked ink label; neither pixels nor labels prove drawing history.
    second = values[2][1]
    second["composed"].update(image=deepcopy(second["raw"]), ink_session="synthetic-fork", ink_revision=0)
    def resolve(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if frame["frame_id"] == "second-frame" and image_role == "composed":
            result["data"] = values[3]["raw"]
        return result
    packet = stored(values, resolve=resolve)
    pair = packet["observation_window"]["comparisons"][0]
    assert pair["retained_image_bytes"] == "identical" and pair["retained_image_role"] == "raw"
    assert pair["retained_composed_image_bytes"] == "different"
    assert packet["observation_window"]["semantic_change"] == packet["observation_window"]["user_reasoning"] == "not_inferred"


@pytest.mark.parametrize("function", [prepare_stored_process_context, prepare_observation_window])
@pytest.mark.parametrize("fence", ["revoke", "change"])
def test_synthetic_mid_read_revoke_or_change_withholds_both_payloads(function, fence):
    values, calls, read_calls, publish = windows_supplied(), [], [], []
    snapshot = {"batch": {**deepcopy(values[0]), "delivery_mode": "historical"},
                "sources": deepcopy(values[1]), "frames": deepcopy(values[2])}
    def reader(ids, **kwargs):
        read_calls.append(ids.copy())
        if calls and fence == "revoke":
            raise PermissionError("Synthetic current source revocation")
        result = deepcopy(snapshot)
        if calls:
            result["frames"][0]["composed"]["ink_revision"] += 1
        return result
    with pytest.raises(PermissionError if fence == "revoke" else ValueError):
        publish.append(stored(values, function=function, read=reader, resolve=resolver_for(values, calls)))
    assert [call[1] for call in calls] == ["raw", "composed"]
    assert read_calls == [["process-1"]] * 2 and not publish


@pytest.mark.parametrize("stage", ["read", "raw", "composed", "recheck"])
@pytest.mark.parametrize("error", [FutureCancelledError, asyncio.CancelledError])
def test_cancellation_never_returns_one_of_two_images(stage, error):
    values, reads = windows_supplied(), []
    def reader(ids, **kwargs):
        reads.append(ids.copy())
        if stage == "read" or (len(reads) == 2 and stage == "recheck"):
            raise error()
        return {"batch": {**deepcopy(values[0]), "delivery_mode": "historical"},
                "sources": deepcopy(values[1]), "frames": deepcopy(values[2])}
    def resolver(frame, *, image_role, max_bytes):
        if stage == image_role:
            raise error()
        return resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
    with pytest.raises(error):
        stored(values, read=reader, resolve=resolver)


def test_legacy_and_windows_use_only_their_own_resolver_seams_in_one_supplied_context():
    values, calls = windows_supplied(), []
    old_batch, _, old_frames, _ = raw_supplied(values[3]["raw"])
    record, frame = old_batch["records"][0], old_frames[0]
    record.update(record_id="old-process", sequence=2, frame_id="old-frame")
    frame.update(frame_id="old-frame", raw_width=4, raw_height=2)
    values[0]["records"].append(record)
    values[2].append(frame)
    def legacy_resolver(descriptor, *, max_bytes):
        assert descriptor == frame
        calls.append("legacy")
        return {"status": "available", "frame": descriptor, "media_type": "image/png", "data": values[3]["raw"]}
    packet = compose_process_context(*values[:3], legacy_resolver, user_id=values[1][0]["user_id"],
                                     windows_resolver=resolver_for(values, calls))
    assert [call[1] if isinstance(call, tuple) else call for call in calls] == ["raw", "composed", "legacy"]
    old = packet["items"][1]
    assert old["frame"] == frame and old["image"]["status"] == "attached"
    assert "image_role" not in old["image"] and "composed_image" not in old
    assert packet["attached_bytes"] == 2 * len(values[3]["raw"]) + len(values[3]["composed"])


def test_synthetic_revocation_between_two_reads_cannot_publish_the_first_image():
    values, allowed, calls, published = windows_supplied(), [True], [], []
    def reader(ids, **kwargs):
        if not allowed[0]:
            raise PermissionError("Synthetic current source denied")
        return {"batch": {**deepcopy(values[0]), "delivery_mode": "historical"},
                "sources": deepcopy(values[1]), "frames": deepcopy(values[2])}
    def resolver(frame, *, image_role, max_bytes):
        calls.append(image_role)
        if not allowed[0]:
            return {"status": "revoked"}
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        allowed[0] = False
        return result
    with pytest.raises(PermissionError):
        published.append(stored(values, read=reader, resolve=resolver))
    assert calls == ["raw", "composed"] and not published
