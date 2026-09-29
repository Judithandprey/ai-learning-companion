# P0-09 internal persisted stream controls

2026-09-29 UTC; Backend, `wt-backend` / `team/backend`.
Assignment: `handoff_b89501b25fff47ce5f8452665468a033` from configured Lead.
Read baseline `9a861d05141bfbf9bdf6465d96392ee047edc408`, merged normally as
`615723f` while preserving completed `1596db6`. No reset or permission change.
Lead's separate archive review correction was fixed and delivered as `68274f2`
before this control segment, with its own isolated 136-test evidence.

Read current AGENTS/TEAM/backend role, current decisions, P0-09 task and released
control boundary, full applicable R36/R51/R52/R58/A16/A30/A31/A38/A42/A43,
problem-solving original/English clauses, AUDIO-14, relevant exit/continuity
verification cases, ADR 0002 §§2–5, control schema/helpers/generated OpenAPI and
QA `bd79ca4` report/module. All eight manifest source/English hashes match.
PONYTAIL LITE reuses existing actor transactions, archive, capture and contract
helpers. Source reading and this bounded test run do not pass those product cases.

## Behavior and caller responsibilities

`ControlRegistry` requires an explicitly callable current-caller guard and trusted
frozen sets of scopes/capabilities. The embedding service authenticates identity
and verifies caller expiry, token revocation and pinned authorization generation.
Account authorization is also read inside the same actor transaction. No default
guard or public endpoint exists. The test guard is explicitly synthetic.

Trusted `set_membership` establishes current owned device/session membership with
CAS and revision. Existence of two IDs is not membership. Trusted
`authorize_start` reserves an exact new stream ID against the complete registration
and original account/membership pins. Calling that method requires an independently
obtained scoped start decision; reconnect/request booleans never issue it. Register
consumes its pending grant with the new state, lineage and idempotency entry in
one transaction. Rejected transactions consume nothing.

Internal producer identity is assigned by the trusted adapter and stays stable
for the capture path. It distinguishes independent producers on the same device
and session, not an extra wire property or a global microphone/single-stream rule.
An actual stored predecessor requires restart with a new ID and unknown gap.
An initial label cannot hide it. Account or membership changes close old bindings
and invalidate pending starts; fresh authority can register a fresh incarnation
without making the old generation readable/current again. A scoped stream stop
invalidates only that producer's pending starts. Previously used control and
legacy capture binding/slot IDs cannot become new registrations.

Register/command replay runs after current identity, membership and generations,
before CAS or grant consumption. It returns current state, including stopped or
withdrawn, rather than an old live receipt. Keys bind owner/method/full path/full
validated body; a changed body conflicts. A new key against a stale revision
requires reconciliation. Missing/foreign/deleted identities return `not_found`.
There is no old-ID resume or implicit regrant.

Finite stop/seal requires the configured read-only `stop_fact_resolver` to resolve
an independently persisted producer fact under the actor transaction. The request's
boundary and server received maximum are never copied into that fact. A known
boundary cannot contradict the durable same-stream slot floor, even after source
deletion. Zero needs both an empty committed stream and independent proof no
sequence was ever assigned. Unknown stops block all transmission until explicitly
sealed. Withdrawal forbids both transmission modes while retaining authorized
history. Missing/broken producer evidence cannot prevent an unknown stop or
withdrawal. Unexpected callback exceptions are content-free `503 unavailable`.

If a producer stop fact arrives before control synchronization, live ingestion is
denied. A read still reports the last committed server control state, not proof
of device capture/stopping. Known historical permission continues to require its
trusted matching fact. A future producer adapter must persist and attribute these
facts independently; this segment neither implements that transport nor proves
an actual device stopped.

`registry.capture` uses existing unchanged capture 0.2.0 ingestion. The resolver
reads current sources, all accessible versions, membership, account generation and
stop fences under the same transaction through commit. Source deletion runs in
the existing archive transaction; it erases relevant originals/replays and keeps
opaque slots to fence reuse. A stream can span sources; deleting one source does
not destroy independent work or redefine a stream as globally deleted.

## Adjacent QA findings and exclusions

Direct `CaptureArchive` callbacks now reject malformed collection types as well:
scopes/capabilities must be frozen sets of strings, source versions pairs, and
attempts triples with typed integer revisions. This fixes local CAPTURE-AUTH-01
without modifying shared contract bytes. An attempt relation still has no resolver.

The new control-backed ingestion rejects artifact-reference batches as
`409 dependency_missing`. Typed upload and cross-family artifact sharing remain
inactive until Lead supplies the explicit pin/deletion rule and contract.
The prior synthetic standalone capture seam is preserved. A pending capture
reference does not establish ownership of independent v1 ink. QA's order-dependent
shared artifact deletion/pin findings remain open for that separate shared follow-up.

