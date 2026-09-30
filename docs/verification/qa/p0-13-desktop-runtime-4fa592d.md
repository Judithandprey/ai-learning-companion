# QA desktop runtime acceptance at `4fa592d` (real PostgreSQL, owned API restarts)

- **Assignment:** lead `handoff_68baab908d0d83d96dcc3c9b1a12d6fe`. This is one active bounded P0-13 independent
  runtime acceptance. The Windows UI pass stays the conditional next task and has not started.
- **Candidate:** published main `4fa592ddeef8615a29daf7ec317896f80847c93c`. It covers:
  - desktop frame 0.2.7 and default-off desktop ingress 0.2.8;
  - the trusted local factory `create_local_capture_runtime`;
  - the Backend dedicated PostgreSQL / owned-process runner, integrated as `915a6e0`.
- **QA branch:** `team/qa` merged the candidate normally as `de7bda9`. `services/` and `packages/` are
  byte-identical to `4fa592d`; the only difference is two older QA-only p0-06a files.
- **Decision: PASS** for the runtime, storage and context boundary tested here.
  - The real save / restart / readback / current-access boundary held in both runs, with no
    implementation defect found.
  - **One finding for the lead as contract owner:** QA-DESKTOP-RT-01, record labels not bound to the
    desktop profile. See below.
  - This is not native capture, UI, OS permission, provider or real-AI acceptance.
  - Both §7.1 gates and full Windows/macOS product acceptance remain open.

## Environment

- **Database:** dedicated local **PostgreSQL 18.6 `lc_p0_test`**, Unix socket only, TCP disabled per the operator
  `READY.json`.
- **DSN handling:** read privately from the documented operator handoff file inside a wrapper process and never
  printed. The archived logs were scanned: no connection string, host, password, socket path or bearer token.
- **Guards:** the reused runner guards ran before any write. The target is local `lc_p0_test`; identity is checked
  read-only; migration ledger hashes equal `0001_documents`, `0002_capture_immutability` and
  `0003_raw_capture_frame`; each run has a unique pristine actor.
- **Not done:** no migration, no DB restart, no new DB. `lc_desktop_preview`, preview identities/tokens/services,
  Paperclip, live desktop apps and providers were not touched.
- **Children:** only ephemeral loopback API children (`127.0.0.1`, random ports) under the existing supervisor.
  Each child was reaped (`-15`) before the next started. Exact-actor cleanup ran only after the last child exited.
- **Post-cleanup:** read-only checks show 0 documents and 0 actor rows for both actors.
- Python 3.14.4 from the worktree `.venv`, run from `wt-review` at `de7bda9`.

## 1. Author assertions inspected, then the author runner executed by QA

**Inspection**, done by reading the code plus a read-only mapping pass of
`services/api/tests/postgres_desktop_runtime_check.py` and its reused helpers. All 24 HTTP checks and 5 groups in the
owner log match the code.

| Lead verification item | Author coverage | Assessment |
| --- | --- | --- |
| Actual PNG / editable-ink bytes | Full-body equality plus `validate_original_read` (length, sha256, canonical base64) after save, restart and Stop; the Learning image equals the PNG bytes | strong. Ink is a 52-byte synthetic JSON blob and the PNG is 2×2; the logged `png_sha256` / `editable_ink_sha256` are hashes of the local fixture, not server bytes |
| Frame / gap / source / clock metadata | Full 0.2.7 descriptor equality (includes the UInt64 decimal `18446744073709551615`); gap has no artifact/frame rows and Learning shows `missing_frame`, 0 bytes; source equals the PUT descriptor | medium. Record clock and all timing fields are null, so no non-null clock or estimate runs on PostgreSQL; the descriptor is compared only with itself |
| Learning context across changed PIDs | Deep equality of the packets before and after restart | strong for retention. The composer runs in the parent over a fresh `PostgresStore`, not in the API child |
| Replay invariance | Same-key gap and frame ACKs identical after restart; changed body gives 409 `idempotency_conflict` with no writes | strong |
| No regrant with `fresh_consent=False` | Whole actor-document equality across the second process start and the factory reopen; `start_status == consumed`; the stopped registration replays as stopped | strong |
| Stop / current revoke / expiry | Unknown-boundary Stop refuses retry and new live and keeps history. Revoke is an account-level `set_authorization(False)` after Stop | **expiry not exercised** on this path (token lifetime +1 h; the 401 is an unknown old token). No final-use revoke after resolution. No source revoke/delete |
| No persisted token | Both tokens absent from all actor documents after revocation | adequate (actor documents only, checked once) |
| No cleanup before children exit | The supervisor reaps or raises `OwnedProcessNotReaped`; cleanup is withheld on unconfirmed exit; PASS prints only after cleanup | strong. The `poll()` checks after the supervisor returns are tautological |

