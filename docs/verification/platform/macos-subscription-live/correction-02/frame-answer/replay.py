#!/usr/bin/env python3
"""Bounded MAC-LIVE-03 Linux stand-in replay, reconstructed from exact source and hashes."""
from pathlib import Path
import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("repo", type=Path)
parser.add_argument("--output", type=Path, default=Path("/tmp/lc-mac-frame-answer"))
parser.add_argument("--source-ref", default="4f6c327018d46604b21c57ab4ebf2b0e45278f70")
parser.add_argument("--working-tree", action="store_true")
parser.add_argument("--run", choices=["paired", "controller", "controls"])
parser.add_argument("--extra", action="append", default=[], help="Additional Class.method control registration")
args = parser.parse_args()
artifacts = Path(__file__).resolve().parent
base = "4f6c327018d46604b21c57ab4ebf2b0e45278f70"
evidence = "docs/verification/platform/macos-subscription-live/correction-01/"
src = args.output / "src"
src.mkdir(parents=True, exist_ok=True)

def git_read(ref, path):
    return subprocess.check_output(["git", "-C", str(args.repo), "show", f"{ref}:{path}"])

def digest(data):
    return hashlib.sha256(data).hexdigest()

paths = subprocess.check_output(["git", "-C", str(args.repo), "ls-tree", "-r", "--name-only", args.source_ref,
    "apps/macos/CompanionDesktop/Sources/DesktopCapture", "apps/macos/CompanionDesktop/Tests/DesktopCaptureTests"], text=True).splitlines()
paths = [p for p in paths if p.endswith(".swift")]
baseline_paths = set(paths)
if args.working_tree:
    paths = sorted({*paths, *(str(p.relative_to(args.repo)) for folder in
        ["apps/macos/CompanionDesktop/Sources/DesktopCapture", "apps/macos/CompanionDesktop/Tests/DesktopCaptureTests"]
        for p in (args.repo / folder).rglob("*.swift"))})
raw_sources = {}
for path in paths:
    raw = (args.repo / path).read_bytes() if args.working_tree else git_read(args.source_ref, path)
    raw_sources[path] = raw
    text = re.sub(r"^(import (CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)\n", "", raw.decode(), flags=re.M)
    text = "import Foundation\nimport FoundationNetworking\nimport Glibc\n" + text
    if path.endswith("/MacIngressUpload.swift"):
        text = re.sub(r"^(\s*)configuration.waitsForConnectivity = false", r"\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false", text, flags=re.M)
    (src / Path(path).name).write_text(text)
for path, name in [
    ("docs/verification/platform/macos-subscription-live/linux-apple-stand-ins.swift", "AppleShim.swift"),
    (evidence + "controller-probe.swift", "ControllerProbe.swift"),
    (evidence + "controller-ui-stand-ins.swift", "UIStandIn.swift"),
    (evidence + "lead-queued-presentation-probe.swift", "ZLeadLifecycleProbe.swift"),
]:
    raw = git_read(base, path)
    raw_sources[path] = raw
    (src / name).write_bytes(raw)
controller_path = "apps/macos/CompanionDesktop/Sources/CompanionDesktop/LiveController.swift"
raw = (args.repo / controller_path).read_bytes() if args.working_tree else git_read(args.source_ref, controller_path)
raw_sources[controller_path] = raw
controller = raw.decode().split("/// The connection to the user's ChatGPT subscription and the AI's session, in the main window.")[0]
controller = re.sub(r"^import (AppKit|DesktopCapture|SwiftUI)\n", "", controller, flags=re.M)
(src / "ActualLiveController.swift").write_text("import Foundation\n" + controller + "\nstruct LiveCardView: View {}\n")
(src / "ZLeadFrameAdvancementProbe.swift").write_bytes((artifacts / "lead-frame-advance-probe.swift").read_bytes())
(src / "main.swift").write_bytes((artifacts / "lead-frame-advance-main.swift").read_bytes())

# First validate the original reconstruction exactly, without rerunning its recorded failure.
baseline = json.loads((artifacts / "lead-frame-advance-manifest.json").read_text())["harness_files"]
initial = {p.name: digest(p.read_bytes()) for p in sorted(src.glob("*.swift"))}
if not args.working_tree and args.source_ref == base:
    assert initial == baseline, "Baseline differs from the exact independently executed lead manifest"
