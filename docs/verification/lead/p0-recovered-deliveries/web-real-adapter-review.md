# Real preview adapter review — 096cac1

**HOLD for three bounded adapter repairs.** Exact Web delta `8989b61..096cac1de412de4761e672a0e8478f89a3a59146`, reviewed against released `document-preview.0.1.0` on main `b494fdf`. Current P0-07 card and complete affected save/readback flow refreshed; unchanged source requirements/workflow from the prior review retained. Candidate code is isolated at `/tmp/p0-web-real-adapter-fek88wij`; main/worker trees are untouched.

## 1. Medium: the advertised timeout ends before the response body is read

`apps/safari-extension/preview/src/api-store.ts:98–115`: `call()` clears its abort timer in the `fetch()` finally block, then awaits `response.json()` without a deadline. Fetch can resolve when response headers arrive, while its body remains stalled. In that case save never settles, so the UI remains `Saving…`, fields/Close/Open stay locked, and Retry/Discard stay hidden (`preview-page.ts` rendering/sendSave path).

Exact focused probe: connect to the in-process response stand-in, return HTTP 200 headers for save with a stalled `ReadableStream` body, set `timeoutMs:15`, wait 80 ms. Actual: `{settled:false, signal_aborted:false}`. After explicitly erroring the stream for probe cleanup, save finally becomes `unknown`. This is a controlled transport-fault reproduction, not a PostgreSQL or real-browser result.

Narrow fix: keep the existing abort deadline alive through body consumption; clear it after the entire response-read attempt. Body failure on a write must settle as unknown and retain the identical payload/id for retry. No new timeout framework is needed.

Regression target: headers received + stalled/truncated body must settle within the configured deadline; unknown save preserves its pending id, user text and retry identity. Cover the body read, not just a rejected fetch.

## 2. Medium: pending lookup/readback can promote invalid responses to saved/verified

`api-store.ts:140–144`: `resolvePending()` treats every HTTP 200 as confirmation. It does not check contract version, requested note id, identity or `persistence`. A JSON `null` becomes `state:'saved', saved_at:null`. This is also reachable from an incomplete/invalid JSON response because `call()` catches `response.json()` failures, sets `payload=null`, and returns that value on 200 (`:113–119`). The UI then labels an unconfirmed item as saved.

`api-store.ts:291–329`: `get()` checks a subset of fields and the two hashes, but not the released record relationships. Starting with the **valid released `examples.json:SavedPreview`**, the probe changes only:
- `frame.source_id` to `source_other`;
- `note.user_id` to `user_other`;
- `observation.actor` to `assistant`.

Actual: the adapter accepts the item and reports `verified:{source:true,frame:true}`. Its returned source is `local-document-1`, while its frame names `source_other`; the foreign note owner and non-user observation are also returned. The bytes/hashes are unchanged, demonstrating that hash correctness does not establish those bindings. This is a controlled invalid-response test; the reviewed backend is **not** alleged to emit it.

The released Python validator accepts the original example and refuses each individual mutation:
- frame source: `Selection/frame mismatch: source_id`;
- note owner: `Saved preview must bind the exact source, ASK and user-original note`;
- observation actor: `Saved preview must bind the exact source, ASK and user-original note`.

Narrow fix: share a small response/binding check between pending reconciliation and reopen. Before promoting a pending id, require a valid successful response for that exact id and current user. Before exposing a reopened item as its source/context, check the existing wire's source/frame/selection/request and user-note/observation relationships, including revision, user-original block/text, and matching request text. Keep an invalid/incomplete 200 pending (or visibly refused on reopen), never saved. Reuse the released field names/types; no new schema, shared protocol, dependency or validation framework is requested.

Regression targets: HTTP200 null/truncated JSON, wrong returned note id, and the three isolated binding mutations above; the valid released example remains accepted. Generated TypeScript imports alone do not perform these runtime checks.

## Independent verification and exact evidence

