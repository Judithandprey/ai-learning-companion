# P0-11 G7 / R59 real-device test checklist

Status: **none of these tests has been run.** Every test is `not_tested` until a record exists under
`docs/verification/platform/device/<YYYY-MM-DD>/`. Row IDs refer to
[`p0-11-g7-matrix.md`](p0-11-g7-matrix.md). Routes (A, A-free, A-paid, B1, B2, C, D) are defined in
[`p0-03-environment.md`](p0-03-environment.md). The run protocol in
[`p0-03-device-checklist.md`](p0-03-device-checklist.md#protocol-for-every-run) applies to every run.
Route C is Swift Playground 4.7, which ships the iOS 26 SDK: it cannot compile iPadOS 27-only APIs,
app extensions, background modes or ScreenCaptureKit.

Route **H** (defined in [plan section 13](p0-11-g7-plan.md#hosted-route)) is a hosted signed build on
a GitHub `xcode-27` runner, installed through TestFlight. It needs U4 (paid program), an App Store
Connect app record, an API-key secret and a lead-added workflow. It is unverified end to end, and it
is not configured.

Wherever a test says "A or H" (or "A-paid or H"), an installed build is enough. Only local-Mac work
needs A itself: Xcode pairing, the live debugger, and Instruments analysis (M04).

Additional rules for G7 runs:
- Use only project-authored test problems and fixture pages. Real course pages are opened by the user
  under the user's own login, and none of their content is committed.
- Each run records its evidence path and presentation:
  - S: our own canvas, structured log.
  - V: an external app, pixels only.
  - W: our ink on the live Safari page.
  - A: our in-app browser.
  - N: a native app beside ours.
  - F: an A45 fallback.
- The product's own logs are the object under test and are never the ground truth. Ground truth comes
  from DT-G7-M01 through DT-G7-M05.
- A result from one surface never certifies another. An A45 fallback result is never reported as
  R59/A44. One display mode's result never certifies the other.

## S: our own canvas, structured operations (A45 fallback or owned ink surface)

#### DT-G7-S01A Callback census per operation
Route: C (PencilKit parts that the iOS 26 SDK supports) or A.

Steps: log every `PKCanvasViewDelegate` callback, every UndoManager notification and every
scroll/zoom event. Each entry records a monotonic time, `canvasView.tool` and a stroke fingerprint
set. Perform these operations:
- one Pencil stroke;
- one finger stroke (`.anyInput`);
- a vector erase of one stroke;
- a bitmap and a fixedWidthBitmap erase through one stroke;
- a 10-stroke bitmap drag.

Expected: the number of `drawingDidChange` calls per operation is undocumented, so record it. The
final commit happens on the first `drawingDidChange` after `DidEndUsingTool`.

#### DT-G7-S01B Selection and lasso transforms (iPadOS 27 APIs)
Route: A or H (iOS 27 SDK).

Steps:
- Lasso-select, then move, rotate and scale.
- Record which field changes (`transform` or path points) and whether IDs and `path.id` stay stable.
- Record `canvasViewSelectionDidChange` counts, and whether setting `canvasView.selection` from code
  fires the callback.

#### DT-G7-S02 Undo/redo sources and UndoManager identity
Route: C or A.

Steps: undo and redo from each of these sources:
- the tool picker;
- three-finger gestures;
- the keyboard (⌘Z / ⇧⌘Z);
- the Pencil Pro squeeze slider (multi-step);
- shake.

Record for each: the notification sequence, whether `drawingDidChange` fires between Will and Did
with `isUndoing == true`, `undoCount`/`redoCount`, and whether undoing a bitmap erase restores the
original strokes. Also compare `canvasView.undoManager` with the window's manager and with a hosting
view controller's override. Put a text field in the same window and confirm its undo stays isolated.

#### DT-G7-S03 Stroke identity across splits, paste, persistence and OS versions
Route: A or H (iOS 27 SDK).

Steps:
- Record which IDs the pieces of a pixel-erase split receive.
- Record the IDs of pasted and duplicated strokes.
- Round-trip `dataRepresentation()`/`init(data:)` across a relaunch.
- Load a drawing made on 26 into 27 twice and compare its IDs.
- Check whether IDs survive `transformed(using:)`.

#### DT-G7-S04 Programmatic writes and recorder isolation
Route: C or A.

Steps:
- Assign `canvasView.drawing` and append strokes from code. Record whether `drawingDidChange` fires,
  whether undo is registered, and whether built-in undo still works afterwards.
- Run the recorder as a read-only observer.
- Confirm that restore and replay run on a separate canvas and never appear as learner events.

#### DT-G7-S05 PaperKit change reporting (27)
Route: A or H.

Steps:
- Count `paperMarkupViewControllerDidChangeMarkup` calls per stroke, erase, undo and lasso move.
- Confirm that `subelements.strokes` IDs equal `PKStroke.id` and survive undo.
- Observe which undo manager receives ink undo.
- Confirm that assigning markup merges rather than replaces.
- On 26, confirm there is no element enumeration.

#### DT-G7-S06 Persistence cost and continuity gaps
Route: C or A.

Steps:
- Measure `dataRepresentation` latency and size, and diff CPU time, for 50/500/2000 strokes, on and
  off the main thread.
- Move the app to the background, into Slide Over and off screen. Confirm the recorder emits gap
  events, and that `device_sequence` stays strictly monotonic across a crash or relaunch.

## R: offline replay (all paths)

#### DT-G7-R01 Offline interval, stop while offline, and replay
Route: C (S path), B1 (W capture part), A or H (V path and full S), A-paid or H (full W).
Needs a backend EventBatch/EventAck test endpoint (Backend, P0-09). Without it, only the local queue,
historical marking and stop persistence are run, and server de-duplication stays `not_tested`.

Steps:
1. Mid-session, turn on Airplane Mode for 30 s and keep writing (S and W) while capture runs (V).
2. While offline, stop sharing (V: system indicator; W: extension toggle).
3. Reconnect. Queued events upload again, keyed by `(device_id, device_sequence)`.

Expected:
- no duplicate events or pages on the server;
- earlier stroke versions are preserved;
- replayed items are marked historical (`captured_at` ≠ `received_at`) and never presented or sent as
  live;
- capture and sharing stay stopped after the reconnect;
- the offline interval is recorded as an `offline` gap on every path.

Maps to A31/A27.

## V: external app observed through screen capture (pixels only)

#### DT-G7-V01 Background survival while the learner works in another app
Route: A or H (iPadOS 27). This is the go/no-go test, shared with DT-G3-01.

Steps:
- Variant A: full-display `present()` with the `screen-capture` background mode and no audio session.
- Variant B: the same plus the `audio` background mode and an active `playAndRecord` session (Apple's
  sample configuration).
- In each variant, spend 15 minutes each in Notability, Canvas Student and Safari.
- Log wall time, `displayTime`, status, `contentRect`, scale factors and buffer size per sample, plus
  every `didStopWithError` code.
- Record which system capture indicator is visible while another app is in front, and whether
  stopping from it delivers `userStopped`.

#### DT-G7-V02 Delivered rate and idle semantics
Route: A or H.

Steps: keep the screen static for 60 s, then write continuously with the Pencil in Notability for 60 s,
then scroll in Safari for 60 s. Measure:
- delivered fps (check for a 60 or 120 Hz ceiling);
- counts of `.idle` and `.complete` samples;
- the longest silence;
- whether `.started`, `.blank` or `.suspended` appear on lock, Control Center, banners, window
  changes and rotation.

#### DT-G7-V03 Slow handler and surface pool
Route: A or H.

Steps: add handler delays of 0, 20, 50, 100 and 250 ms, and retain 1 to 3 sample buffers. Measure
`displayTime` gaps, stalls and recovery, and derive a safe per-frame budget.

#### DT-G7-V04 Legibility against capture scale
Route: A or H.

Steps:
- Capture at native size (`contentRect × pointPixelScale`), at half size and at 720p on the short side.
- Write fractions, exponents, subscripts, and the − and = signs at small pen widths in Notability.
- Rate legibility blind, and run `RecognizeTextRequest` on crops. Record confidence, errors and the
  effective resolution sent.

#### DT-G7-V05 Clip buffer
Route: A or H.

Steps:
- Call `exportClip` with 5, 15 and 20 s (15 s is the documented maximum).
- Measure export latency, file size and codec, thin-ink artifacts, memory growth, and whether
  buffering continues in the background.
- Only if the lead approves keeping a clip at a stop: attempt an export after an in-app stop and after
  a system-indicator stop, and record whether it works.

#### DT-G7-V06 Protected and hidden content
Route: A or H.

Steps:
- Capture a FairPlay-protected video (if available) and a normal course video. Check for black
  regions.
- Check whether Notability or Canvas Student change their UI while `sceneCaptureState` is active.
- Record them as `possibly_obscured`, never as erased.

#### DT-G7-V07 Undo versus erase in Notability pixels
Route: A or H.

Steps:
- Write one stroke, then remove it in three ways: squeeze-and-hold eraser, partial eraser, and undo.
- Show the frame sequences side by side, and record whether any pixel-level discriminator exists.
- Rewrite a stroke within one frame interval and record whether it is missed.

#### DT-G7-V08 Background analysis limits
Route: A or H.

Steps: while backgrounded during capture, run:
- tile hashing and HEIC/JPEG encoding;
- Vision text recognition;
- a small Core ML model without the continued-processing inference entitlement.

Record errors, CPU fallback and latency. Confirm that Metal work fails with `notPermitted`.

#### DT-G7-V09 iPadOS 26 broadcast fallback
Route: A or H.

Steps:
- Measure broadcast extension memory at native iPad frame sizes, delivered fps, static-screen
  behaviour, and legibility after downscaling.
- On 27, check whether the deprecated extension still runs in the background.

## W: our ink on the live bCourses page in Safari (R59/A44 candidate)

Ownership:
- The content-script ink layer, the capture calls and the Safari-side proof fields belong to the web
  role's extension (`apps/safari-extension`, P0-12).
- On route B1, the App Store Connect packager generates the containing app. iOS supplies no code there.
- The iOS containing app and native handler exist only on route A-paid.
- iOS proposes the `CompositeDeliveryProof` schema (plan section 5) through the lead (P0-08) and runs
  these tests jointly with the web role.

#### DT-G7-W01 Composite inclusion
Route: B1, or A-paid.

Steps:
- A content-script ink canvas draws four corner fiducials. Draw Pencil strokes, call
  `captureVisibleTab({format:'png'})` and decode the result.
- Check that the ink and fiducials are in the image.
- Repeat at pinch zoom 1×/2×/3×, with the toolbar collapsed and expanded, at Page Zoom 50/100/175 %,
  and with Request Desktop Website on and off.
- Record image size, the solved transform and its residual, and any top cropping or padding.

#### DT-G7-W02 Iframe and video regions
Route: B1.

Steps: on a fixture page with a cross-origin iframe and a `<video>`, and on a real bCourses/Kaltura
page opened by the user, record whether each region is present, black or blank in the capture.

#### DT-G7-W03 Pen-only inking with an operable page, and no explanation triggers
Route: B1.

Steps:
- The ink layer takes only `pointerType === 'pen'`. Fingers must still scroll, tap links and use
  video controls.
- Repeat with Scribble on and off. Count dropped or duplicated pointer sequences over 50 fast strokes.
- Record whether a finger touch during a Pencil stroke is dropped (developer report FB16411500).
- In WRITE mode, with the teaching state set to "explore", draw 50 strokes, including circles over
  text. Confirm that no Selection or ExplanationRequest is created and that the teaching state is
  unchanged.

#### DT-G7-W04 Page and problem change freeze strokes
Route: B1.

Steps:
- Navigate within the Canvas single-page app and reload. Confirm that `navigate` events,
  `runtime.getDocumentId()` changes and anchor removal each freeze the strokes as orphaned, with a
  visible notice.
- A stroke drawn after the change opens a new context segment (new source version and frame) and does
  not join the orphaned one.
- Insert content above an anchor and confirm the strokes stay aligned through scroll anchoring.

#### DT-G7-W05 Extension lifecycle and share state
Route: B1 (capture part); A-paid (`stateOfExtension` part).

Steps: disable the extension mid-session, revoke site access and switch tabs. Record the capture
errors, `stateOfExtension` results and the time the background survives between captures. The share
state must never show "AI sees this" from stale state.

## K: the two confirmed display modes (INTENT-INK-MODES)

Each mode is tested and reported separately on each surface where it is offered: W (Safari page),
A (in-app browser, once decided) and F (own canvas/frozen, reported under A45). Native apps offer no
live layer (SURF-10).

#### DT-G7-K01 Content-anchored ink
Route: B1 for W; A for A and F.

Steps: write anchored notes, then:
- scroll;
- pinch-zoom;
- change Page Zoom;
- insert content above (reflow);
- let the video advance or change;
- switch problem;
- save, close and reopen.

Expected:
- The ink follows its content. Where re-location is unreliable, it keeps its original anchor and shows
  that state.
- It never attaches to another problem or frame.
- Finger navigation keeps working.
- The composite sent to the AI (DT-G7-P01) shows the ink where the learner sees it.

#### DT-G7-K02 Screen-fixed ink
Route: B1 for W; A for A and F.

Steps: write fixed ink, then:
- scroll;
- pinch-zoom (visual vs layout viewport);
- collapse the toolbar;
- rotate;
- insert content above (reflow);
- let the video advance or change;
- navigate within the page (single-page app change);
- switch problem;
- save and reopen.

Expected:
- The ink stays fixed to the screen.
- After any page, problem or video change, the strokes keep the source, frame and `media_position` of
  the moment they were written. They are shown as belonging to that earlier context, and they are
  never recorded or sent as annotation of the new frame.
- Finger navigation keeps working.
- The composite sent to the AI (DT-G7-P01) contains the screen-fixed ink where the learner sees it,
  together with its original provenance.

## Q: completion prompt and destination choice (INTENT-ANSWER-PROMPT / INTENT-HOMEWORK-CHOICE)

These are planned for P1-06/P2-04. P0-11 only defines the native end. Completion detection and the
purpose policy belong to the learning role and P0-08.

#### DT-G7-Q01 Completion prompt: timing and no false completion
Route: A or H (native prompt and notification) and B1 (web role's in-page prompt).

The native banner path also needs background capture survival (DT-G7-V01) with server-side analysis,
or a backend push path. Otherwise only the return-to-our-window prompt applies.

Run each variant separately on each surface where a prompt is possible:
- (a) actual completion;
- (b) a brief pause mid-answer, not finished;
- (c) continued rewriting;
- (d) leaving the screen or app mid-answer;
- (e) a problem switch;
- (f) an explicit decline after a prompt.

Expected:
- (a) prompts promptly.
- (b) to (e) never produce a "finished" prompt or a completion record. An uncertain state produces at
  most one combined question per problem.
- (f) is not repeated for the same problem.
- No prompt is drawn over native apps.

Record:
- the measured time from the completion event to the prompt;
- every missed or early prompt, as a failure example;
- where the prompt appeared: our window, a notification banner while Notability or Canvas Student is
  in front, or in-page on Safari.

The thresholds are measured engineering values, not user-specified.

#### DT-G7-Q02 Destination options and honest outcome states
Route: A or H.

Steps:
- Offer only the destinations that are actually available: Notability archive (share/import), the
  matching assignment document from an already-connected bCourses source (backend), preview, and
  not now.
- Choose each one. Record the ExportJob states: prepared, shared, observed in target, unknown, failed.
- Confirm that nothing is submitted, and that the preview marks AI changes distinguishably while
  keeping the learner's answer, derivation and layout.
- Run once with Notability not installed and once with no connected or matching assignment. The
  unavailable option must be absent.
- Take a draft that later becomes the final answer, then organise it by choice.
- Use an assignment whose question number or version is ambiguous. Expect one short check, and no
  request to re-provide an already-saved source.
- Retry a share. Expect no duplicate external document.
- After every outcome, confirm the app's editable original is unchanged (hash).

## F: A45 fallbacks (reported only under A45)

#### DT-G7-F01 Frozen capture from Safari
Route: A-paid or H (the frame must reach our app through the extension or native bridge).

Steps:
- Enter the frozen-frame draft from a bCourses page. Confirm the visible "frozen" label, and that the
  stored problem version, frame and draft anchor are present.
- Change the original page and switch problem. Confirm a changed-source notice appears and the draft
  does not drift.
- Return to the Safari tab. Count the gestures and record whether the return takes one step.

#### DT-G7-F02 Side-by-side draft beside Canvas Student
Route: A or H.

Steps:
- Draft beside Canvas Student. Check the label and anchors.
- Switch the Canvas module. Confirm the notice appears.
- Return through the `canvas-courses://` deep link or the Safari fallback. Count the steps.

#### DT-G7-F03 Side-by-side draft beside Notability
Route: A or H.

Steps:
- Draft beside Notability. Check the label and anchors.
- Return to Notability. With no documented URL scheme, record the actual gesture count. One step is
  expected only while Notability stays visible in Split View or Slide Over.
- Report the result as an A45 limitation when the return is not one step.

#### DT-G7-F04 Own-canvas answer area
Route: C or A.

Steps: work in the own-canvas answer area. Check the label, anchors and return. Its structured log is
scored under S, and its A45 result is reported separately.

## A: our in-app browser (R59/A44 candidate, subject to a lead/user decision)

If the lead or user decides that the in-app browser counts as the original screen, the R59 case set
([plan section 12](p0-11-g7-plan.md#reference-experiment)) also runs here, using `contentOffset`/`zoomScale` anchoring, finger navigation and a
stop test. Until then, A-surface results do not count toward R59/A44.

#### DT-G7-A01 Snapshot and native ink placement
Route: A or H.

Steps:
- Place a `PKCanvasView` (a) inside `WKWebView.scrollView` and (b) as a sibling above the web view.
- Call `takeSnapshot` on screen with `afterScreenUpdates` true and false, and again off window.
- Record whether ink appears in each case.

#### DT-G7-A02 App-composited image compared with system views
Route: A or H.

Steps: compare three images by pixel difference inside the stroke bounds:
- `takeSnapshot` plus a `PKDrawing.image` composite;
- `drawHierarchy(in:afterScreenUpdates:)`, recording its Bool result;
- an in-app `presentForCurrentApplication()` frame.

Also sign in to bCourses with the user's own Duo method (performed by the user).

## N: native apps (Canvas Student, Notability)

#### DT-G7-N01 Full-display frames with our window present
Route: A or H.

Steps:
- Run Canvas Student or Notability full screen, then with our app in Slide Over, then side by side.
- Record whether our window appears beside the other app or covers part of it (`own_ui_occlusion`),
  and mark its region as `self`.
- Stop capture from the system indicator and confirm `userStopped`.

#### DT-G7-N02 PiP transparency and input
Route: A or H.

Steps: feed a mostly transparent BGRA sample-buffer PiP started from a user tap. Record:
- whether transparent areas show black, the app underneath or window chrome;
- whether any Pencil input arrives;
- whether the PiP window appears in full-display frames.

#### DT-G7-N03 Window transparency over another app
Route: A or H.

Steps: in windowed mode and in Slide Over, set clear backgrounds on the window, root view and scene.
Record whether the app underneath shows through. The expected result is that it does not.

## P: proof that the AI received the composite

#### DT-G7-P01 Composite delivery proof end to end
Route: B1 (Safari path) or A (in-app path). Needs a backend test endpoint and a provider-request hook
(lead/backend), and provider authorization (U18) for the model-boundary part.

Steps:
1. Upload each composite. The backend computes SHA-256 on receipt; a match with the client hash sets
   only `backend_received`.
2. At the model boundary, hash the exact image payload sent to the provider after every backend
   transform, and re-run the ink-presence mask check at that resolution. Only this sets
   `model_input_verified`, the "AI received composite" fact.
3. Checks:
   - (a) A corrupted upload fails `backend_received`.
   - (b) A backend resize that pushes thin ink below the detection threshold makes
     `model_input_verified` false and records a gap.
   - (c) A resize that keeps the ink visible records the post-transform hash and size, and passes.
4. Confirm that `presentation` is recorded, and that only `live_original` proofs on a tested surface
   are counted as A44-eligible.

## M: measurement and human reference

#### DT-G7-M01 Reference screen recorder characterisation
Route: C or A (our probe shows the 120 Hz test pattern); system screen recording.

Steps:
- Record a 120 Hz counter pattern with Control Center screen recording for 1, 5 and 20 minutes.
  Extract per-frame PTS, fps, resolution and codec with `ffprobe`.
- Repeat while our capture stream is active, and record whether both can run together.

#### DT-G7-M02 External camera and clapper synchronisation
Route: C or A (our probe shows the clapper).

Steps:
- An overhead iPhone records at 240 fps slo-mo. The app shows a clapper (flash plus a QR code with a
  session-relative counter) at the start, every 60 s and at the end.
- Fit the offset and drift, and report the residual in ms.
- Use the original asset's frame timestamps, not the slo-mo playback time.

#### DT-G7-M03 Clock validation
Route: A or H.

Steps:
- For 1000 S-path strokes, log `UITouch.timestamp`, `CACurrentMediaTime` at the callback, and
  `ContinuousClock`.
- For V-path frames, log `displayTime`, sample PTS and `CACurrentMediaTime`.
- Confirm the shared uptime base, and measure the divergence across a 15 s screen lock.

#### DT-G7-M04 Power runs
Route: A (S and V paths), A-paid through TestFlight, or B2 (S path only). Analysis needs a Mac.

Steps:
- Use one iPad model, unplugged, at fixed brightness and from a cool start.
- Run on-device Power Profiler during a 10-minute composite session, 3 times per path, and compare in
  Instruments 27.
- Log `batteryLevel` every 10 s in 60-minute soaks to find its real step size.

Report relative power impact, not mWh.

#### DT-G7-M05 Human-reference process runs
Route: per path.

Steps:
- A performer (U17) runs each of the 40 case cards (P01 to P40 in the plan) at least 5 times per
  applicable path, with the camera and the reference recording running.
- Two annotators label the videos in ELAN. Report Cohen's kappa and ±100 ms boundary agreement, then
  adjudicate.
- Score with the metrics in [`p0-11-g7-plan.md`](p0-11-g7-plan.md#reference-experiment), including the
  effective capture resolution per path and case.

## E: A46 end to end

#### DT-G7-E01 Lecture note from the original screen to Notability
Route: A-paid or H. The extension and our native app are in one signed project, with the native bridge
(P0-03 DT-G1-09) or a backend upload for web ink. It also depends on the P0-08 bridge and ink
contracts, and on U18 for the AI steps.

Data: use a project-authored fixture lecture page with a fixture video. If the user also runs it on a
real bCourses page, commit only a redacted or cropped screenshot showing the Notability note
title/metadata and the ink region, together with hashes.

Steps (each step is judged on its own):
1. Stay on the lecture page and write a note with our pen on the live page (W).
   `CompositeDeliveryProof` with `model_input_verified` is required.
2. Confirm that the web-layer strokes arrive in our app as editable original ink (via the bridge or
   backend) with source, frame and `media_position` anchors. Reopen our app and confirm the ink is
   still editable.
3. The AI adds a necessary supplement in a separate layer. Delete the AI layer and compare the original
   ink hash before and after; it must be unchanged.
4. After a relaunch, and again the next day and after an offline interval, open the note's source link.
   Confirm it reaches the same page/problem version and seeks the video to the saved `media_position`,
   or record the specific recovery gap (for example a Kaltura iframe or native player).
5. The context classifies the note as a learning note (correctable). Export a PDF and share it to
   Notability, recording `activityType` and `completed` (state `shared`).
6. Pass only when the tester confirms in Notability that the imported note exists, with a committed
   (redacted if real) screenshot or observed frame as `device:` evidence. `unknown`, and a product-side user assertion
   alone, count as not passed. Check editability separately with P0-03 DT-G5-03.

A failed W step cannot be offset by a successful export.
