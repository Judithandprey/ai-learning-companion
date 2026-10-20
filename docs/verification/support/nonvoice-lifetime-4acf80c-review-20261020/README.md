# Candidate 08 H1–H3 delta review — READY for Lead decision

2026-10-20, 07 Support. Assignment
`handoff_50daaa70336c4619c722b2f7bcda58eb`, continuing the same P0-13 correction.

**READY for Lead's integration and allocation decision.** No concrete remaining
H1–H3 blocker was found in candidate 08's ordinary reachable paths. The prior
findings in `d3ca9ca` are addressed for the exact source below. This is source
and offline review readiness, not execution approval, measured timing, a
DISPLAY/ACCOUNT release, or product acceptance. No fresh allocation was made.

| Reviewed object | Exact identity |
| --- | --- |
| QA correction | `4acf80c1b32e282520bffe19a641e2f4626a919e` |
| Parent | `c6afeb6c4303d8395afb97639dcb6d34926d84c2` |
| Assigned Lead baseline | `725f91036130d8a73ae523074c01e195663d22a1` |
| Support starting HEAD | `d3ca9cad3dbf21e0ffa236a11192285b531c995c`, clean `team/support` |
| Candidate 08 SHA256 | `0847eeb6070c365661add6561118e8d5414e8dffc6d434dfad38864e28722b7e` |
| Runner SHA256 | `4655ec118a01c25839d94c2c004d963cc0f19893a1064dec9e3dea853340ae69` |
| Wrapper SHA256 | `efa634ca881b9aaf71f424879f1e0836981a4d83925dbc6ab9a753c7605fcef5` |
| Watcher SHA256 | `d5ccfa485f8e99731e105164d2819f66ce67df90346f2f9a129d5297093d9a56` |
| Inactive template SHA256 | `942b3c3687a7ec6ccbd30889b242aac67ddfcbd174663464439fb480270e2c52` |

Read the full driver-08 README and exact changes against `c6afeb6`, with the
preceding review. AGENTS/TEAM, role, workflow and requirements remain unchanged
from the current context refresh. PONYTAIL LITE and ultra remain unchanged.
One internal read-only lens checked the runner; the parent reviewed the wrapper,
source evidence and focused fake-operation results.

## H1 — Reachable operations and runner cleanup now share the boundary

References in this section are to candidate 08's generated `runner.ps1`.

- `64–89`: the work clock includes the runner process's age at initialization,
  then uses elapsed time. Exhausted work time refuses further operations.
- `313–316,329–341,473–475,581–583`: receive, both send paths and both connect
  paths obtain remaining time before starting and cancel a timed-out operation.
  HTTP discovery is likewise limited and cancellable.
- `468,564,1402,1842`: discovery, waitEval and optional-step handling propagate
  deadline errors. The next-step gate at `1370` remains.
- Effects reachable from the pinned steps check time after preceding waits:
  app/Edge launches (`384,1460`), window raises/front, WM_CLOSE (`1690`), and
  each CDP command (`329–341`). The prior late-stroke example now reaches a
  deadline refusal before its next press. Dormant generic branches absent from
  these steps are not additional candidate defects.
- Finally installs its own 15-second close allowance (`1850`). Its CDP close
  and process wait use that allowance (`1855,1861`); work expiration does not
  remove the opportunity for graceful cleanup.

The wrapper additionally checks Windows runner identity independently of WSL
launcher events (`qa_run_live_candidate.mjs:181–186`). It uses the complete
PowerShell process list and the exact executable, invocation and creation-time
boundary. The existing identity validator and handle-bound signal implementation
are reused. Runner cleanup comes first (`236–240`), with close, force if needed,
and a new look before app/Edge cleanup. A missing or unresolved identity remains
unknown; it is never inferred dead from a launcher signal.

An unresolved runner still allows best-effort exact app cleanup, but cannot
make that cleanup final for release: the runner blocker remains. The review
does not reinterpret this runtime refusal as permission to signal an unrelated
PowerShell process.

## H2 — Early signals and failed runner proof now block release

Wrapper `253–260` requires the launcher to have ended with status 0, no signal,
error, timeout or requested signal, and separately requires confirmed Windows
runner cleanup. QA signalling the runner or any runner look/signal error also
blocks release. App/Edge, connector and watcher requirements remain.

The previously failing early-SIGKILL fake now returns the launcher release
blocker even when every other synthetic release fact is clean. A still-present
exact runner receives close then force, is seen gone before the app look, and
still retains the QA-signalled-runner blocker. A different invocation naming
the runner stays unresolved and receives no signal. The unrelated readable
checker row in these fakes is never signalled.

