# QA ink evidence delivery review

Disposition: **APPROVE the evidence/harness delta for integration**. No integration or image-hygiene blocker found. This is an audit of retained QA evidence, not a new runtime acceptance. Product candidate `1616cceb1a1fe21a4444919c07477faf749f71c1` remains **NOT ACCEPTED**: QA-EXT-03 is supported by the retained evidence, and the lead has confirmed the refused-stroke reload loss as an R46/A27/§7.2 retention defect. The 35 ink checks do not close either core gate or all original-work preservation requirements.

Exact delivery: `efa79006b2aac489be188b0888c1d08596bee5cd`, parent `2e4486d7f799ae4ccc9dcc679d8645af05662b7c`; integration baseline `35cfa94e7adf560b8dd4e672138c0076a98c5f29`. PONYTAIL LITE/current workflow used. No repository edits, browser, listener, database, provider or user-preview execution.

## Independently observed

- Read the complete QA report and changed harness/analyzers, including input generation, the two-tab targeting additions, negative-result classification and the retained scope/instrumentation labels. The changed production-source cause was checked against exact `1616cce` source; this was not a fresh product review.
- Parsed both committed summaries: 35 unique ink checks, all `pass`; 44 unique capture checks, 42 `pass`, with exactly `repro.shadow_internal_shift` and `repro.real_timing_shadow_shift` failing. The five real-timing shadow attempts are 3 wrong, 2 not exercised, 0 safe exercised outcomes. The unchanged-shadow control records 100% green. Aggregate counts and report times agree.
- All five harness SHA256 values in the summaries equal the committed files: `run.mjs`, `qa-cdp-runner.ps1`, `analyze.py`, `ink-steps.mjs`, `analyze_ink.py`. All seven shipped WebExtension resource hashes in both summaries equal the corresponding Git blobs at `1616cce`. The candidate has exactly 92 tracked Web files, consistent with QA's provenance count. Actual historical 92-file copy comparison/build/browser execution remains QA evidence; only its retained metadata and harness guard were independently audited here.
- Exact delta applies cleanly to an isolated archive of main: `/tmp/qa-ink-integrated-check`. The main F1 fix is outside this delta. `tests/e2e/web/run_p0_02_r2_mutations.py` remains byte-identical to both `35cfa94` and `69a719c`; SHA256 `f38aaa40d66f36fc7d2e25dde4d26f5192565e1cea8143779a9af7205375b811`. Apply only `2e4486d..efa7900`; do not replace the whole tests tree from the older QA branch.
- Python in-memory compilation of the two changed analyzers passes; `node --check` passes for both changed `.mjs` files; `git diff --check 2e4486d efa7900` passes. PowerShell changes were reviewed statically, not executed.
- Summary scan found no credential-bearing keys/values, bearer credentials, DSNs, private-key material, local Windows profile paths or embedded public-page image data. PNG review is recorded separately below.

## Required interpretation and small wording correction

1. Report `docs/verification/qa/p0-07-integrated-ink-1616cce.md:24` says `ink-*.png` are DevTools screenshots, but `ink-ask-capture.png` is the exact `captureVisibleTab` PNG (correctly produced by `analyze_ink.py` and covered by line 23). Change that phrase to the numbered `ink-01` through `ink-14` images. This is a nonblocking labeling correction; preserve both classes of original evidence.
2. `analyze_ink.py:406` / report lines 245–251 explicitly retain `ink.conflict_reload_behavior`: refused stroke A2 remains only in tab A and disappears on reload. Its `pass` means the observed behavior matches the stated observation, not that loss of unsaved original ink is accepted. Keep this limitation visible when citing “35/35”. Lead has independently confirmed it as an R46/A27/§7.2 retention defect and assigned Web the correction alongside QA-EXT-03. Qualify report lines 7–9 / heading 163 and plan status as 35 precise assertions, not full ink acceptance; replace lines 245/251 “not QA defects” / “product decision” with the confirmed retention disposition. Preserve historical assertion values and observed loss; the evidence does not waive the original requirement.
3. QA-EXT-03 is an actual retained failure, not a speculative shadow-DOM concern: reported known crop `78,205 132×53`, all white with no green; the captured green block is at rows 292–371 rather than mark-time 192–271. Candidate `pageTopAt` samples the host and the observers watch `document.documentElement`, consistent with the failure. Web owns the bounded correction; QA retests N2/N2b/N2c on the exact corrected candidate. No broad replay is required by this audit.

## Reproducible audit commands

```sh
git diff --binary 2e4486d efa7900 > /tmp/qa-evidence.patch
# Extract main35cfa94 tests/e2e and docs/verification/qa into a fresh /tmp directory.
git -C /tmp/qa-ink-integrated-check apply --check /tmp/qa-evidence.patch
# The review additionally applied that delta to the scratch archive and compared F1 bytes.
node --check /tmp/qa-ink-integrated-check/tests/e2e/web/original_page/run.mjs
node --check /tmp/qa-ink-integrated-check/tests/e2e/web/original_page/ink-steps.mjs
git diff --check 2e4486d efa7900
```

Hashes were computed using SHA256 of `git show efa7900:tests/e2e/web/original_page/<harness>` and `git show 1616cce:apps/safari-extension/webextension/<resource>`, compared with both parsed committed summaries. Python syntax was checked with `compile(path.read_bytes(), str(path), 'exec')`, without importing/executing either analyzer. Node executable used: main `.tools/node-v24.21.0-linux-x64/bin/node`.

Retained summaries: capture SHA256 `47ea4b6a3b47e0420d63746877ce9707453abfb5f96d37b3eb3d213bfc8b706c`; ink SHA256 `ebd252f8f0f8da4d545d7e7dd98ad8910e71e288c23d350347c909d6e4b5aaeb`.

## Evidence limits

The public JSON omits raw browser results and full IndexedDB documents. Therefore the stored-data, message-chain and previous temporary-profile cleanup claims are QA-run evidence, not independently reexecuted findings here. Public-page crop metrics remain metadata-only. This audit cannot establish Safari/iPad/Pencil/finger behavior, provider receipt, continuous observation, native overlay, Notability import or either complete core gate.

## Completed independent image audit

Delegated bounded image inspection completed; detail: `/tmp/qa-ink-image-review.md` (inventory and verification JSON in `/tmp/qa-ink-image-review-fqobuuw2`). All 37 committed PNGs were individually viewed by the independent image reviewer: 14 DevTools ink screenshots, 16 capture images, 7 crops. They show owned synthetic course fixtures, product UI, synthetic ink, or solid-color crops; no private content, credentials, or public Wikipedia pixels were observed. Container checks found only IHDR/IDAT/IEND, valid CRCs, no trailing bytes or text/EXIF metadata.

Twelve retained captures match literal summary SHA256/length/dimensions; the ink ASK capture matches its summary hash. Six crops exactly match the corresponding summary rectangle/source pixels. The seventh real-timing shadow crop is pixel-equal at the same fixture rectangle, but that attempt does not retain its own literal rectangle/hash. Three real-timing captures omit literal hashes in their summarized attempts: `n2-real-timing-shadow-shift-wrong-0`, `r4-real-timing-scroll-kept-unknown-3`, and `r5-real-timing-style-shift-kept-unknown-0`. Their pixel/container hygiene was checked; event identity remains QA evidence. No retained PNG matches any of the three public-page capture hashes. No additional browser execution occurred.
