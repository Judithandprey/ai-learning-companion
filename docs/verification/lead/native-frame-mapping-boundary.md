# Native Frame/process mapping boundary

**Recommendation: add one explicit versioned raw-frame descriptor and pure binding validator before assigning the native Frame/process encoder.** Released Frame/ingress shapes cannot truthfully express this producer's unknown capture UTC and unapplied orientation. Do not change v0.1 or silently widen 0.2.4. A bounded next lead milestone is `packages/contracts/capture_frame/**` plus focused contract tests, with an additive version such as 0.2.5 assigned by lead. This is a proposed boundary, not an implemented protocol or activated route.

Code inspected at current main, ending at `ae585e084b4a4292f0ec2d6baaeaac1eabc3f040`; all relevant native/contracts/API/Learning files are unchanged from hosted `3745c41`. Refreshed source/English §3.1, §7.1–7.2 and V-SourceTimeRelations, current decisions, and actual released contract/consumer paths. No repository edits or external operations.

## What the actual producer knows

- `Shared/CaptureStore.swift:49–51,78–96` stores a session wall/host anchor, callback `hostTime`, sample `presentationTime`, raw buffer width/height and optional `CGImagePropertyOrientation` integer. PNGs retain delivered pixel orientation; the attachment is not applied.
- `BroadcastUpload/CaptureSession.swift:50–64,90–91,139–160` samples Date/host time at start and samples host time inside the video callback. The emitted keyframe event has host time and the record, **no keyframe wall-time measurement**. The PTS is the sample-buffer presentation timestamp, not the course video's playhead.
- `startedWallTime + (record.hostTime - startedHostTime)` can be a **callback-observation wall-time estimate**, with unknown error/clock drift. It is not the pixel capture UTC. Neither PTS nor upload/receive time supplies the missing capture instant. Keep course `media_position: null` unless independently obtained.
- Buffer `sequence` counts all received video buffers; it is not automatically the process stream sequence once lifecycle/coverage records occupy that stream. Retain both meanings explicitly. A restarted producer requires a distinct clock domain/incarnation.

## Exact released-contract boundary

`packages/contracts/schema.json:253–337` makes legacy Frame closed and requires non-null UTC `captured_at`; it has no orientation or time-basis property. ProcessRecord already permits nullable `observed_at` and an optional `CaptureClock` with `uncertainty_ms: null` (`process_v2/schema.json:105–138,393–423`). These can retain unknown observations and a bounded callback clock, but cannot give Frame missing capture-time or raw-orientation semantics.

`process_v2/validation.py:166–185` explicitly validates a legacy Frame, keeping capture and observation time distinct (README:33–38). `original_artifact.validate_capture_frame` and `display_source.validate_display_record` call that helper. `capture_ingress/__init__.py:45,57–62` copies this exact legacy Frame into the closed 0.2.4 request. An opaque JSON artifact or undocumented field does not remove the required capture timestamp or teach consumers how to orient pixels.

Four tiny actual validator probes confirmed: a valid existing fixture passes; setting `captured_at: null`, adding raw `orientation`, or adding `time_basis` each rejects. A CaptureClock with a finite nonnegative elapsed value and unknown uncertainty accepts. No test campaign was run.

## Smallest proposed additive shape

Use a distinctly named/versioned **raw captured-frame descriptor**, reusing existing source/frame/device/session/artifact/hash/raw-dimension primitives. For this native slice:

- `captured_at: null` explicitly means unknown pixel-capture UTC; do not insert an estimate into that field.
- An explicit timing object carries a nullable **`observed_at_estimate`**, a fixed basis such as `session_wall_plus_callback_monotonic_delta`, a nullable existing `CaptureClock` whose domain denotes callback observation and whose uncertainty remains unknown, plus separately named **sample PTS seconds** (finite or unknown). Preserve the native buffer sequence separately if transmitted; never reinterpret it as process stream sequencing or video position.
- An explicit raw-orientation object names `CGImagePropertyOrientation`, retains all valid values 1–8 including mirrored variants or null when absent, and fixes `applied_to_pixels: false`. Keep raw width/height and original PNG identity unchanged. Unknown is not orientation 1. Unsupported/malformed values cause a clear mapping failure while local originals/sidecars remain intact.

The estimate's unknown uncertainty must be explicit in the shape/docs; no invented zero error or measured UTC accuracy. Keep `ProcessRecord.observed_at: null` when only this labeled estimate is available; the descriptor then preserves the estimate without passing it through the old unqualified observation field. A supplied process clock may mirror the same callback domain/value. Do not use synthetic dates, hidden sidecars, filename parsing or source-registration time to satisfy legacy Frame.

The first executable lead change should include closed schema/types, a pure validator for this descriptor, and a pure composition check against the **existing** ProcessBatch, DisplaySourceSnapshot and OriginalArtifactBinding. Require exact owner/source/version/device/session/stream and artifact hash/type/length bindings, raw dimensions, and immutable timing/orientation metadata. Inputs must be explicitly supplied; the helper does not mint producer authority or manufacture a legacy Observation/Frame. Normal original uploads and receipts stay 0.2.2.

Focused checks: null capture time; finite/unknown estimates and PTS; all eight orientations plus absent/invalid/bool; source/session/stream/artifact mismatches; unchanged raw bytes/dimensions; detached immutable results; and byte-pinned old contracts rejecting the new shape. A future explicit ingress wrapper/version may compose it; do not advertise it on the current 0.2.4 route before adoption.

## Exact next consumers, kept outside that first patch

- **Backend:** `services/api/ingress_app.py:267`, `control.py:86`, `capture.py:335–348,424–449` currently validate/bind legacy Frames. Add an explicit new-version path using the same current-authorized atomic transaction, replay and tombstone rules; never downgrade to legacy Frame. Preserve complete new metadata in immutable equality. `process_context.py:215–234` and `image_resolver.py:35,61` must recognize the new descriptor coherently on read, with historical/current authorization unchanged.
- **Learning:** `services/learning/process_context.py:109–145` assumes legacy Frame; `images.py:16–87,98–125` validates PNG raw dimensions and returns unchanged bytes, but supplies no rotation/mirroring step. Adoption must preserve the descriptor in context and explicitly label raw/unapplied orientation. A later display/model adapter must honor the orientation or report it unsupported; accepting PNG dimensions alone must not imply an upright/aligned image. Existing legacy Archive/Observation consumers stay untouched.
- **iOS next owner:** after the additive boundary, implement a pure mapper from actual saved keyframe/status plus an explicitly supplied trusted source/current stream tuple and exact committed original binding. Current original uploader supplies only SourceRef, so full server device/session/stream/bootstrap remains a separate dependency. Preserve raw files, unknown clock mapping and source gaps; do not fabricate a foreground URL or assert a captured course playhead.

This milestone unlocks truthful metadata composition only. It does not establish freshness, continuous coverage, correct orientation rendering, live producer permission, real provider receipt, cross-device/audio alignment, selection geometry or either §7.1 core gate.
