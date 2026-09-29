"""Wire validation only: caller authority and durable commit remain service duties."""

import base64
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from ..validation import (FORMATS, SCHEMA as LEGACY_SCHEMA, _check_safe_integers,
                          validate as legacy_validate, validate_selection_frame)

CONTRACT_VERSION = "document-preview.0.1.0"
MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
MAX_FRAME_BYTES = 1024 * 1024
SCHEMA = json.loads(Path(__file__).with_name("schema.json").read_text())


def _import_legacy(name):
    if name in SCHEMA["$defs"]:
        return
    definition = deepcopy(LEGACY_SCHEMA["$defs"][name])
    SCHEMA["$defs"][name] = definition
    pending = [definition]
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            if "$ref" in item:
                _import_legacy(item["$ref"].removeprefix("#/$defs/"))
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)


for _name in SCHEMA.pop("x-legacy-definitions"):
    _import_legacy(_name)


def decode_utf8(value, limit):
    """Strict canonical base64, exact UTF-8 (including BOM), no JSONB-illegal NUL."""
    try:
        raw = base64.b64decode(value, validate=True)
        text = raw.decode("utf-8")
        if len(raw) > limit or base64.b64encode(raw).decode("ascii") != value or "\x00" in text:
            raise ValueError()
        return raw, text
    except (ValueError, TypeError, UnicodeError) as exc:
        raise ValidationError("Expected bounded canonical base64 of UTF-8 without NUL") from exc


def _unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("Duplicate JSON key")
        result[name] = value
    return result


def _frame_context(payload):
    frame = payload["frame"]
    selection = payload["bridge_request"]["selection"]
    validate_selection_frame(selection, frame)
    request = payload["request"]
    if (request["user_id"] != frame["user_id"] or request["selection_id"] != selection["id"]
            or frame["representation"] != "dom_snapshot" or frame["media_position"] is not None):
        raise ValidationError("Preview requires an explicitly bound document DOM selection")
    raw, text = decode_utf8(payload["frame_bytes_base64"], MAX_FRAME_BYTES)
    if hashlib.sha256(raw).hexdigest() != frame["content_hash"]:
        raise ValidationError("Frame bytes do not match their hash")
    try:
        dom = json.loads(text, object_pairs_hook=_unique_object)
    except (ValueError, RecursionError) as exc:
        raise ValidationError("DOM context must be finite JSON") from exc
    validate("DomSnapshot", dom)
    if (dom["captured_at"] != frame["captured_at"]
            or dom["selection"]["text"] != selection["selected_text"]
            or max(1, math.floor(dom["viewport"]["width"] + .5)) != frame["width"]
            or max(1, math.floor(dom["viewport"]["height"] + .5)) != frame["height"]):
        raise ValidationError("DOM bytes and frame/selection disagree")
    # Match Web normalizeRect: clip to viewport and quantize to 1e-9. For a
    # lasso the supplied rectangle is its bounding rectangle; polygon semantics
    # remain those of the unchanged v1 Selection validator.
    def unit(value):
        return math.floor(min(1, max(0, value)) * 1e9 + .5) / 1e9
    rect, viewport = dom["selection"]["rect"], dom["viewport"]
    x, y = unit(rect["x"] / viewport["width"]), unit(rect["y"] / viewport["height"])
    expected = {"x": x, "y": y,
                "width": unit(unit((rect["x"] + rect["width"]) / viewport["width"]) - x),
                "height": unit(unit((rect["y"] + rect["height"]) / viewport["height"]) - y)}
    if any(abs(expected[k] - selection["bbox"][k]) > 1e-12 for k in expected):
        raise ValidationError("DOM rectangle and normalized selection disagree")


def _saved_context(payload):
    """One source/ASK/user-original note; provider absence cannot hide AI output."""
    source, frame = payload["source"], payload["frame"]
    event, note = payload["observation"], payload["note"]
    request, selection = payload["request"], payload["bridge_request"]["selection"]
    context = {k: frame[k] for k in ("source_id", "source_version", "frame_id", "media_position")}
    context["source_event_ids"] = [event["event_id"]]
    if (source["type"] != "document" or source["provenance"]["origin"] != "user_authorized"
            or source["provenance"]["consent_scope"] != "learning"
            or any(source[k] != frame[k] for k in ("user_id", "source_id", "source_version", "source_timezone"))
            or any(event[k] != frame[k] for k in ("user_id", "source_id", "source_version", "frame_id",
                                                "device_id", "session_id", "source_timezone", "media_position"))
            or event["captured_at"] != selection["created_at"]
            or event["actor"] != "user" or event["text"] != payload["request_text"]
            or event["correction_of"] is not None or event["confidence"] != 1 or event["gap_flags"] != []
            or request["project_id"] != source["project_id"]
            or note["user_id"] != source["user_id"] or note["project_id"] != source["project_id"]
            or note["authorship"] != "user" or note["kind"] != "ai" or note["ink_blob_id"] is not None
            or note["revision"] != 1 or note["base_revision"] != 0 or note["concept_ids"] != []
            or note["source_event_ids"] != [event["event_id"]] or note["context_segments"] != [context]
            or len(note["blocks"]) != 1 or note["blocks"][0]["layer"] != "user_original"
            or note["blocks"][0]["format"] != "text" or note["blocks"][0]["content"] != payload["user_note"]):
        raise ValidationError("Saved preview must bind the exact source, ASK and user-original note")


def validate(name, payload):
    if name not in SCHEMA["$defs"]:
        raise ValueError("Unknown document preview definition")
    _check_safe_integers(payload)
    try:
        encoded = json.dumps(payload, allow_nan=False, ensure_ascii=False).encode("utf-8")
        if b"\\u0000" in encoded:
            # JSONB cannot retain NUL. Reject explicitly instead of silently dropping it.
            def has_nul(item):
                if isinstance(item, str):
                    return "\x00" in item
                if isinstance(item, dict):
                    return any(has_nul(k) or has_nul(v) for k, v in item.items())
                return isinstance(item, list) and any(has_nul(v) for v in item)
            if has_nul(payload):
                raise ValueError()
    except (TypeError, ValueError, UnicodeError, RecursionError) as exc:
        raise ValidationError("Expected finite UTF-8 JSON without NUL") from exc
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"}, format_checker=FORMATS).validate(payload)
    if name in LEGACY_SCHEMA["$defs"]:
        legacy_validate(name, payload)
    for field, definition in (("source", "SourceSnapshot"), ("frame", "Frame"),
                              ("bridge_request", "BridgeRequest"), ("request", "ExplanationRequest"),
                              ("observation", "Observation"), ("note", "NoteRevision")):
        if isinstance(payload, dict) and field in payload:
            legacy_validate(definition, payload[field])
    if name == "DocumentImport":
        raw, _ = decode_utf8(payload["content_base64"], MAX_DOCUMENT_BYTES)
        if hashlib.sha256(raw).hexdigest() != payload["sha256"]:
            raise ValidationError("Document bytes do not match their hash")
    if name in {"DocumentSave", "SavedPreview"}:
        _frame_context(payload)
    if name == "SavedPreview":
        _saved_context(payload)
        raw, text = decode_utf8(payload["content_base64"], MAX_DOCUMENT_BYTES)
        if text != payload["source"]["text"] or hashlib.sha256(raw).hexdigest() != payload["source"]["content_hash"]:
            raise ValidationError("Saved source bytes disagree")
