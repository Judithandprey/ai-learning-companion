"""Build or verify the exact-source archive used by tests/e2e/test_p0_13_fixture_review.py.

The P0-13 checks review learning deliveries that are not ancestors of main
(aa598bc, fb445ed, 7da2298). A fresh clone of main therefore lacks their Git
objects. This archive keeps the exact pinned bytes, content-addressed by SHA-256,
with the original commit and path of every entry. Nothing is regenerated or
relabelled: bytes come from `git show <commit>:<path>` and are stored unchanged.

  python3 tests/e2e/sources/p0_13/build_archive.py            # verify (default)
  python3 tests/e2e/sources/p0_13/build_archive.py --write    # (re)build from Git objects

Verify mode checks every blob against its recorded hash and, when the original
Git object is available, byte-for-byte against it. It exits non-zero on any
mismatch or missing blob.
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
V1 = "services/learning/fixtures/problem_solving_v1"
SURF = "services/learning/fixtures/problem_solving_surfaces_v1"
REVIEW = "docs/verification/learning"
AA = "aa598bc20e5b4f4d726ca537b2b0a9a3449b1fef"
FB = "fb445edda3f96d561c27029075008922d2033eb9"
DA = "7da229860e10a3525dbddd735a070acfe93d8913"

ENTRIES = (
    [(AA, f"{V1}/{n}") for n in ("cases.json", "labels.json", "manifest.json", "author_cases.py")]
    + [(AA, "tests/evals/process_rules.py")]
    + [(FB, f"{V1}/{n}") for n in ("cases.json", "labels.json", "manifest.json", "author_cases.py")]
    + [(FB, f"{SURF}/{n}") for n in ("cases.json", "labels.json", "manifest.json", "author_cases.py")]
    + [(FB, "tests/evals/surface_rules.py")]
    + [(DA, f"{V1}/{n}") for n in ("cases.json", "labels.json")]
    + [(DA, f"{SURF}/{n}") for n in ("cases.json", "labels.json")]
    + [(DA, f"{REVIEW}/{n}") for n in ("p0-10-review-revisions.json", "p0-10-review-probe-results.json", "p0-10-review-probes.py")]
)


def git_object(commit, path):
    result = subprocess.run(["git", "-C", str(ROOT), "show", f"{commit}:{path}"], capture_output=True)
    return result.stdout if result.returncode == 0 else None


def write():
    (HERE / "blobs").mkdir(exist_ok=True)
    entries = []
    for commit, path in ENTRIES:
        data = git_object(commit, path)
        if data is None:
            sys.exit(f"missing Git object {commit[:7]}:{path}; cannot build")
        digest = hashlib.sha256(data).hexdigest()
        (HERE / "blobs" / digest).write_bytes(data)
        entries.append({"commit": commit, "path": path, "sha256": digest, "bytes": len(data)})
    manifest = {"kind": "qa-p0-13-exact-source-archive/v1",
                "note": "Exact bytes of learning deliveries that are not main ancestors; content-addressed; never edited.",
                "entries": entries}
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(entries)} entries, {len({e['sha256'] for e in entries})} blobs")


def verify():
    manifest = json.loads((HERE / "manifest.json").read_text())
    problems, cross_checked = [], 0
    for e in manifest["entries"]:
        blob = HERE / "blobs" / e["sha256"]
        if not blob.exists():
            problems.append(f"missing blob for {e['commit'][:7]}:{e['path']}")
            continue
        data = blob.read_bytes()
        if hashlib.sha256(data).hexdigest() != e["sha256"] or len(data) != e["bytes"]:
            problems.append(f"blob drift for {e['commit'][:7]}:{e['path']}")
        original = git_object(e["commit"], e["path"])
        if original is not None:
            cross_checked += 1
            if original != data:
                problems.append(f"archive differs from Git object {e['commit'][:7]}:{e['path']}")
    print(f"{len(manifest['entries'])} entries; {cross_checked} cross-checked against original Git objects; problems: {problems or 'none'}")
    return not problems


if __name__ == "__main__":
    if "--write" in sys.argv:
        write()
    sys.exit(0 if verify() else 1)
