# Current-package nonvoice driver review — 2026-10-09

**Windows interlock staged; candidate06 source reviewed and integrated. Exact live script scope and resource allocation remain unreleased.**
Web's reviewed source through `ebbd1ed` integrates as `0ff325b`; its Windows tree
matches exactly. Lead's final holding-membership case passes, and TypeScript plus
static packaging pass. The distinct 81-file `%TEMP%\lc-windows-admission-0ff325b`
stage has tree `081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a`.
All 77 earlier 52be105-stage files still match. No application was launched.

Support `b93fc60` independently closes candidate05's five findings. QA `5bdbc1d`
then fixes its final duplicate-EOF gap and stale connector template pin, integrated
as `5ba6f50` with the preceding reviewed QA chain. Lead's independent three-case
EOF probe, actual pure template validator and exact candidate reproduction pass.
All six native payloads are unchanged from candidate05. See the final review below.
Execution remains unreleased; source checks do not establish native acceptance.
The actual candidate05 parse check has zero errors for both scripts and its one
changed C# literal compiles; these are static results only. Candidate05's template
is inactive. Historical candidate04 retains `interlockProduction=null`. QA's separately assigned pure-data
PowerShell fixture check was refused before loading by Windows execution policy;
no cases ran and no alternate invocation was attempted. Details below.

Real actions **0/4**, old AI-disabled diagnostic **3/3 closed**, no resource lease.
This is source/build preparation, not live vision, voice or full-product acceptance.
The chronological findings below retain their original baselines and are superseded
only by the specific later correction/integration records.

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
| `overlay` | On arm, `{pid,hwnd}` authored by main from `process.pid` and this capture's `s.overlay.getNativeWindowHandle()`; `pid` is a positive safe integer and `hwnd` a positive decimal string. Otherwise null. It is never supplied by the renderer or discovered by title. |
| `sample_seq` | Acquisition sampler invocation, positive safe integer; null on arm |
| `frame_seq` | Acquired **HeldFrame.seq**, never renumbered AI `LiveContext.frame_seq`; null until post-acquire |
| `raw_sha256`, `raw_size` | Bitmap RGBA SHA-256 and `{width,height}` after acquisition; null before it |
| `request_id`, `image_sha256` | On send, actual model request ID and SHA-256 of the exact PNG sent; otherwise null |
| `sent_at` | ISO timestamp at actual write, not enqueue |

Phase binding is explicit: arm has only display/capture/overlay facts. Pre-acquire has
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
This includes display, overlay and raw size. Main keeps the request immutable. Only one
is outstanding; start its deadline at write, recheck capture/live/request state
before writing a queued request and after the reply, and bound/cancel queued
waits. Every checker decision performs fresh full native admission; no cached
allow. Missing, stale, mismatched, malformed, replayed or extra-key replies,
unexpected exit/EOF and failed evidence writes latch ordinary whole-capture
Stop. Intentional disposal and late replies cannot reopen a capture or overwrite
its original stop reason. Remaining uncertain lifecycle is not a release pass.

**Current overlay binding.** QA independently records the launched product's
PID and native creation ticks before capture starts. At arm it binds that
immutable process identity to main's exact overlay HWND and `capture_id` for
the entire capture. A later matching title or a new per-decision handle cannot
replace it. Web exposes only a test-configured read-only `source_admission`
fact through the existing session-info response:
`{capture_id,overlay:{pid,hwnd},active}`. `active` requires the current, non-ending
capture and accepted checker arm; it becomes false or absent after Stop. The
existing `session_id` is the overlay ID, not the capture identity. This adds no
writable IPC or renderer authority. QA correlates this fact with its launch
identity and accepted arm; native exclusion and stacking checks remain QA-owned.

At every relevant checker and runner point, require positive successful
`WDA_EXCLUDEFROMCAPTURE` (17), current owner/title/class/bounds/visibility/topmost,
and exact generated Edge directly below after excluding only that overlay.
`WDA_MONITOR`, unreadable affinity, an intervening control/foreign window or
unknown metadata denies. Preserve the same predicate in both `onTop` checks,
foreground, all point checks and final identity/geometry revalidation. Do not
move, hide or disable a window to make admission pass. This is an unreleased
test-interface refinement, not proof of native stacking or atomic capture.

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

