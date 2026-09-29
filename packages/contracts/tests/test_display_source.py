"""Synthetic metadata checks, not a physical display or registered producer."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts import validate as validate_v1
from packages.contracts.display_source import validate, validate_display_record
from packages.contracts.display_source.generate import outputs
from packages.contracts.process_v2 import validate as validate_capture

ROOT = Path(__file__).parents[1]


@pytest.fixture
def display():
    return {"contract_version": "0.2.3", "user_id": "user-1", "source_id": "display-source-1",
            "source_version": 1, "type": "shared_display", "device_id": "device-1",
            "session_id": "session-1", "stream_id": "capture-stream-1", "project_id": None,
            "created_at": "2026-09-29T12:00:00Z", "source_timezone": "America/Los_Angeles"}


@pytest.fixture
def observation(display):
    batch = json.loads((ROOT / "process_v2/examples/capture.json").read_text())["ProcessBatch"]
    frame = json.loads((ROOT / "examples/core.json").read_text())["Frame"]
    frame.update({k: display[k] for k in ("user_id", "source_id", "source_version", "device_id", "session_id")})
    frame["representation"] = "screen_capture"
    item = batch["records"][0]
    item.update(source={k: display[k] for k in ("user_id", "source_id", "source_version")},
                frame_id=frame["frame_id"], media_position=frame["media_position"],
                artifacts=[{"artifact_id": frame["artifact_id"], "sha256": frame["content_hash"],
                            "byte_length": 100, "media_type": "image/png"}])
    return batch, item["record_id"], frame


def test_display_identity_needs_no_url_text_or_foreground_app(display, observation):
    original = deepcopy((display, observation))
    assert validate(display) is None
    assert validate_display_record(display, *observation) is None
    assert (display, observation) == original
    assert not any(k in display for k in ("original_url", "canonical_url", "text", "content_hash", "app_id", "live"))


@pytest.mark.parametrize("field,value", [
    ("contract_version", "0.1.0"), ("contract_version", "0.2.4"),
    ("type", "web"), ("type", "synthetic"), ("source_id", ""),
    ("source_version", True), ("source_version", 0), ("source_version", 2**53),
    ("device_id", None), ("stream_id", ""), ("source_timezone", "invalid/zone"),
    ("created_at", "2026-09-29T12:00:00+08:00"), ("project_id", 2),
])
def test_invalid_or_wrong_version_metadata_rejected(display, field, value):
    display[field] = value
    with pytest.raises(ValidationError):
        validate(display)


@pytest.mark.parametrize("field,value", [
    ("original_url", "https://example.invalid/fabricated-app"),
    ("canonical_url", "https://example.invalid/fabricated-app"),
    ("foreground_app", "Notability"), ("text", "invented OCR"),
    ("content_hash", "a" * 64), ("live", True), ("coverage", "complete"),
])
def test_stream_descriptor_cannot_smuggle_observed_or_authority_claims(display, field, value):
    display[field] = value
    with pytest.raises(ValidationError):
        validate(display)


@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_id", "other-source"), ("source_version", 2),
    ("device_id", "other-device"), ("session_id", "other-session"), ("stream_id", "restarted-stream"),
])
def test_individually_valid_foreign_display_cannot_bind_frame(display, observation, field, value):
    display[field] = value
    validate(display)
    with pytest.raises(ValidationError):
        validate_display_record(display, *observation)


@pytest.mark.parametrize("representation", ["synthetic_fixture", "dom_snapshot"])
def test_declared_pixels_cannot_be_dom_or_fixture_representation(display, observation, representation):
    observation[2]["representation"] = representation
    validate_v1("Frame", observation[2])
    with pytest.raises(ValidationError):
        validate_display_record(display, *observation)


def test_scope_is_not_rebound_by_late_timestamps_or_restart(display, observation):
    batch, record_id, frame = observation
    assert batch["delivery_mode"] == "historical"
    # Old observed/capture times remain facts; source creation is not a sorting key.
    assert frame["captured_at"] < display["created_at"]
    validate_display_record(display, batch, record_id, frame)
    batch["stream_id"] = "new-stream"
    with pytest.raises(ValidationError):
        validate_display_record(display, batch, record_id, frame)


def test_existing_record_frame_checks_still_apply(display, observation):
    batch, record_id, frame = observation
    frame["media_position"] = None
    with pytest.raises(ValidationError):
        validate_display_record(display, batch, record_id, frame)
    with pytest.raises((ValueError, ValidationError)):
        validate_display_record(display, batch, "not-in-batch", frame)


def test_display_is_not_silently_a_legacy_source_or_capture_message(display):
    for name in ("SourceRegistrationRequest", "SourceRecord", "SourceSnapshot"):
        with pytest.raises(ValidationError):
            validate_v1(name, display)
    with pytest.raises(ValidationError):
        validate_capture("ProcessBatch", display)
    legacy = json.loads((ROOT / "examples/core.json").read_text())["SourceSnapshot"]
    validate_v1("SourceSnapshot", legacy)
    with pytest.raises(ValidationError):
        validate(legacy)


def test_closed_shape_required_fields_and_generated_files(display):
    for field in list(display):
        reduced = deepcopy(display)
        del reduced[field]
        with pytest.raises(ValidationError):
            validate(reduced)
    for name, output in outputs().items():
        assert (ROOT / "display_source/generated" / name).read_text() == output
