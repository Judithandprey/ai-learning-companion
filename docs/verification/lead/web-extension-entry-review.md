# WebExtension component capture review — fb4450fa

**HOLD for three concrete capture/lifecycle defects.** Review only `cc006fd..fb4450fa384f585b1a225d1d6bc85d5113db9e04` on main `e410f7a`; held library/auth-race code was not integrated. Main's unrelated dirty test/CI change was untouched.

Read current workflow and complete original/English §7.1/7.2 at `ae1f20b`, plus affected acceptance. This is one explicitly labelled capture dependency: no continuous real-AI, whole-visible-display, Safari/iPad, editable-ink or original-screen acceptance is implied. PONYTAIL LITE applies; fixes below need direct lifecycle guards, not a new capture architecture.

## B1 — stale page/view accepted after asynchronous image processing (medium)

`apps/safari-extension/src/extension-content.ts:320–337,363–373`: address/view are checked before SHA-256 and `createImageBitmap()`. After those awaits, only `tracker.accept(ticket)` is checked. No final address/view fence exists in the delivered source or generated bundle.

Independent exact-function probe: defer bitmap decoding, change `/lesson-a` to `/lesson-b` and scrollY from 0 to 500, then resolve decoding. Result: `status: received`, old `/lesson-a` record, current `/lesson-b`, `geometry.known: true`, non-null crop. Control changing the address before the capture answer correctly yields `failed`, proving the missing later fence.

Owner action: revalidate source/address and the required geometry state after asynchronous processing, immediately before committing the visible result. A source change must retire/discard that old-page result. Do not label an unverified mapping current/known. Preserve explicit frozen-image/source-time semantics rather than rebinding old context to new content.

## B2 — Stop during the paint wait still starts a screenshot (high)

`src/extension-content.ts:299–301,376–381`: after `await frames(2)` the request is sent unconditionally. `stop()` marks the tracker stopped, but there is no check between paint completion and `sendMessage(CAPTURE_MESSAGE)`.

Independent exact-function probe: hold the paint wait, call the same `stopped=true; tracker.stop()` state transition, then release paint. Observed one screenshot request with `afterStop: true`; its answer is subsequently retired. Discarding an answer does not undo capture begun after Stop. The same missing pre-send check also permits a timed-out paint wait to start a later request.

Owner action: after paint resolves, check stopped/current-request/deadline state before sending any screenshot request. Keep existing late-answer retirement. Regression target: Stop before paint completion causes zero capture messages; already in-flight answers remain discarded.

## B3 — active-tab A→B→A bypasses endpoint-only checks (high)

`webextension/background.js:62–70`: before/after `tabs.query()` comparisons only check the active tab ID. There is no activation-generation fence; `onUpdated` at lines 88–91 merely clears the badge.

Independent resource-review subagent loaded the exact background JS in a VM with controlled tabs API: query A → activate B → capture B payload → activate A → query A. `captureFor(A)` returned `ok:true` with B's payload; registered activation handlers: 0. Assumes both tabs already have the needed grants. This is a deterministic API-boundary reproduction, not an observation of real-browser timing; a real valid B PNG is what this unfenced boundary would pass onward.

Owner action: invalidate captures on intervening active-tab/navigation changes throughout the request, including ABA, and return a refusal rather than another tab's payload. Do not rely only on final equality. Retain top-frame/same-extension sender validation.

## Evidence and exact reproduction

Candidate `/tmp/web-extension-review-7vyr4lzn` was made from main's module/contracts plus only the delivered delta. Every pre-existing touched source/harness file has the same parent/main blob. No browser, user preview, Paperclip, database, external provider, or port 4173/8174 was accessed.

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/web-extension-review-7vyr4lzn/capture-lifecycle-probe.mjs
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/lc-web-resource-audit-gjpyoff8/background-aba-probe.cjs
```

First probe strips TypeScript from the exact delivered `capture()` function without changing its body, executes it with controlled DOM/canvas/message/decode scheduling, and supplies actual owned-fixture PNG bytes. It does not claim browser rendering. Result saved as `/tmp/web-extension-review-7vyr4lzn/capture-lifecycle-result.json`. The second probe uses a distinguishable stub payload, since the background does not decode PNGs. Both are narrow lifecycle reproductions; no whole campaign was rerun.

## Label correction and verified boundaries

- `src/extension-content.ts:167,271`: displayed `Video: at … s`, paused/playing and captions come from `mark.snapshot.media`, **at mark time**. `background.js:67–68` timestamps after screenshot completion; neither proves the media position in the screenshot. Label the media/captions as mark-time context and screenshot-time media position unknown unless separately observed. Retain both times; do not claim frame synchronization from this evidence.
- The previously reported stale global after Stop is corrected at `src/extension-content.ts:431–438`: both stops use `shutdown()`, delete the exact handle and notify the background. This does not fix B2.
- No separate resource/permission blocker found. Resource-review subagent independently ran `build-webextension.mjs --check` on exact delivery and isolated main plus delta; both report `content.js is current`. Both shipped scripts passed syntax checks. Manifest remains only `activeTab`/`scripting`, with no automatic content script/host permissions, web-accessible resource or external-message entry. `background.js` is hand-authored; `content.js` is generated. Logs: `/tmp/lc-web-resource-audit-gjpyoff8/delivery-build.log`, `main-delta-build.log`.
- Owner's 129-module/16-browser checks and broader regressions remain owner evidence. Their harness substitutes a direct worker toggle and `<all_urls>` in its test copy; it does not verify the actual toolbar grant or Safari/iPad operation. Fresh-profile independent QA remains after repair/integration.

## Delta-only integration note: alternate fixture port

Do not accidentally bring in held library code. However, the delivered new runner imports `PORT`, and its documented `LC_WEB_FIXTURE_PORT=4183` isolation depends on the small `fixture-server.mjs` change from held `cc006fd`. Main `e410f7a` still has `export const PORT = 4173`, and **fb4450fa does not change that file**. Thus the delta-only runner ignores that environment override. Before QA, lead must carry/recreate only this independent port override (or use a separately isolated launcher). Do not run the current delta-only browser harness assuming the override works, and do not touch the user's occupied runtime ports.

Next: Web owner makes one bounded capture correction, rebuilds the committed resource and checks these decisive regressions. Lead reviews the correction and integrates only the extension increment plus any explicitly selected non-library harness prerequisite. No new design/whole-library/ink campaign is requested by this review.
