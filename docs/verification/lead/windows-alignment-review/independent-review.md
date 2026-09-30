# Windows alignment review — HOLD

Reviewed Web candidate `85de89e0bf08fc6919801c0465d220d0ed4aa3a7`, parent `e586b82`, against the assigned main requirements at `a33932a`. Read-only exact export: `/tmp/lc-web-alignment-review/source`. The six reviewed source/test files were byte-compared with their candidate Git objects and match. Applied project PONYTAIL LITE: one bounded source-path reproduction, existing helpers and Node standard library, no product edits or new framework.

## Blocking finding: local semantic changes are falsely verified and omitted from stroke context

**P2; blocks acceptance of this QA-WIN-01 correction.** Primary locations:

- `apps/windows/src/shared/samples.ts:177–179,196`: any changed cells fitting two 40-DIP squares, covering at most 25% of the grid and leaving textured surroundings, become `spots`, then `verified`. There is no cursor provenance, position or shape input. The comment at lines 151–152 infers that a pointer passed, although only luminance differences were observed.
- `apps/windows/src/renderer/overlay.ts:333–350`: `contentChanged` accepts only `changed`; `spots` and `unclear` are skipped by `noteContextChange`.
- `overlay.ts:374–431`: finished evidence consequently has one original context and no omitted-change count; the multi-context uncertainty guard cannot fire. `unsure` at line 435 returns false and actual `inkMarks` at lines 192–202 counts the stroke as verified.

Concrete reproduction, without any cursor: a 200×16-DIP formula strip has five occurrences of `x-1=2`, drawn at 2 frame pixels/DIP. While a screen-fixed stroke continues over that region, replace the first formula with `x+1=2`. Six cells of the actual 200×16 detail grid change by 200 luminance levels. Candidate result:

```text
comparison=spots; contentChanged=false
contexts=1; context_frames=[1]; changes_not_kept=0
alignment=verified; dashed=false
ink_marks={verified:1, changed:0, unknown:0, following_content:0}
```

A second case also changes a separate `1` to `7` in the fourth formula. Its 21 changed cells receive the same result. These are mathematically meaningful changes, not a page translation or a cursor. They remain meaningful even though the rest of the strip is unchanged and textured.

The probe executes the candidate's unmodified `regionOf`, `detailOf`, `contentChanged`, `noteContextChange`, `strokeEvidence`, `alignmentNow`, `recheckAlignment`, `unsure` and `inkMarks`, imports actual shared helpers, and round-trips the resulting document through actual `parseDesktopInk`. The replacement frame is already available to the renderer; another stroke point follows it. This is not a missing-acquisition hypothesis.

The consequence is specifically an omitted *stroke-context segment* and a false alignment claim. Separate whole-display retention may still keep the newer raw image; this review does not claim deletion of that entire archive. Drawing and ASK use the same `unsure`/alignment map by source inspection, and the executed `inkMarks` is already false. No browser rendering, encoded composed PNG, provider call or actual AI acceptance was exercised.

This violates the R46/R51/R59 and §7.4 requirement to retain contemporaneous context when writing continues through a meaningful page change, and the R52/A30/A31/A44/§7.1 requirement to preserve uncertainty and observed changes. Screen-fixed placement does not waive the source/context requirement. The native author run and a documented limitation do not authorize losing those facts.

## Bounded correction requested from the existing owner

Without independently established cursor-only evidence, do not promote arbitrary local differences to `verified`. At minimum keep them uncertain and ensure the observed changed frame is retained as a writing context (or explicitly represented as an unretained change at the existing cap). Both alignment and context collection need the correction; changing only the displayed label still loses the context. Keep genuine unchanged/noise controls, the existing detail bound, legacy reading and source unknowns. No generic framework or inferred DOM/operation history is needed. Add the sign and separated digit cases to the existing focused tests, including continued writing and the composed/ASK uncertainty paths. Parent can schedule this as one next safe-boundary task without interrupting the mapper in flight.

## Executed evidence

Pinned interpreter:

```text
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
```

Existing focused tests, executed once from the exact export:

```sh
cd /tmp/lc-web-alignment-review/source/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test tests/shared.test.ts tests/overlay-alignment.test.ts
```

Exit 0; runner reported 2 passing file tests, 0 failures (345.054897 ms). This does not repeat or independently endorse the author's 61-test/native checks.

Independent reproduction:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/lc-web-alignment-review/probes.mjs /tmp/lc-web-alignment-review/source
```

Exit 0: nine deterministic source-path cases. Assertions record the candidate's actual behavior, including the two reproduced defects; “PASS” in this diagnostic is **not** product acceptance. Exact output is `probes.log`. Probe SHA-256: `05720b338c1ed5f8841ef059b028ae41469d8c603fb13fb9e9e6ddbfd8b0684d`.

| Case | Detail result | Final alignment | Stroke contexts |
| --- | --- | --- | --- |
| Unchanged textured formulas | same | verified | 1 |
| ±6 luminance noise | same | verified | 1 |
| Minus becomes plus; no cursor | spots | **verified, wrong** | **1, missing later context** |
| Sign plus separate digit change; no cursor | spots | **verified, wrong** | **1, missing later context** |
| Synthetic cursor moves over unchanged text | spots | verified | 1 |
| Large content change | changed | changed | 2 |
| Old document, unchanged, no detail | same | unknown | 1 |
| Old document, large change, no detail | changed | changed | 2 |
| Synthetic cursor moves over blank background | unclear | unknown | 1 |

The positive cursor case establishes only that the heuristic tolerates the supplied cursor image. Because the production inputs lack provenance, it cannot distinguish that case from the semantic changes above. Blank regions and legacy no-detail evidence are conservatively unverified. Actual parser round-trips preserve new optional details and older documents without details; no new compatibility blocker was found in this bounded reading.

The portable canvas substitutes deterministic area averaging for platform canvas rendering. The tested detail cells map exact uniform 2×2 source blocks to one cell. Source comparisons, context/evidence logic and parsing are production code. No native/window launch, provider, DB, service, install, network, main/worker edit, or Git mutation occurred.

## Test/document observations and boundaries

The existing new tests cover line replacement/scrolls, pointer/noise tolerance and legacy behavior, but not small meaningful changes on a textured surrounding page. The whole-overlay alignment test changes a global synthetic shade. Its canvas helper does not model locally changed, separately pinned bitmaps; it cannot establish this negative case.

`docs/verification/web/windows-original-display.md:103–117,355–357,669–670` documents the local-spot exemption, including a limitation. It remains a requirement failure rather than an accepted user decision. The same document's lines 691–692 still say writing-context changes use a 6% luminance threshold; that is stale for this candidate's detailed-grid path and should be corrected with the behavior. `samples.ts:113` also describes the retained coarse constant broadly; clarify that it now serves only legacy alignment.

No broader rendering/performance campaign or native repetition was run. Both §7.1 real-AI gates, actual device pen/capture behavior, content-following support and full original-screen/Notability acceptance remain separate and open. Next action: Web corrects the one local-difference classification/context seam, then lead performs focused review and QA verifies the corrected exact desktop source.
