# QA plan: original-screen core loop and its components (P0-13/P0-07)

- **Assignment:** lead `handoff_a91d01ea7a311c6790a3de674c8db4be` (port refinement
  `handoff_cd498ee967cbc46bed56fb0824a74908`), baseline `a7654d7`.
- **Amendment:** lead `handoff_be4b27cf7ddc42cfd8399ce556034f6e`, baseline `1cbc38f`. The user corrected
  the narrow "select a region on a page" reading; this plan is expanded in place, not a new campaign.
  The correction was not yet in the committed docs at `1cbc38f`; re-read the committed decision text
  when it lands and align this plan with it.
- **Status:** harness preparation only. There is **no candidate yet** and nothing here is acceptance. No
  execution happens until the lead releases an exact candidate that fits a bounded check.

## The core loop being accepted

One integrated loop on the user's real screen, in this order:

1. the necessary system sharing confirmation, then a return to the original screen;
2. automatic, fresh whole-visible-display observations reach a **real** AI while the user scrolls,
   switches apps and edits (ASK is optional);
3. NAV, then explicit WRITE, then an actual draft;
4. a partial erase, then undo and redo;
5. an ASK circle; finish or cancel restores the previous WRITE, and writing continues;
6. save and reopen, with the editable original strokes intact.

It has two independent gates, and each reports only its own evidence:

| Gate | What must be shown | Current blockers |
| --- | --- | --- |
| **1. Whole-display observation** | A fresh whole-display capture reaches a real provider and gets a grounded response, across supported foreground apps, with source, time and change evidence | real provider; device and signing; implementation |
| **2. Original-screen selector and pen** | A cross-app selector and pen on the original screen, with the selected pixels **and** the ink reaching the same AI context | real provider; device and signing; implementation; public-API cross-app limits (owned by iOS/Support) |

**Not core acceptance:** capture-only paths, a single tab, an owned canvas, a mock provider, a textarea
and browser fullscreen are dependencies or fallbacks only. Browser fullscreen is never used as a
substitute for cross-app behavior.

## Checks planned for the core loop (run only on an exact candidate and a real route)

- **Freshness and change:**
  - each observation carries its capture time and source;
  - scrolling, switching apps and editing produce new observations;
  - stale or dropped intervals are labeled, not hidden;
  - the frame sent is the frame captured: record the SHA-256 of the captured bytes and show that the
    actual outgoing provider request carries those bytes as its image input (the mapping from capture
    to request input);
  - bind that mapping to the real request and response identity and to the provider's actual
    acceptance and grounded result. A vendor-echoed image hash is not required or invented if the real
    API does not return one. If the provider side cannot show which bytes it saw, report that
    limitation as it is. A mock receipt never substitutes;
  - the response is grounded in what was actually visible.
- **Edits do not trigger help by themselves:** an edit or erase alone does not trigger an explanation
  or raise disclosure. This is not a global no-proactivity rule: independently authorized R49
  proactive teaching is kept, and R53's exploration limits apply within their scope (problem solving,
  "let me try").
- **Stop, pause, permission loss and disconnect:** after each, nothing is presented as live, and later
  receipts are not bound to the new state.
- **WRITE tools:** the eraser, undo and redo are visible and effective. Partial erase leaves the rest of
  the stroke. Undo and redo restore exact states.
- **Ink modes:** content-following and screen-fixed ink are each tested on their own.
- **Input:**
  - on the actual iPad, Pencil writes and a finger navigates;
  - any desktop writing trial uses an intentional mouse WRITE only;
  - a finger never counts as Pencil.
- **ASK circle inside WRITE:** finishing or cancelling returns to the previous WRITE, without losing or
  moving existing strokes.
- **Save and reopen:** the strokes come back as editable originals, not as flattened images.

## Component checks (narrow; each reports only its own evidence)

- **Desktop browser capture pass** (below): the original scope of this plan. It runs on the lead's exact
  WebExtension candidate as a component check. It does not pass either gate.
- **Owned-page ink in the Simulator:** QA-IOS-01, already passed at `833a2a6`. It is a component
  (writing, erasing, persistence), not original-screen ink.
- **Primary acceptance** is on the user's iPad with the installed build. Desktop evidence stays separate.

