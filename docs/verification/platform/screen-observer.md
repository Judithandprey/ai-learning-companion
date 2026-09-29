# Screen Observer: whole-screen capture on iPadOS 26.5 (ReplayKit broadcast, native side)

Task: the lead's bounded P0-03/P0-11/P0-07 continuation `handoff_ff076be6ab84f162254f863bbd840428`,
with constraints from `handoff_3a76ede4194209cd50d04cbfa1ee95fc`, at baseline `1cbc38f`.

The user wants ongoing input from the whole visible screen, across apps, to actually reach the AI,
independently of ASK selection. This slice builds only the **capture** part of gate 1 on the target
(iPad Pro 13-inch M5, iPadOS 26.5). It uses the documented 26.5 route, the ReplayKit broadcast
upload extension (V-13, DT-G3-07, DT-G7-V09), not the 27-only ScreenCaptureKit.

Gate 2, a cross-app selector or pen, is out of scope and stays unmet. Support records that an
interactive overlay over arbitrary native apps is unsupported on the documented route (Apple DTS
797031), and signing does not change that.

## What is built

`apps/ios/ScreenObserver/` contains a committed Xcode project with two targets. It is hand-written,
using file-system-synchronized folders, so it has no per-file entries, nothing generated and no
dependency.

**App `ScreenObserver`** (containing app, one screen):
- `RPSystemBroadcastPickerView`, limited to this app's extension (the ID is read from the built
  app) and without the microphone button.
- The latest session's saved status: reported state, start and last-update times, counts, gaps, and
  the last kept frame labelled "saved, not live".
- "Capture only. AI is not connected and this app sends nothing. Kept frames are stored in this app's
  storage on the iPad, which iCloud or computer backups can include."
- The app on screen is shown as "unknown (not reported by the broadcast)".
- No network, no provider, no in-app browser. The user starts the broadcast once in the system sheet,
  and it runs across apps until stopped.

**Extension `BroadcastUpload`** (`com.apple.broadcast-services-upload`, sample-buffer mode):
- **Session:** a new session directory for each `broadcastStarted`, with the wall time and host time
  (`CACurrentMediaTime`) recorded together. Pause, resume and finish are events. An unobserved end,
  where the extension dies or is killed, has no event. The app then shows "no update for N s … state
  unknown; nothing is shown as live" once the last update is older than 10 s.
- **Video buffers:** every buffer gets a sequence number and presentation time (PTS). Each kept
  keyframe also records host time, width and height, orientation (`RPVideoSampleOrientationKey`,
  recorded but not applied) and the delivered pixel format. It also records the file actually
  written: `mediaType: image/png`, `encoding`, `byteLength` and `sha256`, the SHA-256 of the file's
  bytes, read back in 1 MB chunks. These names echo the 0.2.2 `ArtifactReference` facts, but the
  record is local-only and not a binding. An upload must report any frame over the 32 MiB transport
  ceiling as unavailable; nothing is uploaded now.
- **Retention:** a changed frame is kept as lossless PNG (Core Image `writePNGRepresentation`, 8-bit
  RGBA, sRGB) of the delivered, unrotated buffer at native resolution. This follows the lead's format
  coordination `handoff_d07d4e16f2f8bab4e04b4ade99aded09`, since Web and Learning's first
  materializer read PNG. "Changed" means a 256×192 luma grid differs by more than 24 from the last
  kept frame.
  - **Attempts:** at most one keyframe attempt, successful or not, per 2 s. A failing disk therefore
    cannot cause encodes at the callback rate.
  - **Byte budget:** 512 MB of kept frames per session (`FrameStore`). Each candidate is encoded to a
    new staging file in `frames/`, then measured and hashed from disk. It is published as a kept
    original only if its whole size fits the remaining budget. Kept bytes never exceed the cap.
  - **Budget full:** the first frame that does not fit ends retention for the session, with a
    `retention_cap_reached` gap. Later frames become `not_retained` runs.
  - **Failures:** a failed encode, read-back or publish is a `keyframe_write_failed` gap and is never
    counted as kept. Its candidate is removed. Only that new, unpublished candidate is ever removed,
    and the publishing rename never replaces an existing file, so a kept original is never
    overwritten or deleted.
  - **Temporary allowance:** at most one staging candidate, of at most one frame's size, exists at a
    time beyond the kept budget. If a failed candidate cannot be removed, attempts stop for the
    session (`stoppedReason`, and `not_retained` reason `stopped_after_cleanup_failure`), so leftovers
    cannot accumulate.
  - These are adjustable engineering bounds, to be measured on the device. They are not accepted
    coverage.
  - An equal grid does not prove equal pixels, so such frames are "not retained by heuristic".
  - **Sampling layouts (`LumaGrid`):** the grid is read only from checked layouts, after a successful
    lock and after checking dimensions and row stride so every sample stays inside the plane:
    - 8-bit 4:2:0 bi-planar (`420v`/`420f`), luma plane 0;
    - 32-bit BGRA, green byte.

    Any other layout, including 10-bit or 2-byte packed formats, gives an empty grid. An empty grid
    always counts as changed, so it can never justify a skip; Core Image still encodes such a frame
    within the bounds above.
