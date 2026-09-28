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
| P0-01 | Lead | Foundation plus HTTP/CI extension tested | Contract v0.1.0, 8-operation generated OpenAPI, locked toolchains; 69 tests and TypeScript check passed locally. Hosted CI and QA tracked separately. |
| P0-02 | Web | Dispatched; delivery accepted | Explicit selection/quiet card probe; fixed source anchors; desktop evidence separate from G1 device checks. |
| P0-03 | iOS | Dispatched; delivery accepted | G1/G2/G3/G5 capability matrix, exact environment and device steps; bounded source only if verifiable. |
| P0-04 | Backend | Delivery received; lead review pending | Commit 803916ff5d1663cb970636b22bb897d89d083da0 on f02618f baseline; worker reports 195 tests (69 shared + 126 module) passed. Not integrated or verified on main; real PostgreSQL command exits 2 because dedicated DSN is missing. |
| P0-05 | Learning | Timestamp-fix delivery received; lead review pending | Increment ccfcb2c on 699504c received; worker reports 99 checks at its original baseline and unchanged rankings/fixture hashes. Not yet integrated or reverified on main; G6 remains incomplete. |
| P0-06 | QA | P0-06A dispatched; delivery accepted | Independently reproduce contract/OpenAPI/toolchain checks at f02618f; application/device gates remain untested. |
| P0-07 | Lead + owners | Waiting for modules/device path | Early select → silent card → save → reopen → recover source probe; distinguish fixtures from actual-course P1. |
| P0-08 | Lead | Planned; design not yet implemented | Design versioned problem-attempt evidence and teaching-policy contracts; preserve v0.1.0 and existing P0 work. |
| P0-09 | Backend | Reading confirmed; design reported underway; P0-04 review/fixes first | Design durable attempt/history/help evidence, versions, cancellation and deletion; no new API implementation yet. |
| P0-10 | Learning | Reading confirmed; process cases planned after delivered P0-05 repair | Exploration/hint policy and at least 30 synthetic process cases; independent semantic-leakage review required. |
| P0-11 | iOS | Dispatched; reading unconfirmed; after P0-03 boundary work | G7 visual-observation versus owned-canvas capability investigation and real-device verification plan. |
| P0-12 | Web | Dispatched; reading unconfirmed; after P0-02 probe | Plan process probe and prevent disclosure through stale caches, voice, titles and diagrams. |
| P0-13 | QA | Dispatched; reading unconfirmed; after P0-06A | Independent A30–A41 matrix and process-fixture review; no application acceptance implied. |

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

## Adopted problem-solving scope and dispatch order

The user approved R51–R58, A30–A41 and G7 as product requirements on 2026-09-28.
See [main requirements](requirements.md) and the
[problem-solving specification](requirements/problem-solving-companion.md).
Adoption is not implementation or acceptance. Specification baseline
`57aee9cfc86dfa0dcde674d118034063163ddb13` was pushed and P0-09–13 notices were
accepted through the five native routes; Backend and Learning have returned actual
reading reports, while iOS/Web/QA reading remains unconfirmed.
Actual message IDs are in `verification/lead/requirements-v1.1-adoption.md`.
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

## P0-08 / lead evidence and teaching-policy design

- Goal: R51–58; A30–41; G7, with existing G1–G6 boundaries preserved. P0 design
  enables the P1 single-problem loop, P2 teaching and P3 cross-device delivery.
- Baseline: exact specification SHA in post-commit dispatch; subsequent consumers
  receive a separate, exact shared-contract SHA and version.
- Write: `docs/adr/**`, `docs/tasks.md`, `docs/requirements-traceability.md`;
  future shared contracts under `packages/contracts/**` remain lead-owned. This
  initial design task does not alter v0.1.0 or add runtime endpoints.
- Design ProblemAttempt, step/revision/branch links, observation coverage,
  AssistanceEvent, DiagnosisRevision and LearningPreference atop the existing
  identity/archive. Specify source/attempt/preference versions and permitted
  disclosure at request, cache and presentation time; stale cards and queued audio
  must not survive changed intent, attempt or device permissions. Separate actual
  observation, user explanation and AI inference; preserve unknown intervals.
- Dependencies: existing contract baseline plus P0-09/10/11/12 findings; reconcile
  disagreements before committing a future version and compatibility plan.
- Acceptance/evidence: ADR with invariants, state transitions, ownership and
  migration/compatibility decisions; worked test-only traces for A30–41; explicit
  unsupported fields/paths and versioned follow-up tasks. Report design review
  separately from executable protocol tests and real-device/provider acceptance.
- Deliver: scoped commit, decision/evidence paths, unresolved questions and exact
  follow-up contract dependencies. No second identity or isolated problem archive.

## P0-09 / backend process persistence design

- Goal: R51/R52/R53/R54/R55/R57/R58; A30–31/A34/A37–38/A40; G7 supporting persistence,
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
  Define separate real PostgreSQL migration/concurrency tests;
  missing DSN remains untested, and an in-memory result cannot be PostgreSQL PASS.
