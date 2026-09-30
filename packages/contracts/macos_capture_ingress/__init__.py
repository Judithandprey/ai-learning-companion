"""Released additive 0.2.12 Mac retained-frame HTTP shapes; no activated route."""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from ..capture_ingress import (
    ERROR_CODES as INGRESS_ERROR_CODES, MAX_FRAMES, MAX_METADATA_BODY_BYTES,
    _json_bytes, _object,
)
from ..macos_frame import SCHEMA as MACOS_SCHEMA, validate as validate_macos
from ..process_v2 import validate as validate_process, validate_ack as validate_process_ack
from ..process_v2.validation import SCHEMA as PROCESS_SCHEMA
from ..validation import FORMATS

CONTRACT_VERSION = "0.2.12"
CAPABILITY = "process.macos-ingress.v0.2.12"
ERROR_CODES = deepcopy(INGRESS_ERROR_CODES)
REQUEST_TYPES = frozenset({"MacOSFrameBatchRequest"})

_defs = deepcopy(PROCESS_SCHEMA["$defs"])
for _name, _shape in MACOS_SCHEMA["$defs"].items():
    if _name in _defs and _defs[_name] != _shape:
        raise ValueError(f"Incompatible shared Mac frame definition: {_name}")
    _defs[_name] = deepcopy(_shape)
_defs["MacOSFrameBatchRequest"] = _object({
    "contract_version": {"const": CONTRACT_VERSION},
    "batch": {"$ref": "#/$defs/ProcessBatch"},
    "frames": {"type": "array", "minItems": 0, "maxItems": MAX_FRAMES,
               "items": {"$ref": "#/$defs/MacRetainedFrame"}},
})
_defs["MacOSIngressError"] = _object({
    "contract_version": {"const": CONTRACT_VERSION},
    "error": {"enum": [code for codes in ERROR_CODES.values() for code in codes]},
    "retryable": {"type": "boolean"},
})
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/macos-capture-ingress/0.2.12",
    "$ref": "#/$defs/MacOSFrameBatchRequest",
    "$defs": _defs,
}


def body_limit(name):
    if name not in REQUEST_TYPES:
        raise ValueError("Not a Mac ingress request type")
    return MAX_METADATA_BODY_BYTES


def _images(frame):
    images = [frame["raw"]]
    if frame["composition"]["kind"] == "composed":
        images.append(frame["composition"]["image"])
    return images


def validate(name, payload):
    """Check declared facts only; no stored source, original or permission is invented."""
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown Mac ingress definition: {name}")
    encoded = _json_bytes(payload)
    if name in REQUEST_TYPES and len(encoded) > body_limit(name):
        raise ValidationError("Mac ingress body exceeds its bounded transport size")
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"},
                         format_checker=FORMATS).validate(payload)
    if name == "MacOSFrameBatchRequest":
        batch, frames = payload["batch"], payload["frames"]
        validate_process("ProcessBatch", batch)
        identities, hashes, files = {}, {}, {}
        for frame in frames:
            validate_macos(frame)
            for image in _images(frame):
                artifact = image["artifact"]
                facts = (artifact["sha256"], artifact["byte_length"], artifact["media_type"],
                         image["width"], image["height"], image["encoding"])
                # A retained PNG can have multiple local filenames or archive
                # aliases. Local paths and composition context are not byte IDs.
                if identities.setdefault(artifact["artifact_id"], facts) != facts:
                    raise ValidationError("One image artifact cannot carry contradictory PNG facts across Mac frames")
                if hashes.setdefault(artifact["sha256"], facts[1:]) != facts[1:]:
                    raise ValidationError("The same PNG hash cannot carry contradictory image facts")
                native_file = (frame["profile"]["native_session_id"], image["native_file"])
                if files.setdefault(native_file, facts) != facts:
                    raise ValidationError("One native-session file cannot describe different PNG originals")
        by_id = {frame["frame_id"]: frame for frame in frames}
        named = {record["frame_id"] for record in batch["records"] if record["frame_id"] is not None}
        if len(by_id) != len(frames) or set(by_id) != named:
            raise ValidationError("Mac frames must uniquely exhaust the batch's named frame IDs")
        for record in batch["records"]:
            if record["frame_id"] is None:
                evidence = record["evidence"]
                if (evidence["kind"] != "coverage" or evidence["coverage"] == "observed_samples"
                        or record["artifacts"] or any(record[key] is not None
                            for key in ("observed_at", "media_position", "clock"))):
                    raise ValidationError("Frameless Mac records require explicit partial/unobserved/unknown coverage without artifacts or invented clocks")
                continue
            frame = by_id[record["frame_id"]]
            # Backend must repeat macos_frame.validate_binding with the STORED
            # display descriptor and every distinct original, under its actor lock.
            if frame["source"] != record["source"]:
                raise ValidationError("Mac frame must match the exact record owner/source/version")
            if any(frame[key] != batch[key] for key in ("device_id", "session_id", "stream_id")):
                raise ValidationError("Mac frame must match the batch capture incarnation")
            if any(image["artifact"] not in record["artifacts"] for image in _images(frame)):
                raise ValidationError("Record must retain every complete raw/composed Mac PNG reference")
            if any(record[key] is not None for key in ("observed_at", "media_position", "clock")):
                raise ValidationError("Native host/display/sample clocks are not capture UTC, playhead or a Process clock")
    elif name == "MacRetainedFrame":
        validate_macos(payload)
    elif name in PROCESS_SCHEMA["$defs"]:
        validate_process(name, payload)
    elif name == "MacOSIngressError" and payload["retryable"] and payload["error"] not in {"unavailable", "dependency_missing"}:
        raise ValidationError("This error cannot authorize automatic retry")


def validate_frame_batch(payload, *, user_id):
    """The caller supplies an authenticated owner, never a request identity grant."""
    validate("MacOSFrameBatchRequest", payload)
    validate("Identifier", user_id)
    if any(record["source"]["user_id"] != user_id for record in payload["batch"]["records"]):
        raise ValidationError("Every process source must match the trusted caller")


def validate_ack(batch, ack, *, user_id, verified_artifacts=frozenset()):
    """Check correspondence and verified-only receipts; no durable commit proof."""
    validate_process_ack(batch, ack, user_id=user_id, verified_artifacts=verified_artifacts)
    if any(artifact["status"] != "verified" for record in ack["acknowledged"]
           for artifact in record["artifacts"]):
        raise ValidationError("Mac ingress success requires every original verified")


def canonical_request(name, payload):
    """Whole ordered envelope equality; no frame-map or native-path substitution."""
    body_limit(name)
    validate(name, payload)
    return _json_bytes(payload)


def decode_request(name, data):
    """Bounded strict JSON reader; HTTP status precedence belongs to a future adapter."""
    limit = body_limit(name)
    if type(data) is not bytes:
        raise ValidationError("Mac ingress JSON must be immutable UTF-8 bytes")
    if len(data) > limit:
        raise ValidationError("Mac ingress body exceeds its bounded transport size")

    # Keep the established strict-reader behavior without changing released
    # decoders that dispatch to their own closed contract families.
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
