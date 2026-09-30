"""Actual Swift synthetic metadata; archive bindings here are synthetic only."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import validate as validate_v1
from packages.contracts import desktop_capture_ingress, raw_capture_ingress, windows_capture_ingress
from packages.contracts.capture_frame import validate as validate_raw
from packages.contracts.desktop_frame import SCHEMA as DESKTOP_SCHEMA, validate as validate_desktop
from packages.contracts.process_v2 import validate as validate_process
from packages.contracts.windows_frame import validate as validate_windows
from packages.contracts.tests.test_capture_frame import CLOCK, set_field
from packages.contracts.tests.test_display_source import display, observation
from packages.contracts.macos_frame import (
    APP_EXCLUDED_SCOPE, UNKNOWN_OVERLAY_SCOPE, BASE_LIMITS, UNKNOWN_TIME_LIMIT,
    NO_DOCUMENT_LIMIT, RAW_ALIAS_LIMIT, REOPENED_LIMIT, REFUSAL_REASONS,
    CONTRACT_VERSION, SCHEMA, validate, validate_binding,
)
from packages.contracts.macos_frame.generate import outputs

ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "macos_frame/examples"
CLOCK_PATH = ("profile", "host_clock")
INK = ("composition", "ink")


def examples():
    return json.loads((EXAMPLES / "macos-retained.json").read_text())


def bind(frame, observation, display):
    batch, record_id, _ = deepcopy(observation)
    source = deepcopy(display)
    incarnation = {key: frame[key] for key in ("device_id", "session_id", "stream_id")}
    batch.update(incarnation)
    source.update(incarnation, **frame["source"])
    pictures = [frame["raw"]]
    if frame["composition"]["kind"] == "composed":
        pictures.append(frame["composition"]["image"])
    artifacts = {p["artifact"]["artifact_id"]: p["artifact"] for p in pictures}
    batch["records"][0].update(source=deepcopy(frame["source"]), frame_id=frame["frame_id"],
                               observed_at=None, media_position=None, clock=None,
                               artifacts=deepcopy(list(artifacts.values())))
    bindings = [{"contract_version": "0.2.2", "kind": "screen_image", "source": deepcopy(frame["source"]),
                 "artifact": deepcopy(artifact)} for artifact in artifacts.values()]
    return batch, record_id, frame, source, bindings


@pytest.fixture
def mac(observation, display):
    return bind(examples()[2], observation, display)


def rejected(values):
    before = deepcopy(values)
    with pytest.raises(ValidationError):
        validate_binding(*values)
    assert values == before


def native_image(image):
    return {"file": image["native_file"], "sha256": image["artifact"]["sha256"],
            "byteLength": image["artifact"]["byte_length"], "mediaType": image["artifact"]["media_type"],
            "width": image["width"], "height": image["height"], "encoding": image["encoding"]}


def without_null(values):
    return {key: value for key, value in values.items() if value is not None}


def test_all_native_kept_and_composed_fields_survive_exactly(observation, display):
    provenance = json.loads((EXAMPLES / "provenance.json").read_text())
    for name, digest in provenance["files"].items():
        assert hashlib.sha256((EXAMPLES / ("producer-" + name)).read_bytes()).hexdigest() == digest
    status = json.loads((EXAMPLES / "producer-status.json").read_text())
    events = [json.loads(line) for line in (EXAMPLES / "producer-events.jsonl").read_text().splitlines()]
    retained = [event["frame"] for event in events if event["event"] == "kept"]
    frames = examples()
    before = deepcopy(frames)
    assert len(frames) == len(retained) == 7
    assert [f["composition"]["ink"]["revision"] for f in frames[:6]] == [0, 1, 2, 3, 4, 4]
    for frame, original in zip(frames, retained, strict=True):
        values = bind(frame, observation, display)
        original_values = deepcopy(values)
        validate_binding(*values)
        assert values == original_values
        profile, clock, sample = frame["profile"], frame["profile"]["host_clock"], frame["profile"]["sample"]
        assert profile["native_session_id"] == status["session"]
        assert clock["session_started_wall_utc"] == status["startedWall"]
        assert clock["session_started_seconds"] == status["startedHost"]
        assert clock["source_time_lead_tolerance_seconds"] == status["settings"]["sourceTimeLeadTolerance"]
        native_display = profile["display_at_start"]
        assert status["display"] == {
            "displayID": native_display["display_id"], "name": native_display["name"], "frame": native_display["frame_points"],
            "pointPixelScale": native_display["point_pixel_scale"], "requestedWidth": native_display["requested_width_pixels"],
            "requestedHeight": native_display["requested_height_pixels"], "rotationDegrees": native_display["rotation_degrees"],
            "isMain": native_display["is_main"], "scope": native_display["scope"],
        }
        native_facts = without_null({"status": sample["status"], "presentationTime": sample["presentation_time_seconds"],
            "displayTimeTicks": None if clock["display_time_ticks_decimal"] is None else int(clock["display_time_ticks_decimal"]),
            "displayTimeSeconds": clock["display_time_seconds"], "contentRect": sample["content_rect"],
            "contentScale": sample["content_scale"], "scaleFactor": sample["scale_factor"], "dirtyRects": sample["dirty_rects"]})
        assert original == {**native_image(frame["raw"]), "sequence": frame["callback_sequence"],
                            "callbackHost": clock["callback_seconds"], "pixelFormat": profile["pixel_format"],
                            "facts": native_facts, **without_null({"sourceHost": clock["source_seconds"]})}
        result = frame["composition"]
        if result["kind"] == "composed":
            ink = result["ink"]
            doc = ink["document"]
            native_ink = without_null({"pixelsHost": ink["pixels_host_seconds"], "pixelsTime": ink["pixels_time"],
                "document": None if doc is None else {"createdInSession": doc["created_in_session"], "file": doc["file"], "displayID": doc["display_id"]},
                "revision": ink["revision"], "revisionHost": ink["revision_host_seconds"],
                **{name: ink[name] for name in ("strokes", "mapping", "rendering", "limits")}})
            actual = next(e["composed"] for e in events if e["event"] == "composed" and e["composed"]["rawSequence"] == frame["callback_sequence"])
            assert actual == {**native_image(result["image"]), "rawSequence": result["raw_sequence"], "rawFile": result["raw_file"],
                              "rawSHA256": result["raw_sha256"], "rawByteLength": result["raw_byte_length"],
                              "composedHost": result["composed_host_seconds"], "ink": native_ink}
        else:
            actual = next(e for e in events if e["event"] == "not_composed")
            assert result == {"kind": "not_composed", "callback_sequence": int(actual["detail"]["sequence"]),
                              "host_seconds": actual["host"], "reason": actual["detail"]["reason"], "detail": actual["detail"]["detail"]}
    assert frames == before


@pytest.mark.parametrize("scope", [APP_EXCLUDED_SCOPE, UNKNOWN_OVERLAY_SCOPE])
@pytest.mark.parametrize("cursor", ["shown", "hidden"])
def test_missing_outcome_stays_unknown_in_both_exact_new_scopes(mac, scope, cursor):
    frame = mac[2]
    frame["profile"]["display_at_start"]["scope"] = scope.format(cursor)
    frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
    mac[0]["records"][0]["artifacts"] = [deepcopy(frame["raw"]["artifact"])]
    del mac[4][1:]
    before = deepcopy(mac)
    validate_binding(*mac)
    assert mac == before


@pytest.mark.parametrize("reason", REFUSAL_REASONS)
def test_every_actual_refusal_preserves_raw_and_reason(observation, display, reason):
    frame = examples()[-1]
    frame["composition"]["reason"] = reason
    values = bind(frame, observation, display)
    before = deepcopy(values)
    validate_binding(*values)
    assert values == before and len(values[4]) == 1


@pytest.mark.parametrize("path,value", [
    (("composition",), None), (("composition",), {"kind": "unknown", "reason": "empty_ink"}),
    (("composition", "callback_sequence"), 6), (("composition", "host_seconds"), 1),
    (("composition", "reason"), "success"), (("composition", "detail"), ""),
    (("composition", "ink"), {}), (("composition", "image"), {}),
])
def test_no_success_or_fabricated_payload_in_refused_or_absent_outcomes(observation, display, path, value):
    values = bind(examples()[-1], observation, display)
    set_field(values[2], path, value)
    rejected(values)


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.7"), (("kind",), "raw_capture_frame"),
    (("captured_at",), "2026-09-21T14:13:23Z"), (("media_position",), 1.5),
    (("pixel_orientation",), 0), (("capture_latency_ms",), 0), (("live",), True),
    (("presentation_permission",), "allowed"), (("callback_sequence",), True),
    (("raw", "artifact", "byte_length"), 33554433), (("raw", "artifact", "byte_length"), 0),
    (("raw", "width"), 0), (("raw", "width"), 2**53),
    (("raw", "native_file"), "frames/00000002.png"), (("raw", "native_file"), "../frames/00000003.png"),
    (("raw", "native_file"), "frames/00000003.png\n"),
    (("raw", "encoding"), "rotated"), (("profile", "pixel_format"), "BGRAx"),
    ((*CLOCK_PATH, "source_seconds"), None), ((*CLOCK_PATH, "display_time_ticks_decimal"), None),
    ((*CLOCK_PATH, "display_time_ticks_decimal"), "18446744073709551616"),
    ((*CLOCK_PATH, "display_time_ticks_decimal"), "001"), ((*CLOCK_PATH, "callback_seconds"), 99),
    ((*CLOCK_PATH, "session_started_wall_utc"), "2026-02-30T01:02:03Z"),
    ((*CLOCK_PATH, "session_started_wall_utc"), "2026-09-21T14:13:20.1234Z"),
    (("composition", "raw_sequence"), 2), (("composition", "raw_file"), "frames/00000002.png"),
    (("composition", "raw_sha256"), "0" * 64), (("composition", "raw_byte_length"), 711),
    (("composition", "composed_host_seconds"), 99),
    (("composition", "image", "width"), 201), (("composition", "image", "height"), 101),
    (("composition", "image", "native_file"), "frames/00000003.png"),
    (("composition", "image", "native_file"), "composed/00000004.png"),
    ((*INK, "pixels_host_seconds"), 103.1), ((*INK, "pixels_time"), "callback_admission"),
    ((*INK, "revision"), None), ((*INK, "revision"), -1), ((*INK, "revision"), 0),
    ((*INK, "revision_host_seconds"), 104), ((*INK, "revision_host_seconds"), None),
    ((*INK, "document"), None), ((*INK, "document", "display_id"), 8),
    ((*INK, "document", "file"), "../ink/ink.json"),
    ((*INK, "strokes"), ["s2", "s2"]), ((*INK, "limits"), []),
    ((*INK, "rendering"), "AI redrawing"),
    ((*INK, "mapping"), "verified on a Mac"),
    ((*INK, "mapping"), "display-local points scaled by frame size / display size in points (3.0 × 2.0); contentRect and scaleFactor are not applied; unverified on a Mac"),
    (("profile", "display_at_start", "scope"), UNKNOWN_OVERLAY_SCOPE.format("shown")),
])
def test_inconsistent_or_invented_native_facts_fail_closed(mac, path, value):
    set_field(mac[2], path, value)
    rejected(mac)


@pytest.mark.parametrize("field", ["source_seconds", "callback_seconds", "source_time_lead_tolerance_seconds"])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf"), True, -1])
def test_invalid_host_numbers_are_rejected(mac, field, value):
    mac[2]["profile"]["host_clock"][field] = value
    with pytest.raises(ValidationError):
        validate_binding(*mac)


@pytest.mark.parametrize("variant", ["missing", "zero", "after_callback"])
def test_invalid_source_time_retains_reported_facts_but_pairs_at_callback(mac, variant):
    frame, clock = mac[2], mac[2]["profile"]["host_clock"]
    if variant == "missing":
        clock.update(display_time_ticks_decimal=None, display_time_seconds=None)
    elif variant == "zero":
        clock.update(display_time_ticks_decimal="0", display_time_seconds=0)
    else:
        clock.update(display_time_ticks_decimal="18446744073709551615", display_time_seconds=104)
    clock["source_seconds"] = None
    ink = frame["composition"]["ink"]
    ink.update(pixels_time="callback_admission", pixels_host_seconds=clock["callback_seconds"])
    ink["limits"].append(UNKNOWN_TIME_LIMIT)
    before = deepcopy(mac)
    validate_binding(*mac)
    assert mac == before
    ink["limits"].remove(UNKNOWN_TIME_LIMIT)
    rejected(mac)


def test_source_lead_tolerance_and_pts_do_not_create_capture_utc(mac):
    frame, clock = mac[2], mac[2]["profile"]["host_clock"]
    clock.update(source_seconds=103.15, display_time_seconds=103.15)
    frame["profile"]["sample"]["presentation_time_seconds"] = -20.5
    frame["composition"]["ink"]["pixels_host_seconds"] = 103.15
    # The native source-time tolerance permits pixels slightly ahead of callback.
    # Processing time is not pixel time, nor a media playhead or UTC timestamp.
    frame["composition"]["composed_host_seconds"] = 103.1
    before = deepcopy(mac)
    validate_binding(*mac)
    assert mac == before
    clock["source_time_lead_tolerance_seconds"] = 0
    rejected(mac)


def test_reopened_document_keeps_unknown_commit_time_and_independent_native_location(mac):
    ink = mac[2]["composition"]["ink"]
    ink["revision_host_seconds"] = None
    ink["document"].update(created_in_session="older-session", file="stored-session/ink/ink.conflict-ABCD1234.json")
    ink["limits"].extend([REOPENED_LIMIT.format(ink["revision"]),
                         "the document's last save failed (disk full); revision 2 may not be on disk yet"])
    before = deepcopy(mac)
    validate_binding(*mac)
    assert mac == before
    assert ink["strokes"] == ["s2", "s3"]
    # No operation history or immutable ink bytes were supplied or manufactured.


@pytest.mark.parametrize("field,token", [
    ("callback_sequence", "3"), ("callback_sequence", "3.0"), ("callback_sequence", "3e0"),
    ("revision", "2"), ("revision", "2.0"), ("revision", "2e0"),
])
def test_json_integer_representations_agree_with_schema_without_input_coercion(mac, field, token):
    frame = mac[2]
    value = json.loads(token)
    if field == "callback_sequence":
        frame[field] = value
    else:
        ink = frame["composition"]["ink"]
        ink.update(revision=value, revision_host_seconds=None)
        # Actual producer text formats the validated integer, not Python's float.
        ink["limits"].append(REOPENED_LIMIT.format(2))
    before = json.dumps(mac, sort_keys=True)
    generated_schema = json.loads(outputs()["schema.json"])
    Draft202012Validator(generated_schema).validate(frame)
    validate_binding(*mac)
    # Deep equality alone misses a mutation from 3.0 to 3; serialized numbers do not.
    assert json.dumps(mac, sort_keys=True) == before


@pytest.mark.parametrize("field", ["callback_sequence", "revision"])
@pytest.mark.parametrize("token", ["2.5", "2.0000000000000004", "true", "false"])
def test_fractional_and_boolean_json_values_are_not_rounded_to_integers(mac, field, token):
    frame = mac[2]
    target = frame if field == "callback_sequence" else frame["composition"]["ink"]
    target[field] = json.loads(token)
    before = json.dumps(mac, sort_keys=True)
    generated_schema = json.loads(outputs()["schema.json"])
    with pytest.raises(ValidationError):
        Draft202012Validator(generated_schema).validate(frame)
    with pytest.raises(ValidationError):
        validate_binding(*mac)
    assert json.dumps(mac, sort_keys=True) == before


@pytest.mark.parametrize("no_document", [False, True])
def test_empty_ink_is_raw_alias_not_missing_result(observation, display, no_document):
    frame = examples()[0]
    if no_document:
        frame["composition"]["ink"].update(document=None, revision=None)
        frame["composition"]["ink"]["limits"].insert(3, NO_DOCUMENT_LIMIT)
    values = bind(frame, observation, display)
    before = deepcopy(values)
    validate_binding(*values)
    assert values == before and len(values[4]) == 1
    frame["composition"]["image"]["native_file"] = "composed/00000001.png"
    rejected(values)


@pytest.mark.parametrize("same_artifact", [False, True])
def test_one_native_file_may_have_one_or_two_archive_references(observation, display, same_artifact):
    frame = examples()[0]
    if not same_artifact:
        frame["composition"]["image"]["artifact"]["artifact_id"] = "other-original-reference"
    values = bind(frame, observation, display)
    validate_binding(*values)
    assert len(values[4]) == (1 if same_artifact else 2)
    frame["composition"]["image"]["artifact"]["sha256"] = "e" * 64
    rejected(values)


def test_separate_native_files_can_alias_identical_archive_bytes(observation, display):
    # Constructed edge: nonempty ink entirely offscreen can leave identical PNG
    # content. It remains a separate native file, not the empty-stroke alias.
    frame = examples()[1]
    frame["composition"]["image"]["artifact"] = deepcopy(frame["raw"]["artifact"])
    values = bind(frame, observation, display)
    before = deepcopy(values)
    validate_binding(*values)
    assert values == before and len(values[4]) == 1


def test_identical_hash_cannot_have_conflicting_length_with_different_paths_and_ids(mac):
    image = mac[2]["composition"]["image"]
    image["artifact"]["sha256"] = mac[2]["raw"]["artifact"]["sha256"]
    # Full external bindings agree; only the same-byte declaration contradicts itself.
    mac[4][1]["artifact"] = deepcopy(image["artifact"])
    mac[0]["records"][0]["artifacts"][1] = deepcopy(image["artifact"])
    rejected(mac)


@pytest.mark.parametrize("change", ["known_time_with_reopen_limit", "wrong_reopen_revision", "missing_alias_limit", "invented_unknown_time", "wrong_scale", "zero_ticks_nonzero_seconds", "positive_ticks_zero_seconds"])
def test_contradictory_time_mapping_and_limitations(mac, change):
    ink = mac[2]["composition"]["ink"]
    clock = mac[2]["profile"]["host_clock"]
    if change == "known_time_with_reopen_limit":
        ink["limits"].append(REOPENED_LIMIT.format(ink["revision"]))
    elif change == "wrong_reopen_revision":
        ink["revision_host_seconds"] = None
        ink["limits"].append(REOPENED_LIMIT.format(ink["revision"] + 1))
    elif change == "missing_alias_limit":
        ink["strokes"] = []
    elif change == "invented_unknown_time":
        ink["limits"].append(UNKNOWN_TIME_LIMIT)
    elif change == "wrong_scale":
        mac[2]["profile"]["display_at_start"]["frame_points"]["width"] = 0
    elif change == "zero_ticks_nonzero_seconds":
        clock.update(display_time_ticks_decimal="0", source_seconds=None)
    else:
        clock.update(display_time_seconds=0, source_seconds=0)
    rejected(mac)


@pytest.mark.parametrize("bindings", [None, {}, "not-bindings"])
def test_bindings_require_an_explicit_collection(mac, bindings):
    rejected((*mac[:4], bindings))


@pytest.mark.parametrize("variant", ["duplicate_id", "duplicate_sequence", "future_parent", "conflicting_reference"])
def test_existing_full_batch_invariants_still_apply(mac, variant):
    record = mac[0]["records"][0]
    other = deepcopy(record)
    other.update(record_id="second-record", sequence=2)
    mac[0]["records"].append(other)
    validate_binding(*mac)
    if variant == "duplicate_id":
        other["record_id"] = record["record_id"]
    elif variant == "duplicate_sequence":
        other["sequence"] = record["sequence"]
    elif variant == "future_parent":
        record["causal_parents"] = [other["record_id"]]
    else:
        other["artifacts"][0]["sha256"] = "a" * 64
    rejected(mac)


@pytest.mark.parametrize("target", ["frame", "record", "source", "raw_binding", "composed_binding"])
@pytest.mark.parametrize("field,value", [("user_id", "other"), ("source_id", "other"), ("source_version", 2)])
def test_exact_source_owner_and_version(mac, target, field, value):
    objects = {"frame": mac[2]["source"], "record": mac[0]["records"][0]["source"], "source": mac[3],
               "raw_binding": mac[4][0]["source"], "composed_binding": mac[4][1]["source"]}
    objects[target][field] = value
    rejected(mac)


@pytest.mark.parametrize("index", [0, 2, 3])
@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_exact_capture_incarnation(mac, index, field):
    mac[index][field] = "other"
    rejected(mac)


@pytest.mark.parametrize("index", [0, 1])
@pytest.mark.parametrize("target", ["record", "binding"])
@pytest.mark.parametrize("field,value", [("artifact_id", "other"), ("sha256", "f" * 64), ("byte_length", 1), ("media_type", "image/jpeg")])
def test_every_complete_image_reference_must_match(mac, index, target, field, value):
    ref = mac[4][index]["artifact"] if target == "binding" else mac[0]["records"][0]["artifacts"][index]
    ref[field] = value
    rejected(mac)


@pytest.mark.parametrize("change", ["missing", "duplicate", "wrong_role", "wrong_version", "extra", "missing_record_ref"])
@pytest.mark.parametrize("index", [0, 1])
def test_each_distinct_image_has_exactly_one_screen_original_binding(mac, index, change):
    bindings = mac[4]
    if change == "missing":
        del bindings[index]
    elif change == "duplicate":
        bindings[index] = deepcopy(bindings[1 - index])
    elif change == "extra":
        bindings.append(deepcopy(bindings[index]))
    elif change == "missing_record_ref":
        del mac[0]["records"][0]["artifacts"][index]
    elif change == "wrong_version":
        bindings[index]["contract_version"] = CONTRACT_VERSION
    else:
        bindings[index]["kind"] = "editable_ink"
        bindings[index]["artifact"]["media_type"] = "application/json"
    rejected(mac)


@pytest.mark.parametrize("record_id", [None, True, "", "not-selected"])
def test_record_selection_is_explicit(mac, record_id):
    rejected((mac[0], record_id, *mac[2:]))


@pytest.mark.parametrize("field,value", [("observed_at", "2026-09-21T14:13:23Z"), ("media_position", 1.5), ("clock", CLOCK), ("frame_id", "another-frame")])
def test_process_record_does_not_invent_time_or_rebind_the_frame(mac, field, value):
    mac[0]["records"][0][field] = deepcopy(value)
    validate_process("ProcessBatch", mac[0])
    rejected(mac)


def test_other_records_attempt_scope_and_separate_editable_ink_are_not_rewritten(mac):
    item = mac[0]["records"][0]
    item["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 3}
    item["artifacts"].append({"artifact_id": "separate-editable-ink", "sha256": "a" * 64,
                              "byte_length": 42, "media_type": "application/json"})
    another = deepcopy(item)
    another.update(record_id="other-record", sequence=2, frame_id=None, clock=deepcopy(CLOCK),
                   observed_at="2026-09-21T14:13:23Z", media_position=1)
    mac[0]["records"].append(another)
    mac[4].reverse()
    before = deepcopy(mac)
    validate_binding(*mac)
    assert mac == before
    assert item["method"] == "structured"  # Metadata binding is not producer admission.


def test_closed_required_fields_and_no_non_json_payload(mac):
    frame = mac[2]
    pending = [((), frame)]
    while pending:
        path, target = pending.pop()
        for field, value in target.items():
            if isinstance(value, dict):
                pending.append(((*path, field), value))
            changed = deepcopy(frame)
            parent = changed
            for part in path:
                parent = parent[part]
            del parent[field]
            with pytest.raises(ValidationError):
                validate(changed)
        changed = deepcopy(frame)
        set_field(changed, (*path, "authority"), True)
        with pytest.raises(ValidationError):
            validate(changed)
    for value in (object(), "invalid-\ud800"):
        changed = deepcopy(frame)
        changed["profile"]["native_session_id"] = value
        with pytest.raises(ValidationError):
            validate(changed)


@pytest.mark.parametrize("reader", ["v1", "raw", "desktop", "windows", "raw_ingress", "desktop_ingress", "windows_ingress"])
def test_older_image_readers_reject_candidate_without_coercion(mac, reader):
    batch, _, frame, *_ = mac
    calls = {"v1": lambda: validate_v1("Frame", frame), "raw": lambda: validate_raw(frame),
             "desktop": lambda: validate_desktop(frame), "windows": lambda: validate_windows(frame),
             "raw_ingress": lambda: raw_capture_ingress.validate("RawFrameBatchRequest", {"contract_version": "0.2.6", "batch": batch, "frames": [frame]}),
             "desktop_ingress": lambda: desktop_capture_ingress.validate("DesktopFrameBatchRequest", {"contract_version": "0.2.8", "batch": batch, "frames": [frame]}),
             "windows_ingress": lambda: windows_capture_ingress.validate("WindowsFrameBatchRequest", {"contract_version": "0.2.10", "batch": batch, "frames": [frame]})}
    before = deepcopy(mac)
    with pytest.raises(ValidationError):
        calls[reader]()
    assert mac == before


@pytest.mark.parametrize("scope", [APP_EXCLUDED_SCOPE, UNKNOWN_OVERLAY_SCOPE])
def test_released_027_still_refuses_new_scope_even_in_old_shape(scope):
    frame = json.loads((ROOT / "desktop_frame/examples/macos-synthetic.json").read_text())
    frame["profile"]["display_at_start"]["scope"] = scope.format("shown")
    with pytest.raises(ValidationError):
        validate_desktop(frame)


def test_isolated_schema_and_types_are_current_without_mutating_released_primitives():
    Draft202012Validator.check_schema(SCHEMA)
    assert CONTRACT_VERSION == "0.2.11"
    for name in ("Identifier", "SourceRef", "PngArtifactReference", "MacSampleFacts", "ReportedRect"):
        assert SCHEMA["$defs"][name] == DESKTOP_SCHEMA["$defs"][name]
        assert SCHEMA["$defs"][name] is not DESKTOP_SCHEMA["$defs"][name]
    assert "source_seconds" not in DESKTOP_SCHEMA["$defs"]["MacHostClock"]["properties"]
    for name, content in outputs().items():
        assert (ROOT / "macos_frame/generated" / name).read_text() == content
    for frame in examples():
        Draft202012Validator(json.loads(outputs()["schema.json"])).validate(frame)
