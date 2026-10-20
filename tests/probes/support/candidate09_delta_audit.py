"""Read-only exact Candidate09 identity/delta audit; no runtime preparation."""

import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


QA = "76606babfacabf3558ee3ee3aa0cb7d1ceedec63"
LEAD = "260884e670c25da7ab8d0360cc8355f90c3697b6"
PRODUCT = "0ff325beadb7c689244610307b6aa16d638fd2e6"
root = Path(sys.argv[1])
base = root / "docs/verification/qa/p0-13-live-0ff325b"
old, new = base / "candidate-nonvoice-08", base / "candidate-nonvoice-09"
read = lambda p: json.loads(p.read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *args: subprocess.check_output(["git", *args])
m08, m09 = read(old / "candidate.json"), read(new / "candidate.json")
old_leaf, new_leaf = Path(m08["work"]).name, Path(m09["work"]).name


def back(data):
    return data.replace(new_leaf.encode(), old_leaf.encode()).replace(
        m09["connector"]["copy"].encode(), m08["connector"]["copy"].encode()
    )


assert m09["production_commit"] == PRODUCT and m09["connector"]["commit"] == LEAD
assert len(m09["files"]) == 6
assert m09["files"].keys() == m08["files"].keys()
payloads = {}
for name, expected in m09["files"].items():
    current, previous = (new / name).read_bytes(), (old / name).read_bytes()
    assert sha(current) == expected and sha(previous) == m08["files"][name]
    assert back(current) == previous, name
    payloads[name] = {
        "sha256": expected, "unchanged": current == previous,
        "only_scratch_or_copy_substitution": True,
    }
assert {n for n, row in payloads.items() if not row["unchanged"]} == {
    "runner.ps1", "steps.json", "sub-live.json", "admission-live.json"
}
normalized = json.loads(back((new / "candidate.json").read_bytes()))
normalized["files"] = copy.deepcopy(m08["files"])
normalized["connector"]["commit"] = m08["connector"]["commit"]
normalized["source_files"]["qa_live_candidate.mjs"] = m08["source_files"]["qa_live_candidate.mjs"]
assert normalized == m08
for name, digest in m09["source_files"].items():
    assert sha((root / "tests/e2e/windows" / name).read_bytes()) == digest, name

wrapper_path = "tests/e2e/windows/qa_run_live_candidate.mjs"
wrapper = (root / wrapper_path).read_bytes()
parent_wrapper = git("show", f"{QA}^:{wrapper_path}")
current_lines, parent_lines = wrapper.splitlines(keepends=True), parent_wrapper.splitlines(keepends=True)
assert current_lines[:23] + current_lines[27:] == parent_lines[:23] + parent_lines[27:]
assert parent_wrapper == git("show", f"{LEAD}:{wrapper_path}")
assert git("rev-parse", f"{PRODUCT}:packages") == git("rev-parse", f"{LEAD}:packages")
connector_changes = git("diff", "--name-only", PRODUCT, LEAD, "--", "services", "packages").decode().splitlines()
assert all(p.startswith("services/worker/connectors/") for p in connector_changes)

template = read(new / "driver/allocation.template.json")
command = read(new / "driver/command.json")
manifest_sha = sha((new / "candidate.json").read_bytes())
wrapper_sha = sha(wrapper)
assert template["wrapper_sha256"] == command["execute"]["wrapper_sha256"] == wrapper_sha
assert template["candidate_sha256"] == command["execute"]["candidate_sha256"] == manifest_sha
assert template["payload_sha256"] == m09["files"]
assert template["connector"] == m09["connector"]
assert command["execute"]["allocation_template_sha256"] == sha((new / "driver/allocation.template.json").read_bytes())
assert {k: command["native_invocation"][k] for k in m09["proposed_native_invocation"]} == m09["proposed_native_invocation"]
assert template["native_invocation"] == {k: m09["proposed_native_invocation"][k] for k in ("executable", "arguments")}
assert template["launch_identity"]["work"] == m09["work"]
assert template["state"] != "active" and template["lead_reviewed"] is False
assert command["status"] == "NOT_AUTHORIZED_NOT_RUN"
assert command["execute"]["foreground_timeout_ms"] == 600000
assert command["execute"]["retry"] is command["execute"]["background"] is False
assert command["prerequisite_not_run"]["command"] == "node tests/e2e/windows/qa_live_candidate.mjs prepare-connector"
assert m09["prepared_only"] is True and m09["execution_authorized"] is False
for number in ("05", "06", "07", "08"):
    previous = read(base / f"candidate-nonvoice-{number}/candidate.json")
    assert m09["work"] != previous["work"]
    assert m09["connector"]["copy"] != previous["connector"]["copy"]
unused = {name: {"path": path, "exists_or_symlink": os.path.lexists(path)}
          for name, path in [("scratch", m09["work"]), ("connector_copy", m09["connector"]["copy"])]}
assert all(not row["exists_or_symlink"] for row in unused.values())
print(json.dumps({
    "verdict": "OFFLINE_DELTA_MATCH",
    "qa_commit": QA, "connector_commit": LEAD, "product_commit": PRODUCT,
    "candidate_sha256": manifest_sha, "wrapper_sha256": wrapper_sha,
    "source_pins_verified": len(m09["source_files"]), "payloads": payloads,
    "wrapper_only_lines_24_27_changed": True,
    "manifest_only_documented_changes": True,
    "packages_tree": git("rev-parse", f"{LEAD}:packages").decode().strip(),
    "connector_changed_paths": connector_changes,
    "template_and_command_pins_match": True, "template_active": False,
    "unused_paths": unused, "runtime_preparation_or_execution": False,
}, indent=2))