Commands run in the isolated candidate:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/p0-07-preview.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --noEmit -p apps/safari-extension/tsconfig.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/p0-web-real-adapter-fek88wij/review-adapter-probes.mjs
```

Results: **18/18 focused tests pass; typecheck/build pass.** No full 105-unit, 33-browser or broader campaign rerun.

Recoverable artifacts in `/tmp/p0-web-real-adapter-fek88wij/`:
- `review-adapter-probes.mjs`: exact timeout, pending-null and semantic-binding reproductions; no service needed.
- `review-adapter-probes.json`: captured actual results.
- `review-bad-saved-preview.json`: controlled mutated response.
- `review-validator-results.json`: released-validator baseline and individual negative-case results.

For validator reproduction, use the existing main `.venv/bin/python` in this directory, load `packages/contracts/document_preview/examples.json`, call `validate('SavedPreview', value)`, and individually set the three fields listed above. The baseline passes, each changed response fails. No database or API process is used.

## Reviewed behavior retained and scope

- Token comes only from the owned UI password field, is cleared there on Connect, remains in the store closure, and is sent in Authorization with `credentials:'omit'`. Default origin is fixed loopback; CSP permits only self plus the preview API. Imported markup is textContent, never executed. No course script gets credentials. New check-only process control is absent unless explicitly supplied by the harness, not enabled by the launcher.
- Identity is read from the authenticated session at ASK; sequential reconnection refuses a changed user/device/session. Original UTF-8/BOM/newlines are retained, NUL/invalid/oversize are refused. Save sends the exact frozen DOM bytes and both requests, with no fixture AI.
- Unknown status is sticky across a later refusal, retry reuses the same payload/note id, pending ids are indexed before send, and Open/Reopen recheck unsaved work after awaited reads. Existing explicit-discard and typed-note protections remain. The browser-local id list is not a second archive; clearing it still removes discoverability, as the owner documents.
- Root's planned replacement of `preview/src/wire.ts` with the released generated import is appropriate and separate from these runtime fixes.
- Read owner evidence: **33/33 browser checks, zero runner errors**, including **16 real-API checks** and API restart/readback at backend `8a35663`; owner reports **105 unit tests**. Those are owner observations, not independently repeated here. The real unknown-save run stopped the API before receipt; it did not lose a response after a real commit. The report states that limitation.
- No account/provider, native Chats, browser/DB service changes or new dependencies used in this review. This remains the first owned-desktop preview slice, not iPad/original-live-screen/full-P1 acceptance.

Next owner: Web applies these three bounded repairs plus their focused regressions; lead replaces the temporary wire mirror during integration and proceeds to one combined user-workflow verification. Do not restart the prior design/review campaigns.

## 3. Medium recovery blocker: an interim 404 can orphan an unknown save's later commit

Requested narrow follow-up confirmed the server's actor transaction does **not** serialize a lookup against a POST whose request body has not finished arriving. Using the exact released `create_preview_app`, existing MemoryStore/auth/bootstrap and httpx ASGITransport (no socket or database process):

1. Import a valid document (200).
2. Start POST `/preview/v1/saves`, yield half its valid body, pause the body stream.
3. GET that note id while the POST is still awaiting its body: **404**.
4. Release the remaining body: POST becomes **200 server_committed**.
5. GET again: **200**.

The HTTP route awaits `body()` before entering `DocumentPreview.save` and its actor transaction, so the lock cannot make step 3 prove that the in-flight request will never commit. This verifies the actual ASGI request boundary; it does not claim a measured browser/Windows-relay timeout reproduction or PostgreSQL race.

The adapter's `resolvePending` at line 146 and `get` at line 288 drop the indexed id on any not_found. The separate exact-client probe shows `list()` empty at the interim 404 and still empty after the simulated later commit; direct `get(id)` succeeds, but the UI has no reopen-by-id entry point. After a reload/discard removes the in-memory attempt, this is loss of discoverability of a committed original/note.

Narrow fix: a pending/unknown entry must survive not_found while the earlier outcome remains unresolved. Keep it visibly pending/unconfirmed and retryable; distinguish it from a previously confirmed saved item whose deletion is known. Do not treat a point-in-time 404 as proof a prior uncertain write cannot finish. No new server protocol or background reconciliation service is requested.

Regression: unknown save → interim GET404 → later commit → next list/reopen still finds the original id, including a fresh ApiStore over the same index. Update the current test that expects every unknown/not_found entry to be pruned.

Exact probes and results:
- `/tmp/p0-web-real-adapter-fek88wij/review-pending-race.py` and `.json`: real ASGI app, MemoryStore, POST/GET ordering above. Command: existing main `.venv/bin/python review-pending-race.py` from this isolated directory.
- `/tmp/p0-web-real-adapter-fek88wij/review-pending-index.mjs` and `.json`: exact adapter drops the pending id, then direct GET can still find the later commit. Command: pinned Node `review-pending-index.mjs` from this directory.

## Publication follow-up

Visually inspected all **10 PNGs changed/added by 096cac1** (four API, four test-double, two unconnected) and scanned the exact candidate JSON. No API bearer token, DSN, Windows/private profile path or credential was found. The token field is blank in unconnected images and absent/cleared in connected images. Shown `webchk-*` ids are synthetic run identities, not credentials. PNGs have no tEXt/zTXt/iTXt/eXIf metadata chunks. JSON has zero bearer literals, DSN URIs or Windows profile paths; its `api.dsn` value is the harmless label `not recorded`. Its three owner token-exposure scans report false in DOM/field/URL/storage/cookie/page-state/history; those scans remain owner evidence. No raw credentials were read or printed.

Low-severity documentation follow-up from lead: the packaged README's no-macOS/Xcode wording is stale relative to the separate hosted-build evidence; scope that sentence to the local environment and keep real-device/package operation distinct. This wording change can accompany Web's bounded fixes and is not a fourth behavioral blocker.
