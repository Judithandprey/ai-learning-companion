# Probes from the QA Web P0-12 retest at main 0c04b2e

These are the scratch probes behind `docs/verification/qa/p0-12-web-retest.md`. They
are not collected by pytest. The collected regressions are in
`tests/e2e/web/test_p0_12_retest_qa.py`. The review agents' other probes stayed in
`/tmp` and are summarized in `docs/verification/qa/p0-12-web-retest/review-findings.json`.

- `behavior-v2.ts`: the original ORG-1 P1–P3 and ORG-3 P4–P5 cases, rewritten for the
  new organize-model API. Run it from a scratch root that holds copies of `apps/`,
  `packages/` and `package.json`, as `node probes/behavior-v2.ts`.
- `revision-return.mjs`: WEB-DISCLOSURE-01. Pass the model path as its argument; the
  default is the reviewer's `/tmp` scratch copy.
- `organize-mutants.py`: two organize coverage-gap mutants plus a control. `SRC`/`NODE`
  point at the `/tmp/qa-0c0` exact copy used here.
- `qa-eo1-page.ts` + `qa-eo1-index.html`: the real-browser EO-1 probe.
  - It was built into a scratch module copy and run with the unchanged
    `scripts/browser-check.mjs`, under desktop Edge 154 headless on the owned fixture
    server.
  - The page file replaced `fixture/index.html` in that scratch copy only.
  - Result: `docs/verification/qa/p0-12-web-retest/eo1-edge-probe.json`.
- `v-eo1.mjs`: the verifier's DOM-double probe for the same class, including the
  closed-root cases that need a trusted gesture. It imports the original QA
  `entries-observer/dom-double.mjs`.
