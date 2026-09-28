# P0-08 ADR backend review

2026-09-28 UTC. **No blocking design conflict found in the four assigned areas.**
Lead can proceed to the formal versioned contract in ADR §10.2. This is a bounded
design review, not approval to implement the proposed 0.2.0 prose as a protocol.
No new product decision is required by this review.

## Exact inputs and scope

- ADR and consumer input map read at
  `119108569377edccb606d148436c6962cb418ea6`:
  `docs/adr/0002-process-evidence-and-presentation.md` and
  `docs/adr/p0-08-consumer-review-inputs.md`.
- Read current P0-08/P0-09 cards, AGENTS/TEAM/backend role, main requirements
  R27–33/R41/R46–59 and relevant §§7.4–7.8/9.4/10, process specification's
  evidence/disclosure/coordination/acceptance sections, and the full
  `docs/requirements/intent-and-decisions.md`. Relevant specification files are
  unchanged from normative `9ce270cc747676889797199b7e8455ccfef07a5f`.
- Reused Backend `014d1807` original 25 vectors, `14d5a7c` C1–C4/INTENT additions
  and `45b6085` consumer review through the pinned input map. No corpus rewritten,
  persistence schedules executed or full 65-case evaluation rerun.
- Reviewed actual `Archive.events`, `put_note`, `delete_source`, HTTP authorization
  and `PostgresStore.transaction`; those three API files match between this
  worktree's starting `45b60858a7400cdb1650aca3cc578688ffe761c3` and ADR baseline.
  Also inspected current `Jobs._guard`/`commit`. PONYTAIL LITE: reuse the existing
  authenticated archive and actor transaction lock; introduce no second store.

## Four conclusions and concrete implementation constraints

1. **Process identity and sequence — ADR §§2–4: compatible.** Keep legacy
   `event_sequence(device_id, device_sequence)` and Observation IDs untouched.
   Use a separate process-record namespace with unique `(owner, record_id)` and
   `(owner, device, stream, sequence)` mappings. Bind stream/device to authenticated
   ownership and producer capability; page-supplied actor labels grant nothing.
   Exact immutable client payload replay returns the original durable receipt;
   changed ID payload or another record in an occupied stream slot conflicts.
   Server receive time is excluded from equality, as in current `Archive.events`.
   Stream restart creates a new declared incarnation/gap, never renumbers legacy
   events. Cross-stream sequence comparisons confer no causality. The next contract
   must distinguish stored envelopes, unresolved relations and preserved artifact
   bytes in its ACK; no pending reference counts as fully saved content or an
   applied process. Unknown version/kind stays an explicit rejection.

2. **Evidence and relation discovery — ADR §5: covers both serial winners.**
   Pin problem evidence revision plus relevant provisional/session revision even
   when a query found no receipts or relationships. Creating, correcting or resolving
   a relation advances all affected old/new scopes atomically; a problem-only
   counter cannot fence an earlier empty provisional query. Keep policy, preference,
   source/note and authority/deletion dependencies separate. Job commit first →
   later fact removes its current eligibility; fact first → stale job cannot commit.
   Reads must not serve a stale projection as current while recomputation waits.
   Exact duplicate receipts advance neither revision nor side effects. Current
   actor locking provides a simple initial serialization point; existing jobs only
   check their old source/authorization/budget dependencies and do **not** implement
   this expanded protocol. Reuse C1-V06/V12/V16, C1-C2-V17 and C2-V20.

3. **Deletion and mixed-source work — ADR §5: compatible, lifecycle must be
   explicit in implementation.** Compute the dependency closure before removing
   links: source evidence → cross-attempt/concept derivatives, replay bodies,
   caches and outputs. Preserve unrelated raw A2 work; surviving insufficient facts
   yield unknown, never “no help.” Check shared artifacts across notes as well as
   multi-source note revisions; reference counting alone does not establish which
   source content a blob contains. For inseparable legacy originals, preserve
   current `409 mixed_source_note_conflict` with no partial mutation; do not label
   it successful deletion or silently broaden the user's scope. Keep only necessary
   opaque identity/generation fences, with no content/hash/assessment reason;
   do not copy the existing retained source row as a new minimal tombstone.
   Reclaim individual markers only when retired stream/source generations and all
   accepted replay/restore paths demonstrably reject the old identities; elapsed
   time alone is insufficient. Until that proof exists, the minimal fence is still
   required. Remote/backup cleanup remains pending until evidenced. Reuse C3-V13.

4. **Legacy note writes — ADR §2, supported by §5: compatible.** Check the
   server-owned v2 resource association under the same actor transaction as current
   authorization, original-ink protection, note CAS and mutation. The association
   check must precede cached-success shortcuts; `put_note` currently can return an
   HTTP replay before looking up the note head. A permitted new v1 revision updates
   the original note and invalidates affected v2 projections/jobs/claims atomically.
   A true historical replay does not move the head, bump evidence again, reopen
   consent or restore presentation eligibility. If these invariants cannot be
   maintained, use the explicit unsupported/conflict branch. Unassociated v1
   resources retain behavior and bytes. Check late relation discovery in both
   orders too: an edit before association must still be reflected when it becomes
   associated. An old note response is never a new permission to present AI help.

## Minimal implementation order after this review

1. **Lead:** commit isolated version/schema selection, producer scopes, command
   and error/ACK semantics, resource-association behavior, and positive/negative
   compatibility fixtures. Keep default 0.1.0 and generated bytes unchanged.
2. **Backend:** additive migration for immutable process records, stream uniqueness,
   explicit dependency/revision indexes and non-content lifecycle fences. Reuse
   the actor lock initially; no provider/network work inside transactions. Include
   forward/rollback operation that preserves new originals and read/export access.
3. **Backend:** implement atomic append/read/replay, then revision/invalidation,
   deletion and the legacy note adapter as one guarded boundary before enabling
   dependent jobs. Add tests using existing schedules: legacy/new stream collisions,
   absent-evidence discovery, mixed-source/shared-artifact refusal, cached note
   replay, note/association/CAS races, deletion/replay after restart and rollback.
4. **Backend + integration/QA:** exercise both serial winners on independent real
   PostgreSQL connections, then exact-baseline compatibility/consumer checks.
   Learning and clients supply semantic and final-display evidence separately.

## Actual verification and limits

Read-only Git/source inspection plus a documentation diff check were performed.
Starting worktree was clean on `team/backend`; this delivery changes this file only.
No endpoints, migrations, dependency changes, services or product tests were run.
The original 25 vectors, C1–C4 additions and semantic 65-case corpus were not rerun.
Real PostgreSQL migration/concurrency remains unverified (no supplied test DSN);
it is a separate execution gate, not a reason to block the formal contract design.
No provider, original-screen/device, presentation or Notability-import acceptance
is established by this review. Contract/schema/API implementation remains 0.1.0.
