# Task board

P0 authorized by the user on 2026-09-28 UTC. Product requirements remain intact.
Setup is verified; application capability gates are not yet passed. Lead integrates
all deliveries into main and verifies the resulting commit before reporting success.

GitHub public visibility is intentional and authorized by the user's direct
confirmation. Lead may push reviewed/tested milestones to origin/main without
changing visibility or force-pushing. See `verification/lead/github-visibility-mismatch.md`.

| ID | Owner | State | Deliverable / prerequisite |
| --- | --- | --- | --- |
| SETUP-01 | Lead | Verified | Six role chats/worktrees; see verification/setup.md. |
| SETUP-02 | Lead + web | Verified | Actual legacy and async message replies; no application claims. |
| P0-01 | Lead | Shared foundation integrated; two QA defects fixed | Contract v0.1.0, generated OpenAPI; 100 shared tests after the QA-12/13 follow-up. Unsafe Python integers and invalid timezone exceptions now fail validation. QA-03–11 remain open (13 strict xfail cases on 7367c2c); QA-12/13 shared guards and narrow HTTP decode fix now pass lead reproduction; exact candidate CI/independent QA are separate. Current exact commit matters, not version string alone. |
| P0-02 | Web | W1 independently reproduced on exact main; coverage follow-up open | QA e26523e reproduced 71f1389: 63 named units, 51 self-test, 37 trusted with two unverifiable touch actions, 16 entries, 18 valid bundles, F4/F4b detections. W1c/e/f are remaining guard-coverage gaps; original dismissal behavior passes only at the desktop-probe level. See [QA continuation](verification/lead/qa-continuation-2026-09-28.md). |
| P0-03 | iOS | Research and validation tool integrated; device gate pending | a4841d3 integrated as 26996cd; subsequent P0-11 revisions include corrected DT-G3-10 independent stop behavior. Lead verified 62 matrix rows against main. All 58 device cases remain not_tested; no native compilation/device acceptance. |
| P0-04 | Backend | Real PostgreSQL/HTTP owner evidence integrated; broader acceptance pending | 65b419d → 2185f0b adds supervised API process-restart/readback/replay/revocation checks and dedicated-test-DB guards; production source/migration unchanged. Backend actually reports PostgreSQL 18.6: all 19 groups passed; main review independently ran 19 new guard tests without DB. [Exact evidence and limits](verification/backend/p0-04-postgres-http-evidence.md). Historical missing-DSN block is superseded for this bounded runner; DB crash/failover/downgrade and independent role-QA remain unverified. |
| P0-05 | Learning | Atomic snapshot repair integrated; callable context assembly next | ccfcb2c integrated in 8b9cbef; exact 50/50, fuzzy metadata 25/30 (five failures retained), originals/restart/rebuild verified. Backend peer review 8f13312 found no current-baseline blocker. Graphiti comparison and G6 remain incomplete. 8cdf0c2 → 5678714 snapshot/source-protection repair is now reviewed/integrated as 42359be → 0fd95f0; eight focused alias CLI cases independently pass and all 187 originals remain intact. Next callable context assembly is specified below under this same card; [follow-through evidence](verification/lead/p0-scheduling-followthrough.md). |
| P0-06 | QA | Independent initial report integrated; retest received, new defects open | fac974e merged in b31ffc5; lead self-check at 7367c2c was 109 pass/13 strict xfail. Actual retest 4e0dff9 confirms QA-01/02 and reports QA-12 recursive JSON crash plus QA-13 environment-error classification. 4e0dff9 integrated as 6673a3d; shared/HTTP fixes passed exact-main CI; independent QA 62e5ab9 confirms QA-12/13 on 37456ac (Python 3.14). Its added regression tests await review/integration. Mixed-worktree counts are not exact-main evidence. |
| P0-07 | Lead + owners | Backend HTTP/DB persistence portion evidenced; full path pending | Backend 65b419d runs real loopback HTTP writes, PostgreSQL commit and a new API process reading exact originals/history with persisted auth fences. Fixture input and local test auth only; real capture → API save → UI reopen/source recovery, actual course/provider/iPad remain unconnected/unverified. P1 is not complete. |
| P0-08 | Lead | First executable capture contract 0.2.0; runtime and other families pending | Separate [process capture namespace](../packages/contracts/process_v2/README.md): strict schema, Python invariants, generated types/OpenAPI, trusted-context comparisons and exact ACK/blob checks. Default 0.1.0 and artifacts unchanged. Capture only: no presentation/export/diagnosis capability, live endpoint or G7 acceptance. [Milestone checks and remaining work](verification/lead/p0-08-capture-contract.md). |
| P0-09 | Backend | Capture contract released; bounded internal ingest next | 25 original unexecuted vectors remain unchanged. 14d5a7c → 9327676 adds eight consumer extensions/five INTENT schedules; cad63a1 → a8e10e4 and c2f3f41 → 6d02539 add ten planned audio schedules and two normalization variants. Actual 7fadd15 read received. e8258c1 → da401e0 adds sixteen not_executed T1/T3/linked-v1 schedules. P0-04 dedicated DB/HTTP continuation delivered as 65b419d and reviewed/integrated as 2185f0b. Capture-only 0.2.0 baseline e63b28f was sent via handoff_c6038426cc7ebbdf4096285d34c65efc for subsequent P0-09 internal ingestion; no process transactions or migrations executed. [Disposition](verification/lead/qa-continuation-2026-09-28.md). |
| P0-10 | Learning | 65-case delivery; versioned reconciliation received, review pending | fb445ed adds 28 to 37 preserved cases. Backend 30dc33d reviewed 65/65 (32 reject, 33 conditionally retain); QA 25c63b6 independently reviewed original 37, finding additional issues and disagreement. 7da2298 preserves original cases and adds versioned reconciliation, 32 old-rule probes and 16 unexecuted INTENT scenarios; review pending. 53300c8 plus 45ce567 adds the reciprocal 13-entry design review and existing-schedule links, with the section locator fixed; no runtime execution. Audio design 3bb5e297 → ec370e7 and normalization 2b2859e → 31b224a are integrated: 24 unchanged planned cases, four acoustic pairs/eight conditions, no human references or measured winner. Actual 7fadd15 read confirmed. Structural probe success is not semantic acceptance; all product execution remains zero. |
| P0-11 | iOS | Reviewed plan integrated; formal contract/build/device dependencies remain | b284db1 → 3f13167 → 8fc65f7 integrated as ee71ad2 → b352f74 → caecce9. Share-panel and scoped-stop corrections reviewed; integration clarifies current-view freshness versus original-ink age, and preserves prior outcomes on reopening export. Main matrix check: 48 rows, 23 rejected mutations. All 43 device cases remain not_tested; no Swift/provider/device pass. Audio read at 89602e7 confirmed; ea39a3d adds six not_tested plan cases, received with review/integration pending. |
| P0-12 | Web | Synthetic models/probe integrated; new independent QA defects open | Existing W1/offline-refusal repairs remain, but e26523e and bounded Astra reproduction expose connected-refusal reconnect disclosure (D1), lost possible external exposure (ORG-3), and closed-shadow script attribution (EO-1). ORG-1 and coverage findings also remain. The prior 20 traces/3,000 sequences have known oracle blind spots and cannot certify the design. cb0f89b → ec18580 timeline repair is reviewed/integrated as 1c669ed → a09c43e with 20 named tests; the same owner continues accepted handoff_bb3179fd65457fcab0cef5f07db7226b for D1/ORG-3/EO-1. Runtime/provider/device acceptance remains pending; [evidence](verification/lead/qa-continuation-2026-09-28.md). |
| P0-13 | QA | Plan, independent reviews and exact-main retest integrated; product acceptance open | Complete plan lineage through 6351ab6 integrated with 37/28-case and reconciliation reports; cumulative live/AI-processing/human-reference evidence now explicit. Exact71f1389 retest e26523e and original log follow-up ddf49a5 integrated; findings returned to Web. Actual 7fadd15 read confirmed. Historical-source portability and quote-pointer maintenance are integrated (efa4666/2ea23c9): final scoped checks 37 passed/1 strict xfail/0 skips, archive-only 21 passed/1 strict xfail/0 skips; p29/s09/minimal-hint disagreements remain. Product execution stays 0/5 INTENT, 0/19 V, 0/23 backlog and 12 AVTEST not_run. [Continuation](verification/lead/qa-continuation-2026-09-28.md). |

## P0 resumption and provider availability (2026-09-28 UTC)

The following is the historical resumption ledger. Current task states are in
the top table; the latest reviewed integration and exact-main checks are in
[P0 review integration](verification/lead/p0-review-integration.md).

The configuration operator reported provider `rate_limit` / `monthly spend limit`
and a displayed 03:50 America/Los_Angeles session reset for iOS/Web/QA. This is a
reported provider failure, not a setup-only, route, filesystem or Git refusal; the
mixed message does not guarantee recovery at 03:50. Native Chats list/inbox/read
worked in this turn. Later all three roles delivered actual specification reads,
and QA and iOS delivered real commits; continued execution capacity remains
unconfirmed beyond those observed deliveries. Subsequent actual deliveries now
include iOS 3f13167, Web cdc354c/8a32a8a and QA ebc42e0/b82def6. The earlier
quota interruption is historical, not a claim these roles are currently all stopped.
No quota purchase, model/effort/permission change, worktree reset or retry loop was
used. User-directed runtime effort remains Astra ultra / Claude ultracode; this
record does not reconfigure runtime or reinterpret historical directory snapshots.

