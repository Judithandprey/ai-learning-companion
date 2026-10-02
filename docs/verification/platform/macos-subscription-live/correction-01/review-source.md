# MAC-LIVE-02 correction: bounded source review

2026-10-02. Parent-provided implementation base: `3147291f449105c06255cfc0ea2056f1b2582437`.
Lead finding reviewed at `c9177096c99c2562e4474bcbb2f4ffc8beb43c18`.
This review binds the uncommitted source bytes below, not a new delivery commit.
PONYTAIL LITE applied: reuse freshness, capture gates, session accounting and the
existing revocable writer; no manager, public-wire fields or dependencies added.

Scope: `LiveFrameInput.dispatchProblem`, per-attempt `AskRevocation.allowed`,
`LiveLink.take/pump/ask/send/noPicture`, source-loss history/records, and the
CaptureController/CaptureRun/Freshness half. This is source inspection only.
The reviewer ran no tests, native build/device, model/account/network or Git
operations during this review. Root owns compilation, focused replay and final
integration. Earlier four-file syntax parsing is not compilation or acceptance
of this final cross-boundary snapshot.

## Findings requiring correction or focused confirmation

1. **Final-byte admission is not atomic with gate closure.** `AskChild.swift:135`
   checks `allowed()` under the revocation lock and subsequently calls the write.
   Capture/AI gates close under their own locks. A concurrent Stop can close a
   gate after the predicate returned true but before the newline write. The
   current predicate narrows this interval but does not exclude it. The already
   available `LiveGate.whileOpen` pattern used for first presentation identifies
   the missing synchronous writer admission seam. Retain partial-line shutdown;
   never complete a line whose authority was withdrawn before admission.
2. **Same-image recovery leaves an obsolete loss line.** `LiveSession.pictureUnavailable`
   sets `missed`; the app correctly reoffers the same sequence on valid idle
   recovery. If that image was previously observed, `LiveLink.swift:742` coalesces
   it through `hasSeen` without clearing the source-loss state. A healthy screen
   can therefore remain displayed as unavailable indefinitely. Restore source
   availability without requiring a duplicate paid observation or deleting the
   recorded gap. This is distinct from asserting a new model receipt.
3. **Rapid recovery can misclassify a local refusal as transport failure.** At
   `LiveLink.swift:1179`, an auto-revoked line is fenced only if its source problem
   still exists after `send` returns. If source loss denied a zero-byte writer,
   then recovered before this check and before queued `noPicture` processing,
   `fenced` remains nil. `.notDelivered` accounting then ends the AI session as a
   connector failure. Preserve a local refusal reason even after recovery;
   distinguish zero-byte refusal from a child terminated after a partial line.
4. **Old dispatch generations can invalidate new source state.** `take` checks
   capture identity, then maps any `dispatchProblem` to `noPicture`. On an
   explicit AI restart over the same capture, an old queued input with closed
   gate G1 can arrive during G2 and fence G2's valid work as a supposed source
   loss. Reject stale AI authority without poisoning the new source state.

All four were sent directly to Root as concrete source findings. They are not
claimed reproduced tests. Review disposition for these bytes: correction pending.

## Preserved behavior and bounded seams

- `currentFrameProblem` reuses `Freshness.judge`, rejects every non-live verdict
  and requires retained/new-pixel sequence agreement. Callback time is not
  substituted for source time. Reasons remain stable without changing ages.
- Recorder reads in `CaptureRun.currentSourceProblem` execute on its owning
  queue; the queue-specific key avoids a same-queue sync deadlock. Pinned input
  makes no current-pixel claim and requires an open capture gate. Queue sync can
  wait behind frame encoding; interactive responsiveness remains unmeasured.
- Every active callback and ticker reconciles availability. Valid idle may
  confirm old pixels; idle after blank/suspended cannot. Same-sequence recovery
  is offered; healthy idle suppresses repeated snapshots. Temporary loss does
  not close the capture gate. Explicit Stop closes the permanent AI dispatch
  gate synchronously, and old gates do not reopen.
