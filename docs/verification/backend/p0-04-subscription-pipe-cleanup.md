# Owned subprocess pipe cleanup — 2026-10-20

Backend follow-up `handoff_43ccd426e23914ad237d9dc3319def79`, after receipt
diagnostics delivery `4e840a4b82896ded93d7844966bac60beaa47f22`.

**Fixed a reproduced cleanup gap:** a protocol-refused synthetic child could be
reaped while its paused stdout pipe remained open. The reader now stops before
bounded discard/drain, stdin closure, process reaping and completion of queued
exit callbacks. Existing terminate/kill timeouts remain unchanged. Discarded bytes
are never parsed, published, persisted or returned. Expected broken/reset pipe
errors do not skip child reaping. No warning filter, protocol relaxation, retry,
new process owner or private asyncio API was added to production.

## Original CI evidence and limits

Lead supplied the local read-only log `/tmp/lc-e56084a-python312-ci.log`.
Its lines 461–495 record a warning in the successful Python 3.12.15
[hosted job](https://github.com/Judithandprey/ai-learning-companion/actions/runs/39423782479/job/118631061878)
for main `e56084a0c45fb626c61438a433147d7bcd10c2ed`:
`BaseSubprocessTransport.__del__` attempted pipe closure after the event loop
closed; the stack included selector key `17 is not registered`. It surfaced at
`test_refusals_never_publish_or_retry[wrong_turn-protocol_error]`. The job reported
6972 passed, 20 xfailed, 1 warning. That test name does not establish where the
transport was allocated; delayed garbage collection can expose an earlier leak.

Local Python is **3.14.4**; no Python 3.12 interpreter was found in the checked
system/project/uv locations. No interpreter or dependency was installed.
A first focused refusal/handshake/terminal run with unraisable warnings treated
as errors passed 34 tests, so it did not reproduce the exact hosted warning.

An independent bounded probe using the existing `flood_line` fake and
`MAX_LINE_BYTES=8192` did reproduce the underlying open-pipe condition:

| Case after old `close()` | Child reaped | Transport closed | Stdout paused | EOF received |
| --- | --- | --- | --- | --- |
| `flood_line` | yes | no | yes | no |
| `wrong_turn` | yes | yes | no | yes |
| `oversized_answer` | yes | yes | no | yes |
| `disconnect` | yes | yes | no | yes |

This is a plausible source of delayed-GC cleanup warnings, not proof of the
exact originating test in that Python 3.12 job. The strengthened existing line
limit test failed before the fix: **1 failed in 0.46s**, with unread paused stdout
after a known child exit. No assertion or timing was weakened.

## Verification

The line-limit test now requires stdout EOF and closed transport before its
event loop exits. Two additional cases ensure already broken/reset stdout still
allows reaping. The existing buffered-child test double implements the public
`read()` EOF operation needed by cleanup; its fairness assertions are unchanged.

During review, the first draft exposed two issues that were corrected before
delivery: queued process-exit callbacks could outlive the immediate `wait()`
return, and a stdout read error could abort cleanup. The first focused run was
112 passed / 5 failed (one callback assertion and four incomplete test doubles);
the new pipe-error cases then failed 2/2 before their correction. These runs are
not passes. The callback barrier yields one event-loop turn inside the existing
timeout; it does not add a fixed delay or expand the shutdown allowance.

Final foreground command, with normal exact-command approval for synthetic
pipe/thread tests:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/worker/connectors/tests/test_chatgpt_rpc.py \
  services/worker/connectors/tests/test_chatgpt_failure_outcomes.py \
  services/worker/connectors/tests/test_chatgpt_local.py \
  services/worker/connectors/tests/test_chatgpt_live_stream.py \
  -k 'refusals or handshake or terminal or receive_line or inbound_wire or lifecycle or sustained_empty or cancellation or interrupt or close or fatal or eof or reaping' \
  -W error::pytest.PytestUnraisableExceptionWarning --tb=short
```

**119 passed, 246 deselected in 8.02s.** `git diff --check` passed. This was a
focused cleanup regression, not another whole-project run. No installed Codex,
model, account, GUI, microphone, speaker, screen, CI or dependency operation ran.
The operator EOF/process-wait synchronization regression remains intact.

Lead owns integration and the next existing Python 3.12 matrix observation.
Exact hosted-warning elimination remains unverified until that runs. This
cleanup fix does not diagnose Candidate 08's output failure, authorize a live
replay, or establish Windows/macOS/audio/full-product acceptance.
