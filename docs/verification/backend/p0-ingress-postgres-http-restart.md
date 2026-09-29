# Capture ingress: real PostgreSQL HTTP restart

Backend P0-04/09/07 delivery, 2026-09-29 UTC. Released baseline
`ddcae31daca6f31d12a063c31526eebaca4c5b39`, merged in this worktree at
`86c2e9e145b0c0954166bf3ddd88f54a6add6bcd`. Wire versions remain ingress
0.2.4, ACK 0.2.0, originals 0.2.2 and display 0.2.3; v1 is unchanged.

## Outcome and scope

**PASS for the bounded backend persistence path:** through actual loopback HTTP,
register a synthetically authorized display source, upload exact project-authored
PNG and editable-original JSON bytes, atomically submit a Frame/process envelope,
terminate and wait for the owned API process, then start a fresh API process against
the same real PostgreSQL store. Source/version, original bytes, Frame/process record,
committed ACK and all actor documents survive unchanged. No production fix was
needed. The new runner reuses the existing process supervisor, identity adapter,
control fixture and dedicated-database/cleanup helpers; it adds no dependency,
migration, public endpoint, archive or persistent service.

Related requirements: R07/R29/R30/R35/R36/R46/R51/R52/R59 and
A12/A14/A16/A30/A31/A44. The full source and English requirements, current decisions,
task and ingress contract were refreshed; all four translation-manifest pairs match.
These references establish obligations, not full acceptance of these cases.

## Reproduce safely

Use the existing operator-provided private test DSN in `LC_TEST_DATABASE_URL`
without printing it. With the already installed backend environment, from this
worktree run:

```sh
python -m services.api.tests.postgres_ingress_http_check
python -m pytest -q services/api/tests/test_postgres_ingress_http_check.py services/api/tests/test_ingress_http.py
```

The actual execution used the shared repository `.venv/bin/python`; a private wrapper
loaded the established handoff into the environment without emitting its contents.
Normal exact-command approval permitted local sockets; permission settings were
unchanged. The runner rejects a missing/ambiguous/nonlocal/non-`lc_p0_test` DSN
before connecting, then verifies actual database/address and migration checksums
read-only before creating one random actor. It requires enabled Python assertions.
Missing, extra or altered migrations are BLOCKED: it never applies or repairs them.

Only ephemeral `127.0.0.1` listeners are used. Readiness is bounded at 15 seconds,
HTTP calls at 2 seconds, and owned-child shutdown at 5 seconds before one bounded
kill/wait attempt of at most 5 seconds (a SIGKILL exit fails acceptance). SQL/connect/lock timeouts come
from the existing dedicated-test guard. Children are supervised in the foreground,
with DSN-bearing output suppressed. SIGTERM/KeyboardInterrupt unwind through child
shutdown. Interruption remains a failure even when the child is subsequently reaped.
If exit cannot be confirmed, cleanup is withheld and the actor/PID is reported for
ownership reconciliation. SIGKILL or a host outage cannot guarantee finally execution.
No shared/preview service, PostgreSQL server, other database or other actor is stopped,
migrated, reset or cleaned. PASS is printed only after the exact-actor cleanup succeeds.

## Actual execution

Successful run completed before 2026-09-29 16:54:03 UTC; command exit **0**.
Database identity: `lc_p0_test`, PostgreSQL `18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)`.
Existing matching migrations: `0001_documents`, `0002_capture_immutability`.
Run actor: `lc-ingress-http-d8cb7b1a1abb42b2940aa115383c3dd9`.
Its cleanup completed after both API children exited.

| API process | PID | Ephemeral loopback port | Observed return code |
| --- | ---: | ---: | ---: |
| Write and initial read | 333675 | 45745 | -15 (SIGTERM) |
| Fresh process, readback and negative checks | 333683 | 41259 | -15 (SIGTERM) |

The first child's `wait()` completed before creating the second PID. Both exits
were observed and validated. The installed Uvicorn restores and re-raises SIGTERM
after graceful shutdown; `-15` is its expected supervised termination result.

