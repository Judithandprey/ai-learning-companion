# P0-07 web: user-operable desktop document preview (early fallback)

- **Date:** 2026-09-29 UTC. **Owner:** web (05).
- **Handoff:** lead `handoff_401a9fc977503d93ce7536dc16a3f9d6`.
- **Scope:** `apps/safari-extension/**` and `docs/verification/web/**` only. No shared contract, dependency,
  root or migration file changed.
- **Baselines read:**
  - `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`: `docs/workflow.md`, `docs/roles/web.md`, the `docs/tasks.md` P0-07
    card, AGENTS/TEAM/CLAUDE changes, and `docs/requirements.en.md` R03/R06–R10/R17/R27–R32/R43–R44 and
    A02/A03/A10–A12/A19/A23.
  - Contract `0.1.0` types in `packages/contracts/generated/contracts.ts`.
  - No committed `packages/contracts/document_preview/**` exists yet.
- **Branch note:** a normal merge of main `4a2be79` into `team/web` was denied by the session's permission
  classifier and was not retried. Web paths on main equal `team/web`'s tree at `db7400f`, so nothing here
  depends on the merge.

This is an **explicitly labeled early desktop fallback**: an owned page showing a local UTF-8 document. It is
not the original course page (R03/R59), not the iPad/Pencil path, and not real AI understanding. It passes none
of those requirements in full.

## Outcome and how to reach it

```text
$ apps/safari-extension/scripts/preview.sh
Document preview: http://127.0.0.1:4173/preview/
  storage is not connected there; to exercise save/retry/reopen with the labeled in-page test double:
  http://127.0.0.1:4173/preview/?store=test-double
Press Ctrl+C to stop.
```

The script builds the module with the lead's pinned Node/TypeScript and serves only the module's own pages on
127.0.0.1:4173, the lead-allocated probe port. It runs in the foreground until Ctrl+C. The page and the server
both apply a strict CSP: `default-src 'self'`, no inline script or style, `object-src 'none'`, `base-uri 'none'`
and `form-action 'none'`.

What the user can do on the page:
1. **Open a real local UTF-8 document** with the file chooser.
   - The bytes are decoded as strict UTF-8 and checked to re-encode to the same bytes; the SHA-256 of the bytes
     is shown.
   - Invalid UTF-8 is refused ("no encoding was guessed").
   - Files over 5 MiB (an engineering default) are refused; nothing is truncated.
   - A BOM, CRLF/LF/CR, markup, non-ASCII, emoji and combining characters are kept exactly.
2. **See it rendered as inert text.**
   - Each paragraph and blank-line gap is a `p`/`div` whose `textContent` is the exact substring, so the rendered
     text joins back to the original.
   - Markup in the file never becomes elements, and no script or handler runs.
3. **Explicit select + ASK**, with the existing `installProbe` / `ProbeSession`, reused unchanged except for
   three optional hooks (below).
   - Press ? in the toolbar, then select text: a mouse drag gives `explicit_text_ask`; a tap, sweep or lasso also
     work as on other pages. NAV and WRITE are unchanged and never request anything.
   - The mark is frozen as a hashed `dom_snapshot` frame (no pixels). Its context is the selected paragraph,
     truncated to 1,000 characters. The complete original is kept separately.
4. **See the request state.** The side panel shows the selected text, the context at selection time and
   "Request `req_…`: no explanation generated. The explanation provider is not connected."
   - The silent card says "Provider unavailable".
   - No fixture text is ever used for real content: the preview session has an empty fixture list.
5. **Add their own note or question and save.**
   - The note is saved exactly as typed, attributed to the user.
   - Save status is one of: not saved yet / saving / saved (committed time and item id) / not saved (reason) /
     outcome unknown.
   - Retry resends the identical item, so it cannot duplicate.
   - While an item is unsaved (failed or unknown) or a typed note is unsaved, Close, Open and Reopen are
     disabled. A new selection is not added, and "Discard unsaved selection" is the explicit way out. Leaving the
     page asks the browser to confirm.
6. **Close and reopen.**
   - Closing clears the document view; saved items stay listed.
   - Reopen obtains the item and the complete original **from the store**, not from page state. It verifies the
     stored original against its SHA-256 and shows the source (marked "reopened from storage, not reimported"),
     the saved selection, frame, context, the note exactly as typed, and the AI state kept separately.

Selections are bound to a document only when the mark lies inside the document text, is on the currently
opened view, and the document is registered. Anything else submits nothing, and the card says why.

## Storage boundary (replaceable)

`preview/src/store.ts` defines `PreviewStore`: `importDocument`, `save`, `list`, `get`, plus a displayed
`description` and the store-supplied `identity`. The records are existing 0.1.0 shapes:

