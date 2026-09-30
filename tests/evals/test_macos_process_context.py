"""Audited Swift synthetic PNGs with test-only bindings/readers/resolvers.

No actual display capture, production Backend 0.2.11 adapter or provider receipt.
"""

import asyncio
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
import json
from pathlib import Path

from jsonschema import ValidationError
import pytest

from packages.contracts.macos_frame import REOPENED_LIMIT, UNKNOWN_OVERLAY_SCOPE
from services.learning.archive import canonical, digest
from services.learning.process_context import (
    compose_process_context, prepare_stored_process_context, prepare_observation_window,
)
from test_process_context import coverage, forbidden
from test_raw_process_context import raw_supplied, changed
from test_windows_process_context import metadata_size, windows_supplied, resolver_for as windows_resolver_for

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "docs/verification/lead/macos-composed-hosted/macos-composed-fixture/20260921T141320Z-A2ECCA80"


def macos_supplied(indices=(2,), *, alias=None, unknown=False):
    examples = json.loads((ROOT / "packages/contracts/macos_frame/examples/macos-retained.json").read_text())
    batch, sources, _, _ = raw_supplied()
    template = batch["records"][0]
    records, frames, data = [], [], {}
    ink_bytes = (NATIVE / "ink/ink.json").read_bytes()
    # This standalone immutable reference is not proof of any paired revision.
    ink_ref = {"artifact_id": "synthetic-editable-reference", "sha256": digest(ink_bytes),
               "byte_length": len(ink_bytes), "media_type": "application/json"}
    for ordinal, index in enumerate(indices):
        frame, record = deepcopy(examples[index]), deepcopy(template)
        frame.update(frame_id=f"mac-frame-{ordinal}", source=deepcopy(record["source"]),
                     **{key: batch[key] for key in ("device_id", "session_id", "stream_id")})
        if unknown:
            frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
        elif alias == "different_id":
            assert index == 0
            frame["composition"]["image"]["artifact"]["artifact_id"] = "synthetic-separate-composed-ref"
        pictures = [("raw", frame["raw"])]
        if frame["composition"]["kind"] == "composed":
            pictures.append(("composed", frame["composition"]["image"]))
        refs = {}
        for role, picture in pictures:
            pixels = (NATIVE / picture["native_file"]).read_bytes()
            assert digest(pixels) == picture["artifact"]["sha256"]
            assert len(pixels) == picture["artifact"]["byte_length"]
            data[frame["frame_id"], role] = pixels
            refs[picture["artifact"]["artifact_id"]] = deepcopy(picture["artifact"])
        record.update(record_id=f"mac-record-{ordinal}", sequence=ordinal + 1, frame_id=frame["frame_id"],
                      artifacts=[*refs.values(), deepcopy(ink_ref)], causal_parents=[])
        record["evidence"]["reason_quote"] = "Synthetic binding only; no inferred reasoning. 原话保留。"
        records.append(record)
        frames.append(frame)
    batch["records"] = records
    return batch, sources, frames, data


def resolver_for(values, calls=None):
    def resolve(frame, *, image_role, max_bytes):
        assert frame in values[2] and all(frame is not original for original in values[2])
        assert image_role in ("raw", "composed") and frame["contract_version"] == "0.2.11"
        if calls is not None:
            calls.append((frame["frame_id"], image_role, max_bytes))
        return {"status": "available", "frame": frame, "image_role": image_role,
                "media_type": "image/png", "data": values[3][frame["frame_id"], image_role]}
    return resolve


def supplied(values, *, resolve=None, **kwargs):
    return compose_process_context(*values[:3], forbidden, user_id=values[1][0]["user_id"],
        windows_resolver=forbidden, macos_resolver=resolver_for(values) if resolve is None else resolve, **kwargs)


def snapshot(values):
    return {"batch": {**deepcopy(values[0]), "delivery_mode": "historical"},
            "sources": deepcopy(values[1]), "frames": deepcopy(values[2])}


def stored(values, *, function=prepare_observation_window, read=None, resolve=None, **kwargs):
    def reader(ids, *, max_metadata_bytes):
        assert ids == [r["record_id"] for r in values[0]["records"]]
        assert max_metadata_bytes == 4 * 1024 * 1024
        return snapshot(values)
    return function([r["record_id"] for r in values[0]["records"]], reader if read is None else read,
        forbidden, user_id=values[1][0]["user_id"], windows_resolver=forbidden,
        macos_resolver=resolver_for(values) if resolve is None else resolve, **kwargs)