method = (artifacts / "controller-frame-advance-method.swift.txt").read_text()
original = (src / "ControllerProbe.swift").read_text()
assert original.endswith("}\n")
(src / "ControllerProbe.swift").write_text(original[:-2] + method + "}\n")
registrations = json.loads((artifacts / "focused-tests.json").read_text())
suite = args.run or "paired"
selected = registrations[suite]
selected = selected + args.extra if suite == "controls" else selected
groups = {}
for registration in selected:
    cls, name = registration.split(".")
    candidates = [p.read_text() for p in src.glob("*.swift") if re.search(r"\bfunc " + re.escape(name) + r"\(", p.read_text())]
    assert len(candidates) == 1, registration
    asynchronous = bool(re.search(r"\bfunc " + re.escape(name) + r"\([^)]*\)\s+async\b", candidates[0]))
    body = f"asyncTest({cls}.{name})" if asynchronous else f"{cls}.{name}"
    groups.setdefault(cls, []).append(f'("{name}", {body})')
main = "import Foundation\nimport XCTest\nimport Glibc\nsignal(SIGPIPE, SIG_IGN)\nXCTMain([\n" + ",\n".join("testCase([" + ",\n".join(items) + "])" for items in groups.values()) + "\n])\n"
(src / "main.swift").write_text(main)
if args.working_tree:
    for path, raw in raw_sources.items():
        if path.startswith("apps/"):
            assert (args.repo / path).read_bytes() == raw, "Source changed during reconstruction: " + path
    patch = subprocess.check_output(["git", "-C", str(args.repo), "diff", base, "--",
        "apps/macos/CompanionDesktop/Sources/DesktopCapture", "apps/macos/CompanionDesktop/Sources/CompanionDesktop/LiveController.swift",
        "apps/macos/CompanionDesktop/Tests/DesktopCaptureTests"])
    for path in sorted(set(paths) - baseline_paths):
        patch += (f"diff --git a/{path} b/{path}\nnew file mode 100644\n" + "".join(difflib.unified_diff(
            [], raw_sources[path].decode().splitlines(keepends=True), fromfile="/dev/null", tofile="b/" + path))).encode()
    (artifacts / "tested-source.patch").write_bytes(patch)
frontend = Path("/tmp/lc-review-0212/tc/usr/bin/swift-frontend")
command = [str(frontend), "-interpret", "-sdk", "/tmp/lc-review-0212/sysroot", "-swift-version", "5",
    "-module-name", "LCLeadCorrected", "-lXCTest", "src/main.swift"] + [f"src/{p.name}" for p in sorted(src.glob("*.swift")) if p.name != "main.swift"]
manifest = {"kind": "Linux Apple/UI stand-in and fake-connector replay; no native macOS or real AI",
    "base_native_commit": base, "lead_evidence_commit": "8467e0a55113455f62067d97a8774dca889c3d88",
    "source_ref": "working-tree exact hashes and tested-source.patch" if args.working_tree else args.source_ref,
    "source_head": subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", "HEAD"], text=True).strip(),
    "source_files": {p: digest(raw) for p, raw in sorted(raw_sources.items())},
    "harness_files": {p.name: digest(p.read_bytes()) for p in sorted(src.glob("*.swift"))},
    "selected_tests": selected, "command": command, "cwd": str(args.output),
    "environment": {"LD_LIBRARY_PATH": "/tmp/lc-review-0212/libs"}, "swift_frontend_sha256": digest(frontend.read_bytes()),
    "replay_script_sha256": digest(Path(__file__).read_bytes()), "executed": False}
if args.working_tree:
    manifest["tested_source_patch_sha256"] = digest(patch)
manifest_path = artifacts / (suite + "-manifest.json")
if args.run:
    log_path = artifacts / (suite + "-results.txt")
    env = dict(os.environ, LD_LIBRARY_PATH="/tmp/lc-review-0212/libs")
    with log_path.open("wb") as log:
        result = subprocess.run(command, cwd=args.output, env=env, stdout=log, stderr=subprocess.STDOUT)
    manifest.update(executed=True, exit_code=result.returncode, raw_log_sha256=digest(log_path.read_bytes()))
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{suite}: registered={len(selected)} exit={result.returncode}; raw log={log_path}")
    sys.exit(result.returncode)
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Prepared only: original baseline hashes match; harness={src}; final replay awaits source notice")
