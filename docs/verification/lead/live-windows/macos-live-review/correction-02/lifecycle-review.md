# Independent MAC-LIVE-03 re-review

Decision: approve bounded correction 29bdeb4de9c926148262098ed6b4015ed62ee404 (parent 4f6c327) for Lead integration and hosted native build. No blocking regression found in the three changed production library files: Freshness.swift, LiveFrame.swift, LiveLink.swift. This is not full-product or native/device acceptance.

The changed classification exempts only healthy, fully retained, strictly newer positive frame sequences from source-loss presentation refusal. New render/write admission remains sequence-bound. The original response frame, ink, full-source metadata and historical receipts remain immutable. Blank, unretained pixels, actual loss/recovery, gate closure, Stop and expiry retain their separate authority semantics. No public wire or v0.1.0 changes.

Actual command: `python3 /tmp/lc-lead-mac-live03-29bdeb4/prepare-and-run.py`.
Result: exit 0; 9 executed methods, zero failing assertions and zero unexpected failures, XCTest runtime 1.267 seconds. No broad suite or owner-reported 42-method count is inherited.

Methods: unchanged original healthy-advance/blank paired counterexample; actual extracted LiveController response-arrival -> queued first-display healthy/blank pair; five new changed-path tests (old-input rejection without source loss, draining a new frame behind an old stalled render, held writer rejecting old current pixels, genuinely unretained pixels, permanent revocation after true loss/recovery); unchanged original queued Stop counterexample; actual controller synchronous Stop control.

Both healthy-advance probes now display the valid earlier-frame answer with a shown receipt, and both real-blank negatives suppress first display. Old inputs remain ineligible as current; the prior failed log and manifest are preserved byte-for-byte as before-frame-advance.log / before-frame-advance-manifest.json. The original paired test is byte-identical to that manifest.

Artifacts: focused.log is unchanged raw compiler/XCTest stdout/stderr; source-manifest.json binds exact git-show source, transformed harness, command and selection; prepare-and-run.py reconstructs from exact commit using the retained toolchain, Apple/UI stand-ins and synthetic connector. The existing copied AskLinkTests Sendable warning remains. No network, account, provider, display, microphone, audio, TTS or native CI was accessed. No repository or Git metadata was changed by this reviewer.

Next: Lead integrates normally and runs the exact integrated native macOS build/test/fixture checks. Interactive source permissions, pen, real AI, audio, Notability and both per-OS §7.1 gates remain separately unverified.
