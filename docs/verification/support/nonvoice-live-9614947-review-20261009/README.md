# Candidate 03 changed-boundary review — HOLD

2026-10-09, 07 Support. Assignment: `handoff_26fac298197c97826e4184e71ff22557`.
This reviews the F1/F3–F6 and receipt-reader changes, not the whole product.

**Keep the changed boundaries on HOLD.** F1 is corrected, and several earlier
evidence failures now have explicit rejection terms. Remaining count, phase,
watcher and malformed-receipt cases are below. The exact-overlay integration
also remains unfinished. `interlockProduction = null` correctly refuses this
interim candidate and must remain in place; it is not a defect to work around.

| Object | Exact identity |
| --- | --- |
| QA | `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b` |
| Prior correction | `e0bd4b37dc788a766ed3f6fe86602f556b04d4cd` |
| Lead interface/decisions | `4f7d9fa8f79c05d31cbd8e04b5b1e6707477c085` |
| Actual production consumers | `52be105a148a28e677f83cc4b7077665f2ff372c` |
| Support starting HEAD / branch | `38230e1f63c4c3dcbdf28b03c07520db9ea8206d` / `team/support` |
| Candidate JSON | `db83ff5c52bbbdef4d4fb361522c4a2d2b8168fab7face4805efb4ba30bd3df6` |
| Runner | `4f3fe4d3a09d4b1dd1f530d659a2974b4e0142686ca027612756fff6c9f0473f` |
| Checker | `920255cf6b610abbbe43a5f90cc5c637f5548cfff36c3ccf302746fd05e5d447` |
| Wrapper | `ddbd65f80720f5cb109906e4d01aa3f3dd93c40f2beac8519fa7fd645c83d2cd` |

Read the full exact `driver-nonvoice-03/README.md` and Lead's full current driver
review/checker interface, changed source, and relevant production consumers.
The revision check found no changes to AGENTS/TEAM, role, workflow or applicable
requirement documents since the preceding review. PONYTAIL LITE and ultra remain
unchanged. The worktree was clean on entry; no production edits or branch merge.

## Corrected boundaries

- **F1:** `qa_live_candidate.mjs:154–164` now selects the applicable Codex/model
  bucket, including the single unnamed fallback, as production
  `chatgpt_rpc.py:804–816` does. Four independent exact-step VM cases verify
  unrelated restrictions do not veto, included exhaustion is not a veto, and
  applicable spend/workspace controls cannot borrow another bucket's credits.
  These use synthetic quota data, not an actual account read.
- **Execution gate:** `qa_run_live_candidate.mjs:47–54,116` refuses the default
  allocation path while the production interlock pin is null. Independently
  exercised without supplying an override or invoking the execution wrapper.
- Source now rejects `collect_errors`, unreadable JSONL, absent request IDs,
  fourth-action tool items and receipt digest/explicit-binary mismatch; uncertain
  receipts remain unknown. This source inspection does not inherit the author's
  30/30 or 77/77 counts. Remaining holes in the new reconciliation are below.
- The reader now checks static ancestor resolution, rejects symlinked launch
  directories, uses `O_NOFOLLOW`, validates regular/single-link/bounded files,
  matches request identity/key sets, and excludes pre-existing launch folders.
  Raw receipts are outside Git; the ordinary well-formed projection removes
  top-level provider IDs. Typed values still need validation (R5).

Paths abbreviated below are under `tests/e2e/windows` at the exact QA SHA.

## Remaining concrete findings

### R1 — P1: a malformed extra request can disappear from the action ledger

`qa_live_ledger.mjs:84–89` includes only `focus` and `text_followup` requests.
The new completeness check at 120–122 requires only that a request have a string
ID. An additional `{request_id, submission:'unknown', outcome:...}` without a
recognized trigger therefore leaves `records_complete:true`, four attempts and
no extras. The independent witness receives full mechanical success.

Every observed request must either be classified/countable or make the evidence
incomplete; an unknown trigger is not proof that no action occurred. Validate
the current production record vocabulary and preserve conservative unknowns.

### R2 — P1: global cumulative totals hide unexplained or inconsistent attempts

`qa_live_ledger.mjs:113–119` correctly avoids summing repeated cumulative counts,
but tests only a global lower/upper bound. Two independent cases pass mechanics:

- Three acknowledged requests plus a fourth consistently proven unsent, with
  a cumulative turn count of four. The extra published attempt is unexplained
  but charged against the four assigned-action slots.