Support completed the changed-boundary review assigned in
`handoff_26fac298197c97826e4184e71ff22557`: actual reply
`handoff_8ef9e664b0bb7595d0608518155fd790`, exact commit
`5083814d8fb096dc0b080282533f022903ce2efe`, integrated as `0ac8605`.
The [full review and synthetic witnesses](../../../support/nonvoice-live-9614947-review-20261009/README.md)
close F1 and retain HOLD for the concrete repairs below. Support executed 11
boundary scenarios (8 controls, 3 defect witnesses) and 2 ledger controls with
6 negative inputs, 5 of which incorrectly passed mechanics. These results do
not inherit the author's checks or establish actual capture/provider behavior.

| Finding | Same QA task correction |
| --- | --- |
| R1 | Classify every observed request or mark evidence incomplete; missing/unknown trigger cannot remove an extra request from the ledger. |
| R2 | Reconcile published-turn counts and request phases per launch before totals; a proven-unsent slot cannot absorb an unexplained published attempt. |
| R3 | Reconcile all matching Stop/settlement records and identities; missing phases remain unknown and contradictory later records cannot disappear. |
| R4 | Require a live watcher at admission, preserve subsequent coverage loss as unknown, and validate appearance/exit order and identity before claiming release. |
| R5 | Validate bounded receipt field types before copy and public projection; exact keys alone cannot prevent nested malformed values. No actual disclosure was observed. |

The trusted overlay binding above resolves the remaining cross-owner interface
choice. Same-task QA amendment `handoff_e893ca27aaf7622da5bf6ad6e059c5ee` and
Web amendment `handoff_f9c208600bcc9b8d39ba033019464857` were accepted, initially
unread with execution not started. Existing owner worktrees contain partial
checker/interlock edits; these are activity evidence, not delivered repairs or
adoption of the latest amendments. Support is idle until corrected changed
boundaries are ready, with no duplicate implementation assignment.

Lead integration checks matched all 24 recorded source/payload/manifest hashes
against the exact QA Git objects, resolved this review's local links, parsed the
budget JSON and confirmed unchanged 0/4 usage with no active lease.
`git diff --check` passed. The independent probes were not rerun; no native or
provider action was performed. The unrelated directory edit remains excluded.

QA had received the following Lead
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
  has passed. Web preserves ordinary input behavior and implements the
  main-owned arm identity addition specified above with QA's matching consumer.
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

## Web consumer delivered; client correction and independent review active

Actual message `handoff_4df62e69d2eab17b382e8ec9e77c25ca` delivers Web
`48c20c410dc49c7805fa775013501222116cd2b3`, one leaf on `dff86d9`;
`apps/windows` tree `6185479c728344519db21d7e88a56d8a184570dc`. Lead read the
complete owner report and the client implementation. This confirms adoption of
the current overlay-binding decision, not integration or native acceptance.
The owner reports TypeScript/build success and 486 passing, 5 skipped tests,
with the earlier bridge timeout and subsequent passing run preserved. These
counts are author evidence; Lead did not repeat that full suite or mutation run.

Lead's [small exact-source client probe](web-client-probe.mjs) produced these
[actual synthetic results](web-client-probe-48c20c4.json):

- In-bound decision control allows normally. With `decision_ms=100`, a bounded
  150 ms event-loop stall followed by an exact response before the timer callback
  still returns `ok:true, ms:150`. Readiness similarly accepts after its 1000 ms
  bound when the event loop is stalled for 1050 ms. Enforce elapsed monotonic
  deadlines on receipt, retaining write-time deadlines and cancellation.
- The default UTF-8 decoder strips a BOM, so a BOM-prefixed ready line is
  accepted despite the documented BOM-free protocol. The config rejection
  control works. Align the reader and report with the specified ready format.

The probe ran once under Node 24.21.0 `--permission`, with read access only to
the exact Git export `/tmp/lc-lead-web-48c20c4-7qyblmyo` and the probe. It used
in-process fake streams, no child-process or write permission. Shell redirection
saved the synthetic result. Exit 0 means the counterexamples were reproduced;
it is not a pass of the defective behavior or real Windows timing evidence.

Same-owner correction `handoff_6d04d5f2fce4ecf54550d070b1dd7b1b` is accepted,
initially unread/execution not started. Scope is the two receipt deadlines,
BOM handling and focused controls, plus correcting the stale statement that
QA's checker does not exist. QA already delivered its initial checker at
`9614947`; its corrected consumer remains in progress.

