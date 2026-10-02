#!/usr/bin/env python3
"""Use explicit XCTest groups, including the independent LiveFreshnessTests class."""
import json
from pathlib import Path
import re

HARNESS = Path("/tmp/lc-live-correction-focused")
SOURCE = HARNESS / "src"
METHOD = re.compile(r"func (test\w+)\(\)\s*(async)?")
LEGACY = [
    "testLiveGateKeepsTheFirstClosureAndAdmitsNothingAfterIt",
    "testFrameAdmittedBeforeStopIsKeptAndNothingAfter",
    "testStopWhileListingDisplaysCreatesNothing",
    "testStopWhileTheStreamStartsStopsIt",
    "testLiveStartRefusalsAndAStartThatIsStoppedOrNotConfirmed",
    "testLiveLooksWaitForTheirTurnAndStopAtTheRequestsKeptForTheUser",
    "testLiveSelectionIsSentAtOnceAsAFocusAndAFollowUpKeepsOrNamesIt",
    "testLiveSelectionMadeBeforeStartKeepsItsOwnPictureAsFocusWhenAsked",
    "testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults",
    "testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending",
    "testLiveFocusAndStopCannotBeOvertakenByAnOlderRenderingLook",
    "testLiveCancelNewSelectionStopAndQuitFenceARequestOnItsWay",
]
REALCHILD = "testAskRealChildNeverGetsARequestTakenBackInThePipe"


def methods(path):
    return [(match.group(1), bool(match.group(2))) for match in METHOD.finditer(path.read_text())]


def entries(group, owner):
    return "\n".join(
        f'    ("{name}", ' + (f"asyncTest({owner}.{name})" if asynchronous else f"{owner}.{name}") + "),"
        for name, asynchronous in group
    )


new = []
groups = {}
for filename in ["LivePresentationTests.swift", "LiveSourceDispatchTests.swift", "LeadQueuedPresentationProbe.swift"]:
    group = methods(SOURCE / filename)
    groups[filename] = [name for name, _ in group]
    new.extend(group)
freshness = methods(SOURCE / "LiveFreshnessTests.swift")
groups["LiveFreshnessTests.swift"] = [name for name, _ in freshness]
available = dict(method for source in SOURCE.glob("*.swift") if source.name != "LiveFreshnessTests.swift"
                 for method in methods(source))
missing = [name for name in LEGACY + [REALCHILD] if name not in available]
if missing:
    raise SystemExit(f"Missing requested regression methods: {missing}")
legacy = [(name, available[name]) for name in LEGACY]
groups["legacy"] = LEGACY
desktop = new + legacy
names = [name for name, _ in desktop + freshness]
if len(names) != len(set(names)):
    raise SystemExit("Duplicate selected test method")
(HARNESS / "selection.json").write_text(json.dumps({
    "kind": "bounded-correction-selection", "groups": groups, "selected_methods": len(names),
    "separate_exact_command_approval": [REALCHILD],
    "not_run": "Full legacy suite, mutation campaign, AppKit/device, real connectors/accounts/models",
}, indent=2) + "\n")
(SOURCE / "main.swift").write_text(f'''import Foundation
import Glibc
import XCTest

// Linux harness only: Darwin's production pipe guard remains separately compiled/verified.
signal(SIGPIPE, SIG_IGN)
let desktopTests: [(String, (DesktopCaptureTests) -> () throws -> Void)] = [
{entries(desktop, "DesktopCaptureTests")}
]
let freshnessTests: [(String, (LiveFreshnessTests) -> () throws -> Void)] = [
{entries(freshness, "LiveFreshnessTests")}
]
XCTMain([testCase(desktopTests), testCase(freshnessTests)])
''')
(HARNESS / "realchild-main.swift").write_text(f'''import Foundation
import Glibc
import XCTest

// Same unmodified local-process regression, separated because restricted CFSocket failed.
signal(SIGPIPE, SIG_IGN)
let desktopTests: [(String, (DesktopCaptureTests) -> () throws -> Void)] = [
{entries([(REALCHILD, available[REALCHILD])], "DesktopCaptureTests")}
]
XCTMain([testCase(desktopTests)])
''')
(HARNESS / "realchild-selection.json").write_text(json.dumps({
    "kind": "separate-local-heldpipe-control", "groups": {"legacy": [REALCHILD]},
    "selected_methods": 1, "provider_or_account_calls": False,
}, indent=2) + "\n")
print(f"Selected {len(desktop)} DesktopCaptureTests + {len(freshness)} LiveFreshnessTests = {len(names)} methods.")
