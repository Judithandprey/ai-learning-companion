"""Validate web-probe evidence against the shared contract (packages/contracts).

Checks every contract object the browser self-test actually produced
(Selection + Frame pair, ExplanationRequest, ExplanationCard, BridgeRequest,
BridgeResponse) and every CapabilityResult in the capability matrix. Uses the
lead-owned validator unchanged; run from the repository root, e.g.

    PYTHONPATH=. <python-with-jsonschema> apps/safari-extension/scripts/validate_evidence.py \
        docs/verification/web/evidence/selftest.json docs/verification/web/capabilities.json
"""

import json
import sys

from packages.contracts import validate
from packages.contracts.validation import validate_selection_frame


def check_report(path: str) -> list[str]:
    report = json.loads(open(path, encoding="utf-8").read())
    objects = report.get("contract_objects", [])
    problems: list[str] = []
    if not objects:
        problems.append(f"{path}: no contract objects")
    for i, obj in enumerate(objects):
        where = f"{path}#{i} ({obj.get('scope')})"
        try:
            selection, frame = obj["selection"], obj["frame"]
            validate_selection_frame(selection, frame)
            validate("ExplanationRequest", obj["request"])
            validate("ExplanationCard", obj["card"])
            validate("BridgeRequest", obj["bridge_request"])
            validate("BridgeResponse", obj["bridge"]["response"])
            assert obj["request"]["selection_id"] == selection["id"], "request/selection mismatch"
            assert obj["card"]["selection_id"] == selection["id"], "card/selection mismatch"
            assert obj["card"]["request_id"] == obj["request"]["request_id"], "card/request mismatch"
            assert obj["bridge_request"]["selection"] == selection, "bridge carries a different selection"
            assert obj["bridge"]["response"]["request_id"] == obj["bridge_request"]["request_id"], "bridge response id mismatch"
            assert frame["representation"] == "dom_snapshot", "web frames must be dom_snapshot"
            assert obj["card"]["audio"] is False and obj["request"]["mode"] == "silent", "card must be silent"
            if obj["card"]["provenance"] == "fixture":
                assert obj["card"]["status"] == "ready", "fixture card must be ready"
            else:
                assert obj["card"]["provenance"] == "none" and obj["card"]["status"] != "ready", "non-fixture card must not be a ready explanation"
        except Exception as error:  # report every failing object
            problems.append(f"{where}: {type(error).__name__}: {error}")
    print(f"{path}: {len(objects)} submitted asks validated, {len(problems)} problems")
    return problems


def check_capabilities(path: str) -> list[str]:
    rows = json.loads(open(path, encoding="utf-8").read())
    problems: list[str] = []
    for i, row in enumerate(rows):
        try:
            validate("CapabilityResult", row)
            if row["checks"]["device"] == "pass":
                raise ValueError("desktop evidence cannot mark a device check as pass")
            if row["status"] == "device_pass":
                raise ValueError("no device_pass without a real device run")
        except Exception as error:
            problems.append(f"{path}#{i} {row.get('capability')}: {type(error).__name__}: {error}")
    print(f"{path}: {len(rows)} capability rows validated, {len(problems)} problems")
    return problems


def main(paths: list[str]) -> int:
    problems: list[str] = []
    for path in paths:
        problems += check_capabilities(path) if path.endswith("capabilities.json") else check_report(path)
    for p in problems:
        print("FAIL", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
