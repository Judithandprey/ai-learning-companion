# P0-03 real-device test checklist

## Current target and audio scope (lead clarification, 2026-09-28)

Read [current decisions](../../requirements/intent-and-decisions.md#current-decisions) and the [audio routing candidates](../../requirements/audio-screen-interpretation.md#microphone-routing-candidates) before applying the dated routes below. The user reports iPad Pro 13-inch (M5), iPadOS 26.5; the 27.0 research reference is not the user's target or an upgrade prerequisite for conditional 26.2+ dualRoute. Built-in classroom pickup plus a compatible bidirectional personal headset is a distinct untested candidate. The existing single-microphone/playback scenario uses the researched playAndRecord/mixWithOthers route. The distinct dualRoute candidate requires multiRoute + allowBluetoothHFP; it is not that older route. One primary interaction input does not forbid additional authorized sources; no available-input list proves simultaneous signals. The iOS owner will extend the existing DT-G3-05/11 and AV01–03/06 variants at a safe boundary. Current matrix/device statuses remain unchanged; no build, provider, hardware or mode activation follows.


## Applicability on the reported target (iPadOS 26.5)

The user reports an iPad Pro 13-inch (M5) on iPadOS 26.5 (lead normalization `7fadd15`). iPadOS 27.0
is the dated research reference, not an upgrade prerequisite: a 27-only test runs only if a 27 device
is available. Values: `runs_as_written`, `variant_needed` (the note names the 26.5 variant),
`requires_27`, `os_independent`. Two independent reviewers classified the 58 pre-existing tests
(workflow `wf_951dd183-c00`; an adjudicator settled 5 disagreements across all 217 row and test
decisions in both matrices and checklists). The iOS owner set the values for DT-G3-12 and DT-G3-13 and
for the tests whose text this revision extended. The checker requires every test to appear here
exactly once. A build from the 27 SDK can still deploy to 26.5; the APIs a test uses decide.

<!-- target-26-5:begin -->
| Test | iPadOS 26.5 | Note |
| --- | --- | --- |
| DT-ENV-01 | variant_needed | Log SCContentSharingPicker.isAvailable only under #available(iOS 27) and record n/a on 26.5. Expected identity: iPad Pro 13-inch (M5) A3360-A3362. |
| DT-ENV-02 | runs_as_written | Pencil Pro squeeze, double-tap and barrel-roll settings exist since iPadOS 17.5. |
| DT-ENV-03 | runs_as_written | Developer Mode is iOS 16+ (D7-08). |
| DT-ENV-04 | runs_as_written | Swift Playground 4.7 needs iPadOS 18.0+ and ships the iOS 26 SDK (D7-19). |
| DT-ENV-05 | runs_as_written | Packager exists since the Safari 26 cycle; confirm the TestFlight build installs on 26.5 and record its minimum OS. |
| DT-G1-01 | runs_as_written | stateOfExtension and openExtensionsSettings are iPadOS 26.2+. |
| DT-G1-02 | runs_as_written | Content-script and iframe injection keys are Safari 15+/18.4+. |
| DT-G1-03 | runs_as_written | All logged pointer fields exist in Safari 18.2+/26.2+. |
| DT-G1-04 | runs_as_written | No 27-only API. |
| DT-G1-05 | runs_as_written | 'Open as Web App' default is iPadOS 26+. |
| DT-G1-06 | runs_as_written | Safari 26.x lacks the Safari 27 fixes for fullscreen captions and Live Text on paused fullscreen video (D8-25); record their absence as the 26.x baseline. |
| DT-G1-07 | runs_as_written | captureVisibleTab is Safari iOS 15+. |
| DT-G1-08 | runs_as_written | Both background variants are supported since Safari 15.4. |
| DT-G1-09 | runs_as_written | sendNativeMessage 15+, SFExtensionProfileKey 17+; a 27-SDK build can deploy to 26.5. |
| DT-G1-10 | runs_as_written | Caption visibility in fullscreen differs on Safari 26.x (no D8-25 fix); record it. |
| DT-G1-11 | runs_as_written | Third-party Canvas setting; no 27 dependency. |
| DT-G1-12 | runs_as_written | WKWebExtension APIs are 18.4+; route A build targeting 26.5. |
| DT-PEN-01 | runs_as_written | PKCanvasView .pencilOnly 14+; route C (iOS 26 SDK). |
| DT-PEN-02 | runs_as_written | No 27-only API. |
| DT-PEN-03 | runs_as_written | UIKit touch-type APIs 9+. |
| DT-PEN-04 | runs_as_written | No 27-only API. |
| DT-PEN-05 | runs_as_written | Squeeze, rollAngle and preferred actions 17.5+; hover 16.1+. |
| DT-PEN-06 | runs_as_written | Scribble and UIScribbleInteraction 14+. |
| DT-INK-01 | runs_as_written | PKDrawing, SwiftData and atomic writes all available; route C then A. |
| DT-INK-02 | requires_27 | PKStroke.id and PKStrokeRecognizer are 27.0+ only; no 26.5 variant is defined (INK-03 fallback uses app-assigned IDs). |
| DT-INK-03 | runs_as_written | On 26.5 the newest ink is version4 (Reed Pen); version5 does not exist there. |
| DT-G2-01 | runs_as_written | Windowed Apps 26+, Slide Over 26.2+. |
| DT-G2-02 | runs_as_written | Drag and drop 11+. |
| DT-G2-03 | runs_as_written | Screenshot, Markup and Photos picker are long-standing. |
| DT-G2-04 | requires_27 | The Visual Intelligence screenshot provider on iPad arrives with iPadOS 27 (D8-10). |
| DT-G2-05 | runs_as_written | Squeeze->Shortcut 17.5+, SnippetIntent 26.0+. |
| DT-G2-06 | runs_as_written | PiP APIs 9+/15+. |
| DT-G2-07 | runs_as_written | open(_:) without canOpenURL works on 26.5; the canOpenURL deprecation is 27-only and irrelevant. |
| DT-G3-01 | variant_needed | SCK is 27.0+. 26.5 variant: the same 60-minute Safari/Canvas scenario with the ReplayKit broadcast extension (DT-G3-07, P0-11 DT-G7-V09), logging broadcast gaps. |
| DT-G3-02 | variant_needed | Lock the screen during a broadcast (log broadcastPaused/Finished and mic continuity under the audio mode). Upload validation of screen-capture is App Store Connect side, not device OS. |
| DT-G3-03 | variant_needed | present()/present(using:)/presentForCurrentApplication are SCK 27.0+ (D4-01). 26.5 variant on G3-07: record RPSystemBroadcastPickerView options (full display only, mic toggle) and the stop/restart gap. |
| DT-G3-04 | variant_needed | Use RPSampleBufferType.audioApp RMS in the G3-07 extension instead of SCK .audio; black-frame and sceneCaptureState (17+) checks run as written. |
| DT-G3-05 | runs_as_written | Extended for 26.5: M1 single input, M2 dualRoute (26.2+), broadcast coexistence, unsupported paths; the 27 SCK leg runs only on a 27 device. |
| DT-G3-06 | requires_27 | excludesCurrentProcessAudio is SCK 27.0+ and the test targets 27.0+ builds; 26.5 has no exclusion API. |
| DT-G3-07 | runs_as_written | Primary capture test on 26.5; the 27 leg needs a 27 device. |
| DT-G3-08 | runs_as_written | Route-agnostic; the iPad leg uses broadcast CMSampleBuffer PTS (no synchronizationClock on 26.5). |
| DT-G3-09 | requires_27 | SCContentSharingPicker.isAvailable is 27.0+; on 26.5 only an attempted broadcast under a restriction could be observed (not defined in the checklist). |
| DT-G3-10 | runs_as_written | Route-agnostic; the iPad uses the broadcast picker on 26.5 and the iPhone its own OS route (D8-15). |
| DT-G3-11 | runs_as_written | Extended for 26.5: SpeechTranscriber (26.0+) per delivered session channel and broadcast buffer; the SCK .microphone/.audio leg is 27-only. |
| DT-G3-12 | runs_as_written | Written for 26.5; equipment already owned only. |
| DT-G3-13 | runs_as_written | Written for 26.5 (iPhone on its own OS); optional P3-01 route. |
| DT-LC-01 | runs_as_written | Scene phases 13+; background session via the audio mode or the broadcast extension. |
| DT-LC-02 | variant_needed | SCStreamError codes are 27.0+; on 26.5 log broadcastPaused/Finished, finishBroadcastWithError + App Group flag and sceneCaptureState (LC-02 fallback). |
| DT-LC-03 | runs_as_written | On 26.5 capture lives in the broadcast extension; the indicator may persist after host force-quit (D5-15). Record it rather than fail. |
| DT-LC-04 | requires_27 | UISceneClosureConfirmation is 27.0+; no dialog is possible on 26.5 (row fallback: explicit End). |
| DT-LC-05 | runs_as_written | iPad Lock Screen Live Activities 17+. |
| DT-LC-06 | runs_as_written | BGContinuedProcessingTask 26.0+; background URLSession 8+. |
| DT-LC-07 | runs_as_written | Interruption APIs on all versions; cannotStartRecording 13+. |
| DT-G5-01 | runs_as_written | UIActivityViewController; Notability needs iPadOS 17.5+. |
| DT-G5-02 | runs_as_written | No 27-only API. |
| DT-G5-03 | runs_as_written | Notability editing and PDF inspection; no 27-only API. |
| DT-G5-04 | os_independent | Lists Notability's Shortcuts actions; a vendor fact. |
| DT-G5-05 | os_independent | Microsoft Graph and MSAL (iOS 14+); not bound to the iPadOS version. |
| DT-G5-06 | os_independent | Graph limits and reconciliation. |
| DT-G5-07 | os_independent | Graph InkML probe. |
<!-- target-26-5:end -->

Status: **none of these tests has been run.** Every test is `not_tested` until a record exists under
`docs/verification/platform/device/<YYYY-MM-DD>/`. Row IDs refer to
[`p0-03-capability-matrix.md`](p0-03-capability-matrix.md). Routes (A, A-free, A-paid, B1, B2, C, D) are defined
in [`p0-03-environment.md`](p0-03-environment.md). Route H, a hosted signed build installed through
TestFlight, is defined in [P0-11 plan section 13](p0-11-g7-plan.md#hosted-route); it needs U4 (paid
program, not authorized), an App Store Connect app record, an API-key secret and a lead-added
workflow, and it is unverified and not configured. "A or H" means any installed build is enough.

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
User-reported target (`7fadd15`): iPad Pro 13-inch (M5), iPadOS 26.5; expect A3360–A3362 for the
13-inch M5. This test verifies that report; on 26.5, `SCContentSharingPicker.isAvailable` is not
available and is recorded as n/a.

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

**Extension for the reported target and microphone scenarios** (lead normalization `7fadd15`; P0-11
plan section 17.0; research `F1-*`/`F2-*`/`F3-*` in
[`research/audio-routing-26-5-claims.json`](research/audio-routing-26-5-claims.json)). Target: the
user's iPad Pro 13-inch (M5) on iPadOS 26.5, not upgraded. Route A or H: an installed build from a
26.2-or-later SDK with a deployment target at or below 26.5, the `audio` background mode, and the
broadcast upload extension with an App Group for the coexistence variants. Route C only for the
foreground single-input part, and for `dualRoute` only if Swift Playground's SDK is 26.2 or later
(check first). Use equipment the learner already has; nothing is bought. Consenting people or
project reference audio only (dualRoute forbids recording others without their awareness, F1-07).

Scenarios are run and reported separately: M1 = one input with `playAndRecord` + `mixWithOthers`;
M2 = `multiRoute` + `dualRoute` + `allowBluetoothHFP`. M3 (multichannel interface) is DT-G3-12 and M4
(iPad plus iPhone) is DT-G3-13.

Log in every variant:
- model, A-number, `utsname.machine`, iPadOS version and build;
- `availableModes` before any `setCategory`, after `setCategory(.multiRoute)` with nothing connected,
  and with each candidate secondary connected;
- requested and read-back category, mode and options, and any thrown error domain and code;
- `currentRoute` inputs and outputs: port type, name, UID, channels (name, number, owning UID) and
  data sources; `inputNumberOfChannels`, `maximumInputNumberOfChannels`, sample rate and I/O buffer
  duration;
- the input channel map used (F2-M21), and the user's microphone mode in Control Center (F3-M25);
- every route-change, available-inputs-change, interruption and media-services notification, with
  its reason and time.

None of these logs proves an independent signal (F2-04; `availableInputs` depends on category and
mode, F2-01).

Signal method (thresholds fixed before the runs): play distinct reference signals from known
positions — a quiet, hesitant near-mouth voice (or a marker tone from a small speaker at the mouth),
a far teacher loudspeaker at 3, 6 and 10 m (engineering candidates), and a bystander. For each
delivered channel record RMS, peak, clipping, the level difference between channels in dB, and the
cross-correlation and lag with each reference and between channels. Check explicitly for duplicated
mono (correlation near 1 at zero lag, or identical samples). Channels count as independent only when
each carries its own reference clearly above leakage and levels change independently when one source
is muted. Also compare spectral energy above 4 and 8 kHz on the built-in channel with and without an
HFP secondary (bandwidth for the far teacher).

Variants:
1. **M1 baseline.** Built-in microphone only, then one headset microphone only. The course plays in
   Safari, then Canvas Student, then Music as a control. Record the Bluetooth option set (none, A2DP
   or HFP) and whether the course output moved off the headset when our session activated (HFP input
   moves output to the same device, F1-16; A2DP is output-only, F1-17).
2. **M2 gate.** `setCategory(.multiRoute, mode: .dualRoute, options: [.allowBluetoothHFP])` and
   activation with no secondary, with output-only earphones, and with each eligible headset.
   Classify each outcome as an error, a fallback to default-mode behaviour, or built-in-only
   activation (F1-19, F1-21). A successful call is not a pass.
3. **M2 options.** Record acceptance and read-back of `[.allowBluetoothHFP]` (the option's own page
   says record/playAndRecord only, F1-15), `[.allowBluetoothHFP, .mixWithOthers]` (F1-11), and
   `farFieldInput` after logging `farFieldCapture.isSupported` per port (F1-22; off in quality runs).
   `duckOthers` and `interruptSpokenAudioAndMixWithOthers` are never used (F1-M02, F1-M23).
4. **M2 port identity.** For each accessory already owned — a Bluetooth headset with a microphone, any
   LE Audio headset, a USB-C headset, a wired headset on the USB-C to 3.5 mm adapter, output-only
   earphones — record the port types before and after activation and whether it became the secondary
   (usbAudio versus headsetMic/headphones, bluetoothLE versus bluetoothHFP; F1-04, F1-05, F1-08,
   F1-M21, F3-M23).
5. **M2 channels and signals.** Channel topology (how many built-in channels, the flattened order,
   whether an input channel map such as [built-in, headset] is accepted) and the signal method above
   for: quiet learner only; teacher only; bystander only; learner and teacher overlapping; three or
   more people with a changing number of speakers; changing background noise. Compare with the two M1
   baselines.
6. **Processing.** Whether voice processing is accepted under `dualRoute` and whether it collapses
   the input or ducks other audio (D4-19, D8-17); `isEchoCancelledInputAvailable`; the microphone
   mode; raw versus processed correspondence against the reference.
7. **Course playback coexistence** (F1-10, F1-11, F1-17). With Safari, Canvas Student and Music
   playing, activate M2 with and without `mixWithOthers`. Record whether the other app pauses, is
   interrupted or ducked; where its audio goes (built-in speaker or headset) and at what level;
   loudspeaker leakage into the built-in channel; the effect of hardware volume on both routes
   (F1-06).
8. **AI output endpoint.** Play a fixed fixture utterance to the headset only through an output
   channel map (F1-14, untested under dualRoute). Measure it on the headset microphone channel, the
   built-in channel and the broadcast `.audioApp` (26.5 has no own-audio exclusion). A learner
   interruption on the headset channel must survive.
9. **Broadcast coexistence** (F1-30, F3-14). Start the broadcast with the picker microphone on, then
   off, while M2 is active, and in the reverse order. Record host notifications, whether the mode stays
   `dualRoute`, which microphone `.audioMic` carries, whether `.audioApp` still carries the course,
   duplicate lag between `.audioMic` and the session channels, and extension memory at 13-inch frame
   sizes (D4-12). On a 27 device only, repeat with ScreenCaptureKit.
10. **Background and multitasking** (F1-29, D4-16). Start M2 in the foreground, then switch to
    Safari, Canvas Student and Notability, use Split View or Stage Manager with the other app focused,
    and lock for 2 minutes. Record per-channel continuity, gaps over 2 s and the microphone indicator.
    Separately try to (re)activate from the background and record the error.
11. **Attach, detach and recovery** (F2-20, F2-23, F2-27). Switch Bluetooth off, walk out of range,
    unplug USB-C, reconnect; connect a second eligible headset. Record the route-change reason, the
    mode afterwards, whether the built-in channel continues and its gap, the time to rebuild the
    channel map, and that the learner channel is labelled with a route gap. A source the user stopped
    is never restarted.
12. **Interruptions and case closure** (F1-26, F1-27, F2-28; DT-LC-07). Banner and full-screen calls,
    FaceTime and Siri. Close the Magic Keyboard or Smart Folio during M2: does only the built-in
    channel go to zero or the whole session stop, does the headset channel continue, is
    `overrideMutedMicrophoneInterruption` accepted with multiRoute, and do both channels resume?
13. **Per-source stop and indicator agreement.** Stop the headset channel only, the built-in channel
    only (a forwarding gate, then a session reconfiguration with its gap on the other channel), the
    broadcast microphone (our forwarding gate; also record whether the user can switch the broadcast
    microphone off mid-broadcast, which is undocumented, and the resulting `.audioMic` content and
    indicator), and the whole broadcast. Record which OS
    indicator stays on and which samples reach the receiver after the stop plus the stated latency.
14. **Unsupported and unavailable paths, reported separately.**
    - A USB input-only microphone and output-only earphones as the M2 secondary (expected not a
      secondary).
    - The same USB microphone as the single M1 input without `defaultToSpeaker`: inferred only
      (F1-M22 documents that routing only with `defaultToSpeaker`, which M1 excludes). Log the
      available inputs, preferred-input acceptance, the current route and whether the course keeps
      playing.
    - `dualRoute` missing from `availableModes`: the UI says the second input is unavailable and falls
      back to M1.
    - Below 26.2 is checked only as an availability-guard code path; no device is downgraded or
      upgraded.
15. **High-quality Bluetooth recording** as its own single-input variant in the default mode
    (F1-23): `highQualityRecording.isSupported/isEnabled` and input latency for live use. Never
    combined with `dualRoute`. It is not currently supported in the EU (F1-24); the user's region is a
    user input, not a measurement.

Expected: each scenario reports what actually reached the app per channel. A route listing, a passing
`setCategory` call or a moving level meter passes nothing. This test remains a capability
prerequisite and passes no AVTEST case. Amended `7fadd15` (plan section 17.3): variants 11 and 13 are
also prerequisites for P0-11 DT-G7-AV06 (AUDIO-13/14, AVTEST-11); the R60 note's "AV01 to AV03 only"
is superseded for those variants.

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

**Extension for the reported target** (`7fadd15`). On iPadOS 26.5 there is no ScreenCaptureKit
`.microphone` or `.audio`. Run separate `SpeechTranscriber` analyzers (26.0+, D8-19) on each input
that DT-G3-05 shows actually arrives: the single input in M1; the built-in and headset channels in
M2; and the broadcast `.audioApp` and `.audioMic` buffers forwarded from the extension over the App
Group. First check whether an analyzer inside the extension fits its reported memory limit (D4-12).
Keep the app backgrounded behind Safari, Canvas Student and Notability for 15 minutes each.

Log per input: errors, dropped or late results, gaps against the reference, CPU, thermal state,
model and asset availability, and the behaviour across a headset detach and reattach. The iOS 27
background Neural Engine restriction (D8-20) applies only on a 27 device; 26.5 background behaviour
is separately undocumented. Transcripts here are local capability evidence, not understanding.

#### DT-G3-12 Separate candidate: external multichannel interface or receiver (M3)
Route: A or H on the user's iPadOS 26.5 device. Only with equipment the learner already owns;
nothing is bought for this test. Any other equipment needs the user's own later decision and is
outside this documentation work.

Steps:
- Connect the interface. Log `currentRoute` (port types, channels and numbers),
  `inputNumberOfChannels`, `maximumInputNumberOfChannels`, and whether a preferred channel count can
  be set (F2-17).
- Feed a near-mouth microphone and a far classroom microphone into different channels and use the
  DT-G3-05 signal method. Mute one source and check that only its channel drops.
- Repeat with the course playing, with the broadcast extension running, and with the built-in
  microphone also requested (F2-31).

Expected: M3 counts only when channels vary independently in the app. A hub, splitter or duplicated
mono mix is reported as not independent. Record power, cable and processing limits. M3 is separate
from M2 (DT-G3-05) and passes nothing for it.

#### DT-G3-13 Optional iPad plus iPhone audio capture (M4, P3-01)
Route: A or H on both devices; related to DT-G3-08 (clock skew) and DT-G3-10 (independent stop).

Steps:
- The iPad and an iPhone each capture their own microphone, one near the learner and one near the
  teacher. Only one device plays the AI voice.
- Play audible and visual markers. Measure clock offset and drift, delay, and the duplicated lecture
  sound heard by both devices.
- Lock, background and reconnect each device, and stop each source independently.

Expected: each source keeps its device identity and timestamps; duplicates are flagged, not silently
merged; stopping one device never stops or starts the other (R36/A16); reconnecting never restarts a
stopped source. This optional route does not defer the single-iPad classroom path (P1-03).

## Lifecycle (A14)

#### DT-LC-01 Switch apps
Route: A (C covers the scene logs only). Steps: during a session, switch to Safari, Canvas Student and
the Home Screen, then return. Expected: the session stays `active_background`. Log the scene phases.

#### DT-LC-02 Stop paths
Route: A. Steps: stop capture from the system indicator or Control Center, take a phone or FaceTime
call, and invoke Siri. Record the `SCStreamError` codes and the UI state ("capture stopped, session
open"). Confirm that restart needs the picker.

#### DT-LC-03 Force-quit
Route: A. Steps: force-quit during capture. Record whether the capture indicator disappears. On
iPadOS 26.5 capture runs in the broadcast upload extension, whose survival after a host force-quit is
undocumented (D5-15); a persisting indicator is recorded, not failed. Log
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
`cannotStartRecording`. The two-input (`dualRoute`) case of the same interruptions, including case
closure, is DT-G3-05 variant 12.

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
