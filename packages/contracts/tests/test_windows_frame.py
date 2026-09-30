"""Native-manifest metadata with synthetic archive bindings, not device acceptance."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import desktop_capture_ingress, raw_capture_ingress
from packages.contracts import validate as validate_v1
from packages.contracts.capture_frame import SCHEMA as RAW_SCHEMA, validate as validate_raw
from packages.contracts.capture_ingress import validate as validate_ingress
from packages.contracts.desktop_frame import validate as validate_desktop
from packages.contracts.display_source import validate as validate_display, validate_display_record
from packages.contracts.original_artifact import (
    MAX_ARTIFACT_BYTES, validate as validate_original, validate_capture_frame,
)
from packages.contracts.process_control import validate as validate_control
from packages.contracts.process_v2 import validate as validate_process, validate_record_frame
from packages.contracts.tests.test_capture_frame import CLOCK, set_field
from packages.contracts.tests.test_display_source import display, observation
from packages.contracts.validation import MAX_SAFE_INTEGER
from packages.contracts.windows_frame import (
    CONTRACT_VERSION, PRODUCER_COMMIT, SCHEMA, validate, validate_binding,
)
from packages.contracts.windows_frame.generate import outputs


ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "windows_frame/examples"
SAMPLE = ("profile", "sample")
COMPOSED = ("composed", "image")


def retained_examples():
    return json.loads((EXAMPLES / "windows-retained.json").read_text())


def bind_example(frame, observation, display):
    """Reuse released fixtures; all archive relationships here are synthetic."""
    batch, record_id, _ = deepcopy(observation)
    source = deepcopy(display)
    incarnation = {key: frame[key] for key in ("device_id", "session_id", "stream_id")}
    batch.update(incarnation)
    source.update(incarnation, **frame["source"])
    pictures = [frame["raw"]]
    if frame["composed"] is not None:
        pictures.append(frame["composed"]["image"])
    artifacts = {picture["artifact"]["artifact_id"]: picture["artifact"] for picture in pictures}
    batch["records"][0].update(source=deepcopy(frame["source"]), frame_id=frame["frame_id"],
                               observed_at=None, media_position=None, clock=None,
                               artifacts=deepcopy(list(artifacts.values())))
    bindings = [{"contract_version": "0.2.2", "kind": "screen_image",
                 "source": deepcopy(frame["source"]), "artifact": deepcopy(artifact)}
                for artifact in artifacts.values()]
    return batch, record_id, frame, source, bindings


@pytest.fixture
def windows(observation, display):
    # Fourth retained sample has distinct raw and ink-composed PNG originals.
    return bind_example(retained_examples()[3], observation, display)


def assert_rejected_unchanged(values):
    before = deepcopy(values)
    with pytest.raises(ValidationError):
        validate_binding(*values)
    assert values == before


def test_five_examples_preserve_every_retained_native_fact(observation, display):
    manifest = [json.loads(line) for line in (EXAMPLES / "producer-manifest.jsonl").read_text().splitlines()]
    header = manifest[0]
    retained = [item for item in manifest if item["kind"] == "retained"]
    frames = retained_examples()
    before = deepcopy((frames, manifest))
    assert CONTRACT_VERSION == "0.2.9"
    assert PRODUCER_COMMIT == "04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68"
    assert len(frames) == len(retained) == 5
    assert [frame["profile"]["sample"]["sample_seq"] for frame in frames] == [1, 3, 7, 10, 12]
    assert {item["kind"] for item in manifest} == {"header", "retained", "refused", "not_retained", "ended"}
    for frame, item in zip(frames, retained, strict=True):
        validate_binding(*bind_example(frame, observation, display))
        sample = {name: item[name] for name in (
            "sample_seq", "frame_seq", "reason", "deferred_samples_not_retained", "sampled_at",
            "taken_at", "monotonic_ms", "state", "presented_frames", "stream_presented_frames",
            "presentation_ms", "frame_age_ms",
        )}
        # The older retained manifest omitted gap duration; it cannot become zero.
        sample.update(change_from_previous_sample=item["raw"]["change_from_previous_sample"], gap_ms=None)
        assert frame["profile"] == {
            "kind": "windows_electron", "retention_format": header["format"],
            "capture_session": header["capture_session"], "started_at": header["started_at"],
            "source_at_start": header["source"], "sample": sample,
        }
        assert frame["captured_at"] is frame["media_position"] is frame["capture_latency_ms"] is None
        for picture, native in ((frame["raw"], item["raw"]), (frame["composed"]["image"], item["composed"])):
            assert picture == {
                "artifact": {"artifact_id": picture["artifact"]["artifact_id"],
                             "sha256": native["sha256"], "byte_length": native["bytes"], "media_type": "image/png"},
                "width": native["width"], "height": native["height"],
                "pixels_sha256": native["pixels_sha256"], "native_file": native["file"],
            }
            assert picture["artifact"]["sha256"] != picture["pixels_sha256"]
        assert {key: value for key, value in frame["composed"].items() if key != "image"} == {
            key: item["composed"][key] for key in (
                "ink_session", "ink_revision", "visible_strokes", "ink_marks", "transformation",
            )
        }
    assert (frames, manifest) == before


@pytest.mark.parametrize("path,value", [
    (("contract_version",), "0.2.8"), (("kind",), "raw_capture_frame"), (("frame_id",), ""),
    (("device_id",), None), (("session_id",), False), (("stream_id",), ""),
    (("source", "source_version"), True), (("source", "source_version"), 0),
    (("raw", "width"), 0), (("raw", "height"), -1), (("raw", "width"), True),
    (("raw", "width"), MAX_SAFE_INTEGER + 1), (("raw", "height"), 1.5),
    (("raw", "artifact", "byte_length"), 0), (("raw", "artifact", "byte_length"), MAX_ARTIFACT_BYTES + 1),
    (("raw", "artifact", "media_type"), "image/jpeg"), (("raw", "pixels_sha256"), "A" * 64),
    (("captured_at",), "2026-09-30T12:37:55Z"), (("media_position",), 0), (("capture_latency_ms",), 0),
    (("profile", "kind"), "macos_screencapturekit"), (("profile", "retention_format"), "v2"),
    (("profile", "capture_session"), ""), (("profile", "source_at_start", "kind"), "window"),
    (("profile", "source_at_start", "display_id"), 3071609112),
    (("profile", "source_at_start", "scale_factor"), 0),
    (("profile", "source_at_start", "bounds", "width"), 0),
    (("profile", "source_at_start", "bounds", "x"), MAX_SAFE_INTEGER + 1),
    ((*SAMPLE, "sample_seq"), 0), ((*SAMPLE, "frame_seq"), 0),
    ((*SAMPLE, "monotonic_ms"), -1), ((*SAMPLE, "monotonic_ms"), True),
    ((*SAMPLE, "monotonic_ms"), MAX_SAFE_INTEGER + 1), ((*SAMPLE, "monotonic_ms"), 0.5),
    ((*SAMPLE, "state"), "live"), ((*SAMPLE, "reason"), "complete"),
    ((*SAMPLE, "presented_frames"), -1), ((*SAMPLE, "stream_presented_frames"), False),
    ((*SAMPLE, "presentation_ms"), -1), ((*SAMPLE, "frame_age_ms"), -1),
    ((*SAMPLE, "change_from_previous_sample"), -0.01), ((*SAMPLE, "change_from_previous_sample"), 1.01),
    ((*SAMPLE, "change_from_previous_sample"), True), ((*SAMPLE, "gap_ms"), 0),
    ((*SAMPLE, "gap_ms"), -1), ((*SAMPLE, "gap_ms"), True), ((*SAMPLE, "gap_ms"), 1.5),
    (("composed", "ink_revision"), -1), (("composed", "ink_revision"), True),
    (("composed", "visible_strokes"), MAX_SAFE_INTEGER + 1),
    (("composed", "ink_marks", "unknown"), -1), (("composed", "ink_session"), ""),
    (("composed", "transformation"), ""),
])
def test_invalid_metadata_rejected(windows, path, value):
    set_field(windows[2], path, value)
    with pytest.raises(ValidationError):
        validate(windows[2])


@pytest.mark.parametrize("path", [
    (*SAMPLE, "change_from_previous_sample"), (*SAMPLE, "frame_age_ms"),
    ("profile", "source_at_start", "bounds", "x"), ("profile", "source_at_start", "scale_factor"),
])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_numbers_are_not_json_facts(windows, path, value):
    set_field(windows[2], path, value)
    with pytest.raises(ValidationError):
        validate(windows[2])


@pytest.mark.parametrize("path", [("profile", "started_at"), (*SAMPLE, "sampled_at"), (*SAMPLE, "taken_at")])
@pytest.mark.parametrize("value", ["2026-02-30T12:00:00Z", "2026-09-30T12:00:00+00:00",
                                    "2026-09-30T12:00:00.1234Z", "2026-09-30T12:00:00Z\n"])
def test_native_wall_timestamps_use_finite_utc_millisecond_precision(windows, path, value):
    set_field(windows[2], path, value)
    assert_rejected_unchanged(windows)


def test_safe_numeric_limits_and_existing_32_mib_artifact_ceiling(windows):
    frame = windows[2]
    sample = frame["profile"]["sample"]
    sample.update(sample_seq=MAX_SAFE_INTEGER, frame_seq=MAX_SAFE_INTEGER,
                  monotonic_ms=MAX_SAFE_INTEGER, presentation_ms=MAX_SAFE_INTEGER, frame_age_ms=0)
    frame["profile"]["source_at_start"]["bounds"].update(x=-MAX_SAFE_INTEGER, y=MAX_SAFE_INTEGER)
    assert MAX_ARTIFACT_BYTES == 32 * 1024 * 1024
    for image in (frame["raw"], frame["composed"]["image"]):
        image.update(width=MAX_SAFE_INTEGER, height=1)
    for length in (1, MAX_ARTIFACT_BYTES):
        for image, binding, ref in zip((frame["raw"], frame["composed"]["image"]),
                                       windows[4], windows[0]["records"][0]["artifacts"], strict=True):
            image["artifact"]["byte_length"] = binding["artifact"]["byte_length"] = ref["byte_length"] = length
        validate_binding(*windows)
    # Declared limits validate metadata only; no PNG bytes or geometry were decoded.


@pytest.mark.parametrize("state", ["fresh", "no_new_frame", "gap"])
def test_before_first_callback_presentation_and_age_remain_unknown(windows, state):
    sample = windows[2]["profile"]["sample"]
    sample.update(state=state, presented_frames=0, stream_presented_frames=2,
                  presentation_ms=None, frame_age_ms=None)
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before


@pytest.mark.parametrize("field", ["presentation_ms", "frame_age_ms"])
@pytest.mark.parametrize("presented", [0, 1])
def test_presentation_unknowns_cannot_be_invented_or_partially_removed(windows, field, presented):
    sample = windows[2]["profile"]["sample"]
    sample.update(presented_frames=presented, presentation_ms=None if presented == 0 else 1,
                  frame_age_ms=None if presented == 0 else 1)
    sample[field] = 0 if presented == 0 else None
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("reason", ["first", "ink", "changed", "heartbeat", "deferred"])
def test_sample_and_held_frame_counts_do_not_become_process_sequence_or_live_authority(windows, reason):
    sample = windows[2]["profile"]["sample"]
    sample.update(sample_seq=42, frame_seq=7, reason=reason, state="no_new_frame",
                  deferred_samples_not_retained=[8, 10, 41], presented_frames=3, stream_presented_frames=19)
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before
    assert windows[0]["delivery_mode"] == "historical"
    assert windows[0]["records"][0]["sequence"] != sample["sample_seq"]


@pytest.mark.parametrize("updates", [
    {"frame_seq": 11}, {"deferred_samples_not_retained": [3, 3]},
    {"deferred_samples_not_retained": [9, 2]}, {"deferred_samples_not_retained": [10]},
    {"deferred_samples_not_retained": [11]}, {"deferred_samples_not_retained": [0]},
    {"deferred_samples_not_retained": [True]}, {"presented_frames": 60},
    {"presentation_ms": 9069},
])
def test_inconsistent_sample_held_frame_and_deferred_relationships_rejected(windows, updates):
    windows[2]["profile"]["sample"].update(updates)
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("duration", [None, 1, MAX_SAFE_INTEGER])
def test_gap_duration_preserves_explicit_unknown_and_known_values(windows, duration):
    windows[2]["profile"]["sample"].update(state="gap", gap_ms=duration)
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before


@pytest.mark.parametrize("state", ["fresh", "no_new_frame"])
def test_gap_duration_cannot_be_assigned_to_a_nongap(windows, state):
    windows[2]["profile"]["sample"].update(state=state, gap_ms=1)
    assert_rejected_unchanged(windows)


def test_wall_clock_reversal_and_independently_rounded_age_are_not_rewritten(windows):
    frame = windows[2]
    frame["profile"]["started_at"] = "2026-09-30T13:00:00Z"
    sample = frame["profile"]["sample"]
    sample.update(taken_at="2026-09-30T12:00:00.001Z", sampled_at="2026-09-30T11:00:00Z",
                  monotonic_ms=101, presentation_ms=90, frame_age_ms=12)
    assert sample["frame_age_ms"] != sample["monotonic_ms"] - sample["presentation_ms"]
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before


def test_native_display_geometry_labels_and_ink_session_do_not_rebind_archive_identity(windows):
    frame = windows[2]
    frame["composed"]["ink_session"] = "separate-reopened-ink-session"
    native = frame["profile"]["source_at_start"]
    native.update(source_id="native:screen:other", display_id="native-only-label", label="", scale_factor=1.25)
    native["bounds"].update(x=-1440.5, y=-2.25, width=1439.5, height=899.75)
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before
    assert frame["composed"]["ink_session"] != frame["profile"]["capture_session"] != frame["session_id"]
    assert frame["raw"]["width"] != native["bounds"]["width"] * native["scale_factor"]


def test_nullable_composition_does_not_invent_ink(windows, observation, display):
    frame = windows[2]
    frame["composed"] = None
    values = bind_example(frame, observation, display)
    before = deepcopy(values)
    validate_binding(*values)
    assert values == before and len(values[4]) == 1


def test_all_ink_marks_are_separate_and_account_for_visible_strokes(windows):
    composed = windows[2]["composed"]
    composed.update(visible_strokes=10, ink_marks={"verified": 1, "changed": 2, "unknown": 3, "following_content": 4})
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before
    composed["visible_strokes"] += 1
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("field", ["width", "height"])
def test_composition_dimensions_match_the_retained_raw_frame(windows, field):
    windows[2]["composed"]["image"][field] += 1
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("field,value", [("pixels_sha256", "c" * 64), ("width", 1), ("height", 1)])
def test_shared_artifact_identity_cannot_name_conflicting_image_facts(observation, display, field, value):
    frame = retained_examples()[0]
    frame["composed"]["image"][field] = value
    assert_rejected_unchanged(bind_example(frame, observation, display))


def test_distinct_artifact_ids_may_retain_the_same_unmodified_png(observation, display):
    frame = retained_examples()[0]
    frame["composed"]["image"]["artifact"]["artifact_id"] = "separate-composition-reference"
    values = bind_example(frame, observation, display)
    assert len(values[4]) == 2
    before = deepcopy(values)
    validate_binding(*values)
    assert values == before


@pytest.mark.parametrize("field", ["byte_length", "pixels_sha256"])
def test_distinct_artifact_ids_cannot_disguise_conflicting_facts_for_the_same_png(observation, display, field):
    frame = retained_examples()[0]
    image = frame["composed"]["image"]
    image["artifact"]["artifact_id"] = "separate-composition-reference"
    if field == "byte_length":
        image["artifact"]["byte_length"] += 1
    else:
        image["pixels_sha256"] = "c" * 64
    # Both external references match their declared image; the contradiction is
    # between descriptions of the same file, not a missing archive binding.
    assert_rejected_unchanged(bind_example(frame, observation, display))


@pytest.mark.parametrize("variant", ["rgba_digest", "newline", "traversal", "another_file"])
@pytest.mark.parametrize("path", [("raw",), COMPOSED])
def test_native_file_is_bound_to_png_file_digest_not_rgba_or_path_alias(windows, path, variant):
    picture = windows[2]
    for name in path:
        picture = picture[name]
    replacements = {"rgba_digest": "frames/" + picture["pixels_sha256"] + ".png",
                    "newline": picture["native_file"] + "\n", "traversal": "../" + picture["native_file"],
                    "another_file": "frames/" + "a" * 64 + ".png"}
    picture["native_file"] = replacements[variant]
    assert_rejected_unchanged(windows)


def test_every_metadata_object_is_closed_and_all_fields_are_required(windows):
    frame = windows[2]
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
        set_field(changed, (*path, "unreleased_claim"), True)
        with pytest.raises(ValidationError):
            validate(changed)


@pytest.mark.parametrize("claim", ["live_capture_allowed", "presentation_permission", "complete_history", "app_id", "text"])
def test_metadata_cannot_smuggle_authority_or_unobserved_content(windows, claim):
    windows[2][claim] = "client-assertion"
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("change", ["surrogate", "non_json", "deep_nesting"])
def test_non_utf8_non_json_and_excessive_nesting_fail_closed(windows, change):
    if change == "surrogate":
        windows[2]["profile"]["capture_session"] = "invalid-\ud800"
    elif change == "non_json":
        windows[2]["profile"]["sample"]["change_from_previous_sample"] = object()
    else:
        value = None
        for _ in range(70):
            value = [value]
        windows[2]["profile"]["sample"]["change_from_previous_sample"] = value
    with pytest.raises(ValidationError):
        validate(windows[2])


@pytest.mark.parametrize("target", ["frame", "record", "source", "raw_binding", "composed_binding"])
@pytest.mark.parametrize("field,value", [("user_id", "other-owner"), ("source_id", "other-source"), ("source_version", 2)])
def test_exact_owner_source_version_bind_every_original(windows, target, field, value):
    batch, _, frame, source, bindings = windows
    refs = {"frame": frame["source"], "record": batch["records"][0]["source"], "source": source,
            "raw_binding": bindings[0]["source"], "composed_binding": bindings[1]["source"]}
    refs[target][field] = value
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_display(source)
    for binding in bindings:
        validate_original("OriginalArtifactBinding", binding)
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("index", [0, 2, 3], ids=["batch", "frame", "source"])
@pytest.mark.parametrize("field", ["device_id", "session_id", "stream_id"])
def test_exact_capture_incarnation_cannot_be_substituted(windows, index, field):
    windows[index][field] = "other-incarnation"
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("index", [0, 1], ids=["raw", "composed"])
@pytest.mark.parametrize("target", ["record", "binding"])
@pytest.mark.parametrize("field,value", [("artifact_id", "other-image"), ("sha256", "f" * 64),
                                         ("byte_length", 101), ("media_type", "image/jpeg")])
def test_every_complete_png_reference_must_match(windows, index, target, field, value):
    ref = windows[4][index]["artifact"] if target == "binding" else windows[0]["records"][0]["artifacts"][index]
    ref[field] = value
    validate_process("ProcessBatch", windows[0])
    for binding in windows[4]:
        validate_original("OriginalArtifactBinding", binding)
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("record_id", [None, True, "", "absent-record"])
def test_record_selection_is_explicit(windows, record_id):
    batch, _, frame, source, bindings = windows
    assert_rejected_unchanged((batch, record_id, frame, source, bindings))


@pytest.mark.parametrize("index", [0, 1], ids=["raw", "composed"])
@pytest.mark.parametrize("change", ["missing_binding", "duplicate_binding", "missing_record_ref", "wrong_kind"])
def test_no_missing_duplicate_or_wrong_kind_png_bindings(windows, index, change):
    batch, _, _, _, bindings = windows
    if change == "missing_binding":
        del bindings[index]
    elif change == "duplicate_binding":
        bindings[index] = deepcopy(bindings[1 - index])
    elif change == "missing_record_ref":
        del batch["records"][0]["artifacts"][index]
    else:
        bindings[index]["kind"] = "editable_ink"
        bindings[index]["artifact"]["media_type"] = "application/json"
        validate_original("OriginalArtifactBinding", bindings[index])
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("bindings", [None, {}, "bindings"])
def test_original_bindings_require_an_explicit_collection(windows, bindings):
    assert_rejected_unchanged((*windows[:4], bindings))


def test_binding_order_is_irrelevant_but_same_raw_composed_original_needs_only_one(observation, display):
    for frame in retained_examples():
        values = bind_example(frame, observation, display)
        values[4].reverse()
        before = deepcopy(values)
        validate_binding(*values)
        assert values == before
        if frame["raw"] == frame["composed"]["image"]:
            assert len(values[4]) == 1
            values[4].append(deepcopy(values[4][0]))
            assert_rejected_unchanged(values)


@pytest.mark.parametrize("frame_id", [None, "other-frame"])
def test_record_must_name_this_exact_frame(windows, frame_id):
    windows[0]["records"][0]["frame_id"] = frame_id
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("field,value", [("observed_at", "2026-09-30T12:37:55.059Z"),
                                         ("media_position", 0), ("clock", CLOCK)])
def test_local_timing_cannot_be_promoted_to_selected_process_capture_time(windows, field, value):
    windows[0]["records"][0][field] = deepcopy(value)
    validate_process("ProcessBatch", windows[0])
    assert_rejected_unchanged(windows)


def test_generic_structured_process_and_unrelated_records_keep_originals(windows):
    batch, record_id, *_ = windows
    selected = batch["records"][0]
    assert (selected["surface"], selected["method"]) == ("web_dom", "structured")
    assert selected["evidence"]["operation"] == "reselect"
    selected["scope"] = {"kind": "attempt", "problem_id": "problem-1", "attempt_id": "attempt-1", "relation_revision": 3}
    selected["artifacts"].insert(0, {"artifact_id": "editable-original-ink", "sha256": "a" * 64,
                                      "byte_length": 42, "media_type": "application/json"})
    unrelated = deepcopy(selected)
    unrelated.update(record_id="another-record", sequence=2, frame_id=None,
                     observed_at="2026-09-29T12:00:00Z", clock=deepcopy(CLOCK), media_position=3)
    batch["records"].insert(0, unrelated)
    assert batch["records"][0]["record_id"] != record_id
    before = deepcopy(windows)
    validate_binding(*windows)
    assert windows == before
    # Pixel-producer admission and editable-ink authority are separate runtime duties.


@pytest.mark.parametrize("change", ["duplicate_record", "duplicate_sequence", "future_parent", "artifact_conflict", "batch_limit"])
def test_full_batch_process_invariants_still_apply(windows, change):
    batch = windows[0]
    first = batch["records"][0]
    second = deepcopy(first)
    second.update(record_id="record-2", sequence=2, causal_parents=[first["record_id"]])
    batch["records"].append(second)
    validate_binding(*windows)
    if change == "duplicate_record":
        second["record_id"] = first["record_id"]
    elif change == "duplicate_sequence":
        second["sequence"] = first["sequence"]
    elif change == "future_parent":
        first["causal_parents"] = [second["record_id"]]
    elif change == "artifact_conflict":
        second["artifacts"][0]["byte_length"] += 1
    else:
        batch["records"] = [{**deepcopy(first), "record_id": f"record-{i}", "sequence": i + 1} for i in range(101)]
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("target", ["batch", "source", "raw_binding", "composed_binding"])
def test_nested_released_versions_are_not_coerced(windows, target):
    targets = {"batch": windows[0], "source": windows[3], "raw_binding": windows[4][0], "composed_binding": windows[4][1]}
    targets[target]["contract_version"] = CONTRACT_VERSION
    assert_rejected_unchanged(windows)


@pytest.mark.parametrize("reader", ["v1", "process", "control", "original", "display", "ingress",
                                    "raw", "raw_ingress", "desktop", "desktop_ingress"])
def test_01_through_028_readers_reject_windows_without_conversion(windows, reader):
    batch, record_id, frame, source, bindings = windows
    calls = {
        "v1": lambda: validate_v1("Frame", frame),
        "process": lambda: validate_record_frame(batch, record_id, frame),
        "control": lambda: validate_control("StreamRegistration", frame),
        "original": lambda: validate_capture_frame(batch, record_id, frame, bindings[0]),
        "display": lambda: validate_display_record(source, batch, record_id, frame),
        "ingress": lambda: validate_ingress("FrameBatchRequest", {"contract_version": "0.2.4", "batch": batch, "frames": [frame]}),
        "raw": lambda: validate_raw(frame),
        "raw_ingress": lambda: raw_capture_ingress.validate("RawFrameBatchRequest", {"contract_version": "0.2.6", "batch": batch, "frames": [frame]}),
        "desktop": lambda: validate_desktop(frame),
        "desktop_ingress": lambda: desktop_capture_ingress.validate("DesktopFrameBatchRequest", {"contract_version": "0.2.8", "batch": batch, "frames": [frame]}),
    }
    before = deepcopy(windows)
    with pytest.raises(ValidationError):
        calls[reader]()
    assert windows == before


def test_generated_schema_and_types_are_current_and_reuse_released_primitives():
    Draft202012Validator.check_schema(SCHEMA)
    for name in ("Identifier", "UtcTimestamp", "SourceRef", "PngArtifactReference"):
        assert SCHEMA["$defs"][name] == RAW_SCHEMA["$defs"][name]
        assert SCHEMA["$defs"][name] is not RAW_SCHEMA["$defs"][name]
    generated = outputs()
    assert set(generated) == {"schema.json", "contracts.ts"}
    for name, content in generated.items():
        assert (ROOT / "windows_frame/generated" / name).read_text() == content
    assert json.loads(generated["schema.json"]) == SCHEMA
    for frame in retained_examples():
        Draft202012Validator(json.loads(generated["schema.json"])).validate(frame)
