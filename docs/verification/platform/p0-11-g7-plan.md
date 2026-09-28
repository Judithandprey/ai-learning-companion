# P0-11 G7 / R59 dual-path design and experiment plan (design only)

## Current target and audio scope (lead clarification, 2026-09-28)

Read [current decisions](../../requirements/intent-and-decisions.md#current-decisions) and the [audio routing candidates](../../requirements/audio-screen-interpretation.md#microphone-routing-candidates) before applying the dated routes below. The user reports iPad Pro 13-inch (M5), iPadOS 26.5; the 27.0 research reference is not the user's target or an upgrade prerequisite for conditional 26.2+ dualRoute. Built-in classroom pickup plus a compatible bidirectional personal headset is a distinct untested candidate. The existing single-microphone/playback scenario uses the researched playAndRecord/mixWithOthers route. The distinct dualRoute candidate requires multiRoute + allowBluetoothHFP; it is not that older route. One primary interaction input does not forbid additional authorized sources; no available-input list proves simultaneous signals. The iOS owner will extend the existing DT-G3-05/11 and AV01–03/06 variants at a safe boundary. Current matrix/device statuses remain unchanged; no build, provider, hardware or mode activation follows.


Date: 2026-09-28 UTC.

Baselines, both read with `git show` and not merged:
- Specification: `e43293760c70364584cb597ae01d34a261cc52cf` (content `a2567fa`).
- Confirmed user decisions: `44e60ec289717e155fb0f4374784c791bf23689c`
  (`docs/requirements/intent-and-decisions.md`: Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE, D-FINAL-ANSWER,
  Q-HOMEWORK-DESTINATION and the INTENT-* cases).

Current specification baseline: `9ce270cc747676889797199b7e8455ccfef07a5f`.

**Lead integration clarification (2026-09-28):** current composite freshness is
separate from the age of retained screen-fixed ink (§5/P01); reopening an export
keeps its prior outcomes while appending the new attempt (§7/Q02/E01). The
[integration record](../lead/p0-platform-integration.md) also dates §16's Web
comparison: 4c32e49 now aligns history sync and ordinary playback, but its export
model still needs repair. These are design clarifications, not device results.

**Target 26.5 revision** (lead normalization `7fadd151c83118c22a4846bdb8b2622d47bb0df3`, handoff
`handoff_dcbcd28d18a4feba5ff4ba4df6c11fb5`, merged into this branch; contract slice `e63b28f`, handoff
`handoff_47d55ffd3140fa91c6d18329a63397ab`, read with `git show`). The user's device is an iPad Pro
13-inch (M5) on iPadOS 26.5, and 27.0 is not an upgrade prerequisite. Section 17 separates the
single-input scenario (M1) from the conditional `dualRoute` candidate (M2) and the separate
multichannel and two-device alternatives, and moves the AV tests to the 26.5 broadcast path. Both
matrices and checklists record per-row and per-test applicability on 26.5. Section 14 maps the 0.2.0
process-capture slice. New research: `research/audio-routing-26-5-claims.json`.

**R60 increment** (`handoff_045d6c5813d00ad44dc642d8fbf975e9`, read at
`89602e742aea9c6ef6b6ec6a76c371e20bff2edf`) adds section 17: the iOS input paths for AUDIO-05–09/13–15
and AVTEST-03–07/11, with six new device tests (DT-G7-AV01 to AV06). It reuses existing research only
and changes nothing in sections 1 to 16 apart from one request row (section 14) and one alignment row
(section 16).

**Revision 3** (`handoff_b1a97c578ac58ecb0c56dff9d9ed7cbc`, main/ADR baseline
`693069ac9e83ad955f808ca934b7fbec643f40f3`, proposed ADR 0002) makes two narrow corrections: opening a
share sheet is not a share (sections 7 and 9), and a stop applies only to the stopped source
(section 4, P0-03 DT-G3-10). It also adopts the ADR 0002 §4 and §7 proposals for queued-history sync
and screen-fixed ink during playback (sections 4, 6 and 16).

**Revision 2** applies the lead's semantic review (`handoff_a85222994ef188a387b979630233bdcb`):
- the stop boundary preserves pre-stop source evidence (sections 3 and 4);
- the model-input evidence and its negative cases are defined (section 5);
- A44 eligibility is evidence-based (section 5);
- the lead's answers are recorded (section 14);
- the design is aligned with Web P0-12 (section 16).

Contract 0.1.0 is unchanged. Every field name below is an engineering proposal for P0-08, not a
contract. Shared fields, the backend hook and ink serialisation are unified by the lead in P0-08; this
plan does not adopt a new protocol. **Nothing here is implemented, compiled or measured.**

References:
- Row IDs: [`p0-11-g7-matrix.md`](p0-11-g7-matrix.md).
- Test IDs: [`p0-11-device-checklist.md`](p0-11-device-checklist.md).
- Research IDs (for example `E1-02`):
  [`research/p0-11-verified-claims.json`](research/p0-11-verified-claims.json), or the P0-03 archive.

This plan covers only the iOS side.
- The web role owns the Safari content script (P0-12).
- P0 design of shared evidence and policy belongs to the lead (P0-08), with Learning's semantic cases
  (P0-10). Backend owns persistence and the model boundary (P0-09).
- Implementation owners are set by the backlog at `44e60ec`:
  - P1-06, Learning: completion prompt and choice when the screen-answer path is enabled; iOS
    supports.
  - P2-03, iOS: both display modes.
  - P2-04, iOS: contextual classification, organisation and faithful export; Learning and
    Backend/Web support.
  - P3-02, Web: Windows modes.

## 1. Scope: evidence paths

| Path | What it can state | What it can never state |
| --- | --- | --- |
| **S**: our own ink on our own canvas | Editable strokes we recorded; write, erase and transform labels, and undo/redo labels only where correlated signals exist; versions; branch facts; explicit gaps | That no step was missed merely because the event channel existed; reasons or intent |
| **V**: an external app's pixels through screen capture | What frames showed at time t; that ink appeared, disappeared or changed in region R between t1 and t2; unchanged intervals backed by frames or idle markers; gaps | Undo vs erase vs page change (V-08); the external app's history (V-09); intent; anything inside a gap |
| **W**: our pen on the live Safari page (R59 candidate) | The composite the model actually received (section 5), with the stroke IDs rendered into it and the geometry | That R59 works on surfaces that were not tested |
| **A**: our in-app browser, a separately listed alternative | The same kind of evidence as W, reported apart | Success of the original Safari, Canvas or Notability path. An approval alone never changes that (lead reply; SURF-07). |
| **F**: A45 fallbacks (frozen frame, own canvas, side-by-side) | Fallback evidence, with its own denominator | Any R59/A44 result |

## 2. S path: structured operation log for our own ink

The source is an observer only: it never writes the learner's live drawing (S-08).

**Signals**
- `PKCanvasViewDelegate` callbacks carry no payload (S-01).
- Tool brackets come with a snapshot of `canvasView.tool`.
- UndoManager `Will`/`Did` `Undo`/`Redo` notifications, plus `isUndoing`/`isRedoing` read inside
  `drawingDidChange` (S-04).
- Selection (iPadOS 27), scroll/zoom and lifecycle events.

**Commit rule**
- On the main actor, only copy the `Sendable` `PKDrawing` and stamp times.
- A serial background actor diffs the copy against the last committed snapshot.
- A write is final at the first `drawingDidChange` after `DidEndUsingTool` (S-02). Empty diffs are
  dropped.

**Identity**
- iPadOS 27: `PKStroke.id` (S-06).
- iPadOS 26: a fingerprint, tagged `identity_tier=fingerprint`.
- Split lineage is stored from our own diff until DT-G7-S03 confirms how Apple assigns IDs (S-07).

**Event envelope (proposal)**
- Reuses 0.1.0 `device_id` and `device_sequence`.
- Adds `attempt_ref`, `canvas_id`, `surface`, `mono_ts` (uptime base), `continuous_ts`, `wall_ts`,
  `os_build`, `identity_tier`.
- `origin`: one of `learner_tool | undo | redo | app | unattributed`.
- `before` and `after`: stroke-ID sets and per-field changes (transform, mask, ink, `path.id`).
- `gap_reason`.

**Labels come only from correlation**

| Label | Required evidence |
| --- | --- |
| `write` | Additions inside an inking-tool bracket |
| `erase_vector` / `erase_bitmap` | Removals, or mask/split changes, inside an eraser bracket (S-05) |
| `transform` | Transform-only changes on selected IDs (S-09) |
| `undo` / `redo` | A diff inside the undo/redo bracket, recorded with its counts |
| `app` | Our own writes, flagged before the write |
| `unattributed_change` | Everything else. It is never relabelled. |

No reason label is ever produced.

**Original ink is immutable.** The first time a stroke version is seen, it is written once as a
content-addressed record. Erasing, masking and undo add versions and never overwrite. Periodic full
checkpoints are written off the main thread.

**Attempts and branches**
- The recorder emits raw facts and candidate boundaries only, for example "a write committed while
  `redoCount > 0` discarded a redo branch; `branch_from` = sequence N".
- It never decides attempt, abandon or retry. Segmentation, including a short confirmation question
  when ambiguous (R51/A43), is lead/learning policy through P0-08.

**Gaps**
- Recorded for backgrounding, scene disconnect, canvas not first responder, drawing reload, diff
  queue backlog, fingerprint collision, failed checkpoint, undo count reset to 0, and `offline`
  (section 4).

The same envelope serves web ink from the Safari layer. There the web role assigns stroke UUIDs from
`PointerEvent`s.

## 3. V path: observing an external app through capture

- **Adapters:**
  - iPadOS 27 uses full-display ScreenCaptureKit (V-05).
  - iPadOS 26 uses the broadcast extension (V-13), kept as the fallback on 27 until DT-G7-V01 clears.
  - Every record carries `capture_path`.
- **Handler discipline:** iOS gives no frame-rate or queue control (V-02). In the handler, read the
  attachments; for `.complete` frames build a 1/8-scale luma thumbnail plus per-tile hashes; copy out
  and release the buffer at once.
- **Keyframe policy:**
  - When changed tiles settle, take a native-resolution keyframe (V-10).
  - When a large share of tiles changes at once, take a `global_change` keyframe with no
    scroll/undo/page label unless separate evidence exists.
  - Frames or idle markers extend "confirmed unchanged". Silence beyond 2 s is recorded as stale
    (V-03).
- **Action clips (27 only):** on explicit learner requests (help, check my work, problem change),
  export up to 15 s and record the interval the clip actually covers (V-04).
  - At a stop, the temporary rolling clip buffer is not exported and is discarded (DT-G7-V05). This
    concerns only that declared temporary video buffer. It never means that source evidence already
    captured with authorization before the stop is deleted or left unsaved (section 4, stop boundary).
    Continuous audio/video replay is not required.
  - iPadOS 26 attaches the last K keyframes, labelled "keyframe history".
- **AI requests** get the freshest keyframe and its age. A stale view is labelled as stale, or
  blocked. It is never silently substituted.
- **Gap kinds:** 0.1.0 `gap_flags` are reused where they exist (`missing_frame` for dropped frames,
  `stale_frame` for silence). Proposed additions for P0-08:
  - `not_sharing`, `picker_cancelled`, `capture_stopped_user`, `capture_interrupted_system`,
    `inactive`, `app_suspended`, `status_blank`, `status_suspended`
  - `possibly_obscured` (V-07)
  - `own_ui_occlusion` (SURF-12), `low_legibility`, `analysis_deferred` (V-12),
    `capture_unavailable` (V-14), `offline`
- **Our own ink in frames:** regions touched by our strokes, and our own window, are marked `self`
  before any change is attributed to the external app.
- **Recognition:** OCR is a labelled machine transcription with a confidence value (V-11). Background
  analysis is CPU-only (V-12).

## 4. Offline interval, replay and stop boundary

- Every path keeps a local append-only queue keyed by `(device_id, device_sequence)`, reusing 0.1.0
  EventBatch/EventAck semantics.
- On reconnect, only unacknowledged items are sent again; items from a source stopped while offline
  follow the stop-boundary history rule below. The server's idempotency prevents
  duplicates, and replay never overwrites an earlier stroke version.
- Replayed items are historical (`captured_at` ≠ `received_at`). They are never presented or sent to
  the AI as live.
- A capture or share stopped while offline stays stopped after reconnect. Replay never re-activates
  it.
- The offline interval is an `offline` gap on S, V and W.
- Test: DT-G7-R01 (A31/A27).

**Stop boundary** (R29/R30/R58; problem-solving specification stop rules):
- An explicit stop at time T ends observation and live sending **on the stopped source only** (that
  device and path):
  - no capture API call, handler frame, clip or process-log observation event from that source after T
    plus a stated stop latency;
  - nothing from that source is sent to the AI after T.
- Other sources keep their own state (R36/A16):
  - a source that was already enabled on another device or path continues;
  - a source that was off stays off; a stop never starts anything elsewhere;
  - the stopped source's last frames are labelled stale and are never presented as current.
- The learner's own ink written with our pen after T is still saved locally as their note content.
  It is marked with a `not_sharing` gap in the process log and is never sent or presented as live.
  A stroke in progress at T is kept whole locally. This matches Web P0-12 ("local saving never stops";
  the user keeps their ink).
- Source evidence captured with authorization before T is kept:
  - original ink;
  - observed attempts and their versions;
  - source text;
  - key frames already retained;
  - their time relations.
- Items still in the local queue at T are persisted locally, and the final pre-stop queue boundary is
  recorded. Stopping the live stream and syncing pre-stop history are separate actions (proposed ADR
  0002 §4): history syncs only when that sync is independently authorized, and a broader withdrawal
  may forbid transmission while local history remains. Historical upload never restarts capture. These
  items are never sent to the AI as live input or shown as current.
- Explicit deletion is handled by its own rules and is not implied by a stop.
- Test: DT-G7-R02.

## 5. Proof that the model received the composite (R59/A44)

A `CompositeDeliveryProof` record (proposal) is created for every image sent to the AI:

- **Identity:**
  - `capture_id`.
  - `surface`: `safari_ext | inapp_wkwebview | sck_inapp | sck_fulldisplay`.
  - `presentation`: `live_original | frozen_frame | own_canvas | side_by_side | external_observation`.
  - `compositor`: `dom_in_page | app_composited | system_capture`.
  - The capture API.
- **Time:** `captured_at` in UTC, a monotonic time, and `displayTime` where applicable.
- **Image:** MIME type, pixel size, byte length and SHA-256 of the exact bytes the client uploaded
  (`client_sent`). The ink vectors sent alongside are recorded with their own hash (aligned with Web
  P0-12).
- **Separate facts along the path** (each recorded on its own; none implies the next):
  - `client_sent`: the hash of what the client uploaded for this `capture_id`.
  - `backend_received`: the hash the backend computes on receipt. It must equal `client_sent`.
    Under the 0.2.0 capture slice (`e63b28f`) this corresponds to an artifact ACKed as `verified`
    (owned durable bytes, size and digest checked); `pending` bytes or `envelope: committed` alone
    are not receipt of the image.
  - `transform_lineage`: every backend transform, bound to `capture_id`. Each entry records the input
    hash, the operation and its parameters, and the output hash and pixel size. The first input hash
    equals `client_sent`; with no transform, the lineage is empty.
  - `outbound_request`: bound to one real provider request ID and to `capture_id`. It records:
    - the hash and pixel size of the attached image, which must equal the lineage's final output;
    - the hash of the ink vectors actually in the request.
  - `provider_input_limit`: the provider's documented effective input size or detail setting for that
    request.
  - `provider_outcome`: `accepted_with_response | rejected | timeout | unknown`, bound to the same
    request.
  - `ink_check`: this capture's expected stroke boxes, mapped through the recorded transforms, are
    found in the outbound image. Finding any ink is not enough. The check runs at the provider's
    effective input size. Otherwise the outbound image must be kept within that limit, and this is
    recorded.
- **`model_input_verified`** is true only when all of these hold for the same real request:
  - `backend_received` equals `client_sent`;
  - the lineage links `client_sent` to the outbound image;
  - the request is bound to this `capture_id`;
  - `ink_check` passes;
  - `provider_outcome` is `accepted_with_response`.

  If the provider's effective input size cannot be determined, the value is `unknown`, not true.
- **`ink_vectors_in_model_input`** is recorded separately: the outbound vector hash equals this
  capture's vector hash. R59 asks for "实际叠加后的画面及可用笔迹记录", so A44 eligibility requires both
  facts whenever vectors are available.
- **Cases that can never pass:** each leaves the relevant fact false or unknown and records a gap.
  - a corrupted upload;
  - ink lost in a backend transform or by provider downscaling;
  - a rejected request;
  - a timeout or unknown outcome;
  - a request with no image attached;
  - a wrong image attached, meaning another capture or an earlier frame: the lineage or the stroke
    boxes do not match;
  - vectors missing, or from another capture.
- **Scope of the facts:**
  - Even when true, they show only that the composite and ink records were the model's input. They say
    nothing about whether the model understood them correctly.
  - They come only from a real call path. A fixture never sets them.
  - They need the backend/lead model-boundary hook and provider authorization (U18). This plan does not
    authorize paid calls.
- **Geometry:**
  - Safari: produced by the web role. `documentId`, navigation entry key, `visualViewport`, scroll,
    `devicePixelRatio`, `tabs.getZoom()`, and the fiducial-solved transform with its residual.
  - WKWebView: `contentOffset`, `zoomScale`, `pageZoom`, `obscuredContentInsets`.
  - ScreenCaptureKit: `contentRect`, scale values and status.
- **Strokes:** IDs rendered into the image, clipped and out-of-view IDs, per-stroke boxes in image
  pixels, and the stroke-set hash.
- **Anchors:** anchor kind, selector, text-quote hash and offset.
- **Checks and state:** gaps, and `share_state` (mapping in section 10).
- **`a44_eligible`** is judged from actual behaviour and evidence. The `surface` and `compositor` names
  are recorded, but they never decide it. A record is a candidate, pending device verification, only
  when all of these hold:
  1. The learner stayed on the original learning screen, and it remained visible and operable
     (interaction evidence for that interval, as in DT-G7-W03).
  2. The image is a faithful live composite of the same source, time and geometry:
     - the current source view and rendered ink placement are captured within the measured
       freshness bound; an older screen-fixed stroke remains eligible while the same known
       problem/source continues, with its original written-at timestamp retained separately;
     - same `documentId`, navigation entry and source version;
     - a geometry transform whose residual is within bound.
     A frozen or stale reconstruction never qualifies.
  3. The original ink's stroke IDs and anchors are present.
  4. `model_input_verified` is true, and so is `ink_vectors_in_model_input` when vectors are
     available.
- **How specific records are treated:**
  - Records with any `compositor` value can meet these conditions: `dom_in_page`, `app_composited`,
    and `system_capture` of the live Safari page with our overlay (Web P0-12 §5 row 3 path (b)). An
    `app_composited` record additionally needs the same-time and same-geometry proof above.
  - A DOM snapshot plus ink vectors is not a composite and is never eligible (Web P0-12 §5.3).
  - Pure external observation without our pen (V path) is never eligible.
  - `side_by_side`, `frozen_frame` and `own_canvas` records are never eligible (A45).
  - In-app browser records are reported separately as an alternative and never count as original-app
    A44 success.

**Rules**
- When the `documentId`, navigation entry or anchor node changes, strokes freeze as `orphaned`, a
  visible notice appears, and new writing opens a new context segment (new source version and
  frame). Strokes are never repositioned silently (SURF-05, DT-G7-W04).
- The Safari path samples on stroke end, `scrollend` or an explicit ask. The time between samples is
  a gap (SURF-06).
- **Indicator scope:**
  - On surfaces we render (our app, and the Safari page through the web role's script), a visible
    "AI sees this" indicator and a one-tap stop are shown.
  - While a native app is in front, only the system capture indicator can appear, and stopping goes
    through it (`userStopped`). No indicator of ours is drawn over native apps (SURF-10).
  - Sending screens and strokes to the AI needs explicit consent (App Review 5.1.2(i)).
- After a stop, no new frame or stroke from the stopped source is sent or presented as live (A44);
  other enabled sources continue (section 4).

## 6. Display modes (Q-INK-DISPLAY, INTENT-INK-MODES)

Both modes are provided, and each is verified on its own. They are independent of purpose and
destination.

| Mode | W: Safari page (web role script) | A: in-app browser | F: own canvas / frozen (A45) | Native apps |
| --- | --- | --- | --- | --- |
| Content-anchored (INT-01W, INT-01A) | Anchor to elements or text ranges with an offset; re-resolve on each capture; freeze when re-location is unreliable | Content coordinates from `contentOffset`/`zoomScale` plus the same DOM anchors via a user script | Canvas content coordinates | Not available (SURF-10) |
| Screen-fixed (INT-02W, INT-02A) | A viewport-fixed layer; the stroke records source, frame and `media_position` at writing time | A view fixed over the web view; same provenance | Screen scratch area with its source frame | Not available |

Both modes preserve the original ink and the source and frame at writing time. Old ink is never
silently attached to new content.

These rules follow the proposed ADR 0002 §7. They are an engineering rendering choice, not a new user
preference or permission.

- **A different problem or material version, or placement that cannot be resolved:** both modes
  preserve the old originals and anchors, and hide or mark the old ink with a visible notice. Old ink
  is never silently re-bound to a new question.
- **Screen-fixed ink while the same known problem and source continue**, including continuous video
  playback: the ink stays at its screen position and visibly keeps its written-at video/frame context.
  Ordinary clock progress alone does not make it disappear. It never becomes ink on each later frame:
  AI composite evidence carries its original context separately from the current view.
- **Content-anchored ink** needs a valid content transform. There is no implied video-object tracking;
  ink written at a video moment is placed only where that transform is valid (Web P0-12 shows it only
  at that moment), otherwise it is hidden or marked with a notice.

Continuous playback, a seek within the same source, and an actual question change are tested
separately for each mode: DT-G7-K01 and DT-G7-K02 per surface, plus finger navigation (W03) and the
model-input composite (P01).

## 7. Purpose, completion prompt and destination (native end only)

This section follows `44e60ec` Q-NOTE-EXPORT-SCOPE, D-FINAL-ANSWER and Q-HOMEWORK-DESTINATION.
Ownership:
- The P0 policy design (classification signals, completion detection, prompt timing) belongs to
  P0-08 and P0-10.
- P1-06 (Learning-led) enables the prompt and choice.
- P2-04 (iOS-led, with Learning and Backend/Web support) implements classification, organisation and
  faithful export.

The iOS native end provides the following:

- **Purpose** (learning note / draft / final answer):
  - The purpose is displayed and correctable in one tap, and it may change within one writing session.
  - A correction is stored with its basis. It never deletes or rewrites original ink or history.
  - Display mode never implies purpose.
- **Notes and drafts:**
  - Learning notes enter the Notability archive flow (A46).
  - Drafts stay in the process archive and are never sent automatically.
- **Completion prompt:**
  - It is shown on screen promptly, where we can render: our window, the web role's in-page prompt on
    Safari, or a system notification banner while another app is in front (INT-03, untested). A banner
    requires that we noticed completion, through background capture with server analysis or a backend
    push.
  - A pause, leaving the screen, continued rewriting or a correct-looking answer is never treated as
    completion by itself.
  - An uncertain state produces one combined question ("finished? organise it?").
  - A decline is not repeated for the same problem.
  - The timing thresholds are measured engineering values, not user-specified (DT-G7-Q01).
- **Destination choices:**
  - Only destinations that are actually available are offered: Notability archive (share/import),
    the matching assignment document from an already-connected bCourses source (backend, with the
    course, assignment, question and version checked), preview, and not now.
  - OneNote is in the original P2 scope and is never made a default destination on the user's behalf.
- **Faithful output:**
  - The preview keeps the learner's answer, derivation and layout. AI suggestions and changes are
    marked distinguishably, and content changes need confirmation.
  - Nothing is filled in or submitted for the learner.
  - Each outcome is an append-only fact on the ExportJob, and no later fact rewrites an earlier one
    (proposed ADR 0002 §7):
    - the file is ready → `prepared`;
    - opening the share sheet records a separate `share_panel_opened` fact. On the initial attempt
      the job stays `prepared`; reopening never clears a prior share/import outcome. Track the
      new attempt separately. Opening the panel is never a successful share;
    - `completed == true` with the actual target `activityType` → `shared`, with import still pending;
      share-sheet completion is only sharing;
    - `completed == false` (cancelled) → the job keeps its prior state (`prepared` if never shared),
      with the cancellation recorded;
    - an activity error → a `failed` fact; no callback before termination → `unknown`;
    - `imported` only with an actual target observation.
  - A cancel, failure or unknown after an earlier real share never rewrites that share or any import
    history.
  - If help-bearing content was shared, or dispatch may have taken effect with an unknown outcome,
    possible external exposure is recorded for that problem and manifest. Actual reading stays unknown.
  - A learner's own report of an import is stored as a time- and version-stamped `user_reported`
    record and can be shown as such. It is never machine-verified and never an A46 pass (lead reply)
    (DT-G7-Q02).

## 8. A45 fallback and return flow

- **When it is used:** a surface where R59 is unsupported or unverified (native apps, SURF-10), or a
  failed W test.
- **What the learner sees:** the fallback is clearly labelled "frozen view" or "side-by-side draft".
- **Draft binding:** the draft binds to a stable `Frame` plus a `ContextSegment` (source_id,
  source_version, frame_id, media_position) in `NoteRevision.context_segments`. It never uses
  `Selection`, which is an ASK object. Draft anchors are proposed to P0-08.
- **When the original changes:** a changed-source notice appears, and the draft never moves to
  another problem.
- **Return:**
  - Safari: return to the open tab (DT-G7-F01).
  - Canvas Student: the `canvas-courses://` deep link, via `open(_:)` with a Safari URL fallback
    (DT-G7-F02).
  - Notability: no URL scheme is documented. One-step return holds only while Notability stays
    visible in Split View or Slide Over. Otherwise it is an **A45 limitation, unverified as one step**
    (DT-G7-F03).
- **Label:** the fallback label shows the frozen state and the source version.
- **After a return:** record whether the original tab or app shows the same page, scroll position,
  problem and video position as when the fallback was entered. A mismatch is an A45 failure or
  limitation.
- **Reporting:** fallback results are reported under A45 only, with their own denominators
  (DT-G7-F01 to F04).

## 9. A46: lecture note from the original screen to Notability

Route: A-paid or H (DT-G7-E01). Each step is judged separately. A later success never fills an earlier
failure.

| Step | Evidence | Pass condition | Depends on |
| --- | --- | --- | --- |
| 1. Write on the live lecture page with our pen | W-path proof with `model_input_verified`; page still operable | DT-G7-W01, W03, P01 | SURF-01, SURF-02; web role |
| 2. Web ink becomes editable original ink in the app, with source, frame and `media_position` | A defined serialisation of web strokes and a transfer route (native bridge on A-paid, or backend upload from the extension); `NoteRevision` with `kind=handwritten` and `ink_blob_id` | Reopened in our app and still editable. P0-03 DT-INK-01 covers only own-canvas PencilKit ink, not web ink. | P0-08 ink/bridge contract; web role and backend; P0-03 DT-G1-09 |
| 3. Necessary AI additions in a separate layer | `ai_supplement` blocks | After deleting the AI layer, the original ink hash is unchanged | U18 or a declared fixture |
| 4. Source and video recovery | After a relaunch, the next day and an offline interval | The same page/problem version, and a video seek to `media_position`, or a recorded recovery gap | Backend source archive |
| 5. Learning note archived to Notability | The initial attempt stays `prepared` while the sheet is open (`share_panel_opened` fact); reopening preserves prior share/import outcomes. `completed == true` with the Notability `activityType` → `shared` with import pending; cancel, failure and unknown are recorded as separate attempt facts | "Shared, import pending", never "saved"; opening the sheet alone is never a share | P0-03 G5-02, G5-03 |
| 6. Actual import | The tester confirms in Notability that the imported note exists (committed screenshot, redacted if the page is real, or an observed frame) | Passes only on that observation. `unknown` is not passed. A `user_reported` import is stored with its time and version and shown as user-reported, but is never machine-verified or a pass (lead reply). | DT-G7-E01; P0-03 DT-G5-03 for editability |

PDF/PNG is never called editable Notability ink. The app keeps the editable original.

## 10. State and field name mapping

| P0-03 lifecycle state | Gap kind (V/S) | `share_state` |
| --- | --- | --- |
| `capture_stopped_user` | `capture_stopped_user` | `stopped_by_user` |
| `capture_interrupted_system` | `capture_interrupted_system` | `stopped_by_system` |
| `offline` | `offline` | unchanged; flagged offline |
| `interrupted_unobserved` (server-derived) | `app_suspended` | unknown |
| — (Safari) | — | `extension_disabled`, `permission_revoked` |
| — (ScreenCaptureKit inactive) | `inactive` | `content_inactive` |
| `active_foreground` / `active_background` | — | `active` |

`device_sequence`, `gap_flags` (`missing_frame`, `stale_frame`), `Frame`, `ContextSegment` and
`NoteRevision` are existing 0.1.0 names and are reused.

## 11. Teaching state and learning language (native obligations)

- NAV, ASK and WRITE stay independent of explore, hint and review. Writing on any surface records
  authorised evidence and never creates a Selection or ExplanationRequest (DT-G7-W03).
- Before a native card, title, notification or speech is shown or played, the current attempt version,
  teaching state, permitted disclosure and preference version are checked. Stale results are
  discarded, and queued speech is cancelled.
- R57/A40: native cards and speech use the synced persistent preference (English-first with original
  technical terms and short Chinese hints where needed). A temporary "use Chinese for this problem"
  override is scoped to that problem. Source text, the learner's words and ink are never rewritten.
  The preference model and its sync are learning/P0-08 work; the native side only consumes them.
  This remains unverified.

<a id="reference-experiment"></a>

## 12. Human-reference experiment

**Ground truth, built without the product**
- Scripted case cards performed by a named performer (U17).
- An overhead 240 fps camera (M-04).
- The built-in screen recording once its frame rate is characterised (M-03, DT-G7-M01).
- A clapper, with offset and drift fitted (DT-G7-M02).
- Two annotators in ELAN (U14). Report Cohen's kappa and ±100 ms boundary agreement, then adjudicate.
- The product's logs are never ground truth.

**Clocks:** one uptime base, with paired `ContinuousClock` readings (M-05). Only durations and
session-relative offsets leave the device (M-06).

**Latency segments** (each an `OSSignposter` interval):
- t0 pen-up
- t1 evidence available
- t2 sync acknowledged
- t3 recognition done
- t4 reasoning done
- t5 response on device
- t6 displayed and photon

Segments t3, t4 and cost need provider authorization (U18); until then they are
`blocked (needs_auth)`.

**Cases** (at least 5 runs per applicable path):

| Group | Cases |
| --- | --- |
| Writes and erases | P01 linear 4-step solution; P02 write then erase within 1 s; P03 partial erase of a digit then rewrite; P04 lasso-delete 3 strokes; P05 lasso-move without content change; P06 cross-out and rewrite beside; P07 overwrite a digit; P08 insert a step between lines |
| Undo / redo | P09 single undo; P10 undo ×5, redo ×2; P11 undo then new stroke (redo branch truncated); P12 undo of an erase; P13 Notability gesture undo vs toolbar undo (V: must not be labelled undo); P14 undo/redo toggled 6 times in 2 s |
| Branches and retries | P15 attempt A crossed out, B beside; P16 A fully erased, B in place; P17 two methods, one circled; P18 resume A after B; P19 copy a step and modify; P20 wrong answer → requested hint → corrected retry (hint from a declared fixture until U18) |
| Anchors and navigation | P21 scroll mid-solution; P22 pinch-zoom 2× and write; P23 page switch and back; P24 problem change in Canvas/bCourses; P25 app switch Safari → Notability → Safari; P26 rotation or window resize |
| Visibility and staleness | P27 palm resting over the writing (pixels unaffected; verify); P28 banner or Control Center over the work; P29 our own UI covering content; P30 keyboard over the lower half; P31 12 strokes in 3 s; P32 faint 1 pt ink; P33 idle 60 s ("unchanged" only for intervals covered by delivered frames or idle markers; otherwise a stale gap is the correct output and is not scored as a false gap); P34 protected content (gap) |
| Interruptions | P35 offline 30 s (section 4); P36 our app backgrounded 20 s; P37 screen lock 15 s; P38 user stops sharing, restarts after 20 s (hard gap); P39 Low Power Mode, 10 min; P40 10-min composite session for power and cost |
| R59 and display modes | Run P01, P02, P21, P22, P24 and P38 on W, in each display mode, with a proof per AI request. Runs on A are reported separately as an alternative. |

**Metrics per path:**
- key-step retention, with transient steps reported separately;
- fabricated-step count;
- order accuracy (Kendall's tau, normalised edit distance);
- branch F1;
- before/after completeness;
- gap recall and precision;
- forbidden-inference count;
- freshness at each AI decision;
- effective capture resolution sent (pixel size and scale) per path and case;
- latency p50/p90/p99 per segment;
- relative power impact (M-01);
- bytes, frames, tokens and cost.

**Requirements from the specification:** on the fixed acceptance set, every path must have zero
fabricated steps and zero forbidden inferences, and every stop or blank interval must be recorded as a
gap.

**Engineering experiment candidates** (lead reply). The following are not user-specified thresholds,
not fixed acceptance lines and not purchases: the targets below, 40 cases × 5 runs, a 240 fps camera,
ELAN and two annotators. The original specification's targets and the untested scope stay in force.
- S: retention ≥ 0.98 and tau ≥ 0.95.
- V: retention ≥ 0.85 and gap recall ≥ 0.95.

A45 runs are reported separately.

<a id="hosted-route"></a>

## 13. Bounded hosted build route H (no purchase; not configured)

Status: **not configured, not compiled, not device-tested.** It adds no payment and no new paid CI.
Route H means: a signed build on a GitHub-hosted `xcode-27` runner, installed through TestFlight.
Device tests that need only an installed build list "A or H".

| Step | What it gives | Required input or decision | Basis |
| --- | --- | --- | --- |
| 1. Compile-only job on a GitHub-hosted macOS runner (`xcode-27` image, public preview; `macos-26` has Xcode 26.6) | Proof that bounded probe sources compile (`CODE_SIGNING_ALLOWED=NO`). Standard runners are free for public repositories, and this repository is public by the user's decision. | The lead adds the workflow (lead owns CI) | D7-14 |
| 2. Signed archive and TestFlight upload from the same runner | An installable build via TestFlight, with no Mac and no Developer Mode on the user's side | U4: paid Apple Developer Program (a user decision, not authorized here); an App Store Connect app record; an App Store Connect API key stored as a CI secret | D7-15, D7-12, D8-12 |
| 3. Key role | WWDC21 documents default cloud signing for users with the Admin or Account Holder role. Which API-key role is sufficient is undocumented; an Admin key is the community-reported working case, to be confirmed on the first run. | The user chooses the key role and accepts the security trade-off. Secrets are limited to protected-branch or manual runs. | D7-M09 |
| 4. What it cannot do | Pair a device, attach the debugger or run live Instruments. Home Screen lifecycle tests, which must run outside Xcode anyway, can run on the TestFlight build with on-device logging. | A local Apple silicon Mac (U3) remains the route for debugging and live Instruments | D7-07, D5-M11 |

Also noted:
- Xcode Cloud's first setup needs Xcode on a Mac, so it is not a no-Mac route (D7-13).
- The App Store Connect Safari packager (route B1) remains the no-Mac route for web-only extensions
  (D7-10).
- Cloud Mac rental is paid and not authorized (D7-23).
- From April 2027, uploads must use the iOS 27 SDK, so the `xcode-27` image or Xcode 27 is required
  (D7-M01).
- Builds need a launch screen and the UIScene lifecycle (D8-23). App Store Connect accepts the
  `screen-capture` background mode (D8-04).

## 14. Requests for the lead (P0-08 inputs; 0.1.0 unchanged) and the lead's answers

| # | Request | Status after the lead's reply (`handoff_a85222994ef188a387b979630233bdcb`) |
| --- | --- | --- |
| 1 | `CapabilityResult.gate` has no G7 | **Answered:** keep the document-level `v1_1_gate = G7` wrapper, with the nested 0.1.0 result per the current schema. No 0.1.0 gate result counts as a G7 pass. No protocol change. |
| 2 | Adopt `CompositeDeliveryProof` with separate path facts and a backend model-boundary hook | **Open, P0-08:** the lead unifies shared fields and the backend hook; the whole protocol is not adopted now. |
| 3 | Can `app_composited` count toward A44? | **Answered:** judged by behaviour and evidence (section 5). It can be a candidate pending verification; frozen or stale reconstructions never qualify. |
| 4 | Observation coverage fields (`capture_path`, `share_state`, added gap kinds, `self` regions, clock base) | **Open, P0-08** |
| 5 | S-path envelope additions (`origin`, `identity_tier`, stroke versions, `branch_from`) | **Open, P0-08** |
| 6 | Does the in-app browser count as the original screen? | **Answered:** it is a separately listed alternative. It never counts as original Safari, Canvas or Notability path success, and a lead approval alone does not change that. |
| 7 | A learner's own report of a Notability import | **Answered:** a time- and version-stamped `user_reported` record that may be shown as such; never machine-verified and never an A46 pass. |
| 8 | Web-ink serialisation and transfer into `NoteRevision` | **Open, P0-08** (with web, backend and iOS) |
| 9 | Keeping a clip at a stop | **Answered:** the temporary clip buffer is not kept, but pre-stop authorized source evidence is kept (section 4). |
| 10 | Targets; INTENT-* owners | **Answered:** targets are engineering experiment candidates, not fixed thresholds. The existing INTENT-* owners stay. |
| 11 | Reconcile with Web P0-12 | **Done** for semantics (section 16). Field names are left to P0-08. |
| 12 | R60 per-span audio evidence: capture source, route and processing variant, clock domain, assistant-playback overlap, duplicate candidates and audio gap kinds (section 17.4) | **Open, P0-08** (ADR 0002 §11); not requested in 0.1.0 |
| 13 | Map this plan to the first 0.2.0 process-capture slice (`packages/contracts/process_v2`, `e63b28f`) | **Read; boundaries below.** Default 0.1.0 is unchanged and no endpoint is enabled. |

**0.2.0 process-capture slice (`e63b28f`), boundaries used by this plan.** Read with `git show`
(`packages/contracts/process_v2/README.md`); not merged into this branch, and nothing here consumes it.
- Only `operation` and `coverage` records exist. S-path operations (section 2) and V-path observations
  (section 3) are candidates for them. A visual-only record describes visible changes, never an
  inferred undo or keystroke history (matches V-08/V-09).
- Coverage records carry samples and partial, unobserved or unknown intervals; there is no
  `complete` flag, and a late recovery is a new coverage record that never rewrites the historical
  gap. This covers part of request 4; the added gap kinds and `self` regions stay proposals.
- A `frame_id` must resolve to the exact legacy frame (owner, source, version, device, session, media
  position, artifact hash), or be null. It proves no freshness and cannot express audio-to-screen
  alignment (section 17.4 stays a proposal).
- Scoped stop matches section 4: no new live transmission on the stopped path; `historical` delivery
  only at or below the retained pre-stop stream boundary and only while transmission stays authorized;
  broader withdrawal denies historical replay. A restarted capture is a new declared stream
  incarnation with its restart gap.
- An ACK lists every artifact as `pending` or `verified`. Only `verified` counts as received bytes
  (section 5, `backend_received`); the UI never says content is saved from an inline-metadata ACK.
- The slice encodes no editable ink (request 8), composed model input (request 2), audio route or
  field (request 12), presentation or Notability import. A44, A46 and A47–A49 cannot pass through it.

## 15. Environment and user inputs

Everything in [`p0-03-environment.md`](p0-03-environment.md) section 4 (U1–U11) applies. The items
below are engineering experiment inputs, not requests to the user now (lead reply). When a device or
connection route is actually near, a concrete, reviewable minimal plan will name only the inputs it
needs. Nothing here implies a purchase. In addition:

| # | Input | Needed for |
| --- | --- | --- |
| U12 | Notability and Canvas Student installed on the test iPad, signed in by the user | V path, F tests, A46 |
| U13 | An iPhone that can record 240 fps slo-mo, and an overhead mount | DT-G7-M02 |
| U14 | Two annotators (human) for ELAN labelling | DT-G7-M05 |
| U15 | A Mac with Instruments 27 to analyse power traces, even occasionally | DT-G7-M04 |
| U16 | The user's own iPad is on iPadOS 26.5, so the 26.x variants (V-13, S identity on 26) run on it. Optionally, a device on iPadOS 27 for the 27-only reference tests; never an upgrade of the user's device | 27-only rows and tests (see the checklist's iPadOS 26.5 table) |
| U17 | A named performer (the user or a delegate) and the time for 40 cases × at least 5 runs per path | DT-G7-M05 |
| U18 | Lead/user authorization and a budget cap for AI provider calls. An agreed fixture response can replace it only for P20 and A46 step 3; a fixture sends nothing to a provider, so it can never show that the AI received the composite. | P01 model boundary, A46 step 1, t3/t4 and cost; with a fixture, P20 and A46 step 3 |

**What runs without a Mac:**
- Route C (Swift Playground, iOS 26 SDK): DT-G7-S01A, S02, S04, S06, F04, and the probe screens for M01
  and M02.
- Route B1 (paid program, web-only extension, web role's code): DT-G7-W01 to W04, the capture part of
  W05, and K01/K02 on W.

W05's state API and everything else native need A-paid or H. The V path, iPadOS 27 stroke IDs and
selection, and the in-app browser need A or H. H needs U4 and is unverified. Live debugging and power
analysis in Instruments need a local Mac (A, U3/U15).

## 16. Alignment with Web P0-12 (`c5345186`, `8a32a8aa`)

Read with `git show` from `docs/verification/web/p0-12-disclosure-and-process-plan.md` sections 5 and 6.
Only the semantics are aligned here. Field names and the shared protocol are left to P0-08.

| Topic | Web P0-12 | iOS P0-11 (this revision) | Status |
| --- | --- | --- | --- |
| What counts as a composite | The exact image sent to the model, stored with its hash, visibly containing the ink, plus the ink vectors sent alongside. A DOM snapshot plus ink vectors is not a composite. | Adopted in section 5. iOS adds the transform lineage, `provider_outcome` and a separate `ink_vectors_in_model_input` fact. The vector hash is an iOS addition; Web does not specify one. | Aligned in meaning; the added facts go to P0-08 |
| Compositor names | Candidate paths: (a) extension capture, (b) native screen capture | Eligibility is judged from evidence; any compositor value, including `system_capture` of the live Safari page with our overlay, can qualify (section 5) | Aligned |
| Share stop: sending | After an explicit stop no new frames or ink leave the device, the overlay shows "not live", and the old frame is never presented as current | For the stopped source only: nothing new from it leaves the device and its old frames are labelled stale. Other already-enabled sources, including another path on the same device, continue; sources that were off stay off (section 4, R36/A16). | Aligned for the stopped source; Web's "leave the device" wording needs a per-source scope → lead |
| Share stop: local saving | "Local saving never stops"; the user still sees and keeps their ink | The learner's ink after a stop is kept locally with a `not_sharing` gap; a stroke in progress at the stop is kept whole (section 4) | Aligned |
| Share stop: queued pre-stop items | "Stored ink stays local" | Persisted locally with the final pre-stop queue boundary; history syncs only when independently authorized (section 4) | **Difference → lead**: iOS follows proposed ADR 0002 §4 (not approved); Web P0-12 still keeps it local |
| Display modes after a problem or material version change (including a new video), or unresolved placement | Both modes hide the old ink with a notice | Both modes preserve old anchors and hide or mark with a notice; never re-bind (section 6) | Aligned (proposed ADR 0002 §7) |
| Content-anchored ink at a video moment | Shown only at that moment | Same | Aligned |
| Screen-fixed ink during continuous playback | Hidden outside its moment (media tolerance) | Stays at its screen position with its written-at context while the same known problem and source continue; never ink on later frames (section 6) | **Difference → lead**: iOS follows proposed ADR 0002 §7 (not approved); Web P0-12 still hides it |
| Screen-fixed ink after a seek within the same source | Hidden (outside its moment) | Not settled by proposed ADR 0002 §7; DT-G7-K02 records the observed behaviour | **Open → lead** |
| Cross-origin frames | Pen strokes over a cross-origin frame land in that frame's document, so per-frame ink layers with frame-relative anchors are needed, and strokes crossing frame borders are labelled | P0-03 left iframe injection untested (G1-08, DT-G1-02). A top-frame layer does not receive pen input over the player iframe without per-frame injection and host permission. DT-G7-W02 now also writes over the iframe. | **Difference in anchor kinds and per-frame proof → P0-08** |
| Export states | Share sheet opened → shared; completed → pending import; imported only with target evidence; failed/unknown | Opening the initial sheet keeps `prepared`; reopening preserves prior outcomes, with a separate `share_panel_opened` fact. Completion → `shared` (import pending); cancel, failure and unknown are separate attempt facts; `user_reported` per the lead reply (sections 7 and 9) | **Difference → lead**: iOS follows the lead's correction and proposed ADR 0002 §7 (not approved); Web P0-12 still maps "opened → shared" |
| A45 fallback | Frozen state and source version visible; a one-step return keeps the position; a change on the original shows a notice; drafts never drift | Same (section 8; DT-G7-F01 to F03 now check the position after return) | Aligned |
| G7 in `CapabilityResult` | The G7 web matrix is kept as prose | `v1_1_gate = G7` wrapper, confirmed by the lead | Different presentation, same meaning |
| Ink handoff to the app | Needs a new bridge action (v0.1 has only `selection.submit`) | Two routes: native bridge on A-paid, or backend upload from the extension, which needs no bridge and is the only option on B1 (section 9 step 2) | **Difference → P0-08 chooses** |
| Native video fullscreen | Unsupported; A45 | Same (P0-03 G1-09) | Aligned |
| Media position and audio (R60, `89602e7`) | Reads video position and subtitle `textTracks`; captions, a camera preview or a moving meter do not show that playback audio was received | Media position comes only from the W path and is otherwise `unknown`; playback audio counts only from a track verified with headphones (section 17.2) | Aligned |

<a id="audio-screen"></a>

## 17. R60 audio and screen increment (iOS input paths; planning only)

Read with `git show` at `89602e742aea9c6ef6b6ec6a76c371e20bff2edf`, not merged (lead handoff
`handoff_045d6c5813d00ad44dc642d8fbf975e9`):
- `docs/requirements/audio-screen-interpretation.md`: the four exact user quotes, AUDIO-01–15 and
  AVTEST-01–12;
- R60 and A47–A49 in `requirements.en.md`, and D-AUDIO-SCREEN in `intent-and-decisions.en.md`;
- `tasks.md#audio-screen-coordination` and ADR 0002 §11 (proposed).

Revised after merging the lead's final normalization `7fadd151c83118c22a4846bdb8b2622d47bb0df3`
(content `9edbc1c`; handoff `handoff_dcbcd28d18a4feba5ff4ba4df6c11fb5`): the current-decisions entry,
the audio specification's current §1 and microphone routing candidates, the amended
AVTEST-04/05/06/07/09/11, the updated coordination table and iOS role, and the lead's official-source
check. Contract boundaries from `e63b28f` are in section 14.

**iOS scope** (coordination table): AUDIO-05–09 and AUDIO-13–15; AVTEST-03–07 and AVTEST-11. For these
cases iOS supplies evidence about the actual input paths:
- the live classroom microphone mixture, including a quiet learner, a far professor and more people;
- actual iPad video playback audio plus the enabled microphone, including with headphones;
- missing lecturer content;
- what correctable role attribution needs from the device;
- stops that apply to one source or track only;
- legibility and timing of a camera view shown on the shared screen.

Other roles own the rest. Learning P0-10 owns interpretation, diarization quality, routes and
scorecards (AUDIO-01–04/10–12). Backend P0-09 owns the archive, correction revisions and the
bounded-buffer lifecycle. Lead P0-08 owns the contract, and QA P0-13 owns acceptance planning.

**Unchanged:**
- contract 0.1.0 (the 0.2.0 process slice enables no endpoint, audio route or audio field; section 14);
- the R59/A44/A46 evidence rules (sections 5 and 9); audio work neither replaces nor satisfies them;
- the stop boundary (section 4).

Nothing is implemented, compiled or measured, and no microphone, mode or route is activated or
bought. All device tests remain `not_tested`: 60 in P0-03 (58 earlier plus DT-G3-12 and DT-G3-13) and
49 in P0-11 (including DT-G7-AV01 to AV06). The platform research for the target is in
[`research/audio-routing-26-5-claims.json`](research/audio-routing-26-5-claims.json) (`F1-*` session
modes, `F2-*` ports, routes and channels, `F3-*` target device and 26.x capture); it also reuses the
P0-03 claims (`D4-*`, `D8-*`) and P0-11 claims (`E2-*`). Anything marked **not researched** is a
question for a probe, not a claim.

<a id="target-26-5"></a>

### 17.0 Target device and microphone scenarios

**Target.** The user reports an iPad Pro 13-inch (M5) on iPadOS 26.5. Apple lists a four-microphone
array and one Thunderbolt / USB 4 port, and no headphone jack is listed (F3-01, F3-02, F3-03 inferred);
iPadOS 26.5 was released on 2026-05-11 and the M5 can run iPadOS 26 or 27 (F3-08, F3-09). The identity
is not device-tested (DT-ENV-01). iPadOS 27.0 is the dated research reference, not an upgrade the
user must make. Consequences on 26.5:
- ScreenCaptureKit on iOS starts at 27.0 (D4-01). System-wide screen and other-app audio capture on
  26.5 is the ReplayKit broadcast upload extension (G3-07, V-13; that no other cross-app path exists
  is inferred, D4-20): typed `.video`, `.audioApp` and `.audioMic` buffers (D4-08, F3-12), started by
  the user in the broadcast picker. The picker shows the user a microphone button; no documented
  property turns the microphone on programmatically (F3-11). Its `.audioMic` is one microphone source
  besides our own session microphones. Whether `.audioApp` carries Safari or Canvas Student playback
  is undocumented (D4-09).
- `excludesCurrentProcessAudio`, `synchronizationClock`, `SCClipBufferingOutput` and
  `SCRecordingOutput` do not exist on 26.5.
- Safari on the target is 26.5, not 27 (F3-17, F3-18 inferred).
- Every matrix row and checklist test records its applicability on 26.5 (`target_26_5` in the matrix
  JSON; a table at the top of each checklist). A 27-only row or test runs only if a 27 device is
  available; it is never a prerequisite.

**Scenarios kept separate** (tests never merge them):

| # | Scenario | Session configuration | Status |
| --- | --- | --- | --- |
| M1 | One microphone (built-in, or one selected headset) while course audio keeps playing | `playAndRecord` + `mixWithOthers` (G3-08, D4-15). D5-M03 is scope-corrected: this is the route that research evaluated, not the only possible one. | Documented; not device-tested |
| M2 | Built-in microphones for the classroom plus a near-mouth compatible headset (input and output) for the quiet learner | `multiRoute` category, `dualRoute` mode, `allowBluetoothHFP` option; iPadOS 26.2+ (G3-15; F1-01 to F1-03) | Documented API. Availability on the M5 (F3-20), independent signals (G3-17), course playback (G3-23), background (F1-29) and broadcast coexistence (G3-22) are untested. |
| M3 | External multichannel interface or receiver | Its channels in one input route (G3-21) | Separate candidate (DT-G3-12); channels must vary independently; a hub, splitter or duplicated mono proves nothing |
| M4 | iPad plus iPhone, each capturing | Separate devices; one AI output endpoint | Optional P3-01 route (DT-G3-13); does not defer P1-03 classroom understanding |

Rules for M2:
- Read `availableModes` on the device before selecting `dualRoute`; OS version alone is not enough
  (F1-18; Apple lists no models, F3-20). If the mode is unavailable, or activation fails or falls back
  (F1-19, F1-21), the app says the second input is unavailable and uses M1. It never claims the second
  input.
- Secondary types are those Apple lists (headsetMic, headphones, bluetoothLE, bluetoothHFP), and only
  routes with both input and output are available (F1-03). USB and input-only devices are not
  established (G3-18); they are tested only as expected-unsupported cases.
- `allowBluetoothHFP` is required by `dualRoute`, although the option's own page restricts it to
  record/playAndRecord (F1-15). Acceptance is recorded on the device.
- `bluetoothHighQualityRecording` works only in the default mode (F1-23). It is never combined with
  `dualRoute`; it is a separate single-input variant, and it is not currently supported in the EU
  (F1-24).
- The API's primary hardware route is always built-in (F1-03). It does not decide the application's
  primary learner interaction input, which is a policy role. There is one AI playback endpoint for
  interaction and echo control.
- A listing in `availableInputs` or `currentRoute` does not prove simultaneous independent signals
  (F2-01, F2-04). Only the per-channel measurements in P0-03 DT-G3-05 do. Channels are selected
  through `currentRoute` channel descriptions and an input channel map (G3-16, F2-M21).
- Documentation grants no capture authority. Apple forbids using `dualRoute` to record others without
  their awareness (F1-07); record permission (F1-M24) and the existing per-source authorization still
  apply.

### 17.1 Input paths and what is documented

| Experience (user quote) | Candidate iOS path on the 26.5 target | Documentation status | Tests |
| --- | --- | --- | --- |
| In-person class: the iPad microphone hears the professor and the learner | M1: `playAndRecord` + `mixWithOthers` started in the foreground and kept by the `audio` background mode (G3-08, D4-15, LC-07). M2: `dualRoute` built-in plus headset (G3-15). With screen capture on 26.5: the broadcast `.audioMic` (D4-08). SCK `.microphone` only on 27 (G3-04). | Microphone capture is documented. Starting or restarting the microphone from the background is expected to fail (inferred; LC-08, D4-16). M2 continuation in the background is undocumented (F1-29). No OS speaker separation (D4-20, inferred; G3-09). | AV03, DT-G3-05, DT-G3-11, DT-G3-12 |
| Video on the iPad: the AI hears the playback audio, whatever the output route | The broadcast `.audioApp` (G3-07). SCK `.audio` only on 27 (G3-03). | **Undocumented** whether `.audioApp` carries Safari or Canvas audio (D4-09; a 2018 report of zeroed Safari buffers). Extension memory is reported at about 50 MB (D4-12). There is no other cross-app audio tap (D4-20, inferred). FairPlay video is blacked out while its audio is included (G3-06, E2-13; documented for system recording). | AV01, AV02, DT-G3-04, DT-G3-07, DT-G7-V09 |
| Learner speaks while the video plays | The broadcast `.audioApp` and `.audioMic` (D4-08), and our session channels; each with its own sample timestamps | Separate buffer types are documented. Whether the broadcast microphone and our session microphone run together is undocumented (G3-22, F3-14). Leakage, ducking and whether Safari pauses are device questions (G3-08, G3-23, D8-17). | AV02, DT-G3-05 |
| Assistant speech must not be taken for the learner or the lecture | Our assistant-playback span log (rule 5). In M2, the AI voice sent to the headset only through an output channel map (F1-14, untested under `dualRoute`). Voice processing on the microphone (D4-19). `excludesCurrentProcessAudio` only on 27 (G3-05). | 26.5 has no own-audio exclusion for broadcast `.audioApp`; our own audio there is measured. Voice processing ducks other apps' audio by default (D8-17). Echo-cancelled input without voice processing is documented only for certain 2024+ iPhones (D8-18). | AV02, DT-G3-05 |
| A camera view shown on the shared screen | Broadcast `.video` frames on 26.5 (SCK frames on 27) contain whatever the screen shows | Whether another app's live camera preview appears in the frames, stays live beside the course in Split View or Stage Manager, or is protected: **not researched**. SCK has no camera overlay for full-display capture (E2-M06). A direct camera API or external-camera connection is an optional route, **not researched** here. | AV04 |
| Timing across screen, audio and media | Broadcast sample timestamps in the extension and our app's audio host time, with a measured cross-process offset; media position only from the W path's content script (Web P0-12; D8-25). `synchronizationClock` and `displayTime` only on 27 (D4-14). | For native apps such as Canvas Student the media position is unknown and recorded as unknown. There is no documented clock across devices (D8-28, inferred). | AV05, DT-G7-M03, DT-G3-08, DT-G3-13 |

**DT-G3-05 and DT-G3-11 are prerequisites only.** They measure signal paths:
- microphone leakage with the speaker versus headphones;
- M1 and M2 availability, option acceptance, port types, channels and independent signals;
- attach, detach and recovery; interruptions and case closure;
- coexistence with course playback and with the broadcast;
- the effect of `mixWithOthers` and voice-processing ducking;
- on-device recognition per delivered input while backgrounded.

Passing them passes no AVTEST case and says nothing about comprehension, speaker attribution or
permission to answer.

### 17.2 Rules for the native end

1. **Headphones decide what the playback track shows** (AUDIO-06, AVTEST-04). Course content counts as
   "internal playback audio delivered" for an app, output route and capture path only when the
   playback track (`.audioApp` on 26.5, `.audio` on 27) carries the reference signal while the output
   is on headphones and the microphone does not. The microphone hearing the loudspeaker never counts
   as internal audio. Zeroed or silent buffers mean the track is unavailable for that app, and the UI
   says so. Results are per app, per output route (built-in speaker; wired through USB-C or the USB-C
   to 3.5 mm adapter, with the reported port type; Bluetooth), per capture path, per microphone
   scenario and per OS build.
2. **Our session must not break the course.**
   - M1: `playAndRecord` + `mixWithOthers`, never `.record` or `.defaultToSpeaker` (G3-08; D4-M07:
     `.defaultToSpeaker` keeps the built-in route even with headphones connected). Selecting a
     Bluetooth HFP input moves output to the same device (F1-16); A2DP is output-only, is cleared by
     multiRoute, and HFP has routing priority when both are set (F1-17).
   - M2: `multiRoute` + `dualRoute` + `allowBluetoothHFP`, with `mixWithOthers` requested and its
     acceptance measured (F1-11). `.defaultToSpeaker` cannot be set there (F1-M22). The archived guide
     marks multiRoute as interrupting nonmixable audio (F1-10), so continued playback is a device
     question (G3-23). `duckOthers` and `interruptSpokenAudioAndMixWithOthers` are never used in a
     long session (F1-M02, F1-M23).
   - Each run records the requested and read-back category, mode and options, the actual input and
     output route, and whether the course paused, was ducked or moved to another output.
3. **A track is a capture source, not a person** (AUDIO-07, AUDIO-15). Tracks are named by source: for
   example `course_playback`, `ipad_microphone`, `personal_microphone`, `displayed_camera_view`. Never
   `teacher` or `user`. A near-mouth personal microphone still hears other people, and the built-in
   channel still hears the learner. Role attribution (teacher, user, assistant, additional speakers,
   unknown) belongs to interpretation.
   - A role correction in our UI is written as a separate correction record that points at the
     original span; the span itself is never edited (P0-09/P0-10 own the record and its states).
   - A correction made by the learner is the learner's confirmation. An AI suggestion stays proposed.
4. **Capture is not reply permission** (AUDIO-09, AVTEST-06).
   - Quiet lecture mode and a silent assistant never stop or thin out a track.
   - A voice-activity label (for example from `SpeechDetector`, D8-19) marks spans; it never drops
     authorized audio from the capture.
   - Anything dropped for bandwidth, overflow or processing is recorded as a `suppressed` or
     `buffer_overflow` gap, never silently.
   - Our app never starts a conversation because a track has sound. A quiet learner speaking on the
     personal microphone does not stop classroom capture.
5. **Echo versus interruption** (AUDIO-06, AUDIO-09).
   - Our player records every assistant playback span, with its host time and the exact audio played.
     These spans are evidence for echo detection downstream.
   - Microphone audio that overlaps an assistant span is flagged `assistant_playback_overlap`. It is
     never dropped as echo, so a real learner interruption survives.
   - Duplicates are flagged as candidates with the measured lag, and no copy is dropped as a duplicate
     before interpretation: the same lecture in the playback track and a microphone (loudspeaker
     leakage); the learner's voice on both the headset and built-in channels; the teacher faintly on
     the headset channel; and the broadcast `.audioMic` against our session channels. How long each
     copy is kept follows rule 7, sections 3 and 4 and Backend P0-09; observing a copy does not by
     itself oblige keeping it permanently.
6. **Raw versus processed** (AUDIO-05).
   - Our own software processing (gain, denoise) keeps the raw and the processed chunk under one span
     ID inside the authorized buffer.
   - OS processing (voice processing, automatic gain control) happens before we receive samples, and
     whether a raw copy is also available is **not researched**. `dualRoute` documents only that the
     system may apply signal processing to output routes (F1-06); input processing under it is
     undocumented. Input gain is session-wide, and its effect under `dualRoute` is undocumented
     (F2-18, F2-19). The active variant, including the user's microphone mode (F3-M25), is therefore
     recorded per span, and variants are compared across repeated runs of the same reference signal.
   - Per span and channel, record peak and RMS level, clipped-sample count, the input port and the
     sample rate.
7. **Live, with no saved recording** (AUDIO-13, AVTEST-11). The prohibition covers continuous or
   full-session audio/video recordings only; it never removes required source evidence.
   - No manual record or upload step, no saved lecture or replay prerequisite, and no automatic
     expansion into recording. No continuous or full-session audio/video recording file: no
     `SCRecordingOutput` file on 27 (E2-09), and on 26.5 no continuous or full-session audio/video or
     replayable lecture file in the app, broadcast extension or App Group containers.
   - Declared transient audio/video buffers: on 27 the rolling clip buffer of at most 15 s (E2-08,
     DT-G7-V05; 26.5 has no clip buffer); any App Group ring buffer between the extension and the app
     (its path, maximum size or duration and overwrite behaviour are recorded); and the audio chunks
     held until the backend acknowledges them or the buffer limit is reached.
   - Durable authorized source evidence is separate and remains, including as files in these
     containers: kept key frames and the 26.5 keyframe history (section 3, V-04), editable original
     ink, observed attempts and process records, transcripts and their time relations, and pre-stop
     queued items (section 4). A stop does not erase them; explicit deletion follows its own rules.
   - While offline, transient audio is held only up to that limit. Past the limit, the oldest
     transient audio is dropped with a `buffer_overflow` gap, and any on-device transcript (G3-14, if
     it works in the background) is kept as text with its capture times. Overflow never silently
     replaces or evicts required durable source evidence; if durable storage itself cannot hold it,
     that is recorded as its own gap.
   - The limit comes from Backend P0-09's bounded-buffer lifecycle. It is an engineering default that
     we report and measure, not an open user choice.
   - A raw audio sample or duplicate copy that was only observed transiently is not thereby promised
     permanent retention; durable retention follows sections 3 and 4 and Backend P0-09.
8. **Stop per source and per track** (AUDIO-14; section 4).
   - Tracks on 26.5: broadcast `.video`, `.audioApp` and `.audioMic`, and our session channels (M1, or
     the M2 built-in and headset channels). On 27: SCK screen frames, `.audio` and microphone. Stopping
     one leaves the others in their own state; a track that was off stays off.
   - Microphones owned by a system picker are not switched by the app: the SCK picker on 27 (G3-04)
     and the broadcast picker's user-facing microphone button on 26.5 (F3-11; no documented property
     turns it on programmatically). Our "stop microphone" closes our forwarding gate at once. The OS
     microphone and its orange or green indicator (D4-18) stay under the picker's control. On 27,
     turning the SCK microphone off needs a new stream (G3-11), with a recorded gap. On 26.5, whether
     the user can switch the broadcast microphone off without ending the broadcast is undocumented and
     is observed in DT-G7-AV06 and DT-G3-05 variant 13, and any gap is recorded. The UI says which
     happened and never claims the OS microphone is off when only our gate is closed.
   - On 26.5, ending the broadcast stops `.video`, `.audioApp` and `.audioMic` together, so a
     screen-only stop is a forwarding gate. A per-channel stop in M2 is a gate unless the session is
     reconfigured; then the gap on the other channel is measured.
   - A route loss (headset detached) is a recoverable route gap; a user stop stays stopped.
   - After a stop or disconnection, a track's last audio or frame is stale, never live. Late
     transcripts keep their original capture times and never create a live request or restore help
     that was withdrawn.
   - Reconnecting or reattaching never restarts a stopped track.
9. **Camera view on screen** (AUDIO-15, AVTEST-07).
   - Frames record the region showing a camera preview as `displayed_camera_view`, separately from
     digital-screen regions, whenever this is known (our own preview, or a region the learner marks).
     Otherwise the frame keeps its ordinary screen provenance.
   - Legibility, distance, glare, motion, obstruction, cropping and camera-to-capture delay are
     measured (AV04).
   - A visible preview never implies captured camera audio. Camera audio, where it reaches a track, is
     one more source with the same speaker uncertainty.
   - No camera connection type is assumed, and nothing needs to be chosen or bought.
10. **Missing lecturer content is reported, not guessed** (AUDIO-05, AUDIO-07, AVTEST-03, AVTEST-06).
    Missing audio has two kinds: not in the track at all (gap, silence, clipping, suppression, route
    gap) and captured but not recognized downstream. The native end reports the first kind per span
    and channel. Tests compare both kinds against a human reference, per person.

### 17.3 Case mapping

| Case | iOS investigation | Test | Downstream owner |
| --- | --- | --- | --- |
| AUDIO-05, AVTEST-03 | Quiet learner and distant professor across noise; raw versus processed variants, level, clipping and voice-activity labels per span and channel; missing and false speech against a human reference | AV03, DT-G3-05 | P0-10 (recognition), P0-09 (buffer) |
| AUDIO-06, AVTEST-04 | Playback audio per app, route and capture path, with headphones; the personal microphone under headphone playback; concurrent learner speech; assistant playback on the chosen output; attach, detach and recovery; actual ports and channels; duplicate lecture and echo candidates; which inputs actually reach the receiver | AV01, AV02, DT-G3-05 | P0-10 (dedupe and reply decisions) |
| AUDIO-07, AVTEST-05 | Live classroom mixture with a teacher, the learner and more than two people, overlap and changing speaker counts; the near-mouth personal microphone plus built-in pickup through conditional `dualRoute` on the target; unavailable or older mode and USB or input-only limits; independent signals and screen-sharing coexistence; the multichannel interface as a separate candidate; no recording or upload; role correction recorded apart from the span | AV03, DT-G3-05, DT-G3-12 | P0-10 (diarization), P0-09 (revisions) |
| AUDIO-08, AVTEST-07 | Spoken references aligned under seek, speed change, pause, scroll, edits, a delayed camera view and backfill; for the optional two-device route, clock drift, duplicated sound, delay, reconnect and source identity | AV05, AV04, DT-G3-13 | P0-08 (alignment relation), Web P0-12 (media anchors) |
| AUDIO-09, AVTEST-06 | Quiet mode keeps capturing the professor; a quiet learner on the personal microphone while the professor and another person continue; omitted input separated from recognition loss; a nearby speaker never triggers our app | AV03 | P0-10 (addressee and reply) |
| AUDIO-13/14, AVTEST-11 | Live without a saved recording; source, track and channel stop, session end, revocation, deletion and disconnection with late transcripts; personal-microphone route changes and recovery with classroom continuation; optional two-device stops; indicators agree with the claimed scope; storage audit | AV06, DT-G3-05, DT-G3-13 | P0-09 (lifecycle), P0-08 |
| AUDIO-15, AVTEST-04/07 | Camera view on the shared screen: presence, liveness, legibility and delay; separate from its audio | AV04 | P0-10 (legibility use) |

A recorded sample played through the pipeline is labelled `recorded_sample` and never passes a
live-device case (AVTEST-05). Recordings of real people need their consent, and none is committed.
Project-authored reference audio and fixture pages are used wherever possible.

### 17.4 Proposed per-span evidence (for P0-08 §11; not 0.1.0 or 0.2.0)

For each audio span:
- `track_id` and `source_kind`: `broadcast_audio_app`, `broadcast_audio_mic`, `session_microphone`
  (with its port and channel), `sck_audio`, `sck_microphone` or `in_app_player`;
- the capture path (`broadcast` or `screencapturekit`) and the microphone scenario (M1 to M4);
- `device_id` and `device_sequence`;
- the capture timestamp with its clock domain, and `received_at`;
- the input and output route: port type, UID and channel index, and the input channel map;
- requested and read-back category, mode and options, and the `availableModes` snapshot;
- the session sample rate;
- the processing variant: voice processing and its ducking setting, the user's microphone mode, and
  on 27 `excludesCurrentProcessAudio`;
- peak and RMS level, and the clipped-sample count;
- non-destructive voice-activity labels;
- overlaps with assistant playback spans, and duplicate candidates;
- the media position, only with its source (the W path) and uncertainty;
- the frame version visible at capture time;
- gaps: `track_unavailable`, `zeroed_buffers`, `missing`, `clipped`, `suppressed`,
  `buffer_overflow`, `stopped`, `not_sharing`, `offline`, `route_lost` (secondary detached),
  `hardware_muted` (case closed; zero buffers, F2-28), `mode_unavailable` and `interrupted`.

These names are proposals only. The 0.2.0 process slice (`e63b28f`) covers operation and coverage
records and states that audio alignment and ASR corrections need later explicit contracts. The lead
unifies shared fields in P0-08, and runtime consumers wait for the formal contract.

### 17.5 Inputs (engineering, not requests now)

| # | Input | Needed for |
| --- | --- | --- |
| U19 | Headphones and headsets the learner already has. For M2, a bidirectional headset (microphone and output); output-only earphones cannot be the secondary (F1-M21). A USB input-only microphone, a multichannel interface or a second device only if already owned, as separate candidates. No purchase implied. | AV01, AV02, AV03, DT-G3-05, DT-G3-12, DT-G3-13 |
| U20 | Consent of every person recorded in a classroom test, or a staged session with consenting people; project-authored reference lecture audio with marker tones | AV03, AV05, DT-G3-05 |
| U21 | Whatever camera view the learner actually uses, shown on the iPad screen; no camera choice or purchase needed | AV04 |

On the reported iPadOS 26.5 target, all six AV tests run as broadcast-extension plus session-audio
variants (M1 and M2) in an installed build on route A or H: a 26.2-or-later SDK, a deployment target at
or below 26.5, the broadcast upload extension, an App Group and the `audio` background mode.
ScreenCaptureKit variants are a 27.0 reference only, never an upgrade prerequisite. Route C (Swift
Playground 4.7, "iOS 26 SDK" with no stated minor version) covers only the foreground M1 part, and M2
only if its SDK includes the 26.2 symbols; it can never test background, broadcast or extension
variants.