Support's bounded consumer review `handoff_91bcc765776fedd7445855f09561f618`
is accepted, initially unread/execution not started. It covers intake/retention,
frame/send lineage, cancellation, current overlay identity and child lifecycle;
Lead handles the client protocol. QA receives exact Web source in same-task
dependency handoff `handoff_0326d79a1396534848f475da12bef664`, accepted with
adoption unconfirmed. Preserve both owners' ongoing changes. No package is
staged or approved yet; final app/checker composition and pins remain required.
Real actions stay **0/4**, old diagnostic **3/3 closed**, with no resource lease.

### Corrected Web client `9c3beab`

Actual reply `handoff_1c26ffb9de8e59ae8836af51308b2f50` delivers
`9c3beab5d9bfae4ebd295af5a3db5baf99b4038c`, one leaf on preserved `48c20c4`,
Windows tree `5725405fe8c6bef2fbb47ed902d9ad8233ee31e8`. The three-file delta
uses monotonic elapsed-time checks when reading ready/decision responses and
retains then rejects the BOM. It corrects the report's checker status and prior
interlock count: **10 + 17**, not 10 + 18. No main/overlay consumer changed.

Lead read the exact delta and ran only the new focused deadline test from a Git
export under Node read-only permissions and in-process test isolation: **1 pass,
0 fail**, covering normal controls, delayed ready/decision callbacks and BOM.
[Actual command/output and failed first invocation](web-client-correction-9c3beab.json)
preserve the initial path-discovery failure: that invocation did not execute a
test. A premature success sentence to Support was immediately withdrawn in
`handoff_45080d7a7e6c9c90ff949c41932f5a7a`; only the later recorded invocation
passed. No full suite, mutation campaign or native/provider operation was repeated.

The client findings are closed at this exact source. Support's existing review
was updated to `9c3beab` through `handoff_c39d67709daee9055c7a9d24614e97a7`;
its independent consumer verdict and QA's corrected checker are still required.
The app remains unintegrated/unstaged, and no execution allocation is created.

### Independent consumer review received — C1–C3 correction assigned

Actual `handoff_d7913179342e20a911a317c3cf0d63f2` delivers Support
`dbb42ab61b444759e954f6af829fbe98a556dbc7`, integrated as `ff51068`.
Lead read the [full report](../../../support/windows-admission-9c3beab-review-20261009/README.md)
and both exact-source probes; the verdict is **HOLD at Web `9c3beab`**.

| Finding | Evidence and bounded owner correction |
| --- | --- |
| C1, P1 | An allow and its replay in one stdout chunk synchronously latch `checker.failure`, but main consumers act before the deferred failure notification. The probe reaches one fake connector call and separately returns an admitted frame while failure is already known. Fence the existing consumer side effects on that synchronous latch after waits, preserving decision/violation order and Stop reason. This is distinct from the disclosed native time-of-check race. |
| C2, P2 | A frame arriving during pre-admission updates progress facts but leaves the sample/retention state `no_new_frame`. Derive state from the actual acquisition facts, preserving gap/ended precedence. |
| C3, conditional P2 | After admission 65 evicts frame 1 from a 64-entry cache, its genuinely approved but pending retention intake is refused and ends capture. Preserve admission lifetime for pending originals or establish an enforced bound. No real encoder delay or native original loss was measured; already stored originals are intact. |

Support executed only two minimal offline probes: 5 controls, 3 defect witnesses
and 1 conditional cache witness. Its first extraction-anchor failure is retained,
not counted as a pass. Successful probe exits reproduce defects rather than pass
the product. The deadline/BOM fix remains verified separately. No real connector,
display, provider, account, audio or TTS operation occurred.

Web same-task repair `handoff_09a84c59045de0dbcd52f6829e5b98a9` is accepted,
initially unread/execution not started, and is now delivered below. It requested one minimal correction and
focused positive/negative checks, preserving earlier fixes and originals; no
full-suite or mutation rerun, new framework or protocol. Support is idle until
the corrected boundaries are ready. QA continues its existing R1–R5/native
checker correction independently. Lead retains integration and exact candidate
release after review. Real actions **0/4**, old diagnostic **3/3 closed**, no lease.

### C1–C3 source correction delivered; focused checks pass

