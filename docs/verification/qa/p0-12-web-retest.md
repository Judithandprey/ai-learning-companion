# QA retest: Web P0-12 repairs (D1, ORG-3/ORG-1, EO-1/EO-2, W-2) at main 0c04b2e

- **Candidate:** exact main `0c04b2e888fbb7240e9634a6ade2bd309601e3a1`. It integrates
  Web `7ee1217 / 8d67aaa / db7400f` as `1da1bc9 / 93674f1 / fa5c03a`.
- **Merge:** normal merge into `team/qa` as `7ddc12f`. App code equals main.
- **Reports read:**
  - `docs/verification/lead/p0-recovered-deliveries.md` and `.../web-review.md`;
  - the owner's `docs/verification/web/p0-12-disclosure-and-process-plan.md`;
  - the original QA report `p0-12-w1-retest.md` (at `71f1389`).
- **Environment:**
  - WSL2, Node 24.21.0 and TypeScript 7.0.2 (the lead's pinned tools, copied
    read-only);
  - a `git archive` copy in `/tmp/qa-0c0/repo`;
  - desktop **Edge 154 headless** on the owned fixture (port 4173, which had no
    listener before use), with a temporary profile.
- **Scope:**
  - Web test-only models and the owned fixture only.
  - Not Safari, iPad, Pencil, a packaged extension, the native bridge, a real
    course, a provider or a real share/import.
  - Browser runner logs are **not** committed because they contain a local Windows
    profile path; their results are in the committed JSON.

## Reproduced checks

| Check | Result |
| --- | --- |
| `BROWSER= bash apps/safari-extension/scripts/check.sh` | exit 0: typecheck, **87/87** tests, build ([log](p0-12-web-retest/web-check-sh.log)) |
| `node --test --test-isolation=none apps/safari-extension/tests/*.test.ts` | **87 named, 87 pass** ([log](p0-12-web-retest/web-named-tests.log)) |
| Browser self-test (harness CONTROL; unmutated module copy) | **54/54** |
| Mutation sites still unique (`test_p0_02_r2_mutation_sites.py` against the exact copy) | 16/16 |

## Original QA probes, re-run on the exact candidate

| Original finding | Probe | Result at 0c04b2e |
| --- | --- | --- |
| **P012-D1** (medium): the old full solution returned after a connected "let me try" plus a reconnect | the original `adversarial.mjs` | **All 17 cases HELD.** S1, S1b and S1c (connected let-me-try, in-flight retraction, lowered request, then a reconnect with the same pre-close snapshot) all give `present=false`. The liveness cases S3, H4 and H5 give `present=true`. Voice and notification previews are still refused while offline. ([output](p0-12-web-retest/orig-d1-adversarial.out)) |
| **ORG-1** (medium): the refusal was a single slot keyed only by problemId | the original P1/P2/P3 cases, adapted to the new API ([probe](../../../tests/e2e/web/p0_12_retest_0c04b2e/behavior-v2.ts)) | **Fixed in the model.** A Q1 refusal survives a visit to Q2. A delayed Q1 refusal no longer suppresses Q2. A refusal of a never-shown prompt is ignored. A reopen that did not see every refusal is refused, and a replayed superseded refusal is ignored. ([output](p0-12-web-retest/orig-org-behavior-v2.out)) |
| **ORG-3** (medium): possible external exposure reported as none | the original P4 sequences | **Fixed in the model.** Delivery, import or unknown-outcome evidence with no local `dispatch_started`, after a pre-dispatch cancel or failure, or with no local event at all gives `exposure=possible`, with `learnerRead=unknown`. Import without a chained dispatch stays `effect_unverified`, not `imported`. Panel-only, timeout-without-dispatch and cancel still give none. |
| **EO-1** (medium): a site script's `click()` in a closed shadow root was credited to the user | the original `probes.mjs` (DOM double) | **Fixed in the fixture.** F1 is now `opaque_change:#closed-host:site_script:scripted_activation`. Typing into a closed-root `div` host is `unknown:trusted_event`. ([output](p0-12-web-retest/orig-eo-probes.out)) |
| EO-9 (low): the observer's `getContext` probe could lock the site's canvas type | the same probe, F7 | **Fixed:** the observer makes no `getContext` call; the first call is the site's own `webgl`. |
| EO-3/4/5/7/8/10/11 (low) | the same probe | Unchanged: `<select>` and ARIA choices are dropped, site feedback inserted as new nodes is not recorded, reselect is keyed by radio name, the poll-window attribution remains (EO-7, documented), and non-answer fields are recorded. EO-11: a cleared answer on a problem switch is now `change_without_event … unknown`. |

