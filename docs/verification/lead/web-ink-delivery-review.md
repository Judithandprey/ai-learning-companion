# Web ink delivery 366a994 — bounded independent review

**HOLD the ink component for three concrete behavioral corrections below.** Reviewed 366a994 (parent c6e6cfc) against main 9ec9feb8e15afd0ca4c2292b34e7fc2706d58782. Owner's evidence is not independent browser acceptance. No browser/service/provider/DB/preview was started, no main or worker file changed, and no owner was contacted.

Scope followed the lead's split: ink.ts, ink-layer.ts, page/session/input-policy integration and focused model/input checks. Background IndexedDB/message/source serialization review belongs to control_review; root handles retained evidence and integration. Current full §7.1–7.4 and Q-INK-DISPLAY original/English requirements remain effective. PONYTAIL LITE applied: corrections below need the existing model/state, not a new framework or shared codec.

## Confirmed blockers

### INK-R1 — screen-fixed strokes never lose verified state on same-address content replacement (medium)

ink-layer.ts:332–350 only invalidates opaque anchors on a page touch, then skips every non-content stroke at line 347. Draw a content stroke and a screen-fixed stroke over paragraph A; replace its text with problem B at the same address and rectangle, deliver the mutation notification and wait past the 250 ms verification interval. The content stroke becomes uncertain; the screen-fixed stroke remains uncertain:false and renders solid over B. Its original anchor is retained but the changed context is not disclosed for that stroke. Q-INK-DISPLAY requires both modes to preserve source/view association and explain changed/unknown alignment; remaining physically fixed does not prove current association.

Narrow owner action: keep screen coordinates fixed while separately invalidating or verifying its current context against its original evidence; do not skip changed provenance merely because placement is screen-fixed. Regression: same-address content replacement and video-position change with both placement modes; originals stay immutable and the changed screen-fixed stroke is reported unverified.

### INK-R2 — content change during a long stroke can be forgotten at pointer release (medium)

ink-layer.ts:485–507 verifies address generation only, then unconditionally sets the new stroke's alignment to true at line 506. Begin a content stroke over A; replace A with B while holding the gesture; allow the 250 ms observer check to run before release; finish the stroke. With no further page event, the new stroke stays uncertain:false, even another 290 ms later. Its anchor still identifies A, while the page shows B. The earlier verification saw no committed stroke, and finish neither rechecks the anchor nor remembers the in-gesture change.

Narrow owner action: revalidate/retain changed-or-unknown evidence when committing the gesture; preserve the original points and begin anchor, and avoid marking the result verified after an observed change. Regression: mutate before release and let the observer settle before finishing; unchanged-content control stays aligned. This is separate from QA-EXT-01/02 capture-window fixes.

### INK-R3 — Undo of an erase changes original stroke stacking order (medium)

ink.ts:99–103 appends restored stroke IDs. Create a black content line (0,50)→(100,50), then a purple screen-fixed diagonal (40,40)→(60,60). Erase at (10,50), radius 5, with identical content/screen paths, touching only black. Undo produces visible [purple,black] instead of [black,purple]. ink-layer.ts draws in visible order, so the overlap changes from purple-on-top to black-on-top after Undo. Stroke originals survive, but §7.1's correct undo restoration is not met. Existing model assertions sort the relevant lists and miss rendering order.

Narrow owner action: restore deterministic original stacking order across erase/undo/redo/reopen while retaining all immutable originals and branch history. Add an overlapping two-colour/two-display case that checks ordered visibility or rendered result without sorting away the invariant.

## Independent evidence and integration

- Isolated main archive: /tmp/web-ink-review-rjagqui1. Only `git diff --binary 366a994^ 366a994 -- apps/safari-extension docs/verification/web` applied. Binary-aware git apply --check passed, so no conflict found against assigned main. The initial non-binary patch check only failed on omitted PNG binary content; corrected extraction succeeded.
- Actual-module controlled DOM-double probe: `/tmp/web-ink-review-rjagqui1/alignment-probe.mjs`. Run with repository `.tools/node-v24.21.0-linux-x64/bin/node`; it demonstrates INK-R1 and INK-R2, including a content-mode positive detection control. It is not browser/device evidence.
- DOM-free model probe: `/tmp/web-ink-review-rjagqui1/history-probe.mjs`; output is `{"before":["black","purple"],"afterUndo":["purple","black"],"originals":true}`. Reopened parser accepts that actual model output.
- In isolated apps/safari-extension: repository Node `--test tests/ink.test.ts tests/input-policy.test.ts` passed both test-file groups. No full module/browser/mutation campaign repeated.

Code otherwise keeps intentional mouse writing off by default, fingers/NAV passing through, primary mouse guards, editing separate from ASK requests, original strokes and erase descendants, append-only undo/redo history, and address-generation refusal for an in-flight gesture. ASK's existing return-mode state is reused and mouse/tool choice is retained. Pointercancel drops the active transient edit; completed ink is retained separately. Unknown/reopened alignment is visibly dashed where its guards run.

Known owner-disclosed limits remain: content ink does not track inner-container scrolling; zoom/reflow and opaque surfaces have restricted evidence; unsaved/conflicted ink can be lost on leaving/reloading as disclosed; no shared archive/codec, AI receipt, native cross-app or iPad/Pencil acceptance. These component limits do not narrow either product gate. Root should return one bounded correction to Web and keep one integrated QA capture+ink pass after both ink and QA-EXT fixes; this review does not duplicate either task.
