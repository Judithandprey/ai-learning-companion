# Reject display sources from legacy jobs

2026-09-29 — Backend P0-04/P0-09 corrective follow-up, exact parent
`a659364e581106fd50bf831015f171cf688564a4`. Lead message
`handoff_6a203dbaa922661e09548359e1d10fbc` explicitly extended this task's write
scope to `services/worker/core/jobs.py`, owned tests and evidence. The previous
[display-source report](p0-display-sources.md) disclosed this unadopted consumer;
this correction closes that specific admission gap without enabling a worker.

The already-read display_source 0.2.3 obligations and affected R02/R03/R07/R29/
R30/R35/R36/R51/R52/R58/R59 requirements remain unchanged. PONYTAIL LITE reuses
`display_sources.require_legacy`, existing Jobs guards and the actor transaction.
No new queue, source model, schema, migration, dependency or executor is introduced.

## Actual failure and correction

Before editing, Backend ran the lead's fixture-only probe using production
`register_display_source`, then `Jobs.enqueue(kind="source_sync")`, `begin`, and
`commit`. The observed sequence was **queued → running → completed**, with a
derived output for a display SourceRef. There was no external executor/network
call. This was an admission defect, not evidence of a working source connector.

The shared job source lookup now rejects both a display/unknown explicit variant
in the mutable source head and one in the referenced snapshot with
`409 unsupported_source`. New enqueue checks before job/request/budget binding;
begin and commit use the existing guarded transaction, including completed-output
replay. Cached enqueue also checks both its input references and the persisted
job's actual references before returning a status, so a restarted Jobs object or
an old request receipt cannot bypass the source-family restriction.

Only the variant check is added to cached status replay. Other legacy replay,
generation, lifecycle, source freshness and budget semantics remain unchanged.
Cancellation, recording uncertain outcomes, reconciliation and cancellation
acknowledgment retain their existing paths: rejecting new processing must not
prevent safe cleanup of an older job. Original source records are not changed.

## Verification

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_display_jobs.py \
  services/api/tests/test_budget_jobs.py
# 79 passed in 0.30s (16 new cases plus 63 existing regressions)
git diff --check
# exit 0
```

The existing suite covers legitimate legacy completion/replay, cancellation,
unknown-outcome reconciliation, reservations, stale-source/generation fences and
atomicity. New display/unknown-variant regressions compare complete actor storage
before and after rejection, including job receipts, derived outputs, reservations
and budget-to-job bindings. These are synthetic MemoryStore checks.

The 16 new cases cover production display registration before enqueue; unknown
explicit versions independently in head/snapshot; a persisted job's display
reference hidden behind cached legacy input; and both discriminators during
queued/completed/stale enqueue replay, begin, commit and completed replay, using
a fresh Jobs object. Pre-fix failure evidence is the independently executed lead
probe above; the new test file was first run after the implementation fix and
does not claim a separate pre-fix red run.

The read-only reviewer independently reproduced the original `a659364` behavior
and passed 10 focused post-fix scenarios for new/cached enqueue, begin, completed
commit replay, both persisted reference sets and head/snapshot guards. It also
confirmed legacy cached-status and cancellation/reconciliation behavior remained
intact. No remaining bypass was found in this bounded review.

No DB, provider, service, preview/Paperclip, account or device operations occurred.
The change does not implement display-consuming background work. Lead next
integrates this separate correction with the reviewed display-source delivery;
native transport, process export and real product acceptance remain separate.
