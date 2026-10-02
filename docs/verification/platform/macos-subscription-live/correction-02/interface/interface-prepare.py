#!/usr/bin/env python3
"""Refresh only the existing public-module/controller Linux harness, never production."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

WORKTREE = Path("/home/agentsdock/Projects/learning-companion/wt-platform")
EVIDENCE = WORKTREE / "docs/verification/platform/macos-subscription-live/correction-02/interface"
TARGET = WORKTREE / "apps/macos/CompanionDesktop"
MODULE = Path("/tmp/lc-interface-correction-02-module")
APP = Path("/tmp/lc-interface-correction-02-app")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    records = []
    (MODULE / "fshim").mkdir(parents=True, exist_ok=True)
    (MODULE / "mods").mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EVIDENCE / "interface-module-build.sh", MODULE / "build.sh")
    shutil.copy2(EVIDENCE / "interface-apple-stand-ins.swift", MODULE / "fshim/AppleShim.swift")
    for source in sorted((EVIDENCE / "harness-modules").glob("*.swift")):
        shutil.copy2(source, MODULE / "mods" / source.name)
    shutil.copy2(EVIDENCE / "interface-ui-stand-ins.swift", APP / "UIStub.swift")
    (MODULE / "src").mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)
    sources = sorted((TARGET / "Sources/DesktopCapture").glob("*.swift"))
    assert len(sources) == 29, "expected the assigned 29 production library sources"
    expected = {source.name for source in sources}
    for obsolete in (MODULE / "src").glob("*.swift"):
        if obsolete.name not in expected:
            obsolete.unlink()
    for source in sources:
        raw = source.read_bytes()
        text = raw.decode()
        if ("URLSession" in text or "URLRequest" in text) and "import CFNetwork" not in text:
            text = "import CFNetwork\n" + text
        if source.name == "MacIngressUpload.swift":
            text = re.sub(r"^(\s*)configuration.waitsForConnectivity = false",
                          r"\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false", text, flags=re.M)
        copied = text.encode()
        (MODULE / "src" / source.name).write_bytes(copied)
        records.append({"path": str(source.relative_to(WORKTREE)), "source_sha256": digest(raw),
                        "harness_path": str(MODULE / "src" / source.name), "harness_sha256": digest(copied)})
    source = TARGET / "Sources/CompanionDesktop/LiveController.swift"
    raw = source.read_bytes()
    marker = "/// The connection to the user's ChatGPT subscription and the AI's session, in the main window."
    text = raw.decode()
    assert text.count(marker) == 1 and "struct LiveConnectionView: View" in text
    copied = (text[:text.index(marker)].replace("import AppKit\n", "import UIStub\n")
              .replace("import SwiftUI\n", "") + "\nstruct LiveCardView: View {}\n").encode()
    (APP / "LiveControllerClass.swift").write_bytes(copied)
    records.append({"path": str(source.relative_to(WORKTREE)), "source_sha256": digest(raw),
                    "harness_path": str(APP / "LiveControllerClass.swift"), "harness_sha256": digest(copied)})
    inputs = [MODULE / "build.sh", MODULE / "fshim/AppleShim.swift", APP / "UIStub.swift"]
    inputs.extend(sorted((MODULE / "mods").glob("*.swift")))
    for source in inputs:
        records.append({"path": str(source), "source_sha256": digest(source.read_bytes()), "check": "existing stand-in input"})
    manifest = {"kind": "public-interface-linux-source-snapshot", "native_or_real_ai": False,
                "git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=WORKTREE, text=True).strip(),
                "transformations": ["add existing CFNetwork re-export for corelibs Foundation networking",
                                    "comment Linux-unavailable waitsForConnectivity setter in copied source only",
                                    "extract LiveController before LiveConnectionView marker; replace AppKit/SwiftUI imports with UIStub",
                                    "empty LiveCardView implements only existing UIStub.View"],
                "files": records}
    (EVIDENCE / "interface-source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for source, name in [(MODULE / "build.sh", "interface-module-build.sh"),
                         (APP / "UIStub.swift", "interface-ui-stand-ins.swift")]:
        shutil.copy2(source, EVIDENCE / name)
    print(f"Refreshed {len(sources)} production library files and LiveController extraction; source hashes recorded.")


if __name__ == "__main__":
    main()
