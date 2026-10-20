# Time-sufficiency review — source delta ready; foreground execution blocked

2026-10-20, 07 Support. Assignment `handoff_a37671510175f1d2dbd18cdc4d63068e`,
same P0-13 repair `handoff_f4a4b4aa`. Human resume reference:
`human-resume-after-restart-20261020:4bc3bf4fbf2a4e4aa6c2952228a4c695`.

**The four preparation-ordering guards are ready for normal integration. The
current invocation is not executable with cleanup assured inside the original
600-second foreground limit.** A longer allocation window does not solve the
foreground limit. Do not release a fresh run on these bytes merely because the
new guards pass.

| Reviewed object | Exact identity |
| --- | --- |
| QA correction | `58338a2fe8467125f00f0231abf5cfa194e71915` |
| Parent | `8aadd9027974c851e24f6c5ce6dfea6dd5126cb3` |
| Lead baseline | `f163643` |
| Support starting HEAD | `b93fc60fa0237b08ef83ba125c3f646dc2bb3904`, clean `team/support` |
| Product | `0ff325beadb7c689244610307b6aa16d638fd2e6` |
| Candidate 06 SHA256 | `288191f78a39ea242a59b867d0831808a3e22c762eff013c65669eed9d05c172` |
| Wrapper SHA256 | `ed58fe5d9fe3f1a4cd786303ab105a1f58bf42162c6f6d1ac145aaaf936c775b` |
| Inactive template SHA256 | `dc017d0f8bcd94aa5a17e5b3ab60374d4d713777008080515194fe2dd35f6d7f` |

Read the full exact `driver-nonvoice-06-time/README.md`, wrapper/test delta and
the original cleanup/candidate call paths. Refreshed Lead's current role,
workflow and desktop-first/source-language decisions. The current decision and
original-goal source/English hashes match their manifest. This bounded review
does not certify either desktop product gate or reactivate deferred mobile work.
PONYTAIL LITE, ultra, the original owners and permissions remain unchanged.

## Ordering correction: independently verified

All references below are at QA `58338a2`, under `tests/e2e/windows`.

`qa_run_live_candidate.mjs:124–127,142,156,165` now requires the remaining lease
to cover 60 seconds of preparation margin plus the 600-second native allowance:

- Before the stage/connector operational checks.
- After both looks, before writing a preflight-conflict record.
- Before creating output and starting the watcher.
- Before consuming scratch, with the existing catch stopping the watcher.

The test-only connector seam defaults to the original `connectorAdmission` at
line 132; CLI execution does not supply the seam. Existing pinned-candidate,
allocation, admission, digest, watcher and exact-identity cleanup protections
remain in the real call path. Final native-bound check and cleanup are unchanged.
The margin is an admission condition, **not** a measured or enforced preparation
duration. Time spent after scratch can still cause the final guard to refuse;
the probe records this as the existing behavior, not a new scratch-unused claim.

One independent permission-limited probe invocation ran **11 wrapper scenarios
and 2 pure validator cases**, exit 0, empty stderr:

| Focused case | Observed synthetic behavior |
| --- | --- |
| Saved inactive template, late entry by 1 ms, expired allocation | No operational call/effect and no scratch. Static source/manifest reads still occur. |
| Preparation equality | Output → watcher → scratch → one mocked native call; watcher stop/report reached. |
| Time lost during conflicting looks | Refuses before output/conflict record. |
| Conflict with sufficient time | Preserves the output/conflict record; no scratch/run. |
| Time lost at executable check | Refuses before output/watcher. |
| Time lost awaiting watcher readiness | Output and watcher exist, then stop file; no scratch/native call. |
| Final bound short by 1 ms after scratch | No mocked native call; final refusal and watcher stop/report retained. |
| Final bound equality on injected clock | One mocked native call; existing cleanup path reached. |
| Full native allowance under virtual clock | Cleanup begins after the foreground cap, as detailed below. |
| Pure active-shaped control / old wrapper pin | Correct current shape accepted in memory; stale wrapper pin refused. |

The positive mocked-launch cases deliberately provide no real runner results:
their evidence is ordering, not a full mechanical/product pass. Equality tests
use an injected clock and do not establish real-world latency. The saved template
remains inactive. No real allocation was created.

Independent pin checks match the candidate, six payloads, wrapper, template and
test file (10 comparisons). Candidate/payload paths are unchanged from the parent;
the template differs from driver-06 only in `wrapper_sha256`. Author 41/41 and
37/41 revert results were read, not replayed or counted as Support results.

## Concrete blocker: the outer foreground budget has no cleanup reserve

The 600-second foreground cap and no-detach rule are the original QA runtime
constraints supplied in the assignment/owner report. This review does not infer
them from Support's own tool timeout or claim how the host kills timed-out work.

The source permits the synchronous native call itself to consume 600 seconds
at wrapper `188`. Cleanup begins only after it returns, at `196–217`.
Preparation also occurs before that call. The new lease margin does not impose
an overall wall-time deadline or reserve any foreground time for cleanup.

The narrow virtual-clock witness assumes only 1 second in stage preparation,
a native return at its configured 600-second timeout, and 1 second per subsequent
cleanup look. It reaches its **first cleanup look at 601,000 ms** and its report
at **603,000 ms**. All processes and filesystem effects are mocks; this is source
ordering under simulated elapsed time, not a timing/model/native experiment.
Even this favorable cleanup cannot be relied on when the enclosing tool permits
only 600,000 ms. A host timeout is not proof of owned-process termination or lease
release, and `finally` is not a guarantee after external cancellation.