- Launch A contains three acknowledged requests but maximum count two; launch B
  has only the proven-unsent request but count one. The aggregate of three
  conceals both inconsistent launch histories.

At production `chatgpt_rpc.py:303–312`, the counter increments after
`stdin.write(encoded)`, before drain. Cancellation/failure after publishing stays
uncertain (`:313–324`); this counter is not proof of provider processing or
billing. It does mean an unexplained published attempt cannot be assigned to a
request consistently proven unsent. Reconcile each launch's request/status/count
history first, then total maxima; account separately for any unknown or extra
attempt. The valid one-launch and two-launch cumulative controls both pass.

### R3 — P2: Stop classification still drops conflicting or absent phase evidence

`qa_live_ledger.mjs:197` takes only the first matching settlement. A later
settlement contradicting it is ignored. Lines 198–200 also discard absent phases;
without a receipt and with no settlement phase, the ask's `not_submitted` alone
becomes `fenced_before_submission`. Both independent cases pass full mechanics.

Reconcile all matching records and their capture/session/request identities.
Missing evidence is unknown, and a second contradictory terminal record cannot
silently disappear. A genuinely unsent request need not have a receipt, but its
other required evidence must affirm that classification.

### R4 — P1/P2: watcher readiness and lifecycle order remain insufficient

`startWatch` records exit/error at wrapper 218–220, but readiness at 227–234 is
based only on finding the start line. The caller tests only `watch.ready.ready`
at 149–150. A synthetic already-exited watcher still returns `ready:true` and
`state.exited:true`. The source path can consequently advance to launch without
a functioning mandatory watcher. Check the owned watcher state at admission and
preserve loss of coverage as unknown; this does not grant new signalling authority.

Separately, `watchSummary:256–265` compares sets of appearances and exits without
ordering them. An exit-before-appearance log returns `released`. That witness
targets the release classifier, not an entire mechanical-pass fixture. Validate
one ordered lifecycle with usable identities, rather than membership alone.

### R5 — P2: exact receipt keys do not make the public projection typed

`readOwnReceipts:351–355` validates JSON object, format, request ID and key set,
but not field value types. A receipt with `actual_model` replaced by an object
containing synthetic `thread_id`/`turn_id` is admitted and placed in the raw-copy
list. `sanitizeReceipts:300–303` then copies that object intact into a field
allowed in public evidence. The independent in-memory reader/projection probe
reproduces this; a well-formed receipt and wrong-request control behave correctly.

Validate receipt values against the existing writer's bounded schema before
admitting/copying, and project typed scalar/list values. The real production
writer rejects this malformed metadata (`chatgpt_receipts.py:68–101`), so this is
a malformed-input boundary defect, **not an observed private-data disclosure**.
No actual receipt or private state was read by the probe.

## F3: exact-overlay exception and remaining composition

The proposed narrow exception can preserve the source protections **if its
positive identity/exclusion/stacking premises are all checked**. A general
same-PID/title allowance cannot. The current bytes do not implement it:

- Saved `admission-checker.ps1:546,553,559` requires Edge foreground and all
  roots equal Edge. Production `overlay.ts:1351–1363` and
  `main.ts:2023–2027` can make the full-display overlay interactive. If native
  observations return that overlay as root/foreground, the current predicate
  necessarily denies and latches. Source does not establish the actual hit result
  and acquisition timing on this machine; do not claim an executed ASK failure.
- Frozen context contains only pre-launch Edge/display identity
  (`qa_live_candidate.mjs:297–305`; checker template 63–74). It cannot establish
  which product HWND belongs to the current capture. Coordinate a trusted,
  immutable current-main/runner binding with Web: launch PID/creation identity,
  exact overlay HWND and capture/lifecycle identity. Recreated, missing or
  ambiguous windows deny; finding any matching title in the process is inadequate.
- Validate that exact overlay's current owner, expected full bounds, title/class,
  visibility/topmost state and **positive** capture exclusion before ignoring it.
  Read success and `WDA_EXCLUDEFROMCAPTURE` matter; `WDA_MONITOR`, an unreadable
  affinity, or the mere presence of `setContentProtection(true)` in source does
  not establish omission from capture. Microsoft distinguishes omitted windows
  from content-blanked windows, and documents the conditions for a successful
  read. This is an API-based design inference, not device verification.
  [GetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowdisplayaffinity),
  [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).
