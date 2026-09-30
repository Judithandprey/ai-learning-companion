# Windows 0.2.10: durable originals, API restart and Learning readback

Existing P0-04/07/09 task `handoff_ce8ed25f8a7107e37edc8bf686ff251e`.
Lead baseline `6a6e1ef4e0ec2414690416968fb662cb460f6c20` was normally merged into
clean `team/backend` as `4b5635df62338380f7146538539e231d918264eb`, preserving the
accepted Windows HTTP and H1 corrections. Relevant requirements, workflow, role
and prior runner files were unchanged. This task changes only module tests and
Backend evidence; no production code, shared contract, dependency or migration.

## Actual result

On 2026-09-30 UTC, the one authorized dedicated **PostgreSQL 18.6 `lc_p0_test`**
run completed on its first attempt with exit **0**: **30 actual HTTP checks and
six persistence/context groups passed**. See the [unaltered sanitized run output](windows-runtime-postgres-run.txt).

- Read-only target and migration checks accepted the existing `0001_documents`,
  `0002_capture_immutability` and `0003_raw_capture_frame` ledger. Nothing was
  migrated, repaired or restarted. A read-only pristine check established ownership
  of only `lc-windows-http-95e345fa4dc44a94896f7d0d19539c98`.
- API PID **713610**, loopback ephemeral port **38085**, created explicit synthetic
  local consent with the actual runtime factory. HTTP stream/display registration
  and the first frameless Windows gap preceded all original uploads. No artifacts
  or frames existed for that first gap; actual Learning returned `missing_frame`
  and zero attached bytes.
- The API saved a project-test raw PNG, distinct composed PNG and separate
  editable-ink JSON bytes through existing original PUT routes. A WindowsFrame
  0.2.9 and Windows ingress 0.2.10 envelope committed verified receipts. Exact
  original GET/decode and actual stored `read_windows` / `resolve_windows` ->
  Learning checks retained both image roles/bytes, source/version, descriptor,
  records, parent relation and ink reference. Learning validates supported PNG
  structure/dimensions; separate HTTP reads prove the editable original bytes.
- PID **713610 exited -15 (SIGTERM)** before PID **713637** opened ephemeral port
  **36849**. The second factory used unchanged registration/pins,
  `fresh_consent=False` and a rotated ephemeral token. Registration, source,
  originals, complete Learning packets and both gap/frame ACKs were identical.
  Every retained document matched pre-restart snapshot hash
  `2f47781887d5f75a37d3fd9b3ab6fc271fe6a97c08187dfb9112e57e1534f0e3`.
- A valid artifact-array reordering at the same HTTP key returned **409**; the
  prior process token returned **401**. Neither refusal changed storage.
- H1 was limited to an additional committed replay key inside this unique actor.
  The runner verified that receipt, replaced it with `{}` in an actor transaction,
  and retried through HTTP. It returned **503/unavailable** with all retained
  documents unchanged. The row stayed corrupt until exact-actor cleanup; it was
  never reconstructed or repaired. This deliberate corruption is separate from
  normal-input evidence and is not a native producer or ordinary-client exploit.
- HTTP Stop retained historical raw/composed/ink originals and Learning context,
  while cached and new live submissions returned **409**. False-consent runtime
  reconciliation and registration retained the stopped state without regranting.
  Current account revocation then returned **403** for original read/replay and
  the **already-bound** Learning reader; no partial packet was accepted. The
  reader was not reconstructed after revocation. Refusals left storage unchanged,
  and neither ephemeral token was persisted.
- PID **713637 exited -15** before cleanup. The existing supervisor confirmed
  both child exits. Exact-actor cleanup committed successfully before PASS was
  emitted. No user preview database/service, ports 4173/8174 or Paperclip was used.

This proves a real PostgreSQL/owned API-process persistence path for synthetic
Windows dual-image envelopes. It does not prove a PostgreSQL server restart or
native Windows capture. The earlier accepted Desktop 0.2.8 database campaign was
not rerun or counted as this Windows result.

## Reuse and execution

PONYTAIL LITE: extend `postgres_desktop_runtime_check.py` with one explicit Windows
mode, using the existing ingress preflight/actor cleanup and API supervisor. The
supervisor adds only a Windows app-kind alias to its existing runtime/readiness
path. Fixture image/descriptor construction is extracted from the existing
Windows fixture into `windows_inputs`; the scratch MemoryStore builds values
only. Every acceptance write/read and Learning resolution uses PostgresStore.
There is no second process manager, archive, identity system or public endpoint.

The following exact command used normal command approval, private environment
injection and foreground supervision. Its output is the linked sanitized log:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python - <<'PY' > docs/verification/backend/windows-runtime-postgres-run.txt 2>&1
import os
from pathlib import Path
os.environ['LC_TEST_DATABASE_URL'] = Path('/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn').read_text().strip()
from services.api.tests.postgres_desktop_runtime_check import main
raise SystemExit(main(windows_runtime=True))
PY
```

The operator READY file was read as historical setup evidence; the actual run
performed current read-only database identity and ledger checks. It requires
exact `lc_p0_test`, a local endpoint, matching installed migrations and an unused
family-specific actor. Preview/foreign targets and collisions cannot grant
cleanup ownership. Unconfirmed child exit withholds actor cleanup and PASS.

## Portable checks and review

Before the database run, independent read-only review found no blockers in target,
actor/child ownership, secrets, H1 isolation, restart/readback or current-auth
assertions. No database was accessed by that review.

Using the same interpreter with `PYTHONDONTWRITEBYTECODE=1 -m pytest -q -p no:cacheprovider`:

- `test_postgres_ingress_http_check.py` + `test_postgres_desktop_runtime_check.py`:
  **40 passed in 0.33s**. Existing supervisor, failed-preflight, cleanup and
  Desktop-mode compatibility guards still pass after shared runner changes.
- `test_postgres_windows_runtime_check.py`: author run **24 passed in 0.50s**.
  After naming the actual excluded preview database in its negative fixture, the
  final run of that file plus
  `test_windows_frame_ingress.py::test_two_png_originals_and_editable_ink_survive_exact_replay`
  gave **25 passed in 0.47s**. These cover Windows-only capability/actor isolation,
  exact false-consent forwarding, pristine collisions, wrong readiness, unconfirmed
  cleanup, synthetic dual-image/ink/gap integrity and fixture reuse.

There are **65 distinct portable/component checks**, separate from the 30 real
HTTP checks. Overlapping author/final runs are not added. An initial selection
used a nonexistent test node and ran zero tests; the corrected selections above
passed before the database run. The log audit confirmed 30 checks, six groups,
two distinct reaped children, cleanup receipt and no DSN/token fields.
`git diff --check` passed.

## Remaining limits and next owner

Consent, account, producer identity, native metadata and original content are
explicit project fixtures. Real native acquisition/composition, secure host login,
provider delivery/understanding, audio, Notability and desktop gates remain outside
this result. The native producer sample's editable-ink-original gap remains with
its owner; test-authored ink does not close it. Producer RGBA hashes remain declared
facts, not attested pixel provenance. Learning retains `not_attested` provider
receipt, `not_granted` presentation permission and unknown capture chronology.

No production identity, foreign database, new migration, durable service, native
display, provider or account operation occurred. No production defect required
scope expansion. Next owner: Lead reviews/integrates this test/evidence delivery
and coordinates the independently owned QA/Windows transport work.
