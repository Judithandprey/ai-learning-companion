# macOS selected-image consumer: source review HOLD

## Current correction review — 2026-10-01

Native delivered `704894f7e6e0a95c90f6a74bba68fb4394b45f9e` in
`handoff_dff1a342e1dffab6296ebe2839d19a96`, on the original `a2fe30c`
consumer. Both leaves remain unintegrated pending one bounded child-lifetime
correction. The queued/partial-write newline fence now passes the focused
checks; it is not the remaining failure.

Independent review reproduces Quit returning before an already-retiring child
has finished cleanup: `AskLink.lost()` clears `child` before awaiting `end()`,
while `shutdown()` joins only the current/replacing child and active delivered
request fences. A withdrawn partial request has no such fence. The application
then permits process termination after `shutdown()` returns. Keep the retiring
child/cleanup reachable and join it before Quit or a replacement connection.
The in-process delayed-end reproduction returns in about 0.000052 seconds with
zero completed child ends; five existing focused checks pass, including the
real Linux held/partial-pipe check. These are Linux portability and lifecycle
checks, not Darwin, real model or interactive Mac acceptance. A second probe
using the unmodified production process launcher confirms the same gap: Quit
returns in 0.000050 seconds with the exact owned child PID still alive. Keeping
the test host alive completes its scheduled cleanup 2.160 seconds later; the
probe verifies that PID is gone before returning. It received 65,536 partial
bytes with no newline, so the original no-inference withdrawal fence held.
See the [independent report](correction/review.md), raw logs and hashed probes.

Same-task correction `handoff_722a9311da5df8092756438d3fc39b68` was accepted
through the Native reply route; acceptance initially reported unread and does
not establish execution. It requests only the retirement join and deterministic
lost-to-Quit/reconnect regressions, preserving the existing write fence. Lead
has prepared the ASK ImageIO fixture/real Python validator wiring in the existing
desktop workflow: three focused orchestration tests with five subtests pass;
`bash -n` and `git diff --check` pass. That wiring remains local until the native
candidate is ready, so the released workflow is not pointed at missing source.
After correction review: integrate the original and correction leaves, run the
existing macOS-only build against the exact pushed source, then release the
already-assigned live/quota consumer continuation. No new mobile campaign.

## Original review — retained history

Actual delivery `handoff_206dec81ae48c80fd7ebfd272017c599` contains `a2fe30c`; owner merge `7ae84cd` adopts Backend release `cd9b0ef` with identical native source. Not integrated. One concrete writer/cancellation defect, MAC-SUB-LIB-01, was returned to the existing Native owner by accepted `handoff_bf09e0c95b1b43bd3b31fa2718625abd`. Receipt initially says unread/execution_started:false; no correction or started-work claim is inferred from it.

The actual source queues a possibly partial multi-megabyte image before its cancel. Presentation is fenced, but after local Stop that queued image can still finish and start inference. The independent review and Lead's retained bridge-schedule probe reproduce the ordering with exact Backend39620fa and a synthetic client. This is source/ordering evidence, not Swift execution or a real provider request. See review.md and queued-cancel-result.json. To reproduce, copy queued-cancel.py into a temporary directory and place `git show 39620fa:services/worker/connectors/chatgpt_local.py` beside it as chatgpt_local_39620fa.py; run with the repository Python environment/PYTHONPATH. No account is used.

Next owner: Native corrects the existing queued/partial-write fence without retry or automatic child replacement, and supplies a held-writer regression. Lead then reviews and integrates normally, adds the existing ASK fixture output/validator to scripts/desktop-checks.sh and desktop-checks artifact retention, and dispatches the existing macOS-only workflow on the exact committed source. Do not start another mobile task. The owner delivered13 new XCTest methods (96 total) and Linux stub91/96; those are not real Mac test/build acceptance. The App target, ImageIO-generated PNG validator and Mac child-process tests still need the actual hosted run. Interactive Mac login/capture/ink/response remains independently unverified.

The root ADR now explicitly states display.id is the already-required bounded string; numeric native IDs must be represented as text. This is documentation of the released validator, not a protocol change. No product decision, source requirement or permission changed.
