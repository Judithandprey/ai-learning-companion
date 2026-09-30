# P0-05/10 observation-window preparation

2026-09-30; owner Learning. Assigned pushed baseline
`07e669154e6eae9944368c210c3f1f3d309aa258`, adopted by normal clean-worktree merge
`59521d2c06720cbc8e9f80ece12b2fd96d08b3ba`. Requirements content `d2603fd`:
R03/R51/R52/R54/R55/R57, A30/A31/A35/A37/A38 and process-context clauses;
desktop-first/full-product decision, original/English process evidence and
disclosure rules, AUDIO-08/14 refreshed. All four translation-manifest pairs match.

## Callable outcome

`services.learning.process_context.prepare_observation_window` takes 1–100 explicit
IDs and reuses `prepare_stored_process_context` without changing its behavior.
The existing API supplied records/images but had no multi-observation comparison;
its generic budget selection could omit records. The new callable preserves the
entire requested sequence or rejects an insufficient metadata budget, including
comparison metadata. Image ceilings/unavailable pixels stay per-item gaps. There
is no deduplication or capture-continuity claim. Adjacent comparisons expose only
actual attached byte equality, retained source/reference equality and same-domain,
same-basis clock-reading deltas. Capture chronology/intervals, semantics and
unexpressed reasoning are not inferred. Raw pixels/orientation remain unapplied.

Source versions, original-language reasons, coverage, causal parents and original
artifact/ink refs remain exact. Existing coherent current-access reads and full
final metadata recheck are reused; errors/cancellation withhold the whole result.
No new store, schema, dependency, provider, acquisition or disclosure permission.

## Actual checks

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest \
  tests/evals/test_observation_window.py \
  tests/evals/test_stored_process_context.py \
  tests/evals/test_raw_process_context.py \
  tests/evals/test_process_context.py \
  tests/evals/test_image_evidence.py -q --tb=short
```

**288 passed in 4.09s, exit 0**: 32 new window checks and 256 existing affected
checks. `git diff --check` passed. New cases cover identical bytes, changed pixels,
different PNG bytes encoding the same pixels, mixed source IDs/versions, reversed,
equal, missing and different-domain clocks, unknown raw timing, full gaps/order,
metadata/byte ceilings, fixed ID selection, unsupported attempt scope, valid
metadata mutation during the final read and cancellation at every callable stage.

Actual-operation component evidence uses synthetic typed-original ASGI uploads,
`ControlRegistry.ingest_raw_frames`, retained MemoryStore records,
`AuthorizedProcessContextReader.read_raw` and `AuthorizedImageResolver.resolve_raw`:
two exact PNG originals are returned in requested order; changed originals do not
replace the first. Stop/withdraw keeps current-access history historical. Missing
blob bytes produce a gap; original/source tombstones reject the whole selection.
Source revocation/deletion after an authorized byte read also rejects everything.
The tests assert unchanged stored originals and retained editable-ink references.
No listener, preview, database, account operation or device is involved.

Authoring failures were test-fixture mistakes: mixed unit/backend fixture user IDs
(18 failures) and a metadata boundary assertion overlooking the serialized budget
value's digit count (one failure). Both were corrected in tests, with no weakening
of production validation. The final suite above completed normally.

## Limits and next owner

This is author-tested source/component execution, not independent acceptance or
Windows/macOS runtime/provider evidence. No model calls or product API cost. The
Backend still rejects mixed incarnations/frame families and unresolved attempt
scopes; this consumer does not downgrade them. Unknown/unselected steps, raw
orientation, missing images and opaque ink refs cannot establish actual vision,
editable-ink delivery, reasoning diagnosis or persistent teaching preference.
Later queued dispatch/display must recheck current source and assistance permission;
the return-time check is not a dispatch lease. Both §7.1 gates and full desktop
learning/destination acceptance remain open. Next: lead reviews/integrates this
commit, then coordinates desktop/provider composition on released boundaries.

Frozen corpus inventory was checked: 187 files, canonical SHA-256
`b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997`.
Originals, labels, failure evidence and ranking code are unchanged.
No retrieval rerun or improvement is claimed: retained results remain
50/50 exact and 25/30 fuzzy, with fuzzy failures 03/22/24/26/29 preserved.
