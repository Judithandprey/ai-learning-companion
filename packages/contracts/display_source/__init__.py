"""Explicit 0.2.3 shared-display provenance, without a fabricated page URL.

This immutable descriptor identifies one device/session/stream source. It is not
an observation, a current foreground-app identity, or authorization to capture.
"""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from ..validation import FORMATS, SCHEMA as LEGACY_SCHEMA, _check_safe_integers
from ..process_v2 import validate_record_frame
from ..process_v2.validation import SCHEMA as CAPTURE_SCHEMA

CONTRACT_VERSION = "0.2.3"

_properties = {
    "contract_version": {"const": CONTRACT_VERSION},
    **deepcopy(CAPTURE_SCHEMA["$defs"]["SourceRef"]["properties"]),
    "type": {"const": "shared_display"},
    **{name: {"$ref": "#/$defs/Identifier"} for name in ("device_id", "session_id", "stream_id")},
    "project_id": {"anyOf": [{"$ref": "#/$defs/Identifier"}, {"type": "null"}]},
    "created_at": {"$ref": "#/$defs/UtcTimestamp"},
    "source_timezone": {"type": "string", "format": "iana-timezone"},
}
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/display-source/0.2.3",
    "$defs": {
        **{name: deepcopy(LEGACY_SCHEMA["$defs"][name]) for name in ("Identifier", "UtcTimestamp")},
        "DisplaySourceSnapshot": {"type": "object", "additionalProperties": False,
                                  "properties": _properties, "required": list(_properties)},
    },
}


def validate(snapshot):
    """Validate declared metadata only; service authority is checked separately."""
    _check_safe_integers(snapshot)
    try:
        json.dumps(snapshot, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Display source must be finite UTF-8 JSON") from exc
    Draft202012Validator({**SCHEMA, "$ref": "#/$defs/DisplaySourceSnapshot"},
                         format_checker=FORMATS).validate(snapshot)


def validate_display_record(snapshot, batch, record_id, frame):
    """Bind an existing record/frame to this display incarnation, never attest live.

    Historical delivery through the original stopped stream remains representable.
    Actual current authority, byte integrity and capture completeness are not
    established by this metadata check. No timestamps are rewritten or reordered.
    """
    validate(snapshot)
    validate_record_frame(batch, record_id, frame)
    if frame["representation"] != "screen_capture":
        raise ValidationError("Display provenance requires a screen-capture frame")
    for field in ("user_id", "source_id", "source_version", "device_id", "session_id"):
        if frame[field] != snapshot[field]:
            raise ValidationError(f"Display frame {field} differs from its source")
    if batch["stream_id"] != snapshot["stream_id"]:
        raise ValidationError("Display source belongs to a different capture incarnation")
