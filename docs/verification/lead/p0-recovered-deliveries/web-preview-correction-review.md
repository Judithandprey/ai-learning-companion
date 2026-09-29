# Bounded correction review: 9c1d070 → 8989b61

**Decision: INTEGRATE the correction.** The original P1 pre-first-save note-loss blocker is resolved. No new blocker found within this delta. This recommendation covers the local preview correction; it is not acceptance of real persistence, a released backend adapter or the full P0-07 outcome.

Scope: exact `team/web` delta `9c1d070..8989b61`, workflow `4a2be79`, parent-supplied main baseline `c18d30b`. Source extracted to `/tmp/p0-web-preview-correction-5116l99e`; main and worker trees unchanged. PONYTAIL LITE: the patch reuses the existing `unsaved()` rule and `closeCard()` method, with no added dependency or state machine.

## Independent observations

The saved original focused browser reproduction was rerun against the exact candidate, with only its temporary directory and run label changed. Real local UTF-8 file, trusted Edge/CDP mouse selection and typed input, labeled `?store=test-double`:

| State after ASK alpha → type note → ASK gamma | Original 9c1d070 | Correction 8989b61 |
| --- | --- | --- |
| Selection | gamma | **alpha retained** |
| Note | empty | **`DO NOT LOSE this original learner note.` retained exactly** |
| Save attempt | null | null |
| Close enabled | true | **false** |
| Save enabled | true | **true** |
| Notice | empty | **save or discard your note first (it is kept)** |
| New selection card | shown | **hidden** |

Correction browser run: exit 0, **0 runner errors**. Explicit assertions over the captured values passed. The existing harness closed the temporary browser and localhost server in foreground/finally cleanup; no account/provider was activated.

Relevant unit checks: **9/9 preview tests pass**. TypeScript build/typechecking: pass. No repeated old 54-check browser campaign or full 96-unit campaign.

Recoverable files:
- `/tmp/p0-web-preview-correction-5116l99e/review-note-loss.mjs`
- `/tmp/p0-web-preview-correction-5116l99e/review-note-loss.json`
- Original failing result: `/tmp/p0-web-preview-xwqff6is/review-note-loss.json`

## Code review

- `preview/src/preview-page.ts:170`: the outcome handler now calls the existing `unsaved()` guard before replacing the draft or clearing the note. This covers typed words before any save attempt and preserves the existing unresolved-save guard. The message distinguishes those cases.
- The refused replacement calls `probe.closeCard()`. In `src/page.ts`, the optional outcome hook now runs after `showCard`; this lets the owned preview withdraw that card and highlight synchronously. Without a hook, the prior presentation path is unchanged. `clearPending()` remains after the hook; closing clears the pending generation, so it does not resurrect the card.
- The browser regression now covers the missing pre-first-save path, including retained note/selection, disabled Close, enabled Save, no attempt and hidden card.
- The only other behavioral delta is the input cap changing from 5 MiB to **2 MiB**, still rejecting oversized input without truncation. This matches candidate `f0ecfe1` at `packages/contracts/document_preview/validation.py:16` and its README. It does not claim the wire is released or integrated.

## Commands and evidence attribution

Run in `/tmp/p0-web-preview-correction-5116l99e`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none apps/safari-extension/tests/p0-07-preview.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/p0-web-preview-correction-5116l99e/review-note-loss.mjs
```

The browser command used normal approved escalation because WSL interoperability required it; no sandbox/approval policy was weakened. One read-only `git grep` initially used the archive directory and failed because it has no `.git`; it was safely rerun in main. No test failure was hidden by that inspection error.

Owner evidence was inspected, not rerun: corrected `p0-07-preview.json` reports **17/17, 0 runner errors**; committed before-fix evidence reports the new regression failing; owner reports the **96-unit** and existing **54 self-test** passes. Reviewer results are only the independent focused reproduction, 9 tests and compilation above.

The original bounded-review limits remain: default storage is unavailable, test-double readback is page memory, and real transport/persistence remains a separate integration dependency. No new conclusion about complete outside-range containment, asynchronous document-switch races, Safari/iPad or original-live-screen annotation is drawn from this correction.
