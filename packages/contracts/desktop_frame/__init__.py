"""Additive 0.2.7 desktop metadata; no byte access, transport or authority grant."""

from copy import deepcopy
from datetime import datetime, timedelta
import json

from jsonschema import Draft202012Validator, ValidationError

from ..capture_frame import SCHEMA as RAW_SCHEMA, _object
from ..display_source import validate as validate_display
from ..original_artifact import validate as validate_original
from ..process_v2 import validate as validate_process
from ..validation import FORMATS, MAX_SAFE_INTEGER, _check_safe_integers

CONTRACT_VERSION = "0.2.7"
MAX_UINT64 = 2**64 - 1
ESTIMATE_BASIS = "session_wall_plus_callback_monotonic_delta"
ENCODING = "png; 8-bit RGBA; sRGB; lossless; native size; not rotated"
DISPLAY_SCOPE = ("whole display; no window excluded, so this app's windows are captured when visible; "
                 "cursor {}; BGRA buffers requested in sRGB; no audio")
SYNTHETIC_SCOPE = "synthetic fixture; not a captured display"


def _nullable(shape):
    return {"anyOf": [shape, {"type": "null"}]}


def _uint64_pattern():
    # Enforce the exact decimal bound in generated JSON Schema as well as Python.
    maximum = str(MAX_UINT64)
    alternatives = ["0", "[1-9][0-9]{0,18}", maximum]
    for index, digit in enumerate(maximum):
        low, high = (1 if index == 0 else 0), int(digit) - 1
        if low <= high:
            choice = str(low) if low == high else f"[{low}-{high}]"
            alternatives.append(maximum[:index] + choice + f"[0-9]{{{19-index}}}")
    return "^(?:" + "|".join(alternatives) + r")(?![\s\S])"


_defs = {name: deepcopy(RAW_SCHEMA["$defs"][name]) for name in (
    "Identifier", "UtcTimestamp", "SourceRef", "PngArtifactReference",
)}
for name, digits in (("NativeWallUtc", 3), ("CallbackEstimateUtc", 6)):
    # Native wall anchors are milliseconds; derived estimates use datetime's
    # microsecond resolution. Never silently truncate a finer supplied instant.
    _defs[name] = {**deepcopy(_defs["UtcTimestamp"]), "pattern": (
        r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
        + rf"(?:\.[0-9]{{1,{digits}}})?Z(?![\s\S])"
    )}
_defs["UInt64Decimal"] = {"type": "string", "minLength": 1, "maxLength": 20,
                            "pattern": _uint64_pattern()}
_defs["ReportedRect"] = _object({
    "x": {"type": "number"}, "y": {"type": "number"},
    "width": {"type": "number", "minimum": 0}, "height": {"type": "number", "minimum": 0},
})
_defs["MacDisplayAtStart"] = _object({
    "display_id": {"type": "integer", "minimum": 0, "maximum": 2**32 - 1},
    "name": {"type": ["string", "null"], "maxLength": 1024},
    "frame_points": {"$ref": "#/$defs/ReportedRect"},
    "point_pixel_scale": {"type": "number", "exclusiveMinimum": 0},
    **{name: {"type": "integer", "minimum": 1, "maximum": MAX_SAFE_INTEGER}
       for name in ("requested_width_pixels", "requested_height_pixels")},
    "rotation_degrees": {"type": "number"},
    "is_main": {"type": "boolean"},
    "scope": {"enum": [DISPLAY_SCOPE.format(cursor) for cursor in ("shown", "hidden")] + [SYNTHETIC_SCOPE]},
})
_defs["MacHostClock"] = _object({
    "basis": {"const": "mach_absolute_time_seconds"},
    "session_started_wall_utc": {"$ref": "#/$defs/NativeWallUtc"},
    "session_started_seconds": {"type": "number", "minimum": 0},
    "callback_seconds": {"type": "number", "minimum": 0},
    "display_time_ticks_decimal": _nullable({"$ref": "#/$defs/UInt64Decimal"}),
    "display_time_seconds": {"type": ["number", "null"], "minimum": 0},
})
_defs["MacSampleFacts"] = _object({
    # Only complete callbacks with an image become KeptFrame in the actual producer.
    "status": {"const": "complete"},
    "presentation_time_seconds": {"type": ["number", "null"]},
    "geometry_basis": {"const": "SCStreamFrameInfo_as_reported"},
    # The producer does not record a verified coordinate conversion to PNG pixels.
    "geometry_unit": {"type": "null"},
    "content_rect": _nullable({"$ref": "#/$defs/ReportedRect"}),
    "content_scale": {"type": ["number", "null"], "exclusiveMinimum": 0},
    "scale_factor": {"type": ["number", "null"], "exclusiveMinimum": 0},
    "dirty_rects": _nullable({"type": "array", "maxItems": 4096,
                              "items": {"$ref": "#/$defs/ReportedRect"}}),
})
_defs["MacScreenCaptureKit"] = _object({
    "kind": {"const": "macos_screencapturekit"},
    "native_session_id": {"$ref": "#/$defs/Identifier"},
    "pixel_format": {"type": "string", "minLength": 4, "maxLength": 4,
                     "pattern": r"^[\u0000-\u00ff]{4}(?![\s\S])"},
    "encoding": {"const": ENCODING},
    "display_at_start": {"$ref": "#/$defs/MacDisplayAtStart"},
    "host_clock": {"$ref": "#/$defs/MacHostClock"},
    "sample": {"$ref": "#/$defs/MacSampleFacts"},
})
_timing = {
    "observed_at_estimate": {"type": "null"}, "estimate_basis": {"type": "null"},
    "uncertainty_ms": {"type": "null"},
    # This producer records absolute Double seconds, not a Process CaptureClock.
    "callback_clock": {"type": "null"},
}
_defs["DesktopTiming"] = {"anyOf": [
    _object(deepcopy(_timing)),
    _object({**deepcopy(_timing), "observed_at_estimate": {"$ref": "#/$defs/CallbackEstimateUtc"},
             "estimate_basis": {"const": ESTIMATE_BASIS}}),
]}
_defs["DesktopFrame"] = _object({
    "contract_version": {"const": CONTRACT_VERSION}, "kind": {"const": "raw_capture_frame"},
    **{name: {"$ref": "#/$defs/Identifier"} for name in ("frame_id", "device_id", "session_id", "stream_id")},
    "source": {"$ref": "#/$defs/SourceRef"}, "artifact": {"$ref": "#/$defs/PngArtifactReference"},
    **{name: {"type": "integer", "minimum": 1, "maximum": MAX_SAFE_INTEGER}
       for name in ("raw_width", "raw_height", "callback_sequence")},
    "captured_at": {"type": "null"}, "media_position": {"type": "null"},
    "pixel_orientation": {"type": "null"}, "pixels_transformed": {"type": "boolean", "const": False},
    "timing": {"$ref": "#/$defs/DesktopTiming"},
    "profile": {"$ref": "#/$defs/MacScreenCaptureKit"},
})
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/desktop-frame/0.2.7",
    "$ref": "#/$defs/DesktopFrame", "$defs": _defs,
}


