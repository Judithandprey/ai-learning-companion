"""Additive 0.2.11 retained Mac image facts; no bytes, transport or authority."""

from copy import deepcopy
import json
import math
import re

from jsonschema import Draft202012Validator, ValidationError

from ..capture_frame import _object
from ..desktop_frame import SCHEMA as DESKTOP_SCHEMA, ENCODING, _nullable
from ..display_source import validate as validate_display
from ..original_artifact import validate as validate_original
from ..process_v2 import validate as validate_process
from ..validation import FORMATS, MAX_SAFE_INTEGER, _check_safe_integers

CONTRACT_VERSION = "0.2.11"
PRODUCER_BASELINE = "5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63"
APP_EXCLUDED_SCOPE = (
    "whole display, SCContentFilter(display:excludingApplications: [this app], exceptingWindows: []); "
    "every window of this app (main window, ink overlay, palette, menu bar item, menus and alerts) is excluded"
    ", as far as ScreenCaptureKit's documented application exclusion applies, including to "
    "windows it creates after the filter (unverified on a Mac); all other applications' windows on the display are "
    "included; cursor {}; BGRA buffers requested in sRGB; no audio"
)
UNKNOWN_OVERLAY_SCOPE = (
    "whole display, SCContentFilter(display:excludingWindows: []) with no window excluded; "
    "this app's ink overlay and palette panels request NSWindow.SharingType.none, which Apple calls legacy "
    "and says not to rely on to omit content, so whether kept frames contain them is unknown"
    "; this app's other windows are not excluded; cursor {}; BGRA buffers requested in sRGB; no audio"
)
RENDERING = (
    "sRGB (255, 59, 48); each stroke's own width in points, scaled like the point-to-pixel mapping; "
    "round caps and joins; antialiased; strokes in creation order; a one-point stroke as a dot"
)
BASE_LIMITS = [
    "strokes still being drawn at that time are not committed in any revision and are not drawn",
    "the raw frame excludes this app's windows by the configured filter; that it held for these pixels is unverified on a Mac",
    "ink changes are known when committed on the main thread; a change within moments of the pixels' time may be paired either way",
]
UNKNOWN_TIME_LIMIT = "the pixels' own time is unknown; the ink is paired at the callback's admission, which may be later than the pixels"
NO_DOCUMENT_LIMIT = "no ink document was open at that time, so nothing is drawn"
RAW_ALIAS_LIMIT = "no stroke is drawn, so the composed image is the raw original itself: one file, two references"
REOPENED_LIMIT = (
    "revision {} was committed before this document was last reopened; its commit time may be on "
    "another session's or boot's clock and is not given"
)
REFUSAL_REASONS = ["refused", "raw_unavailable", "render_failed", "write_failed",
                   "composed_cap_reached", "composed_store_stopped", "session_ended_before_composition"]
_float_text = r"([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)"
MAPPING_PATTERN = (
    r"^display-local points scaled by frame size / display size in points \("
    + _float_text + " × " + _float_text
    + r"\); contentRect and scaleFactor are not applied; unverified on a Mac(?![\s\S])"
)


def _integer(minimum=0):
    return {"type": "integer", "minimum": minimum, "maximum": MAX_SAFE_INTEGER}


