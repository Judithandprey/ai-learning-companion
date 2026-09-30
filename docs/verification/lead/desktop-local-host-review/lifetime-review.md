# Desktop local host lifecycle review

**APPROVE** for this bounded lifecycle/persistence-runner scope. No demonstrated blocker in exact Backend commit `deec5f4c8e3439c4ef05521ac442554a81415dbf`, direct parent `6a913a23bd49913f6d66cb2aa5312462e7064825`. This is not native Windows/macOS or full-product acceptance.

Candidate exported to `/tmp/desktop-local-deec-lifetime-review-otj_uk0a`. All seven delivered files were byte-compared to their exact Git objects; hashes are in `/tmp/desktop-local-deec-lifetime-review.json`. No repository/worker edits, commits, database calls, HTTP requests, provider/display operations, dependency installs, preview or Paperclip interaction were performed. Root was observed clean at `8ea8fdf7edb236fa996389de9cbd7dbc7e08ca9b`.

## Scope and source findings

Read the full new host, PostgreSQL runner, guard tests, affected host tests and owner evidence; followed the unchanged runtime provisioning and inherited DB/supervisor helpers. Applied project PONYTAIL LITE: reuse existing runtime, MemoryStore and standard-library process probes; no new production layer or broad regression campaign. Context includes current decisions, R02/R03/R35/R36/R51/R52, A12/A14/A16/A30/A31 and full lifecycle/core-loop clauses §3.9/§7.1 in source and English. Parser/auth/Host details belong to the other assigned reviewer.

- `services/api/desktop_local.py:128–181`: the parent-reader and watchdog own only process-lifetime state. EOF, further input, read loss and signals request stop; a separate watchdog bounds blocked synchronous initialization/requests and uses abnormal exit rather than claiming a completed control Stop.
- `services/api/desktop_local.py:212–255`: startup checks stop both before and after ASGI startup; one bounded, nonsecret ready record reports only origin and start status. Uvicorn is one foreground server, with private signal ownership and a shutdown monitor. No worker/reloader process is launched.
- `services/api/desktop_local.py:258–309`: exact loopback address is reserved before `PostgresStore`/runtime provisioning. Stop is rechecked at the binding/provisioning/server boundaries; finally closes the owned socket, completes watchdog lifetime and restores handlers/logging. Fixed classifications redact exception/input content.
- `services/api/tests/postgres_desktop_local_check.py:78–118`: credentials enter only the retained private stdin pipe, known DSN/config environment variables are removed, argv contains only Python/module names, readiness precedes the HTTP client, proxy environment is disabled, and diagnostics use a temporary file rather than an unconsumed stderr pipe. The runner reaps its own PID before reading final output/accepting normal shutdown.
- `services/api/tests/postgres_desktop_local_check.py:303–342`, with `postgres_check.py:36/62/359`, `postgres_ingress_http_check.py:42`, `postgres_desktop_runtime_check.py:53` and `postgres_http_check.py:42`: the runner requires enabled assertions, a normalized dedicated `lc_p0_test` DSN, actual local DB identity, exact existing migration hashes and a pristine unique actor before ownership begins. It applies no migration. Cleanup is parameterized to that actor only, follows child reaping, and is explicitly withheld when `OwnedProcessNotReaped` leaves lifetime uncertain. Sanitized failure output does not print arbitrary exception messages.
- The actual fresh-consent factory reuses the existing actor transaction and authority/control records. Host process exit neither deletes originals nor writes Stop/withdrawal; those are explicit control operations. The runner proves persistence/denial assertions before emitting the corresponding final PASS evidence.

## Independent executed probes

Six probes passed against the exact exported production host, using a real owned Linux child and real ephemeral numeric loopback sockets, with only `PostgresStore` replaced by MemoryStore and test-only deterministic boundary hooks. No HTTP calls were needed. The startup/shutdown constants were shortened to 2.0/0.8 seconds in the child; production remains 10/5 seconds. Total approved command wall time was 5.580 seconds.

| Probe | Observed result |
| --- | --- |
| EOF observed while bound socket is returning | Exit 0, no READY, zero store/factory calls, pristine store |
| Secret-bearing extra input observed while bound socket is returning | Exit 1, fixed `unexpected_input`, no READY, zero store/factory calls, pristine store, no secret echo |
| EOF after actual MemoryStore provisioning, before ASGI startup | Exit 0, no READY, provisioned documents unchanged |
| Parent closes readiness stdout before startup writes READY | Exit 1, fixed `unavailable`, no successful READY, provisioned documents unchanged |
| SIGINT after exact pending READY | Exit 0, exactly one READY, no diagnostics, provisioned documents unchanged |
| Synchronous factory remains blocked while parent input stays open | Watchdog forces exit 1 with `startup_timeout`, no READY; 3.087 seconds including Python imports; normal finally completion was not falsely observed |

Every child was confirmed reaped and every reserved port could be rebound after exit. Probe source SHA-256: `168c1f19501494963d346999503e157d8d9c13ebb77cce5fdc1aa152b78fd919`.

The initial sandbox execution failed before binding with fixed `unavailable`; an isolated standard-library socket attempt confirmed `PermissionError: EPERM` at socket creation. The exact scoped command subsequently passed normal approval. This was an environment restriction, not an accepted product failure or a bypassed denial.

Reproduce the six checks:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/desktop-local-deec-lifetime-probes.py /tmp/desktop-local-deec-lifetime-review-otj_uk0a
```

Executable source: `/tmp/desktop-local-deec-lifetime-probes.py`; full observations: `/tmp/desktop-local-deec-lifetime-probes.json`; combined machine review: `/tmp/desktop-local-deec-lifetime-review.json`.

## Evidence classification and retained boundaries

The delivered JSON contains exactly 37 HTTP entries, four outcome groups and four distinct process PIDs, each returning 0, with one explicit fresh start and three false-consent reopens. Its statuses and groups correspond to the runner's actual exact-document/original/ACK, rotated-token, Stop and withdrawal assertions. The docs correctly identify synthetic Windows frame/PNG/ink inputs and Linux execution. The dedicated PostgreSQL 18.6 run remains **owner execution evidence**, not independently rerun here. Lead separately reports that all 131 portable checks passed and the retained DB log SHA/37-response JSON matched; those are not added to this review's six independently executed probes.

Preserve the demonstrated reconciliation boundary: once provisioning has committed, parent loss or a broken readiness channel does not roll it back. This matches `services/api/README.md:606–611`; the trusted parent retains registration/keys, reopens with `fresh_consent=false` and reads current control state. Absence of READY is not proof that no authorization document was written. Host exit is not physical stop evidence.

Windows/macOS executable integration, native pipe/signal semantics, physical capture/pen/provider behavior and both §7.1 gates remain unverified. Linux SIGINT/SIGTERM results do not establish Windows `TerminateProcess` behavior. No source correction is requested; Lead may integrate this delivery within these limits.
