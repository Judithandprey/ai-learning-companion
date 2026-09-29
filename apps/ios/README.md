# iPad native client (P0-03 state)

Owner: 04 iPad native. Contract: `packages/contracts` 0.1.0.

`probes/EnvProbe.swiftpm` is a read-only native environment probe. Its exact
source compiled unsigned on hosted macOS at main `01a8adf` in
[run 36525663497](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36525663497).
There is no local Apple toolchain or verified signed/device installation.
See [build evidence](../../docs/verification/support/sup-ios-01-build-install.md)
and [probe steps](probes/README.md). Compilation does not prove actual audio capture.

The user-approved [delivery split](../../docs/tasks.md#ipad-delivery-split)
supersedes the earlier research-only/no-Swift gate for IOS-INK-01. `CompanionInk.swiftpm` (scheme `CompanionInk`) implements source for
one owned-page SwiftUI/PencilKit slice with editable original ink, stable source
context, atomic local save and offline reopen. Support owns its existing hosted
build/artifact/install route; QA receives the exact runnable candidate after its
current retest. Do not duplicate those tasks or add features while a real compile
failure is unresolved. The reported target remains M5 iPad Pro / iPadOS 26.5.

CompanionInk remains **uncompiled** until its own hosted run; no simulator or
physical-device result exists. See [the native delivery and QA steps](../../docs/verification/platform/ios-ink-01.md).

Owned-page ink is an explicit early slice, not R59/A44 original-screen annotation,
A46 Notability import, real audio/AI understanding or complete P1 acceptance.

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
