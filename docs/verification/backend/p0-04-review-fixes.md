# P0-04 integration-review fixes

Date: 2026-09-28. Backend, `team/backend`, worktree `wt-backend`.
Implementation reviewed by the lead: `803916ff5d1663cb970636b22bb897d89d083da0`.
This repair starts at `014d1807afcaa7b8a34ac4b6cf1c7639fc275d55`, retaining its
completed P0-09 documents. Shared contract remains 0.1.0 at the existing
`f02618f907a6e2335bf88a01ddba84b0354a1fd4` implementation baseline. No shared
schema, dependency, migration, paid executor or account connector changed.

## P1: cancellation before an unknown external outcome

Confirmed the lead's reproduction before changing production code:

```sh
PYTHONPATH=/home/agentsdock/Projects/learning-companion/wt-backend /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/p004-audit-m0ff36id/repro_cancel_unknown.py
```

Actual original result: `begin -> cancel` left the job `cancelling`;
`mark_unknown` returned `409 job_not_running`; both unknown flags stayed false.
ACK changed the job to `cancelled`, budget release succeeded, and `reserved_fen`
became 0 without reconciliation. No actual provider call was involved.

`Jobs.mark_unknown` now accepts a started `running` or `cancelling` job, and
records job/reservation uncertainty in the same actor transaction. Cancellation
does not prove that a provider operation failed to execute. Repeat unknown reports
remain idempotent while unresolved; ACK, release and settlement require trusted
reconciliation. The method rejects unstarted tasks, terminal states and an already
reconciled call, including an unbudgeted reconciled task awaiting cancellation ACK.
No new request field, retry permission or public endpoint was added.

Expanded regression command before this repair: **7 failed, 56 passed**; after
repair: **63 passed**:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest services/api/tests/test_budget_jobs.py -q --tb=short
```

Coverage includes both serial orders, a two-thread cancel/unknown race, duplicate
reports, held budget, actual zero/nonzero settlements, absence reconciliation,
matching evidence, terminal replay, an unstarted cancelling job, and no-budget
reconciliation. Injecting a job-write failure after the reservation flag write
rolls both records back. Existing terminal-state and no-output behavior is retained.
An independent read-only local reviewer checked the state guards and highlighted
the unstarted-cancelling and unbudgeted-reconciled cases before final validation.

## P1: deleting one source erased another source's original note

A delegated backend reviewer ran the lead's local reproduction on the unchanged
implementation:

```sh
PYTHONPATH=/home/agentsdock/Projects/learning-companion/wt-backend /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/p004-audit-m0ff36id/repro_cross_source_delete.py
```

The sequence was a B-course handwritten revision, followed by an assistant's
A-source supplement, then deleting A. B's source/event survived but B's original
revision and its only ink artifact were deleted. The new permanent regression
fixtures reproduce this with synthetic records in `test_source_deletion.py`.

P0 has no safe per-source partition of a note's immutable blocks/ink/history.
`Archive.delete_source` therefore inspects **every revision** of each affected
note before making any writes. Another source's context or evidence produces
`409 mixed_source_note_conflict`. All source records, original ink, note history,
derived data and replay receipts remain unchanged; A has **not** been deleted.
This explicit conflict is the conservative behavior authorized by the lead,
not a claim of partial deletion or an automatic note rewrite. Mixed-source
deletion requires a later coordinated dependency/erasure design.

Pure single-source deletion remains idempotent and removes that source's history,
unreferenced artifacts and cached response contents, retaining tombstones against
replay. Independently referenced artifacts and unrelated notes are preserved.
Tests cover event-only added dependencies, separate-source historical revisions,
repeated rejection, old/current note reads, cache replay, single-source deletion,
shared-ink references, and rollback after an injected artifact-delete failure.
An unbound original or context segment without any source event is not a legal
0.1.0 note; no fabricated internal state was used to claim such input coverage.

New deletion regressions before repair: **4 failed, 2 passed**. After repair,
the six new cases plus existing archive/storage/HTTP checks: **65 passed**:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest services/api/tests/test_source_deletion.py services/api/tests/test_archive.py services/api/tests/test_storage.py services/api/tests/test_http.py -q
```

## Final validation and limits

From this worktree, using the existing lead environment read-only:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests services/api/tests -q
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m compileall -q services/api services/worker/core
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_check
git diff --cached --check
```

- Full relevant suite: **215 passed in 1.05 s** (69 shared + 146 backend;
  budget/jobs increased from 49 to 63, plus six new deletion cases).
- Python compilation and staged whitespace validation: exit 0.
- Real PostgreSQL runner: **exit 2, BLOCKED** because
  `LC_TEST_DATABASE_URL is absent; real PostgreSQL acceptance is unverified`.

Domain tests use explicit MemoryStore, ASGI tests use the in-process transport.
The thread race establishes only the memory-double ordering; PostgreSQL row-lock,
restart, rollback and multi-process behavior still need actual database execution.
The internal cancellation ACK remains a trusted worker safe point, not permission
to declare an in-flight call stopped. No real external executor, reconciliation
provider, device test, persistent service, installation, network call or push ran.
Main integration and independent acceptance remain the lead's next step.
