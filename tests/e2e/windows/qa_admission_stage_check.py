#!/usr/bin/env python3
"""Read only the exact staged 0ff325b admission build; never compile, load or execute it.

The Lead staged product 0ff325b (Web's reviewed source-admission interlock) as %TEMP%\\lc-windows-admission-0ff325b and
committed its readback manifest at 194986d. This checks the stage file for file against that manifest (81 files, the
tree hash, the entry point), the unchanged native helper against its local build receipt and source, and the cached
Electron 44.5.1 runtime. Unexpected files are listed without reading them.
"""
import json
from pathlib import Path
import subprocess
import sys

from qa_live_stage_check import REPO, hash_file, inventory, sha256

SOURCE = "0ff325beadb7c689244610307b6aa16d638fd2e6"
RELEASE = "194986dea3e120a3b8806a9e7bb2c06bfefb5cf7"
MANIFEST = "docs/verification/lead/live-windows/nonvoice-driver-review/stage-0ff325b.json"
# The native helper is byte-identical to the 52be105 stage's; its local build receipt is that release's compile.json.
NATIVE_RECEIPT = ("ad7bd72a8e902b366fbbb71d90f530c18043a251", "docs/verification/lead/live-windows/approved-two-gates/tts-integration/compile.json")
STAGE = Path("/mnt/c/Users/ROG/AppData/Local/Temp/lc-windows-admission-0ff325b")
RUNTIME = STAGE.parent / "lc-electron-44.5.1-win32-x64"
TREE = "081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a"
FILES = 81
ENTRY = "dist/apps/windows/src/main/main.js"
ELECTRON = "49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa"


def committed(revision, path):
    return subprocess.check_output(["git", "-C", str(REPO), "show", f"{revision}:{path}"])


def verify():
    manifest_bytes = committed(RELEASE, MANIFEST)
    manifest = json.loads(manifest_bytes)
    compile_bytes = committed(*NATIVE_RECEIPT)
    build = json.loads(compile_bytes)
    expected = manifest["files"]
    if (len(expected) != FILES or manifest.get("file_count") != FILES or manifest.get("name") != STAGE.name or manifest.get("tree_sha256") != TREE
            or manifest.get("source_commit") != SOURCE or manifest.get("entrypoint") != ENTRY or manifest.get("runtime_executable_sha256") != ELECTRON
            or any(Path(n).is_absolute() or ".." in Path(n).parts for n in expected)):
        raise ValueError("exact assigned manifest required")
    if STAGE.is_symlink() or not STAGE.is_dir() or RUNTIME.is_symlink() or not RUNTIME.is_dir():
        raise ValueError("regular assigned stage/runtime directories required")
    actual, nonregular = inventory(STAGE)
    missing = sorted(set(expected) - actual)
    unexpected = sorted(actual - set(expected))
    hashes = {n: hash_file(STAGE / n) for n in sorted(set(expected) & actual)}
    differing = [n for n, digest in hashes.items() if digest != expected[n]]
    tree = sha256("".join(f"{n}\0{digest}\n" for n, digest in sorted(hashes.items())).encode())
    # Read only manifest-listed payloads; unexpected filenames are listed, never opened.
    package = json.loads((STAGE / "package.json").read_bytes()) if "package.json" in hashes else {}
    native = "dist/apps/windows/native/"
    source_sha = sha256(committed(SOURCE, "apps/windows/native/NativeSpeech.cs"))
    build_match = (build.get("schema") == "lc-native-speech-build/1"
                   and build.get("mode") == "local-compilation" and build.get("status") == 0
                   and build.get("error") is None
                   and source_sha == build.get("source_sha256") == hashes.get(native + "NativeSpeech.cs")
                   and build.get("executable_sha256") == hashes.get(native + "NativeSpeech.exe")
                   and sha256(compile_bytes) == hashes.get(native + "build.json"))
    runtime_hashes = {n: hash_file(RUNTIME / n) for n in ("electron.exe", "version", "resources/default_app.asar")}
    version = (RUNTIME / "version").read_text().strip()
    passed = (not missing and not unexpected and not nonregular and not differing and tree == TREE
              and package.get("main") == ENTRY and build_match
              and runtime_hashes["electron.exe"] == ELECTRON and version == "44.5.1")
    return {
        "kind": "qa-admission-static-file-identity/v1", "passed": passed,
        "status": "passed" if passed else "failed", "source_commit": SOURCE, "release_commit": RELEASE,
        "stage": str(STAGE), "runtime": str(RUNTIME), "expected_payload_files": FILES,
        "matching_payload_files": len(hashes) - len(differing), "actual_payload_files": len(actual),
        "missing_files": missing, "unexpected_files": unexpected, "nonregular_entries": nonregular,
        "differing_files": differing, "file_sha256": hashes, "manifest_sha256": sha256(manifest_bytes),
        "tree_sha256_algorithm": "SHA256(UTF8(sorted relative POSIX path + NUL + file SHA256 hex + LF))",
        "tree_sha256": tree, "entrypoint": {"path": ENTRY, "sha256": hashes.get(ENTRY), "package_main": package.get("main")},
        "native_local_build_receipt_and_source_match": build_match,
        "native_executable_sha256": hashes.get(native + "NativeSpeech.exe"),
        "electron_runtime": {"version_file_value": version, "file_sha256": runtime_hashes, "binary_executed": False,
                             "distribution_authentication_performed": False},
        "app_or_helper_launched": False, "provider_requests": 0, "resource_lease": "NONE",
        "windows_process_invoked": False, "stage_or_runtime_modified": False,
        "limitation": "Point-in-time static identity only. No native, GUI, audio, account, microphone or product acceptance.",
    }


if __name__ == "__main__":
    try:
        report = verify()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        report = {"kind": "qa-admission-static-file-identity/v1", "passed": False, "status": "error",
                  "error": f"{type(error).__name__}: {error}", "app_or_helper_launched": False, "provider_requests": 0}
    print(json.dumps(report, indent=2, sort_keys=True))
    sys.exit(0 if report["passed"] else 1)
