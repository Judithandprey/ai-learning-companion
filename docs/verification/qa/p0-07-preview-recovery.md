# QA P0-07: document preview recovery and unsaved-work boundary at main 9eb6bd5

- **Candidate:** exact pushed main `9eb6bd53cd95f2da7ea9db34a82d45043a1ef415`.
  - It contains Web `096cac1 → 94bf522` and `75dad5e → ff52933`, plus root's canonical-import
    change `54063bf`.
  - Tested from a `git archive` copy; the page bundle was built with the pinned TypeScript.
- **Assignment:** lead `handoff_3381612a6326d1d7c0995e0fafc64469`. One focused actual UI/API/storage
  acceptance of the changed recovery and unsaved-work boundary. The earlier 33-check browser
  campaign and the normal restart check (lead report `preview-main-54063bf`) were **not** replayed.
- **Environment:**
  - WSL2 with Windows Edge (headless) through the repo's `cdp-harness.mjs`, driving the page with
    trusted CDP mouse, file and text input;
  - Node 24.21.0;
  - the real preview API from the exact copy (`python -m services.api.preview_local`);
  - the dedicated local `lc_p0_test` database, verified as PostgreSQL 18.6.
  - No migrations, database restart, provider or account were used.
- **Test data:**
  - A fresh document authored by QA for this check (6,241 bytes, SHA-256 `178ca95c…`) with a BOM,
    CRLF/LF, a tab, Chinese, emoji, literal `<b>` markup and trailing spaces. It is not a fixture.
  - Its own scoped test actor `qachk-<hex>-user/device/session`, removed afterwards (0 rows remain).
- **Harness:** `tests/e2e/web/preview_recovery/run.mjs` (browser, relay, API, database
  snapshots), `db_ops.py` (scoped database access) and `analyze.py` (pass criteria written before
  the run).

## Injected condition (labeled)

- The page's only allowed API address is `127.0.0.1:8174`, so the real API ran on loopback
  `8175`. A transparent relay on `8174` forwarded every request unchanged. Port `8175` is an extra
  local port: it was free before the run and released after.
- The harness armed three conditions explicitly; the relay never creates or edits an answer:
  - **`drop_after_commit`:** forward the save, wait for the API's complete `200 server_committed`
    answer, then cut the connection without responding.
  - **`drop_before_forward`:** cut the save before it reaches the API.
  - **`block_reads`:** cut `GET /preview/v1/saves/*` before it reaches the API.
- **Observed browser behaviour:** Chromium resent each cut POST twice on new connections. Each click
  therefore produced three dropped `200 server_committed` answers:
  - the first answer was the original commit (`replayed: false`);
  - the next two were replays (`replayed: true`).

  This was corrected after lead review; an earlier version of this report called all three replays.
  The API's idempotency held: one note per click. The relay log is kept in `summary.json`.

## Result: 30 PASS, 0 FAIL ([checks.txt](p0-07-preview-recovery/checks.txt))

Run `qa-preview-recovery-cc6217d4`; state and evidence are in
[summary.json](p0-07-preview-recovery/summary.json).

| Step | Actual result |
| --- | --- |
| Open, connect, register | The real file was opened with the trusted file input. After Connect the source is `registered`, and the rendered text's SHA-256 equals the original. |
| X: real commit, answer lost | The API committed X: storage held 1 note at that moment. The UI showed "Outcome unknown: No answer from the local preview API…" with **Retry save** and **Discard unsaved selection**; Close was disabled. The fields were read-only and kept the exact typed request and note ([screenshot](p0-07-preview-recovery/pass-1-unknown-after-commit.png)). |
| Unsaved-work guards (X unknown) | Opening another file gave "Not opened: save, retry or discard the unsaved selection first." and the original stayed. A new selection gave "Your new selection was not added: retry or discard the unsaved item first." The `beforeunload` handler prevented leaving; this was checked at the handler level, not through a browser dialog. |
| Retry X | "Saved: the local preview API confirmed server_committed … it already had this item, **no duplicate made** · note `note_ad3b…`": the same note ID. Storage still held exactly 1 note ([screenshot](p0-07-preview-recovery/pass-2-retry-confirmed.png)). |
| Typed but unsaved | With a new selection and typed request, leaving and opening another file were both blocked, and the typed words were kept. |
| Y: real commit, answer lost, then Discard while reads were cut | Storage held 2 notes. After the explicit Discard, Y stayed listed as "1 not confirmed" ([screenshot](p0-07-preview-recovery/pass-3-discarded-pending.png)). |
| Z: cut before the API received it | The UI showed "Outcome unknown" and Z was discarded. The API never saw it. |
| Reload and reconnect | After the reload the token was forgotten and no document was open. After reconnecting with reads restored, the list showed "**2 saved item(s), 1 not confirmed**": Y was recovered from the pending index, and Z stayed unconfirmed ([screenshot](p0-07-preview-recovery/pass-4-reconnected-list.png)). |
| Reopen Y | "The returned original and selection-time context match their SHA-256". The rendered original is identical. The selected phrase, context, request and note are shown exactly; the note is "a user note, not an AI response", with the AI shown separately as provider unavailable ([screenshot](p0-07-preview-recovery/pass-5-reopened-recovered.png)). |
| Reopen Z | "The preview API has not found this note yet. Its save outcome is still unknown, so it stays listed as not confirmed." A point-in-time 404 did not drop the item. |
| Storage and direct readback | Final inventory: exactly 2 notes, 2 revisions and 2 `preview_save` records, all for this actor only. A fresh Python client read X and Y directly from `8175`, bypassing the relay: original bytes, frame, bridge request, request, request text and note all equal what was sent; authorship `user`, `provider_unavailable`. Z returned `404 not_found`. |
| Cleanup | Own actor removed (0 documents, 0 actors); ports 4173, 8174 and 8175 released. |