| Existing owner/task | Single next action and dependency |
| --- | --- |
| iOS P0-03 → P0-11 | P0-03 formal delivery a4841d3 received; lead review next, then retain existing P0-11 (worker reports resumed research). Native compile/device checks need an actual local or hosted macOS/Xcode/signing/device path; buying a physical Mac is not a prerequisite. |
| Web P0-02 → P0-12 | One repair handoff `handoff_f344c9e0c1347cb1617f52dbfeda3553` covers all six findings in learning review 59f8ec7; retain the later P0-12 plan. Actual repair handoff handoff_e38e1c4b6e64a0f7501e23d5a4568b66 returned cdc354c; review pending, not marked fixed on main. |
| QA P0-06A → P0-13 | Actual replies handoff_d11f00227f0b4440670f9df265db7a7e and handoff_5fd59ec910ad0b916bcee2358dd97567 delivered 4e0dff9/25c63b6. QA-01/02 reproduced, QA-12/13 raised; original 37-case semantic report received, remaining 28-case review continues. QA-12/13 shared and HTTP fixes now have lead reproduction; candidate 37456ac independent retest now received as 62e5ab9, confirming QA-12/13 on Python 3.14. Regression/report integration is separate. |

Available Astra work continued in parallel: Backend independently reviewed
Learning P0-05 (`handoff_4f166699ed064d6563303643961a4b25`, delivery 8f13312);
Learning independently reviewed Web P0-02
(`handoff_97ed5eea1a589ebbf106dd68eec84676`, delivery 59f8ec7). Backend received
and closed two bounded P0-04 fixes under its existing card. Lead integrated the
reviewed deliveries, corrected shared validation, and extended locked CI discovery.
The next Astra evidence slices returned actual deliveries: Backend P0-10
65-case semantics as 30dc33d (`handoff_4bdf285f72aeb186a030e4f90a4cbc2e`);
Learning P0-09 25-vector consumer review as fd5162b
(`handoff_1df53405404af015f49beeabb981690e`). Lead review/integration remains,
with concrete findings feeding existing task cards; shared P0-08 contracts and
P0-13 QA ownership remain unchanged.

Main checks: **407 passed, 13 strict xfailed**, no skipped test in the root script;
TypeScript and web build passed. Pushed code 7367c2c also passed hosted CI
[run 36397872539](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36397872539)
on Python 3.12 and 3.14. The real PostgreSQL runner separately returned
BLOCKED/exit 2; G1–G7 are not promoted by these local checks. Detailed provenance,
known defects and transport receipts are in
[P0 resumption evidence](verification/lead/p0-resume-integration.md).

Sending or yielding ends a chat turn, not this authorized project. Lead continues
independent work and handles later deliveries with review, integration and the next
bounded assignment. The product-document audit has now been received and adopted in the linked
intent/original-verification records. Three recorded user questions are answered;
there is no pending choice among those three. New actual ambiguity must be
recorded and asked without guessing, while independent P0 work continues.

## Shared dispatch baseline and boundaries

Historical first-dispatch repository base: `4684b79ed979ad5162e1c86635a245d68601da84`.
That initial dispatch supplied the exact P0-01 contract commit for clean worker
branches to fast-forward before editing. This is not a merge prerequisite for
later specification adoption or worktrees with ongoing changes. Contract version: `0.1.0`.
Actual baseline: `91019c3fd548e47aca632136012bb961c4af07cb`. The three accepted
mailbox receipts are recorded in `verification/lead/p0-first-dispatch.json`.
Receipt acceptance is not a claim that worker execution or verification completed.
Confirm branch, unrelated changes, baseline and owned paths first. Do not reset or
switch other worktrees. If a shared change is required, send lead a concrete request.
No paid product APIs, account registration, publication, purchase or unrelated
messages are authorized by these task cards. Official documentation research and
reversible local implementation/tests are authorized.

Return a committed delivery with commands/results, evidence, limitations, and
unverified conditions. Use the actual mailbox reply route and `--reply-to` original
assignment ID. Do not acknowledge receipt unless it resolves a concrete blocker.

## P0-02 / web

- Goal: R01/R03/R06–10/R46, G1, A01–03/A26 supporting probe, not full acceptance.
- Write: `apps/safari-extension/**`, `docs/verification/web/**`; module config/tests
  are allowed. Dependency manifests/locks, shared contracts, root config stay lead-owned.
- Implement explicit NAV/ASK/WRITE behavior and an English-first silent card probe
  in an owned test page. No selection in NAV/WRITE and no ordinary finger interception.
  Use `packages/contracts` types; immutable source/version anchors and honest
  `dom_snapshot` versus actual screenshot capability. Return prior mode on done/cancel.
- Fixture card only for a known fixture; arbitrary text must show provider unavailable,
  not a fabricated explanation. Use safe text rendering and no page credentials.
- Acceptance: compile TS; deterministic mode/anchor tests; run available browser
  checks on owned fixture, enumerate iframe/fullscreen/captions/cross-origin limits.
  Retain all actual failures. Do not log into a real course or distribute an extension.
  iPad/Pencil support remains untested until a real device path exists.

## P0-03 / ios

- Goal: R01/R03/R07–10/R29/R35–36/R46–48; G1/G2/G3/G5;
  A02–03/A12/A14–16/A26–28 supporting capability evidence.
- Write: `apps/ios/**`, `docs/verification/platform/**`.
- Inspect installed skills/playbooks and local public environment indicators for a
  real Mac/Xcode/remote build route, without searching credentials or private authority.
  Research current primary platform documentation. Record doc claims separately from
  executed tests: Safari/native messaging, Pencil/finger input, cross-App overlays,
  screen/audio capture, explicit stop versus background lifecycle, share/import.
- Acceptance: capability matrix with version/source/date, preferred/fallback paths,
  minimal build/sign/install steps, device test checklist and exact user inputs needed.
  No global overlay promise, paid cloud provisioning or extensive uncompiled Swift.
  Test tiny platform-independent probes only if useful; report compilation honestly.

## P0-05 / learning

- Goal: R04/R17/R27–32/R43–44/R50; G6; A04/A09–12/A19/A23 supporting evaluations.
- Write: `services/learning/**`, `services/worker/learning/**`,
  `tests/fixtures/memory/**`, `tests/evals/**`, `docs/verification/learning/**`.
- Approved fixture scope: project-authored synthetic content only, test-only consent,
  English teaching text with short Chinese recall clues where useful. Use v0.1.0
  source/frame/observation provenance; original UTF-8/artifact hashes and stable IDs.
- At least 30 fuzzy/history-correction queries plus 50 exact-history queries, distinct
  labels and plausible distractors. Include actor separation, same concept across
  courses, rare early detail, corrections, missing media and changed source versions.
- Implement a deterministic reproducible lexical + metadata baseline and an evaluation
  command reporting top-5 correct-source recall, latency/sample count, failures and
  zero paid calls. Demonstrate original records unchanged after index rebuild/restart.
  Do not tune on all evaluation answers or hide failures. No second identity/archive.
- Graphiti is a candidate, not a selected production dependency. Research a bounded
  same-input comparison and request exact dependencies/budget controls if required.
  Without an executed real candidate comparison, G6 stays incomplete.

### Next existing P0-05 segment: callable provenance-preserving context

Authorized scheduling continuation, 2026-09-28. This is executable implementation
under the existing card, after the atomic snapshot/source-protection repair; not a
new task ID or a repeat of its persistence work. Supporting R27–32/R58,
A09–12/A38 and V-ArchiveCompanionContinuity/V-ModelSwitchContext, with R53's
presentation limits intact. The bounded local packet is not those product passes.

- **Owner / baseline:** Learning. Main `1619b023ed7c04d3a498e4e2a9e683f34534f998`
  contains the unchanged v0.1 archive/retrieval; the repaired owner continuation
  `8cdf0c2` → `5678714` supplies atomic cache handling. Preserve both commits and
  current work. Lead supplies the exact integrated/task-card SHA in native dispatch.
- **Implement:** a callable internal context-assembly function/module in
  `services/learning/**` over the existing validated archive and `RetrievalIndex`.
  Reuse their identities, source/frame evidence, exact timestamp comparison and
  frozen scoring. Add focused tests under `tests/evals/**` and a short evidence note.
  Return a deterministic provider-neutral evidence packet with snapshot fingerprint,
  not generated answers. Default this assembler to `current`; require explicit
  `history` rather than accidentally inheriting retrieval's historical default.
- **Behavior:** require explicit trusted user scope; retain original-language
  quotations, actor, exact source/version/hash/URL, event and frame/media/time links,
  available observation confidence, distinct capture/receive time, correction links
  and gap flags. Missing evidence stays unknown. Keep the frozen retrieval/evidence
  output unchanged; assembler-only augmentation can use the same authorized originals.
  Use metadata filtering; any correction-neighbor
  expansion must recheck user/course/source accessibility before calling the raw
  evidence accessor. Competing corrections remain unresolved branches, not a
  timestamp-selected winner. Preserve `candidates` / `ambiguous` / `not_found`
  as retrieval outcomes, never proof that an event did not happen. Existing `current`
  and `history` modes must remain distinct: current means current in this supplied
  archive snapshot; historical records stay labeled as historical/superseded where
  established, with their own original sources. Do not call a time-filtered current
  result an as-of reconstruction; v0.1 lacks full knowledge/confirmation semantics.
- **Corrections and limits:** keep correction relationships visible without
  rewriting originals or guessing absent reasons. Unresolved/filtered relation,
  missing media, unavailable source and unknown order remain explicit. A v0.1
  correction is not an AUDIO proposed/confirmed speaker repair. Packet size limits
  are configurable transport defaults, not a long-term archive cap: omit whole
  evidence items with truthful omission/limit status rather than silently truncating
  quotations. Do not invent a total candidate count unavailable from the retriever.
