# iPad native client (P0-03 state)

Owner: 04 iPad native. Contract: `packages/contracts` 0.1.0.

There is no macOS/Xcode or Apple signing identity in this environment. The
resolved route, a hosted `macos-26` compile plus Swift Playgrounds on the user's
iPad, is described in `docs/verification/platform/p0-03-environment.md` section 5.

Swift packages here. None has a simulator, install or device result yet:

- `CompanionInk.swiftpm` (scheme `CompanionInk`), **uncompiled** until its own hosted
  run: IOS-INK-01, the one bounded
  native slice. It shows one bundled practice page with PencilKit ink, pen and
  eraser, and NAV/WRITE/ASK modes (ASK honestly shows "not connected"). The
  editable original is saved atomically with its page context and restored
  offline. See `docs/verification/platform/ios-ink-01.md`.
- `probes/EnvProbe.swiftpm` (scheme `EnvProbe`), **compiled** by the hosted
  `macos-26` job (run 36525663497, commit `01a8adf`): minimal read-only environment
  probe that proved the route (see `probes/README.md`).

`checks/InkFileCheck/main.swift` is a Mac-only executable check of the ink file
rules (replace rule, load rejection, envelope round trip), compiled with `xcrun
swiftc` against the app's `InkFile.swift` and `PracticePage.swift`. It is not run
yet; see `docs/verification/platform/ios-ink-01.md`.

The wider prototype plan is `docs/verification/platform/p0-03-prototype-plan.md`.
No further native features are added until the ink slice compiles.

What is here and executable on Linux:

- `tools/check_capability_matrix.py` validates
  `docs/verification/platform/p0-03-capability-matrix.json`: every row's result
  is a contract-0.1.0 `CapabilityResult`, every source has an access date, each
  status agrees with its documentation basis and cited research, and no
  documented claim is reported as implemented, compiled or device-verified
  without executed evidence. Every row and every checklist test also records its
  applicability on the user-reported target, iPad Pro 13-inch (M5) on iPadOS
  26.5; the dated iPadOS 27.0 research is not an upgrade prerequisite.
  `--matrix p0-11` checks the P0-11 G7 matrix. `--self-test` confirms known-bad
  rows are rejected and a well-formed device failure is accepted.

```sh
uv sync --frozen
.venv/bin/python apps/ios/tools/check_capability_matrix.py --self-test
.venv/bin/python apps/ios/tools/check_capability_matrix.py --matrix p0-11 --self-test
```

A passing check means the matrix is internally consistent. It is not evidence of
iPadOS behavior, compilation, signing, installation or real-device results.
