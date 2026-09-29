# Recovered P0 deliveries and integration

2026-09-29 UTC. This follows the WSL/desktop/OAuth interruption; saved outputs were
recovered and completed tasks retained. No model/effort/budget/permission change,
provider activation or duplicate recovery batch was used. The current lead-owned
[stream-control milestone](p0-stream-control.md) is separately versioned/tested.

## Initial recovered deliveries and disposition (historical; corrected below)

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

## Initial snapshot integration blockers (historical; corrected below)

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

<a id="workflow-adoption"></a>

## User-approved delivery/simple-design workflow adoption

Applied at the next saved boundary over clean, already pushed
`0c04b2e888fbb7240e9634a6ade2bd309601e3a1`; no rollback to the older outage
inspection fc079e9. Read the complete operator integration request, manifest,
407-line prepared patch and full policy. `git apply --check` passed; the patch
applied cleanly. Input patch SHA-256:
`a32a2d24601c68edee7e68c016dbe0a280a6d1dbbbafe9f658c7a100fab22c68`.
The prepared entry-point changes match their candidate hashes; product source,
English, audio, intent, traceability and manifest files are excluded and unchanged.
No new skill/framework, runtime, model, effort, budget or permission change.
Focused documentation validation passed: 11 candidate hashes, 13 unchanged product
source hashes, patch hash, 113 local link targets, exact scoped paths and
`git diff --check`. The shell has no `python` alias; the unchanged check ran with
`python3`. No application tests were run for this documentation-only update.

The existing P0-07 card now names the next **real UTF-8 document → explicit ASK →
original/context save → close/reopen** outcome, owners, actual missing code seams,
launch evidence and separate provider/device boundaries. Existing code inspection
confirms Web can select/freeze/render cards, while `/v1/sources` only registers
URLs and `import_fixture` cannot ingest real content. Saved frame/artifact readback
and a connected UI are also absent. The card therefore records waiting/not yet
usable, rather than substituting more isolated test counts for an operable preview.
No new store/identity or general upload framework is requested. Lead's next bounded
P0-07 enabling task demonstrates outcome/baseline/path/acceptance/next-owner rules;
current worker repairs stay intact and no duplicate assignments are created.

**Historical transport failure in the earlier unreferenced run:** native Chats `list` and `inbox` each
returned exactly `agentsdock-chats: server rejected request (403): provider action
was not authorized`. This is not an empty inbox, delivered notice, quota failure
or evidence that stored routes were revoked. No send was attempted, no alternate
transport or old grant used, and no retry loop started. The six policy notices
below were **not sent / no read or applied receipt in that run**. The new authorized
run and actual delivery receipts are recorded separately below.

| Existing worker | Notice content at next safe boundary, preserving current work | Actual adoption state |
| --- | --- | --- |
| Backend | Read `git show SHA:docs/workflow.md`; finish assigned integrity/control work, then the single P0-07 real-document/store/readback piece; no undelegated shared edits. | not sent; former-run 403 |
| Learning | Same exact workflow read; finish its snapshot/context repair, reuse the same archive for preview, no provider claim/second identity. | not sent; former-run 403 |
| iOS | Same read; use preserved capability evidence for one concrete Mac/Xcode/signing/device-path decision with actual dependency, no duplicate matrix or purchase. | not sent; former-run 403 |
| Web | Same read; use committed P0-07 preview card and exact upcoming import/readback boundary, preserve finished repairs, no fixture response as real understanding. | not sent; former-run 403 |
| QA | Same read; preserve existing retests, then one actual start/UI/API/restart/reopen acceptance on the combined preview, distinct from device/provider evidence. | not sent; former-run 403 |
| Support | Same read only at safe boundary; stay on demand, no duplicate research or quota polling. | not sent; former-run 403 |

Previous-run QA Web retest assignment **was actually accepted** as
`handoff_7d3262bdd0770543cbaf2a5d80df0d53`, using exact pushed `0c04b2e` after the
existing output-repair retest. That is a substantive prior assignment, not a
workflow-reading notice, and is not resent after this denial. Learning's actual
snapshot correction fbeaf65 arrived as
`handoff_3ae21885aadbbf71cde30fc167aaeb12`; its saved correction review now records
75 focused passes and all four original composition cases passing. No interrupted
check was counted. Source integration follows this policy-only commit separately.


### Exact policy publication and native route recovery

