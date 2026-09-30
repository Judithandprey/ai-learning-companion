# QA plan: original-screen core loop and its components (P0-13/P0-07)

- **Assignment:** lead `handoff_a91d01ea7a311c6790a3de674c8db4be` (port refinement
  `handoff_cd498ee967cbc46bed56fb0824a74908`), baseline `a7654d7`.
- **Amendment:** lead `handoff_be4b27cf7ddc42cfd8399ce556034f6e`, baseline `1cbc38f`. The user corrected
  the narrow "select a region on a page" reading; this plan is expanded in place, not a new campaign.
- **Aligned with canonical §7.1** ("Core usable loop", `docs/requirements.md` and `docs/requirements.en.md`)
  at main `ae1f20b`. It also includes the wording corrections from lead
  `handoff_f37d179c7bafdd9c7f0c1d814a9ef38d`. When this plan and §7.1 differ, §7.1 governs.
- **Status:** the desktop browser capture pass ran on the lead's exact candidate `b8ec18e`
  ([report](p0-07-original-page-component.md)): not accepted, with two medium region findings. The
  integrated capture + editable-ink pass then ran on `1616cce`
  ([report](p0-07-integrated-ink-1616cce.md)):
  - 35 of 35 listed ink assertions pass, but the observed refused-stroke reload loss
    remains a lead-confirmed R46/A27/§7.2 defect; this is not full durable-ink acceptance;
  - QA-EXT-01/02 are closed;
  - one new medium variant, QA-EXT-03, keeps the capture component unaccepted.
- **Retest at `ae585e0`** ([report](p0-07-recovery-ae585e0.md)):
  - QA-EXT-03 is closed for open roots, and for closed roots where `chrome.dom` is available;
  - ink recovery and Export pass 20 of 20 behaviour checks;
  - QA-EXT-05 is conditional on missing `chrome.dom`; QA-EXT-04 is a false closed-component
    note on a readable light-DOM custom element, observed with `chrome.dom` available.
- **Closed-root retest at `dce0940`** ([report](p0-07-closed-dce0940.md)):
  - QA-EXT-04 is closed;
  - QA-EXT-05 is corrected to a disclosed limit (`limit_disclosed`, not a pass);
  - with `chrome.dom`, closed-root movement stays unknown, and the still controls show correct pixels.

  The core loop and both gates remain unaccepted and unexecuted.

## The core loop being accepted

One integrated loop on the user's real screen, in this order:

1. the necessary system sharing confirmation, then staying on or returning to the original screen, with
   no file import, no repeated screenshots and no selection for each observation;
2. automatic, fresh whole-visible-display observations reach a **real** AI while the user scrolls,
   switches supported foreground apps, plays video, writes and edits (ASK is optional);
3. NAV, then explicit WRITE, then a short draft;
4. erasing only a chosen part, then undo and redo;
5. an ASK circle; finish or cancel restores the previous WRITE, and writing continues;
6. save and reopen, then keep editing the original strokes.

It has two independent gates, and each reports only its own evidence:

| Gate | What must be shown | Current blockers |
| --- | --- | --- |
| **1. Continuous whole-visible-display observation** | Across several real visible changes and supported foreground apps, fresh captures of the entire visible display reach a real provider without repeated selection. The responses are grounded in the received pixels, source and time, including visible changes across observations. One grounded frame is not continuous observation. | real provider; device and signing; implementation |
| **2. Original-screen cross-app selector and pen** | On the original screen and across apps, the actual selected pixels, with the ink composited on them, reach the same AI context. QA inspects the image the AI actually received; ink shown only locally or sent separately does not pass. | real provider; device and signing; implementation; public-API cross-app limits (owned by iOS/Support). QA labels these limits on iPad Pro 13-inch (M5), iPadOS 26.5 as unverified or unsupported, never as a pending pass. |

**Whole screen** means the entire currently visible display. It is not browser maximization or
fullscreen, DOM text or this app's canvas. Screen broadcasting grants no cross-app interactive overlay,
so gate 1 evidence never counts toward gate 2.

