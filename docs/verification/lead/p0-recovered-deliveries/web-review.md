# Bounded lead integration review — Web P0-12 delivery

Review date: 2026-09-28 (workspace date). Reviewer: lead's bounded read-only review agent.

**Recommendation: integrate the ordered Web repair commits `7ee1217` → `8d67aaa` → `db7400f`, subject to the lead's integrated-main checks. No new blocking defect was found in this bounded review.** This recommendation covers the test-only disclosure/organize models, owned fixture observer, regression coverage and evidence. It does not authorize runtime adoption of the placeholder policy protocol or mark product/device acceptance passed.

## Exact scope and workspace preservation

- Reviewed exact net range `ec18580..db7400f`; `ec18580`'s timeline repair is already represented on main by `a09c43e`. Main was observed at `fc079e9` on entry.
- Inspected changed executable source, model/test code, Web delivery documents and relevant saved result JSON. The production `src/page.ts` change is comment-only; behavioral changes live in test models and owned fixtures. No production source imports the P0-12 model/observer.
- Read AGENTS/TEAM, lead/Web role guidance, existing P0-02/P0-08/P0-12 cards, PONYTAIL LITE, current decisions, relevant complete source/English clauses for R51–R59/A30–A46/G7 and original-screen/export behavior, audio addendum (particularly AUDIO-08/14), and original-goal cases including V-CacheProvenanceLatency, V-ProactiveTeaching, V-SourceTimeRelations and V-MultiDeviceUnderstanding.
- Checked all eight current source/translation content hashes against `docs/requirements/english-translation-manifest.json`: all match.
- Extracted candidate files with `git archive db7400f` into `/tmp/p0-web-delivery-wi9mdjps`. All review-created files are under `/tmp`. No main/worker source edits, Git mutations, peer messages, dependency installs, browser starts, account/provider access or service activation were performed.

## Reproduced evidence

Environment: existing pinned Node `v24.21.0` and existing TypeScript `7.0.2`; no installation. Initial bare `node` invocation failed because Node is not on the default PATH; subsequent commands used the repository's pinned absolute executable.

1. Candidate Web typecheck passed (exit 0):

   `/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc --noEmit -p apps/safari-extension/tsconfig.json`

   Working directory: `/tmp/p0-web-delivery-wi9mdjps`.

2. Changed test suites passed **22 named tests, 0 failures**:

   `node --test --test-isolation=none apps/safari-extension/tests/p0-12-disclosure.test.ts apps/safari-extension/tests/p0-12-organize.test.ts apps/safari-extension/tests/p0-12-observer-safety.test.ts`

   Includes 53 named disclosure traces and 3,000 seeded sequences, 17 organize cases and 2 observer lint cases. This is deliberately narrower than the worker's 87-test full module run and 39-test P0-12 run; the 17 unchanged media-timeline tests were not repeated.

3. Ran the original QA `e26523e` adversarial disclosure probe against the exact candidate. Every S/H output holds: S1/S1b/S1c connected close/lower-request races are blocked; S2 accepted-but-currently-closed is closed; S3/H4/H5 retain requested liveness; H6 cache derivative is rejected. QA source retained at `/tmp/p0-web-delivery-wi9mdjps/qa-adversarial.mjs`.

4. Independently reproduced before/after contrasts against `ec18580`:

   - Three connected-refusal/lowered-request cases permit the old full solution on the old model and block it on `db7400f`.
   - Five ORG-3 sequences (delivery/import evidence without local dispatch; dispatch evidence after cancellation/failure) report `exposure=none` on the old model and `possible` on the candidate. `learnerRead` remains `unknown`.
   - Local panel-only, timeout-without-dispatch, and pre-dispatch cancellation remain no exposure. Import evidence without a dispatch chain remains unverified, not imported.

   Reproducer and output: `/tmp/p0-web-delivery-wi9mdjps/focused-before-after.mjs`, `/tmp/p0-web-delivery-wi9mdjps/focused-before-after.txt`.

5. Sampled the random history oracle alone with two consequential model mutations (no named trace test):

   - Connected closes no longer pending: detected at seed 2 (`r34@step_check/s1 exceeds the close cap after remote_policy`).
   - Newer snapshot replaces/widens the pending local request: detected at seed 1 (`r5@local_next_step/null exceeds the own cap after remote_policy`).

   Both fail by the intended invariant assertion, with the unchanged suite passing as control. Results and exact temporary mutated copies: `/tmp/p0-web-delivery-wi9mdjps/sampled-oracle-mutants/results.json`. The worker's complete mutation batch was not repeated.

