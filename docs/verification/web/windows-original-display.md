# Windows original-display capture and overlay input: first runnable slice

- **Date:** 2026-09-30 UTC. **Owner:** web (05), now Windows and Safari.
- **Assignment:**
  - lead `handoff_4cfeabbc8eccaa4b3bd05432356d47a3` (user-approved desktop-first transition);
  - composition constraint `handoff_8d9490e69f35b575e753b552ef344b05`;
  - dependency note `handoff_ea38a7a8d5b7902c96a4b6f6b50358dd`. Read with `git show` at `5af680f`:
    `docs/verification/lead/capture-runtime-integration.md` (local capture runtime). No wire change is made
    here; the lead maps the emitted samples below.
- **Correction** (lead `handoff_31018a36dff867ad4a456f1db2d02465`, review of `6584ab1` against main `afafe82`): six
  reproduced defects are fixed here; see [Correction of 6584ab1](#correction-of-6584ab1). Read at `afafe82` with
  `git show`: §7.1, §7.2 and §7.4 (source and English), R08/R35/R46/R51/R59, A14/A26/A27/A30/A31/A44, and
  Q-INK-DISPLAY/INTENT-INK-MODES. The lead's probes `/tmp/windows-capture-review.cjs` and
  `/tmp/windows-ink-review.mjs` were read and run unmodified.
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

## Correction of 6584ab1

| # | Reproduced defect | Now |
| --- | --- | --- |
| 1 | Stop during Start's display listing did nothing; two Starts made two overlays | Start is reserved before anything is awaited: a second Start is refused, and Stop during the listing cancels it (the control window enables Stop while starting) and releases the reservation, so a new Start need not wait. A failed or cancelled Start leaves no session and no overlay. A Stop while the overlay loads closes it unshown. |
| 2 | A grant after Stop; a stream arriving after the end was played and never stopped | The display-media handler checks the session again after the display list arrives: after Stop it refuses. The overlay stops every track of a stream that arrives after the end (or is not a whole monitor, or has audio) and never shows it. Stop while arming asks for no stream. |
| 3 | A failing display list left the grant unanswered | The grant is answered exactly once: a failure, or no display list within 5 s, refuses it and ends the session with the reason. |
| 4 | Persistent write failure + Stop/close destroyed the only copy of the newest ink | Capture still stops at once. Each save sends the whole document, and each context picture once, to the main process; if writing fails, the main process **keeps** them (kept ink is never replaced by ink that does not continue it, and its older saved version cannot be opened meanwhile). The control window then shows **Ink that could not be saved** with **Retry saving** (a separate copy when the stored ink cannot be continued), **Export…** (one chosen JSON file with the ink and every picture it can read; any it cannot read are listed as missing) and **Discard…** (a separate confirmation). Closing the app keeps waiting for that choice; so does a Windows sign-out or shutdown request, and a spare export is written to the temporary folder when a session ends with kept ink or Windows ends the user's session. A picture that is missing on disk is a gap and never blocks saving the ink. |
| 5 | Evidence was taken at the end of a stroke; fingerprints could not reopen the original | The context is pinned **when the stroke begins**: if the system delivered newer frames since the last 1-second sample, one is sampled at pen-down, and that frame stays open until the stroke ends. A material change of the pixels under the stroke while writing adds a separate `changed_while_writing` context, starting at the point written next; while nothing more is written, a further change replaces that context instead of adding another (at most 8 per stroke; further changes are counted). A stroke with more than one context is never shown as verified. Each context stores a PNG crop of the actual raw frame, content-addressed next to the ink, with frame seq/time, the frame's pixel hash when known, and the region in DIP and px. Source app, link, page and media position are recorded as **not observed**. **Pictures** in the control window reopens them, checked against their SHA-256. |
| 6 | Composed frames drew uncertain ink solid | Composed frames and ASK crops draw ink exactly as on screen: changed, unknown and following-content strokes are dashed. Samples carry `ink_marks` (verified / changed / unknown / following_content), the transformation says so, and the ASK card states how many strokes are not verified. |

## Second correction (lead review of 57dab97)

Lead `handoff_41163a27b822e631477c3f9ef1e81e16`; review record `docs/verification/lead/windows-correction-review.md` and
probes at main `01240dff25819efe543f61e54d925a95462d555c`, read with `git show`. The W-C1/2/3 repairs and the
completed-stroke EIO recovery were confirmed by the lead's independent probes; four further findings and one
provenance point are fixed here.

| Finding | Now |
| --- | --- |
| W-C4: closing the app while the first Start lists displays still started an overlay | Closing the control window (and a Windows sign-out/shutdown request) cancels a Start in progress. The late listing starts nothing. Kept ink still holds the app open with its choice. |
| W-I5: Stop/close with a stroke still being written dropped it | Stop, closing the overlay or the app, a mode change, Open, or the system taking the pointer now finishes a stroke in progress with the points already written and its pinned context. The stroke is then saved, or kept by the main process if writing fails, before the Stop is confirmed; capture still stops at once. An unfinished eraser drag is dropped (nothing is erased), and an unfinished ASK selection is dropped (nothing is asked). |
| W-I6: the ASK card recomputed its uncertainty after encoding | The dashed-stroke counts are taken with the picture, before anything is awaited; the card states what its picture shows. |
| W-I7: 257 valid pictures, 256 stored, all acknowledged | A save receives at most 64 pictures / 48 MB and names exactly the pictures received (`pictures_received`) and any refused as invalid (`pictures_invalid`). The overlay sends bounded batches and lets go only of pictures named, repeating while each batch makes progress. A picture still unsent keeps the ink marked not saved, and it goes with the next save or Stop. |
| Sampling provenance | `raw.presented_frames` and `raw.frame_age_ms` are now the held image's own facts, taken with it. `raw.stream_presented_frames` is the stream's latest progress. Newer callbacks during hashing no longer change the image's reported count or age. |

The lead's expected-bug probes are kept as historical evidence and were not changed. The success checks are the
new regressions: `tests/main-lifecycle.test.ts` (close during Start, bounded receipt) and
`tests/overlay-frames.test.ts` (held-image facts, ASK snapshot). All four fail on `57dab97` and pass here. The
partial-stroke path is checked on actual Windows (`stop.overlay_close_saves`, `save.failure_survives_close`).

## Third correction (lead review of b89bf29)

Lead `handoff_e3afc6f4e2ea23ba8f8672fff1c1045f` (shared main `775436f`, no Windows contract change). The lead's
independent replay approved W-C4, the interrupted-stroke repair, W-I6, W-I7 and the held-frame facts. One
remaining loss race is fixed:

- **A new pen-down during a Stop's save:** while Stop waited for the first stroke's picture and save, the
  still-visible overlay accepted a new stroke. The overlay was then destroyed without it (its written points
  disappeared, with no recovery). Now, once the capture ends (Stop, or the capture ending by itself), the
  overlay takes no new input:
  - pen-down is refused;
  - undo/redo, the mode and tool buttons and Esc do nothing, and are shown disabled;
  - the hint says so;
  - the Stop makes the window pass the pointer through to the apps below.

  The stroke already being written when the Stop began is kept and saved before the Stop is confirmed, as
  before. Normal mode changes and Open are unchanged; the capture still stops at once.
- **Evidence:** `tests/overlay-stop.test.ts` runs the whole `overlay.ts` against the real `main.ts` with fake
  Electron, capture and canvas. With the first stroke's picture encoding held, a Stop is followed by a new
  pen-down and an undo:
  - no new gesture and no change are made;
  - the Stop is confirmed (`null`) only after the first stroke (its 2 points and picture) is saved;
  - nothing is kept as unsaved.

  A capture that ends by itself refuses input at once. Both tests fail on `b89bf29`. The lead's reproducer
  (`lifecycle-review.mjs`, unmodified, run on a copy of this source) passes its 16 earlier groups; its last
  expected-bug group stops at its own assertion that the second gesture exists, which it no longer does.

## QA-WIN-01: alignment over text that moved (lead handoff_8833420ed4b1c1b6107effe3f5879b22)

QA's pass at `061efe2` (`docs/verification/qa/p0-13-windows-behavior-061efe2.md` at `cba66c8`, read with
`git show`) found this. A stroke over a line of body text stayed **verified** (solid) after the page scrolled
300 DIP under it. Its 16×16 fingerprint changed by 0.049, below `SAME_PIXELS` 0.06, although 6.2 % of its pixels
changed by more than 64 levels. At 16×16 a 201×16 DIP region is averaged into cells as wide as a word, so one
line of text looks like another. Large regions dilute any change further.

