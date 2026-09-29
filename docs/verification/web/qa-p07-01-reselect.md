# QA-P07-01: re-selecting words the unsaved-work guard refused

- **Date:** 2026-09-29 UTC. **Owner:** web (05).
- **Handoff:** lead `handoff_47f9343b98fcaa4cc79e9ac1ef46547a`.
- **Finding:** QA `c0036bc`, `docs/verification/qa/p0-07-preview-recovery.md`. Its `reselect-repro.json` and
  screenshots were read.
- **Baseline:**
  - main `1a2e628`. Its preview and probe code equals QA's candidate `9eb6bd5`. For the changed source files
    (`src/page.ts`, `src/dom-capture.ts`, `preview/src/preview-page.ts`, `fixture/src/selftest.ts`), it also
    equals `team/web` `75dad5e`.
  - Also read: `docs/requirements.en.md` R06–R10 and A03 (explicit ASK, input separation, return to normal),
    and the P0-07 unsaved-work invariants.
- **Scope:** `apps/safari-extension/**` and `docs/verification/web/**` only. No protocol, dependency, provider
  or native change.
- **Branch note:** the normal merge of main into `team/web` was denied again by the session's permission
  classifier and was not retried. `team/web` and main differ in this module only in `preview/src/wire.ts`,
  `tests/p0-07-preview.test.ts` and the removed example fixture, none of which this change touches. The
  change covers the four source files above, a new check script, this note and evidence, so it applies to
  main as is.

## Cause (observed, not inferred)

The browser's own events were recorded next to the probe's events in Edge headless with trusted CDP mouse
input: [before](evidence/p0-07-reselect-before.json), check `reselect.same_words_new_draft`, values
`againEvents`.

1. When the guard refused a selection, the page closed that selection's card but left the refused words
   **natively selected**. They were still selected after Retry, and the NAV and ASK toolbar clicks did not
   clear them.
2. In ASK, a mouse press lets the browser select text, and the probe reads the selection at `pointerup`. The
   press landed on the existing selection, so Chromium started a **native drag of the selected text**:
   `pointerdown → mousedown → dragstart → pointercancel → dragend`. No `pointerup` and no new selection
   followed.
3. The probe treats `pointercancel` as an aborted gesture and dropped the pending read silently. Nothing was
   submitted and no notice appeared. ASK stayed armed, and the panel kept the previous item.

QA's inference (a native text drag of the existing highlight) is therefore confirmed. The same failure also
happens without the guard: words left selected after an ordinary draft is discarded cannot be asked about
again by dragging over them (`reselect.press_on_selection_new_mark` in the before-fix report).

## Change

- **`src/page.ts`** (the probe, desktop mouse ASK only; NAV, WRITE, pen and finger unchanged). On a plain
  primary-button ASK press (no Shift, Ctrl, Meta or Alt) that the browser would treat as a press on the current
  selection, the selection's ranges are set aside and cleared.
  - The test mirrors Blink's `FrameSelection::Contains`: the caret position hit-tested at the point lies within
    a selected range, ends included. It uses the existing `caretAt` from `dom-capture.ts`, now exported, and
    falls back to the ranges' rectangles only where caret hit testing is missing. So it also covers presses
    in padding or line spacing beside selected text, and ignores selected text hidden by clipping.
  - A **drag** then makes a fresh native selection, which is asked.
  - A **click**, meaning movement under 4 CSS px (jitter included), gets the set-aside selection back at
    `pointerup` and asks about it, as before.
  - A cancelled press restores it and emits `capture_aborted` with reason `pointer_cancelled`, so the cancel is
    observable in the event log. Nothing else is shown.
- **`preview/src/preview-page.ts`:** when the unsaved-work guard refuses a mouse text selection, the refused
  words are also cleared from the document selection, not only from the card. Pen and finger marks never set
  the document selection, so a refused pen or finger mark leaves any selection alone. The unsaved item, its
  note, its retry payload and its identity are untouched.
- **`fixture/src/selftest.ts`:** the existing `ask.mouse_cancel_submits_nothing` check now also asserts that
  the selection is kept after a cancel and that exactly one `pointer_cancelled` event is emitted.

## How the change was reached

1. **First version:** it cleared the selection at every such press, which broke "click an existing selection
   in ASK" (course-page self-test 50/54; not retained). The click restore fixed that (54/54).
