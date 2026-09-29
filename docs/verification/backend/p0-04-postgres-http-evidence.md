# P0-04 real PostgreSQL and P0-07 HTTP persistence evidence

Executed on 2026-09-28 UTC in `wt-backend`, branch `team/backend`. Coordination
baseline: `7fdebd87e93b0e863beeef932565b5a3af2dc446`; normal merge:
`ebbc390` (the branch's existing `e8258c1` documentation additions were preserved).
Current backend implementation matches that integration baseline; this delivery
changes tests, runner constraints and evidence only. Contract remains **0.1.0**;
`0001_documents` and production code are unchanged.

Read current AGENTS/TEAM/backend role/P0-04 card, relevant full main requirements
R02/R04/R27–33/R38–41/R43–47 and §3.2/3.7/7.4–7.5/9–10, confirmed intent and
archive-continuity verification, with the corresponding English working clauses.
All eight source/translation content hashes matched the current manifest. This
verification supports the existing source, budget, cancellation and note-persistence
requirements; it does not implement the pending P0-08 process contract. PONYTAIL
LITE reused the existing runner, storage, migration, fixture and auth boundaries.

## Environment and isolation

The operator's ready handoff reported PostgreSQL **18.6 (Ubuntu
18.6-0ubuntu0.26.04.1)**, dedicated `lc_p0_test`, Unix-socket-only access with local
peer authentication, and no project migration/test previously run by the operator.
Backend read the handoff and injected its DSN from the owner-readable file into
the runner environment without logging it. Connection addresses, credentials and
local connection files are not recorded in this commit.

The pre-existing runner accepted any nonempty DSN. The task's dedicated-database
constraint justified adding a preflight before **both** migration and cleanup:
Psycopg parses the connection string, requires explicit `lc_p0_test` and one local
endpoint, rejects indirect service/host-address overrides, and checks actual
database/endpoint through a read-only connection. Negative guard tests assert that
rejected targets never connect/migrate/clean up and never disclose the secret marker.
Test-only statement/lock/idle-transaction timeouts bound ordinary SQL blocking;
they are not a hard wall-clock deadline for a frozen database server.

Each run uses fresh UUID-based synthetic actor IDs. Cleanup deletes exactly its
seven actors and their documents; the migration ledger/schema remains. There is no
database reset, migration downgrade, general actor sweep or access to other databases.
The operator owns database lifecycle; backend did not start/stop/provision it.

The HTTP extension reserves ephemeral **127.0.0.1** listeners and supervises only
its own three Uvicorn subprocesses. Each child is terminated and waited before the
next starts; exception cleanup has terminate/kill/wait bounds. Random local-test
tokens and connection configuration go through the child environment, not arguments
or logs. Child output is suppressed to prevent driver errors exposing connection
details. The harness injects the existing `create_app`, `PostgresStore`,
`LocalTestAuthenticator` and local scopes with an isolated actor; it does not alter
the production local factory's fixed fixture identity or restore auth on restart.

Used the lead's existing environment read-only: FastAPI 0.141.1, Uvicorn 0.54.0,
Psycopg 3.3.6, HTTPX 0.28.1. No dependency install, provider call, public listener,
cloud resource or persistent API service was created.

## Actual commands and results

From the backend root, with the operator DSN injected into `LC_TEST_DATABASE_URL`
without printing it, the existing interpreter ran:

```sh
../repo/.venv/bin/python -m services.api.tests.postgres_check
../repo/.venv/bin/python -m pytest -q services/api/tests services/worker/core
git diff --check
```

The runner was invoked by a short `runpy.run_module(..., run_name='__main__')`
wrapper that read the supplied DSN file into the process environment. Normal
exact-command approval permitted local socket access. The existing runner first
passed all **14** storage/domain groups (exit 0, about 0.78 seconds). After wiring
the HTTP extension, the complete runner passed **19** groups (exit 0, about 2.85
seconds). These are named acceptance groups, not 19 independent pytest cases.
The module suite then reported **169 passed in 0.83s**, including 19 new preflight
guard cases. All tests ran without skips. Whitespace checks passed.

