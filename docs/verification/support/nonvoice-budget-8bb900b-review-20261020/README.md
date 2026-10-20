# Candidate 07 foreground-budget review — HOLD before allocation

2026-10-20, 07 Support. Assignment `handoff_11effc4772f441b4a1bcef679f191f4b`;
parse-evidence update `handoff_bc01cbeed6ba62f0ba03cea11f3c6848`.
This continues the same P0-13 correction reviewed in `7723f82`.

**HOLD.** Candidate 07 improves phase accounting and failure reporting, but it
does not yet contain the Windows runner's lifetime within the foreground call.
The disclosed hung-step residual can permit later Windows activity if the runner
survives launcher signalling. Reporting that uncertainty does not stop the
activity. There is also a concrete missing release blocker for an early signalled
launcher, and the 590-second report ceiling is not enforced across synchronous I/O.
No new allocation or native attempt is recommended on these bytes.

| Object | Exact identity |
| --- | --- |
| QA source | `8bb900b7a773c9ec7790d0854d863a157285f777`, parent `58338a2fe8467125f00f0231abf5cfa194e71915` |
| Lead baseline | `725f91036130d8a73ae523074c01e195663d22a1` |
| Support starting HEAD | `7723f824d1b3a56ca0d60c888c3c4a49da96f457`, clean `team/support` |
| Candidate 07 SHA256 | `b17b66c4bae78269762b24f8656883907a6ceccd9a6d9ab16ffdf40ac0832e9e` |
| Runner SHA256 | `3cf37c29a3254a31b5afc204e95c38a712acf4a91ef4cbad3d3f37972275b6fd` |
| Wrapper SHA256 | `691d5bebe61cfcf63a345a58386847329166d2596f78a31e8490d9d988e17e17` |
| Parse evidence only | `c6afeb6c4303d8395afb97639dcb6d34926d84c2`, parent `8bb900b` |

Read the complete `driver-nonvoice-07/README.md`, exact changed modules, and
relevant runner, cleanup, watch and collection paths. Current AGENTS/TEAM,
workflow, role and requirements are unchanged since the preceding `f163643`
refresh; current role and operational rules were checked again. PONYTAIL LITE
and ultra are unchanged. One internal read-only review lens checked the runner;
the parent checked its source findings and ran the probe below.

## What the correction establishes

The wrapper computes monotonic phase ends from entry: 60 s preparation, 360 s
native, 150 s cleanup, 20 s evidence, plus 10 s unused headroom. Its preparation
and cleanup subprocess options now share the remaining phase time. Allocation
wall-clock checks remain separate. The watcher check precedes the final lease
and preparation checks. Exact candidate/source/ownership guards remain.

The native call is an attached `spawn`, with exit and pipe-close observations
kept separate. Its timeout path signals TERM then KILL inside the declared
native reserve. Missing results after a launch count all four slots as unknown;
no launch counts none. An unclosed output fails launcher completeness. Timeout,
unknown app cleanup and an unended watch prevent the corresponding release
claims. These are useful improvements, not a native lifetime guarantee.

Five declared pins match. Steps, surface, connector config, checker and checker
config are byte-identical to candidate 06. The runner changes are the five
documented deadline sites. Four actions, the 60-second session/observation
policy, source checks and no-retry rule remain unchanged.

## H1 — The work deadline does not fence in-flight Windows activity

All runner references here are to `candidate-nonvoice-07/runner.ps1` at `8bb900b`.

- `1324–1365`: WorkMs checks step entry and limits explicit sleep / the outer
  waitEval duration. The nested operations do not inherit that deadline.
- `279–310`: each receive fragment gets a fresh 60-second wait with
  `CancellationToken::None`; response matching can loop indefinitely. Send waits
  have no deadline.
- `417–438,520–544`: synchronous HTTP discovery and socket connection do not
  consume a shared work deadline. Connect uses unrestricted `.Wait()`.
- `1362–1364`: waitEval catches evaluation errors and can accept a truthy
  response before checking its outer time. Adding a nested deadline error alone
  would be insufficient if this catch continues to swallow it.
