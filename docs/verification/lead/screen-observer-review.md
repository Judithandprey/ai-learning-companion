# ScreenObserver bounded source review

Disposition: **HOLD for two local corrections** in CaptureSession.swift. The
native owner can repair them while Support prepares the existing build route.
No new capture framework, full pixel converter or device access is needed to
establish these code defects.

Reviewed exact delta `ae1f20b7bf90cc52d2243942f5713e074ab3a5b3..a6f2ae7575b0f0f294bc2a40aa952933069f43fd`
(12 files), covering original delivery `46ee9c59ef48ffd2dd62e5983ce0fe1414c5d531`
and correction `a6f2ae7`. Main at review entry was `e410f7ad68497a2afa2046a985cac9849a4a9beb`;
the unrelated dirty Safari test was preserved. No branch merge or source edits.

## SO1 — Retention/attempt accounting does not enforce the declared bounds

`BroadcastUpload/CaptureSession.swift:117–165`: the only pre-encode storage guard
checks `status.bytesKept >= byteCap`. The encoded PNG's size is added afterward.
With bytesKept = cap - 1, a 1 MiB successful PNG is retained and exceeds the
declared 512 MiB frame ceiling by 1,048,575 bytes.

More consequentially, the encoder writes directly to the final sequence filename.
If encoding or the subsequent read-back/digest fails, catch records a gap but
does not account for or reconcile any partial/complete file at that path.
bytesKept and lastKeptTime remain unchanged. Subsequent changed buffers can repeat
encoding at callback frequency, leaving additional unaccounted files and bypassing
the successful-keyframe interval as an encode-attempt bound. This can worsen a
storage/I/O failure and defeat the stated bounded retention behavior.

Minimum repair: rate-limit encode attempts independently of successful retention;
write a uniquely staged candidate, measure/hash it, enforce remaining frame budget
before publishing it as a kept original, and explicitly reconcile failed candidates.
Temporary/failed candidates must not silently accumulate outside accounting. If
they are retained for recovery, track them as bounded pending/failed content; if
discarded, discard only the new unpublished candidate and record the gap. Never
delete or overwrite an already retained original. Stop/defer with an explicit gap
when no whole frame fits. State any bounded temporary-file allowance truthfully.

## SO2 — Heuristic pixel reads assume layouts without checking them

`BroadcastUpload/CaptureSession.swift:209–229`: every planar buffer is sampled as
one byte per luma pixel; every nonplanar buffer as four bytes per pixel/channel 1.
No pixel-format check, successful-lock check or row/address bound proves this
layout. CoreVideo buffers can have other valid layouts. A 16×16 packed two-byte
layout with rowBytes 32 yields sample offset 541 for a 512-byte buffer using the
current arithmetic. For 10-bit planar layouts the byte locations are also not
the claimed one-byte luma samples. Thus this is more than heuristic imprecision:
unsupported layouts can cause invalid memory reads or wrong skip decisions.

Minimum repair: read only explicitly supported/validated layouts after a successful
lock, checking dimensions, row stride and sample address bounds. For any unsupported
layout return the existing conservative empty/unreadable grid so it cannot justify
a heuristic skip; Core Image can still attempt encoding under the repaired attempt
and storage limits. No new general-purpose pixel conversion is requested.

## Other conclusions and evidence limits

- App/extension synchronized source groups, Shared membership, target dependency,
  embed phase, extension principal class, sample-buffer mode, entitlements and
  bundle-ID relationships are internally consistent on source inspection.
  Three XML plist files parse; project object IDs are unique and every referenced
  object ID is defined. These checks are not Xcode compilation.
- Sequence/PTS, host time, orientation, original PNG hash/length and source-app
  unknown labels are retained. Skipped heuristic/interval/cap/no-image runs and
  event-write failure counts are explicit; stale status never claims a live view.
  Abrupt termination remains unobserved/unknown, as documented. A saved status is
  not an attestation of complete frame history or provider receipt.
- No network/client secrets/provider access appears in the new code. The user
  must invoke the system picker. App Group and signing are named dependencies;
  backup inclusion is disclosed. Source remains a capture-only dependency, not
  either complete §7.1 gate or a cross-app pen/selector.
- Native-resolution Core Image PNG encoding's actual extension peak memory and
  ReplayKit behavior remain unmeasured. The reported ~50 MB device constraint is
  a required later measurement, not a locally reproduced OOM or a compile verdict.

Read complete new Swift/project/plist files and the delivery evidence. Applied
current workflow/PONYTAIL LITE and the already reviewed source/English §7.1.
Only small stdlib static checks and the explicit cap/address arithmetic above
were executed via read-only `git show`; no Simulator campaign, platform research,
network, DB, provider, hosted run or device call. No production source was changed.

After the two repairs, review their focused boundary regressions and proceed to
actual hosted compile; then measure signed target capture/memory and lifecycle.

## Correction delta — 8f7e5df17b99fa932fd6062d20a4292c7bd86f3f

**2026-09-29 disposition: APPROVE the SO1/SO2 source corrections for integration
and the next actual macOS/iOS compilation.** The historical findings above remain
the assessment of `a6f2ae7`; no remaining definite blocker was found in this bounded
correction review. This is static approval, not a native check or device pass.

Reviewed only `a6f2ae7..8f7e5df`: complete new `BroadcastUpload/FrameStore.swift`,
`BroadcastUpload/LumaGrid.swift`, the `CaptureSession.swift` delta, the two small
status changes, `apps/ios/checks/ScreenObserverCheck/main.swift` and updated evidence.

- **SO1 addressed:** each attempt gets a unique staging filename; actual on-disk
  size and SHA are obtained before a remaining-budget comparison and publication.
  Publication uses `moveItem`, which refuses an existing destination. The counter
  advances only on publication. Failed/oversize candidates alone are removed;
  cleanup failure records a stop reason and prevents further attempts. Existing
  kept originals are neither deleted nor overwritten. The caller updates its
  attempt timestamp before calling the encoder, including failing attempts, and
  stops retention at the first candidate that does not fit. The separate one-frame
  temporary allowance and stop state are documented rather than hidden in kept
  byte accounting.
- **SO2 addressed:** only 8-bit bi-planar `420v`/`420f` luma and packed BGRA green
  are sampled. Unsupported formats return an empty grid before memory reads;
  empty grids cannot justify a heuristic skip. Supported reads require successful
  locking, expected plane layout, nonzero dimensions and sufficient row stride;
  packed reads additionally verify the total data size. Thus the original packed
  two-byte and 10-bit misreads are removed without adding a converter.
- **Native check source is appropriate:** real buffer/sample-position checks,
  empty-grid behavior, PNG hash/size, one-byte-over/exact-fit/full-store cases,
  no-overwrite and failed-encode cleanup are tested with nonzero exit on failures.
  `2vuy`/`x420` buffer-creation failures explicitly print SKIP, so retain per-case
  output and do not describe an aggregate zero exit as execution of a skipped
  format case. Attempt throttling and cleanup-failure stopping remain static-only
  coverage, correctly identified in the owner's evidence. No claim that those
  branches were executed is made here.

Read-only commands: `git show --stat 8f7e5df`, `git diff a6f2ae7 8f7e5df -- <affected
paths>` and `git show 8f7e5df:<new helper/check paths>`. No production changes,
platform research, native run or repeated campaign. Next evidence is Support's
actual build plus this macOS executable's recorded output; signed ReplayKit
capture, full-size extension memory and lifecycle remain separate device checks.