_host = {"type": "number", "minimum": 0}
_text = {"type": "string", "minLength": 1, "maxLength": 16384}
_defs = {name: deepcopy(DESKTOP_SCHEMA["$defs"][name]) for name in (
    "Identifier", "UtcTimestamp", "SourceRef", "PngArtifactReference", "NativeWallUtc",
    "UInt64Decimal", "ReportedRect", "MacDisplayAtStart", "MacHostClock", "MacSampleFacts",
)}
_defs["MacDisplayAtStart"]["properties"]["scope"]["enum"].extend(
    scope.format(cursor) for scope in (APP_EXCLUDED_SCOPE, UNKNOWN_OVERLAY_SCOPE) for cursor in ("shown", "hidden")
)
_clock = _defs["MacHostClock"]["properties"]
_clock.update(source_seconds=_nullable(deepcopy(_host)), source_time_lead_tolerance_seconds=deepcopy(_host))
_defs["MacHostClock"]["required"] = list(_clock)
_defs["MacPng"] = _object({
    "artifact": {"$ref": "#/$defs/PngArtifactReference"}, "width": _integer(1), "height": _integer(1),
    "native_file": {"type": "string", "pattern": r"^(?:frames|composed)/[0-9]{8,16}\.png(?![\s\S])"},
    "encoding": {"const": ENCODING},
})
_defs["MacInkDocumentReference"] = _object({
    "created_in_session": {"$ref": "#/$defs/Identifier"},
    "file": {"type": "string", "maxLength": 512, "pattern": (
        r"^[A-Za-z0-9][A-Za-z0-9_.:-]*/ink/ink(?:\.conflict-[A-Za-z0-9-]+)?\.json(?![\s\S])")},
    "display_id": {"type": "integer", "minimum": 0, "maximum": 2**32 - 1},
})
_defs["MacPairedInk"] = _object({
    "pixels_host_seconds": deepcopy(_host), "pixels_time": {"enum": ["source_time", "callback_admission"]},
    "document": _nullable({"$ref": "#/$defs/MacInkDocumentReference"}),
    "revision": _nullable(_integer()), "revision_host_seconds": _nullable(deepcopy(_host)),
    "strokes": {"type": "array", "items": {"$ref": "#/$defs/Identifier"}, "uniqueItems": True},
    "mapping": {"type": "string", "maxLength": 1024, "pattern": MAPPING_PATTERN},
    "rendering": {"const": RENDERING},
    "limits": {"type": "array", "items": deepcopy(_text), "minItems": 3},
})
_defs["MacComposed"] = _object({
    "kind": {"const": "composed"}, "image": {"$ref": "#/$defs/MacPng"},
    "raw_sequence": _integer(1),
    "raw_file": {"type": "string", "pattern": r"^frames/[0-9]{8,16}\.png(?![\s\S])"},
    "raw_sha256": deepcopy(_defs["PngArtifactReference"]["properties"]["sha256"]),
    "raw_byte_length": deepcopy(_defs["PngArtifactReference"]["properties"]["byte_length"]),
    "ink": {"$ref": "#/$defs/MacPairedInk"}, "composed_host_seconds": deepcopy(_host),
})
_defs["MacNotComposed"] = _object({
    "kind": {"const": "not_composed"}, "callback_sequence": _integer(1), "host_seconds": deepcopy(_host),
    "reason": {"enum": REFUSAL_REASONS}, "detail": deepcopy(_text),
})
_defs["MacCompositionUnknown"] = _object({
    "kind": {"const": "unknown"}, "reason": {"const": "no_retained_outcome"},
})
_defs["MacRetainedProfile"] = _object({
    "kind": {"const": "macos_screencapturekit"}, "native_session_id": {"$ref": "#/$defs/Identifier"},
    "pixel_format": deepcopy(DESKTOP_SCHEMA["$defs"]["MacScreenCaptureKit"]["properties"]["pixel_format"]),
    "display_at_start": {"$ref": "#/$defs/MacDisplayAtStart"},
    "host_clock": {"$ref": "#/$defs/MacHostClock"}, "sample": {"$ref": "#/$defs/MacSampleFacts"},
})
_defs["MacRetainedFrame"] = _object({
    "contract_version": {"const": CONTRACT_VERSION}, "kind": {"const": "retained_capture_frame"},
    **{name: {"$ref": "#/$defs/Identifier"} for name in ("frame_id", "device_id", "session_id", "stream_id")},
    "source": {"$ref": "#/$defs/SourceRef"}, "callback_sequence": _integer(1),
    "captured_at": {"type": "null"}, "media_position": {"type": "null"},
    "pixel_orientation": {"type": "null"}, "capture_latency_ms": {"type": "null"},
    "raw": {"$ref": "#/$defs/MacPng"},
    "composition": {"anyOf": [{"$ref": f"#/$defs/{name}"}
                               for name in ("MacComposed", "MacNotComposed", "MacCompositionUnknown")]},
    "profile": {"$ref": "#/$defs/MacRetainedProfile"},
})
SCHEMA = {"$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "https://learning-companion.invalid/contracts/macos-frame/0.2.11",
          "$ref": "#/$defs/MacRetainedFrame", "$defs": _defs}