| Actual HTTP operation | Status / assertion |
| --- | --- |
| PUT display, PUT PNG, PUT ink, POST full frame envelope | Four 200 responses; committed typed receipts and fully verified ACK |
| Initial GET PNG/ink | Two 200 responses; exact original bytes |
| Fresh process GET display/PNG/ink, POST exact retry | Four 200 responses; same descriptor, source/version, bytes and ACK; all actor documents unchanged |
| Changed frame geometry under the same HTTP key | 409 `idempotency_conflict`; all actor documents unchanged |
| Invalid, expired and locally revoked token: GET + POST retry each | Six 401 `unauthenticated` responses with Bearer challenge; no document changes |
| Trusted internal Stop, then GET display/PNG/ink | Three 200 responses; history remains exact |
| Stopped original PUT retry and new original PUT | Two 403 `forbidden` responses; no document changes |
| Stopped live envelope retry | 409 `capture_stopped`; no document changes |
| Source revocation, then GET PNG and ink | Two 403 `forbidden` responses withholding bytes; no document changes |
| Current persisted account authorization revoked, then GET and POST retry | Two 403 `forbidden` responses; no document changes |

All **27 HTTP responses** carry `Cache-Control: no-store`; successful/error bodies
are checked against released schemas. Source is `http-display-source`, version `1`.
The retained Frame and process record are compared directly with their submitted
objects. Stop and source/account revocation use existing trusted internal fixture
hooks, not newly mounted control/auth endpoints.

| Evidence | Size | SHA-256 |
| --- | ---: | --- |
| Synthetic PNG `http-test-png` | 124 bytes | `a042b4d9e741c392455ccd962af84be20215ba6d4922cdaf903b7cc77de490f4` |
| Synthetic editable-original JSON `http-test-editable-ink` | 52 bytes | `9891f1ae31dfa8cadc5ac812936e9ede3d0b735dfa015e03e2d511a10bcbddc0` |
| Complete envelope | canonical JSON | `67e0e762182bbf527861afdc1e6582d1536376a4ce5f3e78d04a740eaab47f60` |
| Committed/replayed ACK | canonical JSON | `46b8e1d44be411be34062887188bee5f032a33a9a55b8fecbc2938afe2778669` |
| Descriptor before/after restart | canonical JSON | `e530820fa6fae83a529a4afee4c15847cbaf359bdc2d1c65911ba844aec364c8` |
| All actor documents before/after restart/replay | canonical JSON | `f2c4a199894aaa669c44ac395bedda2b0854443b7817fa57209adc68e91848db` |

JSON hashes use sorted keys, compact separators and UTF-8; run-specific actor/time
fields make their values specific to this execution. ACK equality includes the
original received timestamp and all receipts; HTTP JSON member order is immaterial.

## Failure retained, focused checks and review

The first actual attempt reached six successful HTTP operations on PID `332836`,
port `40757`, then failed `AssertionError` at `run_http_checks:152` before restart:
the newly written test incorrectly required exit code 0. This attempt was **not a
PASS**, and no restart persistence was claimed. The existing supervisor had waited
for its child; the actor cleanup path completed without reporting an error.
Installed Uvicorn's `Server.capture_signals` confirmed its deliberate SIGTERM
re-raise. The test now records exits and accepts only 0 or `-SIGTERM`, rejecting
still-running children, SIGKILL and unexpected exits. The full bounded run above
then passed; no production assertion, data guard or permission was weakened.

- Focused checks: **113 passed in 3.04s** (18 portable runner guards + 95 existing
  ingress HTTP checks). Portable tests replace connection/execution boundaries;
  they do not stand in for the real PostgreSQL run.
- Runner guards cover wrong/missing DSNs, optimized-away assertions, ordered
  read-only preflight, exact migration checksums/tables, exact-actor cleanup after
  exceptions/interruption, no PASS on cleanup failure, sanitized failure output,
  and restoration of the previous SIGTERM handler.
- Compilation and `git diff --check` passed. An independent read-only review found
  the exit-code issue and confirmed the correction and ownership/cleanup boundaries;
  it did not claim an independent DB execution.

## Limits and next owner

This proves real PostgreSQL persistence across owned **API process** replacement,
not a PostgreSQL restart, crash/power-loss recovery, concurrent workload campaign,
source deletion retest or full v1 regression run. Start grants, stop facts, pixels,
ink and identities are synthetic. JSON byte retention does not prove a real ink
editor, Pencil input or editable device reopen. No physical capture, provider call,
AI receipt/understanding, continuous screen freshness, cross-device comprehension,
original-screen overlay, Notability import or P1/device acceptance is established.
Both core §7.1 gates remain open. The default app stays unchanged and opt-in only.
Lead owns review/integration and any subsequent targeted QA scheduling.