@pytest.mark.parametrize("entry", [supplied, stored])
def test_all_audited_native_outcomes_preserve_exact_bytes_and_declared_evidence(entry):
    values, calls = macos_supplied(tuple(range(7))), []
    before = deepcopy(values)
    packet = entry(values, resolve=resolver_for(values, calls))
    assert len(packet["items"]) == 7 and packet["counts"]["omitted"] == 0
    for i, item in enumerate(packet["items"]):
        frame = values[2][i]
        assert item["record"] == values[0]["records"][i]
        assert item["source"] == values[1][0] and item["frame"] == frame
        assert item["provider_image_alignment"] == "not_attested"
        for role, key in (("raw", "image"), ("composed", "composed_image")):
            data = values[3].get((frame["frame_id"], role))
            if data is not None:
                assert item[key] == {"status": "attached", "image_role": role,
                                     "media_type": "image/png", "byte_length": len(data), "data": data}
            else:
                assert item[key] == {"status": "not_composed", "reason": "refused", "image_role": role}
    assert len(calls) == 13  # Six compositions, seven raw originals; no ink-file fetch.
    assert packet["attached_bytes"] == sum(map(len, values[3].values()))
    assert packet["non_frame_artifacts"] == "references_only"
    assert packet["capture_completeness"] == "unknown"
    assert packet["presentation_permission"] == "not_granted"
    for name in ("live_status", "authorization_status", "commit_status", "provider_receipt"):
        assert packet[name] == "not_attested"
    packet["items"][0]["frame"]["composition"]["ink"]["strokes"].append("output-only")
    assert values == before


@pytest.mark.parametrize("alias", [None, "different_id"])
def test_successful_empty_ink_alias_resolves_both_roles_and_counts_both_payloads(alias):
    values, calls = macos_supplied((0,), alias=alias), []
    packet = stored(values, resolve=resolver_for(values, calls))
    item = packet["items"][0]
    assert item["image"]["data"] == item["composed_image"]["data"]
    assert item["frame"]["composition"]["kind"] == "composed"
    assert item["frame"]["composition"]["ink"]["strokes"] == []
    assert packet["attached_bytes"] == 2 * len(item["image"]["data"])
    assert [call[1] for call in calls] == ["raw", "composed"]


@pytest.mark.parametrize("unknown", [False, True])
def test_refused_and_unknown_are_not_successful_empty_ink_or_raw_fallback(unknown):
    values, calls = macos_supplied((6,), unknown=unknown), []
    if unknown:
        values[2][0]["profile"]["display_at_start"]["scope"] = UNKNOWN_OVERLAY_SCOPE.format("shown")
    result = stored(values, resolve=resolver_for(values, calls))
    composed = result["items"][0]["composed_image"]
    assert composed == {"status": "unknown" if unknown else "not_composed", "image_role": "composed",
                        "reason": "no_retained_outcome" if unknown else "refused"}
    assert [call[1] for call in calls] == ["raw"]
    assert result["attached_bytes"] == len(values[3]["mac-frame-0", "raw"])
    assert result["items"][0]["frame"] == values[2][0]


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("status", ["missing", "revoked", "unavailable", "unobservable", "byte_limit"])
def test_each_unavailable_role_is_a_gap_without_substitution(role, status):
    values = macos_supplied()
    def resolve(frame, *, image_role, max_bytes):
        if image_role == role:
            return {"status": status, "data": b"ignored stale bytes"}
        return resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
    item = supplied(values, resolve=resolve)["items"][0]
    assert item["image" if role == "raw" else "composed_image"] == {"status": status, "image_role": role}
    assert item["composed_image" if role == "raw" else "image"]["status"] == "attached"
    assert item["frame"] == values[2][0]


