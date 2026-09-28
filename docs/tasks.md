# Task board

P0 authorized by the user on 2026-09-28 UTC. Product requirements remain intact.
Setup is verified; application capability gates are not yet passed. Lead integrates
all deliveries into main and verifies the resulting commit before reporting success.

| ID | Owner | State | Deliverable / prerequisite |
| --- | --- | --- | --- |
| SETUP-01 | Lead | Verified | Six role chats/worktrees; see verification/setup.md. |
| SETUP-02 | Lead + web | Verified | Actual legacy and async message replies; no application claims. |
| P0-01 | Lead | Implemented/tested; baseline dispatch next | Contract v0.1.0, locked toolchains, traceability; 42 contract tests and TypeScript check passed; module/provider integration pending. |
| P0-02 | Web | First batch prepared | Explicit selection/quiet card probe; fixed source anchors; desktop evidence separate from G1 device checks. |
| P0-03 | iOS | First batch prepared | G1/G2/G3/G5 capability matrix, exact environment and device steps; bounded source only if verifiable. |
| P0-04 | Backend | Next after P0-01 | Auth/source archive/idempotent sync skeleton; atomic budget and stale-job tests. Backend owns migrations. |
| P0-05 | Learning | First batch prepared | Synthetic source fixtures (30 fuzzy + 50 exact queries), reproducible baseline, G6 comparison plan. |
| P0-06 | QA | Waiting for integrated candidate | Independently reproduce consequential changes on a fixed commit. |
| P0-07 | Lead + owners | Waiting for modules/device path | Early select → silent card → save → reopen → recover source probe; distinguish fixtures from actual-course P1. |

## Shared dispatch baseline and boundaries

Repository base: `4684b79ed979ad5162e1c86635a245d68601da84`. The dispatch message
supplies the exact new P0-01 contract commit; workers fast-forward their clean
assigned branch to that commit before editing. Contract version: `0.1.0`.
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
