# P0-03 real-device test checklist

## Current target and audio scope (lead clarification, 2026-09-28)

Read [current decisions](../../requirements/intent-and-decisions.md#current-decisions) and the [audio routing candidates](../../requirements/audio-screen-interpretation.md#microphone-routing-candidates) before applying the dated routes below. The user reports iPad Pro 13-inch (M5), iPadOS 26.5; the 27.0 research reference is not the user's target or an upgrade prerequisite for conditional 26.2+ dualRoute. Built-in classroom pickup plus a compatible bidirectional personal headset is a distinct untested candidate. The existing single-microphone/playback scenario uses the researched playAndRecord/mixWithOthers route. The distinct dualRoute candidate requires multiRoute + allowBluetoothHFP; it is not that older route. One primary interaction input does not forbid additional authorized sources; no available-input list proves simultaneous signals. The iOS owner will extend the existing DT-G3-05/11 and AV01–03/06 variants at a safe boundary. Current matrix/device statuses remain unchanged; no build, provider, hardware or mode activation follows.


Status: **none of these tests has been run.** Every test is `not_tested` until a record exists under
`docs/verification/platform/device/<YYYY-MM-DD>/`. Row IDs refer to
[`p0-03-capability-matrix.md`](p0-03-capability-matrix.md). Routes (A, A-free, A-paid, B1, B2, C, D) are defined
in [`p0-03-environment.md`](p0-03-environment.md).

## Protocol for every run

- Record the device: model name, A-number, `utsname.machine`, iPadOS version and build (for example
  27.0 24A437), and Pencil model. Record the app build: route, commit or probe version, and the
  Xcode/Playground version.
- Record the conditions: network (Wi-Fi, offline, campus), orientation, window mode (full screen,
  tiled, Slide Over), and whether headphones are connected.
- Launch lifecycle, capture and background tests from the Home Screen, never under the Xcode debugger.
  The debugger prevents suspension.
- Outcome is exactly one of `pass`, `fail`, `blocked` (precondition missing) or `not_tested`. A
  failure keeps its reproduction steps and logs. Desktop or simulator results never count.
- Use only project-owned fixture pages when possible. Tests on real bCourses pages run under the
  user's own login, performed by the user. The team does not log in, and course content is not
  committed.
- Evidence: the probe's JSON log, screenshots or screen recordings made by the user, and the timestamps.
  Remove personal data before committing.

## Environment and identity

#### DT-ENV-01 Device identity
Route: none (Settings) or C. Steps: Settings → General → About. Record Model Name, the A-number (tap
Model Number) and the iPadOS version. In the probe, log `utsname.machine`, `UIDevice.systemVersion`,
`userInterfaceIdiom` and `SCContentSharingPicker.isAvailable` (the last needs route A with the 27 SDK).
Expected: Air M3 A3266–A3271 or Pro M5 A3357–A3362, or a 2024 Pencil Pro model bought in 2025 (Pro M4
A2836/A2837/A3006/A2925/A2926/A3007, Air M2 A2898–A2904, mini A17 Pro A2993/A2995/A2996). If the
A-number is A3354–A3356 (iPad A16), the
Pencil Pro assumption is wrong. Also record the iPhone model and iOS version.

#### DT-ENV-02 Pencil pairing and system options
Route: none. Steps: Settings → Apple Pencil. Record whether the Squeeze, Double-tap and Barrel-roll
options exist and what they are set to. Record the Scribble and "Only Draw with Apple Pencil"
settings. Expected: Pencil Pro options are present on Air M3 and Pro M5.

#### DT-ENV-03 Developer Mode visibility
Route: none, then A. Steps: Settings → Privacy & Security → scroll to Security, before and after
pairing with a Mac. Expected (D7-08): the toggle is absent until pairing has started.

#### DT-ENV-04 Swift Playground capability check
Route: C. Steps: create an app playground and add the PencilKit, WebKit and microphone probe (see the
prototype plan). Run it. Check whether Playground offers extension targets, App Groups or Background
Modes. Expected (D7-19): the probe runs; extensions and background modes are unavailable.

#### DT-ENV-05 Safari packager upload
Route: B1. Steps: upload a minimal MV3 extension whose content script only logs on a fixture page.
Expected: a build appears in App Store Connect and installs through TestFlight. Record the Xcode Cloud
minutes deducted.

## G1: Safari in-page

#### DT-G1-01 Enable the extension and detect its state
Route: B1 (enabling); A-paid (state API). Steps: enable the extension in Safari → Manage Extensions. In the
containing app, read `SFSafariExtensionManager` state and call `openExtensionsSettings`, with the app
in the foreground and again in the background. Expected: the state flips to enabled, and the deep link
works only in the foreground (iPadOS 26.2+). Also check per-profile enablement.

#### DT-G1-02 Per-site and iframe permissions
Route: B1. Steps: open a bCourses page that embeds Kaltura video. Log `location.origin` from every
frame to the local log or backend. Record each permission alert. Expected: the top frame runs after
the grant. Iframe prompts and injection are unknown.

#### DT-G1-03 Pen vs touch in the page
Route: B1 or C (fixture page in WKWebView). Steps: log `pointerType`, `touchType`, pressure, tilt,
altitude and azimuth, the length of `getCoalescedEvents`, and `twist` for Pencil and for a finger.
Expected: `pen`/`stylus` versus `touch`/`direct`.

#### DT-G1-04 Simultaneous Pencil and finger
Route: B1 or C. Steps: write with the Pencil while scrolling with a finger, then the reverse. Also rest
the palm while writing. Expected: undocumented. A developer report says the finger is dropped while
the Pencil is down. Record which input survives and whether the stroke is cut.

#### DT-G1-05 Home Screen web app
Route: B1. Steps: add bCourses to the Home Screen with "Open as Web App" on, then again with it off.
Record whether the content script runs in each. Expected: unknown in the web app; yes in the Safari
tab.

#### DT-G1-06 Fullscreen video
Route: B1. Steps: enter fullscreen on the Kaltura player and on a YouTube embed. Record native versus
element fullscreen (`document.fullscreenElement` inside the iframe), whether the overlay is visible,
and whether captions and Live Text appear (Safari 27).

#### DT-G1-07 `captureVisibleTab` fidelity
Route: B1. Steps: capture while the video is playing and while it is paused, with the toolbar expanded
and collapsed, and in full screen, tiled and Slide Over windows. Measure the vertical offset between
the selection rectangle and the image, check the video region for black pixels, and time the capture.
Expected: availability is documented. Cropping and video pixels are unknown.

#### DT-G1-08 Background idle soak
Route: B1. Steps: build both background variants (non-persistent `scripts` and a service worker). Leave
each idle for 1, 5 and 30 minutes, switching to Notability and back, then make a selection. Expected:
the background wakes and the selection is delivered. Record every failure to wake.

#### DT-G1-09 Native messaging round trip
Route: A-paid (U3 + U4). Steps: send `sendNativeMessage` payloads of 1 KB, 100 KB and 1 MB with a
contract-0.1.0 `BridgeRequest`. Log latency, the `BridgeResponse`, appex memory, and every `userInfo`
key the handler receives. Apple documents only `SFExtensionMessageKey` and `SFExtensionProfileKey`. Try `connectNative` and record whether a port opens and how long it lives.
Expected: request/response works. The port is undocumented on iOS.

#### DT-G1-10 Caption source in Kaltura
Route: B1. Steps: from an `all_frames` content script in the player iframe, log whether captions are
DOM elements or only `video.textTracks` cues. Repeat inline and in fullscreen.

#### DT-G1-11 Canvas Student app
Route: B1. Steps: open the same video in Canvas Student and confirm the extension does not run there.
Then turn on Settings → Apps → Canvas → "Open external tools in Safari" and confirm Kaltura opens in
Safari with the extension active.

#### DT-G1-12 In-app browser fallback sign-in
Route: A. Steps: in our WKWebView with `WKWebExtensionController`, sign in to CalNet with the user's own
Duo method, performed by the user. Then play a Kaltura video in-page and repeat DT-G1-03/06/07 using
`takeSnapshot`. Expected: WebAuthn or passkey methods may fail. Record the exact failure.

## Native Pencil and ink (our own windows)

#### DT-PEN-01 Naive overlay baseline
Route: C. Steps: put a full-screen transparent `PKCanvasView` (`.pencilOnly`) over a WKWebView showing
a fixture page. Swipe and tap a link with a finger. Expected (inferred): the canvas takes the finger,
so the page neither scrolls nor follows the link. This baseline shows that custom routing is needed.

#### DT-PEN-02 NAV mode toggle
Route: C. Steps: set the overlay's `isUserInteractionEnabled = false` in NAV mode. Confirm that finger
and Pencil both reach the page and that the ink stays visible. Switch to WRITE mode and record what the
finger does.

#### DT-PEN-03 Pencil-only routing over WKWebView
Route: C. Steps: add a pan recognizer on the container with `allowedTouchTypes = [.pencil]` and
`cancelsTouchesInView = true`, try `delaysTouchesBegan` both true and false, and set the web view's
scroll pan to `[.direct]`. Test finger scroll, pinch, link taps, and video play/scrub/fullscreen. Draw a
Pencil stroke across a link and across the video. Log the page's `pointerdown`/`touchstart` for Pencil.
Expected: undocumented. Pass means fingers work and Pencil strokes neither scroll nor click.

#### DT-PEN-04 False triggers (A03)
Route: C. Steps: follow a fixed 5-minute script of scroll, tap, pinch, write and scrub in WRITE mode,
then 100 scripted interactions (spec §11). Expected: zero ASK requests logged. Then enter ASK, circle
once, and confirm the previous mode returns.

#### DT-PEN-05 Pencil capability signals
Route: C. Steps: log the first `.pencil` touch, hover `zOffset`, squeeze phases, `rollAngle`,
`preferredTapAction` and `preferredSqueezeAction`. Set squeeze to Shortcut and confirm the app receives
no squeeze. Test with a finger only to confirm the app starts in finger-safe mode.

#### DT-PEN-06 Scribble interference
Route: C. Steps: write with the Pencil over a text field in the fixture page with Scribble on. Test
with and without focus blocking and a native `UIScribbleInteraction` delegate. Record any inserted text.

#### DT-INK-01 Persistence, force-quit and offline (A27)
Route: C (in-app), then A. Steps: draw 200 strokes, force-quit within 1 s of the last stroke, go
offline, and relaunch. Measure the time from stroke end to durable write for 1k, 5k and 20k strokes.
Delete the AI layer. Expected: every saved stroke is restored as editable ink, the AI layer is
separately deletable, there are no duplicate revisions, and the 500 ms target (spec §11) is measured.

#### DT-INK-02 Stroke IDs and recognizer (iPadOS 27)
Route: A, or C if the Playground SDK exposes the 27 APIs (Playground 4.7 ships the iOS 26 SDK, so
probably not). Steps: save and reload a drawing and compare `PKStroke.id` values. Run
`PKStrokeRecognizer` on English handwriting and record `recognitionVersion` and supported languages.

#### DT-INK-03 Content version
Route: C or A. Steps: draw with the newest ink and read `requiredContentVersion`. Pin
`maximumSupportedContentVersion` and confirm the newer inks are hidden. Open the note on an older-OS
iPhone if one is available.

## G2: cross-app

#### DT-G2-01 Assistant beside another app
Route: C or A. Steps: tile the assistant beside Canvas Student and put it in Slide Over. Confirm that
Pencil and touches reach only the window under them. Log `UIScene.activationState` and whether timers
and sockets keep running while the user works only in the other app for 10 minutes.

#### DT-G2-02 Drag and drop sources
Route: C or A. Steps: drag an image, text, a link or a page out of Canvas Student, Notability and
Safari, and a screenshot thumbnail, into a `UIDropInteraction`. Record the delivered UTTypes, or that
no drag was possible.

#### DT-G2-03 Screenshot share
Route: A (share extension) or C (Photos picker). Steps: take a screenshot with a Pencil corner swipe,
optionally mark it up, then share it or pick it from Photos. Record the image size and the steps.

#### DT-G2-04 Visual Intelligence provider
Route: A. Precondition: Apple Intelligence on and the iPad eligible. Steps: in Canvas Student, take a
screenshot, highlight a formula and choose our app. Log the `pixelBuffer` size against the screen size.

#### DT-G2-05 Squeeze → Shortcut quick capture
Route: A. Steps: map squeeze to the shortcut [Take Screenshot → our App Intent]. Squeeze with Canvas
Student in front, then with Notability in front. Record whether the action exists, whether the
screenshot excludes the Shortcuts UI, where the snippet appears, the latency, and what happens to
Notability's squeeze tools. Restore the settings afterwards.

#### DT-G2-06 PiP probe
Route: A. Steps: start a sample-buffer PiP window and confirm that only system controls respond and
that no touches or strokes arrive. Also check whether the bCourses/Kaltura or Canvas player supports
system PiP over our app.

#### DT-G2-07 Canvas deep link
Route: A. Steps: call `open(canvas-courses://…)` without `canOpenURL`, both logged in and logged out, and
with Canvas Student uninstalled. Record success and the fallback to Safari.

## G3: capture, audio, devices

#### DT-G3-01 ScreenCaptureKit background survival (go/no-go)
Route: A with Xcode 27, on iPadOS 27. Build A uses `screen-capture` + `audio` modes, an active
`playAndRecord` + `mixWithOthers` session, and `present()` full display. Build B uses the
`screen-capture` mode only. For each build: start capture, switch to Safari and play a lecture for
60 minutes, then use Canvas Student. Log frame and audio timestamps, gaps over 2 s, and any
`didStopWithError` code.

#### DT-G3-02 Lock and upload acceptance
Route: A. Steps: lock the screen for 2 minutes during capture. Record the stop codes, whether frames
resume, and whether mic samples continue. Separately, upload a build with the capture Info.plist to App
Store Connect and record any validation error verbatim.

#### DT-G3-03 Picker scope and reconfiguration
Route: A. Steps: call `present()`, `present(using: .window)` and `presentForCurrentApplication()`, and
record every option the iPad picker shows. Then change resolution or mic mid-session and measure the
gap.

#### DT-G3-04 Course audio and protected video
Route: A. Steps: with `capturesAudio`, play a lecture in (a) Safari, (b) Canvas Student and (c) Music
as a control. Measure `.audio` RMS. Inspect the video region for black frames. Record whether the
source app pauses and what `sceneCaptureState` reports.

#### DT-G3-05 Microphone separation and mixing
Route: A (C for the mic part). Steps: speak while the course plays on the speaker, then on AirPods.
Measure course leakage into the mic. Compare with and without `mixWithOthers`, which may interrupt
Safari, and with voice processing at default and minimum ducking. Log
`isEchoCancelledInputAvailable`.
R60 note (`89602e7`): this is a prerequisite for P0-11 DT-G7-AV01 to AV03 only. It passes no AVTEST
case and says nothing about understanding or speaker attribution.

#### DT-G3-06 Own-audio exclusion
Route: A. Steps: play a 1 kHz tone from our app while capturing, on 27.0 and later builds. Measure the
suppression achieved by `excludesCurrentProcessAudio`.

#### DT-G3-07 ReplayKit fallback
Route: A. Steps: on iPadOS 26.x and 27, broadcast for 30 minutes at full resolution. Measure extension
memory and watch for EXC_RESOURCE. Force-quit the host and record whether the broadcast continues.

#### DT-G3-08 Cross-device clock skew
Route: A plus the Windows client. Steps: play an audible and visual marker while the iPad, iPhone and
Windows all capture. Measure the residual skew after server offset correction.

#### DT-G3-09 Capture availability
Route: A. Steps: log `SCContentSharingPicker.isAvailable` by default and under any Screen Time
restriction the device offers.

#### DT-G3-10 Independent per-device start/stop
Route: A (iPad and iPhone). Steps: start and stop capture on each device independently, once with the
other device's capture off and once with it already on. Expected (R36/A16): stopping or starting one
device never starts capture on the other; if the other device was off it stays off; if it was already
enabled it keeps capturing; the stopped device's old frames are labelled stale and never presented as
current. (Corrected 2026-09-28 after the support diagnosis in `7cb9057`; the earlier wording "nothing
starts or continues on the other device" conflicted with A16.)

#### DT-G3-11 Background on-device recognition
Route: A. Steps: run `SpeechTranscriber` on `.microphone` and on `.audio` while backgrounded behind
Safari for 15 minutes. Log errors, dropped output and CPU use.
R60 note (`89602e7`): a prerequisite for P0-11 DT-G7-AV03 and AV06 only; it passes no AVTEST case.

## Lifecycle (A14)

#### DT-LC-01 Switch apps
Route: A (C covers the scene logs only). Steps: during a session, switch to Safari, Canvas Student and
the Home Screen, then return. Expected: the session stays `active_background`. Log the scene phases.

#### DT-LC-02 Stop paths
Route: A. Steps: stop capture from the system indicator or Control Center, take a phone or FaceTime
call, and invoke Siri. Record the `SCStreamError` codes and the UI state ("capture stopped, session
open"). Confirm that restart needs the picker.

#### DT-LC-03 Force-quit
Route: A. Steps: force-quit during capture. Confirm the indicator disappears. Log
`applicationWillTerminate` and `sceneDidDisconnect` if they fire. Relaunch and confirm the session shows
`interrupted_unobserved` (derived by the server from heartbeat timeout), never `ended`.

#### DT-LC-04 Window close confirmation
Route: A. Steps: close the window through the window controls during a session, expecting a dialog.
Then swipe it away in the app switcher and record whether a dialog appears.

#### DT-LC-05 Session indicator
Route: A. Steps: start a Live Activity. Check it on the Lock Screen and while unlocked in Safari, and
check the End deep link and the 8-hour behavior.

#### DT-LC-06 Finalize after End
Route: A. Steps: tap End, then run `BGContinuedProcessingTask` plus a background upload of a 200 MB file
and go Home. Repeat with a force-quit mid-upload.

#### DT-LC-07 Microphone interruptions
Route: A (C partly). Steps: close the Smart Folio, play and pause Safari video, take a call. Log the
interruption reasons and `shouldResume`. Try restarting the mic from the background and record
`cannotStartRecording`.

## G5: external notes

#### DT-G5-01 Notability share semantics
Route: A, B2 or C. Steps: share a 3-page PDF to Notability. Log `activityType` and `completed`, and
observe Notability's import UI and the destination folder.

#### DT-G5-02 Share is not import (negative control)
Route: A, B2 or C. Steps: repeat DT-G5-01 but cancel inside Notability. Expected: `completed` was already
reported, which proves the state must stay "shared, needs import". Also log whether the
`UIDocumentInteractionController` callbacks fire.

#### DT-G5-03 Editability and PDF form
Route: A, B2 or C. Steps: in Notability, try the lasso and eraser on the imported ink. Inspect the PDF for
vector or raster ink, for example with `qpdf`/`mutool` on Windows.

#### DT-G5-04 Automation absence
Route: none. Steps: open the Shortcuts app and list every Notability action.

#### DT-G5-05 OneNote happy path
Route: A. Precondition: user input U10. Steps: sign in with MSAL (`Notes.Create` + `Notes.Read`, or
`Notes.ReadWrite`). POST a multipart page, record the 201 response, page ID, links and correlation ID,
then GET it back and open `oneNoteClientUrl`.

#### DT-G5-06 OneNote limits and reconciliation
Route: A. Steps: send an oversize request (expect 413) and one with 7 parts. Drop the network after the
POST and before the response, then reconcile by title token. Expected: exactly one page.

#### DT-G5-07 InkML probe (optional)
Route: A. Steps: POST a `presentation-onenote-inkml` part to v1.0. Record the status. Do not ship it
unless editable ink appears.
