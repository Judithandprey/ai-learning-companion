# Real ingress HTTP restart: integration checkpoint

Current state **HOLD for one test-supervisor correction**. Actual Backend delivery
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
