# P0-09 PostgreSQL lifecycle contention follow-up

2026-09-28. Backend owner execution in `wt-backend`, branch `team/backend`.
Lead-assigned baseline `bc7162d3990b31c3418b437468c41013ee4038f1` was read and
normally merged as `f36785c9064a167a041f2ffccba2d069397fe884`; the worktree was
clean before the merge. This continues the existing P0-09 card and its R58/A31
stop/deletion/original-preservation foundation, with no product scope expansion.

Read current AGENTS/TEAM/backend guidance, task card, current decisions and relevant
full requirement/contract clauses, plus the lead's exact
[integration review](../lead/p0-09-capture-integration.md). Independent read-only
review also checked the source/English manifest hashes. PONYTAIL LITE reuses the
existing PostgresStore, runner, actor inventory and installed Psycopg; no dependency,
production store/domain/API, shared contract or migration is changed.

## Correction to previous evidence

The original `75f4e33` runner set `second_started` before entering the second
database connection and actor lock. The first gate could therefore open before
that connection actually waited. Its 26 passing groups established both ordered
lifecycle outcomes, **not observed database contention**. The prior report is
qualified explicitly, preserving its original execution and signed-zero failure.
The lead's finding was an evidence gap; no production archive defect was found
or repaired in this follow-up.

## What establishes the wait now

Each test uses unique short `application_name` tags on its two PostgresStore DSNs.
The first worker's real connection PID is captured while its transaction is held
after domain writes, before commit. A separate autocommit observer reads fresh
PostgreSQL state. The gate opens only after **one query** establishes all of:

- The uniquely tagged waiter belongs to the current test database/role, has a
  different PID, is active and reports a `Lock` wait.
- Its active statement is the existing `lc_backend.actors ... FOR UPDATE` query.
- Its ungranted transaction-ID `ShareLock` matches the first PID's granted
  transaction-ID `ExclusiveLock`.
- `pg_blocking_pids(waiter)` actually includes the held first PID.

No thread-start flag, elapsed sleep, unfinished future or row-count outcome is
accepted as lock-wait evidence. Polling has a five-second deadline, plus at most
one in-flight query bounded to one second. Short sleeps only throttle observations.
The first gate has a ten-second safety bound; existing dedicated-runner connection,
statement, lock and idle-transaction bounds remain. No permission was broadened.

An observation exception sets abort before releasing the first gate. Both worker
transaction contexts then roll back, and executor exit joins them before the
original observation error propagates. Successful and injected-failure cases use
bounded polling for server-side session disappearance, because client close is
not an immediate server-exit acknowledgement. Failure cases then reacquire the
actor lock and verify undeleted fixture originals and no capture/replay effects.
The parent runner's exact cleanup list includes both extra synthetic failure actors.

## Commands and actual results

Only the existing locked lead environment was used; no installation:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_postgres_capture_check.py services/api/tests/test_postgres_check.py
```

**25 passed in 0.12s**: six observer control-flow checks and 19 existing runner
preflight checks. These portable tests cover fresh-snapshot enforcement, polling
until actual evidence, bounded timeout, preserving an observation denial without
retry, delayed server removal and cleanup timeout. They do not substitute for SQL.

With the operator-provided DSN privately injected as `LC_TEST_DATABASE_URL`, without
printing or committing connection details:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_check
```

**Exit 0, 27 check groups passed on PostgreSQL 18.6.** The guarded runner confirmed
the dedicated local `lc_p0_test` before mutations. The previous lifecycle group is
now backed by the observations below; one additional group covers observation
timeout/error cleanup. The existing storage/domain/budget/v1-HTTP/capture groups
also passed as part of this same runner. All owned children completed and exact
synthetic actor cleanup succeeded. No whole unchanged application suite was rerun.

Actual successful-case rows from this run (all `wait_event = transactionid`):

| Scenario | Held first PID | Waiting second PID | Matching transaction ID | Observed blocking PIDs |
| --- | ---: | ---: | ---: | --- |
| Capture commits before stop | 283374 | 283376 | 1486 | `[283374]` |
| Stop commits before capture | 283384 | 283386 | 1493 | `[283384]` |
| Capture commits before deletion | 283394 | 283396 | 1500 | `[283394]` |
| Deletion commits before capture | 283404 | 283406 | 1507 | `[283404]` |

These IDs are observations of this synthetic run, not reusable target identifiers.
Final checks still require the stop-retained original or complete deletion,
rejected cached live replay, and no resurrection when the fence wins first.

Actual injected-failure evidence, after first observing the intended wait:

| Case | Held / waiting PID | Transaction ID | Required result |
| --- | --- | ---: | --- |
| Wrong blocker → real observation timeout | 283414 / 283416 | 1514 | A correctly tagged blocked worker with the observer's unrelated PID as expected blocker times out; no false contention PASS. Both worker sessions disappear, the actor is reacquired and fixture originals survive. |
| Synthetic observer exception | 283424 / 283426 | 1520 | The original `RuntimeError("synthetic observer failure")` propagates after abort/release/join; both sessions disappear, the actor is reacquired and no capture/replay remains. |

The timeout's exact expected reason is
`intended PostgreSQL actor lock wait was not observed`. These are intentional
negative cases, not undisclosed production or permission failures. No unexpected
database failure occurred in this follow-up. Independent static review caught a
possible session-removal timing flake before execution; bounded observation fixed
it. That review did not independently run PostgreSQL.

## Unchanged artifacts and limits

All migration bytes stayed unchanged. `0002_capture_immutability.up.sql` SHA-256
remains `2e549ec626d325a3bbfabbf5fc9ad15c2441828a411889f0d785a7f5209194f2`, including
its previously documented EOF blank line. `0001` remains unchanged as well.
`git diff --check` passes for this follow-up's changes; no whitespace or permission
settings were relaxed.

This is owner-executed real PostgreSQL contention evidence, not independent QA,
production-load testing, server crash recovery or a successful migration downgrade.
It observes the specific actor-lock serialization path used by capture and its
current trusted lifecycle controls. It does not establish unrelated query/lock
paths or resolve future production registration/membership/HTTP contracts.
No new v2 endpoint, provider, account connection, service lifecycle change, device,
original-screen ink, Notability import, G7 or P1 acceptance is claimed.