- `1812–1826`: finally first uses the same unbounded Eval before socket disposal,
  process wait and result writing. The approximately 28-second allowance is an
  estimate, not an enforced wind-down.

One concrete source counterexample is the single pen-stroke step
(`steps.json:322–488`). At `runner.ps1:1377`, a mouse movement and its response
precede the press; further points and release follow at `1379–1380`. If the step
starts at runner time 319 s and the first response takes 50 s, still within its
60-second receive wait, the press can be sent at 369 s. There is no new deadline
check before that send. Capture Start has the same pattern: socket/admission
work precedes the effect at `1346`, without rechecking the work deadline.
An unrestricted connection wait can return even after the wrapper has exited
and then reach a send.

These are conditional source paths, **not observed Windows behavior**. They
require the runner and target to survive launcher signalling/cleanup, which is
precisely the unverified lifecycle boundary. Wrapper `213–217,294–323` observes
and signals the WSL launcher; `225–229` cleans only exact Electron/Edge identities.
It does not establish the Windows runner's identity and terminal state first.
A cleanup snapshot cannot prevent a still-running producer from acting later.
The read-only connector watch is neither a Windows runner watchdog nor a fence.

The three mocked timeout cases preserve that uncertainty: launcher exits on
TERM, exits on KILL, or never exits. All return a runner release blocker and
count four unknown slots; a separate hypothetical Windows-alive flag remains
true. This proves honest timeout reporting, not termination. The README's
statement that a hung step “is cut at the ceiling” is therefore not established.
The CLI's `process.exit` at wrapper `620` ends Node; it is not Windows completion.
Node documents signal delivery separately from termination, and forced process
exit can abandon pending asynchronous work. [Child-process semantics](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html#subprocesskilled), [process exit](https://nodejs.org/download/release/v24.21.0/docs/api/process.html#processexitcode)

**Minimum correction:** keep the existing foreground wrapper and runner. Propagate
the remaining work deadline through HTTP/connect/send/receive and all inner
loops; cancel/abort pending I/O, propagate deadline errors, and recheck immediately
before every side effect after a wait. Use a separately bounded cleanup deadline
so exhausted work time still permits graceful shutdown. The existing
ClientWebSocket receive API accepts cancellation; the present source passes
None. [Microsoft API documentation](https://learn.microsoft.com/en-us/dotnet/api/system.net.websockets.clientwebsocket.receiveasync?view=netframework-4.8.1)

Establish the exact owned Windows runner identity and prove its completion, or
perform and verify its bounded exact-identity termination, before app cleanup
can be final. Do not signal arbitrary PowerShell processes or rely on the WSL
PID. Reconcile the clock origins: runner time begins at line 63, after startup;
wrapper native time begins at spawn. The fixed 40-second difference is not all
available for wind-down. If the same path cannot enforce this lifetime, retain
HOLD rather than exit with required activity potentially continuing.

Helper edits also affect generation: `qa_live_candidate.mjs:270–271,301–324`
extracts runner helpers into the checker. Keep a bounded runner-only transformation
or explicitly coordinate regenerated checker dependencies; do not introduce
undefined runner-only variables or silently broaden checker/source guards.

## H2 — Early launcher signals are absent from release blockers

Wrapper `243–247` adds the runner blocker only for missing `exit_seen` or
`timeout === true`. A launcher killed **before** the wrapper's timeout has
`exit_seen: true`, `signal: SIGKILL`, `status: null`, `timeout: false`.
`runAttached` legitimately reports those facts, but the release condition misses
them.

The focused injected case supplies that early signal, clean app/Edge snapshots
and a completed synthetic connector watch. Actual result:

```text
launcher: exit_seen=true, signal=SIGKILL, status=null, timeout=false
release_blockers: []
mechanics_passed: false
attempts_used: 4
```

This is **not a false product PASS**: launcher failure and missing evidence still
fail mechanics. It is a missing lifecycle/release blocker in the field explicitly
intended to constrain DISPLAY/ACCOUNT RELEASE. A killed launcher cannot prove the
Windows runner ended. Minimum fix: use explicit Windows completion evidence for
release; any signal/error/missing terminal proof remains blocked regardless of
whether the wrapper's own timer fired. Complete output alone is insufficient.

## H3 — Phase guards and forced Node exit do not enforce all lifetimes

Two remaining paths matter within this same budget change:

1. **Watch lifetime:** `startWatch.stop` (`270–274`) requests a stop file and waits,
   but neither ends nor reaps an unresponsive child. Its fallback comment refers
   to `qa_sub_watch.py:70`'s **3600-second** self-bound. The injected failed-stop
   case returns with `watch_exited=false` and a release blocker; the mock watcher
   remains alive. Thus the new honest field does not contain its lifetime within
   the foreground budget. Give this exact owned watcher a matching self-deadline
   and an attached bounded stop/termination/join path. Do not add a detached
   watchdog or another executor.
2. **Blocking evidence:** `collect:528–536` reads/writes/parses results before its
   first `enough()` check. Later checks are per capture or section, not every
   file/inner loop. `watchSummary`, record writes and `publishAllowlist` are also
   synchronous; `report_after_ms` is sampled before the final writes. A late
   completion is reported, not interrupted or bounded.

The injected overrun witness places the first results read at 569,000 ms, then
advances that read by 40,000 ms. The real wrapper writes a report with
`report_after_ms=609000`; later collection guards correctly add errors. This
test deliberately lets an earlier mocked cleanup call complete beyond its
timeout option to reach the late phase. It tests handling of late synchronous
completion; it does **not** show that a real PowerShell call took 568.75 s, that
disk reading took 40 s, or that SIGKILL behaves this way on the host. The timeout
option and instantaneous mock I/O cannot prove the contrary either.

Minimum fix: enforce remaining-time and size/count limits across the actual
blocking boundaries, including final evidence; bound operations rather than
merely checking before them. Preserve a small bounded failure record before the
tool cap and retain unread evidence in place. A Promise timer around synchronous
I/O cannot interrupt it. Keep source checks and uncertain outcomes; if required
work cannot finish safely in the existing foreground path, fail admission before
launch. Do not use a longer lease, background work or another executor to hide
the shortfall.

## Verification and original-owner next action

One direct permission-limited Node invocation completed **11 focused scenarios**,
exit 0, empty stderr. It tested inactive refusal; normal attached completion;
TERM/KILL/no-exit timeout paths; the early-signal counterexample; unclosed output;
shared preparation clamps; post-scratch refusal with zero counted actions;
unended watcher; and late synchronous evidence completion. Positive launcher
controls deliberately lack real runner results and are not full mechanics passes.
QA's 48/48 suite was read, not rerun or counted as Support evidence.

Probe: `tests/probes/support/nonvoice_budget_8bb900b.mjs`.
`probe.json` holds observations and `source-identity.json` records the exact
command, probe hash and 99-file Git-object export. Node could read only that
export and its probe; it had no process/write grants. Every operational file,
clock, connector, child and Windows operation was injected. No live resource
was inspected or used.

The **original QA's** parse-only evidence at `c6afeb6` was inspected in full:
`check.ps1`, run record, stdout, stderr and README. It reports the exact runner
hash above, Windows PowerShell `5.1.26100.9711`, zero ParseFile errors, exit 0,
empty stderr, at `2026-10-20T11:09:16Z`. That commit adds only parse evidence.
Support did not repeat the check. It establishes parsing of these bytes, not
runtime behavior, C# compilation, lifetime, release or timing.

Original QA should make one bounded lifecycle/deadline correction covering H1–H3,
regenerate affected pins and test the changed paths with injected time/I/O.
Preserve all four actions, the full 60-second session policy, no retries,
exact-owned graceful-before-force cleanup and every source guard. Lead reviews
that exact delivery before considering an allocation. This review does not
request another parse of unchanged bytes or start a native experiment.

Only Support evidence/probes changed. Product `0ff325b`, old candidates and
allocations are untouched. No Windows/native/account/provider/display/microphone/
audio action, production edit, lease, permission change or new campaign occurred
in this review. Real actions remain **0/4**, diagnostic **3/3 closed**. QA remains
the owner; cards remain human-owned, with no automatic restoration. Return this
substantive verdict once, then idle.