**Execution by QA** (independent operation, reported separately from QA's own regression):
[`run_db.py author`](p0-13-desktop-runtime-4fa592d/run_db.py) → `main(desktop_runtime=True)` from `services.api.tests.postgres_desktop_runtime_check` →
[author-runner-qa-executed.txt](p0-13-desktop-runtime-4fa592d/author-runner-qa-executed.txt).

- Exit **0**, **24 HTTP checks, 5 groups**, same statuses as the owner log.
- API PID **604289** (fresh consent) exited `-15` before PID **604313** (`fresh_consent=False`, new token) started.
- Actor `lc-desktop-http-e604f8f7357043758da71ac79e41f0c2`; cleanup covered the own actor only; post-cleanup rows 0/0.
- The portable author guards were rerun separately:
  `test_postgres_desktop_runtime_check.py` + `test_postgres_ingress_http_check.py` gave **40 passed**. These
  replace the DB/socket/process boundaries and do not execute the scenario body.

## 2. QA's independent high-risk regression

[tests/e2e/qa_desktop_runtime_postgres.py](../../../tests/e2e/qa_desktop_runtime_postgres.py) (sha256 `d9ba2b22…2f8d`)
reuses the Backend runner's `main` unchanged; only the scenario function is QA's. It was chosen for the three gaps
above:

- final-use access loss after original resolution;
- R58 deletion durability across real restarts;
- token expiry on the desktop runtime.

Run: [qa-regression.txt](p0-13-desktop-runtime-4fa592d/qa-regression.txt).

- Exit **0**, **28 HTTP checks, 4 groups**.
- Actor `lc-desktop-http-ced26e4e27ec4da1b70a60d280590d54`; post-cleanup rows 0/0.

| Phase / PID | Actual behaviour | Result |
| --- | --- | --- |
| 1 · **604460**, fresh consent | HTTP registration (live), display, first frameless gap, PNG + ink upload, desktop 0.2.8 frame; the Learning window has `missing_frame` + `attached`, with image bytes equal to the PNG | pass |
| 2 · **604478**, `fresh_consent=False`, new token | Documents unchanged by the reopen (no regrant). Frame replay returns the identical ACK. PNG/ink reads return exact bytes. The Learning window equals phase 1 | pass |
| 2 · final-use deletion | The resolver returned `available` with the PNG bytes. **Only then** was the source deleted (R58, from a separate connection). The final re-read refused and the **whole window was withheld** (`DomainError 404`), with no packet | pass |
| 2 · after deletion | Every one of these returns 404 `not_found`: PNG/ink GET and re-PUT, exact frame replay, new-key frame, gap replay, display re-registration, Learning window. The refusals changed no documents. No stored document contains either original's base64. Capture tombstones (gap + frame record), frame tombstone, original and capture artifact tombstones (PNG + ink) are all present | pass |
| 3 · **604513**, `fresh_consent=False`, token expiring after 20 s | Documents are identical to the post-deletion snapshot (no resurrection or regrant after restart). All nine deletion refusals above (eight HTTP plus the Learning window) hold again in the new process | pass |
| 3 · expiry | Before expiry, stream GET returns 200 (`live`). After expiry: stream GET 401 `unauthenticated` (ControlError), desktop replay 401, and the reader window raises 401 with no packet. Documents unchanged. None of the three tokens appears in any stored document | pass |

**Preparation (not evidence):**

- In-process calibration and a dry run through the same scenario over MemoryStore.
- A negative dry run with deletion disabled was detected ("Learning window returned after current access ended").

Document kinds after deletion: `authorization`, `capture_artifact_tombstone`, `capture_binding`, `capture_replay`,
`capture_slot`, `capture_tombstone`, `control_lineage`, `control_membership`, `control_replay`, `control_start`,
`control_stream`, `device`, `frame_tombstone`, `original_artifact_tombstone`, `session`, `source`.

The stream itself stays `live` after the source is deleted; any new submission for the deleted source is refused.

## Finding QA-DESKTOP-RT-01 (Low–Medium; next owner Lead as contract owner, then Backend)

**What is accepted today.** Desktop ingress 0.2.8 (and its Backend adoption) accepts a framed record whose own
claims are:

- `surface: web_dom`, `method: structured`;
- `evidence: {kind: operation, operation: reselect, actor_basis: trusted_input_event, before B → after C}`;

and binds it to a macOS ScreenCaptureKit display frame from a `shared_display` source. The desktop README restricts
labels only for frameless gaps. Nothing in 0.2.7/0.2.8 validation ties a framed record's surface, method or
evidence to the desktop capture profile.

**Evidence that it happens:**

- The author runner's own fixture does exactly this (`process_v2/examples/capture.json` via `test_control.py`;
  runner `scenario()`).
