# Team contract

## Purpose and current scope

Build the AI Learning Companion described in `docs/requirements.md`. The current setup creates six roles, isolated Git working directories, and instructions. No application implementation or product acceptance is implied by successful setup.

The user normally speaks to **01 总工与集成** in natural language. The lead translates an authorized goal into tasks, dispatches independent work, integrates results, and reports milestones. Do not ask the user to carry routine messages between agents when the configured message tools are available.

Read the available tool definitions before dispatching; do not invent API or tool names. Resolve recipients through `docs/team-directory.json`. If the documented messaging path is unavailable, report that specific limitation instead of claiming a task was sent.

## Roles and working directories

The following are the intended setup paths. `docs/team-directory.json` and `docs/verification/setup.md` record what was actually configured.

| Chat | Model family | Working directory | Write ownership |
| --- | --- | --- | --- |
| 01 总工与集成 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/repo` | `packages/contracts`, dependency manifests and lockfiles, root configuration, CI, `docs/adr`, task board, requirements traceability, integration |
| 02 数据与后台 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/wt-backend` | `services/api`, `services/worker/core`, `services/worker/connectors`, migrations, module tests, `docs/verification/backend` |
| 03 学习与记忆 | GPT-6 Astra | `/home/agentsdock/Projects/learning-companion/wt-learning` | `services/learning`, `services/worker/learning`, `tests/fixtures/memory`, `tests/evals`, `docs/verification/learning` |
| 04 iPad 原生体验 | Claude Opus 5.5 | `/home/agentsdock/Projects/learning-companion/wt-platform` | `apps/ios`, native project settings and entitlements, native tests, `docs/verification/platform` |
| 05 Safari 与桌面端 | Claude Opus 5.5 | `/home/agentsdock/Projects/learning-companion/wt-web` | `apps/safari-extension`, later `apps/windows`, module tests, `docs/verification/web` |
| 06 独立验收 | Claude Opus 5.5 initially | `/home/agentsdock/Projects/learning-companion/wt-review` | `tests/e2e`, `docs/verification/qa`; production fixes only by explicit task |

Read the corresponding file in `docs/roles/`. QA initially reviews Astra work with Opus. The lead arranges review by a different model for Opus work when useful; review evidence matters more than model agreement.

The lead alone integrates into `main`. Each other role uses its own branch and worktree. These boundaries are coordination rules, not operating-system isolation. Do not run destructive Git operations, switch another role's branch, or alter another worktree. Preserve unrelated user changes.

The lead owns all dependencies and shared contracts; backend alone authors database migrations. Request a concrete change from the owner rather than editing those files. iOS and Safari implement their own ends of one lead-owned native bridge contract. Learning uses the shared source archive and does not create a second identity system or original-record store.

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

Workers commit only assigned changes and return the commit ID and evidence. The lead reviews and integrates selected commits, resolves conflicts with the owner, then runs checks on the integrated commit. Do not claim main passed based only on an earlier worker branch. Use distinct test ports and database namespaces when concurrent services require them; document the allocation before use.

The lead alone updates `docs/tasks.md`; workers report status in their handoff and their own verification directory. Documentation templates and intended paths must not be reported as completed implementation.

## Runtime messaging and Git delivery

The five lead/worker connections are persistent and bidirectional. In the current desktop async mode, dispatch independent tasks with the native Chats helper's async route mode and finish the sending turn after accepted receipts. Workers wake automatically when idle. Incoming mailbox tasks must be read through inbox/read, then results must be sent through the returned reply route with reply-to pointing to the received message. A plain final answer does not deliver a mailbox reply. Do not acknowledge an acknowledgement; avoid response loops. Use the injected helper schema and actual IDs. For a legacy exchange delivery, follow its respond-current instructions. If waiting on a legacy exchange, preserve all required identifiers returned by ask; never guess wait arguments.

Codex workspace-write protects Git metadata, including the shared Git directory behind a worktree. Use normal on-request approval for the precise authorized git add/commit command when needed; auto_review evaluates it. Keep the sandbox settings. Both Codex and Claude have delivered a bounded documentation commit from their own worktrees during setup. Do not reinterpret a permission error as a reason to bypass protections.

## Verification and evidence

Record these separately: source implemented; compiled; automated checks passed; real provider connected; real device verified. For failures, report reproduction, expected/actual behavior, severity, commit, environment, and evidence. “Not tested” is different from “failed.”

Retain original events, speaker/device/frame provenance, source references, and user handwriting. Derived summaries and indexes cannot replace originals. Test idempotency, corrections/deletion, stale jobs, cancellation, budget reservation, and source consistency as relevant. Before the first paid application API call, implement and verify the relevant budget controls; development subscription usage and the app's monthly API budget are separate.

The first intended product slice is: select content on a real course page → silent explanation → save a note → close/reopen → recover the same source. This is an integration target, not proof that all P1 requirements are complete.

## Devices and external actions

Available: Windows, iPad, iPhone. No Mac or confirmed Xcode path is available yet. iOS can investigate public capabilities and prepare a bounded prototype plan. Stop before accumulating extensive uncompiled Swift. Desktop web checks cannot count as iPad Safari/Pencil verification. Identify the exact macOS/Xcode, signing, device, or user interaction needed when it becomes relevant.

The user's willingness to buy a Mac is not a purchase order. Project documents also do not authorize purchases, paid cloud rentals, publication, account changes, or messages to others. Continue already authorized reversible local work without repeated approval questions. If a new external action needs user input, prepare the concrete result first and explain the specific decision needed.

Course explanations and learning materials are English-first with the original technical terminology and short Chinese hints where useful. Do not extend unrelated personal preferences into project policy.
