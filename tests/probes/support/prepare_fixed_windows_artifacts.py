#!/usr/bin/env python3
"""Prepare pinned existing artifacts in a fresh /tmp directory; launch nothing."""

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import zipfile

REPO = Path("/home/agentsdock/Projects/learning-companion/wt-support")
SOURCE = Path("/home/agentsdock/Projects/learning-companion/repo/apps/windows")
MANIFEST_REF = (
    "194986dea3e120a3b8806a9e7bb2c06bfefb5cf7:"
    "docs/verification/lead/live-windows/nonvoice-driver-review/stage-0ff325b.json"
)
COMPILE_REF = (
    "ad7bd72a8e902b366fbbb71d90f530c18043a251:"
    "docs/verification/lead/live-windows/approved-two-gates/tts-integration/compile.json"
)
PRODUCT = "0ff325beadb7c689244610307b6aa16d638fd2e6"
TREE = "081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a"
ARCHIVE = Path(
    "/home/agentsdock/.cache/electron/"
    "773aa4e04f5abf2d0c5fef6d69bfaa8ef10f8e9615d6ee8300fd1f572dfbc32b/"
    "electron-v44.5.1-win32-x64.zip"
)
# The observed existing cache identity, not a newly retrieved release checksum.
ARCHIVE_SHA = "9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tree_hash(files):
    return sha("".join(f"{p}\0{h}\n" for p, h in sorted(files.items())).encode())


def regular_bytes(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError(f"Not a regular file: {path}")
    return path.read_bytes()


def relative_name(name):
    path = PurePosixPath(name)
    if (
        path.is_absolute()
        or "\\" in name
        or ":" in name
        or any(part in ("", ".", "..") for part in name.rstrip("/").split("/"))
    ):
        raise ValueError(f"Unsafe artifact path: {name!r}")
    return path


def save_json(path, value):
    with path.open("x") as output:
        output.write(json.dumps(value, indent=2) + "\n")


def main():
    if len(sys.argv) != 2:
        raise ValueError("usage: prepare_fixed_windows_artifacts.py <fresh-/tmp-path>")
    target = Path(sys.argv[1])
    if not target.is_absolute() or target.resolve() != target or Path("/tmp") not in target.parents:
        raise ValueError("Output must be a fresh canonical path beneath /tmp")
    target.mkdir()  # Refuse to reuse or replace an existing preparation.
    manifest_bytes = subprocess.check_output(["git", "show", MANIFEST_REF], cwd=REPO)
    compile_bytes = subprocess.check_output(["git", "show", COMPILE_REF], cwd=REPO)
    manifest = json.loads(manifest_bytes)
    expected = manifest["files"]
    assert manifest["source_commit"] == PRODUCT
    assert len(expected) == manifest["file_count"] == 81
    assert manifest["tree_sha256"] == tree_hash(expected) == TREE
    assert sha(compile_bytes) == expected["dist/apps/windows/native/build.json"]
    (target / "original-stage-manifest.json").write_bytes(manifest_bytes)
    (target / "original-compile-receipt.json").write_bytes(compile_bytes)

    stage = target / "lc-windows-admission-0ff325b"
    stage.mkdir()
    stage_rows = []
    for name, digest in sorted(expected.items()):
        relative = relative_name(name)
        source = SOURCE / relative
        data = regular_bytes(source)
        if sha(data) != digest:
            raise ValueError(f"Source no longer matches pinned payload: {source}")
        destination = stage / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            output.write(data)
        assert sha(regular_bytes(destination)) == digest
        stage_rows.append({
            "path": name, "bytes": len(data), "sha256": digest,
            "source": str(source), "readback_match": True,
        })
    actual = {
        p.relative_to(stage).as_posix(): sha(regular_bytes(p))
        for p in stage.rglob("*") if p.is_file()
    }
    assert actual == expected and tree_hash(actual) == TREE

    archive_bytes = regular_bytes(ARCHIVE)
    assert sha(archive_bytes) == ARCHIVE_SHA
    runtime = target / "lc-electron-44.5.1-win32-x64"
    runtime.mkdir()
    runtime_rows = []
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        entries = archive.infolist()
        names = [relative_name(entry.filename).as_posix() for entry in entries]
        assert len(names) == len(set(names))
        for entry in entries:
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"Symlink archive entry: {entry.filename}")
        for entry in entries:
            destination = runtime / relative_name(entry.filename)
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with archive.open(entry) as source, destination.open("xb") as output:
                while block := source.read(1024 * 1024):
                    digest.update(block)
                    output.write(block)
            # Reading the complete member also checks its ZIP CRC.
            assert sha(regular_bytes(destination)) == digest.hexdigest()
            assert destination.stat().st_size == entry.file_size
            runtime_rows.append({
                "path": entry.filename, "bytes": entry.file_size,
                "sha256": digest.hexdigest(), "zip_crc32": f"{entry.CRC:08x}",
                "readback_match": True,
            })
    runtime_files = {row["path"]: row["sha256"] for row in runtime_rows}
    assert runtime_files["electron.exe"] == manifest["runtime_executable_sha256"]
    assert regular_bytes(runtime / "version") == b"44.5.1"
    assert "resources/default_app.asar" in runtime_files
    receipt = {
        "status": "PREPARED_NOT_INSTALLED_OR_RUN",
        "product_commit": PRODUCT,
        "manifest_ref": MANIFEST_REF,
        "manifest_sha256": sha(manifest_bytes),
        "compile_receipt_ref": COMPILE_REF,
        "compile_receipt_sha256": sha(compile_bytes),
        "stage": str(stage),
        "stage_file_count": len(actual),
        "stage_tree_sha256": tree_hash(actual),
        "stage_files": stage_rows,
        "runtime": str(runtime),
        "runtime_archive_source": str(ARCHIVE),
        "runtime_archive_bytes": len(archive_bytes),
        "runtime_archive_sha256": ARCHIVE_SHA,
        "runtime_archive_entries": len(entries),
        "runtime_file_count": len(runtime_files),
        "runtime_tree_sha256": tree_hash(runtime_files),
        "runtime_files": runtime_rows,
        "recompiled": False,
        "downloaded": False,
        "existing_windows_paths_modified": False,
        "application_or_native_helper_executed": False,
        "account_provider_display_audio_access": False,
        "resource_allocation_issued": False,
    }
    save_json(target / "prepared-inventory.json", receipt)
    print(json.dumps({k: v for k, v in receipt.items() if k not in ("stage_files", "runtime_files")}, indent=2))


if __name__ == "__main__":
    main()