**Not core acceptance:** the following are labeled dependency components or fallbacks only. None of
them passes the loop or either gate, and none silently substitutes for the original screen:
- single-frame capture or storage, and a single tab;
- screenshots shown only in our UI, and an imported screenshot or file;
- DOM text, a textarea, an owned or mirrored canvas, and browser fullscreen;
- a mock provider and a document library.

Real provider, signing and device checks stay unaccepted while unfinished.

## Checks planned for the core loop (run only on an exact candidate and a real route)

- **Freshness and change** (observed across several real visible changes):
  - each observation carries its capture time and source;
  - scrolling, switching supported apps, playing video, writing and editing each produce new
    observations;
  - end-to-end freshness and latency are recorded: visible change, then capture, then provider request,
    then response;
  - coverage is recorded: each frame covers the full visible display, not a window or a crop, and the
    apps, areas and intervals that were not covered are named;
  - dropped, stale, occluded and unobservable intervals are labeled as gaps, not hidden. Adaptive
    sampling is not a frame-perfect promise. Meaningful steps that were actually observed are still not
    silently lost later, for example by sampling, deduplication or context trimming;
  - the frame sent matches the frame captured. Record the SHA-256 of the captured bytes and of the
    actual outgoing image input, and the mapping between them: the same bytes, or a recorded transform
    such as scaling or re-encoding. A region crop may serve selection evidence but cannot
    substitute for gate 1's full visible-display input;
  - bind that mapping to the real request and response identity and to the provider's actual
    acceptance and grounded result. A vendor-echoed image hash is not required or invented if the real
    API does not return one. If the provider side cannot show which bytes it saw, report that
    limitation as it is. A mock receipt never substitutes;
  - the response is grounded in the received pixels, source and time. It describes the visible changes
    across observations, not only each frame on its own.
- **Content types:** a webpage, a diagram, handwriting, a video frame and an external camera preview
  visible on the display are each validated within their actual supported scope. Each gets its own
  result: supported, unverified or unsupported.
- **Unknowns stay unknown:** steps the AI did not see (between samples, occluded or off-screen) and
  reasons the user did not state stay unknown. A made-up account of the user's process fails.
- **Edits do not trigger help by themselves:** an edit or erase alone does not trigger an explanation
  or raise disclosure. This is not a global no-proactivity rule: independently authorized R49
  proactive teaching is kept, and R53's exploration limits apply within their scope (problem solving,
  "let me try").
- **Stop, pause, permission withdrawal and disconnect:** after each, live-vision claims for that source
  end, and later receipts are not bound to the new state. Another source that is still authorized may
  truthfully stay live.
- **Selection alignment:** the selector and ink still line up with the underlying pixels after the user
  leaves the browser for a supported native app, and after window, scale and orientation changes.
- **Tools are visible and work:** the NAV/WRITE/ASK controls, pen, eraser, undo and redo. Pencil squeeze
  and double-tap are optional shortcuts only; the buttons stay available. Partial erase leaves the rest
  of the stroke. Undo and redo restore exact states.
- **Ink modes:** content-following and screen-fixed ink are each tested on their own.
- **Input:**
  - on the actual iPad, real Pencil writing and finger navigation are verified separately;
  - a desktop writing trial needs an explicitly enabled mouse-writing mode. If there is none, the
    report says so before anything is called a writing trial;
  - a finger never counts as Pencil.
- **ASK circle inside WRITE:** finishing or cancelling returns to the previous WRITE, without losing or
  moving existing strokes.
- **Save, reopen and continue:** the strokes come back as editable originals, not as flattened images.
  A real edit after reopening, such as a partial erase or extending a reopened stroke, is performed
  and recorded.
- **Archive rules** (§7.1 keeps them unchanged):
  - purpose-aware archiving still applies;
  - a draft is never sent out automatically, and organization is asked about after completion;
  - originals stay independent of AI additions;
  - a Notability import counts only with actual official import evidence. A share sheet is not an
    import, and PDF/PNG is not native editable strokes.

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
