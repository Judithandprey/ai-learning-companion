# Desktop runtime: PostgreSQL save, owned API restart and Learning readback

Lead task `handoff_c5e3c42e025b59f58743bbfe67d3f8f9`, published baseline
`01240dff25819efe543f61e54d925a95462d555c`, normally merged into `team/backend` at
`fe95d7448ae7ca17d9cfd3acc97a241e8eb26079`. The preceding in-process desktop runtime
delivery remains separately documented in [desktop-capture-runtime.md](desktop-capture-runtime.md).

## Actual result

On 2026-09-30 UTC the dedicated local **PostgreSQL 18.6 `lc_p0_test`** run exited
**0**: **24 real HTTP checks and five persistence/context groups passed**.
The [unmodified sanitized stdout/stderr](desktop-runtime-postgres-run.txt) records
every HTTP status, owned PID, ephemeral loopback port, graceful exit and hashes.

- Unique actor: `lc-desktop-http-3e1a664e7b4e47d589dadbbcc40cf926`. Read-only checks
  established absence of the actor and its documents before accepting cleanup
  ownership. Only this actor was created and cleaned by this run.
- First API PID **594645** initialized its pristine archive through the actual
  runtime factory with explicit synthetic fresh consent. HTTP registration and
  display registration preceded a first frameless gap. There were no pixel or
  artifact rows at that point, and Learning returned `missing_frame` with zero
  attached bytes.
- The same API saved project-authored PNG and editable-ink bytes and a desktop
  0.2.7 descriptor through the released desktop 0.2.8 envelope. HTTP readback
  validated exact original bytes and references. Actual authorized Learning
  composition retained both gap and frame, exact records/source/metadata,
  uncertainty, and the parent relationship. Clock fields, including decimal
  UInt64 ticks, were covered by full descriptor equality.
- The first process exited with **-15 (SIGTERM)** before PID **594674** started.
  The second used `fresh_consent=False`, unchanged identity/pins/registration and
  a new ephemeral token. It reconciled the consumed original grant. Original
  PNG/ink reads, source/version, first-gap and framed ACK retries, and the entire
  Learning context were identical. All retained documents matched the pre-restart
  snapshot hash `1945b606513b1f9fa88701a6484bb83c235e8437c6e832a4b50ce4665a09ef8e`.
- Changed-envelope retry returned 409; the former process token returned 401.
  HTTP Stop retained historical originals/context and current registration state,
  while both exact live retry and a new live gap returned 409. A false-consent
  factory reconciliation retained the stopped state without a new grant.
- Current account revocation returned 403 for original read, desktop replay and
  the already-bound Learning reader. This last check reached the reader rather
  than merely failing runtime construction. Refusals left documents unchanged.
  Both ephemeral tokens were absent from stored records.
- The second API exited with **-15** before exact-actor cleanup. PASS was emitted
  only after cleanup completed. No database/service restart occurred.

The migration ledger was checked read-only against existing `0001_documents`,
`0002_capture_immutability`, and `0003_raw_capture_frame` hashes. No migration was
applied or changed. No implementation defect was observed; production code is
unchanged.

## Runner and execution

The new scenario is `services/api/tests/postgres_desktop_runtime_check.py`. It
reuses the existing ingress runner's dedicated DSN/actual database/migration
preflight, reporting and actor cleanup, plus the existing bounded API supervisor.
The supervisor's only new app selection uses the actual trusted runtime factory.
Because that runtime intentionally has no `/openapi.json`, readiness uses a
read-only unauthenticated control request and requires the exact 0.2.1 401 body.
No public endpoint, runtime manager, store, source schema or dependency was added.

The executed command below read the established operator handoff privately. The
path identifies the handoff; no DSN value or connection parameters are published.
The resulting `.log` was renamed to the linked `.txt` without changing contents.

```sh
set -o pipefail
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python - <<'PY' 2>&1 | tee docs/verification/backend/desktop-runtime-postgres-run.log
import os
from pathlib import Path
os.environ['LC_TEST_DATABASE_URL'] = Path('/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn').read_text().strip()
from services.api.tests.postgres_desktop_runtime_check import main
raise SystemExit(main(desktop_runtime=True))
PY
```

For an environment already supplied privately with `LC_TEST_DATABASE_URL`, the
equivalent reusable entry is:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.api.tests.postgres_desktop_runtime_check
```

A preliminary invocation without a DSN exited **2 / BLOCKED**, as intended; it
was not counted as a database run. The actual authorized run above passed on its
first attempt. Exact-command approval was used for the dedicated local database
and loopback child execution without changing sandbox settings.

## Review, portable checks and limits

Independent review identified two test-runner issues before database execution:
reconstructing the runtime after revocation would mask the intended Learning
reader check, and fallible `finally` exit logging could mask an unreaped-child
exception. The final runner keeps a current authorized reader per process phase
and logs successful exits after the supervisor returns. Unconfirmed child exit
propagates unchanged so actor cleanup remains withheld. No runtime assertion was
weakened to obtain the PostgreSQL result.

The existing portable ingress/supervisor guards passed **25 tests in 0.26s**:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_postgres_ingress_http_check.py
```

The new portable desktop runner guards passed **15 tests in 0.32s** in the
independent author's run and **15 in 0.44s** in the final owner run:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_postgres_desktop_runtime_check.py
```

There are **40 distinct portable tests**, separate from the actual PostgreSQL
execution. The added cases refuse missing/preview/nonlocal targets before actor
mutation, check migration/identity failures and read-only actor collision, retain
cleanup ownership on unconfirmed process exit, withhold PASS on cleanup failure,
forward unchanged registration pins and false reopen consent, and reject an
incorrect readiness status or contract. All database/socket/process boundaries
in these portable tests are replaced; they do not establish database acceptance.
`git diff --check` passed. The evidence log was checked to contain 24 HTTP results,
five groups, two distinct confirmed-exit PIDs and no connection values or tokens.

This is actual PostgreSQL persistence and an actual API process restart using
synthetic identities, consent, native metadata and project-authored originals.
The fixture scratch MemoryStore only constructs request values; all acceptance
writes, retained records, original readback and Learning reads use PostgresStore.
Learning carries ink references; separate HTTP GET/decode checks prove original
ink bytes, rather than claiming that the image packet loads editable strokes.

No native mapper/capture, OS permission, real provider, audio, user preview,
Notability import, mobile campaign or database recovery was tested. The user's
`lc_desktop_preview`, preview identities/tokens/ports/services and Paperclip were
not used. No old accepted database suite or broad application suite was rerun.
Provider receipt remains `not_attested`, presentation permission `not_granted`,
capture chronology `unknown`; this is not real AI understanding or target-device
acceptance. Full R07/R27/R35/R36/R51/R52/R58, A12/A14/A16/A27/A30/A31 and the two
per-desktop §7.1 gates retain their remaining product requirements.

Next owner: lead integrated review, then independent QA on the consolidated
host/producer boundary. Actual OS consent, secure host token delivery, native
lifecycle, real provider receipt and both desktop product gates remain separate.
