import copy
import hashlib
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts import validate, validate_selection_frame
from packages.contracts.generate_types import render, ts_type
from packages.contracts.validation import SCHEMA

ROOT = Path(__file__).parents[1]
EXAMPLES = json.loads((ROOT / "examples" / "core.json").read_text())


def test_schema_and_generated_artifact():
    Draft202012Validator.check_schema(SCHEMA)
    assert (ROOT / "generated" / "contracts.ts").read_text() == render()


@pytest.mark.parametrize("name", EXAMPLES)
def test_wire_examples(name):
    validate(name, EXAMPLES[name])


@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("source_version", 2), ("frame_id", "frame-2"),
    ("device_id", "other-device"), ("media_position", 18.0), ("session_id", "other-session"),
])
def test_frozen_selection_cannot_rebind(field, value):
    selection = copy.deepcopy(EXAMPLES["Selection"])
    validate_selection_frame(selection, EXAMPLES["Frame"])
    selection[field] = value
    with pytest.raises(ValidationError, match="mismatch"):
        validate_selection_frame(selection, EXAMPLES["Frame"])


@pytest.mark.parametrize("name,field,value", [
    ("Observation", "actor", "speaker"),
    ("Observation", "captured_at", "2026-09-28T00:00:00-07:00"),
    ("Observation", "captured_at", "2026-02-30T00:00:00Z"),
    ("Observation", "source_timezone", "UTC+pretend"),
    ("Observation", "confidence", 1.1),
    ("Observation", "device_sequence", 9007199254740992),
    ("Selection", "input_mode", "navigation"),
    ("Selection", "frame_id", None),
    ("NoteRevision", "revision", 3),
    ("NoteRevision", "kind", "handwritten"),
    ("BudgetReservation", "estimated_max_fen", -1),
    ("BudgetReservation", "estimated_max_fen", 0.01),
    ("BudgetReservation", "state", "settled"),
    ("BudgetReservation", "price_version", ""),
])
def test_unsafe_or_incomplete_payloads_rejected(name, field, value):
    payload = copy.deepcopy(EXAMPLES[name])
    payload[field] = value
    with pytest.raises(ValidationError):
        validate(name, payload)


def test_nested_bridge_validates_geometry():
    payload = copy.deepcopy(EXAMPLES["BridgeRequest"])
    payload["selection"]["bbox"]["x"] = 0.95
    with pytest.raises(ValidationError, match="beyond"):
        validate("BridgeRequest", payload)


def test_bridge_does_not_accept_credentials_or_foreign_actions():
    payload = copy.deepcopy(EXAMPLES["BridgeRequest"])
    payload["token"] = "must-not-enter-course-page"
    with pytest.raises(ValidationError):
        validate("BridgeRequest", payload)
    del payload["token"]
    payload["action"] = "execute_code"
    with pytest.raises(ValidationError):
        validate("BridgeRequest", payload)


def test_fixture_checksums_match_original_bytes():
    assert hashlib.sha256(EXAMPLES["SourceSnapshot"]["text"].encode()).hexdigest() == EXAMPLES["SourceSnapshot"]["content_hash"]
    assert hashlib.sha256((ROOT / "examples" / "frame.svg").read_bytes()).hexdigest() == EXAMPLES["Frame"]["content_hash"]


def test_generator_rejects_unsupported_structural_keywords():
    with pytest.raises(ValueError, match="Unsupported"):
        ts_type({"type": "string", "allOf": []})


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_numbers_cannot_enter_wire_payload(value):
    payload = copy.deepcopy(EXAMPLES["Observation"])
    payload["confidence"] = value
    with pytest.raises(ValidationError, match="finite JSON"):
        validate("Observation", payload)


def test_polygon_and_bbox_describe_same_region():
    payload = copy.deepcopy(EXAMPLES["Selection"])
    payload["polygon"] = [{"x": 0.1, "y": 0.2}, {"x": 0.3, "y": 0.2}, {"x": 0.3, "y": 0.3}]
    validate("Selection", payload)
    payload["polygon"][0]["x"] = 0.9
    with pytest.raises(ValidationError, match="bounding box"):
        validate("Selection", payload)
    payload["polygon"] = [{"x": 0.1, "y": 0.2}] * 3
    with pytest.raises(ValidationError, match="nonzero area"):
        validate("Selection", payload)


@pytest.mark.parametrize("schema", [
    {"type": "object", "properties": {}, "required": [], "additionalProperties": {"type": "string"}},
    {"$ref": "#/$defs/Identifier", "type": "number"},
])
def test_generator_does_not_discard_structural_extensions(schema):
    with pytest.raises(ValueError, match="Unsupported"):
        ts_type(schema)


def test_overflowed_json_number_is_rejected():
    payload = copy.deepcopy(EXAMPLES["Frame"])
    payload["media_position"] = json.loads("1e400")
    with pytest.raises(ValidationError, match="finite JSON"):
        validate("Frame", payload)


def test_note_evidence_contains_segment_sources():
    payload = copy.deepcopy(EXAMPLES["NoteRevision"])
    payload["context_segments"][0]["source_event_ids"] = ["different-event"]
    with pytest.raises(ValidationError, match="context segment"):
        validate("NoteRevision", payload)


def test_every_wire_integer_has_javascript_safe_bounds():
    def visit(value):
        if isinstance(value, dict):
            if value.get("type") == "integer":
                assert value["minimum"] >= 0
                assert value["maximum"] <= 9007199254740991
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(SCHEMA)
