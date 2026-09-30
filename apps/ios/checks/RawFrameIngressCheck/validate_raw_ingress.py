#!/usr/bin/env python3
"""Validate RawFrameIngressCheck's Swift-emitted fixtures with the released Python contracts.

    python3 apps/ios/checks/RawFrameIngressCheck/validate_raw_ingress.py FIXTURE_DIR

Needs the repository's Python dependency (jsonschema[format], see pyproject.toml).

For each request body:
- the strict 0.2.6 reader and validate_frame_batch with the trusted owner;
- canonical_request equality;
- the fixed native record profile (one framed provisional_session record: external_app, visual,
  observed_samples with sample_only and unsupported_history, unknown bounds, no parents or gaps,
  the clock and artifact bound exactly to the raw frame);
- capture_frame.validate_binding with the actual original binding and a composed display
  source;
- the actual recorded original PUT body: the strict 0.2.4 upload reader and validate_upload;
  decoded bytes that match the binding's length and SHA-256 and carry the PNG signature; equality
  with the binding and the raw frame's artifact and source. Negative controls cover a missing (empty)
  original, changed bytes and a substituted binding.

Requests that were only built and enqueued, not POSTed, are labeled so. Error bodies that break
the status, code or retryable rules must be rejected by the released contract.

For each acknowledgement, raw_capture_ingress.validate_ack must reach the same verdict as Swift.
Error bodies must be valid RawIngressErrors for their statuses.

These are synthetic, in-process contract fixtures, not network, server or device evidence.
"""

import base64
import copy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts import capture_frame, capture_ingress, raw_capture_ingress  # noqa: E402
from packages.contracts.original_artifact import validate as validate_original  # noqa: E402
from packages.contracts.process_v2 import validate as validate_process  # noqa: E402

ROUTE = "/v2/process/raw-frames:batch"
EVIDENCE = {"kind": "coverage", "coverage": "observed_samples", "from_clock_ms": None, "through_clock_ms": None,
            "missing_sequences": [], "limitations": ["sample_only", "unsupported_history"]}


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BINDING_KEYS = ("contract_version", "source", "artifact", "kind")


def original_problem(original_body, binding, frame, record, user_id):
    """Why the recorded original PUT body is not exactly this request's committed original, or None."""
    upload = capture_ingress.decode_request("OriginalArtifactUpload", original_body)
    data = capture_ingress.validate_upload(upload, artifact_id=binding["artifact"]["artifact_id"], user_id=user_id)
    if {key: upload[key] for key in BINDING_KEYS} != binding:
        return "the original upload's binding differs from the manifest binding"
    if binding["artifact"] != frame["artifact"] or record["artifacts"] != [frame["artifact"]]:
        return "the binding's artifact differs from the raw frame's"
    if binding["source"] != frame["source"] or record["source"] != frame["source"]:
        return "the binding's source differs from the raw frame's"
    if not data.startswith(PNG_SIGNATURE):
        return "the original bytes are not a PNG"
    return None


def refused(check):
    """True if `check` raises or reports a problem."""
    try:
        return check() is not None
    except Exception:  # A validation error is the expected refusal.
        return True


def display_for(frame):
    return {"contract_version": "0.2.3", **copy.deepcopy(frame["source"]), "type": "shared_display",
            **{name: frame[name] for name in ("device_id", "session_id", "stream_id")},
            "project_id": None, "created_at": "2026-09-30T05:00:00Z", "source_timezone": "America/Los_Angeles"}


def date_time_format_checked():
    """The verdicts need the pinned environment's RFC 3339 date-time checker (rfc3339-validator)."""
    try:
        raw_capture_ingress.validate("UtcTimestamp", "2026-02-30T05:00:00Z")
    except Exception:  # Refused: the format checker is active.
        return True
    return False


