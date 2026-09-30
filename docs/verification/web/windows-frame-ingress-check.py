"""Checks the WindowsFrame ingress fixtures with the released Python contracts, and the retained PNG files.

Usage (contracts extracted from the lead's exact revision, never edited):
    git archive 6305389c37a3183864fc7430917ea321bcbc2786 packages/contracts | tar -x -C /tmp/lc-contracts
    PYTHONPATH=/tmp/lc-contracts <repo>/.venv/bin/python docs/verification/web/windows-frame-ingress-check.py
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from jsonschema import ValidationError

from packages.contracts import windows_capture_ingress as wire
from packages.contracts.windows_frame import validate_binding
from packages.contracts.original_artifact import validate as validate_original

HERE = Path(__file__).parent / "evidence"
NAME = "WindowsFrameBatchRequest"


def check(case):
    meta = json.loads((HERE / "windows-frame-ingress" / f"{case}.json").read_text())
    body = (HERE / "windows-frame-ingress" / meta["body"]).read_bytes()
    assert hashlib.sha256(body).hexdigest() == meta["body_sha256"]
    payload = wire.decode_request(NAME, body)  # strict bounded reader
    before = deepcopy(payload)
    wire.validate_frame_batch(payload, user_id=meta["plan"]["source"]["user_id"])
    assert wire.decode_request(NAME, wire.canonical_request(NAME, payload)) == before
    frames = {f["frame_id"]: f for f in payload["frames"]}
    entries = {e["record_id"]: e for e in meta["plan"]["entries"]}
    folder = (HERE / meta["manifest"]).parent
    bound = framed = frameless = 0
    for record in payload["batch"]["records"]:
        entry = entries[record["record_id"]]
        if record["frame_id"] is None:
            frameless += 1
            continue
        framed += 1
        frame = frames[record["frame_id"]]
        images = [entry["raw"]] + ([entry["composed"]] if entry["composed"] else [])
        bindings = list({b["artifact"]["artifact_id"]: b for b in images}.values())
        validate_binding(payload["batch"], record["record_id"], frame, meta["display_source"], bindings)
        bound += len(bindings)
        # The retained files themselves: exact bytes behind each declared original.
        for picture in [frame["raw"]] + ([frame["composed"]["image"]] if frame["composed"] else []):
            data = (folder / picture["native_file"]).read_bytes()
            assert hashlib.sha256(data).hexdigest() == picture["artifact"]["sha256"], picture["native_file"]
            assert len(data) == picture["artifact"]["byte_length"], picture["native_file"]
        for b in bindings + ([entry["ink"]] if entry["ink"] else []):
            validate_original("OriginalArtifactBinding", b)
        if entry["ink"]:
            assert entry["ink"]["artifact"] in record["artifacts"] and entry["ink"]["kind"] == "editable_ink"
    # The validators do reject a changed request (a Process clock claimed for a local observation).
    changed = deepcopy(payload)
    changed["batch"]["records"][0]["clock"] = {"domain_id": "x", "elapsed_ms": 1, "uncertainty_ms": None}
    try:
        wire.validate_frame_batch(changed, user_id=meta["plan"]["source"]["user_id"])
        raise AssertionError("a changed request was accepted")
    except ValidationError:
        pass
    assert payload == before
    print(f"{case}: {len(payload['batch']['records'])} records ({framed} framed, {frameless} frameless), "
          f"{len(payload['frames'])} frames, {bound} original bindings; body {len(body)} bytes; "
          "validate_frame_batch, validate_binding, canonical round trip and retained files: pass")


for name in ("native", "harness"):
    check(name)
