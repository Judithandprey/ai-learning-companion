#!/usr/bin/env python3
"""Validate the Swift-made Mac 0.2.12 upload fixture with the released contracts.

    python apps/macos/CompanionDesktop/checks/validate_mac_upload.py MAC_UPLOAD_FIXTURE_DIR

The fixture comes from `swift test` with COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR set to a new
directory: MacIngressUploadTests.testUploadsEveryOriginalThenTheExactBatch keeps the synthetic
retained session, the prepared request bytes, every request the uploader sent to an in-process
stand-in host and every reply it believed. Run in the repository's pinned environment.

Checked against the released validators and the native files:
- request.json: strict decoding and `validate_frame_batch` (MacOSFrameBatchRequest 0.2.12), the
  plan's record identities as the test supplied them (and, for this synthetic plan, never a frame's
  callback ordinal), null capture time/clock/media position,
  external_app/visual/coverage records, every descriptor against the native records and files
  (the retained-frame checker's `native_problems`), and each record's artifacts: raw, the composed
  image when it has its own ID, and the frame's immutable ink original exactly when the native
  outcome retains one (ink-originals/<SHA-256>.json, never ink/ink.json);
- the exchanges: one PUT per distinct artifact, in record order, before the one POST; route paths
  and exactly the headers set (Authorization marker, Content-Type, Accept, and the key on the POST);
  each upload strictly decoded and validated (`validate_upload`) to exactly the
  retained file's bytes; the POST body byte-identical to request.json with the planned key;
- the replies the uploader believed: `validate_receipt` for each original and `validate_ack` for
  the batch, verified only against the committed originals;
- the UtcTimestamp verdicts of the Swift check equal the released validator's on every corpus
  string.
Negative controls change one fact each and must be refused. The stand-in host is not HTTP or the
Backend; no display, provider, network or device is involved.
"""

import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts import capture_ingress, macos_capture_ingress as wire, original_artifact  # noqa: E402
from jsonschema import ValidationError  # noqa: E402

_spec = importlib.util.spec_from_file_location("retained_frames", Path(__file__).with_name("validate_mac_retained_frames.py"))
retained = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(retained)

PUT_PATH = "/v2/process/originals/"
BATCH_PATH = "/v2/process/macos-frames:batch"
TOKEN_MARK = "Bearer <synthetic token>"
PUT_HEADERS = {"Authorization": TOKEN_MARK, "Content-Type": "application/json; charset=utf-8", "Accept": "application/json"}


def refused(check):
    """True only when the released check refuses; any other exception is a failure of the check."""
    try:
        check()
    except (ValidationError, ValueError) as error:
        return bool(str(error))
    return False


def request_problems(request, manifest, session_dir, status, kept, outcomes):
    """Differences between the batch and the plan, the native records and the retained files."""
    problems = []
    batch = request["batch"]
    records = batch["records"]
    identities = [{"record_id": r["record_id"], "sequence": r["sequence"]} for r in records]
    if identities != manifest["records"]:
        problems.append("the records are not the plan's identities in order")
    frames = {frame["frame_id"]: frame for frame in request["frames"]}
    composed = retained.single_composed(outcomes, kept)
    ink_file = session_dir / "ink/ink.json"
    mutable = ink_file.read_bytes() if ink_file.is_file() else None
    for record in records:
        label = record["record_id"]
        if any(record[k] is not None for k in ("observed_at", "clock", "media_position")):
            problems.append(f"{label}: capture time, clock or media position is not null")
        if (record["surface"], record["method"], record["evidence"]["kind"], record["scope"]) != (
                "external_app", "visual", "coverage", {"kind": "provisional_session"}):
            problems.append(f"{label}: not an external_app visual coverage record in the provisional session")
        frame = frames.get(record["frame_id"])
        if frame is None:
            if record["artifacts"]:
                problems.append(f"{label}: a frameless record carries artifacts")
            continue
        # The synthetic plan never uses a callback ordinal as a Process sequence.
        if record["sequence"] == frame["callback_sequence"]:
            problems.append(f"{label}: the Process sequence is the frame's callback ordinal")
        problems += [f"{label}: {p}" for p in retained.native_problems(frame, status, kept, outcomes, session_dir)]
        expected = [frame["raw"]["artifact"]]
        result = frame["composition"]
        if result["kind"] == "composed" and result["image"]["artifact"]["artifact_id"] != expected[0]["artifact_id"]:
            expected.append(result["image"]["artifact"])
        original = (composed.get(frame["callback_sequence"]) or {}).get("inkOriginal") or {}
        inks = [a for a in record["artifacts"] if a["media_type"] == "application/json"]
        if original.get("status") == "retained":
            if len(inks) != 1 or [inks[0]["sha256"], inks[0]["byte_length"]] != [original["sha256"], original["byteLength"]]:
                problems.append(f"{label}: the record does not reference its frame's retained ink original exactly")
            else:
                expected.append(inks[0])
                data = (session_dir / original["file"]).read_bytes()
                if hashlib.sha256(data).hexdigest() != original["sha256"] or data == mutable:
                    problems.append(f"{label}: the ink reference is not the immutable ink-originals file")
        elif inks:
            problems.append(f"{label}: an ink reference without a retained ink original")
        if record["artifacts"] != expected:
            problems.append(f"{label}: the artifacts are not raw, own composed and retained ink, in that order")
    return problems


