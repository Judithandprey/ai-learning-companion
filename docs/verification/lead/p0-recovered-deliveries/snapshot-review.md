# ArchiveSnapshot delivery integration review

**Recommendation: request changes before integrating the runtime snapshot seam.**
The isolated 159-test suite passes, but a subsequent actual Backend export →
ArchiveSnapshot composition probe found two blockers: the runtime adapter
incorrectly imposes synthetic-fixture gap and correction-clock conventions on
legal persisted v0.1 records. An earlier draft's isolated approval is superseded
by the integration evidence below.

## Blocking findings

1. **SNAPSHOT-INTEGRATION-01: legal unframed records reject the whole runtime
   snapshot.** `services/learning/archive.py:93` in delivery `1eff66e` requires
   `missing_frame` whenever `frame_id` is null. Shared `Observation` validation,
   existing `Archive.events` and Backend export `1596db6` all accept/preserve an
   observation with `frame_id=None`, `media_position=None`, `gap_flags=[]`.
   Passing that exact successful export to `ArchiveSnapshot(**supplied,
   user_id=owner)` raises `ValueError: Absent frame must be explicit`. This is a
   production-seam incompatibility, not corrupted storage or permission failure.
   Runtime acceptance must preserve the original null/flags without inventing
   a gap marker; the context already represents a null frame as unknown. Keep the
   fixture-only convention strict in `FixtureArchive`.
2. **SNAPSHOT-INTEGRATION-02: legal correction capture clocks reject the whole
   runtime snapshot.** `services/learning/archive.py:99–101` rejects a correction
   whose `captured_at` is equal to or earlier than its predecessor. Both cases
   pass shared schema validation and existing backend ingestion, then survive
   exact authorized export. `ArchiveSnapshot` raises `ValueError: Invalid
   correction ownership/order` for both. A valid correction edge need not have a
   strictly increasing capture clock. Preserve timestamps and actual correction
   links, validate same-owner/source/actor and graph acyclicity for the runtime
   view, and retain the fixture-only strict timestamp behavior. Simply removing
   the clock check without explicit cycle validation would expose existing
   context traversal to cycles.

These are introduced by extending the old fixture assumptions to the new runtime
class. They are independent of QA `bd79ca4`'s preexisting context defects. Owner:
Learning, coordinated by lead; this review made no production fix.

## Exact candidate and scope

- Delivery: `1eff66e3d1603e07bed6096218cf57f3ea5e1e38`, parent `1504509`.
- Requested main baseline: `fc079e9a704acd0e5fe25e095f56e57a13d31f48`.
- Actual committed main at candidate preparation:
  `3636dd6db1e337671892d65b8f5d7919d452986a`.
- Candidate: `/tmp/p0-snapshot-review-o6twlre5`, prepared from `git archive`
  of that actual main commit with the delivery's four exact changed files
  overlaid. Metadata: `/tmp/p0-snapshot-review-metadata.json`.
- Files reviewed: `services/learning/archive.py`,
  `tests/evals/test_archive_snapshot.py`, `services/learning/README.md`,
  `docs/verification/learning/p0-05-archive-snapshot.md`.
- The delivery parent and reviewed main baseline have byte-identical
  `archive.py`, `context.py`, and `retrieval.py`. Thus the worker's older branch
  introduces no hidden merge divergence in this call path.
- No main/worker worktree changes, commits, peer messages, installs, database,
  network, provider calls, or new services were performed. Main's evolving
  process-control changes were excluded from the overlay and left untouched.
- Added bounded companion integration check at the lead's request against Backend
  `1596db66803ff1e93026998b12efefd83dee7db1`, overlaying its exact `domain.py` and
  `learning_snapshot.py` on a separate candidate:
  `/tmp/p0-snapshot-composition-review-8ahxmpq5`.

## Requirements and reading

Read AGENTS/TEAM, lead and Learning roles, current decisions and full intent,
English working policy, relevant P0-05/P0-07 cards, complete relevant source and
English R27–32/R58 plus process evidence/retention/disclosure clauses,
A09–12/A38, V-ArchiveCompanionContinuity, V-ModelSwitchContext and
V-MemoryCapacityTransparency; checked the audio/source-retention specification.
The four source/English manifest pairs all match their recorded SHA-256 values.
PONYTAIL LITE is applied as reuse of existing validation and evidence logic;
no model/effort, contract v0.1.0, ownership or scope changes.

## Reviewed invariants

- `ArchiveSnapshot` requires keyword-only `user_id`, validates it even for an
  empty snapshot, and rejects rather than filters a foreign source, frame or
  observation. Legal shared v0.1 non-fixture provenance values are retained.
  Labels are correctly documented as data, not permission grants.
- The shared base schema-validates each family and preserves duplicate source,
  frame and event identity checks, owner/device sequence uniqueness, source
  version references, exact source UTF-8 hashes and frame artifact hashes.
