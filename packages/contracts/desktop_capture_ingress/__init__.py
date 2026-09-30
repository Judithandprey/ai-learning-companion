"""Additive 0.2.8 desktop-frame HTTP shapes and pure checks; no activated route."""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from ..desktop_frame import SCHEMA as DESKTOP_SCHEMA, validate as validate_desktop
from ..capture_ingress import (
    ERROR_CODES as INGRESS_ERROR_CODES, MAX_FRAMES, MAX_METADATA_BODY_BYTES,
    _json_bytes, _object,
)
from ..process_v2 import validate as validate_process, validate_ack as validate_process_ack
from ..process_v2.validation import SCHEMA as PROCESS_SCHEMA
from ..validation import FORMATS

CONTRACT_VERSION = "0.2.8"
CAPABILITY = "process.desktop-ingress.v0.2.8"
ERROR_CODES = deepcopy(INGRESS_ERROR_CODES)
REQUEST_TYPES = frozenset({"DesktopFrameBatchRequest"})

_defs = deepcopy(PROCESS_SCHEMA["$defs"])
for _name, _shape in DESKTOP_SCHEMA["$defs"].items():
    if _name in _defs and _defs[_name] != _shape:
        raise ValueError(f"Incompatible shared desktop-frame definition: {_name}")
    _defs[_name] = deepcopy(_shape)
_defs["DesktopFrameBatchRequest"] = _object({
    "contract_version": {"const": CONTRACT_VERSION},
    "batch": {"$ref": "#/$defs/ProcessBatch"},
    "frames": {"type": "array", "minItems": 0, "maxItems": MAX_FRAMES,
               "items": {"$ref": "#/$defs/DesktopFrame"}},
})
_defs["DesktopIngressError"] = _object({
    "contract_version": {"const": CONTRACT_VERSION},
    "error": {"enum": [code for codes in ERROR_CODES.values() for code in codes]},
    "retryable": {"type": "boolean"},
})
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/desktop-capture-ingress/0.2.8",
    "$ref": "#/$defs/DesktopFrameBatchRequest",
    "$defs": _defs,
}


def body_limit(name):
    if name not in REQUEST_TYPES:
        raise ValueError("Not a desktop-ingress request type")
    return MAX_METADATA_BODY_BYTES


def validate(name, payload):
    """Check declared membership only; never manufacture stored display facts."""
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown desktop-ingress definition: {name}")
    encoded = _json_bytes(payload)
    if name in REQUEST_TYPES and len(encoded) > body_limit(name):
        raise ValidationError("Desktop ingress body exceeds its bounded transport size")
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"},
                         format_checker=FORMATS).validate(payload)
    if name == "DesktopFrameBatchRequest":
        batch, frames = payload["batch"], payload["frames"]
        # Full causality, gaps and immutable artifact conflicts are checked once.
        validate_process("ProcessBatch", batch)
        for frame in frames:
            validate_desktop(frame)  # Includes native clock/estimate relationships.
        by_id = {frame["frame_id"]: frame for frame in frames}
        named = {r["frame_id"] for r in batch["records"] if r["frame_id"] is not None}
        if len(by_id) != len(frames) or set(by_id) != named:
            raise ValidationError("Desktop frames must uniquely exhaust the batch's named frame IDs")
        for record in batch["records"]:
            if record["frame_id"] is None:
                # A source can be unobservable before any pixels arrive. Preserve
                # that fact without inventing a frame, inferred action or original.
                evidence = record["evidence"]
                if (evidence["kind"] != "coverage" or evidence["coverage"] == "observed_samples"
                        or record["artifacts"] or any(record[key] is not None
                            for key in ("observed_at", "media_position", "clock"))):
                    raise ValidationError("Frameless desktop records must be explicit unknown/partial/unobserved coverage without artifacts or invented clocks")
                continue
            frame = by_id[record["frame_id"]]
            # These are only the local comparisons from 0.2.7 validate_binding.
            # Backend must supply the retained display and original to that helper.
            if frame["source"] != record["source"]:
                raise ValidationError("Desktop frame must match the exact record source")
            if any(frame[key] != batch[key] for key in ("device_id", "session_id", "stream_id")):
                raise ValidationError("Desktop frame must match the batch capture incarnation")
            if frame["artifact"] not in record["artifacts"]:
                raise ValidationError("Record must retain the complete desktop PNG reference")
            if record["observed_at"] is not None or record["media_position"] is not None:
                raise ValidationError("Native estimates and sample PTS are not observed UTC or course time")
            if record["clock"] is not None:
                raise ValidationError("This desktop profile supplies native host facts, not a Process CaptureClock")
    elif name == "DesktopFrame":
        validate_desktop(payload)
    elif name in PROCESS_SCHEMA["$defs"]:
        validate_process(name, payload)
    elif name == "DesktopIngressError" and payload["retryable"] and payload["error"] not in {"unavailable", "dependency_missing"}:
        raise ValidationError("This error cannot authorize automatic retry")


def validate_frame_batch(payload, *, user_id):
    """The caller supplies an authenticated owner, not a request identity."""
    validate("DesktopFrameBatchRequest", payload)
    validate("Identifier", user_id)
    if any(record["source"]["user_id"] != user_id for record in payload["batch"]["records"]):
        raise ValidationError("Every process source must match the trusted caller")


def validate_ack(batch, ack, *, user_id, verified_artifacts=frozenset()):
    """Check correspondence and verified-only receipts; no durable commit proof."""
    validate_process_ack(batch, ack, user_id=user_id, verified_artifacts=verified_artifacts)
    if any(artifact["status"] != "verified" for record in ack["acknowledged"]
           for artifact in record["artifacts"]):
        raise ValidationError("Desktop ingress success requires every original verified")


def canonical_request(name, payload):
    """Whole ordered HTTP envelope equality; no frame-map replay substitution."""
    body_limit(name)
    validate(name, payload)
    return _json_bytes(payload)


def decode_request(name, data):
    """Bounded strict JSON reader; HTTP status precedence belongs to the adapter."""
    limit = body_limit(name)
    if type(data) is not bytes:
        raise ValidationError("Desktop ingress JSON must be immutable UTF-8 bytes")
    if len(data) > limit:
        raise ValidationError("Desktop ingress body exceeds its bounded transport size")

    # The released 0.2.4 decoder owns its validator; retain its small strict-reader
    # rules here without changing that frozen family or importing an HTTP service.
    def members(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON member")
            result[key] = value
        return result

    def nonfinite(_):
        raise ValueError("Non-finite JSON number")

    try:
        payload = json.loads(data.decode("utf-8"), object_pairs_hook=members, parse_constant=nonfinite)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValidationError("Invalid finite UTF-8 JSON") from exc
    validate(name, payload)
    return payload