- Deliver: scoped commit, model/transaction diagrams or tables, test-only vectors,
  commands actually run, remaining contract/database dependencies and limitations.

## P0-10 / learning exploration policy and process evaluations

- Goal: R51–58; A30–40; G7, with G6 still requiring its own candidate comparison.
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

## P0-11 / iOS G7 dual-path investigation

- Goal: R51/R52/R53/R56/R57/R58; A30–34/A36/A40–41; G7 alongside G1/G2/G3.
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
- Dependencies: available public platform documentation and actual build/device
  route; P0-08 for implementation. A matrix and capture experiment plan can proceed
  without a new protocol. Do not accumulate extensive uncompiled Swift.
- Acceptance/evidence: versioned capability matrix, human-reference process and
  exact build/device steps for each path. When runnable, report observed/lost steps,
  resolution, freshness, capture/sync/recognition/reasoning/display latency, power
  and cost separately. Missing device/build access stays untested; select a usable
  owned-canvas fallback without claiming every external app passes.
- Deliver: scoped commit, sources/dates, measured versus documented results,
  fallback/return-flow plan and concrete missing environment or device inputs.

## P0-12 / web disclosure controls and process-probe plan

- Goal: R51/R52/R53/R56/R57/R58; A30–34/A39–41; G7 with G1/G3 boundaries.
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
- Dependencies: P0-08 contract design, P0-10 semantic cases and P0-11 platform
  evidence. Independent test-only traces and fixture-page probe plans may proceed;
  do not turn NAV/WRITE into automatic explanation triggers or intercept fingers.
- Acceptance/evidence: local deterministic invalidation/state-machine test plan,
  semantic-leakage review checklist and G7 process/fallback matrix. Record DOM,
  iframe/fullscreen/cross-origin and real capture differences. Desktop results
  cannot establish iPad/Pencil behavior, and a correct hint-level enum cannot
  establish that its text/image/audio content avoids leaking the answer.
- Deliver: scoped commit, trace fixtures/planned checks, actual commands/results,
  platform limitations and the exact contract/device checks still required.

## P0-13 / QA independent problem-solving acceptance design

- Goal: R51–58; independent A30–41 coverage and G7 evidence, preserving existing
  G1–G6/P0-06A acceptance boundaries and later P1/P2/P3 stage distinctions.
- Baseline: exact specification SHA in post-commit dispatch; review future runnable
  candidates only at their separately supplied fixed integration commits.
- Write: `tests/e2e/**`, `docs/verification/qa/**`. Read other roles' fixtures and
  return corrections to owners; do not change their production code or labels.
- Dependencies: P0-06A first; independent matrix/case review may begin before
  P0-08, while protocol execution awaits its commit and runnable candidates.
- Acceptance/evidence: map every A30–41 to fixtures, expected evidence, owner,
  deterministic checks, independent mathematical/semantic review and necessary
  real-device/user steps. Review at least 30 P0-10 cases for reference-process
  adequacy, valid alternative methods, missing evidence, actual disclosure and
  help-versus-mastery distinctions. Keep disagreements and failures visible.
- Fixed-set acceptance requires zero premature disclosures, fabricated steps and
  false independent-mastery labels, with explicit denominators and reviewed cases;
  zero executed cases is untested. Separate both G7 paths, each device/application,
  source implementation, compilation, automated checks and real verification.
  Limited samples do not establish universal correctness or real-user efficacy.
- Deliver: scoped commit, A30–41 matrix, independent label/content review evidence,
  reproducible failures and precise blocked device/provider/user-trial conditions.

## Stage milestones retained and extended

| Stage | Additional problem-solving delivery | Existing delivery retained / completion boundary |
| --- | --- | --- |
| P0 | P0-08–13 design, synthetic process/policy cases and G7 dual-path plan/evidence | Existing contracts, G1–G6 probes, source retrieval and integration work continue; documents and synthetic checks are not real-device passes. |
| P1 | One real problem on at least one explicitly supported iPad path: start → independent attempts → requested hint → review → save → next-day evidence recovery | Keep actual-course selection, silent explanation, discussion, notes and memory. If external observation loses steps, offer a reliable owned canvas while preserving the course context; do not replace learning with upload-only PDF chat. |
| P2 | Targeted micro-practice, cross-problem review, assistance-aware mastery evidence and richer branch diagnosis | Keep teaching/notes, editable handwriting and external-note work, including their existing acceptance requirements. |
| P3 | Synchronize the same problem's process, teaching intent and disclosure permissions across iPhone/Windows | Keep three-device input, background work, reminders, calendar and budget scope; early risk investigation is not Windows or multi-device delivery. |

P4 work-agent delivery remains as specified. New milestones and all R51–58/A30–41/G7
rows remain unimplemented and unaccepted until their respective evidence exists.
