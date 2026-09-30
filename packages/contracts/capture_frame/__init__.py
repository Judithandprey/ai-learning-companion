"""Candidate 0.2.5 raw native-frame metadata; no transport or authority grant."""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from ..display_source import validate as validate_display
from ..original_artifact import MAX_ARTIFACT_BYTES, validate as validate_original
from ..process_v2 import validate as validate_process
from ..process_v2.validation import SCHEMA as PROCESS_SCHEMA
from ..validation import FORMATS, MAX_SAFE_INTEGER, _check_safe_integers

CONTRACT_VERSION = "0.2.5"


def _object(properties):
    return {"type": "object", "additionalProperties": False,
            "properties": properties, "required": list(properties)}


_defs = {name: deepcopy(PROCESS_SCHEMA["$defs"][name])
         for name in ("Identifier", "UtcTimestamp", "SourceRef", "ArtifactReference")}
_defs["PngArtifactReference"] = deepcopy(_defs.pop("ArtifactReference"))
_defs["PngArtifactReference"]["properties"]["media_type"] = {"const": "image/png"}
_defs["PngArtifactReference"]["properties"]["byte_length"]["minimum"] = 1
_defs["PngArtifactReference"]["properties"]["byte_length"]["maximum"] = MAX_ARTIFACT_BYTES
_defs["CallbackClock"] = deepcopy(PROCESS_SCHEMA["$defs"]["CaptureClock"])
_defs["CallbackClock"]["properties"]["uncertainty_ms"] = {"type": "null"}

_timing = {
    "observed_at_estimate": {"type": "null"},
    "estimate_basis": {"type": "null"},
    "uncertainty_ms": {"type": "null"},
    "callback_clock": {"anyOf": [{"$ref": "#/$defs/CallbackClock"}, {"type": "null"}]},
    "sample_pts_seconds": {"type": ["number", "null"]},
}
_defs["RawCaptureTiming"] = {"anyOf": [
    _object(deepcopy(_timing)),
    _object({**deepcopy(_timing),
             "observed_at_estimate": {"$ref": "#/$defs/UtcTimestamp"},
             "estimate_basis": {"const": "session_wall_plus_callback_monotonic_delta"},
             "callback_clock": {"$ref": "#/$defs/CallbackClock"}}),
]}
_defs["RawCaptureOrientation"] = _object({
    "system": {"const": "CGImagePropertyOrientation"},
    "value": {"type": ["integer", "null"], "enum": [None, 1, 2, 3, 4, 5, 6, 7, 8]},
    "applied_to_pixels": {"type": "boolean", "const": False},
})
_defs["RawCaptureFrame"] = _object({
    "contract_version": {"const": CONTRACT_VERSION},
    "kind": {"const": "raw_capture_frame"},
    "frame_id": {"$ref": "#/$defs/Identifier"},
    "source": {"$ref": "#/$defs/SourceRef"},
    **{name: {"$ref": "#/$defs/Identifier"} for name in ("device_id", "session_id", "stream_id")},
    "artifact": {"$ref": "#/$defs/PngArtifactReference"},
    "raw_width": {"type": "integer", "minimum": 1, "maximum": MAX_SAFE_INTEGER},
    "raw_height": {"type": "integer", "minimum": 1, "maximum": MAX_SAFE_INTEGER},
    "buffer_sequence": {"type": "integer", "minimum": 1, "maximum": MAX_SAFE_INTEGER},
    "captured_at": {"type": "null"},
    "media_position": {"type": "null"},
    "timing": {"$ref": "#/$defs/RawCaptureTiming"},
    "orientation": {"$ref": "#/$defs/RawCaptureOrientation"},
})
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/capture-frame/0.2.5",
    "$ref": "#/$defs/RawCaptureFrame",
    "$defs": _defs,
}


def validate(frame):
    """Check declared raw metadata, including unknowns; never inspect image bytes."""
    _check_safe_integers(frame)
    try:
        json.dumps(frame, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Raw frame must be finite UTF-8 JSON") from exc
    Draft202012Validator(SCHEMA, format_checker=FORMATS).validate(frame)


def validate_binding(batch, record_id, frame, source, binding):
    """Bind one explicitly selected record to supplied raw metadata and PNG facts.

    Returns None and changes no inputs. Other records retain ProcessBatch checks,
    but their sources/artifacts are not bound by this selected-record check. No
    source access, producer grant, stored bytes, decoded size, freshness, attempt
    relation or presentation permission is established. No legacy Frame is made.
    """
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_process("Identifier", record_id)
    validate_display(source)
    validate_original("OriginalArtifactBinding", binding)
    record = next((r for r in batch["records"] if r["record_id"] == record_id), None)
    if record is None or record["frame_id"] != frame["frame_id"]:
        raise ValidationError("Selected record must explicitly name this raw frame")
    source_ref = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    if not frame["source"] == record["source"] == binding["source"] == source_ref:
        raise ValidationError("Raw frame must bind the exact owner/source/version")
    for name in ("device_id", "session_id", "stream_id"):
        if not frame[name] == batch[name] == source[name]:
            raise ValidationError(f"Raw frame {name} differs from the capture incarnation")
    if binding["kind"] != "screen_image" or binding["artifact"] != frame["artifact"]:
        raise ValidationError("Raw frame must bind the complete PNG original reference")
    artifact = next((a for a in record["artifacts"]
                     if a["artifact_id"] == frame["artifact"]["artifact_id"]), None)
    if artifact != frame["artifact"]:
        raise ValidationError("Selected record must retain the complete PNG reference")
    if record["observed_at"] is not None or record["media_position"] is not None:
        raise ValidationError("Callback estimates and sample PTS are not observed UTC or course time")
    if record["clock"] is not None and record["clock"] != frame["timing"]["callback_clock"]:
        raise ValidationError("Supplied process clock must match the callback observation clock")
