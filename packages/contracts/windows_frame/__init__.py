"""Additive Windows retained sample metadata; no transport or acquisition grant."""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from ..capture_frame import SCHEMA as RAW_SCHEMA, _object
from ..display_source import validate as validate_display
from ..original_artifact import validate as validate_original
from ..process_v2 import validate as validate_process
from ..validation import FORMATS, MAX_SAFE_INTEGER, _check_safe_integers

CONTRACT_VERSION = "0.2.9"
PRODUCER_COMMIT = "04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68"


def _integer(minimum=0):
    return {"type": "integer", "minimum": minimum, "maximum": MAX_SAFE_INTEGER}


def _nullable(shape):
    return {"anyOf": [shape, {"type": "null"}]}


_defs = {name: deepcopy(RAW_SCHEMA["$defs"][name]) for name in (
    "Identifier", "UtcTimestamp", "SourceRef", "PngArtifactReference",
)}
_defs["Sha256"] = deepcopy(_defs["PngArtifactReference"]["properties"]["sha256"])
_defs["LocalWallUtc"] = {**deepcopy(_defs["UtcTimestamp"]), "pattern": (
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,3})?Z(?![\s\S])"
)}
_number = {"type": "number", "minimum": -MAX_SAFE_INTEGER, "maximum": MAX_SAFE_INTEGER}
_positive = {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_SAFE_INTEGER}
_label = {"type": "string", "minLength": 1, "maxLength": 1024}
_defs["DisplayAtStart"] = _object({
    "kind": {"const": "display"},
    # These are native labels, not archive SourceRef or identity authority.
    **{name: deepcopy(_label) for name in ("source_id", "display_id")},
    "label": {"type": "string", "maxLength": 1024},
    "bounds": _object({"x": deepcopy(_number), "y": deepcopy(_number),
                       "width": deepcopy(_positive), "height": deepcopy(_positive)}),
    "scale_factor": deepcopy(_positive),
})
_defs["WindowsSample"] = _object({
    "sample_seq": _integer(1), "frame_seq": _integer(1),
    "reason": {"enum": ["first", "ink", "changed", "heartbeat", "deferred"]},
    "deferred_samples_not_retained": {"type": "array", "items": _integer(1), "uniqueItems": True},
    "sampled_at": {"$ref": "#/$defs/LocalWallUtc"},
    "taken_at": {"$ref": "#/$defs/LocalWallUtc"},
    "monotonic_ms": _integer(),
    "state": {"enum": ["fresh", "no_new_frame", "gap"]},
    # Older retained manifests omit this source observation; that maps to null.
    "gap_ms": _nullable(_integer(1)),
    "presented_frames": _integer(), "stream_presented_frames": _integer(),
    "presentation_ms": _nullable(_integer()), "frame_age_ms": _nullable(_integer()),
    "change_from_previous_sample": _nullable({"type": "number", "minimum": 0, "maximum": 1}),
})
_defs["WindowsElectron"] = _object({
    "kind": {"const": "windows_electron"},
    "retention_format": {"const": "lc-desktop-capture-retention/v1"},
    "capture_session": deepcopy(_label),
    "started_at": {"$ref": "#/$defs/LocalWallUtc"},
    "source_at_start": {"$ref": "#/$defs/DisplayAtStart"},
    "sample": {"$ref": "#/$defs/WindowsSample"},
})
_defs["WindowsPng"] = _object({
    "artifact": {"$ref": "#/$defs/PngArtifactReference"},
    "width": _integer(1), "height": _integer(1),
    "pixels_sha256": {"$ref": "#/$defs/Sha256"},
    "native_file": {"type": "string", "pattern": r"^frames/[0-9a-f]{64}\.png(?![\s\S])"},
})
_defs["WindowsComposition"] = _object({
    "image": {"$ref": "#/$defs/WindowsPng"},
    "ink_session": deepcopy(_label), "ink_revision": _integer(), "visible_strokes": _integer(),
    "ink_marks": _object({name: _integer() for name in (
        "verified", "changed", "unknown", "following_content")}),
    "transformation": {"type": "string", "minLength": 1, "maxLength": 4096},
})
_defs["WindowsFrame"] = _object({
    "contract_version": {"const": CONTRACT_VERSION}, "kind": {"const": "retained_capture_frame"},
    **{name: {"$ref": "#/$defs/Identifier"} for name in ("frame_id", "device_id", "session_id", "stream_id")},
    "source": {"$ref": "#/$defs/SourceRef"},
    "captured_at": {"type": "null"}, "media_position": {"type": "null"},
    "capture_latency_ms": {"type": "null"},
    "raw": {"$ref": "#/$defs/WindowsPng"},
    "composed": _nullable({"$ref": "#/$defs/WindowsComposition"}),
    "profile": {"$ref": "#/$defs/WindowsElectron"},
})
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/windows-frame/0.2.9",
    "$ref": "#/$defs/WindowsFrame", "$defs": _defs,
}


