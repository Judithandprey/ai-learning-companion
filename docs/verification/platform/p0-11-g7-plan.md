# P0-11 G7 / R59 dual-path design and experiment plan (design only)

Date: 2026-09-28 UTC.

Baselines, both read with `git show` and not merged:
- Specification: `e43293760c70364584cb597ae01d34a261cc52cf` (content `a2567fa`).
- Confirmed user decisions: `44e60ec289717e155fb0f4374784c791bf23689c`
  (`docs/requirements/intent-and-decisions.md`: Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE, D-FINAL-ANSWER,
  Q-HOMEWORK-DESTINATION and the INTENT-* cases).

Current specification baseline: `9ce270cc747676889797199b7e8455ccfef07a5f`.

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
- On reconnect, only unacknowledged items are sent again. The server's idempotency prevents
  duplicates, and replay never overwrites an earlier stroke version.
- Replayed items are historical (`captured_at` ≠ `received_at`). They are never presented or sent to
  the AI as live.
- A capture or share stopped while offline stays stopped after reconnect. Replay never re-activates
  it.
- The offline interval is an `offline` gap on S, V and W.
- Test: DT-G7-R01 (A31/A27).

**Stop boundary** (R29/R30/R58; problem-solving specification stop rules):
- An explicit stop at time T ends observation and live sending on that path:
  - no capture API call, handler frame, clip or process-log observation event after T plus a stated
    stop latency;
  - nothing is sent to the AI after T.
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
- Items still in the local queue at T are persisted. Whether and how they later sync as historical
  records is decided in P0-08 (section 16). Historical upload never restarts capture. They are never
  sent to the AI as live input or shown as current.
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
     - captured within the freshness bound of the strokes it shows;
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
- After a stop, no new frame or stroke is sent or presented as live (A44).

## 6. Display modes (Q-INK-DISPLAY, INTENT-INK-MODES)

Both modes are provided, and each is verified on its own. They are independent of purpose and
destination.

| Mode | W: Safari page (web role script) | A: in-app browser | F: own canvas / frozen (A45) | Native apps |
| --- | --- | --- | --- | --- |
| Content-anchored (INT-01W, INT-01A) | Anchor to elements or text ranges with an offset; re-resolve on each capture; freeze when re-location is unreliable | Content coordinates from `contentOffset`/`zoomScale` plus the same DOM anchors via a user script | Canvas content coordinates | Not available (SURF-10) |
| Screen-fixed (INT-02W, INT-02A) | A viewport-fixed layer; the stroke records source, frame and `media_position` at writing time | A view fixed over the web view; same provenance | Screen scratch area with its source frame | Not available |

Both modes preserve the original ink and the source and frame at writing time. Old ink is never
silently attached to new content.

- **After a seek, a new video, or a problem, version or source change:** both modes hide the old ink
  from the new content with a visible notice and keep it recoverable in its original context (aligned
  with Web P0-12).
- **Content-anchored ink written at a video moment:** shown only at that moment and hidden otherwise
  (Web P0-12 semantics; no object tracking).
- **Screen-fixed ink during continuous playback:** iOS proposes keeping it visible with a "written at
  mm:ss" label. It is never recorded or sent as annotation of a later frame. Web P0-12 hides it outside
  its moment. This is an open difference for the lead and Learning (section 16), because Q-INK-DISPLAY
  says screen-fixed ink is fixed relative to the screen and asks that the current state be explained. Tests: DT-G7-K01 and DT-G7-K02 per
surface, plus finger navigation (W03) and the model-input composite (P01).

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
  - Each outcome is recorded as prepared → shared → pending import → imported (only with target
    evidence), or failed / unknown (aligned with Web P0-12). The share sheet events map as follows:
    - sheet presented → `shared`;
    - `completed == true` with the Notability `activityType` → `pending_import`;
    - `completed == false` (cancelled) → back to `prepared`, with the cancellation recorded.
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
| 5. Learning note archived to Notability | ExportJob: prepared → shared (sheet presented) → pending_import (`completed == true` with the Notability `activityType`) | "Pending import", never "saved" | P0-03 G5-02, G5-03 |
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
| U16 | Optionally, a second iPad on iPadOS 26.x | V-13, S identity on 26 |
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
| Share stop: sending | After an explicit stop no new frames or ink leave the device, the overlay shows "not live", and the old frame is never presented as current | Same (section 4) | Aligned |
| Share stop: local saving | "Local saving never stops"; the user still sees and keeps their ink | The learner's ink after a stop is kept locally with a `not_sharing` gap; a stroke in progress at the stop is kept whole (section 4) | Aligned |
| Share stop: queued pre-stop items | "Stored ink stays local" | Persisted; whether and how they sync later as historical records is open | **Difference → P0-08** |
| Display modes after a seek, new video, or problem/version/source change | Both modes hide the old ink with a notice | Same (section 6) | Aligned |
| Content-anchored ink at a video moment | Shown only at that moment | Same | Aligned |
| Screen-fixed ink during continuous playback | Hidden outside its moment (media tolerance) | iOS proposes keeping it visible with a "written at mm:ss" label, never sent as annotation of a later frame | **Difference → lead and Learning** |
| Cross-origin frames | Pen strokes over a cross-origin frame land in that frame's document, so per-frame ink layers with frame-relative anchors are needed, and strokes crossing frame borders are labelled | P0-03 left iframe injection untested (G1-08, DT-G1-02). A top-frame layer does not receive pen input over the player iframe without per-frame injection and host permission. DT-G7-W02 now also writes over the iframe. | **Difference in anchor kinds and per-frame proof → P0-08** |
| Export states | Share sheet opened → shared; completed → pending import; imported only with target evidence; failed/unknown | Same mapping (sections 7 and 9), plus a `user_reported` record per the lead reply | Aligned |
| A45 fallback | Frozen state and source version visible; a one-step return keeps the position; a change on the original shows a notice; drafts never drift | Same (section 8; DT-G7-F01 to F03 now check the position after return) | Aligned |
| G7 in `CapabilityResult` | The G7 web matrix is kept as prose | `v1_1_gate = G7` wrapper, confirmed by the lead | Different presentation, same meaning |
| Ink handoff to the app | Needs a new bridge action (v0.1 has only `selection.submit`) | Two routes: native bridge on A-paid, or backend upload from the extension, which needs no bridge and is the only option on B1 (section 9 step 2) | **Difference → P0-08 chooses** |
| Native video fullscreen | Unsupported; A45 | Same (P0-03 G1-09) | Aligned |