| Saved part | Shape |
| --- | --- |
| Registered document | `SourceRef` returned by `importDocument` (the complete original text, byte length, SHA-256, name) |
| Selection-time context | `Frame` (`dom_snapshot`) plus its exact artifact bytes (`frame.content_hash` = SHA-256 of them) |
| What was marked | `Selection` |
| Request and AI state, kept separate | `ExplanationRequest`, `ExplanationCard` (`provenance: none`, `status: unsupported`) |
| The user's own words | `Observation` with `actor: user`, bound to the source and frame, text exactly as typed |

The `item_id` and the envelope that groups these records are local placeholders, not shared fields. The real
field names, the `device_sequence` source, identity and authorization come from the backend/lead preview
contract.

Two stores exist:
- **Default: `unconnectedStore`.**
  - Every call fails with "Storage is not connected: nothing was registered or saved".
  - The page says so in its header. A document can be opened and read.
  - An ASK on it submits nothing, and the card explains that the document is not registered.
- **`?store=test-double`: an in-memory stand-in held by the page.**
  - The header says, in red, that it is not persistent storage and that reloading loses it.
  - It checks what a real store must check: registered source; the same source, user and frame across records;
    the artifact hash; an existing `item_id` with different content refused; an identical retry returned as a
    duplicate.
  - Failures can be injected: `reject`, and `lost_response`, where the call is applied and the answer is lost.
  - `restartUi()` rebuilds the UI from the same store object. This is **not** a page reload, an API restart or
    persistence.

## Checks and evidence

| Check | Result |
| --- | --- |
| `apps/safari-extension/scripts/check.sh` (typecheck, `node --test`, build) | typecheck pass, **96/96** (87 before + 9 new in `tests/p0-07-preview.test.ts`), build pass |
| `scripts/preview-check.mjs` on Edge 154 headless, trusted CDP input | **16/16**, 0 runner errors: [p0-07-preview.json](evidence/p0-07-preview.json), screenshots `evidence/p0-07-preview-*.png` |
| Existing probe self-test after the `page.ts` hooks | **54/54** (defaults unchanged) |
| Foreground launcher | built, served `/preview/` with the CSP header, stopped on SIGINT (exit 0) |

`tests/p0-07-preview.test.ts` covers:
- exact UTF-8 reading with BOM, CRLF, markup and non-ASCII;
- refusal of invalid UTF-8 and oversized files;
- block splitting that rejoins exactly;
- the save record (note exact and user-attributed, AI state separate, whitespace-only means no note);
- the unconnected store saving nothing;
- in the test double: rejected save, lost answer then idempotent retry, conflicting reuse, reopen returning
  the exact original and context, and inconsistent or unregistered items.

`preview-check.mjs` writes a real file to the Windows temp directory and opens it through the file chooser
(`DOM.setFileInputFiles`, a step added to `cdp-runner.ps1`). The file contains a BOM, CRLF and LF, Chinese,
λ₁², 🙂, `café` and `<script>` / `<img onerror>` / `<b>` markup. The check then selects with a trusted mouse
drag, types with trusted text input and clicks buttons. Results:
- **Default page:**
  - a Latin-1 file is refused;
  - the UTF-8 file opens with SHA-256 `ef77aad9…` for both the file and the rendered text;
  - only `p`/`div` elements are rendered, and no script or handler ran;
  - registration fails with "not connected", and an ASK submits nothing.
- **Test double:**
  1. The document registers, and ASK shows `trace(A²)` with "no explanation generated".
  2. An injected refusal shows "Not saved" with Retry. Close is disabled and nothing is stored.
  3. A new selection is not added.
  4. Retry commits the same item.
  5. A second item's lost answer shows "Outcome unknown". Retry reports "no duplicate made", giving 2 items.
  6. Close, then a UI rebuild, lists 2 items.
  7. Reopen shows the stored original (same SHA-256), the same source "not reimported", the context, and the
     note `Why is it 13?  我的问题：为什么是 13？\nSecond line.` exactly, with the AI state separate.

## Not done, and the named dependency

- **Real persistence:**
  - Blocked on the backend/lead committed preview ingest/save/readback contract
    (`packages/contracts/document_preview/**`, backend the sole delegated writer) and its trusted local transport.
  - When it is supplied, it replaces the test double behind `PreviewStore` with the exact wire.
  - Web does not invent the HTTP wire or shared fields.
- **Not tested here:**
  - save and reopen after a page reload or API process restart;
  - PostgreSQL;
  - authorization;
  - deletion.
- **Credentials:** they must stay with the owned page and launcher, never in a course content script. There is
  no credential in this slice.
- **Identity:** the unconnected and test-double identities are synthetic placeholders.
- **Known UI limits:**
  - the saved selection is not highlighted again in the reopened document;
  - CR-only line endings display as spaces (CSS white-space rules), though the stored text is exact;
  - a selection with no typed note can be closed without saving;
  - the silent card can cover part of the side panel.
- **Out of scope:**
  - real AI explanations (no provider connected);
  - Safari, iPad and Pencil;
  - real course pages;
  - the original-screen overlay (R59/A44);
  - Notability (A46);
  - audio;
  - full P1.

  QA's integrated pass (start, non-fixture document, save, API restart, reopen) waits for the connected store.