def exchange_problems(manifest, directory, request_bytes, request, session_dir):
    """The PUTs and the POST as sent, and the replies believed."""
    problems = []
    user = manifest["user_id"]
    planned = {o["artifact_id"]: o for o in manifest["originals"]}
    order = []
    for record in request["batch"]["records"]:
        for artifact in record["artifacts"]:
            if artifact["artifact_id"] not in order:
                order.append(artifact["artifact_id"])
    exchanges = manifest["exchanges"]
    puts = [e for e in exchanges if e["method"] == "PUT"]
    posts = [e for e in exchanges if e["method"] == "POST"]
    if [e["method"] for e in exchanges] != ["PUT"] * len(puts) + ["POST"] or len(posts) != 1:
        problems.append("the exchanges are not every PUT, then one POST")
    if [e["path"] for e in puts] != [PUT_PATH + i for i in order] or list(planned) != order:
        problems.append("the PUTs are not one per distinct artifact, in record order")
    verified = set()
    records_by_artifact = {a["artifact_id"]: a for r in request["batch"]["records"] for a in r["artifacts"]}
    source = request["batch"]["records"][0]["source"]
    mutable = (session_dir / "ink/ink.json").read_bytes() if (session_dir / "ink/ink.json").is_file() else None
    for exchange in puts:
        artifact_id = exchange["path"][len(PUT_PATH):]
        if exchange["headers"] != PUT_HEADERS:
            problems.append(f"PUT {artifact_id}: headers are not exactly Authorization, Content-Type and Accept")
        body = (directory / exchange["request_file"]).read_bytes()
        try:
            upload = capture_ingress.decode_request("OriginalArtifactUpload", body)
            data = capture_ingress.validate_upload(upload, artifact_id=artifact_id, user_id=user)
        except Exception as error:  # Reported, never a silent pass.
            problems.append(f"PUT {artifact_id}: refused by the released upload check: {type(error).__name__}")
            continue
        plan = planned.get(artifact_id, {})
        file_bytes = (session_dir / plan.get("file", "missing")).read_bytes() if plan else b""
        binding = {k: upload[k] for k in ("contract_version", "source", "artifact", "kind")}
        if data != file_bytes or upload["artifact"] != records_by_artifact.get(artifact_id) or upload["source"] != source:
            problems.append(f"PUT {artifact_id}: not exactly the retained file under its record's reference and source")
        if upload["kind"] == "editable_ink" and (not plan.get("file", "").startswith("ink-originals/") or data == mutable):
            problems.append(f"PUT {artifact_id}: ink is not the immutable ink-originals file")
        if (upload["kind"] == "editable_ink") != (upload["artifact"]["media_type"] == "application/json"):
            problems.append(f"PUT {artifact_id}: kind and media type disagree")
        try:
            receipt = json.loads((directory / exchange["reply_file"]).read_bytes())
            original_artifact.validate_receipt(binding, receipt)
            verified.add(tuple(upload["artifact"][k] for k in ("artifact_id", "sha256", "byte_length", "media_type")))
        except Exception as error:
            problems.append(f"PUT {artifact_id}: the believed receipt is refused: {type(error).__name__}")
    for exchange in posts:
        body = (directory / exchange["request_file"]).read_bytes()
        if exchange["path"] != BATCH_PATH or body != request_bytes \
                or exchange["headers"] != dict(PUT_HEADERS, **{"Idempotency-Key": manifest["idempotency_key"]}):
            problems.append("POST: not the exact prepared bytes, key and headers (Authorization, Content-Type, Accept, "
                            "Idempotency-Key) on the batch route")
        try:
            ack = json.loads((directory / exchange["reply_file"]).read_bytes())
            wire.validate_ack(request["batch"], ack, user_id=user, verified_artifacts=frozenset(verified))
        except Exception as error:
            problems.append(f"POST: the believed ACK is refused: {type(error).__name__}: {error}")
    if manifest["committed_originals"] != [e["path"][len(PUT_PATH):] for e in puts] or manifest["result"] != "committed":
        problems.append("the reported result or committed originals differ from the exchanges")
    return problems, verified


