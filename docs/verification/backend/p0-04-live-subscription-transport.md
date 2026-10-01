# Bounded foreground live subscription transport

Backend continuation of the existing Windows live-companion assignment, 2026-10-01.
This is connector source and offline execution evidence, not real Windows, account,
microphone, system-audio, image-understanding, or full-product acceptance.

## Revision and source boundaries

- Released private seam: `9b33a7675fe98ab30e5c79952668906ff7ef232a`, ADR 0004 and
  `packages/contracts/live_companion` (`lc-subscription-live/1`).
- Integrated source adopted: `ed66f8e29c5060eab59a8bf5f42c98b70d6ff5a3` through local
  merge `9080828`. This includes Learning `90da1a6` and reviewed quota correction
  `63e9bcb`. The earlier local merge `1a00241` retained both quota fixes after
  verifying the incoming connector files matched their accepted predecessor.
- Lead assignment/release receipts: `handoff_c1fbe8cb8d06fb402d8dee6f93c6db1b`
  and `handoff_544e98ba6524b7805ebc710ae6976ef3`.
- Same-delivery correction to `2833e2d`, requested by
  `handoff_6f03c017a6299e97d5782ab0012d189c`, reads exact source
  `c3afc6dc8b45e2979c0a74a01b03b8972c903e04` using `git show` without replacing
  this branch. Its revised ADR 0004 and full source/English section 7.1 clarify
  sustained-session policy and still-authorized response provenance. Both affected
  source/English pairs match the recorded translation-manifest hashes.
- Refreshed affected original/English requirements, current decisions, main
  sections 7.1/7.3/7.7, audio/screen specification and ADR 0004. Source records,
  R57 language preferences and current disclosure controls retain their scope.
- No shared schema, dependency, root configuration, Learning, desktop or account
  files changed. PONYTAIL LITE: reuse the existing launcher, foreground pipe,
  official RPC client, receipts and actual Learning functions; add only the live
  session state/scheduler required by the released protocol.

## Observable connector behavior

The existing `python -m services.worker.connectors.chatgpt_local` entrypoint pins
one protocol from its first envelope. Old `lc-subscription-ask/1` retains its
connection/error shapes and 256 KiB output bound; live uses its released typed
error and 1 MiB output bound. Limits include the entire UTF-8 JSON envelope and
newline. Both retain the 12 MiB input bound. Mixing versions does not renegotiate
or execute another method. EOF/fatal child loss closes only the owned child.

For example, the first live request is:

```json
{"version":"lc-subscription-live/1","id":"check-1","method":"connection/read","params":{}}
```

This public route returns actual parsed account/model/quota facts: nullable
ordinary included-usage permission, separate bucket identity/model, window
percent/duration/UTC reset, credits booleans and exact balance string, reached
reason, spend control and exact individual-limit strings/signed remaining percent.
Unavailable is not zero; another bucket's credit/restriction is not inherited.
`ordinaryUsageAllowed=false` alone does not veto an authorized managed request.
Applicable explicit workspace/spend restrictions and authoritative turn failures
remain enforced, with no automatic retries, account changes or reset consumption.

Explicit Start uses the caller's validated request allowance, duration and minimum
observation interval exactly. Current wire limits are 1–100 submissions,
1 second–1 hour and 500–60,000 ms minimum observation interval. The former
12-submission / 5-minute / 30-second values are a QA preset only; they no longer
silently clamp an explicitly configured longer session. Start reports its actual
local remaining submissions/time, separately from official Connection quota.
Unattended observation cannot consume the final `ceil(max_submissions / 5)` slots
(at least one); these remain available for explicit focus/follow-ups. This fixed
20% engineering reserve is not an additional spending allowance. A reserved-slot
observation refusal is `budget_reached/not_submitted`, leaving explicit work usable;
actual expiry and authoritative provider failures retain their suspension rules.
There is no renewal, retry or expansion of the separately authorized real-test
allowance. Limits of this wire version are not complete sustained-study acceptance.
One inference and one pending Turn are retained; newest observations coalesce,
explicit focus/follow-up supersedes a pending observation, and further explicit
work receives busy. Displaced input gets a `not_submitted` response; its original
history/gaps/provenance are never rewritten. The caller retains originals and
records the gap on subsequent context.

