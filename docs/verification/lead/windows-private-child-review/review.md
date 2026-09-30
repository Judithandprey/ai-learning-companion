# Support private-child evidence audit

**APPROVE as bounded Support execution evidence, with the provenance qualifications below.** No probe, product host, DB, listener, GUI, provider, Windows executable or WSL command was executed in this review. No repository edits were made.

Exact commit: `c5f0d5a989ce7666114e03987d9dfd45f00e82b1`; parent `61c3cadc1c8163a5befc47a3ace91e9a2289290f`. Its six additive files were exported from Git to `/tmp/support-c5-review-6enxncvb`; hashes and receipt-level checks are in `/tmp/support-c5-review-audit.json`.

## Receipt audit

| Retained receipt | Actual outcome |
| --- | --- |
| `windows-private-pipe-observed.json` | Seven observations: four native cases and WSL incomplete EOF pass; two WSL immediate HTTP requests fail with `ECONNREFUSED`. The original WSL extra-input stage was not reached. Overall false is preserved. |
| `windows-wsl-delayed-observed.json` | One diagnostic: one-second-delayed HTTP 200, EOF exit 0 after 66 ms, then the harness incorrectly rejects `ECONNRESET` versus `ECONNREFUSED`. Overall false and diagnostic error are preserved. |
| `windows-wsl-confirmed-observed.json` | Two observations pass after the harness correction: delayed HTTP 200, normal EOF exit 0 after 69 ms; extra-input exit 2 after 68 ms. Both retain cleanup-exit tuples and post-exit `ECONNRESET`. |

These are ten historical observations (seven pass, three fail), not ten independent acceptance cases or an all-pass first run. The report presents their sequence honestly and does not discard the initial WSL refusal/delayed diagnostic.

All eight READY receipts independently match reconstructed synthetic record bytes, including their SHA-256 and UTF-8 length: 139 bytes normally and 143 for `ignore_eof`. All report FIFO/non-TTY input. Native records show Windows Node 24.19.0 and Python 3.13.14, with Python PID equal to the directly owned launcher PID. WSL records correctly distinguish Windows launcher PIDs from Linux Python 3.14.4 PIDs and identify the existing project venv. All recorded origins are numeric loopback and avoid 4173/8174. Native force termination is explicitly abnormal and does not establish a graceful Python SIGTERM handler or product Stop.

## Script and scope audit

The 132-line Python probe uses only the standard library, one synthetic record, an OS-assigned `127.0.0.1` HTTPServer and a daemon 12-second process failsafe. It imports no application or DB code, stores no product data, disables HTTP access logging and emits fixed error markers. The source file is read as an absolute script under isolated startup; this does not establish `python -m services.api.desktop_local` import behavior.

The 192-line Node probe uses built-ins, separate spawn arguments, `shell:false`, hidden windows and private pipes; no detach or process-group kill exists. It checks readiness/input equality before HTTP, uses one optional bounded diagnostic delay, bounds HTTP/output/waits, closes its owned stdin and observes child closure. The explicit force case requires a native route and equality between returned Python PID and `ChildProcess.pid`. Its fallback kills only the directly owned native child; WSL is never forcibly terminated. Post-exit WSL refusal/reset is distinguished from Windows forwarder removal. The final `finally` retains cleanup timeout errors rather than dropping prior results.

No real credential appears in the synthetic payload, receipt JSON or committed scripts. The parent intentionally prints its supplied route configuration and error diagnostics; it is a synthetic harness and must not be reused to carry production credential/configuration arguments. Existing package discovery, database reachability, actual backend imports and Electron-main integration are not implemented by these scripts.

## Qualifications and limits

1. The two initially refused WSL observations contain `normal_eof` markers but **no `exit` or `cleanup_exit` tuple**. Their “all children reaped” status is a Support-reported observation, not independently recoverable from those two raw receipts. Later diagnostic/confirmation receipts do record exit and cleanup. Preserve the original records; no rerun is requested.
2. Registry discovery, isolated `find_spec` results for `uvicorn`/`psycopg`, Electron-path existence and the protected executable's direct WSL permission refusal are described in the report but absent from these three JSONs. Treat those as author inventory observations, not independently verified inventory. The actual runtimes that produced READY are directly recorded.
3. The report explicitly states that bounded-output/cleanup harness corrections happened after the native run. The initial receipt therefore is not output of the final committed parent verbatim (e.g. it lacks `cleanup_exit`); no run-time source hashes were recorded. The final source review must not silently relabel all historical runs as execution of this exact final script.
4. The two immediate failures and three delayed HTTP successes support “Linux READY did not guarantee immediate Windows reachability in this experiment.” They do not establish the WSL forwarding cause, a one-second production guarantee, listener teardown, a native distributable, credentials/authority security, real host/DB operation or either desktop product gate.

Independent checks were limited to Python `ast.parse`, pinned Linux Node `--check`, JSON consistency and exact synthetic digest reconstruction. Both syntax checks passed; **zero probes were rerun**. PONYTAIL LITE retained the existing bounded harness and failed evidence instead of adding a replacement campaign. Lead may use the route as a development-path lead while preserving the above limits and real host reconciliation requirements.
