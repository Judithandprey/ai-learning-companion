# Windows alignment correction review

**QA-WIN-01's false VERIFIED / lost local context defect is corrected. One inherited P2 defect remains in the saved omitted-change count at the eight-context cap. Do not mark that cap/history-fidelity behavior accepted.** This is not a claim that the exact delivery as a whole is integration-ready: its mapper parent remains separately held.

Exact candidate: `e03fefcc9d68676f172993ac18545091d3c8c4f3`, compared with parent `80da708f21ad87a11073de0ab5749b9cb8fee468` and the held alignment implementation `85de89e`. Read-only source export: `/tmp/lc-windows-alignment-e03fefc`. Current affected requirement/decision/workflow files have no diff from the preceding review's `40f959d` baseline. Applied project PONYTAIL LITE: actual functions, existing portable harness and narrow comparisons; no implementation or broader campaign.

## Original defect: closure evidence

The correction removes `SPOT_DIP`, `spotCells`, and the `spots`/`unclear` exception. `detailChange` now returns changed if any sampled detail cell moves by more than the declared 16/255 tolerance. The renderer uses that same result for both alignment and collecting writing contexts. It no longer infers cursor provenance from two small changed regions.

The original probe remains byte-identical at `/tmp/lc-web-alignment-review/probes.mjs`. A separate adapted probe executes the candidate's actual comparison, context collection, evidence construction, alignment recheck, uncertainty and ink-marks functions with deterministic synthetic bitmap/canvas inputs.

| Independent case | Corrected result |
| --- | --- |
| `x−1=2` → `x+1=2`; no pointer; 6 changed cells | changed, 2 contexts, frames 1 and 2, dashed, verified count 0 |
| Same sign change plus separate `1→7`; 21 cells | changed, 2 contexts, dashed, verified count 0 |
| Moving synthetic pointer on textured pixels | changed, 2 contexts, dashed; no cursor exemption |
| Moving synthetic pointer on otherwise blank background | changed, 2 contexts, dashed |
| Unchanged textured formulas | verified, 1 context |
| ±6 luminance noise | verified, 1 context |
| Large content change | changed, 2 contexts, dashed |
| Legacy no-detail document, unchanged | unknown, dashed; parser accepts its original form |
| Legacy no-detail document, large change | changed, dashed |

The changed contexts use the pinned starting/later frames; the original detail, region and context records survive actual `parseDesktopInk` round-trip. The existing whole-overlay alignment tests also exercise sign/digit/answer changes through actual overlay/main save/readback and check composed marks plus the ASK uncertainty message. Their capture/canvas/PNG implementations are fakes, so these tests establish control flow and saved metadata, not native pixel fidelity or real AI receipt.

Source inspection confirms `recheckAlignment` retains uncertainty for multi-context or explicitly omitted-context strokes; content-following ink remains dashed. Composition and ASK both use the same alignment map/marks. The correction leaves `main.ts`, `desktop-ink.ts`, original stroke/history semantics, save/recovery and Stop logic unchanged. The focused Stop suite passed: an in-progress stroke is saved before ACK and new input is rejected after Stop. The independent cap probe below additionally saved through that actual Stop path.

The 16/255 tolerance and bounded detail resolution remain pixel-comparison limits, not proof that all semantic changes at every scale are observable. Unavailable source app/link/page/media position remain unknown. Neither input mode nor alignment grants teaching/disclosure authority. No real display/pen/provider acceptance is inferred.

## P2 inherited residual: persisted count is not a count of material changes

**Location:** `apps/windows/src/renderer/overlay.ts:346–359`, persisted at `:410`.

At the eight-context cap, `noteContextChange` continues comparing each new frame with `g.contexts.at(-1).frame`, the last retained picture. It increments `changesNotKept` without advancing what later comparisons use. Consequently stable local pixels can increment repeatedly, while a real return to the last retained pixels is missed.

This is not merely a disagreement about an undocumented counter:

- `apps/windows/src/shared/desktop-ink.ts:70` describes the serialized field as **“Material changes while writing beyond MAX_CONTEXTS, counted but not pictured.”**
- `docs/verification/web/windows-original-display.md:524` says `changes_not_kept` **“counts material changes beyond 8 contexts.”** The new correction section at lines 110–113 also says further changes are counted.
- No numeric UI display or alternate “observations differing from the last stored picture” meaning was found. The defect's demonstrated effect is saved metadata, not a falsely verified UI state.

