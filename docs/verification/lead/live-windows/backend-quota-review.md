# Backend subscription quota pair — bounded review

**APPROVE source integration; public quota visibility remains an open dependency.** Reviewed `65591981e184f2d9b9808fd477a467959d4b2db6` + correction `63e9bcbc2a894ca5da8772deac1e51fa65c51fde` against parent `1b27a918f265349929d6344f0bbe163c6a854b99`. No blocking source finding in the final pair. Applied PONYTAIL LITE and refreshed committed R38/§3.8, G4 and subscription decision original/English scope. The earlier blanket included-usage veto remains recorded as failure history, not accepted behavior.

- `chatgpt_rpc.py:_turn_error_code` is shared by both error notification and failed-turn paths. Authoritative usage limit, transient rate limit, session budget and authentication errors stay distinct. Unknown/object-valued classifications remain incomplete-turn; provider prose/HTTP status does not invent exhausted credits. Fixed public error messages retain redaction.
- `_credits` retains boolean credit/unlimited facts and exact bounded opaque balance strings without float conversion. Missing/null data stays unknown. `_quota` retains per-bucket identity and model scope, preserves a known map key when snapshot ID is null, and rejects conflicting IDs or malformed values. Empty maps use the legacy snapshot; nonempty foreign maps do not borrow its credit facts.
- ASK no longer treats `ordinaryUsageAllowed=false`, full usage percentages or balances as a blanket denial or a guarantee of recovery. An explicitly requested turn reaches the official server unless a known applicable spend/workspace restriction refuses before thread/turn submission. A foreign/model-mismatched bucket cannot supply that refusal or erase an applicable restriction. Cancellation fences and authoritative subsequent failures remain; no reset-credit operation, purchase, account mutation or inference retry was added.
- `chatgpt_local.py` keeps `lc-subscription-ask/1` unchanged: rate/session-budget → `failed`, workspace/included-use class → `unavailable`, authoritative usage limit → `quota`. The richer credits/bucket facts are internal only. This pair does **not** close public unknown/known credit visibility or bucket ownership; those require the promised versioned live interface/consumer.

## Executed offline checks

Exact export: `/tmp/backend-quota-63e9bcb`. Python was `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`; `-B` and no pytest cache avoid incidental source writes.

```sh
python -B -m pytest -q -p no:cacheprovider \
  services/worker/connectors/tests/test_chatgpt_rpc.py \
  -k 'authoritative_error_classification or full_windows_and_credit or included_usage_flag or exact_single_codex_workspace or workspace_admission or applicable_spend_control or empty_multibucket_view or workspace_bucket_with_matching or credit_snapshot_rejects' --tb=short
# 85 passed, 108 deselected in 2.03 s

python -B -m pytest -q -p no:cacheprovider \
  services/worker/connectors/tests/test_chatgpt_local.py \
  -k 'inner_refusals or connection_read_preserves' --tb=short
# 10 passed, 75 deselected in 0.25 s

python -B /tmp/backend-quota-run-supplied.py
# 7 PASS / 2 FAIL; exit 1, intentionally retained
```

The last command imports the supplied probe's **unchanged** `load_fixture`/`run` functions from the exact path named in owner evidence. Its hash matches `41f46f704c0c53ee50012241b6a469fab96c103248dd6315878c9d8539a6f1af`. The wrapper replaces only the original CLI's Git-HEAD receipt lookup because this export has no Git repository; all assertions, fake transport cases and production paths remain unchanged. Exact source hashes are recorded.

Actual failed checks, **not passes**:

1. Unknown credits remain distinguishable from both known states — public v1 still projects identical views.
2. Credit availability stays attached to its bucket — swapping bucket credits still projects the same public v1 view.

The other seven checks pass: available-credit admission (single/multi-bucket), distinct rate/usage failures in both channels, explicit spend refusal with own/foreign credits, and no retry/reset/account mutation. No modified probe asserts the failures away. New test coverage also includes malformed snapshot rejection, pre-cancellation with zero submissions, matching/foreign bucket scope, empty-map fallback and fixed-error projection.

Both committed source receipts match their actual code: all three baseline hashes match `6559198`; all three corrected receipt hashes match `63e9bcb`. The corrected receipt truthfully records its preceding HEAD plus working changes, with exact hashes binding tested bytes. Scoped `git diff --check 1b27a918 63e9bcb` passes. No broader old suite was repeated.

Logs: `/tmp/backend-quota-rpc-focused.txt`, `/tmp/backend-quota-v1-focused.txt`, `/tmp/backend-quota-independent-probe.txt`. Full synthetic probe observations: `/tmp/backend-quota-independent-probe.json`. Machine summary: `/tmp/backend-quota-review.json`.

These checks use Python fake RPC children/private local pipes or in-memory bridge doubles only. No Codex/account/provider call, user-app/GUI operation, microphone, DB, socket service or network action occurred. Actual user credits and a real successful request remain unverified; source approval is not full quota-task or real-AI acceptance. Next owner/action: Lead's versioned live seam, then the existing connector/client owners expose preserved facts and rerun the two unchanged visibility checks.
