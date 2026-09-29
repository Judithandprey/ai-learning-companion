# ArchiveSnapshot compatibility correction review

**Approve Learning correction `fbeaf65be185b42c1573f19668b64d2345626922`
over `1eff66e3d1603e07bed6096218cf57f3ea5e1e38`.** No new defect found in this
bounded correction. Both constructor blockers from the initial review are
resolved. This does not release Backend's separately held export or approve
Learning's subsequent context repair.

## Candidate and reviewed files

- Current committed main used for the fresh candidate:
  `0c04b2e888fbb7240e9634a6ade2bd309601e3a1`.
- Candidate: `/tmp/p0-snapshot-correction-review-4_atl063`, built by `git archive`
  of that main commit, overlaying exact Learning files from `fbeaf65` and the
  existing Backend `1596db66803ff1e93026998b12efefd83dee7db1`
  `services/api/domain.py` and `services/api/learning_snapshot.py` for composition.
- Learning files: `services/learning/archive.py`,
  `tests/evals/test_archive_snapshot.py`,
  `tests/evals/test_archive_snapshot_runtime.py`, `services/learning/README.md`,
  `docs/verification/learning/p0-05-archive-snapshot.md`, and
  `docs/verification/learning/p0-07-snapshot-runtime-compatibility.md`.
- Reviewed exact `1eff66e..fbeaf65` diff. No future worker context change was read,
  overlaid or approved. Context and retrieval remain the committed main versions.
- Metadata and preservation hashes: `/tmp/p0-snapshot-correction-metadata.json`.
  No main/worker worktree edits, commit, dependency installation, database,
  network, provider, or real-device action occurred.

Refreshed TEAM/PONYTAIL LITE, assigned lead role, the updated P0-05/P0-07 task
segment and relevant original/English R27–32/R58, evidence and continuity clauses.
All four source/English manifest pairs still match. The first review's complete
reading and unchanged current decisions remain applicable; scope and v0.1.0 are
unchanged.

## Disposition and implementation check

- **SNAPSHOT-INTEGRATION-01 resolved:** runtime null frames with empty gap lists
  now survive unchanged. Context reports the frame as unknown without inventing
  `missing_frame` in the original record.
- **SNAPSHOT-INTEGRATION-02 resolved:** equal/backdated correction capture clocks
  are accepted unchanged. Same-owner/source/actor and existing predecessor
  membership checks remain. Runtime graph acyclicity is checked explicitly rather
  than inferred from capture time.
- The iterative graph walk tracks each current path and completed nodes, detects
  self and multi-node cycles, and marks previously verified paths complete.
  Reference membership is checked before traversal. It uses no recursion and
  visits correction edges at most once per uncompleted node. Clock strings are
  not altered or interpreted as causal order.
- `FixtureArchive` retains synthetic/test_only provenance, explicit missing-frame
  flags and strict exact timestamp ordering. Those fixture policies were moved
  out of the shared runtime validator, not removed. Mixed-owner fixture support
  and source/hash/frame/sequence/owner checks remain intact.
- Two incorrect runtime-rejection tests were replaced with legal-input acceptance
  coverage. New tests also retain negative graph/owner/reference cases, original
  inputs, current/history behavior, unknown frames and competing branches.
- Documentation explicitly corrects the initial assumptions and preserves the
  first delivery record as history.

## Focused verification

Existing Python 3.14.4 environment; synthetic data only. From the candidate:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_archive_snapshot_runtime.py tests/evals/test_archive_snapshot.py tests/evals/test_memory.py::test_correction_order_uses_exact_instant -q
```

**75 passed in 0.83s**, exit 0: 16 new compatibility cases, 49 snapshot cases,
10 focused exact-timestamp fixture cases. Log:
`/tmp/p0-snapshot-correction-focused.txt`.

This includes legal equal/earlier/later clocks, empty versus existing missing-frame
flags, exact originals through current/history context, reversed-clock branches,
self/two-node cycles, foreign/missing parents, actor/source mismatches, fixture
policy negatives, and the original 187-file inventory/fingerprint assertion.
The original 159-test batch was not repeated. Exact correction
`git diff fbeaf65^ fbeaf65 --check` passed.

## Repeated actual export composition

Created a new copy of the original discriminating probe, changing only its final
expected outcomes to acceptance. The old probe, failure output and first report
were left unchanged.

```sh
cd /tmp/p0-snapshot-correction-review-4_atl063
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review_composition_corrected.py
```

All four cases passed through shared schema validation, actual `Archive.events`,
actual `Archive.export_learning_snapshot`, corrected `ArchiveSnapshot`, existing
`RetrievalIndex` and `assemble_context`:

| Case | Exported source observations | Snapshot / context result |
| --- | --- | --- |
| Later correction, complete frame | Exact | Accepted; 2 items |
| Null frame, empty gap flags | Exact | Accepted; 1 item |
| Equal correction timestamp | Exact | Accepted; 2 items |
| Backdated correction timestamp | Exact | Accepted; 2 items |

Source fields are compared by event identity; only backend receipt time is
server-assigned as before. Output:
`/tmp/p0-snapshot-correction-composition.json`.

Preserved earlier evidence:
`/tmp/p0-snapshot-delivery-review.md`,
`/tmp/p0-snapshot-composition-probe.json`, and
`/tmp/p0-snapshot-composition-review-8ahxmpq5/review_composition.py`.

## Remaining approval limits

Backend `1596db6` is still held by the lead for its independent missing-event
receipt-integrity gap. These healthy-store positive cases do not test or clear
that gap, prove export completeness under corruption, or approve the full Backend
delivery. They establish compatibility of this runtime constructor correction
with the specified legal records.

QA `bd79ca4`'s existing context findings and Learning's separate context repair
remain outside this review. In particular, construction-time cycle validation
does not claim protection against later direct mutation with forged fingerprints.
Backend authorization/freshness/deletion fences, final integrated checks, real
database/provider/device continuity, G6/G7 and P1 acceptance remain separate.
