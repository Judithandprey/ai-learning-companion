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
  source.

For each acknowledgement, raw_capture_ingress.validate_ack must reach the same verdict as Swift.
Error bodies must be valid RawIngressErrors for their statuses.

These are synthetic, in-process contract fixtures, not network, server or device evidence.
"""

import copy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts import capture_frame, raw_capture_ingress  # noqa: E402
from packages.contracts.original_artifact import validate as validate_original  # noqa: E402
from packages.contracts.process_v2 import validate as validate_process  # noqa: E402

ROUTE = "/v2/process/raw-frames:batch"
EVIDENCE = {"kind": "coverage", "coverage": "observed_samples", "from_clock_ms": None, "through_clock_ms": None,
            "missing_sequences": [], "limitations": ["sample_only", "unsupported_history"]}


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
                validate_process("IdempotencyKey", case["idempotency_key"])
                check(case["method"] == "POST" and case["path"] == ROUTE,
                      f"request {name}: POST to {ROUTE} with a valid Idempotency-Key")
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
          and verdicts.count("accepted") >= 2 and verdicts.count("rejected") >= 20,
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
