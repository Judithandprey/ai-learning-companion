# QA plan and harness start: original learning-page entry/capture (P0-13/P0-07)

- **Assignment:** lead `handoff_a91d01ea7a311c6790a3de674c8db4be` (port refinement
  `handoff_cd498ee967cbc46bed56fb0824a74908`), on baseline main `a7654d7`.
- **Status:** harness preparation only. There is **no candidate yet** and nothing here is acceptance.
- **Acceptance scope** (task card at `a7654d7`, "original Safari learning-page entry"; R01–03, R06–10,
  R59, A01–03, A12):
  - an actual current public course page, not an imported or owned document;
  - real shipped extension invocation with only the necessary permission;
  - an actual PNG of a formula/figure region, with dimensions, hash, source, time and selection;
  - the original page stays operable;
  - stop, navigation and late captures never relabel an old frame as live.
- **Primary acceptance** is on the user's iPad with the installed extension. Everything below is
  separate **desktop** evidence.

## Harness capability, measured

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

## Planned run (once lead gives the exact integrated candidate)

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
8. **Permissions:** confirm no `nativeMessaging` or provider permission, only `activeTab`/`scripting`
   plus what the manifest declares, and that the extension refuses non-HTTP(S) and non-top-frame
   pages.

**Constraints:**
- Do not touch the user's preview (4173/8174), `lc_desktop_preview`, its identities or token, or
  Paperclip.
- No database, credentials, accounts, provider or paid API.
- Evidence goes only in `tests/e2e/**` and `docs/verification/qa/**`.
