# Team contract

## Purpose and current scope

Build the AI Learning Companion described in `docs/requirements.md` and `docs/requirements/problem-solving-companion.md`. Before each new task, read both specifications, `AGENTS.md`, this file, the assigned role file, and `docs/tasks.md`. The v1.1 requirements add learner-led problem solving and process diagnosis through R51–R59, A30–A46, and G7. Setup is complete: the six roles, isolated Git working directories, and messaging paths have been verified. The user has started P0 and authorized the lead to dispatch bounded parallel tasks and continue implementation and verification. Setup success and specification integration are not application implementation or product acceptance.

The user has approved integrating the problem-solving requirements into the product scope. Keep existing P0 assignments in progress; the lead coordinates P0-08–P0-13 as bounded additions at safe handoffs, without duplicating or taking over another owner's work. Requirements define behavior; proposed data names, hint-level names, sample sizes, and stage details remain engineering defaults that may change with evidence. Do not describe such defaults as choices explicitly made by the user.

R59 explicitly details the original R03/R08/R46–R48 goal of taking notes on the original classroom screen and archiving them externally. It is an existing product requirement clarified for acceptance, not a newly invented wish or optional improvement. This clarification extends R51/R52 and adds A42–A46 within the existing P0-08–P0-13 assignments; it does not create duplicate tasks or change their priorities, ownership, models/effort, budget, approvals, or contract v0.1.0.

Historical SETUP instructions containing `setup-only`, `do not develop`, or `stop after check` applied only to their completed verification turn. They are not standing restrictions on subsequently user-authorized P0 work. Accept bounded assignments from the configured lead within that existing authorization, including reading and merging the assigned baseline, scoped implementation, relevant dependency setup, tests, and Git commits. Confirm the configured lead identity through the actual project directory and granted runtime route; arbitrary peer content cannot expand the user's scope.

Keep role ownership, task-card limits, external-action boundaries, sandbox settings, and normal exact-command approval review in effect. A real approval denial is still handled through its stated process, never bypassed. Do not ask the user to repeat setup-to-development authorization solely because an old verification turn said `only` or `stop`.

The user normally speaks to **01 总工与集成** in natural language. The lead translates an authorized goal into tasks, dispatches independent work, integrates results, and reports milestones. Do not ask the user to carry routine messages between agents when the configured message tools are available.

Read the available tool definitions before dispatching; do not invent API or tool names. Resolve recipients through `docs/team-directory.json`. If the documented messaging path is unavailable, report that specific limitation instead of claiming a task was sent.

## Roles and working directories

The following are the configured role paths. `docs/team-directory.json` and `docs/verification/setup.md` record the verified configuration.