Actual `handoff_62b67a565d6db48314b98d4f70e1de1c` delivers Web
`477890829c4afe880a151f3ce151b98b97405414`, a child of `9c3beab`, Windows tree
`7c20539ef16478d96f6719d8236078fea96daa09`. Lead read the five-file delta and
the owner's full correction record. It checks the synchronous failure latch
after recording the real answer, recalculates frame state at acquisition, and
keeps admissions for frames still held or pending intake. The bounded
app-internal `holding` list retains at most 16 earlier frames plus the newly
admitted frame; it does not alter the checker protocol or ordinary configuration.
Retention, first-look, circle and follow-up mark their pending frame use and
release it after handoff. Malformed lists and later use of a dropped admission
still refuse. The unconfigured branch keeps the original behavior; no additional
ordinary-mode defect was identified in this delta review.

Lead ran only the three affected integration-style unit cases from an exact Git
export: **3 pass / 0 fail**, including same-chunk replay fencing, arrival during
admission, delayed frame-1 retention after 70 newer frames, omitted-frame refusal
and malformed lists. [Actual command/output](web-consumer-correction-4778908.json).
Node had no child-process permission; writes were limited to the test's dedicated
temporary directory. Electron, checker, connector and display were synthetic.
The author's wider 193-pass/5-skip run and six reverted-fix mutations remain
separate evidence, not repeated or added to Lead's count.

Support receives the single changed-boundary retest in accepted
`handoff_71972c17fbe888d529689cf3aabd8aef`, initially unread/execution not started.
It covers C1–C3 and the new pending-use lifetime, not the whole product or QA WIP.
Final independent verdict and QA's corrected checker remain dependencies before
source integration, a distinct package and exact execution release. No resource
lease or real action was used by these checks.

### Independent retest closes original C1–C3; one list-validation fix remains

Actual `handoff_a5e35052f0cc066e5a3926a8278d6da7` delivers Support
`fa786982f4b0b5624a5c30d21aafc5cb0dd9cb6d`, integrated as `d1a4d92`.
Lead read the [full retest and probes](../../../support/windows-admission-4778908-retest-20261009/README.md).
The retest closes the original C1/C2/C3 counterexamples. Retention, first-look,
circle and follow-up each keep frame 1 valid through 70 later acquisitions,
complete its intake, release the reference and permit later retirement without
Stop. Support actually ran 23 synthetic scenario rows: 13 controls, 8 repaired
or lifetime regressions, and two residual witnesses (one conditional). These
are not native evidence or inherited author test counts.

**C3-A remains:** an unknown earlier ID in `holding` is accepted at pre-check,
although it never creates an admission and actual use is still refused. Require
membership in the existing admitted map before pruning or asking the checker;
keep a known-held positive and unknown-empty-map negative. Web same-task
`handoff_f0f1935e1cb76d22f361e920e9b67721` is accepted, initially unread/execution
not started. Lead will review this localized delta and focused checks directly;
another full independent campaign is unnecessary.

**Lead decision on conditional C3-B:** the 16-entry receiver bound and existing
fail-closed capture termination remain an explicit ceiling of this opt-in test
adapter. Seventeen concurrent distinct circle encodings exceed the current
four-action candidate. Do not silently drop pending references, expand the bound
or add a new queue now. Preserve existing originals and cleanup. This is not an
ordinary-product interaction limit, measured native failure or full-experience
acceptance; any later test-scope expansion must revisit the ceiling first. It
neither adds a task nor blocks this candidate's four-action allowance on its own.
Support's original conditional finding is preserved rather than marked repaired.

Support is idle. QA continues the existing checker/driver correction, and Lead
integrates the app after C3-A closes, then verifies a distinct build and final
checker composition. No lease exists; real actions remain **0/4**, old diagnostic
**3/3 closed**. No new user decision is needed for the narrow source correction.

### Final Web correction integrated and a distinct package prepared

Actual `handoff_44435548ba0ffd547421cd81e4a0b4a2` delivers Web `ebbd1ed`, a leaf
on `4778908`. Lead reviewed its one-condition implementation change and focused
controls: each named holding entry must exist in the admitted map before pruning
or a checker request. The exact-source holding case passes, covering empty-map
unknown, known-held and previously dropped IDs. This closes C3-A; Support's
independent original C1–C3 and pending-consumer results are retained, not rerun.
C3-B remains the documented test-only ceiling above.