Policy/entrypoints/P0-07 card committed as
`4a2be79525e87542b3ca77ac6fd04ecf28b04b6d` and normally pushed to `origin/main`;
`git ls-remote` returned that exact SHA. Sandbox Git metadata/DNS restrictions were
handled with normal exact-command approvals; no force, reset or credential change.

A **new user turn** supplied the six existing references after the operator
identified their omission. This run's actual native `list` returned all six granted
`async_route_v1` routes; `inbox`/ordered `read` succeeded. This is new authorization
and observed restoration, not bypass of the old denial. No old denied call was
replayed. Minimal role/SHA/accepted-message receipts are retained in [workflow-dispatches.json](p0-recovered-deliveries/workflow-dispatches.json).

| Existing role | Actual accepted message | Read / applied evidence |
| --- | --- | --- |
| Backend | `handoff_85aeb9c58871ddbb45001db9563b0b37` | actual reply `handoff_82f94df1ff000a5fbe69212b90c15113` confirms full policy SHA and delivers finite preview wire f0ecfe1; correction required before release |
| Learning | `handoff_6f8fd876fefb4cf90d1a7432f7a3f251` | actual reply `handoff_eaed89c1ee1592b6eaded59d51134668` names full 4a2be79 SHA and applied policy to delivered 13298e6 |
| Web | `handoff_401a9fc977503d93ce7536dc16a3f9d6` | actual reply `handoff_1c158b71ca1bb27ddc69716bb8965ef8` confirms full policy SHA and UI9c1d070 delivery; preservation fix required before integration |
| QA | `handoff_d55b11f046e0b8dc359bf34c470ab872` | accepted/unread at send; existing Web retest retained |
| iOS | `handoff_7cedd99e4f141d9ca0d15da8524b91b9` | actual reply `handoff_8b2eb41a85fa7e8d585ea2256c29ac22` names full 4a2be79 SHA and read policy/role/card; 402bbcf integrated as 91d41e8; hosted compile next, device untested |
| Support | `handoff_0bf864eb2da72e91ed3a7749703a7e14` | accepted/unread at send; remains on demand |

All notices say to read `git show 4a2be79525e87542b3ca77ac6fd04ecf28b04b6d:docs/workflow.md`
at a safe boundary, preserve current work and report adoption with the next
substantive delivery, without acknowledgment loops. Models/effort/permission/budget
and product requirements are unchanged.

**First task using the policy:** existing P0-07 now has one real-document preview
outcome. Backend's accepted task supplies controlled import, save and exact readback
in the current store, with a **bounded explicit delegation** of only
`packages/contracts/document_preview/**` and
`packages/contracts/tests/test_document_preview.py`; no second shared writer.
Backend hands off the small separately versioned wire slice before its full storage
implementation. Web's parallel owned UI task can build file input/select/ASK/save
state independently, then bind the exact committed wire. Lead owns final shared
compatibility/launch integration; QA gets one actual combined restart/reopen pass.
Both tasks name exact baselines, allowed paths, negative cases and next owners.
Neither mock UI nor saved fixtures counts as real persistence/AI understanding.

Learning has delivered context repair and received one next existing P0-05 task
for QA-L05-02/03 guard/evidence fixes. QA retains its already assigned Web retest.
iOS preserves native limitations and names a concrete existing-access compile/device
route; Support has no manufactured new incident. No completed batch was repeated.

### Corrected snapshots and independent QA retest integrated

- Learning `1eff66e` / `fbeaf65` → main `792081f` / `8852876`.
  [Correction review](p0-recovered-deliveries/snapshot-correction-review.md):
  75 focused passes and original four composition cases accepted without rewriting
  gaps/clocks. Main snapshot/memory/context checks: **173 passed**
  ([log](p0-recovered-deliveries/learning-snapshot-main-check.txt)).
- Backend original `1596db6` / B1 repair `68274f2` → `cc2a1c6` / `f54e1e2`.
  Actual correction receipt `handoff_86561e9fa036e0d426adeb53606f6386`.
  [B1 review](p0-recovered-deliveries/backend-snapshot-b1-review.md): unchanged
  missing-event reproducer now rejects with 503, 14 targeted tests pass, legitimate
  deletion retains other sources. Main focused snapshot/archive/storage checks:
  **136 passed** ([log](p0-recovered-deliveries/backend-snapshot-main-check.txt)).