Actual `prepare_live_session_context`, `bind_live_session_response` and
`authorize_live_presentation` carry the whole PNG, separate focus, original
bounded history/transcript attribution, gaps and exact source/ink/time provenance.
Internal observation is distinct from generated assistance. Independently retained
active-request provenance plus current session/permission/cancellation gates send,
binding and publication; provider output cannot supply its own current permission.
A later unrelated observation does not invalidate an in-flight focus response.
That response keeps its original frame/time/source label. An accepted new explicit
request, changed permission revision, withdrawal, Stop or cancellation fences it.
Latest observed context remains a separate monotonic admission check. Invalid or
busy/rejected input cannot replace authority; the desktop must explicitly interrupt
on changed intent even when its replacement request receives busy.
Session/epoch/capture/frame/permission and
monotonic deadline are rechecked immediately before the actual provider write,
including after synchronous receipt persistence. A submission slot is reserved
once; uncertain submission is not refunded or replayed.

Stop fences queued and active work immediately. Targeted interrupt does not cancel
an unrelated later pending request; uncertain interruption suspends the session.
Auth, quota, transient-rate or uncertain provider failures fence the pending queue.
`connection/read` only refreshes metadata: recovery requires explicit new Start
with a new session ID. Receipt outcome and public `submission` remain independent
of sanitized error reason; no turn bytes means `not_submitted`, write uncertainty
means `unknown`, and completed write/official acknowledgement means `submitted`.

The trusted desktop must interrupt immediately on permission/presentation/intent changes,
Stop on source permission loss, and independently suppress stale cards/captions/
speech. The next Turn supplies fresh complete provenance. `voice_followup` carries
an explicit Talk transcript and its actual source attribution. This text/image
route does not capture or ingest raw audio; Start requesting microphone/system-audio
acquisition is explicitly refused. Those audio capabilities remain separate work.

The released `carry_focus_into_followup` helper belongs before the caller authorizes
and sends a Turn. Backend does not rewrite that frozen input. Same-frame references
must preserve the full original binding; later-frame historical metadata must say
past pixels are unavailable and provider retention is unverified. The current
ephemeral per-request provider threads do not establish earlier-image recall.

## Verification and retained failures

All provider responses and images here are synthetic. Foreground tests execute
the production pipe entrypoint with only its launcher replaced by an owned fake
RPC child, and use the actual integrated Learning implementation.

Test interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.
Foreground tests used the normal exact-command approval because previously
observed workspace sandbox self-pipe EPERM prevents asyncio thread wakeups. This
does not change permission settings or touch the running product.

- Existing `test_chatgpt_local.py`: **85 passed**, 4.81 s, including old wire,
  foreground EOF, cancellation, malformed input and owned-child reaping.
- New stream tests before foreground execution: **7 passed**, 0.17 s.
- First new foreground batch: **7 passed / 1 failed**, 2.78 s. The failing test
  incorrectly expected a reusable connection after a `turn/start` error with no
  acknowledged turn ID. Existing RPC correctly ends that child after bounded
  interruption cannot reconcile it. The assertion now requires EOF, and a separate
  failed-terminal case verifies read-only Check does not resume inference.
  The three affected failure scenarios then passed in 1.19 s.
- RPC owner focused validation: **61 passed**, 2.23 s; after adding the final
  post-receipt write guard, **17 affected checks passed**, 0.63 s. These groups
  overlap and must not be summed as unique tests.

- Live session owner first run: **30 passed**, 1.38 s. Added interrupt regressions
  exposed **36 passed / 2 failed**, 1.71 s: uncertainty cleanup overwrote an
  existing user Stop/cancel reason. Production now preserves that reason while
  independently reporting uncertain cancellation. Additional invalid-image and
  history-cap cases produced **45 passed**, 1.47 s.
- Final combined `test_chatgpt_live.py` and `test_chatgpt_live_stream.py`:
  **61 passed**, 4.60 s, after all review corrections. This is 45 session checks
  plus 16 version/public-pipe checks, not an additional 61 distinct behaviors.
- Final affected RPC selection below: **59 passed / 172 deselected**, 1.84 s.
  This covers live projection, submission evidence, structured error categories,
  receipt write ordering and cancellation/guard races. `git diff --check` passed.

