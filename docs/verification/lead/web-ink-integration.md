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


## Publication, CI and actual handoffs

Milestone/evidence `1616cceb1a1fe21a4444919c07477faf749f71c1` was pushed
normally and independently matched `origin/main`. All eight source/English hashes
still match the working-language manifest.

The exact candidate's automatic [Safari build 36596021540](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36596021540)
succeeded for real WebExtension packaging and both unsigned SDK builds. This
does not test Safari runtime `importScripts`, permissions, Pencil or a device.

Normal [P0 CI 36596021642](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36596021642)
failed in both Python matrices on the same existing F1 mutation-site locator: it
expected the old pointer-release adjacency before the new WRITE branch. Both
reported **1 failed / 2364 passed / 19 retained xfailed**, and later steps did not
run. This is not a passed CI run. The intended mutation still moves pointercancel
handling after pending text selection; its assertion and behavior must remain.
Lead owns only the bounded locator update, coordinated to avoid concurrent QA
edits; this is not a reason to rerun old browser mutation/recovery campaigns.

Native QA receipt `handoff_9be075fa70c023d3969e705825a2334f` accepts the one
actual integrated behavior pass at exact `1616cce`. The F1 ownership notice is
`handoff_38ea1698aa3b57a3c5f2dc7dcfdad8e7`. Neither acceptance receipt alone
proves execution or a passing result.

Native iOS receipt `handoff_1fe2aea7429ea6838ad2a0d00395f772` accepts the next
existing P0-03/11/07 consumer at the same baseline: preserved native PNG -> exact
original-byte upload -> validated receipt with durable retry/Stop behavior. It is
restricted to native owned source/checks/evidence and an injected explicitly
configured transport; no default endpoint, token persistence, ReplayKit send
activation or full process mapping. Lead retains any required CI wiring. Raw
orientation, original files and clock/events sidecars remain intact. Trusted
production bootstrap, frame clocks/orientation mapping, actual HTTP runtime,
provider and device remain separate dependencies. A real start reply is required
before reporting this owner as implementing.


After these receipts, lead read only the two worker Git states: QA head `2e4486d`
merges exact `1616cce` for the integrated ink pass; iOS head `146ccaf` normally
merges the same baseline. Both worktrees were clean at that instant. These are
actual task-processing/baseline-adoption facts, not inferred execution from a
delivery receipt and not passing behavior or compiled native implementation.
No other worktree was edited.


### F1 locator correction and next native start

Lead updates only two harness string lines to retain the newly added WRITE
`endInk` branch in both the current and intentionally mutated tails. Production
source, all test assertions and all other mutations stay unchanged. The F1 mutant
still removes the early cancellation block and places cancellation handling after
pending text selection, before WRITE completion.

Actual main check:

```sh
.venv/bin/python -m pytest -q tests/e2e/web/test_p0_02_r2_mutation_sites.py
# 16 passed in 0.04s
.tools/node-v24.21.0-linux-x64/bin/node /tmp/lc-f1-semantics.mjs
# 6 controlled exact-handler checks passed
```

The second command extracts the actual current and F1-mutated `onPointerUp`,
strips TypeScript types with the pinned Node built-in and executes them with
controlled globals. Control pending-text cancellation submits zero requests;
mutant submits one, retaining the intended defect. Both normal WRITE release and
active WRITE cancellation retain event consumption and respectively finish/abort
without asking. This is a small semantic probe, not a browser campaign or
independent product acceptance. `git diff --check` passes. The initially delegated
locator preparation was interrupted before delivering a result; these are lead
checks, not a claimed additional independent review.

Actual iOS start reply `handoff_3cc5ee1a482d23a2825a30db0c495e36` confirms exact
baseline merge `146ccaf`, affected original/English/AUDIO-14 reads and implementation
of the single original PUT consumer. Planned app-target-only code remains uncalled,
with durable request identity/retry facts, in-memory-only tokens, same-byte
verification/encoding, explicit Stop retention and injected-transport checks.
Owner delivery and hosted compile are still pending; no send or device gate is
accepted by this notice.
