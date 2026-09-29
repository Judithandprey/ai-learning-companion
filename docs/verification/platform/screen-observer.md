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
  recorded but not applied) and pixel format.
- **Retention:** a changed frame is kept as a lossy JPEG re-encode (quality 0.85, sRGB) of the
  delivered, unrotated buffer at native resolution, at most once per 2 s, up to 512 MB per session. "Changed" means a 256×192 luma grid
  differs by more than 24 from the last kept frame.
  - These are adjustable engineering bounds, to be measured on the device. They are not accepted
    coverage.
  - An equal grid does not prove equal pixels, so such frames are "not retained by heuristic".
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
`events.jsonl` (append-only) and `frames/*.jpg`. No field here is a shared protocol field. The upload
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
| Independent code reading | Workflow `wf_64810f1d-d8d`. The compile lens found no issues. The behaviour lens had 5 findings confirmed and 6 rejected on verification. Fixed before commit: open not-retained runs are written with every status write; event-write failures are counted; the text says backups can include kept frames; frames are described as lossy JPEG re-encodes; there is no promise that the broadcast runs until stopped. Reading is not compiling. |
| Hosted compile | **Not yet run.** Support's job runs the commands above. |
| Simulator | Not run. Compile and launch only; no broadcast. |
| Device: broadcast started, real frames kept across apps, pause, resume, finish, stop | Not run |

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
- The AI actually receiving frames: no upload, no provider.
- Audio.
- The Safari original-page path, which is packaged separately in `safari-extension-packaging.md`.
- Merging this into one product app. The separate app is a capture dependency, not the final user
  experience.
- R59/A44.
