#!/usr/bin/env python3
"""Run existing validator only after every local loaded Python input matches released c917."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys

WORKTREE = Path("/home/agentsdock/Projects/learning-companion/wt-platform")
BASELINE = "c9177096c99c2562e4474bcbb2f4ffc8beb43c18"
CHECKER = WORKTREE / "apps/macos/CompanionDesktop/checks/validate_live_session.py"
sys.dont_write_bytecode = True


def main():
    fixture = Path(sys.argv[1])
    loaded = runpy.run_path(str(CHECKER))
    paths = {CHECKER, WORKTREE / "packages/contracts/schema.json",
             WORKTREE / "packages/contracts/live_companion/schema.json"}
    for module in tuple(sys.modules.values()):
        name = getattr(module, "__file__", None)
        if not name:
            continue
        source = Path(name).resolve()
        if source.is_relative_to(WORKTREE) and source != Path(__file__).resolve():
            paths.add(source)
    records = []
    worker_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=WORKTREE, text=True).strip()
    for source in sorted(paths):
        path = str(source.relative_to(WORKTREE))
        # The native adapter was added on the worker branch after the released lead baseline.
        # Its own committed source is recorded separately; all shared loaded inputs must be c917.
        reference = worker_head if source == CHECKER else BASELINE
        released = subprocess.check_output(["git", "show", f"{reference}:{path}"], cwd=WORKTREE)
        raw = source.read_bytes()
        assert raw == released, f"Released validator input changed: {path}"
        records.append({"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "reference_commit": reference,
                        "matches_reference": True, "matches_released_c917": source != CHECKER})
    manifest = {"baseline": BASELINE, "python": sys.executable, "python_version": sys.version,
                "inputs": records, "native_or_real_ai": False,
                "fixture_sha256": hashlib.sha256((fixture / "live-session.jsonl").read_bytes()).hexdigest()}
    (fixture.parent / "released-inputs.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"PASS: {len(records) - 1} loaded local shared code/schema inputs byte-identical to released {BASELINE}.")
    print(f"PASS: native fixture adapter byte-identical to worker {worker_head}; not claimed to exist in c917.")
    return loaded["main"]([str(CHECKER), str(fixture), str(fixture / "results.jsonl")])


if __name__ == "__main__":
    raise SystemExit(main())