@pytest.mark.parametrize("wrong", [None, "raw", "composed", "other"])
def test_role_echo_is_required_even_for_identical_alias_bytes(wrong):
    values = macos_supplied((0,))
    def resolve(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if wrong is None:
            result.pop("image_role")
        else:
            result["image_role"] = wrong
        return result
    item = supplied(values, resolve=resolve)["items"][0]
    for role, key in (("raw", "image"), ("composed", "composed_image")):
        assert item[key]["status"] == ("attached" if wrong == role else "image_role_mismatch")


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("damage,expected", [
    ("descriptor", "frame_mismatch"), ("other_role_bytes", "hash_mismatch"),
    ("corrupt_bytes", "hash_mismatch"), ("mime", "unsupported_media_type"),
    ("bytearray", "invalid_image_bytes"),
])
def test_descriptor_and_native_byte_substitution_are_rejected(role, damage, expected):
    values = macos_supplied()
    def resolve(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if role == image_role:
            if damage == "descriptor":
                result["frame"]["composition"]["ink"]["limits"].append("changed descriptor")
            elif damage == "other_role_bytes":
                result["data"] = values[3][frame["frame_id"], "raw" if role == "composed" else "composed"]
            elif damage == "corrupt_bytes":
                result["data"] = result["data"][:-1] + b"X"
            elif damage == "mime":
                result["media_type"] = "image/jpeg"
            else:
                result["data"] = bytearray(result["data"])
        return result
    item = supplied(values, resolve=resolve)["items"][0]
    assert item["image" if role == "raw" else "composed_image"] == {"status": expected, "image_role": role}
    assert item["composed_image" if role == "raw" else "image"]["status"] == "attached"


@pytest.mark.parametrize("damage,expected", [("crc", "invalid_image"), ("length", "artifact_mismatch"),
                                           ("dimensions", "dimension_mismatch"), ("pixels", "pixel_limit")])
def test_actual_native_pngs_use_existing_decoder_and_resource_checks(damage, expected):
    values = macos_supplied()
    frame, record = values[2][0], values[0]["records"][0]
    for role, picture in (("raw", frame["raw"]), ("composed", frame["composition"]["image"])):
        ref = picture["artifact"]
        if damage == "crc":
            key = frame["frame_id"], role
            data = values[3][key]
            values[3][key] = data[:-1] + bytes([data[-1] ^ 1])
            ref["sha256"] = digest(values[3][key])
        elif damage == "length":
            ref["byte_length"] += 1
        elif damage == "dimensions":
            picture["width"] += 100
        for i, original in enumerate(record["artifacts"]):
            if original["artifact_id"] == ref["artifact_id"]:
                record["artifacts"][i] = deepcopy(ref)
    frame["composition"].update(raw_sha256=frame["raw"]["artifact"]["sha256"],
                                raw_byte_length=frame["raw"]["artifact"]["byte_length"])
    if damage == "dimensions":
        frame["composition"]["ink"]["mapping"] = frame["composition"]["ink"]["mapping"].replace("(2.0 × 2.0)", "(3.0 × 2.0)")
    packet = supplied(values, **({"max_pixels": 19999} if damage == "pixels" else {}))
    item = packet["items"][0]
    assert item["image"]["status"] == item["composed_image"]["status"] == expected
    assert packet["attached_bytes"] == 0


@pytest.mark.parametrize("index", [0, 2])
def test_byte_edges_budget_each_payload_even_aliases(index):
    values = macos_supplied((index,))
    raw, composed = (len(values[3]["mac-frame-0", role]) for role in ("raw", "composed"))
    for limit, expected in ((raw - 1, ("byte_limit", "byte_limit")), (raw, ("attached", "byte_limit")),
                            (raw + composed - 1, ("attached", "byte_limit")), (raw + composed, ("attached", "attached"))):
        calls = []
        packet = stored(values, max_total_bytes=limit, resolve=resolver_for(values, calls))
        item = packet["items"][0]
        assert (item["image"]["status"], item["composed_image"]["status"]) == expected
        assert packet["attached_bytes"] == sum(i.get("byte_length", 0) for i in (item["image"], item["composed_image"])) <= limit
        assert len(calls) == expected.count("attached")
    result = supplied(values, max_image_bytes=raw - 1, resolve=forbidden)
    assert result["attached_bytes"] == 0


@pytest.mark.parametrize("unknown,index", [(False, 2), (False, 6), (True, 6)])
def test_metadata_budgets_retain_role_reason_and_whole_descriptor(unknown, index):
    values = macos_supplied((index,), unknown=unknown)
    if not unknown and index == 6:
        values[2][0]["composition"]["reason"] = "session_ended_before_composition"
    size = metadata_size(stored(values))
    successes = 0
    for limit in range(size - 5, size + 2):
        try:
            result = stored(values, max_metadata_bytes=limit)
        except ValueError as error:
            assert "withheld" in str(error)
        else:
            successes += 1
            assert metadata_size(result) <= limit and result["counts"]["omitted"] == 0
            assert result["items"][0]["frame"] == values[2][0]
    assert successes
    for limit in (1000, 2000, size):
        assert metadata_size(supplied(values, max_metadata_bytes=limit)) <= limit


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.9"), (("contract_version",), "0.2.7"), (("contract_version",), "0.2.12"),
    (("contract_version",), "0.3.0"), (("contract_version",), None), (("kind",), "raw_capture_frame"),
    (("profile", "kind"), "windows_electron"), (("source", "user_id"), "foreign"),
    (("source", "source_id"), "other"), (("source", "source_version"), 2),
    (("device_id",), "other"), (("session_id",), "other"), (("stream_id",), "other"),
    (("composition", "raw_sha256"), "0" * 64), (("composition", "ink", "revision"), -1),
    (("composition", "image", "artifact", "artifact_id"), "unbound"),
])
def test_bad_versions_profiles_and_bindings_fail_before_all_resolvers(path, value):
    values = macos_supplied()
    changed(values[2][0], path, value)
    with pytest.raises((ValidationError, ValueError)):
        supplied(values, resolve=forbidden, max_metadata_bytes=1000)


