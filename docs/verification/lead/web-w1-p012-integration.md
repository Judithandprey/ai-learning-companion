# Web W1 and P0-12 repair integration

Subsequent status: independent QA reproduced the exact 71f1389 desktop milestone,
then found additional P0-12 test-model/observer defects and coverage gaps. This
dated execution record remains evidence for its checks; it is not current full
model acceptance. See [QA continuation](qa-continuation-2026-09-28.md) for D1,
ORG-3, EO-1, other findings and the existing Web repair handoff.

2026-09-28 UTC. Continued existing P0 immediately after audio documentation/notice
commit `51d7afcdc9dff46463bd7c341156a6f159f87d0d`. This is a Web fixture/probe
milestone and repaired test-only policy design, not an iPad or provider release.

## Reviewed deliveries and dependency order

Actual Web messages `handoff_b7dbdcf6c52e03ca0d6af0eaca5febe6` and
`handoff_c3fab8396d4805155228e895a1a97758` delivered b866729 and e251447.
Lead and a bounded read-only Astra review examined the real commits and previous
failure, preserving the required dependency chain:

| Worker commit | Integrated commit | Scope |
| --- | --- | --- |
| c534518 | a3990b4 | P0-12 plan, synthetic disclosure/organize models, owned-page answer-entry observer and probe |
| 8a32a8a | 2d91a3a | Fixture frame-layout race and password-test diagnostics |
| 4c32e49 | 13c0777 | Existing ADR stop/history, ink display and export-plan alignment |
| b866729 | 746f93d | W1 current-submission pending card, dismissal and regression checks |
| e251447 | fcf89b2 | Unsynced offline refusal and export-attempt model repairs |

The original F1–F6 commit was already integrated and was not applied twice. Main's
current requirements and owner worktrees are preserved. Production shared
contracts, dependencies, models/effort, accounts and permissions are unchanged.
P0-12 models are test-only: application code does not gain the future protocol.

## Resulting behavior and narrow integration fix

A top-document submission immediately replaces any older card with its own honest
pending state. Closing it, beginning another ASK or submitting a newer request
retires that result. A delayed response remains evidence with `presented:false`;
the generation guard still runs after the last asynchronous operation. Frame
relays retain their separate existing completed-ASK authorization. Real bridge
and device behavior are not established by the owned-page deferred transport.

The P0-12 model now retains an offline refusal through reconnects, newer/foreign
snapshots and leaving/returning to an attempt until a causally accepted later
local request or acknowledgement resolves it. The prior exact reproduction now
retains `pendingClose:true` and blocks the old full answer. The new randomized
oracle owns its state and checks liveness as well as safety; it is still synthetic
and cannot prove a real server's causal ordering.

The export model separates preparation/panel opening from actual dispatch and
verified import. A timeout without dispatch does not invent external exposure.
Earlier dispatched/imported outcomes survive reopening, cancellation or failure.
These event labels are engineering test models, not native share/import proof.

W1 changed the comment targeted by QA's F4b mutation. Lead reproduced **1 failing
locator / 9 passing**, then changed only the locator to the current `closeCard`
block; the mutation still removes the same `presentGen += 1` guard. The uniqueness
check now passes **10/10**. QA explicitly permitted this narrow update in its
actual reply `handoff_576a52ac12a42069a46d8dd6ca398b80`; no owner code was overwritten.

## Actual integrated checks

Checks ran on integrated production tree fcf89b2 plus the sole QA locator update.
The [evidence directory](web-w1-p012-integration/) retains commands/results,
screenshots and both the pre-fix failure and successful follow-up.

| Check | Observed result / limit |
| --- | --- |
| Root `bash scripts/check.sh` | Generated-contract/OpenAPI checks, Python **443 passed / 13 strict xfailed**, root TypeScript, module typecheck and build pass. Known xfails remain; no skip promoted to success. |
| Explicit Node `--test --test-isolation=none apps/safari-extension/tests/*.test.ts` | **63 named tests passed**, including 20 disclosure traces and 3,000 seeded sequences. Default module runner reports 10 passing files in this environment; separate positive/negative controls confirmed callbacks execute and a failing assertion exits 1. Do not mislabel file totals as test totals. |
| Desktop Edge self-test | **51/51**; includes all five W1 dismissal checks. Initial WSL localhost load was refused; the existing one visible retry succeeded. Failed-load output is retained. |
| Actual browser-produced contract bundles | **18 submitted asks, 0 problems** against unchanged v0.1.0 validation. |
| Trusted desktop input | **37 passed, 0 failed**; touch scroll and pinch zoom remain unverifiable because their environment controls are unsupported. Not an iPad/Pencil pass. |
| Owned-page answer-entry probe | **16/16**, zero runner errors; actual desktop input, not arbitrary websites or iPad. |
| F4 presentation-guard mutation | Browser fails **3/51**: late response, close-before-delayed-response and new-ASK retirement. |
| F4b close-guard mutation | Browser fails **1/51**, specifically close-before-delayed-response; the updated locator preserves meaningful fault detection. |
| Original offline-close reproduction | Full answer blocked with unresolved refusal retained; log includes the actual state/decision. |

These are lead checks. Earlier independent QA verified F1–F6 on 693069a; it does
not automatically certify this new integrated W1/P0-12 baseline. New exact-baseline
QA reproduction is a follow-up on the existing task. No native capture, packaged
extension, Apple Pencil, real course site, Notability import, audio provider or
cross-device wire protocol was executed here. Audio AVTEST-01–12 remain not_run.

## Audio plan receipt and next work

QA's actual message `handoff_576a52ac12a42069a46d8dd6ca398b80` confirms reading
audio baseline `89602e742aea9c6ef6b6ec6a76c371e20bff2edf` and delivers plan
`321a5772ba2e612925d6ff3e55a83d13acb474dd`. It is **not integrated** here. Read-only
review found one acceptance-plan issue: evidence dimensions must be cumulative.
“L only” should mean recorded input cannot substitute for live input, not that
live capture alone proves actual AI receipt, interpretation or semantic correctness.
Human reference review must mean an actual human; independent AI review is separate.
Synthetic policy checks cannot by themselves pass AVTEST-08 audio understanding.
This narrow correction stays in the existing P0-13 card before the plan is treated
as acceptance-ready. Its prior base plan is also not yet integrated into main;
review the complete dependency rather than cherry-picking a modification onto an
absent file.

P0-08 formal versioned contracts remain next for lead. Platform capabilities,
missing PostgreSQL DSN, real providers/devices and the remaining independent QA
items keep their own pending states. Audio specification notification does not
interrupt those assignments or create competing tasks.

## Published milestone, CI and independent follow-up

Milestone `71f1389eeb503f652138e23a329f231ad15aacc7` was normally pushed and verified by `git ls-remote`. [Hosted CI run 36413496796](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36413496796) completed successfully on that exact SHA for both Python 3.12 and 3.14 with Node 24.21.0. [Actual CI response](web-w1-p012-integration/hosted-ci.json) records jobs and conclusion.

Existing QA follow-up was actually accepted as `handoff_8900856456051f4aae289527a58aab0f`, initially unread with execution not started. [Message and receipt](web-w1-p012-integration/qa-handoff.json) scope the exact-baseline W1/offline-refusal/export tests and the single cumulative-evidence plan correction; they request no full unrelated suite or acknowledgement loop. Independent new-baseline acceptance remains pending.
