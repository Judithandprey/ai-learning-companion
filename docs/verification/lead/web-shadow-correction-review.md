# Bounded shadow capture correction review

**APPROVE the shadow-capture delta in `32b7768df7411ac7557f8d44ca546e9fe1ea625c` for integration and the already assigned QA changed-path pass.** No new capture blocker was reproduced. This is not approval of the candidate's separate ink-persistence changes, and it does not close browser/device acceptance.

## Provenance and scope

- Candidate parent: `c88b5f2ec5467ce9be10d8be1c7c337e10f509f0`.
- Isolated base: main `8c50587e1eb80e1e108c56bbd45ce12dd82f070d`, archived under `/tmp/web-shadow-review-_a0g63ui` and given only the binary delta `c88b5f2..32b7768`. No candidate branch history was merged. The delta also contains the separate persistence correction; that behavior was not reviewed here.
- The five affected shadow paths (content source, generated `content.js`, extension-check, course fixture HTML and fixture source) are byte-identical between main base and candidate parent; the patched versions match the delivered candidate. `git diff --name-only c88b5f2 8c50587 -- <five paths>` is empty.
- Read the assigned workflow/AGENTS/TEAM/lead/task guidance, current decisions, complete affected original/English §7.1–§7.2 and original-goal clauses, English source manifest, prior capture correction review, and QA's `docs/verification/qa/p0-07-integrated-ink-1616cce.md`. The eight translation source hashes matched. Applied PONYTAIL LITE: actual existing capture call flow, native DOM primitives, no additional architecture or dependencies.
- No main/worker writes, Git mutations, browser, service, device, listener, provider, network or DB operations. User preview and native CI work were untouched. No broad unit/browser/recovery campaign was repeated.

## Decisive independent evidence

The probe `/tmp/web-shadow-review-_a0g63ui/shadow-probe.mjs` extracts the actual candidate capture/watcher/Stop source, strips TypeScript syntax, and executes it with the actual `capture-evidence.ts` helpers. The controlled DOM models separate shadow-tree ancestry from document ancestry: a document mutation observer does not receive shadow mutations; DOM `contains` does not follow assigned slots. Hit testing, mutation delivery, animation frames, image receipt and decode are explicit test doubles. This is call-flow evidence, not a browser screenshot or pixel-timing measurement.

**18 controlled groups passed, including one parent-defect reproduction:**

| Case | Actual controlled result |
| --- | --- |
| QA N2 scenario against parent `c88b5f2`: fixed host, marked inner block shifts down 100 px while capture runs and returns | Reproduces `known: true`, a crop containing supplied white pixels, `pageUpdates: 0`, no warning. This validates the probe against the original defect. |
| Same N2 scenario against candidate | `known: false`, `crop: null`, crop hidden, two shadow updates counted and disclosed. |
| N2c stable open-root control | Known crop, supplied green pixels `[46,125,50]`, no spurious update warning. |
| Movement still present at receipt without a delivered mutation callback | Unknown/no crop. |
| Layout-only move/return sampled at animation frames | Unknown/no crop; returning to the original position does not erase the latched change. |
| Shadow movement during asynchronous decode | Final presentation fence changes the result to unknown/no crop. |
| Shadow text update without geometry movement | Crop retained, one update counted and disclosed. |
| Two nested open roots | Both root listeners installed; movement detected and all removed on completion. |
| Slotted light-DOM content, inner shadow container scroll/return | Composed ancestry detects the scroll even though `container.contains(marked)` is false; unknown/no crop. |
| Stable slotted content | Known crop. |
| Closed root exposed through controlled `chrome.dom.openOrClosedShadowRoot` | Movement becomes unknown/no crop. |
| Stable closed root exposed through that API | Known crop; no inaccessible-component warning. |
| Closed defined component without that API | Per-capture note explicitly says movement cannot be watched and the crop may show something else. Geometry remains known in this fallback, as permitted by the QA requested disclosed limitation; no claim of internal movement detection. |
| Undefined hyphenated tag | No fabricated closed-component inference. |
| Stop during pre-dispatch paint | No capture request, no accepted image/canvas replacement, actual Stop retires the capture. |
| Stop during request | No accepted image/canvas replacement. |
| Stop during decode | No accepted image/canvas replacement. |
| Pending request timeout | Failed capture, no crop publication, all root observers/listeners removed. |

Every group checks final cleanup of both mutation observers, animation-frame sampling and document/window/visual-viewport/shadow-root listeners. Every group retains the original mark rectangle, source page object and ASK mark in the actual record. Stop prevents publication immediately through the existing tracker; watcher teardown occurs when the pending capture settles or reaches its existing five-second timeout, not synchronously inside Stop. The tests do not relabel that as immediate teardown.

N2b's **real browser timing remains NOT RUN independently here**. The receipt/rAF/decode cases exercise its relevant failure windows under controlled scheduling; they do not replace QA's actual screenshot attempt. Owner-reported 167 module, 32 capture and 28 ink checks remain owner evidence.

## Source and fixture assessment

- `extension-content.ts:313` uses ordinary open roots first and only optionally uses Chromium's closed-root API. `:318` descends hit tests into visible root content. `:329` and `:341` follow slots and hosts for composed ancestry/root collection.
- `:379` keeps the existing five-point region and geometry comparison; `:414`/`:415` observe each sampled shadow ancestor and listen for its internal scroll. The receipt and final-decode movement fences remain intact. `:510` counts content changes from the same roots; `:451` guarantees watcher teardown on capture completion. No selection/ASK-return implementation was changed by this capture delta.
- The owned fixture keeps a 480×200 host fixed and moves its 160×80 inner block by 100 px, matching QA-EXT-03. The added check reads the newly completed capture, rather than a stale prior record (`extension-check.mjs:362`), distinguishes delayed N2, five N2b attempts, and stable N2c, and separately asserts closed-API and unavailable-API paths. These browser harness additions were inspected, not executed here.
- The implementation still uses five sample points and a maximum of eight root-descents; this review does not establish exhaustive coverage of arbitrary page content. The delivered report explicitly scopes unavailable closed roots: defined custom elements get a warning, opaque roots attached to plain elements cannot be identified reliably. Native Safari capability, ShadowRoot hit-testing/event behavior, `chrome.dom` availability and actual screenshot composition remain unverified. The existing iframe note now also discloses unobserved internal movement.
- A fresh build verifies that delivered `content.js` corresponds to the TypeScript. The build also checks `ink-format.js` and icons, but that mechanical correspondence is not an ink-storage approval.

## Commands and actual results

Working directory `/tmp/web-shadow-review-_a0g63ui`; pinned Node executable `/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node`.

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --no-warnings shadow-probe.mjs
# 18 controlled groups passed (one is the parent reproduction).
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node apps/safari-extension/scripts/build-webextension.mjs --check
# content.js, ink-format.js, icon-48.png, icon-96.png, icon-128.png: current.
```

Logs: `/tmp/web-shadow-review-_a0g63ui/shadow-probe.log` and `/tmp/web-shadow-review-_a0g63ui/shadow-bundle-check.log`. The first unqualified `node` invocation could not find Node in PATH; the same requested checks were run successfully with the already installed pinned executable. No installation or network action occurred.

Next owner/action: lead combines this scoped capture approval with the separate persistence review, then the existing QA task runs N2/N2b/N2c and the relevant Stop/control paths on the actual integrated build. Continuous real AI reception, original-screen ink gates, Safari/iPad/Pencil behavior and Notability import remain separate requirements.
