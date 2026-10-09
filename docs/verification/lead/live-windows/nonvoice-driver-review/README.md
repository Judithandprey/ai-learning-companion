# Current-package nonvoice driver review — 2026-10-09

**REVIEWING latest QA `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b`; no execution allocation.**
Its focused30checks pass. Independent changed-boundary review, the exact owned
overlay predicate and Web's app interlock/build remain dependencies. Interim
candidate03 mechanically refuses execution against old production52be105.
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
defects in `e0bd4b3`. The remaining corrections identified at that source were:

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

Actual Web reply `handoff_1b7f16285d35144c7c876d11402e08a8` confirms the local
state/binding/lifecycle implementation is under way and supplies a checker
interface proposal. This is observed owner activity, not a completed patch.
Lead returns the concrete decision in `handoff_65d44351ffdfa6c2126f9f94ab6687f3`
and gives QA the same interface in `handoff_bd7d451fa1ab12ebd2e49666fc009394`;
both are accepted, with execution initially unconfirmed. No extra task is created.

The later live candidate must pin the resulting reviewed production build;
`52be105` and its completed diagnostic remain historical exact evidence, not
proof for changed bytes. No resource allocation or new native attempt follows
from source dispatch. Support is idle until the corrected boundary is ready for
review. Real actions remain 0/4; no additional AI-disabled diagnostic slot exists.

## Checker interface decision — source implementation only

This is the private opt-in test adapter, not a new product wire contract or
permission to execute it. Existing shared contract versions remain unchanged.
Web owns the app client and QA the native checker/runner. Their final sources,
helper/configuration hashes and exact command still require review before a
resource allocation. All ordinary product and Stop behavior remains covered.

**Activation and trust.** The runner writes one pinned configuration before
launch and sets `LC_SOURCE_ADMISSION` only for that product process. Main reads
the file once. Its fields are exactly `format` =
`lc-windows-source-admission-config/v1`, `checker` (`command`, `args`),
`ready_ms` and `decision_ms`. Command is an absolute executable; arguments are
at most 32 fixed strings of at most 4096 characters without NUL/CR/LF. The actual
QA candidate must use the existing Windows PowerShell and one reviewed frozen
checker script/arguments, all covered by pins. This is not a renderer-selected
command, alternate engine or arbitrary command/encoded-command bridge. General
parser ceilings (ready 1000–120000 ms, decision 100–30000 ms) are not execution
authority: prepare fixed **10000/5000 ms** initially, revising only with evidence
and reviewed pins before release. Unset keeps the ordinary path; configured but
invalid/unavailable refuses Start/checking without fallback.

Main spawns one checker per capture at arm, before `getDisplayMedia`, using
`shell:false`, hidden window and stdin/stdout pipes; remove `LC_*` from its
child environment. No command, environment or private path enters public
evidence. The checker never receives pixel data or instruction authority from
the captured screen. Sanitized error facts remain available. End closes stdin,
waits at most 3 seconds, then may signal only the exact directly spawned child;
there is no descendant/foreign-process termination authority. Unconfirmed exit
remains unknown. A new Start is explicit, never automatic recovery.

**JSONL protocol.** UTF-8 records, at most 4096 bytes per line. First record is
exactly `{"format":"lc-source-admission/1","ready":true}` within ready timeout.
Each request has these fields:

| Field | Meaning |
| --- | --- |
| `format` | `lc-source-admission/1` |
| `id`, `seq` | Unique random 32-lowercase-hex request ID and increasing positive safe-integer sequence |
| `phase` | `arm`, `pre_acquire`, `post_acquire` or `send` |
| `capture_id` | Actual 16-hex capture identity |
| `display` | On arm, `{id,bounds:{x,y,width,height},scale_factor}` from the main-owned display; otherwise null. Actual product `id` is a decimal string; the adapter may also accept a lossless safe nonnegative integer representation, compared to the same admitted source and echoed without changing its JSON type. |
| `sample_seq` | Acquisition sampler invocation, positive safe integer; null on arm |
| `frame_seq` | Acquired **HeldFrame.seq**, never renumbered AI `LiveContext.frame_seq`; null until post-acquire |
| `raw_sha256`, `raw_size` | Bitmap RGBA SHA-256 and `{width,height}` after acquisition; null before it |
| `request_id`, `image_sha256` | On send, actual model request ID and SHA-256 of the exact PNG sent; otherwise null |
| `sent_at` | ISO timestamp at actual write, not enqueue |

Phase binding is explicit: arm has only display/capture facts. Pre-acquire has
`sample_seq` but null frame/hash/size. Post-acquire repeats that sample and sets
`frame_seq` to its acquired HeldFrame.seq, plus raw hash/size. Send names that
same admitted raw frame and its original acquisition sample, even when reused;
it adds request ID and actual composed/raw PNG hash. The separately renumbered
AI-context frame sequence is correlated in main's evidence, not substituted for
the acquisition identity. Preserve presented-frame age and ink/composition
lineage. Main checks received PNG bytes as before; this is not independent
re-decoding of the renderer's trusted bitmap hash.

Reply has exactly all request fields **except `sent_at`**, echoed equal,
plus `verdict` (`allow`/`deny`) and `reason` (null or at most 300 characters).
This includes display and raw size. Main keeps the request immutable. Only one
is outstanding; start its deadline at write, recheck capture/live/request state
before writing a queued request and after the reply, and bound/cancel queued
waits. Every checker decision performs fresh full native admission; no cached
allow. Missing, stale, mismatched, malformed, replayed or extra-key replies,
unexpected exit/EOF and failed evidence writes latch ordinary whole-capture
Stop. Intentional disposal and late replies cannot reopen a capture or overwrite
its original stop reason. Remaining uncertain lifecycle is not a release pass.