## W-2: browser mutation of the W-1 pending-card guards

The unchanged harness `tests/e2e/web/run_p0_02_r2_mutations.py`, run with
`QA_TARGET_ROOT=/tmp/qa-0c0/repo`. Evidence:
[qa-mutations.json](p0-12-web-retest/qa-mutations.json) and
[browser-selftest-summary.json](p0-12-web-retest/browser-selftest-summary.json).

| Mutation | 71f1389 (51 checks) | 0c04b2e (54 checks) |
| --- | --- | --- |
| CONTROL | 51/51 | **54/54** |
| W1c: no `clearPending(gen)` when the outcome has nothing to show | 51/51 (survived) | **53/54**, caught by `dismiss.cancel_during_hash_clears_pending` |
| W1e: the pending text claims an explanation | 51/51 (survived) | **53/54**, caught by `dismiss.pending_text_is_honest` |
| W1f: `clearPending` ignores which submission it belongs to | 51/51 (survived) | **53/54**, caught by `dismiss.older_late_result_keeps_newer_pending` |

Unit tests pass under every mutation (87/87); detection comes from the desktop
self-test only. **W-2 is closed** at the desktop owned-fixture level.

## Bounded adversarial review

Three reviewers (disclosure, organize, observer) each wrote node-only probes on
byte-identical copies, and each area then had an adversarial verifier. All six
returned: [review-findings.json](p0-12-web-retest/review-findings.json).

- I re-ran the consequential new items personally:
  - WEB-DISCLOSURE-01;
  - two organize coverage mutants;
  - the EO-1 residual, **in desktop Edge**.
- The probes are in `tests/e2e/web/p0_12_retest_0c04b2e/`.
- All reviewers are one model family: this is a QA perspective, not a cross-model or
  human certificate.

### Dispositions of the original findings

| Original | Disposition | Evidence |
| --- | --- | --- |
| P012-D1 | **fixed** | Checked by me, the reviewer and the verifier:<br>• 240 extended cases: 3 intents × connected/offline × 7 reconnect kinds, each followed by a stale v6, a v7 re-acknowledgement and a v8 new request. All held.<br>• An **independent plan-derived oracle**, run as a randomized differential over 1.8M steps: 0 violations. The same oracle flags the `71f1389` model (close-cap 7,800 and own-cap 6,395 violations).<br>• The D1-class mutants (equal-version ack, reconnect clearing pending, rule 7 off, connected close not pending) are killed by the unchanged tests. |
| P012-D3 | **fixed** | 6/6 level/scope escalation mutants killed, including analogues of the original MA/MB survivors; 18/18 in the broader sample. I15 now compares id@level/scope, and I16 checks the historical cap. |
| P012-D5 | **fixed** | The echo resolves the close, and an acknowledgement received while away is honored. There were 0 liveness violations in the differential. A lost acknowledging snapshot keeps the close pending, which is restrictive and falls under the documented boolean limit. |
| ORG-1 | **fixed in the model** | See the table above. Verifier: reopen isolation across questions is not pinned by the tests (low). |
| ORG-3 | **fixed in the model** | Exhaustive checks up to length 8 found no violations. The tests pin the repair only for sampled event/state pairs (see the medium gaps below). |
| ORG-2, ORG-9, ORG-10 (per layer kind), ORG-11 (aggregate flag), ORG-12, ORG-13 | fixed | The original survivors are killed. |
| ORG-4, ORG-5, ORG-6, ORG-8 | not fixed, **documented limits** | Attempt/manifest identity, reconciliation and dispatch-time rechecks wait for the P0-08 contracts. |
| ORG-7 | not fixed | An owner-kept design (layout-only consent covers an `addition` layer) that awaits a lead decision. |
| EO-1 | **partially fixed** | The original `click()` trigger is fixed. A common spelling still credits a site action to the learner (see below). |
| EO-2 | fixed as a **lint** guard | All 12 original spellings and the later variants are caught. New survivors are low (see below). |
| EO-9 | fixed | The observer makes no `getContext` call. |
| W-2 (W1c/e/f) | **closed** | Browser mutation, see above. |
| EO-3/4/5/6/7/8/10/11/12 | not fixed (low; EO-7 and EO-6 documented) | These are fixture limits that per-site adapters must not inherit. |