Reviewed leaves integrate as `a10f058`, `e78a368`, `50e2137`, `0ff325b`.
[Integration/check record](web-final-integration.json) preserves source and main
identities. Resulting Windows tree is `0d9618c2d2c562bedcb41d8ffca11a4f003b1e02`,
identical to the delivered source. Clean TypeScript/static build succeeds. The
unchanged previously compiled native helper is verified against its local build
receipt and source; no new compilation or helper execution was needed.

[Distinct stage and readback manifest](stage-0ff325b.json) pins all 81 files,
entrypoint and cached Electron 44.5.1. Copying used an atomic fresh directory;
old package/profile/auth were not modified, no download or Windows process ran.
All 77 prior stage file hashes match before and after. This package is prepared
for the existing four-action nonvoice acceptance; it is not a user-ready full
companion or an execution lease. QA next repins its reviewed driver to this exact
build after the independent driver verdict; Lead reviews the resulting command.

### QA correction 04 and pure-data check outcome

Actual `handoff_dda3b90d4fb1c1ef5371fd6c0317239f` delivers `937788d`; subsequent
`handoff_79603b4e0455f0751e653ebddd5d81d5` corrects only review-count prose at
`a46d497`. Source, pins and execution results are unchanged. QA reports R1–R5
corrections, one shared exact-overlay predicate in checker/runner, display binding
and agreement with main's admission record. Author results are 33 offline checks,
three scripts parsed and six literal C# blocks compiled; these do not execute
native window checks and are not independently inherited passes.

Support's existing task is the exact `937788d` changed-boundary review via
`handoff_981cd2ed93608575ff5c842feea1a89f` (accepted; final verdict pending), covering
ledger/Stop/watcher/typed receipts and checker/runner composition. No whole
campaign or real action was assigned. Candidate 04's wrapper remains gated.

Lead read the complete 71-line composed pure fixture checker and synthetic JSON,
then dispatched one ordinary offline execution as `handoff_709b36d599e63812ff2ac13dfcde75c1`.
Actual `handoff_2dc78deb7b6d2bf22ed6e64be8c7ed44` / QA `a58d583` reports Windows
`SecurityError / UnauthorizedAccess`: running scripts is disabled for the exact
`-NoProfile -NonInteractive -File` command. Exit 1, empty stdout, zero fixture
cases executed; owned staging removed. This was an OS policy refusal, not an
AgentsDock automatic-review denial or a consumed native/display test. The machine's
effective policy was not queried. No retry, inline substitute, alternate host or
policy change followed. Keep this optional pure-fixture result NOT_RUN; it does
not undo the actual parse/compile results or block independent package preparation.
No approval for a new command is presumed by this record.

The fixture inputs are pinned as `e09a7a942a3ef22fe2644f0b6dfcd2eadc6b0f7dccf837037b762b583c16729f`
(script) and `6a513c5bd0062b0a17d88038ef882abb62c765e521fbbfbd2f87098392607bc3`
(JSON). All native overlay/affinity/stdin/timing behavior remains unverified.

### Exact-build continuation dispatched

After ordinary push of `194986d`, QA received the next existing-card preparation in
`handoff_1345f6e5e40879b62b1c1d0dbb85512c` (accepted, initially unread and
execution_started=false). It prepares candidate 05 and inactive pins against the
81-file `0ff325b` stage, preserving candidates 01–04. Mechanical preparation may
continue while Support finishes the unchanged driver review. No native runner,
checker, fixture retry or allocation was assigned; only changed generator/hash
consistency and inactive/mismatched-allocation refusal are in scope. Actual
adoption and any later execution must have their own evidence.

Read-only Support worktree status shows new `nonvoice-live-937788d-review-20261009`
and two matching boundary/ledger probe files. This establishes preparation
activity, not a completed review or passing result; unfinished files were not
modified by Lead.

### Independent correction-04 verdict and same-task repair

Actual `handoff_18efe6273ef8cda939acd76033541f95` delivers Support `c2ee58a`,
now integrated as `cc3402d`: [complete report and evidence](../../../support/nonvoice-live-937788d-review-20261009/README.md).
Lead read the report, both probes and affected production/QA source. Ninety
stored source hashes match exact Git objects. The 27 synthetic scenarios comprise
8 controls, 15 corrected negative checks, 3 remaining counterexamples and one
coverage observation. Source-only native findings are distinct from executed
Node witnesses; no native test or product/provider leak is claimed.