- Current-vs-pinned classification uses the local source callback, not trigger
  alone: an unanswered pinned selection can also be a text follow-up. Original
  frame/ink/focus history is retained; old coordinates are not put on new pixels.
- `pump` rechecks session and observation invalidation after rendering. `ask`
  has a deferred reservation return until ownership transfers to `send`;
  `send` accounts one out slot and conservatively counts possible submissions.
  Source invalidation clears pending observations and fences current explicit
  requests; delivered observations may remain historical.
- Loss history has no fabricated frame sequence and explicitly calls itself
  source-status metadata. Local loss files distinguish notice time from capture
  time. Originals remain untouched. Bound history omissions remain disclosed.
- The writer checks each attempt; revoked zero-byte lines leave the pipe intact,
  while partial lines remain abandoned and terminate that child. Findings 1/3
  concern authority admission and classification around this existing behavior.

Focused final verification belongs to Root: both source-loss render paths,
delayed/partial writer, Stop between final preflight and write, quick recovery
before send bookkeeping, healthy unchanged-image recovery, old-generation input
after restart, pinned-history control, reservation/budget accounting and retained
gap notice. Native/macOS permissions, interactive capture, real AI and full
product acceptance remain separate and unverified by this report.

## Exact inspected fingerprints

Paths are relative to `apps/macos/CompanionDesktop`; SHA-256 values bind the
inspection snapshot. Later production changes require updated review evidence.

| Path | SHA-256 |
| --- | --- |
| `Sources/DesktopCapture/LiveFrame.swift` | `e98ecef0273ca29613e3dda9b834d7d71ba380f480103798876ce169eeacfa32` |
| `Sources/DesktopCapture/AskChild.swift` | `dfe67ad35c398d7c922cb276e6996463a71a35631a42930fa5081049c9d7a9cb` |
| `Sources/DesktopCapture/LiveGate.swift` | `94e937e6d7061fb53f7990be0a2451d18c791d2fd30a8d73affec52256edfaec` |
| `Sources/DesktopCapture/LiveLink.swift` | `449a07b6680f42f93d514f9207639281da17460ea1a1e23b21b92b8121f80d49` |
| `Sources/DesktopCapture/LiveSession.swift` | `30c8d8e048c4cb953b0d9645d2b31b06a53c3167e13ce88258aebe50e43b6873` |
| `Sources/DesktopCapture/LivePresentation.swift` | `945c0c57f8789d5b25aa05be95e879b84894e45978e5c0ffeccd243b726a3362` |
| `Sources/DesktopCapture/Freshness.swift` | `55db6f67fcb2925245575cc97ab5e18c0550e3feecc662375ba585c8aa071edc` |
| `Sources/CompanionDesktop/CaptureRun.swift` | `21e6f73dacfbb8fa5e1e1ddd3adfec0587d6ba2d133ae30c9ce964f83064f138` |
| `Sources/CompanionDesktop/CaptureController.swift` | `7a720eb18548a594d48d67ac32d30959f070db832e1cdc0b1667dcf5a2ab42de` |
| `Sources/CompanionDesktop/LiveController.swift` | `5e6a3e93fceb722ce94946d8263384aa872e57196829188942c73e6f2f6a0ba8` |
| `Tests/DesktopCaptureTests/LiveFreshnessTests.swift` | `f0566bfa3c934df1795e6cff128d8d6d73a4a493e7eec7c1913cdfed80921f6f` |


## Final narrow recheck — corrected bytes

The original inspection and pending disposition above apply only to its recorded
pre-fix bytes. Root corrected the four findings. This later, separately authorized
recheck inspected the final fingerprints below and ran the bounded Linux library
replay. **All four source findings are addressed for this final snapshot.** No
additional concrete defect was found in those four seams. This is not a native
macOS build, interactive UI/capture result, real-provider receipt or product
acceptance claim.

