"""Additive capture transport shapes and pure checks; no HTTP or authority grant."""

from copy import deepcopy
import json

from jsonschema import Draft202012Validator, ValidationError

from .. import original_artifact
from ..display_source import SCHEMA as DISPLAY_SCHEMA
from ..process_v2 import validate as validate_process
from ..process_v2.validation import SCHEMA as PROCESS_SCHEMA
from ..validation import FORMATS, SCHEMA as LEGACY_SCHEMA, _check_safe_integers

CONTRACT_VERSION = "0.2.4"
CAPABILITY = "process.ingress.v0.2.4"
# Engineering transport limits, never retention quotas or permission to truncate.
MAX_METADATA_BODY_BYTES = 4 * 1024 * 1024
MAX_UPLOAD_BODY_BYTES = original_artifact.MAX_BASE64_LENGTH + MAX_METADATA_BODY_BYTES
MAX_FRAMES = PROCESS_SCHEMA["$defs"]["ProcessBatch"]["properties"]["records"]["maxItems"]
ERROR_CODES = {
    "400": ["invalid_json"],
    "401": ["unauthenticated"],
    "403": ["forbidden", "capability_required"],
    "404": ["not_found"],
    "409": ["source_identity_conflict", "record_conflict", "idempotency_conflict",
            "dependency_missing", "stale_scope", "capture_stopped", "unsupported_source"],
    "413": ["payload_too_large"],
    "415": ["unsupported_media_type"],
    "422": ["unsupported_version", "invalid_request"],
    "503": ["unavailable"],
}
REQUEST_TYPES = frozenset({"DisplaySourceRegistration", "OriginalArtifactUpload", "FrameBatchRequest"})


def _object(properties):
    return {"type": "object", "additionalProperties": False,
            "properties": properties, "required": list(properties)}


SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://learning-companion.invalid/contracts/capture-ingress/0.2.4",
    "$defs": {
        **deepcopy(PROCESS_SCHEMA["$defs"]),
        "Frame": deepcopy(LEGACY_SCHEMA["$defs"]["Frame"]),
        **{name: deepcopy(shape) for name, shape in original_artifact.SCHEMA["$defs"].items()
           if name.startswith("OriginalArtifact")},
        "DisplaySourceSnapshot": deepcopy(DISPLAY_SCHEMA["$defs"]["DisplaySourceSnapshot"]),
        "SourceVersion": deepcopy(PROCESS_SCHEMA["$defs"]["SourceRef"]["properties"]["source_version"]),
        "DisplaySourceRegistration": _object({
            "contract_version": {"const": CONTRACT_VERSION},
            "source_id": {"$ref": "#/$defs/Identifier"},
            "stream_id": {"$ref": "#/$defs/Identifier"},
            "project_id": {"anyOf": [{"$ref": "#/$defs/Identifier"}, {"type": "null"}]},
            "source_timezone": {"type": "string", "format": "iana-timezone"},
        }),
        "FrameBatchRequest": _object({
            "contract_version": {"const": CONTRACT_VERSION},
            "batch": {"$ref": "#/$defs/ProcessBatch"},
            "frames": {"type": "array", "minItems": 1, "maxItems": MAX_FRAMES,
                       "items": {"$ref": "#/$defs/Frame"}},
        }),
        "IngressError": _object({
            "contract_version": {"const": CONTRACT_VERSION},
            "error": {"enum": [code for codes in ERROR_CODES.values() for code in codes]},
            "retryable": {"type": "boolean"},
        }),
    },
}


def _json_bytes(payload):
    _check_safe_integers(payload)
    try:
        return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Payload must be finite UTF-8 JSON") from exc


def body_limit(name):
    if name not in REQUEST_TYPES:
        raise ValueError("Not an ingress request type")
    return MAX_UPLOAD_BODY_BYTES if name == "OriginalArtifactUpload" else MAX_METADATA_BODY_BYTES