**Now.**
- **What is kept per stroke.** Every stroke keeps, beside its 16×16 fingerprint, a **detail** grid of the same region
  from the same starting frame (`evidence.detail`). It has square cells of at least 2 frame pixels, at most 4096
  cells, and is averaged with high-quality smoothing, like the retention grid.
  - A 196×16 DIP stroke at 2× (392×32 px) gets 196×16 cells of 2 px.
  - A 496×146 DIP stroke gets 110×32 cells of about 9 px.
- **The comparison.** Each new frame is compared cell by cell. A cell changed if its luminance moved by more than
  16/255 (rendering noise stays below this).
  - **verified:** no cell changed.
  - **changed:** any cell changed, however few: a line replaced, a scroll of any amount, a sign, digit or answer
    changed in place, or the mouse pointer moving over the stroke. The captured frames include the pointer, and
    pixels alone cannot tell it from content, so a moved pointer is conservatively not verified.
  - **unknown:** the region is too plain (spread below 4/255), or there is no current frame.
  - Multi-context strokes are still never verified.
  - Ink drawn with the same pixels under it after a move (for example, identical repeated lines scrolled exactly one
    period) cannot be told apart by pixels and would still read as verified.
- **Changes while writing.** Any change of the detail under a stroke while it is written adds a context picture of
  the changed frame, with the same comparison. Up to 8 contexts are kept; further changes are counted
  (`changes_not_kept`). A pointer moving while writing with the mouse therefore adds contexts too.
- **Ink saved before this change.** A stroke with only the 16×16 fingerprint is never verified again: it is
  **changed** when the fingerprint moved by more than 0.06, otherwise **unknown** (dashed). A conservative unknown
  replaces an ungrounded verified.
- **Nothing else changes.** Strokes, history, context pictures and original pixels are unchanged. Content-following
  ink stays unverified and dashed. No stroke is moved.

