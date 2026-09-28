# Task board

This is an initial board. **No application development task below has started.** Configuration results are recorded separately in `verification/setup.md`; do not infer them from this template.

| ID | Owner | State | Deliverable / prerequisite |
| --- | --- | --- | --- |
| SETUP-01 | Configuration operator / lead | Pending verification | Confirm six chats, correct models, separate worktrees, role prompts, and actual session directory. |
| SETUP-02 | Lead + one worker | Pending verification | Bounded message receipt and reply smoke check, with no app implementation or paid product API request. |
| P0-01 | Lead | Ready, not started | Read requirements; map R/A/G/P IDs; select stack with rationale; commit minimal event, selection, sync, note, authorization, budget, and bridge contracts. |
| P0-02 | Web | Ready, not started | Scope a course-page selection/card probe; record accessible browser/device conditions and iframe/fullscreen questions. Dependency changes go through lead. |
| P0-03 | iOS | Ready, not started | Capability matrix and minimum macOS/Xcode/device verification plan; clearly separate documented capability from tested behavior. No Mac currently available. |
| P0-04 | Backend | Waiting for P0-01 | Source archive and idempotent sync skeleton; database migration ownership; budget reservation design and checks before paid app API use. |
| P0-05 | Learning | Waiting for P0-01 and fixed fixtures | Reproducible retrieval baseline and evaluation set; compare alternatives on identical inputs and record provenance, failures, latency, usage. |
| P0-06 | QA | Waiting for a runnable candidate commit | Independently reproduce setup or integration acceptance criteria on a fixed commit; report tested/failed/untested separately. |
| P0-07 | Lead + relevant owners | Waiting for module results and device path | Integrate the first select → explain → save → reopen → recover-source slice; run checks on the integrated commit. |

Starting development requires an authorized user task, such as “开始第一阶段.” Once assigned, the lead drives related local work and routine fixes continuously, while surfacing concrete external blockers.

The lead fills in requirement IDs, baseline commits, write paths, acceptance commands, and dependencies before dispatching each task. No fixed technology choice or supported platform behavior is claimed by this board.
