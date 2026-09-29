# Real ingress HTTP restart: integration checkpoint

Current state **reviewed and integrated through main `3debf1c`**; the original HOLD below is historical. Actual Backend delivery
`handoff_1254c2b4d3aebfcc4587ddf87a1ebd61` provides
`3a543b0a72261c4a4622b15a20f05571cf419c55`, parent `86c2e9e` (normal merge of
released `ddcae31`). Only three module test files and owner evidence change;
production handlers, contracts, migrations and dependencies are untouched.

Owner reports an actual `lc_p0_test` PostgreSQL18.6 run with27 expected HTTP
responses, API processes333675 and333683 observed exiting with-SIGTERM, exact
source/version,124-byte PNG,52-byte editable-original JSON and committed ACK
retained across process replacement. Its first run failed an incorrect exit0-only
assertion; that failure and the bounded corrected run are retained in the delivered
report. This is **owner DB evidence**, not lead/independent DB execution or device,
provider, crash-durability, editable UI or full-product acceptance.

[Independent review](ingress-postgres-review.md) approves the meaningful normal-path
assertions/isolation but reproduces one lifecycle gap: KeyboardInterrupt during
`_api_process` wait can reach outer actor cleanup while the child remains alive.
The new SIGTERM handler raises the same exception. Exit failure reporting alone
does not guarantee cleanup-after-reap ordering.

Independent18 new portable guard tests passed. Lead also executed the exact
controlled supervisor/main probe:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python \
  /tmp/ingress-postgres-review-h7zl_yu3/owned_child_interrupt_probe.py
```

Observed runner exit1 and sequence `owned_child_yielded → terminate_owned_child →
wait_interrupted_while_child_still_running → cleanup_actor_while_child_running`.
The probe uses replaced socket/process/DB boundaries; **no real DB, listener or
child process** was used. Normal successful-run evidence does not close this gap.

Same-task correction `handoff_c80e3188c860fb6cddff9891b3da1dfe` was
accepted/unread, then actual corrective start
`handoff_eb876282202b52857709582e5eb5b4d1` arrived at2026-09-29 17:02:23 UTC.
Backend reproduced the exact supplied probe on clean `3a543b0` and reports working
only on this supervisor/runner lifecycle repair and its exact-composition checks.
No corrective result is yet claimed. Backend must guarantee bounded owned-child reap under interruption
or withhold actor cleanup when exit remains unproven, retain interruption/non-PASS,
and cover interrupted wait, timeout/kill/wait and incomplete ownership. No repeated
full legacy campaign, broad kill, database restart or new product code is requested.
Current `lc_desktop_preview`, user services/tokens and Paperclip remain untouched.

Next owner: Backend supplies the narrow corrective SHA and focused evidence; lead
retests the exact composition and integrates reviewed runner changes. No DB test
success is fabricated on main while the candidate is held. Current published
capture-ingress production implementation and its earlier main/CI checks remain.


## Corrective delivery and integrated main result

Actual reply `handoff_6e585ea89722f92e6c5b051744408c5c` delivered correction
`806edbe8b3a1c4867bcdff941fa8491fafea95de`. Lead integrated `3a543b0` as
`2c02f8c` and `806edbe8` as `3debf1c`, preserving the unrelated uncommitted native
CI preparation. Independent targeted review approves the original interruption
probe, seven exact composition regressions and three interruption/signature controls.
The old HOLD and its initial failed behavior remain above and in the linked review.

Actual integrated-main command:

```sh
env -u LC_DATABASE_URL -u LC_TEST_DATABASE_URL .venv/bin/python -m pytest -q \
  services/api/tests/test_postgres_ingress_http_check.py \
  services/api/tests/test_postgres_check.py services/api/tests/test_ingress_http.py
```

**139 passed in2.70s.** Lead also ran the corrected original probe through runpy
with imports verified from this main: runner returns1, exactly two bounded attempts,
then retained actor/PID diagnostic and **no cleanup** while exit is unconfirmed.
The probe itself passes; its deliberate FAILED diagnostic is the required refusal,
not an actual orphan process. All I/O/process/DB boundaries in that probe are doubles.
`git diff --check` passed. No lead DB rerun or full previous campaign occurred.

[Integrated owner evidence](../backend/p0-ingress-postgres-http-restart.md) retains
its final real27-response PostgreSQL18.6 run with PIDs337702/337710, exact-byte and
ACK equality, 0/-SIGTERM exit rule and cleanup after both API processes exited.
Source/ink/start facts are synthetic; no production handler or migration changed.
That is real API-process restart evidence by Backend, separately from independent
portable review/main checks, actual PostgreSQL crash recovery or device/provider QA.

The next same-card Backend unit is the bounded authorized process-context read in
[P0-09](../../tasks.md#p0-09--backend-process-persistence), supplying existing Learning
composition with coherent stored records/sources/frames. It adds no wire protocol,
provider, identity, archive, endpoint or default activation. Lead supplies exact
published baseline and native receipt after the normal push. Native/QA current
work remains; the two core gates are still unaccepted.