1. **Final-byte admission:** `AskRevocation.attempt` evaluates the potentially
   capture-queue-reading source predicate before acquiring gates, then holds the
   active session and capture gates through the nonblocking write and delivered
   flag. Gate closure and final-byte admission are now ordered by the same locks.
   This avoids reading the capture queue while holding its gate. Revocation still
   refuses zero-byte lines without damaging the pipe; partial-line refusals remain
   abandoned, never completed. The new
   `testPermanentGateClosureAndFinalByteAreAtomicallyOrdered` and
   `testSourceAdmissionRechecksFinalByteAndPermanentSessionStop` passed. This
   atomic ordering covers permanent gate closure; temporary source freshness is
   re-evaluated on every attempt, before gate admission.
2. **Healthy unchanged-frame recovery:** the `hasSeen` coalescing path returns its
   reservation and clears `session.missed` before publishing. It preserves the
   source-loss history and recorded gap without requiring another submission or
   inventing a new model receipt.
   `testSameFrameRecoveryClearsSourceLossWithoutAnotherSubmission` passed; its
   simulated clock advances beyond the observation interval. Recorder controls
   separately passed healthy idle, callback-silence recovery, blank/suspended/
   missing-image recovery and source-time refusals.
3. **Recovered local refusal:** every auto-revoked line is fenced after the writer
   returns, even when the source has already recovered. A stable local fallback
   reason prevents the zero-byte `.notDelivered` path from becoming a transport
   failure; source `noPicture` is called only for an actual remaining source
   problem. `testRecoveredSourceRefusalDoesNotBecomeTransportFailure` passed with
   the session on, zero outstanding reservations, no extra delivered line and a
   cancelled/undelivered local record. Delayed-current-follow-up and rendering
   source-loss controls also passed.
4. **Dispatch generation:** `dispatchAuthorityMatches` enforces the active
   session's permanent gate independently, checks an input's gate and rejects a
   differing supplied identity before source-loss handling. `send` retains the
   actual active gate for writer admission, so a substituted open input gate
   cannot override Stop. Old queued input cannot poison the new generation's
   source state. `testOldOrReplacementDispatchGateCannotAuthorizeTheActiveSession`
   passed, together with capture closure before/after Start's connector await.

The app half remains consistent with those boundaries: `liveInput` checks real
host-clock freshness and retained/new-pixel sequence agreement; the dispatch
callback reads the recorder only on its owned queue. Active callbacks/ticks
reconcile loss/recovery; healthy idle suppresses a repeat offer and same-sequence
recovery can reoffer. Temporary source loss does not close capture/session gates.
Pinned historical input is identified by absence of the current-source callback,
requires open permanent capture/session authority, and makes no current-pixel
claim. Stop never restarts from a recovered callback. UI presentation uses the
same permanent gates and a nonescaping synchronous closure; a true prior-display
receipt survives revocation while unshown queued answers remain fenced.

Final focused typecheck exit: **0**. Final replay exit: **0**, **40 methods started,
40 finished, 40 passed, 0 failures**, 2.624 s XCTest runtime, no missing/extra/
duplicate methods and **0 source-hash drift**. Selection: presentation 11, source
controls 8, pure freshness 8, unchanged lead probe 1 and legacy regressions 12.
The unchanged `testLeadQueuedAnswerIsNotAcceptedAsShownAfterStop` passed. The full
legacy suite and native/paid/device/connector campaigns were not run.

Evidence: [final results](focused-results.json), [selection](focused-final-selection.json),
[exact source manifest](focused-final-source-manifest.json),
[typecheck log](focused-final-typecheck.txt), [runtime log](focused-final-tests.txt),
[generated main](focused-main.swift). The actual focused40 generator/run helper
are preserved with their execution hashes; later basename-only repair of the
separate child entrypoint is hashed separately in final results.