def validate(frame):
    """Check declared facts only. Native paths do not attest bytes or editable ink."""
    _check_safe_integers(frame)
    try:
        json.dumps(frame, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Mac frame must be finite UTF-8 JSON") from exc
    Draft202012Validator(SCHEMA, format_checker=FORMATS).validate(frame)
    profile, raw, result = frame["profile"], frame["raw"], frame["composition"]
    clock = profile["host_clock"]
    ticks, display_seconds = clock["display_time_ticks_decimal"], clock["display_time_seconds"]
    if (ticks is None) != (display_seconds is None):
        raise ValidationError("Display ticks and converted seconds must both be known or unknown")
    if ticks is not None and (int(ticks) == 0) != (display_seconds == 0):
        raise ValidationError("Zero display ticks and converted seconds must agree")
    if clock["callback_seconds"] < clock["session_started_seconds"]:
        raise ValidationError("Callback precedes its local session origin")
    # Match CaptureRecorder.sourceTime, including its recorded tolerance. PTS is
    # independent. The tick-to-seconds timebase itself is not in the native record.
    usable = (ticks is not None and int(ticks) != 0
              and display_seconds <= clock["callback_seconds"] + clock["source_time_lead_tolerance_seconds"])
    if clock["source_seconds"] != (display_seconds if usable else None):
        raise ValidationError("sourceHost must be the producer's validated display time, or unknown")
    # JSON Schema integers include 3.0/3e0. Format locally only after integer
    # validation; keep the caller's representation and never round fractions.
    filename = f"{int(frame['callback_sequence']):08d}.png"
    if raw["native_file"] != "frames/" + filename:
        raise ValidationError("Raw native file must name this callback sequence")
    if result["kind"] == "unknown":
        return
    if result["kind"] == "not_composed":
        if (result["callback_sequence"] != frame["callback_sequence"]
                or result["host_seconds"] < clock["callback_seconds"]):
            raise ValidationError("The refused outcome must belong to this already-admitted raw frame")
        return
    if profile["display_at_start"]["scope"] not in [APP_EXCLUDED_SCOPE.format(c) for c in ("shown", "hidden")]:
        raise ValidationError("Composition requires the exact configured-but-unverified app exclusion scope")
    if (result["raw_sequence"] != frame["callback_sequence"] or result["raw_file"] != raw["native_file"]
            or result["raw_sha256"] != raw["artifact"]["sha256"]
            or result["raw_byte_length"] != raw["artifact"]["byte_length"]):
        raise ValidationError("Composed raw relation must name this complete retained original")
    if result["composed_host_seconds"] < clock["callback_seconds"]:
        raise ValidationError("Composition processing cannot precede callback admission")
    ink, image = result["ink"], result["image"]
    source_known = clock["source_seconds"] is not None
    pixels_host = clock["source_seconds"] if source_known else clock["callback_seconds"]
    if ink["pixels_time"] != ("source_time" if source_known else "callback_admission") or ink["pixels_host_seconds"] != pixels_host:
        raise ValidationError("Paired ink must retain the actual source-time or callback-admission basis")
    limits = ink["limits"]
    if limits[:3] != BASE_LIMITS:
        raise ValidationError("The producer's ordered composition limitations must be retained")
    for limit, required in ((UNKNOWN_TIME_LIMIT, not source_known), (NO_DOCUMENT_LIMIT, ink["document"] is None),
                            (RAW_ALIAS_LIMIT, not ink["strokes"])):
        if (limit in limits) != required:
            raise ValidationError("Composition limits contradict the declared time, document or raw alias")
    if ink["document"] is None:
        if ink["revision"] is not None or ink["revision_host_seconds"] is not None or ink["strokes"]:
            raise ValidationError("No open document cannot have a revision, revision time or strokes")
    else:
        if ink["document"]["display_id"] != profile["display_at_start"]["display_id"] or ink["revision"] is None:
            raise ValidationError("An open document needs its revision and the paired display")
        if ink["revision"] == 0 and (ink["strokes"] or ink["revision_host_seconds"] is not None):
            raise ValidationError("Revision zero has no committed strokes or commit time")
    reopened = [limit for limit in limits if re.fullmatch(REOPENED_LIMIT.format(r"[0-9]+"), limit)]
    expected_reopened = ([REOPENED_LIMIT.format(int(ink["revision"]))]
                         if ink["revision"] not in (None, 0) and ink["revision_host_seconds"] is None else [])
    if reopened != expected_reopened:
        raise ValidationError("A prior-reopen revision must retain exactly its unknown-clock limitation")
    if ink["revision_host_seconds"] is not None and ink["revision_host_seconds"] > pixels_host:
        raise ValidationError("The paired revision cannot have been committed after the pairing time")
    bounds = profile["display_at_start"]["frame_points"]
    if bounds["width"] <= 0 or bounds["height"] <= 0:
        raise ValidationError("Composition requires a recorded positive display size")
    scales = re.fullmatch(MAPPING_PATTERN, ink["mapping"]).groups()
    for scale, dimension in zip(scales, ("width", "height"), strict=True):
        expected = raw[dimension] / bounds[dimension]
        if not math.isfinite(expected) or float(scale) != expected:
            raise ValidationError("Mapping must retain frame-size / startup-display-size scaling")
    if any(image[name] != raw[name] for name in ("width", "height")):
        raise ValidationError("Composition retains the raw image dimensions")
    expected_file = "composed/" + filename if ink["strokes"] else raw["native_file"]
    if image["native_file"] != expected_file:
        raise ValidationError("Empty ink aliases raw; nonempty ink has its own composed native file")
    # Archive identities and native paths are separate. Two native files may
    # contain identical bytes. One native file may have two archive references.
    if (image["artifact"]["artifact_id"] == raw["artifact"]["artifact_id"]
            or image["native_file"] == raw["native_file"]
            or image["artifact"]["sha256"] == raw["artifact"]["sha256"]):
        if any(image["artifact"][name] != raw["artifact"][name] for name in ("sha256", "byte_length", "media_type")):
            raise ValidationError("Aliased image identity or native file has contradictory PNG facts")


def validate_binding(batch, record_id, frame, source, bindings):
    """Bind an exact record/source/incarnation and every distinct image original.

    Separate editable-ink references remain untouched, not certified by this
    descriptor. Validation does not admit a producer or grant structured edits.
    """
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_process("Identifier", record_id)
    validate_display(source)
    if not isinstance(bindings, (list, tuple)):
        raise ValidationError("PNG original bindings must be an explicit list")
    images = [frame["raw"]]
    if frame["composition"]["kind"] == "composed":
        images.append(frame["composition"]["image"])
    expected = {picture["artifact"]["artifact_id"]: picture["artifact"] for picture in images}
    if len(bindings) != len(expected):
        raise ValidationError("Each distinct declared PNG needs exactly one original binding")
    originals = {}
    for binding in bindings:
        validate_original("OriginalArtifactBinding", binding)
        artifact_id = binding["artifact"]["artifact_id"]
        if binding["kind"] != "screen_image" or artifact_id in originals:
            raise ValidationError("PNG original bindings must be unique screen images")
        originals[artifact_id] = binding
    record = next((r for r in batch["records"] if r["record_id"] == record_id), None)
    if record is None or record["frame_id"] != frame["frame_id"]:
        raise ValidationError("Selected record must explicitly name this Mac frame")
    source_ref = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    if not frame["source"] == record["source"] == source_ref:
        raise ValidationError("Mac frame must bind the exact owner/source/version")
    for name in ("device_id", "session_id", "stream_id"):
        if not frame[name] == batch[name] == source[name]:
            raise ValidationError(f"Mac frame {name} differs from its capture incarnation")
    refs = {a["artifact_id"]: a for a in record["artifacts"]}
    for artifact_id, artifact in expected.items():
        original = originals.get(artifact_id)
        if (original is None or original["artifact"] != artifact or original["source"] != source_ref
                or refs.get(artifact_id) != artifact):
            raise ValidationError("Selected record and original binding must retain each complete PNG reference")
    if any(record[name] is not None for name in ("observed_at", "media_position", "clock")):
        raise ValidationError("Native host/display/sample clocks are not capture UTC, playhead or a Process clock")
