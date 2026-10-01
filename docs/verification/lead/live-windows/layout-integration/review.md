# Windows layout 28f0504 — bounded source review

**APPROVE this layout slice**, with one nonblocking P3 preference-backup observation. No blocker was found in the changed trusted-main/preload/renderer boundaries. This is not native speech, whole-screen live AI, device or complete-product acceptance.

Candidate: `28f050437b02f92feee8f53749b44a93306c9524`.
Parent: `3023c41ffb1b0eeb0ff599cf4f952c4b16969c43`.
Integration baseline: `44a576c64354c57a83f84ddaa6e097e555c512e3`.
Read all 13 changed paths and their relevant call paths from Git/export `/tmp/windows-layout-28f0504`; no owner WIP read. Applied project PONYTAIL LITE and current workflow/ADR0004 and affected source/English display, pen, caption, Talk, permission, stopping and retention requirements.

## Integration and source findings

- The candidate parent and assigned main have the identical `apps/windows` tree `29dc80ff9eb9bac48c639f80f33b1062e01e3292`. Integrate the single leaf, not its divergent owner branch. All changed files are under `apps/windows`; main's implemented Python live connector/contracts are untouched.
- Main owns the fixed preferences path and current display identity. `main.ts:1313–1334` validates active-overlay sender, exact surface/fraction shape and allowed rate before writing; preload exposes narrow operations rather than arbitrary filesystem/IPC access. Unknown-format JSON is left untouched; write failure retains this run's position and reports lack of persistence.
- Toolbar/card drag and keyboard movement remain separate from ink/selection. Pointer cancellation, loss of capture, Stop and NAV pass-through are covered through actual main/renderer source under explicit fakes. A work-area-only change relocates surfaces; display geometry/scale changes retain the existing session-ending path (`main.ts:1570–1576`). Source, frame and editable ink storage paths are not replaced.
- Talk is off by default. Committed production preload exposes no `lcVoice`, so this slice cannot produce sound and explicitly says no voice is connected. The stand-in seam tests piece ordering, generation fences, interruption, rate changes and source text preservation. `askSpoken` checks current selection/request and prior shown state; its stored status is a renderer report, not independent proof of audible output. The pending trusted-main native TTS/live integration must supply its own current-permission/native output evidence. Its absence is not a blocker for this layout slice.
- Existing Stop, close and connector-end retention paths are preserved. The new end-capture calls release a dragged handle and interrupt the dormant speech seam without changing original ink/capture shutdown responsibilities.

### P3 — a second malformed preference file replaces the first unreadable backup

At `apps/windows/src/main/main.ts:1278–1282`, malformed JSON is renamed to the fixed `overlay-preferences.json.unreadable` filename. If that name already exists, the second recovery replaces it, contrary to the adjacent “never deleted” comment and the new test's single-recovery wording. This affects only historical toolbar/caption/rate preference diagnostics, not source frames, handwriting or learning history; it is nonblocking for this slice.

Exact-source Linux reproduction: pre-create `.unreadable` with `first torn preferences`, write `second torn preferences` to the primary path, then run candidate main via its fake-Electron harness. The primary disappears and `.unreadable` contains the second string. No real Electron/Windows operation occurred. Minimal follow-up: keep a unique backup name, or leave the primary untouched if the backup name is occupied; add a second-corruption control. Do not rewrite retained evidence.

Probe: `/tmp/windows-layout-preference-probe.mjs`; actual output: `/tmp/windows-layout-preference-probe.json`.

## Performed checks

1. `git diff --check 28f0504^ 28f0504` — exit 0.
2. In `/tmp/windows-layout-28f0504/apps/windows`:

   ```sh
   /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap tests/placement.test.ts tests/overlay-surfaces.test.ts
   ```

   **17 pass, 0 fail, 0 skipped**, 854.616614 ms. Actual main and renderer source under fake Electron/DOM/capture/connector/voice; no native sound or GUI. Full output `/tmp/windows-layout-28f0504-focused.tap`.
3. Ran the one preference recovery probe with the same pinned Node — exit 0, observed the P3 above. This is a reproduction of the limitation, not a preservation pass.
4. Reused the authorized external `offscreen-controls/review-28f0504.md` and `run-05/result.json`; no rendering campaign was repeated. Recomputed **15 PASS / 0 FAIL** from actual stored checks, matching summary. Stored renderer errors and network requests are empty; `wip:false`. Compared all **10** source manifest entries against candidate Git blobs and saved source bytes, their after hashes, and all **10** emitted file hashes; every comparison passed. Embedded run manifest equals the saved build manifest. The manifest explicitly describes type erasure/import rewrite, not a product typecheck.

The external evidence reports hidden Electron 44.5.1 / Chromium 152 rendering, synthetic canvas/media, fake IPC and inert voice, with safety preload and no visible window. Its measured toolbar and answer-visibility repairs, dragging and 440×320 resize/restore support the bounded layout result. Product main/preload were not loaded in that external fixture. Its screenshots/visual findings were reused from the supplied independent review rather than independently recaptured. Some fixture controls required scrolling inside the card; this is not an assertion that every control is simultaneously visible.

Machine audit: `/tmp/windows-layout-28f0504-review.json` contains exact source/emitted hashes, source tree identities, recomputed counts and probe result. Native device/audio/model/cross-app acceptance was not run. No main/owner/candidate file edits, dependency installs, account actions or team messages were performed.