## Desktop browser capture pass (component)

Scope, from the task card at `a7654d7` ("original Safari learning-page entry"; R01–03, R06–10, R59,
A01–03, A12):

- an actual current public course page, not an imported or owned document;
- real shipped extension invocation with only the necessary permission;
- an actual PNG of a formula/figure region, with dimensions, hash, source, time and selection;
- the original page stays operable;
- stop, navigation and late captures never relabel an old frame as live.

### Harness capability, measured

A QA-owned, test-only probe extension (`tests/e2e/web/original_page/`) was run on Windows Edge
154.0.4258.37, headless, with a fresh profile. Result:
[capability-probe.json](p0-07-original-page/capability-probe.json).

| Question | Result |
| --- | --- |
| Can an unpacked MV3 extension be loaded unchanged? | Yes, with `--load-extension`; its service worker runs |
| Can the extension's own action be invoked? | Yes: the DevTools `Extensions.triggerAction` on the page's **tab** target fired `action.onClicked` with the real URL and title |
| Does that invocation grant `activeTab`? | Yes. **Control:** `captureVisibleTab` without an invocation is refused ("Either the '<all_urls>' or 'activeTab' permission is required."); after the invocation it returns a PNG |
| Real pixels from a current public page? | Yes: `https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors` gave a 1246 × 803 PNG, 201,536 bytes, SHA-256 `f71c5e8c…`, with the tab URL and title |

**Named interaction limitation:** `triggerAction` is a DevTools invocation of the shipped action, not a
human click on the toolbar button, and headless Edge has no toolbar.
- It exercises the unchanged shipped manifest and the real `activeTab` grant path. No test manifest or
  auto-grant is used.
- A human toolbar click and the iPad Safari invocation remain unverified by this harness.

### Planned component run (once lead gives the exact integrated candidate)

1. **Provenance:** build `apps/safari-extension/webextension/` with `scripts/build-webextension.mjs` from
   a verified exact copy of the candidate, reusing the preview harness's `provenance.py`. Record that
   the built output equals the committed generated output (`--check`).
2. Load the built extension unchanged in a fresh-profile headless Edge.
3. Open a **current public learning page** with a formula and a figure, for example the Wikipedia
   eigenvalues article. Record the URL and time of the visit.
4. **Negative control:** before the invocation, the product has no page access. Then invoke with
   `triggerAction`, and select a formula or figure region with trusted CDP mouse input through the
   product's own UI.
5. **Check what the extension received:**
   - PNG signature, dimensions and SHA-256;
   - that the pixels are the chosen region: an independent comparison against a DevTools screenshot
     crop of the same rectangle;
   - source URL and title, capture time, and selection geometry and text where the product exposes
     them.
6. **Operability:** after the invocation and after capture, the page still scrolls, its links and
   controls respond, and no leftover overlay blocks input.
7. **Stop, navigation and late capture:**
   - stop, then confirm no live label remains;
   - navigate within the tab, then confirm the old frame is shown as stale or old, never as live for the
     new page;
   - trigger a delayed capture across a navigation, then confirm it is not bound to the new page.

   A local HTTP page on **4184** is used only if a deterministic navigation control is needed, and only
   after checking the port is free.
8. **Identified lifecycle boundaries**, added by lead in `handoff_9bb44ed9714da34ebed917a23c786788`. Web's
   pre-delivery source compared the location only before the asynchronous decode. Each check must show
   the receipt is not bound to changed page geometry or content, and not shown as live:
   - **mark, then change, then late receipt:** after marking, scroll, resize, or change the page content
     without changing the URL, and only then let the delayed receipt arrive;
   - **tab away and back during capture;**
   - **Stop, then one normal action restarts capture.**
9. **Permissions:** confirm no `nativeMessaging` or provider permission, only `activeTab`/`scripting`
   plus what the manifest declares, and that the extension refuses non-HTTP(S) and non-top-frame
   pages.

**Constraints:**
- Do not touch the user's preview (4173/8174), `lc_desktop_preview`, its identities or token, or
  Paperclip.
- No database, credentials, accounts, provider or paid API.
- Evidence goes only in `tests/e2e/**` and `docs/verification/qa/**`.
