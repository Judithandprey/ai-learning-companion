# Web saved-library checkpoint review

**Decision: HOLD integration of `cc006fdc55a1e935c929f45ccc95a07ca4293ab5` for one stale-auth defect. Preserve the commit; continue the separately assigned original Safari-page work.** No library acceptance campaign or production fix was started here.

Scope: parent `b471bdf301e5d7b598f7fe387f7fe651e1177310`, target main `d9fe670`. Read complete changed code, focused test/runner, delivery report, released discovery contract, R17/R27–32/A09–12 and V-ArchiveCompanionContinuity. Relevant original/English source hashes match the manifest. Workflow remains `4a2be79`; PONYTAIL LITE applied. All pre-existing changed source/script/CSS files match parent versus main except `preview/src/wire.ts`.

## Blocker LIB-AUTH-1 — overlapping initial connections mix the identity and library credential

**Medium; required before exposing the new library metadata.** References in delivered `apps/safari-extension/`:

- `preview/src/api-store.ts:203–217`: `connect()` captures the old session, overwrites the shared token, awaits the session response and then installs that response unconditionally. Two first connections both capture `previous === null`.
- `preview/src/api-store.ts:312–341`: new `library()` checks only that a session/token exist, calls the list endpoint with the current shared token and accepts the returned metadata. The list has no user field to bind against the current identity.
- `preview/src/preview-page.ts:473–491`: UI renders before `api.connect()` changes status to connecting. It does not immediately disable connecting controls; Enter also invokes connect without an in-flight guard. Thus overlapping initial connection calls are reachable in the event flow by source inspection.

Minimal independently executed reproduction (fake fetch only):

1. Start `connect(A)` and, before it resolves, `connect(B)`.
2. Return the valid session response for A; leave B's session response pending.
3. A completes and the store reports `status: connected`, `identity.user_id: A`.
4. Call `library(null)`. Its request uses B's token and returns B's note title/filename/source metadata as the connected identity's library.

Exact observation:

```json
{"visibleIdentity":"A","status":"connected","listedNotes":["note_B"],"requests":[{"path":"/preview/v1/session","user":"A"},{"path":"/preview/v1/session","user":"B"},{"path":"/preview/v1/saves","user":"B"}]}
```

Portable reproduction and result are preserved at:

- `/tmp/web-library-checkpoint-f_j_hblx/auth-overlap-probe.mjs`
- `/tmp/web-library-checkpoint-f_j_hblx/auth-overlap-result.json`

Run with `/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/web-library-checkpoint-f_j_hblx/auth-overlap-probe.mjs`.

The underlying shared-token connection race predates this checkpoint. The new regression is accepting unbound metadata under the mismatched displayed identity; existing exact-note reopen instead validates the saved payload against the captured user. UI list generations alone do not prevent the reproduction: A's completed connection starts a current-generation list before B completes.

**Runtime limit:** this is an independently observed fake-fetch multi-identity race, not a reproduced breach of the running local API. Lead confirms the current local API binds one configured user. No running API, user preview, browser, Paperclip or database was accessed. Do not describe this result as obtaining another real user's data from that deployment.

**Narrow owner action at the next safe boundary:** prevent overlapping connection attempts from mixing credentials/session state, and refuse/discard stale authenticated list completions. A direct in-flight connection guard or a carefully bound connection generation is sufficient; no schema, new framework, service or library redesign is required. Regression target: the above two initial connections cannot make A's connected store issue/accept B's list; stale results cannot replace the current connection. Keep current drafts and unknown-save payload/identity unchanged.

## Other review results and evidence limits

- New list calls send bearer credentials only through the existing in-memory fetch header path (`credentials: omit`, no-store, bounded body deadline). Nothing new persists tokens or places them in a cursor/URL.
- Cursor is bounded and URL-encoded without decoding/reinterpretation. Server order is retained; load-more appends deduplicated IDs. Refresh/load-more/hint generations and unmount checks drop older list renderings. This does not repair the credential/session race above.
- Authoritative rows and local hints render in distinct sections using text nodes. A complete list suppresses stale confirmed local hints, while unresolved pending IDs remain recoverable. Older-server 404/405 is explicitly unavailable, not an empty archive; missing listed-note reopen is honestly reported.
- Listing does not mutate draft, attempt, original bytes or note fields. Reopen keeps the existing pre/post-await unsaved-work guard and saved-payload binding/hash checks. No new draft/data-loss blocker found in the reviewed delta.
- Independently ran only `node --test tests/p0-07-library.test.ts` on the isolated main-contract candidate: exit 0, one test-file group containing the 10 declared focused tests. No broad/module/browser/DB campaign was replayed. The author's 123-module, 7-panel and 10-reselect claims remain owner evidence, not independent acceptance here.
- Minor stale documentation: the `api-store.ts` header still says there is no list endpoint. Update that sentence with the owner correction; it is not an additional integration blocker.

## Exact wire conflict guidance

Main's canonical generated import must win; do not choose the delivered mirrored file wholesale. Keep its existing version export, generated `PreviewError` import and derived `PreviewErrorCode`. Extend the generated type re-export to:

```ts
export type {
  SessionInfo, DocumentImport, ImportReceipt, DocumentSave, SaveReceipt, SavedPreview,
  LibraryCursor, SavedLibraryQuery, SavedLibraryItem, SavedLibrary,
} from '../../../../packages/contracts/document_preview/generated/contracts.ts';
```

Append only `libraryPageMax: 50` and `cursorMax: 512` to the existing frozen `LIMITS`. These types already exist in main's released generated contract. No generator/schema edits or example-fixture restoration are needed. Other pre-existing touched files have byte-identical bases; new script/test/evidence paths are additive.

Scratch candidate `/tmp/web-library-checkpoint-f_j_hblx` is main's module/contracts plus only the delivered changed paths, with precisely that wire resolution. Main and worker trees were not edited. Lead will preserve this report and checkpoint and coordinate the single bounded owner correction without expanding or delaying original-page capture.