def utc_problems(corpus):
    problems = []
    for item in corpus:
        python_valid = not refused(lambda: wire.validate("UtcTimestamp", item["text"]))
        if python_valid != item["swift_valid"]:
            problems.append(f"{item['text']!r}: Swift {item['swift_valid']}, released {python_valid}")
    return problems


def main(directory):
    failures = []

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    try:
        manifest = json.loads((directory / "manifest.json").read_bytes())
        session_dir = directory / manifest["native_session"]
        status, kept, outcomes, *_ = retained.native_session(session_dir)
        request_bytes = (directory / manifest["request_file"]).read_bytes()
        request = wire.decode_request("MacOSFrameBatchRequest", request_bytes)
    except Exception as error:  # Reported, never a silent pass.
        check(False, f"the fixture could be read: {type(error).__name__}: {error}")
        return 1
    user = manifest["user_id"]

    check(not refused(lambda: wire.validate_frame_batch(request, user_id=user)) and len(request_bytes) <= 4_194_304,
          "request.json is a strict MacOSFrameBatchRequest 0.2.12 within 4 MiB, accepted by validate_frame_batch")
    check(not refused(lambda: wire.validate("IdempotencyKey", manifest["idempotency_key"])), "the key is a released IdempotencyKey")
    problems = request_problems(request, manifest, session_dir, status, kept, outcomes)
    check(not problems, "records, descriptors and artifact references equal the plan and the native files"
                        + ("" if not problems else ": " + "; ".join(problems)))
    exchange_found, verified = exchange_problems(manifest, directory, request_bytes, request, session_dir)
    check(not exchange_found, "every original was PUT exactly, then the exact batch; every believed reply passes the released checks"
                              + ("" if not exchange_found else ": " + "; ".join(exchange_found)))
    utc = utc_problems(manifest["utc_corpus"])
    check(not utc, f"UtcTimestamp verdicts equal the released validator on {len(manifest['utc_corpus'])} strings"
                   + ("" if not utc else ": " + "; ".join(utc[:5])))

    # Controls: one changed fact each must be refused.
    controls = 0

    def control(name, condition):
        nonlocal controls
        controls += 1
        check(condition, f"control: {name} is refused")

    changed = copy.deepcopy(request)
    changed["batch"]["records"][0]["observed_at"] = "2026-09-30T19:40:00Z"
    control("a capture time on a framed record", refused(lambda: wire.validate_frame_batch(changed, user_id=user)))
    changed = copy.deepcopy(request)
    changed["batch"]["records"][0]["source"]["user_id"] = "someone-else"
    control("a record owned by someone else", refused(lambda: wire.validate_frame_batch(changed, user_id=user)))
    inked = next(r for r in request["batch"]["records"] if any(a["media_type"] == "application/json" for a in r["artifacts"]))
    changed = copy.deepcopy(request)
    target = next(r for r in changed["batch"]["records"] if r["record_id"] == inked["record_id"])
    target["artifacts"] = [a for a in target["artifacts"] if a["media_type"] != "application/json"]
    control("a retained ink original left out of its record",
            bool(request_problems(changed, manifest, session_dir, status, kept, outcomes)))
    changed = copy.deepcopy(request)
    plain = next(r for r in changed["batch"]["records"] if not any(a["media_type"] == "application/json" for a in r["artifacts"])
                 and r["frame_id"] is not None)
    plain["artifacts"].append(copy.deepcopy(next(a for a in inked["artifacts"] if a["media_type"] == "application/json")))
    control("an ink reference on a frame without a retained original",
            bool(request_problems(changed, manifest, session_dir, status, kept, outcomes)))
    changed = copy.deepcopy(manifest)
    changed["records"][0]["sequence"] += 1
    control("record identities other than the plan's", bool(request_problems(request, changed, session_dir, status, kept, outcomes)))
    ordinals = copy.deepcopy(request)
    frames_by_id = {f["frame_id"]: f for f in ordinals["frames"]}
    for record in ordinals["batch"]["records"]:
        if record["frame_id"] in frames_by_id:
            record["sequence"] = frames_by_id[record["frame_id"]]["callback_sequence"]
    echoed = dict(manifest, records=[{"record_id": r["record_id"], "sequence": r["sequence"]} for r in ordinals["batch"]["records"]])
    control("callback ordinals used as Process sequences, even when the manifest echoes them",
            bool(request_problems(ordinals, echoed, session_dir, status, kept, outcomes)))
    tampered = copy.deepcopy(manifest)
    next(e for e in tampered["exchanges"] if e["method"] == "POST")["headers"]["Authorization"] = "<other>"
    control("a batch POST without the bearer", bool(exchange_problems(tampered, directory, request_bytes, request, session_dir)[0]))
    tampered = copy.deepcopy(manifest)
    tampered["exchanges"][0]["headers"]["Cookie"] = "a=b"
    control("an extra header on an upload", bool(exchange_problems(tampered, directory, request_bytes, request, session_dir)[0]))

    first_put = next(e for e in manifest["exchanges"] if e["method"] == "PUT")
    upload = json.loads((directory / first_put["request_file"]).read_bytes())
    data = bytearray(base64.b64decode(upload["data_base64"]))
    data[-1] ^= 1
    altered = dict(upload, data_base64=base64.b64encode(bytes(data)).decode("ascii"))
    control("an upload whose bytes differ from its reference",
            refused(lambda: capture_ingress.validate_upload(altered, artifact_id=first_put["path"][len(PUT_PATH):], user_id=user)))
    receipt = json.loads((directory / first_put["reply_file"]).read_bytes())
    binding = {k: upload[k] for k in ("contract_version", "source", "artifact", "kind")}
    control("a receipt with another status", refused(lambda: original_artifact.validate_receipt(binding, dict(receipt, status="pending"))))
    control("a receipt for another kind",
            refused(lambda: original_artifact.validate_receipt(binding, dict(receipt, kind="editable_ink"))))
    post = next(e for e in manifest["exchanges"] if e["method"] == "POST")
    ack = json.loads((directory / post["reply_file"]).read_bytes())
    missing = copy.deepcopy(ack)
    missing["acknowledged"].pop()
    control("an ACK missing a record",
            refused(lambda: wire.validate_ack(request["batch"], missing, user_id=user, verified_artifacts=frozenset(verified))))
    impossible = copy.deepcopy(ack)
    impossible["acknowledged"][0]["received_at"] = "2026-02-30T12:00:00Z"
    control("an ACK with an impossible date",
            refused(lambda: wire.validate_ack(request["batch"], impossible, user_id=user, verified_artifacts=frozenset(verified))))
    pending = copy.deepcopy(ack)
    pending["acknowledged"][-1]["artifacts"][0]["status"] = "pending"
    control("an ACK with a pending artifact",
            refused(lambda: wire.validate_ack(request["batch"], pending, user_id=user, verified_artifacts=frozenset(verified))))
    control("an ACK verified without the committed originals",
            refused(lambda: wire.validate_ack(request["batch"], ack, user_id=user, verified_artifacts=frozenset())))
    flipped = copy.deepcopy(manifest["utc_corpus"][:1])
    flipped[0]["swift_valid"] = not flipped[0]["swift_valid"]
    control("a Swift UtcTimestamp verdict that differs", bool(utc_problems(flipped)))

    kinds = [e for e in manifest["originals"]]
    verdicts = {item["swift_valid"] for item in manifest["utc_corpus"]}
    check(len(request["batch"]["records"]) >= 8 and any(k["kind"] == "editable_ink" for k in kinds)
          and sum(k["file"].startswith("composed/") for k in kinds) >= 1
          and any(not any(a["media_type"] == "application/json" for a in r["artifacts"]) for r in request["batch"]["records"])
          and len(manifest["utc_corpus"]) >= 40_000 and verdicts == {True, False} and controls >= 16,
          "the fixture set is not vacuous (8 records, raw, composed and ink originals, frames without ink, "
          "valid and invalid timestamps, controls)")
    if failures:
        print(f"{len(failures)} Mac upload fixture check(s) failed")
        return 1
    print("all Mac upload fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
