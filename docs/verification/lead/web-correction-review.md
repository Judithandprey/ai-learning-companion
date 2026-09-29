# Web correction review — 30ff273 and c88b5f2

Current result: **scoped APPROVE** after the final c88b5f2 follow-up below. Earlier HOLD findings are retained as historical review evidence.

**HOLD for one remaining INK-R1 variant: visible screen-fixed ink keeps its previous verified state when its original source changes off-screen.** The four original exact ink/storage reproductions now pass. The QA-EXT-01/02 correction passes the controlled actual-watcher/capture-flow probes below; real browser integration acceptance remains QA's next single pass after the remaining correction.

## Exact variant and scope

- Candidate: isolated archive of main `696562ab10ea6db0e036f18d927aae6b16c65f21` plus the entire binary-aware delta `git diff --binary c6e6cfc 30ff273`. `git apply --check` and application both succeeded. No unrelated branch history was copied.
- Archive: `/tmp/web-correction-review-9gao6v8o`; patch: `candidate.patch` inside that directory.
- Reviewed correction delta `366a994..30ff273`, plus actual callers in page/session/input routing, anchors, history parser, save/load queue and background transaction. Read lead original defect reports and QA's original-page component report.
- Applied workflow/PONYTAIL LITE. Refreshed AGENTS/TEAM/lead role/directory, current decisions, original/English §7.1–7.2 and Q-INK-DISPLAY, relevant original-goal/source retention and audio-screen boundaries. All 8 current source/English manifest hashes matched.
- No production file, Git index/commit/ref, worker worktree, peer route, service, browser, provider, database, user preview (4173/8174/export/`lc_desktop_preview`) or Paperclip was changed or started. Generated bundle verification used `--check` only in the isolated archive.

## Remaining blocker — INK-R1 off-screen source change (medium)

Location in the reviewed candidate: `apps/safari-extension/src/ink-layer.ts:315–326,350–356`.

`matches(anchor)` deliberately returns `null` when the original source rectangle is entirely outside the viewport (line 321). The correction now visits screen-fixed strokes, but line 356 updates alignment only for `false` or `true`. A previous `true` survives `null`, including after a source mutation was observed. The screen-fixed stroke remains physically visible and solid while its source cannot be verified.

Concrete actual-module reproduction:

1. Use an 800×600 controlled page with paragraph A at document rectangle `(0,0,800,100)`.
2. Write one content stroke and one screen-fixed stroke from `(100,50)` to `(150,50)`; both initially have `uncertain:false`.
3. Scroll the source paragraph off-screen: window `scrollY=200`, element viewport top `-200`. Screen-fixed ink remains at its original visible screen coordinates.
4. Replace A with B at the same address; deliver its `MutationObserver` notification and wait 290 ms, beyond the 250 ms recheck.
5. Actual: screen-fixed `uncertain:false`. The hint reports only memory-only storage, with no dashed/unverified-source notice. This is not a claim that screen-fixed placement should move with the page; placement remains fixed while source verification should become unknown.

Probe: `/tmp/web-correction-review-9gao6v8o/screen-offscreen-probe.mjs`. It imports the actual `createInkLayer`, uses a minimal controlled DOM double, and asserts the observed defect. It does not simulate a real browser. Stable visible-scroll behavior is separately covered by the correction's layer test. The original reproduction with a visible source replacement correctly becomes uncertain for both displays.

Minimum next action (Web): invalidate or explicitly mark screen-fixed source association unknown when the source cannot currently be verified, while retaining its fixed screen coordinates, original source/points, and the valid visible unchanged-source control. Add this exact off-screen replacement regression; no new anchoring framework or storage format is requested. Lead then checks the correction and integrates; QA performs the planned single integrated capture+ink behavior pass.

## Corrected original findings and focused evidence

All commands below ran with existing pinned Node, no dependency install:

```sh
cd /tmp/web-correction-review-9gao6v8o
NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
"$NODE" --test apps/safari-extension/tests/ink.test.ts apps/safari-extension/tests/ink-layer.test.ts apps/safari-extension/tests/background-ink.test.ts apps/safari-extension/tests/input-policy.test.ts apps/safari-extension/tests/extension-entry.test.ts
"$NODE" --test --test-reporter=tap apps/safari-extension/tests/session.test.ts
"$NODE" apps/safari-extension/tests/ink.test.ts
"$NODE" apps/safari-extension/scripts/build-webextension.mjs --check
"$NODE" alignment-probe.mjs
"$NODE" history-probe.mjs
"$NODE" storage-probe.mjs
"$NODE" alignment-controls.mjs
"$NODE" capture-probe.mjs
"$NODE" screen-offscreen-probe.mjs
```

Results:

- Six selected test-file groups exited 0 (five grouped files and session separately). The grouped reporter exposed file-level results, not a 151-test independent claim. Direct ink test output additionally exposed 9/9 passing subtests. ASK completion's prior WRITE restoration and cancellation/session fences remain covered, as do explicit mouse writing and finger/NAV routing.
- `build-webextension.mjs --check`: actual generated `content.js`, new `ink-format.js`, and all three icons exactly current.
- `alignment-probe.mjs`: original INK-R1 visible same-address replacement marks both placements uncertain; original INK-R2 held-stroke source replacement remains uncertain after release. Adaptation changed the old failing assertions to corrected expectations; actual module logic was not patched.
- `history-probe.mjs`: original INK-R3 result is now `before:[black,purple]`, `afterUndo:[black,purple]`, `originals:true`. Actual parser accepts it. Unit cases also cover erase descendant ordering, redo/reopen, and reject a wrong persisted drawing order.
- `storage-probe.mjs`: 9 existing control groups passed; all 4 original WS1 bad-state cases now refuse the write and preserve stored data. The only runtime adaptation beyond root path was providing VM `importScripts` to execute the actual shipped `ink-format.js`; the assertions now verify refusal/preservation. Sender/top-frame/origin boundaries, changed-stroke/history/shorter-history conflicts, commit failure, valid append, detached read, same-origin fingerprint trust boundary, restart load ordering and post-rejection queue recovery remain intact. This used the same deterministic in-memory IndexedDB adapter, not native IndexedDB.
- `alignment-controls.mjs`: 5 controlled groups pass: unchanged paragraph stays aligned; changed media position marks content and screen ink uncertain; an opaque-source change marks both uncertain; held gestures on changed media/opaque content remain uncertain on release. Original points/source storage remains immutable.
- `capture-probe.mjs`: **14 controlled groups pass against the actual extracted `watchRegion`, `capture`, `captureWatched` source plus real `sameView`/`regionChange`/geometry/lifecycle helpers.** No replacement watcher was tested. It exercises stable capture; page scroll ABA even when the event arrives after return; inner-container scroll ABA; unrelated-container positive control; window resize ABA; visual viewport scroll/zoom ABA; same-element style movement; style/layout ABA seen by mutation callback; layout-only ABA seen by animation frame; another top element at the same rectangle; decode-time layout ABA; unnotified decode-time movement detected at final check; decode-time scroll ABA. All changed cases reach `received` with geometry unknown, crop null and canvas hidden. Stable/unrelated controls retain a known crop. Observer/listener/animation-frame cleanup is asserted after every case. Image bytes/decode and browser scheduling were controlled, so these are flow proofs, not real capture-pixel/browser evidence.
- `screen-offscreen-probe.mjs`: exits 0 while asserting the remaining observed failure described above; a passing probe exit here means the defect was reproduced, not acceptance.

## Limits and interpretation

The fix reuses the existing ink reader in the background through the locally generated classic `ink-format.js`; no competing schema/dependency or migration was added. Stored unreadable documents are preserved, history-prefix/original-stroke conflict checks remain, and save success still requires transaction commit. Exact-address hashes remain a trusted content-script boundary within one origin, not an authenticated URL-level background authorization scheme.

Native Safari worker `importScripts` loading is **unverified**. The VM adapter and matching generated bundle prove code/package consistency only. No browser recovery campaign, Simulator campaign, real Safari/iPad/Pencil, real IndexedDB concurrency, AI/provider receipt, whole-display continuous observation, cross-app overlay or Notability import was run or accepted. The owner's reported 151 units and 25 extension/23 ink browser cases remain owner evidence, not this review's independent evidence. Sampling supports the listed capture cases, not complete history for arbitrary opaque/cross-origin content or universal pixel stability.

One incidental `git diff` was initially run from the archive (which intentionally has no `.git`) and failed read-only; it was rerun against the source repository successfully. No Git mutation resulted.

## Final follow-up — c88b5f2: scoped APPROVE

**This final result supersedes the HOLD above. Remaining INK-R1 off-screen variant is closed; no blocker remains in the assigned correction scope.** Lead may integrate the reviewed Web delta and arrange the planned one actual integrated QA capture+ink flow.

The existing isolated candidate `/tmp/web-correction-review-9gao6v8o` now additionally contains **only** the full binary delta `30ff273..c88b5f2`, applied after a successful `git apply --check`. Every one of the 11 final-correction files matches the exact candidate bytes. No main/worker files, Git refs or services were changed.

The correction stores a live DOM element reference per alignment key and checks the same element's connectedness, geometry and original fingerprint even when it is off-screen. Removed/unverifiable source elements no longer preserve a prior verified flag. These references stay in page memory/the same-page unsaved hold map; they are not serialized into the immutable ink document. Original source anchors, points and edit history remain unchanged. Existing ASK routing, input policy, capture watcher, model/parser, background transaction and generated ink reader are byte-unchanged by this final correction.

Focused commands actually run:

```sh
NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
cd /tmp/web-correction-review-9gao6v8o
"$NODE" apps/safari-extension/tests/ink-layer.test.ts
# 7/7 named tests passed
"$NODE" screen-offscreen-probe.mjs
# exact remaining reproduction: both placements now uncertain:true; dashed warning present
"$NODE" final-anchor-probe.mjs
# 6 independent controlled groups passed
"$NODE" apps/safari-extension/scripts/build-webextension.mjs --check
# content.js, ink-format.js and all 3 icons current
```

The prior minimal DOM double now supplies native Element's `isConnected=true` for attached elements. Removal explicitly sets it false and removes the element from `elementsFromPoint` results. This faithfully supplies the new native predicate instead of treating an absent fake property as browser behavior; it does not alter production logic.

`final-anchor-probe.mjs` imports actual `createInkLayer` and separately tests visible unchanged, off-screen unchanged, visible mutation, off-screen mutation, visible removal and off-screen removal. Both stable controls retain `uncertain:false`; all four mutation/removal cases yield `uncertain:true`. Each case includes Stop/restart with the same actual controlled document and hold map, exercises actual drawing, and checks the entire original ink document after the recheck. Screen-fixed geometry remains `[[100,50],[150,50]]`, originals/anchors/history remain byte-equivalent, and the actual drawing switches to `[6,5]` dash only in the negative cases. The focused layer tests additionally retain the held-gesture and opaque-source behavior checks.

No earlier broad file groups, persistence/capture campaign, browser, service, database, provider or simulator run was repeated. The earlier original-four closure and 14 watcher/capture groups remain evidence for their unchanged paths, not newly rerun counts. Native Safari `importScripts`, actual Safari/Pencil and the broader product/device gates remain unverified as stated above. Owner's updated full-suite/browser counts remain owner evidence. Next: lead integration/checks, then the one planned independent actual QA flow.
