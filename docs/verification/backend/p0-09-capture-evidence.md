# P0-09 internal capture archive evidence

Date: 2026-09-28. Owner: backend, `team/backend` in `wt-backend`.
Released capture baseline read and normally merged:
`e63b28f187eaf9577273c5131b65e7b9cc33646e`;
local merge `971e6d2c9f07fea68932cbb4e565fc618d734811` preserves completed
P0-04 delivery `65b419d14c042b8a41fd33fa10890fd50eddbec0`.

**Subsequent qualification:** lead review at `bc7162d3990b31c3418b437468c41013ee4038f1`
correctly identified that this original lifecycle test observed both ordered
outcomes, but signaled second-call start before its database connection/lock entry.
It did not establish actual lock contention. The historical results below remain
owner-executed evidence with that limit. The [bounded follow-up](p0-09-lock-contention.md)
now records actual waiting/blocking backend IDs and transaction locks before release,
plus timeout/error cleanup; it supersedes the stronger original concurrency wording.

Read the current AGENTS/TEAM/backend role and P0-08/P0-09 cards, current decisions,
applicable full original/English requirements and original-goal verification,
and the released process README, source schema, validator and generated OpenAPI.
The implementation supports the capture foundation for R51/R52/R58 and
A30/A31/A42/A43; it does not close those product cases or the broader P0-09 card.
PONYTAIL LITE reused the existing actor store, source lifecycle and standard
library, with no shared-contract, dependency, lockfile or root edits.

## Delivered behavior

`services/api/capture.py` provides internal append and exact readback for
provisional-session operation/coverage records. It uses `PostgresStore` and the
same actor lock as the v1 archive. It neither registers a stream nor exposes a
public endpoint. The embedding integration must authenticate the user and resolve
registered incarnation, owned device/session membership, current generation and
lifecycle facts through the supplied transaction. Missing resolver is unavailable;
the local tests' `fixture_control` rows are explicitly synthetic trusted context,
not a proposed registration contract.

- Owner-wide record identity and device/stream/sequence identity are immutable.
  Changed originals or occupied slots conflict; one invalid member aborts all new
  records, references and receipts. Transport batch ID and live/history delivery
  do not change record identity. Same request key binds the entire request body.
- Canonical record and receipt JSON are stored as text inside the authoritative
  JSONB document store. Original-language text, escaped NUL, negative zero,
  evidence arrays, unknown values and server receive times survive readback.
  Integer-valued numeric slot/source IDs normalize only for lookup; originals
  retain their supplied representation. No second source/identity archive exists.
- Every current authorization/source/stop guard precedes cached success. The
  resolver must attest current registration/generation, not deserialize a client
  claim. Historical sync requires transmission authorization and a known pre-stop
  boundary when stopped; it never enables capture. Stop leaves authorized originals
  readable. Broader withdrawal, source revocation and deletion deny replay.
- Owned causal parents, their full ancestor graph and exact named v1 frames must
  resolve before success. Missing/cyclic/forward links fail closed. Attempt-scoped
  records return `dependency_missing` because no authoritative relation resolver
  has been released. Cross-source originals are not collapsed into one source.
- Artifact references remain exact and can be pending. An owned stored blob is
  verified only after actual digest/length and independently stored MIME checks.
  Legacy bytes without a MIME fact remain pending. Previously pending receipts
  stay pending on exact retry; a new request can report verified bytes. A cached
  verified ACK is refused if those bytes subsequently disappear. A received hash
  is never treated as verified preservation or saved editable ink.
- Source deletion removes its capture originals, unreferenced bytes/reference
  hashes and dependent receipt bodies in the same v1 deletion transaction.
  Surviving records protect shared blobs. Minimal opaque record/slot/artifact and
  request fences remain. An unrelated raw descendant is preserved; no deleted
  causal-parent content is read back or resurrected by replay.

No process HTTP route, capability advertisement, attempt registration, linked-v1
response, help/disclosure presentation, diagnosis, preference, export/import,
audio-correction record, queue or paid provider is activated. Original v1 routes
and generated contract remain unchanged. Internal acceptance is not an end-user
"saved" claim for pending image/ink bytes.

## Commands and actual results

Used the already installed pinned lead virtual environment read-only. No packages
were installed. From this worktree:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests packages/contracts/tests
```

**454 passed in 1.62s**, including **60 capture tests**. These pytest results use
the explicit MemoryStore/test adapters where applicable, not a PostgreSQL substitute.
They cover owner and generation isolation, absence/mismatch of trusted authority,
attempt refusal, dependency graph/frames, changed record and request replay,
same-batch immutable blob conflicts, numeric identity, exact originals, blob state,
stop/history/withdrawal, shared-source deletion and unchanged v1 HTTP exposure.

With `LC_TEST_DATABASE_URL` privately supplied from the operator handoff, without
printing or committing connection details:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_check
```