6. `git diff --check ec18580..db7400f` passed.

## Consequential behavior reviewed

**D1 and acknowledgement/order handling.** Candidate `tests/p0-12/disclosure-model.ts:317` requires a strictly newer snapshot for acknowledgements; connected and disconnected local intents both remain pending. `restrictTo`/`capServer` preserve level and step scope while pending, and accepted requests are separated from the snapshot's current request. Per-attempt saved acknowledgement history, request retirement and stale reconnect handling prevent old known requests from silently returning. The original QA races and focused contrasts support this repair.

**History oracle.** `tests/p0-12-disclosure.test.ts:241` reconstructs its state from raw intent/snapshot history rather than reading the model's context. The generator remains intentionally adaptive to model state, so this is independent state derivation, not a proof of all possible inputs. I16 at line 484 checks the historical restrictive cap and scope; I15 at line 502 checks exact current request identity without a cap; I17 checks immediate local-request liveness. The two oracle-only mutation checks above show it detects the core former D1 class independently of named traces. Finite generated coverage and labels cannot certify semantic leakage.

**ORG-3.** `tests/p0-12/organize-model.ts:297` preserves increasing evidence of possible external effect despite missing/reordered local events, and `externalExposure` at line 364 uses that evidence instead of requiring an observed local dispatch. Import without a chain gets `effect_unverified`; it is not promoted to actual import. Prior attempts are preserved. ORG-1 refusal identities/reopening at line 194, ORG-9 user correction retention, and per-layer dispatch checks also have focused passing regressions.

**EO-1 / EO-2 / EO-9.** `fixture/src/entry-observer.ts:167` branches on closed-root host evidence and checks untrusted events before considering a trusted host mark. Synthetic events cannot consume that mark as learner action. Scripted `click()` is classified site/unknown rather than learner. The old canvas `getContext()` probe has been removed. The stronger source guard tests the twelve original QA insertion spellings plus later variants and calls itself a lint guard, not a semantic proof.

I did **not** launch a browser, so EO-1 trusted-input behavior is source-reviewed plus worker-recorded evidence, not independently re-observed here. Saved `p0-12-qafix3-edge-entries.json` has 21/21 with no runner/step errors, explicit closed-root script/user/synthetic contrasts, and no observer-origin write calls while the fixture's positive-control writes are present. The metadata explicitly says desktop headless CDP on an owned fixture, not iPad/Pencil/course testing.

## Limits that must stay open after integration

- Exact intent-ID acknowledgement remains an unreleased P0-08 presentation-policy dependency. A boolean close flag cannot distinguish consecutive closes or safely act as a sticky bit; this remains explicitly acknowledged in the plan's rule 9 and section 6. It must not be used as a production revocation guarantee.
- Remote intents still lack causal-basis evidence; an unordered other-device request ordered after an acknowledged refusal is not solved by this test model. Partial/unknown presentation outcomes and single-presenter claims are also not implemented.
- Export events still lack real attempt/manifest identity and actual reconciliation/idempotent retry protection; content immutability and purpose/permission validation need the shared contracts and real adapters. No Notability import or actual learner reading was verified.
- EO-7's 200 ms choice-poll attribution window remains open. The document also preserves trusted `execCommand`/autofill ambiguity, closed-root host/timer heuristics, and the lack of real-editor/site history. EO-1's bounded repair must not be described as solving all actor attribution.
- Existing 74 disclosure / 34 organize / 12 lint mutation result JSON reports 71/74 (three model-equivalent survivors), 34/34 and 12/12 with passing controls. I inspected these claims and sampled two decisive mutants; I did not independently rerun the whole batch.
- W1c/e/f selftest additions and recorded 54/54 results were source/evidence reviewed, not browser-rerun here.
- No runtime/provider connection, cross-device sync, native speech, iPad/Pencil/package, real course, AI composite receipt, or external import acceptance is claimed. A44/A46 and all AVTEST cases remain unaccepted.

The lead should integrate the exact three commits, retain the above dependency/limit wording in task status, and run its normal integrated-main checks. This bounded review found no reason to return these repairs to Web before integration.
