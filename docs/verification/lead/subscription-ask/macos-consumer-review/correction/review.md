# MAC-SUB-LIB-01 correction review — HOLD for Quit cleanup

Exact Native candidate: `704894f7e6e0a95c90f6a74bba68fb4394b45f9e`, including initial `a2fe30c`; reviewed from main `6dd33aad94e6426958bb2d0b83dc8f5dfb0dd159`. Only candidate export and probe files under `/tmp/mac-ask-704894f-review` were written. Production, CI, owner worktree and Git state were not changed by this reviewer. Parent's concurrent CI edits are preserved.

Applied project PONYTAIL LITE and workflow proportional review. Scope was the correction diff and actual AskRevocation → AskProcess writer → AskLink fence/settlement → application Quit call path, plus the previous macos-consumer-review blocker. Read current applicable ADR0003 cancellation/EOF rules, source/English §7.7, Stop/retention constraints and current decisions. All four original/English manifest pairs match main bytes. This review does not repeat the broad initial consumer audit.

## Confirmed remaining blocker: Quit loses ownership of a retiring connector (P2)

Candidate `apps/macos/CompanionDesktop/Sources/DesktopCapture/AskLink.swift`:

- Lines 732–735: an undelivered request records its local withdrawal and returns without `fencing` tracking.
- Lines 813–817: a revoked partial JSON line's EOF produces the connector's id:null invalid-request error, which invokes `lost`.
- Lines 884–897: `lost` moves the child into local `ending`, clears the actor's `child` at 886, publishes disconnected, then awaits `ending.end()` at 897.
- Lines 680–702: concurrent `shutdown` sees `child == nil`, no replacement and no settling fence, so it returns without joining that still-running cleanup.
- `Sources/CompanionDesktop/CompanionDesktopApp.swift:115–119` awaits `ask.shutdown()` and then permits actual application termination; remaining async kill escalation is no longer guaranteed to execute once its process exits.

Minimal deterministic schedule: hold a partial ask/start write → Cancel → EOF refusal starts delayed child end → wait for disconnected status → Quit before child end completes. Newline withdrawal succeeds, but Quit returns while the child is still running. This is an existing lost-owner pattern reached through the new partial-withdrawal path; it does not invalidate the corrected transport atomicity itself.

`harness/src/ZQuitReview.swift` is a one-test reproduction using the candidate's existing in-process FakeConnector (`heldWritesAreInPart = true`, `endDelay = 1.5`). It fails the expected `endsAtQuit == 1` assertion: Quit returned in 0.000051856 seconds with `connector.ends == 0`. Keeping the test host alive lets the scheduled cleanup complete; the test waits for that before returning. It therefore distinguishes premature Quit completion from failure to ever schedule cleanup.

Minimal correction: retain the retiring child or its cleanup task until end completes, and have shutdown join all cleanup it still owns. If explicit Connect can start a new child before the previous end finishes, retain both ownerships or prevent the overlap; do not overwrite the only retained retiring reference. Keep the current no-resubmission/no-automatic-replacement and delivered/unknown classification. Add the Cancel → partial refusal → disconnected → immediate Quit regression.

## Real process reproduction of the same Quit gap

`harness/src/ZRealQuitReview.swift` runs the unmodified candidate `ProcessAskLauncher` + `AskLink` against one synthetic local Python child. It first returns a signed-in synthetic connection, holds its reader while a roughly 1MiB selection is sent, then reads after Cancel/EOF. It records exactly 65,536 bytes with no final newline, emits the same id:null invalid-request shape, ignores SIGTERM, and self-exits after six seconds if not killed earlier. The test sets the launcher's existing endGrace to 0.2s to keep this one cleanup experiment short.

Actual `real-quit-probe.txt` result: **FAIL**, 1 test/1 assertion failure in 3.103 seconds. `shutdown()` returned in **0.000049710 seconds while `kill(ownedPID, 0) == 0`**. Keeping the Swift test host alive allowed its previously scheduled production cleanup to kill/reap that child **2.159864 seconds later**, and the test verified the exact PID no longer existed before ending. The incomplete image never became actionable; this failure specifically proves Quit returns before required owned-child cleanup. No orphan child was left by the probe.

Re-run that one probe with:

```sh
cp /tmp/mac-ask-704894f-review/harness/main.real-quit.swift /tmp/mac-ask-704894f-review/harness/src/main.swift
bash /tmp/mac-ask-704894f-review/harness/run.sh
```

## Focused verification

`focused-tests-unrestricted.txt`: six executed tests, five existing tests passed and the new expected-to-pass Quit regression failed (24.809 seconds total).

Existing passing tests:

1. `testAskCancelNewSelectionAndStopSuppressLaterAnswers`
2. `testAskLateAnswersCloseAndQuitWithAQuestionOnItsWay`
3. `testAskTakesBackARequestThatHasNotReachedTheConnector`
4. `testAskConnectorLossAndTimeoutAreUnknownAndNeverRetried`
5. `testAskRealChildNeverGetsARequestTakenBackInThePipe` (15.277 seconds; real local pipes/processes, synthetic shell connector)

The final-newline write and delivered flag are protected by the same lock as revoke (AskChild 116–141,344–348). A revoked queued line leaves the pipe intact; a revoked partial line sets cutOff on the sole writer queue before any following message can execute (294–317). End sets inputClosed before queueing the descriptor close, so writeAll's 100ms polls relinquish blocked writes instead of waiting the full send timeout. Undelivered requests get no ask/cancel and false delivered/uncertain; completed lines retain downstream cancellation with truthful unknown when not confirmed. No request retry or automatic connector replacement was found in the changed path.

`git diff 704894f^ 704894f --check` passes. The first sandbox run passed four nonprocess focused tests; Foundation Process could not create its local CFSocket socketpair, so the run was interrupted (exit130) and preserved as `focused-tests.txt`. The exact local checks received normal approval for execution outside that restriction; no remote/account/device access was used. An existing test closure produces one Sendable warning.

## Reproduction and limits

`harness/src` contains the exact candidate's DesktopCapture and test files after the existing Linux-harness import substitutions (Darwin/Apple imports removed; FoundationNetworking/Glibc added; Linux-inapplicable waitsForConnectivity assignment commented). `source-provenance.json` records unmodified candidate file hashes and the reused AppleShim hash. The Apple shim does not rasterize like ImageIO and this is not a macOS build.

With the existing cached Swift toolchain at `/tmp/lc-review-0212`, run:

```sh
cp /tmp/mac-ask-704894f-review/harness/main.focused.swift /tmp/mac-ask-704894f-review/harness/src/main.swift
bash /tmp/mac-ask-704894f-review/harness/run.sh
```

All process stand-ins are test-owned and bounded; no pkill, account login, Codex, network/provider, native GUI or device operation was used. The full 73-mutation campaign and unrelated suites were not repeated. Real macOS compile/XCTest, App target, ImageIO PNG validation and interactive device acceptance remain separate. Parent owns CI fixture integration and the subsequent exact-source hosted run after correction approval.
