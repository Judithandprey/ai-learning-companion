# Nonvoice live candidate review — HOLD

2026-10-09. Owner: 07 Support. This is the bounded P0-13 source/candidate review
requested in `handoff_dc6421e3ff2c4836f05f61dcab7e7985`, including Lead's quota
and unknown-Start follow-ups `handoff_fb44203404280d9a4fd32c784dffafea` and
`handoff_fce330fb271a3ba94ee8589bd7a03ad2`.

**Do not release this exact candidate for live execution.** Its authored 20-test
suite passes, but the driver can reject usable ordinary-credit cases, undercount
an unknown Start, and report success with incomplete or contradictory evidence.
The findings below concern the QA candidate; they do not demonstrate a product
or account refusal, an actual extra provider request, or an actual process leak.

| Reviewed object | Exact identity |
| --- | --- |
| QA source | `b8f0d9c23a0091c76fd2def239f445d1b8d04854` |
| Lead baseline | `df8859ccc856f64b3e20b5c6deff291ce18f3356` |
| Production consumers | `52be105a148a28e677f83cc4b7077665f2ff372c` |
| Production 77-file stage tree, declared pin | `531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669` |
| Support starting HEAD / branch | `184f712d79fe3a98fd94db7339440a9070f01755` / `team/support` |
| Candidate JSON | `694a1acccc6b572fecb9c1516dd8bfd1b5fc744232a9a5a4cb98bab1e456af3b` |
| Saved runner | `f372426256ab31d243dbea1a0bf8fa05a9af20d0bc4ae3e367f622af93a807be` |
| Saved 62-step plan | `535bb56e32512177db30361925f797642e0c64b9902c8b7e73818d06d1ec154c` |
| Saved surface | `be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067` |
| Saved connector configuration | `4729ca1a25ec09a64349c68c5ccb0eb41b4e9f83e161fb9c4a29b0ce26b948d4` |
| Execution wrapper | `aaa85a7b139acaa113ebd734bff28ab11b64d63d44d8bbc179801e3b2bff8206` |

The full `driver-nonvoice-01/README.md`, saved candidate and six new source files
were read at the exact QA commit. Actual production capture, live submission,
presentation, connector launch and receipt consumers were read at the production
commit. AGENTS/TEAM, Support role, workflow and affected current decisions/
original-goal clauses had been refreshed; the revision comparison to this Lead
baseline found no changes to those applicable documents. PONYTAIL LITE and ultra
remain unchanged. No branch merge or production edit was needed for these reads.

## Required corrections

Paths starting `qa_` below are under `tests/e2e/windows/` at the QA SHA above;
production paths are explicitly marked. Line numbers refer to those Git objects.

### F1 — P1: included-window exhaustion is wrongly a Start veto

`qa_live_candidate.mjs:135–143`, especially line 140, rejects
`ordinary_usage_allowed === false`, any truthy `rate_limit_reached_type`, or any
window's spend restriction without selecting the applicable model/limit bucket.
This reinstates the included-window/ordinary-credit conflation that the current
production path deliberately avoids.

Production `services/worker/connectors/chatgpt_rpc.py:807–816` selects applicable
Codex/model windows and preserves the applicable spend/workspace restriction;
neither included-usage flags nor a balance decides whether an explicit request
may be attempted. QA must follow that distinction, without treating a positive
credit balance as permission to override an applicable spend restriction.

Lead already executed the actual saved `account_ready` expression against four
synthetic quota cases. Support read the resulting
`docs/verification/lead/live-windows/nonvoice-driver-review/quota-probe.json`:
both included-exhausted cases with `windows[].credits.has_credits:true` were
rejected; unknown quota was allowed; spend-control reached was rejected. This
was not rerun. It is driver evidence, not a read of the current account balance.

### F2 — P1: a reached Start with missing evidence returns reusable capacity

`qa_live_ledger.mjs:69–72` assigns the first slot only from a `started` record or
successful `live_policy` step. It ignores the earlier `capture_start` attempt.
An invoked Start whose later records are lost therefore yields `NOT_RUN`,
`attempts_used:0`, `attempts_remaining:4`, `start_attempts:0` (lines 82,106–108).

Lead's actual-function probe covers both a successful Start-step result and an
ambiguous failed/lost result. Support read its saved
`docs/verification/lead/live-windows/nonvoice-driver-review/unknown-start-probe.json`;
both returned the zero-use ledger above. No duplicate execution was needed.
Preserve an uncertain trigger as unknown and conservatively consumed unless
evidence proves it stopped before acting. A later operator must not interpret
missing records as four unused actions. The current wrapper does not itself
retry, but that does not make the reported remaining capacity correct.

