# MAC-LIVE-03 public-interface check

One bounded independent compiler check on worker HEAD
`4f6c327018d46604b21c57ab4ebf2b0e45278f70` plus the final dirty correction to
`Freshness.swift`, `LiveFrame.swift`, and `LiveLink.swift`. The exact lead review
is `8467e0a55113455f62067d97a8774dca889c3d88`; the actual app controller is
byte-identical to worker HEAD. PONYTAIL LITE reused the prior compiler harness and
unchanged Apple/UI stand-ins. No production, Git, provider, account, dependency,
root CI, shared-contract, or mobile changes were made.

## Results

- **PASS:** emit a separate DesktopCapture module from all 29 refreshed production
  library sources using Linux Swift 6.3.3 in Swift 5 language mode. The retained
  module helper has `-enable-testing`; the app check uses ordinary
  `import DesktopCapture`, without `@testable import`.
- **PASS:** typecheck the actual LiveController class against that public module
  and retained UI stand-ins. Extraction ends before `LiveConnectionView`; only
  AppKit/SwiftUI imports and the empty `LiveCardView` stand-in are substituted.
- Prepare, module emit and controller check all exited 0. No compiler error was
  reported. The existing `swiftc -version` libc-not-found warning is retained in
  `interface-module.txt`.
- Exact source and transformed-harness hashes matched at completion. All 128
  existing correction-01 evidence files were unchanged. All eight source/English
  hashes matched the current translation manifest.

`interface-source-manifest.json` binds the 29 source files, actual controller,
transformed copies and build/framework/UI inputs. `interface-results.json`
records executed stages and explicit omissions; `interface-drift-check.json`
records the final hash comparison. `interface-reuse-provenance.json` identifies
the reused helpers and narrow path/selection changes. `interface-SHA256SUMS`
binds this evidence package.

## Reproduction

The copied helpers use private `/tmp/lc-interface-correction-02-module` and
`/tmp/lc-interface-correction-02-app` paths. Framework/UI sources are retained
here, so reproduction does not require the earlier harness directories. The
already installed `/tmp/lc-review-0212` toolchain/sysroot remains required; no
script installs tools or calls a provider.

```sh
E=docs/verification/platform/macos-subscription-live/correction-02/interface
bash "$E/interface-replay.sh" prepare
bash "$E/interface-replay.sh" module
bash "$E/interface-replay.sh" app
```

Prepare refreshes the source snapshot from the current worktree and records its
hashes. Compare them with the delivered manifest before attributing a later run
to this exact correction.

## Scope and next owner

This is Linux stand-in module/interface evidence. It does not execute the
MAC-LIVE-03 frame-advancement scenario, compile native macOS app/views or prove
Apple SDK compatibility, permissions, raster ink, actual UI visibility, provider
reception, audio, Notability import or either §7.1 desktop gate. The four unchanged
app syntax parses, full/selected XCTest, fixture/validator and native/provider
flows were not repeated. Root combines the separately assigned focused tests and
binds the final delivery commit; Lead reviews/integrates and runs the exact-source
macOS build. Interactive Mac acceptance remains a separate dependency.
