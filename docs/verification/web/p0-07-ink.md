# WRITE ink on the original page: mouse writing, partial erase, undo/redo, local reopen

- **Date:** 2026-09-29 UTC. **Owner:** web (05).
- **Handoffs:**
  - Assignment: lead `handoff_460988d086c46de2d9088a6e70493dd6` and `handoff_7c4b5640ff06cacfe736086c704defef`.
  - Approval of the web-local editable format, with required corrections: `handoff_989c280bb23c5fccd3b15c7c2e3001dc`.
- **Baseline read:** `ae1f20b` with `git show`:
  - §7.1–7.2;
  - `docs/requirements/intent-and-decisions.en.md` Q-INK-DISPLAY (both display modes; display never fixes
    purpose; old ink must not silently attach to another problem or view).
- **Scope:** `apps/safari-extension/**` and `docs/verification/web/**`.
  - v0.1 contracts, archive and protocol are unchanged; no dependency and no new extension permission.
  - The merge of main stays denied and was not retried.

**Every ended stroke is kept locally** (lead `handoff_501d9d49635ef47ec37bcf573db2cd85`, on main `35cfa94`; QA
`efa7900` observation `conflict_reload_behavior`, classified by the lead as an R46/R51/A27/§7.2 retention
defect):
- **Conflict:** when another tab or window saved other ink for the document this tab saves to, nothing is
  overwritten and nothing is interleaved. This tab's whole document is saved at once as a **separate copy** of
  the page's ink (`lc-web-ink-copy/v1`, `ink.ts`), stored in its own record `<origin> <fingerprint> #<copy id>`
  next to the main document.
  - The copy records what it forked from (`forked_from`: the main document or a copy id) and how many history
    operations both shared (`forked_at`, reported by the background).
  - Later edits in this tab are saved to that copy.
  - This also applies when the refused save's answer arrives after the address changed or after Stop: the kept
    document is saved as a copy at once, and only one copy is made.
- **Reopening:** the main document is shown, and the other saved copies are listed in the hint. **⧉** shows
  them in turn. A shown copy is edited and saved like any document (erase, undo, redo, new strokes).
  - Switching is only possible while the shown document is saved, so unsaved edits are never switched away.
- **Unreadable main record:** its raw bytes are never written. New ink is saved as a copy (`unreadable`), which
  is shown on reopening.
- **Saved ink that could not be loaded:** nothing stored is written. New ink is saved as a copy (`unloaded`), and
  the hint says it could not be loaded; it does not claim the record is unreadable.
- **Failed persistence:** the hint says so accurately, including which changes are at risk ("changes since the
  last save at …" or "since it was opened"). **⤓ Export** downloads the exact shown document
  (`lc-web-ink-export/v1`: the document, its copy description and why it was not saved).
  - The ink stays in the tab across an address change and Stop, and is saved once storage works again.
  - The misleading retry and "at the same time" wording is gone.
- **Both originals kept:** the other tab's record is untouched, and this tab's strokes are durable.

**Corrections after the lead's review of `366a994`** (lead `handoff_5d68127324ff5a375b0e9fb7eeb482af` and
`handoff_3f632c34c0b2a7717d4e91fabe7f8254`):
- **INK-A1:** screen-fixed ink is checked against what it was written over, like content ink. It stays where it
  is on screen, so scrolling does not mark it. When that content changes at the same address, it is marked.
- **INK-A1, off screen** (lead `handoff_05b0409b8d4cb3a6263431c5413c60e9`, on `30ff273`): each alignment key
  remembers the page element it was verified on and is checked on that element directly, wherever it is. So a
  source scrolled off screen and then replaced no longer verifies the screen-fixed ink over it. A key is never
  kept verified without being checked: if its element is gone, or its place is off screen with no element to
  check, it is not verified. Ink over opaque content keeps its element too, so scrolling it off screen does not
  mark it; any page change still does.