**Owner regressions** (`apps/safari-extension/tests/p0-07-preview.test.ts`, exact copy): **26/26**
pass. This includes "a pending id not found yet is kept, and confirmed when its slower request
commits (pending 404 → later 200)" and "each isolated binding mutation of the released example is
refused on reopen and never confirms a pending id". The live run adds real server output for the
same two boundaries: Z kept after a real 404, and Y confirmed only by a valid read. No new mutation
campaign was run.

## Finding

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| **QA-P07-01** | **low (UX), owner Web** | After the unsaved-work guard refuses a selection, the refused words stay highlighted in the document. Once the unknown item is resolved (Retry → saved), pressing ASK and dragging over **the same** highlighted words gives no new selection or draft. ASK stays armed with its "Draw with your finger or pen…" hint, no notice appears, and the side panel still shows the previous saved item. Selecting different words works. **Likely cause, inferred and not instrumented:** a pointer press inside an existing highlight starts the browser's native text drag, so no new selection exists at pointer-up, and the page does not clear the selection when it refuses one. Workaround: click elsewhere or select other words. Suggested fix: clear the document selection when refusing, or show a notice when an ASK pointer sequence ends without a new selection. | Reproduced in 3 of 3 runs with the same refused phrase. Probe events show `ask_observe_text` on pointer-down and then **no** `ask` outcome ([reselect-repro.json](p0-07-preview-recovery/reselect-repro.json), [highlight kept after save](p0-07-preview-recovery/repro-refused-phrase-still-highlighted.png), [after the re-drag](p0-07-preview-recovery/repro-after-reselect-no-draft.png)). With a different refused phrase, the full run passes. |

**Observations (info):**
- "Not opened: save, retry or discard the unsaved selection first." stays in the open-status line
  after the save is confirmed.
- The list time of a retried item is the client's confirmation time, because the receipt carries
  no server time (documented in `api-store.ts`). An item confirmed by a read shows the server's
  `created_at`.
- Chromium silently resends a POST whose connection was cut. Server idempotency, not the page,
  prevents duplicates here, and it held.

## Reproducibility

- **What is committed:** `summary.json` is a reduced, redacted extract. It is **not** the analyzer's
  input `result.json`, which carries the complete page states, the payloads sent and the direct
  readback bodies.
- **Offline replay:** replaying all 30 checks (`python analyze.py <dir>`) needs:
  - the retained raw `result.json`, kept outside the repository;
  - the authored original under `/tmp/<run>-original.txt`, because the harness compares readback
    bytes with it through `Path.read_text(newline="")`.

  It ran with Python 3.14.4. The lead's offline replay of those retained files reproduced 30 PASS,
  0 FAIL.
- **Limits:** a replay from the repository alone is not possible and is not claimed. Evidence must
  not be regenerated from later API output. A new browser, API and database run is a new run.

## Harness cleanup fix (after lead review)

- **Defect:** `run.mjs` checked only `exitCode` before waiting for the API child's `exit` event. A
  child already ended by a signal has `exitCode` null and `signalCode` set and emits no further
  `exit`, so cleanup could hang.
- **Fix:** stopping now uses `child.mjs` `stopChild()`, which also returns at once when
  `signalCode` is set.
- **Checks:**
  - The bounded probe `child-probe.mjs` gives 4 PASS: a live child stops on SIGINT, and an
    already-signaled child, an already-exited child and no child all return without hanging.
  - The old check was confirmed to hang on the already-signaled case.
  - No browser or database run was repeated for this fix.

## Runs and limits

- **Runs:** six foreground runs; each removed its own actor and released its ports.
  - Runs 1–2 failed on harness mistakes: fields are hidden without a draft, and ASK is a toggle.
    Those were corrected in the harness.
  - Runs 3–4 hit QA-P07-01 before it was identified.
  - Run 5 is the passing run.
  - Run 6 deliberately reproduced QA-P07-01 (`QA_REFUSED=y`).
- **Evidence kept out of the repo:** raw runner logs stay local, because they contain a local Windows
  profile path; the committed JSON and screenshots contain only test IDs.
- **Not claimed:** the `beforeunload` check used the page handler, not a real browser leave dialog.
  The injected loss is a relay condition, not a real network outage or API crash; lead's existing
  normal-restart evidence covers the process restart.
- **Remaining limits:**
  - browser-local saved-ID discovery; an ID that never commits stays pending, with no remove action;
  - local test authentication;
  - no AI provider;
  - DOM context without pixels;
  - not Safari, the iPad app, original-course overlay, Notability or full P1.

## Decision

- The changed recovery boundary **passes** in real Edge, the real API and PostgreSQL:
  - after a real commit whose answer was lost, the UI reports an unknown outcome, keeps the exact
    note and ID, and guards against replacement;
  - Retry confirms the same note without a duplicate;
  - reload and reconnect recover a pending ID and its original and context from storage;
  - a never-committed ID stays unconfirmed after a real 404.
- One low UX defect, QA-P07-01, returns to Web.
