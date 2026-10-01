# Subscription quota facts and refusal classification

Existing P0-04/P0-09, R38 / §3.8 / G4; assignment
`handoff_26afedde82001568fd372636368a02b8`, 2026-10-01.
Assigned integration revision: `d37f7a442a78122fb351a7aab83ffdff8aec1448`.
Starting Backend revision: `1b27a918f265349929d6344f0bbe163c6a854b99`.
The connector and Learning ASK sources match that integration revision.
Requirements, decisions, ADR and translation hashes were checked at the assigned
revision without merging or discarding work. PONYTAIL LITE: reuse the existing
RPC/parser and v1 bridge; no dependency, new service or account operation.

**Correction after `65591981`:** the initial interpretation below was too broad:
included usage permission is not permission for every credit-backed request.
The user/operator supplied independent unchanged regression evidence and the
official pricing clarification in this same task. The earlier commit is retained
as failure history, not accepted closure of the credit-admission problem.

## Confirmed defect and change

Both official error-notification and failed-turn paths classified
`rateLimitExceeded` as `quota_exhausted`, conflating request throttling with a
usage limit. A focused regression first reproduced both failures; the two
`usageLimitExceeded` controls passed.

The internal parser retains per-bucket official credit facts and explicit
workspace/spend-control facts. Missing credit data remains unknown. Balance is
an opaque bounded string, not a floating-point currency or an inferred allowance.
No percentage, reset timestamp or earned reset credit establishes recovery or
guarantees entitlement. Neither 100% usage nor `ordinaryUsageAllowed=false`
alone vetoes a user-authorized request: that flag describes included usage, and
eligible existing credits may still be usable. The server decides the turn;
explicit applicable spend-control/workspace restrictions remain local refusals.
This does not override an authoritative turn failure or retry a failed turn.
Null snapshot IDs preserve known map keys; conflicting map/snapshot IDs fail
closed. A model-specific bucket for a different model cannot supply the refusal
cause. Unknown scope neither inherits a foreign bucket's restriction nor borrows
its credits. Other buckets cannot erase a known applicable restriction.

Structured provider errors distinguish usage limits, request throttling, session
budget, authentication and unknown failure; existing image-capability refusal
remains distinct. Raw provider error text is never used to infer or display a
cause. Neither failure path retries inference.

Version 1 remains unchanged. Its coarse error projection uses `failed` for
throttling/session budget and `unavailable` for workspace refusal;
only the existing authoritative usage-limit class maps to `quota`. Fatal transport
failure retains the existing EOF/uncertain-submission behavior. Richer public
quota and error facts require Lead's versioned interface and client adoption.

## Source semantics and limits

Installed Codex 0.158.0 generated stable schemas were read, not regenerated with
an authenticated process:

- `GetAccountRateLimitsResponse.json`, SHA-256
  `cb9655e68130116f634ed9353e45b336492e6069a6628f424d1cd52e54eda0e0`.
- `ErrorNotification.json`, SHA-256
  `89a91e721f09dbf0533aed9812a32d25a0b0f0d72e9c4517cd07f05a4bf3f873`.

The generated schema describes `ordinaryUsageAllowed` as backend permission for
ordinary included usage, with null unavailable and no recovery inference from
percentages/reset times. `CreditsSnapshot` requires boolean `hasCredits` and
`unlimited`, and permits string/null balance. The distinct error enums do not
establish a user's total remaining credit balance.

