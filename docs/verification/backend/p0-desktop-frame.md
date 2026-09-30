# Desktop frame 0.2.7 metadata delivery

Lead assignment: `handoff_cc16ae7b920e11b8cc912ba9c3f8ed7a`, existing P0-08/P0-09.
Adopted `b2999ed0ebd4dadf55d71e93e70f84b8e7015cd7` with normal backend merge
`7b197bd1af97485747f1c13e3d706bdd7687da7e`. Source basis is actual Mac producer
`7efa46ab75fadf4a6a05f4071526ebd7643df6ea`; platform runtime remains under its
own review/correction. The full assigned scope note and §7.1/7.4 original/English
were read. Workflow, desktop-first decisions, role and requirements were unchanged
from the previously verified source revision. No old completed runtime/DB campaign
was repeated.

## Delivered outcome

The new `packages/contracts/desktop_frame` package validates a closed 0.2.7
`raw_capture_frame` with a `macos_screencapturekit` profile, and binds it to one
explicit ProcessBatch 0.2.0 record, DisplaySourceSnapshot 0.2.3 and
OriginalArtifactBinding 0.2.2. The complete owner/source/version, incarnation,
frame ID and PNG artifact reference must agree. Existing batch/scope/ink/limits
remain enforced. Validation is pure and does not change inputs or access bytes.

It retains actual delivered dimensions, callback ordinal, separate native host/
sample/display clocks, start display facts and reported attachment geometry.
UInt64 ticks use bounded canonical decimal strings. Capture UTC/course time/pixel
orientation remain null; reported display rotation cannot orient pixels. Native
Double host seconds are retained without fabricating a Process CaptureClock.
Optional callback wall estimates have their basis/precision checked and uncertainty
remains unknown. Native missing optionals map to explicit nulls; empty rectangles
remain distinct from missing ones. The package README maps each fact to source.

PONYTAIL LITE: reused existing source/PNG/schema/generator primitives and validators.
One new profile is necessary because the legacy raw schema fixes a different
orientation namespace/timing profile. No new archive, framework, dependency,
service, migration, transport/capability or identity was added; old schemas and
root generator/typecheck configuration are untouched. Shared edits remain solely
within the explicit temporary delegation.

## Evidence

- Focused contract tests and generated consistency:
  `python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_desktop_frame.py`
  — **120 passed in 0.49s**. Covers lossless UInt64 boundaries, original clock
  values/unknowns, timestamp precision, geometry, complete cross-binding,
  unrelated-record clocks, attempt/ink/batch invariants, mutation safety,
  closed profiles, legacy 0.1.0–0.2.6 rejection and generated output consistency.
  All examples/pytest inputs are explicitly synthetic, not native output.
- Existing capture-frame, raw-ingress, legacy-ingress, display-source and original-
  artifact contract tests: **384 passed in 1.03s** using the existing locked Python.
- `python -m packages.contracts.desktop_frame.generate --check`: passed.
- Isolated generated TypeScript: pinned Node 24.21.0 / TypeScript 7.0.2,
  `tsc --ignoreConfig --noEmit --strict --target ES2020 packages/contracts/desktop_frame/generated/contracts.ts`:
  passed. Initial shebang execution lacked `node` in PATH; the existing project
  playbook identified the pinned binary, and the explicit-binary retry passed.
- Independent source-fidelity review found three defects, all corrected and
  statically verified: decimal-string trailing newline; rejection of the actual
  Swift fixture's synthetic scope label; datetime truncation of overprecise
  instants. Regression tests cover these rather than weakening assertions.
- `git diff --check`: passed. No DB, server, app, native build, provider or external
  account operation was performed.

Total: **504 relevant tests passed** (120 new, 384 existing).

## Remaining evidence / next owner

**Actual hosted Swift-emitted fixture check: not_run.** The referenced Swift source
has a synthetic 4×2 buffer fixture; reading it is neither running its encoder nor
verifying ScreenCaptureKit/permissions on a Mac. The JSON example contains a
placeholder digest and is not proof of stored PNG bytes or a real clock conversion.

Lead next independently reviews/releases the metadata slice, then coordinates
versioned transport and archive/replay/resolver/deletion/learning adoption. Old
0.1.0–0.2.6 readers deliberately reject the new descriptor. Windows needs a later
profile based on its corrected PNG-retaining producer; none is invented here.
Frameless display gaps still require an explicit transport solution; no synthetic
or stale frame may fill that gap. Both §7.1 gates, real Windows/macOS operation,
ink/audio/AI receipt and Notability destinations remain separately unaccepted.
