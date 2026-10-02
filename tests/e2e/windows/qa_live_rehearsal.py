#!/usr/bin/env python3
"""Run one foreground hidden-window synthetic rehearsal of the frozen stage.

No real-run mode. Nothing is placed inside the stage/runtime/user profile.
Windows scratch is uniquely created; preserve its bounded failure evidence.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

from qa_live_stage_check import verify, STAGE, RUNTIME


def win_path(path):
    return subprocess.check_output(["wslpath", "-w", str(path)], text=True).strip()


def cleanup(work):
    # Select only this run's unguessable directory, not all Electron processes.
    # The finite native process receipt is also checked after a successful run.
    if not work.name.startswith("lc-qa-live-offscreen-") or not work.name[21:].isalnum():
        raise ValueError("unsafe cleanup target")
    script = f'''$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$owned = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {{ $_.CommandLine -like '*{work.name}*' }})
$before = @($owned | ForEach-Object {{ [int]$_.ProcessId }})
foreach ($p in $owned) {{ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }}
$after = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {{ $_.CommandLine -like '*{work.name}*' }} | ForEach-Object {{ [int]$_.ProcessId }})
[ordered]@{{before=$before;after=$after;scope='this QA scratch path only'}} | ConvertTo-Json -Compress
'''
    result = subprocess.run(
        ["/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(script.encode("utf-16le")).decode()],
        capture_output=True, timeout=30,
    )
    if result.returncode:
        return {"error": result.stderr.decode("utf-8", errors="replace"), "exit_code": result.returncode}
    return json.loads(result.stdout.decode("utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path, help="new QA evidence folder in this worktree or /tmp")
    parser.add_argument("--slice", choices=["all", "lifecycle", "controls"], default="all")
    args = parser.parse_args()
    out = args.out.resolve()
    repo = Path(__file__).resolve().parents[3]
    if not (out.is_relative_to(repo / "docs/verification/qa") or out.is_relative_to(Path("/tmp"))):
        raise ValueError("evidence must stay inside QA ownership or /tmp")
    if out.exists():
        raise ValueError("refusing existing output directory")
    identity = verify()
    if not identity["passed"]:
        raise ValueError("candidate identity check failed")
    out.mkdir(parents=True)
    # A separate directory beside, never inside, the immutable candidate.
    work = STAGE.parent / ("lc-qa-live-offscreen-" + uuid.uuid4().hex)
    work.mkdir()
    harness = Path(__file__).with_suffix(".cjs")
    copied = work / harness.name
    copied.write_bytes(harness.read_bytes())
    launch = {
        "owned_scratch_directory": str(work),
        "slice": args.slice,
        "stage_tree_sha256": identity["complete_payload_tree_sha256"],
        "harness_sha256": hashlib.sha256(harness.read_bytes()).hexdigest(),
        "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "static_identity": identity,
        "kind": "offline-only; hidden native windows (offscreen flag disabled); generated media; in-process stand-in provider",
    }
    (out / "launch.json").write_text(json.dumps(launch, indent=2) + "\n")
    # Direct WSL interop, foreground, finite timeout. No visible shell or desktop
    # automation, no connector launch configuration beyond the synthetic one.
    try:
        completed = subprocess.run(
            [str(RUNTIME / "electron.exe"), win_path(copied), win_path(STAGE), win_path(work), args.slice],
            cwd="/mnt/c", capture_output=True, timeout=110,
        )
        (out / "runtime.stdout.txt").write_bytes(completed.stdout)
        (out / "runtime.stderr.txt").write_bytes(completed.stderr)
        launch["exit_code"] = completed.returncode
    except subprocess.TimeoutExpired as error:
        # subprocess.run kills/waits for its foreground parent. The app's own
        # 90-second watchdog normally exits before this outer bound.
        (out / "runtime.stdout.txt").write_bytes(error.stdout or b"")
        (out / "runtime.stderr.txt").write_bytes(error.stderr or b"")
        launch["timeout"] = True
    finally:
        try:
            launch["cleanup"] = cleanup(work)
        except Exception as error:
            launch["cleanup"] = {"error": str(error), "after": None}
    for name in ["result.json", "progress.json", "generated-offscreen-controls.png"]:
        source = work / name
        if source.is_file():
            shutil.copyfile(source, out / name)
    launch["result_received"] = (out / "result.json").is_file()
    (out / "launch.json").write_text(json.dumps(launch, indent=2) + "\n")
    if launch["result_received"]:
        result = json.loads((out / "result.json").read_text())
        print(json.dumps({key: result.get(key) for key in ["pass", "fail", "fatal"]}))
        launch["checks_passed"] = not result.get("fatal") and result.get("fail") == 0
    else:
        print(json.dumps({"exit_code": launch.get("exit_code"), "result_received": False}))
        launch["checks_passed"] = False
    (out / "launch.json").write_text(json.dumps(launch, indent=2) + "\n")
    return 0 if launch.get("exit_code") == 0 and launch["checks_passed"] and launch["cleanup"].get("after") == [] else 1


if __name__ == "__main__":
    sys.exit(main())