def validate(frame):
    """Validate declared native facts only; never read files or inspect pixels."""
    _check_safe_integers(frame)
    try:
        json.dumps(frame, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Desktop frame must be finite UTF-8 JSON") from exc
    Draft202012Validator(SCHEMA, format_checker=FORMATS).validate(frame)
    profile, timing = frame["profile"], frame["timing"]
    clock = profile["host_clock"]
    if ((clock["display_time_ticks_decimal"] is None) != (clock["display_time_seconds"] is None)):
        raise ValidationError("Display ticks and their separately recorded seconds must both be known or unknown")
    delta = clock["callback_seconds"] - clock["session_started_seconds"]
    if delta < 0:
        raise ValidationError("Callback precedes its local session origin")
    if timing["observed_at_estimate"] is not None:
        try:
            expected = datetime.fromisoformat(clock["session_started_wall_utc"].replace("Z", "+00:00")) + timedelta(seconds=delta)
            actual = datetime.fromisoformat(timing["observed_at_estimate"].replace("Z", "+00:00"))
        except (OverflowError, ValueError) as exc:
            raise ValidationError("Callback wall estimate is outside the supported UTC range") from exc
        if actual != expected:
            raise ValidationError("Callback wall estimate must use only the recorded session wall/host origin")


def validate_binding(batch, record_id, frame, source, binding):
    """Bind one explicit record to metadata; no stored-byte or authority proof.

    Preserves all inputs, other records, attempt scope and separate ink. An absent
    frame is not manufactured for a gap. Existing contracts/readers stay closed.
    """
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_process("Identifier", record_id)
    validate_display(source)
    validate_original("OriginalArtifactBinding", binding)
    record = next((r for r in batch["records"] if r["record_id"] == record_id), None)
    if record is None or record["frame_id"] != frame["frame_id"]:
        raise ValidationError("Selected record must explicitly name this desktop frame")
    source_ref = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    if not frame["source"] == record["source"] == binding["source"] == source_ref:
        raise ValidationError("Desktop frame must bind the exact owner/source/version")
    for name in ("device_id", "session_id", "stream_id"):
        if not frame[name] == batch[name] == source[name]:
            raise ValidationError(f"Desktop frame {name} differs from its capture incarnation")
    if binding["kind"] != "screen_image" or binding["artifact"] != frame["artifact"]:
        raise ValidationError("Desktop frame must bind the complete PNG original reference")
    artifact = next((a for a in record["artifacts"] if a["artifact_id"] == frame["artifact"]["artifact_id"]), None)
    if artifact != frame["artifact"]:
        raise ValidationError("Selected record must retain the complete PNG reference")
    if record["observed_at"] is not None or record["media_position"] is not None:
        raise ValidationError("Host/display/sample clocks cannot replace capture UTC or course position")
    if record["clock"] is not None:
        raise ValidationError("This producer supplies host seconds, not a Process CaptureClock")