def test_macos_seam_is_required_even_with_old_resolvers_and_missing_composition():
    values = macos_supplied(unknown=True)
    with pytest.raises(ValueError, match="macos_resolver"):
        compose_process_context(*values[:3], forbidden, user_id=values[1][0]["user_id"], windows_resolver=forbidden)
    with pytest.raises(ValueError, match="callable"):
        compose_process_context(*values[:3], forbidden, user_id=values[1][0]["user_id"], macos_resolver={})
    values = macos_supplied()
    del values[0]["records"][0]["artifacts"][1]
    with pytest.raises(ValidationError):
        supplied(values, resolve=forbidden)


def test_mixed_legacy_windows_and_mac_use_only_exact_version_resolvers():
    mac, win, calls = macos_supplied(), windows_supplied(), []
    old_batch, _, old_frames, old_data = raw_supplied()
    old = old_batch["records"][0]
    old.update(record_id="old-record", sequence=3, frame_id="old-frame")
    old_frames[0]["frame_id"] = "old-frame"
    win[0]["records"][0].update(record_id="windows-record", sequence=2)
    mac[0]["records"].extend([win[0]["records"][0], old])
    mac[2].extend(win[2] + old_frames)
    def legacy(frame, *, max_bytes):
        assert frame["contract_version"] == "0.2.5"
        calls.append("legacy")
        return {"status": "available", "frame": frame, "media_type": "image/png", "data": old_data}
    def windows(frame, *, image_role, max_bytes):
        assert frame["contract_version"] == "0.2.9"
        calls.append("windows-" + image_role)
        return windows_resolver_for(win)(frame, image_role=image_role, max_bytes=max_bytes)
    def macos(frame, *, image_role, max_bytes):
        calls.append("macos-" + image_role)
        return resolver_for(mac)(frame, image_role=image_role, max_bytes=max_bytes)
    packet = compose_process_context(*mac[:3], legacy, user_id=mac[1][0]["user_id"],
                                     windows_resolver=windows, macos_resolver=macos)
    assert calls == ["macos-raw", "macos-composed", "windows-raw", "windows-composed", "legacy"]
    assert all(item["image"]["status"] == "attached" for item in packet["items"])
    assert "image_role" not in packet["items"][-1]["image"]
    assert "composed_image" not in packet["items"][-1]


def test_window_byte_comparisons_preserve_order_gaps_and_unknown_chronology():
    values = macos_supplied((2, 4, 0, 6, 5))
    gap = coverage(values[0], sequence=6, parents=("mac-record-0", "outside-batch"))
    gap["evidence"]["missing_sequences"] = []  # The unobserved interval has no known missing ordinal.
    values[0]["records"].append(gap)
    packet = stored(values)
    assert [item["frame"] for item in packet["items"]] == [*values[2], None]
    pairs = packet["observation_window"]["comparisons"]
    assert [pair["retained_image_bytes"] for pair in pairs] == ["identical"] * 4 + ["unknown"]
    assert [pair["retained_composed_image_bytes"] for pair in pairs] == ["identical", "different", "unknown", "unknown", "unknown"]
    assert all(pair["retained_image_role"] == "raw" for pair in pairs)
    assert all(pair["clock_readings"] == {"status": "unknown", "reason": "no_process_capture_clock"} for pair in pairs)
    assert packet["observation_window"]["adjacency"] == "requested_order_not_chronology"
    assert packet["observation_window"]["semantic_change"] == packet["observation_window"]["user_reasoning"] == "not_inferred"
    assert packet["observation_window"]["capture_chronology"] == "unknown"
    assert "composed_image" not in packet["items"][-1]


