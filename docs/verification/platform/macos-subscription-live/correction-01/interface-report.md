# Independent correction interface and fixture verification

Bounded MAC-LIVE-01/02 review of the final dirty correction snapshot on worker
`3147291f449105c06255cfc0ea2056f1b2582437`. PONYTAIL LITE: reused existing Linux
Apple/UI stand-ins and one existing fixture method; no production/Git mutation,
dependency installation, broad test campaign or provider/model/account/network call.

`interface-source-manifest.json` binds the exact 29 library sources, extracted
LiveController, four changed app sources, existing module build and framework/UI
stand-ins. `interface-fixture-source-manifest.json` binds the independent fixture
copy. Both were compared with current originals at completion: no source drift.
Source/English hashes all match the current translation manifest (eight checks);
relevant §7.1–7.3, source-time, Stop/disclosure and native-role limits remain intact.

## Executed results

- Library module emit: **PASS**, Linux Swift 6.3.3 in Swift 5 language mode.
  Existing `/tmp/lc-parent-harness/build.sh` uses Apple framework substitutions and
  `-enable-testing`; the application check imports its separate module through
  ordinary `import DesktopCapture`, with **no `@testable import`**.
- Extracted actual LiveController class: **PASS** typecheck against that public
  module and the existing UIStub. Extraction stops before the LiveConnectionView
  marker; only imports and an empty stand-in LiveCardView are substituted.
- Original CaptureController, CaptureRun, InkController and LiveController:
  **PASS** syntax parse. This is not semantic checking of the other controllers/views.
- Existing `testLiveSessionLinesForTheReleasedValidator`: **PASS**, one test,
  zero failures. Its 10 synthetic envelopes contain six turns; no connector is launched.
- Existing candidate `checks/validate_live_session.py`: **PASS**, 211 checks
  against the fixture, using the canonical repository `.venv/bin/python`.
  Thirteen shared Python/schema inputs, including every loaded local shared module,
  are byte-identical to released
  `c9177096c99c2562e4474bcbb2f4ffc8beb43c18`. The native adapter itself is
  byte-identical to worker HEAD and is recorded separately; it does not exist in c917.

Raw logs preserve the existing `libc not found` Swift version/parse warning and
AskLinkTests.swift:955 Sendable conversion warning. No warning is suppressed.
The first fixture pipeline returned 1 **after its XCTest passed** because the
provenance helper attempted to find the later native adapter in c917. The next
provenance scan included its own uncommitted `__main__` helper. Both ordinary
inspection failures are preserved in `interface-fixture.txt` and
`interface-validator-preliminary.txt`. The corrected provenance wrapper and unchanged
validator then passed in `interface-validator.txt`; the Swift test was not repeated.

## Reproduction and limits

Use the already installed toolchain/sysroot paths recorded in the scripts. No
script installs tools or performs external calls. `interface-prepare.py` refreshes
only the reserved `/tmp/lc-parent-harness` and `/tmp/lc-app-check` harness copies.
The existing retained `linux-module-apple-stand-ins.swift`, `harness-modules/*.swift`,
and `linux-ui-stand-ins.swift` reproduce their inputs; the actual module/UI inputs
were byte-identical to those retained files. Build/UI copies are also retained here.

```sh
E=docs/verification/platform/macos-subscription-live/correction-01
bash "$E/interface-replay.sh" prepare
bash "$E/interface-replay.sh" module
bash "$E/interface-replay.sh" app
bash "$E/interface-fixture-replay.sh"
```

The fixture replay creates a new private temporary directory and selects exactly
one existing test. Its validator wrapper refuses changed shared released inputs.
All logs and output manifests are explicit; `interface-results.json` records each
actual stage and the preliminary pipeline error without upgrading it to success.

These are Linux stand-in source/interface and synthetic-contract results.
They do **not** compile the native macOS app/views, establish Apple SDK compatibility,
capture permissions, raster ink, actual UI visibility, real AI reception, speech,
Notability import or either §7.1 desktop acceptance gate. Root/lead owns binding
the final correction commit, integration, exact-source macOS build, and separately
coordinated interactive-Mac acceptance.
