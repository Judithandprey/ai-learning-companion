# First executed macOS desktop build

Exact published source: **59ee862be3e7a51e3b51caa31878db8aa36f6d74**.
Existing workflow, explicit macos lane: [run36704517145](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36704517145), **SUCCESS**.
Job109851497137 ran2026-09-30T10:47:21Z–10:49:15Z. No Windows lane was started;
its source remains on owner correction. No signing/account/purchase change.

The real hosted release compiler produced `MacDesktop.zip` with the complete
CompanionDesktop.app. Development artifact is available on that run. It is arm64,
minimum macOS15.0; this is not a universal/Intel or notarized release claim.
The actual runner was macOS26.6.2, Xcode26.6, Apple Swift6.3.3, SDK26.5.

All **20 XCTest cases actually passed**,0 failures/skips. The subsequent empty
SwiftTesting0-test suite is separate, not the XCTest count. These are controlled
library/start-cancellation/sample-buffer/storage/freshness tests, not human
operation of ScreenCaptureKit on a real learning screen.

Independent artifact audit verified:

- All19 evidence-file SHA256 values match with no unlisted evidence file.
- Source archive matches all18 committed macOS files, the build script/workflow
  and byte-identical reused iOS FrameStore; no dirty working-tree source shipped.
- Bundle plist matches source; executable Mach-O arm64,100755,858896bytes.
- Swift fixture contains8 events and2 valid4×2 RGBA PNGs,179bytes each. Hashes,
  CRCs, dimensions, event paths, lastKept and358-byte total agree. The exact
  synthetic label and stopped state survive. These are generated sample buffers,
  not captured real course content.

Local review copy: `/tmp/lc-macos-36704517145/desktop-macos-59ee862be3e7a51e3b51caa31878db8aa36f6d74-1`;
log `/tmp/lc-macos-36704517145.log`. No binary was copied into Git. No app was
launched by Lead and no actual capture, permission UI, audio, pen, provider or
independent product acceptance occurred. Interactive Mac access remains unconfirmed.

## Next actual owner work

Native same-card mapper handoff`handoff_eabebbfa7e6ee1a1d7d065e710d93c2e` was
accepted. Actual start`handoff_af8220ead1a524ce2aa0eead0ca9b678` confirms normal
mergee504b70 of59ee862 and complete wire/requirement reads. Scope stays
apps/macos/CompanionDesktop and platform evidence: actual retained records/PNG
plus explicitly supplied trusted bindings to0.2.7/0.2.8, exact typed fields and
honest gaps, source files untouched. It emits real Swift fixtures for Lead's
contract/Backend/Learning composition, with no transmission/provider activation.
Build output was provided through`handoff_fa1c5cce82d48543f7dfd6275708e7a3`.
Lead clarified in`handoff_257fd61e0b1a3d1a4b91197a49a14ebf` that standard native
JSON need not match Python canonical byte formatting; avoid a duplicate encoder
or silently dropping clock facts. Native serialization still must pass strict
wire rules and preserve lossless ticks. This is the same task, not a second batch.
