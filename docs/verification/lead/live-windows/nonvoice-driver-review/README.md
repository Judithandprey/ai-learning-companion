# Current-package nonvoice driver review — 2026-10-09

**HOLD latest QA `e0bd4b37dc788a766ed3f6fe86602f556b04d4cd` pending the remaining independent findings; no execution allocation.**
The first correction is received and its focused checks pass; it does not close
the independent review of its parent `b8f0d9c`.
Actual delivery `handoff_a2f89cda91b9465425a8ca4eeec4cce6` follows the existing
P0-13 preparation assignment. Product remains52be105, staged77-file tree531943a8;
the successful AI-disabled diagnostic and all3consumed slots remain closed.
Real actions remain0/4. This review invokes no Windows/account/model/audio action.

Existing Support completed exact-source independent review
`handoff_dc6421e3ff2c4836f05f61dcab7e7985`: **HOLD**, delivered in
`handoff_306b8df25c41e31565c5bd9cacba02e6`, Support commit `38230e1`,
integrated as `16e257d`. Lead owns the
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

## Received correction and consolidated independent findings

QA delivery `handoff_1db90d738e09039116a04a78d8f84961` supplies exact
`e0bd4b37dc788a766ed3f6fe86602f556b04d4cd`, with candidate-nonvoice-02
`74ebc3942022fe0549aa691b45ff5cc4949a56041b2f424b22f4786eb4374fbc`.
The prior candidate and evidence are preserved. Lead reviewed the changed source
and ran the actual authored suite once from an exact Git archive: **23/23 pass**,
exit 0, no skips, with Node child-process and filesystem-write permissions
withheld. [Command/result](e0bd4b3-focused-checks.json) and
[actual output](e0bd4b3-focused-checks.txt). These are offline driver checks,
not independent product acceptance. The author additionally reports 35/35
mutation detections; Lead did not rerun or add them to its check count.

The actual account-ready expression now permits included exhaustion/reached
markers and unknown allowance. Reached Start with missing later records consumes
one uncertain slot; known pre-trigger refusal remains distinguishable. D1–D10
changes are visible in the source, including the fixed outer bound, typed-request
explain override and raw receipt exclusion. Applicable spend-bucket selection
still needs the correction below.

The full [Support report](../../../support/nonvoice-live-b8f0d9c-review-20261009/README.md)
and its concrete probes are integrated. They review frozen parent `b8f0d9c`, so
their already-corrected F1/F2 portions are not presented as newly reproduced
defects in `e0bd4b3`. Remaining corrections in that latest source are:

- **F1 applicability:** scope spend/workspace controls to the selected
  model/Codex limit exactly as the real consumer does; an unrelated bucket is
  not a universal Start veto. Preserve applicable authoritative restrictions.
- **F3 source lifetime:** after Start, 16-point/topology checks do not revalidate
  the exact full-display Edge/browser geometry. Automatic frames and submissions
  also occur between explicit UI steps. Bind fresh complete admission to the
  actual frame/send path; do not claim an atomic desktop guarantee. The bounded
  production-owner repair is now assigned below.
- **F4 evidence:** collection failures, malformed records, fourth-action tools,
  wrong Codex digest and extra cumulative turns must not yield mechanical
  success. Reconcile all actions/receipts without double-counting cumulative
  counters, and validate receipt containment/identity before copying.
- **F5 lifecycle:** an empty/end-only watcher cannot prove connector release.
  Establish readiness and sufficiently correlated observed lifecycle evidence;
  missed descendants remain unknown, with no expanded signalling authority.
- **F6 phase:** uncertain submission remains unknown; contradictory ask,
  receipt and settled records cannot prove an in-flight Stop fence.

These are source/synthetic counterexamples, not observed private capture,
extra real requests, tool execution or process leaks. The actual main production
slice and earlier native diagnostic evidence are unchanged.

Same-owner amendment `handoff_3b1cdc65a16b36d56c69069a8351350f` was accepted,
initially unread/execution_started=false. It preserves QA's correction and adds
the remaining findings in the existing P0-13 task. Support received one bounded
F3 seam clarification `handoff_1574632a1503864240e752bc4d9507fa` completed with
actual reply `handoff_a7e5e910dfd42fec19ea4317afcf8c32`; see the decision below.
Next: Web supplies the capture/send interlock and QA completes the same driver;
Support reviews changed boundaries, then Lead integrates and resolves exact
command/resource admission. No current
display/account lease exists, real actions remain **0/4**, and the old diagnostic
remains **3/3 consumed and closed**.

## F3 decision: await admission in the actual capture/send consumers

Support's source-only clarification at product `52be105` establishes ordering:
`overlay.ts` acquires/publishes raw bitmaps in `takeSample`, then independently
initiates retention and the first look. `main.ts` saves retained/first-look pixels
before `lookAt`/`flushLook` reach the shared `sendTurn` and `subscription.turn`.
A separate watchdog can therefore observe a violation after saving or sending;
ordinary Stop cannot retract either. It can support a monitored-test claim, but
does not close the preventive source check required for this candidate.

Lead chooses two small, opt-in test-path interlocks, preserving real display
pixels, existing retention, actual production handlers and the official connector:

1. Arm before capture can produce its first sample. Await full native admission
   before and after `takeSample`'s bitmap acquisition. Only publish/retain/use
   the held frame after acceptance of that capture/sample and its actual raw
   hash. Preserve original stream age, reused-frame and ink lineage facts.
2. At `sendTurn`, require that exact image's admitted frame evidence plus a
   current, non-invalidated session decision. Recheck Stop and capture/live
   identity after awaits. Missing, stale, mismatched or timed-out decisions
   latch ordinary whole-capture `end()`, not only AI `endLive()`; preserve
   already accepted originals and uncertain request accounting.

This is logical sequencing, not compositor atomicity: a transient OS change
between native observations remains the disclosed race. Test configuration and
decisions are trusted-main-owned; the renderer or captured page may not choose
an executable/path/URL, issue an allow decision or disable checks. A configured
but unavailable checker refuses; the ordinary unconfigured product behavior
retains its existing checks. No new capture framework, arbitrary command bridge,
model call or global permission change is part of this repair.

**Ownership and actual handoffs:** Web's existing P0-12 continuation
`handoff_18b4ff71bb8202171b38c72be18194e1` is accepted, initially unread and
execution_started=false. Exact baseline is main `93697b4`; Web owns only
`apps/windows` main/preload/renderer, its focused tests and owner evidence. It
returns the minimal checker interface before committing a transport dependency
on QA. QA receives the same-task F3 decision in
`handoff_3c83dc63c604c41bcc77f8ca91fa7406`, accepted with execution initially
unconfirmed; it retains native checker/runner/evidence ownership under
`tests/e2e/windows` and QA docs, and continues the independent F1/F4–F6 fixes.
There is one active task per owner, no duplicate implementation.

The later live candidate must pin the resulting reviewed production build;
`52be105` and its completed diagnostic remain historical exact evidence, not
proof for changed bytes. No resource allocation or new native attempt follows
from source dispatch. Support is idle until the corrected boundary is ready for
review. Real actions remain 0/4; no additional AI-disabled diagnostic slot exists.
