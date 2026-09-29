# P0-09 persisted control registry review

**Verdict: approve this bounded internal delivery for integration.** No reproducible
control-registry blocker was found. This is an independent source review and
focused portable execution, not independent PostgreSQL, HTTP or device acceptance.

## Exact candidate and scope

- Main base: `885287656d859a246e4edb96de942c51d636e86a`.
- Delivery: `e1eb0f65ef62f4ecddb710d380bb9c2a5e0b200a`.
- Candidate directory: `/tmp/p0-control-review-ue3w84j0` (plain exported files,
  no worktree, branch, main or worker mutation).
- Exported main with `git archive`, then overlaid all seven changed files with
  their exact delivery bytes: `services/api/control.py`, `capture.py`, `domain.py`,
  `README.md`, `tests/test_control.py`, `tests/postgres_control_check.py`, and
  `docs/verification/backend/p0-09-control-registry.md`.
- `domain.py` includes the adjacent snapshot composition from the delivery; that
  behavior's merits remain assigned to the separate snapshot reviewer. Relative
  to the control commit's parent, this change only invokes `invalidate_control`
  in the existing authorization-generation transaction.
- `/tmp/p0-control-review-ue3w84j0/review-candidate.json` records all overlays and
  their SHA-256 values; each was verified byte-for-byte against `git show`.
  Later concurrent main movement does not change this frozen review candidate.

Read AGENTS, TEAM, lead role, workflow, Ponytail LITE, current decisions,
P0-09 task, affected original/English R36/R51/R52/R58, A16/A30/A31/A38/A42/A43,
problem-solving process/source boundaries, AUDIO-14, exit/source-continuity
verification, ADR 0002 ingestion/deletion clauses, released control/capture helpers,
actual storage/authorization/capture/delete call paths, and owner verification.
All eight current source/English manifest hashes match. PONYTAIL LITE applied:
existing actor transactions, archive and pure contract helpers are reused; no
new store, dependency, migration or alternate authorization model is introduced.

## Reviewer-observed checks

Working directory for every test command:
`/tmp/p0-control-review-ue3w84j0`. Interpreter:
`/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.

1. `-m pytest -q services/api/tests/test_control.py -k 'replay or delayed or stop or seal or regrant or deletion or membership or registration_failure or current_owned or start_grant or source_resolver or revoked_source or explicit_authority or unreleased'`
   — **52 passed, 31 deselected, 0.49s**, exit 0.
2. `-m pytest -q services/api/tests/test_control.py -k 'direct_capture_authority or registry_requires or noncallable or public_http'`
   — **17 passed, 66 deselected, 0.30s**, exit 0. One noncallable-stop-resolver
   case overlaps the first selection; these are not claimed as 69 unique tests.
3. `-m pytest -q test_review_control_edges.py`
   — **12 passed, 0.15s**, exit 0. Independently authored probe retained in the
   candidate directory. It checks simultaneous single-use registration with same
   and different replay keys; competing pending initial grants for one producer;
   both actual MemoryStore transaction orders for capture versus stop, deletion,
   and membership removal; source-isolated deletion within a shared stream with
   preserved committed floor; missing producer fact after a known stop; and
   capture-only capability context denied control mutation.
4. `-m pytest -q tests/e2e/test_p0_09_capture_context_qa.py -k 'scope' --runxfail`
   — **2 passed, 13 deselected, 0.13s**, exit 0. Both
   `test_capture_rejects_non_set_authority_scopes` assertions now pass. The frozen
   base's strict-xfail markers are stale and would cause XPASS failures under the
   default strict mode; QA/lead should retire only these markers after integration.
   No QA file was edited by this reviewer.

The independent concurrency probes hold the first *MemoryStore* transaction
through its commit boundary, wait until the second attempts entry, and release
in `finally`. They demonstrate this implementation's portable actor-lock ordering,
not PostgreSQL lock observation, process durability or device stop behavior.

No old broad suite, database command, DB service, network/provider call or public
server was run. Original scope/capability malformed-collection assertions were
not weakened; `--runxfail` executes them as ordinary assertions.

## High-risk conclusions

- **Current authority before replay:** guard, explicit typed scope/capability,
  account state, owned device/session, active membership and original generation
  pins are checked before control success can be replayed. Command replay precedes
  CAS and returns current state, including stopped/withdrawn. Fresh stale keys and
  changed bodies reject. Capture ACK replay also passes current fences first.
- **Single-use start:** registration requires a persisted exact-ID/full-body grant;
  consumption, stream state, lineage and replay entry share one actor transaction.
  Fault injection preserves the original pending grant on rollback. Concurrent
  duplicates cannot consume twice or create parallel same-producer lineage.
  Account/membership changes invalidate pending grants and close old incarnations;
  later account regrant does not authorize an old registration or replay.
- **Monotonic stopping:** unknown stops block all transmission. Finite stop/seal
  uses a separate read-only stop-fact callback, compared against retained
  same-stream slots. Missing/contradictory fact cannot disable unknown stop or
  withdrawal; known history requires the matching current fact. Zero cannot erase
  an already committed sequence, including after source deletion. No resume on an
  old ID exists. Independently stopped producers do not acquire a global
  single-stream restriction.
- **Atomic source and membership fences:** registry capture resolves sources,
  membership, account generations and stop facts inside CaptureArchive's original
  transaction; no nested transaction or cache creates a check/commit gap. Existing
  PostgreSQL store uses READ COMMITTED plus the actor row lock. Source deletion
  shares that lock, removes the affected original/replay content, and leaves opaque
  slots to prevent resurrection. A source's deletion does not itself erase other
  independent records in the same stream or redefine the whole stream as deleted.
- **Closed unreleased paths:** registry-backed artifact-reference and attempt
  batches reject; the public `/v2` routes stay absent. Separate capture and control
  capabilities remain required. This scope grants no help/disclosure permission.
- **Compatibility:** process-control tree identity is the same at main base,
  `9a861d0` and the delivery (`4da8d7e0aa6538fba3c68b0fc3260080c495da51`);
  capture 0.2.0 tree identity is unchanged
  (`e628c55ca8806f459b804fb6f80ec94c0411176a`). Existing migrations are unchanged.

## Reported evidence and remaining boundaries

Backend reports **580 portable tests** and **12 real PostgreSQL groups** (eight
with observed waiter/blocker transaction IDs), including both stop/delete/member
orders, revoke/regrant ordering, fault rollback and fresh-process readback. I
reviewed the runner and its evidence document but **did not independently run or
observe those PostgreSQL results**. The older 27-group capture runner was not rerun.

Authorization remains an explicit embedding-service responsibility: the callable
guard must bind the current authenticated caller, expiry/revocation and generation;
the trusted adapter must obtain actual scoped start consent, maintain stable
producer identity and persist attributable pre-stop facts independently. Synthetic
guards/facts in these tests prove none of those production connections. A server
state of live/stopped is not proof the device has actually captured/stopped.

New typed uploads and cross-family artifact sharing, producer/device activation,
HTTP activation, linked attempts/disclosure, target-device audio/screen/ink,
Notability import and full R/A/G/P1 acceptance remain **closed/unverified**.
The pre-existing standalone capture artifact pin/deletion findings and large-batch
validation/ancestor work under the actor lock remain open adjacent issues; this
delivery does not claim to solve them. No throughput or independent crash-recovery
claim follows from these checks.

**Next owner/action:** lead integrates this exact bounded delivery with the
separately approved snapshot composition, verifies the integrated commit, and
coordinates QA's two stale expected-failure markers. Backend remains owner of
future actual producer adapters; typed-upload and public-route activation require
their own explicit contract/task boundary.
