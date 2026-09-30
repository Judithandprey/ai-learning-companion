# macOS raw/composed core review

**APPROVE for the bounded source increment**, subject to the Lead's hosted compilation/tests and the separate AppKit/filter/rendering review. No concrete blocking defect found in the reviewed core call paths. This is not a Swift test pass, actual Mac operation, AI delivery, or §7.1/A44 acceptance.

Candidate: `1539a7cb50935cc9eebc6c778595995baf7157ee`.
Parent: `3355763b006614c3d898299e1b2e10eb648ad84f`.
Exact source export: `/tmp/lc-macos-composed-1539a7c`.

PONYTAIL LITE applied: trace the existing recorder, ink history and storage directly; no extra abstraction, package, production patch, or simulated replacement for Swift. Refreshed workflow/role guidance and the affected original/English R35/R36/R46/R51/R52/R59, §7.1/7.2/7.4 and A26/A27/A30/A31/A44. Source/English manifest hashes match. The exact owner report was read as claims, not independent acceptance.

## Checked call paths

Paths below are relative to `apps/macos/CompanionDesktop/` in the exact export.

- **Frame time and delayed pairing.** `Sources/DesktopCapture/InkComposition.swift:110` selects validated `sourceHost`, falling back explicitly to callback admission. It selects the document span containing that time, then `InkDocument.revision(at:)` (`Ink.swift:203`), rather than the latest visible revision. Unknown source time and near-commit ambiguity are carried in `limits`. No wall-clock, source-media position or provider receipt is fabricated.
- **Close and reopen.** `Sources/CompanionDesktop/InkController.swift:132,258,408` supplies value snapshots of the active or closed document; closed spans remain available for older pixels. A reopened document starts a separate span. A time before its reopening is unknown, and `InkComposition.swift:211` does not attach a previous session/boot's commit time to a carried revision. Document identity retains its created-in session, actual original/conflict filename and display. Current-capture replacement refuses unavailable history instead of borrowing the new capture's ink.
- **Partial erase, undo and redo.** `InkComposition.swift:198` replays content operations in recorded order, subtracting removed IDs and adding new IDs, then returns strokes in original creation order. This matches `Ink.swift:389,400,549,581`: partial erase retains the original and adds derived portions; undo reverses added/removed sets; redo reapplies them. Non-content mode/selection records do not introduce a content change. Reopening limits time comparison while retaining the full content replay.
- **Raw/composed identity and writes.** `Sources/DesktopCapture/CaptureRecorder.swift:233` re-reads the named raw file through the existing hash/length retained-original policy. Nonempty ink writes to separate `composed/` using unchanged `FrameStore`; failure records a reason and does not rewrite the raw. Empty ink explicitly aliases the verified raw file/hash/length instead of charging or encoding another image. Raw and composed byte counts/caps stay separate.
- **One outcome in an orderly session.** A raw is placed in `awaitingComposition` only after successful retention (`CaptureRecorder.swift:205`). Composition consumes it once (`:235`); duplicates/late requests produce no images. Finish emits `not_composed` for each remaining sequence before `ended` (`:144`). All recorder mutation stays on the capture serial queue.
- **Pending Stop, stream error and Quit.** `CaptureRun.swift:90`, `CaptureController.swift:299,326,345` form the queue/main-actor drain: every already-admitted raw report precedes the main continuation; those reports enqueue composition before finish. Closing the gate blocks subsequent raw admission. Quit's synchronous queue finish marks pending frames `session_ended_before_composition`, without waiting for main-thread pairing or creating a main/queue synchronous cycle. Existing unsaved-ink retention is still used at close/Quit; no original is discarded by the composition code.
- **Compatibility and honest scope.** `FrameStore.swift` is byte-identical to the parent. Non-composing recorder defaults preserve old raw-only behavior; the new Codable members are optional. `DesktopIngress.swift:630` explicitly refuses app-excluded scope on released 0.2.7/0.2.8 image mappings. Composed metadata grants no structured input, provider, or acquisition authority. ASK still labels its callback-time revision separately from composed pixel-time metadata.

## Checks and evidence

Executed locally:

```sh
git show -s --format='%H %P' 1539a7cb50935cc9eebc6c778595995baf7157ee
git diff --check 3355763b006614c3d898299e1b2e10eb648ad84f 1539a7cb50935cc9eebc6c778595995baf7157ee
git diff --exit-code 3355763b006614c3d898299e1b2e10eb648ad84f 1539a7cb50935cc9eebc6c778595995baf7157ee -- apps/macos/CompanionDesktop/Sources/DesktopCapture/FrameStore.swift
```

All exit 0. A Python standard-library byte/hash check also verified all 16 changed exported files against exact Git blobs, unchanged FrameStore bytes, and all four source/English manifest pairs. Receipt: `/tmp/macos-composed-core-source-checks.json`.

Read all five added `InkCompositionTests.swift` tests, including delayed revision sequence `0,1,2,3,4,4`, partial-erase portions, undo/redo, empty raw alias, exactly-one outcome, post-finish requests, blocked composed directory/recovery, altered raw refusal, missing geometry and reopened revision time. The declared assertions match the inspected implementation. **None of those Swift tests or the advertised 42-test suite was executed here.** No Swift substitute or Python geometry implementation was counted as a product test. The new tests exercise the recorder/library; real controller queue timing and persistent I/O failures remain source-reasoned in this review.

## Retained limits and next action

- Exactly-one durable outcome assumes successful event writes and orderly termination. Event-write failure increments an incompleteness counter; truncation is best effort. A crash between keep and compose has no recovery journal, and the existing reader does not synthesize a missing-composition gap. This is acknowledged in the task/owner report, not closed by this approval.
- Uncommitted strokes are excluded; unknown source time uses a disclosed callback approximation. Application exclusion, geometry notification delay and actual display/rendering alignment still require their separate evidence. Only screen-fixed ink exists.
- Composed storage has its own cap and may consume up to another raw-cap allocation. There is no released composed transport/provider path in this increment.

**Next owner: Lead** wires and runs exact hosted Swift build/tests plus the owner validator on genuinely Swift-generated retained files, considering the separate AppKit/rendering review. Native owns any resulting code correction; QA owns later interactive Mac evidence. No repository or worker files were changed; all artifacts from this review are under `/tmp`.
