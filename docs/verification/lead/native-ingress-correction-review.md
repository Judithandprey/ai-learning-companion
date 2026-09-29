# Native original upload correction — HOLD

Candidate: `cb27688bd04ce31f1f2dce937c855377c657a7d1`, parent `7de89a67bd6f2d06e8cf12b38bc58f1fe44729ae`. Baseline inspected: `fc1644395590634e2d732a304548c898efc545cc`. Read both prior lead HOLD reports, the complete fixed `OriginalUpload.swift`, check delta and affected harness flow, and candidate platform evidence. This is the assigned correction review, not a new transport or platform review.

**HOLD for one remaining NI1/NI2 durable-initialization gap before the planned hosted compilation/check/build.** The original four concrete failure paths are corrected in source, but deleted queue state can still be recreated by an already-open second uploader that never observed the file. No Swift compiler is installed here; all native findings below are source traces, not executed Swift results.

## Remaining blocker: loss of the queue removes Stop/source history for a stale observer

Affected candidate path: `apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift`.

- Lines 390–392 make `stateExists` private to each uploader. Initialization at 398–409 sets it only if that instance sees the queue file.
- `withLockedState` at 662–673 regards a missing queue as empty whenever that particular instance has not seen it. The persistent lock coordinates writes but supplies no shared initialization/history witness.
- `admit` at 689–693 therefore sees neither the previous source nor Stop. Enqueue at 448–452 writes a fresh queue with the newly supplied source.

Exact sequential reproduction, using only existing check helpers:

1. `makeSession(frames: 2)` creates fresh `started` capture status. Construct A and B while no upload queue exists. B performs no further operation yet.
2. A enqueues frame 1 for S1. A calls `stop("the learner stopped sharing")`, which returns true after saving Stop. The queue and lock exist; both retained PNGs remain unchanged.
3. Remove only `original-uploads.json`. Leave the session, lock, PNGs and `status.json` intact. This is the same queue-file-loss category the new deleted-state regression already exercises.
4. B enqueues frame 2 for S2. Its first and second locked reads both follow 671–672 because B's `stateExists` is still false. Source admission succeeds; a new unstopped S2 queue is written. This loses the retained source binding, frame-1 queue entry and durable Stop.
5. Script the existing matching `commit` response and call B's `sendPending`. It reaches transport at 574. The source-derived result is one send and `.finished`, rather than a fail-closed missing-state outcome.

Liveness does not fence this sequence: `stop()` at 460–474 changes only upload state and the calling actor's `localStopReason`; it does not write capture `status.json`. That file can legitimately remain freshly `started`/`resumed` during this sequence, so 737–749 accepts it. No fabricated capture restart or stale-status override is needed. B has neither A's local Stop nor a shared durable missing-state witness. A new uploader opened after the file loss has the same problem.

The new deleted-state test at check lines 660–673 first makes **the same** uploader create the queue. The later watcher test at 845–861 deliberately makes the watcher observe an unreadable queue before deletion. Both set its latch and miss the sequence above. The owner documentation's instance-local qualification describes the limitation but does not satisfy the existing fail-closed recovery and retained Stop/source guarantees.

Minimum correction: distinguish a genuinely never-initialized queue from a lost previously initialized queue using per-session durable evidence under the existing coordination. Reject missing established state for stale and newly opened instances; preserve the surviving originals and evidence. This needs no general filesystem framework, network feature, contract change or reconstruction of missing queue contents. Add the exact stale-B regression, a reopen-after-loss variant, and a normal first-initialization positive. A reusable **unexecuted** Swift fragment is retained at `/tmp/native-ingress-missing-state-regression.swift`.

## Corrections that are sound by source inspection

- NI1 original malformed-state overwrite: every operative read now reloads under the file lock; decode failure preserves bytes. The latch is set before decode, so an instance that observed even malformed state cannot later treat its disappearance as new.
- NI2 original stale whole-snapshot overwrite: each mutation operates on fresh locked state, retaining other queue items/source/Stop. Pending-only updates preserve another uploader's committed receipt. The attempt and Stop transitions use the same lock; already admitted in-flight requests may finish, with subsequent attempts fenced. No separate new dispatch protocol is requested in this review.
- NI3: every `stop` call attempts the locked durable transition; false persists across write failures, while the immediate local fence remains. Success is returned only after that operation succeeds. New permission-failure/recovery tests exercise this distinction.
- NI4: error domains map to fixed allowlisted categories; arbitrary text is not saved. Matching receipts are regenerated canonically from the checked binding before persistence, eliminating hidden raw-response/token retention. Existing raw JSON duplicate-member parsing limits are not promoted into a new wire requirement.

## Host-check readiness and actual evidence

Read the full three-file candidate delta, source lines 1–784, focused check additions and their existing helpers/final runner, and owner evidence. The tests include stale-source/queue/receipt cases, local/durable Stop, repeated write failure, receipt-save failure, cancellation, raw-token error and receipt cases. Failures increment the shared count and terminate nonzero; unexpected thrown errors fail the run. The new write-failure tests rely on a non-root macOS process respecting file/directory permissions. No definite Swift compile error was found by reading; compilation remains unproven.

Commands used (read-only):

```sh
git rev-parse HEAD cb27688 cb27688^
git diff --stat 7de89a6 cb27688
git diff 7de89a6 cb27688 -- apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift apps/ios/checks/CaptureIngressCheck/main.swift docs/verification/platform/capture-ingress-originals.md
git show cb27688:apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift
git show cb27688:apps/ios/checks/CaptureIngressCheck/main.swift
git show cb27688:docs/verification/platform/capture-ingress-originals.md
command -v swiftc
git status --short
```

`command -v swiftc` produced no path. No native tests, Python-simulated substitutes, hosted jobs, network, DB, device or provider operations were executed. Only the report and regression fragment were written under `/tmp`; main and worker files were untouched. Lead's dirty workflow was preserved. Once this single source gap is corrected, the next evidence step remains the already planned native check, Python validation of its actual emitted fixtures, and both unsigned SDK builds.
