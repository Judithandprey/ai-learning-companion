# Bounded review: Web document preview 9c1d070

Decision: **BLOCK integration of this delivery until the unsaved-note loss below is repaired.** This is a review of `db7400f..9c1d070` only, with workflow `4a2be79`; no P0-12 re-review or broad campaign. Exact candidate extracted to `/tmp/p0-web-preview-xwqff6is`. Main and worker files were not edited. PONYTAIL LITE applied: reuse the current preview/probe/store boundary, no added layer or dependency recommended.

## Confirmed blocker — P1: another ASK silently deletes an original learner note

Location: `apps/safari-extension/preview/src/preview-page.ts:168–175` (candidate 9c1d070). `onOutcome` rejects replacement only when a save `attempt` exists and is uncommitted. Before the first Save, `attempt` is null even after a note is typed. The callback replaces `draft`, then sets `note.value = ''`. This contradicts the same module's `unsaved()` guard at line 183 and the delivery document's promise that a typed unsaved note blocks new selection replacement.

Focused real local Edge/CDP reproduction, fresh browser/profile, real UTF-8 file selected via `DOM.setFileInputFiles`, mouse selection and typed text:
1. Open `/tmp/p0-web-preview-xwqff6is/review-original.txt` at `/preview/?store=test-double`.
2. Explicit ASK selecting `alpha`.
3. Type `DO NOT LOSE this original learner note.` without Save.
4. Explicit ASK selecting `gamma`.

Observed before: selected text `alpha`; exact note retained; attempt `null`; Close disabled.
Observed after: selected text `gamma`; note `""`; attempt `null`; Close enabled; notice `""`.
Runner errors: **0**. Recoverable probe and evidence: `/tmp/p0-web-preview-xwqff6is/review-note-loss.mjs` and `review-note-loss.json`. Browser and server were stopped by the existing harness's foreground/finally cleanup.

Required narrow repair (Web owner): preserve the original draft and note when another result arrives while an original note is unsaved, or require an explicit discard action before replacement; add the pre-first-save regression. Use the existing guard/state, without a new framework. Existing owner coverage checks replacement only after an injected failed Save, so it does not exercise this path.

## Verification and evidence boundaries

Independently executed on the exact extracted tree:

```sh
cd /tmp/p0-web-preview-xwqff6is
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/p0-07-preview.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --noEmit -p apps/safari-extension/tsconfig.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/p0-web-preview-xwqff6is/review-note-loss.mjs
```

- New tests: **9/9 pass**; typecheck and build: pass. They cover byte-exact strict UTF-8/BOM/CRLF, invalid/oversize refusal, reversible block split, exact user-attributed nonblank notes, honest unavailable store, test-double reject/lost-response/idempotent retry, original/context readback and inconsistent-record refusal.
- The focused browser command initially failed under sandbox WSL interop (`wslpath` EPERM); the same exact command succeeded through normal approved escalation. No external provider or account was used.
- Owner evidence read, not independently repeated: committed `docs/verification/web/evidence/p0-07-preview.json` reports **16/16, 0 runner errors**, owned desktop Edge/headless only. The owner also reports the old 54/54 self-test and full 96-test module suite. Those are owner results, not additional reviewer runs.
- Rendering uses `textContent` and exact original text remains separate from the 1,000-character selection context. No fixture explanations enter the preview (`fixtures: []`); provider transport is explicitly unavailable. Default optional page hooks retain their old behavior when absent. The foreground launcher reuses the pinned compiler and localhost server, with strict CSP; no new dependency/service manager.
- Save attempts preserve one payload through pending/failed/unknown retries, and close/open are guarded in those states. This review does **not** establish all asynchronous document-switch races or complete selection containment: the new `insideDocument` gate uses the selection rectangle's **center**, not DOM range containment. View-key/source checks are present, but broad stale/outside-selection correctness is not claimed from the bounded positive browser path. That boundary deserves targeted coverage when repairing the preview rather than a repeated whole-probe campaign.

## What is actually usable

- Default `/preview/`: user can open/read a real local UTF-8 text document (owned-page fallback). Registration fails honestly because storage is unconnected; ASK submits nothing and reports source not registered; no save/reopen persistence or provider explanation is usable.
- Opt-in `?store=test-double`: labeled page-memory store enables registration, explicit ASK with a provider-unavailable state, note/save/retry/list/close/UI-rebuild/reopen demonstrations. It is **not persistence**, and reload loses its store. The confirmed note-loss defect is in this shared UI path.
- `PreviewSave`, `item_id`, identity and store interfaces remain local placeholders, **not a released shared wire**. Backend's delegated `packages/contracts/document_preview/**` delivery, compatible transport/authorization/artifact persistence and actual readback still remain necessary. This review approves no backend storage claim or account/provider activation.
- No original live course-screen annotation, iPad/Pencil, native editable Notability import, or full P0-07 acceptance is established.

Next action: Web repairs the one confirmed preservation defect with its focused regression; lead reviews that delta, then integrates the independently delivered backend wire/transport at its explicit boundary. Do not treat this fallback or its in-memory readback as the complete requested product outcome.