### F3 — P1: in-session source checks lose the exact coverage guard

The saved runner calls `Assert-QaSurfaceAdmission` only before product launch
and immediately before the Start expression (runner lines 340,1052–1059).
That full check requires fresh exact browser geometry and native Edge bounds
`0,0,2560,1600`, before and after the point checks
(`qa_display_admission.ps1:166–195`).

After Start, `liveSteps` uses `onTop` before actions 2–4
(`qa_live_candidate.mjs:171,179,182`). The corresponding runner path
1250–1266 checks point roots/PIDs and calls `Assert-QaEdgePoints`.
`qa_edge_placement.ps1:73–79,141–150` verifies identity, normal window band,
16 point hits and unchanged display topology. It records Edge bounds but does
not compare them to the admitted full-display bounds or redo full browser
geometry. A window shortened to `2560×1599` still contains all required points
(largest y is 1580). With the same owner and point hits, these predicates cannot
reject the uncovered strip; the original exact coverage predicate would reject it.
This is a source-level counterexample, not a new native resize experiment.

Production starts the live session while the capture overlay is being opened
(`apps/windows/src/main/main.ts:180–246`), retains frames and automatically sends
the first observation (`:728–770,1012–1051`). Focus completion also triggers a
request (`:1208–1236`); typed follow-ups read a frame and submit it
(`:1254–1334`). These paths do not call the QA Edge admission gate. The candidate's
frame-after-change wait even acquires its frame before the next `onTop` step
(`qa_live_candidate.mjs:176–180`). Display topology guards do not detect a change
to the source window's coverage.

Before release, QA must account for admitted-source lifetime and revalidate the
required exact geometry/ownership for the frames actually used by the automatic
and requested paths. Preserve the full guard; do not replace it with the weaker
16-point check or describe the earlier AI-disabled diagnostic as proof of live
coverage. Lead owns any necessary cross-owner change. This finding does not claim
an atomic screen guarantee or revoke the previously documented residual race.

### F4 — P1: collection and receipt anomalies can still pass

`qa_run_live_candidate.mjs:213` checks only `collect_failed`; failures caught into
`collect_errors` at 257,275,280 do not affect success. At line 218 it checks tool
items only for the first three slots. The ledger records the Codex digest and
turn counts (`qa_live_ledger.mjs:55–59`) but the verdict does not enforce them or
reconcile receipt turn counts with the four-action bound (`:100–108`).

One independent in-memory execution reproduced successful mechanical verdicts
with each of: a collection error; fourth-turn `commandExecution`; slot-two
Codex digest mismatch; and a receipt reporting five provider turns while the
ledger reports four actions. Product `chatgpt_rpc.py:290–312` increments that
counter on `turn/start`, not ordinary status calls. These synthetic cases expose
missing checks; no extra actual turn/tool call was observed.

Require complete collection and valid relevant receipt facts for every action,
including the Stop attempt. Reconcile owned-launch/request identity and cumulative
turn evidence without summing repeated cumulative counters. Malformed JSONL is
also currently reduced to `unreadable_line` (`qa_live_ledger.mjs:23`) without a
failure term; incomplete evidence must remain unknown rather than silently green.

### F5 — P1: an empty watcher can certify connector release

`qa_run_live_candidate.mjs:157–161` starts the watcher without a readiness
handshake. `watchSummary` at 195–203 classifies any readable empty `watch_end`
as `released`, even with zero appearances or no start record. The fallback at
179 checks only processes whose working directory is inside the connector copy;
Codex runs elsewhere. `qa_sub_watch.py:43–59` retains a reparented descendant
only if it was observed while related to the tracked tree.

The focused watcher probe reproduced two false release classifications: a
start/end log observing no process, and an end-only log. Two lifecycle controls
behaved as expected. No real process was inspected or signalled. A complete run
with actual provider receipts needs observed, correlated lifecycle evidence;
an unobserved/missed chain is unknown. Establish watcher readiness and make the
release claim conditional on sufficient evidence, preserving exact-owned cleanup
and the no-unowned-signalling rule.

### F6 — P2: submission and Stop-phase claims discard uncertainty

`qa_live_ledger.mjs:53–59` reports an `uncertain` receipt as
`inputs prepared; not submitted (uncertain)`. Production intentionally writes
`uncertain` before publishing bytes and preserves it on ambiguous write/cancel
paths (`chatgpt_rpc.py:290–324`). It must remain submission unknown.

