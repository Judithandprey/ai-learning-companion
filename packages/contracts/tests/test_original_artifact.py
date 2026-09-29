import base64
from copy import deepcopy
import hashlib
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts.original_artifact import (
    MAX_ARTIFACT_BYTES, SCHEMA, decode_upload, validate, validate_bytes, validate_receipt,
)
from packages.contracts.original_artifact.generate import outputs


def original(data=b'{"strokes":[],"history":[]}', kind="editable_ink", media="application/json"):
    return {"contract_version": "0.2.2", "source": {
        "user_id": "learner", "source_id": "source", "source_version": 1},
        "kind": kind, "artifact": {"artifact_id": "original",
        "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data), "media_type": media}}


def test_exact_bytes_and_receipt_preserve_source():
    data = b'{ "strokes":[], "history":[] }\n'
    binding = original(data)
    upload = {**binding, "data_base64": base64.b64encode(data).decode()}
    assert decode_upload(upload, user_id="learner") == data
    validate_receipt(binding, {**binding, "status": "bytes_committed"})
    assert binding["artifact"]["sha256"] == hashlib.sha256(data).hexdigest()


@pytest.mark.parametrize("change", ["user", "source", "version", "artifact", "digest", "media", "kind"])
def test_a_receipt_cannot_substitute_another_binding(change):
    binding = original()
    receipt = {**deepcopy(binding), "status": "bytes_committed"}
    if change in ("user", "source", "version"):
        field = {"user": "user_id", "source": "source_id", "version": "source_version"}[change]
        receipt["source"][field] = 2 if change == "version" else "other"
    elif change in ("artifact", "digest", "media"):
        field = {"artifact": "artifact_id", "digest": "sha256", "media": "media_type"}[change]
        receipt["artifact"][field] = "0" * 64 if change == "digest" else ("image/png" if change == "media" else "other")
    else:
        receipt["kind"] = "screen_image"
    with pytest.raises(ValidationError):
        validate_receipt(binding, receipt)


def test_wrong_user_modified_bytes_and_mutable_buffer_are_rejected():
    binding = original(b"original")
    for data, user in [(b"original", "foreign"), (b"tampered", "learner"),
                       (bytearray(b"original"), "learner")]:
        with pytest.raises(ValidationError):
            validate_bytes(binding, data, user_id=user)


@pytest.mark.parametrize("encoded", [" YQ==", "YQ==\n", "YR==", "YQ====", "🔥🔥🔥🔥"])
def test_noncanonical_base64_is_rejected(encoded):
    with pytest.raises(ValidationError):
        decode_upload({**original(b"a"), "data_base64": encoded}, user_id="learner")


@pytest.mark.parametrize("length", [0, MAX_ARTIFACT_BYTES + 1, True])
def test_invalid_or_oversize_length_fails_before_decode(length):
    binding = original()
    binding["artifact"]["byte_length"] = length
    with pytest.raises(ValidationError):
        validate("OriginalArtifactBinding", binding)


def test_no_active_content_or_live_ack_vocabulary():
    binding = original(b"image bytes", "screen_image", "image/svg+xml")
    with pytest.raises(ValidationError):
        validate("OriginalArtifactBinding", binding)
    for status in ("live", "provider_received", "verified", "pending"):
        with pytest.raises(ValidationError):
            validate_receipt(original(), {**original(), "status": status})


def test_generated_files_and_legacy_reuse():
    from packages.contracts.process_v2.validation import SCHEMA as capture
    folder = Path(__file__).parents[1] / "original_artifact" / "generated"
    for name, output in outputs().items():
        assert (folder / name).read_text() == output
    for name in ("Identifier", "SourceRef", "ArtifactReference"):
        assert SCHEMA["$defs"][name] == capture["$defs"][name]
