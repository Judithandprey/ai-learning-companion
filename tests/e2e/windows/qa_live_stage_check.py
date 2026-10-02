#!/usr/bin/env python3
"""Read-only identity check; prints JSON and never launches or changes the stage.

Run: python3 -B tests/e2e/windows/qa_live_stage_check.py
The assigned builder excludes its subsequently written stage-manifest.json from
the 70 payload files. That sidecar is checked separately against committed bytes.
Unexpected files are listed without reading them (they may contain private data).
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


REPO = Path(__file__).resolve().parents[3]
EVIDENCE_COMMIT = "24c48c38aee660b606ebff5285acbd2ccb300392"
REVIEW = "docs/verification/lead/live-windows/consumer-review/correction"
STAGE = Path("/mnt/c/Users/ROG/AppData/Local/Temp/lc-windows-live-1755153")
RUNTIME = STAGE.parent / "lc-electron-44.5.1-win32-x64"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def committed(path):
    return subprocess.check_output(["git", "-C", str(REPO), "show", f"{EVIDENCE_COMMIT}:{path}"])


def hash_file(path):
    # Reject links and report a concurrent change rather than a stable-file pass.
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError(f"not a regular file: {path}")
    with path.open("rb") as handle:
        before = os.fstat(handle.fileno())
        digest = hashlib.sha256()
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
        after = os.fstat(handle.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError(f"changed while read: {path}")
    return digest.hexdigest()


def inventory(root):
    files, nonregular = set(), []

    def walk(folder):
        for path in sorted(folder.iterdir()):
            mode = path.lstat().st_mode
            name = path.relative_to(root).as_posix()
            if stat.S_ISDIR(mode):
                walk(path)
            elif stat.S_ISREG(mode):
                files.add(name)
            else:
                nonregular.append(name)

    walk(root)
    return files, nonregular


def verify():
    manifest_bytes = committed(f"{REVIEW}/stage-manifest.json")
    manifest = json.loads(manifest_bytes)
    receipt = json.loads(committed(f"{REVIEW}/receipt.json"))
    expected = manifest["files"]
    if len(expected) != 70 or receipt["verified_staged_files"] != 70:
        raise ValueError("assigned manifest/receipt does not identify exactly 70 payload files")
    if manifest["tree_sha256"] != receipt["stage_tree_sha256"] or manifest["name"] != receipt["stage_name"]:
        raise ValueError("assigned manifest and receipt disagree")
    if any(Path(name).is_absolute() or ".." in Path(name).parts for name in expected):
        raise ValueError("unsafe manifest path")

    result = {
        "kind": "static-file-identity-only",
        "evidence_commit": EVIDENCE_COMMIT,
        "source_commit_as_recorded": receipt["source_commit"],
        "manifest_path": f"{REVIEW}/stage-manifest.json",
        "manifest_sha256": sha256(manifest_bytes),
        "stage": str(STAGE),
        "runtime": str(RUNTIME),
        "expected_payload_files": 70,
        "app_launched": False,
        "provider_requests": 0,
        "display_audio_microphone_account_access": False,
        "stage_or_runtime_modified": False,
        "unexpected_files": [],
        "dependencies": [],
    }
    stage_ok = False
    if STAGE.is_symlink() or not STAGE.is_dir():
        result["dependencies"].append(f"regular candidate directory required at {STAGE}")
    else:
        actual, nonregular = inventory(STAGE)
        missing = sorted(set(expected) - actual)
        unexpected = sorted(actual - set(expected) - {"stage-manifest.json"})
        hashes = {name: hash_file(STAGE / name) for name in sorted(set(expected) & actual)}
        differing = [{"path": name, "expected": expected[name], "actual": value}
                     for name, value in hashes.items() if value != expected[name]]
        tree = sha256("".join(f"{name}\0{value}\n" for name, value in sorted(hashes.items())).encode())
        sidecar_sha = hash_file(STAGE / "stage-manifest.json") if "stage-manifest.json" in actual else None
        package = json.loads((STAGE / "package.json").read_bytes()) if "package.json" in hashes else {}
        entrypoint = receipt["entrypoint"]
        result.update({
            "actual_regular_files_including_manifest": len(actual),
            "actual_payload_files": len(actual - {"stage-manifest.json"}),
            "matching_payload_files": len(hashes) - len(differing),
            "missing_files": missing,
            "unexpected_files": unexpected,
            "nonregular_entries": nonregular,
            "differing_files": differing,
            "sidecar_manifest_sha256": sidecar_sha,
            "sidecar_matches_committed_bytes": sidecar_sha == result["manifest_sha256"],
            "tree_sha256_algorithm": "SHA256(UTF8(sorted relative POSIX path + NUL + file SHA256 hex + LF))",
            "expected_tree_sha256": manifest["tree_sha256"],
            "observed_expected_payload_tree_sha256": tree,
            "complete_payload_tree_sha256": tree if not missing and not unexpected and not nonregular else None,
            "entrypoint": {"path": entrypoint, "sha256": hashes.get(entrypoint),
                           "package_main": package.get("main"), "app_version": package.get("version")},
        })
        stage_ok = (not missing and not unexpected and not nonregular and not differing
                    and tree == manifest["tree_sha256"]
                    and sidecar_sha == result["manifest_sha256"] and package.get("main") == entrypoint)

    runtime_ok = False
    if RUNTIME.is_symlink() or not RUNTIME.is_dir():
        result["dependencies"].append(f"regular Electron runtime directory required at {RUNTIME}")
    else:
        names = ("electron.exe", "version", "resources/default_app.asar")
        absent = [name for name in names if not (RUNTIME / name).is_file() or (RUNTIME / name).is_symlink()]
        for name in absent:
            result["dependencies"].append(f"regular Electron runtime file required at {RUNTIME / name}")
        runtime_hashes = {name: hash_file(RUNTIME / name) for name in names if name not in absent}
        version = (RUNTIME / "version").read_text().strip() if "version" not in absent else None
        result["electron_runtime"] = {
            "version_file_value": version, "expected_version_from_receipt": receipt["electron"],
            "file_sha256": runtime_hashes, "version_source": "existing runtime/version file; binary not executed",
            "hashes_compared_to_trusted_distribution": False,
        }
        runtime_ok = not absent and version == receipt["electron"]

    result["stage_payload_identity_passed"] = stage_ok
    result["runtime_files_and_recorded_version_present"] = runtime_ok
    result["passed"] = stage_ok and runtime_ok
    result["status"] = "passed" if result["passed"] else "blocked" if result["dependencies"] else "failed"
    result["limitation"] = "File identity only; no launch, device, provider, UI, speech, audio or product acceptance."
    return result


if __name__ == "__main__":
    try:
        report = verify()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        report = {"kind": "static-file-identity-only", "status": "error", "passed": False,
                  "error": f"{type(error).__name__}: {error}", "app_launched": False, "provider_requests": 0}
    print(json.dumps(report, indent=2, sort_keys=True))
    sys.exit(0 if report["passed"] else 1)