Minimal executed reproduction through **actual complete overlay.ts and main.ts**, using their existing fake-platform harness:

1. Keep writing after each frame. Starting context plus seven visible local changes fills eight contexts. The last retained patch has luminance 140.
2. Case A: local patch becomes 160, then stays 160 in another new frame. Only one local transition occurred after the cap, but `changes_not_kept` becomes **2**.
3. Case B: local patch becomes 160, then returns to 140. Two local transitions occurred after the cap, but `changes_not_kept` stays **1**.
4. Every new frame also changes a pixel outside the stroke, so new frame delivery does not depend on inventing a local change. Writing continues after each observation.
5. Stop settles the still-open stroke, saves it through actual main, and returns a successful ACK. Actual on-disk JSON, parsed back by `parseDesktopInk`, contains the incorrect counts above.

Saved evidence:

- `/tmp/windows-alignment-cap-saved-repeat.json`: eight contexts, `changes_not_kept:2` for one post-cap local transition.
- `/tmp/windows-alignment-cap-saved-return.json`: eight contexts, `changes_not_kept:1` for two post-cap local transitions.

Both retain all 11 observed ink points, one history entry and eight ordered contexts. Both Stop ACKs are `[null]`. The function-level cap probe also verifies eight pins are released. This is not evidence of new original-ink loss, extra context allocation or a renewed VERIFIED bypass; multi-context ink remains uncertain. It is nevertheless inaccurate source-history metadata under R51/R52/A30/A31, and was explicitly within the requested cap audit. The cap logic predates this correction; keep this finding separate from QA-WIN-01 closure.

**Smallest required behavior:** once the picture cap is reached, repeated observations of unchanged local pixels must not inflate a field documented as material changes, and an observed return to earlier local pixels must not disappear from that count. Keep the eight-picture bound, editable originals, ordered retained contexts, explicit omissions, uncertainty and Stop/save behavior. Do not infer user operations or reasoning from those pixels. This describes the required result without prescribing a new state model or framework. Lead can assign it as Web's one next task after the current mapper repair; no concurrent owner task was sent here.

## Executed commands and artifacts

Existing focused checks, executed once:

```sh
cd /tmp/lc-windows-alignment-e03fefc/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test tests/shared.test.ts tests/overlay-alignment.test.ts tests/overlay-stop.test.ts
```

Exit 0. Runner reported three passing file tests, zero failures, duration 949.486971 ms. The author's 76-test/typecheck and native 45-check claims were not rerun or adopted as independent QA.

Independent regression and cap boundary:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-alignment-correction-probes.mjs /tmp/lc-windows-alignment-e03fefc
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-alignment-cap-save-probe.mjs
```

Both exit 0. The first executes nine regression/control cases and the cap diagnostic. The second reproduces both cap-count errors through actual save/Stop/readback. Diagnostic assertions intentionally capture the observed defect; their successful exit is not cap acceptance. Logs:

- `/tmp/windows-alignment-correction-probes.log`
- `/tmp/windows-alignment-cap-save-probe.log`

SHA-256:

- Preserved old `probes.mjs`: `05720b338c1ed5f8841ef059b028ae41469d8c603fb13fb9e9e6ddbfd8b0684d`
- `windows-alignment-correction-probes.mjs`: `08486a9e811d4fcc36486cb5adb156797cac41225e418bf0e14ea6074cb99257`
- `windows-alignment-cap-save-probe.mjs`: `07b82bfc14b965e1f6bb344a58983fbdcffc3bf8b430899923070cd8f333e693`

The full harness stores real JSON files in temporary directories, but Electron, capture and canvas are faked, and its context PNG encoder returns test images. No native display was launched and no original pixel-byte fidelity claim follows from that harness. No broad tests, native rerun, provider, DB, network, service, dependency install, repository/worker edit or Git mutation occurred. Current root-owned dirty task/evidence files were preserved.

Before this review, `/tmp/windows-mapper-review.md` received the requested separately attributed integration note: the third review/Lead reproduced HTTP 403 for the mapper's `original_screen_overlay` surface under current `desktop_pixels` admission. That mapper issue remains separately held; no mapper repair or test was performed in this alignment review.