- Frame lookup includes owner; observations cannot rebind a frame to another
  source/version/device/session/media position. The inherited missing-frame rule
  is valid for strict fixtures but blocks legal runtime data as reported above.
  Missing artifacts/frames/correction predecessors now fail
  with `ValueError` instead of incidental dictionary `KeyError`.
- Corrections retain same-owner, same-actor, same-source and strictly increasing
  exact UTC-instant requirements. The existing precise timestamp comparator is
  reused, including fractional precision. The clock rule prevents accepted cycles
  but is too strict for legal runtime data; graph validity must be retained when
  separating runtime versus fixture clock policy.
- Records are deep-copied. Artifact mappings are copied and wrapped with
  `MappingProxyType`; values must be immutable `bytes`. Existing evidence returns
  remain copies. Caller changes to inputs or returned packets do not mutate the
  snapshot. Record maps remain mutable by convention, explicitly documented;
  the existing context identity/fingerprint checks reject internal record edits.
- `FixtureArchive` remains strictly synthetic/test_only in both constructor and
  file loader. Its mixed-owner isolation fixtures remain supported and tested.
- Retrieval and context implementation, scoring, current/history semantics and
  fingerprint algorithm are unchanged. Existing stale-index rejection/rebuild
  works over detached snapshots, including correction/version updates and an
  explicitly empty deleted snapshot. No second persistent archive or identity
  store, acquisition path, loader or provider client was introduced.

## Reproduced checks

Python 3.14.4, using the existing main `.venv`; all input data synthetic.
From `/tmp/p0-snapshot-review-o6twlre5`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_archive_snapshot.py tests/evals/test_memory.py tests/evals/test_context.py -q
```

**159 passed in 3.07s**, exit 0: 51 new snapshot cases plus 108 existing
memory/context cases. No new dependency was installed. Exact delivery
`git diff 1eff66e^ 1eff66e --check` also passed.

The passing frozen-inventory check covers all 187 original files, inventory
SHA-256 `b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`,
and fixture fingerprint
`d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f`.
This review did not rerun or retune the quality benchmark.

### Actual Backend-to-Learning composition

Runnable probe:
`/tmp/p0-snapshot-composition-review-8ahxmpq5/review_composition.py`.
Observed output: `/tmp/p0-snapshot-composition-probe.json`.

```sh
cd /tmp/p0-snapshot-composition-review-8ahxmpq5
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review_composition.py
```

The probe uses existing synthetic core examples, `MemoryStore`, public controlled
fixture import, actual `Archive.events`, actual new
`Archive.export_learning_snapshot`, then exact new `ArchiveSnapshot` and unchanged
context/retrieval. It checks exported observations by event identity, preserving
all original fields except the server-assigned receipt timestamp.

| Synthetic case | Shared schema / backend ingest / export | Learning result |
| --- | --- | --- |
| Later correction, complete frame | Accepted / accepted / exact export | Accepted; 2 context items |
| Null frame, empty gap flags | Accepted / accepted / exact export | `Absent frame must be explicit` |
| Equal correction capture timestamp | Accepted / accepted / exact export | `Invalid correction ownership/order` |
| Backdated correction capture timestamp | Accepted / accepted / exact export | `Invalid correction ownership/order` |

All four discriminating assertions passed (exit 0). The first probe draft failed
its own exactness assertion because it zipped insertion-order input with sorted
export rows; the helper was corrected to compare by event ID. That was a probe
ordering assumption, not a backend failure; no requirement promises list chronology.

## Existing QA context findings remain separate

Read QA delivery `bd79ca4` and compared the relevant implementation. Its findings
predate this diff; no context or retrieval changes are delivered here. In
particular, the excluded-original fork-label gap, new source version with zero
observations suppressing current hits, negative omission count with a misbehaving
retriever/recheck, and quadratic long-chain resolution/budget costs remain open
existing Learning work. This review neither fixes nor independently retests the
whole QA report, and does not turn those items into new snapshot regressions.
The preexisting missing-correction `KeyError` becomes an explicit `ValueError`;
the complete-reference requirement remains unchanged.

## Next integration boundary and limits

Backend must still atomically supply a complete, currently authorized owner
snapshot and artifact ownership, enforce deletion/tombstones and recheck before
use/presentation. The constructor cannot authenticate content/provenance, prove
real-store freshness/completeness, reject unreferenced foreign bytes without
ownership metadata, revoke old returned Python values, or provide concurrency
transactions. These are documented caller responsibilities, not new guarantees.

The full Backend export delivery has not been reviewed here; the lead owns that
review. Actual export → ArchiveSnapshot → RetrievalIndex → context composition
was exercised only for the four local synthetic MemoryStore cases above. Have
Learning repair and test both blockers without altering source facts or relaxing
FixtureArchive, then rerun composition and test the final integrated commit.
This result does not accept actual backend connection, model switching,
full R58 attempt/diagnosis semantics, G6/G7/P1, or
V-ArchiveCompanionContinuity on real source/provider/device paths.