def main(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    failures = []
    if not date_time_format_checked():
        print("FAIL date-time format checking is not active; run in the repository's pinned environment (jsonschema[format])")
        return 1
    requests = {}

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    for case in manifest:
        kind, name = case["type"], case["name"]
        try:
            if kind == "request":
                body = (directory / case["body"]).read_bytes()
                payload = raw_capture_ingress.decode_request("RawFrameBatchRequest", body)
                raw_capture_ingress.validate_frame_batch(payload, user_id=case["user_id"])
                requests[case["body"]] = (payload, case)
                check(raw_capture_ingress.canonical_request("RawFrameBatchRequest", payload) == body,
                      f"request {name}: strict 0.2.6 reader and trusted owner accept it; the body is canonical")
                batch, frame = payload["batch"], payload["frames"][0]
                record = batch["records"][0]
                check(len(batch["records"]) == 1 and len(payload["frames"]) == 1
                      and record["scope"] == {"kind": "provisional_session"}
                      and record["surface"] == "external_app" and record["method"] == "visual"
                      and record["causal_parents"] == [] and record["evidence"] == EVIDENCE
                      and record["observed_at"] is None and record["media_position"] is None
                      and record["frame_id"] == frame["frame_id"] and record["artifacts"] == [frame["artifact"]]
                      and record["clock"] == frame["timing"]["callback_clock"]
                      and frame["captured_at"] is None and frame["media_position"] is None,
                      f"request {name}: one framed sampled-pixel record, with clock and artifact bound exactly to the raw frame")
                binding = case["binding"]
                validate_original("OriginalArtifactBinding", binding)
                capture_frame.validate_binding(batch, record["record_id"], frame, display_for(frame), binding)
                check(binding["artifact"] == frame["artifact"] and binding["source"] == record["source"],
                      f"request {name}: capture_frame.validate_binding accepts it with the committed original binding")
                original = (directory / case["original"]).read_bytes()
                problem = original_problem(original, binding, frame, record, case["user_id"])
                check(problem is None,
                      f"request {name}: its recorded original PUT holds exactly the committed PNG (strict upload, "
                      f"length, SHA-256, signature, binding and raw-frame reference){'' if problem is None else ': ' + problem}")
                upload = json.loads(original)
                changed = bytearray(capture_ingress.validate_upload(
                    upload, artifact_id=binding["artifact"]["artifact_id"], user_id=case["user_id"]))
                changed[-1] ^= 1
                upload["data_base64"] = base64.b64encode(bytes(changed)).decode("ascii")
                other = copy.deepcopy(binding)
                other["artifact"]["artifact_id"] = "so.other.00000001"
                check(refused(lambda: original_problem(b"", binding, frame, record, case["user_id"]))
                      and refused(lambda: original_problem(json.dumps(upload).encode(), binding, frame, record, case["user_id"]))
                      and refused(lambda: original_problem(original, other, frame, record, case["user_id"])),
                      f"request {name}: a missing (empty) original, changed bytes or a substituted binding is refused")
                validate_process("IdempotencyKey", case["idempotency_key"])
                check(case["method"] == "POST" and case["path"] == ROUTE,
                      f"request {name}: {'an actually POSTed' if case['posted'] else 'built and enqueued (not POSTed)'} "
                      f"request for POST {ROUTE} with a valid Idempotency-Key")
            elif kind == "ack":
                payload, request_case = requests[case["request"]]
                artifact = payload["batch"]["records"][0]["artifacts"][0]
                verified = {tuple(artifact[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))}
                try:
                    ack = json.loads((directory / case["ack"]).read_bytes())
                    raw_capture_ingress.validate_ack(payload["batch"], ack, user_id=request_case["user_id"],
                                                     verified_artifacts=verified)
                    verdict = "accepted"
                except Exception:  # Any parse or validation failure is a rejection.
                    verdict = "rejected"
                check(verdict == case["swift_verdict"],
                      f"acknowledgement {name}: Swift {case['swift_verdict']}, Python {verdict}")
            elif kind == "invalid_error":
                error = json.loads((directory / case["body"]).read_bytes())
                check(refused(lambda: raw_capture_ingress.validate("RawIngressError", error))
                      or error["error"] not in raw_capture_ingress.ERROR_CODES[str(case["status"])],
                      f"invalid error {name}: the released contract rejects it for HTTP {case['status']}")
            elif kind == "error":
                error = json.loads((directory / case["body"]).read_bytes())
                raw_capture_ingress.validate("RawIngressError", error)
                check(error["error"] in raw_capture_ingress.ERROR_CODES[str(case["status"])],
                      f"error {name}: a valid RawIngressError for HTTP {case['status']}")
            else:
                check(False, f"known fixture type {kind!r}")
        except Exception as error:  # Report and continue with the other fixtures.
            check(False, f"{kind} {name}: {type(error).__name__}: {error}")

    verdicts = [case["swift_verdict"] for case in manifest if case["type"] == "ack"]
    check(sum(case["type"] == "request" for case in manifest) >= 2
          and verdicts.count("accepted") >= 6 and verdicts.count("rejected") >= 25
          and sum(case["type"] == "invalid_error" for case in manifest) >= 5,
          "the fixture set is not vacuous (requests, accepted and refused acknowledgements)")
    if failures:
        print(f"{len(failures)} raw ingress fixture check(s) failed")
        return 1
    print("all raw ingress fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
