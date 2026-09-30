# Windows parent host/transport review

**HOLD** exact `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`: two reproduced startup-pipe failure defects in `capture-host.ts`. No additional blocker established in the bounded `loopback-http.ts` / uploader transport delta review. No production files changed.

Scope: entire `capture-host.ts` and `loopback-http.ts`, uploader transport delta from owner baseline `5dc8493`, their tests, and necessary `capture-link.ts` callers. Candidate read from `/tmp/lc-windows-parent-d6ef68a`; six relevant exported source/test/report files were independently compared byte-for-byte to Git. Current Backend/contracts read from main `10542360d272cc49e470fb5501a77af0b8dea8fb`, **not** the slim owner export. Refreshed affected original/English §3.9, §7.1–7.2, §7.4 and current decisions; relevant specification revision remains `adffdd5c4282286ee1066fbcd03a124d3dd11bb2`. Applied project workflow / PONYTAIL LITE. Preserve local originals, explicit per-stream consent/Stop and unknown writes; a development host is not product/provider acceptance.

## P1 — asynchronous startup input error is unhandled

**Location:** `apps/windows/src/main/capture-host.ts:216` (also input cleanup at 173; child error listener at 162 does not listen to stdin).

The WSL launch path calls `child.stdin.write(text)` inside a synchronous try/catch, without a stdin `error` listener or write completion handling. A child that exits or closes its input before that write can cause Node's actual Socket to emit `EPIPE` asynchronously. The ChildProcess `error` listener does not receive the Socket's error. The intended bounded `HostStart` refusal and cleanup never handle it.

Independent reproduction uses exact `startHost`, pinned Node 24.21.0 and a real, harmless owned shell child whose stdin is closed before the write. The spawn seam controls scheduling only; it does not fabricate an Error or replace the writable implementation. Actual result: **exit 1, `Unhandled 'error' event`, `Error: write EPIPE`**, stack at candidate line 216. A control with the same real child and a stdin error listener observes `EPIPE`, the child exits 0, and the parent stays alive. No Backend, socket listener, database, GUI or WSL was launched.

Impact: an ordinary helper startup/input failure escapes the link's failure handling into the application's main-process error path. The Node entrypoint terminates in this reproduction. Actual Electron UI/exit behavior was not tested; no claim of observed original-data loss is made. It must fail the optional capture link safely rather than expose an uncaught main-process error.

**Smallest required correction:** handle the private input stream's asynchronous failures before writing, return a redacted bounded startup failure, and close/reap the owned child on that path. Preserve uncertainty if a complete startup may already have reached the host. Add a closed-input/EPIPE regression, not only a synchronous thrown spawn or invalid DSN test.

## P2 — a child that never spawned is marked delivered

**Location:** `apps/windows/src/main/capture-host.ts:151–165,216–218`; consequence through `capture-link.ts:470–474,762–773,871–875`.

With an actual nonexistent executable, Node `spawn` returns a ChildProcess and reports `ENOENT` asynchronously. The supervisor immediately queues the startup record and sets `delivered = true`; the later spawn error resolves `exited`, and `startHost` returns:

```json
{"ok":false,"reason":"the host ended without READY","exit":{"code":null,"signal":null,"error":null},"delivered":true}
```

No child process existed, so no grant could have been committed. The caller takes `delivered` as `a.asked = true`; Stop retains `requested_unknown` rather than abandoning the known-unsent grant. Subsequent no-consent reconciliation cannot find a grant that was never created, leaving a false earlier-unknown record. This is a truthful-recovery defect, not unauthorized fresh consent. The existing test named “host was never started” only rejects the DSN before `startHost`, so it does not cover this path.

**Smallest required correction:** distinguish an asynchronous failure to spawn from an exited child that may have received startup bytes. A known failed spawn must return `delivered: false`; do not clear uncertainty merely because a successfully started child exits without READY. Cover actual ENOENT/no-process separately from EPIPE/partial-delivery cases.

## Evidence and commands

Run from the repository; no install needed:

```sh
.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-host-probes.mjs \
  > /tmp/windows-parent-host-probes.log
.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-host-probes.mjs closed-input \
  > /tmp/windows-parent-host-closed-input.log 2>&1
.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-host-control.mjs \
  > /tmp/windows-parent-host-control.json
```

The direct `closed-input` command intentionally exits 1 on the current defect. The control exits 0 and records an actual child PID, no ChildProcess spawn error, stdin `EPIPE`, and child exit 0. The first command preserves both cases in `/tmp/windows-parent-host-probes.json`; its nested `spawnSync` receipt also carried an environment-specific `EPERM` metadata field despite returning the child's exit/output. The scheduling control likewise records that field with status 0. It is preserved, not treated as a product finding; the separate direct invocation establishes the actual unhandled EPIPE without depending on the outer nested harness result.

Source receipt: `/tmp/windows-parent-host-source.json`. Probe SHA-256 `7940b0b3248db101e22f80b8a615eeeb4d3d0459910ae0581eddb597ded73e01`; direct failure log `4fde87efaa6cab07adb6f96a75cd915fa386936519a62e86b3ff32c1f7f979a9`; control script `c17f86c1a8c0b3644717f2cb8081c704c7952a4655ce81b6d4230709f637859e`.

## Checked limits and unaffected behavior

- Explicit `begin` is the only caller reaching `connect(a, true)`. Host renewal/reconciliation/Stop paths supply false; `startHost` forwards rather than synthesizes consent. Current Backend requires the exact existing pending/consumed grant when fresh consent is false. READY/reachability is not acquisition or live-capture authority.
- The DSN/token are serialized only to the private startup record in this path; launch argv do not contain them. The environment removes `LC_*`, `WSLENV`, `PYTHON*` and `PG*`; stderr is capped at 4096 bytes and returns only fixed host error codes. READY is bounded and shape/origin checked. These are source checks, not a Windows `/proc` or WSL environment acceptance run.
- FIFO startup uses a private directory/mode-600 FIFO, nonblocking open/write, and unlink after opening. EOF is the normal end; one memoized end path closes input, waits, and kills only the child on timeout. Killing `wsl.exe` is correctly not claimed to prove the Linux host ended. The two findings above are the remaining examined startup failure holes.
- The new `node:http` transport sets the actual numeric Host/Content-Length and does not add browser Origin/sec-fetch headers, matching current `_ParentOnly` admission. It does not follow redirects or reuse an agent connection. It bounds retained response bytes and forwards AbortSignal; the Node timeout is a socket inactivity timeout, not an independently enforced wall-clock deadline. No live HTTP-header/Windows run was performed in this review; relevant authored header/refusal tests were inspected, not rerun.
- The uploader still clones authority/job inputs before awaiting, validates loopback origin, and uses finite diagnostic allowlists. A fresh ECONNREFUSED is known unsent; a prior doubtful send is retained across later ECONNREFUSED, refusal, cancellation or expiry. No new identities/bytes are substituted for retries. No additional blocking transport-delta defect was found.
- Owner memory-host and owned-DB reports were read as claims. This review did not rerun those services or the full suite. No GUI/display, provider, shared DB, real Windows/WSL host, bootstrap acceptance, or product gate was exercised. Root owns integration and main checks; Web owns one bounded correction covering these related startup-pipe cases.
