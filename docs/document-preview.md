# Run the local document preview

This P0-07 desktop slice opens an actual local UTF-8 document, retains its complete
original separately from selection-time DOM context, and saves the user's request
and note to the existing PostgreSQL archive. Reopen reads those records from the
API, including after an API-process restart. No AI provider is connected: ASK
shows the request and an explicit unavailable state, without a generated answer.

Current integration/acceptance: see the [P0-07 card](tasks.md#p0-07-next-user-operable-outcome)
and [actual operation evidence](verification/lead/p0-recovered-deliveries.md).
Exact main `54063bf` passed the [real browser/API/PostgreSQL save/restart/reopen check](verification/lead/p0-recovered-deliveries/preview-main-54063bf/report.md).
The three demonstrated failure-boundary repairs also passed their focused independent retest;
role-QA acceptance is recorded separately when delivered. This is an owned-document
fallback, not a packaged Safari extension, original-course overlay or iPad app.

## Start

Use two foreground terminals in the repository root. The existing locked Python
environment, pinned Node/TypeScript and an authorized local PostgreSQL database
with the existing migrations must already be available. The launcher does not
install dependencies, initialize/reset a database or start a model service.

In the first terminal, supply the private values listed in
[preview.env.example](../services/api/preview.env.example) as environment variables:

- `LC_DATABASE_URL`: the authorized local database connection, never a public URL
  to share in a document or screenshot.
- `LC_PREVIEW_TOKEN`: a random token of at least 32 printable ASCII characters,
  with no whitespace. Keep it privately for the Connect field.
- `LC_ENABLE_DOCUMENT_PREVIEW=1` and explicit `LC_PREVIEW_USER_ID`,
  `LC_PREVIEW_DEVICE_ID`, `LC_PREVIEW_SESSION_ID`. Keep those three identifiers
  unchanged when restarting to reopen the same records.

Then run:

```sh
export LC_PREVIEW_UI_ORIGIN=http://127.0.0.1:4173
.venv/bin/python -m services.api.preview_local --port 8174
```

In the second terminal:

```sh
bash apps/safari-extension/scripts/preview.sh
```

Open **http://127.0.0.1:4173/preview/** in the same computer's browser. Enter the
API token and press **Connect**. The field clears; credentials remain only in page
memory and are forgotten on reload. A wrong/expired token is visibly refused.
If using the project's existing WSL setup, Windows Edge is the measured browser
route. A startup error or unreachable local address is not a running preview.
Stop each foreground process with Ctrl-C; this does not delete saved originals.

## Try one complete flow

1. Choose a `.txt`, `.md` or other UTF-8 file with **Open a UTF-8 document**.
   Markup renders as text. The complete original is registered, including BOM,
   Unicode and line endings; invalid UTF-8, NUL or files over 2 MiB are refused.
2. Press **? / ASK** in the toolbar, then select text in the document. The side
   panel shows the selected text/context and provider-unavailable state.
3. Enter your title, request and note. Press **Save** and wait for **Saved**.
   A timeout is **Outcome unknown**, not success; Retry retains the same payload
   and note identity. Unsaved text blocks replacement until saved or discarded.
4. Close the document. Restart the API with the same identity (and a fresh token
   when needed), reload the page, reconnect and press **Reopen** in Saved items.
   The original, selection context and exact user text come back from storage,
   without importing the file again. The user note remains distinct from AI.

The token expires one hour after API startup. Reconnect with the current token
after restart; a different user/device/session on an already connected page is
refused rather than silently reassigned.

## Current limits

- Saved IDs and list labels are browser-local; originals are on the server.
  Clearing that browser storage loses the current UI's discovery list. There is
  no server list endpoint, reopen-by-ID UI or cross-device discovery in this slice.
- An uncertain save stays listed as not confirmed until a valid read confirms it;
  a point-in-time 404 does not prove an earlier POST cannot finish. An ID that
  never commits can remain pending; no remove action is available yet.
- This is explicit local development authentication. It is not production login,
  course access, AI teaching, long-term memory or a full P1 exit.
- DOM context contains no screenshot pixels. This does not verify original-screen
  writing, iPad/Pencil/audio, Notability import or understanding a real screen.
- `?store=test-double` is a separately labeled, nonpersistent UI test mode. It is
  never used as fallback when the real API is unavailable.

Protocol and exact backend configuration are in [PREVIEW.md](../services/api/PREVIEW.md).
