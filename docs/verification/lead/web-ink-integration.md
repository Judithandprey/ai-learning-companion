# Original-page capture and editable ink integration

Current state: **independent desktop-browser QA delivered; corrections required**.
At exact `1616cce`, 35 ink checks passed and 42 of 44 capture checks passed.
QA-EXT-01/02 close for their tested cases; QA-EXT-03 remains open. Lead also
classifies the observed loss of a conflicting tab's ink on reload as an existing
durability defect under R46/A27 and §7.2. See the disposition below. Existing
P0-07/12/13, R08/R46/R51/R52/R59, A26/A27/A30/A31/A44
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
Unreadable or conflicting durable documents are preserved rather than overwritten;
new refused ink currently survives only within the tab, not reload. This is not
complete original-ink preservation. Tested light-DOM capture movement is marked
unknown while retaining the received image, but movement inside an open shadow
root can still produce a mismatched crop labeled known (QA-EXT-03).

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


### Repair publication and completed CI

`69a719ca89b1dbdf32012a168f633fc8cf34f90a` was pushed normally and matched
`origin/main`. `git diff --exit-code 1616cce 69a719c -- apps services packages`
returns zero: product source is unchanged. [Exact P0 run 36597400035](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36597400035)
completed successfully in both Python 3.12 / Node 24.21.0 (3m04s) and Python 3.14 /
Node 24.21.0 (3m25s); `gh run watch --exit-status` returned zero. The earlier failed
run remains recorded above. QA received the harness-only correction notice as
`handoff_e3c656eb8e9e7dbac6cdf3acfab2612c`; no restart of its product run is required.

Actual QA start `handoff_5d5d68b76f52e496f755a6598d3fe05d` confirms exact
`1616cce`, 92/92 checked source files in its isolated copy, successful TypeScript
build and matching content/ink-reader/icons with unchanged activeTab+scripting
permissions. Its planned actual fresh Edge/profile run uses its own behavior
harness and an available isolated port4184; received-ink pixels, native IndexedDB,
control races and injected cases are separately identified. No behavior result
was reported yet. This is observed work, not acceptance inferred from a receipt.


## Independent browser delivery and disposition (2026-09-29 UTC)

Actual QA mail `handoff_8be950df59531457809e143621692b75` delivers commit
`efa7900` (parent `2e4486d`) for exact
`1616cceb1a1fe21a4444919c07477faf749f71c1`. The
[complete report](../qa/p0-07-integrated-ink-1616cce.md) retains the failed
capture cases, first failed ink run caused by a still-scrolling harness, corrected
run, exact instrumentation and untested cases. Lead confirms Web production bytes
at `35cfa94` are unchanged from that candidate; all eight current source/English
manifest hashes match. No accepted old browser or Simulator campaign was replayed.

QA actually exercised fresh-profile headless Windows Edge on isolated port 4184,
using the extension action through CDP, CDP pen/mouse/touch emulation, native
IndexedDB reads and explicitly forged corruption controls. This is neither human
toolbar operation, Safari runtime, Pencil nor provider evidence. Published PNGs
are from the owned fixture; exact capture bytes and DevTools ink screenshots are
labeled separately. The user preview, its database/services and Paperclip were
not used for this pass.

The 35 passing ink assertions cover input separation, explicit mouse WRITE,
partial erase and original stacking through undo/redo, ASK finish/cancel returning
to WRITE, continuation, both placements, ordinary reload/edit and source-change
uncertainty. Capture is 42/44: tested light-DOM QA-EXT-01/02 close, but QA-EXT-03
remains. A fixed-size open-shadow host hides an internal 100 px movement: the
reported known crop is white while the selected green content moved elsewhere.
The delayed control and three exercised real-timing attempts reproduce it; two
other timing attempts did not exercise the change. The stationary shadow control
returns the correct green crop. No complete capture acceptance follows.

Lead additionally treats `conflict_reload_behavior` as an existing retention
failure: B saves A1+B1; A's later A2 is refused, kept only in that tab, then lost
on reload. Preserving B is necessary but insufficient under source/English §7.2
(local saving at each stroke end), R46/R51 and A27 (editable originals after
restart). A warning does not waive those requirements. QA's 35 exact assertions
remain passed; no user decision is needed to discard this loss. Preserve both
histories, raw unreadable records and recoverable new ink without inventing their
interleaving or another archive. Real inability to write storage must be disclosed
with a usable recovery action, not reported as saved.

