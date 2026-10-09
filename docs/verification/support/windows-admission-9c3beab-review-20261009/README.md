# Windows admission consumers: bounded independent review

2026-10-09. **HOLD on final Web `9c3beab5d9bfae4ebd295af5a3db5baf99b4038c`.**
The interlock reaches the intended consumers, but a synchronously known checker
failure can still permit a connector call before the deferred Stop notification.
There is also a reproduced freshness-label error and a conditional delayed-intake
failure at the admission cache's 64-frame boundary. Web owns the corrections;
Lead retains integration and allocation.

## Assignment and exact sources

- Lead assignment: `handoff_91bcc765776fedd7445855f09561f618`, existing P0-12/P0-13
  F3 consumer review. Source update: `handoff_c39d67709daee9055c7a9d24614e97a7`.
- Initial Web: `48c20c410dc49c7805fa775013501222116cd2b3`, parent
  `dff86d972d09115b9b8a480be43e33e9d3069d1a`.
- Final Web: `9c3beab5d9bfae4ebd295af5a3db5baf99b4038c`, its direct child;
  `apps/windows` tree `5725405fe8c6bef2fbb47ed902d9ad8233ee31e8`.
  Main, overlay and preload are byte-unchanged between these Web commits.
- Lead interface and requirement baseline:
  `73488f503699d4533ad5bb5944eee2c31aead6e6`.
  Read the complete Web report, final correction, changed production source and
  complete Lead checker interface including the current overlay binding.
- Refreshed AGENTS/TEAM, Support role, workflow, actual installed Ponytail core
  (LITE; scope, necessary checks and readability preserved), current decisions,
  original/English §7.1–7.2 and R35/R36/R59, and relevant
  V-LongRunningCompanionship / V-SourceTimeRelations clauses. Compared applicable
  guidance with previously reviewed `4f7d9fa`: no requirement/guidance changes.
  All eight source/translation hashes match the manifest at the Lead baseline.
- Support remains on `team/support`; only Support evidence/probe files changed.
  Production and QA WIP were neither modified nor checked out.

All line references below mean the **final Web commit**, not this worktree's older
production files. [Source identity](source-identity.json) records hashes. Source
exports were read-only Git-object copies under `/tmp`; no package was staged.

## C1 — P1: an already-latched failure does not fence the consumer

`apps/windows/src/main/source-admission.ts:284` resolves an allow immediately.
If the same stdout chunk contains that answer twice, the second line latches
`failedWith` at lines 334–345. The notification to main is deferred with
`setImmediate` at lines 349–355. Main's `admit` at `main.ts:750–761` trusts the
resolved allow and its evidence write without consulting the now non-null
`checker.failure`; `sendAdmitted:836–851` checks capture/live/request state, which
has not yet been stopped. `sendTurn:1198–1200` then invokes `subscription.turn`.
The eventual failure notification ends the capture, but that is too late to
satisfy the preventive consumer boundary.

The [minimal probe](../../../../tests/probes/support/windows_admission_9c3beab_latched_failure.mjs)
runs the actual final `SourceChecker` and extracted, unchanged `admit`,
`sendAdmitted`, `sendTurn` and `admitFrame` functions. Its checker pipes, connector,
evidence storage and end notification are in-memory stand-ins.
[Actual output](latched-failure.json):

| Input | Actual result |
| --- | --- |
| One allow, send control | One fake connector call, no failure |
| Deny, send control | Zero connector calls; capture ends |
| Allow plus its replay in one chunk, send | One connector call **while `checker.failure` already says replay**, before capture ends |
| Allow plus its replay in one chunk, post-acquire | Main returns `ok:true` and records the frame as admitted while failure is already latched; capture ends afterward |

This is not the accepted native time-of-check race: the failure was already known
inside the app before the consumer's side effect. The post case proves main's
admission result, not actual Electron delivery or real frame publication. The
send case proves connector invocation, not a real provider submission or charge.

**Correction:** fence all consumer side effects using the existing synchronously
latched failure as well as capture/live/request state, after waits and before
acting. Preserve the actual allow/violation evidence ordering and the original
Stop reason. A new watchdog or protocol is unnecessary. The focused regression
must keep normal allow/deny controls and require zero connector calls/no admitted
frame for the same-chunk replay case. Lead's deadline/BOM correction does not
change this consumer race.

## C2 — P2: frames arriving during pre-admission retain an obsolete state

`overlay.ts:583` computes `state` before the new pre-admission wait. An initial
acquisition (or one owed after AI Start) can enter line 587 without initial stream
progress. If a frame arrives while admission is awaited, lines 597–600 update
`newFrame`, presented count and time, but not `state`. The resulting sample at
line 665 still says `no_new_frame`; retention copies it at line 1636, while the
first-look path correctly receives `stream_new_frame:true`. The status text at
line 1535 consequently describes a still/stalled capture for that fresh sample.

The [frame probe](../../../../tests/probes/support/windows_admission_9c3beab_frame_state.mjs)
executes the exact `takeSample` and `sampleState` bodies with memory fakes.
[Actual output](frame-state.json) contains paired controls: arrival before the
wait gives `fresh`; no arrival gives `no_new_frame`. Arrival during the wait gives
presented count 1 and `stream_new_frame:true`, but sample/retention-input state
`no_new_frame`. This is a function-level evidence mismatch, not a measured GUI run.

