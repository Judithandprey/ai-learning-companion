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

Explicit Start creates one bounded session: at most 12 submissions / 5 minutes,
at least 30 seconds between unattended observations, respecting narrower caller
limits. These are engineering ceilings, not authorization to run 12 real tests.
One inference and one pending Turn are retained; newest observations coalesce,
explicit focus/follow-up supersedes a pending observation, and further explicit
work receives busy. Displaced input gets a `not_submitted` response; its original
history/gaps/provenance are never rewritten. The caller retains originals and
records the gap on subsequent context.

Actual `prepare_live_session_context`, `bind_live_session_response` and
`authorize_live_presentation` carry the whole PNG, separate focus, original
bounded history/transcript attribution, gaps and exact source/ink/time provenance.
Internal observation is distinct from generated assistance. Independently held
current Turn state gates send, binding and publication; provider output cannot
supply its own current permission. Session/epoch/capture/frame/permission and
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

The trusted desktop must interrupt immediately on permission/presentation changes,
Stop on source permission loss, and independently suppress stale cards/captions/
speech. The next Turn supplies fresh complete provenance. `voice_followup` carries
an explicit Talk transcript and its actual source attribution. This text/image
route does not capture or ingest raw audio; Start requesting microphone/system-audio
acquisition is explicitly refused. Those audio capabilities remain separate work.

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