def validate(frame):
    """Validate declared retained facts, not files, pixel digests or live status."""
    _check_safe_integers(frame)
    try:
        json.dumps(frame, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Windows frame must be finite UTF-8 JSON") from exc
    Draft202012Validator(SCHEMA, format_checker=FORMATS).validate(frame)
    sample = frame["profile"]["sample"]
    if sample["frame_seq"] > sample["sample_seq"]:
        raise ValidationError("Held frame cannot originate from a later sample")
    deferred = sample["deferred_samples_not_retained"]
    if deferred != sorted(deferred) or any(seq >= sample["sample_seq"] for seq in deferred):
        raise ValidationError("Deferred sample ordinals must precede this sample in original order")
    if sample["presented_frames"] > sample["stream_presented_frames"]:
        raise ValidationError("Held presentation count cannot exceed the later stream observation")
    unknown = sample["presented_frames"] == 0
    if any((sample[name] is None) != unknown for name in ("presentation_ms", "frame_age_ms")):
        raise ValidationError("Presentation time and age are unknown before the held image's first callback")
    if not unknown and sample["presentation_ms"] > sample["monotonic_ms"]:
        raise ValidationError("Held presentation cannot follow the sampling observation")
    if sample["gap_ms"] is not None and sample["state"] != "gap":
        raise ValidationError("A known gap duration belongs only to a gap sample")
    # Age uses a later performance.now() and separate rounding. Wall clocks may
    # jump. Neither exact subtraction nor wall-clock ordering is established.
    images = [frame["raw"]]
    if frame["composed"] is not None:
        composed = frame["composed"]
        if sum(composed["ink_marks"].values()) != composed["visible_strokes"]:
            raise ValidationError("Ink marks must account for the reported visible strokes")
        if any(composed["image"][name] != frame["raw"][name] for name in ("width", "height")):
            raise ValidationError("The composition retains the raw image dimensions")
        images.append(composed["image"])
    identities, files = {}, {}
    for picture in images:
        artifact = picture["artifact"]
        if picture["native_file"] != "frames/" + artifact["sha256"] + ".png":
            raise ValidationError("Native filename and PNG file digest must agree, not the RGBA digest")
        prior = identities.setdefault(artifact["artifact_id"], picture)
        if prior != picture:
            raise ValidationError("One artifact identity cannot describe different originals")
        facts = (artifact["byte_length"], picture["width"], picture["height"], picture["pixels_sha256"])
        if files.setdefault(picture["native_file"], facts) != facts:
            raise ValidationError("The same native PNG file cannot carry contradictory image facts")


def validate_binding(batch, record_id, frame, source, bindings):
    """Bind the selected record and every declared PNG; preserve all inputs.

    `bindings` contains one OriginalArtifactBinding per distinct image artifact.
    Separate editable-ink references remain untouched and are not attested by
    composed pixels, ink-session labels or this metadata-only validator.
    """
    validate(frame)
    validate_process("ProcessBatch", batch)
    validate_process("Identifier", record_id)
    validate_display(source)
    if not isinstance(bindings, (list, tuple)):
        raise ValidationError("PNG original bindings must be an explicit list")
    images = [frame["raw"]] + ([frame["composed"]["image"]] if frame["composed"] is not None else [])
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
        raise ValidationError("Selected record must explicitly name this Windows frame")
    source_ref = {name: source[name] for name in ("user_id", "source_id", "source_version")}
    if not frame["source"] == record["source"] == source_ref:
        raise ValidationError("Windows frame must bind the exact owner/source/version")
    for name in ("device_id", "session_id", "stream_id"):
        if not frame[name] == batch[name] == source[name]:
            raise ValidationError(f"Windows frame {name} differs from its capture incarnation")
    refs = {a["artifact_id"]: a for a in record["artifacts"]}
    for artifact_id, artifact in expected.items():
        original = originals.get(artifact_id)
        if (original is None or original["artifact"] != artifact or original["source"] != source_ref
                or refs.get(artifact_id) != artifact):
            raise ValidationError("Selected record and original binding must retain each complete PNG reference")
    if any(record[name] is not None for name in ("observed_at", "media_position", "clock")):
        raise ValidationError("Local Windows wall/presentation observations are not capture UTC, playhead or a Process clock")
