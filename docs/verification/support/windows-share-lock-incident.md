# SUP-01: hosted Windows unreadable-original precondition

**Historical first round; superseded by the [native identity/byte-range follow-up](windows-share-lock-native-followup.md).**
Hosted run 36766951888 reproduced successful Node reads while the traced handles
remained held. Do not apply `windows-share-lock-owner.patch`: the proposed
`holdUnshared` lifecycle diagnostic is no longer the next step. This report and
its receipts remain unchanged below as the record of the earlier investigation.

2026-09-30. Lead incident `handoff_38db85647e8969c081580624ea791b9c`.
Exact published source: `d49d101cd8d378e57ea54da6cb38fb89b80bb72c`.
Owner: Web; Support writes only its probe/evidence directories.

**Result: the hosted root cause is unresolved.** A bounded native Windows probe
confirms that the exact PowerShell command can hold the file through real Node
open/read denial locally, including under Node's test runner. It does not explain
the hosted failure. The next useful operation is one execution of this small
probe on the failing hosted Windows image, preserving its lifecycle evidence.
Do not replace the real denial assertion with a skip or change the uploader.

## What the actual failure establishes

[Hosted run 36764195464, Windows job 110054099603](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36764195464/job/110054099603)
is pinned to the above source. The supplied sanitized
`/tmp/windows-d49d101-job.txt:399–414` says **Missing expected exception**, at
`apps/windows/tests/uploader.test.ts:915`. A second `openSync(file, 'r')` succeeded;
this was not a different error code being mistaken for failure. The unreadable
case never reached the uploader call at line 966. The 133 passes / 2 failures /
5 skips include the one failed subtest and its failed parent, not two independently
demonstrated product faults. No new hosted run was dispatched by Support.

Supplied evidence SHA-256: sanitized log
`f7d472ef0a237c046953cb5190bafce8f24a1c0c00e3c2ccd4957a91893d2afb`;
run receipt `/tmp/desktop-d49d101-run.json`
`6c1a4f5ca23b18b13505db313ca62d754173c0c383746e3305e8ff88c2127cac`.

The log records stock Node 24.21.0 x64, Windows Server 2025 10.0.26100,
image `windows-2025-vs2026` version `20260922.246.2`. Build/package steps completed;
the test step failed and its evidence was uploaded. The Mac sibling succeeded and
was not repeated. Earlier chmod / numeric-EXLOCK attempts and local author
Node/Electron results remain the evidence described in the assigned
`docs/verification/lead/windows-portability-review/second-review.md` and
`docs/verification/web/windows-upload.md`; they were read, not rerun wholesale.

The exact test blob SHA-256 is
`d4838fb5112171481badd6ac7a526426ac77e461096a4bf84f4070d2a33df219`.
The probe's legacy command was programmatically compared with that source literal;
both hash to `48fc38f2dbb37119ad42a3d7a05c7dec92cdc390ce07ff96f49c92596ae0b56c`.

## Causes versus hypotheses

The original helper at lines 73–100 prints `held`, discards stderr, waits on
`Console.In.ReadLine()`, and closes the handle. The parent accepts the stdout
marker without recording whether acquisition succeeded or when the handle closed.

| Possibility | Current evidence | Discriminating observation |
| --- | --- | --- |
| Acquisition failed, then readiness was printed | Source has no fail-fast acquisition guard and ignores stderr; no hosted helper error was retained | Terminating acquisition errors, HRESULT/type and explicit open-handle evidence |
| Input returns early; the lock closes before the parent checks it | Source releases immediately after ReadLine; buffered readiness alone is insufficient; no hosted release/exit timing exists | Timestamp input return/null, handle disposal, parent's first read and release, child exit/close |
| Different filesystem/runtime behavior while a handle remains held | Hosted and local environments differ; no held-handle hosted observation exists | Same owned temp path, .NET second-open result, Node open-only and actual-read results, runtime/filesystem metadata |
| Earlier fs wrappers were not restored | Inspected wrappers restore `Object.assign(cjs, native)` and `syncBuiltinESMExports()` in finally; no evidence of leakage | Run isolated probe first; if it passes hosted, instrument the actual helper in the failing test context |

These are hypotheses, not diagnosed causes. Local stock Node 24.19 and the owner's
Electron-embedded 24.21 do not isolate a regression in hosted stock Node 24.21.
The known uncanceled helper timers explain a possible 30-second run floor, not
why the file was readable. No ACL, filesystem or runtime settings were changed.

## Minimal probe and actual local execution

[windows_share_lock.mjs](../../../tests/probes/support/windows_share_lock.mjs)
uses only Node built-ins and already installed Windows PowerShell. It creates one
unique synthetic temp directory and file, then three sequential, directly owned,
hidden foreground helpers:

1. The exact source PowerShell command, with stderr retained by the diagnostic.
2. An instrumented ReadLine equivalent: fail-fast acquisition, file/handle/runtime
   facts, a same-helper .NET second open, and input-return/disposal events.
3. The same instrumented case using raw stdin `ReadByte`, to discriminate a
   Console reader problem if hosted evidence later shows one. This is not a
   recommended fix based on the local passes.

