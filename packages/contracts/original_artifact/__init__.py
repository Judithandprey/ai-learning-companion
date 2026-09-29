"""Additive 0.2.2 original-byte boundary; no authorization, storage or live vision."""

import base64
import binascii
from copy import deepcopy
import hashlib
import json

from jsonschema import Draft202012Validator, ValidationError

from ..validation import FORMATS, _check_safe_integers
from ..process_v2 import validate_record_frame
from ..process_v2.validation import SCHEMA as CAPTURE_SCHEMA

CONTRACT_VERSION = "0.2.2"
# Engineering transport ceiling, not retention policy or accepted capture coverage.
MAX_ARTIFACT_BYTES = 32 * 1024 * 1024
MAX_BASE64_LENGTH = 4 * ((MAX_ARTIFACT_BYTES + 2) // 3)


def _object(properties):
    return {"type": "object", "additionalProperties": False,
            "properties": properties, "required": list(properties)}


_binding = {
    "contract_version": {"const": CONTRACT_VERSION},
    "source": {"$ref": "#/$defs/SourceRef"},
    "artifact": {"$ref": "#/$defs/ArtifactReference"},
    "kind": {"enum": ["screen_image", "editable_ink"]},
}
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/original-artifact/0.2.2",
    "$defs": {
        **{name: deepcopy(CAPTURE_SCHEMA["$defs"][name])
           for name in ("Identifier", "SourceRef", "ArtifactReference")},
        "OriginalArtifactBinding": _object(deepcopy(_binding)),
        "OriginalArtifactUpload": _object({**deepcopy(_binding),
            "data_base64": {"type": "string", "minLength": 4,
                            "maxLength": MAX_BASE64_LENGTH}}),
        "OriginalArtifactReceipt": _object({**deepcopy(_binding),
            "status": {"const": "bytes_committed"}}),
    },
}


def validate(name, payload):
    """Validate a closed shape; type labels do not prove valid/renderable strokes."""
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown original-artifact definition: {name}")
    _check_safe_integers(payload)
    try:
        json.dumps(payload, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Payload must be finite UTF-8 JSON") from exc
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"},
                         format_checker=FORMATS).validate(payload)
    if name.startswith("OriginalArtifact"):
        ref = payload["artifact"]
        allowed = {"screen_image": {"image/png", "image/jpeg"},
                   "editable_ink": {"application/json"}}
        if ref["media_type"] not in allowed[payload["kind"]]:
            raise ValidationError("Artifact kind and media type disagree")
        if not 1 <= ref["byte_length"] <= MAX_ARTIFACT_BYTES:
            raise ValidationError("Original bytes exceed the bounded transport size")


def validate_bytes(binding, data, *, user_id):
    """Return exact immutable bytes after identity/length/hash checks.

    The embedding service must authenticate user_id and recheck source/version
    access inside its transaction. This pure function cannot establish either.
    Image/ink codec validation and rendering are separate from byte integrity.
    """
    validate("OriginalArtifactBinding", binding)
    if type(user_id) is not str or not user_id or binding["source"]["user_id"] != user_id:
        raise ValidationError("Original source does not match trusted caller")
    if type(data) is not bytes:
        raise ValidationError("Original data must be immutable bytes")
    ref = binding["artifact"]
    if len(data) != ref["byte_length"] or hashlib.sha256(data).hexdigest() != ref["sha256"]:
        raise ValidationError("Original byte length or digest mismatch")
    return data


def decode_upload(payload, *, user_id):
    """Decode bounded, canonical base64 without fetching a URL or local path."""
    validate("OriginalArtifactUpload", payload)
    try:
        data = base64.b64decode(payload["data_base64"], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("Invalid base64 original data") from exc
    if base64.b64encode(data).decode("ascii") != payload["data_base64"]:
        raise ValidationError("Original base64 must use canonical encoding")
    binding = {key: payload[key] for key in _binding}
    return validate_bytes(binding, data, user_id=user_id)


def validate_receipt(binding, receipt):
    """Check exact byte/source receipt binding, never provider or live-vision ACK."""
    validate("OriginalArtifactBinding", binding)
    validate("OriginalArtifactReceipt", receipt)
    if any(receipt[key] != binding[key] for key in _binding):
        raise ValidationError("Receipt does not match the original source/artifact")


def validate_capture_frame(batch, record_id, frame, binding):
    """Bind a proposed screen frame to its process record and typed original.

    Pure metadata validation, not proof of capture, bytes, source access or live
    transmission. A service must resolve current stream authority and validate
    stored original bytes in the same transaction that commits the frame/record.
    Existing 0.1/0.2.0/0.2.2 wire shapes are unchanged.
    """
    validate("OriginalArtifactBinding", binding)
    validate_record_frame(batch, record_id, frame)
    if binding["kind"] != "screen_image" or frame["representation"] != "screen_capture":
        raise ValidationError("Production screen-frame ingress requires a screen image")
    record = next(r for r in batch["records"] if r["record_id"] == record_id)
    if binding["source"] != record["source"]:
        raise ValidationError("Screen original must belong to the exact recorded source version")
    artifact = next(a for a in record["artifacts"] if a["artifact_id"] == frame["artifact_id"])
    if binding["artifact"] != artifact:
        raise ValidationError("Screen original must match the complete immutable artifact reference")
