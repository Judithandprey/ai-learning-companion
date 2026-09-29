"""Verify that a source copy is exactly a given commit for the paths a run uses.

Every tracked file under the given prefixes at <sha> must exist in <copy> with the same Git blob
hash. Untracked extras (built dist/, symlinked tools, bytecode) are ignored and not counted as
source. Prints JSON: the commit, its tree ids, files checked and any mismatches.

Usage: python provenance.py <repo> <sha> <copy> <prefix>...
"""

import json
import subprocess
import sys

repo, sha, copy, *prefixes = sys.argv[1:]
git = lambda *args: subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True).stdout
commit = git("rev-parse", "--verify", f"{sha}^{{commit}}").strip()
listing = [line.split("\t", 1) for line in git("ls-tree", "-r", "--full-tree", commit, "--", *prefixes).splitlines()]
entries = [(meta.split()[2], path) for meta, path in listing if meta.split()[1] == "blob"]
paths = [path for _, path in entries]
hashed = subprocess.run(["git", "hash-object", "--no-filters", "--stdin-paths"], cwd=copy, input="\n".join(paths) + "\n",
                        capture_output=True, text=True)
actual = hashed.stdout.split() if hashed.returncode == 0 else []
mismatches = [path for (blob, path), got in zip(entries, actual) if blob != got] if len(actual) == len(entries) else ["hash-object failed: " + hashed.stderr.strip()[:200]]
print(json.dumps({
    "commit": commit,
    "commit_tree": git("rev-parse", f"{commit}^{{tree}}").strip(),
    "prefix_trees": {p: git("rev-parse", f"{commit}:{p}").strip() for p in prefixes},
    "files_checked": len(entries),
    "mismatches": mismatches,
}))
sys.exit(1 if mismatches else 0)
