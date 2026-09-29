# Bounded triage of QA 2f83761

**Recommendation: integrate the tests/report as scoped QA evidence.** No blocker to merging this additive QA delivery was found. It adds only `tests/e2e/web/**` and `docs/verification/qa/**`; it does not change application behavior. Keep all reported defects open. None of its confirmed medium defects is on the currently implemented real-document preview call path, so this report should not interrupt the pending preview adapter/iPad delivery work.

Reviewed exact `2f83761` (parent `7ddc12f`), its report, every added probe/test, and committed evidence. QA tested `0c04b2e`; current integration baseline supplied by lead is `2118a0e`. The relevant disclosure/organize models, organize tests and fixture entry observer are byte-identical between those two baselines (`git diff` for those paths is empty). Current preview/runtime acceptance is **not** established by this older QA run.

## Impact on the current preview

| Confirmed medium item | Current path and impact | Narrow owner-next action |
| --- | --- | --- |
| EO-1 residual: non-composed scripted checkbox click in an open shadow root attributed to the learner | Actual Edge observation, but in `fixture/src/entry-observer.ts`. Only the owned entries fixtures install that observer. `preview/src` and production probe `src` do not import it; real UTF-8 documents render as inert text, with explicit ASK/note input. It therefore does not corrupt current preview observations. | Web: before reusing this observer in any real course/input adapter, distinguish this activation from a user gesture and pin the exact browser trigger plus genuine-user controls. Keep unknown when origin cannot be proved. |
| WEB-DISCLOSURE-01: attempt revision resets on leave/return | Confirmed test-model defect. `tests/p0-12/disclosure-model.ts` rebuilds an attempt without storing/restoring its revision. The preview uses `ProbeSession`, frozen DOM context and provider-unavailable cards, with no import of this model and no cached teaching outputs. | Web: preserve revision per attempt and change the focused strict xfail to a passing regression before a teaching client adopts this model. Lead retains the separate exact-ACK/causal-policy contract work. |
| WEB-ORGANIZE-01: unverified-import guard not pinned | A **coverage gap**, not a demonstrated wrong result in the current organize model. The model and export/import state machine are test-only and absent from the preview save API. | Web/QA: one focused sequence showing unverified import remains unverified, including timeout/repeated confirmation, before export adoption. |
| ORG-3 coverage: failure-final mutant loses later exposure evidence | Coverage gap; correct unmutated model, unrelated to preview archival save/readback. | Web/QA: pin pre-dispatch failure followed by real dispatch/effect evidence, then remove the corresponding xfail. |
| Per-layer disclosure coverage: first-layer-only mutant passes | Coverage gap; the preview exports no multi-layer AI supplement/Notability manifest. | Web/QA: a two-layer manifest with the later layer disallowed must refuse export; then remove the xfail. |

The exact current source path is `preview-page.ts → installProbe/ProbeSession → frozen selection/request/unavailable card`, plus `buildSave` for an explicitly typed user note. The new Python `services/api/preview.py` uses the existing Archive/wire and persists the explicit request plus user-original note; it imports none of these JS models or the fixture observer and returns `ai_status=provider_unavailable`. At `2118a0e`, the UI adapter is still pending: API capability is not a connected end-user workflow.

## Independent merge-safety check

Created `/tmp/p0-qa-retest-triage-cr6h7k_n` from exact main `2118a0e`, then overlaid **only the 20 added files** from QA `2f83761`. Ran only the new collected regression module:

```sh
cd /tmp/p0-qa-retest-triage-cr6h7k_n
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q tests/e2e/web/test_p0_12_retest_qa.py -rx --basetemp=/tmp/p0-qa-retest-triage-cr6h7k_n/pytest-tmp
```

Result: exit 0, **2 passed, 3 strict xfailed in 0.42 s**. The xfails retain the revision defect and the two organize mutation-test coverage gaps; they are not successful product behavior. Tests mutate only `tmp_path` copies. Pinned Node is checked before collection; an environment without it skips this module. No runtime tests, browser/services, 240-case suite or 1.8M-step campaign were rerun.

The source inspection confirms the report's scope: EO-1's committed Edge result contains `check:#open-host>#open-box:user:trusted_event`; the DOM double's additional closed-root cases are not promoted to independent browser evidence. The browser probe hardcodes `summary: {total:1, passed:1}` to transport its observations: this is **not** an assertion that EO-1 behavior is correct. The report correctly treats the observed actor as a defect. Keep that distinction if using its JSON elsewhere.

Owner results (87 tests, 54 browser checks, broader mutants and differential runs) remain QA-attributed, not independently repeated here. The oracle/large-run implementations mostly remain under QA's historical `/tmp`; `review-findings.json` summarizes them. Do not call those reports a fresh independently reproducible certification.

## Public evidence hygiene and minor portability limits

- Checked all added text for credential markers, profile paths, URLs and contact data. No real credentials, live local tokens, Windows profile path, user document content or personal account data found. Committed browser evidence contains a user-agent and localhost origins. `/tmp/qa-0c0` and the generic lead-tool path are reproducibility paths, not credentials.
- `alice@example.edu` and `hunter2secretX` occur only as explicit synthetic fixture/probe values in observer evidence; the `token` occurrence is parameter-forwarding source code, not a committed token value. No raw browser runner log was added.
- Collected tests are directly runnable. The extra files are labeled **scratch probes**, not pytest tests: several need staging next to the existing fixture/DOM double, and `organize-mutants.py` hardcodes its historical `/tmp` source and deletes named output folders in its working directory. Preserve their scratch-only label; run that helper only in a fresh temporary directory. If QA later wants a supported replay command, use a temporary output directory and document staging then. This is not a reason to delay the current preview milestone.

Next integration action: lead may cherry-pick `2f83761` and record EO-1 as partially fixed, the revision bug as open, and the three medium items as coverage gaps. Web continues the real preview transport; QA's next user-outcome check must exercise that connected workflow separately. Retain iPad/Pencil/original-live-screen and Notability acceptance as unverified; neither this report nor its test counts provide that evidence.

No main/worker files edited, no native Chats used, no new dependency/service/provider enabled. Existing uncommitted lead work was preserved.
