# Completed-turn output diagnostics — 2026-10-20

The existing private managed-child receipt now distinguishes completed-message
phases, answer selection, and the connector's safe failure cause. This corrects
the missing diagnostic evidence; it does **not** establish or fix the actual
Candidate 08 failure branch. No parser/ordering defect was proven.

Owner: Backend. Assignment: `handoff_1b30e7435f58d00e50548e029b00f1e5`.
Adopted baseline: `a6406b4753c9218bdcf87f60673fdb834cfb8777`, via worktree merge
`f39781675495ef8f860482bb1e0e14bb6be770ae`. Operator `80ec7cb` / integrated
`725f910` EOF/process-wait barrier and delayed-initialized regression are intact.
Scope: connector implementation/tests and Backend evidence. No shared contracts,
platform app, QA runner, CI or dependency changes.

Requirements: main §7.1/§7.3, R35/R36/R38/R51/R52/R59, A14/A30,
V-DailyResume/V-SourceTimeRelations and ADR 0004; related AUDIO-06–10/14/15 boundaries
remain unchanged. All four source/English manifest pairs matched their recorded
hashes at the adopted baseline.

## What the actual attempt establishes

QA delivery `82ee0ac784228e45fc73c5af8527e69408ca5daf`, evidence
`docs/verification/qa/p0-13-live-0ff325b/execution-manual-20261020-candidate08-01`,
records product `0ff325b` sending one generated whole-screen observation, with
acknowledged submission, terminal `completed`, types `userMessage`, `reasoning`,
`agentMessage`, and local outcome `failed`. No answer appeared. Actions 2–4 and
Stop were NOT_RUN. The one native attempt and 1/4 real actions were consumed;
DISPLAY/ACCOUNT were released.

The old receipt did not record the internal failure code, items view or completed
message phases. `produced_item_types` records observed types before checking
completion, so `agentMessage` alone does not prove an eligible completed answer.
Commentary-only and incomplete-item-view explanations remain hypotheses. The
new fields cannot retrospectively diagnose that attempt.

## Additive private fields

The format stays `lc-subscription-ask-receipt/1`; public `live/1` and old wire
responses are unchanged. The writer accepts the complete old field set or the
complete extended set, rejects partial/unknown fields, and retains its 16 KiB
per-receipt and 4096-record limits and private atomic writes.

| Field | Type / allowed values |
| --- | --- |
| `failure_code` | `null` or a member of `chatgpt_rpc.FAILURE_CODES` below |
| `terminal_items_view` | `null`, `full`, `summary`, `notLoaded`, `invalid` |
| `terminal_error_present` | `null` or boolean |
| `completed_message_count` | Integer 0–16,777,216, equal to the sum of the three phase counts |
| `completed_final_answer_count` | Integer 0–16,777,216 |
| `completed_commentary_count` | Integer 0–16,777,216 |
| `completed_unphased_count` | Integer 0–16,777,216 |
| `answer_selection` | `null`, `final_answer`, `unphased`, `none` |
| `answer_text_state` | `null`, `empty`, `whitespace`, `nonempty` |

The exact failure allowlist is:

```text
unavailable protocol_error request_failed timeout outcome_unknown cancelled
cancellation_uncertain isolation_unverified unauthenticated unsupported_model
model_mismatch tool_activity incomplete_turn quota_exhausted rate_limited
workspace_limit usage_not_allowed session_budget_exceeded context_limit overloaded
session_stopped budget_reached stale_context busy invalid_request login_not_found
login_failed closed
```

`null` means not observed/selected; it does not independently mean success.
The recorded view is the existing parser's effective view (missing `itemsView`
defaults to `full`). Counts include unique validated completed agent messages,
excluding started items, deltas, reasoning and non-full terminal items. Duplicate
event/full-view copies do not increase them. The conservative maximum is derived
from existing `MAX_TURN_EVENTS ** 2`, because each lifecycle event may carry a
terminal batch. A 4097-message regression prevents diagnostics from imposing a
new 4096-message parser restriction. Existing wire/text/event bounds still apply.

Selection remains final-answer phase first, otherwise unphased messages.
Commentary and reasoning never become an answer. Empty final output does not
fall back to commentary or unphased output. Safe RPC failure is recorded before
bounded cleanup; bridge failures after parsing are also recorded. The first
recorded cause survives finalization, while outcome/submission stay independent.
Internal shutdown/retirement without an observed cause does not invent a user
cancellation. Unknown supplied codes become `unavailable`.

No prompt, image bytes, answer text, raw error, hidden reasoning, credentials or
auth paths are added. The existing executable identity metadata is unchanged.
Failures still fence requests, preserve source/image provenance and disclosure
checks, and do not retry, change models, acquire devices or issue extra requests.
Observation remains internal and silent.

## Verification

Final foreground command, using normal exact-command approval for the existing
pipe/thread tests:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/worker/connectors/tests
```

**636 passed in 22.65s.** Existing synthetic Python child and actual production
RPC/parser/bridges/writer were used; no installed Codex, account, model, device,
microphone, speaker, screen or GUI call ran.

New coverage reproduces `completed` plus commentary-only/empty/summary-only
output, with private `incomplete_turn` and unchanged public `failed`. It also
covers full/legacy output, completion before the start reply, completed events
with `summary`/`notLoaded`, duplicate full items, blank/whitespace output, error
presence without prose, invalid/conflicting fields, real private writer rejection,
first-failure persistence before cleanup, reset on a new request, post-answer
Learning binding failure, and internal shutdown/retirement. No extra thread/turn
submission is permitted; the live observation failure stops its session.

Failure history is retained: the initial default-sandbox full run was interrupted
after foreground pipe waits failed, and is not a pass. An isolated
`test_chatgpt_live_stream.py --maxfail=1` run reported **7 passed, 1 failed in
8.35s**, waiting for EOF after the credit-fact check. This matches the existing
[pipe/thread environment limitation](../p0-04-subscription-recovery-streaming.md).
The normal approved run resolved the pipe waits and reported **633 passed,
3 failed in 22.43s**: legacy test doubles still accepted only `finish(outcome)`.
They now accept the optional private `failure_code` keyword; assertions and
production timing were not weakened. The final full run above passed.
`git diff --check` passed.

The [legacy](receipt-legacy.json) and
[extended commentary-only](receipt-commentary-only.json) files are validated
**synthetic schema examples**, not actual attempt evidence. The latter illustrates
one possible branch, not Candidate 08's cause. Both were checked with the
production metadata validator.

## Next owner and remaining evidence

Lead will coordinate QA's strict receipt-key/type/count validation and sanitizer
update in `tests/e2e/windows/qa_run_live_candidate.mjs` (old key admission around
lines 510–547, sanitizer around line 460). Those paths are unchanged here.
The QA consumer must accept and validate the exact new fields before another
candidate uses this connector.

Only a separately authorized, integrated real attempt can reveal the actual
future failure branch or prove that the full flow works. No replay or new live
allocation is performed or requested by this patch. Windows full flow, actions
2–4/Stop, actual audio/provider acceptance and macOS real-device gates remain
unaccepted. Exact pinned source caches from earlier work were absent in this
executor; no new upstream ordering guarantee is claimed.
