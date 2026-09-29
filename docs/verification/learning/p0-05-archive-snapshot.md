# P0-05 / P0-07: supplied owner-scoped archive snapshot

Integration correction: the initial runtime adapter below inherited two fixture-only
conventions. [Runtime compatibility repair](p0-07-snapshot-runtime-compatibility.md)
supersedes its gap-flag and capture-clock restrictions; this original delivery/test
record is retained as history, not proof of complete backend compatibility.

Assignment: `handoff_42b04ddaf5650d23b1608eb87970719b`, baseline
`fc079e9a704acd0e5fe25e095f56e57a13d31f48`, existing v0.1.0 records. The second
infrastructure interruption stopped inspection only; no interrupted test was
counted. Work resumed on clean `team/learning` at `1504509`; prior completed output
repairs were preserved, not repeated. No reset/merge or another worktree edit.

Read baseline AGENTS/TEAM, learning role, P0-05/P0-07 context and the exact dispatch,
R27–32/R58, relevant process evidence clauses, complete intent decisions and
V-ArchiveCompanionContinuity. The four English/source manifest hash pairs match
this baseline. PONYTAIL LITE applies through reuse of the existing archive
validator/evidence implementation; it does not reduce requirements or tests.

## Implemented

`services.learning.archive.ArchiveSnapshot(sources, frames, observations, artifacts,
*, user_id)` accepts already acquired, owner-scoped v0.1 data. It shares a private
validation/evidence base with `FixtureArchive`. The public production seam has no
file loader or fetcher; the fixture constructor/loader still require
`provenance.origin=synthetic` and `consent_scope=test_only`. Mixed-owner isolation
fixtures remain supported only through the existing fixture adapter.

Every source/frame/observation is schema-validated and must match the explicit
trusted owner. The existing original-text hash, frame-byte hash, source/version,
frame/device/session/media associations, unique event/source/frame identities,
unique owner/device sequence and exact correction actor/source/time checks are
reused. Missing frame/artifact/prior references now produce explicit validation
errors. Nothing is silently filtered, normalized, truncated or synthesized.

Records are deep-copied; evidence returns retain their existing copied shape.
Artifact IDs map to immutable bytes in a read-only copied mapping. Original
provenance, consent labels, original-language text, unknowns, timestamps and
correction links remain intact. The record fingerprint retains its existing
algorithm, including referenced artifact hashes through frame records.
`RetrievalIndex` and `assemble_context` consume the new object unchanged.

## Actual checks

Python 3.14.4 / WSL Linux. No added dependency, model/provider call, backend/schema
mutation, persistent source store or running service. From the learning worktree:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_archive_snapshot.py tests/evals/test_memory.py tests/evals/test_context.py -q
# 159 passed in 3.16s: 51 new snapshot cases + 108 existing memory/context cases.
git diff --check
```

The same command also passed **159 tests in 3.40s** in a temporary `git archive`
copy of exact assigned main `fc079e9`, overlaying only `services/learning/archive.py`
and `tests/evals/test_archive_snapshot.py`. That checks compatibility with main's
newer shared validation without changing the worker's branch or shared files.
Temporary check directory: `/tmp/learning-snapshot-main-2gxtjjgw` (not a delivery
artifact; recreate from the baseline plus these two delivered files).

New cases cover legal `user_authorized` / `public_licensed` enums with both legal
consent values; exact source text and frame bytes through index/context; invalid
or omitted owner; mixed-owner input in each family; schema and duplicate identity
rejection; corrupted/missing/mutable bytes; missing source/frame/prior references;
correction identity/order; frame rebinding; duplicate device sequence; strict
fixture constructor and file-loader rejection; input/output copy isolation;
unknowns/gaps; source accessibility and other-owner queries; current/history;
changed source versions and explicit deletion with stale-index rejection and
rebuild; and the existing context mutation fence. Construction performs no writes.

**All data in these tests is synthetic TEST DATA.** Realistic provenance enum values
are deliberately exercised without claiming actual user consent, a license grant,
provider capture or a production connection. The test attribution/license strings
say this explicitly; the frozen corpus's labels are not changed.

## Preserved evidence and limits

- All 187 frozen files retain inventory SHA-256
  `b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`;
  loaded fixture fingerprint remains
  `d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f`.
  Source/label/query files and original failure evidence are untouched. The same
  tiny fixture supplied through either adapter yields identical context/fingerprint.
- Retrieval/scoring/context implementation is unchanged. No full quality benchmark
  rerun or tuning: retained lexical+metadata results remain 50/50 exact and 25/30
  fuzzy; failures `fuzzy-03/22/24/26/29` remain. No new G6 or multilingual claim.
- Schema/provenance acceptance is not authorization. Backend still owns atomic
  extraction of the four constructor values, artifact ownership, current access,
  deletion/tombstones and rechecks before use/presentation. The constructor cannot
  establish that a supplied snapshot is complete/current in a real store.
- Record dictionaries are copied and treated as immutable by convention, as in the
  existing adapter; context checks their identity/fingerprint. This is not a
  tamper-proof object, concurrent transaction or permission boundary. Artifact
  bytes are immutable; there is no independent raw store.
- Previously returned packets remain Python values. Changed/deleted supplied
  snapshots reject stale indexes and reassemble correctly, but this class does not
  remotely revoke old objects or prevent a caller from reusing an old authorized
  snapshot. Production freshness/revocation fences remain the backend caller's job.
- No actual backend connection, real capture, cross-model continuity, preference
  migration, v0.2 attempt/diagnosis/hint semantics or V-ArchiveCompanionContinuity
  product pass is claimed. This is the bounded in-memory integration seam only.
