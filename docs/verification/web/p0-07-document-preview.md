# P0-07 web: user-operable desktop document preview (early fallback)

- **Date:** 2026-09-29 UTC. **Owner:** web (05).
- **Handoffs:**
  - lead `handoff_401a9fc977503d93ce7536dc16a3f9d6`: the page and the replaceable storage boundary (`9c1d070`, `8989b61`).
  - lead `handoff_0acc054cb1cadb8c33bc9a81f3e8ced3`: the real adapter for the released document-preview API (this
    revision).
- **Scope:** `apps/safari-extension/**` and `docs/verification/web/**` only. No shared contract, dependency,
  root, backend or migration file changed.
- **Baselines read:**
  - `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`: `docs/workflow.md`, `docs/roles/web.md`, the `docs/tasks.md` P0-07
    card, AGENTS/TEAM/CLAUDE changes, and `docs/requirements.en.md` R03/R06–R10/R17/R27–R32/R43–R44 and
    A02/A03/A10–A12/A19/A23.
  - Released main `8a35663cf607726cad4adb78d906026d600322c8`: `packages/contracts/document_preview/README.md`,
    its generated TypeScript, `schema.json` and `examples.json`, `services/api/PREVIEW.md`,
    `services/api/preview_local.py` and `services/api/preview_app.py`.
- **Branch note:**
  - A normal merge of main into `team/web` was denied earlier by the session's permission classifier and was not
    retried. The branch therefore cannot import main-only files.
  - `preview/src/wire.ts` mirrors the released generated preview types at `8a35663`; the shared v0.1.0 record
    types are imported, not copied. On integration it can become an import of
    `packages/contracts/document_preview/generated/contracts.ts`.
  - The runtime checks in `api-store.ts` stay either way.

This is an **explicitly labeled early desktop fallback**: an owned page showing a local UTF-8 document. It is
not the original course page (R03/R59), not the iPad/Pencil path, and not real AI understanding. It passes none
of those requirements in full.

## How to reach it

Two foreground processes, both on loopback. Neither is left running.

1. **The backend's local preview API**, as documented in `services/api/PREVIEW.md`:
   - command: `python -m services.api.preview_local --port 8174`;
   - environment: its own opt-in, database, token and identity variables, plus
     `LC_PREVIEW_UI_ORIGIN=http://127.0.0.1:4173`, the page's origin, for which that API enables CORS.
2. **The page:**

```text
$ apps/safari-extension/scripts/preview.sh
Document preview: http://127.0.0.1:4173/preview/
  Saving and reopening use the local preview API (services/api/PREVIEW.md). Start it separately in
  the foreground with LC_PREVIEW_UI_ORIGIN=http://127.0.0.1:4173 and your LC_PREVIEW_TOKEN, then enter
  that token on the page. It is kept in page memory only.
  Labeled in-page test double (not persistent), for UI checks only: http://127.0.0.1:4173/preview/?store=test-double
Press Ctrl+C to stop.
```

About the page launcher:
- It builds the module with the lead's pinned Node/TypeScript and serves only the module's own pages on
  127.0.0.1:4173.
- Its CSP, as both a header and a meta tag, is: `default-src 'self'`, no inline script or style,
  `connect-src 'self' http://127.0.0.1:8174` (the preview API only), `object-src 'none'`, `base-uri 'none'`
  and `form-action 'none'`.
- Smoke test: `GET /preview/` returned 200 with that CSP, and Ctrl+C (SIGINT) exited with 0.

**The default page uses the real API store.** It never falls back to the test double; that exists only with
`?store=test-double` and says in red that it is not persistent.

## What the user can do

1. **Connect.**
   - Enter the API's token in the page's password field and press Connect.
   - The page reads the token once, clears the field, and holds it only inside the store's closure. It is never
     in the address, storage, a document, the page state or any course content script, and a reload forgets it.
   - The identity (user, device, session) comes from `GET /preview/v1/session` and is shown in the header.
   - A later token for a different identity is refused, so records made on the page keep one identity.
