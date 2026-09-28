# iPad native client (P0-03 state)

Owner: 04 iPad native. Contract: `packages/contracts` 0.1.0.

This directory intentionally contains **no Swift source yet**. No macOS/Xcode,
Apple signing identity or build route is available in this environment (see
`docs/verification/platform/p0-03-environment.md`), so any Swift written now
would be uncompiled and unverified. The bounded prototype to write once a build
route exists is specified in `docs/verification/platform/p0-03-prototype-plan.md`.

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