def test_source_callback_pts_and_reopened_revision_unknowns_survive_without_clock_conversion():
    values = macos_supplied((5,))
    frame = values[2][0]
    ink = frame["composition"]["ink"]
    ink.update(revision=json.loads("4e0"), revision_host_seconds=None)
    ink["document"]["created_in_session"] = "earlier-boot"
    ink["limits"].append(REOPENED_LIMIT.format(4))
    frame["callback_sequence"] = json.loads("6.0")
    before = canonical(values[:3])
    packet = stored(values)
    assert canonical(values[:3]) == before
    assert packet["items"][0]["frame"] == frame
    assert frame["profile"]["host_clock"]["source_seconds"] is None
    assert frame["composition"]["ink"]["pixels_time"] == "callback_admission"
    assert frame["captured_at"] is frame["media_position"] is None
    assert packet["items"][0]["record"]["clock"] is None


@pytest.mark.parametrize("function", [prepare_stored_process_context, prepare_observation_window])
@pytest.mark.parametrize("fence", ["revoke", "change", "missing", "composition"])
def test_final_authorized_reread_withholds_the_whole_packet(function, fence):
    values, reads, calls, published = macos_supplied(), [], [], []
    def reader(ids, **kwargs):
        reads.append(ids.copy())
        if calls and fence == "revoke":
            raise PermissionError("Test-only current source revocation")
        result = snapshot(values)
        if calls:
            if fence == "change":
                result["sources"][0]["project_id"] = "changed"
            elif fence == "missing":
                result["batch"]["records"].clear()
            else:
                result["frames"][0]["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
        return result
    with pytest.raises(PermissionError if fence == "revoke" else ValueError):
        published.append(stored(values, function=function, read=reader, resolve=resolver_for(values, calls)))
    assert reads == [["mac-record-0"]] * 2 and [c[1] for c in calls] == ["raw", "composed"]
    assert not published


def test_revocation_between_image_roles_cannot_return_the_first_payload():
    values, allowed, calls, published = macos_supplied(), [True], [], []
    def reader(ids, **kwargs):
        if not allowed[0]:
            raise PermissionError("Test-only source denied")
        return snapshot(values)
    def resolve(frame, *, image_role, max_bytes):
        calls.append(image_role)
        if not allowed[0]:
            return {"status": "revoked"}
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        allowed[0] = False
        return result
    with pytest.raises(PermissionError):
        published.append(stored(values, read=reader, resolve=resolve))
    assert calls == ["raw", "composed"] and not published


@pytest.mark.parametrize("stage", ["read", "raw", "composed", "recheck"])
@pytest.mark.parametrize("error", [FutureCancelledError, asyncio.CancelledError])
def test_cancellation_at_any_stage_propagates_without_partial_return(stage, error):
    values, reads = macos_supplied(), []
    def reader(ids, **kwargs):
        reads.append(ids.copy())
        if stage == "read" or (len(reads) == 2 and stage == "recheck"):
            raise error()
        return snapshot(values)
    def resolve(frame, *, image_role, max_bytes):
        if stage == image_role:
            raise error()
        return resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
    with pytest.raises(error):
        stored(values, read=reader, resolve=resolve)


@pytest.mark.parametrize("target", ["source", "record", "frame"])
def test_supplied_input_mutation_is_detected_after_resolution(target):
    values = macos_supplied()
    def resolve(frame, *, image_role, max_bytes):
        result = resolver_for(values)(frame, image_role=image_role, max_bytes=max_bytes)
        if image_role == "composed":
            if target == "source":
                values[1][0]["project_id"] = "mutated"
            elif target == "record":
                values[0]["records"][0]["evidence"]["reason_quote"] = "mutated"
            else:
                values[2][0]["profile"]["native_session_id"] = "mutated"
        return result
    with pytest.raises(ValueError, match="metadata changed"):
        supplied(values, resolve=resolve)


def test_budget_omitted_and_frameless_records_remain_in_final_selection():
    values = macos_supplied()
    values[0]["records"].append(coverage(values[0], parents=()))
    reads = []
    def reader(ids, **kwargs):
        reads.append(ids.copy())
        result = snapshot(values)
        if len(reads) == 2:
            result["sources"][0]["source_timezone"] = "Europe/London"
        return result
    with pytest.raises(ValueError, match="metadata changed"):
        stored(values, function=prepare_stored_process_context, read=reader, resolve=forbidden,
               max_metadata_bytes=1000)
    assert reads == [["mac-record-0", "coverage"]] * 2
