# QA-P07-01 Web re-selection review

**Decision: approve integration of `b471bdf301e5d7b598f7fe387f7fe651e1177310`. No blocking defect found in this bounded review.** Real-API changed-path verification remains with QA after integration; this is not original-course-screen, AI, Safari or iPad acceptance.

## Exact scope and candidate

- Parent: `75dad5edb7f3d97c94373df3c409294bc1ee4054`; target main: `d8b7afafbbd9471967b0c5f038071a6f3eded3a0`.
- Independently confirmed that all four changed source files are byte-identical between parent and target main: `src/page.ts`, `src/dom-capture.ts`, `preview/src/preview-page.ts`, `fixture/src/selftest.ts` under `apps/safari-extension/`.
- Read the complete four-file diff, focused runner, delivery report and affected event/guard/mode/uninstall call paths. Applied R06–R10/A03, the unsaved-work/source invariants and unchanged workflow/PONYTAIL LITE policy.
- Scratch candidate: `/tmp/p0-web-reselect-fv6ljrpj`. Created with `git archive d8b7afafbbd9471967b0c5f038071a6f3eded3a0 apps/safari-extension packages/contracts package.json`, then overlaid only the paths returned by `git diff --name-only 75dad5e b471bdf`, from `git archive b471bdf <those paths>`. This preserves main's generated wire import/shared contracts; it does not reintroduce Web's old wire mirror/example fixture.
- No main/worker edits or commits by this reviewer. Root staged the delivery independently while this review was in progress.

## Independent execution

From `/tmp/p0-web-reselect-fv6ljrpj/apps/safari-extension`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p tsconfig.build.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node scripts/preview-reselect-check.mjs --browser '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --out /tmp/p0-web-reselect-fv6ljrpj/review-evidence --run review-reselect
```

Build passed. Focused trusted-CDP mouse check passed **10/10, zero runner errors**, Edge 154 headless, with the visibly labeled in-page test double and synthetic UTF-8 document. Existing foreground harness completed normally and cleaned its temporary server/browser/profile. No API, DB or external provider was activated.

Evidence: `review-evidence/review-reselect.json`, `.log`, and its three PNGs in that scratch candidate. Independently observed:

- Unknown save and refused new selection retain equal `{status, item_id}` attempt snapshots, the original `trace(A²)` selection and `My note on X.`. Retry confirms the existing item; selecting the same formerly refused Chinese words creates a fresh draft.
- Typed words on that new draft survive another actual refusal. Refused text is not left natively selected.
- Re-selection after ordinary Discard, click on an existing NAV selection, press from adjacent padding, and 2px click jitter all work. NAV selection itself creates no draft. No native `dragstart` occurs in the checked re-selection cases.

I did not repeat the 113-unit, 54-selftest, 37-trusted, 21-entry, 33-preview, mutation or native campaigns. Root's integrated portable checks and the author's broader evidence are separate observations.

## Code/lifecycle assessment

The shared fix addresses both refused and ordinarily discarded selections using the existing caret hit-test and native Range API. Added state lasts for a pending mouse gesture; no new layer, dependency, storage model or contract is introduced. Only plain primary ASK presses on an existing range set it aside. Modified/secondary presses and normal NAV/WRITE entry paths bypass this clearing. Pen/finger capture is unchanged. The preview guard additionally clears only refused `explicit_text_ask` selections and leaves draft/attempt/note/source data untouched.

On pointer cancel, the saved range is restored, pending state cleared, one cancellation event emitted and no submission made. The strengthened retained owner check records 0 asks/requests, preserved `eigenvector` and exactly one `pointer_cancelled`; I inspected that record, but did not independently rerun the entire selftest. Click restoration precedes the existing active-ASK/current-epoch guard; a mode change or a newer ASK does not authorize that pending gesture. Pending-pointer lifetime across mode changes predates this patch. Uninstall removes all input listeners. I found no concrete new stale-mode submission or saved-data defect from the Range addition; mode teardown conclusions here are code review, not new browser device evidence.

## Retained evidence and publication hygiene

Inspected all **20 added PNGs** and the **5 added JSON reports**. PNGs contain owned fixture/document content and have no text/EXIF metadata chunks. JSON scan found no bearer/API-key/private-key/DSN or private-profile-path patterns. No real credential/private document was detected. The visible password in the entry screenshots is the hard-coded synthetic input from `scripts/entries-check.mjs`, including its scripted edit; it is not an account credential. The screenshots' fixture explanations are explicitly labeled synthetic; the document preview states provider unavailable and test-double storage.

Retained before/after reports support the author's **5/10 → 10/10** claim with the same Edge version. The report correctly retracts the older 33-check campaign's `preview.unsaved_item_kept` as stale-notice evidence; do not reuse that result as proof of a genuine refusal. The new checks exercise genuine refusals after an empty notice.

**Next owner:** lead integrates and records the exact resulting SHA; QA runs the already-planned narrow real-API unknown-save → refusal → confirm/retry → same-phrase re-selection path on that SHA. No additional repair or design round requested.
