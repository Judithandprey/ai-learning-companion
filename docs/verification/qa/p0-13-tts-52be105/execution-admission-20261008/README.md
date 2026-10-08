# The allocated display diagnostic — 2026-10-08

**Stopped at native step 2, before the product was started.** The scoped launch admission passed. The runner then
refused because the window it took as the owned Edge window was a topmost Edge window ("owned Edge must remain visible
in the normal window band"). Capture, drag, circle and Stop were not reached. This is **not a product result**, and
not device or AI acceptance.

- **Allocation:** `lc-tts-admission-20261008-01` (`/tmp/lc-qa-tts-admission-display-allocation-20261008-01.json`,
  sha256 `b8df4c881c5cb9d1c6930f5d908853b9b503714abc0cb47db11ab40ccc20dfc7`). Issued by the lead in
  `handoff_8e274b900077536738e52f7472eedd28` for 17:20:03Z to 17:50:03Z: exclusive display only, one native attempt,
  140 s, no retry, no account, AI, microphone or audio.
- **Exact source:** `team/qa` `1aea6b2` (the released candidate, approved by Support `4cbb6b5`, integrated at main
  `e74cdfc`).
  - wrapper `84009e821d3495c153a1ff04e042f8027070c9dac0b8ac5e91cd239051dfd941`;
  - candidate `c083ad0eb5540632e9a2d5acf57bd5a09e5b5f82869fe05345c325ef263e34e6`;
  - runner `6728ec6cf8a5a2030059f8b31bddaa2b7d059f757730698ef38d5a2fad6c1c28`;
  - steps `c7b8f5ed…`;
  - production `52be105`, 77-file tree `531943a8…`, Electron 44.5.1.
  The allocation file, wrapper, candidate and runner hashes, and the absence of the output and scratch folders, were
  checked on the Linux side at 17:21:05Z.
- **Command, run once at 17:21:11.8Z (exit 1 at 17:21:45.8Z):** `node tests/e2e/windows/qa_run_tts_candidate.mjs
  --execute docs/verification/qa/p0-13-tts-52be105/execution-admission-20261008
  /tmp/lc-qa-tts-admission-display-allocation-20261008-01.json b8df4c88…`
- **DISPLAY RELEASE** was sent at about 17:22Z as `handoff_de51af8fcae9104bf6e9f40332df7787`.

## What happened

1. The wrapper passed its own gates in order: allocation; fresh static stage check; scratch absent; the wrapper's
   scoped admission of the `electron.exe` and `msedge.exe` looks; Edge present.
2. It created the new scratch and copied the three payloads. The runner's parser reported 0 errors. It then started
   the one native attempt with process-only `RemoteSigned` (`native_attempts` 1, launcher status 0, no timeout,
   empty stdout and stderr).
3. Runner, start-up: display admission accepted (one display, 2560×1600, work area 2560×1504, 192 dpi). The scoped
   launch admission found **0 relevant Electron processes and 0 port owners**. Four `electron.exe` processes were
   another owner's: the AgentsDock app 100568 and its three children. They were admitted, recorded by PID only, and
   never touched. `rechecked` was false.
4. Step 1 `edgeStart` succeeded: the generated surface in Edge with its new isolated profile, PID 14104.
5. **Step 2 `window edge raise` failed** before any raise. `Assert-QaNormalEdge` read the window returned by
   `Window-Handle 'edge'`:
   - handle 17504798, owner 14104, class `Chrome_WidgetWin_1`;
   - **topmost**, visible, not minimized, not in the foreground;
   - bounds [670, 88, 1888, 202] physical px, i.e. 1218 × 114 px, horizontally centred on the 2560 px display.

   It threw "owned Edge must remain visible in the normal window band". The runner stopped; every later step was not
   run.
6. Cleanup, from complete looks of both images:
   - Edge: the exact owned launch 14104 was asked to close (`signalled`) and ended: **confirmed**.
   - Electron: no process of this run existed (the product was never launched): **confirmed**.
   - Never signalled: the foreign Electron 100568 (children 102880, 102032, 107764), the foreign Edge 23092 and its
     children.

## Defect (QA harness, not product)

`Window-Handle 'edge'` returns the **first** visible top-level window, in z-order, that belongs to the Edge process or
its direct children (`QaWin.Find`, `EnumWindows`). A topmost window comes first. The window found here was small,
topmost and centred at the top of the screen, 1.2 s after Edge was started with `--start-fullscreen`. That is
consistent with an Edge popup such as its full-screen exit hint, not with the full-screen app window.
- **Not confirmed:** by design no title or screenshot is recorded, so which Edge window it was is inferred, not
  observed.
- **The guard was right:** that window was topmost. The selection of the window to check is what is wrong for a
  full-screen Edge.
- **Owner:** the `Assert-QaNormalEdge` / `Raise-QaEdgeNormal` path was added in QA's placement correction (`fc2fe34`)
  and was **first executed in this run**. The earlier 2026-10-03 run used the older raise and stopped later, at the
  corner check. The defect is QA's to correct; Web's product code is not implicated.

A correction would pick the owned Edge window by its identity, for example the largest visible, non-topmost top-level
window of the owned process or the one matching the app's surface, rather than the first in z-order. It would keep the
topmost refusal for the window it does select. Any such change needs review and a new allocation; this attempt is
consumed and is not retried.

## Files

| File | sha256 | What |
| --- | --- | --- |
| [run.json](run.json) | `3fcb00c50dc108042767a3d769b437362a53701a06b8ed4555f1c488f1b61c9a` | the wrapper's report, as written (includes the fresh stage identity) |
| [runner-results.json](runner-results.json) | `6255d97aca74378a5b472a3d786a4e9ff1ea3905cdb536df0fee40f475be08a1` | the runner's own results, copied by the wrapper |
| runner.stdout.bin, runner.stderr.bin | `e3b0c442…` (empty) | the launcher's output |

The files are kept byte for byte as the wrapper wrote them. They name this run's own `%TEMP%` stage and scratch paths,
as the committed candidate already does. They contain no path, command line or title of another owner's process.
The scratch folder `%TEMP%\lc-qa-tts-output-afad96151bad482f8f4883656cb58e5f` is kept as it is.

Real requests remain **0/4**; provider attempts 0. No account, microphone, audio or speech helper was accessed. None
of the 32 diagnostic steps after step 2 ran: capture, drag, circle, Stop and speech remain **NOT_RUN**.
