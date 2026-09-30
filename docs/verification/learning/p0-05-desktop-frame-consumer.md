# P0-05/10 DesktopFrame 0.2.7 consumer

2026-09-30, Learning. Exact assigned release
`9853901754aff94ccc15bb2cff6fd3938a93a77e` adopted normally on clean team/learning
as merge `016fe716a089be48c353b2c48266058aec654d34`.
Read the complete desktop contract and immediate consumer card, full affected
original/English §7.1/7.4 and desktop-first decisions. Requirement scope remains
R07/R27/R29/R30/R35/R36/R46/R51/R52/R58/R59 and
A12/A14/A16/A26/A30/A31/A44. No requirement or acceptance gate is reduced.

## Implemented outcome

Existing `compose_process_context`, `prepare_stored_process_context` and
`prepare_observation_window` now accept DesktopFrame 0.2.7 explicitly, using its
released metadata/binding validator. Old families keep their validators and bad
versions/tags cannot downgrade. The existing `_resolve_frame_image` pipeline
already accepts exact descriptors with explicit hash/dimensions; it is reused
unchanged, with no duplicate PNG parser or pixel transformation.

The full native profile and original PNG survive: independent requested/delivered
geometry, reported rotation, native session, Double host readings, exact UInt64
decimal ticks, sample time and null/empty facts. Display rotation cannot establish
pixel orientation. No Process clock is manufactured. Window clock comparisons
involving desktop frames explicitly report unknown/no_process_capture_clock,
including equal native-session labels; capture chronology and intervals stay
unknown. Source/byte comparisons imply no reasoning, meaning or mastery.

All metadata is validated before callbacks. Current-source reader injection,
fixed IDs, complete final selection recheck, image/metadata budgets, cancellation,
original/ink references and permission flags reuse the existing implementation.
No new protocol, archive, dependency, app/API/root changes or provider call.

## Checks actually run

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest \
  tests/evals/test_desktop_process_context.py \
  tests/evals/test_observation_window.py \
  tests/evals/test_observation_window_review.py \
  tests/evals/test_stored_process_context.py \
  tests/evals/test_raw_process_context.py \
  tests/evals/test_process_context.py \
  tests/evals/test_image_evidence.py -q --tb=short
```

**352 passed in 3.94s, exit 0**: 61 new desktop consumer cases plus 291 affected
existing cases (including the three previously integrated independent window
probes). The new suite also completed on its own first: 61 passed in 0.30s.
`git diff --check` passed. This is Learning author verification, not a new
independent acceptance pass.

Synthetic adapter execution covers exact asymmetric RGBA PNGs, six reported
rotations without transformations, native Double/UInt64/unknowns, mismatched
owner/source/version/incarnation/artifact, malformed/missing/unknown fields and
versions, invented record clock/UTC/course time, unsupported attempt scope,
changed resolver metadata, wrong PNG dimensions/hash/length/type/CRC, byte/pixel
limits, image gaps, full records/ink/coverage, unknown clock comparisons across
native sessions, all-or-nothing metadata, first/final access denial, final source
and native metadata change, and Future/async cancellation at all callable stages.
Every new reader/resolver is labelled synthetic. No native-emitted sample,
Backend desktop storage, device permission, listener or real model is exercised.

## Remaining work / next owner

Lead integrates/reviews this commit and later composes it with Backend's actual
explicit desktop ingestion/read/resolve delivery. Shared transport, frameless
display-gap transport and Windows profile remain lead-owned follow-ups. This
component does not enable HTTP 0.2.6, attest live/full-display receipt or editable
ink delivery, or pass either §7.1 gate. Later dispatch and presentation require
fresh source/help permission; preparation supplies no durable permission lease.
Original-language evidence and all mobile/desktop/full-product goals remain.

Frozen retrieval inputs, labels/failures and ranking code are untouched; no old
evaluation rerun or quality improvement is claimed. No product provider calls or
cost. Target-device operation/provider input/independent product acceptance remain
unverified.