Reproduction commands from the backend worktree:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/worker/connectors/tests/test_chatgpt_live.py services/worker/connectors/tests/test_chatgpt_live_stream.py --tb=short
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/worker/connectors/tests/test_chatgpt_local.py --tb=short
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/worker/connectors/tests/test_chatgpt_rpc.py -k 'live or authoritative_error or private_receipt or send_intent or drain_failure or cancellation_while_waiting_for_write_lock' --tb=short
git diff --check
```

The unchanged independent quota probe's historical **7 PASS / 2 FAIL** remains
attached to the old v1 projection; it is not relabeled 9/9. New public live pipe
tests separately demonstrate unknown/zero/positive credits, two independent
buckets, ordinary permission, individual/spend/reached facts and UTC resets.
Those facts now cross the actual public live route rather than only a private
parser. They are synthetic transport evidence, not proof of the user's balance.

Review also tightened targeted interruption, failure suspension despite a stale
presentation reason, invalid-image acceptance ordering and control fences when
the bounded request-ID history is exhausted. Final negative tests retain those
boundaries. No assertion is weakened to hide a production failure.

## Same-delivery scheduling correction

The initial `2833e2d` tests encoded an over-restrictive universal QA clamp and
incorrectly treated every newer observation as revoked active-response authority.
The current production behavior above supersedes those assumptions; prior passing
counts alone did not establish compliance with the clarified full flow.

Lead's unchanged `/tmp/lead-live-scheduling-probe.py` has SHA-256
`bd393c98ec1518e8dbf40273df455feae53dad31dab7c57ee75f833211836209`.
It uses the actual bridge and Learning through the owned inert test client,
without account/model/capture calls. Lead's before evidence is
`/tmp/lead-live-scheduling-before.json`; the corrected execution writes
`/tmp/backend-live-scheduling-after.json`. Neither temporary review snapshot nor
probe was edited. The following exact semantic outputs preserve the evidence if
those temporary files are later removed:

| Check | `2833e2d` before | Corrected production |
| --- | --- | --- |
| Requested 60 submissions / 1,800,000 ms | Returned 12 / 300,000 | Returned 60 / 1,800,000 |
| Focus on frame 3, then observation of frame 4 queued | Focus `stale_context/submitted` | Focus `generated_assistance`, original frame 3 |
| Subsequent frame-4 observation | Completed | Completed |
| Actual synthetic turn writes / maximum concurrency | 2 / 1 | 2 / 1 |

The unchanged probe was run as:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/lead-live-scheduling-probe.py /home/agentsdock/Projects/learning-companion/wt-backend /tmp/backend-live-scheduling-after.json
```

New negative tests against unchanged `2833e2d` produced **9 failures / 44
deselected**, 8.67 s. They expose the clamp, lost active-focus answer before/after
write, missing reserved slots and ignored 500 ms configuration. The first corrected
run gave **53 passed / 1 failed**, 2.14 s: a wrong-target interruption test had
queued a newly conflicting explicit request and incorrectly expected no resulting
interrupt. Its isolation setup now queues an unrelated observation while retaining
all wrong-session/epoch/request and targeted-pending assertions. The corrected
session suite passed **54 cases**, 2.15 s.

Tests cover 100 submissions / 1 hour, continued use beyond five minutes with exact
eventual expiry, explicit 500 ms observation spacing, reserve rounding for limits
1/2/5/6, and queued observation reaching its reserved tail after earlier explicit
work consumes a slot. That last rejection happens before any new receipt/thread
or turn write and does not stop later explicit work. Existing auth/provider failure,
Stop, current permission, disclosure withdrawal, unknown submission and no-refund
controls remain enforced. Another observation at a newer permission revision still
invalidates the old request; an ordinary same-revision capture alone does not.

A new actual foreground pipe test uses the production entrypoint, real Learning
and the existing slow-thread fake child. It reports 60 submissions / 30 minutes,
accepts the original focus plus the newer observation, returns both in order with
their original frame labels, writes exactly two turns and reaps its owned child.
Its focused execution passed **1 case**, 0.80 s.

Final combined live session/public-pipe command listed above passed **71 cases**
in 5.45 s (54 session + 17 transport). `git diff --check` passed. RPC and legacy
production files are unchanged by this correction, so their previously recorded
59/85 checks were not repeated. The correction changes four of the original seven
owned paths: live scheduler, its tests, foreground transport tests and this evidence.

## Remaining evidence and next owner

Lead integrates this exact tested source; Windows consumes the released seam,
implements current-state/presentation fences and packages a distinct release.
Actual UI/capture/ink composition, microphone/system-audio input, voice output,
matching captions, drag/DPI, real subscription inference and account balance
remain unverified here. QA may exercise the new package only within coordinated
user availability and its existing real-call allocation. No Mac/iPad/provider/P1
or complete classroom-to-archive acceptance follows from these tests.

The user's running `3e4b406` app, profile, managed-account lock and credentials were
not stopped, read for tokens, bypassed, replaced or mutated. No real model/account/
microphone/screen probe, billing action, reset, purchase, API fallback or dependency
installation occurred. Existing live-session context is bounded; source/archive
retention remains the existing desktop/backend path, not this transient scheduler.