The earlier 41-method restricted run is retained in
[its result](focused-restricted-41-results.json),
[its raw log](focused-restricted-41-tests.txt), and its exact source/entrypoint
snapshot. It executed all 41 methods and exited 1: three legacy history assertions
required a real `link.answerShown` precondition, corrected by Root while retaining
the original retention assertions and unconfirmed-display control; the local
held-pipe method emitted `Could not create wakeup socket pair for CFSocket!!!`
and failed in the restricted environment. The subsequent separate entrypoint
initially failed before any test because its filename was not `main.swift`; that
zero-test failure is retained in
[its log](focused-realchild-entrypoint-failure.txt) and
[result](focused-realchild-entrypoint-failure.json). It was corrected to isolated
`realchild/main.swift` without production/assertion/time-budget changes. Root
owns the separately approved single-method rerun and its final result; neither
failed attempt is counted as a passing child control in the focused40 result.
The earlier Swift emission failure is also preserved separately rather than
reported as a test run.

## Final relevant fingerprints

Relative to `apps/macos/CompanionDesktop`; also saved in
[review-final-sha256.json](review-final-sha256.json). These uncommitted byte hashes
bind the final source disposition above and the focused replay snapshot; they are
not a commit or native verification receipt.

| Path | SHA-256 |
| --- | --- |
| `Sources/DesktopCapture/AskChild.swift` | `860fe9d6a19fe7d7c5baf4235ce08a99453fd44cc4e8938ed1b1c94c6241c1bf` |
| `Sources/DesktopCapture/LiveGate.swift` | `94e937e6d7061fb53f7990be0a2451d18c791d2fd30a8d73affec52256edfaec` |
| `Sources/DesktopCapture/LiveFrame.swift` | `e98ecef0273ca29613e3dda9b834d7d71ba380f480103798876ce169eeacfa32` |
| `Sources/DesktopCapture/LiveLink.swift` | `3adf120e20158e3e7e32379fca52803de45b3559e146c16b3153c2df438f868d` |
| `Sources/DesktopCapture/LiveSession.swift` | `30c8d8e048c4cb953b0d9645d2b31b06a53c3167e13ce88258aebe50e43b6873` |
| `Sources/DesktopCapture/LivePresentation.swift` | `e64d2a0ecc444e52619eaef8c3c04b47f478d12f9a7101cca6405a679de4383c` |
| `Sources/DesktopCapture/Freshness.swift` | `55db6f67fcb2925245575cc97ab5e18c0550e3feecc662375ba585c8aa071edc` |
| `Sources/CompanionDesktop/CaptureRun.swift` | `21e6f73dacfbb8fa5e1e1ddd3adfec0587d6ba2d133ae30c9ce964f83064f138` |
| `Sources/CompanionDesktop/CaptureController.swift` | `7a720eb18548a594d48d67ac32d30959f070db832e1cdc0b1667dcf5a2ab42de` |
| `Sources/CompanionDesktop/LiveController.swift` | `4b6f619454aeac3201428d06f8c5bcebb6e302ea0940e8bc32a0be594f1b2021` |
| `Tests/DesktopCaptureTests/LiveFreshnessTests.swift` | `f0566bfa3c934df1795e6cff128d8d6d73a4a493e7eec7c1913cdfed80921f6f` |
| `Tests/DesktopCaptureTests/LivePresentationTests.swift` | `e24fe21955082191e9e3919efc115a1fc3cf5873517873c43381fc84e12c9a22` |
| `Tests/DesktopCaptureTests/LiveSourceDispatchTests.swift` | `ee3f042e91446e2322c5d0538a586d89cf4d15e387b2f23c05cd95684bfd26d8` |
| `Tests/DesktopCaptureTests/LiveLinkTests.swift` | `0c561a554456c31e5e12482611dc24c9bde3355b52ec53997526b881562a0497` |