**Exit 0: 26 check groups passed on PostgreSQL 18.6.** This is the existing guarded
runner, extended by `postgres_capture_check.py`; it confirms actual `lc_p0_test`
and a local endpoint before writes. It applies/checks migrations, uses unique
synthetic actors, and deletes only those actors on success/failure. The three
owned v1 API processes and fresh capture readback child remain supervised and
are terminated/waited; no persistent service or other database was created.

The existing 19 storage/domain/budget/job/v1-HTTP groups passed again; their
original details remain in [P0-04 evidence](p0-04-postgres-http-evidence.md).
The seven new real PostgreSQL groups passed:

| Check | Observed assertion |
| --- | --- |
| Concurrent append/replay and fresh process | Separate connections return one accepted and one duplicate; one original remains; new Python process reads exact canonical text including NUL and negative zero. Cached ACK JSON retains signed-zero artifact length. |
| Atomicity and rollback | Mixed new/changed records and occupied integer/float slot fail without state change. Injected failure after writes, before commit, restores the entire actor state for both ingest and source deletion. |
| Pending/verified blob | Explicit synthetic owned typed-byte import changes only new receipts. Original receipt/time remains; removing bytes rejects a cached verified receipt. This is not an upload adapter. |
| SQL immutability and downgrade refusal | Direct SQL changes to each of four capture immutable kinds raise CheckViolation. `0002` down refuses with capture state; all actor rows and the migration receipt remain, and reapply is a no-op. |
| Stop and withdrawal | Cached live submission is denied after stop; authorized bounded history succeeds without enabling capture; beyond-boundary history and withdrawn transmission fail. |
| Deletion and stale retry | Original content/blob/reference hashes/receipt bodies are erased atomically. Only opaque fences survive; read and old cached retry fail. |
| Ordered lifecycle commits (historical limit) | Capture versus stop and capture versus delete each run in both ordered outcomes. First writer is held before commit while the second call is started, but its connection/lock wait was not observed. Capture first preserves the stop-retained record or is erased by deletion; fence first rejects capture; cached retry never revives it. Actual contention proof is in the linked follow-up. |

The process-contract generated-artifact check and 19 runner preflight tests also
passed. The final staged whitespace check reports one extra blank line at EOF in
`0002_capture_immutability.up.sql`; the already applied/tested migration bytes are
preserved with their checksum. No other whitespace issue was reported. Earlier
unstaged checks did not include that new file. Independent read-only review
identified the numeric receipt defect below; after the fix, it found no further
blocking implementation defect. The lifecycle cases added ordered-outcome coverage;
the later lead review exposed the remaining contention-observation gap recorded above.

## Preserved failure and correction

The first real capture run exited **1** with:

```text
FAILED: real PostgreSQL internal process capture acceptance (AssertionError)
```

The new exact-replay test uses a valid empty artifact with `byte_length: -0.0`.
Raw JSONB receipt storage normalizes that to positive zero. The correction stores
the ACK as canonical JSON text and decodes it on replay, as already done for raw
records. With that sole production correction, the same real suite passed its
25 groups; the final additional lifecycle-race group brought the passing total
to 26. Assertions and original data were not weakened. An earlier pytest command
also named a nonexistent `test_domain.py` and collected no tests (exit 4); the
corrected real test paths and final full command are recorded above.

## Migration and deployment boundary

Apply the existing migration CLI before using this revision. `0001_documents`
remains byte-unchanged. Additive `0002_capture_immutability` replaces only the
immutable-kind trigger function, adding capture record, binding, slot and artifact
reference kinds. Deploy the deletion-aware archive before any capture writer;
do not mix it with an old deletion path that cannot erase capture content.

Stop capture writers before downgrade. The `0002` down migration locks the document
table and refuses while **any** `capture_*` originals or fences remain. It does not
delete content or remove the migration receipt on refusal. Retain the deletion-aware
archive while that state exists; do not erase originals or replay fences to force
a downgrade. Successful empty-state `0002` down and destructive `0001` down were
not executed. Existing CLI `--confirm-erasure` is not permission to bypass this guard.
See [module runtime instructions](../../../services/api/README.md).

## Remaining limits

- Production stream registration/member resolver, authenticated v2 HTTP adapter
  and typed blob upload/codec path are unreleased. The capture tests invoke the
  internal seam with explicit synthetic trusted context. The real HTTP tests are
  v1 only. No endpoint negotiation or device upload is claimed.
- Stop/delete both ordered outcomes are measured here; actual waiting is established
  by the linked follow-up. Cross-source shared-blob and
  extended ancestor/cycle cases are covered by unit tests, not all rerun as separate
  PostgreSQL cases. Server crash/recovery, failover, successful downgrade, load and
  production identity/RLS are unverified.
- Existing design/vector evidence for attempts, branches, help/assistance,
  organizer/export/Notability, ASR/role correction and linked-v1 presentation stays
  pending its own contracts/execution. This increment does not flip those vectors
  to PASS or claim complete P0-09, P0-07, P1, G4 or G7.
- No actual webpage producer, device, original-screen overlay/composed model input,
  editable pen codec, provider, account connection or confirmed Notability import
  was exercised. Storage evidence alone cannot pass A44/A46/A47–49.
