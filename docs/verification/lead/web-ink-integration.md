# Original-page capture and editable ink integration

Current state: reviewed and checked on main; **independent actual-browser QA is
next**, not passed. Existing P0-07/12/13, R08/R46/R51/R52/R59, A26/A30/A31/A44
and the complete §7.1/7.2 core behavior remain the scope. This browser component
is not continuous whole-display-to-real-AI or an arbitrary native-app overlay.

## Exact candidate and review

Web `366a994d2e4e90e528662d4f082bcf3f8e7eddc7`, `30ff273`, and
`c88b5f2ec5467ce9be10d8be1c7c337e10f509f0` integrate normally as `c484a42`,
`e1669df`, and **`3ea7c9daa67eb6809d23ccd60d4be896277fcc46`**. Only reviewed
owner commits were cherry-picked; pending lead documentation remained intact.

The component adds explicit mouse WRITE (off by default), partial erasing,
undo/redo preserving original stacking, ASK completion/cancellation restoring
WRITE, editable local IndexedDB history and two independent ink placements.
Current source is rechecked for visible, held-stroke and off-screen changes.
Unreadable or conflicting durable documents are preserved rather than overwritten.
Capture movement during acquisition is conservatively unknown, preserving actual
received images without labeling a mismatched crop known.

[Original input review](web-ink-delivery-review.md),
[original storage review](web-ink-storage-review.md), and
[correction/final approval](web-correction-review.md) preserve the actual findings
and before/after evidence. Final reviewer closure includes the original off-screen
reproduction, seven focused layer tests, six additional source/Stop/immutability
controls and generated-artifact consistency. These are controlled DOM/IndexedDB
probes, not real-browser tests. Owner reports 154 unit cases and a final 24-case
Edge ink run; those are author evidence, not independent QA or this main count.

## Main checks actually run

At exact `3ea7c9daa67eb6809d23ccd60d4be896277fcc46`:

```sh
env -u BROWSER LC_LEAD_REPO="$PWD" \
 NODE_BIN_DIR="$PWD/.tools/node-v24.21.0-linux-x64/bin" \
 TSC="$PWD/node_modules/typescript/bin/tsc" \
 bash apps/safari-extension/scripts/check.sh
```

Passed: TypeScript, **16 test-file groups / 0 failures / 0 skips** as actually
reported by the pinned Node runner, module build, generated content.js/ink-format.js
and three icons. Do not relabel the file-level reporter as 154 independently
observed individual cases. No browser/service/database/provider/device was started
by this main check. Only the repository's ignored module build output was rebuilt.

## One next independent behavior pass

QA receives the published exact integrated revision, preserving its existing
original-page harness and QA-EXT-01/02 failures. Check actual toolbar NAV → explicit
mouse WRITE → draft → partial erase → undo/redo → ASK finish/cancel → restored
WRITE → continue → reload/reopen/edit, both placements, native IndexedDB original
preservation and current-source uncertainty. Reproduce the two actual capture
races with stable positive pixel controls and inspect received PNG/crop evidence.
Retain actual activation/profile/permission limits and test doubles explicitly.
Do not replay accepted document recovery/reselection or Simulator campaigns.

The original user preview, ports 4173/8174, user database/export/tokens and
Paperclip remain untouched. QA may use its established isolated test-profile/port
route. This does not replace the user's running preview. Real provider, iPad
Pencil/finger behavior, global cross-app input, original-screen ink reaching AI and
Notability import remain open. Lead integrates actual QA results/fixes, then names
the next executable owned segment or its concrete dependency.