The recorded native 589,000 ms estimate does not repair this:

| Native estimate component | Milliseconds |
| --- | ---: |
| Wait-evaluation timeouts | 415000 |
| Fixed sleep | 5000 |
| App close allowance | 10000 |
| Other fixed/estimated steps | 129000 |
| Startup/finally estimate | 30000 |
| Total | 589000 |

This is `qa_live_candidate.mjs:238–240`'s estimate, not a hard wall-time bound.
It leaves only 11 seconds under the tool cap for all wrapper preparation and
cleanup. Wrapper cleanup alone configures Electron grace waits of 1+20+5 seconds
and Edge waits of 1+5+5 seconds, then up to 15.5 seconds of connector observation
and a 5-second watcher wait. Those 57.5 seconds are **not a complete upper bound**:
look/signal subprocess calls and collection add time. Preparation includes a
30-second stage check, two connector checks with 60-second timeouts, and Git
comparison commands without explicit timeouts (`sub_copy.mjs:14,26,30,47`,
`qa_live_ledger.mjs:296`). No finite whole-wrapper bound follows from these values.

There is also a reason not to fix this with a numeric timeout alone: Node's
synchronous child APIs wait for actual child exit after sending the timeout
signal; the timeout does not guarantee that JavaScript cleanup resumes at that
instant. This is documented for the installed major/version, and was not tested
against Windows interoperability here. [Node v24.21.0 child-process documentation](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html#child_processspawnsynccommand-args-options)

## Smallest proposed correction within the same invocation and task

Keep the existing foreground Node wrapper, runner, owned-resource identities and
one attempt. Add one end-to-end monotonic budget with explicit phase reserves;
do not add an executor, detached job or recovery service. A concrete conservative
starting split is below. These are **proposed engineering ceilings**, not observed
durations, a changed user spending budget, or implemented guarantees.

| Phase | Proposed ceiling |
| --- | ---: |
| Preparation | 60 s |
| Native runner, including its own wind-down | 360 s |
| Existing owned cleanup and watcher stop | 150 s |
| Bounded evidence/final report | 20 s |
| Unspent foreground headroom | 10 s |
| Total | 600 s |

Implement this locally in the existing flow:

1. Start the total/phase clocks at wrapper entry. Before scratch and again after
   watcher validation immediately before launch, require enough time under both
   the allocation and foreground budgets. Limit preparation child calls to the
   remaining preparation time; the two 60-second checks cannot each borrow a
   fresh full phase. A preparation expiry refuses before launch and stops its
   owned watcher through the existing cleanup path.
2. Regenerate a candidate with a **360-second native ceiling** and preserve all
   four actions, admission checks and the unchanged 4-action/60-second-session/
   60-second-observation policy. Give the existing runner loop a cooperative work
   deadline (for example 330 seconds plus 30 seconds for its existing wind-down).
   Bound waits/commands by remaining phase time. Insufficient time aborts to
   cleanup and records later actions NOT_RUN; never remove checks or report a
   truncated run as passing. The current 589-second estimate/600-second validator
   equality must be reconciled with these actual bounded paths and new pins;
   simply changing a manifest number is invalid.
3. Keep the same foreground invocation responsible for its child and cleanup.
   Make the native wait interruptible by its deadline without leaving the wrapper
   blocked on synchronous return: an attached, awaited child in this same wrapper
   is sufficient; it must not detach or return a pending job to the caller.
   Preserve identity checks before any existing close/force action. Clamp cleanup
   calls and waits to their shared reserve, retain graceful-before-force behavior,
   and record unresolved exits as unknown rather than signalling unverified
   processes or claiming release. Save the bounded report before the tool cap.

The phase totals are necessary but not sufficient: original QA must demonstrate
with injected clocks that late preparation, native overrun/late child exit and
slow cleanup still reach cleanup/report within those ceilings. If the existing
foreground path cannot enforce that, keep the invocation blocked; increasing a
lease, relying on average speed, detaching or switching execution routes is not
the repair. No native or model timing experiment is needed for this source step.

**Next original-owner action:** QA implements that one bounded timing correction
and its focused synthetic deadline cases; Lead reviews the regenerated exact
candidate/command/pins and only then considers a fresh allocation. The ordering
delta reviewed here can integrate independently. QA remains the owner, cards
remain human-owned for this phase, and no automatic restoration or run is issued.

## Evidence and boundaries

Probe: `tests/probes/support/nonvoice_time_58338a2.mjs`.
`probe.json` contains all traces; `probe.stderr` is empty. The exact command and
84-file Git-object export at `/tmp/support-time-58338a2-6qjy5mkd` are recorded in
`source-identity.json`. The Node process had read permission only for this export
and its probe, with no child-process or file-write grants. All operational I/O,
connector/process/Windows functions and clocks were injected; no source wrapper
was modified to enable a live run. Official Node documentation was consulted on
2026-10-20 solely for synchronous timeout semantics.

No Windows/display/account/microphone/audio/model operation, live-process
inspection, stage execution, scratch creation, native experiment or other-worker
contact occurred. Only Support evidence/probes changed. Real actions remain
**0/4**, diagnostic **3/3 closed**, and all old allocations remain retired with no
fresh allocation or lease. This is not a P0/product PASS.
