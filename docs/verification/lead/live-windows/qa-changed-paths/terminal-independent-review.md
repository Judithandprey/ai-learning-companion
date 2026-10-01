# Read-only Backend terminal/ledger review

Candidate: `69c0a0cbb2856b6931ee60404df3ae07844bcb54`.
Parent integration baseline: `7ebebb6`. Candidate exported with `git archive` into
this directory. No owner/main files were edited. Project PONYTAIL LITE applied.

Result: **no integration blocker found in the scoped correction**. This is
synthetic transport/lifecycle evidence, not provider, account, device or complete
product acceptance.

Reviewed the seven-path commit, full affected production call flow and new tests
against R38, main §7.1/7.3, Stop/failure explicit recovery and ADR 0004. The change
adds no dependency or protocol fields. Private outcome is independent of transport
submission; nonterminal typed causes and generic RPC failures remain uncertain.
Legacy v1 preserves EOF for unknown outcomes instead of reporting a definite
refusal. The bounded ledger retains old IDs, accepts scoped control cleanup at
overflow and retires the owner without replay. User Stop intent survives cleanup;
retirement is not forged as user cancellation. Sanitized retained failure facts
do not retain the raised exception traceback.

## Independent execution

Python: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.
All commands ran in the exported candidate, with its current synthetic Python
child. Provider/account/native/display/microphone/database calls: zero.

1. `python -m pytest -q services/worker/connectors/tests/test_chatgpt_request_ledger.py services/worker/connectors/tests/test_chatgpt_failure_outcomes.py --tb=short`
   — **32 passed in 3.79 s**. Output: `focused-new.txt`.
2. `python -m pytest -q services/worker/connectors/tests/test_chatgpt_local.py services/worker/connectors/tests/test_chatgpt_live.py services/worker/connectors/tests/test_chatgpt_rpc.py -k 'real_rpc_cleanup or fatal_rpc_ends_stream or terminal_wins_answer_publication or terminal_grace_expiry or stop_uncertainty_and_late_answer or inner_refusals or fatal_inner_child or history_exhaustion or stop_immediately or wrong_session_epoch or matching_interrupt or provider_failure_suspends or internal_timeout_cleanup or sent_rpc_error_cleanup or cancellation_after_submission or queued_interrupt_never' --tb=short`
   — sandbox: **37 passed, 1 failed, 332 deselected in 8.84 s**.
   Output: `focused-existing.txt`.
3. Unchanged failing test isolated in sandbox:
   `python -m pytest -q services/worker/connectors/tests/test_chatgpt_local.py::test_fatal_inner_child_closes_real_outer_pipe_with_parent_still_open --tb=short`
   — **1 failed in 5.32 s**, same `queue.Empty` waiting for outer EOF at line 1112.
   Output: `outer-eof-retry.txt`.
4. The exact command in (3) was retried through normal `require_escalated`
   approval and succeeded: **1 passed in 0.35 s**. No source, assertion or
   environment-variable changes. Output: `outer-eof-approved.txt`.
5. `git diff 69c0a0c^ 69c0a0c --check` passed.

The environment-dependent EOF result is retained, not hidden as a blanket sandbox
pass. The sandbox synthetic request log reached metadata RPCs only, without
`thread/start`; the exact blocked primitive was not diagnosed. The identical
approved test's pass supports an execution-environment limitation, not a new
source defect. No unrelated historical suites were run and the author's 419-count
was not adopted as independent evidence.

Next: Lead integrates the exact scoped correction, runs the 32 new changed-path
checks on the integrated commit, and retains existing changed-flow QA ownership.
