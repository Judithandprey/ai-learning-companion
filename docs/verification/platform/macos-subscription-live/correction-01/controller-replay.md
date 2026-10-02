# Actual LiveController boundary replay

2026-10-02: **8 checks passed, 0 failures**, exit 0. XCTest execution took 1.939 s.
The controller class was extracted verbatim from the final production
`Sources/CompanionDesktop/LiveController.swift`, before its view declarations.
Its real Start/Stop/Cancel/selection/capture-end/status-refresh/render methods ran
against the real copied library. Only imports, native UI names and publication
were replaced with the retained Linux stand-ins.

The recording `Published` stand-in traces every `LiveStatus` assignment, including
transient assignments later cleared. The controlled `scheduleStatus` queue holds
refresh triggers from the real `LiveLink`; no copied answer is supplied to the
controller. FakeLiveConnector supplies explicit synthetic answers and existing
writer holds. No production source, Git, permission or dependency was changed by
this replay.

| Actual-controller check | Observed result |
| --- | --- |
| Answer completed while callbacks queued, then synchronous Stop | Zero answer publications, no first shown time or receipt |
| Answer completed while callbacks queued, then synchronous Cancel | Zero answer publications, card closed, no first shown time or receipt |
| Capture gate closed off MainActor before capture-stop notification | Actor initially still `.on`; zero answer publications or receipt |
| New selection while old answer callbacks stay queued | New focus writer held while old triggers drained; zero old-answer publications/receipt; new answer and receipt then allowed |
| Explicit Stop then Start on the same capture | New Start held in `.starting` while old triggers drained; zero old-answer publications/receipt; distinct session answer and receipt then allowed |
| Legitimate visible display followed immediately by Stop | Historical answer retained; first `shown_at` retained; duplicate refreshes leave receipt bytes identical |
| Hidden panel followed by visible panel | Hidden attempt creates no shown time/receipt and is cleared from final UI state; later visible attempt creates them |
| Final permitted response exhausts submissions | `.usedUp` answer is displayed with receipt; only one focus submission sent |

The hidden control intentionally traces one authorized answer assignment while
panel visibility is false, followed by its clearing assignment. It proves the
receipt distinction; it does not claim that a native hidden panel was observed.
Stop, Cancel and capture-gate negatives contain no answer assignment at all.

Retained evidence:

- `controller-final-tests.txt`: full compiler warning, XCTest and publication trace.
- `controller-final-source-manifest.json`: SHA-256 of every copied original and
  transformed source. Original bytes also remain under
  `/tmp/lc-live-controller-correction/originals`.
- `controller-final-result.json`: registered checks, source/harness hashes,
  publication counts, commands and runtime boundaries.
- `controller-prepare.py`, `controller-run.sh`, `controller-probe.swift` and
  `controller-ui-stand-ins.swift`: reproducible preparation, execution and controls.
- `controller-initial-six-*`: successful earlier six-check snapshot, retained
  separately before adding the requested replacement/restart controls.

Production hashes were checked against the final copied originals after execution:
no drift. `review-presentation.md` records the final five relevant source hashes
and the corrected initial findings. The root owns binding those bytes to its
delivery commit and the separate library/source tests.

Replay in this workspace, with the already-installed bounded toolchain:

```sh
python3 docs/verification/platform/macos-subscription-live/correction-01/controller-prepare.py
bash docs/verification/platform/macos-subscription-live/correction-01/controller-run.sh > /tmp/lc-live-controller-correction/runtime.txt 2>&1
```

The runner uses Swift 6.3.3 `swift-frontend -interpret`, Swift 5 language mode,
`/tmp/lc-review-0212/sysroot` and the existing `/tmp/lc-review-0212/libs` libraries.
Preparation copies all library/test declarations for their existing helpers;
XCTest registers only these eight controller methods. One existing Sendable
conversion warning from copied `AskLinkTests.swift` remains in the log. A separate
toolchain-version query also warns that libc is not found for its target; it is
not a native build result.

Reverse ordering of same-command `currentStatus` continuations was reviewed in
source through the monotonic refresh ticket. It was not forced by a new production
hook. No macOS AppKit/SwiftUI/ScreenCaptureKit execution, real capture callback,
panel/Space behavior, account, network, actual ChatGPT answer, audio or device
acceptance is established here. Those native checks remain with the lead.
