# Backend archive snapshot review — delivery 1596db6

Decision: **one code blocker found**: a missing leaf observation is silently
omitted even when an extant sequence receipt proves the original is missing.
The 125 supplied/focused portable checks pass. No authorization or actor-lock
blocker was found within the documented trusted internal-call boundary.

Reviewed commit: `1596db66803ff1e93026998b12efefd83dee7db1`.
Integration baseline: main `3636dd6db1e337671892d65b8f5d7919d452986a`.
No main/worker edits, commits, role messages, DB reruns, network/provider calls or
installs. Learning export-to-ArchiveSnapshot compatibility probes were deliberately
left to the other assigned reviewer.

Read the complete relevant R27–32/R58 original/English clauses, source-preservation
and process requirements, current decisions, TEAM/PONYTAIL LITE, Backend/QA role
instructions, current P0-04/P0-07 snapshot continuation, relevant original-goal
verification cases, delivery diff/README/owner report, and the existing canonical
store, ingest, deletion and authentication call paths. All eight source/English
manifest hashes matched.

## B1 — reject dangling sequence receipts without a deletion tombstone

Location: `services/api/learning_snapshot.py:75` and `:113–119` (delivery lines).
The exporter discovers observations only by scanning `event`, then validates each
surviving observation's forward link to its `event_sequence` receipt. It never
checks the reverse inventory: a receipt whose original is absent.

Reproduction on the temporary main-plus-delivery overlay:

1. Use the delivery's `seed_snapshot_history` through normal archive ingestion.
2. Export `second-course`: it contains `second-assistant`, `second-teacher`,
   `second-unknown`.
3. Under the owning MemoryStore transaction, delete only event `second-unknown`
   to model stored corruption. Its sequence receipt remains:
   `{"key": "[\"device-ipad\",6]", "event_id": "second-unknown"}`.
   There is no `event_tombstone` for that ID.
4. Export `second-course` again. **Actual:** successful result contains only the
   first two observations. **Expected:** 503 `unavailable`, with no partial result.

This is detectable missing history, not the report's acknowledged impossibility
of reconstructing unknown unreferenced history: the durable sequence receipt
explicitly identifies the missing original. Existing ingestion writes event and
receipt atomically. Explicit source deletion leaves both the sequence receipt and
an `event_tombstone`; the reviewed call-flow search found no other valid creation
path for an orphan receipt without that tombstone.

Impact: callers receive an apparently complete source snapshot after losing a
known committed original, contrary to the all-or-nothing extraction guarantee and
R27/R30/R58 source-history preservation.

Minimum fix: during the same actor transaction, check the event-sequence inventory
for referenced event existence, allowing absence only with a matching valid explicit
deletion tombstone. Because legacy receipts lack source IDs, a dangling receipt
cannot be safely assigned away from selected sources; fail closed as for other
unclassifiable inventory corruption. Return 503; do not reconstruct the original,
invent text, or silently skip it. Add the missing leaf-event regression and retain
the existing positive case where a legitimately deleted unselected source leaves
receipts/tombstones while the surviving selected source remains exportable.
No new schema, migration, dependency or Learning adapter change is needed.

Reproducer preserved at `/tmp/p0-backend-snapshot-missing-event-probe.py`.
Run from the overlay below with its root on PYTHONPATH; it prints the pre/post IDs,
remaining receipt and absent deletion tombstone.

## Checks that hold in this bounded review

- Explicit nonempty unique source selectors, caller ID shape checks, and per-source
  current owner/deletion/revocation checks run before collection is returned.
- Existing authorization guard executes inside one actor transaction. PostgresStore
  acquires the actor row lock and uses fresh READ COMMITTED reads; cooperating
  archive writers/deletion/revocation serialize on that same lock. No extra read
  transaction or cached authorization shortcut was introduced.
- All existing selected source versions, frames (including unreferenced frames),
  and original/correction branches are retained without a newest-only limit,
  clock rewriting, translation, generated summaries or added gap flags.
- Stored/intrinsic keys, duplicate identities, owner/source registry membership,
  source UTF-8 text SHA-256, named source versions, device/session ownership,
  frame joins, surviving event receipts and correction source/actor/acyclicity
  are checked. B1 is the reverse missing-event inventory gap in these checks.
- Frame bytes require a referenced owned frame artifact, correct artifact ID/kind,
  strict base64 and matching actual/stored/frame hashes. Only referenced frame
  artifacts are exported; notes/help/capture-v2/ink are excluded by scope.
- Failure does not return the partially built local dictionaries. The final result
  is deep-copied while the transaction is active and returned only after successful
  context exit. Mutating a result does not change the archive or restart capture.
- Caller identity and authorization_guard remain embedding-service responsibilities;
  this internal method is neither a token verifier nor an HTTP route. Detached
  data is not a lasting permission grant; current authority must be reacquired
  before later use. Those limits are documented, not a claim of live integration.

## Executed evidence and remaining limits

Temporary overlay:
`/tmp/p0-backend-snapshot-review-vz27wkgq`

Constructed from read-only `git archive 3636dd6` of required tracked directories,
then overlaid the exact six delivery files via `git show 1596db6:path`. Used the
existing lead Python environment read-only with PYTHONDONTWRITEBYTECODE=1.

Command from that overlay:

`/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_learning_snapshot.py services/api/tests/test_archive.py services/api/tests/test_storage.py`

Result: **125 passed in 1.05s**. The separate B1 probe reproduced the silent partial
export despite those passing tests. No adapter compatibility tests were run here.

Owner report records four PostgreSQL 18.6 groups, including actual observed reader
PID 11127 / blocked writer PID 11129 / transaction 1545 and exact before/after
views. The supplied runner uses the existing dedicated-test-DB guard and actor-lock
observation helper; its structure supports that bounded experiment. These remain
**owner-reported real-DB evidence**, not independently rerun results in this review.
The run does not establish DB crash/failover, provider/device save/reopen, G6,
long-term capacity, full P1 or general product acceptance.
