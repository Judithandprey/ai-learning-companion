# Raw native-frame candidate contract

Backend delegated P0-08/P0-09, 2026-09-30 UTC. Exact assigned main
`f4575b9d74f2a16e0276131bb9e130cc87ff9416` was normally merged into clean
`team/backend` as `5ca0c9859c453030cb93becff669902c39145bcd`. Assignment
`handoff_e0e2ea4f797fb4c180d8e09631b6b1f0` explicitly delegates only the
new contract family, its focused test file and Backend evidence. Current task card,
native mapping boundary, source/English §3.5/7.1, current decisions and complete
V-SourceTimeRelations were read. Four source/English pairs match the manifest.

## Observable candidate result

`packages/contracts/capture_frame` provides one closed, distinctly named
`RawCaptureFrame` 0.2.5 schema, standalone generated JSON Schema and TypeScript,
`validate(frame)` and pure
`validate_binding(batch, record_id, frame, display_source, original_binding)`.
The [candidate README](../../../packages/contracts/capture_frame/README.md)
documents every field, timing relationship and consumer obligation.

- Pixel capture UTC and course media position stay null. Callback wall-time
  estimates require their fixed observation basis, a callback clock and explicitly
  unknown uncertainty. Null estimates may retain an available clock. The process
  record's unqualified observation UTC stays null; a supplied process clock must
  exactly match the callback clock, while omitted duplication remains null.
- Sample PTS is finite-or-unknown, including finite negative values; native buffer
  sequence is distinct from process sequence. Raw dimensions, PNG reference and
  all eight CGImagePropertyOrientation values (including mirrors) or unknown stay
  unchanged. `applied_to_pixels:false` does not permit silently rotating originals.
- Binding checks the selected record/frame identity, complete owner/source/version,
  device/session/stream and complete screen-image PNG reference. Existing process
  scope, evidence and limitations remain intact. No validator transforms inputs
  or returns fabricated observations, normalized timestamps or authority.

PONYTAIL LITE: copy existing primitives, reuse current schema/type generation and
existing supplied-record validators. No extra framework, state, store or dependency.
Old contract files are untouched; current 0.2.4 does not accept this descriptor.

## Actual validation and retained finding

Independent pure review found the initial copied artifact primitive inherited a
zero-byte minimum. Standalone descriptor validation therefore accepted an empty
PNG even though the later original-binding check rejected it. The candidate now
requires 1 byte through 32 MiB, matching the existing original transport ceiling; generated
schema was regenerated, and independent zero/max/max-plus-one probes passed.
No old schema or assertion was weakened.

The new focused suite passed **138 tests in 0.33s**:

```sh
python -m pytest -q packages/contracts/tests/test_capture_frame.py
```

It covers all raw orientations and unknown, valid callback estimates/clocks,
finite/invalid/boolean/deeply nested inputs, PNG and safe-integer bounds, closed
required nested fields, exact identity/incarnation/artifact/time relationships,
explicit existing attempt scope and separate ink, whole-batch process invariants,
input preservation on success/failure, released-reader rejection and generated
consistency. The test diff was reviewed; there were no failing or skipped cases.

Existing compatibility/generation checks: **10 passed in 0.32s** using:

```sh
python -m pytest -q \
  packages/contracts/tests/test_process_v2.py::test_legacy_bytes_remain_frozen \
  packages/contracts/tests/test_process_v2.py::test_legacy_examples_still_validate_and_versions_are_explicit \
  packages/contracts/tests/test_process_control.py::test_compatibility_artifacts_remain_frozen \
  packages/contracts/tests/test_capture_ingress.py::test_released_generated_bytes_stay_frozen \
  packages/contracts/tests/test_capture_ingress.py::test_generated_complete_refs_versions_scopes_and_idempotency
```

Python commands use the existing main `.venv/bin/python`. The new generator
`python -m packages.contracts.capture_frame.generate --check` passed. Generated
TypeScript passed the existing pinned Node/TypeScript compiler:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc \
  --ignoreConfig --strict --noEmit --skipLibCheck \
  packages/contracts/capture_frame/generated/contracts.ts
```

The first compiler invocation lacked Node on PATH; the repository playbook provided
the pinned runtime. That compiler requires `--ignoreConfig` for the isolated file.
The final command above exited 0; no installation or root config change was needed.

Independent review additionally passed all orientations plus unknown, finite
negative PTS, independent sequences, valid timing combinations, eight timing
contradictions, twelve identity/reference mismatch cases, input preservation, old
Frame/0.2.4 rejection, copied-primitive preservation and generated consistency.
`git diff --check` passed. Comparing tracked contract files against the exact
assigned baseline found no old-family changes, including released 0.2.4 files.

## Limits and next owner

This is synthetic contract evidence only: no service, database, browser, native
device, provider or capture campaign. No actual stored PNG, decoded dimension,
freshness, physical orientation, clock accuracy, source permission or AI receipt is
attested. Local native originals/sidecars and all consumers remain untouched.
R07/R29/R30/R35/R36/R46/R51/R52/R58/R59 and
A12/A14/A16/A30/A31/A41/A44 retain their wider unverified behavior; both core §7.1
gates and full editable-ink/Notability outcomes remain open.

Lead next reviews the field/version choices, integrates/releases a precise baseline
and explicitly assigns native mapping and Backend/Learning adoption. Suggested
lead-owned root hook: `python -m packages.contracts.capture_frame.generate --check`;
include the new generated TypeScript file in the existing type check. This delivery
does not edit root hooks, CI, shared older families, endpoints or activation defaults.
