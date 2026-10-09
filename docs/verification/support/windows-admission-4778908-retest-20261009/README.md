# Windows admission C1–C3: corrected-source retest

2026-10-09. **HOLD on the requested unknown-holding-list refusal at Web
`477890829c4afe880a151f3ce151b98b97405414`.** C1, C2 and C3's original count-eviction
counterexamples are repaired. All four pending consumers preserve their frame's
admission in the bounded lifetime regression. The new list still accepts an
earlier number that was never admitted. A separate conditional producer-limit
case is recorded below without claiming native occurrence.

## Scope and provenance

Lead `handoff_71972c17fbe888d529689cf3aabd8aef` assigned this one changed-boundary
retest. The exact Web commit is a leaf on
`9c3beab5d9bfae4ebd295af5a3db5baf99b4038c`; its `apps/windows` tree is
`7c20539ef16478d96f6719d8236078fea96daa09`. Read the complete exact delta and
appended owner-report correction. Relevant guidance/requirements are unchanged
from the preceding review, which refreshed the Lead `73488f5` interface and
original/English clauses. Continue Ponytail LITE with scope, necessary checks,
readability and model effort unchanged.

Prior evidence remains at Support `dbb42ab` and
[the original review](../windows-admission-9c3beab-review-20261009/README.md).
New probes transparently adapt those controls/counterexamples to the new hashes
and pre-IPC shape; they do not edit the old probes or production source. An exact
Git-object export under `/tmp/support-admission-4778908-uk9d_egb` supplied all
executed source. [Identity record](source-identity.json) pins the bytes and
probe-adaptation details. Only Support evidence/probe paths changed.

## Results on the original findings

| Boundary | Independently observed result |
| --- | --- |
| C1: allow plus replay in one chunk | The actual checker latches failure; actual main consumers now return before a connector call or frame admission. The allow is recorded honestly, followed by violation. Single allow and deny controls retain their expected behavior. |
| C2: frame arrives during pre-admission | The actual sampler now records `fresh` with the updated presented count and first-look facts. Arrival before the wait and no arrival remain correct controls. |
| C3: frame 1 held through later acquisitions | Explicitly held frame 1 survives 64 and 65 admissions; the set contains frame 1 and the newest frame. Omitting it later retires its admission, and an attempted subsequent intake is refused. |
| Four pending consumers | Actual retention, first-look, circle and follow-up functions each hold frame 1 while 70 newer acquisitions are admitted. Releasing synthetic encoding completes intake of frame 1, releases its reference, and permits retirement on the next acquisition without ending capture. |

The reference is acquired before each consumer's first asynchronous encoding or
handoff and released in `finally`. Main-owned `Frame.source` already carries the
admitted facts after intake; removing the renderer reference then does not
invalidate an already accepted main-side delayed send. No snapshot/reference
race was found in these changed consumers. Lead separately reviews ordinary
unconfigured behavior; no independent full-suite result is claimed here.

## C3-A — P2: an unknown earlier ID is accepted in `holding`

At final `apps/windows/src/main/main.ts:799–805`, validation requires the exact
object shape, at most 16 entries, safe positive integers, and values earlier than
the current sample. It does not require those entries to exist in `a.admitted`.

The exact-source probe starts with an empty admitted map, then calls
`pre(sample=7, {holding:[1]})`. Actual result: `ok:true`, one checker request, and
no capture Stop. The task explicitly asked that unknown/malformed holding lists
remain refused, so that acceptance condition remains unmet. Seven malformed
controls are correctly rejected before any checker request: missing/non-list,
future/current number, extra member, nonnumeric entry and 17 earlier entries.

This does **not** forge frame authority: the retention loop only deletes existing
entries, never inserts unknown ones. The same probe confirms frame 1 is still
absent and actual `sourceOf` rejects its subsequent use. Do not describe the
omission as a real image leak or provider submission.

