# First desktop candidate review

Decision/source baseline: `afafe82684de966cae74e2cd410f925362ed427b`, preserving
Windows/macOS-first scope and all complete product gates. This is a bounded
review of the existing P0-02/03/07/11/12 deliveries, not a new task or acceptance.

## Actual deliveries

- Windows `6584ab1e47a58819aa18bcde973cf64508f8ccb7`, received in
  `handoff_b8f6bbf3ddad608b139d5cf72faf71bc` at 2026-09-30T09:57:07Z;
  ordered read `lead-windows-first-candidate-20260930-0958`.
- macOS `7efa46ab75fadf4a6a05f4071526ebd7643df6ea`, received in
  `handoff_9aca526e91bae7c5aadc4d92a5e2ef0a` at 09:57:33Z;
  ordered read `lead-macos-first-candidate-20260930-0959`.

Windows remains unintegrated/HOLD; subsequent `57dab97` repair evidence and remaining findings are in [correction review](windows-correction-review.md). Mac base and correction are now source-approved/integrated as recorded below, awaiting hosted compilation; neither has independent product acceptance. Existing source,
mobile checkpoints, user preview and databases remain unchanged. Two independent
Astra reviews cover Windows capture and ink; a third covers native Mac source.
PONYTAIL LITE applies under project overrides: reuse current modules, preserve
complete originals/lifecycle behavior and test actual failure paths.

## Windows: correction required

The candidate provides a selected-display Electron overlay, explicit mouse opt-in
alongside pen events, NAV/WRITE/ASK, partial erase/undo/redo and saved editable ink.
The author reports a 24-check isolated Windows run; this is author evidence,
not QA acceptance. Lead did not launch the native app or repeat that campaign.

Independent VM probes execute the candidate's actual handlers with injected
asynchronous capture and filesystem boundaries. Lead repeated these probes and
observed the same results:

| Finding | Exact observed failure / required correction |
| --- | --- |
| W-C1, P1: pending Start | Stop during awaited display enumeration permits later startup. Two concurrent starts both succeed and orphan the first overlay. Reserve and cancel pending startup before awaiting. |
| W-C2, P1: late media grant | Post-Stop enumeration still grants video. A separately pending renderer media promise resolves after Stop: `trackStops=0`, `videoPlayCalls=1`. Recheck authority and dispose late streams. |
| W-C3, P2: enumeration error | Injected enumeration rejection never calls the denial callback; capture stays `used`, current session alive. Settle the request and terminate cleanly. |
| W-I1, P1: save failure | Persistent injected EIO followed by Stop or close destroys the only renderer with newest ink; zero files remain, close also quits. Stop capture immediately while keeping reachable retry/export recovery unless explicitly discarded. |
| W-I2, P2: starting context | A stroke beginning over frame 1 and ending over frame 2 retains only frame 2 evidence. Pin starting context and separate material changes. |
| W-I3: source retention gap | Saved evidence is only a 16×16 luminance fingerprint; original frame/crop is lost on reopen. This does not satisfy R46/R59/§7.4's original-context retention. Preserve actual obtainable pixels/provenance with editable ink. |
| W-I4: composition uncertainty | `compose()` renders changed/unknown/content-following strokes solid although the overlay marks them dashed. Preserve uncertainty in ASK/composed pixels and metadata. |

The retained reproductions are [capture](windows-capture-review.cjs),
[capture output](windows-capture-review-results.jsonl) and
[ink](windows-ink-review.mjs). They characterize the **exact original candidate**,
including expected broken behavior; they are not a generic passing regression
suite or physical-device proof. Set `LC_WINDOWS_REVIEW_ROOT` to a read-only
extraction of `6584ab1` and run with pinned Node 24.21.0. Future fixes require
appropriate success assertions; do not change these original observations.

Lead's focused local checks: TypeScript `--noEmit` passed, and 23 named desktop
shared + unchanged Safari ink/mode tests passed with `--test-isolation=none`.
The default Node runner reported one file wrapper, not seven named cases; the
explicit in-process run resolves that reporting ambiguity. These do not cover
the reproduced lifecycle/filesystem failures.

ONE same-owner correction is accepted as
`handoff_31018a36dff867ad4a456f1db2d02465`, replying to the actual delivery.
Initial receipt was unread, `execution_started:false`. Actual reply
`handoff_d97e1fa8e1ae3e14cfba996a77a11ea2` at10:07:34Z confirms full clause/probe
reads and correction start on6584ab1, including late-stream disposal, recoverable
ink and actual PNG source contexts. This establishes start, not repair completion. Scope stays `apps/windows/**` and Web verification. QA retains its
already assigned one conditional changed-workflow pass, awaiting corrected exact
source and a runnable integrated build. No duplicate QA campaign was sent.

## macOS: correction required, source uncompiled

