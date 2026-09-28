# P0-08 first executable capture contract

2026-09-28 UTC. Starting main: `7fdebd87e93b0e863beeef932565b5a3af2dc446`.
The user explicitly requested the next executable lead-owned segment rather than
another general audit. This milestone releases a separate **0.2.0 capture-only
contract**; it does not close P0-08, G7 or product acceptance.

## Source, scope and implementation

Read ADR 0002 including owner reviews, current P0-08/P0-09 cards, R51/R52/R58,
the complete applicable process specification and confirmed decisions, plus
V-ArchiveCompanionContinuity/V-SourceTimeRelations. R53–59 and the R60/audio
constraints continue to govern future families; no supplier was selected.
PONYTAIL LITE reused existing jsonschema, v1 primitive definitions and generators;
no dependencies, providers, permissions, models or billing changed.

Implemented under [`packages/contracts/process_v2`](../../../packages/contracts/process_v2/README.md):

- Closed versioned capture-operation/coverage schema and Python local invariants.
  Original-language before/after states, site/user/AI/unknown attribution,
  gaps, source/version, provisional or resolved-attempt scope, explicit nullable
  legacy-frame binding and independent stream identities remain distinguishable.
- Trusted-context comparisons for capture capability, owner/device/session/stream,
  source/attempt membership and stop/historical transmission limits. Context is
  service-supplied, not a client credential or authentication implementation.
- Canonical immutable record equality and exact submitted-record ACK checks;
  verified artifact bytes require separately supplied verification facts.
  Metadata-only pending references never count as preserved image/ink content.
- Separate self-contained generated JSON Schema, TypeScript and OpenAPI for
  `/v2/process/events:batch`, including scopes/capability, idempotency and errors.
  Root generation/type checks cover both namespaces. No endpoint was installed.
- 121 new local tests, including negative fixtures and pinned hashes of all six
  legacy schema/validator/generator/generated artifacts. Default v0.1.0 bytes and
  examples remain unchanged; unsupported process payloads do not fall back to v1.

No effective help permission, presentation receipt, diagnosis, organizer/export,
audio interpretation or automatic source association is enabled by this release.
Backend must resolve named dependencies and implement real atomic durable writes,
authorization/deletion fences and lifecycle behavior before advertising capability.
No second archive or identity system is introduced.

## Reviewed deliveries integrated alongside the contract

| Owner delivery | Main integration | Verified scope |
| --- | --- | --- |
| Backend `e8258c1f58535284899e579096b0ac8cd42a712d` | `da401e0` | Four additive families / sixteen **unexecuted** T1/T3/linked-v1 schedules; prior packets/audio retained. |
| Web `cb0f89b81ef295ef333d8b94657bc9374f84be56` → `ec185805a94303ebda9bc52cf9b08678e28d8ec6` | `1c669ed` → `a09c43e` | Synthetic timeline/disclosure models and tests: seek lifecycle, same-time ordering and frame ties, gaps/paused freshness, buffering. No actual capture or audio. |

Native delivery IDs: Web `handoff_6086c9fbce5e2ed8af179b858a017c2e`;
Backend `handoff_e2e7ff4fa4c0bba2e8002cf56b95a11a`. Both were actually read.
Separate bounded read-only Astra review found no integration blocker in these
delivered diffs. No worker worktree was changed and no existing task was duplicated.
The existing Web D1/ORG-3/EO-1 repair remains in progress and is not cleared here.

## Verification and review

Actual commands on the integrated tree:

| Check | Observed result | Evidence |
| --- | --- | --- |
| `bash scripts/check.sh` | **591 passed, 14 existing xfailed**; both generators, root/module TypeScript, eleven Web test-file runs and build passed | [integrated log](p0-08-capture-contract/integrated-check.txt) |
| Shared contract suite | **221 passed**: old 100 plus new 121 | [contract log](p0-08-capture-contract/contracts.txt) |
| Exact Web timeline + disclosure files, Node `--test-isolation=none` | **20 named tests passed**, no skips | [timeline log](p0-08-capture-contract/web-timeline.txt) |
| Backend packet preservation and new case counts | Preserved prior packet/audio; four families / sixteen not_executed variants | [static log](p0-08-capture-contract/backend-static.txt) |

Independent bounded code review found a lone-surrogate defect: validated text could
crash canonical UTF-8 encoding. Fixed by rejecting invalid UTF-8 JSON while retaining
valid original Chinese/emoji; regression included. Review also required explicit
legacy-frame association rather than treating a generic blob as a frame; implemented
and checked against source/device/session/media/hash. Reviewer independently ran
17 authority/ACK/encoding negatives and 12 frame mismatch/missing-reference probes.
An intermediate run during the required-frame fixture update had 36 failures from
the old fixture missing `frame_id`; after updating that fixture and adding frame
negatives, the final checks above pass. No product failure was relabeled a pass.

These are code review, local validation and synthetic-model checks. They are not
independent role-QA acceptance, token verification, durable DB writes/concurrency,
actual blob checks, providers, live audio/screen capture, Pencil or Notability import.
The existing fourteen expected failures and known Web model defects remain visible.

## Coordination and remaining dependencies

Backend reported existing P0-04 dedicated-DB/HTTP continuation in
`handoff_dd36c8608aab3609ccad0887f4ce36b7`; Learning reported P0-05 atomic index
snapshot/recovery work in `handoff_267429134e6475e07467ad65be67f0aa`.
These are actual progress messages, not independently verified completed work.
The old missing-DSN result remains historical; a successful new DB run is not yet
claimed here. Existing iOS capability work and Web repairs continue; support stays
on demand. No quota polling, restart, model switch or permission expansion occurred.

After an exact milestone SHA is committed/pushed, Backend receives the bounded
capture baseline for P0-09 **after** its current P0-04 segment; QA receives an
independent contract/compatibility check. Existing client owners receive the precise
scope and unchanged active-task priorities, not duplicate implementation tasks.
Lead still owns remaining attempt/revision/presentation/permission/export families
and linked-v1 adaptation. These are internal engineering, while actual DB, device
and provider evidence are separate execution gates. Post-commit delivery/push
receipts and any later actual adoption are recorded below, never inferred from send.
