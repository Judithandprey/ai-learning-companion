#!/usr/bin/env python3
"""Confirm that the executed final harnesses used the current owned source bytes."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
checks = {}
for name in ["focused-final-source-manifest.json", "controller-final-source-manifest.json",
             "interface-source-manifest.json", "interface-fixture-source-manifest.json"]:
    data = json.loads((HERE / name).read_text())
    if "original_sources" in data:
        sources = list(data["original_sources"].items())
    else:
        sources = [(row["path"], row["source_sha256"]) for row in data["files"]
                   if row["path"].startswith("apps/macos/")]
    drift = [path for path, expected in sources
             if hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != expected]
    if drift:
        raise SystemExit(f"{name} drift: {drift}")
    checks[name] = {"owned_sources_checked": len(sources), "source_drift": []}
baseline_probe = subprocess.check_output(["git", "show",
    "c9177096c99c2562e4474bcbb2f4ffc8beb43c18:docs/verification/lead/live-windows/macos-live-review/queued-presentation-probe.swift"], cwd=ROOT)
if baseline_probe != (HERE / "lead-queued-presentation-probe.swift").read_bytes():
    raise SystemExit("Lead probe changed")
(HERE / "final-binding-check.json").write_text(json.dumps({
    "harnesses": checks, "lead_counterexample_unchanged": True,
    "native_or_real_ai_acceptance": False,
}, indent=2) + "\n")
print("PASS: all four final harness snapshots match current owned sources; lead counterexample is unchanged.")
