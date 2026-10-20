# Recoverable subprocess close — 2026-10-20

Backend correction for Lead `handoff_4a1f8ae74602379fe783ea7cdf7584df`.
Support review/probe: `89bb04878f9f5f79ac00223511acaa833c660dc9`,
`docs/verification/support/pipe-cleanup-4c5e071-review-20261020/README.md`
and `tests/probes/support/pipe_close_timeout_4c5e071.py`.
The original cleanup delivery `4c5e071` was held, not integrated. This correction
is a follow-up on that existing branch, with no reset or shared-file changes.

## Failure evidence

Support's unmodified probe was exported from that commit and run locally on
Python 3.14.4 against its pinned `4c5e071` source and parent `4e840a4`.
Only synthetic Python children were launched. Each child closes stdout on
SIGTERM but keeps stdin unread; 4,128,768 bytes remained buffered in the parent.

| Observation | Parent `4e840a4` | Held `4c5e071` |
| --- | --- | --- |
| First close | returned in 52.16 ms | `CancelledError` in 50.74 ms |
| Return code at first close | -9 | unknown / `None` |
| `process.wait()` calls at first close | 2 | 0 |
| Repeated close after harness reap | returned | `CancelledError` |
| Event-loop callback errors | none | `InvalidStateError` |

The harness reaped both children. Exit zero from this original probe confirms
its expected failure witness; it does **not** mean the held candidate passed.
The previous 119-test cleanup result missed this case.

The first cleanup timeout cancelled `stdin.wait_closed()`'s shared Future.
The second wait then raised `CancelledError` before child reaping, and the
eventual pipe callback could not complete the already-cancelled Future.

## Correction

`close()` still closes stdin, cancels and joins the parser before discarding
stdout, and calls `process.wait()` within each existing shutdown window. It
no longer awaits the shared stdin closure Future. No shielded or detached helper
waiter is introduced. After observing child exit, a still-buffered stdin
transport is aborted using its public API; the buffer guard avoids redundant
abort calls. The existing event-loop yield completes queued exit callbacks.

Terminate/kill deadlines, stdout discard bounds, pipe-error handling, and the
operator EOF/process-wait barrier remain intact. Caller cancellation still
propagates, and a subsequent serialized close can finish cleanup without
inheriting a cancelled stdin Future. No public protocol, output selection,
submission/retry behavior, or account ownership changed.

## Verification

[timeout-probe.json](timeout-probe.json) records Support's unchanged `scenario()`
against the working correction, including the source and probe SHA-256 hashes.
The first close returned in 52.03 ms with return code -9 and two process waits;
repeated close returned and no callback errors were recorded.

The probe's original `main()` intentionally pins the old source hash and expects
the old failure. It was run unchanged for the witness above. For the correction,
its unchanged scenario function was imported, called with the working connector,
and its returned observations were checked for successful close/reap/repeat and
no callback errors. Neither the original probe nor its assertions were edited.
The probe SHA-256 is
`9d26049cdce02dc41e9e0fa6f8b43aca10afebb30dbe2334dfe8fe071625111e`.

The new `test_chatgpt_close_deadlines.py` covers both timeout escalation and caller
cancellation after stdout EOF with stdin still buffered. Both require parser
termination before discard, actual SIGKILL/reaping, successful repeated close,
an intact public stdin closure waiter, and no event-loop callback errors. Test
tasks are joined and owned children are reaped even on failure. These synthetic
SIGTERM witnesses are Unix-only, explicitly skipped elsewhere.

Focused foreground command, using normal exact-command approval for local
pipe/thread support:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/worker/connectors/tests/test_chatgpt_rpc.py \
  services/worker/connectors/tests/test_chatgpt_failure_outcomes.py \
  services/worker/connectors/tests/test_chatgpt_local.py \
  services/worker/connectors/tests/test_chatgpt_live_stream.py \
  services/worker/connectors/tests/test_chatgpt_close_deadlines.py \
  -k 'refusals or handshake or terminal or receive_line or inbound_wire or lifecycle or sustained_empty or cancellation or interrupt or close or fatal or eof or reaping' \
  -W error::pytest.PytestUnraisableExceptionWarning --tb=short
```

**121 passed, 246 deselected in 8.10s**, Python 3.14.4. No warning filter was added.
This is focused lifecycle verification, not a whole-project or real-device run.

The exact allocating test behind the original hosted Python 3.12 warning remains
unknown; Python 3.12 and hosted warning elimination remain unverified locally.
Support owns independent rereview and Lead owns integration/CI observation.
Candidate 08's original output failure remains unknown. No actual Codex, model,
account, microphone, screen, GUI, TTS, billing or lock operation was performed.
This does not establish Windows/macOS or full-product acceptance.
