#!/usr/bin/env python3
"""Bind correction source and unchanged released inputs without modifying them."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
BASELINE = "c9177096c99c2562e4474bcbb2f4ffc8beb43c18"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def at_baseline(path):
    return subprocess.check_output(["git", "show", f"{BASELINE}:{path}"], cwd=ROOT)


previous = json.loads((HERE.parent / "source-sha256.json").read_text())
target = ROOT / "apps/macos/CompanionDesktop"
paths = [target / "Package.swift", target / "README.md"]
for folder in ["Sources", "Tests", "checks"]:
    paths += sorted(path for path in (target / folder).rglob("*")
                    if path.is_file() and path.suffix in [".swift", ".py"])
owned = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in paths}
released = {}
for path in previous["released_read_only_inputs"]:
    actual = sha((ROOT / path).read_bytes())
    expected = sha(at_baseline(path))
    if actual != expected:
        raise SystemExit(f"Released input differs from assigned baseline: {path}")
    released[path] = actual
translations = json.loads((ROOT / "docs/requirements/english-translation-manifest.json").read_text())
language = []
for pair in translations["files"]:
    for prefix in ["source", "translation"]:
        path = pair[prefix + "_path"]
        actual = sha((ROOT / path).read_bytes())
        if actual != pair[prefix + "_sha256"] or actual != sha(at_baseline(path)):
            raise SystemExit(f"Source/English drift: {path}")
        language.append({"path": path, "sha256": actual})
(HERE / "source-sha256.json").write_text(json.dumps({
    "schema_version": 1,
    "binding": "Commit containing this manifest; source-only checks do not imply native acceptance.",
    "predecessor_candidate": "3147291f449105c06255cfc0ea2056f1b2582437",
    "assigned_review_baseline": BASELINE,
    "wire_version": "lc-subscription-live/1",
    "owned_sources": owned,
    "released_read_only_inputs": released,
    "english_source_manifest_check": {"matching_files": len(language), "files": language},
}, indent=2) + "\n")
print(f"Bound {len(owned)} owned files, {len(released)} unchanged released inputs, {len(language)} matching original/English files.")
