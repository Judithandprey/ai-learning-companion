# Recovered P0 deliveries and integration

2026-09-29 UTC. This follows the WSL/desktop/OAuth interruption; saved outputs were
recovered and completed tasks retained. No model/effort/budget/permission change,
provider activation or duplicate recovery batch was used. The current lead-owned
[stream-control milestone](p0-stream-control.md) is separately versioned/tested.

## Actual deliveries and disposition

| Owner / actual native message | Owner commit → main / disposition |
| --- | --- |
| Web, handoff_21e6149382342162f199f5e5e32545f4 | 7ee1217 → 1da1bc9; 8d67aaa → 93674f1; db7400f → fa5c03a. Ordered cherry-picks, no conflicts. Test-only models and owned fixture; production page change is comment-only. |
| QA, handoff_a96917cd5bf3c5ccfffcc102a79aad89 | bd79ca4 → debbbec. Actual capture/QA-14/context independent report, preserved recovered review journals and meaningful regressions. Output-repair retest is its separate existing assignment, not duplicated. |
| Learning, handoff_bcf3a33e814d4ac76684dbc382c75961 | 1eff66e not integrated yet: isolated 159 tests pass but actual Backend composition reveals two blocking compatibility gaps, returned to owner. |
| Backend, handoff_fe9e41edd32836e37d09483c0adc58a1 | 1596db6 not integrated yet: 125 portable tests reproduce, but review finds missing event silently omitted despite its surviving receipt. Returned to owner; four real PostgreSQL groups remain owner evidence. |

Web and QA substantive deliveries establish actual resumed execution. Accepted
mail alone did not establish that. Initial startup checks were not product tests.

## Web repair and exact-main checks

The [bounded independent Astra review](p0-recovered-deliveries/web-review.md)
reviewed exact ec18580..db7400f and reproduced 22 changed tests, the original QA
adversarial probe, three D1 before/after and five ORG-3 contrasts. Two sampled
oracle-only mutations fail at the intended assertions. No new blocker was found.
The worker's completed whole mutation/browser/reviewer batch was not replayed.

After integration on main fa5c03a, lead ran:

```text
BROWSER= bash apps/safari-extension/scripts/check.sh
TypeScript passed; all 11 test files passed; browser build passed.

.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/*.test.ts
87 named tests passed; no failures/skips.
```

The explicit named run resolves the default runner's file-level summary, rather
than reporting that summary as 87 named results. Logs:
[module](p0-recovered-deliveries/web-module-check.txt),
[named tests](p0-recovered-deliveries/web-named-check.txt).
Browser was not started by lead. Worker-recorded 21/21 desktop entries and 54/54
self-test remain **owner evidence**, not lead observations or iPad/Pencil tests.

D1 connected restrictive intent, ORG-3 possible external effects and EO-1 bounded
closed-root attribution are repaired within the documented models/owned fixture.
Exact intent-ID acknowledgment and remote causal basis, real export reconciliation,
EO-7 polling/actor ambiguity and real runtime/AI/device/import are still open.
A boolean close flag is not a production revocation contract. New stream control
0.2.1 covers capture lifecycle only; it does not release presentation/export policy.
QA may independently retest this exact Web candidate after its already running
output-protection retest; no duplicate copy of the old recovery batch is assigned.

## Actual QA result and retained findings

The independent [QA report](../qa/p0-09-capture-context.md) closes QA-14 for the
reported validator/error-rendering/v1 HTTP nesting paths. Its base is 3f37521,
with applicable runtime bytes checked against fc079e9. The reported full-copy
857 pass/1 skip/16 xfail is **QA's** earlier Python run, not the lead's new result.
Lead reviewed and integrated its seven scoped files and ran only the new regression
module on actual main:

```text
.venv/bin/python -m pytest -q tests/e2e/test_p0_09_capture_context_qa.py
12 passed, 3 strict xfailed (exit 0)
```

[Exact log](p0-recovered-deliveries/qa-regression-check.txt). The three xfails are
preexisting capture authority collection types (two cases) and negative context
omission counts. Their existence is not a successful repair. No broad batch or
new real-DB test was run merely to re-establish recovery.

Disposition under existing ownership:

