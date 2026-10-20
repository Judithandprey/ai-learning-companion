# Corrected subprocess cleanup integration — 2026-10-20

Backend base `4c5e071e42b6bf49818c36b07278c228bb3667b8` and correction
`63ddf8e3e2a6763c0fae03e554b77e8685a9b3a5` integrate as `c150d8c` and
`7e6ef83`. Support's independent re-review
`a90f51bb2161256b42885ce5dc30613740f5a2e3` integrates as `992140e`.
Its actual READY delivery is `handoff_304ad6c0270ad076590e26813fa51e66`.

The first patch's [S1 HOLD](../../../../support/pipe-cleanup-4c5e071-review-20261020/README.md)
remains historical evidence. The corrected close path stops and joins the parser,
discards remaining stdout within the existing deadlines, and waits for the owned
child. It no longer awaits/cancels stdin's shared close future. After observed
child exit it aborts any remaining stdin write buffer through the public transport
API, preserving caller cancellation and a recoverable subsequent close.

Lead reviewed the resulting path and exact correction. At integrated source
`992140e37de51d4f4be5310ff70037a8422f71fd`, **109 checks passed in 4.06 s**:
output diagnostics, receipts, failure outcomes and close deadlines. Unraisable
warnings were errors. These local Python 3.14.4 checks used synthetic children;
no installed Codex, Windows process, account, model, display, audio or TTS ran.
[Command, source hashes and result](checks.json), [raw output](python.txt).
`git diff --check 4f82fbd..992140e` passes.

Separately attributed evidence: Lead's corrected-source export passed 14 selected
checks in 0.47 s. [Support's re-review](../../../../support/pipe-cleanup-63ddf8e-retest-20261020/README.md)
reran the unchanged original scenario once: 4,128,768 buffered bytes, a 50 ms
deadline, successful kill/reap in 52.38 ms, successful repeated close, no callback
errors. Its seven selected regressions passed in 0.38 s. These counts are not
added to the integrated check count.

The original hosted Python 3.12 warning's allocating test remains unknown; latest
hosted checks must be observed on the pushed SHA. No hosted warning elimination
or target-OS behavior is inferred from local tests. The previous exact main
`4f82fbd` [CI run](https://github.com/Judithandprey/ai-learning-companion/actions/runs/39428234973)
completed successfully on both configured Python versions without cancellation.

Candidate08 still failed after one actual observation; its missing diagnostic
facts cannot be reconstructed. Native 1/1 and real actions 1/4 remain consumed,
DISPLAY/ACCOUNT released, allocation retired. No additional real attempt is
authorized by this correction. Full live screen/focus/voice and actual Mac gates
remain open.

Next: Lead publishes the baseline; original QA prepares the existing candidate
offline using the corrected connector and already integrated strict receipt
reader. Preserve the fixed product/runtime/native payloads unless actual drift
requires a reported correction. Use a new connector-copy destination, but do not
copy/launch the runtime or activate an allocation. Lead reviews the actual
candidate delta before any future separately authorized execution.
QA's manual-mode restoration remains with the operator after the recorded runtime
checks; this integration changes no role setting or approval rule.
