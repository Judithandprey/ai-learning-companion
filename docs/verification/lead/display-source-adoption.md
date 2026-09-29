# Display-source adoption review

2026-09-29, existing P0-04/09 and P0-07/08 coordination. Reviewed starting main:
`01645a66b02b5a34a10829ad39a777651b8dae81`. R02/R03/R07/R29/R30/R35/R36/R51/R52/
R58/R59 and A12/A14/A16/A30/A31/A44 retain the complete two-gate original-screen
requirements. Source/English decisions are unchanged. The supplied implementation
is an internal callable component, not a device transport or real AI connection.

## Delivery and legacy checks

Actual native delivery `handoff_6c70faa3381e3b7b34373b93e2238b90` names Backend
`a659364e581106fd50bf831015f171cf688564a4`, parent
`59f7193781c0ffeb257f2afbc1a2dad0d387db68`. It adds explicit current-authorized
display registration in the existing source/snapshot store, original-byte and
frame/process binding, historical readback and explicit unsupported legacy paths.
No schema, migration, new archive, HTTP route or executor is added.

Lead reviewed the full ten-file delta and owner evidence. In an isolated exact
candidate archive `/tmp/lc-display-root-review-6Y2Iuy`, the existing archive,
Learning export, preview/library/HTTP and source-deletion checks passed:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q services/api/tests/test_archive.py services/api/tests/test_learning_snapshot.py services/api/tests/test_preview.py services/api/tests/test_preview_library.py services/api/tests/test_preview_library_http.py services/api/tests/test_http.py services/api/tests/test_source_deletion.py
# 304 passed in 5.41 seconds
```

This result belongs to the isolated candidate, not main or a DB/browser run.
The candidate's known README pin issue is already corrected on main; no pin was
weakened by this delivery. Independent authority/original-lifecycle review and
integrated checks are recorded below when complete.

## Disclosed legacy-worker gap reproduced

The generic legacy job path still admits a display source. Lead independently
called real display registration using synthetic MemoryStore facts, then
`Jobs.enqueue(kind="source_sync")`, `begin`, and `commit`; all returned
queued → running → completed. No executor, network request or paid call ran.
Probe: `/tmp/display-job-guard-probe.py` against the exact candidate archive.

One bounded Backend follow-up explicitly extends its current task scope to
`services/worker/core/jobs.py` and owned tests/evidence. Accepted native receipt:
`handoff_6a203dbaa922661e09548359e1d10fbc`, initially unread/execution_started=false.
It must reject display/unknown explicit variants in both source heads and snapshots
at enqueue/replay/begin/commit, preserving legacy work, cancellation/reconciliation
and budgets. The owner retains production implementation; lead does not duplicate it.

## Parallel consumer start

Actual Learning reply `handoff_23d3312b98a07e7da915cc50e6a3bc41` confirms read of
`e50e95d2665aa8502e0f3d09460d9ad5b8a86b6d`, affected original/English clauses and
normal merge `eaa68214295672d43833d528712e76e971daa649`. Its supplied ProcessBatch/
image composition implementation has started. It preserves complete provisional
records and bounded original PNGs without fabricating persisted batches, OCR,
Observations, metadata authority, live state or provider receipts. Actual coherent
process export remains a separate Backend dependency.

No DB, service, preview/Paperclip, provider, account or physical-device operation
was performed in these checks. Historical new-byte uploads without pre-stop
authority and frame-less display records remain explicitly unsupported in this
bounded entry; the product's complete offline/process requirements remain open.

## Integrated display entry

`a659364` integrates as `a9f3773`. The independent reviewer reports no blocker
in the scoped registration/authority/original/ancestor paths: 30 targeted cases
and nine additional probes passed on an archive of exact main plus only this
delivery. Historical parents from another stopped stream remain usable; forged
incarnations and ownership changes refuse without actor writes. The actual
review report is retained with this integration. The separate legacy-job gap
above remains open until its owner's correction is reviewed.

On integrated main `a9f3773`:

```sh
.venv/bin/python -m pytest -q services/api/tests/test_display_sources.py services/api/tests/test_capture_frames.py services/api/tests/test_original_artifacts.py services/api/tests/test_image_resolver.py packages/contracts/tests/test_display_source.py
# 352 passed in 2.31 seconds
```

These are actual production callables against synthetic MemoryStore/source/control
facts. They prove neither acquired device pixels nor continuous screen-to-AI.
The earlier 304 legacy passes remain isolated-candidate evidence, not relabeled
as another integrated main run.

## Legacy-worker correction integrated

Actual owner reply `handoff_f4444030ea660574c97aac5efb1ea0e7` delivered separate
`a72c93d8bfaea1f06260352628350625ae6357cb`; lead reviewed all three changed files
and integrated it as `9ec9feb`. The small shared lookup applies the existing
variant refusal to both source head and snapshot; cached enqueue checks both
its request and actual stored job references. Begin/commit, including output
replay, retain existing guards. Cancellation and unknown-outcome reconciliation
are unchanged. This closes the reproduced admission gap; no executor is enabled.

On main, `test_display_jobs.py` + `test_budget_jobs.py` passed **79 tests in 0.33
seconds**. Lead reran the original production-registration→enqueue probe with the
expected refusal: **409 unsupported_source**, exact whole-actor equality, no job
or derived output created. Owner-reported ten independent scenarios are separate
evidence. [Authority review](display-source-backend-review.md) covers the preceding
source implementation; the job correction was reviewed directly by lead.

Web also delivered actual ink component `366a994d2e4e90e528662d4f082bcf3f8e7eddc7`
in message `handoff_2ae943e03e4185903d7b2e333410d59b`. Its code/evidence are under
independent review; owner reports browser writing/partial erase/undo-redo/reopen
checks, not lead or role-QA acceptance. The same reply confirms Web is now working
on the already-assigned QA-EXT-01/02 capture corrections. No duplicate task or
user-preview replacement was dispatched.


## Exact publication, CI and next owners

`2ccf5b9109476b7214620ec0b8e66d10ee0df9d6` was pushed normally and matched
`origin/main` by `git ls-remote`. Exact-main [P0 run 36578997235](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36578997235)
completed successfully: Python 3.12 / Node 24.21.0 in 3m26s and Python 3.14 /
Node 24.21.0 in 2m22s. These are CI checks, not device/provider evidence.

The next existing Backend P0-04/09 task was accepted as
`handoff_dd5bcb876213b1f64547d2647e60db91`: opt-in in-process HTTP transport for
only the three already released control 0.2.1 routes. Actual start reply
`handoff_48892112d6184682baed89552260dc5e` confirms normal merge of the exact
published baseline as `8b5cfc32818e7580b3fca6e160013820cef360db`, full contract/
ADR/auth-flow reads and implementation in `services/api/control_app.py`.
Deployment-trusted capability config and independent start/stop facts remain
separate from request bodies; no public grant creation or default app activation.
No service, paid connector, new identity or DB campaign was dispatched.

Web ink remains **HOLD**, not integrated or published as a preview replacement.
The two retained independent reviews reproduce changed screen-fixed provenance,
a changed source during a held stroke, wrong stacking order after erase Undo,
and unreadable saved-record overwrite/false save acknowledgement. Their probes
use actual modules with controlled DOM/IndexedDB doubles, not real browser proof.
Corrections were sent in `handoff_5d68127324ff5a375b0e9fb7eeb482af` and
`handoff_3f632c34c0b2a7717d4e91fabe7f8254` against the same delivered task.
[Input/undo review](web-ink-delivery-review.md), [storage review](web-ink-storage-review.md).
Owner's already-started QA-EXT-01/02 capture repair is preserved. QA needs one
exact corrected integrated capture+ink candidate, not another old campaign.

Learning actual delivery `handoff_57a9c78778110aae883d4c6661ce4b13` supplied
`6ebbeae4a6b07de0dd25a0907883796d3173758a`. Lead reviewed its helper extraction
and composed actual Backend registration → typed original upload → frame/process
ingest → authorized byte resolver → supplied-context callable in isolated exact
main `2ccf5b9` plus only this delta (`/tmp/lc-process-context-composition-EKLP6b`).
Probe `/tmp/process-display-composition-probe.py` passed: exact complete supplied
batch/record/source/frame and original 124-byte synthetic PNG retained; the same
original remains available historically after Stop; current source revocation
returns `revoked` and zero attached bytes; composition writes no actor rows and
mutates no inputs. Authorization/commit/live/provider remain explicitly
`not_attested`. This is synthetic production-callable composition, not main,
atomic process export, device pixels or provider understanding.

[Independent review](process-context-delivery-review.md) found a separate narrow
cancellation defect: a synchronous resolver's `concurrent.futures.CancelledError`
becomes `resolver_failed`, then a second callback executes. Owner correction
accepted as `handoff_560632c454b3bfcd79770c41cd444c7c`; no acknowledgement loop,
schema change or duplicate Learning assignment. Integration is held pending the
actual repair.