These facts distinguish launcher exit, Windows process cleanup and release.
The normal synthetic control has no release blockers; it still has no product
PASS because deliberately absent runner evidence counts all four slots unknown.

## H3 — Watch and evidence have bounded ordinary paths

The wrapper supplies the watch's remaining cleanup window through `--max-seconds`
(`192,288`); the Python watch uses that self-bound. Its stop now joins the exact
child, then signals TERM/KILL as necessary, with waits limited by both clock and
iteration count (`294–310`). The fake stop-file failure reaches TERM and observes
the child exit. Because a forced watch exit does not fabricate a final watch-log
record, connector release remains blocked in that case.

Evidence now gets a small status record before collection (`263–268`). Reads
are through the opened non-following descriptor, with size and growth checks
(`560–580`). Results and subsequent reads/copies use the time guard and total
byte allowance; directory, ask, request and receipt counts are limited. The
full report has a bounded fallback, and the allowlist traversal has an entry
limit. Over-limit or unread evidence remains in place with an error.

The earlier artificial late-synchronous-I/O witness is **not** rerun as a new
blocker. Permanent kernel stalls, OS scheduling failures and uninterruptible
metadata reads cannot be ruled out by these mocks. The source now limits ordinary
work and records incomplete cleanup/evidence. No concrete ordinary path requiring
another framework, executor or unrelated test campaign was found.

## Targeted independent evidence

One direct Node invocation ran under `--permission`, with read grants only to
the exact Git-object export and this probe; no child-process or write grants.
All operational I/O, processes, Windows calls and clocks were fakes.

| Focused case | Result |
| --- | --- |
| Normal launcher/cleanup control | No release blockers; status record precedes ledger; missing synthetic results remain four unknown slots. |
| Early outside SIGKILL | Launcher release blocker retained. |
| Exact Windows runner stays alive | Close → force → confirmed gone before app cleanup; QA signal remains a blocker. |
| Runner invocation unresolved | No signal; runner end unknown and release blocked. |
| Watch stop-file failure | Exact watcher joined after TERM; missing watch-log end prevents connector release. |
| Bounded read controls: exact / oversize / growing / no time | Exact bytes returned; oversize rejected before reading; growth rejected; exhausted budget refuses before opening. Opened descriptors close. |

All **5 lifecycle cases and 4 read controls** completed, exit 0, empty stderr.
These are the disputed boundaries only. No full owner suite, historical campaign,
timing experiment or native test was repeated. QA's reported 54/54 remains
owner evidence.

Six declared pins independently match, including the test file. The other five
payloads—steps, surface, connector config, checker and checker config—are
byte-identical to candidate 06. Generator `qa_live_candidate.mjs:256` applies the
deadline delta after admission, and `539` reverses it before extracting the
checker. No runner-only deadline variables leak into the saved checker. Four
actions and the 60-second session/observation policy are unchanged.

The original QA's complete driver-08 parse-only evidence was inspected:
README, `check.ps1`, run record, stdout and empty stderr. The check-script hash
matches the run record; stdout matches its result and the exact runner pin.
It records Windows PowerShell `5.1.26100.9711`, zero ParseFile errors, exit 0,
at `2026-10-20T11:53:31Z–11:53:32Z`. Support did not repeat it. This proves parsing
of the source bytes only, not runtime cancellation, C# compilation or timing.

Probe: `tests/probes/support/nonvoice_lifetime_4acf80c.mjs`.
`probe.json` contains the traces. `source-identity.json` records the command,
hashes, exact 103-file export, owner parse evidence and unchanged context.

## Handoff and limits

No further source correction is requested from QA for this H1–H3 delta.
Lead decides normal integration and the fresh exact allocation/command/pins.
QA remains the executing owner; all actual failures, unresolved processes,
source-admission refusals and release blockers retain their current handling,
without retry or automatic restoration.

Windows interop signalling, actual invocation representation, spawn/creation
timing and native cancellation remain unmeasured. An unreadable relevant
PowerShell identity must keep release unknown. These are disclosed execution
dependencies, not a claim that the whole call is immune to OS/kernel failure.
The existing native overlay, source admission, checker I/O, latency, holding
ceiling and OS-race limits remain separate acceptance evidence.

Only Support evidence/probes changed. Product `0ff325b`, production sources and
other worktrees are untouched. Support performed no Windows/native/display/
account/provider/microphone/audio activity and acquired no resource lease.
Real actions remain **0/4**, diagnostic **3/3 closed**, all old allocations retired.
This review does not report main integration or a product/P0 PASS. Send this
verdict once, then return to idle.
