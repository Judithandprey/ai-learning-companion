# Foreground desktop capture host

This is the bounded P0-04/P0-07 local host assignment with Lead's explicit
P0-08 host-boundary delegation (`handoff_7e680a6271cb7d90dec4e0b69560ed32`).
The clean backend branch preserved the previous delivery and merged the assigned
`ef487cfcfaa7110ddb86c339c2065d0b12f21221` baseline normally, producing
`6a913a23bd49913f6d66cb2aa5312462e7064825`. No app, shared contract, root,
dependency or migration files change. Previously accepted database and Mac
archive suites are not repeated or counted as new evidence.

## Behavior and integration boundary

`python -m services.api.desktop_local` starts one foreground uvicorn child over
the existing `create_local_capture_runtime`, `PostgresStore`, control API,
original archive and explicitly enabled ingress routes. It creates no second
identity model, source store, public enrollment endpoint or persistent state.
The trusted desktop parent supplies the exact registration, pinned revisions,
explicit consent decision, ephemeral credential, authority and gates through a
bounded private stdin pipe. See the exact startup/readiness protocol in the
[API README](../../../services/api/README.md#foreground-local-desktop-capture-host).

All required fields are validated before listening. Binding is exclusively
numeric `127.0.0.1`; port 0 selects an ephemeral port. An occupied port fails
before granting consent. A single ready record exposes only the origin and
pending/consumed start-grant status. Current stream permission still requires
the original registration replay and state read; consumed is not proof of live
capture. HTTP rejects a foreign Host, browser Origin and fetch metadata; proxy
trust, CORS and access logs are disabled. Fixed errors do not echo startup
credentials or exception content.

EOF or SIGTERM ends only the owned host. The independent watchdog bounds even a
blocked synchronous factory: the startup deadline requests stop after 10 s,
then allows at most 5 s before abnormal exit; parent-loss shutdown has a 5 s
bound. These threads hold only process-lifetime state. No thread wakes this chat
or detaches project work. Host exit does not issue control Stop, attest physical
capture stop, delete source records or authorize restarting production.
Relaunch preserves the exact registration and passes `fresh_consent=false`.

The affected source/English requirements and decisions were refreshed at the
assigned baseline: R02/R03/R35/R36/R51/R52, A12/A14/A16/A30/A31, the continuous
whole-display and original-screen clauses in §7.1, desktop-first decisions and
the exit-reminder/archive continuity verification. Released control 0.2.1 and
capture ingress 0.2.4 remain intact; optional raw 0.2.6, desktop 0.2.8, Windows
0.2.10 and Mac 0.2.12 are explicit gates. The source manifest's four translated
file pairs matched their original hashes. PONYTAIL LITE reuses the existing
validators, runtime and store; the new executable is the missing parent/process
boundary, not a replacement lifecycle or schema.

## Verification

The independent portable host suite passes **97 tests in 13.94 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_desktop_local.py
```

This includes strict fields, malformed/oversized/private-pipe input, authority
and gate validation, exact pending/consumed readiness, unchanged consent and
registration forwarding, browser/Host refusals with released error versions,
disabled proxy/CORS behavior, port occupation before provisioning, redacted
factory failures, EOF/SIGTERM/extra input, incomplete startup, parent read loss
and bounded termination during both blocked startup and a blocked request.
The subprocess harness uses MemoryStore only for these host/lifetime checks;
it is not PostgreSQL evidence. Test deadlines are shortened to 3 s startup and
1 s shutdown; production retains the documented 10 s / 5 s values.

The initial **12 failed / 70 passed** run identified two production defects:
UTC timestamps were sent to the control validator instead of the existing core
validator, and immediate EOF could bypass validation of a complete malformed
record. Both were corrected; complete malformed input now fails even when EOF
immediately follows it, and stopping never authorizes provisioning. A later
**8 failed / 85 passed** run was blocked at socket creation by sandbox EPERM.
The exact loopback test command was subsequently approved normally and passed;
no assertion or permission setting was weakened. Focused boundary review also
corrected forbidden-request error versions to match each enabled route family.

The isolated PostgreSQL runner's portable ownership/supervisor guards pass
**34 tests in 0.32 s**:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_postgres_desktop_local_guard.py
```

They prohibit unmocked database, process and HTTP operations, reject other
database targets or preview ports, require pristine actor and migration checks,
protect cleanup ownership, keep private configuration out of argv/environment,
reject duplicate readiness fields, and require normal child exit code 0 for
EOF and TERM. Two initial test-only capture-buffer failures were fixed in the
guard harness; production assertions were not relaxed. Preliminary subsets
are not added to the final total of **131 distinct portable tests**.

### Actual executable with PostgreSQL

One actual run passed **37 HTTP checks in four outcome groups across four
separate host processes** against the operator's dedicated `lc_p0_test`,
PostgreSQL 18.6. Existing migrations 0001/0002/0003 were checked, not applied
or changed. The unchanged machine-readable PASS output is retained in
[desktop-local-postgres-evidence.json](desktop-local-postgres-evidence.json).

| Owned lifetime | Input and operation | Observed result |
| --- | --- | --- |
| 1 | Fresh explicit consent, pending grant; register and upload source, raw/composed PNGs, independent synthetic ink and one released Windows frame | Exact original readback and idempotent ACK; wrong token 401; EOF exits 0 |
| 2 | Same registration, `fresh_consent=false`, rotated token | Exact stored documents, originals and ACK survive; previous token 401; HTTP Stop persists with unknown physical boundary; live retry 409; SIGTERM exits 0 |
| 3 | Same registration, false consent and rotated token after Stop | Both GET and registration replay remain stopped; live retry 409; originals readable; withdrawal persists and retry returns 403; EOF exits 0 |
| 4 | Same registration, false consent and rotated token after withdrawal | GET and registration replay remain withdrawn; live and historical upload both 403; originals unchanged and readable; SIGTERM exits 0 |

All four PIDs and ephemeral numeric loopback origins appear in the JSON. Each
process was confirmed reaped before cleanup of only the unique test actor
`lc-windows-http-f655e67671784c50817c0f8ecfab41bc`. Tokens and the DSN were absent
from retained actor documents and output; the child received them only through
its open private pipe. The parent runner's private DSN environment was removed
from each child environment. Startup emitted exactly one nonsecret ready record,
with no trailing stdout or stderr. No other database or preview was used.

The exact approved foreground command was:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python - <<'PY' > /tmp/desktop-local-host-check.log 2>&1
from pathlib import Path
import os
from services.api.tests.postgres_desktop_local_check import main
os.environ['LC_TEST_DATABASE_URL'] = Path('/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn').read_text().strip()
raise SystemExit(main())
PY
```

Before normal exact-command approval, the sandbox attempt stopped during
read-only database preflight with exit 2 and this sanitized output:

```text
BLOCKED: dedicated migrated database and pristine actor required (OperationalError)
```

That attempt started no child and wrote no actor. The approved run exited 0;
no permission settings changed. Its sanitized log SHA-256 is
`26ef60bc6015c06129862654ed8f5ade6ff261ea03b9bca135352731d41b880f`.
Elapsed duration was not instrumented and is not claimed. The passed run is not
repeated solely for timing. Static parsing and final diff checks also pass.

## Limits and next owner

The operating-system execution environment is Linux. Windows/macOS executable
packaging, actual native pipe/signal handling and trusted desktop main-process
integration remain unverified. In particular, Windows `TerminateProcess` is
not the tested POSIX SIGTERM handler; normal parent shutdown closes the private
pipe and supervises the child. Local pipe possession is not OS attestation.

Synthetic PNG/ink and explicit test identities exercise released HTTP/archive
semantics; they do not establish physical screen capture, real pen behavior,
continuous provider understanding, learner presentation or either desktop core
gate. No shared display, preview port 4173/8174, production account, cloud
resource or paid provider is touched. This does not repeat or close broader
device, provider, Notability, P1 or v0.1 acceptance.

Lead owns review/integration and the Windows trusted-parent composition. The
parent must retain registration and keys, privately inject current authority,
read current state, stop its own production, and reconcile uncertain writes.
Backend delivers the executable, focused tests and this evidence; no push or
activation outside the assigned boundary is performed.