Main owns the one-use acquisition ticket, consumes it before awaiting the post
decision, and verifies admitted raw lineage at every retention, first-look,
circle and follow-up intake and at send. Late results after Stop cannot publish,
retain new unapproved content or send. Accepted originals already queued for
durable storage remain preserved. A refused send gate records not-submitted
only because the actual connector call was never made; prior out requests retain
their actual uncertain/submitted status and ordinary cancellation.

Focused implementation checks include acquisition versus AI sequence numbering,
unchanged-frame follow-up, delayed/coalesced frames and ink lineage, invalid post
checks, replay/mismatch, Stop while queued/awaiting and ordinary unconfigured
behavior. These are required source checks, not claims they have already run.

## Correction 03 received; remaining cross-owner decisions

Actual QA `handoff_32491a1ff558dee96f8f508ca0d71439` delivers exact
`9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b`, on `e0bd4b3`. Lead read the full
`driver-nonvoice-03/README.md`, changed ledger and native protocol source and ran
the authored suite once from an exact Git archive: **30/30 pass**, exit0, no
skips. Node child-process and filesystem-write permissions were withheld;
[command/result](9614947-focused-checks.json),
[actual output](9614947-focused-checks.txt). The author's77mutation detections
are separately reported, not rerun or added to Lead's count.

Delivered source now scopes the spend/workspace veto to the applicable bucket;
checks collection, receipt identity/tools and cumulative turns for all actions;
requires observed watcher readiness/lifecycle; preserves conflicting/uncertain
submission; and validates receipt containment and identity before copying. QA
also supplies its JSONL native checker, full source-admission decisions, lineage
log and runner/configuration binding. These are source/check results, not actual
PowerShell, model, capture or application acceptance.

Candidate03 hash is
`db83ff5c52bbbdef4d4fb361522c4a2d2b8168fab7face4805efb4ba30bd3df6`;
wrapper `ddbd65f80720f5cb109906e4d01aa3f3dd93c40f2beac8519fa7fd645c83d2cd`.
Its `interlockProduction=null` deliberately refuses every allocation because
52be105 does not contain the new app consumer. Keep that gate until the reviewed
Web source/build is available and all candidate pins are regenerated. Earlier
candidates/evidence remain intact. No QA source is integrated yet.

Support receives the concrete changed-boundary review in
`handoff_26fac298197c97826e4184e71ff22557` (accepted, execution initially
unconfirmed). This covers its F1/F3–F6/reader findings and the remaining source
predicate, not another whole-product campaign. QA receives the following Lead
decisions in `handoff_1698eb178ef50ac35b1b960a035cfbae`; Web receives the actual
checker delivery and coordination in `handoff_c899b66b9fb10e64d25e305d1cadc258`.
Both accepted receipts are dispatch evidence, not completed follow-up work.

- **Interactive product overlay:** during ASK, the product's own full-display
  overlay accepts input and can become the root hit-test window. Do not knowingly
  spend a real request on that unresolved harness conflict. QA prepares a narrow
  predicate which may look through only the exact current product overlay,
  independently bound to launched process/creation/handle, expected title/class,
  bounds/topmost and positive capture-exclusion evidence. The admitted Edge must
  remain directly beneath at every required point, with exact full coverage and
  normal band. Foreground must be Edge or that proven overlay. Unknown identity,
  exclusion or band, another intervening window, control window or another app
  still denies. No PID/title-only exception, global foreign allowance, window
  mutation or expansion of cleanup ownership. Support reviews equivalence; this
  is a pending source repair, not a claim the native predicate is available or
  has passed. Web preserves ordinary input behavior and proposes any minimal
  main-owned arm identity addition through Lead before changing both sides.
- **Timing:** keep4actions/60s/60s and the600s outer bound. The revised wait
  worst case588s is a source calculation. The estimated3s/decision comes from
  earlier helper timings, not a checker measurement. Unfinished actions remain
  NOT_RUN. No session renewal, new requests or allowance expansion follows.
- **Display ID:** confirmed as the decimal string supplied by production;
  lossless numeric adapter compatibility must preserve original reply type.
- **Normal band:** reading the same frozen window before/after the two existing
  identity resolutions is acceptable if PID/creation/handle and predicate
  equivalence remain verified. Redundant lookups are not required for their own
  sake; no source check may disappear.
- **Parse/compile:** QA may proceed under normal tool review with bounded
  `Parser::ParseFile` and `Add-Type` compilation of extracted literal C# types.
  Do not execute either script's top-level code, native methods, display/input
  operations, account/model, microphone/sound or TTS. Preserve exact commands,
  hashes/results and isolated output. No native-display/provider slot is used.
  A real new tool denial must be reported and respected; changed source hashes
  alone do not require repeating resolved human approvals.

Next owner actions are concrete: Web delivers the app interlock; QA completes
the same checker/candidate repair and targeted checks; Support independently
reviews changed boundaries; Lead integrates and then considers exact command
and resource admission. Real actions remain **0/4**, diagnostic **3/3 closed**,
no active resource lease. No product source, user app/profile or automation state
is changed by this review record.