- The record was committed on real PostgreSQL in the QA-executed run above.
- The author asserts that the Learning packet carries that record unchanged.

**Why it matters:** R52/A30/A31 require structured editing history to stay distinct from external screen
observation. A mislabelled producer, or this fixture, lets pixels arrive in Learning as a trusted-input
structured operation.

**For the lead to decide:**

- whether desktop display-source records must carry honest visual labels (e.g. `external_app` / `visual`, as the
  native fixtures use);
- or whether mixed records are legitimate and need an explicit rule.

At minimum, the runner fixture's labels should not be cited as desktop labelling evidence.

## Minor documentation notes (next owner Lead)

- `services/learning/README.md` still says the desktop consumer is tested only with injected readers and shows
  `read_raw`. The real `read_desktop` / `resolve_desktop` are now exercised on PostgreSQL.
- The requirement headers still say contracts are released "currently through v0.2.6", but 0.2.7/0.2.8 are
  released.

## Limits and not tested

- **Inputs:** identity, consent, native metadata and the 2×2 PNG / 52-byte ink are synthetic.
- **What the run proves:** actual PostgreSQL persistence, actual owned API process restarts and the real Learning
  readers. Nothing about native capture, the uncompiled Swift mapper, a Windows descriptor profile, OS permission,
  audio, UI, real provider receipt or presentation.
- **Not exercised on the real path:** non-null clocks and estimates; known-boundary Stop; source-level revoke
  (deletion was chosen); token-level revoke inside a child; concurrent cross-process writes; a new incarnation after
  Stop.
- The one regression and the one author-runner rerun are all that was executed. No old raw/legacy/preview/Simulator
  campaign and no general suite was run.
- Full R07/R27/R35/R36/R51/R52/R58 and A12/A14/A16/A27/A30/A31, both per-desktop §7.1 gates, and full
  Windows/macOS product acceptance remain open.

## Reproduce

QA executed both runs through the committed wrapper
[run_db.py](p0-13-desktop-runtime-4fa592d/run_db.py). The wrapper:

- reads the documented operator DSN file privately, never printing it;
- runs the Backend `main` with the author scenario or the QA scenario;
- then confirms, read-only, that the run's actor has no remaining rows.

```sh
# from the worktree, with normal exact-command approval for the dedicated DB and loopback children
PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/verification/qa/p0-13-desktop-runtime-4fa592d/run_db.py author
PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 .venv/bin/python docs/verification/qa/p0-13-desktop-runtime-4fa592d/run_db.py qa
# equivalent entries when LC_TEST_DATABASE_URL is already supplied privately:
.venv/bin/python -m services.api.tests.postgres_desktop_runtime_check
.venv/bin/python -m tests.e2e.qa_desktop_runtime_postgres
```