- On integrated main `f54e1e2`, the original four cases were composed through actual
  Archive export → ArchiveSnapshot → RetrievalIndex → context. All preserve originals
  and pass: later-clock 2 items, null-frame/no-gap 1, equal-clock 2, backdated-clock 2.
  [Runnable corrected probe](p0-recovered-deliveries/snapshot-composition-corrected.py)
  differs from the reviewed correction probe only in repository fixture-path lookup;
  [output](p0-recovered-deliveries/snapshot-composition-corrected.json).
  The initial failing probe/results remain intact.
- Independent QA output retest `eaef498` → `5d304f4`, actual receipt
  `handoff_69e8a8ffa9c6e5d9d30e9e00a37f46d7`.
  [QA report](../qa/p0-05-output-repair-retest.md) confirms the original demonstrated
  QA-L05-01 paths and retains new QA-L05-02/03. Main QA module **8 passed / 2 strict
  xfailed** ([log](p0-recovered-deliveries/output-retest-main-check.txt)); neither new
  failure is marked repaired. All probes use temporary copies, never actual originals.

These checks are local synthetic software evidence; no new real-DB, live AI,
device, G6/G7 or full P1 acceptance is claimed. Backend's separate e1eb0f6 control
registry delivery has its own narrow review and integration below; snapshot approval
alone did not cover it.


### Context correction and recovered CI prerequisite

Learning `b21c8e3` → main `52f3f1d`, received as
`handoff_2f2ec33da01244955d0a7fb30d22bc1b`.
[Independent review](p0-recovered-deliveries/context-repair-review.md) passed 145
focused cases including 19 independent scope/fork/cycle probes, plus the original
QA omission regression with `--runxfail`. The 187 originals and retrieval ranking
code stayed unchanged. Lead removed only the repaired CONTEXT-ACCESS-03 strict
xfail decorator; its original assertions remain. Integrated context/QA/baseline
checks: **150 passed / 2 existing capture strict xfailed**, exit 0
([log](p0-recovered-deliveries/context-main-check.txt)). No quality re-measurement,
real provider or transaction-level authorization claim follows from this correction.

The iOS delivery also identified a root CI prerequisite. Lead fetched the actual
[GitHub Actions failure log](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36523760603):
11 frozen-v1-baseline cases fail because `git show 7fadd151…:path` cannot read the
historical tree in the shallow checkout; Python 3.12 reports 966 passed/19 xfailed
beside those 11 failures. Those failures are not suppressed. The scoped root fix
adds `fetch-depth: 0` to the existing pinned checkout, keeping read-only permissions,
credential persistence disabled, tests and locked dependencies unchanged. All 11
original baseline assertions pass in the local integrated check above. The next
ordinary push must provide actual hosted-CI evidence; a local pass is not that result.


### Internal control registry and concrete native compile route

Backend `e1eb0f6` → main `882431a`, actual delivery
`handoff_c442de304bcec6c9ba2fd110afa9be29`.
[Focused independent review](p0-recovered-deliveries/control-registry-review.md)
approved current-authority replay, exact single-use start, stop/seal floors,
source/membership fences and closed unreleased paths. It ran 52 selected tests,
17 selected guard/closed-route tests (one overlaps), 12 independent MemoryStore
interleaving probes, and both unchanged original QA collection-type assertions.
Lead retired only those two repaired strict-xfail instances; all assertions remain.
Integrated control/capture/snapshot/QA checks: **256 passed**, exit 0
([log](p0-recovered-deliveries/control-main-check.txt)). Owner's 12 real-PostgreSQL
groups are preserved in [its report](../backend/p0-09-control-registry.md), including
observed waiter/blocker transaction IDs; they were not rerun or relabeled as lead/QA
observations. No new migration, paid provider or public route was activated.

The three original strict failures in the new capture/context QA module are now
ordinary passing regressions. Other shared-artifact/deletion/pin, repeated
validation/ancestor cost, provider/device and presentation/export gaps remain open.

Received iOS `402bbcf` → `91d41e8`: minimal read-only Swift environment probe,
concrete hosted-build/Swift-Playgrounds route and existing-access investigation.
Lead source review confirmed it reads local state only; no audio category/mode
change, capture, permission request or network call. A separate root-owned
`.github/workflows/ios-probe.yml` uses the existing pinned checkout, read-only repo
permission, `macos-26` and unsigned `xcodebuild`; it will record the actual toolchain
and result on the ordinary push. It is **not yet compiled or device tested** in
this record. iOS owns any compile correction after that actual result. The user
has not yet been asked to install/run/share a probe, and no paid signing/account
or Mac purchase was performed. Native audio, cross-app ink and Notability remain
unverified regardless of this compile result.

