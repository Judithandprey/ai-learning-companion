# P0-04 storage and PostgreSQL verification

Assignment baseline: `c58c21e53d9e64df94b11dd00b2ac2d392924235`; integrated HTTP
baseline: `f02618f907a6e2335bf88a01ddba84b0354a1fd4`, contracts 0.1.0.

Implemented: one canonical actor-scoped JSONB repository, migration version/checksum
tracking, an immutable-record trigger, explicit test-only MemoryStore, and an
independent real PostgreSQL runner. No database service, paid executor, provider
connection or production queue was created by this work.

## Local evidence

From `wt-backend`, with the already locked lead environment read-only:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_storage.py
```

Result: **12 passed**. Checks exercise actor isolation, deep-copy ownership,
whole-transaction rollback, exact replay versus original-record replacement,
explicit erasure, escaped transaction handles, nested transaction rejection,
concurrent increments and invalid JSON rollback. These are MemoryStore tests;
they do not establish PostgreSQL correctness.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_check
```

Observed result: **exit 2**, `BLOCKED: LC_TEST_DATABASE_URL is absent; real
PostgreSQL acceptance is unverified`. The runner does not skip, select SQLite,
or substitute MemoryStore. The domain harness was separately exercised against
MemoryStore (six checks), solely to catch fixture/API wiring errors before a DSN
is available. SQL and PostgreSQL races remain **unexecuted**, not passing.

The migration CLI also exits 2 with a missing `LC_DATABASE_URL`. Neither command
prints a DSN, password or driver exception message.

## Migration and runtime

Supply a PostgreSQL DSN through the environment/secret injection mechanism. Do
not put credentials in a command argument, repository file or test report. Use a
dedicated **test** database for `LC_TEST_DATABASE_URL`; the test role needs schema,
table, function and trigger creation privileges. The runner uses `lc_backend`,
retains migration tables, and removes only its unique synthetic actor records.
It does not provision PostgreSQL or create databases.

```sh
python -m services.api.migrations apply
python -m services.api.migrations apply --database-env LC_TEST_DATABASE_URL
python -m services.api.tests.postgres_check
```

`migrate()` serializes migration runs with a transaction-scoped advisory lock,
checks already-applied migration hashes, and executes all pending DDL plus version
records in one transaction. Reapplying an unchanged migration is a no-op; an
unknown version or changed applied file fails. Application startup must apply
migrations explicitly before constructing `PostgresStore(DSN)`; the repository
does not auto-migrate, create an identity system, or fall back on transient data.

`0001_documents` creates `lc_backend.actors` and `lc_backend.documents` with primary
key `(user_id, kind, doc_key)`, an actor foreign key, and JSON-object validation.
The database trigger prevents document identity/creation-time changes and payload
updates for `snapshot`, `frame`, `event`, `note_revision` and `artifact`. Exact
replay is allowed. Mutable heads have separate kinds. Explicit erasure may delete
immutable rows; source/note tombstones and stale-job guards are domain operations.
No trigger fingerprints server `received_at`; event replay comparison belongs to
the domain inside the same transaction.

Rollback is destructive and must be performed with services stopped and originals
exported/backed up. The CLI requires the explicit erasure flag:

```sh
python -m services.api.migrations rollback --confirm-erasure
```

This rolls back the newest migration and deletes its version receipt in the same
transaction. For 0001 it drops the document and actor tables and trigger function;
the empty schema and migration ledger remain. It is not a data-preserving downgrade.
The rollback SQL is supplied but not executed without a dedicated database.

## Real PostgreSQL acceptance prepared

The standalone runner will exercise:

- Migration apply/reapply, fresh-Python-process source readback, and actor isolation.
- Rollback of a mixed insert/update/delete transaction, database unique identity,
  repository and direct-SQL immutable-record rejection.
- Proof that a second connection cannot acquire an actor lock held by the first;
  CAS from distinct PostgreSQL backend PIDs and concurrent event deduplication.
- Actual `Archive.events` exact ACKs and mixed-batch rollback; actual note CAS
  with original revision retention.
- Actual budget reservations competing for 60,000 of the 100,000 CNY-fen cap,
  concurrent idempotent settlement, retry exposure, server-controlled Los Angeles
  month, and retained uncertain-execution exposure until reconciliation.
- Actual source deletion racing final job commit, followed by proof of no surviving
  output/source and rejected stale replay; cancellation and revoke/regrant fences.

Fresh-process readback proves application restart persistence. It does **not**
prove PostgreSQL server crash recovery, backups, failover, or device restart/sync.
No real provider, OAuth/account connection, device capture or paid call is part of
these checks. Missing DSN currently blocks all real database acceptance.

## Locking and rollout limits

Every repository transaction inserts the actor row if needed, obtains its
`SELECT ... FOR UPDATE` lock, and retains it until commit/rollback. Reads run at
READ COMMITTED so a waiter observes the previous writer's committed state. Domain
ownership checks, budget decisions and derived-output writes must happen inside
this one transaction; do not run provider/network operations while holding it.
These choices follow the documented [PostgreSQL row-lock lifetime](https://www.postgresql.org/docs/17/explicit-locking.html)
and [Psycopg connection transaction behavior](https://www.psycopg.org/psycopg3/docs/basic/transactions.html).

This deliberately serializes **all** operations for one user, including reads.
Different users can proceed independently. Per-transaction connection setup,
whole-user kind scans, JSONB documents and in-database fixture bytes are P0
correctness choices, not measured production throughput. Future pooling, granular
locks, query indexes and blob storage need compatible migration/integration review.
The database application role is trusted: this is application-enforced ownership,
not PostgreSQL row-level security against arbitrary SQL access. Direct writers
that bypass the repository must not be granted as an alternative app path.
