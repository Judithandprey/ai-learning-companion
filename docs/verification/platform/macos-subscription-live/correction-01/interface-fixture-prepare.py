#!/usr/bin/env python3
"""Reuse the existing source/import transform; select exactly one existing fixture test."""
import hashlib
import json
from pathlib import Path
import re
import sys

WORKTREE = Path("/home/agentsdock/Projects/learning-companion/wt-platform")
EVIDENCE = WORKTREE / "docs/verification/platform/macos-subscription-live/correction-01"
TARGET = WORKTREE / "apps/macos/CompanionDesktop"
STRIPPED_IMPORTS = re.compile(
    r"^(?:import (?:CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)$"
)


def main():
    harness = Path(sys.argv[1])
    (harness / "src").mkdir(parents=True, exist_ok=False)
    sources = sorted((TARGET / "Sources/DesktopCapture").glob("*.swift"))
    sources += sorted((TARGET / "Tests/DesktopCaptureTests").glob("*.swift"))
    records = []
    for source in sources:
        raw = source.read_bytes()
        text = "import Foundation\nimport FoundationNetworking\nimport Glibc\n" + "\n".join(
            line for line in raw.decode().splitlines() if not STRIPPED_IMPORTS.fullmatch(line)
        ) + "\n"
        if source.name == "MacIngressUpload.swift":
            text = re.sub(r"^(\s*)configuration.waitsForConnectivity = false",
                          r"\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false", text, flags=re.M)
        copied = text.encode()
        (harness / "src" / source.name).write_bytes(copied)
        records.append({"path": str(source.relative_to(WORKTREE)),
                        "source_sha256": hashlib.sha256(raw).hexdigest(),
                        "harness_sha256": hashlib.sha256(copied).hexdigest()})
    stand_in = EVIDENCE.parent / "linux-apple-stand-ins.swift"
    raw = stand_in.read_bytes()
    (harness / "src/AppleShim.swift").write_bytes(raw)
    records.append({"path": str(stand_in.relative_to(WORKTREE)), "source_sha256": hashlib.sha256(raw).hexdigest()})
    (harness / "src/main.swift").write_text('''import Foundation
import Glibc
import XCTest
signal(SIGPIPE, SIG_IGN)
XCTMain([testCase([
    ("testLiveSessionLinesForTheReleasedValidator", asyncTest(DesktopCaptureTests.testLiveSessionLinesForTheReleasedValidator))
])])
''')
    manifest = {"kind": "single-existing-fixture-linux-source-snapshot", "native_or_real_ai": False,
                "harness": str(harness), "selected_test": "testLiveSessionLinesForTheReleasedValidator",
                "transformations": ["existing Apple imports replaced with existing AppleShim",
                                    "Foundation/FoundationNetworking/Glibc imports added",
                                    "Linux-unavailable waitsForConnectivity setter commented in copied source only"],
                "files": records}
    (harness / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Prepared {len(sources)} library/test source files; one selected fixture method under {harness}.")


if __name__ == "__main__":
    main()