`fenceVerdict` checks only that a matching settled line exists (line 121), then
chooses before-submission/in-flight from the ask record alone (132). The witness
reports `fenced_in_flight` and mechanically passes when the ask says submitted
but the receipt and settled line both say not submitted. Reconcile available
evidence; conflicting phase facts cannot prove an in-flight provider fence.
The product's late-presentation protections were read, but no live disclosure
failure was demonstrated. A genuinely unsent attempt need not have a receipt.

## Other checked boundaries and unresolved runtime evidence

- Null `state_dir` is compatible with the product-managed identity path:
  `subscription.ts:235–246`, `capture-host.ts:91–95`, and
  `chatgpt_launch.py:197–207,293–335` pass the explicit binary override and select
  the persistent product-managed state. The intended WSL user's home must be
  `/home/agentsdock` for the wrapper's hardcoded receipt root to match. No auth
  state, real account, actual binary or live home was opened in this review.
  The candidate pins 0.158.0 digest
  `167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
- Normal production ask and observation records explicitly exclude provider
  thread/turn IDs (`main.ts:1394–1401,1050–1056`); ledger projection also omits them.
  Raw receipts are copied to `private/receipts`. No normal-flow public-ID leak
  was established. Reader hardening remains: wrapper 88–90 checks only the final
  file, and 264–272 follows ancestor directories and copies bytes before receipt
  identity validation. Its own-request-only boundary should validate containment
  and identity before copying; no symlink or escaped read was observed here.
- The card remains visible before action 3/4 `onTop`. This is **unverified**, not
  a deterministic blocker established by source. `overlay.ts:1140–1141` shows
  the card and restores NAV; `:1351–1363` initially makes NAV click-through, then
  pointer location can change interactivity. Actual card bounds depend on content
  and work area. Neither guaranteed point-check success nor guaranteed occlusion
  follows from card visibility. Resolve through the later authorized path's actual
  card bounds, interactive state and root-point evidence. Do not hide the issue
  by weakening ownership checks or closing the selection needed for follow-ups.
- The driver uses DOM values/events/clicks and CDP pen input. This is not physical
  pen/OS typing evidence. Hint semantics, the 60-second execution opportunity,
  Stop-before-send versus Stop-in-flight, and D1–D10 remain Lead engineering
  decisions. A `NOT_RUN` later action cannot become acceptance by inference.

## Actual verification and limits

- Exact QA export: `/tmp/support-live-b8f0d9c-f9zpt0tl`. All 16 source manifest
  hashes matched; see [source-pins.json](source-pins.json). Candidate/payload hashes
  above were recomputed. The physical stage/copy was not re-admitted or changed.
- New authored suite: **20/20**, zero failures/skips, exit 0; actual output
  [driver-checks.txt](driver-checks.txt), empty [stderr](driver-checks.stderr).
  It ran once at 07:15:39–07:15:40 UTC with Node 24.21.0 directly in permission
  mode, granting only the immutable export and narrow scratch-name reads, with
  no Node child-process/write permission:

  ```sh
  NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
  "$NODE" --permission --allow-fs-read=/tmp/support-live-b8f0d9c-f9zpt0tl \
    '--allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-*' \
    tests/e2e/windows/test_qa_live_candidate.mjs
  ```

- Independent receipt witness: **one control and six counterexamples**, seven
  output records, exit 0. These are observations, not an assertion-test pass
  count. See [execution record and detailed findings](receipt-witness.md),
  [actual stdout](receipt-witness.stdout.jsonl), and
  [saved script](../../../../tests/probes/support/nonvoice_live_b8f0d9c_receipt_witness.py).
- Independent watcher witness: **four asserted classifications, including two
  reproduced defects**, exit 0. See [actual output](watch-probe.json) and
  [probe](../../../../tests/probes/support/nonvoice_live_watch_b8f0d9c.mjs).
  Execute that script with Node `--permission`, read grants for the script and
  immutable export, and the export directory as its sole argument. It evaluates
  the exact hash-pinned pure classifier; it never launches the wrapper.
- Lead's existing quota and unknown-Start probes were read and attributed, not
  rerun or counted as Support executions. No unchanged full campaigns, old
  consumed-scratch wrapper suite, native parse, Windows/display/capture/input,
  account/provider, microphone/audio/TTS, connector-copy mutation or dependency
  installation occurred. The prior diagnostic's 3/3 budget remains closed and
  the display remains released; this review creates no new execution allocation.

QA owns the narrow driver/ledger/wrapper corrections and changed-boundary tests.
Lead should consolidate them with D1–D10, then supply the exact revised candidate
for review before deciding the command/resource release. This completes the one
bounded review; no production acceptance or real-device pass is claimed.