The [official App Server account-limits documentation](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt)
describes workspace credits, server-classified reached limits and separate earned
reset credits. [Official pricing](https://learn.chatgpt.com/docs/pricing#what-are-tokens-and-credits)
states that eligible available credits can continue usage after included limits.
No authoritative contrary evidence was found for the earlier blanket preflight
refusal. Removing that local veto does not assert recovery of included usage;
it allows the official server to decide an explicitly requested turn. Separate
app/workspace eligibility controls do not turn this included-usage flag into an
all-credit refusal. No reset-credit consumption, purchase, billing change,
account switch or automatic retry is added.

## Actual running-product evidence

Only the latest bounded, regular, non-symlink product receipt was read. Exactly
one receipt was present, modified **2026-10-01 13:29:17 UTC**. Allowlisted results:

```text
submission = not_submitted
outcome = failed
terminal_status = null
actual_model_recorded = false
error_fields_present = false
quota_fields_present = false
```

This establishes a recorded pre-submission failure, not its specific cause.
The receipt cannot distinguish allowance denial, auth, capability or another
preflight failure. No credential files, prompt/image contents, screenshots,
account queries or model calls were accessed. The user's active Windows app was
not restarted or changed. Development-agent authentication was not used as
product evidence.

The operator's additional sanitized evidence records a visible `quota` refusal
without an answer, but no exact upstream cause. The operator reports that a
same-account read returned busy because the running app owns the managed lock;
this Backend correction did not repeat that read. Actual user credits remain
unverified, and no auth/model/microphone state was changed.

## Initial verification and retained failure

Using `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`:

```sh
python -m pytest -q services/worker/connectors/tests/test_chatgpt_rpc.py --tb=short
# 164 passed in 7.73s: 55 new quota/error/scope cases, 109 existing RPC cases.

python -m pytest -q services/worker/connectors/tests/test_chatgpt_local.py \
  -k 'inner_refusals or connection_read_preserves' --tb=short
# 10 passed, 75 deselected in 0.23s.

git diff --check
# Passed.
```

The original regression selector was `-k authoritative_error_classification`:
two rate-limit cases failed and two usage-limit controls passed before the fix.
That RPC run covered positive, zero, unlimited, missing and unknown credit
facts; full windows; explicit denial; unknown errors and secret-text redaction;
workspace owner/member credit/usage causes; model/bucket mismatch; malformed
metadata; cancellation and no submission; unchanged v1 status and no retry.
The full affected RPC file had already started before narrowing the final test
selection; it was not repeated after passing. No full connector/project suite
or previous database/device campaign was rerun.

Independent read-only bridge review found no issue in the v1 projection,
cancel/Stop precedence or terminal EOF behavior; its 11 pure in-memory checks
overlap the above bridge cases and are not added to the total. Synthetic children
only were used in RPC tests, never the real Codex executable or an account.

The initial tests encoded the mistaken included-usage veto; their passing count
does not override the subsequent independent failures.

The supplied `quota_regression_probe.py` is unchanged, SHA-256
`41f46f704c0c53ee50012241b6a469fab96c103248dd6315878c9d8539a6f1af`.
It reuses the repository's FAKE/client/invoke transport fixture and product code.
Operator baseline `d37f7a4`: **3 PASS / 6 FAIL**. Backend rerun on clean
`65591981e184f2d9b9808fd477a467959d4b2db6`: **5 PASS / 4 FAIL**, exit 1:

- Included allowance still vetoed available credits (single and applicable
  multi-bucket cases).
- V1 connection output still collapsed unknown/empty/available credit states and
  lost which bucket owned them. Those public distinctions await Lead's versioned
  seam; changing the probe or silently extending v1 is not a fix.

The exact baseline invocation used the Python above with
`PYTHONDONTWRITEBYTECODE=1`, script
`/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/windows-live-experience-20261001/quota_regression_probe.py`,
`--repo /home/agentsdock/Projects/learning-companion/wt-backend`
`--output /tmp/backend-quota-6559198-independent.json`.
All recorded source hashes matched the clean commit; no probe or source drift.
The committed [baseline check summary](subscription-quota-6559198-regression.json)
retains all nine checks and the original evidence hash.

## Corrected admission verification

Same Python executable, fake-child tests only:

```sh
python -m pytest -q services/worker/connectors/tests/test_chatgpt_rpc.py \
  -k 'full_windows_and_credit or included_usage_flag or workspace or applicable_spend_control or authoritative_error_classification or credit_snapshot or account_catalog_quota or refusals_never_publish_or_retry or cancellation_before_actual_submission' --tb=short
# 112 passed, 77 deselected in 3.00s.

python -m pytest -q services/worker/connectors/tests/test_chatgpt_rpc.py \
  -k empty_multibucket_view --tb=short
# 4 passed, 189 deselected in 0.24s, after the narrowly reviewed empty-map fix.
```

The former incorrect included-usage-denial assertion now checks a successful
explicit turn or cancellation before submission. Authoritative rate/usage error
tests now start with included usage false and positive credits, proving that the
subsequent server denial still wins without retry. Explicit spend control and
workspace classification block before thread/turn submission for false/true/null
included permission; foreign credits do not lift them. Unrelated restrictions
are not applied. An empty multi-bucket map falls back to the required legacy
snapshot; a nonempty foreign map does not borrow legacy credit facts.

Independent read-only review found no blocker in the bucket rule, cancellation
fences and authoritative turn failures. Model-like bucket names alone do not
prove applicability; unknown named aliases remain for the server to adjudicate.
No account, live model, running app, microphone or auth state was accessed.

The same unchanged independent probe, same invocation with output changed to
`/tmp/backend-quota-admission-fixed-independent.json`, now reports **7 PASS /
2 FAIL**, exit 1. [All final checks and source hashes](subscription-quota-admission-regression.json)
are retained. Both available-credit admission cases pass; explicit spend controls,
distinct server failures and no-retry/no-mutation checks remain passing. The two
actual remaining failures are unknown versus known public credit state and public
bucket ownership visibility. They are not suppressed, reclassified as passing or
fixed by modifying the probe. Tested source hashes matched the final files before
commit; the recorded HEAD is the preceding commit plus the tested working change.

The local preflight defect is corrected. This quota task is **not fully closed**:
Lead must release the promised richer versioned connection/error seam, then the
connector and client owners can expose preserved credit facts without changing
v1. That concrete contract dependency has been reported; no speculative public
fields are added. The running old app and actual user credits remain unverified.
No real inference, UI acceptance or full G4/product acceptance is claimed.