Each arm checks both the exact `openSync` precondition and a real `readFileSync`
immediately after readiness and once after 150 ms, before sending release input.
That one delayed measurement is diagnostic, not a retry loop or a readiness fix.
It then sends `release-probe\n`, awaits close, and reads the file again. Cleanup
is bounded and addresses only that ChildProcess. Partial evidence survives an
unconfirmed cleanup; no further helper starts after that failure. Forced/nonzero
termination is distinct from normal release. A hosted job timeout still provides
the outer bound if an OS refuses termination; no real such failure was observed.

Local environment: native Windows Node 24.19.0 / libuv 1.52.1, OS 10.0.26200,
Windows PowerShell 5.1.26100.9444 / CLR 4.0.30319.42000, NTFS.
`C:\Program Files\nodejs\node.exe` was used; no Electron, app, GUI, server,
database, provider, network request or user preview was started.

| Final Node test-runner arm | Before release | Release and cleanup |
| --- | --- | --- |
| Exact source command | Both opens and reads denied with EBUSY at both observations; stdin open, process not exited | Exit 0 after release; original synthetic bytes readable |
| Traced ReadLine | Same Node result; .NET second open failed with HRESULT -2147024864 (0x80070020); handle open | ReadLine returned `release-probe`, then disposed, exit 0 |
| Traced raw stdin | Same Node/.NET denial and open-handle result | ReadByte returned 114 (`r`), then disposed, exit 0 |

[Final raw TAP](windows-share-lock-test-runner-local.tap) records **one passing
Node test module containing these three diagnostic arms**, not three uploader
acceptance tests. [Extracted JSON](windows-share-lock-test-runner-local.json)
matches the final probe SHA-256
`d7f8a61b9396be0276c07e41edbbc23c2ca7df43a3dd9a4c1656ea46e4069893`.
All helpers exited normally and their owned temp files were removed.

Two earlier local diagnostic receipts are retained:
[reads without separate open observations](windows-share-lock-local.json) and
[separate open/read observations](windows-share-lock-open-read-local.json).
Their embedded hashes identify earlier probe revisions; they are not receipts
for the final file. Review prompted separate open/read measurements and stronger
cleanup evidence/normal-release classification before the final run. No failure
was silently relabelled as a passing hosted result.

An attempted `node --test` with the UNC script argument was rejected by the local
test runner as “Could not find” before executing a helper. The final run copied
the exact probe bytes into a unique owned Windows temp directory, ran the relative
filename there, then removed that staging directory. Direct native Node execution
of the UNC script worked in the earlier two runs. This launch distinction does
not diagnose the hosted lock failure; the hosted checkout needs no UNC workaround.

## Exact next operation and owner patch

Lead owns a one-off hosted step using the existing Windows runner/setup actions,
stock Node 24.21.0 and the same Git Bash environment, after integrating this probe:

```sh
node --test --test-reporter=tap tests/probes/support/windows_share_lock.mjs
```

Retain complete stdout/stderr and the exit code, even when the step fails. Run
only this probe, with a short outer job/step timeout (two minutes suffices for its
declared bounds). No npm install, packaging, full uploader campaign or Mac job is
needed. CI/root changes and dispatch are Lead-owned and were not performed here.

If that reproduces, use its event ordering to distinguish failed acquisition,
premature input return and a genuinely held file allowing reads. If it passes,
the next patch is the proposed
[Web-owner diagnostic diff](windows-share-lock-owner.patch), limited to
`holdUnshared` in the exact test source. It records the same acquisition/input/
exit evidence in the real failing context and fixes bounded helper cleanup.
It deliberately retains ReadLine so it does not assume the raw-stdin hypothesis.
The diff is an unexecuted proposal, not a verified hosted repair; Web reviews and
applies it without interfering with its current app-parent implementation.
It applies cleanly to a temporary export of the exact source; comparison confirms
that only `holdUnshared` changes. Node TypeScript stripping followed by JavaScript
syntax checking passed; this is not TypeScript type checking or runtime testing.
Diagnostic timestamps are parent receipt times. Separate stdout/stderr streams
do not establish a total ordering of the child's internal operations.

Keep all acceptance stages: the real unreadable-file precondition, uploader
`refused` at `local` with the expected reason, zero requests, and owned cleanup.
No production uploader change, broad skip, new dependency or relaxed refusal is
justified. Source/ink preservation and independent Stop requirements remain;
this diagnosis passes no R/A or §7.1 product gate. Support ends this bounded round
at the named hosted evidence dependency; another investigation needs that result.

## Primary sources checked 2026-09-30

Microsoft documents that [FileShare.None](https://learn.microsoft.com/en-us/dotnet/api/system.io.fileshare?view=netframework-4.8.1)
prevents other opens while the handle remains open, and that
[Console.ReadLine](https://learn.microsoft.com/en-us/dotnet/api/system.console.readline?view=netframework-4.8.1)
can return null at end of input. These support the lifetime questions; they do not
prove what happened on the hosted runner.
[PowerShell error preferences](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables?view=powershell-7.5)
describe Continue versus Stop. That current documentation is not a reproduction
of this machine's PowerShell 5.1 or the hosted environment.