| Remaining finding | Required correction, same QA owner |
| --- | --- |
| F3-A, P1 | Reject failed/zero stack-owner reads and validate matched owner/class, preserving HWND binding. |
| F3-B, P2 | Apply the bound point predicate even when NAV hit-tests Edge; recheck overlay state after final Edge re-resolution. |
| F3-C, P1 | Bind all phases to the arm's capture and retain actual capture-folder identity in main-record collection. |
| F3-D, P2 | Refuse contradictory main allow/denied/reason fields before reconciliation. |
| R3-A, P2 | Require known same-session linkage for successful Stop mechanics; keep genuinely unknown provider submission distinct. |

**Lead coverage decision:** the previous send-only subset check is correctly
implemented to its old description, but is insufficient for the claimed complete
trace. Require capture-scoped ordered/multiplicity-aware correspondence in both
directions for every allowed arm/pre/post/send using fields the writers actually
record. Do not add a production protocol field to repair QA's collection. Require
observed checker termination for that capture and truthful exit status before
claiming lifecycle release. Missing, duplicated, contradictory or unobserved
records remain incomplete/unknown; they do not grant extra attempts or establish
a product defect. This is test evidence completeness, not a new product requirement.

Amendment `handoff_fd7cc02d2c0bdd337d6210cbcac304a9` is accepted, initially unread
with execution_started=false. It folds these corrections into the candidate05
preparation already dispatched, retaining any work and the exact `0ff325b` stage.
QA runs only relevant offline controls/counterexamples; no full campaign or
PowerShell fixture retry is assigned. Support returns idle until the corrected
source is delivered, then independently retests these changed boundaries.
Real actions remain **0/4**, old diagnostic **3/3 closed**, no resource lease.

### Candidate 05 delivered; exact package and static validation

Actual `handoff_7baa8e8fe4cdefc05ace4d0d424efbc8` delivers QA `df536b8`, on
`a58d583`. Lead read the full report and changed generator, wrapper, ledger,
predicate, stage verifier and allocation template. [Exact checks and receipts](candidate05-review.json)
record 32 matched artifact/source pins and a successful exact-source candidate
regeneration. Both the inactive template and wrong-product allocation are refused
by the real exported validator; its execution function was never called. Node had
no write or child-process capability. Candidate scratch is still unused.

Candidate05 pins product `0ff325b`, all 81 staged files and its unchanged connector
configuration. `services/` and `packages/` equal the older 52be105 copy. The actual
exported `CONNECTOR.commit` is `0ff325b`; only the copy directory's label remains
52be105. The saved inactive template still has the old commit and needs correction.
The owner separately reports the 280-file comparison to 0ff325b. No account state or inference is inferred
from that static comparison. The candidate has 63 steps, a prepared 600-second
outer bound and an inactive allocation template; none is an execution release.

Existing Support retest `handoff_aadbc5026bd6f0ad59ea27d32cb6ea18` is accepted,
initially unread/execution_started=false. It covers the five specific corrections
and directly changed complete-trace/lifecycle paths only, with positive and
negative controls. Author 34/34 results are not inherited independent acceptance.

The required check of changed PowerShell/C# bytes was assigned to QA in
`handoff_42053bfccd6885bbee9fe5b3ee7a3d23`. Actual result
`handoff_601bf879adf9776101253329ec0ee27d`, evidence commit `565bc3d`, reports
both exact candidate scripts parsed with zero errors and the one changed C# block
compiled to a DLL; five unchanged blocks were not repeated. Lead read the check
script and structured output. No runner/checker top-level script, fixture or native
method was called. This does not retry the earlier refused pure-fixture command,
which remains NOT_RUN; no script policy changed. The temporary staging was removed.

Lead retains final command/allocation review after the independent verdict. The
prepared runner and child checker use process-only RemoteSigned; previous
AI-disabled approvals are not automatically a real-subscription execution release.
Display, current managed sign-in/lock, actual overlay affinity/stdin/timing and
provider response remain runtime dependencies. Real0/4, diagnostic3/3closed, no lease.

### Candidate05 independent verdict and final narrow correction

