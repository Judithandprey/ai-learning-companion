# P0-04/P0-07 authorized Learning snapshot extraction

2026-09-29 UTC. Backend owner, `wt-backend` / `team/backend`.
Original assignment: lead `handoff_583048f488fb4c7ba570d4b957130322`.
Read baseline `fc079e9a704acd0e5fe25e095f56e57a13d31f48`, normally merged as
`395f037d253b2f729e8f143056e9894bd7f74fcb`. Worktree was clean before merge.
The infrastructure interruption occurred during initial reads; no snapshot code
or tests had run then. Resumption was reported once through the original route.
The completed contention task was not repeated or counted as new evidence.

Read current AGENTS/TEAM/backend role and P0-04/P0-07 scope, R27–32/R58, current
decisions, applicable source-preservation/audio clauses, and the full relevant
V-ArchiveCompanionContinuity/V-MemoryCapacityTransparency source and English cases.
The read-only reviewer verified all eight source/translation hashes. Those product
acceptance cases remain unrun; this is one bounded backend seam supporting them.
PONYTAIL LITE reuses the canonical actor repository and existing validation; no
second archive, identity, dependency, migration or shared wire format was created.

## Internal interface and protection

```python
snapshot = archive.export_learning_snapshot(user_id, [source_id, another_source_id])
# snapshot keys: sources, frames, observations, artifacts
```

The first three values are full v0.1 SourceSnapshot/Frame/Observation dictionaries
in lists. `artifacts` maps each frame-referenced artifact ID to exact immutable
bytes. Records are deeply detached from the store and mutable only by convention
in the caller's copy. No database handles, result cache or persisted archive is
returned/created. No note, help, capture-v2, unreferenced ink/blob, inferred summary
or generated explanation is exposed by this seam.

The caller supplies trusted authenticated identity and the Archive's current
`authorization_guard`; the guard runs inside the same actor transaction as all
reads. Every requested source must resolve to the same owner and pass current
revocation/deletion checks. Selection is an explicit nonempty list/tuple of distinct
IDs; there is no implicit full-user export or success with a failed scope omitted.

All existing requested source versions, all their frames (including unreferenced
frames), original observations, corrections and competing correction branches are
retained. Original text/language, provenance, capture and receipt time, confidence,
gap flags, source/version/frame relations and binary bytes are not rewritten.
There is no recent-N or current-version-only limit. Storage list ordering is not
a claim of cross-device causal chronology. Legitimate version gaps remain gaps.

Validation checks the current source-head projection and lifecycle booleans,
legacy schemas, stored/intrinsic record keys, embedded owner/source identities,
source text hashes, named versions, owned device/session references, exact frame
joins, event-sequence receipts, correction membership/source/actor and graph
acyclicity. Frame artifacts require exact owner/ID/kind, strict base64 decoding,
matching stored/frame SHA-256 and actual byte hash. No malformed or missing
required reference is silently dropped or replaced with an empty value.

Inventory shape/key/source-registry checks precede filtering: a corrupt leaf row
whose source ID becomes an unknown but syntactically valid ID cannot silently
vanish from the result. A corrupt/unclassifiable legacy inventory row can therefore
block an extraction; legitimately unrelated revoked/deleted sources need not be
available to extract another valid source. This validates the existing trusted
repository, not arbitrary malicious SQL capable of forging an entirely consistent
history. Unknown historically removed unreferenced records cannot be reconstructed.

| Condition | Result |
| --- | --- |
| Invalid/empty/duplicate selector or actor identifier | 422 `invalid_contract` |
| Missing, foreign or deleted requested source | 404 `source_not_found` |
| Revoked authorization/source | Existing 403 `authorization_revoked` / `source_revoked` |
| Caller guard rejects expiry/generation | Original guard error propagates |
| URL registration has no materialized snapshot | 404 `reference_not_found`; registration is not content |
| Missing/current-version/reference/blob or stored integrity failure | 503 `unavailable`, no partial snapshot |

Old backend ingestion permits equal/backdated correction capture timestamps and
null frame IDs without `missing_frame`. Export preserves these valid legacy facts
instead of adding current FixtureArchive's stricter synthetic conventions. Learning
must accommodate them in its reviewed runtime adapter without inventing clocks/gaps.

## Actual verification

Used the existing locked lead environment read-only; no dependency installation.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_learning_snapshot.py services/api/tests/test_archive.py services/api/tests/test_storage.py
```

**125 passed in 1.13s**, including **87 new snapshot unit cases**. These are portable
MemoryStore tests, separate from PostgreSQL. They cover multiple sources/versions,
two owners with identical IDs, all raw actor/correction branches, null frames,
binary/shared artifacts, 264 observations without truncation, selector atomicity,
authority/source lifecycle rejection, detached data, corruption and absence across
required references, unknown-source leaf/frame corruption, and one guarded actor
transaction with no export writes or capture restart.

The operator's existing private DSN was injected without printing or committing
connection details. No database service was created, restarted or stopped:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_snapshot_check
```

