# Local UTF-8 document preview — document-preview.0.1.0

Bounded P0-04/P0-07 wire slice, delegated by lead. Existing v1 0.1.0,
capture 0.2.0 and control 0.2.1 files remain unchanged. This contract describes
an explicitly enabled local preview; it is not production login, AI, pixel capture,
ink, provider/device or original-goal acceptance. See generated OpenAPI/types and
`examples.json` for exact payloads. All objects are closed. All success responses
use HTTP 200. Errors contain only `contract_version` and the finite `code`.

## Trusted UI flow

1. Authenticate with the explicitly configured local backend token, retained only
   by the trusted application UI. Never put credentials in a course content script,
   document, URL or saved archive. Read `GET /preview/v1/session` for the owned
   user/device/session and current authorization/membership revisions.
2. Read a user-chosen UTF-8 document as bytes. POST `/preview/v1/documents` with
   `DocumentImport`, an `Idempotency-Key`, full canonical base64 and SHA-256 of
   those exact bytes. No trimming, decoding-with-replacement or newline conversion.
   BOM and non-ASCII text are preserved. Source IDs are client-generated Identifier
   values; start version 1 and increment by one for each intentional new version.
   The server derives document provenance/attribution from the authenticated action.
   The caller cannot supply origin/consent/license labels. `project_id:null` is the
   local default; a non-null project must already belong to this account.
3. Bind the existing Web `ProbeSession.resolveSource` to the returned snapshot.
   On explicit ASK retain BOTH `BridgeRequest` and `ExplanationRequest` unchanged.
   Submit `DocumentSave` to POST `/preview/v1/saves`: unique note ID, those requests,
   Frame, canonical base64 of the EXACT UTF-8 `frozen.artifactBytes`, user title,
   `request_text` and `user_note`. Never recompute DOM JSON after hashing. Frame
   representation is `dom_snapshot`, DOM pixels are `not_captured`; media is null
   for this finite local-document flow. The page's document_version is reported
   context, not a trusted source version. Source/version ownership is resolved by
   the server. DOM context is separate from the complete source; a truncated DOM
   window must never replace source bytes. Origin/path are reported DOM context,
   not independently verified browser access or permissions.
4. Show saved only after `persistence:server_committed`. Reopen with
   `GET /preview/v1/saves/{note_id}`, including after API restart. The result returns
   the same exact source version, full source bytes, DOM bytes, both requests,
   user observation and original note revision. `ai_status:provider_unavailable`
   is mandatory: no fake fixture card or generated explanation for real input.

Web's internal Identity origin currently permits synthetic_probe/native_bridge;
its owner must add a truthful local-preview origin without changing v1 wire types.
No authenticated cross-origin content-script endpoint is part of this contract.

## Persistence and negative cases

The server rechecks token expiry/revocation, actor, owned device/session, active
membership and authorization generation in the same actor transaction as every
read, mutation and replay. An absent auth adapter or store fails closed. The
local bootstrap must not re-enable a revoked identity/membership on restart.

Each import/save is atomic. Immutable originals use the existing SourceSnapshot,
Frame, Observation and NoteRevision archive and version reads. Save records the
actual caller's explicit request and original text; it does not attribute user text
to AI. Existing v1 NoteRevision has only ai/handwritten kinds: typed originals use
the legacy `kind:ai` text container with `authorship:user` and `user_original`
blocks. UI must label this as a user note; it is not an AI response or ink record.

Idempotency is owner/method/full-path/key/full-body scoped. Exact retries return
the original receipt without duplicate originals. A changed body conflicts (409).
Different keys cannot overwrite a source version, note, frame or artifact. Current
authorization/deletion checks precede retry. Source deletion removes preview
content and replay bodies in the existing transaction; stale retries cannot revive
it. No paid provider or external write is attempted.

UTF-8 source maximum is 2 MiB, DOM artifact maximum 1 MiB; title 1–300 characters,
request/user note at most 65536 each. These are explicit engineering preview
limits, not product capacity acceptance. Unsupported/invalid UTF-8, NUL, duplicate
DOM JSON keys, noncanonical base64, hash mismatch, wrong identity/version/frame,
nonfinite numbers and malformed geometry fail without partial writes (422;
ownership failures 403/404). Full original UTF-8 cannot silently be truncated.

Generate/check with `python -m packages.contracts.document_preview.generate [--check]`.
Wire tests are not PostgreSQL or API-process restart evidence; backend delivers
that separately under `docs/verification/backend`.

## Additive saved-library discovery (P0-07)

`GET /preview/v1/saves` returns `SavedLibrary` under the existing read scope.
This additive endpoint preserves every previously published definition and
operation in document-preview.0.1.0; it adds no fields to old responses. Old
servers can return 404 or 405: clients must explain that discovery is unavailable and
must not report an empty archive. Existing explicit-ID reopen remains compatible.

The optional `limit` is a decimal integer 1–50 (default 20). The optional `cursor`
is an opaque nonempty string of at most 512 characters supplied by the previous
page. Reject unknown/repeated query keys, invalid limits and malformed cursors
with 422. Clients pass the cursor unchanged with URL encoding; it is neither an
authorization credential nor a note identifier. Server cursor encoding carries
the ordering position rather than looking up an anchor that may have been deleted.

Items contain only the owned note ID, title, source filename/ID/version and note
creation time. Order by creation instant descending, then note ID descending.
`next_cursor:null` means no further eligible rows at that read; a non-null cursor
advances strictly past the last returned position. Paging is a live authorized
view, not a frozen multi-request snapshot. Newer saves become visible on refresh;
deletion/revocation takes effect on every page and exact-note read. Equal timestamps
must not duplicate or omit notes; a removed prior anchor must not break continuation.
Page size never limits how much original history can be retained or discovered.

Use the current actor archive and authorization/membership checks. Never expose
another actor's existence, deleted/revoked source metadata, or stale local-cache
titles as current server results. Invalid retained metadata is an unavailable
result, not a silently omitted record or successful empty archive. Listing does
not rewrite originals, return generated teaching, or call a provider. Original
bytes, frame, request and user note are still obtained from `SavedPreview` after
an explicit reopen. This is bounded desktop continuity, not full A09–12,
V-ArchiveCompanionContinuity, cross-device authentication or native iPad acceptance.
