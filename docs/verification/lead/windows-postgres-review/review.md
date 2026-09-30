# Windows durable PostgreSQL test delivery — independent review

**Approve integration of this bounded test/evidence delivery. No concrete blocker found.** Reviewed exact `ea692bc91b5aff70804d80dbbe52afc4816ca989`, parent `4b5635df62338380f7146538539e231d918264eb`. All seven changed files are tests or Backend verification evidence and match the exact exported Git bytes. Production API, contracts, dependencies and migrations are unchanged. Relevant workflow/role/requirements are unchanged from the preceding refresh; PONYTAIL LITE applied by reviewing the existing runner rather than introducing another host.

Exact export: `/tmp/backend-windows-postgres-ea692bc`. Provenance: `/tmp/backend-windows-postgres-review-source.json`. No real database, API child, listener, native app or provider was started for this review, and no configured DSN was read. Main and worker trees were not modified.

## Focused independent checks

From the exact export:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_postgres_windows_runtime_check.py \
  services/api/tests/test_windows_frame_ingress.py::test_two_png_originals_and_editable_ink_survive_exact_replay \
  services/api/tests/test_postgres_desktop_runtime_check.py::test_child_runtime_forwards_original_pins_and_explicit_consent \
  services/api/tests/test_postgres_desktop_runtime_check.py::test_child_dispatch_keeps_reopen_consent_false
```

**28 passed in 0.88s** (`/tmp/backend-windows-postgres-review-tests.log`): 24 new Windows portable guards, one MemoryStore fixture-reuse/original preservation test and three relevant Desktop forwarding/dispatch checks. The guard fixtures replace database/socket/process/HTTP boundaries; these passes do not claim PostgreSQL persistence. Did not replay the prior 65-check campaign. `git diff --check ea692bc^ ea692bc` passed.

Also ran `/tmp/backend-windows-postgres-review-evidence.py` with the same interpreter. It blocks `psycopg.connect`, `socket.socket` and `subprocess.Popen`, reconstructs only synthetic scenario values using MemoryStore, and audits the committed sanitized log. Exit **0**. Results/log are `/tmp/backend-windows-postgres-review-evidence.{json,log}`; an additional independent read-only log audit is `/tmp/backend-windows-ea692bc-evidence-audit.json`.

## Guards and actual acceptance path

- `postgres_ingress_http_check.py:230–264` rejects non-boolean/multiple runtime selections before target handling; requires assertions, exact dedicated DSN, current read-only database identity and matching migration ledger before generating the family-specific UUID actor. `postgres_check.py:39–85` still requires exact `lc_p0_test`, an explicit local endpoint, no indirect service/hostaddr, bounded connection settings and actual loopback/database identity. These are reused, not weakened.
- `postgres_desktop_runtime_check.py:47–82` requires `lc-windows-http-` plus 32 lowercase hex characters and checks both actor and document tables read-only. Collision never grants cleanup ownership. Initial child setup repeats preflight/pristine checks; reopened children carry `fresh_consent=False`, unchanged registration/pins and only the explicitly enabled Windows ingress capability/profile.
- `postgres_http_check.py:137–180` adds Windows only to the existing supervised runtime/readiness branch: inherited ephemeral loopback FD, no proxy environment, exact unauthenticated control response, process handles retained in a context manager. Existing bounded terminate/kill/reap logic is unchanged. An unconfirmed exit raises `OwnedProcessNotReaped`; `postgres_ingress_http_check.py:268–296` withholds cleanup/PASS. Cleanup remains parameterized deletes of only `[actor]`; transaction success must precede PASS. Portable Windows tests cover unreaped and failed-cleanup outcomes, wrong readiness, target refusal and collision.
- Scratch MemoryStore builds fixture values only. The acceptance path itself calls the actual runtime factory backed by PostgresStore, registers by real HTTP, writes the first gap before uploads, PUTs and GETs all original bytes, commits Windows ingress through HTTP, and reads actual stored `read_windows`/`resolve_windows` into Learning with current auth. Distinct raw/composed roles/bytes and the editable-ink reference are asserted; editable bytes are separately read/validated by HTTP.
- The first owned API exits before the second starts. Reopening uses a new PID and rotated token without fresh consent; complete documents, original reads, ACKs and Learning packets must match. Changed artifact order at the same key yields 409; the old token yields 401, with no storage mutation.
- H1 (`postgres_desktop_runtime_check.py:296–309`) first verifies an additional committed receipt for this actor, deliberately replaces only that receipt with `{}`, then requires HTTP 503 and exact unchanged corrupted storage. It is left corrupt until actor cleanup, not repaired from a retry. This is explicit test corruption, not an ordinary-client or native exploit claim.
- Stop (`:310–323`) checks stopped reconciliation/registration, refuses cached/new live submissions and preserves historical originals plus the same Learning packet without writes. Account revocation (`:325–336`) checks HTTP 403 and the **already-bound reader closure**, with no rebinding to manufacture the result and no returned partial packet. Tokens must be absent from persisted documents.

## Author-run evidence reconciled

The committed log contains **30 distinct HTTP checks** (23×200, 3×409, 1×401, 1×503, 2×403), **six distinct groups**, and two owned API PIDs/ports: `713610/38085`, then `713637/36849`. Both record exit **−15**. Log ordering is first exit → second start → second exit → PASS. PASS's HTTP/process arrays exactly equal the earlier entries and report `cleanup: own actor only, completed`. This supports the author's real PostgreSQL 18.6/owned-process run; this review did not independently reconnect to verify current DB contents or rerun cleanup.

Independently regenerated fixture bytes match all recorded artifact fields and hashes: raw PNG **124 bytes**, composed PNG **123 bytes**, editable JSON **52 bytes**. Raw/composed are distinct. Envelope/frame hashes and source identity also match the log's exact actor-bound scenario. Dynamic descriptor/ACK/database-snapshot hashes remain preserved author evidence, not independently reconstructed database evidence.

- Raw SHA-256: `a042b4d9e741c392455ccd962af84be20215ba6d4922cdaf903b7cc77de490f4`.
- Composed SHA-256: `93360bb3842af00473009b7be0237693b884bc950a5e0bec7555bb51aa187f48`.
- Editable ink SHA-256: `9891f1ae31dfa8cadc5ac812936e9ede3d0b735dfa015e03e2d511a10bcbddc0`.

The report correctly keeps evidence levels separate: real author PostgreSQL/API-process persistence with synthetic consent/identity/native metadata and project-authored pixels; independent source/log/portable review here; no PostgreSQL-server restart, native acquisition/composition, hardware pen, real provider delivery/understanding or desktop acceptance. Learning remains `provider_receipt=not_attested`, `presentation_permission=not_granted`, unknown capture chronology and references-only non-frame artifacts. Test-authored editable JSON does not close the native producer fixture's missing-original gap.
