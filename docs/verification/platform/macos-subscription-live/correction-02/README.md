# Mac anchored answer after healthy frame advancement

MAC-LIVE-03 continues the configured lead's existing P0-03/11 → P1-02/ADR0004 assignment.
Read-only review baseline: `8467e0a55113455f62067d97a8774dca889c3d88`. Native predecessor
`4f6c327018d46604b21c57ab4ebf2b0e45278f70` and its parent `3147291` remain preserved;
both were held for this regression. No baseline merge/reset, mobile campaign, root CI,
contract, dependency, account/display/audio operation or native voice import is involved.

Affected full source/English requirements: main §7.1/7.2, R52/A31, AUDIO-14 and
V-SourceTimeRelations. A selected/asked frame remains immutable while scrolling/video proceeds.
Healthy newer pixels change what may be sent as current; they do not themselves withdraw
permission to answer a fully submitted request about its earlier anchored frame. Actual source
loss, Stop/cancel/replacement/restart/capture end/command changes and expiry still fence first
display. Already-legitimate display remains historical, with its original receipt time.

The defect reused the strict sequence-bound input check for first display. `Freshness` now
classifies a healthy advance only when its existing verdict is live, the newest new pixels are
also retained, and the requested positive sequence is strictly older. That classification still
refuses current-frame rendering/writing. A dynamic presentation wrapper excludes that one reason
from actual source-loss authority; blank/suspended/missing-image, source-time/silence/stale,
unretained newest pixels and stopped gates remain refusals. The existing String-returning local
callback signature is preserved, including the unchanged lead probe. This local classification
is never a public wire field or a reassignment of pixels, source, focus or ink.

`LiveLink` also keeps a refused old queued input from declaring global source loss in a healthy
capture. After a preparing old observation loses current eligibility, it releases its reservation
and pumps any already-waiting newer frame. No new callback is required to unblock that frame.
The writer's sequence-bound per-step admission and permanent gate locking remain unchanged.
Only three production library files change; no new source manager, store or state is added.

Five new native test declarations cover old-input refusal without revoking an anchored answer,
new-frame queue progress after a stalled render, old-current-line refusal in a held writer,
genuinely unretained new pixels, and permanent unshown-answer revocation after real loss/recovery.
Original response/ink bytes and frame attribution are explicitly checked. The package now
declares 156 tests; this is not a full-suite result.

Final focused result: **42/42 methods, zero failures/unexpected failures, all three runs exit 0**.
The unchanged lead paired probe passes 1/1; the actual-controller response-receipt → queued
first-display pair passes 1/1; 35 existing lifecycle/presentation/source/freshness controls plus
the five new regressions pass 40/40. Both pairs permit the healthy advance and reject blank
source loss while retaining frame N and its original answer/ink attribution. Separate module
emission from all 29 library files and actual LiveController public-interface typechecking
both exit 0. The independent source review found no blocking issue.

- [Focused logs, exact-source manifests and replay](frame-answer/README.md)
- [Separate module/public-interface evidence and reproduction](interface/interface-report.md)
- [Independent source review](review.md)
- [Owned-source and unchanged released-input binding](source-sha256.json)
- [Final evidence/source verification](verification-summary.json) and [checksums](SHA256SUMS)

The lead's recorded failed paired probe is preserved unchanged alongside the corrected replay.
All prior correction-01 evidence remains unchanged. The final source patch includes the new
test file; all replay manifests, compiler inputs and reviewed hashes match the delivered bytes.
The source/English manifest matches all eight files; all nine released read-only inputs match
the exact lead baseline. The containing commit identifies this source snapshot; its parent is
`4f6c327`. `bind-source.py` refreshes and verifies the binding without executing tests.

The replay needs the already retained Swift 6.3.3 Linux toolchain/sysroot; no script installs
tools or calls a provider. For the three exact method selections, substitute the containing
delivery commit for `DELIVERY_COMMIT`:

```sh
E=docs/verification/platform/macos-subscription-live/correction-02/frame-answer
python3 "$E/replay.py" "$PWD" --source-ref DELIVERY_COMMIT --run paired
python3 "$E/replay.py" "$PWD" --source-ref DELIVERY_COMMIT --run controller
python3 "$E/replay.py" "$PWD" --source-ref DELIVERY_COMMIT --run controls \
  --extra DesktopCaptureTests.testHealthyAdvanceRefusesOldCurrentInputWithoutRevokingItsSubmittedAnswer \
  --extra DesktopCaptureTests.testHealthyAdvanceDuringRenderingDrainsTheNewestWaitingFrame \
  --extra DesktopCaptureTests.testHealthyAdvanceBeforeWriterCompletionStillRefusesTheOldCurrentLine \
  --extra DesktopCaptureTests.testNewestUnretainedPixelsStillBlockFirstDisplayOfAnEarlierAnswer \
  --extra DesktopCaptureTests.testSourceLossAfterHealthyAdvancePermanentlyRevokesUnshownAnswer
```

This is Linux logic/module evidence using Apple/UI stand-ins and synthetic connector answers.
The complete 156-method native suite, fixture checks and unchanged app syntax checks were not
repeated. These results do not establish native capture, actual provider reception or device
acceptance. NativeSpeech/native-voice approval remains pending.

Next owner: lead reviews this follow-up with the preserved native leaves, integrates normally,
applies its already-tested pending fixture CI patch and runs the existing exact-source macOS
build/native suite. Interactive capture, permissions, pen, actual AI, speech and complete desktop
acceptance remain separately unverified.
