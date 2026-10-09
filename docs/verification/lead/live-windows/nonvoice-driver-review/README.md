# Current-package nonvoice driver review — 2026-10-09

**HOLD exact QA `b8f0d9c23a0091c76fd2def239f445d1b8d04854` for correction; no execution allocation.**
Actual delivery `handoff_a2f89cda91b9465425a8ca4eeec4cce6` follows the existing
P0-13 preparation assignment. Product remains52be105, staged77-file tree531943a8;
the successful AI-disabled diagnostic and all3consumed slots remain closed.
Real actions remain0/4. This review invokes no Windows/account/model/audio action.

Existing Support received exact-source independent review
`handoff_dc6421e3ff2c4836f05f61dcab7e7985`; its verdict is pending. Lead owns the
engineering choices below and final integration. QA can repair the concrete Lead findings in the same assignment while Support
reviews the frozen baseline. Additional review findings amend that task, not a
second implementation owner or duplicate test campaign.

## Reproduced corrections

**L1 — Included quota is again mistaken for all allowance.**
`qa_live_candidate.mjs`'s `account_ready` step denies on
`ordinary_usage_allowed === false` or any `rate_limit_reached_type`, ignoring
usable ordinary credits. [Exact-step VM probe](quota-probe.json) reproduces refusal
with synthetic `windows[].credits.has_credits=true` and no spend control, both
with included usage false and with a reached marker alone. Unknown allowance is
permitted; explicit spend control is refused. These are driver outcomes, not actual
server decisions. The existing [real credit-backed image result](../actual-credit-vision/README.md)
already proves why included-only veto is wrong. Retain account/model/capability
and applicable authoritative spend controls; do not treat an included window or
unknown balance as a universal refusal. The real server remains authoritative,
with no automatic retries, reset-credit use or billing/account changes.

**L2 — Start with missing records undercounts unknown requests.**
The exact candidate and exported `buildLedger` were exercised with `capture_start`
recorded, but no later policy/live/ask records. Both a successful return and a
failed/lost return produce0used and slot1NOT_RUN. [Probe](unknown-start-probe.json).
A reached Start may already have caused the first observation. Conservatively
count its assigned slot even if the subsequent records are absent; distinguish
this from a known pre-Start refusal. Unknown execution must never produce reusable
zero allowance. This is synthetic failure-path evidence, not a real leaked request.

## Lead engineering decisions for the correction

These choose the existing test's implementation, not new product requirements,
human spending limits or execution approval. They do not change product defaults.

| QA item | Decision |
| --- | --- |
| D1 help level | Keep automatic circle hint-first. For the generated visual-reading follow-up and Stop test, explicitly select `explain` through the existing UI. This asks to read generated pixels, not solve a learner's problem; record the test override. |
| D2 input method | DOM value/input events and the actual production Start handler are acceptable for this automated integration slice. Label CDP/DOM; do not claim physical mouse/pen/keyboard usability. No direct service bypass. |
| D3 Stop | Keep `#liveStop` for the AI request fence and capture Stop during wind-down. Report which scope stopped; do not claim whole-capture Stop or provider-in-flight cancellation from this single fence. |
| D4 timing | Stop immediately when the fourth request is out. Preserve actual before-submission/in-flight/unknown verdicts; no extra request merely to obtain a preferred race. |
| D5 session | Keep the existing4requests/60s session/60s observation policy and all source guards. If latency exhausts the minute, remaining actions stayNOT_RUN, without renewal or dropping guards. This is a bounded test, not the final study-session limit. |
| D6 outer watchdog | Prepare one fixed600000ms outer native bound for setup, the60s session and cleanup; no arbitrary519–900s caller range. This is a candidate choice only. The former140s AI-disabled authorization is not an execution reference for this new real-connector command; review exact ready command and applicable permission before any allocation. |
| D7 cleanup | Observe connector descendants; no new force-kill authority. Unknown/leftover processes mean cleanup/account release unconfirmed, not success. Keep exact-owned app/Edge cleanup. |
| D8 publication | Raw provider receipts/IDs remain local and excluded from Git. Prepare a reviewed allowlist of generated, sanitized evidence; a directory named `private` alone is not exclusion. Never publish auth/profile contents. |
| D9 oracle | Circle card0; request the current top row without telling the model that values changed. Keep all oracle numbers outside request text and require fresh off-focus pixel evidence where claimed. |
| D10 identity | Retain the existing reviewed0.158 digest, same product-managed default state and selected account/model. Current signed-in state is unknown until a separately released normal Check; no private credential read, copy, lock repair or alternate auth. |

Support's review may identify additional concrete corrections; do not waive them.
Neither20author checks nor a source review proves real inference, native interaction,
voice, or either full §7.1 gate. No further diagnostic run, new account/spending,
model/effort/permission/service change or monitoring is authorized here.

## Actual correction handoff

Published Lead baseline `b63ecdcf9dd436a60a3de702dfa8c7ee39a3232a` was returned to
original QA in `handoff_3ec98086b3b4b0a1a8b4c17b14a8746a`, accepted unread with
execution_started=false. It assigns the two reproduced corrections and D1–D10
within the existing task; Support continues the frozen-source independent review.
Delivery acceptance is not a completed repair or actual execution proof. No
display/account/audio lease or provider request was created.