- Permit foreground only for exact Edge or that proven current overlay. At each
  required point, a bounded read-only stacking check must reach exact Edge after
  excluding **only** that overlay; any intervening/unknown covering root denies,
  including the product control window. Do not move, hide, disable or raise the
  overlay to perform the check. Native point hit-testing alone is not a complete
  visual-stack proof: `WindowFromPoint` omits hidden/disabled windows, while
  `GetWindow` returns a z-order relation rather than a capture-pixel guarantee.
  Unknown coverage should fail conservatively, not expand a whitelist.
  [WindowFromPoint](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-windowfrompoint),
  [GetWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindow).
- Apply the one reviewed predicate consistently to foreground and all point
  consumers. Runner `onTop:1270–1286` performs **both** `Assert-QaEdgePoints` and
  another PID-at-point rejection. Changing only the checker would leave that
  independent rejection in place. Keep Edge URL/token/process creation/handle,
  exact browser/native geometry, normal-band and display/DPI checks, including
  their final revalidation. NAV click-through is not a substitute for verifying
  the overlay's exclusion and identity.

Focused owner cases should cover exact eligible overlay, ordinary NAV/Edge,
same-PID wrong HWND, title-only match, changed creation/capture identity,
missing/monitor-only exclusion, control/foreign intervening windows, wrong
foreground, bounds/DPI change, and unreadable metadata. These are proposed
repair checks, not tests executed in this review. The already disclosed race
between native observations remains; no compositor-atomicity claim is added.

Checker source otherwise preserves exact-field echo excluding `sent_at`, strict
phase/ID/sequence checks, acquisition/send lineage, replay refusal, denial
latching and log-before-answer (`qa_admission_checker.ps1:82–125,176–233`). The
emitted DPI-awareness statement is present at line 117. Source presence is not
PowerShell parsing/compilation, measured DPI correctness or latency evidence.
Windows JSON echo, actual stacking/exclusion, checker disposal and the final Web
client composition still need their separately reviewed build and evidence.

## Independent verification actually performed

Only changed failure cases were executed. No authored suite or mutation campaign
was replayed; **30/30 and 77/77 remain author-reported, not Support results**.

| Probe | Actual result |
| --- | --- |
| [Boundary probe](../../../../tests/probes/support/nonvoice_live_9614947_boundaries.mjs) | 11 asserted scenarios: 8 controls, 3 reproduced defects; exit 0. [Output](boundaries.json), [empty stderr](boundaries.stderr). |
| [Ledger probe](../../../../tests/probes/support/nonvoice_live_9614947_ledger_witness.mjs) | 2 positive controls, 6 negative inputs; 5 negatives incorrectly passed mechanics; exit 0. [Output](ledger-witness.stdout.jsonl), [execution and source detail](ledger-review.md). |

The sixth ledger negative (app says unsent, receipt says sent, missing source-send
decision) was rejected by `ceiling_ok`, despite `source_bound:true`. It is **not**
reported as a full-verdict bypass. Probe exit 0 means the bounded probe completed;
it does not mean these defective classifications or the product passed acceptance.

Both scripts ran once under Node 24.21.0 `--permission`, permitting reads only of
the exact export and their own script; no Node child-process or write grant.
Shell redirection saved synthetic public results in Support paths. For the boundary
probe, from this worktree:

```sh
NODE=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node
"$NODE" --permission --allow-fs-read=/tmp/support-live-9614947-vdt2ebrh \
  --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/nonvoice_live_9614947_boundaries.mjs \
  tests/probes/support/nonvoice_live_9614947_boundaries.mjs /tmp/support-live-9614947-vdt2ebrh
```

All 17 source pins and six payload pins matched the immutable Git export; see
[pins.json](pins.json). No Windows/PowerShell, display/capture/input, account,
provider, microphone/audio/TTS, checker latency, actual receipt/copy mutation,
dependencies or consumed diagnostic suites were used. Production remains 52be105;
real actions remain 0/4, and the diagnostic remains 3/3 consumed and closed.

QA owns these remaining checker/driver/reader/evidence repairs. Web retains its
pending interlock. Lead coordinates their trusted overlay binding, reviews the
final exact app/checker composition and regenerated candidate, then determines
command/resource release. This completes the one changed-boundary review and
does not authorize execution or claim product acceptance.