Learning additionally returned `13298e6` as
`handoff_eaed89c1ee1592b6eaded59d51134668`, explicitly confirming the full workflow
SHA and delivering the assigned QA-L05-02/03 repair. This is an actual read/applied
receipt beyond initial acceptance. The guard patch passed bounded independent review and is integrated below; its
original QA assertions are retained as ordinary regressions.
[Exact adoption reply](p0-recovered-deliveries/workflow-learning-read.json).


Publication review rejected the first combined commit/push command before Git ran:
the proposed JSON included raw internal Chats routes/session identifiers and full
message bodies. The command was not bypassed. Those uncommitted raw files were
retained locally outside the repository; public evidence was reduced to role,
exact policy SHA, accepted message receipt and substantive adoption/delivery state.
No runtime identity, authority, token or complete chat body is published by these
new receipt files. The safer scoped commit/push is submitted through normal review.


### Final source-inventory guard repair and next build owner

Learning `13298e6` → main `3e0be6b`. The [bounded review](p0-recovered-deliveries/inventory-guard-review.md)
passed 12 new cases, three original QA reproductions and three root-alias/outside-
hardlink controls. No extra filesystem framework or corpus/ranking changes. Lead
removed only QA-L05-02/03 expected-failure markers, retaining all original test
inputs/assertions. Integrated publication/QA checks completed: **77 passed**, exit 0
([log](p0-recovered-deliveries/inventory-main-check.txt)); no interrupted or pending
run is counted. Static guards still do not establish
race-proof filesystems, APFS, bind-mount, power-loss or caller-redirect guarantees.

Support returned `handoff_9966c55d1751ba7d5f82b3ed368ef2da` reporting a bounded
native build-path assignment. Lead reconciled it with already integrated EnvProbe
and CI rather than creating another workflow: actual reply/task
`handoff_9daf7643b1186958d5a9fa3968ab5833` delegates only
`.github/workflows/ios-probe.yml` and optional `scripts/ios-build/**` to Support,
if the actual compile run demonstrates a needed correction/artifact step. No
concurrent lead edits to those paths; iOS retains native source/project/manifest.
Support must inspect one actual published run and return a bounded patch or exact
next dependency. No signing, purchase, task-branch push, duplicate workflow or
permanent monitoring was authorized by this coordination.


Later iOS notice `handoff_46d5863e5c44aed995838d2a076f54f5` reports an existing
bounded own-fixture ink prototype at `apps/ios/CompanionInk.swiftpm`, scheme
`CompanionInk`, under its native ownership. This is a received start notice, not
a delivery or compile result. Lead preserves the ongoing assignment; Support's
build task first reconciles EnvProbe, then the actual delivered native candidate.
The owned fixture/ink/AI-unavailable UI cannot close original-screen or device gates.


### Published milestone and the next operable-preview gate

Reviewed integration and safe receipt record **01a8adf73d9e62465082c0319c5801ecfc8fb203**
was normally pushed; `git ls-remote origin refs/heads/main` returned exactly that
SHA. Its [P0 GitHub Actions run](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663495)
completed **success** (Python 3.12/3.14 and Node checks), observed through `gh run view`.
The separate [unsigned iOS compile](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663497)
was observed running and handed to Support with its exact published SHA; no compile
or device success is inferred. Subsequent edits in this note record delivery evidence,
not a different tested application candidate.

Actual read/adoption replies now cover Backend, Learning, Web and iOS. QA/Support
policy reading is not inferred merely from delivery or unrelated activity; all six
notifications were accepted, without acknowledgment loops.

- Web **9c1d070** delivers a foreground owned-document launcher/UI, with real
  UTF-8 input and honest unavailable default. Its opt-in memory test double is
  not durable storage. [Bounded review](p0-recovered-deliveries/web-preview-review.md)
  found a confirmed preservation blocker: after ASK alpha and typing a user note
  before first Save, ASK gamma clears the note without discard confirmation.
  Independent Edge/CDP reproduction has zero runner errors; [before/after evidence](p0-recovered-deliveries/web-preview-note-loss.json).
  Nine new tests/typecheck/build pass but do not cover that missing case. Repair
  accepted by native transport as `handoff_c794bc0b6775718bf8277d8b8490bb21`;
  same Web P0-07 task, not a duplicate. Candidate is **not integrated**.