- **INK-A2:** a stroke is checked against its start anchor when it ends. A change during the gesture leaves it
  marked, with the original anchor kept, never attached to the new content.
- **INK-A3:** the visible strokes keep their drawing order: the order of their original strokes, with pieces
  in their stroke's place. Erase, undo, redo, a reopen and branches never restack ink. `parseInk` requires
  the stored order to be the one its history produces.
- **WS1:** the background reads stored and incoming ink with the same `parseInk` as the page. It is generated
  from `src/ink.ts` into `webextension/ink-format.js` (entry `src/ink-worker.ts`) and loaded with
  `importScripts`; the manifest is unchanged. A save is refused, and the stored bytes are left untouched,
  when either document does not read as complete ink of that page. The prefix and immutable-stroke conflict
  check and the commit-only answer are unchanged.

This is a **supported web-page component** on desktop. It does not provide:
- an arbitrary-app overlay;
- continuous observation or real AI (there is no provider);
- the shared ink codec or an archive binding;
- iPad, Safari, Pencil or pen-pressure evidence (all input here is a desktop mouse through CDP).

Where alignment cannot be verified, the loop shows an explicit "not verified" state. That state stays incomplete
for the corresponding full gate.

## What the user gets

In the page already in use, the toolbar **Write** mode shows writing tools. The tools appear only in WRITE.

| Tool | Behaviour |
| --- | --- |
| ✎ Pen | Writes. A pen always writes in WRITE. |
| ⌫ Eraser | Erases only what it passes over; the eraser's path and tip are drawn while it moves. |
| **Mouse** | Desktop trial, **off by default**. When on, the mouse writes and erases in WRITE. When off, the mouse operates the page. NAV and ASK are unchanged either way; fingers always navigate. |
| ↶ / ↷ | Undo / redo. |
| ⇅ / ▣ | Placement of new ink: follows the page (content), or stays fixed on screen. |

Behaviour around the tools:
- **Placement and mode are independent:** placement never changes NAV/ASK/WRITE, and neither decides the purpose
  (note or draft) of the ink.
- **ASK returns to WRITE:** an ASK started from WRITE returns to WRITE when it finishes or is cancelled. Mouse
  writing and the tool choice are kept.
- **No explanation from editing:** writing, erasing, undo and redo never ask for an explanation or a capture. Only
  an explicit ASK mark does.
- **Hint:** the WRITE hint states what the pen and mouse do, where new ink goes, the save state, and how many
  strokes are shown dashed. In NAV the hint is empty unless ink is unverified or not saved.

## Model (`src/ink.ts`, `lc-web-ink/v1`, web-local)

- **Strokes:** each stroke keeps its points (x, y, t in ms from the first point, pressure), input, display, time
  and source (title, viewport, scroll), all taken when the stroke began. It also keeps its anchor evidence
  (below): checked for content ink, and provenance only for screen-fixed ink.
- **Erase:** an erase never changes or deletes a stroke. The stroke leaves the visible set, and the surviving
  pieces are added as new strokes `derived_from` it.
  - One gesture is one operation, even across both displays.
  - Sparse points are densified, so a thin eraser cannot slip between them.
- **History:** operations are add, erase, undo and redo.
  - Undo and redo stacks are rebuilt by replaying the history, so a reopened document edits exactly as before.
  - A new edit after an undo branches: the undone operations stay in the history.
- **Reading back:** `parseInk` is strict. It rejects:
  - another page;
  - malformed points or anchors, and pieces derived from strokes that are not stored;
  - a history this model would not record: sequence gaps, operations on unknown strokes, and undo/redo that
    do not match their target;
  - a revision that is not the history length;
  - a visible set that its history does not produce.

## Identity, alignment and saving (`src/ink-layer.ts`)

- **Identity:** SHA-256 of the exact address: origin, path, query and fragment, with credentials removed.
  - Another query, or another fragment, is another document.
  - An address change in the page (for example `pushState`) switches documents: checked before WRITE input and
    every second. Nothing written on one address is shown on another.
  - Only the origin and the fingerprint are stored or reported. Paths and queries can carry tokens.
