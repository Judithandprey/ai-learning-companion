#!/usr/bin/env python3
"""Record completed bounded checks and checksum their retained evidence."""
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
focus = json.loads((HERE / "focused-results.json").read_text())
controller = json.loads((HERE / "controller-final-result.json").read_text())
pipe = (HERE / "focused-realchild-tests.txt").read_text()
if not re.search(r"Executed 1 test, with 0 failures \(0 unexpected\)", pipe):
    raise SystemExit("Single child check has no successful XCTest summary")
if focus["passed_methods"] != 40 or focus["failed_methods"]:
    raise SystemExit("Focused replay does not match the completed run")
if controller["test_count"] != 8 or controller["failure_count"] or controller["exit_code"]:
    raise SystemExit("Controller replay does not match the completed run")


def write(name, data):
    (HERE / name).write_text(json.dumps(data, indent=2) + "\n")


write("focused-realchild-result.json", {
    "exit_code": 0, "tests": 1, "failures": 0, "test_runtime_seconds": 14.928,
    "method": "testAskRealChildNeverGetsARequestTakenBackInThePipe",
    "approval": "normal exact-command require_escalated review; accepted",
    "command": "bash /tmp/lc-live-correction-focused/replay.sh realchild",
    "snapshot": "focused-final-source-manifest.json",
    "entrypoint": "focused-realchild-main.swift",
    "log": "focused-realchild-tests.txt",
    "log_sha256": hashlib.sha256(pipe.encode()).hexdigest(),
    "real_local_child": True, "real_provider_account_model_or_device": False,
    "earlier_wrong_basename_attempt": {"exit_code": 1, "tests_executed": 0,
                                      "log": "focused-realchild-entrypoint-failure.txt"},
})
write("verification-results.json", {
    "binding": "Correction commit containing this record and source-sha256.json",
    "predecessor_candidate": "3147291f449105c06255cfc0ea2056f1b2582437",
    "assigned_review_baseline": "c9177096c99c2562e4474bcbb2f4ffc8beb43c18",
    "scope": "MAC-LIVE-01/02 only; existing P0-03/11 to P1-02/ADR0004",
    "checks": [
        {"kind": "focused library/source replay", "tests": 40, "failures": 0, "exit_code": 0,
         "includes_unchanged_lead_probe": True, "record": "focused-results.json"},
        {"kind": "actual extracted controller + recording UI stand-ins", "tests": 8, "failures": 0,
         "exit_code": 0, "record": "controller-final-result.json"},
        {"kind": "exact-command approved local held-pipe/partial-line check", "tests": 1,
         "failures": 0, "exit_code": 0, "record": "focused-realchild-result.json"},
        {"kind": "separate library module emit/public controller interface/app syntax",
         "exit_code": 0, "record": "interface-results.json"},
        {"kind": "existing synthetic fixture producer", "tests": 1, "failures": 0,
         "record": "interface-results.json"},
        {"kind": "released fixture validation", "checks": 211, "lines": 10, "turns": 6,
         "exit_code": 0, "record": "interface-results.json"},
    ],
    "source_bindings": "final-binding-check.json",
    "native_test_declarations": 151,
    "full_native_or_linux_151_suite_run": False,
    "full_mutation_campaign_run": False,
    "native_macos_compiled_or_device_verified": False,
    "actual_provider_account_model_audio_or_paid_call": False,
    "initial_failed_runs": ["focused-emission-failure-tests.txt", "focused-restricted-41-tests.txt",
                            "focused-realchild-entrypoint-failure.txt", "interface-validator-preliminary.txt"],
    "remaining": "Lead exact-source integration/CI/native macOS build and separately coordinated interactive acceptance. NativeSpeech/native-voice import remains pending.",
})
files = sorted(path for path in HERE.rglob("*") if path.is_file()
               and path.name != "SHA256SUMS" and "__pycache__" not in path.parts)
(HERE / "SHA256SUMS").write_text("".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(HERE)}\n" for path in files))
print(f"Recorded completed focused checks; checksummed {len(files)} retained artifacts.")