One same-card Web correction is accepted as
`handoff_501d9d49635ef47ec37bcf573db2cd85`, baseline `35cfa94`, limited to
`apps/safari-extension/**` and `docs/verification/web/**`. It combines the open-
shadow confidence repair and durable conflict/corruption recovery; no library,
provider, server activation, new framework or shared-contract change is assigned.
Acceptance includes stable/moving open-shadow controls and lifecycle teardown,
actual conflict reload/reopen/edit with both originals retained, corrupt record
preservation, failure/Stop/address isolation, and unchanged no-automatic-help
behavior. The receipt said `execution_started:false`; it was not proof of a start. Actual
reply `handoff_c1ba1077fd8e6b0341b4222c42184bba` at17:30:04 UTC
subsequently confirms the affected source matches the baseline, the report and
clauses were read, and Web has started this single capture/recovery correction.
The parked library files are outside its write scope; no repair is yet delivered.

QA receives the substantive conditional disposition via
`handoff_feff23b156b608c532b216636a48307f`, replying to its actual delivery.
Next owner is Web for one corrective commit, then lead review/integration, then
QA's focused changed-path browser check on the exact released revision. Already
passed unrelated ink cases are not a request for another full campaign. Both core
gates, real provider, primary iPad input, native-app overlay and Notability remain
open. The held native-upload CI patch is independent and remains uncommitted.


### Evidence integration and main checks

Reviewed evidence/harness commit `efa7900` is integrated as `e2688bb`.
[Independent evidence review](qa-ink-evidence-review.md) validates the retained
counts, five harness hashes and seven shipped-resource hashes, and inspects all
37 owned-fixture PNGs. Three real-timing images have no literal hash in their
summarized event; their event identities remain QA evidence, not an independently
reconstructed identity. No product browser run was repeated.

On integrated main, both changed Node scripts pass `--check`, both Python analyzers
compile in memory, both retained summary hashes/counts match, and the F1 mutation
runner remains byte-identical to `69a719c`. `git diff --check` passes. Lead makes
only report-label/disposition corrections: numbered ink screenshots are distinct
from the exact ink ASK capture, and 35 passing assertions do not waive conflict
reload loss. Summary JSON, original PNGs and harness assertions remain unchanged.
Evidence/disposition `2585762b1f5ccbdaf53d3f28f9262b1ea5889029` was pushed
ordinarily and independently matched `origin/main`. Its automatic [P0 checks36606068415](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36606068415)
passed: Python3.12/Node24.21 in3m7s, Python3.14/Node24.21 in2m23s.
The foreground watcher exited0. This is CI, not another browser/device/provider pass. The independent
native CI draft remains excluded. No replacement of the running user preview is authorized by these checks.


## Recovery delivery and resumed bounded review

Actual Web mail `handoff_fc1d270731e4e98407fd1cb04cb56742` supplies `32b7768`.
The Codex quota interruption left main `8c50587` and the native CI patch intact;
the user explicitly resumed. Completed evidence was recovered before restarting
only missing review work. Main's affected Web app files match the candidate parent
`c88b5f2`; parked library files remain unrelated.

[Capture review](web-shadow-correction-review.md) reports 18 independent controlled groups passing, including the
original open-shadow wrong-crop reproduction and corrected unknown/no-crop path.
[Ink recovery review](web-ink-recovery-review.md) finds two specific blockers:
unreadable-after-load targets leave ended strokes tab-only, and an extra copy
`kind` can be acknowledged saved but fail the reader. Ordinary conflict controls
pass. These controlled DOM/IDB results do not replace native browser acceptance.
[Artifact review](web-recovery-evidence-review.md) retains owner results and their
limitations, including export started versus actually downloaded.

One combined same-task correction `handoff_353977da7958c4d41b8c39fa086fe0e5`
was accepted through the existing Web route; `execution_started:false` is not a
start claim. Web owns the narrow fixes and decisive regressions. Lead holds the
base candidate, then integrates approved base plus repair and releases the exact
SHA to QA for the already assigned changed-path pass. Prior successful assertions
and independent QA failures are retained; no library/Simulator campaign is repeated.
