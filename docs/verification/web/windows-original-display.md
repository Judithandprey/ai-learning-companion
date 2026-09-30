# Windows original-display capture and overlay input: first runnable slice

- **Date:** 2026-09-30 UTC. **Owner:** web (05), now Windows and Safari.
- **Assignment:**
  - lead `handoff_4cfeabbc8eccaa4b3bd05432356d47a3` (user-approved desktop-first transition);
  - composition constraint `handoff_8d9490e69f35b575e753b552ef344b05`;
  - dependency note `handoff_ea38a7a8d5b7902c96a4b6f6b50358dd`. Read with `git show` at `5af680f`:
    `docs/verification/lead/capture-runtime-integration.md` (local capture runtime). No wire change is made
    here; the lead maps the emitted samples below.
- **Baseline read:** exact pushed `07e669154e6eae9944368c210c3f1f3d309aa258` (canonical requirement content `d2603fd`),
  read with `git show`:
  - `docs/tasks.md` Windows row: R02/R03/R08/R35/R36/R46/R51/R52/R59, A12/A14/A26/A27/A30/A31/A44;
  - P0-02 and P0-12.
  - The merge of main stays denied and was not retried.
- **Scope:**
  - `apps/windows/**` (new) and `docs/verification/web/**`.
  - Delegated: `apps/windows/package.json` and its lockfile, with Electron exact `44.5.1` and the existing
    TypeScript `7.0.2`.
  - No root, shared, contract or Safari-source edit. The reviewed web ink model `apps/safari-extension/src/ink.ts`
    and `mode.ts` are imported unchanged by relative path.
  - No provider, account, paid call, user-preview change or port 4173/8174 use.

## What a user can do

1. **Start.** Start the app, choose a display in **Display to share** (thumbnails come from Windows' own list of
   screens) and press **Start**. Nothing is captured before Start. Nothing is imported, and nothing is selected again
   later.
2. **Capture.** From then on the app captures that whole display continuously, with `getDisplayMedia`.
   - The main process grants one capture per session: the overlay arms it just before asking; the grant goes
     only to this app's overlay and only for the display chosen for the running session. Every other permission,
     and any second request, is refused.
   - The overlay checks that what it received is a whole monitor with no audio; otherwise it stops.
   - Start is refused on Windows builds before 19041 (Windows 10 2004). There, content protection would show the
     overlay black in the capture instead of leaving it out.
   - A sample is taken every second. The control window shows the sample number, time, source, frame size, the
     newest frame's age, the change from the previous sample, and the ink revision composed into it.
   - Each sample has an explicit state:
     - **new frame:** the system delivered a new frame;
     - **no new frame:** Windows delivered none, so a still display cannot be told from a stalled capture, and
       the app says so;
     - **gap:** the sampling ran more than a period late, so nothing is known in between;
     - **capture ended.**
   - The control window adds **stale** when no sample has arrived from the overlay for 3.5 s: nothing is known
     about the display since the last sample.
   - Counts and the last sample start afresh for each session.
3. **Overlay.** A transparent overlay covers the whole display, taskbar included. It is always on top and
   **excluded from capture** (content protection), so the captured frames show the user's apps and not this app.
4. **NAV** (✋, the default). Clicks, scrolling and touch go to the user's apps. Only the small toolbar takes the
   pointer while the pointer is over it.
5. **WRITE** (✎) takes pointer input over the whole display.
   - A **pen** writes.
   - A **mouse** writes only after **Mouse** is turned on. With it off, a mouse drag draws nothing and the hint
     says why.
   - **⌫** erases only what it passes over (partial erase splits a stroke and keeps the original in the
     history).
   - **↶ / ↷** undo and redo.
   - Writing never asks for help and never shows a card.
6. **Placement (▣).**
   - **Fixed on the screen** is the default: ink stays where it was written.
   - **Follow content** is offered and labelled honestly: *following content is not established here: ink stays
     where written*.
     - No anchor is claimed.
     - Such ink is drawn in its own colour and always **dashed**, and the hint counts it.
     - The choice is kept on each stroke (`display: 'content'`, `anchor: null`).
7. **Alignment.** Every stroke keeps a pixel fingerprint of what the captured display showed under it when it was
   written. On every new frame the fingerprint is compared with the same region again. The result has three
   states:
   - **verified:** the region is textured and still looks the same. The stroke is drawn solid.
   - **changed:** the pixels under it changed, for example because the user scrolled or switched apps.
   - **unknown:** no frame was available, or the region is too plain to tell (luminance spread below 4/255, such
     as a blank margin).
   - Changed and unknown strokes are drawn **dashed** and counted separately in the hint. Nothing is moved. This
     is a pixel-unchanged check, not a content anchor.