2. **Open a local UTF-8 document** with the file chooser.
   - The bytes are decoded as strict UTF-8 and checked to re-encode to the same bytes; the SHA-256 of the bytes
     is shown.
   - These are refused, and nothing is guessed or truncated: invalid UTF-8, NUL characters, and files over
     2 MiB (the contract's source limit).
   - A BOM, CRLF/LF/CR, markup, non-ASCII, emoji and combining characters are kept exactly.
   - The page registers the **complete original** with `POST /preview/v1/documents`:
     - canonical base64 of the exact bytes and their SHA-256;
     - a client source id, version 1;
     - the session's device and session, the browser time zone, and `project_id: null`.
   - A document opened before connecting is registered when the user connects.
   - A retry reuses the same body and `Idempotency-Key`.
   - The receipt must say `server_committed` with the same id, version, hash and user.
3. **See it rendered as inert text.**
   - Each paragraph and blank-line gap is a `p`/`div` whose `textContent` is the exact substring.
   - Markup never becomes elements, and no script or handler runs.
4. **Explicit select + ASK**, with the existing `installProbe` / `ProbeSession`.
   - A mouse drag in ASK gives `explicit_text_ask`; NAV and WRITE never request anything.
   - The mark is frozen as a hashed `dom_snapshot` frame (no pixels). Its context is the selected paragraph,
     truncated to 1,000 characters. The complete original stays separate.
   - The probe reads the session identity at each ASK, so the frame, selection and requests carry the connected
     identity.
   - The side panel shows the selection, its context and "no explanation generated. The explanation provider is
     not connected"; the card says "Provider unavailable". There is no fixture text.
5. **Title, request and note, then save.**
   - The title is suggested from the selection (at most 80 characters) and is editable. The user's question or
     request and their note are optional. All three are sent exactly as typed.
   - Limits are checked in code points before sending, and nothing is shortened:
     - title 1–300 and not blank;
     - request, note and selection at most 65,536 each;
     - DOM artifact at most 1 MiB;
     - no NUL.
   - Save sends `POST /preview/v1/saves` with:
     - the note id, which is also the `Idempotency-Key`;
     - the `Frame`;
     - canonical base64 of the **exact** frozen DOM bytes (never recomputed);
     - both `BridgeRequest` and `ExplanationRequest` unchanged;
     - title, `request_text` and `user_note`.
   - The status reads "Saved" **only** after the receipt says `server_committed` for that note (revision 1)
     with `ai_status: provider_unavailable`. Otherwise it reads:
     - **Outcome unknown**: no answer, a timeout, or a 5xx on a write. Retry is safe.
     - **Not saved**: a 4xx refusal of a first attempt, which applied nothing.
     - **Not saved: token refused**: a 401 on a first attempt. The page asks to reconnect, then Retry.
   - **Once an outcome is unknown, it stays unknown until a receipt arrives.** A later refusal (for example a
     401 after the API restarted with a new token) reads "Outcome still unknown: the earlier attempt may
     already be saved. This retry was not applied: …".
   - Retry resends the identical item.
   - The note id enters this browser's id list as **pending before the save is sent**, so a commit whose answer
     was lost stays reachable, even after Discard or a reload. Each time the list is shown, the page asks the API
     about pending ids:
     - found: listed as saved, with the note's server time;
     - `not_found`: dropped, because nothing was stored;
     - anything else: stays pending ("save not confirmed yet").
   - A first attempt that was refused (known not applied) is removed from the list again.
   - Unsaved typed words or an unconfirmed save block these actions until saved or explicitly discarded: Close,
     Open, Reopen, and adding a new ASK selection. Leaving the page asks the browser to confirm.
6. **Close, reload, reopen.**
   - Saved note ids are kept in this browser's `localStorage` (`lc-document-preview-index/v1`), per user, with
     the title and file name as list labels, the state (pending/saved) and the time. This is a list of ids to
     reopen, not another archive; no list endpoint exists, and none is invented. An id the API answers
     `not_found` for on reopen is pruned.
   - Reopen reads `GET /preview/v1/saves/{note_id}` and rebuilds the view **from the server's answer**:
     - the full original bytes, checked against the source's SHA-256;
     - the DOM bytes, checked against the frame hash;
     - selection, context, title, request and note exactly as saved;
     - the note labeled "a user note, not an AI response and not ink", with its revision and `authorship user`;
     - the AI state kept separately (provider unavailable).
   - The store refuses a returned item that is not a user note of the connected identity:
     - `authorship` is not `user`;
     - a block is not `user_original`;
     - the source belongs to another user.
   - The source is marked "reopened from storage (not reimported)".
   - Reopen and Open re-check for unsaved work **after** their reads finish. Words typed or a save started while
     an item was being read are kept, and the reopen is abandoned.
   - New ASKs on a reopened document use the source's own time zone (from the saved frame), not the browser's
     current one. The API refuses a frame whose zone differs from its source.

## Storage boundary

`preview/src/store.ts` defines `PreviewStore`: `importDocument`, `save`, `list`, `get`, plus a displayed
`description` and the store-supplied `identity`.

| Store | When | What it is |
| --- | --- | --- |
| `createApiStore()` (`preview/src/api-store.ts`) | default | document-preview.0.1.0 over `fetch` to `http://127.0.0.1:8174`, Bearer token, `credentials: 'omit'`, 20 s timeout |
| `createTestDoubleStore()` | `?store=test-double` only | page memory, with injectable `reject` / `lost_response`; labeled not persistent; reopen now also recomputes both hashes |

- Web's internal `Identity.origin` gained `local_preview_api`, as the contract README asks. v1 wire types are
  unchanged.
- The typed user note is stored by the backend in the v1 `NoteRevision` `kind: ai` container with
  `authorship: user`. The page labels it a user note, never an AI response.

## Checks and evidence

| Check | Result |
| --- | --- |
| `apps/safari-extension/scripts/check.sh` (typecheck, `node --test`, build) | typecheck pass, **105/105**, build pass |
| `scripts/preview-check.mjs` on Edge 154 headless, trusted CDP input | **33/33**, 0 runner errors: [p0-07-preview.json](evidence/p0-07-preview.json), screenshots `evidence/p0-07-preview-*.png` |
| Page launcher | served `/preview/` with the CSP header; SIGINT exit 0 |

**Unit tests** (`tests/p0-07-preview.test.ts`, 18, 9 of them rewritten):
- UTF-8 exactness, including a BOM, CRLF and markup;
- refusal of invalid UTF-8, NUL and more than 2 MiB (exactly 2 MiB opens);
- blocks that rejoin exactly;
- canonical base64, including a large buffer;
- the save record;
- limits in code points at and past each bound;
- the test-double behaviors.

The API store runs against `fakeApi`, an **in-test stand-in for the server**. It shows what the client sends and
how it reads answers. It is not proof of backend behavior. Its tests cover:
- nothing sent before connecting;
- identity from the session;
- the token only in the header, never in storage;
- exact import and save bodies, with the retry repeating the body and key after a lost answer;
- 409 → rejected, 503 on a write → unknown, 401 → expired, then nothing sent until reconnect;
- a different identity refused;
- reopen from a fresh store after a "refresh", with hashes verified and a tampered frame reported;
- the pending id list:
  - a commit whose answer was lost is found and listed with its server time;
  - an attempt that never arrived is dropped, and so is a refused first attempt;
  - a refused retry after an unknown outcome keeps the id;
  - an id that cannot be checked stays pending;
  - a `not_found` on reopen prunes the id.

**Browser runs** (`preview-check.mjs`). A real file on disk goes through the file chooser
(`DOM.setFileInputFiles`). Selection uses trusted mouse drags; typing uses trusted text input; buttons are
clicked.

1. **Default page, no API running (6 checks).**
   - The real API store is used and disconnected.
   - Latin-1 is refused.
   - The UTF-8 file opens with SHA-256 `ef77aad9…` for both the file and the rendered text.
   - Only `p`/`div` elements are rendered, and no script ran.
   - Registration fails with "not connected", and an ASK submits nothing.
2. **Test double (11 checks).** These are the earlier UI checks, including the lead's data-loss regression
   `preview.typed_note_kept_on_new_ask`.
3. **Real local preview API (16 checks)**, from `git archive 8a35663` (`services`, `packages`) with the project's
   existing `.venv`.
   - It runs on the dedicated `lc_p0_test` database under a fresh identity `webchk-<random>-{user,device,session}`,
     with per-run random tokens.
   - Before starting, the helper parses the handoff DSN and refuses (BLOCKED) unless the database is `lc_p0_test`
     on a Unix socket or loopback. The report records the parsed name and host kind, never the DSN.
   - The check server's `/__control` endpoint stops and restarts the API at set points. It exists only when the
     check passes a control callback and a per-run control token, never in the launcher.
   - Sequence:
     1. Open before connecting: not registered.
     2. A wrong token is refused.
     3. Connect: identity from the session, and the open document is registered.
     4. ASK "trace(A²)", type a request and a note, then Save: `server_committed`.
     5. The identical save request is sent again through the page's own store, as a retry after a lost answer
        would send it. The API answers with its **replay** of the first commit (`duplicate: true`), not a
        second note.
     6. ASK a second paragraph, type a note, and **stop the API**. Save gives **Outcome unknown**; the note is
        kept, Retry is offered, and Close is blocked.
     7. **Start the API with a new token**, and wait until the browser reaches it again. In the recorded run
        this took 4 tries, 0.8 s. Retry gets a 401: the status becomes expired, and the outcome **stays
        unknown** ("This retry was not applied").
     8. Reconnect: same identity. Retry of the same note id commits.
     9. **Reload the page**: disconnected and nothing listed.
     10. **Restart the API with a third token.** The old token is refused.
     11. Connect: both note ids are listed, each once.
     12. Reopen item 1 (saved by API process 1, read from process 3):
         - file SHA-256 `ef77aad9…` equals the rendered SHA-256, and both hashes are verified;
         - same source id, marked not reimported;
         - request `Why is trace(A²) = 13?  为什么？ ` and note `My note: λ₁² + λ₂² = 4 + 9.\nSecond line 🙂` exact;
         - labeled a user note with `authorship user`;
         - provider unavailable.
     13. Reopen item 2 with its note exact.
   - **Token exposure scans.** After each of the three connections, the token was absent from the DOM, the token
     field, the address, `localStorage`, `sessionStorage`, cookies and the page state.
   - **Direct server readback** (Node, outside the browser):
     - the source bytes hash to the file's SHA-256, and the DOM bytes to the frame hash;
     - the user text is exact;
     - `ai_status: provider_unavailable`;
     - the note is `kind: ai`, `authorship: user`, revision 1, and the observation actor is `user`.
   - **Secrets:**
     - The DSN is read from the local test-database handoff file into the API process environment only. The
       tokens go only into that environment and the browser steps file, which is deleted with the run's
       temporary profile.
     - Every log line (buffered to whole lines) and the report are redacted.
     - A scan of the committed evidence found neither the DSN nor any redaction marker.
   - Without the database handoff, Python environment or a free port 8174, this run is reported **BLOCKED** and
     the check exits non-zero. This was seen once, when the archive path was wrong before a fix; it is never
     reported as a pass.

## Internal review of the adapter (before delivery)

One independent read-only review of the uncommitted adapter. Its findings and what was done:

| Finding | Disposition |
| --- | --- |
| Discarding an unknown save could orphan a committed note (the id list was written only after a receipt) | Fixed: pending before sending, resolved on each list |
| A refused retry turned "unknown" into "Not saved … nothing was applied" | Fixed: unknown stays unknown until a receipt; check asserts it |
| Reopen/Open cleared words typed while their read was in flight | Fixed: re-check after the await |
| The harness trusted the DSN target and hard-coded the database name in the report | Fixed: parsed, refused unless `lc_p0_test` on socket/loopback; parsed name recorded |
| No real-API replay of a committed save | Added: step 5 above |
| The time zone was taken again at each ASK (API refuses a mismatch) | Fixed: the source's zone is kept per view |
| `get()` did not check authorship, block layer, owner or receipt versions | Fixed |
| Redaction ran per output chunk | Fixed: whole lines |
| After a known refusal, fields stay read-only | Kept by design: Retry always sends exactly what is shown; Discard is the way to edit |

## Repair after lead review of `9c1d070` (data loss)

Lead's review reproduced the defect on Edge/CDP. The sequence was: open a UTF-8 file, ASK "alpha", type a note
(no save attempt yet, Close disabled), ASK "gamma". The note was cleared, the selection switched to "gamma" and
Close was enabled, with no warning.

Cause: the page's outcome handler guarded only an unresolved save attempt, not typed words.

Repair (`8989b61`): the handler uses the same unsaved-work rule as Close, Open and Reopen. The new selection is
not added, the typed words and their selection stay, and the page says why. The probe's outcome hook runs after
the card is shown, so the page can withdraw the card of the selection it did not add. Default behavior for other
pages is unchanged (self-test 54/54). With three typed fields, "typed words" now means any of:
- a non-blank request;
- a non-blank note;
- a title changed from the suggestion.

The [before-fix report](evidence/p0-07-preview-before-fix.json) is kept as the historical failing run against
`9c1d070`.

## Not done, and remaining gaps

- **Token expiry by time.** The one-hour expiry was not waited for. A restarted API with a new token produces the
  same 401 path, which was exercised.
- **A lost answer after a real commit.** This was not produced through the UI. The unknown outcome in the run
  came from a stopped API, so the request never arrived. What was shown on the real API: the identical request's
  replay (step 5), and pending-id recovery. The recovery path itself is unit-tested against the stand-in.
- **The reopen/open re-check after the read** is a code guard without a dedicated browser test. The test double
  and the local API answer too fast to open the window.
- **Retry bodies across a reload.** They live in page memory. A reload with an unsaved item asks the browser to
  confirm leaving (it blocked the run's navigation once, as designed). The pending id survives the reload; the
  typed text of a save that never arrived does not.
- **Loopback relay.** Through the Windows-to-WSL loopback relay, the first request after an API restart once went
  unanswered for the page's full 20 s timeout. The page showed "Outcome unknown" (correct), and the check now
  waits for reachability after each restart.
- **Test-database rows.** Each check run leaves its own rows under its fresh `webchk-*` identity in `lc_p0_test`.
  The preview API has no deletion endpoint, and the check never writes to the database directly.
- **Losing the id list.** If `localStorage` is cleared, saved notes stay on the server but the page cannot list
  them; there is no list endpoint. Reopen-by-id is not offered in the UI.
- **Labels in the id list.** The list keeps each note's title and file name in this browser until a reopen gets
  `not_found`.
- **Known UI limits:**
  - the saved selection is not highlighted again in the reopened document;
  - CR-only line endings display as spaces, though the stored bytes are exact;
  - a selection with no typed words can be closed without saving;
  - the silent card can cover part of the side panel.
- **Out of scope:**
  - real AI explanations (no provider);
  - Safari, iPad and Pencil;
  - real course pages;
  - the original-screen overlay (R59/A44);
  - Notability (A46);
  - audio;
  - deletion;
  - full P1.
- **Next owner:** lead integration (replace `wire.ts` with the generated import when `team/web` can take main),
  then QA's actual UI workflow.