**Correction:** derive the sample state from the acquisition's updated progress
facts, retaining the existing gap/ended precedence. Check state together with
presented count/age and the first-look facts; do not merely change the UI wording.

## C3 — P2, conditional: bounded cache eviction rejects an approved pending original

`main.ts:815–816` evicts the oldest admission after 64 newer entries. Retention
encoding at `overlay.ts:1658–1663` is queued independently of sampling; the
two-item retention queue bounds count, not the age of an unfinished PNG. If frame
1 is still being encoded when frame 65 is admitted, its eventual intake reaches
`main.ts:877` / `sourceOf:823–830` after its admission has been erased. Main treats
the genuinely admitted frame as unadmitted and ends the capture, refusing that
original. Already stored originals are not deleted.

The same frame probe executes actual pre/post admission and `sourceOf`: all
frames are admitted, frame 1's delayed intake is accepted after 64 total
admissions, and is refused with capture-ending after 65. This establishes the
conditional cache boundary only. No real PNG delay, long native run or likelihood
within the four-action candidate was measured; do not label it an observed
native loss or a quota issue.

**Correction/owner decision:** pending approved originals must retain their
admission until intake settles. Coordinate the cache lifetime with that existing
pending work, or demonstrate an enforced bound that prevents eviction first.
Keep the default capture and Stop preservation behavior; no new source archive
is needed. This secondary issue does not reduce C1's independent HOLD.

## Boundaries that are present in the source

These are source-review conclusions, not additional executed test counts:

- The sole bitmap acquisition is bracketed by pre/post checks; raw publication
  follows post approval. Main consumes its one-use ticket before waiting for post,
  compares acquisition sequence, raw hash and dimensions at retention, first look,
  circle and follow-up intake, and carries `Frame.source` into delayed/reused sends.
- The send gate names the acquisition's `HeldFrame.seq`, separately records AI
  sequence/ink lineage, and uses the hash of the actual encoded PNG bytes. Main
  intentionally does not decode PNGs to verify the trusted renderer's RGBA hash;
  that agrees with the supplied interface and is not a new finding.
- Whole Stop sets `ending` and cancels AI work before notifying the renderer
  (`main.ts:301–308`). AI-only Stop ends the live session while leaving capture
  running (`1154–1165`, `2069`). Queued decisions reevaluate their purpose; known
  unsubmitted gate refusals do not rewrite earlier in-flight request outcomes.
  The C1 failure-notification gap remains an exception requiring correction.
- Arm uses main's `process.pid` and the current overlay's native handle once
  (`2223–2226`); the test-only read-only session fact distinguishes capture identity
  from overlay ID and becomes inactive/absent on Stop. Native creation ticks,
  positive exclusion and stacking remain QA's responsibility and unverified here.
- Finish closes the capture's checker; application quit waits on tracked checkers.
  Source lifecycle reporting retains unknown exit. No actual child was created or
  inspected by this review. Unconfigured branches retain the original capture/
  send path and start no checker; no additional ordinary-mode defect was found.

## Executed checks and limits

Node `v24.21.0`, Linux. Both probes require exact final-source hashes. Each final
invocation used `--permission`, exact read grants, **no child-process or filesystem
write grant**. Only shell redirection saved synthetic outputs in the Support
directory. No account, native, network, capture or provider operation occurred.

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --disable-warning=ExperimentalWarning --permission --allow-fs-read=/tmp/support-admission-9c3beab-8q7kjr5s --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/windows_admission_9c3beab_latched_failure.mjs /home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/windows_admission_9c3beab_latched_failure.mjs /tmp/support-admission-9c3beab-8q7kjr5s
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --disable-warning=ExperimentalWarning --permission --allow-fs-read=/tmp/support-admission-9c3beab-8q7kjr5s --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/windows_admission_9c3beab_frame_state.mjs /home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/windows_admission_9c3beab_frame_state.mjs /tmp/support-admission-9c3beab-8q7kjr5s
```

- Failure-latch probe: one execution, exit 0; **2 controls and 2 defect witnesses**,
  four output rows; [stderr](latched-failure.stderr) empty.
- Frame-state/cache probe: final execution exit 0; **3 controls, 1 defect witness
  and 1 conditional cache witness**, five output rows;
  [stderr](frame-state.stderr) empty. Its first invocation stopped at a source
  extraction assertion before any scenario: a colon in the anchor had been
  removed by TypeScript stripping. [Original stderr](frame-state-initial.stderr)
  and [empty stdout](frame-state-initial.stdout) are preserved. Only the probe
  anchor was corrected; production source was unchanged. That attempt is no pass.
- The assertions intentionally confirm the observed defects. Successful probe
  execution does **not** mean the interlock or product passed.
- Final-source deadline/BOM delta inspected only. Lead's corrected verification
  receipt `handoff_468f6d9c47b70f857563dff75dd83eee` reports its single focused test
  actually passing, preserving its initial path-discovery failure. Those checks
  and Web's suite/mutation results are not counted as Support executions.
- No 491-test replay, mutation campaign, QA R1–R5 repair/review, Windows,
  PowerShell, native/display run, staging, process inspection, resource allocation,
  account/model call, audio or TTS. Real actions remain **0/4**, old diagnostic
  **3/3 closed**; no product/device acceptance claim follows.

Return the findings once through the existing Lead route. Web fixes the narrow
consumer defects, Lead reviews/integrates and coordinates QA's still-separate
checker/candidate work. Support then idles until a new bounded assignment.