### New or residual findings (owner web unless noted)

| ID | Severity | Finding | Reproduction → actual |
| --- | --- | --- | --- |
| **EO-1 residual** (verifier; confirmed in Edge) | **medium** | A page script's `el.dispatchEvent(new MouseEvent('click', {bubbles:true}))` on a checkbox inside an **open** shadow root is recorded as the **learner's** action with no gesture at all. This is MDN's "simulate a click" pattern. The non-composed click never reaches the observer's window listener, while the activation's trusted, composed `input` does. This contradicts plan §4 ("site dispatches a synthetic event: actor site") and the lead review ("synthetic events cannot consume that mark"). In a DOM double, the closed-root variants after a host click or key are also credited to the user, and the site's uncheck is credited to the learner while the learner's own check becomes unknown. The fixture's own components never use this spelling. | Edge 154 headless, the real built observer ([probe](../../../tests/e2e/web/p0_12_retest_0c04b2e/qa-eo1-page.ts), [result](p0-12-web-retest/eo1-edge-probe.json)):<br>• `N1_open_dispatch_noncomposed` → `check:#open-host>#open-box:user:trusted_event`. The window saw only `input:trusted=true:composed=true`.<br>• Controls: composed dispatch → `site_script:scripted_activation`; light DOM → `site_script`; closed root with no mark → `unknown`; `click()` → `site_script`. |
| **WEB-DISCLOSURE-01** (pre-existing since `71f1389`) | **medium** | The attempt revision is not kept per attempt: `switchAttempt` rebuilds the context with `attemptRevision: 0`, and `AttemptMemory` does not store the revision. After *correct → another problem → back*:<br>• a hint cached before the correction is a cache hit again and is presented (`current`);<br>• another device's pre-correction card is presented;<br>• content made at the true current revision is blocked as `stale_revision`.<br>This contradicts A34 and plan rules 1 and 10. The help shown is obsolete, not above the requested level. Strict xfail. | [revision-return.out](p0-12-web-retest/revision-return.out): `after leave/return: ctx.attemptRevision = 0 …`, then `cacheHit = hint-rev0 decide={"present":true,"reason":"current"}`. The `71f1389` model gives the same output. The differential found 3,192 revision violations in 3,000 seeds. |
| WEB-ORGANIZE-01 | **medium (coverage)** | The unverified-import guard is not pinned. Two mutants turn `[prepared, panel_opened, target_import_confirmed, no_response, target_import_confirmed]` into `imported` / `everImported=true` (a false success, ORG-11 class): a timeout after `effect_unverified` becomes unknown dispatch, and an unverified effect counts as dispatched. Both pass all 17 tests. The model itself is correct. | reviewer and verifier |
| ORG-3 coverage (verifier) | **medium (coverage)** | 7 natural single-point regressions bring back "exposure none despite effect evidence" and pass all 17 tests. One example: "failure is final" (dispatch evidence after a pre-dispatch failure). Strict xfail on that one. | QA re-run ([org-mutants.out](p0-12-web-retest/org-mutants.out)): 17/17 pass, and `[P,O,F,S]` exposure goes **possible → none** |
| Per-layer disclosure coverage (verifier) | **medium (coverage)** | Checking `permittedNow` only on the first AI layer exports a not-permitted correction, and all 17 tests pass: every `permittedNow` assertion uses a one-layer manifest. This guard decides whether help reaches an external document (ADR §8). Strict xfail. | QA re-run: two-layer manifest `{"allowed":false,…C1}` → mutant `{"allowed":true}` |
| Boolean-ack condition (verifier) | low | The documented soundness condition is incomplete. One snapshot that applies `[close1, request]` resolves a later in-flight `close2`, and a racing other-device full solution is then shown. This is within the documented boolean `acknowledgedClose` limit, but the stated condition does not cover it. | verifier probe |
| Offline voice (verifier) | low | This device's own offline request below local-next-step is answered **by voice**. The plan (lines 79 and 167) says "on screen only". This is a plan-versus-model inconsistency: the user's explicit request, but a channel rule. | verifier probe |
| Re-entry liveness (verifier) | low (restrictive) | After leaving and returning, the server's current snapshot at the recorded version never applies, so an explicit other-device request, including one made while away, waits for a newer version. | verifier probe |
| WEB-OBSERVER-01 | low | The EO-1 guard has no Node-level test; reverting either part passes 87/87. Only the optional browser `entries-check` asserts it (same pattern as EO-12). | reviewer and verifier |
| WEB-OBSERVER-02 | low | Lint survivors within the listed categories: `doc.cookie` (the observer's own alias), `location.replace`, `Reflect.get(...,'requestSubmit')`, `classList`/`style.setProperty`, RTCPeerConnection. The comment filter also drops any line that starts with `*`, so a continuation line hides `.value=` or `.click()`. It is a documented lint, not a semantic proof. | reviewer and verifier |
| WEB-ORGANIZE-02/03/04, WEB-OBSERVER-04 | low | Other low items:<br>• ORGANIZE-02: an unsure AI pass after an explicit user purpose is untested.<br>• ORGANIZE-03: an AI suggestion already corrected away is asked about again.<br>• ORGANIZE-04: `panel_opened` plus a bare timeout reports exposure none, although local dispatch events can go missing.<br>• OBSERVER-04: eventless changes inside closed roots, and any change in a div-hosted closed root, leave no gap marker. | — |
| WEB-DISCLOSURE-02/03/05, WEB-ORGANIZE-05/06/07, WEB-OBSERVER-03/05/06 | info | Informational items:<br>• DISCLOSURE-02: `cacheHit` can return a gate-rejected notification entry.<br>• DISCLOSURE-03: request-identity assumptions are unstated for P0-08.<br>• DISCLOSURE-05: rule 9 wording differs from the model.<br>• ORGANIZE-05: late evidence is credited to the wrong attempt (no attempt identity; documented).<br>• ORGANIZE-06: refusal scoping per question version is unmodeled.<br>• ORGANIZE-07: ORG-1 arrival-order edges.<br>• OBSERVER-03, OBSERVER-06: documented alias and `execCommand` limits.<br>• OBSERVER-05: the plan's §4 row still claims site grading is recorded, but EO-4 still reproduces. | — |

## QA regressions

`tests/e2e/web/test_p0_12_retest_qa.py` (node-only; skipped without the pinned
Node): **2 passed, 3 strict xfail**.

- **Passing:**
  - the D1 connected-restriction cases, plus liveness;
  - ORG-1 per-question refusals and reopen causality;
  - ORG-3 `possible` exposure, plus the no-effect control.
- **Strict xfail:**
  - WEB-DISCLOSURE-01;
  - the organize tests catching the per-layer `permittedNow` mutant;
  - the organize tests catching the "failure is final" mutant.

## Decision

- **Repairs verified at the desktop and test-model level:**
  - D1, D3 and D5 are fixed, with an independent-oracle differential;
  - ORG-1 and ORG-3 are fixed in the model;
  - EO-9 is fixed, and EO-2 is fixed as a lint;
  - W-2 is closed: the W1c/e/f browser mutations are now caught (CONTROL 54/54).
- **Not fully closed:**
  - **EO-1 is only partially fixed.** A synthetic non-composed click in an open
    shadow root is still credited to the learner; this was observed in real Edge.
  - **WEB-DISCLOSURE-01**, a pre-existing medium defect: a correction is forgotten
    after leaving and returning, so obsolete help is re-presented.
  - Three medium coverage gaps: the organize tests do not pin the unverified-import,
    ORG-3 exposure and per-layer disclosure guards.
  - These are test-only models and an owned fixture, so no production path is
    affected. They should be fixed before P0-08 or the clients adopt these models,
    or cite their traces as disclosure evidence.
- **Documented limits stay open:**
  - a boolean `acknowledgedClose` is not an exact intent-ID acknowledgement, and its
    stated soundness condition is incomplete;
  - remote requests have no causal basis;
  - real export attempt/manifest identity and reconciliation are missing;
  - EO-7 poll-window attribution is unresolved;
  - `process_control` 0.2.1 covers capture lifecycle only and grants no
    presentation or export permission.
- **Unverified:** Safari, iPad and Pencil; the packaged extension and native bridge;
  real course sites; providers; real Notability import; R59/A44/A46; AVTEST.
- No model or paid API was called.