8. **ASK (?).** Circle a region: a card shows that region's **composed** pixels (the captured frame with the
   user's ink) and states the frame number, time, region and ink revision.
   - The selection is composed when the circle ends, from the frame held at that moment and the current ink, and
     it is labelled with exactly that frame and revision.
   - The card says: **No AI is connected: this selection was not sent anywhere.** No response is shown or made
     up.
   - Finishing the circle (the card appears), **Cancel**, Esc or pressing **?** again ends ASK and returns to the
     mode before it: WRITE when ASK was pressed while writing, NAV from NAV (the unchanged §7.2 reducer).
9. **Saving.** Every change is saved on this device at once:
   - to `%APPDATA%\Learning Companion\ink\<session>.json`, in the `lc-desktop-ink/v1` format;
   - validated first, and written atomically (a failed write removes its temporary file);
   - if saving fails, the hint says **Not saved** with the reason. The ink stays in the window and the next change
     and Stop try again. If it still cannot be saved at Stop, the control window says so.
   - **Stored ink that cannot be continued is left untouched:** a stored file this version cannot read, or a stored
     history that is not the start of the new one. The whole ink, with its history and evidence, is then saved as
     a **separate copy** under a new session id (`forked_from` the original), and later edits go there. The list
     marks it **(separate copy)**.
10. **Reopening.** **Saved ink** lists the sessions (the list refreshes at every save). **Open** (while
    capturing) shows the saved ink over the display being captured, with the same strokes and history, and further
    edits continue that history in the same file.
    - The overlay first saves its own changed ink. If that ink cannot be saved, Open is refused and the ink stays.
    - A new session in which nothing was written saves nothing.
11. **Stop.** The session ends on any of:
    - **Stop**;
    - the display being removed, or its bounds, rotation or scale changing;
    - the capture ending (for example, permission withdrawn);
    - the overlay failing or stopping responding;
    - closing the overlay or the app (for example Alt+F4).

    When it ends:
    - the stream is stopped at once;
    - a sample in progress is dropped, and the last sample is marked ended;
    - the newest ink is saved, and the overlay closes (at most 5 s later). Closing the overlay or the app takes the
      same path; the app quits after the session has ended;
    - the control window says why.
    - A session started right after Stop is never ended by the earlier Stop.
12. **No shortcuts.** This app's windows have no menu, so there are no reload, zoom, close or DevTools shortcuts.

The control window and the overlay both state: **No AI is connected: captured frames and ink stay on this device,
and nothing is sent anywhere.**

## Layers kept apart

| Layer | Where it lives | What it is |
| --- | --- | --- |
| Raw capture | overlay memory only (`ImageBitmap`); per sample only facts and a hash | the display exactly as Windows delivered it; the overlay is not in it |
| Editable original ink | `lc-desktop-ink/v1` file; overlay canvas | the user's strokes and full operation history (add, erase, undo, redo); never merged into pixels |
| Composed frame | overlay memory; per sample its facts and hash | raw frame + this app's ink drawn at the display geometry, pinned to the ink revision; a labelled transformation |
| AI layer | none yet | nothing is connected; no response exists and none is shown |

- **No frame:** a sample without a raw frame has no composed frame either. Nothing is ever composed from the
  canvas alone.
- **WRITE changes the composed context:** normal WRITE, erase, undo and redo change the composed frame at the next
  sample, without ASK and without any explanation.

## Exact sample fields for lead mapping (local producer facts, not a wire contract)

`apps/windows/src/shared/samples.ts`, `DisplaySample`, sent from the overlay to the main process once a second (the
main process keeps the last 300):

