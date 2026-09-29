# B1 follow-up review — approve

**Decision: APPROVE this bounded B1 correction and original snapshot composition.**
No remaining blocker was found in the reviewed change. The original missing-event
probe now fails closed before returning a partial snapshot.

## Exact scope and context refresh

- Current integration base: `885287656d859a246e4edb96de942c51d636e86a`.
- Original Backend snapshot delivery: `1596db66803ff1e93026998b12efefd83dee7db1`.
- B1 correction: `68274f217b97ea4a2e675e03e793d370163dad29`.
- Read workflow policy at `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d:docs/workflow.md`.
  Following its refresh rule, checked revisions and reread complete affected
  source/English R27–32/R58, V-ArchiveCompanionContinuity, and the current atomic
  snapshot task card. The applicable requirement files have no change from the
  previous reviewed 3636dd6 baseline. Existing current decisions/PONYTAIL LITE
  and original review context were retained; unrelated review was not replayed.
- Backend control delivery `e1eb0f6` is excluded. Current main's Learning
  ArchiveSnapshot/fbeaf65 correction supplies the composition consumer.

No main/worker edits, network, DB calls, dependency installation or commits.

## Code assessment

The correction adds one cohesive `_sequence_inventory` helper inside the same
existing actor transaction, after the raw record inventory and before the result.
It validates each sequence receipt's exact shape, event ID and device/sequence
using the existing EventAck contract, canonical stored key, unique slot/event
binding, and reverse relationship to the live event.

A missing event now requires exactly its matching opaque deletion tombstone.
A live event with a tombstone, mismatched key/identity, duplicate receipt binding,
or unexplained missing original produces 503 `unavailable`. Since receipts carry
no source field, rejecting unexplained loss even outside the selected source is
consistent with the original fail-closed inventory policy; it does not infer a
source or reconstruct missing content. Legitimate explicit source deletion remains
allowed and does not block exporting unrelated surviving originals.

The original exporter still retains its one-transaction authorization/source
checks, complete selected versions/originals and checked frame bytes, and detached
result. No new storage model, wire format, migration, helper framework or dependency
was introduced. No code revision was needed by this review.

## Isolated candidate construction

Temporary candidate directory:
`/tmp/p0-snapshot-b1-review-v5ymd68f`

Created from read-only `git archive 8852876 services packages/contracts tests/fixtures pyproject.toml`.
Overlaid exactly the files listed by `git diff-tree --no-commit-id --name-only -r`
for 1596db6, followed by 68274f2, using each commit's `git show SHA:path` bytes.
The current-main domain.py/storage.py base was compared with the original delivery
parent; no concurrent changes in those two files were overwritten. Only the
original export files and its three-file B1 correction were overlaid; no Backend
control implementation was included.

All commands used the existing lead environment read-only, with
`PYTHONDONTWRITEBYTECODE=1` and the temporary candidate as working directory.

## Executed checks

1. Narrow regressions plus explicit deletion/unselected-source positives:

   `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_learning_snapshot.py -k 'dangling_sequence or reverse_sequence or explicit_deletion_retains or unrequested_unavailable_source or exact_multisource'`

   **14 passed, 84 deselected in 0.23s.** This covers all 11 new B1 cases, both
   existing unrequested revoked/deleted-source positives, and exact multiversion
   raw snapshot preservation. Deselecting unrelated cases is intentional; there
   were no hidden failures or newly weakened assertions.

2. Unchanged original missing-event reproducer:

   From the candidate, ran `/tmp/p0-backend-snapshot-missing-event-probe.py` through
   `runpy.run_path` and required `DomainError(status=503, code='unavailable')`.
   **Passed.** The prior successful partial result is no longer returned. The
   original probe file was not edited to make the regression pass.

3. Direct original Backend export -> current Learning ArchiveSnapshot composition:

   Used `seed_snapshot_history(MemoryStore(), USER)`, then added a legal v0.1
   null-frame observation with no invented gap flag through `Archive.events`.
   Exported both SOURCE_IDS and constructed
   `ArchiveSnapshot(**exported, user_id=USER)` from current main. Compared every
   source/frame/observation dictionary and all artifact bytes using the delivery's
   order-independent exact comparison. Explicitly checked preservation of empty
   gap flags and equal/backdated correction capture times.

   **Passed:** 3 source versions, 3 frames, 8 observations and 2 artifacts preserved.

   Deleted the second source through `Archive.delete_source`, freshly exported
   the surviving first source, and composed another ArchiveSnapshot. Exact
   surviving records/bytes and ownership/source filtering were retained.
   **Passed:** 2 source versions, 2 frames, 5 observations and 2 artifacts; the
   valid deletion receipts/tombstones did not prevent export.

These are synthetic portable checks on the composed candidate, not DB/provider/UI
or device acceptance. The earlier 125-test review, owner-reported four real-DB
groups and broader prior batches were not rerun. No new PostgreSQL, concurrent
DB outcome, retrieval-quality, G6, real source capture or full P1 claim follows.
Lead can integrate the reviewed snapshot commits and run the normal focused
integrated checks; Backend control e1eb0f6 remains a separate review.