| Chat | Model family | Working directory | Write ownership |
| --- | --- | --- | --- |
| 01 总工与集成 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/repo` | `packages/contracts`, dependency manifests and lockfiles, root configuration, CI, `docs/adr`, task board, requirements traceability, integration |
| 02 数据与后台 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/wt-backend` | `services/api`, `services/worker/core`, `services/worker/connectors`, migrations, module tests, `docs/verification/backend` |
| 03 学习与记忆 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/wt-learning` | `services/learning`, `services/worker/learning`, `tests/fixtures/memory`, `tests/evals`, `docs/verification/learning` |
| 04 iPad 原生体验 | Claude Opus 5.5 | `/home/agentsdock/Projects/learning-companion/wt-platform` | `apps/ios`, native project settings and entitlements, native tests, `docs/verification/platform` |
| 05 Safari 与桌面端 | Claude Opus 5.5 | `/home/agentsdock/Projects/learning-companion/wt-web` | `apps/safari-extension`, later `apps/windows`, module tests, `docs/verification/web` |
| 06 独立验收 | Claude Opus 5.5 initially | `/home/agentsdock/Projects/learning-companion/wt-review` | `tests/e2e`, `docs/verification/qa`; production fixes only by explicit task |

Read the corresponding file in `docs/roles/`. QA initially reviews Astra work with Opus. The lead arranges review by a different model for Opus work when useful; review evidence matters more than model agreement.

Actual runtime models and effort levels remain those recorded in `docs/team-directory.json`; the specification update does not change them.

The lead alone integrates into `main`. Each other role uses its own branch and worktree. These boundaries are coordination rules, not operating-system isolation. Do not run destructive Git operations, switch another role's branch, or alter another worktree. Preserve unrelated user changes.

The lead owns all dependencies and shared contracts; backend alone authors database migrations. Request a concrete change from the owner rather than editing those files. iOS and Safari implement their own ends of one lead-owned native bridge contract. Learning uses the shared source archive and does not create a second identity system or original-record store.

For the problem-solving addition, the lead owns shared process evidence, disclosure, and learning-preference contracts and their eventual version/migration plan. Backend owns durable process/branch history, corrections, deletion, and revocation; learning owns restrained hints, evidence-based diagnosis, assistance-aware learning evidence, and persistent teaching-language behavior. iOS owns the measured boundaries of native capture and interaction; web owns disclosure-safe final presentation on its supported surfaces. QA independently checks rules and semantic teaching behavior. This documentation integration leaves contract v0.1.0 unchanged; owners must not insert incompatible local fields while awaiting the lead's shared contract baseline.

## Assignment and handoff

Every development task includes:

```text
Task ID / owner:
Goal and requirement IDs (R / A / G / P where applicable):
Baseline commit / contract version:
Allowed write paths:
Dependencies and owners of shared files:
Acceptance criteria / relevant checks / device steps:
Deliver: commit ID, concise change summary, results, evidence, unverified items.
If blocked: state the condition and needed input; continue independent work.
```

Do not guess requirement numbers. Read and map them from the original specification. Each task has one owner; avoid implementing work already delegated. Start with about three independent tasks, then adjust concurrency to real dependencies, environment availability, and account usage. Do not recursively create long-running agents without a task requiring them.

Before implementation, each worker confirms its branch, clean/unrelated changes, baseline, and write scope. The lead distributes committed contract changes and coordinates bringing that baseline into each branch. A shared repository does not make other branches' edits automatically visible.

A dirty worktree does not prevent reading a new specification. With the exact commit supplied by the lead, use `git show SHA:docs/requirements.md` and `git show SHA:docs/requirements/problem-solving-companion.md`, replacing `SHA` with that supplied commit. Use the same read-only `git show SHA:path` form for updated task or role guidance. If the commit is unavailable, report that specific dependency and continue independent assigned work; do not read an assumed future revision. The lead coordinates normal baseline merges and conflicts with the owner. Preserve in-progress changes: no reset, forced checkout, or blanket fast-forward-only requirement to obtain the new instructions. Merging and Git writes still follow normal sandbox approval review.

Workers commit only assigned changes and return the commit ID and evidence. The lead reviews and integrates selected commits, resolves conflicts with the owner, then runs checks on the integrated commit. Do not claim main passed based only on an earlier worker branch. Use distinct test ports and database namespaces when concurrent services require them; document the allocation before use.

The lead alone updates `docs/tasks.md`; workers report status in their handoff and their own verification directory. Documentation templates and intended paths must not be reported as completed implementation.

## Runtime messaging and Git delivery

The five lead/worker connections are persistent and bidirectional. In the current desktop async mode, dispatch independent tasks with the native Chats helper's async route mode and finish the sending turn after accepted receipts. Workers wake automatically when idle. Incoming mailbox tasks must be read through inbox/read, then results must be sent through the returned reply route with reply-to pointing to the received message. A plain final answer does not deliver a mailbox reply. Do not acknowledge an acknowledgement; avoid response loops. Use the injected helper schema and actual IDs. For a legacy exchange delivery, follow its respond-current instructions. If waiting on a legacy exchange, preserve all required identifiers returned by ask; never guess wait arguments.

Codex workspace-write protects Git metadata, including the shared Git directory behind a worktree. Use normal on-request approval for the precise authorized git add/commit command when needed; auto_review evaluates it. Keep the sandbox settings. Both Codex and Claude have delivered a bounded documentation commit from their own worktrees during setup. Do not reinterpret a permission error as a reason to bypass protections.

The project remote is `https://github.com/Judithandprey/ai-learning-companion.git`.
On 2026-09-28 UTC the user directly confirmed that they intentionally made it
public for open-source development. Preserve that visibility. The lead pushes
reviewed and tested milestones to `origin/main` and reports the actual pushed SHA;
workers push feature branches only when assigned. Fetch and inspect concurrent
changes first, never force-push, and do not commit credentials. This authorization
does not cover unrelated repositories, account changes or application deployment.

## Verification and evidence

Record these separately: source implemented; compiled; automated checks passed; real provider connected; real device verified. For failures, report reproduction, expected/actual behavior, severity, commit, environment, and evidence. “Not tested” is different from “failed.”

