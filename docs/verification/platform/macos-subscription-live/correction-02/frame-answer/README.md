# MAC-LIVE-03 bounded source and first-display replay

Observable outcome: a correctly anchored follow-up submitted for frame N can first
appear while a healthy retained N+1 is visible. N remains ineligible as a new
current-frame input. Actual source loss still prevents an unshown answer from
appearing. This checks main §7.1/7.2, R52 and AUDIO-14 without claiming native capture
or AI understanding.

Baseline is `4f6c327018d46604b21c57ab4ebf2b0e45278f70`. The lead's independent
failure at `8467e0a55113455f62067d97a8774dca889c3d88` remains byte-for-byte in the
`lead-*` files; [binding](lead-evidence-binding.json) records source paths and hashes.
Its raw failure was not rerun. The correction snapshot is the baseline plus
[tested-source.patch](tested-source.patch), including the five new production
regression methods. The per-run manifests bind every raw source and transformed
harness file. No duplicate collection of all production source files is retained.

The unchanged [lead paired probe](lead-frame-advance-probe.swift) applies blank or
healthy retained advancement after complete submission but before releasing a
fake-provider answer. The added [controller method](controller-frame-advance-method.swift.txt)
uses actual `LiveController.send`, receipt of its held typed response, the existing
controlled status queue and production first-display permit. It changes the
recorder only after the response is answered and before draining that queue.
Both variants check retained frame N, refusal to dispatch N as current pixels,
actual answer publication and separate shown receipt. The method is injected into
a scratch copy of the existing controller-probe extension; prior evidence is not
edited.

## Final executed result

All three runs use the same exact source hashes, verified against the current
working files after completion. [results.json](results.json) binds the combined
42-method result; this is not a full declared 156-test native-suite pass.

| Executed group | Result | Actual XCTest runtime | Raw log / source binding |
| --- | --- | --- | --- |
| Unchanged lead paired probe | 1/1, zero failures, exit 0 | 0.147 s | [log](paired-results.txt), [manifest](paired-manifest.json) |
| Actual-controller response-receipt → queued first display pair | 1/1, zero failures, exit 0 | 0.756 s | [log](controller-results.txt), [manifest](controller-manifest.json) |
| 35 existing source/freshness/presentation/controller controls + 5 new regressions | 40/40, zero failures, exit 0 | 2.567 s | [log](controls-results.txt), [manifest](controls-manifest.json) |

Healthy N+1 allows display and a shown receipt in both paired methods; blank
source loss allows neither. Original N remains the response/card anchor and is
still refused for new current dispatch. The preserved tested patch passed the
read-only reverse-application check against the final working source. No run
failed, and passed groups were not repeated.

[replay.py](replay.py) reuses the retained reconstruction transformations, Apple/UI
stand-ins and Swift 6.3.3 frontend. Its prepare-only baseline first matched every
hash in the lead's executed harness manifest. [toolchain.json](toolchain.json)
retains version, frontend hash, Linux target and the original libc warning.
Interpretation type-checks the included library, tests and actual controller
extraction; it does not compile or run the macOS AppKit application.

From this worktree, reconstruct a delivery commit and run one selected group:

```sh
python3 docs/verification/platform/macos-subscription-live/correction-02/frame-answer/replay.py \
  /home/agentsdock/Projects/learning-companion/wt-platform \
  --source-ref DELIVERY_COMMIT --run paired
```

Use `--run controller` for the queued-first-display pair. `--run controls` selects
the explicitly recorded 35 existing methods. Add each of the five
`LiveFrameAdvanceTests.swift` methods using `--extra DesktopCaptureTests.METHOD`
to reproduce the recorded 40-control group; `controls-manifest.json` lists the
exact method names and executed frontend invocation. `--working-tree` was used
for the final source snapshot before owner commit. For a baseline replay, the
unaltered lead runner and manifest are preserved separately; do not use these
correction controls to reinterpret the historical failure.

Only these affected source/lifecycle methods are executed. Declared native tests,
historical broad failures, fixture checks and prior owner evidence remain separate
counts. Linux Apple/UI stand-ins and a fake connector establish bounded logic and
controller ordering only. Native macOS build, ScreenCaptureKit permissions,
interactive pen/audio/device acceptance, real AI and native TTS remain unverified
or under their existing separate approval/owner boundaries. Lead owns exact-source
review, final integration and subsequent macOS-only CI/device gates.
