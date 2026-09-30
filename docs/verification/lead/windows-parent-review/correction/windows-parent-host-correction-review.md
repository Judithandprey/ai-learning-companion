# Windows host correction review — 5871981

**APPROVE the bounded WIN-HOST-01 / WIN-HOST-02 correction.** Both original defects are closed by independent real Node child-process reproductions. No new concrete blocker established in this correction's host/input cleanup paths. This is not Windows/WSL, Backend, GUI or product acceptance.

Exact candidate: `5871981524140e3be986268a941d34e99af25bb9`, parent `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`; export `/tmp/lc-windows-parent-5871981`. Current Backend/requirements came from main `6425a51`, not the older slim owner shared tree. Complete `capture-host.ts` delta and resulting file, necessary delivery-state callers, added tests, and the owner's correction section were read under unchanged affected requirements and PONYTAIL LITE. Exact host source equals Git; SHA-256 `ade5bec295cae637c993afa565f494d45c1588a4d9e7e23636bfb278d9171347`.

The supervisor now installs ChildProcess and stdin error handlers before use, awaits Node's spawn/error distinction, and awaits the one startup write within the READY bound. The original real EPIPE returns a fixed failure instead of escaping as an uncaught Socket error; its child is reaped. Actual ENOENT has no PID and returns `delivered:false`, so the caller no longer treats a nonexistent process as possibly granted. Failed kills no longer settle the `exited` promise as though the child exited, and a synchronous FIFO spawn failure removes its temporary FIFO/directory.

Delivery semantics were reviewed against the actual released `desktop_local._Lifetime.read_parent`: it cannot accept a startup prefix before the terminating LF. The production path serializes one JSON record with one final LF and makes one Node write (or explicitly completes all FIFO bytes). In the reproduced closed-input EPIPE, no full record was transferred, so false is justified. Whole-write completion proves only pipe handoff, not a grant/READY, and remains `delivered:true`. A write still pending at its bound is also true; subsequent cleanup errors do not reset it. A started process is therefore **not automatically known-unsent merely because READY is missing**. The checks below support these concrete distinctions; they do not claim universal measurement of every Windows/WSL pipe failure.

## Executed evidence

```sh
.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-host-correction-probes.mjs \
  > /tmp/windows-parent-host-correction-probes.log 2>&1
```

Run from `/home/agentsdock/Projects/learning-companion/repo`, pinned Node 24.21.0. **5 groups passed, exit 0, zero transport calls**:

| Case | Actual observation |
| --- | --- |
| Original asynchronous spawn ENOENT | No PID; actual ENOENT; fixed not-started result, `delivered:false` |
| Original closed-input EPIPE | Actual child FD 0 closed before the write; actual Socket EPIPE; bounded failure, `delivered:false`; child exit 0 and `/proc/PID` absent |
| Complete LF record consumed, no valid READY | Real POSIX child successfully reads a whole line and emits a non-READY witness; `delivered:true`; child reaped |
| Startup write pending at the deadline | Real pipe deliberately prefilled as a non-protocol capacity control; `delivered:true`; owned child killed/reaped with SIGTERM |
| Synchronous FIFO spawn exception | Fixed not-started result, `delivered:false`; exact temporary FIFO and directory removed |

Artifacts: `/tmp/windows-parent-host-correction-probes.mjs`, `.json`, `.log`. Probe SHA-256 `fb9990fede9a81e4ad08e808bfd76e8e748a55cf9e9ba30c924d18f067f26853`; JSON/log SHA-256 `3b38ab0513105d7b4b8bcdd430785562abb868c09cb3f2ad626781de9261c715`.

An initial helper written with nested Node exited without the required stdout witness, so that control was invalid and was replaced by the witnessed POSIX whole-line read. Its assertion log is preserved as `/tmp/windows-parent-host-correction-harness-initial.log`; it is not counted as a product failure or pass. The original d6ef68a failure probe/report/logs remain unchanged.

Only these correction probes and the exact-source comparison were run here. No full suite, Backend service/listener, database, Windows/WSL, GUI, display or provider was run, and no repository/worker file was changed. Root's 115-test/build receipt is separate evidence; owner test claims are not substituted for these probes. Other coordinator/UI corrections remain their reviewers' scope. Root may integrate the reviewed correction and hand the resulting candidate to the already planned real Windows QA pass.