## Interrupted-shutdown correction after review HOLD

The successful normal run above remains valid operation evidence. A later lead
review identified an uncovered runner lifecycle defect on `3a543b0`: if
`KeyboardInterrupt` arrived inside the supervisor's shutdown `wait()`, the old
finally caught only `TimeoutExpired`. The supervisor could unwind while its child
still had `poll() == None`, and ingress `main()` would unconditionally clean the
actor. The installed SIGTERM handler can cause that interruption. The original
review's normal-shutdown check had not established interruption safety.

Backend reproduced the supplied probe before the fix, using the real supervisor
and runner main with fake socket/client/process/database boundaries. Observed
sequence: `owned_child_yielded -> terminate_owned_child ->
wait_interrupted_while_child_still_running -> cleanup_actor_while_child_running`.
Main returned 1, but the cleanup ordering was unsafe. The independently written
new regression also failed before the fix: it observed cleanup with returncode
`None` instead of a reaped child. No actual database or child process was used
for these interruption probes.

The correction is confined to the existing test supervisor, runner and regression
file. Shutdown now makes at most two attempts: terminate/wait(5), then kill/wait(5),
followed only by a nonblocking exit check. Ordinary shutdown errors and interruptions
cannot skip that bounded handling. A remembered `KeyboardInterrupt` is re-raised
after confirmed reaping, so interruption never becomes PASS. If exit remains
unconfirmed, `OwnedProcessNotReaped` preserves the cause and owned PID; main reports
the retained actor, PID and interruption state and **withholds cleanup**. The ingress
wrapper's exit-status assertion/logging runs only on normal supervisor completion,
so it cannot mask the safety exception or original interruption. Normal v1 supervisor
calling conventions, graceful termination and timeout/kill fallback remain intact.

Seven portable exact-composition regressions cover a single interrupted wait,
timeout/kill/second wait, persistent interruptions/timeouts with cleanup refusal,
and failure before the supervisor yields during readiness. Every fake wait asserts
a maximum 5-second timeout and no more than two attempts. They exercise the real
supervisor and main together; DB/socket/Popen/time are replaced explicitly.

Final focused check: **120 passed in 2.77s** (25 runner guards and 95 ingress tests).
The 25 guards passed again in 0.47s after adding the explicit interruption flag to
the withheld-cleanup diagnostic. Independent review reran the interrupted-wait and
readiness-failure compositions with fake I/O and confirmed cleanup refusal or
cleanup-after-reap with a failed campaign; no real process/DB was used for that review.
The lead-authorized single bounded real rerun then completed with exit **0** before
2026-09-29 17:05:47 UTC. It produced the same 27 expected HTTP statuses and equality
assertions documented above against existing PostgreSQL 18.6 and unchanged migrations.
Both owned children exited before the exact actor cleanup succeeded:

| Process | PID | Ephemeral loopback port | Observed return code |
| --- | ---: | ---: | ---: |
| Write/read | 337702 | 33605 | -15 |
| Fresh restart/readback/negative checks | 337710 | 39179 | -15 |

Rerun actor: `lc-ingress-http-06e1a9844e7848718a9d7680b322c81d`.
PNG/ink byte hashes and lengths are unchanged. Run-specific canonical hashes:

- Envelope: `3dfd1f57e46ab403344b957842e3598746c77ac22bbf4b13cc9279262f39ca49`.
- ACK: `f16b1617a8bf7825163ecc6791f7cbcf5dcbea2e44217cdf15a7d749193736d3`.
- Descriptor: `67ed2b23058d5611d177f98a8a92b28c496b3cba6481959dc9b69f4bbc43298b`.
- Actor documents: `e3c2e8efe067fce41da4f1b5303f8edfa74d5c06c40381ce2c8f17b0feed660a`.

No production code, PostgreSQL lifecycle, migration, preview service/data, external
provider, permissions or other actor was changed. The original exit-code failure
and prior successful run above are retained. All previously stated acceptance limits
remain; lead owns corrective review and integration.
