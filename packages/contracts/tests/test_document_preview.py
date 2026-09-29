"""Finite wire checks, not browser, real database or provider acceptance."""

import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError
from openapi_spec_validator import validate as validate_openapi
import pytest

from packages.contracts.document_preview import validate, decode_utf8, MAX_DOCUMENT_BYTES
from packages.contracts.document_preview.validation import SCHEMA
from packages.contracts.document_preview.generate import build_document, outputs

ROOT = Path(__file__).resolve().parents[1] / "document_preview"


@pytest.fixture
def examples():
    return json.loads((ROOT / "examples.json").read_text())


def test_generated_wire_is_current_and_valid(examples):
    Draft202012Validator.check_schema(SCHEMA)
    validate_openapi(build_document())
    for name, content in outputs().items():
        assert (ROOT / "generated" / name).read_text() == content
    for name, value in examples.items():
        validate(name, value)
    raw, text = decode_utf8(examples["DocumentImport"]["content_base64"], MAX_DOCUMENT_BYTES)
    assert raw.startswith(b"\xef\xbb\xbf") and "\r\n" in text and "矩阵" in text


@pytest.mark.parametrize("field,value", [
    ("contract_version", "0.1.0"), ("source_version", True), ("source_version", 0),
    ("source_version", 2**53), ("sha256", "a" * 64), ("filename", "\x00"),
    ("filename", "\ud800"), ("source_timezone", "unknown/timezone"),
    ("provenance", {"origin": "synthetic"}), ("content_base64", "invalid"),
])
def test_import_rejects_invalid_or_client_provenance(examples, field, value):
    payload = examples["DocumentImport"]
    payload[field] = value
    with pytest.raises(ValidationError):
        validate("DocumentImport", payload)


@pytest.mark.parametrize("raw", [b"\xff", b"a\x00b", b"x" * (MAX_DOCUMENT_BYTES + 1)])
def test_invalid_utf8_nul_and_oversize_are_rejected(examples, raw):
    payload = examples["DocumentImport"]
    payload.update(content_base64=base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest())
    with pytest.raises(ValidationError):
        validate("DocumentImport", payload)


@pytest.mark.parametrize("field,value", [
    ("user_id", "other"), ("source_id", "other"), ("source_version", 2),
    ("device_id", "other"), ("session_id", "other"), ("frame_id", "other"),
    ("media_position", 1), ("bbox", {"x": .8, "y": 0, "width": .9, "height": .1}),
    ("selected_text", "not the recorded text"),
])
def test_selection_cannot_rebind(examples, field, value):
    payload = examples["DocumentSave"]
    payload["bridge_request"]["selection"][field] = value
    with pytest.raises(ValidationError):
        validate("DocumentSave", payload)


@pytest.mark.parametrize("field,value", [("user_id", "other"), ("selection_id", "other"), ("mode", "spoken")])
def test_actual_request_stays_bound(examples, field, value):
    payload = examples["DocumentSave"]
    payload["request"][field] = value
    with pytest.raises(ValidationError):
        validate("DocumentSave", payload)


@pytest.mark.parametrize("mutation", ["pixels", "capture_time", "viewport", "media", "text", "rect", "nan", "nul", "duplicate"])
def test_dom_cannot_misrepresent_frame(examples, mutation):
    payload = examples["DocumentSave"]
    dom = json.loads(base64.b64decode(payload["frame_bytes_base64"]))
    if mutation == "pixels": dom["pixels"] = "captured"
    if mutation == "capture_time": dom["captured_at"] = "2026-09-29T00:00:00Z"
    if mutation == "viewport": dom["viewport"]["width"] = 50
    if mutation == "media": dom["media"] = {}
    if mutation == "text": dom["selection"]["text"] = "other"
    if mutation == "rect": dom["selection"]["rect"]["x"] += 10
    if mutation == "nan": dom["scroll"]["x"] = float("nan")
    if mutation == "nul": dom["context_text"] = "\x00"
    text = json.dumps(dom)
    if mutation == "duplicate": text = '{"pixels":"not_captured",' + text[1:]
    raw = text.encode()
    payload.update(frame_bytes_base64=base64.b64encode(raw).decode())
    payload["frame"]["content_hash"] = hashlib.sha256(raw).hexdigest()
    with pytest.raises(ValidationError):
        validate("DocumentSave", payload)


def test_validation_preserves_exact_originals(examples):
    before = deepcopy(examples)
    for name, value in examples.items(): validate(name, value)
    assert before == examples


@pytest.mark.parametrize("value", ["YR==", "YQ==\n", " YQ==", "YQ==="])
def test_noncanonical_base64_rejected(value):
    with pytest.raises(ValidationError): decode_utf8(value, 10)


@pytest.mark.parametrize("path,value", [
    (("source", "user_id"), "other-owner"),
    (("source", "source_id"), "other-source"),
    (("source", "source_version"), 2),
    (("source", "source_timezone"), "UTC"),
    (("source", "project_id"), "other-project"),
    (("source", "provenance", "origin"), "synthetic"),
    (("observation", "user_id"), "other-owner"),
    (("observation", "source_id"), "other-source"),
    (("observation", "source_version"), 2),
    (("observation", "frame_id"), "other-frame"),
    (("observation", "device_id"), "other-device"),
    (("observation", "session_id"), "other-session"),
    (("observation", "media_position"), 1),
    (("observation", "captured_at"), "2026-09-29T00:00:00Z"),
    (("observation", "actor"), "assistant"),
    (("observation", "text"), "different request"),
    (("request", "project_id"), "other-project"),
    (("note", "user_id"), "other-owner"),
    (("note", "project_id"), "other-project"),
    (("note", "authorship"), "assistant"),
    (("note", "blocks", 0, "layer"), "ai_supplement"),
    (("note", "blocks", 0, "content"), "fabricated answer"),
    (("note", "context_segments", 0, "frame_id"), "other-frame"),
    (("note", "context_segments", 0, "source_version"), 2),
    (("note", "context_segments", 0, "source_id"), "other-source"),
    (("note", "context_segments", 0, "source_event_ids"), ["other-event"]),
    (("request_text",), "changed quote"),
    (("user_note",), "changed original"),
])
def test_saved_preview_cannot_mix_records_or_attribute_ai_output(examples, path, value):
    payload = examples["SavedPreview"]
    target = payload
    for part in path[:-1]: target = target[part]
    target[path[-1]] = value
    with pytest.raises(ValidationError): validate("SavedPreview", payload)


def test_saved_preview_rejects_internally_valid_but_unrelated_note_evidence(examples):
    payload = examples["SavedPreview"]
    payload["note"]["source_event_ids"] = ["another-observation"]
    payload["note"]["context_segments"][0]["source_event_ids"] = ["another-observation"]
    with pytest.raises(ValidationError): validate("SavedPreview", payload)


def test_saved_preview_preserves_earlier_capture_and_later_ask(examples):
    payload = examples["SavedPreview"]
    confirmed = "2026-09-28T00:03:00Z"
    payload["bridge_request"]["selection"]["created_at"] = confirmed
    payload["observation"]["captured_at"] = confirmed
    validate("SavedPreview", payload)
    assert payload["frame"]["captured_at"] != confirmed