- Backend **f0ecfe1** supplies the small separate `document-preview.0.1.0` wire,
  under its exact delegated paths, while its actual persistence implementation
  continues. [Bounded review](p0-recovered-deliveries/document-preview-wire-review.md) reproduced three invalid SavedPreview responses accepted
  by its validator: wrong source owner, observation rebound to another source/frame,
  and assistant/AI-supplement note despite provider-unavailable status. This is
  local composite-validation scope, not a demand for another future contract.
  Same-task narrow fix accepted as `handoff_648710e83bd9131860a90d8f99edfdc5`;
  [Saved positive/probe](p0-recovered-deliveries/document-preview-wire-probe.py) preserve the reproduction (only package/payload lookup made portable). Keep fields/version, bind output records and user-original attribution, then
  publish the corrected small wire first for Web. Candidate is **not released**.

Next owner/action: Web fixes draft preservation; Backend fixes/releases the finite
wire and finishes same-store save/restart/readback; lead integrates those exact
corrections and connects the runnable preview; QA exercises that one combined
workflow after its current Web retest. The tested 01a8adf baseline remains intact.
No runtime/model/effort/budget/permission change or real AI/device acceptance follows.


## Preview correction and runtime release (2026-09-29 UTC)

The previous two blockers are now fixed, not erased from history:

- Wire `f0ecfe1` + `96d8137` → main `697dafc` + `0c77721`. Independent
  [correction review](p0-recovered-deliveries/document-preview-wire-correction-review.md)
  reran 70 checks/generated validation and the original three cross-record
  mutations; all are rejected while a coherent real-document envelope passes.
  The old synthetic positive is correctly outside the preview envelope; the
  [retained adaptation](p0-recovered-deliveries/document-preview-wire-correction-probe.py)
  preserves original bytes/requests/text and changes only that fixture provenance.
- Web `9c1d070` + `8989b61` → `58aaa7f` + `8f13fdb`. Independent real Edge/CDP
  reproduction now keeps the original selection and exact typed note before the
  first save, disables Close and hides the replacement card. Nine related tests
  and TS pass; no whole browser campaign was repeated. See
  [correction review](p0-recovered-deliveries/web-preview-correction-review.md).
- Backend `bf3e58b` → `2118a0e`. Independent
  [runtime review](p0-recovered-deliveries/document-preview-runtime-review.md)
  checks auth/origin/identity, exact full original versus frozen DOM bytes,
  user-only attribution, idempotency and canonical deletion/revocation. Its 177
  focused checks, 10 deletion regressions and four extra probes passed. Seven
  real PostgreSQL/API-restart groups remain explicitly owner evidence in
  [Backend's record](../backend/p0-07-document-preview.md); not independently rerun.

On integrated code `2118a0e`, lead ran:

```sh
.venv/bin/python -m pytest -q packages/contracts/tests/test_document_preview.py services/api/tests/test_preview.py services/api/tests/test_preview_http.py services/api/tests/test_preview_local.py
.venv/bin/python -m packages.contracts.document_preview.generate --check
.venv/bin/python -m pytest -q services/api/tests/test_source_deletion.py services/api/tests/test_capture.py -k 'delet or revoke or tombstone'
.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/p0-07-preview.test.ts
.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
```

Results: **247 passed**, generated check exit 0, **10 passed / 56 deselected**,
**9 Web passed**, TypeScript exit 0. Existing v1/capture/control contract files
were not modified. No new dependency, migration, provider or account activation.

The released finite family is `document-preview.0.1.0`; Backend start/configuration
is in [PREVIEW.md](../../../services/api/PREVIEW.md). Web's actual transport is next:
its current default still refuses unconnected storage and its opt-in test double
is page memory only. QA receives one integrated runnable candidate for actual
UI save/API restart/reopen. API tests and this release do not establish a usable
connected browser preview, real AI, iPad/Pencil, original-screen or Notability pass.

In parallel, the [approved iPad split](ipad-delivery-split.md) preserves native
ownership and the one conditional QA assignment. EnvProbe artifact verification
succeeded; the separate ink candidate remains under source/build review. The
Agent Lightning direction is one deferred task-board entry, not an activated job.