- **Freshness / acceptance:** reject an index belonging to a different archive
  snapshot; reassemble after correction/deletion instead of reviving a cached packet.
  Test two-user isolation; teacher/user separation; source-version/frame integrity;
  current versus history and a future correction outside a time filter; inaccessible
  correction ancestors, competing corrections and exact fractional time; unknown/gap
  and no-hit cases; deterministic budgeting with originals unchanged; caller output
  mutation not changing the archive; deleted/stale snapshots and fresh-process
  reproducibility. Keep all 187 originals and the frozen query/label/ranking/failure
  evidence intact. No query-specific tuning or new lexical ranking rules.
- **Boundaries / next owner:** no second archive/identity, production DB adapter,
  shared wire change, presentation permission, provider/API call or product model
  selection. Current local `FixtureArchive` remains synthetic; Backend owns the
  future actual archive adapter and authorization/deletion transaction boundary.
  Lead reviews/integrates this callable stage toward P0-07; QA separately verifies
  a consequential exact candidate. Actual model-switch continuity/G6/P1 remain open.

## P0-04 / backend

- Goal: R02/R04/R27–33/R38–41/R43–44/R46–47; A10–12/A17–18/A21/A23/A27
  supporting skeleton; G4 real account connectivity remains a separate gate.
- Write: `services/api/**`, `services/worker/core/**`,
  `services/worker/connectors/**`, `docs/verification/backend/**`. Backend owns
  migrations under its module. Lead owns shared HTTP/wire schemas and dependencies.
- Baseline: dispatch supplies exact commit containing the backend optional lock.
  Install with `uv sync --frozen --extra backend --group backend-test`.
  FastAPI 0.141.1, Uvicorn 0.54.0, Psycopg 3.3.6, HTTPX 0.28.1 are pinned.
- Implement an executable API and PostgreSQL repository/migrations for immutable
  source snapshots, exact event batch ACKs and revisioned notes. Keep URL registration
  distinct from fetched/parsed content. All references enforce authenticated ownership.
  Same event ID/content is a duplicate; changed payload or reused device sequence is
  409. Mixed invalid batches roll back entirely. Server `received_at` must not break
  replay fingerprints. Note CAS preserves history, original ink and separate AI layers.
- Auth: explicit local test authenticator only; reject access without configured
  authentication. Anonymous/expired/insufficient scope and body identity spoofing
  fail closed. Do not call a test token login real OAuth.
- Budget: 100,000 CNY fen/month in America/Los_Angeles, trusted server month,
  known versioned price/FX, atomic reservations, idempotent settle/release, retry
  exposure included. Unknown execution outcome retains reservation pending
  reconciliation. No paid executor is enabled by this task.
- Worker begin/commit checks include authorization, source version, tombstone and
  cancellation. Final check/derived write must be transactionally protected;
  historical offline upload never reactivates live capture. Tests cover deterministic
  stale-job sequences plus real DB transaction races when a test instance exists.
- Scope HTTP to source registration/read, event batch, note CAS/read, usage and job
  cancellation. Fixed fixture snapshot/frame import may be a controlled local entry
  point. No full OAuth, scraping, media transport or production queue in this slice.
  Propose exact HTTP request/response schemas to lead before diverging from contracts.
- Acceptance: pure domain and in-process ASGI checks; real PostgreSQL migration,
  restart/readback, two-connection CAS/idempotency, concurrent budget and delete/job
  race suite. A missing dedicated DSN must explicitly block DB acceptance, not produce
  a green skip. SQLite/in-memory tests cannot prove PostgreSQL correctness.
- Environment: no docker/podman/psql/postgres/initdb currently found. Prepare SQL
  and a clearly gated integration command; do not provision cloud/accounts or silently
  change the chosen DB. Prefer HTTPX AsyncClient+ASGITransport for current local
  framework checks; the initial synchronous TestClient probe did not complete.
- Deliver commit, module test commands/results, no-secret env example, startup and
  migration/rollback instructions, real/untested separation and required DB conditions.
  Do not bypass any worktree approval denial; return its precise reason.

## P0-06A / QA contract foundation

- Goal: independently reproduce P0-01 invariants supporting R07–10/R27–32/R39/R44/
  R46–47 and A02–03/A10–12/A21/A23/A27; do not treat contract checks as gate passes.
- Exact baseline supplied in dispatch. Work only in review worktree; permitted writes
  `tests/e2e/**` and `docs/verification/qa/**`. Production fixes return to lead.
- Reproduce frozen-source/selection matching, finite/safe numbers, user-original
  note evidence/version checks, malformed URL and header key rejection, registration
  vs fetch distinction, unknown quota and budget presentation, OpenAPI generation.
- Execute lockfile installs and `bash scripts/check.sh`, inspect generated-artifact
  consistency and whether the documented service responsibilities are honest.
  Report additional meaningful failure cases with reproduction rather than mirroring
  every implementation detail. No paid API, course accounts, device claims or deployment.
- Return commit, environment, exact commands and passed/failed/untested separation;
  report any remaining local instruction/approval boundary without bypassing it.

## Historical problem-solving adoption and dispatch order

The user approved the problem-solving supplement and clarified multi-entry process
capture and original-screen annotation on 2026-09-28. Current scope is R51–R59,
A30–A46 and G7. R59 explicitly refines the original R03/R08/R46–48 goal; it is
not a newly invented wish or a replacement for course-viewing notes.
See [main requirements](requirements.md) and the
[problem-solving specification](requirements/problem-solving-companion.md).
Adoption is not implementation or acceptance. Earlier specification baseline
`57aee9cfc86dfa0dcde674d118034063163ddb13` was pushed and its five notices were
accepted; Backend, Learning, iOS and Web have returned reading reports for that
older SHA. Those reports do not establish reading the final clarification.
The final specification content is committed in
`a2567fa63cdc9c73e9902af57eabf5032a15e5a7`; the exact final reading baseline sent
to all five roles is `e43293760c70364584cb597ae01d34a261cc52cf`, which includes
the specification and its integration evidence. The synchronization turn verified
local HEAD and `origin/main` at that SHA with divergence `0 0`; no spec rewrite
was needed. Later P0 integration commits do not replace that reading evidence.
The prior run's native Chats `list`/`inbox` 403 remains in the evidence record.
In this new authorized turn both calls succeeded and all five actual async sends
were accepted. The transport blocker is cleared by observed operations; each
role's final-SHA reading requires its actual report. All five have now returned
actual `e432937` reading reports, with their message IDs in the adoption record.
Backend's design is now integrated as unexecuted vectors; no product acceptance
is implied by reading, design delivery or integration.
No alternate route, runtime-token change or repeated task assignment was used.
Actual notice IDs and reading reports are in
`verification/lead/requirements-v1.1-adoption.md`.
Existing P0-02/P0-03/P0-04, the P0-05 timestamp repair,
and P0-06A retain priority; this supplement does not replace their current states.

For **each of P0-08 through P0-13**, the lead's post-commit dispatch supplies the
exact specification baseline SHA. No uncommitted document is a worker baseline.
Workers can first inspect that SHA with `git show`; preserve ongoing work and
coordinate integration at a safe boundary, without reset or forced fast-forward.
Independent design documents and project-authored, test-only examples can proceed
after dispatch. Implementing a new shared protocol requires the versioned P0-08
contract commit and an explicit bounded implementation assignment. This adoption
does not start parallel implementation of a complete new API. Contract v0.1.0
remains unchanged; only the lead owns shared schemas, dependencies, locks and root
configuration, and only Backend owns migrations.

Teaching state (independent exploration, requested help, review) is independent of
NAV/ASK/WRITE input mode. Authorized writing may record process without requesting
an explanation. English-first teaching and persistent language preferences are
product behavior; Chinese engineering updates do not change that preference.
Retain original language, handwriting and source records. When a platform cannot
observe a step or reason, record the gap rather than reconstructing an invented
history. No new paid calls, account actions, publication or device access follows
merely from adopting these requirements.

The common evidence scope includes option selection/deselection/reselection,
text/formula edits, website canvases, external notes, owned canvases, captured-frame
drafts and switches among these entries on the same problem. Keep user input,
website-provided answers/grading and AI assistance separate. A correct option with
unknown reasoning is not independent mastery; process observation does not authorize
the AI to fill in or submit answers for the user.

R59/A44 requires the original website/Canvas/Notability screen to stay visible and
operable while the learner writes with this product's pen, and evidence that the
AI actually receives the composited view and available ink. Report supported
webpage overlays, Windows original-desktop layers (P3, unverified), and arbitrary
iPad/iPhone native-app layers separately. Screen sharing alone proves none of
these. Unverified/unsupported paths retain the requirement without blocking all
other paths indefinitely. Owned canvases, frozen views and side-by-side drafts are
A45 fallbacks, never R59/A44 passes. Course notes still require editable original
ink, source/frame/video anchors, separate necessary AI additions and honest
Notability share/import status under R46–48/A26–28/A46.

## P0-08 / lead evidence and teaching-policy design

