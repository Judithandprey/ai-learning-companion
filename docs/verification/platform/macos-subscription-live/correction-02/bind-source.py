#!/usr/bin/env python3
"""Bind the MAC-LIVE-03 delivery bytes; do not execute or imply native tests."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
BASELINE = "8467e0a55113455f62067d97a8774dca889c3d88"
PARENT = "4f6c327018d46604b21c57ab4ebf2b0e45278f70"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require_hash(path, expected):
    actual = sha((ROOT / path).read_bytes())
    if actual != expected:
        raise SystemExit(f"Source drift: {path}")
    return actual


previous = json.loads((HERE.parent / "correction-01/source-sha256.json").read_text())
target = ROOT / "apps/macos/CompanionDesktop"
paths = [target / "Package.swift", target / "README.md"]
for folder in ["Sources", "Tests", "checks"]:
    paths += sorted(path for path in (target / folder).rglob("*")
                    if path.is_file() and path.suffix in [".swift", ".py"])
owned = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in paths}
released = {}
for path in previous["released_read_only_inputs"]:
    baseline = subprocess.check_output(["git", "show", f"{BASELINE}:{path}"], cwd=ROOT)
    released[path] = require_hash(path, sha(baseline))
translations = json.loads((ROOT / "docs/requirements/english-translation-manifest.json").read_text())
language = []
for pair in translations["files"]:
    for prefix in ["source", "translation"]:
        path = pair[prefix + "_path"]
        actual = require_hash(path, pair[prefix + "_sha256"])
        baseline = subprocess.check_output(["git", "show", f"{BASELINE}:{path}"], cwd=ROOT)
        if actual != sha(baseline):
            raise SystemExit(f"Assigned requirement baseline drift: {path}")
        language.append({"path": path, "sha256": actual})

replay_counts = {}
for group in ["paired", "controller", "controls"]:
    manifest = json.loads((HERE / f"frame-answer/{group}-manifest.json").read_text())
    for path, expected in manifest["source_files"].items():
        require_hash(path, expected)
    replay_counts[group] = len(manifest["source_files"])
interface = json.loads((HERE / "interface/interface-source-manifest.json").read_text())
interface_count = 0
for item in interface["files"]:
    if "source_sha256" in item:
        require_hash(item["path"], item["source_sha256"])
        interface_count += 1
reviewed = re.findall(r"\| `([^`]+)` \| `([0-9a-f]{64})` \|", (HERE / "review.md").read_text())
for path, expected in reviewed:
    require_hash(path, expected)

(HERE / "source-sha256.json").write_text(json.dumps({
    "schema_version": 1,
    "binding": "Commit containing this manifest; Linux stand-in evidence is not native acceptance.",
    "predecessor_candidate": PARENT,
    "original_native_leaf": "3147291f449105c06255cfc0ea2056f1b2582437",
    "assigned_review_baseline": BASELINE,
    "wire_version": "lc-subscription-live/1",
    "owned_sources": owned,
    "released_read_only_inputs": released,
    "english_source_manifest_check": {"matching_files": len(language), "files": language},
    "independent_source_binding": {
        "matching_replay_sources_by_group": replay_counts,
        "matching_interface_inputs": interface_count,
        "matching_reviewed_files": len(reviewed),
    },
}, indent=2) + "\n")
print(f"Bound {len(owned)} owned files, {len(released)} unchanged released inputs, "
      f"{len(language)} matching original/English files; replay/compiler/review hashes match.")
