# P0-05/10 supplied process and image composition

Task `handoff_006b402eac75778c1d942c7bbd67c369`, updated baseline
`e50e95d2665aa8502e0f3d09460d9ad5b8a86b6d`; normal preserving merge at
`eaa68214295672d43833d528712e76e971daa649`. Refreshed affected original/English
R07/R27–30/R35–36/R51–59, A30–31/A38/A44, decisions, source/time original-goal
cases and released process/display/original-artifact contracts. PONYTAIL LITE:
reuse the existing PNG parser/result validation, no dependency or state layer.

## Outcome and checks

`services.learning.process_context.compose_process_context` composes an actual
supplied ProcessBatch with exact source snapshots and frames. It retains complete
operation/coverage evidence and returns bounded PNG bytes or explicit image gaps.
All owner/source/version/frame/artifact/display-stream bindings are checked before
resolution; attempts reject explicitly. Whole-item metadata budgeting reports
omissions without trimming originals or resolving omitted items. Outside-context
parents remain unknown, source versions remain distinct, and timestamps/sequence
are not substituted for one another. See the callable and budget definition in
`services/learning/README.md`.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_process_context.py tests/evals/test_image_evidence.py -q
# 137 passed in 0.89s: 71 process composition + 66 existing image checks.
git diff --check
```

The first run had 129 passes and one test-fixture error: `needs_permission` is not
a released AccessStatus. Corrected it to `needs_auth`; no contract was loosened.
The final run above also includes seven added operation/byte-bound cases. Tests
cover known and unknown operation/reason/coverage, mixed text/ink erase/undo/redo,
site feedback attribution, exact legacy/display records, foreign/mismatched
bindings, source revisions, out-of-order and null clocks, omitted parents,
UTF-8 metadata limits, immutable outputs, caller mutation rejection, missing and
revoked bytes, callback failure/cancellation, corrupt PNG, unsupported formats,
per-image/total/pixel bounds, and unchanged v1 behavior after helper extraction.

The MemoryStore check uses actual `CaptureArchive.ingest`, readback and
`AuthorizedImageResolver` with synthetic/test_only sources and PNG bytes through
the existing fixture import path. It supplies the original ingress batch rather
than reconstructing one from stored envelopes, attaches matching original pixels,
and verifies every stored document is unchanged by composition. This is a synthetic
known-source module composition, not production screen ingress or a transactional
process export. No DB, service, provider, device or paid call was used; product
model calls and cost are zero. Frozen fixture files, labels and retained retrieval
failures are untouched; prior results remain 50/50 exact and 25/30 fuzzy. Retrieval
was not rerun or tuned and no semantic/multilingual improvement is claimed.
The actual fixture inventory check still counts 187 files with canonical SHA-256
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.

## Remaining boundaries and next owner

Lead reviews/integrates this commit. Backend owns actual display-source adoption
and coherent authorized metadata export; a byte resolver alone cannot authorize
source text or process metadata. The caller must recheck authorization and allowed
assistance at final use. Batch `delivery_mode` is retained as supplied metadata,
never live attestation. Authorization/commit/live/provider remain `not_attested`,
presentation `not_granted`, and overall capture completeness unknown.

Only supplied provisional-session evidence and the existing static 8-bit RGB/RGBA
PNG subset are supported. No attempt inference, metadata fetching, batch-envelope
reconstruction, OCR, editable ink delivery, diagnosis or provider input is added.
Continuous actual-screen understanding, original-screen annotation, independent
mastery, real-device behavior and Notability import remain unverified; these checks
do not close the original goals, G6/G7 or live product acceptance.

## Review correction: synchronous Future cancellation

Lead review `handoff_560632c454b3bfcd79770c41cd444c7c` identified that
`concurrent.futures.CancelledError` inherits `Exception`, unlike asyncio's
cancellation. The generic resolver error handler swallowed a cancelled
`Future.result()` and continued to the next image. The original 137 checks did
not cover that stop boundary. Preserved delivery `6ebbeae4`; this correction
explicitly re-raises standard Future cancellation before handling ordinary errors.
No shared helper, schema, dependency, provider or storage behavior changes.

Added an actual cancelled Future check with two candidate items: cancellation
must escape after exactly one callback and leave supplied originals unchanged.
The same check covers asyncio cancellation, KeyboardInterrupt and SystemExit.
Ordinary missing/revoked/OSError/RuntimeError checks now verify that the next
valid image still attaches, retaining the intended per-image gap behavior.

Before the runtime fix:
`python -m pytest tests/evals/test_process_context.py -q -k 'cancellation or resolver_failures'`
reported **1 failed, 7 passed, 66 deselected in 0.17s**; the failed case was the
cancelled Future. After the fix, using the existing repository interpreter:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_process_context.py tests/evals/test_image_evidence.py -q
# 140 passed in 0.89s (74 process checks, 66 unchanged image checks).
git diff --check
```

Read the lead's independent reproduction and checked affected instructions and
requirement files against `2ccf5b9109476b7214620ec0b8e66d10ee0df9d6` (unchanged).
No merge, frozen retrieval rerun or duplicate Backend composition was needed.
All prior evidence/acceptance limitations above remain; lead owns integration.
