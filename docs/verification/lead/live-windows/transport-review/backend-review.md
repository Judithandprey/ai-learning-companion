# Backend live subscription transport — bounded independent review

Candidate: `2833e2d15b67777aa85b91f1ad47a3efd0751312`.
Actual direct parent: `90808280fcfe95b00b0dda7ecdebf057d372222d`, the owner merge incorporating released `ed66f8e29c5060eab59a8bf5f42c98b70d6ff5a3`. ed66f8e is not the direct parent. The candidate's actual commit changes seven files; a diff directly against ed66f8e also includes earlier owner documentation, so this review used the direct parent for production delta.
Exact read-only export: `/tmp/backend-live-transport-review-fcg_rmg4`.
Current normative ADR read in full at Lead main `c3afc6d`: `docs/adr/0004-live-desktop-companion.md`. Complete delivered evidence `docs/verification/backend/p0-04-live-subscription-transport.md`, all changed production paths and relevant fake-child tests were inspected. Current c3afc6d decisions make the prior12/5min/30sec values a QA preset. PONYTAIL LITE applied: review reuse of existing foreground launcher, RPC client, private receipts and actual Learning helpers without proposing a new service/store.

**Overall disposition: HOLD for the two confirmed source-level contract/requirement mismatches below. Lead owns their scheduling/formal-helper review and executable reproductions. No additional blocker was found in this review's independent transport/submission/credit/tool-isolation checks.** This is not a real subscription, Windows/device, audio or product-acceptance result.

## H1 — caller's valid configured policy is silently replaced

`services/worker/connectors/chatgpt_live.py:174–176` clamps every valid Start to at most300000ms and12 submissions and at least30000ms unattended interval. The released wire permits max_session_ms up to3600000 and max_submissions up to100 (minimum observation interval500–60000). Current c3afc6d explicitly makes12 submissions/5min/30sec a QA preset, not a universal runtime limit.

The delivery's own `test_chatgpt_live.py::test_caller_policy_cannot_expand_hard_limits_or_renew_same_session` at line222 encodes the old assumption: valid Start100/3600000/500 is expected to report12/300000/30seconds. This test is evidence of the mismatch, not proof of the current desired behavior; this sub-review did not rerun that conflicting scheduler assertion. The evidence document also still describes these values as engineering ceilings.

Required bounded change: honor all valid configured Start.policy values, keep actual user/caller limits visible, and preserve finite monotonic enforcement and no automatic renewal. Reconcile unattended observation use with the current requirement to leave useful focus/follow-up allowance. No wire expansion or spending authorization is implied. Lead owns exact scheduling defaults/acceptance under the unchanged released schema.

## H2 — a new observation invalidates an authorized active response

`chatgpt_live.py:243` replaces session.latest on every accepted Turn. `_current_state` at291–293 builds active provenance from that newest Turn; `_guard` at301 rejects the active job whenever its full Turn differs. Thus an in-flight focus hint on frame3 becomes stale as soon as an otherwise non-conflicting observation for frame4 is accepted, even with the same session, epoch, capture and permission revision. Completion cannot return that still-authorized frame3 hint; it is discarded as stale_context. The same comparison also prevents an already accepted active request from writing if a newer observation arrives before its write.

Current ADR explicitly says CurrentState.provenance identifies the still-authorized active response request, not every unrelated newer capture observation. Video advancement alone must not make every in-flight answer impossible to present. Preserve the prior frame's actual time/anchor on its answer; do not relabel it as latest screen.

Required bounded change: separate active authorized request provenance from the newest pending observation while retaining explicit cancellation, Stop, session/epoch/permission and genuine conflicting-request fences. Do not weaken full provenance comparison or derive trusted current state from the provider's Result. Lead owns the scheduler correction and focused regression; no duplicate implementation was made here.

## Transport/lifecycle/credit findings

Read production `chatgpt_local.py`, `chatgpt_live.py`, the full changed RPC paths and surrounding cancellation/write/isolation logic. Within the independently tested transport scope:

- One protocol is pinned from the first selected envelope; mixed versions are refused rather than renegotiated. Legacy connection/error shape and256KiB output limit remain distinct from live1MiB. Both limits count actual UTF-8 envelope plus newline; input remains12MiB. Private outgoing queue remains bounded and pipe failures initiate owned-child shutdown.
- Actual provider thread/start and turn/start guards execute under the write lock. Cancellation is rechecked after lock acquisition. Turn send intent is recorded before bytes; the guard runs again after synchronous receipt I/O. Local submission state distinguishes no prompt written, uncertain write and submitted independently of receipt callback availability or error cause. No inference retry is added.
- Active model/provider remain exact, fallback disabled, isolated ephemeral thread required, read-only/no-network/never-approval policy checked, dynamic tools/environments absent, and launch/tool-plane verification retained. Unexpected server tool requests and foreign-thread tool activity cause refusal and child cleanup.
- Live quota projection preserves independent bucket IDs/model, exact credit strings/booleans, null versus zero, ordinary usage permission, reached/spend classifications, individual limit strings/signed remaining percentage and UTC timestamps. Ordinary included-usage=false alone does not block the authorized managed route or prove exhausted credits. Applicable explicit workspace controls are preserved; account switching, billing changes, reset consumption and retry are absent.
- Stop, uncertain interruption and provider failure suspend pending inference; metadata Check does not itself resume a stopped session. Full images/history/attribution and current presentation checks use actual Learning functions. Unsupported microphone/system-audio acquisition is refused explicitly, rather than asserted from a transcript path.
- Operational response errors are sanitized. Fake child tests intentionally emit dummy secret markers into stderr/provider errors; those are withheld from public results. No actual credentials or account paths were queried.

## Actual independent tests

Existing interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.
All commands run against the exact temp export, with bytecode/cache/plugins disabled; subprocesses are explicitly synthetic Python RPC children. The real launcher is replaced in the foreground tests before production entrypoint execution. No listener, DB, native display/mic/capture, real model/account, provider, install or network was used.

First focused command, normal sandbox:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/worker/connectors/tests/test_chatgpt_live_stream.py services/worker/connectors/tests/test_chatgpt_rpc.py -k 'live or authoritative_error or private_receipt or send_intent or drain_failure or cancellation_while_waiting_for_write_lock or user_input_server_request or ignored_deltas_never_authorize_tools or exact_managed_provider' --tb=short
```

Actual initial result: **74 passed,7 failed,166 deselected in61.81s**. The seven failures were foreground queue/EOF timeouts: three actual_live_public_pipe credit variants, full-frame/focus/history/Stop, and three actual_live_pipe_provider_failures variants. Direct RPC/send guard/submission/quota/tool cases passed.

The owner's evidence records prior sandbox self-pipe restrictions. I did not identify an EPERM exception independently, so I do not assert that exact cause from timeout alone. To distinguish environment-sensitive execution, reran ONLY the seven failed synthetic foreground cases through the normal exact-command approval mechanism; it approved the sandbox escalation without changing any sandbox policy:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/worker/connectors/tests/test_chatgpt_live_stream.py -k 'actual_live_public_pipe or actual_live_pipe_full_frame or actual_live_pipe_provider_failures' --tb=short
```

Actual retry result: **7 passed,9 deselected in2.75s**. This resolves those seven offline foreground checks in the approved execution context; the initial failures remain evidence. Do not sum the rerun as seven additional distinct behaviors or call the original sandbox run a clean pass.

Three additional independent probes live in `/tmp/backend-live-transport-review-fcg_rmg4/test_review_live_transport.py`, SHA-256 `e0fe7fd75a568431eebaa31e219a4f76f9374bd80784449436a3966ea7be2153`:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider test_review_live_transport.py --tb=short
```

Actual result: **3 passed in0.25s**, normal sandbox.

1. Real ChatGPTAppServer with synthetic child and receipt callback that cancels exactly while send-intent is persisted: no turn/start is written; public/current submission and final receipt remain not_submitted; owned child is reaped.
2. Actual LiveSubscriptionBridge + real RPC client + synthetic user-input server tool request: only sanitized unavailable/submitted error is published; session stops, child reaps and repeat cannot produce another turn/start.
3. Same path with a commandExecution item on an unexpected thread: identical fail-closed result, no secret echo or retry.

These probes exercise actual connector/Learning code with fake server messages, not replacement success results. They do not validate the scheduler's disputed H1/H2 behavior or target-device performance.

`git diff --check 90808280fcfe95b00b0dda7ecdebf057d372222d 2833e2d15b67777aa85b91f1ad47a3efd0751312` passed; owner git status remained clean. Repository/owner files and user's running package/auth/display were untouched. No native Chats were used. Report/probes only were written under /tmp.

Next owner/action: Lead combines these transport results with its scheduler/formal-helper review and sends one bounded same-owner correction for current policy and active-response provenance. Preserve original source/failing assumptions and test evidence; retest affected behavior before integrating or releasing. Real Windows, real account, voice output/captions, audio acquisition and desktop product gates remain separate.
