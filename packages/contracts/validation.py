"""Validate wire payloads before domain authorization and persistence checks."""

import json
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

CONTRACT_VERSION = "0.1.0"
SCHEMA = json.loads(Path(__file__).with_name("schema.json").read_text())
FORMATS = FormatChecker()


@FORMATS.checks("iana-timezone", raises=(ZoneInfoNotFoundError, ValueError))
def is_timezone(value):
    if not isinstance(value, str):
        return True  # The schema type checker reports wrong types.
    ZoneInfo(value)
    return True


def validate(name: str, payload: dict) -> None:
    """Raise ValidationError on invalid shape or local cross-field invariants.

    Ownership, foreign keys, expiry, immutable versions, origin permission,
    idempotency, deletion tombstones and atomic budgets are service obligations.
    A successful call does not authorize the operation.
    """
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown contract: {name}")
    try:
        json.dumps(payload, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise ValidationError("Payload must be finite JSON data") from error
    schema = {**SCHEMA, "$ref": f"#/$defs/{name}"}
    Draft202012Validator(schema, format_checker=FORMATS).validate(payload)
    # Apply local invariants to nested definitions too (e.g. BridgeRequest).
    _walk(SCHEMA["$defs"][name], payload)


def _walk(schema, value):
    if "$ref" in schema:
        name = schema["$ref"].removeprefix("#/$defs/")
        _walk(SCHEMA["$defs"][name], value)
        return
    if schema.get("type") == "object":
        for key, subschema in schema["properties"].items():
            if key in value:
                _walk(subschema, value[key])
    elif schema.get("type") == "array":
        for item in value:
            _walk(schema["items"], item)
    for subschema in schema.get("anyOf", []):
        if Draft202012Validator({**SCHEMA, **subschema}, format_checker=FORMATS).is_valid(value):
            _walk(subschema, value)
            break
    if schema is SCHEMA["$defs"]["BoundingBox"]:
        if value["x"] + value["width"] > 1 + 1e-12 or value["y"] + value["height"] > 1 + 1e-12:
            raise ValidationError("Bounding box extends beyond the frozen frame")
    if schema is SCHEMA["$defs"]["Selection"] and "polygon" in value:
        points = value["polygon"]
        box = value["bbox"]
        for point in points:
            if not (box["x"] - 1e-12 <= point["x"] <= box["x"] + box["width"] + 1e-12 and box["y"] - 1e-12 <= point["y"] <= box["y"] + box["height"] + 1e-12):
                raise ValidationError("Polygon must fit within its bounding box")
        area = sum(a["x"] * b["y"] - b["x"] * a["y"] for a, b in zip(points, points[1:] + points[:1]))
        if abs(area) < 1e-15:
            raise ValidationError("Polygon must enclose a nonzero area")
    if schema is SCHEMA["$defs"]["NoteRevision"]:
        if value["revision"] != value["base_revision"] + 1:
            raise ValidationError("revision must equal base_revision + 1")
        if value["kind"] == "handwritten" and (value["ink_blob_id"] is None or value["authorship"] != "user"):
            raise ValidationError("Handwritten notes require original ink and user authorship")
        context_events = {event for segment in value["context_segments"] for event in segment["source_event_ids"]}
        if not context_events.issubset(value["source_event_ids"]):
            raise ValidationError("Note evidence must include every context segment event")
    if schema is SCHEMA["$defs"]["BudgetReservation"]:
        settled = value["state"] == "settled"
        if settled != (value["actual_fen"] is not None):
            raise ValidationError("Only settled reservations have an actual amount")


def validate_selection_frame(selection: dict, frame: dict) -> None:
    """Reject a selection rebound to another user, version, device or frame."""
    validate("Selection", selection)
    validate("Frame", frame)
    for field in ("user_id", "source_id", "source_version", "frame_id", "session_id", "device_id", "media_position"):
        if selection[field] != frame[field]:
            raise ValidationError(f"Selection/frame mismatch: {field}")