Complete extended runner output, with no connection details:

```text
PASS: migration apply and idempotent reapply
PASS: fresh-process immutable source readback
PASS: same-key authenticated actor storage isolation
PASS: transaction rollback preserves originals, head and atomic batch
PASS: repository immutability, DB immutable trigger and primary-key uniqueness
PASS: second connection cannot enter locked actor transaction
PASS: two independent backend connections CAS: one save, one conflict
PASS: two-connection immutable event replay: one insert, one duplicate
PASS: domain concurrent EventBatch replay returns exact accepted/duplicate ACKs
PASS: domain mixed valid/conflicting EventBatch rolls back completely
PASS: domain concurrent note CAS preserves revision 1 and commits exactly one revision 2
PASS: domain concurrent budget reservation/settlement, retry exposure, LA month and unknown-outcome retention
PASS: domain source deletion races final job commit; no source/output resurrection
PASS: domain cancelled jobs and stale authorization generations cannot write outputs
PASS: real HTTP event/correction and note CAS writes commit to PostgreSQL with separate original/AI layers
PASS: terminated API process and new API process preserve exact source/version, note history and original bytes
PASS: post-restart HTTP idempotency receipts, duplicate events and conflict rejection preserve immutable originals
PASS: HTTP expired/revoked tokens reject access; persisted revocation survives API restart and stale regrant
PASS: all owned HTTP processes terminated and waited; historical fixture never activates live capture
PostgreSQL version: 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
PASS: real PostgreSQL storage/domain/budget/job/HTTP restart suite
```

## What the HTTP path demonstrates

The controlled fixture importer supplies an immutable source/frame plus synthetic
original ink through existing administrative hooks. Actual network requests write
an event and linked correction, a user-original handwritten note revision, and a
second revision with a separate assistant supplement. Responses are checked against
existing shared wire validators and exact expected ACK/commit results.

After the first API process exits, a distinct process reads the same source ID,
snapshot/version, latest note and original note revision. Full immutable document
sets, including event text, source/context links and opaque original ink bytes,
remain equal. Exact retry returns the persisted receipt; another event request key
produces duplicate ACKs. Changed events/key reuse, conflicting note revisions and
an assistant attempt to replace the user's original are rejected without changing
the saved history or current head.

Expired and token-revoked credentials fail for HTTP reads/writes. Persistent actor
revocation rejects cached write retries, survives another real API process restart,
and is not restored by child initialization. A later regrant still rejects the old
authorization generation. Fixture replay does not activate live capture. All owned
API children are stopped at return, including exceptional parent exits.

The preliminary lifecycle-only probe initially encountered the workspace sandbox's
socket `PermissionError` before starting a child. The normal approved retry passed
normal and exceptional child cleanup using expired credentials and no database calls.
Both actual PostgreSQL runner invocations passed on their first attempt. No production
correctness defect was observed, so no production assertion or implementation was
weakened. A second read-only reviewer found no material target, cleanup, lifecycle
or HTTP assertion issue; review itself is not an additional execution result.

## Remaining boundaries

- This closes the identified **backend HTTP/database persistence portion** of
  P0-07. Browser/iPad capture, real course parsing, provider responses, UI reopen
  and the full select/card/save/source-recovery chain remain unverified. P1 is not
  accepted. Local test authentication is not OAuth/G4.
- Ink bytes are project-authored opaque fixtures, not a real PencilKit round trip;
  there is no Notability import or native editable-stroke claim.
- API process restart is tested; PostgreSQL server crash recovery, backup/restore,
  failover, load, independent-device offline synchronization and migration downgrade
  are not. Migration apply/reapply is covered; destructive downgrade was not run.
- Existing deletion/commit concurrency permits either serial winner but does not
  deterministically force both orders. Cancel and revoke/regrant checks are
  sequential fences, not a comprehensive concurrent cancellation matrix. These
  limits are retained rather than relabeling the existing runner as exhaustive.
- The subprocess harness uses Unix inherited sockets; Windows portability has not
  been tested. P0-09 process endpoints still await P0-08. No paid executor is enabled.