**Narrow owner fix:** require each held ID to name a currently admitted frame
before pruning or asking the checker; retain exact hash/dimension checks at use.
Add the empty-map/unknown-ID negative beside a known-held-ID control. If Lead
intended unknown entries to be deliberately ignored instead, that needs an
explicit acceptance clarification; this report does not silently substitute it.

## C3-B — P2, conditional: the producer can exceed its own 16-entry bound

`overlay.ts:1487–1493` clears a completed gesture and launches `finishAsk` without
awaiting it. Each circle retains its frame through asynchronous encoding
(`1139–1143`, `1171–1178`), while ASK mode remains active until line 1205.
Consequently, repeated circles on distinct frames can coexist. Cancelled epochs
also release only after encoding reaches the epoch check at line 1197.

The same bounded lifetime probe invokes the real circle consumer on 17 distinct
admitted frames while synthetic encoding is held. Its actual `using` map contains
17 entries. The sampler's exact holding-list expression then produces 17 values,
and the next real `admitFrame` call refuses with “malformed,” ending capture.
After simulated Stop cancellation and release, all references are freed and no
circle intake occurs. This confirms the conditional function path, not actual
pointer timing, Windows latency or the likelihood of 17 concurrent encodings.

Keep the reviewed 16-entry receiver bound. The producer needs bounded pending
circle handling that preserves already accepted originals, or a documented
decision that this condition intentionally ends capture. It must not silently
drop still-needed references to satisfy the list length. This 17-circle condition
is beyond the current four-action candidate; it is **not claimed as a native
candidate failure or an independent reason to expand/block its allowance**.
C3-A is the specific remaining refusal condition behind this review's HOLD.

## Actual checks and limits

Each probe was invoked **once**, exit 0, on Node `v24.21.0` with `--permission`,
read grants for the exact export and its own script, and no child-process or
filesystem-write grants. Production functions were extracted unchanged after
TypeScript stripping; exact source hashes and extraction anchors are asserted.
Boundary fakes use memory only. Shell redirection saved the synthetic results.

| Executed probe | Actual cases | Evidence |
| --- | --- | --- |
| [Latched failure](../../../../tests/probes/support/windows_admission_4778908_latched_failure.mjs) | 2 controls, 2 fixed regressions | [4 rows](latched-failure.json), [empty stderr](latched-failure.stderr) |
| [State and holding validation](../../../../tests/probes/support/windows_admission_4778908_frame_state.mjs) | 11 controls, 2 fixed regressions, 1 remaining unknown-list witness | [14 rows](frame-state.json), [empty stderr](frame-state.stderr) |
| [Pending-consumer lifetime](../../../../tests/probes/support/windows_admission_4778908_pending.mjs) | 4 successful consumer regressions, 1 conditional producer-limit witness | [5 rows](pending.json), [empty stderr](pending.stderr) |

The 23 scenario rows are 13 controls, 8 repaired/lifetime regressions and 2
remaining witnesses (one conditional). Assertions confirm both expected fixes
and the explicitly reported residuals; exit 0 is not an overall product PASS.
The lifetime probe runs actual consumer/reference/admission functions with fake
canvas, UI, encoding and IPC endpoints. It does not run a full Electron app or
verify real PNG content, provider delivery, native capture or real-device timing.

Commands follow this exact form for each filename listed in the identity record:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --disable-warning=ExperimentalWarning --permission --allow-fs-read=/tmp/support-admission-4778908-uk9d_egb --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/PROBE.mjs /home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/PROBE.mjs /tmp/support-admission-4778908-uk9d_egb
```

Web's reported 198-test selection, build/type checks and six reverted-fix mutants
were read, not rerun or counted. No full 491-suite/mutation campaign, unrelated
module review, QA WIP, Windows/PowerShell/native/display operation, provider/account
call, audio/TTS, process inspection, staging or allocation occurred. Real actions
remain **0/4**; old diagnostic **3/3 closed**. No product acceptance follows.

Web retains corrections, Lead retains acceptance clarification/integration and
allocation. Deliver this one result on the original Lead route, then idle.