**Exit 0, four focused groups passed on PostgreSQL 18.6** using the existing
dedicated-target guard for local `lc_p0_test`. Existing migration files are checked
and applied only if absent; no file/schema change was introduced. Both unique
synthetic actors were cleaned. No HTTP server or persistent child was started.

1. Exact multi-version/raw-correction/binary-byte extraction, both owners and
   detached copies, including a fresh PostgresStore connection reading the originals.
2. Removing a referenced synthetic blob rejects the entire snapshot; restoring
   that exact original restores exact readback.
3. Reader pauses after scanning source versions while holding its transaction.
   The real writer backend **11129** waits on reader **11127**, transaction lock
   **1545**, `wait_event=transactionid`, `blocking_pids=[11127]`. This uses the
   existing lock-observation helper, not a thread-start/sleep inference. The first
   snapshot contains the whole pre-write view; only a later snapshot contains the
   new original. Sessions are observed closed after both operations finish.
4. Caller expiry, authorization/source revocation and deletion deny fresh export;
   a failed source is never omitted from a successful multi-source result. The
   surviving source remains readable and the deleted source is not resurrected.

These PID/transaction IDs are observations of this test run, not reusable targets.
The old 27-group capture/contention suite and unchanged whole application suite
were not rerun for this segment.

## Failures retained and corrected

The test author's first portable run reported 77 passes/3 failures. Two were test
construction corrections: a 257-member input exceeded the existing EventBatch
limit (seeded in legal batches instead), and corrupt requested source-head identity
correctly follows 404 source-not-found semantics rather than a 503 expectation.
The remaining receipt-integrity finding was real: extraction checked event ID but
not the receipt's embedded sequence key. That key is now checked explicitly.

A subsequent test-author run reported 85 passes/2 failures: the receipt-key case
and a newly isolated valid legacy null-frame/no-gap observation. Export initially
imported an unnecessary `missing_frame` rule from the synthetic learning adapter;
that rule was removed so the retained observation is exported exactly. Root's
final 125-test command passed unchanged behavioral assertions after both fixes.
Independent static review also identified unknown-source leaf omission and boolean
source-head-version ambiguity; regression cases now cover their fail-closed fixes.
No unexpected PostgreSQL failure occurred; intentionally missing blob and denied
authorization cases remain asserted negatives, not hidden passes.

## Remaining linkage and acceptance limits

Learning's `ArchiveSnapshot(sources, frames, observations, artifacts, *, user_id)`
consumption awaits its separately reviewed baseline. Backend neither imports that
unreleased class nor writes a substitute Learning archive. Current FixtureArchive
remains synthetic/test-only and cannot serve as production continuity evidence.

A detached result represents the authorized view at its transaction boundary.
It cannot retract bytes already returned when permission later changes. Callers
must reacquire/recheck current source/auth permission before later use; retaining
a snapshot is not a reusable access grant, cache invalidation mechanism or authority
to present help. This interface exports existing raw v1 observations, not linked-v2
help, note or presentation states.

Production capture, real course/account ingestion, retrieval/model continuity,
provider calls, device save/reopen, long-term capacity and all V-/G-/P1 acceptance
remain separate. Memory use scales with the explicitly requested originals; the
method does not claim unlimited capacity or silently truncate data to fit a model.

## Follow-up: reverse receipt inventory repair

Lead review of `1596db6` found a missing negative case: removing an ingested leaf
event while retaining its sequence receipt and no deletion tombstone produced a
successful incomplete export. The 125 checks above did not detect it. Review
request: `handoff_04cb2a8829cd22d0cc00e73e98502e6b`; this repairs that delivery,
without repeating its completed PostgreSQL experiment.

Export now also checks every actor sequence receipt in the same transaction:
canonical stored key, valid device/sequence/event identity, unique bindings and
the reverse link to the live original. A missing event requires its exact opaque
deletion tombstone; a live event and tombstone together are inconsistent. Legacy
receipts have no source metadata, so unexplained loss blocks the whole extraction
even if another source was selected. No lost text, timestamps or source association
is reconstructed. Legitimate explicit source deletion still permits unrelated
originals to be exported.

Eleven added cases cover the missing leaf inside/outside selection, mismatched
receipt/tombstone IDs, invalid/aliased/duplicate slots and explicit-deletion
continuation. The command above passed **136 tests in 1.25s** in the worktree.
To isolate this repair from concurrent unfinished control work, the same checks
also ran on a temporary `git archive HEAD` plus only the two repaired Python files:
**136 passed in 1.09s**, exit 0. No old database/contention batch was rerun, and no
new PostgreSQL, Learning integration, provider or device acceptance is claimed.
