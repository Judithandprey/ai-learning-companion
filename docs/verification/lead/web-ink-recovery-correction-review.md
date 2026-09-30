# Web ink recovery correction review

**APPROVE for bounded integration and the already-planned actual QA pass.** No remaining IR1/IR2 blocker was reproduced. This is source review and controlled DOM/IndexedDB composition evidence, not browser, Safari/device, provider or full product acceptance.

## Exact candidate and scope

Reviewed `78f3ba87c5887bbd902aea9cb6ba3ea30064189f`, parent `32b7768df7411ac7557f8d44ca546e9fe1ea625c`, in `/tmp/web-ink-recovery-review-njw496n7`: main `8c50587e1eb80e1e108c56bbd45ce12dd82f070d` plus only the original Web delta and this correction. Applied the binary correction after `git apply --check`; all 10 changed extension files byte-match the exact correction commit. Main and worker files were not changed.

This follows `/tmp/web-ink-recovery-review.md` and its full affected R46/R51/A27, §7.1–7.2 original/English requirement refresh, under current workflow/PONYTAIL LITE. Read the changed production source, generated message/format code, focused tests and Web evidence. No capture-path re-review or previous broad campaign replay.

## Findings resolved

- **IR1:** Background now distinguishes an unreadable stored record from actual storage failure. The content queue propagates that distinction; both currently shown and held documents fork as complete editable copies with truthful `unreadable` provenance. Existing raw records are left unchanged. A copy that becomes unreadable forks from its actual copy ID. Commit/transport failures retain failed/unsaved semantics instead of becoming a false success.
- **IR2:** `copyRecord` constructs its envelope from explicit allowed fields; an incoming extra `kind` no longer overrides the discriminator. Background validates the exact prepared record with the reader and same copy ID before `put`, while success remains contingent on transaction completion.

## Independent checks actually run

With `NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node` and scratch above:

```sh
cd /tmp/web-ink-recovery-review-njw496n7/apps/safari-extension
$NODE --test --test-name-pattern='IR1|IR2|failed save|export is' tests/ink-layer.test.ts tests/background-ink.test.ts
$NODE scripts/build-webextension.mjs --check
cd /tmp/web-ink-recovery-review-njw496n7
$NODE apps/safari-extension/tests/review-recovery-probe.ts
$NODE apps/safari-extension/tests/review-export-lifetime-probe.ts
```

The focused Node command reported **2 test-file groups passed, 0 failures**, 1.70 seconds; do not count that as 173 individual independent tests. Generated content.js, ink-format.js and all three icon resources were current. `git diff --check 32b7768 78f3ba8` passed in the source repository.

The original composition probe was retained unchanged as `review-recovery-probe-32b7768.ts.txt`, then updated to require corrected outcomes. It uses the actual layer, extracted actual content-script store queue, and shipped background/format messaging code, with controlled DOM and IndexedDB transaction behavior. Eight checked cases exited 0:

| Case | Observed corrected result |
|---|---|
| Main becomes unreadable after load | saved; one durable copy; two strokes reopen; entire stored document equals refused request; raw unchanged |
| Ordinary conflict control | competing main unchanged; separate two-stroke branch reopens |
| Copy becomes unreadable after load | saved; new copy refers to old copy ID; complete three-stroke document/history reopens; original main and unreadable copy unchanged |
| Extra `kind` in copy descriptor | acknowledged record has `lc-web-ink-copy/v1`, only the seven expected envelope keys, parses/reopens; zero unreadable copies |
| Unreadable answer held until after Stop | one exact whole copy; two strokes reopen; held entry clears |
| Same Stop path, fallback commit fails | remains failed/exportable; no durable copy falsely claimed; retry uses same copy ID and preserves all earlier strokes/history; three strokes reopen |
| Unreadable answer held until after address change | one exact whole copy; two strokes reopen; held entry clears |
| Same address path, fallback commit fails | same truthful failure/export and complete same-ID recovery as Stop |

The last four use an explicit response gate rather than relying on microtask timing. Full document comparisons cover original points, source/anchor fields and history, beyond visible stroke counts. The failure controls use an injected transaction abort (quota-like failure), not a measured browser quota exhaustion. An initial scratch expectation mistakenly assumed restoring a held failed document would not retry: existing `load()` retries it. Corrected the probe to keep failure active through reopen, then release it; this was a probe expectation error, not a product failure.

Recovery probe SHA-256: `1c3dc7671dfd329efb0375438727daba55e1b2e9fb96ccf67f73de9afe37011c`.

## Export cleanup boundary

`ink-layer.ts` now shares the first export's 60-second cleanup timer and revokes outstanding URLs on `destroy()`. A small controlled URL/timer probe confirmed both facts, plus complete editable JSON and truthful `failed: controlled quota failure` metadata. The UI still says **Export started**, not download completed. This probe does not perform or simulate successful browser download completion.

This is a concrete URL-lifetime change; a late subsequent export gets less than its own 60-second grace period. No actual download failure was established, so it is **not an additional integration blocker**. Keep actual file completion and Export immediately followed by Stop in the planned QA retest; a repeated export near the first cleanup deadline is the directly related timing boundary if QA exercises that path. Owner's harness explicitly denies actual download and cannot satisfy this check.

Export probe SHA-256: `55c96be675688092c1f63a2275349c7b977def504a5b0094c0f8b6e5a5dedae5`.

## Disposition

Integrate this correction with its held original delta, then let QA exercise the exact released candidate's real persistence/reopen and download paths. Owner-reported 173 unit / 29 Edge results remain owner evidence; they were not repeated or relabelled independent. No browser, database, service, network, provider or device was started by this review. Whole-screen/AI/Notability/shared-stroke-codec acceptance remains outside this correction.
