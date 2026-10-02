# Companion Desktop for macOS: first capture slice

A native SwiftUI/AppKit app that captures one explicitly chosen whole display with
ScreenCaptureKit, keeps new pixels as lossless PNG with their source and time facts, and states
honestly whether the screen is currently observed.

It does not import files or open owned documents. It has no window or app identification or
audio, and no provider code of its own. After the user's own Start AI, a bounded session gives
ChatGPT, through the user's subscription and the shared connector child, pictures of the whole
captured display with the ink; a finished ASK selection is sent at once as the focus in that
picture, and typed words can follow on its card
([record](../../../docs/verification/platform/macos-subscription-live.md); the earlier
single-question library is kept, [record](../../../docs/verification/platform/macos-subscription-ask.md)). When a development capture host is set up on this Mac, each explicit
Start also stores the retained frames and ink originals through that local host (numeric
loopback only); this storage path sends no AI request
([record](../../../docs/verification/platform/macos-app-parent-link.md)). Screen-fixed ink over the selected display is a
local, source-only loop ([record](../../../docs/verification/platform/macos-original-screen-ink.md)). Evidence and limits are in
[the verification record](../../../docs/verification/platform/macos-desktop-capture.md).

## Layout

| Path | Content |
| --- | --- |
| `Package.swift` | SwiftPM, tools 6.0, Swift 5 language mode, macOS 15 floor, no third-party dependency |
| `Sources/DesktopCapture` | Library without UI: `CaptureRecorder`, `FrameFacts`, `Freshness`, `LiveGate`, `CaptureStart`, `StopReason`, records, `FrameStore.swift` (a byte-identical copy of the reviewed ScreenObserver store), the pure `DesktopIngress` mapper to desktop frame 0.2.7 / ingress 0.2.8 with `DesktopJSON`, and the ink model (`Ink.swift`: modes, strokes, partial erase, undo/redo, ASK, `InkStore`) with `SelectionCropper`; the subscription ASK: `AskWire` (the connector's JSON lines), `AskSelection` (the selection's image and context), `AskChild` (the connector child), `AskLink` (connection, sign-in and the card's rules); the live session of ADR 0004: `LiveWire` (the `lc-subscription-live/1` lines, usage and refusals), `LiveSession` (the session's own account: picture numbers, looks, kept requests, gaps, bounded context), `LiveFrame` (the whole-display picture with ink), `LiveLink` (connection, Start/Stop, looks, focus, follow-up, cancel, records) |
| `Sources/CompanionDesktop` | The app: display choice, permission, Start/Stop, `CaptureRun` (the `SCStream` output and delegate), window and menu bar, and the ink overlay and palette (`InkController`, `InkViews`) over the selected display; `LiveController` (the ChatGPT connection section, the AI session's bounds and Start/Stop, and the selection's card) |
| `Tests/DesktopCaptureTests` | XCTest with synthetic buffers and attachments |
| `checks/validate_desktop_ingress.py` | Validates the Swift-made `desktop-ingress/` fixtures with the released Python contracts |
| `checks/validate_ask_request.py` | Runs the connector's released request validator over the Swift-made `ask/start` requests (`COMPANION_DESKTOP_ASK_FIXTURE_DIR`) |
| `checks/validate_live_session.py` | Runs the released live contract, request check and focus rule over the lines one synthetic session writes to the connector (`COMPANION_DESKTOP_LIVE_FIXTURE_DIR`) |
| `Packaging/Info.plist`, `package-app.sh` | Unsigned `.app` bundle for running on a Mac |

## Commands (macOS 15+, Xcode 16+)

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-fixture" \
COMPANION_DESKTOP_INGRESS_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-ingress-fixture" \
COMPANION_DESKTOP_ASK_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-ask-fixture" \
COMPANION_DESKTOP_LIVE_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-live-fixture" \
  swift test --package-path apps/macos/CompanionDesktop                         # 124 tests; keeps fixtures
.venv/bin/python apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py "$RUNNER_TEMP/companion-desktop-ingress-fixture"
.venv/bin/python apps/macos/CompanionDesktop/checks/validate_ask_request.py "$RUNNER_TEMP/companion-desktop-ask-fixture"
.venv/bin/python apps/macos/CompanionDesktop/checks/validate_live_session.py "$RUNNER_TEMP/companion-desktop-live-fixture"
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

`~/Library/Application Support/CompanionDesktop/ask-connector.json` (optional, written by you and
read at launch): where the subscription connector runs (`python`, `repository`, optionally
`state_dir` and `codex_bin`), with no secret. Without it the ChatGPT section says it is not set
up, a selection gets no card, and nothing is written under `live/`.

`Capture/<session>/live/`, written during the user's explicitly started bounded AI session,
never replaced or deleted by the app:

- `<session>.session.json` and `<session>.end.json`: Start, its outcome and the session's end;
- `pictures/<sha256>.png` and `ink/<sha256>.json`: composed whole-display pictures and frozen
  editable originals when needed; unmodified raw pictures remain in `frames/`;
- `<request>.request.json`: the picture/context, focus, words and allowed help, recorded before
  sending, without image bytes and with references to the retained originals;
- `<request>.response.json`, `<request>.interrupt.json` and `<request>.shown.json`: the outcome,
  any interruption and separately confirmed card presentation. An unattended look is never
  presented as help.

The earlier ADR 0003 ASK library and its tests remain available; its old `asks/` layout is not
the current app's live-session storage.

The sign-in and its tokens are kept by the connector and Codex in their own state directory. This
app never reads or copies them.
