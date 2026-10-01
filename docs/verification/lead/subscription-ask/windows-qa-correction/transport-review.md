# Windows QA subscription corrections — transport review

**APPROVE the changed QA-SUB-05/06/07 behavior for the bounded first-image slice.** Candidate `0fae1350464de1dcd408f076316192d3840d35cb`, parent `84fc56a`; integration baseline `868a91d`, Backend `39620fa`. No new blocker found in the assigned connection/login/read-budget changes. Two disclosed unchanged defects remain open below; this is not approval of indefinite unattended operation or complete-product acceptance.

Read the actual two-file production diff, transport tests/fakes, the report section “Correction after QA at 3e4b406,” current ADR 0003 and actual integrated Backend login/cancellation/lifecycle paths. Root separately reviews source/ink/presentation and runs integration tests; another reviewer owns frame/record behavior. No repo edits or real account/provider/GUI/connector operations.

## Changed behavior

- Account/login errors use fixed operation-specific text. Closed-code sanitization still precedes these lookups; raw Backend errors are not displayed.
- An account read no longer forgets a pending login. ASK is blocked while starting/waiting, with no request sent. Cancel retains the login ID until an exact acknowledgement, a documented no-such-login result, matching completion, or connection loss. Unknown/malformed/lost acknowledgement does not claim cancellation. A matching successful completion during or after an unconfirmed cancel is still accepted; it refreshes account state without replaying ASK.
- Browser-open failure remains attached to the pending login across account reads. A refused address whose cancel cannot be confirmed fences the owned transport, preserving explicit recovery.
- Automatic account-change reads have both a short-window bound and a total bound between explicit Checks. Once latched off, elapsed time or more events cannot resume reads. Current state becomes unknown, preventing ASK on stale account status. A user Check or completion of the user's pending login resets the budget. Coalesced reads stay bound to their existing live child.
- Existing Stop tombstones, method-specific interruption confirmation, child-loss uncertainty and no-autonomous-replay behavior are preserved. The integrated Backend's terminal EOF recovery remains compatible.

## Independent checks

Exact archive `/tmp/web-qa-subscription-0fae135-f7laoj0o`.

`/tmp/web-qa-subscription-transport-probe.ts` exercises the combined changed path: a latched refresh budget, pending login, cancel timeout, attempted ASK, then successful login completion and a late cancel acknowledgement. **Passed:** pending remained pending, zero ASK submissions, one child, completion refreshed once and stale acknowledgement did not undo success. The previous same-chunk account-response/oversized-line fence probe also passed: one child and unavailable, with no replacement process.

The third Node case reproduces the disclosed unsolicited-cancel classification. A separate `/tmp/web-qa-subscription-history-probe.py` runs the actual Backend bridge code (SHA matched exactly to `39620fa`) with in-process fixtures at the history-limit state. No request loop, Codex process or provider is used. Results are `/tmp/web-qa-subscription-transport-probe.json` and `/tmp/web-qa-subscription-history-probe.json`.

Scoped `git diff --check` passes. Author suites were inspected, not recounted as this review's execution; Root owns the integrated test run.

## Disclosed unchanged notes

**W-KNOWN-CANCEL — P2, real truthfulness defect; non-blocking for the modest-request first-image slice.** `subscription.ts:528` returns `uncertain:false` for an unsolicited ASK `cancelled` error. Integrated Backend `chatgpt_local.py:169–173` can set an active request's cancellation flag at its 4096-envelope history limit; the bridge then emits `cancelled` independently of an interruption-confirmation envelope. The independent two-layer reproduction observed zero frontend Cancel requests, a Backend cancelled envelope without any confirmed interruption, and frontend `uncertain:false`. The Backend fake was even allowed to finish its remote work before local suppression. This boundary cannot be reached by the authorized modest number of first-image requests, but must not be described as generally correct. Minimal existing-owner fix: use `uncertain:true` for this unsolicited branch; retain the separate explicit-cancel/Stop branch that requires confirmations. Owner: Windows/Web, before long-lived release (or as a small follow-up now).

**W-KNOWN-END-BUDGET — P2 lifecycle compatibility gap; non-blocking for this bounded slice with controlled cleanup.** `subscription.ts:233` gives `endChild` a default five-second grace. Backend `chatgpt_local.py` allows eight seconds of owned cleanup; its inner process close can require two three-second terminate/kill waits. Therefore a legitimately slow shutdown can outlast the Windows grace and cause a premature WSL-shim kill. `endChild` correctly returns `ended:false` and a WSL-specific uncertainty note, but Subscription discards that result. This is source-proven timing/observability risk, not evidence that an orphan occurred on Windows. It does not resubmit an ASK; transport/presentation are already fenced. Coordinate the client grace with the Backend bound plus pipe-flush margin and retain unconfirmed termination status. Owner: Lead coordinates Windows/Web and Backend. Actual WSL cleanup remains a QA device control; do not claim reaping merely from a killed shim.

No credentials, product auth state, quota or private capture were accessed. These checks do not establish real image understanding, login eligibility, Mac interaction or any full-product gate. Next action: Lead completes integrated checks and the existing bounded QA acceptance; keep the two concrete follow-ups recorded rather than silently closing them.
