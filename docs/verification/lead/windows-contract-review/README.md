# Windows retained-frame metadata release

Owner candidate `3f59d76ddb13cb9576117776f378ed6431218fb1` integrates as `5071529`.
Actual delivery `handoff_f30c269d0b1d8fc2a5254b01f14e3fdf` follows the explicitly
delegated P0-08 package preparation on `d412ed9`. Lead approves **pure 0.2.9**,
registers its generator in scripts/check.sh and its generated types in tsconfig.
All previously released contract source/schema/generated files stay unchanged.
No new dependency, transport, listener, credential, database or desktop activation.

## Behavior and compatibility

The callable validator separately retains original raw PNG and nullable composed
PNG descriptors, with exact owner/source/version/frame and device/session/stream
bindings for each distinct artifact. Image file hashes, renderer RGBA hashes,
editable-stroke references, native labels and archive identities are distinct.
Clock readings and unknown gaps remain honest declarations, not capture UTC,
complete process history, acquisition authority or AI receipt. The unchanged
original-artifact 32 MiB ceiling still applies; native files above it cannot be
trimmed or falsely acknowledged by a later adapter.

Five examples preserve the committed native manifest's actual metadata, with only
explicitly synthetic shared archive bindings. Their source is held producer
`04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`: this release does **not** approve its
retention defects, accept a provider, or claim either desktop §7.1 gate. Source
refusals/omissions/Stop remain in the original manifest; absent gap duration stays
null, and a later actually observed duration is representable without inference.

## Actual checks

- Exact candidate export:216 new contract checks passed; generation check passed.
- Integrated main: **474 passed in 1.15s** (216 Windows plus258 existing raw/Mac
  checks), generated output check, root pinned TypeScript and git diff --check.
- [Independent source review](independent.md) approved, with seven executed probe
  groups, eight exact package/test file comparisons and byte-identical Git-source
  manifest verification. The [portable probes](probes.py) run actual validators
  with synthetic archive relationships; no decoded-image or provider claim.
- Existing [producer file audit](../windows-retention-review/README.md) remains
  separate evidence of the retained sample bytes. It is not rerun or counted again.

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m packages.contracts.windows_frame.generate --check
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider \
  packages/contracts/tests/test_windows_frame.py \
  packages/contracts/tests/test_capture_frame.py \
  packages/contracts/tests/test_desktop_frame.py
.tools/node-v24.21.0-linux-x64/bin/node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/verification/lead/windows-contract-review/probes.py
```

## Next owned implementation

Backend's next existing-card outcome is internal atomic Windows retained-frame
archive/read/authorized-image resolution over the existing control/archive, with
both PNGs and honest frameless gaps; HTTP remains disabled until Lead releases
an explicit additive envelope. Learning's independent next existing-card outcome
is bounded raw/composed Windows evidence materialization over this descriptor,
using the existing context preparation, image checks and final access recheck.
Neither owner changes shared schemas. Lead will coordinate the small internal
resolver selection seam and the explicit next transport version. Web continues
its already-started retention correction; no duplicate producer task is created.

Native correction evidence at `b407478` was sent through accepted
`handoff_bd8f797e339b7a853f2fae010f760b55`; actual start was not yet observed at
this release. Existing independent Windows QA report and its one conditional
pixel-admission retest remain with QA. Interactive Mac, real pen, provider input,
full source/ink/audio and Notability acceptance remain open.
