# Mac live-session review correction

Scope: configured lead's existing P0-03/11 → P1-02 continuation, MAC-LIVE-01/02.
Candidate `3147291f449105c06255cfc0ea2056f1b2582437` was held; this correction keeps it and
all original captures, editable ink, selections, response records and historical evidence.
Review/probe baseline: `c9177096c99c2562e4474bcbb2f4ffc8beb43c18`, read without merging or
resetting the worktree. Released `lc-subscription-live/1` and v0.1.0 contracts are unchanged.
Writes remain inside `apps/macos/CompanionDesktop` and platform verification evidence.

MAC-LIVE-01: queued app statuses now trigger a fresh actor read. Command epochs and monotonic
refresh tickets fence continuations across awaits. A shared, revocable first-display permit
binds the request/session/capture, source verdict, command generation and expiry. Stop, Cancel,
replacement, restart and capture end revoke authority synchronously before actor tasks run.
Panel rendering and first-display admission use the same gate locks; display receipts record
the actual first-visible time. A receipt delayed after a legitimate display remains historical;
a first receipt arriving after revocation cannot grant display. The final used-up answer remains
displayable while its underlying authorized session still runs. A hidden panel creates no receipt.

MAC-LIVE-02: `Freshness.judge` is reused at current-input and dispatch time. Every active callback
and the existing ticker reconcile source availability. Blank/suspended/missing-image callbacks,
missing or invalid source time, silence, stale source time and mismatched retained sequences
refuse current pixels. Pinned earlier selections remain explicit historical input. Source loss
fences pending current renders and writer steps, and records frame-less local status metadata
with the notice time. Healthy idle recovery can reuse retained pixels in the same session;
unchanged already-observed images clear the obsolete loss line without another submission.
Recovery never reopens a closed Stop gate. Old queued Start generations are refused without
declaring a loss in their replacement session.

The existing writer now rechecks source admission at each nonblocking step and holds the actual
active session/capture gates through that step, including its final newline. Source checks run
before gate locks to avoid a capture-queue lock inversion. Zero-byte refusal remains cancellation
even if the source recovers before bookkeeping; partial-line refusal still abandons the line and
ends that child. Defaults preserve the earlier ASK writer behavior.

No new dependency, wire field, manager, provider, audio integration or permission was added.
The separate NativeSpeech/native-voice integration decision remains pending. The root fixture CI
patch remains lead-owned.

## Executed checks

| Check | Actual result |
| --- | --- |
| Focused library replay | **40/40 pass, zero failures**: unchanged lead counterexample 1, new presentation 11/source-dispatch 8/freshness 8, existing focused controls 12. [Log](focused-final-tests.txt), [selection/results](focused-results.json) |
| Actual extracted LiveController with publication tracing | **8/8 pass, zero failures**: delayed Stop/Cancel/capture-end/replacement/restart negatives; legitimate historical, hidden→visible and final-used-up positives. [Report](controller-replay.md), [log](controller-final-tests.txt) |
| Existing local child/held-pipe/partial-line control, exact-command approved | **1/1 pass, zero failures**, 14.928 s. [Log](focused-realchild-tests.txt). The child is a temporary synthetic connector; no account/model is called |
| Library separate-module emit and controller public-interface typecheck | Exit 0; four changed app sources also parse. [Report](interface-report.md), [module log](interface-module.txt), [app log](interface-app.txt) |
| Existing synthetic fixture producer | **1/1 pass, zero failures**. [Log](interface-fixture.txt) |
| Fixture against unchanged released inputs | **211 checks pass**, 10 lines/6 turns. Thirteen loaded shared inputs match assigned `c917`; the native adapter separately matches worker `3147291`. [Validator log](interface-validator.txt) |

The native package now declares **151** tests; its complete suite was not run in this correction.
The earlier candidate's 118/124 result remains a failed historical run. No broad mutation campaign
was restarted. Reverse ordering of same-command refresh continuations is source-reviewed through
the monotonic ticket; that adversarial ordering was not forced by a new production hook.

Failed intermediate evidence remains: an emission error executed zero tests; a restricted
41-method replay had 12 failed assertions across four methods (three lacked actual-shown history
preconditions, and the local child hit restricted CFSocket creation); the initial separate child
entrypoint had the wrong Swift basename and executed zero tests. Three existing retention controls
now call `answerShown` before asserting visible-history retention, preserving their earlier
unconfirmed-history assertion and all behavioral assertions. Exact snapshots and raw logs record
these failures; none is relabeled a pass. The standalone fixture provenance wrapper also preserves
two ordinary inspection errors before its corrected proof/validator passed.

Reproduce the focused source check with the retained toolchain:

```sh
E=docs/verification/platform/macos-subscription-live/correction-01
python3 "$E/focused-prepare.py"
bash "$E/focused-replay.sh" typecheck
bash "$E/focused-replay.sh" run
```

The separate `realchild` mode needs the normal exact-command approval in this restricted workspace;
it changes no sandbox settings. Controller/module/fixture entrypoints are in their linked reports.
[Final source binding](source-sha256.json) includes 57 owned files, nine unchanged released inputs
and eight matching original/English hashes. [Overall results](verification-results.json) and
`SHA256SUMS` bind the retained checks; independent reviews preserve their initial finding snapshots
and final narrow dispositions. Final harness source comparisons show no production-source drift.

All replay checks here use Linux Apple/UI stand-ins and synthetic connector answers. They do not
establish a macOS build, ScreenCaptureKit permission/callback behavior, interactive panel behavior,
real ChatGPT delivery, speech, device acceptance or either desktop full-product gate.

Native next owner: lead integrates the correction with its prepared fixture CI patch, runs the
hosted macOS build/full native test suite, then arranges actual capture/selection/Stop/recovery
evidence. No original-frame, ink, model, speech or device acceptance is inferred from source replay.
