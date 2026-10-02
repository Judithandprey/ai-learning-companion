#!/usr/bin/env python3
"""Prepare only the bounded actual-controller replay; no toolchain installation."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

workspace = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/agentsdock/Projects/learning-companion/wt-platform")
harness = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/lc-live-controller-correction")
evidence = Path(__file__).resolve().parent
src = harness / "src"
src.mkdir(parents=True, exist_ok=True)
originals = harness / "originals"
originals.mkdir(exist_ok=True)
app = workspace / "apps/macos/CompanionDesktop"
manifest = {"kind": "Linux actual LiveController replay", "original_sources": {}, "harness_sources": {},
            "transformations": ["Apple/native imports replaced by existing Linux framework stand-ins",
                                "MacIngressUpload waitsForConnectivity assignment omitted on corelibs",
                                "LiveController class extracted before connection/card View declarations; LiveCardView is a stand-in",
                                "Published and native panel/window types replaced by recording UI stand-ins"],
            "scope": "Eight actual-controller methods only; synthetic connector/frames; no native UI, device, network or account"}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def export(path):
    data = path.read_bytes()
    relative = str(path.relative_to(workspace))
    manifest["original_sources"][relative] = digest(data)
    retained = originals / relative
    retained.parent.mkdir(parents=True, exist_ok=True)
    retained.write_bytes(data)
    source = data.decode()
    source = re.sub(r"^(?:import (?:CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)\n", "", source, flags=re.M)
    if path.name == "MacIngressUpload.swift":
        source = re.sub(r"^(\s*)configuration.waitsForConnectivity = false", r"\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false", source, flags=re.M)
    (src / path.name).write_text("import Foundation\nimport FoundationNetworking\nimport Glibc\n" + source)

for folder in [app / "Sources/DesktopCapture", app / "Tests/DesktopCaptureTests"]:
    for path in sorted(folder.glob("*.swift")):
        export(path)

controller = app / "Sources/CompanionDesktop/LiveController.swift"
data = controller.read_bytes()
manifest["original_sources"][str(controller.relative_to(workspace))] = digest(data)
retained = originals / controller.relative_to(workspace)
retained.parent.mkdir(parents=True, exist_ok=True)
retained.write_bytes(data)
marker = "/// The connection to the user's ChatGPT subscription and the AI's session, in the main window."
source = data.decode().split(marker, 1)[0]
source = re.sub(r"^import (?:AppKit|DesktopCapture|SwiftUI)\n", "", source, flags=re.M)
(src / "ActualLiveController.swift").write_text("import Foundation\n" + source + "\nstruct LiveCardView: View {}\n")

shim = workspace / "docs/verification/platform/macos-subscription-live/linux-apple-stand-ins.swift"
manifest["original_sources"][str(shim.relative_to(workspace))] = digest(shim.read_bytes())
shutil.copyfile(shim, src / "AppleShim.swift")
shutil.copyfile(evidence / "controller-ui-stand-ins.swift", src / "UIStandIn.swift")
shutil.copyfile(evidence / "controller-probe.swift", src / "ControllerProbe.swift")
names = re.findall(r"func (testController\w+)\(\) async", (src / "ControllerProbe.swift").read_text())
assert len(names) == 8, names
entries = "\n".join(f'    ("{name}", asyncTest(DesktopCaptureTests.{name})),' for name in names)
(src / "main.swift").write_text('import Foundation\nimport XCTest\nimport Glibc\nsignal(SIGPIPE, SIG_IGN)\n'
                               'typealias Entry = (String, (DesktopCaptureTests) -> () throws -> Void)\n'
                               'let tests: [Entry] = [\n' + entries + '\n]\nXCTMain([testCase(tests)])\n')
for path in sorted(src.glob("*.swift")):
    manifest["harness_sources"][path.name] = digest(path.read_bytes())
(harness / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Prepared {len(manifest['original_sources'])} original sources, {len(manifest['harness_sources'])} harness sources; registered {len(names)} controller checks")
