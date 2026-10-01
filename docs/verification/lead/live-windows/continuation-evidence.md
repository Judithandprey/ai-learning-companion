# Same-task evidence and bounded shared continuation

Starting main: `a8bf1fe8616c336fc19664b207cd104b7e593d1b`, after reviewed
implementation release `ed66f8e`. This follows the user's 2026-10-01 evidence
supplement, not a new campaign. Existing owners and the active old Windows app
are preserved. No account, model, microphone, desktop capture or user-app action
was performed by this continuation.

Reviewed implementation/document baseline **`b1d163d`** was committed and ordinarily
pushed to `origin/main` successfully (`a8bf1fe..b1d163d`). Post-push local HEAD and
the origin/main tracking reference matched; the worktree was clean. The following
record-only commit does not change the tested helper or any runtime source. Native
notification of this baseline remains unsent due the actual denial below.

## Actual quota result

The original operator `quota_regression_probe.py` was executed **unchanged** using
its CLI against exact main `a8bf1fe`, with a new output rather than overwriting the
baseline: [operator-quota-main-a8bf1fe.json](operator-quota-main-a8bf1fe.json).
Result: **7 PASS / 2 FAIL, exit 1**, at 14:24:08 UTC. Probe SHA-256:
`41f46f704c0c53ee50012241b6a469fab96c103248dd6315878c9d8539a6f1af`.
All three source hashes match the exact Git blobs. The fake App Server child only
ran private pipes; no actual quota was consumed.

Passing cases preserve credit-backed admission without an included-only blanket
veto, distinct transient/usage errors, applicable spend controls and no retry or
account/reset mutation. The two failures remain real open cases: old public-v1
metadata collapses unknown/known credits and loses the owning bucket. The live
connection projection and Windows consumer must close those user-visible gaps.
Neither this result nor the historical normalized user refusal establishes the
current account balance or exact upstream cause. No managed-lock bypass/probe ran.

## Executable retained focus

The existing released validator already allowed optional same-frame focus on text
and voice follow-ups; the older XOR finding does not remain open in that source.
The new lead-owned
[`carry_focus_into_followup`](../../../../packages/contracts/live_companion/focus.py)
handles the unresolved later-frame case without changing `lc-subscription-live/1`:

- Same frame: retain the rectangle only with identical full image/context binding.
- Later frame: preserve the original source, image identity, ink and rectangle in
  existing bounded history; the current frame has no relabelled old rectangle.
  State explicitly that earlier pixels are not attached and provider retention is
  unverified. Current PNG remains unchanged and complete.
- Current words, voice attribution, assistance and presentation remain current;
  no old solution/speech permission is inherited. Conflicting identity, unrelated
  sessions, overwritten new focus and history overflow fail without changing or
  truncating originals.

The helper is **implemented, not wired into Backend/Web yet**. It is a truthful
metadata fallback, not verified provider memory or full visual-history recall.
Existing source storage and current access checks remain caller obligations.

Focused main command:

```sh
.venv/bin/python -m pytest -q \
  packages/contracts/tests/test_live_focus.py \
  packages/contracts/tests/test_live_companion.py \
  tests/evals/test_live_session.py
```

Actual result: **123 passed in 0.57s**. The 15 new checks include valid generated
PNGs composed through the actual pure Learning preparation/presentation path,
same-frame text/voice, later image changes and Stop/permission fences. One initial
test used the existing scale value as its supposed mutation and failed to raise;
that fixture was corrected to change the value. It was not a product defect or
hidden pass. No model response was obtained. Independent bounded review:
[report](live-focus-independent-review.md),
[15 tests plus four independent controls](live-focus-independent-review.json).
No new dependency, service, schema version or original-record store was added.

`CurrentState` represents the active authorized response request plus current
permission/cancellation, not every newer capture frame. Neither a fresh observation
alone nor a copied Result is a substitute for checking that active request. The
actual client still has to label an earlier-frame answer with its original anchor.

## Current UI, audio and sustained-session limits

Operator offscreen run-03 is **14 PASS / 1 FAIL**, on a stable WIP snapshot after
Web `3023c41`, not a committed runtime release or independent OS/audio/model pass.
The failed case is `answer_is_visible_without_manual_scroll`: answer top787 is
outside card bottom690 in a1000×700 viewport. The initial toolbar is about72×671.
Drag, no accidental ink/ask, resize and restore checks pass within the fake
media/IPC/voice environment. The synthetic voice sink matching text does not make
the text visible or produce sound. Source snapshot hashes and this failure are
retained in the operator's supplied artifacts; Web already received its one
same-task correction. No duplicate dispatch or rerun occurred here.

Installed schema evidence distinguishes stable ordinary `audio`/`localAudio` from
experimental realtime methods. The reviewed realtime methods have no image/video
input; nullable output item IDs and absent word timing do not establish captions
aligned with raw screen context. Existing local ASR is poor and English recognition
is absent in the measured SAPI route. Actual audio adapter/input/output remains
open with Backend/Web, using Support's delivered evidence; an injected voice sink,
schema metadata or transcription-only fallback cannot pass full AUDIO acceptance.

Source/English/decisions/ADR now explicitly separate the12-request/5-minute/30-second
QA preset from sustained-study behavior. Visible configurable duration/allowance,
local versus official quota and useful room for focus/follow-up remain required.
The existing wire's1-hour/100-request bounds remain unchanged pending coordinated
extension. No silent renewal, increased real-test allocation or spending authority
is introduced. These are constraints still to implement, not product acceptance.

## Native routing and precise next actions

Both native `chats list` and `chats inbox` returned the actual error:

```text
agentsdock-chats: server rejected request (403): provider action was not authorized
```

This is a run-scoped provider denial, not evidence that workers stopped or rejected
their assignments. It was not retried through another route, credential or helper.
No new delivery/read/adoption receipt is claimed. The latest shared helper and
clarifications are **not sent**. Prior accepted tasks remain in place:

| Owner | Existing next action / dependency |
| --- | --- |
| Backend | Continue the already resumed live transport, lossless quota projection and current request/cancellation enforcement. At the next legitimate native handoff consume this helper or an equivalent verified history path; preserve old v1. |
| Web | Finish the already queued rendered-caption correction, then compose live frame/focus/follow-up with actual transport and audio adapter. Preserve old app; no controls-only or injected-voice completion claim. |
| Learning | Completed pure preparation remains retained; next is concrete transport/context feedback, with historical focus and active-request state checked against this released helper. No duplicate implementation dispatched. |
| Native | Retain the existing Mac Stop correction and later common connector adoption; no mobile restart or assumed interactive Mac. |
| QA | One existing changed-flow pass on the precise integrated version; keep caption/credit failures, count actual auto-focus/voice submissions and separate fake/offscreen from actual display/audio/model evidence. |
| Lead | Release reviewed shared code now; resume actual inbox/read and substantive same-owner handoff when normal native authorization is available, then integrate delivered transport/UI/audio and prepare a distinct tested Windows package. |

No versioned runnable replacement was produced in this continuation. That remains
dependent on the actual consumers, real supported audio path, a coordinated safe
switch/test window and independent behavior acceptance. The user's active session,
ink, files, account state and old process were untouched; no account balance
conclusion or request to paste credentials is warranted.
