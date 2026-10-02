#!/usr/bin/env python3
"""Snapshot the existing Linux stand-in harness for the bounded correction replay."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

WORKTREE = Path("/home/agentsdock/Projects/learning-companion/wt-platform")
EVIDENCE = WORKTREE / "docs/verification/platform/macos-subscription-live/correction-01"
HARNESS = Path("/tmp/lc-live-correction-focused")
TARGET = WORKTREE / "apps/macos/CompanionDesktop"
STRIPPED_IMPORTS = re.compile(
    r"^(?:import (?:CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)$"
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    destination = HARNESS / "src"
    destination.mkdir(parents=True, exist_ok=True)
    records = []
    files = sorted((TARGET / "Sources/DesktopCapture").glob("*.swift"))
    files += sorted((TARGET / "Tests/DesktopCaptureTests").glob("*.swift"))
    for source in files:
        raw = source.read_bytes()
        text = "import Foundation\nimport FoundationNetworking\nimport Glibc\n" + "\n".join(
            line for line in raw.decode().splitlines() if not STRIPPED_IMPORTS.fullmatch(line)
        ) + "\n"
        if source.name == "MacIngressUpload.swift":
            text = re.sub(r"^(\s*)configuration.waitsForConnectivity = false",
                          r"\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false", text, flags=re.M)
        transformed = text.encode()
        (destination / source.name).write_bytes(transformed)
        records.append({"path": str(source.relative_to(WORKTREE)), "source_sha256": digest(raw),
                        "harness_path": source.name, "harness_sha256": digest(transformed)})
    # The same documented framework substitution as the recovered harness. It is not raster,
    # ScreenCaptureKit, permissions, AppKit UI, or real-provider evidence.
    stand_in = EVIDENCE.parent / "linux-apple-stand-ins.swift"
    probe = EVIDENCE / "lead-queued-presentation-probe.swift"
    for source, name in [(stand_in, "AppleShim.swift"), (probe, "LeadQueuedPresentationProbe.swift")]:
        raw = source.read_bytes()
        (destination / name).write_bytes(raw)
        records.append({"path": str(source.relative_to(WORKTREE)), "source_sha256": digest(raw),
                        "harness_path": name, "harness_sha256": digest(raw)})
    (HARNESS / "source-manifest.json").write_text(json.dumps({
        "kind": "focused-linux-source-snapshot", "native_or_real_ai": False,
        "transformations": ["documented Apple imports replaced by existing stand-ins",
                            "FoundationNetworking and Glibc imports added",
                            "Linux-only unavailable waitsForConnectivity setter commented"],
        "files": records,
    }, indent=2) + "\n")
    shutil.copy2(EVIDENCE / "focused-genmain.py", HARNESS / "genmain.py")
    shutil.copy2(EVIDENCE / "focused-replay.sh", HARNESS / "replay.sh")
    subprocess.run([sys.executable, str(HARNESS / "genmain.py")], check=True)
    print(f"Prepared {len(records)} source/stand-in/probe files under {HARNESS}; no tests executed.")


if __name__ == "__main__":
    main()