2. **Internal adversarial review** of the second version: three lenses, each finding checked by a
   refute-by-default verifier. 10 minor findings were confirmed and 2 refuted.
   - Fixed in the code:
     - the glyph-rectangle press test was narrower than the browser's, which drags on presses in padding or
       line spacing; the caret test replaced it;
     - clipped selected text could be revived by a click elsewhere (also fixed by the caret test);
     - Shift and secondary presses lost their native behavior; only plain primary presses are set aside now;
     - 1–3 px of jitter asked about one character; a sub-slop press now always asks about the set-aside
       selection;
     - a refused pen or finger mark cleared an unrelated selection; only mouse text refusals clear it now.
   - Fixed in the tests: the cancel-restore and the event were unasserted; the focused check now covers the
     padding and jitter cases; the reports now record the browser and write a run log.
   - Fixed in this note: the before-run recipe, which omitted the rebuild.
   - Recorded below as an evidence correction: the older campaign's `preview.unsaved_item_kept`.

## Checks

| Check | Result |
| --- | --- |
| `scripts/preview-reselect-check.mjs`, new focused check. Edge 154 headless, trusted mouse input, labeled in-page test double: the lost answer gives the unknown save; the refusal path does not depend on storage | **before 5/10** ([report](evidence/p0-07-reselect-before.json)), **after 10/10** ([report](evidence/p0-07-reselect-after.json)), 0 runner errors |
| Course-page probe self-test (`browser-check.mjs`), with the strengthened cancel check | **54/54** ([report](evidence/qa-p07-01-selftest.json)) |
| Trusted input (`trusted-check.mjs`) | 37 pass, 0 fail; `nav.touch_scroll` and `nav.pinch_zoom` are not verifiable in this environment, as before ([report](evidence/qa-p07-01-trusted.json)) |
| Entries (`entries-check.mjs`) | **21/21** ([report](evidence/qa-p07-01-entries.json)) |
| `scripts/check.sh` (typecheck, unit tests, build) | pass, **113/113**, pass |

The ten focused checks, in order:

| # | Check | Before | After |
| --- | --- | --- | --- |
| 1 | Setup: X saved with a lost answer shows "Outcome unknown" | pass | pass |
| 2 | While X is unknown, a new selection is refused with a notice; X and its note are kept | pass | pass |
| 3 | The refused words are not left selected | **fail** (still selected) | pass |
| 4 | Retry saves X | pass | pass |
| 5 | After the save, dragging over the **same** refused words gives a new draft of them (QA-P07-01) | **fail** (`dragstart → pointercancel`, no draft) | pass |
| 6 | With words typed on that draft, other words are refused and the typed note is kept | fail (a consequence of 5) | pass |
| 7 | A press on words still selected after a normal draft was discarded gives a new draft of them | **fail** (`dragstart → pointercancel`) | pass |
| 8 | A click (no drag) in ASK on a selection made in NAV still asks about that selection | pass | pass (preserved) |
| 9 | A press in the padding beside still-selected words, then a drag across them, gives a new draft | **fail** (`dragstart`) | pass |
| 10 | A click with 2 px of jitter on still-selected words asks about the whole selection | pass | pass (preserved) |

- **How the "before" run was made:**
  1. A scratch copy of the module was made.
  2. Only `src/page.ts`, `src/dom-capture.ts` and `preview/src/preview-page.ts` were taken from `HEAD`
     (`75dad5e`).
  3. `dist/` was deleted and rebuilt there with the pinned TypeScript.
  4. The same check script was run. Both reports record the same Edge 154 user agent.
- **Evidence correction for the older campaign:** in the 33-check preview report, `preview.unsaved_item_kept`
  passed on a stale notice.
  - Its blocked drag went over "eigenvalues", which the step before had just selected, so it hit this same
    defect: a native text drag, nothing submitted.
  - The notice it matched was left over from the earlier refusal.
  - So that check did not show a genuine refusal. It was not re-run, as the lead asked.
  - Genuine refusals are shown here by checks 2 and 6, each preceded by an empty notice.
- **Not re-run, as the lead asked:** the 33-check preview campaign, the mutation, database and native runs, and
  QA's recovery run. QA's harness and analyzer were read, not edited.

## Limits

- Desktop Edge headless with trusted CDP mouse input only.
- Not Safari, and not an iPad with a trackpad or mouse. WebKit's drag-of-selection behavior is expected to be
  similar, but it was not observed here.
- Pencil and finger ASK take a different path (`ask_capture`, no native selection) and are unchanged.
- The focused run uses the labeled test double, not the real API, because the defect is in selection handling.
  QA's narrow changed-path check after integration covers the real API path.
- Unchanged, noted by QA as information: the "Not opened: …" line stays after the save is confirmed.
