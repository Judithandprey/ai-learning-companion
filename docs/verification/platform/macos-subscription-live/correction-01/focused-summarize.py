#!/usr/bin/env python3
"""Bind actual focused XCTest output to the exact replay snapshot and selection."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

WORKTREE = Path("/home/agentsdock/Projects/learning-companion/wt-platform")
EVIDENCE = Path(__file__).resolve().parent
HARNESS = Path("/tmp/lc-live-correction-focused")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exit-code", type=int, required=True)
    args = parser.parse_args()
    log = EVIDENCE / "focused-final-tests.txt"
    text = log.read_text()
    selection = json.loads((HARNESS / "selection.json").read_text())
    manifest = json.loads((HARNESS / "source-manifest.json").read_text())
    selected = [method for group in selection["groups"].values() for method in group]
    started = re.findall(r"Test Case '[^']*\.(test\w+)' started", text)
    finished = re.findall(r"Test Case '[^']*\.(test\w+)' (passed|failed)", text)
    passed = [method for method, state in finished if state == "passed"]
    failed = [method for method, state in finished if state == "failed"]
    missing = sorted(set(selected) - {method for method, _ in finished})
    extra = sorted({method for method, _ in finished} - set(selected))
    drift = [item["path"] for item in manifest["files"]
             if digest(WORKTREE / item["path"]) != item["source_sha256"]]
    summaries = re.findall(r"Executed (\d+) tests?, with (\d+) failures? \((\d+) unexpected\)", text)
    group_counts = {
        group: {"selected": len(methods), "passed": len(set(methods) & set(passed)),
                "failed": len(set(methods) & set(failed))}
        for group, methods in selection["groups"].items()
    }
    app_paths = ["CaptureController.swift", "CaptureRun.swift", "LiveController.swift"]
    app = {"apps/macos/CompanionDesktop/Sources/CompanionDesktop/" + name:
           digest(WORKTREE / "apps/macos/CompanionDesktop/Sources/CompanionDesktop" / name)
           for name in app_paths}
    for source, name in [(HARNESS / "source-manifest.json", "focused-final-source-manifest.json"),
                         (HARNESS / "selection.json", "focused-final-selection.json"),
                         (HARNESS / "src/main.swift", "focused-main.swift")]:
        shutil.copy2(source, EVIDENCE / name)
    result = {
        "kind": "focused-linux-correction-replay", "test_exit_code": args.exit_code,
        "selected_methods": len(selected), "started_methods": len(started),
        "finished_methods": len(finished), "passed_methods": len(passed), "failed_methods": len(failed),
        "raw_xctest_summaries": [list(map(int, summary)) for summary in summaries],
        "missing_methods": missing, "extra_methods": extra,
        "duplicate_finished_methods": len(finished) != len({method for method, _ in finished}),
        "source_drift": drift, "groups": group_counts, "reviewed_app_source_sha256": app,
        "artifact_sha256": {name: digest(EVIDENCE / name) for name in [
            "focused-final-typecheck.txt", "focused-final-tests.txt", "focused-final-source-manifest.json",
            "focused-final-selection.json", "focused-main.swift", "focused-prepare.py",
            "focused-40-run-genmain.py", "focused-40-run-replay.sh", "focused-summarize.py"]},
        "separate_entrypoint_preparation_sha256": {name: digest(EVIDENCE / name) for name in [
            "focused-genmain.py", "focused-replay.sh", "focused-realchild-main.swift", "focused-realchild-selection.json"]},
        "compiled_or_executed_native_macos": False, "actual_ai_or_account_call": False,
        "separate_exact_command_approval": selection.get("separate_exact_command_approval", []),
        "limits": "Linux framework substitutions and fake connectors; held-pipe local-child control separated for exact-command approval after restricted CFSocket failure. No AppKit UI or real ScreenCaptureKit callback/device/provider acceptance.",
    }
    result["pass"] = (args.exit_code == 0 and len(started) == len(selected) and len(finished) == len(selected)
                      and not failed and not missing and not extra and not drift
                      and not result["duplicate_finished_methods"])
    (EVIDENCE / "focused-results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS={result['pass']}; selected={len(selected)}; started={len(started)}; finished={len(finished)}; "
          f"passed={len(passed)}; failed={len(failed)}; source_drift={len(drift)}")
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
