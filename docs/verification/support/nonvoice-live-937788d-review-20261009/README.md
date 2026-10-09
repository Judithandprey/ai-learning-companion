# Candidate 04 correction review — HOLD

2026-10-09, 07 Support. Assignment: `handoff_981cd2ed93608575ff5c842feea1a89f`.

**Keep this correction on HOLD.** The selected prior R1/R2/R4/R5 witnesses are
corrected. R3 still permits missing Stop-session identity, and the F3 composition
has two native-source gaps plus two evidence-validation gaps. These findings do
not establish an observed capture leak or provider call.

The interim candidate still pins production `52be105` and
`interlockProduction = null`. Its default allocation validation refuses, as it
must. This review cannot release the candidate, stage a build, or grant a lease.
Real actions remain **0/4**; diagnostic **3/3 consumed and closed** is unchanged.

| Object | Exact identity |
| --- | --- |
| QA correction | `937788ded4e2bff1db8b94dce175a7152e01609d` |
| QA parent | `9614947fa2a3cfae3dd5e3d154011b3c6dbaa82b` |
| Prior Support R1–R5 review | `5083814d8fb096dc0b080282533f022903ce2efe` |
| Support starting HEAD | `fa786982f4b0b5624a5c30d21aafc5cb0dd9cb6d` |
| Branch / worktree | `team/support` / `/home/agentsdock/Projects/learning-companion/wt-support` |
| Main record contract read | `477890829c4afe880a151f3ce151b98b97405414` |
| Candidate JSON SHA256 | `4cb6032ef8eccea7306cdd624cf2e7846e04c07ca801145dba5490eb232c7410` |
| Runner SHA256 | `3adea4670487f84215608865be9eb569b80ad7070feec5a8fb7a166ab7abfc99` |
| Emitted checker SHA256 | `9b4b3537ec84d2beb54347c5132860c8a9755c6f28b69ab07dccc160f2d6e6e1` |
| Wrapper SHA256 | `3a537fa1df6b1b74311e3146ba7f3ec021d7b64291313d6b2d3504564a68487b` |

Read the full exact `driver-nonvoice-04/README.md`, affected source, and prior
Support report. AGENTS/TEAM, role, workflow and requirements have no delta from
QA `9614947` to this correction; PONYTAIL LITE and ultra remain unchanged. The
worktree was clean on entry. Main was read only to confirm existing record fields;
Lead owns the pending Web membership patch review. No Web retest was undertaken.

## Selected prior findings corrected

| Finding | Independent result and limit |
| --- | --- |
| R1 | An extra ask without a trigger and an orphan settlement now make the ledger fail. Source also preserves unknown kinds/request-ID gaps as incomplete. |
| R2 | The two valid cumulative-count controls still pass. An unexplained fourth turn on a proven-unsent slot and inconsistent separate launch histories now fail. Reconciliation uses each launch's maximum and distinct definitely published counts before totaling. |
| R3, partial | A later conflicting settlement, missing settlement phase without a receipt, and a different settlement session now fail mechanics. Missing ask-session identity remains below. |
| R4 | Already-exited watcher is refused. Prelaunch checks reject delivered exit, zombie, and missing own stat entry. Ordered lifecycle passes; exit-before-appearance, missing end and records after end stay unknown. All watcher I/O was injected memory, not actual process inspection. This verifies the selected classifiers and point-in-time prelaunch guard, not continuous native coverage. |
| R5 | Well-formed receipt projects without private top-level identifiers; wrong request ID is refused. A nested `actual_model` object is rejected before raw-copy admission and independently omitted from public projection. Source checks bounded writer fields before admission; production `52be105` writer was read only. No exhaustive schema-equivalence claim. |

## Remaining findings

Paths below are under `tests/e2e/windows` at QA `937788d` unless otherwise stated.

### F3-A — P1: the stack adapter discards an observed owner-read failure

`qa_overlay_predicate.ps1:124–126` calls `GetWindowThreadProcessId` but ignores its
return value and a zero PID. At `220–222`, the stack is projected to HWND strings;
`Get-QaStackFault:178–179` compares only that list with the bound overlay HWND.
Consequently, the expected HWND alone can pass even when this walk returned an
unreadable or different owner. The captured class/owner fields are only used to
describe an unexpected HWND.

The overlay was checked before the walk, and the checker checks it again at the
end. Those are useful checks, but do not turn an ignored intermediate read failure
into positive evidence. This is a source finding, not a native reproduction or a
demand for atomic desktop state. Reject failed/zero owner reads and verify that
the matched stack entry's owner/class still match the binding. Exercise the
adapter failure in the owner's bounded fixture check.

### F3-B — P2: the runner's final point pass skips the predicate in NAV

Emitted `candidate-nonvoice-04/runner.ps1:1544–1545` calls `Test-QaPointAdmitted`
only when `PidAt != Edge owner`. With normal click-through NAV, the reported PID
is Edge, so this final pass checks neither stack exclusion nor overlay affinity.
The earlier `Assert-QaEdgePoints` does run the full point checks, but its later
Edge re-resolution at `1271–1276` has no final overlay-state check.