- **Anchor evidence:** for each stroke, the element under its first point when the stroke began. The lookup
  reaches into open shadow roots, and prefers a video or audio under an overlay or player chrome. The evidence is:
  - a fingerprint of the element's tag, its source address (images and media), its rendered text, the sources
    of the images and media inside it, and, for SVG, the geometry and paint of every shape in its drawing;
  - for an element without text or source (a shape, a background): its background image and the text of the
    nearest enclosing element that has text, such as the figure or formula;
  - its rectangle in page coordinates;
  - the media time, for video and audio;
  - `opaque`, for canvas, iframe, embed, object, and components whose content is closed to the page.

  Ink in an empty area is anchored to the page body. **Ink is never moved to fit the page.**
- **Aligned:** a stroke is aligned only while the page is seen showing the same element there. That means the same
  fingerprint and position and, over media, the same playback time within 0.5 s. Otherwise it is drawn dashed and
  counted in the hint.
  - This is rechecked, for on-screen ink only, after any page mutation, after scrolling (also inside
    containers), resizing, media playback, input to the page, disclosure toggles, and late image or font loads.
  - Evidence is cached until the DOM changes.
  - Reopened ink starts unverified.
  - The pixels of opaque content cannot be compared. Ink over it is aligned only until the page may have changed
    (any DOM change, media event or input to the page). After that, and after a reopen, it stays unverified, and
    a new stroke on it does not confirm older ones.
  - Ink over a playing video is marked once the video moves more than 0.5 s away from the frame it was written
    on.
  - Screen-fixed ink is checked against what it was written over, wherever that is now; scrolling does not mark
    it.
  - A stroke is checked again when it ends, against its start anchor.
  - Pieces of an erased stroke share its alignment state.
- **Gestures:** a gesture that is still under way when the page address changes is not kept, and the hint says
  so. This is checked when it begins and when it ends.
  - While saved ink loads, a press is left to the page.
  - A mouse writes with its primary button only. A stroke whose release never arrived ends at the next move
    without the button, or at the next press.
  - The eraser preview applies only the newest part of the path per move. The kept erase is computed once, from
    the whole path.
- **Saving:** every change hands the whole document to the store at once. The store applies loads and saves in
  call order, so overlapping saves stay in order.
  - A load waits for this tab's pending saves. In the extension, all ink messages go through one queue kept in
    the page's isolated world, so a restarted companion reads after every save of the one it replaced.
  - A failed save keeps everything in the tab and says "Not saved: …", which changes are at risk, and offers
    ⤓ Export. The next change tries again.
  - If another tab saved other ink, this tab's document is saved as a separate copy (see above). The stored ink
    is not overwritten.
  - A stored document that cannot be read is reported and never overwritten; new ink is saved as a separate
    copy.
  - Ink that is not saved (in memory, failed, or with saving off) stays in this tab until the page is left or
    reloaded, and the texts say exactly that.
    - It survives an address change: it is counted in the hint and comes back with its address.
    - In the extension it also survives Stop and a new start in the same page, through a map kept in the
      isolated world.
  - In NAV, unsaved ink is still named in the hint.
- **In-memory fixture/preview:** fixture and preview pages pass no store. Their hint says "Kept on this page only;
  not saved", and that ink never counts as durable.

**Extension store:** `webextension/background.js` keeps the ink in the extension's own IndexedDB
(`lc-web-ink`, on this device), and `src/extension-content.ts` reaches it with the `lc-ink-load/v1` and
`lc-ink-save/v1` messages.
- Both the stored document and the incoming one must pass `parseInk` (loaded from `ink-format.js`). If either
  does not, nothing is written and the stored bytes stay as they were.