- Audio/screen increment at the existing safe handoff: AUDIO-01–15 / A47–49: coordinate the future versioned evidence, correction-status, source/role and cross-source alignment design in ADR 0002 §11. Keep v0.1.0 byte-compatible; do not mistake an unconfirmed correction for a superseding fact. See [coordination](#audio-screen-coordination).

Current candidate: [ADR 0002](adr/0002-process-evidence-and-presentation.md),
candidate 119108569377edccb606d148436c6962cb418ea6 received actual bounded
Backend/Learning/QA reviews. The concrete dispositions and next formal contract
boundary are in [integration evidence](verification/lead/p0-review-integration.md).
The first executable **capture-only 0.2.0** slice is in
[`packages/contracts/process_v2`](../packages/contracts/process_v2/README.md).
It formalizes operation/coverage submission, explicit version/capability and trusted
context checks, exact atomic ACK obligations, artifact-status separation and errors.
Its schema/validator/generated artifacts are executable; endpoints/transactions,
registration and all presentation/assessment/export families remain unimplemented.
See [milestone evidence](verification/lead/p0-08-capture-contract.md); design and
local validation do not establish runtime, DB or device acceptance.

- Goal: R51–59 plus R03/R08/R46–48; A30–46 and A26–28; G7, with G1–G6 preserved. P0 design
  enables the P1 single-problem loop, P2 teaching and P3 cross-device delivery.
- Baseline: exact specification SHA in post-commit dispatch; subsequent consumers
  receive a separate, exact shared-contract SHA and version.
- Write: `docs/adr/**`, `docs/tasks.md`, `docs/requirements-traceability.md`;
  shared contracts under `packages/contracts/**`, root generation checks and
  compatibility tests remain lead-owned. The authorized implementation continuation
  adds a separate 0.2.0 capture namespace without altering v0.1.0 or adding endpoints.
- Design ProblemAttempt, step/revision/branch links, observation coverage,
  AssistanceEvent, DiagnosisRevision and LearningPreference atop the existing
  identity/archive. Specify source/attempt/preference versions and permitted
  disclosure at request, cache and presentation time; stale cards and queued audio
  must not survive changed intent, attempt or device permissions. Separate actual
  observation, user explanation and AI inference; preserve unknown intervals.
- Include input-entry identity, option transitions, text/formula revisions,
  source-of-answer/grading/help attribution, same-problem links versus restart or
  topic change, and missing-DOM/event intervals. Design original-screen editable
  ink, composited-frame evidence, scroll/zoom anchors and share-stop boundaries
  separately from frozen-frame drafts. Carry lecture source/video references,
  separate AI layers and external export/import states through the same archive.
- Dependencies: existing contract baseline plus P0-09/10/11/12 findings; reconcile
  disagreements before committing a future version and compatibility plan.
  Current [consumer review inputs](adr/p0-08-consumer-review-inputs.md) pin the
  Backend/Learning assertions; this partial input map does not close the ADR.
- Acceptance/evidence: ADR with invariants, state transitions, ownership and
  migration/compatibility decisions; worked test-only traces for A30–46; explicit
  unsupported fields/paths and versioned follow-up tasks. Report design review
  separately from executable protocol tests and real-device/provider acceptance.
- Deliver: scoped commit, decision/evidence paths, unresolved questions and exact
  follow-up contract dependencies. No second identity or isolated problem archive.
- Current next boundary: Backend reads the exact released capture SHA at a safe
  boundary after its existing P0-04 DB/HTTP continuation; then P0-09 may implement
  bounded provisional-session ingest/read/replay with existing ownership and source
  guards. Lead still owns attempt/revision/permission/presentation and linked-v1
  formalization. Learning/client runtime adoption waits for the relevant families;
  no duplicate task or interruption of Web timeline/D1/ORG-3/EO-1 repairs. QA may
  independently validate the released shared-contract slice; product cases stay open.

## P0-09 / backend process persistence design

- Audio/screen increment at the existing safe handoff: R60 / A47–48; AUDIO-02–04/07–08/13–15, AVTEST-01/02/05/07/08/11: preserve original oral attempts, transcript candidates and reversible correction/role history, original utterance time versus correction time, source gaps and scoped late backfill. No permanent recording expansion; production fields await P0-08. See [coordination](#audio-screen-coordination).

- Goal: R51/R52/R53/R54/R55/R57/R58/R59 and R46–48;
  A30–31/A34/A37–38/A40/A42–46, linked A26–28; G7/G5 supporting persistence,
  later P1 recovery and P3 synchronization.
- Baseline: exact adopted-specification SHA in post-commit dispatch; implementers
  must additionally consume the future P0-08 contract commit.
- Write: `services/api/**`, `services/worker/core/**`, module tests and
  `docs/verification/backend/**`; shared contracts/root files stay lead-owned.
  Backend alone owns any later database migration; none is required merely to
  submit this design.
- Design append-only observed steps, editable-ink revisions, parent/branch and
  replacement links, device sequences, correction/diagnosis versions and coverage
  gaps. Define idempotent offline replay, CAS, atomic cancel/intent-change checks,
  deletion tombstones and prevention of stale output/permission revival. Do not
  order cross-device process solely by wall clocks or claim an unobserved step.
- Design durable entry/attempt links for option changes, text/formula editing,
  webpage canvas, external notes, owned canvas and captured-frame drafts. Keep
  user input, website answers/grading and AI help distinct; reconnect or switch
  entries without inventing missing actions or collapsing a restart into the old
  attempt. Preserve original-screen editable ink, source/frame/video positions,
  composite visibility evidence, independent AI additions and Notability export
  versus actual-import evidence; a rendered image cannot replace editable ink.
- Design durable `AssistanceEvent` facts linking the actual help displayed/played
  to its attempt/step version, the user's request scope, permitted disclosure at
  that time, and actual assistance extent. Preserve the evidence needed to
  distinguish self-correction, correction after a hint and completion after seeing
  a solution. Generation, cache storage, queueing, withholding or cancellation
  alone does not establish actual presentation; preserve partial presentation
  when observed. Unknown presentation stays unknown, and display or
  playback does not establish understanding or independent mastery. Field names
  and protocol details remain for P0-08; this is a persistence-design requirement.
- Dependencies: review the received P0-04 delivery and prioritize its required
  fixes before this design; consult P0-08 and learning/platform evidence. A
  persistence proposal and test vectors can precede the new contract;
  production endpoints and schema changes must wait for it.
- Acceptance/evidence: data/transaction design plus deterministic race sequences
  for duplicate replay, branches, cancellation, language override, deletion and
  restart recovery. Include A37 vectors for no help, an actually presented hint,
  an actually presented solution, and generated-but-never-presented/unknown help;
  verify that retained request/permission/actual-help facts support learning-layer
  classification without promoting assisted completion to independent mastery.
  Add A42–46 vectors for entry switches, unknown reasons after a correct choice,
  missing DOM/events, original-screen versus frozen ink anchors, share stop,
  source recovery, separate AI layers and export/import state. Persist evidence
  for A44 without claiming that storage alone proves a working overlay.
  Define separate real PostgreSQL migration/concurrency tests;
  missing DSN remains untested, and an in-memory result cannot be PostgreSQL PASS.
- Deliver: scoped commit, model/transaction diagrams or tables, test-only vectors,
  commands actually run, remaining contract/database dependencies and limitations.

## P0-10 / learning exploration policy and process evaluations

- Audio/screen increment at the existing safe handoff: R60 / A47–49; AUDIO-01–12/14–15, AVTEST-01–12: extend existing case design with context-assisted ASR repair versus actual reasoning error, correctable speakers, quiet-professor loss, tentative acoustic cues, and bounded same-input quality comparisons. Preserve current reconciliation; provider evaluation remains unexecuted until an authorized available route exists. See [coordination](#audio-screen-coordination).

- Goal: R51–59; A30–46 supporting teaching/evidence cases; G7, with G6 still
  requiring its own candidate comparison and platform acceptance owned separately.
  P0 supplies cases/policy; P1 adds requested help and review, P2 targeted practice.
- Baseline: exact specification SHA in post-commit dispatch. Finish the P0-05
  timestamp correction before new work; runtime adapters await P0-08's version.
- Write: `services/learning/**`, `services/worker/learning/**`,
  `tests/fixtures/memory/**`, `tests/evals/**`, `docs/verification/learning/**`.
  Keep process cases versioned and distinct from the frozen P0-05 retrieval set;
  do not overwrite its originals, labels or failures to improve a new result.
- Prepare at least 30 project-authored, test-only process cases with independent
  labels: rapid edits, rollback, branches, valid alternative methods, invalid
  reasoning with a correct answer, missing frames and unknown motives. Cover
  independent exploration, local checking, minimum sufficient hints, explicitly
  requested solutions, user-corrected diagnosis and persistent/temporary language.
- Include selection/deselection/reselection and text/formula editing across
  websites/canvas, external notes, owned canvas and frozen drafts; distinguish
  the same problem, a new attempt and a new problem. Label learner input, website
  solutions/grading and AI help independently. Correct choices with unknown
  reasons remain unknown; seeing a composite is different from inferring unseen
  ink. Cover A44/A45 evidence distinctions and A46's original/AI note layers;
  synthetic examples do not verify live annotation or Notability import.
- Design assistance evidence distinguishing self-correction, hint-assisted work,
  following a solution and independent transfer. Skipping practice is not failure
  and assisted success is not evidence of independent mastery. Keep teaching
  English-first with original technical terms and brief Chinese hints where useful.
- Dependencies: draft cases and policy before P0-08 if useful; protocol-dependent
  execution waits for the committed contract. QA independently reviews relevance,
  mathematical correctness and semantic leakage; the producing model cannot be
  its own sole judge. No new paid/model executor is enabled by these examples.
- Acceptance/evidence: frozen inputs/labels and provenance, reproducible rule
  checks, retained failures and a plan for independent semantic review/user trials.
  Report step retention, order/branch accuracy, valid-method false positives,
  unsupported diagnoses and disclosure violations separately. Targets on the fixed
  set: zero premature answer disclosures, fabricated steps and false independent
  mastery labels; unexecuted semantic checks stay untested, not zero failures.
- Deliver: scoped commit, sample/coverage counts, evaluation commands/results,
  reviewer disagreements, failures and unverified model/real-course behavior.

## P0-11 / iOS G7 input and original-screen investigation

- Audio/screen increment at the existing safe handoff: R60 / A48; AUDIO-05–09/13–15, AVTEST-03–07/11: extend the current G3 capability plan with live classroom microphone attribution and actual iPad video playback audio plus enabled microphone, including headphones. Shared camera preview and its audio are separate capabilities. DT-G3-05/11 are inputs, not understanding-quality passes; no saved recording/upload prerequisite. See [coordination](#audio-screen-coordination).

- Goal: R51/R52/R53/R56/R57/R58/R59 and R03/R08/R46–48;
  A30–34/A36/A40–46, linked A26–28; G7 alongside G1/G2/G3/G5.
  P1 needs one supported iPad path; P3 multi-device support remains separate.
- Baseline: exact adopted-specification SHA in post-commit dispatch; keep P0-03
  priority and consume P0-08 only when a shared protocol is ready.
- Write: `apps/ios/**`, native module tests and `docs/verification/platform/**`.
  Do not edit shared contracts, root dependencies or other roles' modules.
- Investigate separately external Canvas/Notability/Safari visual observation and
  owned-canvas structured Pencil operations. Do not infer an external app's undo
  stack from screen sharing. Specify visible/missing intervals, blur, freshness,
  rapid erase/undo/redo/page switches, explicit stop, offline replay and immutable
  original ink. Keep teaching-state controls separate from normal input modes.
- Separately investigate this product's real-time pen on the still-visible,
  operable original website/Canvas/Notability screen and whether the actual AI
  input contains the composite and available strokes. Test scroll/zoom anchoring,
  touch navigation, share stop and source/video recovery. iPad and iPhone arbitrary
  native-app layers are unverified unless demonstrated; sharing pixels does not
  grant overlay/input access. Distinguish website layers, native-app layers, owned
  canvas and frozen/side-by-side drafts, with explicit stale/frozen state and a
  one-step return to the original page. A45 fallback success cannot pass R59/A44.
- Extend A46's lecture-note path from original-screen writing to retained editable
  ink/source/frame/video anchors and separate necessary AI additions, then actual
  Notability share/import. Prepared/shared is not imported; export images/PDFs do
  not establish editable Notability strokes or replace the app's editable original.
- Dependencies: available public platform documentation and actual build/device
  route; P0-08 for implementation. A matrix and capture experiment plan can proceed
  without a new protocol. Do not accumulate extensive uncompiled Swift.
- Acceptance/evidence: versioned capability matrix, human-reference process and
  exact build/device steps for each path. When runnable, report observed/lost steps,
  resolution, freshness, capture/sync/recognition/reasoning/display latency, power
  and cost separately. Missing device/build access stays untested; select a usable
  owned-canvas fallback without claiming every external app passes. Report R59/A44
  separately by platform; retain unsupported/unverified targets and continue usable
  paths rather than waiting indefinitely for universal overlays.
- Deliver: scoped commit, sources/dates, measured versus documented results,
  fallback/return-flow plan and concrete missing environment or device inputs.

## P0-12 / web disclosure controls and process-probe plan

- Audio/screen increment at the existing safe handoff: R60 / A47–48; AUDIO-03/06/08–09/13–15, AVTEST-01/02/04/06/07/08/11: after current W1/P0-12 repairs, link permitted screen/caption/media-time evidence and actual audio-source gaps to the existing plan. Subtitle textTracks, a camera preview or moving meter do not establish received playback audio. Quiet teaching and current disclosure guards still apply. See [coordination](#audio-screen-coordination).

- Goal: R51/R52/R53/R56/R57/R58/R59 and R03/R08/R46–48;
  A30–34/A39–46, linked A26–28; G7 with G1/G3/G5 boundaries.
  P0 plans a bounded probe; P1 implementation awaits the new contract.
- Baseline: exact specification SHA in post-commit dispatch; preserve P0-02
  priority and wait for P0-08 before implementing new shared message fields.
- Write: `apps/safari-extension/**`, its module tests and
  `docs/verification/web/**`; no root/contract/dependency edits. Windows risks may
  be documented, but a full Windows client is not part of this task.
- Plan attempt/source/preference version binding, explicit exploration intent and
  disclosure checks on requests, caches, rendering and queued voice. Cover old
  full solutions, user correction, topic change, "let me try", cross-device intent
  changes and disconnection. Titles, notifications, diagrams, supplements and
  review summaries must follow the same disclosure boundary as card text.
- Plan option selection/deselection/reselection, text/formula edits, website canvas
  and same-problem entry switches. Cover missing DOM, iframe and shadow-root access
  boundaries without inventing operations or auto-filling/submitting answers.
  Distinguish user input, website answers/grading and AI help in each trace.
- Investigate supported webpage overlays where the original page remains visible
  and operable, editable strokes keep scroll/zoom/source anchors, and the AI
  demonstrably receives the composite/available ink. Test share stop explicitly.
  Keep frozen/side-by-side drafts labeled and provide a one-step return; A45 cannot
  certify A44. Document Windows original-desktop annotation as separate P3 work,
  currently unverified, not a capability inferred from a webpage overlay.
- Dependencies: P0-08 contract design, P0-10 semantic cases and P0-11 platform
  evidence. Independent test-only traces and fixture-page probe plans may proceed;
  do not turn NAV/WRITE into automatic explanation triggers or intercept fingers.
- Acceptance/evidence: local deterministic invalidation/state-machine test plan,
  semantic-leakage review checklist and G7 process/fallback matrix. Record DOM,
  iframe/fullscreen/cross-origin and real capture differences. Desktop results
  cannot establish iPad/Pencil behavior, and a correct hint-level enum cannot
  establish that its text/image/audio content avoids leaking the answer.
  Link A46 lecture-note evidence to native export/import owners: retain original
  ink and source/frame/video anchors, separate AI additions, and report Notability
  prepared/shared/imported states without claiming an unperformed import.
- Deliver: scoped commit, trace fixtures/planned checks, actual commands/results,
  platform limitations and the exact contract/device checks still required.

## P0-13 / QA independent problem-solving acceptance design

- Audio/screen increment at the existing safe handoff: R60 / A47–49: cover AUDIO-01–15 / all AVTEST-01–12, including live-device versus recorded-sample evidence, headphone playback, critical-word/negation failures, correction history, professor retention versus reply suppression, and stop/late-audio races. Keep independent product execution not_run; documentation review and DT-G3 probes are not acceptance. See [coordination](#audio-screen-coordination).

- Goal: R51–59 plus R03/R08/R46–48; independent A30–46 and linked A26–28 coverage
  and G7 evidence, preserving existing
  G1–G6/P0-06A acceptance boundaries and later P1/P2/P3 stage distinctions.
- Baseline: exact specification SHA in post-commit dispatch; review future runnable
  candidates only at their separately supplied fixed integration commits.
- Write: `tests/e2e/**`, `docs/verification/qa/**`. Read other roles' fixtures and
  return corrections to owners; do not change their production code or labels.
- Dependencies: P0-06A first; independent matrix/case review may begin before
  P0-08, while protocol execution awaits its commit and runnable candidates.
- Acceptance/evidence: map every A30–46 to fixtures, expected evidence, owner,
  deterministic checks, independent mathematical/semantic review and necessary
  real-device/user steps. Review at least 30 P0-10 cases for reference-process
  adequacy, valid alternative methods, missing evidence, actual disclosure and
  help-versus-mastery distinctions. Keep disagreements and failures visible.
- A42/A43 cover choices/edits/canvas and same-problem entry changes, unknown
  reasons, website-versus-user-versus-AI attribution, restart/topic ambiguity and
  missing DOM/events. A44 requires original-page operability, this product's live
  ink and actual composite visibility to AI, scroll/zoom anchors and share stop;
  validate webpage, Windows desktop and iPad/iPhone native-app layers separately.
  A45 verifies clearly labeled frozen/side-by-side drafts and return navigation,
  and must never be counted as R59/A44. A46 links A26–28 to the complete lecture
  note path and actual Notability import, keeping editable originals and AI layers.
- Fixed-set acceptance requires zero premature disclosures, fabricated steps and
  false independent-mastery labels, with explicit denominators and reviewed cases;
  zero executed cases is untested. Separate each G7 input/annotation/fallback path, device/application,
  source implementation, compilation, automated checks and real verification.
  Limited samples do not establish universal correctness or real-user efficacy.
- Deliver: scoped commit, A30–46 matrix, independent label/content review evidence,
  reproducible failures and precise blocked device/provider/user-trial conditions.

## Stage milestones retained and extended

| Stage | Additional problem-solving delivery | Existing delivery retained / completion boundary |
| --- | --- | --- |
| P0 | P0-08–13 design, multi-entry synthetic cases, G7 process/annotation/fallback plans | Existing G1–G6 work continues; separately investigate webpage layers, Windows desktop and iPad/iPhone native-app layers. No synthetic or fallback result is an A44 pass. |
| P1 | One real problem on at least one explicitly supported iPad path, preserving entry/attempt identity through requested help, review, save and next-day recovery | Require Google Calendar, persistent URL/usable Canvas connection, actual-course point-reading, real voice, usable local notes and next-day memory together under specification §12; P0-07 alone cannot close P1. A usable owned-canvas or A45 fallback can advance this loop but does not pass R59/A44; original-screen annotation status remains separate, without waiting for every platform. |
| P2 | Targeted practice, assistance-aware mastery and richer branch diagnosis | Retain the original lecture-note/Notability delivery: editable ink plus source/frame/video anchors, separate necessary AI additions, actual share/import evidence under A26–28/A46. |
| P3 | Synchronize process/help permissions across iPhone/Windows; separately deliver Windows original-desktop annotation | Keep media/background/calendar/budget scope. Windows annotation and arbitrary iPad/iPhone native-app overlays remain individually unverified/unsupported until measured; neither webpage success nor a fallback certifies them. |

P4 work-agent delivery remains as specified. New milestones and all R51–59/A30–46/G7
rows remain unimplemented and unaccepted until their respective evidence exists.

## Current audit adoption and existing P0 handoffs

Read [intent and confirmed decisions](requirements/intent-and-decisions.md) and
[original-goal verification](requirements/original-goal-verification.md), together
with the relevant original clauses. Current display mode, content purpose and
archive destination are independent; Q-INK-DISPLAY, Q-NOTE-EXPORT-SCOPE and
Q-HOMEWORK-DESTINATION are all answered, including the timely final-answer prompt.
The original R01–R50 traceability rows are now rewritten by behavior/owner/stage,
not preserved as generic grouped mappings. Every new V-/INTENT- definition is
unexecuted/unaccepted. Documentation adoption does not close any application gate.

These are bounded updates to existing cards, not new dispatches or a change of
priority. Preserve current branches/work and coordinate the safe handoff with lead.

| Existing card | Increment from the confirmed decisions and audit |
| --- | --- |
| P0-08 Lead | Design independent display/purpose/destination, uncertain completion and refusal/de-duplication, original/organized versions and real destination evidence; compatibility/version plan still precedes code. Track all original goals through backlog, not only R51 onward. |
| P0-09 Backend | Preserve both ink display anchors, source, purpose evidence/corrections, question/assignment/version, completion/choice/refusal and export/import states without overwriting raw attempts. Review learning fd5162b C1–C4 on late help, repeat-attempt exposure, deletion-derived invalidation and separate receipt types; future shared relations await P0-08. |
| P0-10 Learning | Add only needed coverage at a safe boundary for context-based note/draft classification, corrected/mixed purpose, actual versus guessed completion, faithful user answer and independent-mastery evidence. Keep ordinary course proactive teaching/supervision/preparation separate from scoped exploration. Reconcile the actual Backend 65-case and QA 37-case findings without overwriting original examples; retain later QA 28-case review. |
| P0-11 iOS | Continue current research: two display modes separately, source retention, normal touch and actual composite receipt; plan timely completion/available-destination UI and honest import, without universal native overlay claims. P0-03 source review/build/device gaps remain separate. |
| P0-12 Web | Existing P0-02 repair review first; extend the existing plan to both display modes, topic changes, mixed/corrected purposes, real available choices and stop boundaries. Do not auto-fill/submit or equate a fixture with a course. |
| P0-13 QA | Retain P0-06A and 65-case independent reviews; map five INTENT cases and original V- cases to future phase evidence. Two-mode/cross-purpose combinations, final-answer refusal, source association and actual import require behavior evidence, not labels. |

The operator reports the user replenished Claude quota and existing sessions
resumed; subsequent native Web/iOS/QA messages are actual delivery evidence.
Prior rate-limit failures remain historical, not a permanent blocked status.
Per-role future capacity is not guaranteed. The separately installed quota
recovery automation is operator-owned; do not install another one or repeatedly
wake failed chats for notification. The earlier adoption turn's native list had only the original five worker routes.
The subsequent authorized turn now returned the support route as well; SUP-01
below records its bounded first task, without expanding other owners' scope. Current model/effort and permissions stay.

The semantic-audit specification commit is `44e60ec289717e155fb0f4374784c791bf23689c`,
pushed and verified on origin/main. Five actual async notices were accepted;
those receipts alone do not establish reading. Web later explicitly confirmed the exact SHA in handoff_95b6c68d278cd2b92dd70363a8724c23; Learning handoff_d30643e5a2530082c3dede502930ca7f and iOS handoff_db6dcd7d6428e539e6a4189b67e431ab also confirm that SHA; Backend/QA complete new-spec reads remain unconfirmed. Evidence and precise per-role
handoff IDs: [semantic adoption](verification/lead/requirements-semantic-audit.md).
Backend next handles the existing P0-09 C1–C4 design follow-up; Learning first
re-reviews cdc354c under the existing P0-02 boundary review, then reconciles current
P0-10 semantic findings. Existing iOS/Web/QA cards continue; no duplicate task IDs.

<a id="audio-screen-coordination"></a>

Current follow-through at pushed `80b99cc`: independent QA/Backend/Learning evidence
is integrated as described in the [continuation record](verification/lead/qa-continuation-2026-09-28.md).
Web's existing P0-12 repair continues under `handoff_bb3179fd65457fcab0cef5f07db7226b`;
Backend's next P0-09 C1–C4/INTENT gap coverage was accepted as
`handoff_bf3c74aebc53135c2adb482172571b4e`. These are scoped continuations, not new
task IDs or completed repairs. Lead formal shared-contract work remains separate.

Historical final-decision receipts are retained in the [normalization record](verification/lead/audio-final-decisions-normalization.md). Backend `cad63a1` and Learning `3bb5e29` with their normalization follow-ups have since been reviewed/integrated. Web `cb0f89b` hold was resolved by reviewed `ec18580` and integrated as `1c669ed` → `a09c43e`; seek/tie/gap model checks pass. The existing D1/ORG-3/EO-1 repairs remain active and all AVTEST cases remain not_run. Current exact states are in the task rows and [capture milestone](verification/lead/p0-08-capture-contract.md); do not repeat completed packet reviews.

## Audio/screen interpretation increment — existing cards only

Start at [current effective decisions](requirements/intent-and-decisions.md#current-decisions), then the complete [audio specification](requirements/audio-screen-interpretation.md), R60/A47–A49. [Source history](requirements/history/audio-screen-discussion-2026-09-28.md) preserves exact discussion without competing instructions. Required live screen/classroom/playback understanding includes a quiet personal microphone without professor dropout and additional/changing speakers. User-reported target: iPad Pro 13-inch (M5), iPadOS 26.5. Microphone/camera choices and modes remain unverified engineering options. Live listening needs no saved-record/upload/replay prerequisite; durable source context and authorized buffers stay distinct.

| Existing owner/card | Bounded next design or validation step | Product phase / evidence boundary |
| --- | --- | --- |
| Lead P0-08 | ADR 0002 §11 records actual v0.1.0 gaps. Design source spans, proposed/confirmed/rejected correction history and speaker-role revisions without losing original timestamps; separate cross-source alignment from strict same-source frame identity. | Future versioned contract remains a separate deliverable. No new runtime fields/endpoints in this documentation integration. |
| Backend P0-09 | AUDIO-02–04/07–08/13–15; AVTEST-01/02/05/07/08/11 persistence and stop/deletion vectors. Preserve actual audio/transcript relationship during authorized buffering, oral attempts and unknown source/role gaps; never treat every correction as confirmed. | P1-04 source continuity, P1-03 live evidence, P3-01 cross-source recovery; migration and real PostgreSQL evidence remain separate. |
| Learning P0-10 | AUDIO-01–12/14–15; AVTEST-01–12 policy/quality cases. Acoustic cues require actual audio; transcript-only fallback names missing cues. Same-input available native-audio and ASR-plus-multimodal comparison uses human-reviewed meanings and unknowns, critical failure counts, latency and actual cost. | P1-03 interpretation; P1-04 faithful recovery; G4 route availability and P3-01 joined evidence. No provider selected by reputation, paid calls, threshold or sample count mandated here. |
| iOS P0-03 → P0-11 | AUDIO-05–09/13–15; AVTEST-03–07/11. Plan live room mixture, actual playback plus microphone/headphones, missing lecturer content, correctable attribution, source-specific stop and displayed camera legibility/time. | G3/P1-03, later P3-01. DT-G3-05/11 help identify paths; neither proves comprehension. No native build/device/stream support inferred from docs or camera preview. |
| Web P0-02 → P0-12 | AUDIO-03/06/08–09/13–15; AVTEST-01/02/04/06/07/08/11. Finish current repairs first; preserve caption/screen/media evidence without promoting it to acoustic evidence or user reasoning. Keep late audio historical and respect every output gate. | P1-03/04 supported web contribution; P3-01 Windows/cross-device. Browser probes cannot certify iPad system playback or arbitrary app audio. |
| QA P0-13 | Map all AUDIO-01–15 and AVTEST-01–12; distinguish synthetic, recorded-sample, live-device, provider, independent review and accepted capability. Preserve negative cases and denominators; unavailable routes remain explicit. | A47–49 / G3/G4 and V-SourceTimeRelations. All twelve AVTEST cases currently not_run; no averaging away professor loss or negation reversal. |
| Support SUP-01 | Read as context for a later specifically assigned bounded incident; preserve existing six-risk report and owner boundaries. | Remain idle after the completed diagnosis. No duplicate platform study, provider activation or quota polling. |

This is one additive update to existing assignments; preserve active branches and current priorities. Ownership, model/effort, budget, normal approvals, contract v0.1.0 and earlier R59/A44/A46 evidence remain unchanged. Accepted notice receipts are not reading or implementation evidence. Exact adoption/receipt records: [audio integration](verification/lead/audio-screen-interpretation-adoption.md).


Current final-decision normalization extends these same cards, with no duplicate dispatch:

- P0-08/09: primary learner interaction input and AI output endpoint are policy roles, not a physical microphone-count constraint. Preserve separately authorized source tracks, changing speaker/role assessments, original utterance times and scoped stops; no v0.1.0 field changes.
- P0-10: AVTEST-09 adds human-reviewed same-word/different-stress/pause/intonation or relevant background-speech pairs, original-audio versus transcript-only comparison, useful interpretations and unknowns without a predetermined winner. Add quiet learner/classroom coexistence and per-person loss/attribution measures to existing cases.
- P0-03/11: use the [conditional routing candidates](requirements/audio-screen-interpretation.md#microphone-routing-candidates) for the reported 26.5 target. The lead's narrow current-scope annotations correct exclusive readings of historical playAndRecord advice while retaining its evidence. The iOS owner updates D5-M03-related research/matrix details and existing DT-G3-05/11 plus delivered AV01–03/06 at a safe boundary: actual ports/channels, near-mouth learner plus far professor/others, compatible dualRoute headset, attach/detach/recovery, headphones and screen sharing. Keep USB/input-only, multichannel interface and optional two-device alternatives separate. Do not mandate an OS upgrade for the 26.2+ candidate or combine dualRoute with default-mode high-quality Bluetooth recording.
- P0-12: preserve independent source/role/context evidence and actual playback gaps; a camera preview/caption is not audio. Current W1/P0-12 repairs remain integrated and separately reviewed, not restarted by documentation.
- P0-13: live-input, actual AI processing, human-reviewed semantic references and required persistence are cumulative evidence dimensions. “Live” forbids substituting recordings, not dropping processing/reference requirements. Synthetic policy success alone cannot pass audio interpretation; all AVTEST variants remain not_run.

Core live classroom/video understanding stays P1-03, source archive P1-04, optional two-device capture P3-01. The microphone is not yet chosen; evidence-based recommendation is engineering work and no purchase is authorized. The iPad identity and live-listening decisions are settled. See [normalization evidence](verification/lead/audio-final-decisions-normalization.md).

<a id="phase-backlog"></a>

## 后续阶段 backlog（未派发）

These entries preserve the original P1–P4 scope; **all are planned, unimplemented
and unaccepted**, not additional concurrent P0 assignments. Phase allocation and
slice size are engineering defaults. Lead supplies exact implementation baseline,
write scope and evidence location when dispatching each existing backlog ID; no
purchase, new account action, external message or homework submission is granted
by this table. QA owns independent acceptance across all rows; listed owner leads
the implementation and coordinates supporting roles within their existing paths.
Evidence must identify commit, real environment/inputs, denominator and failures.

| ID / owner (support) | Prerequisites | Required behavior and direct cases | Completion evidence |
| --- | --- | --- | --- |
| P1-01 Backend (iOS, Learning) | P0-04/08; actual authorized source accounts and G4 | R02/R43–45: initial plus usable incremental Google Calendar, once-saved URL, Canvas usable connection and renewal/revocation, independent website/self-study without Canvas ID; A17/A23–25, V-DailyResume | Actual connection/sync and next-day/next-week restore, duplicate/changed calendar/timezone cases, source version preserved; no repeated material/URL request; registration/login alone insufficient |
| P1-02 iOS (Web, Learning, Backend) | G1/G2/G3 declared path; P0-02/03/08; build/device route | R01/R03/R06–10: original iPad page or explicit measured fallback, words/formulas/image parts/captions/board, silent card, original image and frozen source/time; A01–03/A12/A26/A44–45 | Actual iPad input/navigation/source evidence plus §11 accidental-input and latency checks, unsupported paths separately; DOM text/desktop alone insufficient |
| P1-03 iOS (Learning, Backend) | Usable audio path G3, model/backend connection and selected source | R09: actual voice follow-up, teacher/user separation, fast adjustable speech and interruption while preserving selected context; A05/A06/A14, V-SourceTimeRelations  R60/A47–49, AUDIO-01–15 and AVTEST-01–12 add live classroom attribution, actual iPad playback with headphones plus enabled mic, context repair and measured available-route quality; see audio coordination. | Real input/output/interrupt/old-queue cancellation evidence and §11 timing; missing audio disclosed; text-only silent fixture cannot pass  Required source capture, understanding and reply permission are separately measured; no saved lecture/upload prerequisite. All AVTEST cases remain not_run. Additional/changing speakers and quiet personal microphone must not lose classroom content; one primary interaction input does not cap verified sources. Conditional target-device candidates are untested. |
| P1-04 Backend (Learning, iOS/Web) | P0 source/retrieval contracts; P1-01; G6 evaluation with retained failures | R04/R24/R27–30/R32/R44/R50: original interactions, source lookup, next-session goal, visible progress and model-independent continuity; A09–13/A23–24, V-ModelSwitchContext/V-ArchiveCompanionContinuity/V-LearningProgress  R60/A47–48; AUDIO-02–04/07–08/13–15, AVTEST-01/02/05/07/08/11 add retained oral trials, original-language hypotheses, reversible correction/role history and actual source-time gaps. | Real course/self-study exit/restart/next-day recovery, source hashes and earliest detail, goal/history/progress retrieval; full text remains behind concise UI, test corpus alone insufficient  Required transcript/context retention remains independent of transient audio buffers and does not mandate permanent lecture recordings. |
| P1-05 iOS (Backend, Learning/Web) | Local storage/sync and selected source path; P0-04/08 | R17/R28/R46: usable local notes with original source/version/context and recovery; A19/A27 where ink offered | Declare the exact minimum: AI text note + retrievable source can support P1 but cannot complete R46. Any offered ink must actually save/reopen editable originals offline; complete handwriting/export remains P2-03/04 |
| P1-06 Learning (iOS/Web, Backend) | P0-08–13; one declared supported real iPad problem path | R51–58 with original R03/R08: attempts → requested help → review → save → next-day evidence; A30–43/A45, INTENT-ANSWER-PROMPT/INTENT-HOMEWORK-CHOICE when screen-answer path is enabled | Real problem with unknown gaps, scoped help, attribution, versioned recovery, truthful final-answer prompt and available choices. A45 does not pass A44; no need to wait for all apps |
| P2-01 Learning (iOS/Web, Backend) | P1 real sources, notes and model path | R11–17/R28/R49: adaptive depth, optional multiple directions, reproducible demonstration, prefetch/cache and future-course evidence, short graphical notes; A04/A05/A19/A29/A39, V-CacheProvenanceLatency/V-FutureCourseEvidence/V-ProactiveTeaching | Actual system-predicted candidates with source/personal-state grounds, automatically generated artifacts before user selection and verifiable generation/selection order; then matched/missed cache content and §11 latency, verified formulas/linked visuals, sourced future-course versus general knowledge, optional quiet teaching; no automatic full lecture or compulsory test |
| P2-02 Learning (Backend, QA) | P1-06; independently reviewed evidence/policy | R50/R54–58: branch diagnosis, corrections, targeted optional practice, help-aware mastery and persistent English-first preferences; A35–40, V-LearningProgress | Valid nonstandard method and lucky correct answer distinguished; actual help/unknown reasons retained; independent novel transfer evidence, user correction and model-switch recovery; semantic review plus user trial |
| P2-03 iOS (Web, Backend) | G1/G2/G7 path evidence, P0-08, device route | R03/R08/R46/R59: original live screen pen with content-anchored AND screen-fixed display, independent purpose; A26/A27/A44–45, INTENT-INK-MODES | Each mode tested for finger navigation, scroll/zoom/reflow/video/topic change, editable original/source recovery and AI composite receipt. Native-app restrictions and fallback separate; one mode or owned canvas not substitute |
| P2-04 iOS (Learning, Backend/Web) | P2-03 supported path; official G5 capabilities and actual authorized assignment sources | R46–48/R51/R58/R59: contextual note/draft classification, independent AI supplements, Notability notes, timely final-answer organization choices and faithful output; Backend also owns the original P2 OneNote connector; A27/A28/A46, all five INTENT cases | Mixed/corrected purpose, draft→final answer, refusal de-duplication, available destination/assignment/version selection, preserved original layout/answer, preview and actual import/unknown outcomes. OneNote connector requires actual authorized page creation/readback and page ID/link, unknown-result reconciliation and duplicate-safe retry; its delivery is required in P2 but it is not presumed user substitution for Notability; no submission |
| P2-05 Backend (Learning, iOS/Web) | P1 archive/continuity; actual data and transparent storage measurements | R27–32/R58: long-lived original source beyond model context, rebuildable indexes, corrections/deletion, capacity transparency; A09–12/A38, V-ArchiveCompanionContinuity/V-MemoryCapacityTransparency | Real interaction archive and repeated compression/rebuild/source comparisons, retrievable early records, user-authorized deletion without resurrection, measured capacity/cost/limits; no silent recent-N truncation or infinite-memory claim |
| P3-01 iOS (Web Windows, Backend, Learning) | G3 and actual three-device paths; P1 source/voice/session state | R29/R32/R35–36/R51–58: iPad/iPhone/Windows joint understanding, separate track controls, main audio and synchronized permissions/preferences; A15/A16/A31/A34/A38/A40, V-MultiDeviceUnderstanding/V-SourceTimeRelations  R60/A48, AUDIO-06–09/14–15 and AVTEST-04/05/06/07/11 extend source/role uncertainty, synchronized shared-screen/audio provenance and late-arrival handling. | Actual three-source related/unrelated/stale examples, cross-source provenance/time/audio, individual stop/reconnect, no revived old sharing/help; room membership alone insufficient  Independent tracks are not speaker identities; unavailable/overlapping audio and stopped sources stay explicit. The iPad+iPhone separate-microphone route is optional P3 work and must not defer P1-03 classroom understanding; no hardware is selected. |
| P3-02 Web (iOS, Backend) | Windows capture/input capability experiment and P0-08 | R03/R08/R46/R59: Windows original-desktop annotation, both display modes and actual composite, keeping source operable; A44/A45/A46 where relevant, INTENT-INK-MODES | Window switching/DPI/scroll/zoom/anchor/share-stop tests on Windows; cannot reuse webpage or frozen-canvas success as desktop pass |
| P3-03 Backend (Learning) | Authorized sources, queue/budget/cancel controls, P1 connections | R12/R33–34/R44–45: autonomous plan → execute → verify → adjust → remember while user offline; A17/A18, V-AutonomousPreparationCycle | New/unchanged/missing/contradictory materials, actual source-backed artifacts/checkpoints, bounded recovery and requests for missing connections, realtime priority; no device recapture or requirement for user to command every step |
| P3-04 Learning (Backend, iOS/Web) | Actual current observations, goal/progress/calendar/history | R19/R21/R23–25/R41: content-aware supervision, discussed goal changes, remembered reasons/reminders and patient firm coaching; A07/A13/A29, V-SupervisionGoalHistory/V-ProactiveTeaching | Related lookup versus real distraction, unknown reasons not psychological facts, cross-day history and user style calibration; no response not noncompletion; exploration forbids answer leaks, not all supervision |
| P3-05 Backend (iOS/Web, Learning) | Real notification/channel grants, persistent clock/stop state | R20/R22/R36/R41: break timing, scoped exit/reminder/source/worker stops, cross-device/channel de-duplication; A08/A14/A16/A22, V-ExitReminderTimer | Contrasted rest responses based on actual studied duration/session context, exit-reminder timing/intensity based on real urgency/importance and recorded decision grounds; wall-clock deadline across restart/devices, actual permitted delivery versus read status, cancellation races and pause effects; unavailable SMS/social paths explicit, no unrequested message in development |
| P3-06 Learning (Backend, QA, Lead) | G4 official entitlements, known prices and ledger; real course questions | R04/R38–42: honest subscription capability, API fallback, selected flagship and tested cost routing; A20/A21, V-EntitlementBudgetQuality | Official real calls/capabilities/quota status, concurrent full-cost reservation/reconciliation, ≥30 actual-course same-input full-flagship comparisons under §11, disable defective downgrade categories; development effort not product routing |
| P3-07 Lead (Backend, iOS/Web, Learning) | Instrumented actual sustained path and cumulative data | R29/R31/R37/R40/R51–52: long companionship, reliable short-change preservation, on-demand reasoning and measured server/resource needs; V-LongRunningCompanionship/V-ResourceNeedEvidence/V-MemoryCapacityTransparency | Quiet/rapid-edit/voice/break/offline long session, actual gaps/freshness/latency/CPU/memory/power/bandwidth/cost, transparent choices at limits; no silent source loss, fabricated unlimited capacity or hardware purchase |
| P3-08 Backend (Learning, iOS) | P1-01 usable Calendar; long-running worker state | R02/R33/R44–45: resilient full background calendar/source incremental synchronization and progress-linked planning; A17/A23–25, V-DailyResume/V-AutonomousPreparationCycle | Pagination/token expiry/revocation/recurring change/cancellation/DST/all-day cases, one calendar projection rebuild preserves goals/notes, actual next-session continuation; P3 hardening does not defer all P1 Calendar functionality |
| P4-01 Web (Backend, Learning, Lead) | Windows client, official Codex capability/account permission, unified memory | R05/R32/R35: real existing work-Agent task context, explanation during work and authorized start/steer/pause/cancel; V-WorkAgentActualAction | Actual task/tool events and effects, failure/unknown distinction, preserved work/learning sources and cross-model/task memory; login/prompt/fake receipts insufficient |
| P4-02 Learning (Web, Backend, Lead) | P4-01 behavior contract; official Claude Code supported path | R04/R05/R32/R38/R42: next official work-Agent adapter with preserved tool/task/companion context; V-WorkAgentActualAction/V-EntitlementBudgetQuality | Repeat real-task behavior on Claude Code, expose backend-specific input/quota/unsupported operations, no private credential proxy or blanket parity claim |
| P4-03 iOS (Web Windows, Lead) | Public platform permissions and actual selected apps; explicit user scope | R26 with R41: measured distraction-app restriction/release and separately tested forced return, V-DistractionAppCapability | Per-app/platform apply/undo and refusal/revocation/stop evidence; reminder success not app restriction, unavailable control retained as limitation |
| P4-04 Backend (iOS/Web, Lead) | P3-05 core reminders; supported public channel and future specific permission | R22: investigate optional WeChat/Douyin/other requested channels without displacing core reminder delivery; V-ExitReminderTimer | Document and measure allowed message type, user grant, actual result/de-duplication and unsupported limits; no permission inferred from product wish and no automatic contact now |

All module rows also apply V-ReuseEvidence when choosing a dependency/native
facility: record source, suitable terms/license, actual benefit and capability
limits. Reusing a component is allowed; neither a new framework nor a full custom
implementation is required by this backlog. Phase exit is the conjunction of its
required rows and main §12, with supported/unsupported paths honestly reported;
it is never merely the easiest successful slice.

## P0-06A guard follow-up after semantic adoption

QA-12 direct/HTTP recursion crashes were actually reproduced before the change.
Lead replaced the integer recursion and narrowed timezone OSError handling;
Backend d4a503e independently supplied the request JSON decoder boundary,
integrated as 1cd03b7. Current combined local check is **433 pass / 13 strict
xfail**, generated artifacts/TypeScript/web build pass, no skipped tests. The
remaining QA-03–11 and real PostgreSQL/provider/device gaps stay open; CI for
37456ac passed as recorded below, and independent QA 62e5ab9 confirms the two fixes on Python 3.14. See
[QA-12/13 evidence](verification/lead/qa-12-13.md). Existing P0-09/10/11/12/13
follow-ups continue; this repair does not change v0.1.0 or start a new protocol.

The first guard candidate 0c235f9 failed its Python 3.12 CI on an invalid tzdata
region-directory key (`America`), while deep-JSON tests passed. The narrow EISDIR
correction is included in the current 433/13 local result; do not replace that
actual failed run with an assumed CI pass. The subsequent 37456ac run was checked
and passed both supported Python versions, as recorded below.

## SUP-01 / support — bounded integration-risk diagnosis

- State: delivered as 7cb905723d40525ff5269ffa3bb0a38b6a579229 via actual reply handoff_32978ddb6e0ab283ba855418122a642a; reviewed and integrated as 6b9be9a. [Six-risk report](verification/support/sup-01-integration-risk-diagnosis.md) complete; all six proposed integration experiments remain unexecuted. Support is idle until another bounded task; no acknowledgement or repeated research requested.
- Owner: Support (07), GPT-6 Astra ultra; not a standing parallel implementation.
- Baseline: the exact commit containing this card supplied in the native handoff;
  code milestone 37456ac, specification adoption 44e60ec plus the two verification-case
  refinements here. Contract remains 0.1.0. Dirty worktrees may use git show.
- Goal: verify actual role/skill/worktree and granted lead connectivity, then
  identify at most six principal technical risks across original-screen input,
  rapid observable-process retention, cross-device audio/video, long-term source
  evidence, no-premature-disclosure and revocable cancellation. Map to relevant
  R03/R08/R12/R20/R22/R27–36/R41/R46–59, A/G and existing task owners.
- Allowed paths: docs/verification/support/** and tests/probes/support/** in
  wt-support only. No production, shared contract, dependency, migration, root,
  task-board or another worktree edit; no billing/runtime/credentials changes.
- Reuse the existing iOS a4841d3 report, Web cdc354c and 8a32a8a probes/plans,
  Backend P0-09 and Learning fd5162b review, 65-case fb445ed and QA 25c63b6. These
  delivered commits are inputs, not automatically integrated or product passes.
  Concentrate on joins between owners, missing evidence and a smallest
  discriminating experiment; do not duplicate the iOS/Web capability matrices.
- Inspect current committed evidence first. For an unresolved platform/library
  claim, consult current official primary sources and record date/link and actual
  applicability. No paid API, account setup, cloud resource, new service or
  permanent eighth worker. A small local reproducer is allowed only when needed
  to distinguish a stated hypothesis and only in the assigned probe path.
- Deliver one bounded report/commit with observed cause versus hypothesis,
  exact baseline/commands, sanitized evidence, minimal test input and expected
  positive/negative outcomes, owner and next action for each risk. State
  untested/unsupported/blocked precisely; unknown process remains unknown. Report
  support/skill/route readiness and latest-spec reading in the same useful result.
- Stop at that report or a concrete external dependency, and return via the actual
  native reply route/message ID; then idle until a new bounded task. Do not poll
  quota or run recurring model analysis. The operator owns quota automation.
- Dependencies: existing owners keep their current work and shared P0-08 remains
  lead-owned; diagnosis does not reassign their implementation. The confirmed
  two ink modes, independent purpose/destination, timely final-answer choices,
  source preservation and genuine original-screen/Notability evidence all apply.

Code milestone 37456ac passed both Python 3.12 and 3.14 hosted CI
[36402550393](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36402550393).
It follows the preserved failed 0c235f9 run and the narrow EISDIR fix. Independent
QA confirmed QA-12/13 on Python 3.14 in 62e5ab9; its additional tests await integration. This documentation/register update does
not rerun application tests or turn any V/INTENT/device gate into PASS.