- Learning P0-05: actual continuation accepted as
  `handoff_ca8db1656947f400557333cfcaeb57e2` for truthful eligible counts,
  accessible competing-branch labels without hidden-source rehydration, bounded
  cycle/input guards, and explicit unchanged current-mode semantics. Preserve
  originals, rankings, historical recovery and unknowns; no model/provider work.
- Backend P0-09: new control/resolver continuation includes strict collection
  checking at its existing resolver boundary. Old collection xfails stay open
  until the actual repair is integrated. No shared old contract bytes may change.
- Lead shared helper / Backend ingest: CAPTURE-AUTH-02/DEPS-02 repeated full-batch
  validation under actor lock and DEPS-01 repeated ancestry work remain named
  follow-up; optimization must preserve validation, replay bytes and fences.
- Lead artifact policy / Backend storage: CAPTURE-DEPS-03–05 remain blocking
  dependencies for public typed upload/shared artifact activation. A mere pending
  capture reference or colliding ID/digest does not establish ownership of an
  independent user-ink original or permission to delete it. Future associations,
  pins, explicit source deletion and all legacy writers need one coherent rule;
  no silent loss of unrelated ink or tombstone resurrection is acceptable.
- Other low context robustness/long-chain and informational observations remain
  recorded in the full QA report; they are not suppressed or relabeled passed.

The QA report notes historical 62e5ab9's QA-12/13 report section is still only on
team/qa. This integration does not falsely claim that old section was imported.
The actual later QA-14 report above is now on main.

## Snapshot integration blockers and next steps

The [full bounded review](p0-recovered-deliveries/snapshot-review.md) initially
reproduced 159 Learning tests, then tested **actual** Backend export 1596db6 into
Learning ArchiveSnapshot 1eff66e and existing context. Three legal cases reject:
null frame with empty gap flags, equal correction capture time, backdated
correction capture time. Shared v1/Backend ingestion/export preserve all three;
a later-clock positive control builds a two-item context. [Observed cases](p0-recovered-deliveries/snapshot-composition.json).

This is a real seam incompatibility, not a reason to rewrite stored gaps or clocks.
Learning received `handoff_0a2737eac414d26a079b6e3192b72fce`, prioritized before its
already assigned context follow-up: preserve strict FixtureArchive conventions,
accept legal v1 runtime observations unchanged, retain owner/source/actor/reference
checks, and validate correction graph acyclicity instead of assuming clock order.
No Backend/schema permission change or duplicate task. Lead will recompose the
corrected exact candidate before integrating Learning; the isolated green suite
alone is insufficient. The [exact probe source](p0-recovered-deliveries/snapshot-composition-probe.py)
is preserved here; run its copy from the described candidate root, as in the
review. Its assertions describe the original failure, not a post-repair test.

Backend review independently found **B1**: after deleting a stored observation
while retaining its sequence receipt and no deletion tombstone, export succeeds
without that known original. [Complete review](p0-recovered-deliveries/backend-snapshot-review.md)
and [exact original reproducer](p0-recovered-deliveries/backend-missing-event-probe.py)
are preserved. Its 125 portable tests passed, so this is a missing integrity case.
The real DB owner report is retained; no broad DB rerun was required to find B1.
Backend received `handoff_04cb2a8829cd22d0cc00e73e98502e6b`, prioritized before
completion of its newly assigned control segment: verify receipt→event inventory
under the same actor lock, allowing absence only with a valid matching explicit
deletion tombstone; otherwise reject the whole export. Preserve legitimate deleted
unselected sources and do not reconstruct content. No new protocol/migration.
Both snapshot deliveries therefore remain **not integrated** until exact repaired
candidates pass recomposition; completed independent checks are not substituted
for this failed seam. Lead continues reviewed Web/QA publication meanwhile.

QA's next bounded existing P0-13 action, after its original output-repair retest,
is independent retest of the integrated Web repair at the exact pushed baseline.
It should cover D1/ORG-3/EO-1 and regression coverage while retaining the documented
policy/device limits; it does not repeat the recovered capture/context batch.

 A detached snapshot is
point-in-time evidence, never durable authorization or presentation permission.
Real capture → save → UI reopen, actual model continuity, G6/G7/P1, R59/A44/A46 and
all AVTEST cases retain their unverified status.
