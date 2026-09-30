# Windows app-parent review — correction required

Current disposition: the later actual correction `5871981` closes all six
findings and integrates through `15501b6`; see the [correction and integration](correction/README.md).
The original HOLD and failures below remain historical evidence for `d6ef68a`.

Candidate `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff` was actually delivered in
`handoff_46f6ed6fd01fdde4be147d23f5c2bcf0` at 2026-09-30 21:37:52 UTC.
**HOLD: not integrated or released for user/QA trial.** This continues the one
Web P0-02/07/12 task, not a new task or a product acceptance claim.

The five scoped commits are `44c5536`, `d252e48`, `1fea3f7`, `6b74148`,
`d6ef68a`, after owner base `5dc8493`. All 36 changed files in `apps/windows`
and `docs/verification/web` match the exact exported Git blobs. Current main
`10542360d272cc49e470fb5501a77af0b8dea8fb` supplies released Backend/contracts;
the owner branch's older shared tree is **not** the integration target. After
correction, integrate only the owned changes and retain the current portability
helper. No shared wire/dependency/requirement change is requested.

## Executed checks and retained failures

- Exact candidate `npm --prefix /tmp/lc-windows-parent-d6ef68a/apps/windows run
  build` passed (`tsc` and static copy, exit 0), using pinned Node 24.21.0.
  This result is from the actual tool receipt; no separate build log was saved.
- Root ran the seven affected Node test files against current main Backend:
  **83 passed, 0 failed/skipped/cancelled**, 36.317 seconds. Raw output is
  [retained here](windows-parent-focused-d6ef68a.txt). Disposable loopback
  hosts used MemoryStore, no PostgreSQL, GUI or user preview.
- Three independent read-only source reviews then reproduced the six findings
  below. Passing authored tests do not override these failures. The probe
  assertions intentionally demonstrate defects and are not product passes.

| Finding | Reproduced behavior | Required same-owner correction |
| --- | --- | --- |
| WIN-HOST-01, P1 | Actual owned child closes stdin; unhandled asynchronous `EPIPE` exits Node 1. | Handle stream errors before writing, bound/redact refusal and reap the owned child; preserve possible-delivery uncertainty. |
| WIN-HOST-02, P2 | Actual nonexistent executable / no spawned process returns `delivered: true`. | Known failed spawn is unsent; distinguish started-child uncertain delivery. |
| W-PARENT-C1 | `jobs: [null]` crashes status; missing required `final` skips recovery and permits rewriting the damaged record. | Validate consumed durable fields/bindings; preserve invalid bytes and refuse host/grant use. Keep legitimate v1 records compatible. |
| W-PARENT-C2 | Injected short write saves 23/1113 bytes, renames invalid JSON, then sends Stop without a readable witness. | Complete the UTF-8 write before flush/rename; short/zero-progress failure preserves the old file and prevents unwitnessed dispatch. |
| APP-Q1, P2 | Second quit event bypasses the first pending shutdown. | One bounded pending operation; prevent each quit until settled, then mark done. |
| APP-U1, P2 | Fault teardown hides prior stored/unknown counts and displays “nothing is sent anywhere.” | Preserve prior outcomes/Stop uncertainty; say further sends stopped and no AI is connected. |

Complete reports: [host/transport](windows-parent-host-review.md),
[coordinator](windows-parent-coordination-review.md),
[application/UI](windows-parent-app-review.md). Their JSON, original probe
scripts/results and failure/control logs are retained byte-for-byte with
[SHA-256 manifest](evidence-manifest.json). Scripts deliberately refer to the
exact `/tmp/lc-windows-parent-d6ef68a` export and synthetic test identities;
they are historical failure reproductions, not portable regression entrypoints.
The host probe's nested `spawnSync` also recorded environment-specific `EPERM`
metadata; the separate direct invocation and safe control independently establish
the real EPIPE. That harness metadata is not a product finding.

Root focused command, from the exported `apps/windows` directory:

```sh
LC_BACKEND_ROOT=/home/agentsdock/Projects/learning-companion/repo \
LC_PYTHON=/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test \
  tests/capture-plan.test.ts tests/capture-host.test.ts tests/capture-link.test.ts \
  tests/capture-link-rules.test.ts tests/app-link.test.ts tests/control-link.test.ts \
  tests/uploader.test.ts
```

Owner-reported Linux five-pass and Windows one-pass/four-platform-skip
PostgreSQL runs were inspected, not rerun by Lead. Their evidence lacks a
separate executed-source hash receipt, so keep that attribution precise.
Electron-as-Node and fake window/frame tests are not interactive GUI evidence.
No new live capture, physical input, real AI, full desktop gate or Notability
acceptance follows. The independent Windows portability incident is already
closed at `4038e41` / run36773932867; remove the stale pending-Support wording
from the owner report during this correction, without repeating that campaign.

## Next owner and release boundary

Web corrects all six related findings within `apps/windows/**` and its owned
verification path, adding focused regressions and returning one exact follow-up
SHA. No new framework, contract, provider, database campaign or preview restart
is needed for these reproductions. Preserve the five original commits and all
original PNG/ink records. Lead reviews the delta and reruns affected checks on
the integration target, then supplies the runnable exact candidate to QA for
one independent Windows interaction/storage/Stop pass. Native continues its
already-started macOS app-parent task; shared lessons are advisory within that
same task. Actual dispatch/start receipts will be added after observation.

### Actual coordination receipts

Review evidence is pushed at `ddcae90c6bc153851628ed13a3695af613a0ec26`
(review commit `30a215c`, then the three retained raw probe logs in `ddcae90`).
`git ls-remote origin refs/heads/main` returned that same full SHA.

- Web correction: native `send` accepted
  `handoff_61f4dda3c8901495f901b9a16f390d1e`, replying to the actual delivery
  `handoff_46f6ed6fd01fdde4be147d23f5c2bcf0`. Receipt state was `unread`,
  `execution_started: false`. It contains all six findings, exact review SHA,
  scope, focused regression expectation and next Lead/QA action. Reading/start
  and completion remain unobserved at this record; acceptance is not execution.
- Native received relevant same-task lifecycle guidance as accepted
  `handoff_3b8ff4be3c8321c7aa7493e59672155a`, replying to its actual start
  `handoff_2184abf05509d9c4a766c1a14beac34c`. This notice was likewise unread
  at receipt. Its existing macOS task remains active; no duplicate assignment
  or acknowledgement is requested.

Task-board/evidence hashes, JSON and local references were checked, and
`git diff --check` passed. The duplicated identical current Lead row was removed
while updating its actual state. Existing requirements and application source
are unchanged. Next runnable integration depends on Web's correction or the
already-started native delivery; QA is not asked to execute a held candidate.
