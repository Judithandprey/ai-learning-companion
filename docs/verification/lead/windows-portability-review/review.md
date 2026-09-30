# Windows test portability 3885987 — APPROVE with P3 cleanup finding

Exact candidate **3885987a1eef702512f868e6db04550791e319cb**, parent **f21b2c3e078d5ffd44b102ef1d2c2e32a3451777**, main baseline **d96718c6ded7e10e02ab0a56d0f8e76361105085**. Read the full four-file delta, affected complete test/helper paths and both added evidence files. No production file changes: uploader Git blob `1efca858ac512bda974ccc9bdbe2e4f5c773808e` is identical in parent, candidate and main. Diff whitespace check passed. Current relevant workflow/requirements remain unchanged from the preceding review.

The portability correction is suitable for integration. Lead subsequently integrated it as `6a2b71e` and applied the following small failure-path cleanup as a disclosed integration-only test fix; this reviewer read that narrow working-tree diff and confirms it closes/restores before rethrowing while preserving normal release. It does not reopen the previously reviewed uploader or establish native product acceptance.

## P3: unreadable precondition can strand its own exclusive handle

`apps/windows/tests/uploader.test.ts:879–881` opens the Windows exclusive handle, then asserts that another open returns EBUSY, and only afterward returns its release function. The caller obtains `release = change(dir)` at `:921`, before its `try/finally`. If that precondition assertion throws, no release function reaches the caller; the held fd remains open. It can impede temporary-file cleanup and add a secondary error to the actual unsupported-runtime/test-precondition failure. The POSIX branch at `:883–885` has the analogous mode-restoration gap when its EACCES precondition fails.

A focused probe executes **the exact extracted helper** after Node's built-in TypeScript stripping, with filesystem doubles only:

| Simulated Windows second open | Observed cleanup |
| --- | --- |
| Expected EBUSY | Returned release closes the exclusive handle |
| Unexpected success | Second fd closes; failed assertion leaves exclusive fd open |
| Unexpected EACCES | Failed assertion leaves exclusive fd open |

All **3 reproduction/control checks pass**. These establish a source failure path, not a Windows OS execution result; the current passing author run does not demonstrate a leaked handle. The POSIX equivalent was source-traced, not separately executed.

Minimal correction: wrap each precondition assertion so an exception closes `held` or restores the POSIX mode before rethrowing. Preserve the normal release function, exact precondition and uploader refusal assertion. Lead has accepted this narrow cleanup; no broader test or production redesign is requested.

## Portability behavior and test strength

- `0x10000000` is verified against the installed pinned Node v24.21.0 libuv Windows header, `.tools/node-v24.21.0-linux-x64/include/node/uv/win.h:692`: `UV_FS_O_EXLOCK`. It is confined to the Windows test helper. The runtime precondition must actually observe EBUSY before uploader testing, so an unsupported interpretation fails visibly rather than passing as an unreadable-file check. No undocumented numeric flag was added to production.
- The rename case now attempts replacement and requires `EPERM` on the reported Windows/NTFS path and successful rename on POSIX. In either case the uploader must commit and every PUT's bytes must match its advertised SHA-256. This preserves the two different platform outcomes; it does not call the blocked Windows rename a successful replacement.
- The rebound `openSync` now closes **its own** newly opened fd when the after-open hook throws, before rethrowing; normal uploader closure remains the production reader's responsibility. Hook bindings restore in the existing per-case finally, and the stand-in closes there.
- All six actual race/growth/replacement cases require their mutation/attempt flag to be set. The zero-file-identity case is explicitly marked `before: true`: the intended refusal precedes the folder-flip interleaving. It remains a zero-identity refusal check, not evidence a folder swap happened. Thus the prose “each interleaving happened” should be read with this explicit exception.
- The capability probe skips **only** Windows EPERM on creation of a file symlink. Two leaf-race subtests and one static-file-link subtest carry that skip; other errors propagate. Parent-directory cases use junctions on Windows and still execute. The existing POSIX FIFO skip and four conditional real-Backend skips are separate.
- Named nested subtests preserve the assertions and make each filesystem result visible. No general platform skip or changed production expectation was introduced.

## Evidence provenance and limits

The two committed Windows files identify **Electron 44.5.1 in ELECTRON_RUN_AS_NODE mode, Node v24.21.0, win32, an NTFS temp directory, no window/display**. Their log has **34 reported tests/subtests = 26 pass + 8 skip, 0 fail**, independently recounted from the individual result lines. The 8 skips are exactly 3 file-link capability cases, 1 POSIX pipe case and 4 real-Backend cases. Duration recorded: **1793.2845 ms**.

The files do **not** include an execution command/timestamp/source hash receipt or raw provenance path. Lead confirms no further receipt is available. They remain **author-reported local Windows evidence**, not independently bound exact-source execution. In particular, the heading referencing failed hosted d3a53ca/run 36758470345 is historical failure context, not a receipt for successful execution of this corrected source. The committed candidate source and evidence hashes are independently checked, but cannot retroactively establish which bytes Windows executed.

The added Linux **34/34** real-Backend and full-suite **136 pass / 4 skip** statements have no new raw Linux run receipt in this delta. They remain author claims; this reviewer did not repeat them. The next exact-source hosted Windows run owned by lead is the independent integration gate, including observing whether the runner actually has file-link permission.

Relevant SHA-256 values:

- Candidate uploader.test.ts: `18c97c55050fc239760b3306ba40770e5e384584adcf6d1b3dfd3d8044818732`.
- windows-node-portability.txt: `90a26d0c61c0713fdd1db8d230e874e8df829bb96b624256d6bcf79f14bd58b2`.
- windows-platform-facts.json: `b815872ed74befb29687bce5c9a6f2eca13ed8e4fbdbab5b0503667baa1b43af`.

All four changed files were exported verbatim to `/tmp/windows-portability-388-export`; full identities are recorded in the machine report.

## Reproduction and outputs

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --test --test-isolation=none --test-reporter=tap \
  /tmp/windows-portability-388-cleanup-probe.mjs
```

Saved `/tmp/windows-portability-388-review.json` and `/tmp/windows-portability-388-cleanup-probe.{mjs,json,log}`. No source/repository/worker changes, sockets, Backend/DB/provider or native/desktop reruns occurred. The production parent-directory trust-boundary follow-up remains separately lead/Web-owned; this test-only delivery neither closes nor changes it.

## Integration cleanup follow-up

After this report's candidate reproduction, lead applied exactly the Windows catch-close and POSIX catch-restore described above. I read the narrow main working-tree diff; no production change is involved. Corrected uploader.test.ts SHA-256 at inspection: `fdac1ce60c56d4c7cbde6e985b88207427a52422943f46f6f3911a3232f81c4d`. Lead reports 16 targeted Linux tests/subtests passed in 246.99 ms; this is lead evidence, not a repeat run by this reviewer. The saved three-case probe deliberately preserves candidate leak expectations: its two failure-case assertions must be inverted to zero remaining handles when used as the corrected-source control. Original probe/output remain unchanged.