Thus an earlier valid point pass can be followed by a final Edge PID observation
while a click-through covering window or changed overlay exclusion goes unchecked
at that final consumer. Apply the shared predicate unconditionally to each final
point when bound, and revalidate the overlay before accepting. Preserve the
strict unbound rule. The independent checker still gates acquisition/send;
this finding alone does not demonstrate a capture leak.

### F3-C — P1: source reconciliation joins records from different captures

`qa_live_ledger.mjs:182–192` joins pre-acquire, post-acquire and send by sample,
frame, hash and dimensions without checking `capture_id`. Main comparison at
`204` also omits it; collection at wrapper `464` flattens capture folders and
loses their identity.

Independent witness: change only the first post-acquire decision's capture from
`0123456789abcdef` to `fedcba9876543210`. The actual exported functions still
report `source_admission.all_bound:true` and full mechanical success. The checker
itself rejects a different capture at `qa_admission_checker.ps1:121` and writes
the field at `258`, so a combined or inconsistent trace must not count as valid
evidence. Require one arm capture through every linked phase and retain/check the
main record's capture-folder provenance. This targets QA evidence validation,
not a newly discovered Web runtime bypass.

### F3-D — P2: contradictory main verdict fields still agree

`qa_live_ledger.mjs:204–209` selects `allowed:true` and compares frame facts,
ignoring `denied` and `reason`. Setting one synthetic main send to
`allowed:true, denied:true, reason:'synthetic refusal'` leaves both main agreement
and full mechanics true. Actual main `4778908:apps/windows/src/main/main.ts:764`
writes these verdict fields together; an allow has `denied:false` and null reason.

Validate the actual main decision shape and reject contradictory verdicts before
comparing phase facts. This is a malformed-evidence witness, not a claim that main
has emitted such a record.

### R3-A — P2: missing Stop-session linkage still passes mechanics

Delete only the fourth ask's `live_session_id`, retaining its valid receipt and
the settlement/end session IDs. `qa_live_ledger.mjs:244–250` correctly reports
`session_identity:'unknown'` and `fenced_submission_unknown`, but wrapper
`326–327` accepts the clean receipt and any verdict beginning with `fenced`.
The independent full-mechanics witness therefore passes despite the missing link
between this ask and the stopped session.

Require the known same-session linkage for a successful fence judgment. Preserve
legitimate unknown **provider submission** when session linkage and the other
required evidence are complete; `fenced_submission_unknown` is not itself a bug.

### Coverage observation for Lead

A main log containing only its three valid sends also passes. This follows the
README's explicit subset algorithm (every main allow matches QA; every QA send
matches main). It is **not** claimed as a misimplementation of that stated rule
or an additional independent blocker. It does leave arm/pre/post and checker-end
coverage unproved in main when assessing this task's complete-phase evidence.
Lead should decide the required reverse coverage; avoid describing this subset
check as full trace equality.

## Positive F3 source findings and limits

The checker freezes the launched app PID/native creation identity, verifies its
parent PID, and binds the main-named HWND at arm. It retains immutable capture
binding, clears it on denied arm, and requires positive affinity 17 plus owner,
class/title, bounds, visibility/topmost/cloak and point-stack facts. The checker
revalidates overlay state at decision end (`qa_admission_checker.ps1:224–235`).
Runner obtains the binding from main session state and the accepted checker arm,
rather than title lookup. These improvements do not close the findings above.

Native cross-process affinity reads, Electron's actual exclusion behavior,
PowerShell pipe/echo handling, timing and unavoidable inter-observation OS changes
remain unverified here. No PowerShell, C# compilation, native overlay fixture,
display, account, provider, audio, process inspection, staging or allocation ran.
Lead separately owns the pure overlay fixture review and final Web patch/build.

## Reproduction and evidence

Read-only Git-object export: `/tmp/support-live-937788d-38tag4s1` (90 files).
`source-identity.json` records every exported path/hash, the exact commands,
probe hashes and 28 matched declared candidate/payload/source pins. An equivalent
export can be recreated with `git show 937788d:<path>` for its listed paths.

- `tests/probes/support/nonvoice_live_937788d_ledger.mjs`: 13 scenarios, comprising
  2 valid controls, 7 corrected negatives, 3 remaining counterexamples and 1
  coverage observation. Results: `ledger.json`.
- `tests/probes/support/nonvoice_live_937788d_boundaries.mjs`: 14 scenarios,
  comprising 6 controls and 8 corrected negative checks. Results: `boundaries.json`.

Both final invocations exited 0 with empty stderr under Node v24.21.0 permissions,
with read access only to their own script and the exact source export, and no
child-process/file-write grants. Output redirection saved synthetic evidence.
The ledger fixture derives from Support's prior independent fixture, adding the
now-required session/display/main-record fields; it does not import QA's tests.
An expected-counterexample assertion passing is **not** product acceptance.

Both first invocations exited 1 during module import because the export omitted
historical candidate metadata required by an imported module. No scenario ran.
Their empty stdout and ENOENT stderr are retained as `*-first-import.*`; the eight
exact metadata files were then added and each probe ran once successfully. No
source correction or additional campaign followed the successful runs.

The author's parse-zero/six-literal-C#-compile and 33/33 offline results remain
author-reported, not Support executions. No mutation campaign or historical suite
was repeated. Only Support evidence/probes changed; normal integration and any
subsequent execution remain with Lead.