- Requests are accepted only from our own top-frame content script of an http(s) page.
- The key is `origin + SHA-256`; the origin is taken from the sender, not from the document.
- A save is accepted only if the stored history is the start of the new one and every stored stroke is unchanged.
  Anything else, such as another tab having saved newer ink or an unreadable record, is refused and the record is
  left as it is. A refused conflict reports the shared history length (`forked_at`).
- **Copies** are separate records `<origin> <fingerprint> #<copy id>`. A copy's description is checked with
  `isCopy` and kept as made; its document is checked like any other, and it is never shortened. A load returns
  the main record and all copies of that page.
- Removing the extension removes this storage (browser behaviour).

## Evidence

**Unit tests:** `node --test tests/*.test.ts` gives 167/167, including:
- `tests/ink.test.ts` (9): partial erase, thin eraser, display independence, one-gesture erase, drawing order
  through erase/undo/redo/branch/reopen (INK-A3), undo/redo and branching, reopen then undo, strict reading,
  strict history replay;
- `tests/ink-layer.test.ts` (7, a minimal DOM double adapted from the lead's probes):
  - INK-A1: content and screen-fixed ink are marked after a same-address replacement;
  - the INK-A1 control: an unchanged or only scrolled page leaves them aligned;
  - the INK-A1 off-screen variant: a source scrolled off screen and then replaced;
  - its controls: an unchanged source scrolled off screen (stable scroll), and one kept on screen (visible
    positive);
  - opaque content (a canvas): ink survives a scroll off screen and is unverified after any page change;
  - INK-A2: a change during the gesture marks the stroke;
  - the INK-A2 control;
  - with a store double that behaves like the background:
    - a conflict is kept as a copy with its fork point, B is untouched, and there is no interleaving;
    - after a reload, the main document is shown with the copy listed; ⧉ shows the copy, which takes an erase,
      an undo and a new stroke, all saved to the copy and reopened;
    - an unreadable main record stays untouched while new ink goes to a copy that reopens;
    - a failed save offers Export; the ink survives Stop and is saved later;
    - the export is the exact shown document;
    - a conflict answered after an address change is written as a copy at once;
    - Stop during an in-flight conflict leaves exactly one copy;
    - a failed load gives an `unloaded` copy and never says "unreadable";
    - the open shadow root that ink anchors into is observed, and let go on destroy.

  Where the defect tests fail: both the INK-A1 and INK-A2 tests fail on `366a994`, and the off-screen variant
  fails on `30ff273`. The controls pass on both commits.
- `tests/background-ink.test.ts` (4, the shipped `background.js` plus `ink-format.js` in a VM with a controlled
  IndexedDB, adapted from the lead's storage probe; WS1):
  - stored records this version cannot read (unknown format, revision 999, empty visible set, raw bytes) are
    never overwritten;
  - incoming documents that do not read as complete ink are refused;
  - controls for replay, extension, a detached read, conflicts, commit failure and foreign senders.
- the mouse-writing policy test in `tests/input-policy.test.ts`.

**Browser check:** `LC_WEB_FIXTURE_PORT=4183 node scripts/ink-check.mjs --browser <msedge.exe>` gives
**28/28**, with 0 runner errors, on the committed build (`content.js` SHA-256 `1ccbbe0e5dfca601…`). Report:
`evidence/p0-07-ink.json`, with screenshots `p0-07-ink-1…6`.
- **Setup:** Edge 154 headless, the unchanged shipped folder, the toolbar press through
  `Extensions.triggerAction`, and a local synthetic course page.
- **Harness controls** (labelled in the report):
  - state is read in the extension's isolated world;
  - rendered pixels are read from a `captureVisibleTab` image in the worker;
  - the "other tab" record and the unreadable record are written into IndexedDB by the worker;
  - for the overlapping-saves case, the worker answers each save after 400 ms.

| Check | What was observed |
| --- | --- |
| `ink.mouse_off_by_default` | In WRITE, a mouse drag leaves no ink until **Mouse** is pressed. |
| `ink.mouse_writes` | Two mouse strokes are two content strokes. Dark ink pixels appear over the magenta block. The status is saved, and no text selection is made. |
| `ink.nav_never_draws` | A NAV drag with mouse writing on draws nothing. Back in WRITE, mouse writing is still on. |
| `ink.partial_erase` | The original is hidden but kept, as two pieces `derived_from` it. The block shows through where the eraser passed, and the ink remains on both sides. Screenshot 1 is taken while the eraser moves. |
| `ink.undo_redo` | Undo draws the whole stroke again; redo removes the erased part again. |
| `ink.ask_returns_to_write` | A finished text ASK (one capture) returns to WRITE, and so does a cancelled ASK. |
| `ink.keeps_writing_after_ask` | More strokes follow, with history `add,add,erase,undo,redo,add,add`. |
| `ink.writing_requests_nothing` | The capture count changes only with the ASK mark. |
| `ink.content_and_screen_display` | After scrolling 150 px, content ink is still drawn over the block (it moved with it), and screen ink stayed in place. See screenshot 3. |
| `ink.reopen_after_reload` | After a reload and a new start, the same strokes and history come back from IndexedDB, drawn in place. |
| `ink.reopen_alignment` | On unchanged content, all 5 strokes are verified: content ink in place, and screen ink against what it was written over. |
| `ink.edit_after_reopen` | Undo and redo continue the pre-reload history, and new strokes are saved. |
| `ink.overlapping_saves` | Three back-to-back strokes while each save takes 400 ms: 2 saves were requested while another was running. All three are stored in order, with stored revision and history equal to the page's. |
| `ink.changed_content_marked` | Same URL, changed paragraph and moved block: all 8 strokes are kept, with the same first points and point counts. Dashed: both pieces of A (moved block), B (changed paragraph), and C (on the board whose block moved). The stroke over the unchanged heading stays solid (control). The hint counts 7 dashed. See screenshot 4. |
| `ink.address_identity` | `?problem=2` is a separate empty document. `#step-2` switches in place, and returning brings the first document back. |
| `ink.conflict_kept_as_copy` | Another tab saved newer ink: the main record keeps it (history `add,add`, including the other tab's stroke), and this tab's F and H are saved whole in a keyed copy record (`conflict`, `forked_at` 1). See screenshot 5. |
| `ink.conflict_reopen_both` | After a reload, the main document is shown with one copy listed. ⧉ shows the copy (F and H). |
| `ink.copy_edit_after_reopen` | The copy takes an erase, an undo and a stroke, saved to the copy only (the main record is byte-identical), and reopens with history `add,add,erase,undo,add`. |
| `ink.failed_save_disclosed_export` | When storage fails (harness), the hint names what is at risk and offers ⤓. Pressing it starts an export; downloads are denied in the harness. See screenshot 6. |
| `ink.unsaved_kept_in_tab` | After a failed save, the ink is held across a fragment change and Stop/start, and is saved to the shown copy once storage works (stored count = shown count). |
| `ink.unreadable_left_untouched` | The unreadable main record is reported and stays byte-identical. New ink goes to an `unreadable` copy, shown with all its strokes after a reload. |
| `ink.shadow_root_change_marked` | With the lecture video paused, ink over the block in an open shadow root is marked after the block moves inside the root. |
| `ink.right_button_not_writing` | A right-button drag with mouse writing on writes nothing. |
| `ink.video_moved_on` | Ink over the playing lecture video is aligned when written, and marked 2 s later. |
| `ink.source_change_marks_both_placements` | INK-A1: after the paragraph is replaced, the content and screen-fixed strokes over it are marked. The content and screen-fixed strokes over the unchanged heading stay aligned. |
| `ink.change_during_stroke_marked` | INK-A2: the paragraph changes while a stroke over it is being written. The stroke is kept but marked, and the heading control stays aligned. |
| `ink.offscreen_source_change_marked` | INK-A1 off screen: screen-fixed ink whose source paragraph was scrolled off screen and then replaced is marked. Screen-fixed ink over the heading, only scrolled off screen, stays aligned. |
| `ink.no_raw_address_stored` | Stored records carry the origin and a 64-hex fingerprint. No path, query or fragment text appears in them. |

**Independent review:** an internal review workflow (3 dimensions with adversarial verification) confirmed 24
findings. All are fixed as described above except one: tool settings are not synced into fixture frames, which is
listed under Gaps. The fixes include held unsaved ink, the conflict status, strict replay, opaque keys, gesture
generation, mouse buttons, container scroll, and stronger evidence and assertions. A recheck of the
fixes found 6 items only partly fixed and 9 new ones. All of these are fixed as described above, with two
exceptions listed under Gaps:
- content ink does not follow scrolling inside a container;
- evidence for page-wide anchors is still recomputed after DOM changes, which is cached and limited to on-screen
  ink but not bounded.

**Latest round** (retention of every stroke and QA-EXT-03, on the committed build), changed paths only:
- ink check 28/28;
- extension capture check 32/32, including the public page;
- self-test 54/54;
- entries 21/21;
- preview reselect 10/10.

**Previous round** (INK-A1/A2/A3, WS1 and the QA-EXT-01/02 capture correction), rerun on the changed paths only:
- ink check 23/23;
- extension capture check 25/25, including the public page;
- self-test 54/54;
- entries 21/21;
- preview reselect 10/10.

**Regressions after the `page.ts` change,** on port 4183 and in the same environment, rerun after the review
fixes:

| Check | Result |
| --- | --- |
| Self-test | 54/54 |
| Trusted input | 37 passed, 0 failed. Touch scroll and pinch are not verifiable in this environment, as before. |
| Entries | 21/21 |
| Preview reselect | 10/10 |
| Preview library (test double) | 7/7 |
| Extension capture flow | 19/19 |

The user's preview on 4173/8174 was not touched.

## Gaps (not claimed)

- **Real devices:** iPad Safari, Apple Pencil, pressure and palm rejection have no evidence yet. Real-device work is
  owned by iOS/QA.
- **Safari packaging:** not tested here. IndexedDB in a Safari web extension's background page is expected but
  unmeasured.
- **Pinch zoom:** screen-fixed ink is fixed to the layout viewport, so under pinch zoom it is magnified with the
  page. Content ink under pinch zoom and under browser zoom or reflow is marked, not relocated. There is no
  relocation algorithm.
- **Containers:** content ink follows the document's scroll, not scrolling inside a container. Container scroll
  is detected, and the ink is then marked.
- **Anchor evidence is evidence, not proof.** Only the element under the first point is checked.
  - Canvas, iframe and video pixels cannot be read, so opaque content is treated as unverified after any change
    to the page.
  - A canvas redraw with no DOM change, media event or input to the page is not detected.
  - Closed shadow roots are treated as opaque only when the component shows no light-DOM content.
- **Cost:** margin ink is anchored to the page body. Its evidence is the page's rendered text, recomputed after
  each DOM change while that ink is on screen (at most 4 times a second). This is not measured on large real
  pages.
- **Frames:** fixture frames keep their own in-memory ink with default tools, which the top toolbar does not
  control, so there is no undo there. The extension injects the top frame only.
- **Conflicts:** another tab's newer ink is never overwritten, and there is no merge. Both documents are kept as
  separate copies, and the user chooses which to show. Copies accumulate: there is no delete or merge control.
- **Export:** the file content is unit-tested. In the harness the browser download itself is denied, so no file
  write is observed.
- **Pages that are not a secure context** (plain `http`, other than localhost): the address cannot be
  fingerprinted, so ink stays in the tab, and the hint says so.
- **Controls not provided:** there is no delete-all-ink control and no copy deletion.
  - Notability archive and the shared stroke codec remain with the lead (coordinate before treating opaque
    `original_artifact` bytes as strokes).