- **Every discontinuity is an event with its sequence and time range:**
  - `not_retained` runs, with a reason: `luma_grid_equal_heuristic`, `within_minimum_interval`,
    `retention_cap_reached` or `no_image_buffer`;
  - `gap`, of kind `no_new_frames` for more than 2 s ("screen unchanged or frames not delivered;
    unknown"), `keyframe_write_failed` or `retention_cap_reached`.

  A long run is written as one or more consecutive events. An open run is written at least with every
  status write, so a killed extension cannot leave counted frames without events. A failed event
  write is counted (`eventWriteFailures`, shown as "log incomplete"). The kept frames are never a
  complete history of the screen.
- **Audio:** buffers are counted and one `audio_not_captured` event is written. Audio is not captured
  in this slice.
- **App identity:** which app is on screen is not recorded; the broadcast does not report it here.
- **No App Group** (for example, an unsigned build): `finishBroadcastWithError` with "Screen Observer
  cannot keep frames: this build has no shared App Group storage. Nothing was captured." Nothing is
  captured into a place the app cannot read.

**Local seam, not a contract.** The App Group container
`group.org.example.learningcompanion` is a placeholder; the real value follows U6. It holds
`Capture/<UTC time>-<id>/status.json` (atomic, at most once per second while frames arrive),
`events.jsonl` (append-only) and `frames/*.png`. No field here is a shared protocol field. The upload
payload and transport wait for the lead's formal contract.

**Retention.** Kept keyframes are durable authorized source evidence under P0-11 plan section 3 and
section 17.2 rule 7. There is no continuous or full-session recording, no lecture file and no replay.
Explicit deletion, sharing stops and history sync remain the existing rules; this slice adds no
deletion UI.

## Build interface

```sh
xcodebuild -project apps/ios/ScreenObserver/ScreenObserver.xcodeproj -target ScreenObserver \
  -sdk iphoneos CODE_SIGNING_ALLOWED=NO build          # the app embeds BroadcastUpload.appex
xcodebuild -project apps/ios/ScreenObserver/ScreenObserver.xcodeproj -target ScreenObserver \
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

Placeholder bundle IDs, whose real prefix is U6:
- `org.example.learningcompanion.screenobserver` (app);
- `org.example.learningcompanion.screenobserver.broadcast` (extension).

No team is set. In the Simulator, system broadcast is not expected to work: a Simulator build shows
compile and launch only.

## Evidence levels

| Level | State |
| --- | --- |
| Source and project written | Yes |
| Project file structure (Linux parse, not committed) | Every object ID is 24-hex and defined; each target's phases, synchronized folders, entitlements and extension `Info.plist` are consistent |
| Lead's bounded source review of `a6f2ae7` (SO1 retention/attempt bounds, SO2 unchecked pixel layouts) | Both repaired in this revision (see Retention and Sampling layouts) |
| Independent code reading | Workflow `wf_64810f1d-d8d`. The compile lens found no issues. The behaviour lens had 5 findings confirmed and 6 rejected on verification. Fixed before commit: open not-retained runs are written with every status write; event-write failures are counted; the text says backups can include kept frames; the stored encoding is described accurately (now lossless PNG, see Retention); there is no promise that the broadcast runs until stopped. Reading is not compiling. |
| Boundary regressions (`apps/ios/checks/ScreenObserverCheck/main.swift`, Mac only, real CoreVideo buffers, Core Image PNG, temporary directory) | **15/15 PASS, no FAIL or SKIP**, in [run 36568288679](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36568288679) at main `98ee104`, on the runner's macOS. Coverage: It checks the reviewer's 16×16 2-byte packed buffer (no read, empty grid), 10-bit bi-planar (empty), and exact sample positions for `420f` and BGRA. For the budget: one byte over, exact fit, and full-store refusal. It also checks that a kept original is never overwritten, that no staging file is left, and that an encode failure leaves no file. Command: `xcrun swiftc -target arm64-apple-macos14 apps/ios/ScreenObserver/BroadcastUpload/LumaGrid.swift apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift apps/ios/checks/ScreenObserverCheck/main.swift -o "$RUNNER_TEMP/screen-observer-check" && "$RUNNER_TEMP/screen-observer-check"`. The attempt interval in `CaptureSession` and cleanup-failure stopping are not covered by this check. |
| Hosted compile | **Yes, unsigned.** [Run 36568288679](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36568288679) (`iOS ScreenObserver compile`) at main `98ee104`, on `macos-26` with Xcode 26.6 and the iOS 26.5 SDKs. `** BUILD SUCCEEDED **` for both `iphoneos` and `iphonesimulator`: `ScreenObserver.app` with its embedded `BroadcastUpload.appex`. No Swift source warning or error. The only warnings are non-fatal: AppIntents metadata extraction skipped, and `ONLY_ACTIVE_ARCH` with a generic destination. Source equals `8f7e5df`. |
| Simulator | Not run. Compile and launch only; no broadcast. |
| Device: broadcast started, real frames kept across apps, pause, resume, finish, stop; extension memory with full-size PNG encoding against the reported ~50 MB limit | Not run |

## Device action needed

A signed build of both targets, whose provisioning covers the App Group entitlement in
`Config/ScreenObserver.entitlements` and `Config/BroadcastUpload.entitlements`, installed on the
iPad. The user then starts the broadcast once from the picker.

Which signing route can provide that, without a Mac and without a purchase, is Support's decision.
It depends on these targets' actual entitlements. It is not inferred from the Safari extension's
program requirement, and the pending App Store Connect team question applies. No account or signing
work was done.

## Not covered

- Gate 2 (a cross-app selector or pen).
- The AI actually receiving frames: no provider. The bounded original-byte uploader, not yet
  called by the app, is in [`capture-ingress-originals.md`](capture-ingress-originals.md).
- Audio.
- The Safari original-page path, which is packaged separately in `safari-extension-packaging.md`.
- Merging this into one product app. The separate app is a capture dependency, not the final user
  experience.
- R59/A44.
