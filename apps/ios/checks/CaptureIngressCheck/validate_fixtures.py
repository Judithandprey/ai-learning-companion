#!/usr/bin/env python3
"""Validate CaptureIngressCheck's Swift-emitted fixtures with the released Python contracts.

    python3 apps/ios/checks/CaptureIngressCheck/validate_fixtures.py FIXTURE_DIR

Needs the repository's Python dependency (jsonschema[format], see pyproject.toml). Each request
body must pass the strict capture_ingress 0.2.4 reader and the path/owner/byte checks, decode to
exactly the original PNG, and equal `canonical_request`. For every receipt, Python's
`validate_receipt` must reach the same verdict as the Swift uploader. The fixtures are synthetic
output of the Swift uploader and its in-process test transport. They are not network, server or
device evidence.
"""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from packages.contracts import capture_ingress, original_artifact  # noqa: E402

BINDING_KEYS = ("contract_version", "source", "artifact", "kind")


def main(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    failures = []
    requests = {}

    def check(condition, name):
        print(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    def upload(name):
        if name not in requests:
            body = (directory / name).read_bytes()
            requests[name] = (body, capture_ingress.decode_request("OriginalArtifactUpload", body))
        return requests[name]

    for case in manifest:
        kind = case["type"]
        try:
            if kind == "request":
                body, payload = upload(case["body"])
                artifact_id = payload["artifact"]["artifact_id"]
                data = capture_ingress.validate_upload(
                    payload, artifact_id=case["path"].rsplit("/", 1)[-1],
                    user_id=payload["source"]["user_id"])
                check(case["method"] == "PUT" and case["content_type"] == "application/json"
                      and case["authorization_scheme"] == "Bearer"
                      and case["path"] == "/v2/process/originals/" + artifact_id,
                      f"request {case['name']}: PUT JSON with a bearer token to the exact original route")
                check(data == (directory / case["original"]).read_bytes(),
                      f"request {case['name']}: the strict 0.2.4 reader decodes exactly the original bytes")
                check(capture_ingress.canonical_request("OriginalArtifactUpload", payload) == body
                      and len(body) <= capture_ingress.body_limit("OriginalArtifactUpload"),
                      f"request {case['name']}: the body is the canonical request, within the raw limit")
            elif kind == "same_request":
                first, _ = upload(case["first"])
                second, _ = upload(case["second"])
                check(first == second, "the request retried after a lost response is byte-identical")
            elif kind == "receipt":
                _, payload = upload(case["request"])
                binding = {key: payload[key] for key in BINDING_KEYS}
                try:
                    receipt = json.loads((directory / case["receipt"]).read_bytes())
                    original_artifact.validate_receipt(binding, receipt)
                    verdict = "accepted"
                except Exception:  # Any failure to parse or validate is a rejection.
                    verdict = "rejected"
                check(verdict == case["swift_verdict"],
                      f"receipt {case['name']}: Swift {case['swift_verdict']}, Python {verdict}")
            elif kind == "ingress_error":
                error = json.loads((directory / case["body"]).read_bytes())
                capture_ingress.validate("IngressError", error)
                check(case["status"] in {int(status) for status, codes in capture_ingress.ERROR_CODES.items()
                                         if error["error"] in codes},
                      f"error {case['name']}: a valid IngressError for HTTP {case['status']}")
            else:
                check(False, f"known fixture type {kind!r}")
        except Exception as error:  # Report and continue with the other fixtures.
            check(False, f"{kind} {case.get('name', '')}: {type(error).__name__}: {error}")

    verdicts = [case["swift_verdict"] for case in manifest if case["type"] == "receipt"]
    check(sum(1 for case in manifest if case["type"] == "request") >= 3
          and verdicts.count("accepted") >= 2 and verdicts.count("rejected") >= 20,
          "the fixture set is not vacuous (requests, accepted and rejected receipts)")
    if failures:
        print(f"{len(failures)} fixture check(s) failed")
        return 1
    print("all fixture checks passed")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(Path(sys.argv[1])))
