# Probes from the QA W-1 / P0-12 review at main 71f1389

Scratch probes written by the QA review agents (Opus 5.5) for
`docs/verification/qa/p0-12-w1-retest.md`. Each subdirectory ran from a scratch
root holding copies of `apps/`, `packages/` and `package.json` from a `git archive`
of `71f1389eeb503f652138e23a329f231ad15aacc7`, e.g.:

```sh
R=/tmp/qa-probe && mkdir -p $R && git archive 71f1389 apps packages package.json | tar -x -C $R
cp -r tests/e2e/web/p0_12_w1_review/p012-disclosure/. $R/
export PATH=<lead repo>/.tools/node-v24.21.0-linux-x64/bin:$PATH
cd $R && node probes/adversarial.mjs
```

They are node-only (DOM/event doubles, no browser, network or provider) and are
not collected by pytest. A failing line documents a finding; it is not a product
test result. Mutation scripts write mutated copies next to themselves.

Path note: the mutation scripts (`*/mutate.*`, `p012-organize/probes/survivor-effects.ts`)
hard-code the original scratch layout: the exact copy in `/tmp/qa-71f/repo` and the
scratch roots in `/tmp/qa-71f/work/<dir>`. Recreate those paths, or edit the
constants, before re-running them. The behavioral probes (`probes.mjs`,
`adversarial.mjs`, `behavior.ts`, `probe-multi.mjs`) only need the scratch-root
layout shown above.
