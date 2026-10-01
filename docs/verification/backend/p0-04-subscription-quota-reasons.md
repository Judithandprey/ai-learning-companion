# Subscription quota facts and refusal classification

Existing P0-04/P0-09, R38 / §3.8 / G4; assignment
`handoff_26afedde82001568fd372636368a02b8`, 2026-10-01.
Assigned integration revision: `d37f7a442a78122fb351a7aab83ffdff8aec1448`.
Starting Backend revision: `1b27a918f265349929d6344f0bbe163c6a854b99`.
The connector and Learning ASK sources match that integration revision.
Requirements, decisions, ADR and translation hashes were checked at the assigned
revision without merging or discarding work. PONYTAIL LITE: reuse the existing
RPC/parser and v1 bridge; no dependency, new service or account operation.

## Confirmed defect and change

Both official error-notification and failed-turn paths classified
`rateLimitExceeded` as `quota_exhausted`, conflating request throttling with a
usage limit. A focused regression first reproduced both failures; the two
`usageLimitExceeded` controls passed.

The internal parser retains per-bucket official credit facts and explicit
workspace/spend-control facts. Missing credit data remains unknown. Balance is
an opaque bounded string, not a floating-point currency or an inferred allowance.
No percentage, reset timestamp, credit balance or earned reset credit establishes
permission to submit. Existing full-window requests are not blocked solely by a
100% usage figure. An explicit `ordinaryUsageAllowed=false` remains a conservative
preflight refusal, identified as included-usage denial, without claiming all
credits are exhausted. Workspace causes require explicit, unambiguous evidence.
Null snapshot IDs preserve known map keys; conflicting map/snapshot IDs fail
closed. A model-specific bucket for a different model cannot supply the refusal
cause. Unknown or mixed scope remains included-usage denial, not an invented
workspace diagnosis.

Structured provider errors distinguish usage limits, request throttling, session
budget, authentication and unknown failure; existing image-capability refusal
remains distinct. Raw provider error text is never used to infer or display a
cause. Neither failure path retries inference.

Version 1 remains unchanged. Its coarse error projection uses `failed` for
throttling/session budget and `unavailable` for included-use/workspace refusal;
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
reset credits. It does not establish that positive credits override an explicit
included-use denial. [App credit permissions](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)
and [workspace controls](https://learn.chatgpt.com/docs/enterprise/usage-limits)
are separate eligibility considerations; this managed-auth implementation does
not infer a different authentication route's permissions. No reset-credit
consumption, purchase, billing change, account switch or automatic retry is added.

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

## Verification

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
The final RPC run covered positive, zero, unlimited, missing and unknown credit
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

This verifies the internal correction, not live entitlement, successful model
inference, Windows/Mac UI acceptance or full G4/product acceptance. Next owner:
Lead reviews/integrates this commit and releases the richer connection/error
interface for the existing connector and client owners. The reported live failure
needs a future sanitized reason-bearing receipt; the old receipt cannot supply it.
