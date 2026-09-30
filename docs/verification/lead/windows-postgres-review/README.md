# Windows durable-archive integration

Backend **ea692bc91b5aff70804d80dbbe52afc4816ca989** integrates as **555941c**.
Only tests and evidence changed; production API, contracts, dependencies and
migrations remain unchanged. [Independent review](review.md) approves the exact
seven-file delivery: 28 focused portable checks and a separate source/log/fixture
hash audit pass. No database or API process was started by that review.

The [author result](../../backend/windows-runtime-postgres.md) records one actual
PostgreSQL 18.6 `lc_p0_test` run: 30 HTTP checks, six groups, separate raw/composed
PNG and editable JSON originals, two API processes with the first reaped before
restart, exact source/ACK/Learning readback, retry/auth/Stop/revocation and confirmed
exact-actor cleanup. The author log is preserved; this was not a database-server
restart, native acquisition or real AI test. The user-preview database was untouched.

On integrated **555941c**, the existing isolated interpreter ran the Windows,
ingress and desktop PostgreSQL runner guard files plus the extracted fixture's
original/replay case: **65 passed in 0.59s** ([output](main-tests.txt)). These
portable tests mock process/DB boundaries; they are not another PostgreSQL run.
No previously completed real-DB campaign was repeated.

Delivery receipt: `handoff_403b9a72a81a7c9f57856a010e042a2e` at
2026-09-30 15:16:51 UTC. Next Lead action: integrate independent API QA and route
any concrete defect to Backend; coordinate native original-byte transport without
claiming provider or complete desktop acceptance. Both §7.1 gates remain open.