The candidate has a SwiftUI/AppKit display chooser and ScreenCaptureKit stream,
local lossless PNGs plus status/events, explicit permission handling and a live
claim gate. Its 15 Swift tests have **not run**; Linux source inspection cannot
establish compilation, permission UI or actual capture.

- M-C1, P2: Stop requires an active run, allocated only after asynchronous display
  enumeration. Initial pending Start is not cancellable; invalidate late results.
- M-C2, P2: freshness follows callback-processing time on the queue also doing PNG
  encoding. An older queued sample can restore Live at processing time. This is
  a source-derived interleaving, not an executed native failure. Separate callback
  responsiveness from pixel age; preserve unknown age when clocks cannot bind it.
- M-C3: the report's “no PNG writes after Stop” promise is stronger than code.
  A pre-Stop-admitted frame can finish publication later. Preserve that original
  and state admission, publication and live-claim boundaries accurately.

Shell syntax, plist parsing and the byte-identical reused FrameStore were checked.
ONE same-owner correction is accepted as
`handoff_79ab0bc8a55a49700ddc28641d201833`; initial receipt was unread/not started.
Its scope stays native Mac source/tests/evidence, with no mobile campaign.

## Build, integration and next ownership

Support received `handoff_f36e64d44c317fe7ed4d76ed8b330b7b` for the existing
build preparation: adapt the now-delivered `package-app.sh`/Info.plist `.app`
contract, retain Swift-produced status/events/PNG fixture output, preserve isolated
committed-source packaging and all provenance failures. Only delegated root
script/workflow and Support probes/evidence may change; application fixes remain
with their owners. Actual delivery `61c3cadc1c8163a5befc47a3ace91e9a2289290f` arrived in
`handoff_4ed6d19e29cdebf6b331eefc93b1ed85` at10:08:21Z; ordered read
`lead-macos-packaging-start-20260930-1010`. The adaptation is independently approved and integrated as `cc1d26f`;18 main
orchestration checks plus six independent probes pass with stub native tools.
[Integration evidence](desktop-build-review.md#actual-mac-owner-interface-adopted).

Lead continues the explicit desktop metadata/compatibility boundary while these
corrections run. Current Windows RGBA pixel hashes are not PNG file-byte hashes;
current Mac callback/display/PTS clocks and raw geometry are not ReplayKit
orientation or course time. Do not silently feed either into incompatible legacy
fields. Backend runtime and Learning window work already integrated remain valid.

Next: review exact corrections and Support adaptation, integrate focused-tested
source, execute the coherent hosted build, then activate existing Windows QA with
an exact revision. Real interactive Mac access, supported physical pen behavior,
audio, provider receipt/grounded responses, both anchoring modes and full product
acceptance remain open. No signing, paid provider activation, preview/service
restart, account or permission changes occurred.

The next independent shared implementation is the [bounded desktop metadata
profile](desktop-frame-next-scope.md), explicitly delegated to Backend. It does
not duplicate platform fixes or widen the old raw transport.

Metadata implementation was sent at exact published `b2999ed0ebd4dadf55d71e93e70f84b8e7015cd7`
as `handoff_cc16ae7b920e11b8cc912ba9c3f8ed7a`, initially unread/not started.
Windows has an actual start reply; no Mac correction completion or metadata
implementation is inferred from delivery receipts.

## Mac correction reviewed and integrated

Actual delivery8a0b33a0e9a96c14205fb696c8ed4c33716004ac arrived via
`handoff_25977e944fecf2403efa1cd47bf71397` at10:35:04Z, ordered read
`lead-macos-correction-20260930-1035`. Independent targeted review approves
for hosted build/test with no remaining blocking source finding:

- M-C1: Start reserves its gate before async enumeration, Stop closes it while
  pending, and late results cannot create a session or mutate a newer start.
- M-C2: callback responsiveness is separate from validated native display time;
  delayed pixels are stale and absent/future source time stays unknown.
- M-C3: admission and Stop timestamps share a lock. Already admitted originals
  may finish saving after Stop; later callbacks are refused. No stronger claim.

`KeptFrame.sourceHost` derives from already retained display ticks/seconds after
validation, not a new original. Metadata0.2.7 preserves those exact facts and
callback seconds even when the derivative is nil. Do not turn it into captureUTC.

Base+fix integrated as963d20d/a14a14e, exact app sources match8a0b33a. The only
merge conflict was the platform evidence index: retain actual earlier hosted
results and point to the preserved4cc605a mobile-spec checkpoint, without
reintroducing an obsolete uncompiled claim or starting mobile work. Shell/plist
checks pass. There are20 declared Swift tests; none counted as executed yet.

Lead added a reviewed manual workflow platform choice: defaultboth, or fixed
Windows/macOS lanes. Main-only/read-only/pinned actions and evidence retention
are unchanged. Separate platform runs no longer cancel each other. This permits
a real Mac hosted build without running the held Windows candidate. Actual
interactive Mac/permissions/capture/audio/input/provider acceptance remains open.