def validate(name, payload):
    """Check local shapes/bindings, never authenticated access or durable bytes."""
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown capture-ingress definition: {name}")
    encoded = _json_bytes(payload)
    if name in REQUEST_TYPES and len(encoded) > body_limit(name):
        raise ValidationError("Ingress body exceeds its bounded transport size")
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"},
                         format_checker=FORMATS).validate(payload)
    if name == "FrameBatchRequest":
        batch, frames = payload["batch"], payload["frames"]
        validate_process("ProcessBatch", batch)
        by_id = {frame["frame_id"]: frame for frame in frames}
        named = {r["frame_id"] for r in batch["records"] if r["frame_id"] is not None}
        if len(by_id) != len(frames) or set(by_id) != named:
            raise ValidationError("Frames must uniquely exhaust the batch's named frame IDs")
        for record in batch["records"]:
            if record["frame_id"] is None:
                continue  # Whether this source family permits it is transaction-current state.
            frame = by_id[record["frame_id"]]
            artifact = next((a for a in record["artifacts"]
                             if a["artifact_id"] == frame["artifact_id"]), None)
            if artifact is None:
                raise ValidationError("Frame original must have an exact record artifact reference")
            proposed = {"contract_version": original_artifact.CONTRACT_VERSION,
                        "source": record["source"], "artifact": artifact, "kind": "screen_image"}
            # Full batch causality, gaps and artifact consistency were checked
            # above. Bind this member without revalidating all 100 peers again.
            member_batch = {**batch, "records": [record]}
            original_artifact.validate_capture_frame(member_batch, record["record_id"], frame, proposed)
    elif name in PROCESS_SCHEMA["$defs"]:
        validate_process(name, payload)
    elif name == "OriginalArtifactUpload":
        # This uses the DECLARED owner for byte checks, not as authentication.
        original_artifact.decode_upload(payload, user_id=payload["source"]["user_id"])
    elif name.startswith("OriginalArtifact"):
        original_artifact.validate(name, payload)
    elif name == "IngressError" and payload["retryable"] and payload["error"] not in {"unavailable", "dependency_missing"}:
        raise ValidationError("This error cannot authorize automatic retry")


def validate_registration(payload, *, source_id):
    validate("DisplaySourceRegistration", payload)
    validate("Identifier", source_id)
    if payload["source_id"] != source_id:
        raise ValidationError("Source path and registration body differ")


def validate_upload(payload, *, artifact_id, user_id):
    """Return exact bytes after path/owner checks; caller supplies trusted owner."""
    validate("Identifier", artifact_id)
    validate("Identifier", user_id)
    data = original_artifact.decode_upload(payload, user_id=user_id)
    if payload["artifact"]["artifact_id"] != artifact_id:
        raise ValidationError("Artifact path and upload body differ")
    return data


def validate_original_read(payload, *, source_id, source_version, artifact_id, user_id):
    """Check an original GET response against every requested identity."""
    validate("Identifier", source_id)
    validate("SourceVersion", source_version)
    data = validate_upload(payload, artifact_id=artifact_id, user_id=user_id)
    if payload["source"] != {"user_id": user_id, "source_id": source_id, "source_version": source_version}:
        raise ValidationError("Original response differs from its requested source version")
    return data


def validate_frame_batch(payload, *, user_id):
    validate("FrameBatchRequest", payload)
    validate("Identifier", user_id)
    if any(record["source"]["user_id"] != user_id for record in payload["batch"]["records"]):
        raise ValidationError("Every process source must match the trusted caller")


def canonical_request(name, payload):
    """Whole HTTP body equality bytes, including frame order and outer version.

    Service keys additionally bind owner/method/full path/Idempotency-Key. Do not
    use this as a source of authority or as a replacement for stored originals.
    """
    body_limit(name)
    validate(name, payload)
    return _json_bytes(payload)


def decode_request(name, data):
    """Bounded strict JSON reader, not an HTTP handler or error-status mapper."""
    limit = body_limit(name)
    if type(data) is not bytes:
        raise ValidationError("Ingress JSON must be immutable UTF-8 bytes")
    if len(data) > limit:
        raise ValidationError("Ingress body exceeds its bounded transport size")

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
