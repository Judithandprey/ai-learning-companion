# P0-08 process control candidate review

Decision: no remaining code blocker in the corrected, bounded 0.2.1 control
contract. One registration-fence blocker was reproduced and corrected during this
review. This is approval of local schemas/helpers/generation and the stated
service obligations, not production HTTP/auth/DB/device acceptance.

Scope: actual uncommitted `packages/contracts/process_control/` over main
`fc079e9a704acd0e5fe25e095f56e57a13d31f48`. The lead edited the candidate during
review; this reviewer made no main edits and wrote only this `/tmp` report.
No network, provider, DB, device, Claude call or new task dispatch was used.

Read current decisions, TEAM/PONYTAIL LITE, QA role, current P0-08/P0-09 cards,
relevant full original and English R51/R52/R58/process/verification clauses,
AUDIO stop semantics, ADR 0002 §§2–5, capture 0.2.0 README and actual validator,
and the new schema/helpers/generator/README. All four source and English manifest
hash pairs matched their recorded values.

## Finding 1 — missing request-era registration fences: resolved

Initial candidate: `StreamRegistration` omitted authorization_generation and
membership_revision, while validation.py `_bound` only compared them if present
and `register_stream` copied current service revisions into the new state.
A previously uncommitted initial registration prepared before a revoke/regrant
could therefore be accepted as a new live stream in the newer generation. The
trusted `capture_start_authorized` boolean also did not identify the particular
new stream to which that fresh start decision applied.

A direct local probe reproduced the helper behavior: the identical unused
registration body yielded generation 1 with the initial authority, and generation
2/membership 2 with the later authority. Existing-state capture and command helpers
already rejected changed generations/membership.

Minimum fix now present: schema requires both request-era revision fields;
`register_stream` compares them through `_bound` and requires trusted
`start_stream_id` equal to the new stream. README binds a one-use start decision
to that stream and generations, requires atomic consumption with registration,
and invalidates affected pending starts on stop/revocation. Exact committed replay
is checked after current fences but before consuming another start grant or CAS.
No grant-creation HTTP API is implied by this contract-only slice.

Verification: independent probes rejected changed authorization_generation,
changed membership_revision, wrong and absent start_stream_id, and either missing
request revision field. Fresh matching registration was accepted. These cases also
appear in the lead's tests, which this reviewer ran independently.

## Committed boundary input: hardened during review

The lead added `committed_through_sequence` so a known final pre-stop boundary
cannot contradict already committed same-stream records. On review advice it is
now a required keyword argument, rather than silently defaulting missing evidence
to zero. Independent probes rejected an omitted floor and a verified boundary 3
with committed floor 4, and accepted boundary/floor 3. No mutations were made to
the input state on failures.

One minor README wording clarification was sent to lead: “Boundary 0 means no queued
records” should explicitly mean no records were ever assigned in this incarnation.
A drained pending queue after acknowledged sequence 20 still has final boundary 20,
not zero. The helper's committed-floor check already protects this case; this is
implementation guidance, not a second code blocker.

## Reviewed invariants and intentional service obligations

- Version/capability namespaces are additive. The default v1 and capture 0.2
  validators reject the new definition name; old generated/schema/validator bytes
  remain independently pinned by the new compatibility test. New types reuse
  unchanged local Identifier/IdempotencyKey primitives.
- Stream identity is one incarnation. Restart needs a distinct ID, unknown gap,
  and closed same-owner/device/session predecessor. New generations require new
  authorized incarnation; independent streams are not silently revoked. Initial
  cannot conceal a supplied predecessor. Actual producer lineage, undeleted
  subject lookup and never-reused identities remain explicit service obligations.
- Current owned device/session membership is an explicit relation. Capture and
  restrictive commands compare current authorization/membership generations and
  capabilities. A new capture ID or page-supplied field grants no authority.
- State transitions are monotonic: live -> stopped -> withdrawn, or live ->
  withdrawn. Only one unknown stopped boundary can be sealed; no old-ID resume.
  Known boundaries require a separately supplied verified producer stop fact.
- Capture mapping is correct against the unchanged capture helper: live allows
  authorized capture; unknown stop rejects all live/historical submissions; a
  sealed stop allows only historical records at/below the boundary; withdrawal
  rejects both. Stop remains distinct from deleting originals.
- HTTP paths have bearer auth, explicit control scope/capability, required mutation
  idempotency keys, closed errors, required CAS and path/body identity obligations.
  Exact replay returns transaction-current state, never an old cached live state;
  broader revocation rejects replay. No HTTP implementation or executable replay
  resolver is claimed by this slice, so the wording is a service requirement, not
  a tested production behavior.
- Atomic uniqueness/idempotency/state commit; generation and membership fences;
  consumed start grants; real stop-fact resolution; source/attempt access; deletion
  tombstones; current-state replay; and concurrent stop/delete orders still need
  Backend implementation and actual DB tests. Pure helper success proves none of
  those service/device outcomes.

## Executed checks

1. `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q packages/contracts/tests/test_process_control.py`
   -> **33 passed**. Includes schema/OpenAPI validity, generated-file equality,
   old-artifact byte pins, lifecycle, capture mapping and new registration fences.
2. `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m packages.contracts.process_control.generate --check`
   -> passed after correction. `process_v2.generate --check` also passed earlier.
3. Separate direct Python probes -> **8 negative cases rejected** (four changed
   trusted start/revision facts, two missing request-era fields, missing committed
   floor, contradictory floor); matching registration and finite stop accepted.
   Earlier probes checked immutability, stale-state/CAS rejection, restart against
   live predecessor, independent seal evidence and terminal withdrawal.
4. `.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext packages/contracts/process_control/generated/contracts.ts`
   -> passed. Initial standalone invocation without --ignoreConfig hit TS5112
   because this pinned compiler rejects explicit input files alongside an ambient
   tsconfig; corrected invocation passed, with no source change.

No full-repository run was claimed here; lead owns integration checks. No real
producer stop, current-state HTTP replay, token verification, DB transaction,
provider connection or device behavior was tested. G7/A44/A46/audio/full P1 remain
unverified, and this contract grants no help/disclosure/export capability.

## Corrected candidate content identifiers

SHA-256 at the final code check (README may receive the wording-only clarification):

- schema.json: `5c6145b2136658b08ddd88d9071c6d7df0620d2a5afdb5036d9ee5797f4de4c8`
- validation.py: `298102a4423674b93cd4ec35ebd8d0700900bc3a288ea810c15a3c8293f0520d`
- generate.py: `1dbf41ff1cdf9eb3ed46ce1b2032188c92eea88c838865f359aa29c256611181`
- README.md: `7995979c8990fd41debb94fa0cf1241edcd3626c04fa4c6753056621d167e91b`
- tests/test_process_control.py: `4073f24cc22aeaf8dc057ec54afb1bc9154489893a9f352e86af3c38f697cc64`
