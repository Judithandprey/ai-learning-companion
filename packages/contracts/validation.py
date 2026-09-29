"""Validate wire payloads before domain authorization and persistence checks."""

import errno
import json
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

CONTRACT_VERSION = "0.1.0"
MAX_SAFE_INTEGER = 2**53 - 1
# Engineering input guard, above the depth of every current closed wire shape.
# Reject before jsonschema formats a malformed nested value into an exception.
MAX_JSON_DEPTH = 64
SCHEMA = json.loads(Path(__file__).with_name("schema.json").read_text())
FORMATS = FormatChecker()


@FORMATS.checks("iana-timezone", raises=(ZoneInfoNotFoundError, ValueError))
def is_timezone(value):
    if not isinstance(value, str):
        return True  # The schema type checker reports wrong types.
    try:
        ZoneInfo(value)
    except OSError as error:
        # Older tzdata loaders can try to open a region directory ("America")
        # as a zone file. Both cases are invalid keys, not a tzdata outage.
        if error.errno in {errno.ENAMETOOLONG, errno.EISDIR}:
            return False
        raise  # A tzdata permission/I/O fault is not invalid user input.
    return True


@FORMATS.checks("http-url", raises=ValueError)
def is_http_url(value):
    if not isinstance(value, str):
        return True
    if any(ord(character) <= 32 or ord(character) == 127 for character in value) or "\\" in value:
        return False
    parts = urlsplit(value)
    _ = parts.port  # Also rejects malformed/out-of-range ports.
    return parts.scheme in {"http", "https"} and bool(parts.hostname) and parts.username is None and parts.password is None


def validate(name: str, payload: dict) -> None:
    """Raise ValidationError on invalid shape or local cross-field invariants.

    Ownership, foreign keys, expiry, immutable versions, origin permission,
    idempotency, deletion tombstones and atomic budgets are service obligations.
    A successful call does not authorize the operation.
    """
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown contract: {name}")
    _check_safe_integers(payload)
    try:
        json.dumps(payload, allow_nan=False)
    except (ValueError, TypeError, RecursionError) as error:
        raise ValidationError("Payload must be finite JSON data") from error
    schema = {**SCHEMA, "$ref": f"#/$defs/{name}"}
    Draft202012Validator(schema, format_checker=FORMATS).validate(payload)
    # Apply local invariants to nested definitions too (e.g. BridgeRequest).
    _walk(SCHEMA["$defs"][name], payload)


def _check_safe_integers(value):
    # Python's JSON encoder accepts integers that JavaScript cannot preserve.
    # Iterative traversal also handles data deeper than Python's call stack.
    pending = [(value, 0)]
    while pending:
        current, depth = pending.pop()
        if depth > MAX_JSON_DEPTH:
            # No instance/context: rendering this error must not traverse input.
            raise ValidationError("JSON nesting exceeds the supported structural depth")
        if type(current) is int and not -MAX_SAFE_INTEGER <= current <= MAX_SAFE_INTEGER:
            raise ValidationError("JSON integers must stay within the JavaScript safe integer range")
        if isinstance(current, dict):
            pending.extend((child, depth + 1) for child in current.values())
        elif isinstance(current, (list, tuple)):
            pending.extend((child, depth + 1) for child in current)


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
    if schema is SCHEMA["$defs"]["SourceRecord"]:
        if value["access_status"] == "registered" and value["current_version"] is not None:
            raise ValidationError("Registration cannot claim a fetched snapshot version")
        if value["access_status"] in {"fetched", "parsed", "indexed", "ready"} and value["current_version"] is None:
            raise ValidationError("Fetched sources require a snapshot version")
    if schema is SCHEMA["$defs"]["SourceReadResult"]:
        current = value["source"]["current_version"]
        if current is not None and current not in value["snapshot_versions"]:
            raise ValidationError("Current source version must be retrievable")
    if schema is SCHEMA["$defs"]["UsageResult"]:
        remaining = max(0, value["monthly_limit_fen"] - value["actual_fen"] - value["reserved_fen"])
        if value["remaining_fen"] != remaining:
            raise ValidationError("Remaining budget must include active reservations")
    if schema is SCHEMA["$defs"]["SubscriptionUsage"]:
        status = value["quota_status"]
        units = value["remaining_units"]
        if (status == "unknown" and units is not None) or (status == "known" and units is None) or (status == "exhausted" and units != 0):
            raise ValidationError("Subscription quota cannot invent an unknown balance")
    if schema is SCHEMA["$defs"]["JobCancelResult"]:
        if value["state"] in {"cancelling", "cancelled"} and not value["cancel_requested"]:
            raise ValidationError("Cancellation state requires a recorded request")


def validate_selection_frame(selection: dict, frame: dict) -> None:
    """Reject a selection rebound to another user, version, device or frame."""
    validate("Selection", selection)
    validate("Frame", frame)
    for field in ("user_id", "source_id", "source_version", "frame_id", "session_id", "device_id", "media_position"):
        if selection[field] != frame[field]:
            raise ValidationError(f"Selection/frame mismatch: {field}")
