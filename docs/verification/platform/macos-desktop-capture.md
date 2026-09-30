# macOS Companion Desktop: first capture slice (explicit display, Start/Stop, honest freshness)

Task: the lead's desktop-first continuation `handoff_e90ac1b9b47e3765d03439117009d406`.
Baseline `07e669154e6eae9944368c210c3f1f3d309aa258` (content `d2603fd`) is normally merged into
`team/ios` as `a08f7ff`, with no conflicts. Read at that revision:
- [D-DESKTOP-FIRST](../../requirements/intent-and-decisions.en.md#desktop-first) and the
  [priority transition](../lead/desktop-priority-transition.md);
- the current continuation table and the P0-03/P0-11 cards in `docs/tasks.md`;
- R01–R03, R07, R35, R36, R51, R52 and R59, and A12, A14, A16, A30, A31, A41 and A44.

The client is capture only and **not AI connected**. It does not pass either whole §7.1 core gate,
or any later overlay-ink or audio requirement.

## Outcome

[`apps/macos/CompanionDesktop`](../../../apps/macos/CompanionDesktop/README.md) is a SwiftPM package.
It has a `DesktopCapture` library (no UI), the `CompanionDesktop` SwiftUI/AppKit app and an
XCTest target. It uses only public Apple frameworks, with no third-party dependency. The app
provides:

- **Explicit display choice.** The picker lists `SCShareableContent` displays by AppKit's
  localized screen name, with size in points and a main-display mark. No display is preselected.
- **Permission.**
  - `CGPreflightScreenCaptureAccess` state is shown.
  - Request Access calls `CGRequestScreenCaptureAccess`, and there is a link to the Privacy &
    Security pane.
  - The UI says macOS may need a relaunch after access is granted.
  - Listing or start errors are shown with their ScreenCaptureKit kind, domain, code and message.
- **Start and Stop.**
  - Start and Stop are in the window and in a Capture menu (⌥⌘R / ⌥⌘.). Stop is also in a menu
    bar extra.
  - The menu bar extra keeps Stop reachable while another app is in front, and with the window
    closed; closing the window does not quit.
- **Capture.**
  - One `SCStream` of the whole chosen display, with no window excluded, so this app's own window
    is captured whenever it is visible.
  - Size is `contentRect × pointPixelScale`, BGRA, requested in sRGB, cursor shown and no audio.
  - Minimum frame interval: 2 s.
- **Local record.**
  - Location: `~/Library/Application Support/CompanionDesktop/Capture/<session>/`.
  - `status.json` holds counts and state and is rewritten atomically. It is rewritten at most
    once a second, and always on a kept frame, stream start, note or ending. Between writes it may
    trail by up to a second of runs.
  - `events.jsonl` is append-only.
  - `frames/NNNNNNNN.png` holds the kept frames.
  - Nothing is sent, and no kept frame or session is overwritten or deleted. `status.json` is
    replaced atomically by design, and `FrameStore` removes only its own unpublished staging
    candidate.
- **Status.** Freshness, "App on screen: unknown", counts, last kept frame and gaps.
  - These are refreshed with each report and every second, even when no callbacks arrive.
  - The menu bar symbol follows the same freshness: live, unknown, unavailable or not live.

Nothing imports files, opens owned documents, calls a provider, names applications or windows,
records audio or draws ink.

## What is recorded

| Fact | Source | Notes |
| --- | --- | --- |
| Display | `SCDisplay.displayID`/`frame`, `NSScreen.localizedName`, `SCShareableContentInfo.pointPixelScale`, requested pixel size, `CGDisplayRotation`, `CGDisplayIsMain` | The display ID is not claimed to be stable across reconnection. Rotation is recorded, never applied. |
| Session anchor | `Date()` and the host clock, read together at creation | The wall time is saved with milliseconds (ISO 8601 UTC). `stream_started` records the host and wall time read when `startCapture` returned. Callbacks may be recorded before that line. |
| Each kept frame | Its sequence, callback host time and `FrameFacts` | `FrameFacts` holds the sample PTS and six `SCStreamFrameInfo` attachments: status, `displayTime` (mach ticks and converted seconds), `contentRect`, `contentScale`, `scaleFactor` and `dirtyRects`. `screenRect`, `boundingRect` and `presenterOverlayContentRect` are not read. An absent or unreadable value is unknown and is **omitted** from the JSON, not written as null. An absent status is `missing`, and an unknown raw value is `unknown_<n>`. A non-numeric PTS is unknown, avoiding the NaN issue noted for iOS. |
| Other callbacks | Status counts, runs and events | Idle, blank, suspended, missing, unknown and not-retained callbacks become run events: kind, first/last sequence and first/last host time. `started`/`stopped` become `stream_status` events with their sequence. A complete callback without an image becomes a gap with its sequence. These callbacks' other attachment values are not kept. |
| Kept frame | The delivered buffer, unrotated, uncropped and unscaled | Written by the reviewed `FrameStore` (a byte-identical copy, enforced by a test) as lossless PNG (RGBA8, sRGB). The record has the file, size, delivered pixel format, byte length and SHA-256 of the written bytes, plus the callback's facts. |
| Not captured | — | No capture UTC, and no course or video playhead. Host times convert to wall time only by the session anchor, and no such estimate is written. There is no application or window identity. |

## Coverage, gaps and freshness

- **Callback statuses.** Every callback is counted by status.
  - `complete` with an image is *new pixels*, and each is offered to `FrameStore`; the stream's
    interval bounds the rate.
  - `idle` means the system reports no new pixels. It keeps the previous pixels' currency. An idle
    after a recorded silence therefore restores `live` on the system's report, while the silent
    interval stays recorded as unknown.
  - `blank`, `suspended`, `missing`, `unknown_<n>`, `complete` without an image, `started` and
    `stopped` make the pixels not current.
- **Runs.** Consecutive callbacks of one kind are written as one run event with first/last
  sequence and host time. A blank, suspended, missing or unknown run counts as one gap. The run
  still open is saved in `status.json`. After each status write, the counts so far are explained
  by the events plus the status; between writes `status.json` may trail by up to a second.
- **Gap events:**
  - `no_callbacks` for silence over 6 s, between callbacks or before the end;
  - `complete_without_image`;
  - `retention_cap_reached`, when the first new pixels do not fit the 2 GiB budget. Later new
    pixels are counted as not retained;
  - `keep_failed`.
- **`Freshness.judge` outcomes.** Only `live` allows presenting the last new pixels as the current
  screen:
  - `notLive`: stopped, ended or never started.
  - `unknown`: capturing, but no callback within 6 s, or none yet. The screen may be unchanged or
    frames may have stopped.
  - `unavailable`: a recent callback without current pixels.
  - `live`: a callback within 6 s, and the last new pixels are still current. The UI says "no
    newer pixels have been delivered". It adds that the system reported no change only when an idle
    callback came after those pixels.

**Stop and failure.** Each run has a lock-based `LiveGate`.
- **User Stop.** It closes the gate synchronously on the main thread and sets the phase to
  `stopping`, so freshness is `notLive` from that moment. It then awaits `stopCapture` and writes
  the ending on the capture queue.
- **Stream failure.** `didStopWithError` closes the gate on the delegate's thread before anything
  else. This covers permission loss, a system stop and a source loss.
- **Display disconnection.** A display leaving `CGGetOnlineDisplayList` closes the gate on a
  screen-parameter change. If the display stays online, a `display_parameters_changed` note records
  its current rotation, bounds and mode pixels. The stream keeps its configured size.
- **System sleep.** `NSWorkspace.willSleepNotification` ends capture as `system_sleep`. The host
  clock (`mach_absolute_time`) does not advance during sleep, so a sleep could never appear as a
  silence gap, and pre-sleep pixels must not be live after wake. The user starts again after wake.
- **App quit.** The ending is written synchronously on the capture queue. This happens even if
  another ending is still pending, such as Stop awaiting `stopCapture`. The gate keeps its first
  reason.
- **Start failures.** Once the recorder exists, an `addStreamOutput` or `startCapture` failure is
  written as a `start_failed` ending. If the recorder's own creation fails, a partial session
  directory may remain without a status. A sleep while the display list is being read cancels the
  start before any session is created.
- **After the gate closes.** Callbacks are counted as `callbacksAfterLiveEnded` and never kept.
- **Timing and reasons.** The ending records when live claims ended (gate) separately from when the
  session closed, with the first reason winning. The
  ScreenCaptureKit errors map to stable kinds, keeping the original domain, code and message:
  - `permission_declined`;
  - `missing_entitlements`;
  - `failed_to_start`;
  - `no_display_list`;
  - `capture_source_unavailable`;
  - `stopped_in_system_ui`;
  - `stopped_by_system`.

The 2 s interval, 2 GiB budget, 6 s silence limit and shown cursor are **engineering defaults** to
be measured on a Mac, not user choices or accepted coverage. A statically unchanged screen may
deliver no callbacks at all, in which case the app honestly says "unknown" rather than live.
Whether it does is a runtime question below.

## Build, test, launch and resource contract (for Support and the lead)

Consume this contract as written; nothing else is needed or assumed.

| Item | Contract |
| --- | --- |
| Package | `apps/macos/CompanionDesktop/Package.swift`: SwiftPM tools 6.0, `swiftLanguageModes: [.v5]`, platform `.macOS(.v15)`. No dependencies, resources, plugins, `.xcodeproj` or scheme. |
| Products and targets | Executable product `CompanionDesktop`. Targets: `DesktopCapture` (library), `CompanionDesktop` (executable) and `DesktopCaptureTests` (XCTest). |
| Toolchain | macOS 15 or later with Xcode 16 or later (Swift 6 compiler). XCTest needs full Xcode; Command Line Tools alone may lack it. |
| Frameworks | SwiftUI, AppKit, ScreenCaptureKit, CoreGraphics, CoreMedia, CoreVideo, CoreImage, ImageIO (tests), CryptoKit and Foundation. All are system frameworks. |
| Entitlements and sandbox | None. The app is unsandboxed, with no network entitlement or access. |
| Launch interface | The `.app` from `package-app.sh` is the interface for any permission or runtime use. The raw executable (`swift run`) is only a build and smoke convenience: macOS may attribute screen-recording permission to the launching terminal. That behaviour is unverified. |
| Info.plist | `Packaging/Info.plist`: placeholder bundle ID `org.example.learningcompanion.desktop`, `CFBundleExecutable` `CompanionDesktop`, `LSMinimumSystemVersion` 15.0, `NSHighResolutionCapable`. No usage-description key: macOS has none for screen capture. |
| Signing | Unsigned: no identity, notarization or account. On arm64, the executable keeps only the linker's automatic ad-hoc signature. |
| Files written at runtime | `~/Library/Application Support/CompanionDesktop/Capture/<yyyyMMddTHHmmssZ-xxxxxxxx>/` with `status.json`, `events.jsonl` and `frames/NNNNNNNN.png`. |

Exact commands:

```sh
swift build --package-path apps/macos/CompanionDesktop
COMPANION_DESKTOP_FIXTURE_DIR="$RUNNER_TEMP/companion-desktop-fixture" \
  swift test --package-path apps/macos/CompanionDesktop
apps/macos/CompanionDesktop/package-app.sh "$RUNNER_TEMP/companion-desktop"   # must be a new directory
```

- `swift test` runs 15 tests.
- **Fixture.** With the variable set, `testWritesSampleSessionForMapping` leaves one session
  directory under `$RUNNER_TEMP/companion-desktop-fixture/`. It holds `status.json`,
  `events.jsonl` and two PNGs, written by the real Swift encoders from **synthetic** inputs. Keep it
  as an artifact for the lead's desktop metadata mapping.
- **Not actual callbacks.** Actual ScreenCaptureKit callback metadata needs the interactive-Mac run
  below; neither CI nor this fixture provides it.
- **Package script.** `package-app.sh` builds the release product, assembles
  `CompanionDesktop.app` and lints its plist. It never replaces an existing path.
- **Running the app** (`open …/CompanionDesktop.app`) is for an interactive Mac only. A hosted
  runner cannot grant screen recording.

### Record format for the metadata mapping

- **Encoding.** JSON with sorted keys and camelCase names. Wall times are UTC ISO 8601 with
  milliseconds. Host times are `mach_absolute_time` seconds. Unknown values are omitted.
- **`status.json`** is `SessionStatus`:
  - `session`, `startedWall`, `startedHost`, `updatedWall`;
  - `display`: `DisplayFacts`;
  - `settings`, `permissionPreflightAtStart`, `streamStartedHost`;
  - `callbacks`, `callbacksByStatus`, `lastCallbackHost`, `lastCallbackStatus`;
  - `lastNewPixelsHost`, `lastNewPixelsSequence`, `pixelsCurrent`;
  - `keptFrames`, `bytesKept`, `lastKept`: `KeptFrame`;
  - `notRetained`, `gaps`, `openRun`;
  - `eventWriteFailures`, `statusWriteFailures`, `storeStoppedReason`;
  - `callbacksAfterLiveEnded`, `ending`.
- **`events.jsonl`** holds `CaptureEvent` lines: `event`, `host`, `wall`, `detail`, `frame`
  (`KeptFrame`) and `run` (`CallbackRun`).
- **`KeptFrame`** has:
  - `file`, `sequence`, `callbackHost`, `facts` (`FrameFacts`);
  - `width`, `height`, `pixelFormat` (FourCC, e.g. `BGRA`), `mediaType`, `encoding`;
  - `byteLength`, `sha256`.
- **`FrameFacts`** has `status`, `displayTimeTicks`, `displayTimeSeconds`, `presentationTime`,
  `contentRect`, `contentScale`, `scaleFactor` and `dirtyRects`. `RecordedRect` is
  `{x, y, width, height}`, in the units ScreenCaptureKit reports.
- **What the mapping must not do.** None of these is ReplayKit orientation metadata, a capture
  UTC or a playhead, and the mapping must not relabel them so. Display rotation is only
  `display.rotationDegrees` at start plus any `display_parameters_changed` notes. Pixels are never
  rotated.

**XCTest** ([`DesktopCaptureTests.swift`](../../../apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/DesktopCaptureTests.swift),
15 tests, synthetic buffers and attachments only):

| Test | What it checks |
| --- | --- |
| Frame facts | Each of the six read attachments, and the PTS, is read from a real `CMSampleBuffer` built with ScreenCaptureKit's keys. Missing, unknown, non-numeric and unreadable values stay unknown. |
| Kept frame | Exact kept PNG:<br>- the record's length and SHA-256 equal the file on disk;<br>- PNG IHDR is 4×2, 8-bit, colour type 6;<br>- every pixel of an asymmetric pattern keeps its colour and position, so the frame is not rotated or flipped;<br>- events and the saved status are round-tripped. |
| Statuses, runs and gaps | Ten callbacks (complete, idle, blank, suspended and a missing status):<br>- counts, runs and gap count;<br>- the 13 s silence gap;<br>- kept sequences;<br>- the saved open run;<br>- freshness after each callback, including "idle after a blank/suspended run is not live". |
| Status-only and unknown callbacks | `started` becomes a `stream_status` event and `unknown_99` a gap run. Both clear current pixels, and an unknown status with an image is not kept. |
| Sample session | A session written with the real encoders, kept under `COMPANION_DESKTOP_FIXTURE_DIR` when that is set. It checks the event order, saved status and files. |
| Complete without image | Recorded as a gap, not as new pixels. |
| Nothing kept or live after live claims end | Covers callbacks before and after the ending, the first ending winning, and freshness. |
| Silence before the end | Recorded as a gap. |
| Freshness | Staleness, including a future callback timestamp. |
| Retention cap | No candidate is left on disk, and later pixels are counted as not retained. |
| Other units | Gate, stop-reason mapping and unique session directories. |
| `FrameStore` copy | Byte identity with the reviewed ScreenObserver copy. |

They do not exercise `SCStream`, permission, a real display or the app target's UI.

## Evidence levels

| Level | State |
| --- | --- |
| Source written | Package, app, library, tests, packaging and this record. **Uncompiled**: this host is Linux with no Swift toolchain. |
| Independent review workflows (`wf_a0b0f079-cf3`, `wf_f48d2770-ece`) | Compile, runtime-semantics and test-trace reviewers, each followed by an adversarial verifier (6 agents), then a 3-agent re-check of the fixes and claims. Nothing was compiled: this is reading. See [review outcome](#review-outcome). |
| Hosted `swift build` / `swift test` / package | **Not run.** Needs Support's `desktop-checks` wiring and a lead-run hosted macOS job. |
| Actual Mac runtime | **Not run.** There is no interactive Mac. This covers permission prompt/grant/relaunch, real callbacks during normal use of other apps, Stop latency, failure paths and PNG/throughput. |
| Provider, AI input, overlay ink, audio, upload | None, and none claimed. |

## Review outcome

The review ran with no toolchain. The compile reviewer, whose web checks included Xcode 16 header
diffs, reported no compile or link error. Findings and fixes:

| Finding | Verdict | Resolution |
| --- | --- | --- |
| The kept-frame test's saved `status.json` lacked `lastKept`: the 1 s throttle skipped the write | Confirmed, high | Keeping a frame now forces a status write. The test keeps its 0.5 s spacing, so it checks this. |
| Sleep is invisible to the host clock: no gap, and a possible live claim with pre-sleep pixels on wake | Plausible, medium | Capture ends on `willSleep` as `system_sleep`. |
| `now` was older than a freshly received status, so every callback flickered to "unknown" and "-1 s ago" | Confirmed, medium | `now` is refreshed with each received status, and displayed ages are clamped at 0. |
| Quitting while Stop awaited `stopCapture` left the session without an ending | Confirmed, medium | Quit always writes the ending synchronously; `finish` is idempotent. |
| `stream_started` time was read on the queue, late | Confirmed, low | Read on return from `startCapture`; the doc says callbacks may precede it. |
| The menu bar showed the live symbol whenever capturing | Plausible, low | The symbol is derived from freshness. |
| The live text said "the system reports no change" without an idle report | Confirmed, low | Reworded, as above. |
| An `addStreamOutput` failure left an orphan session | Confirmed, low | A `start_failed` ending is written. |
| Mid-session rotation or resolution changes were not recorded | Plausible, low | `display_parameters_changed` note. |
| The `writeStatus` comment overstated completeness | Confirmed, low | Reworded. |
| `noErr` compared with `OSStatus` would not compile | Refuted | The Darwin overlay declares `noErr: OSStatus`. |
| Idle after a silence restores live | Refuted | This is by design: the system's idle report. It is documented above. |

A second re-check (`wf_f48d2770-ece`) covered compile and semantics, a full test trace and doc
claims. It found no compile error, and all tests traced as passing. It raised two narrow races,
both fixed:
- a sleep during the display query is now remembered and cancels the start;
- `stopCapture` now runs once per run.

It also flagged overstated record claims, corrected above: per-callback facts, null versus omitted,
"always explained", start failures, the tested statuses, A14 and A41, and Start in the menu bar.

A remark, not a finding: MacTypes.h declares a C `Rect`. The library's rectangle is therefore named
`RecordedRect`, avoiding ambiguous type lookup in the app and test modules.

## Runtime questions for the first interactive Mac (QA)

1. **Permission attribution.** Does the unsigned bundle get its own entry in the Screen & System
   Audio Recording list? Does it need a relaunch? Does macOS 15's periodic re-confirmation prompt
   appear? How does `swift run` attribute permission?
2. **Callback cadence.** Actual cadence and statuses on a static screen, while a video plays, while
   typing in another app, with the display asleep or locked, and in full-screen spaces. Is `idle`
   delivered at all, or does the screen fall silent (which shows as `unknown`)?
3. **Sleep, lock and screen saver.** What does the stream deliver around sleep, display sleep, the
   lock screen and the screen saver? Does the `system_sleep` ending arrive before sleep?
4. **Failure delivery.** Does `didStopWithError` arrive, and with which code, for:
   - revoking permission during capture;
   - the system's stop-sharing control;
   - unplugging an external display;
   - fast user switching?
5. **Delivered facts.**
   - Delivered buffer size against the requested size.
   - `displayTime` against `mach_absolute_time`.
   - Colour of the sRGB-requested buffers.
   - A rotated display's pixels, and how frames are scaled after a mid-session resolution or
     rotation change.
6. **Cost.**
   - PNG encode time and size per 5K/4K/Retina frame;
   - how long the 2 GiB budget lasts during video;
   - CPU and energy.
7. **Stop.** Time from Stop to the menu bar and window leaving "Live". Callbacks after Stop are
   counted, and no PNG is written after Stop.

## Requirement contribution (not acceptance)

| Requirement | Contribution of this slice | Still open |
| --- | --- | --- |
| R01, R02, R36 | A native macOS client with independent, explicit Start/Stop of one display that other devices do not start. Actual OS capability is read at runtime. | Everything user-level: daily goal flow, bCourses and the full product on macOS; hosted CI is not acceptance. |
| R03, R59, A44 | Observation of the original screen in place: the user keeps using the original app while the display is captured. There is no import, owned canvas or frozen frame. | The overlay ink on the live original screen, the AI's receipt of the composite and the original-screen annotation criterion are **not implemented**. |
| R07 | Lossless original PNG of the whole display, kept as local evidence with a hash. | Region crops, visual recognition and any AI reading. |
| R35, A16 | Per-source Stop. Stopping means old images are never presented as current. | Cross-device session and combined understanding. |
| R51, R52, A12, A30, A31 | Screen-observation path only. Gaps, silences, statuses without pixels and unkept pixels are recorded, never filled in. | Attempt/process timelines, structured ink, human-reference comparison and the combined source identity. |
| A14 | By design, capture does not depend on the frontmost app, and an explicit Stop ends the capture stream. This is unverified at runtime, and no supervision exists yet. | A real-Mac test of switching apps, quitting and the system stop; session supervision. |
| A41 | — (capture only) | The macOS external-note, browser and owned-canvas traces, with visible and lost steps, resolution, latency, power/cost and fallback (§7.1 Gate 1). The original iPad variant is deferred. |

## Reuse and remaining dependencies

- **Reused:**
  - the reviewed `FrameStore`, with its staging, budget and never-overwrite rule;
  - the iOS session-record pattern of status, events and not-retained runs.
- **Not reused:**
  - ReplayKit-specific metadata (orientation attachment, luma heuristic);
  - `RawCaptureFrame` 0.2.5 mapping, which is ReplayKit-shaped.
- **Not yet wired:** `OriginalUploader` / `RawFrameIngress`. The lead's trusted local runtime is
  released at main `5af680f` (`services/api/capture_runtime.py`, [integration
  record](../lead/capture-runtime-integration.md), read with `git show`). The Swift host
  obligations it names are not implemented in this slice:
  - stable identity and idempotency keys;
  - protected, expiring tokens;
  - actual OS/user consent;
  - producer-independent Stop evidence.

  Wire integration waits for a truthful desktop metadata release. That release may be an
  additive mapping for `SCStreamFrameInfo`, `displayTime` and the display facts. Until then nothing
  leaves the Mac.
- **Next owners:**
  - Support: `desktop-checks` wiring of the commands above.
  - Lead: exact-source review and a hosted build/test run.
  - QA: runtime pass when a usable interactive Mac exists.
  - Native: fix any actual compile or test failure before adding overlay ink.
