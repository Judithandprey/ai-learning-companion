# Windows subscription correction — transport review

**Decision: REQUEST CHANGES (one interaction regression).** Candidate `c977df5`, parent `4944cc3`. Read only the changes to `apps/windows/src/main/subscription.ts`, transport tests/fakes, and their existing call flow. Root separately reviews UI/persistence. No repository edits, real child service, account, login, provider, model or display operation.

Original findings:

- **W-SUB-T01 original login race: fixed.** Prior exact event sequence now performs two account reads and ends signed_in with the current image model.
- **W-SUB-T02: fixed.** `ask/cancel` requires exactly `{cancelled:true,uncertain:false}`; `session/stop` requires exactly `{}`. All recorded interruptions must confirm. Four prior missing/malformed/no-active cases now preserve `uncertain:true`; new owner cases cover both methods, extra keys, wrong types, and combined Cancel/Stop.
- **W-SUB-T03: fixed.** Actual exit settles the promise even after protocol fencing. The prior overlong-line reproduction records zero later kills. Quit now awaits chained fenced-child cleanup; focused tests cover immediate EOF exit, forced shutdown, and two overlapping closures.

## Remaining regression: W-SUB-T01-FENCE (P2, blocking)

`subscription.ts:289–292` queues subsequent reads through `request()` without binding them to the original live child. `request()` at `242–244` may start another child. `check()` also has no generation check before publishing a result at `295–313`.

Bounded independent reproduction using one exact source data callback:

1. Begin a held `connection/read`.
2. Deliver one stdout chunk containing `connection/changed`, a valid reply to the held read, then an oversized trailing line.
3. Parsing marks the account read successful, then fences the child for the oversized line before the Promise continuation runs.
4. The queued refresh sees `r.ok && readAgain`, invokes default `request()`, and starts a second connector.

Observed: **two child spawns, one connection/read on each, final signed_in**, with no second user Check. The first child is correctly reaped; the new read loop has bypassed the protocol-loss fence. No inference is submitted in this reproduction, but the product is again marked ready after the failed transport without an explicit recovery action.

Minimal owner correction: bind the read chain and result publication to its initiating live child/generation; stop on child fence/loss/quit, retaining unavailable/unknown. Coalesced follow-up reads should use that live transport rather than implicitly launching a replacement. Merely clearing `readAgain` is insufficient if the stale successful result is then published over the unavailable state. Preserve the four-read bound and the corrected login flow.

## Evidence

- Exact archive: `/tmp/windows-subscription-c977df5-r9d6qty6`.
- Adapted original probe: `/tmp/windows-subscription-correction-independent-probe.ts`; only archive path, expected fixed results, and output labels changed. **6/6 pass**; output `/tmp/windows-subscription-correction-independent-probe.json`.
- Focused newly added owner tests: **3/3 pass** (`a change, or a completed sign-in`; `a cancel or a Stop is a confirmed`; `a connector ended here for a line`). No broad suite rerun.
- New combined-path reproduction: `/tmp/windows-subscription-correction-fence-probe.ts`; output `/tmp/windows-subscription-correction-fence-probe.json`.
- Scoped `git diff --check` passes.

Next owner: existing Windows/Web owner for the small read-generation fence, then this exact combined-path regression and the already targeted tests. Synthetic transport success does not close any real image, learning-context, account-eligibility or device gate.