| Field | Meaning |
| --- | --- |
| `seq` | sample number in this session, from 1 |
| `sampled_at` | ISO time the sample was taken |
| `monotonic_ms` | `performance.now()` of the overlay at the sample, rounded |
| `state` | `fresh` \| `no_new_frame` \| `gap` \| `ended` (see above) |
| `gap_ms` | how late the period ran, for `gap`; otherwise `null` |
| `source.kind` | `'display'` |
| `source.display_id` | Electron display id of the chosen display |
| `source.source_id` | desktop capturer source id (`screen:…`) |
| `source.label` | the source name Windows gives (for example `整个屏幕`) |
| `source.bounds` | display bounds in DIP `{x, y, width, height}` |
| `source.scale_factor` | display scale factor |
| `raw` | `null` when there is no frame (before the first frame, or ended) |
| `raw.width` / `raw.height` | frame size in pixels as delivered |
| `raw.presented_frames` | frames presented on this stream so far (`requestVideoFrameCallback`) |
| `raw.frame_age_ms` | milliseconds since the newest presented frame |
| `raw.taken_at` | when this app took the frame now held (the same frame is kept while no new one arrives) |
| `raw.pixels_sha256` | SHA-256 of the frame's RGBA pixels (width × height × 4, rows top to bottom) as read back |
| `raw.change` | mean absolute luminance change against the previous sample's frame on a 64×40 grid, 0..1; `null` first |
| `composed` | `null` when `raw` is `null`; frame and ink are taken together before anything is awaited |
| `composed.ink_session` | the ink document (session) id, 16 hex |
| `composed.ink_revision` | ink revision composed into this frame (history length) |
| `composed.visible_strokes` | visible strokes composed |
| `composed.transformation` | plain statement of the composition (frame size, ink revision, strokes, px per DIP, overlay excluded so ink added once) |
| `composed.pixels_sha256` | SHA-256 of the composed RGBA pixels; equal to `raw.pixels_sha256` when no ink is visible |

- **Not included in this slice:**
  - the pixels themselves (they stay in memory);
  - ReplayKit-specific 0.2.5 metadata;
  - any wire field.
- **Mapping into a released contract** is the lead's decision. A missing or unknown frame stays a gap.

**An actual emitted sample** (final self-test run, primary display; `evidence/windows-selftest.json` →
`sample_example`):

```json
{
  "seq": 7, "sampled_at": "2026-09-30T09:55:32.082Z", "monotonic_ms": 6883, "state": "fresh", "gap_ms": null,
  "source": { "kind": "display", "display_id": "3071609112", "source_id": "screen:0:0", "label": "整个屏幕",
              "bounds": { "x": 0, "y": 0, "width": 1280, "height": 800 }, "scale_factor": 2 },
  "raw": { "width": 2560, "height": 1600, "presented_frames": 47, "frame_age_ms": 51,
           "taken_at": "2026-09-30T09:55:32.041Z",
           "pixels_sha256": "7f0149339b9c9052fcf48a1e533f2fe5ea2138e2f8bc7513f91eda2147ba38d4",
           "change": 0.0001685049019607843 },
  "composed": { "ink_session": "67334bbe635e52b8", "ink_revision": 2, "visible_strokes": 2,
                "transformation": "raw frame 2560×1600 px with this app's editable ink (revision 2, 2 visible stroke(s)) drawn over it at 2.000 px per DIP; the overlay itself is excluded from capture, so the ink is added once",
                "pixels_sha256": "0dc35247b0ea2af85e88ba6def6aa651bd6d5c0da4edc8bb2218d99293a101f5" }
}
```

The editable ink format (`apps/windows/src/shared/desktop-ink.ts`) is:
- `lc-desktop-ink/v1`: `{format, id, created_at, forked_from, display, ink, evidence}`;
- `forked_from` is `null`, or the session id a separate copy was made from;
- `ink` is the unchanged web `InkDocument`, with page `{origin: 'desktop', address_sha256: SHA-256(session id)}`
  and every stroke's `anchor: null` (hidden strokes included);
- `evidence[stroke id]` is `{frame_seq, frame_sampled_at, region (DIP), fingerprint}` or `null` when no frame was
  available.

## Checks and actual results

| Label | Command / evidence | Result |
| --- | --- | --- |
| Source | `apps/windows` TypeScript 7.0.2, `tsc -p apps/windows/tsconfig.json` | passes |
| Unit tests | `cd apps/windows && npm test` (`tests/shared.test.ts`) | 7/7 pass |
| Runtime, author self-test on actual Windows | `cd apps/windows && node scripts/self-test.mjs` → `evidence/windows-selftest.json`, `windows-selftest-overlay.png`, `windows-selftest-control.png` | see below |
| Provider | none connected | not applicable; nothing is sent |
| Independent acceptance | QA P0-13 on this exact SHA | **not run** |

**Author self-test run:**
- **Environment:** Windows 10.0.26200; one display 1280×800 DIP at scale 2 (frames 2560×1600); Electron 44.5.1 /
  Chrome 152.0.7977.130, the official win32-x64 runtime.
- **How it drives the app:**
  - It runs the real app process with `LC_SELFTEST` and an isolated temporary user-data folder, which is removed
    afterwards.
  - Input is window-scoped DevTools input (`Input.dispatchMouseEvent`, including `pointerType: 'pen'`), so the
    user's cursor never moves.
  - A small probe window, a 10 px checker of two known greens with a changing counter, gives the display known,
    textured, changing content.
  - Screenshots are of this app's own windows only. The chooser's display thumbnails, which show the user's
    screen, are removed (and a frame is painted) before the control screenshot. The report keeps no pixels.

