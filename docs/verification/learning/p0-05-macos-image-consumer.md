# P0-05/10 Mac 0.2.11 process-image consumer

2026-09-30. Lead assignment `handoff_e7fe2502aba271c97ffc108e38baf6b6`.
Exact released baseline `c2ac1c7f7f8337424812fb5e53cc078d9715548d`, preserving
merge `cb564e7a3e96292b2287bc925594c3bff99b2f37` on `team/learning`.
Four prior candidate add/add conflicts resolved byte-for-byte to the released
baseline under normal approval; no independent schema edits. Existing upstream
archived logs with whitespace were preserved verbatim, not cleaned or rewritten.
The consumer commit changes only Learning implementation, eval tests and evidence.

## Delivered behavior

The existing `compose_process_context`, `prepare_stored_process_context` and
`prepare_observation_window` now accept `macos_resolver=None`, using the approved
internal `(detached_frame, *, image_role, max_bytes)` seam. Mac 0.2.11 and Windows
0.2.9 dispatch by exact version despite sharing `retained_capture_frame` kind.
Legacy and Windows callers retain their resolver signatures and outputs.

Each Mac item retains the full supplied descriptor, Process record, source,
parents and separate editable-original references. The released binding validator
checks every distinct PNG and exact source/incarnation before byte access.
Raw/composed images have explicit independent roles; the existing decoder verifies
actual PNG bytes, length/hash/dimensions, structure and resource limits. No image
conversion, ink rendering, archive scan, identity allocation or new store is added.

A successful empty-ink composition aliases raw but still resolves/counts both
roles. Native refusal remains `not_composed` with its reason; a missing outcome
remains `unknown` / `no_retained_outcome`. Full native detail stays in the frame.
Unavailable composition is never replaced with raw pixels. Both attachments use
the same byte/metadata/pixel budgets; known outcome gaps reserve their actual
metadata before admission. Existing Windows admission behavior is unchanged.

Stored preparation reuses the complete final authorized reread, frozen selection,
and mutation/cancellation guards, including omitted and frameless records. A
revoked source or changed final metadata withholds the complete packet. Window
comparisons inspect attached bytes only, preserve requested order, and report
unknown native clock chronology. No reasoning, mastery, live vision, real provider
receipt or help/presentation authority is inferred. PONYTAIL LITE applied through
the existing composer, binding and PNG code, without a platform framework or dependency.

Affected requirements refreshed at the assigned revision: complete original and
English R03/R51/R52/R54/R55/R57/R59, A30/A31/A35/A37/A38/A44; current decisions and
AGENTS/TEAM/role/workflow were unchanged from the preceding reviewed task.
This bounded component does not fulfill the original-screen or teaching gates.

## Actual verification

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_macos_process_context.py tests/evals/test_windows_process_context.py tests/evals/test_desktop_process_context.py tests/evals/test_observation_window.py tests/evals/test_observation_window_review.py tests/evals/test_stored_process_context.py tests/evals/test_raw_process_context.py tests/evals/test_process_context.py tests/evals/test_image_evidence.py -q --tb=short
git diff --cached --check
```

**495 passed in 5.34 s**: 80 new Mac cases plus 415 affected regression cases.
The new cases cover:

- All seven audited Swift synthetic raw images, six compositions and geometry
  refusal; exact PNG bytes, full descriptors and unchanged input/output separation.
  Empty aliases with one/two archive IDs; source-time fallback and reopened
  revision unknowns; actual integral JSON number representations.
- Raw/composed role echo, descriptor/hash/MIME/byte-type substitution, missing
  and revoked bytes, CRC corruption with matching declared hash, dimension/length
  mismatch, pixel ceilings, per-image/shared byte limits and metadata edges.
- Exact version/platform discrimination including a mixed legacy/Windows/Mac
  call; malformed bindings rejected before all resolvers, even when metadata
  budgets would omit the affected item.
- Requested-order raw/composed byte comparisons, frameless gaps, refusal/unknown
  outcomes, no fabricated source chronology or semantic/learning inference.
- Final source revocation/metadata change/missing records/composition change,
  revocation between image roles, cancellation at first read/raw/composed/final
  read, supplied-input mutations and the complete omitted/frameless selection.

The first 80-case run reported **1 failed, 79 passed in 0.70 s**. Its synthetic
window gap reused a helper's `missing_sequences: [{first: 2, last: 2}]` while
sequence 2 was present. Existing Process validation correctly refused it. The
fixture now states an unknown interval without asserting a missing ordinal;
no production guard was weakened. The full affected run above then passed.

Native PNG source: the retained main fixture
`docs/verification/lead/macos-composed-hosted/macos-composed-fixture/20260921T141320Z-A2ECCA80`.
These are actual Swift-generated **synthetic buffers**, not display capture.
Tests verify each file against its declared SHA-256/length before calling the
consumer and use the actual seven-outcome descriptor examples. Archive identities,
readers, authorization changes and role-aware resolver behavior are test-only.
The separate native ink-file reference remains opaque; no revision-specific
editable-ink binding or production storage acceptance is claimed.

Shared contracts and frozen retrieval fixtures have no diff from the released
baseline. Original retrieval labels/failures are unchanged; no retrieval rerun
or tuning. Historical 50/50 exact and 25/30 fuzzy results remain historical, with
fuzzy03/22/24/26/29 failures preserved. Product provider/API calls: 0; product API
cost: 0. Development usage was not measured.

## Remaining boundary and next owner

Backend production `read_macos` / `resolve_macos` and the subsequent 0.2.12 ingress
remain dependencies. The test reader's unchanged envelope is the approved seam,
not a claim that production adapters exist. Lead next integrates/reviews this
consumer and later composes it with actual Backend implementations. No Backend,
database, root/shared schema, native app, provider, preview or device activation
was performed by this task.

Preparation is authorized only at its final read, not an atomic future send or
presentation permit. Later use must recheck source and assistance authority.
Configured Mac exclusion and mapping remain unverified; descriptor references do
not prove live capture, immutable editable history, actual rendering/retention,
cross-boot clocks, actual AI receipt, either §7.1 gate or R59/A44 acceptance.
