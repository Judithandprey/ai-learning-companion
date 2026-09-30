# Companion Desktop for macOS: first capture slice

A native SwiftUI/AppKit app that captures one explicitly chosen whole display with
ScreenCaptureKit, keeps new pixels as lossless PNG with their source and time facts, and states
honestly whether the screen is currently observed.

It does not import files or open owned documents. It has no AI provider, window or app
identification or audio. When a development capture host is set up on this Mac, each explicit
Start also stores the retained frames and ink originals through that local host (numeric
loopback only); nothing reaches any AI
([record](../../../docs/verification/platform/macos-app-parent-link.md)). Screen-fixed ink over the selected display is a
local, source-only loop ([record](../../../docs/verification/platform/macos-original-screen-ink.md)). Evidence and limits are in
[the verification record](../../../docs/verification/platform/macos-desktop-capture.md).

## Layout

| Path | Content |
| --- | --- |
| `Package.swift` | SwiftPM, tools 6.0, Swift 5 language mode, macOS 15 floor, no third-party dependency |
| `Sources/DesktopCapture` | Library without UI: `CaptureRecorder`, `FrameFacts`, `Freshness`, `LiveGate`, `CaptureStart`, `StopReason`, records, `FrameStore.swift` (a byte-identical copy of the reviewed ScreenObserver store), the pure `DesktopIngress` mapper to desktop frame 0.2.7 / ingress 0.2.8 with `DesktopJSON`, and the ink model (`Ink.swift`: modes, strokes, partial erase, undo/redo, ASK, `InkStore`) with `SelectionCropper` |
| `Sources/CompanionDesktop` | The app: display choice, permission, Start/Stop, `CaptureRun` (the `SCStream` output and delegate), window and menu bar, and the ink overlay and palette (`InkController`, `InkViews`) over the selected display |
| `Tests/DesktopCaptureTests` | XCTest with synthetic buffers and attachments |
| `checks/validate_desktop_ingress.py` | Validates the Swift-made `desktop-ingress/` fixtures with the released Python contracts |
| `Packaging/Info.plist`, `package-app.sh` | Unsigned `.app` bundle for running on a Mac |

## Commands (macOS 15+, Xcode 16+)

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-fixture" \
COMPANION_DESKTOP_INGRESS_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-ingress-fixture" \
  swift test --package-path apps/macos/CompanionDesktop                         # 70 tests; keeps fixtures
.venv/bin/python apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py "$RUNNER_TEMP/companion-desktop-ingress-fixture"
apps/macos/CompanionDesktop/package-app.sh "$RUNNER_TEMP/companion-desktop"   # new directory
open "$RUNNER_TEMP/companion-desktop/CompanionDesktop.app"                     # interactive Mac only
```

The sample session is written by the real encoders from synthetic inputs, not from ScreenCaptureKit.
The full build/launch/resource contract is in the verification record.

`swift run --package-path apps/macos/CompanionDesktop CompanionDesktop` also starts the app, but
macOS may then attribute screen-recording permission to the terminal rather than to the app.

## Local files

`~/Library/Application Support/CompanionDesktop/Capture/<session>/`: `status.json`,
`events.jsonl` and `frames/NNNNNNNN.png`. Sessions are never overwritten or deleted by the app.

`~/Library/Application Support/CompanionDesktop/capture-host.json` (optional, written by you and
read at launch): the development capture host's interpreter, repository, DSN file and identities,
with no secret. `CaptureLink/journal.json` beside it is the link's nonsecret record (streams, keys,
batch-file hashes, Stop outcomes). Each batch's exact bytes are in
`CaptureLink/<stream-id>/<batch-key>.json`.
