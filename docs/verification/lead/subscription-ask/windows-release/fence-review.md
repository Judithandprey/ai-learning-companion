# Final Windows subscription transport fence review

**APPROVE** `84fc56a99a6e5c9dd98c39fb945cb93b573687ba` (parent `c977df5`). No remaining blocker in the assigned transport correction; **W-SUB-T01-FENCE closed**.

The exact changed source now binds the account read chain to its original child. Coalesced reads require that child to remain live and use the no-spawn request path. A reply from a fenced/lost child is not published as current account state. Quit immediately fences further output and then awaits existing bounded cleanup.

The three related guards preserve this behavior after a login-start reply, an unauthenticated ASK reply, and a late browser-open failure. Official login is still explicit; configuration, authentication ownership, provider/model request construction and credential handling are unchanged. No new auth or real-call path was introduced.

Verification in exact archive `/tmp/windows-subscription-84fc56a-ngphfeda`:

- Prior independent same-chunk probe, with only candidate/path and corrected expectations changed: **pass**. Account-changed + valid reply + oversized trailing line results in **one child, one read, unavailable, no account/model publication**, and the original child exits. `/tmp/windows-subscription-fence-final-probe.ts` and `.json`.
- Four focused owned tests: **4 passed, 0 failed**. They cover normal bounded coalescing; first/subsequent read fence, child exit, quit, explicit recovery, positive live-child control; fenced login reply and late browser failure; fenced unauthenticated ASK reply and its positive control.
- Scoped `git diff --check`: pass.

No repository edits, account/provider/display calls, CLI launches, broad suite rerun or real-AI acceptance claim. T02/T03 were already closed by the prior focused review and are preserved here. Root owns the assigned 55-test/build/integration checks and separate actual image-bearing acceptance.