| Check | What was observed |
| --- | --- |
| `session.start` | Start on the chosen display opens the overlay and the capture |
| `overlay.covers_display` | overlay bounds equal the display bounds (0,0,1280,800), after resizing a window Windows had fitted to the work area (752 high) |
| `capture.frames` | frames 2560×1600 = display × scale |
| `capture.changing` | fresh frames with different pixel hashes between samples (5 distinct in 5), with no further selection |
| `nav.click_through` | NAV: the overlay ignores mouse input (OS click-through) and is not interactive |
| `write.mode` | WRITE: the overlay takes input |
| `write.mouse_off_by_default` | a mouse drag with Mouse off draws nothing and says why |
| `write.mouse_and_pen` | mouse (after turning it on) and pen strokes are ink, saved |
| `capture.overlay_excluded_ink_once` | raw pixel under the pen stroke = the probe's green (65,161,71 for its #00a040 square), not the overlay; composed pixel there = ink purple (110,63,209); beside the ink, raw = composed |
| `capture.composed_pinned` | last composed record pinned to the current ink revision, hash ≠ raw; every sample with no visible ink has composed hash = raw hash |
| `write.partial_erase` | eraser across one stroke: history `erase`, two pieces, original kept |
| `write.undo_redo` | undo restores the whole stroke, redo erases again |
| `write.content_placement_labelled` | "following content is not established here: ink stays where written"; the stroke is dashed and counted |
| `ask.finish_returns_write` | the card shows the composed crop and "No AI is connected"; mode back to WRITE |
| `ask.cancel_returns_write` | Cancel in ASK returns to WRITE |
| `write.continue_after_ask` | writing continues, every change saved |
| `save.on_disk` | the file holds the same history; the list shows 5 strokes |
| `stop.ends` | Stop: session gone, overlay destroyed (103 ms) |
| `stop.restart_at_once` | Start as soon as the overlay closed; the session is still alive 5.6 s after the earlier Stop |
| `reopen.same_ink` | after a new Start, Open shows the same strokes and history; all 5 verified over the unchanged textured probe |
| `reopen.continue_editing` | undo continues the reopened history, saved to the same file |
| `save.unreadable_kept_copy` | the stored file is damaged on purpose; the next change leaves it byte-for-byte untouched and saves the whole history as a copy (`forked_from` the original); the list shows the copy and 1 unreadable file; the unchanged second session saved nothing of its own |
| `alignment.pixels_changed` | with the probe under the ink gone, all 5 strokes are `changed` (dashed); nothing moved |
| `stop.overlay_close_saves` | an undo, then the overlay window is closed at once: the session ends as "the overlay window was closed" (97 ms) and the file's last operation is that undo |

**Result:** 24/24 author checks passed. This is author evidence only, not independent QA and not device or course
acceptance.

- **Content protection, measured:**
  - On this Windows build, `setContentProtection(true)` removes the overlay from the `getDisplayMedia` capture while
    the pixels under it remain in the frame: the raw frame under a stroke shows the probe, and the stroke appears
    once, only in the composed frame. This is observed, not inferred from the API call.
  - Other Windows versions, GPUs and drivers are not measured.
