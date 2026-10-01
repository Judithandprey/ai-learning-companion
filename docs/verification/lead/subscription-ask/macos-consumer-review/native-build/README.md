# Actual native Mac ASK build — 2026-10-01

Exact source `fe0156cfbf6c9813480e774b1407135b89e501ed`; reviewed native
candidate `c9e8e0bcca67970adef9dd5bc21ecc0f1d0ee4a1`.
[Hosted run 36902046846](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36902046846)
completed successfully. One macOS job, 6m16s after runner assignment; initial
queue time is separate. Full App build/package succeeds, all 100 declared XCTest
methods execute and pass, and four actual Swift/ImageIO ASK requests pass the
released Python validator's 72 checks. This closes the uncompiled-App and
ImageIO-to-contract checks for this exact component, not interactive acceptance.

Lead verified all 117 artifact hashes, 3290 Git source blobs/modes/paths, exact
native tree equality, package CRC/executable/plist and the complete declared/tested
method set. `verification.json` records the result; `audit.py` inspects downloaded
artifacts without executing the application or rerunning fixtures. Raw run and
artifact receipts bind source and run. The service ZIP digest is retained as
reported, not claimed independently recomputed.

Only selected generated fixture/logs and receipts are committed here;
`retained-hashes.json` covers them. `SHA256SUMS` is the original complete artifact
manifest; remaining files, source archive and MacDesktop.zip remain in the hosted
artifact and local `/tmp/lc-macos-ask-36902046846` download. Reproduce the audit:

```sh
.venv/bin/python docs/verification/lead/subscription-ask/macos-consumer-review/native-build/audit.py /tmp/lc-macos-ask-36902046846 fe0156cfbf6c9813480e774b1407135b89e501ed c9e8e0bcca67970adef9dd5bc21ecc0f1d0ee4a1 36902046846 /tmp/mac-ask-new-audit.json
```

No managed login, Codex inference, private screen, microphone, device or GUI was
used. The package is an unsigned development artifact; no interactive Mac,
permission, audio, pen, Notability or full-product pass follows from it. The
component still uses selected-image v1 and is not the current continuous-screen
product workflow.

Existing next Native task was actually sent as
`handoff_0f6c7eb731ba62d9ea3ed600c84b10ca`, with exact `fe0156c`: live/1
whole-frame/focus/text-follow-up plus quota, preserved source/ink and Stop rules.
Read-only observation confirms Native normal merge `5d8d121` adopted that exact
baseline; no separate reading acknowledgement or feature completion is inferred.
The existing Windows implementation and one independent changed-flow QA continue.
