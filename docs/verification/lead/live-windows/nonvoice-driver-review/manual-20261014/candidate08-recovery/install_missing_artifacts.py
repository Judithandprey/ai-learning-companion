"""Restore only missing, previously reviewed test artifacts. Never execute them."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
from datetime import datetime, timezone

PREP = Path("/tmp/support-artifact-recovery-0ff325b-riehg1x0/prepared")
DEST = Path("/mnt/c/Users/ROG/AppData/Local/Temp")
INVENTORY = "b4615e963df0217e2344609cd64688d680762425ce2b92705db6bd4460fc5d16"
REF = "194986dea3e120a3b8806a9e7bb2c06bfefb5cf7:docs/verification/lead/live-windows/nonvoice-driver-review/stage-0ff325b.json"


def digest(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError(f"Not a regular file: {path.name}")
    h = hashlib.sha256()
    with path.open("rb") as f:
        before = os.fstat(f.fileno())
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
        after = os.fstat(f.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError(f"File changed during read: {path.name}")
    return h.hexdigest()


def safe_parents(path, root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError("Invalid artifact root")
    current = root
    for part in path.parent.relative_to(root).parts:
        current /= part
        if current.is_symlink() or (current.exists() and not current.is_dir()):
            raise ValueError(f"Invalid artifact parent: {current.name}")


install = sys.argv[1:] == ["--install"]
if sys.argv[1:] not in ([], ["--install"]):
    raise ValueError("Only --install is supported")
inventory_bytes = (PREP / "prepared-inventory.json").read_bytes()
assert hashlib.sha256(inventory_bytes).hexdigest() == INVENTORY
inv = json.loads(inventory_bytes)
manifest = json.loads(subprocess.check_output(["git", "show", REF]))
assert {r["path"]: r["sha256"] for r in inv["stage_files"]} == manifest["files"]
assert len(inv["stage_files"]) == 81 and len(inv["runtime_files"]) == 73
assert digest(Path(inv["runtime_archive_source"])) == inv["runtime_archive_sha256"]
jobs = []
for kind, name in [
    ("stage", "lc-windows-admission-0ff325b"),
    ("runtime", "lc-electron-44.5.1-win32-x64"),
]:
    expected = {r["path"]: r["sha256"] for r in inv[kind + "_files"]}
    assert len(expected) == len(inv[kind + "_files"])
    target_root = DEST / name
    if target_root.is_symlink() or (target_root.exists() and not target_root.is_dir()):
        raise ValueError("Invalid artifact directory")
    actual = set()
    if target_root.exists():
        for path in target_root.rglob("*"):
            if path.is_symlink():
                raise ValueError("Linked artifact destination")
            if path.is_file():
                actual.add(path.relative_to(target_root).as_posix())
    if actual - expected.keys():
        raise ValueError("Unexpected destination files; preserve and stop")
    for rel, wanted in sorted(expected.items()):
        parts = PurePosixPath(rel)
        if parts.is_absolute() or ".." in parts.parts or "\\" in rel or ":" in rel:
            raise ValueError("Invalid inventory relative path")
        source, target = PREP / name / rel, target_root / rel
        safe_parents(source, PREP)
        safe_parents(target, DEST)
        assert digest(source) == wanted
        if target.exists() and digest(target) != wanted:
            raise ValueError(f"Existing differing file; preserve and stop: {rel}")
        jobs.append((kind, rel, source, target, wanted, target.exists()))

record = {
    "at_utc": datetime.now(timezone.utc).isoformat(),
    "inventory_sha256": INVENTORY,
    "mode": "install_missing_only" if install else "read_only_precheck",
    "existing_overwritten": 0,
    "applications_or_helpers_executed": False,
    "account_provider_display_audio_access": False,
    "downloaded": False,
    "resource_allocation_issued": False,
    "groups": {},
}
for kind in ("stage", "runtime"):
    group = [j for j in jobs if j[0] == kind]
    record["groups"][kind] = {
        "expected": len(group),
        "existing_matching": sum(j[5] for j in group),
        "missing": sum(not j[5] for j in group),
        "restored": 0,
    }
for kind, rel, source, target, wanted, existed in jobs:
    if install and not existed:
        safe_parents(target, DEST)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation refuses any concurrent writer; no existing file is replaced.
        with source.open("rb") as src, target.open("xb") as dst:
            for block in iter(lambda: src.read(1024 * 1024), b""):
                dst.write(block)
            dst.flush()
            os.fsync(dst.fileno())
        assert digest(target) == wanted
        record["groups"][kind]["restored"] += 1
if install:
    for _, _, _, target, wanted, _ in jobs:
        assert digest(target) == wanted
    record["installed_readback_files_matched"] = len(jobs)
print(json.dumps(record, indent=2))
