# Windows toolbar and caption integration

Exact owner `28f050437b02f92feee8f53749b44a93306c9524` is reviewed and integrated
as main `073c96d`. Its parent `3023c41` has the same Windows tree as the prior
main baseline, and `git diff 28f0504 -- apps/windows` is empty after integration.
The separate reviewed Backend live transport is preserved. Owner WIP in
main/preload/renderer/TTS remains outside this committed layout slice.

## Actual source and checks

[Independent review](review.md), [machine audit](review.json): all 13 changed
paths and relevant call sites read; 17 changed placement/surface tests pass.
Existing operator hidden-Chromium run-05 15/15 is reused, with all ten source and
ten emitted hashes matched. No second offscreen campaign, GUI, account or audio
operation was run. The earlier answer-outside-card and narrow-toolbar findings
are closed for this demonstrated rendering scope.

Resulting-main focused verification at `073c96d`:

```sh
.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap \
  apps/windows/tests/placement.test.ts \
  apps/windows/tests/overlay-surfaces.test.ts \
  apps/windows/tests/overlay-capture.test.ts \
  apps/windows/tests/overlay-frames.test.ts \
  apps/windows/tests/overlay-stop.test.ts
```

**30 passed, 0 failed, 0 skipped in 1,080.465 ms**, exit 0;
[actual output](main-checks.txt). Initial default-isolation output reported only
[five passing file wrappers](main-file-wrapper-checks.txt); it is not counted as
another 30 cases. The corrected command makes the actual case results explicit.

Windows TypeScript build (`node node_modules/typescript/bin/tsc -p
apps/windows/tsconfig.json` from the repository) and static-copy script from
`apps/windows` both complete, exit 0. The actual command used the pinned Node and
TypeScript absolute paths from that app directory. An initial relative Node path
in the wrong working directory failed before compilation; corrected paths were
used without source changes. Eight preload/HTML/CSS files were copied. No Windows
stage was created/replaced, no dependency was installed, and no user app launched.
`git diff --check` passes.

Movable toolbar/card handles and keyboard movement, restorable per-display
placement, silent-by-default Talk controls, visible response scrolling and dormant
speech lifecycle are now in main. Native TTS itself and the full-screen live
consumer are still the owner's current work; this source has no audible output.
Synthetic `askSpoken` metadata is not independent proof of actual playback.

## One nonblocking preservation correction

P3: a second malformed preferences file replaces the fixed `.unreadable` backup.
[Exact-source probe](preference-probe.mjs) and [observed result](preference-probe.json)
show this in actual main source with fake Electron on Linux. Only prior toolbar,
caption and speech-rate preferences are affected; source images, user ink and
learning originals are separate and unchanged. Web should keep a unique backup or
leave the new malformed file untouched when the backup is occupied, with one
second-corruption control, within the current task. No separate campaign is needed.

Next owner remains Web: finish trusted-main native-TTS/current-output guards and
released full-screen/auto-focus/credits client, then deliver one exact distinct
versioned package with a reversible launch path. QA's existing focused pass then
tests that integrated candidate with a lead-coordinated account/display/audio
lease. The user has already exited the old app; preserve its profile and auth.
Support's existing audio probe preparation remains offline until separately
coordinated. Real input/output audio, GUI-to-provider continuity and Mac runtime
remain unaccepted; no complete-product claim follows from this layout build.
