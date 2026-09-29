# Local real-document preview

This additive P0-04/P0-07 API accepts an explicitly chosen UTF-8 document, a real
ASK selection and the user's own text, then returns the exact archived context
after API process restart. It uses the existing PostgreSQL archive. It does not
generate an explanation: every save/read says `provider_unavailable`.

Wire: [document-preview.0.1.0](../../packages/contracts/document_preview/README.md),
including generated TypeScript/OpenAPI and complete request examples. The existing
v1, capture and control payload families are unchanged. The default v1 app does
not expose these routes. `import_fixture` remains synthetic-only.

## Start and connect

Use the project's existing locked backend environment. Inject `LC_DATABASE_URL`
for your authorized local PostgreSQL database privately. Apply the existing module
migrations once through `python -m services.api.migrations apply` if needed. No
new schema migration is needed for this preview; existing original-record kinds
and two small linkage records (`preview_import`, `preview_save`) retain filename,
request/selection provenance and retry fingerprints. They do not duplicate source
or note bodies or create a second identity store.

Set the names in [preview.env.example](preview.env.example). Supply a random token
of at least 32 printable ASCII characters without whitespace through your trusted
environment mechanism. Do not put it in a document, URL, browser content script
or source-controlled file. Keep the same explicit user/device/session IDs between
restarts; the factory creates absent local ownership/membership once and refuses
to restore revoked/deleted identity. Tokens expire one hour after startup; start
with a new token when needed. This is explicit local test auth, not production
OAuth or an external account connection.

```sh
python -m services.api.preview_local --port 8174
```

This foreground process binds only `127.0.0.1`; stop it with Ctrl-C. It does not
start PostgreSQL, migrate automatically, seed a fixture, enable a paid provider,
or start a persistent service. Proxy headers are disabled. Client peer and Host
must be loopback. An Origin must match the API origin or the exact optional
`LC_PREVIEW_UI_ORIGIN` (HTTP loopback with explicit port). The latter enables CORS
only for the trusted application UI, such as a separately running Web dev UI.
Course pages and wildcard origins are rejected.

Use `Authorization: Bearer <injected token>` on every request; POST also requires
an Identifier-valued `Idempotency-Key`. All successful operations return 200.
The generated API definition is available at `/openapi.json`.

1. `GET /preview/v1/session` returns the actual owned identity and membership.
2. `POST /preview/v1/documents` imports `DocumentImport`: full bytes as canonical
   base64, exact SHA-256, source ID/version, filename, device/session/timezone and
   nullable project. Start version 1; intentional later versions increment by one.
3. Bind Web's existing source resolver to the receipt. On explicit ASK submit
   `DocumentSave` to `POST /preview/v1/saves`. Preserve BOTH request objects and
   the exact UTF-8 `frozen.artifactBytes` from Web, with their frame and selection.
   Include the original user request/note strings; they stay user-authored.
4. `GET /preview/v1/saves/{note_id}` returns exact source bytes and version, DOM
   bytes, frame, requests, user observation and saved note revision 1, even if the
   normal v1 note head later advances. The observed ASK confirmation time remains
   distinct from the earlier frozen-frame capture time.

For a small trusted Python client after configuration (variables below are existing
in-memory values from the UI flow, not documents containing credentials):

```python
import os
import httpx

with httpx.Client(base_url="http://127.0.0.1:8174", trust_env=False,
                  headers={"Authorization": "Bearer " + os.environ["LC_PREVIEW_TOKEN"]}) as client:
    identity = client.get("/preview/v1/session").raise_for_status().json()
    imported = client.post("/preview/v1/documents", json=document_import,
                           headers={"Idempotency-Key": import_key}).raise_for_status().json()
    saved = client.post("/preview/v1/saves", json=document_save,
                        headers={"Idempotency-Key": save_key}).raise_for_status().json()
    reopened = client.get("/preview/v1/saves/" + saved["note_id"]).raise_for_status().json()
```

Exact bodies are in the contract's `examples.json`; replace identity fields from
the session result and supply actual user-selected bytes. The example's note and
requests are illustrative, not generated AI output.

## Preservation and stopping

Complete source bytes preserve BOM, Unicode, CRLF, trailing whitespace and final
newline separately from DOM context. DOM has no screenshot pixels; it may contain
only an excerpt. Inputs are bounded explicitly (source 2 MiB, DOM 1 MiB); invalid
UTF-8, NUL, hash/binding mismatch and conflicting retry fail atomically. No silent
truncation is allowed. Client page/version labels are reported context, never
independently verified browser access. The server sets provenance using the
authenticated import, and does not assert independently verified document rights.

The original v1 NoteRevision enum lacks a typed-user-note variant, so its legacy
`kind:ai` container carries `authorship:user` and a `user_original` text block.
Label it as a user note. It is neither AI output nor editable pen strokes.

Every operation rechecks authorization generation, token expiry, ownership and
active device/session membership under the actor transaction. Exact retries
recheck current fences. Existing source deletion also removes preview metadata and
cached content; it preserves minimal tombstones so old retries cannot resurrect it.
No preview deletion endpoint or guessed process contract is introduced.

To disable the preview, stop its own process and unset the opt-in. Do not roll back
database tables to disable a route: originals stay in the canonical archive. Normal
explicit source deletion remains the authorized data-erasure path.

## Focused verification

```sh
python -m pytest -q packages/contracts/tests/test_document_preview.py services/api/tests/test_preview.py services/api/tests/test_preview_http.py services/api/tests/test_preview_local.py
python -m services.api.tests.postgres_preview_check
```

The second command requires a privately supplied `LC_TEST_DATABASE_URL` for the
explicit dedicated `lc_p0_test` database. It verifies the actual local target,
uses unique test actors and supervised ephemeral loopback API processes, and
cleans only its own actors. Missing configuration is BLOCKED, not a green skip.
Never run it against other databases or substitute a MemoryStore result.

This module does not supply the Web interface. Next integration owner is Web,
followed by lead integration and QA's actual UI workflow. Full daily learning,
long-term retrieval, native device audio/screen/ink, official Notability import
and provider acceptance remain separate and unverified by this preview.