**Evidence.**
- **Unit tests** (`tests/shared.test.ts`) use synthetic text lines and a synthetic formula strip:
  - **QA's condition.** A 201×16 DIP region is scrolled 300 DIP. The arriving line changes the 16×16 fingerprint by
    only 0.049, which the old rule verified; the stroke is now changed. Scrolls of 20, 40, 100 and 500 DIP are
    changed too.
  - **Local changes** (the lead's review cases, with the formula glyphs of its probe). Each of these is changed, and
    none of them shows in the 16×16 fingerprint:
    - `x−1=2` becoming `x+1=2`;
    - that change plus a separate `1 → 7`;
    - an answer `=2 → =7`.
    The pointer moving is changed too; a still pointer stays verified.
  - **Positive controls.** The same content is verified: unchanged, with a still pointer, and with ±6 levels of noise
    everywhere.
  - **Large-region controls.** 400×200 and 600×500 DIP regions are verified while unchanged and changed when scrolled
    20 or 300 DIP.
  - **Small strokes and plain regions.** A small stroke whose word was replaced, or whose text left, is changed. A
    blank region is unknown.
  - **Old ink.** Ink with only the fingerprint is never verified.
  - **Grid and format.** The grid is capped. The parser accepts a valid detail and refuses malformed ones.
- **Overlay tests** (`tests/overlay-alignment.test.ts`) run the whole overlay with the real main process. The fake
  canvas now keeps each frame's own pixels and reads back the area average of what was drawn, so local changes and
  separately pinned frames are real.
  - The saved evidence carries its detail, accepted by main. The stroke is verified, changed after the screen under
    it changes, and verified again when it changes back.
  - **A formula changed in place while a stroke is written, with no pointer** (`x−1=2 → x+1=2`, plus a separate
    `1 → 7`, or an answer `2 → 7`), over a 1280×800 screen:
    - the changed frame is kept as a second, `changed_while_writing` context with `changes_not_kept` 0;
    - the file saved by main reads back strictly with both contexts;
    - the stroke is not verified; the next sample's composed marks count no verified stroke;
    - an ASK card over it says "1 of your strokes are drawn dashed".
  - **Control:** the same formulas unchanged while writing give one context, verified, solid composed marks and no
    dashed note.
  - **Negative control:** with `samples.ts` and `overlay.ts` of `85de89e` (the held version), the in-place-change
    test fails. The lead's own probe, which asserts the held behaviour, is kept unchanged under
    `docs/verification/lead/`.
- **Native self-test** (see below; real Chromium text rendering on this Windows display):
  - **Body text.** A probe page of body text (Segoe UI 16/24 px) carries a narrow stroke over one line and a large
    stroke over a paragraph. Both are verified while still, changed after a 300 DIP scroll, and verified when
    scrolled back (0 changed cells).
    - The real mouse pointer is in the frames and is never moved by the test. Its image can change after a scroll
      (arrow and text cursor), which now reads as changed. The strokes are therefore placed on a paragraph away from
      it: in the 14:27 run the pointer was at 272, 381 DIP, so paragraph 6 was used.
  - **Line-aligned scrolls.** Eight other lines, each scrolled exactly under the narrow stroke, are all changed.
  - **QA's course page.** On QA's own page (markup from its `course.html`, Georgia 20 px), a stroke over "The general
    solution is" is verified, then changed after a 300 DIP scroll.
- **Not reproduced natively.** In all eleven native cases (two strokes scrolled 300 DIP, eight line-aligned
  scrolls, QA's page) the 16×16 fingerprint changed by 0.13–0.24, so the old rule would have caught them too. QA's exact frames (Edge window offset, its desktop screenshots) are not available here.
  QA's discriminating condition is reproduced by the unit test only; QA's changed-path pass is the independent check
  on real frames.
- **Not measured.** The cost per frame with many visible strokes: one small GPU draw and a read-back of at most 4096
  cells per stroke.

**Lead review of 85de89e (HOLD; `docs/verification/lead/windows-alignment-review/` at `a0e2fa8`).** The first version
of this correction accepted changed cells that fit in two pointer-sized squares as verified, without any pointer
evidence. A formula changed in place (`x−1=2 → x+1=2`, and a separate `1 → 7`) was verified. It also added no writing
context, recorded no omitted change, and showed solid ink and composed marks `verified 1`. That exemption is removed;
the behaviour above is the correction.

## Retention correction (lead review of 04caef61, handoff_f69f481144d2aaff8d684a05f80de076)

Review record `docs/verification/lead/windows-retention-review/` at `54adcb2`, read with `git show`; its preserved
probes are unchanged. Each finding has a regression in `tests/retention-correction.test.ts`; all of them fail on
`04caef61` and pass here. An independent review before delivery found nine further defects in the first version of
this correction (listed under "Before delivery" below); each has its own regression, and each fails when only its own fix is
reverted.

| Finding | Now |
| --- | --- |
| S1: a partial append (disk full) left a torn line; the retry was acknowledged with an unparseable manifest | Main tracks the bytes of `manifest.jsonl` known to be whole lines. When an append fails, whatever it left (a torn line, or whole lines of that batch) is cut back to them at once, so the manifest stays valid even if nothing is appended again. If that cut fails too, it is repeated before the next append. If the repair or the append fails, nothing is acknowledged, and the failures are counted in the next `unwritten` line. |
| S2/R3: the 10 s Stop bound destroyed an overlay still encoding retained frames, with only an ink warning | At Stop the overlay records at once the material steps still waiting and its open not-retained run. It then reports which retained frames are still being encoded or written, each with the deferred samples it stands for (`lc:stopping`). The Stop waits while the overlay keeps completing work, and counts only valid work: answered retained frames and ink saves. It re-checks every 10 s and waits at most 60 s. If the overlay stops completing work, or at the hard bound, the session ends. Capture already stopped at Stop, and ink recovery is unchanged. An `unfinished` line records the frames not written (their seqs; their pixels are lost) with their deferred samples. When no frames were reported, it says instead that frames after the last listed one may be missing. A frame whose answer crossed the report is not listed. The same line is written when the overlay's process is gone. None is written when no whole-display frame could have been taken. The control window shows this apart from the ink message. |
| S3: the final `ended` line's failure was ignored | Its result is observed. On failure the session's retention state is kept after teardown, and the control window shows "the end of this record could not be written yet". The line keeps its original time and reason and is noted as recorded late. It is tried again at every Start (a refused one too) and when the app closes, until it is written. These attempts are not counted as unwritten events: nothing but the end is late. A running session's own record stays shown meanwhile. |
| R1: a measured sampling gap with identical pixels left no durable trace; retained gap frames lacked `gap_ms` | Every sample in state `gap` writes a `gap` line (`sample_seq`, `gap_ms` as measured, `sampled_at`, `monotonic_ms`), whatever the pixels or ink did. Retained facts carry `gap_ms` (null when not a gap). Nothing is reconstructed from timestamps. |
| R2: the header said `frame_age_ms` = `monotonic_ms − presentation_ms` | The header now says `frame_age_ms` is measured separately and rounded, so it can differ from that difference by a millisecond or more. The capture latency before presentation is not measured. Values are unchanged. |
| Malformed data from the owned overlay | Retained facts are checked against their actual shape before anything is written: positive integer seqs with `frame_seq ≤ sample_seq`, deferred seqs below it, valid times, state, `gap_ms` iff gap, frame counts, presentation facts, raw and composed facts, marks summing to the visible strokes. Not-retained runs need `from ≤ to` and a count that fits. Gap lines need a positive `gap_ms`. A frame larger than the chosen display (its size × scale, +16 px) is refused before decoding; a change of the display's size ends the session anyway. A picture must decode completely with Electron's native decoder (`nativeImage`) at the frame's size; a 24-byte PNG prefix is refused. |

Before delivery (independent review of the first version of this correction):

- A frame answered before the overlay's Stop report reached main was listed as lost.
- A torn first append could leave a second header.
- A forced end dropped a lost frame's deferred samples, and a slow ink save held back the waiting steps.
- A torn line stayed on disk until the next append.
- Failed `ended` retries were counted as unwritten events.
- A retry during a running session replaced its panel.
- Malformed messages counted as progress.
- A crash of the overlay's process wrote no `unfinished` line.
- The native decode had no size bound.

All are fixed as described above.

## Whole-display retention (lead handoff_eb10e3f50d7fc6f3bee934f1802a9f04)

The capture's whole-display frames are kept as files, so a later AI path can use the actual screen. Until now
only RGBA hashes and stroke-region crops were kept.

- **Retained:**
  - the actual raw frame as a full-size PNG (2560×1600 on this display);
  - the composed frame (that raw frame with the ink drawn exactly as on screen, not-verified strokes dashed) as a
    PNG, with its ink session, revision, visible strokes, marks and transformation.

  The raw frame is kept independently: when no ink is visible, the two files are identical and are stored once.
- **Where:** `%APPDATA%\Learning Companion\captures\<session id>\` (the session's initial id; no new identity).
  - `frames\<sha256>.png`: content-addressed and written atomically;
  - `manifest.jsonl`: one JSON line per event, appended.

  Nothing in it is ever deleted by the app. The control window shows the count, size and place.
- **Manifest lines** (`lc-desktop-capture-retention/v1`, local producer facts, not a wire contract):
  - `header`: format, capture session, started at, source (display id, source id, label, bounds, scale), policy,
    and the meaning of each time field and hash.
  - `retained`:
    - `sample_seq`, `frame_seq` (the sample in which the held image was taken), `reason` (first / changed / ink
      / heartbeat / deferred) and `deferred_samples_not_retained`;
    - `sampled_at`, `taken_at` (wall clock), `monotonic_ms`, `state`, `gap_ms` (the measured lateness for a
      `gap` sample, otherwise null);
    - `presented_frames` (the held image's), `stream_presented_frames`, `presentation_ms` and `frame_age_ms` (both
      `null` before the first frame callback: unknown, never evidence of freshness);
    - `raw` {file, sha256 and bytes **of the PNG file**, width, height, `pixels_sha256` = SHA-256 of the RGBA read
      back (a different hash, kept apart), change from the previous sample};
    - `composed` {the same file facts, plus ink session, revision, visible strokes, marks, transformation}.
  - `not_retained`: a run of samples (`from_seq`–`to_seq`, count) with the reason. Reasons: pixels changed less
    than the material threshold; a material step past the session limit; a frame that could not be encoded or
    sent; a material step still waiting for the interval when the capture ended.
  - `refused`: `sample_seq`, `frame_seq`, the deferred samples it stood for, and the reason (limit reached, writing
    failed, or pictures that are not the frame).
  - `unwritten`: a count of earlier lines that could not be written (including a torn line that was cut back).
  - `gap`: `sample_seq`, `gap_ms` as measured, `sampled_at`, `monotonic_ms` — nothing is known about the display
    for `gap_ms` before this sample.
  - `unfinished`: at a forced end (the Stop bound, or the overlay's process gone), the sample seqs of retained frames
    that were still being written (their pixels are lost) and the deferred samples they stood for
    (`deferred_samples_not_retained`), or none, with the statement that later frames may be missing.
  - `ended`: at, reason (and `recorded_at` plus a note when it was written late).
- **Policy** (engineering defaults, recorded in the header):
  - Retain the first frame, any change of the ink or of how it is drawn, and a material pixel change: at least 2
    of the 64×40 luminance cells moving by at least 4/255 against the last retained frame. The cells are averaged
    with high-quality smoothing.
  - At most one retention per 2 s. A material step inside the interval (or while 2 frames are still being encoded)
    waits; the frame retained next lists it as deferred.
  - Sub-threshold changes are recorded as `not_retained` runs, with a heartbeat retention after 60 s.
  - Caps: 1000 frames and 1 GiB per session. Past a cap, frames are refused and recorded, later material steps are
    recorded once each as not retained, and nothing retained is removed.
  - A write failure is refused and recorded, and that step is tried again, no sooner than the interval allows.
- **Pinning:** the held image (kept open until encoded), that sample's composed canvas, the frame facts, the ink
  revision and the marks are taken together in the sample, before anything is awaited. Encoding and writing
  happen afterwards, in order, apart from sampling.
- **Stop, permission loss or disconnect:** no new frame is taken or retained. At Stop, deferred steps and the open
  not-retained run are recorded at once; frames already queued are encoded and written, and only then is the Stop
  confirmed and `ended` written. If the overlay stops completing work, the Stop ends it and records the frames still being
  written as `unfinished` (see the correction above).

**Retention sample** (`evidence/windows-retention-sample/`: `manifest.jsonl` plus 7 PNGs). It comes from an
isolated self-test user-data folder, recorded 14:27:54–14:29:15 UTC in the corrected QA-WIN-01 run (retention code as in
`e586b82`); no other Electron process was running before or after the run. A probe window covered the whole display, so the frames hold
only test content (checkers, the probe's counter, the mouse pointer); the two new files were checked visually,
and the other five are byte-identical to the sample reviewed before. Policy
`max_frames` 5.

| Line | Content |
| --- | --- |
| header | capture session `4e9d4151d7cd7a92`, source `screen:0:0` 1280×800 at 2; the corrected `time_basis` |
| retained 1 (first) | green screen; raw = composed (no ink) `d68d53bd…` |
| retained 3 (changed, deferred [2]) | orange; `9dc2b9a3…` |
| refused 5 (deferred [4]) | the frames folder was blocked (a file in its place): "writing to this device failed (EEXIST …)" |
| retained 7 (changed, deferred [6]) | blue, retained on the retry once the folder was back; `035b8e37…` |
| not_retained 8 | pixels changed less than the material threshold (the probe's counter) |
| retained 10 (ink, deferred [9]) | blue with a pen stroke: raw `5fa1a3b7…` (blue under the stroke), composed `9708ddf1…` (ink solid, revision 1, marks verified 1) |
| retained 12 (changed, deferred [11]) | red: raw `6e0e9d25…`, composed `4f761ae3…` with the ink **dashed** (marks changed 1) |
| refused 14 (deferred [13]) | violet: "the retention limit of 5 frames for this session is reached" |
| ended | "stopped by the self-test" |

No sample in this run was late, so the run itself has no `gap` or `unfinished` lines; those are exercised by the
regressions. Three of the seven files are byte-identical to the sample committed with `e586b82`. The orange and blue
frames are the files of the `04caef61` sample, and the two ink frames are new; they differ only in the probe's counter
digits and were checked visually. The WindowsFrame ingress fixture keeps its own copy of the `e586b82`/`85de89e`
sample (`evidence/windows-frame-ingress/native-capture/`), so later self-test runs do not change it.

Read back on Windows (`retention.whole_display_frames`), for all 5 retained frames, raw and composed:
- file SHA-256 and length equal the manifest;
- the PNG decodes (Electron `nativeImage`) to 2560×1600;
- the decoded RGBA equals the sample's `pixels_sha256`, so the files hold exactly the pixels observed.

`retention.ink_composed_raw_apart`: under the stroke the raw PNG is blue (58, 97, 239) and the composed PNG is ink
(110, 63, 209). `retention.refusals_and_end`: both refusals are recorded, the 7 files stay, and the last line is
`ended`.

**Access:** open the folder above, or the copy under `docs/verification/web/evidence/windows-retention-sample/`.
`manifest.jsonl` has one JSON object per line. Each file is named by its SHA-256 (`sha256sum frames/*.png`
reproduces the names).

**Omissions (precise):**
- **Not every frame is kept:**
  - frames between retentions are observed (hashed) but not stored;
  - a deferred step is stored as the next frame, not as the frame of its own sample;
  - sub-threshold changes (a blinking caret, the counter) are recorded only as `not_retained` runs, and retained at
    the 60 s heartbeat.
- **No time-exact capture claim:** a retained frame is the held image with its own presentation facts. Capture
  latency before presentation is not measured.
- **Growth:** retained files grow the user's disk up to the caps per session. There is no viewer, deletion or
  export UI for them yet. Across sessions nothing is capped.
- **No transport:** nothing is sent. Mapping to a released Windows contract is the lead's; no wire fields were
  added, and the Mac-only 0.2.7 profile is not reused.
- **Detection and hardware:** material-change detection is a luminance-grid heuristic (a colour-only change of
  equal luminance, or a change inside a single cell, is sub-threshold). Only one display and this machine's GPU
  were exercised.
- **Author evidence only:** the sample is a synthetic probe screen with DevTools pen input. It is not user
  content, not independent QA, and makes no hardware or provider claim.

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
7. **Alignment.** Every stroke keeps a pixel fingerprint and a finer detail grid of what the captured display
   showed under it when it was written (see QA-WIN-01 above). On every new frame the detail is compared with the
   same region again. The result has three states:
   - **verified:** the region is textured and still looks the same. The stroke is drawn solid.
   - **changed:** the pixels under it changed, for example because the user scrolled or switched apps.
   - **unknown:** no frame was available, or the region is too plain to tell (luminance spread below 4/255, such
     as a blank margin), or the stroke was saved before details were kept.
   - Changed and unknown strokes are drawn **dashed** and counted separately in the hint. Nothing is moved. This
     is a pixel-unchanged check, not a content anchor.
   - The fingerprint comes from the frame held **when the stroke began**, not from the frame when it ended.
   - **Context pictures.** Each stroke keeps pictures of what it was written over (defect 5 above): the starting
     frame's crop, and a crop for each material change while writing. They are saved with the ink and reopen under
     **Saved ink → Pictures**, with where and when each one comes from. What a picture of the display cannot tell
     (app, link, page, media position) is stated as not known.
8. **ASK (?).** Circle a region: a card shows that region's **composed** pixels (the captured frame with the
   user's ink) and states the frame number, time, region and ink revision.
   - The selection is composed when the circle ends, from the frame held at that moment and the current ink, and
     it is labelled with exactly that frame and revision. Ink is drawn in it exactly as on screen (dashed where
     not verified), and the card says how many strokes are dashed.
   - The card says: **No AI is connected: this selection was not sent anywhere.** No response is shown or made
     up.
   - Finishing the circle (the card appears), **Cancel**, Esc or pressing **?** again ends ASK and returns to the
     mode before it: WRITE when ASK was pressed while writing, NAV from NAV (the unchanged §7.2 reducer).
9. **Saving.** Every change is saved on this device at once:
   - to `%APPDATA%\Learning Companion\ink\<session>.json`, in the `lc-desktop-ink/v1` format;
   - validated first, and written atomically (a failed write removes its temporary file);
   - with the pictures of what each stroke was written over, as `%APPDATA%\Learning Companion\ink\context\<sha256>.png`;
   - if saving fails, the hint says **Not saved** with the reason, and the next change and Stop try again. The
     main process keeps the newest ink and its pictures, so Stop, closing the overlay or closing the app do not
     lose it: the control window offers **Retry saving**, **Export…** and **Discard…**, and the app stays open
     until one of them resolves it (an export counts).
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
    - a stroke still being written keeps the points already written and its context (an unfinished erase or ASK
      selection is dropped);
    - the newest ink is saved (or kept, if it cannot be written), and the overlay closes (at most 10 s later; if
      the overlay does not confirm by then, the control window says so and a closing app stays open). Closing the
      overlay or the app takes the same path; the app quits after the session has ended, unless kept ink awaits
      the user's choice;
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
| Contemporaneous context | `ink/context/<sha256>.png` + each stroke's `evidence.contexts` | crops of the actual raw frames a stroke was written over (when it began, and after material changes), with frame, time and region; source app/link/page/media position not observed |
| Composed frame | overlay memory; per sample its facts and hash | raw frame + this app's ink drawn at the display geometry exactly as on screen (not-verified ink dashed), pinned to the ink revision; a labelled transformation |
| Retained whole-display frames | `captures/<session>/frames/<sha256>.png` + `manifest.jsonl` | raw PNGs and composed PNGs of the material steps, with their pinned facts; what was not retained is recorded with why |
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
| `raw.presented_frames` | frames the stream had presented when this app took the held image (`requestVideoFrameCallback`); the image is the newest of them or one presented just after |
| `raw.frame_age_ms` | the held image's age since the browser presented it, measured at this sample as `performance.now()` minus that frame's presentation time (`presentationTime`), then rounded; it can differ by a millisecond or more from the difference of the separately rounded times; the capture latency before presentation is not measured |
| `raw.stream_presented_frames` | frames presented by this sample: the stream's latest progress, possibly newer than the held image |
| `raw.taken_at` | when this app took the frame now held (the same frame is kept while no new one arrives) |
| `raw.pixels_sha256` | SHA-256 of the frame's RGBA pixels (width × height × 4, rows top to bottom) as read back |
| `raw.change` | mean absolute luminance change against the previous sample's frame on a 64×40 grid, 0..1; `null` first |
| `composed` | `null` when `raw` is `null`; frame and ink are taken together before anything is awaited |
| `composed.ink_session` | the ink document (session) id, 16 hex |
| `composed.ink_revision` | ink revision composed into this frame (history length) |
| `composed.visible_strokes` | visible strokes composed |
| `composed.ink_marks` | the visible strokes by how they are drawn: `verified` (solid), `changed`, `unknown`, `following_content` (dashed) |
| `composed.transformation` | plain statement of the composition (frame size, ink revision, strokes, px per DIP, not-verified ink dashed as on screen, overlay excluded so ink added once) |
| `composed.pixels_sha256` | SHA-256 of the composed RGBA pixels; equal to `raw.pixels_sha256` when no ink is visible |

- **Not included in this slice:**
  - the pixels themselves (they stay in memory);
  - ReplayKit-specific 0.2.5 metadata;
  - any wire field.
- **Mapping into a released contract** is the lead's decision. A missing or unknown frame stays a gap.

**An actual emitted sample** (final self-test run of this candidate, primary display;
`evidence/windows-selftest.json` → `sample_example`):

```json
{
  "seq": 9, "sampled_at": "2026-09-30T12:37:17.455Z", "monotonic_ms": 6954, "state": "fresh", "gap_ms": null,
  "source": { "kind": "display", "display_id": "3071609112", "source_id": "screen:0:0", "label": "整个屏幕",
              "bounds": { "x": 0, "y": 0, "width": 1280, "height": 800 }, "scale_factor": 2 },
  "raw": { "width": 2560, "height": 1600, "presented_frames": 49, "frame_age_ms": 181, "stream_presented_frames": 49,
           "taken_at": "2026-09-30T12:37:17.412Z",
           "pixels_sha256": "96d730d8986e8d29f423736974bbfd588e06d52803de2036d61fff29cc5ef411",
           "change": 6.1274509803921575e-06 },
  "composed": { "ink_session": "721ab5172c8185cf", "ink_revision": 2, "visible_strokes": 2,
                "ink_marks": { "verified": 2, "changed": 0, "unknown": 0, "following_content": 0 },
                "transformation": "raw frame 2560×1600 px with this app's editable ink (revision 2, 2 visible stroke(s)) drawn over it at 2.000 px per DIP, strokes whose alignment is not verified (changed, unknown or following content) dashed as on screen; the overlay itself is excluded from capture, so the ink is added once",
                "pixels_sha256": "569cd94c619d5ae6a1abc8aa652f9fbc0c8fcaf24d8748b099066fdb1f794d85" }
}
```

- Before the first presentation callback of a stream, `presented_frames` is 0 and `frame_age_ms` counts from
  time 0: that age is unknown, never evidence of fresh pixels. The mapping should treat it so.

The editable ink format (`apps/windows/src/shared/desktop-ink.ts`) is:
- `lc-desktop-ink/v1`: `{format, id, created_at, forked_from, display, ink, evidence}`;
- `forked_from` is `null`, or the session id a separate copy was made from;
- `ink` is the unchanged web `InkDocument`, with page `{origin: 'desktop', address_sha256: SHA-256(session id)}`
  and every stroke's `anchor: null` (hidden strokes included);
- `evidence[stroke id]` is `null` when no frame was available when the stroke began, or
  `{frame_seq, frame_sampled_at, region (DIP), fingerprint, detail?, contexts, changes_not_kept}`:
  - `frame_seq`, `frame_sampled_at` and `fingerprint` are those of the frame held when the stroke began;
  - `detail` `{cols, rows, luma}` (added for QA-WIN-01): the same region from the same frame as a grid of square cells
    (row-major luminance, base64; at most 4096 cells, cells at least 2 frame pixels). It is absent in ink saved
    before it was kept; older versions of this app ignore it;
  - `contexts` (1–8, in order) are `{reason: writing_started | changed_while_writing, from_point, frame_seq,
    frame_taken_at, frame_pixels_sha256 | null, region (DIP), region_px, image: {sha256, width, height} | null,
    not_observed: [source_app, source_link, page, media_position]}`. The first is where writing started
    (`from_point` 0); each later one starts at a later point of the stroke. `image` is `null` only when the crop
    could not be made;
  - `changes_not_kept` counts material changes beyond 8 contexts.
- The context pictures are `ink/context/<sha256>.png`, shared by every document that refers to them (copies
  included). The unreleased `lc-desktop-ink/v1` shape of `6584ab1` gains `contexts` and `changes_not_kept`; no
  user data in the earlier shape exists outside test folders.
- **Export** (`lc-desktop-ink-export/v1`, only for ink that could not be saved): `{format, exported_at,
  not_saved_because, ink, context_pictures_png_base64: {sha256: base64}, context_pictures_missing: [sha256]}`.

## Checks and actual results

| Label | Command / evidence | Result |
| --- | --- | --- |
| Source | `apps/windows` TypeScript 7.0.2, `tsc -p apps/windows/tsconfig.json` | passes |
| Unit tests | `cd apps/windows && npm test` (76/76): `tests/shared.test.ts` (format, contexts, samples, alignment), `tests/main-lifecycle.test.ts` (the real `main.ts` in a sandbox with Electron faked: Start/Stop races, close during Start, grants, kept ink, bounded picture receipt, export, retry), `tests/overlay-capture.test.ts` (the real `startCapture`/`endCapture`: late and wrong streams), `tests/overlay-frames.test.ts` (the real `takeSample`, `finishAsk` and `save`: held-image facts, ASK snapshot, batched picture sending), `tests/overlay-stop.test.ts` (the whole `overlay.ts` with the real `main.ts`: no new input once a Stop begins; a queued retained frame is written before the Stop is confirmed; retention past the limit and on retry), `tests/retention.test.ts` (retention rules; main's PNG files, manifest lines, caps, refusals and write failures), `tests/overlay-alignment.test.ts` (the whole overlay with the real main process and per-frame pixels: a saved stroke's detail, verified, changed and verified again as the screen under it changes; a formula changed in place while writing kept as a context, read back, not verified, dashed in composed marks and ASK), `tests/frame-ingress.test.ts` (the WindowsFrame 0.2.9/0.2.10 mapping, see `windows-frame-ingress.md`), `tests/retention-correction.test.ts` (the retention review: torn appends cut at once or before the next append, Stop bound with unfinished frames and their deferred samples, a report crossing its answer, the overlay's process gone, no record without frames, only valid work as progress, final ended failure and its retries, gap lines, header text, malformed data, oversized frames); shared helpers `tests/main-harness.ts` (fake Electron with a stand-in PNG decoder, timers and write faults), `tests/overlay-page.ts` (the whole overlay page), `tests/source.ts` (source text with LF endings), `tests/png.ts` | 76/76 pass |
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
    screen, are removed (and a frame is painted) before each control screenshot. The report keeps no pixels, and
    local paths in it are replaced by `<userData>`/`<home>`. The test's context pictures, export and spare copy
    stay in the temporary test folder or are removed.

| Check | What was observed |
| --- | --- |
| `session.start` | Start on the chosen display opens the overlay and the capture |
| `overlay.covers_display` | overlay bounds equal the display bounds (0,0,1280,800), after resizing a window Windows had fitted to the work area (752 high) |
| `capture.frames` | frames 2560×1600 = display × scale |
| `capture.changing` | fresh frames with different pixel hashes between samples (5 distinct in 5), with no further selection |
| `capture.held_frame_facts` | every sample reports the held image's frame count (≤ the stream's) and age; a consistency check only (the unit test covers frames arriving during hashing) |
| `nav.click_through` | NAV: the overlay ignores mouse input (OS click-through) and is not interactive |
| `write.mode` | WRITE: the overlay takes input |
| `write.mouse_off_by_default` | a mouse drag with Mouse off draws nothing and says why |
| `write.mouse_and_pen` | mouse (after turning it on) and pen strokes are ink, saved |
| `capture.overlay_excluded_ink_once` | raw pixel under the pen stroke = the probe's green (65,161,71 for its #00a040 square), not the overlay; composed pixel there = ink purple (110,63,209); beside the ink, raw = composed |
| `capture.composed_pinned` | last composed record pinned to the current ink revision (with `ink_marks` counting every visible stroke), hash ≠ raw; every sample with no visible ink has composed hash = raw hash |
| `write.partial_erase` | eraser across one stroke: history `erase`, two pieces, original kept |
| `write.undo_redo` | undo restores the whole stroke, redo erases again |
| `write.content_placement_labelled` | "following content is not established here: ink stays where written"; the stroke is dashed and counted |
| `ask.finish_returns_write` | the card shows the composed crop and "No AI is connected"; mode back to WRITE |
| `ask.cancel_returns_write` | Cancel in ASK returns to WRITE |
| `write.continue_after_ask` | writing continues, every change saved |
| `save.on_disk` | the file holds the same history; the list shows 5 strokes |
| `stop.ends` | Stop: session gone, overlay destroyed (100 ms) |
| `stop.restart_at_once` | Start as soon as the overlay closed; the session is still alive 10.4 s after the earlier Stop (past its 10 s bound) |
| `reopen.same_ink` | after a new Start, Open shows the same strokes and history; all 5 verified over the unchanged textured probe |
| `reopen.continue_editing` | undo continues the reopened history, saved to the same file |
| `save.unreadable_kept_copy` | the stored file is damaged on purpose; the next change leaves it byte-for-byte untouched and saves the whole history as a copy (`forked_from` the original); the list shows the copy and 1 unreadable file; the unchanged second session saved nothing of its own |
| `context.pinned_at_start` | right after regular sample 13 the probe turned orange; the pen went down before the next regular sample, so sample 14 was taken at pen-down and is the stroke's starting context (orange picture), not frame 17 at its end. Red while writing added one `changed_while_writing` context from point 9; blue while the pen was held still replaced it (frame 16 → 17), with no duplicate. Both pictures are the actual pixels (orange, blue) and were saved; nothing stays pinned |
| `context.pictures_reopen` | **Pictures** reopens every context picture of the session from this device, checked against its SHA-256 |
| `alignment.pixels_changed` | with the probe under the ink gone, the strokes are `changed` (dashed); nothing moved |
| `capture.composed_keeps_uncertainty` | the next composed sample counts `verified 0, changed 5, following_content 1` of 6 visible strokes and says not-verified ink is dashed |
| `ask.keeps_uncertainty` | the ASK card shows the dashed ink and says "6 of your strokes are drawn dashed, as on screen" |
| `stop.overlay_close_saves` | an undo, then a pen stroke still being written (4 points, pen not lifted) when the overlay window is closed: the session ends as "the overlay window was closed" (262 ms, confirmed, not by the time bound); the file ends `undo, add` with the stroke's 4 points and its starting context |
| `save.failure_reported_and_kept` | with the ink folder replaced by a file, a new stroke is "Not saved", and the main process keeps revision 13 (the overlay's) with its picture |
| `save.failure_survives_close` | another stroke is still being written when the overlay is closed: capture ends at once, and revision 14 (with that stroke, 8 strokes) stays kept; the control window says so (`<app data>` in place of the local path) |
| `app.close_held_while_unsaved` | closing the app window leaves it open while that ink is kept (screenshot `windows-selftest-control-kept.png`) |
| `start.cancelled_by_app_close` | a Start, then closing the app while it lists displays: "stopped before the capture started (the app was closed)", no overlay; the kept ink still holds the app open |
| `save.export_kept_ink` | Export writes one file with revision 14 and the 2 kept pictures of the unsaved strokes; the 7 earlier pictures, inside the blocked store, are listed as missing |
| `save.retry_after_failure` | with the folder back, Retry writes revision 14 and all its pictures; nothing stays kept; the spare copy and its folder are removed |
| `start.one_at_a_time` | two Starts at once: one `ok`, one "a session is starting"; one overlay |
| `start.stop_cancels` | Stop while Start lists displays: "stopped before the capture started"; no session, no overlay |
| `alignment.text_still_verified` | a probe of body text (Segoe UI 16/24 px) covers the display; a narrow stroke over one line (region 196×16 DIP, detail 196×16) and a large one over a paragraph (496×146 DIP, detail 110×32), on a paragraph away from the real mouse pointer (at 272, 381 DIP; paragraph 6), are verified while still |
| `alignment.text_scrolled_changed` | scrolled 300 DIP under them, both are changed (16×16 fingerprint changes 0.21 and 0.14, reported) |
| `alignment.text_lines_replaced_changed` | eight other lines scrolled exactly under the narrow stroke (168–756 DIP): all changed; fingerprint changes 0.18–0.22, so none of them is QA's hard case |
| `alignment.text_restored_verified` | scrolled back, both are verified again (0 changed cells) |
| `alignment.qa_course_line_changed` | QA's course page: a stroke over "The general solution is" is verified, then changed after a 300 DIP scroll (fingerprint change 0.235) |

**Result:** 45/45 author checks passed (run 14:27:54–14:29:15 UTC with the corrected QA-WIN-01 code, after the lead's review of `85de89e`, while the display was released to web and with no other Electron process before or after; the five `alignment.text*`/`alignment.qa*` checks are described in the QA-WIN-01 section). Earlier runs of `85de89e` and its drafts (13:33 43/43, 13:35 44/44, 13:38 and 13:56 45/45) used the withdrawn pointer exemption. The retention correction's own run was 13:18:30–13:19:21 UTC (40/40); the three `retention.*` checks are described in the retention section above; retained PNGs passed the main process's native decode check). A 12:59:47–13:00:37 run of the first version of this correction also passed 40/40. The earlier 12:37:09–12:38:00 run may have shared the display with QA and is not a quiet run. Both probe windows keep painting while the overlay covers them (`backgroundThrottling: false`) and sit at the top level: without this, a covered probe could stop repainting under load, and another always-on-top window on the desktop could cover it. This is author evidence only, not independent QA and not device or course
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
- **Correction reviews:** an ultracode review of this correction (3 reviewers + adversarial verification) found 16
  real or plausible defects (5 more were rejected or duplicates), and a focused re-review of those fixes found 8
  more. All are fixed here. Among them:
  - pictures are received once, so a long write failure cannot outgrow a save;
  - kept ink is never replaced by ink that does not continue it, and a Retry does not take over another session;
  - a missing picture is a gap, not a block;
  - the pen-down frame is sampled fresh;
  - no duplicate context starts while the pen is still;
  - multi-context strokes are never verified;
  - Windows sign-out/shutdown is delayed while ink is unsaved;
  - the display list has a 5 s bound;
  - Stop works while starting.

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
  so. Alignment is only a three-state pixel-unchanged check at the resolution of the stroke's detail grid (cells of
  2 px for small strokes, coarser for very large ones). Content with identical pixels after a move (for example,
  identical repeated lines scrolled by exactly one period) still reads as verified. The mouse pointer moving over a
  stroke reads as changed while it is there: pixels cannot tell it from content.
- **Unfinished gestures:** a stroke interrupted by Stop, a mode change, Open or the system taking the pointer keeps
  its written points. Once the capture has ended, the overlay takes no new input until it closes. An interrupted eraser drag or ASK selection is dropped: nothing is erased and nothing is
  asked. A Stop in the moment between pen-down and its first sampled frame keeps the stroke without a starting
  context (`evidence: null`) if no frame was taken before the end.
- **Pen eraser end:** mapped from the Pointer Events eraser button (`button` 5 / `buttons & 32`). Not tested with
  hardware.
- **Saving failures:** unsaved ink is kept in the running app's memory until it is retried, exported or
  discarded, with a best-effort spare export in the temporary folder when a session ends with kept ink or Windows
  ends the user's session. If that folder fails too, kept ink does not survive the app being killed (Task
  Manager, a crash, power loss). Windows sign-out and shutdown requests were not exercised. A change
  that never reached the main process (an overlay crash mid-save) is lost, and the control window says the newest
  ink was not confirmed. An export made while the store is unreadable includes the pictures kept with the ink and
  lists earlier pictures it could not read as missing.
- **Capture latency:** the starting picture is the newest frame Windows had delivered at pen-down. In the
  self-test, a display change 250 ms before pen-down had not yet reached the delivered frames; with 800 ms it
  had. A change within a few hundred ms of pen-down may therefore be pictured as the change while writing.
- **Context pictures:** they are the user's own screen content, stored next to the ink on this device, and only
  leave it through an export the user chooses (or the spare export in the user's temporary folder when ink could
  not be saved). Crops above 4 megapixels are scaled down (the picture's size then differs from `region_px`). They show a region around each stroke (40 DIP margin), not the
  whole display. The app, link, page and video position are not observed and are stated as unknown. Contexts
  follow pixel changes under a stroke while it is written; a new stroke starts its own context. A change is any
  cell of the stroke's detail grid moving by more than 16/255 (the alignment comparison), the pointer included; up
  to 8 contexts are pictured and further changes are counted.
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
- **Lead probes:** `/tmp/windows-capture-review.cjs` now reports the corrected behaviour for all five cases.
  `/tmp/windows-ink-review.mjs` slices `main.ts` from `function saveInk(` to `/** Offers saved ink`; that range
  now contains the new exported retry/export functions, so the probe stops at a syntax error before its
  assertions (which describe the old failing behaviour). Its scenario is covered by `tests/main-lifecycle.test.ts`
  and the Windows self-test. The probes were not modified.
- **Independent acceptance:** QA P0-13 on the exact candidate SHA is still required. A44 (original-screen annotation
  with the AI seeing the ink), A26/A27 and both §7.1 gates remain **open**: no AI is connected.
