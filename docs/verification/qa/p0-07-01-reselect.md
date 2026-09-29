# QA retest: QA-P07-01 (re-selecting words refused by the unsaved-work guard) at 6c3c1b6

- **Candidate:** exact integrated application candidate `6c3c1b65bac13f315bb953158f101245139d9e63`, which is
  Web `b471bdf` applied unchanged on main `d8b7afa`. Lead handoff: `handoff_98c030de0ac944029f84726885abbe7c`.
- **Reports read:** `docs/verification/web/qa-p07-01-reselect.md`. It confirms the cause QA inferred: the
  refused words stayed natively selected, and a press on them started a native text drag (`dragstart` →
  `pointercancel`).
- **Provenance:** `provenance.py` verified the tested copy before the run.
  - All 170 tracked files under `apps/safari-extension`, `services` and `packages` equal the blobs of
    `6c3c1b6`: commit tree `1a7aabca…`, module tree `48215bd7…`.
  - The same check against the old `9eb6bd5` reports exactly the 4 changed source files, so it
    discriminates.
  - `run.mjs` no longer hardcodes a baseline. It refuses to start without `QA_BASELINE` and records the
    verified commit.
- **Environment:** Windows Edge (headless) with trusted CDP mouse, file and text input, using the repo's
  `cdp-harness.mjs`.
  - The real preview API ran from the verified copy on loopback `8175`, behind the transparent relay on
    `8174`.
  - Database: the dedicated `lc_p0_test`, PostgreSQL 18.6.
  - A fresh QA-authored document (6,241 bytes, SHA-256 `178ca95c…`) and a fresh actor `qachk-cdb5598f-*`,
    removed afterwards.
- **Not repeated:** no migrations, database restart, provider or API restart. The 30 recovery checks,
  the 33-check campaign, the native suite and mutation runs were not repeated.
- **Injected condition, labeled:** the relay's `drop_after_commit` condition forwarded X's save, waited for
  the API's complete `200 server_committed` answer (`replayed: false`), then cut the connection without
  answering. Chromium resent the save twice; both resends were answered as replays and also cut. This is
  an injected loss of the response, not a real network outage.

## Result: 23 PASS, 0 FAIL, first run ([checks.txt](p0-07-01-reselect/checks.txt))

Run `qa-preview-reselect-cdb5598f`, scenario `reselect` in `tests/e2e/web/preview_recovery/run.mjs`. The
criteria in `analyze_reselect.py` were written before the run. The reduced state is in
[summary.json](p0-07-01-reselect/summary.json).

| Step | Actual result |
| --- | --- |
| X saved; answer cut after the real commit | "Outcome unknown…" with Retry. Storage held 1 note. |
| While X is unknown, NAV → ASK and a drag over a second phrase ("null space argument") | "Your new selection was not added: retry or discard the unsaved item first." X's attempt, ID and exact request and note text were kept. `getSelection()` was `''`: the refused words are no longer left selected ([screenshot](p0-07-01-reselect/1-refused-while-unknown.png)). |
| Retry | "Saved: … confirmed server_committed … it already had this item, no duplicate made", same note ID. Storage still held 1 note ([screenshot](p0-07-01-reselect/2-retried.png)). |
| **NAV → ASK and a drag over exactly "null space argument"** | **A new draft of exactly those words**: "Not saved yet.", with a new request ID different from X's. The probe logged a submitted `ask` outcome for that text and no `capture_aborted` ([screenshot](p0-07-01-reselect/3-same-phrase-new-draft.png)). Before the fix this gave no draft (3 of 3 runs). |
| A note typed on that draft, then NAV → ASK and a drag over a third phrase ("rank condition") | "Your new selection was not added: save or discard your typed words first (they are kept)." The draft stayed "null space argument", and the typed note is exactly as entered. The third phrase is not left selected ([screenshot](p0-07-01-reselect/4-typed-note-kept.png)). |
| Save the new draft | Committed as a different note. |
| Control (click on an existing selection) | "rank condition" was selected natively in NAV, then NAV → ASK and a single click (no drag) on it gave a draft of "rank condition", which was then discarded. The preserved click behavior holds on the real page. |
| Storage and direct readback | Exactly 2 notes and 2 revisions for this actor. A fresh Python client read both notes directly from `8175`: exact original bytes, the selected phrase, the note, the request and the frame as sent; authorship `user`, `provider_unavailable`. |
| Cleanup | Own actor removed (0 rows); ports 4173, 8174 and 8175 released; foreground API child stopped with the fixed `stopChild()`. |

## Decision

- **QA-P07-01 is fixed** on the real API path.
- After the guard refuses a selection and the unknown item is resolved, dragging over the same words gives
  a correct new draft, and that draft saves as its own note.
- A typed note survives a later real refusal. Refused words are no longer left selected.
- Clicking an existing selection in ASK still asks about it.
- No new defect was found.

## Limits

- Desktop Edge headless with trusted CDP mouse input only.
  - Not Safari or an iPad with a trackpad or mouse; WebKit's drag-of-selection behavior was not observed.
  - Pencil and finger ASK were not exercised; that path is unchanged by the fix.
- The jitter and padding presses from Web's focused test-double check were not repeated. Only the one click
  control ran here.
- Unchanged (info, from the earlier QA report): the "Not opened: …" line stays after a confirmed save.
- Remaining preview limits:
  - browser-local ID discovery;
  - local test authentication;
  - no AI provider;
  - DOM without pixels;
  - not the course overlay, Notability or full P1.
- **Reproduction:** `summary.json` is a reduced extract. A full offline replay of the 23 checks needs the
  retained raw `result.json` and `/tmp/qa-preview-reselect-cdb5598f-original.txt`, both kept locally.
- **Harness note:** the completed recovery scenario now also requires `QA_BASELINE` (for example
  `9eb6bd5…` with an exact copy of that commit). It was not rerun.
