# Process-context adapter cancellation correction

Backend P0-09/04, 2026-09-29 UTC. Lead assignment:
`handoff_cf11967a910cbf9141c9131bfadd843b`, exact pushed baseline
`f022165d4b067cc5aff53c707a426a9d9ad39914`. The two affected adapters and
their focused test modules matched that baseline on clean `team/backend` at
`9e40baa159387f9f544f7debdd18fbb7ce83b96d`; this is an ordinary correction
on that delivery. Current workflow/card and affected original/English cancellation
clauses in requirements §10/10.1 were refreshed. All four original/English pairs
match the recorded manifest. PONYTAIL LITE reuses the standard-library exception
and the existing transaction/error boundaries without new state or dependencies.

## Failure and correction

An actually cancelled `concurrent.futures.Future` raises `CancelledError` from
`result()`. Both adapters previously caught it as an ordinary `Exception`:
`AuthorizedProcessContextReader` raised sanitized 503 `unavailable`, while
`AuthorizedImageResolver` returned `{"status": "unavailable"}`. With a separate
valid metadata guard, the latter could turn cancellation into an image gap and
permit composition to return metadata. The existing composer already propagates
this cancellation, but could not do so after the adapter swallowed it.

Before the production fix, this exact focused command failed all three guard
regressions (3 failed, 135 deselected in 0.42s):

```sh
python -m pytest -q services/api/tests/test_process_context_reader.py \
  services/api/tests/test_image_resolver.py -k cancelled_future_guard
```

Tests call `Future.cancel()` and `Future.result()` without a thread or executor.
Both reader guard positions incorrectly became 503; the resolver incorrectly
returned normally. Each adapter now explicitly re-raises standard-library
`concurrent.futures.CancelledError` before its generic exception handler. Existing
`DomainError` classification, sanitized ordinary failures and valid image gaps
remain unchanged. `asyncio.CancelledError` and other `BaseException` subclasses
continue to propagate. Exceptions from transaction entry, reads or exit stay inside
this same propagation boundary; an exit cancellation cannot publish the result.

## Focused verification

Using the existing shared virtual environment, after the correction:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_process_context_reader.py \
  services/api/tests/test_image_resolver.py
```

**149 passed in 16.96s.** Fourteen new cases cover actual Future cancellation at
both reader guard positions and the resolver guard; transaction enter/read/exit
for both adapters; unchanged `asyncio.CancelledError` and `KeyboardInterrupt`
propagation; and resolver cancellation through the unchanged composer after a
separately valid metadata read. Every new case asserts no returned partial result
and unchanged actor documents. Existing ordinary `RuntimeError` failure and
`DomainError` classification tests also pass. Production and test diffs were
reviewed; `git diff --check` passed. No broader previously passed campaign was rerun.

## Limits and next owner

This is synthetic MemoryStore/in-process adapter and composition evidence. It does
not establish real device/provider cancellation, PostgreSQL behavior, a running
worker cancellation protocol, or either core §7.1 gate. No database campaign,
listener, provider call, activation, migration, Learning/shared/root/dependency
edit or user-preview/Paperclip operation was performed.

Lead combines this correction with Learning's separately owned read/compose/recheck
consumer and completes integration acceptance. Current-caller/final-use source
authorization, historical provenance, original ink and presentation boundaries
remain unchanged.