Repeated large-batch validation/ancestor traversal under the actor lock remains
the known QA availability/performance issue. No fast path skips validation, and
these small focused tests do not establish throughput. HTTP activation, attempts,
disclosure/export, AI/provider calls, device/runtime controls and model/permission
configuration were not added or changed.

## Actual portable verification

Portable results use MemoryStore/ASGI and synthetic trusted decisions, not
PostgreSQL or device evidence. The test author ran **83 new control tests in
0.64s**. Root's final module/contract regression command was:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests packages/contracts/tests/test_process_control.py packages/contracts/tests/test_process_v2.py
```

**580 passed in 2.93s**, exit 0. This includes the new control cases, existing
backend behavior and the released control/capture contract tests. The focused
legacy capture/source-deletion check also passed 66 tests before that final run.
No unrelated application-wide or device suite was executed. `git diff --check`
passed; original migration hashes remained unchanged.

Independent static review found two issues before final execution: missing
optional caller guard and raw stop-resolver exceptions. Both were corrected
with explicit regression checks; the reviewer found no remaining blocker but did
not independently execute tests or access PostgreSQL. No runtime control assertion
was weakened to obtain passing results. Synthetic trusted stop facts/guards in
these tests are explicit fixture services, not production authority evidence.

## Actual PostgreSQL verification

Used the existing locked lead environment read-only. The operator's existing
private DSN was injected in process without printing or committing it:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_control_check
```

**Exit 0; 12 focused groups passed on PostgreSQL 18.6
(Ubuntu 18.6-0ubuntu0.26.04.1).** Dedicated target validation checked local
`lc_p0_test` before writes. Existing migration checksum/apply and no-op reapply
checks passed. No new migration or database service was created. Twelve unique
synthetic actors were cleaned. A separately owned short-lived child process read
back durable current state and originals; this is not DB crash recovery or HTTP.

Four functional groups cover exact idempotent capture/control replay and changed
bodies; unknown stop then independent seal; withdrawal; fresh restart predecessor
and unknown gap; independent producer; fresh-process reads; genuinely empty zero;
retained deleted slots preventing a false zero; and injected pre-commit failures
rolling back registration/grant/lineage/replay/control/deletion atomically. Exact
registration retry after its rollback succeeds. Intended rejection cases remain
negative assertions, not successful mutations.

Eight concurrency groups observe real independent connections waiting on the
held actor row transaction **before release**, using the existing SQL observer:

| Order | Holder PID | Waiter PID | Transaction ID | Result |
| --- | ---: | ---: | ---: | --- |
| Capture → stop | 24591 | 24593 | 1659 | Original commits, then stop blocks replay/live transmission |
| Stop → capture | 24605 | 24607 | 1670 | Capture rejected, no slot/original committed |
| Capture → source delete | 24619 | 24621 | 1681 | Delete removes original/replay body; opaque slot remains |
| Source delete → capture | 24633 | 24635 | 1692 | Capture rejected, no resurrection |
| Capture → membership removal | 24647 | 24649 | 1703 | Original preserved; later ingestion forbidden |
| Membership removal → capture | 24663 | 24667 | 1714 | Capture rejected before write |
| Registration → revoke/regrant | 24687 | 24689 | 1724 | Registration commits once; lifecycle closes/fences old incarnation |
| Regrant after revoke → delayed old registration | 24707 | 24709 | 1741 | Old pending decision cannot inherit new generation; registration forbidden |

Every observed `wait_event` was `transactionid`; each waiter's `blocking_pids`
contained the listed holder. All eight groups observed worker sessions closed and
successfully reacquired the actor. IDs are this run's evidence, not reusable
targets. Each race releases held transactions in `finally`, joins its workers and
has bounded connection/statement/lock deadlines. No persistent worker or server
was started. No unexpected PostgreSQL failure occurred. The completed `17a7dc8`
27-group capture/contention runner was not rerun or counted as new evidence.

## Storage compatibility and remaining verification

Additional membership/grant/lineage/control/replay kinds reuse the existing
`lc_backend.documents` schema. `0001` and `0002`, old source records, contract v1
and capture 0.2.0 bytes remain unchanged; no backfill or migration was necessary.
Feature rollback disables new control/capture writers while retaining state,
grants, originals and opaque fences. Never erase them to permit old-ID reuse,
run a writer that ignores their permissions, or downgrade into lossy v1 content.

Actual trusted producer-start/stop adapters, public authenticated HTTP routes,
device capture/stop behavior, audio timing, source accounts, typed artifacts,
linked help/presentation, multi-device product behavior and full R/A/G/P1
acceptance remain unverified. The synthetic facts/guards test backend persistence
and ordering only. The actor-wide lock prioritizes correctness; scale/load,
pooling, fine-grained locks, replica/failover recovery and retention reclamation
are separate work. No credentials or local connection details are committed.
