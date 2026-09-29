"""Synthetic binding probes; none establishes real screen capture or image bytes."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts.original_artifact import validate, validate_capture_frame
from packages.contracts.process_v2 import validate_record_frame


@pytest.fixture
def proposal():
    root = Path(__file__).parents[1]
    frame = json.loads((root / "examples/core.json").read_text())["Frame"]
    batch = json.loads((root / "process_v2/examples/capture.json").read_text())["ProcessBatch"]
    frame["representation"] = "screen_capture"
    batch.update(device_id=frame["device_id"], session_id=frame["session_id"])
    record = batch["records"][0]
    record.update(source={k: frame[k] for k in ("user_id", "source_id", "source_version")},
                  frame_id=frame["frame_id"], media_position=frame["media_position"])
    # Intentionally metadata only. These hashes/lengths are not decoded image proof.
    record["artifacts"] = [{"artifact_id": frame["artifact_id"], "sha256": frame["content_hash"],
                            "byte_length": 100, "media_type": "image/png"}]
    binding = {"contract_version": "0.2.2", "source": deepcopy(record["source"]),
               "kind": "screen_image", "artifact": deepcopy(record["artifacts"][0])}
    return batch, record["record_id"], frame, binding


def test_reuses_exact_versions_without_mutation_or_live_claim(proposal):
    original = deepcopy(proposal)
    assert validate_capture_frame(*proposal) is None
    assert proposal == original
    # Capture and observation timestamps need not agree. This is not a freshness attestation.
    assert proposal[0]["records"][0]["observed_at"] != proposal[2]["captured_at"]
    assert proposal[0]["delivery_mode"] == "historical"


@pytest.mark.parametrize("field,value", [
    ("user_id", "another-user"), ("source_id", "another-source"), ("source_version", 2),
    ("artifact_id", "another-artifact"), ("sha256", "b" * 64),
    ("byte_length", 101), ("media_type", "image/jpeg"),
])
def test_individually_valid_original_cannot_substitute_a_record_binding(proposal, field, value):
    batch, record_id, frame, binding = proposal
    binding["source" if field in binding["source"] else "artifact"][field] = value
    validate("OriginalArtifactBinding", binding)
    validate_record_frame(batch, record_id, frame)
    with pytest.raises(ValidationError):
        validate_capture_frame(*proposal)


@pytest.mark.parametrize("representation", ["dom_snapshot", "synthetic_fixture"])
def test_production_ingress_cannot_relabel_dom_or_synthetic_frame(proposal, representation):
    proposal[2]["representation"] = representation
    validate_record_frame(*proposal[:3])
    with pytest.raises(ValidationError):
        validate_capture_frame(*proposal)


def test_ink_cannot_be_registered_as_a_screen_frame(proposal):
    batch, record_id, frame, binding = proposal
    binding["kind"] = "editable_ink"
    binding["artifact"]["media_type"] = "application/json"
    batch["records"][0]["artifacts"][0]["media_type"] = "application/json"
    validate("OriginalArtifactBinding", binding)
    validate_record_frame(batch, record_id, frame)
    with pytest.raises(ValidationError):
        validate_capture_frame(*proposal)


@pytest.mark.parametrize("change", ["device", "frame", "missing_record", "missing_reference"])
def test_frame_record_guard_is_not_skipped(proposal, change):
    batch, record_id, frame, binding = proposal
    if change == "device":
        frame["device_id"] = "another-device"
    elif change == "frame":
        batch["records"][0]["frame_id"] = None
    elif change == "missing_record":
        record_id = "another-record"
    else:
        batch["records"][0]["artifacts"] = []
    with pytest.raises((ValidationError, ValueError)):
        validate_capture_frame(batch, record_id, frame, binding)


def test_other_typed_original_can_coexist_but_is_not_the_frame(proposal):
    batch, record_id, frame, binding = proposal
    batch["records"][0]["artifacts"].insert(0, {"artifact_id": "separate-ink",
        "sha256": "c" * 64, "byte_length": 42, "media_type": "application/json"})
    validate_capture_frame(*proposal)
    # Every other reference still needs its own service-side validation.
    wrong = deepcopy(binding)
    wrong.update(kind="editable_ink", artifact=batch["records"][0]["artifacts"][0])
    with pytest.raises(ValidationError):
        validate_capture_frame(batch, record_id, frame, wrong)
