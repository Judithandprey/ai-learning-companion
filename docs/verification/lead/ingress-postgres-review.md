# PostgreSQL ingress HTTP runner review

**Current disposition: APPROVE delivery plus `806edbe8`; see final targeted review.**

Historical initial review: HOLD for one owned-child cleanup-order correction. Delivery `3a543b0a72261c4a4622b15a20f05571cf419c55`, parent `86c2e9e145b0c0954166bf3ddd88f54a6add6bcd`, applied cleanly as only its four-file delta to isolated main `299788a13a7d34bbc03640695ba994f6cfa468a0` at `/tmp/ingress-postgres-review-h7zl_yu3`. Main/worker files and the lead's pending CI patch were untouched. Workflow/PONYTAIL LITE and affected requirements remain unchanged. No database, socket, child process, listener, preview, provider or network was used by this review.

## Blocker: interruption during child wait permits cleanup before proven exit

The actual supervisor `services/api/tests/postgres_http_check.py:117–124` terminates its child and calls `wait(timeout=5)`, handling only `TimeoutExpired`. A `KeyboardInterrupt` during that normal wait exits the supervisor without completing reap. The new runner explicitly translates SIGTERM to `KeyboardInterrupt` (`postgres_ingress_http_check.py:229–230`). Its outer `main` catches the interruption, then unconditionally calls actor cleanup (`:252–257`). The inner `owned_process` poll/exit assertion reports failure but cannot finish the interrupted wait or prevent the outer cleanup.

A single interrupt while an ordinary shutdown wait is in progress can therefore reach actor cleanup with the owned child still running. This contradicts the delivery's required cleanup-after-children-exit guarantee; it is not merely a PASS formatting issue. A timeout of the final kill/wait would likewise leave exit unproven. No unrelated actor/database access was observed.

Exact controlled reproduction: `/tmp/ingress-postgres-review-h7zl_yu3/owned_child_interrupt_probe.py`. It uses the real supervisor and runner `main`, replacing preflight/DB/socket/process/client boundaries; no actual signal, DB or child is needed. A fake owned process remains running and raises `KeyboardInterrupt` from wait. Actual observed sequence:

```text
owned_child_yielded
terminate_owned_child
wait_interrupted_while_child_still_running
cleanup_actor_while_child_running
exit: 1
```

Run from that scratch directory:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python owned_child_interrupt_probe.py
```

Narrow owner correction: guarantee bounded owned-child reap under interruption, or withhold database cleanup if exit cannot be proved; preserve interruption and non-PASS outcomes. Add portable composition checks for interrupted wait, timeout/kill and unproven exit. Do not weaken the permitted 0/−SIGTERM successful exit check or rerun the real database campaign to establish this control-flow correction. Root dispatched `handoff_c80e3188c860fb6cddff9891b3da1dfe` on the existing owner task.

## Other bounded observations and independent checks

- `PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_postgres_ingress_http_check.py` in the isolated candidate: **18 passed in 0.76s**. These correctly mock all DB/execution boundaries but mock the entire run for interruption tests, so they do not cover the actual child-wait/cleanup composition above.
- Exact four-file `git diff --check`: passed. No previous ingress production review or broad test suite was repeated.
- Entry preflight requires enabled assertions and the existing dedicated local `lc_p0_test` DSN guard, verifies actual DB/address read-only, and checks exact migration ledger hashes/tables read-only before creating one random actor. It does not migrate, reset or create a database. Cleanup helper uses parameterized exact-actor deletes only. The new helper does not invoke the old migration runner.
- Actual restart assertions are meaningful on the normal path: first owned child exits and is waited before a different second PID starts; second process reads exact descriptor/original bytes and replays the exact ACK; all actor documents, Frame and process record are compared. This is API process replacement, expressly not PostgreSQL restart/crash recovery. The 27 response count matches the scripted operation groups.
- Child stdout/stderr are suppressed; safe progress prints status, check label and owned PID/loopback port only. Tokens are generated in memory/environment and not printed. Error output uses exception type/function/line, not exception strings or response bodies. Final artifact hashes concern synthetic originals; no private payload was found in the committed report.
- The selector is explicitly limited to `v1` (unchanged default) and `capture_ingress`; unknown values refuse. No default app route, production auth, provider, migration or dependency change is included.

The reported real PostgreSQL 18.6 / 27-response run, first failed exit-code assumption and corrected 0/−SIGTERM evidence remain **author evidence**, not an independent DB execution. The report accurately separates synthetic starts/pixels/ink and API restart from physical-device/provider/product acceptance. Its successful normal-path evidence may be preserved while this runner correction is held. Next step: only the bounded shutdown correction and its decisive portable retest.

Bounded parallel evidence/privacy subreview completed with no additional finding: synthetic PNG, ink and envelope hashes independently match the report; 27 operations and old default v1 selection agree with source. Its evidence is `/tmp/ingress-postgres-evidence-review.md`. It did not execute the DB runner. The shutdown-order HOLD above remains the sole blocker.

## Targeted correction follow-up — final disposition supersedes HOLD

**APPROVE** correction `806edbe8b3a1c4867bcdff941fa8491fafea95de` over `3a543b0`. Its complete four-file delta was read and applied cleanly to the same isolated candidate `/tmp/ingress-postgres-review-h7zl_yu3`. No fresh general review, previous broad suite, production edit, DB, socket, actual child process, signal delivery, listener or service run occurred.

`_reap_owned_process` now bounds teardown to terminate/wait(5), then kill/wait(5), followed by a nonblocking exit check. It retains an encountered `KeyboardInterrupt`, rethrows it after proven reap, and raises `OwnedProcessNotReaped` with owned PID/cause when exit remains unknown. Ingress main then withholds cleanup, reports the retained actor/PID and interruption state, and cannot print PASS. The wrapper no longer replaces supervisor exceptions from a `finally` assertion; its normal-completion exit check still accepts only 0/−SIGTERM, excluding forced SIGKILL. `_api_process(dsn, config)` and default v1 selection remain unchanged.

Independent decisive checks, using the shared repository interpreter and `PYTHONDONTWRITEBYTECODE=1` from the isolated candidate:

- `owned_child_interrupt_probe_corrected.py` reruns the original exact supervisor/main composition with only its expected outcome changed. Observed: `owned_child_yielded → terminate_owned_child → wait_interrupted → kill_owned_child → wait_interrupted`; return **1**, owned actor/PID diagnostic with `interrupted=True`, **no cleanup invocation**. Original failing probe remains separately retained.
- `python -m pytest -q -p no:cacheprovider services/api/tests/test_postgres_ingress_http_check.py -k supervisor` — **7 passed, 18 deselected in 0.44s**. Covers interrupted wait then confirmed reap, timeout/kill/second wait, persistent interruption/timeout before and after readiness yield, and readiness failure followed by interrupted shutdown. All fake waits enforce ≤5 seconds and at most two attempts; cleanup happens only after known exit.
- `reaping_correction_controls.py` — **3 controls passed**: the exact original KeyboardInterrupt object survives successful second-wait reap; the exact original interruption also survives confirmation by the final nonblocking poll; shared supervisor signature remains `(dsn, config)`.

The author's retained successful 27-response real-HTTP rerun with PIDs `337702`/`337710` and 25-runner/95-ingress test counts remain separately attributed; this review did not repeat them. The earlier successful normal run, initial exit-code failure and shutdown-order failure remain in history. No remaining blocker in the targeted correction; lead can integrate and perform the planned main checks, with all previously stated device/provider/PG-crash/product acceptance limits unchanged.