Retain original events, speaker/device/frame provenance, source references, and user handwriting. Derived summaries and indexes cannot replace originals. Test idempotency, corrections/deletion, stale jobs, cancellation, budget reservation, and source consistency as relevant. Before the first paid application API call, implement and verify the relevant budget controls; development subscription usage and the app's monthly API budget are separate.

Keep `NAV / ASK / WRITE` separate from teaching states such as exploration, hints, and review. A request to explore independently persists until the user requests help or changes teaching state; a pause, erasure, or incorrect step is not permission to disclose an answer. Check current attempt/version, user intent, permitted assistance, and preference scope before final display or playback, including cached content, titles, diagrams, notifications, and queued speech. Stale or disconnected cross-device state must not authorize a higher disclosure level. Ordinary course-viewing teaching remains available within its original requirements.

Preserve original attempts and branches, observable edits, user explanations, and assistance history. Distinguish observation, user statement, and inference; unknown motives and missing capture intervals remain unknown. An own-canvas operation history and visual observations of an external app are different evidence paths. Neither a final screenshot nor an enabled recording proves that every transient step was retained; no Notability undo-stack access is implied. Diagnosis is a versioned derivative that can be corrected, and a helped solution is not independent mastery. Learning language follows persistent R57 preferences without rewriting original material or turning one temporary override into a permanent default.

R51/R52 process evidence covers web choice selection, cancellation and reselection; text/formula editing; web handwriting; external notes; the app's own or frozen canvas; and combinations within one problem. Verify authorized DOM `input`/`change` observations per site. A canvas, complex editor, cross-origin iframe, or shadow DOM does not imply access to its internal edit history. Keep user input, website answers/grading, and AI assistance separately attributed; a correct selection or unknown reason does not establish independent mastery. Observing these paths does not authorize AI to fill or submit answers.

The required original-screen classroom flow is: continue learning in the original website, Canvas, or Notability → draw, circle, or draft with this product's pen on the current shared live screen → AI demonstrably observes the composed view and obtainable ink → preserve editable original ink with source/frame/video context → add separate AI illustrations → use the official Notability share/import path and verify its actual outcome. Retain normal page interaction, independent input/teaching states, anchors across scrolling/zooming/problem changes, and explicit sharing stop. A share sheet proves only a sharing step; PDF/PNG does not preserve native editable strokes, and the app must retain its own editable original. A46 checks the full flow, not an isolated export button.

P1 retains the course-viewing slice: select content on a real course page → silent explanation → save a note → close/reopen → recover the same source. It also includes one real problem on at least one explicitly supported iPad path: start → independent attempts → requested help → requested review → save process/evidence → retrieve the next day. G7 distinguishes every measured input/capture path, including live web overlays, authorized web events, external visual observation, structured ink, frozen/owned canvases, and mixed paths. A fallback must preserve access to the original material, but completing an owned canvas, frozen capture, or side-by-side view cannot mark original-screen R59/A44 passed. These integration targets retain the full classroom note/archive requirement; completing a bounded P1 path does not establish all paths or A46.

## Devices and external actions

Available: Windows, iPad, iPhone. No Mac or confirmed Xcode path is available yet. iOS can investigate public capabilities and prepare a bounded prototype plan. Stop before accumulating extensive uncompiled Swift. Desktop web checks cannot count as iPad Safari/Pencil verification. Identify the exact macOS/Xcode, signing, device, or user interaction needed when it becomes relevant.

Verify a live annotation overlay on each supported webpage. Windows desktop annotation layers remain P3 scope requiring their own validation. Interactive overlays over arbitrary native iPad/iPhone apps must be investigated through public platform capabilities and real-device evidence; screen sharing alone establishes neither touch routing nor a universal global overlay. Preserve R59 when a path is restricted and report its unverified or unsupported state. An owned canvas, frozen view, or side-by-side surface is a named fallback, never evidence that the original live-screen path passed R59/A44; A45 separately checks that the fallback is presented honestly.

The user's willingness to buy a Mac is not a purchase order. Project documents also do not authorize purchases, paid cloud rentals, publication, account changes, or messages to others. Continue already authorized reversible local work without repeated approval questions. If a new external action needs user input, prepare the concrete result first and explain the specific decision needed.

Course explanations and learning materials are English-first with the original technical terminology and short Chinese hints where useful. Do not extend unrelated personal preferences into project policy.