Actual `handoff_241caeca474e0a08310b461c9b222ef0` delivers Support
`b93fc60fa0237b08ef83ba125c3f646dc2bb3904`, integrated as `4717a00`.
[Report and independent synthetic evidence](../../../support/nonvoice-live-df536b8-retest-20261009/README.md)
close F3-A/B/C/D and R3-A on exact `df536b8`. Lead verified all 83 stored source
hashes and the probe hash against Git objects. The recorded 25 scenarios were
reviewed, not rerun or counted as native/product acceptance.

One P2 remains: inserting an earlier EOF before more decisions and the final EOF
still produces `checker_released=true`. The actual checker exits after its first
EOF. Require exactly one terminal EOF and keep the existing request-count check;
do not impose an unsupported main-process close-event ordering rule. The same
owner also fixes the inactive template's connector commit to the real exported
`0ff325b`, without changing the identical copy bytes or the historical path label.
Support preserved its first synthetic gate-fixture failure from that mismatch;
Lead's previous checks asserted only negative allocation cases, not a valid
active-shaped positive.

Same-task correction `handoff_830791faa9be1e46c34d5e72a72d1394` is accepted,
initially unread/execution_started=false. QA changes only this lifecycle guard,
the stale template metadata and necessary mechanical pins. Lead independently
checks the ordinary EOF control, the reported counterexample and corrected pin
shape, then integrates. No repeated 25/34-case campaign, unchanged compilation,
PowerShell fixture retry or new native run is assigned. Support is idle/on demand.
Real actions **0/4**, diagnostic **3/3 closed**, all resource leases remain absent.

### Candidate06 integrated and exact command prepared

Actual delivery `handoff_c87248cccee2984d245e6febaa91cc0a` supplies
`5bdbc1d54bdf0dcf1f061f545c005c26456b9a76`. Its EOF guard requires exactly one
terminal event and retains the count check. The fresh inactive template matches
the exported `0ff325b` connector commit; candidates01–05 remain historical.
The nine reviewed QA commits integrate without conflict through `5ba6f50`; the
integrated QA source/evidence paths are byte-identical to the delivered branch.

[Lead's exact review](candidate06-review.json) and [independent three-case result](candidate06-eof-result.json)
confirm the ordinary EOF passes and both early/duplicate EOF traces fail. The
[actual template-validator result](candidate06-template-result.json) refuses the
saved inactive template and old connector pin, while accepting the corrected
shape only in synthetic memory. Exact candidate regeneration also passes; scratch
is unused. Node had read-only file grants, no child-process or write grants.
No unchanged full suite, compilation or refused PowerShell fixture was repeated.

[Prepared command review](candidate06-command-review.json) pins candidate
`288191f7…`, wrapper `3ca43f76…`, the unchanged runner `2fbb5eb3…` and checker
`9637db61…`. It reuses the staged 81-file product and production UI handlers for
four bounded actions: observation, automatic circle focus, typed follow-up after
a generated screen change, and Stop. The test session is 60 seconds; the whole
native setup/test/close sequence has a 600-second bound, followed only by bounded
owned cleanup. Latency may leave later actions NOT_RUN. No retry, audio, microphone,
Talk/TTS, private screen, account/model change or separate billing is included.

The [reviewed draft](candidate06-allocation.draft.json) is **inactive**, with no
validity window or resource lease. The previous explicit human `RemoteSigned`
approvals were for the 140-second AI-disabled diagnostic. The remaining concrete
decision is the process-only script scope for this distinct live runner and the
checker started by the product; existing generated-content subscription-test
authorization is retained. Windows' earlier actual policy refusal remains
recorded, not bypassed by retrying that fixture or calling this source review an
execution result. After that scope is confirmed, Lead releases a fresh timed
display/account allocation to the same QA owner for normal tool review and one
attempt. Current login/lock/display conditions are checked then, not assumed from
old evidence. Real actions **0/4**; diagnostic **3/3 closed**; no active resource lease.

The current QA owner received this exact next action at pushed `22de201` in
`handoff_779938e612ae9d5987985b4aa24bcfde` (accepted, initially unread and not
executing). No acknowledgement or repeated preparation is requested. Source and
authored-document `git diff --check` passes; the full QA integration additionally
reports 97 whitespace lines in ten preserved raw test/Windows output files.
Those original evidence bytes were retained, not reformatted into a claimed
clean raw-output check; details are in `candidate06-review.json`.