- **Colour:** the captured video path shifts colour slightly (#00c853 read back as 90,197,97, #00a040 as 65,161,71).
  Pixel hashes and fingerprints are of the pixels as this app reads them back, not of the display's exact output
  bytes.
- **Review:** an ultracode review workflow (3 reviewers + adversarial verification) found 22 real or plausible
  defects in the first version, and 2 more claims were rejected. All are fixed in this commit: stale Stop bound,
  failed save chain, sample and ASK pin races, live sample after end, stale state, geometry change, conflict
  copies, Open coordination, three-state alignment, pen eraser, hidden anchors, one-shot capture, menu shortcuts,
  old Windows builds, quoting and screenshot privacy.
- **Re-review:** a focused re-review of those fixes confirmed them and found six more, all fixed here:
  - (medium) closing the app or the overlay now ends the session the normal way, so the newest ink is saved or
    reported;
  - a cancelled ASK shows no card;
  - an overlay crash during Stop is reported;
  - no live sample is accepted after the end, and Stop waits for the ended sample;
  - a capture grant not used through the display-media handler ends the session within 3 s;
  - curly apostrophes are escaped in PowerShell strings;
  - the paint wait before the screenshot has a timeout.

## Build contract and provenance

| Item | Value |
| --- | --- |
| Package | `apps/windows/package.json`: `@learning-companion/windows` 0.1.0, private, `type: module`, `productName: Learning Companion`, `main: dist/apps/windows/src/main/main.js` |
| Dependencies | devDependencies only: `electron` exact `44.5.1`, `typescript` exact `7.0.2` (the existing version); `@types/node` comes through Electron |
| Lockfile | `apps/windows/package-lock.json`, lockfileVersion 3, created with `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund --ignore-scripts` |
| Build | `npm run build` = `tsc -p tsconfig.json` (type stripping and `.ts` → `.js` import rewriting; rootDir `../..`, outDir `dist`) + `node scripts/copy-static.mjs` (HTML, CSS, `.cjs` preloads) |
| Build inputs | `apps/windows/src/**`, `apps/windows/tests/**`, and the reviewed web ink model reused unchanged: `apps/safari-extension/src/ink.ts` (blob `a42551fa8e2a9a33d6aa0b03049a05c75e10a46e`, last changed in `78f3ba8`) and `apps/safari-extension/src/mode.ts` (blob `487b0345b4214cfbfc630d49bcd1eff8555081b2`, last changed in `127bd4c`) |
| Outputs | `dist/apps/windows/src/{main,preload,renderer,shared}/…`, `dist/apps/windows/tests/…`, `dist/apps/safari-extension/src/{ink,mode}.js` |
| Resources | served only from `dist/` over `app://bundle/…`: `renderer/{control,overlay,probe}.{html,css,js}`; preloads `preload/{control,overlay}.cjs` (sandboxed CommonJS) |
| Tests | `npm test` = `node --test tests/*.test.ts` (Node 24 type stripping) |
| Runtime | the official Electron 44.5.1 win32-x64 zip through Electron's own `@electron/get` (checksummed); no signing and no installer |
| Ignored | `node_modules/` and `dist/` (root `.gitignore`); nothing generated is committed |

## Launch steps

- **On Windows with Node.js 24:**
  `cd apps\windows`, then `npm install` (downloads Electron 44.5.1), `npm run build` and `npm start`.
- **From WSL2 on the Windows host:**
  - `cd apps/windows`, then `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --ignore-scripts` once.
  - `node scripts/launch.mjs` builds the app, stages it in `%TEMP%\lc-windows-app` and starts it with the official
    Windows runtime, staged in `%TEMP%` from Electron's checksummed download.
  - `node scripts/self-test.mjs` runs the author self-test above (about 25 seconds; this app's windows appear
    briefly).

## Gaps and limits (exact)

- **Real navigation and real pen hardware:**
  - The self-test changes the display with its own probe window and uses DevTools pen and mouse events. It has not
    observed a user navigating real apps, a physical pen digitizer or real touch.
  - Pen pressure is recorded as reported, not verified with hardware.
- **Real permission loss, display unplug and geometry change:** handled in code; only Stop and session restart
  were exercised. An overlay crash or hang is handled, not exercised.
- **Pen and touch routing:**
  - Windows click-through is per window. In WRITE the overlay takes all pointer input: pen, mouse and touch. It
    cannot pass a finger or mouse click to the app below while a pen writes; the user switches to NAV for that.
  - In NAV, everything passes through, and a pen does not write.
  - Selective pen-only capture with finger pass-through is **not established**.
- **Following content:** not established on the desktop. Such ink stays where written, is always dashed and says
  so. Alignment is only a three-state pixel-unchanged check. A textured region that happens to look the same after
  moving could read as verified.
- **Pen eraser end:** mapped from the Pointer Events eraser button (`button` 5 / `buttons & 32`). Not tested with
  hardware.
- **Saving failures:** a disk that keeps refusing writes loses the unsaved newest ink when the session ends. This is
  said in the control window, and no copy exists anywhere else.
- **One display at a time:** the chosen display only. Multiple displays are listed but only one is captured.
  Hot-plugging other displays is not tested; removing the captured display ends the session (handled, not
  observed).
- **Other Windows sessions:** permission withdrawal from Windows, secure desktop (UAC), protected content (DRM video
  appears black in captures) and lock-screen behaviour were not observed.
- **AI:** no AI or provider is connected. The ASK card shows the selection only. There is no audio.
- **Packaging:** unsigned development runtime only. There is no installer, no auto-start and no code signing. Support
  owns desktop CI packaging.
- **Wire and contract:** no wire integration. Samples and ink are local producer facts for the lead to map.
- **macOS:** belongs to the native owner (`apps/macos/**`), not covered here.
- **Independent acceptance:** QA P0-13 on the exact candidate SHA is still required. A44 (original-screen annotation
  with the AI seeing the ink), A26/A27 and both §7.1 gates remain **open**: no AI is connected.
