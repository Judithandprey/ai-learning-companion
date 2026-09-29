# P0-04/P0-07: real UTF-8 document archive preview

Verified 2026-09-29 UTC. Owner: backend. Task source: lead handoff
`handoff_85aeb9c58871ddbb45001db9563b0b37`; bounded wire correction requested in
`handoff_648710e83bd9131860a90d8f99edfdc5`. Working branch `team/backend`.

## Outcome and compatibility

An explicitly enabled trusted local API accepts a complete UTF-8 document, an
explicit ASK selection/request and the user's note. PostgreSQL durably retains
the source version and full bytes separately from DOM context, request provenance
and the immutable note revision. After terminating the API and starting a new
process, the same records are read back exactly. AI is `provider_unavailable`.

Wire commit `f0ecfe132c7529fc8a27497891bcadab13885fd3` introduced the separately
named `document-preview.0.1.0` family. Correction `96d8137` binds composite saved
responses to exact owner/source/frame/request/user-original evidence. The initial
wire validator incorrectly accepted mismatched source/observation/note records;
lead's independent probes found this, and 30 focused binding/time-separation
cases now prevent it. No failing wire review was counted as acceptance.

Read/adopted workflow at `4a2be79525e87542b3ca77ac6fd04ecf28b04b6d`, merged normally
at `4ef29c8`. Used current role/task and affected original/English R03/R06–R10,
R17/R27–R32/R43–R44, A02–A03/A10–A12/A19/A23 and linked V-DailyResume /
V-ArchiveCompanionContinuity. These larger acceptance cases remain incomplete.
PONYTAIL LITE reused the existing actor transaction, authorization/membership,
SourceSnapshot/Frame/Observation/NoteRevision and canonical PostgreSQL store.
No dependencies, migrations, root settings or existing v1/capture/control wire
files changed. The lead explicitly delegated the separate preview contract path.

Only two small metadata record kinds link filenames, actual BridgeRequest and
ExplanationRequest, immutable archive keys and retry fingerprints. They are
needed because these provenance fields have no v1 storage representation; source
and note originals are not duplicated in a new archive. Source deletion removes
the metadata within the existing transaction. No public deletion/process endpoint,
paid provider, production identity adapter or background service was added.

Typed originals use legacy NoteRevision `kind:ai`, with `authorship:user` and
`user_original` blocks. This is a documented enum limitation, not an AI-generation
claim. UI must label it a user note. Source provenance is server-derived from the
authenticated import; document rights are explicitly not independently verified.

## Commands and actual results

Used the already installed lead `.venv/bin/python` read-only; no installation.

| Check | Actual result |
| --- | --- |
| `python -m pytest -q services/api/tests packages/contracts/tests/test_document_preview.py` | 637 passed in 3.59s, before the final composite-wire correction |
| Final affected checks: `python -m pytest -q packages/contracts/tests/test_document_preview.py services/api/tests/test_preview.py services/api/tests/test_preview_http.py` | 163 passed in 1.17s after the correction (70 wire, 60 domain, 33 HTTP) |
| `python -m pytest -q services/api/tests/test_preview_local.py` | 84 passed in 0.31s, with the real module import; initial temporary module stub was not used for final evidence |
| `python -m packages.contracts.document_preview.generate --check` | PASS; OpenAPI/schema/TS current, OpenAPI and schema validated by wire tests |
| `git diff --check` | PASS |
| Exact diff of existing v1 schema/generated files, process_v2 and process_control against baseline `4ef29c8` | Empty |
| `python -m services.api.tests.postgres_preview_check` | Exit 0, seven groups PASS on PostgreSQL 18.6 |

The real database invocation privately loaded the operator's existing DSN into
`LC_TEST_DATABASE_URL`. Normal exact-command approval was granted. The runner
first checked both the configured target and actual database as dedicated local
`lc_p0_test`, then used the existing canonical migrations. No credentials or local
connection details are committed here. No old PostgreSQL acceptance batch was rerun.

The actual HTTP input was a dedicated acceptance document (not a fixture import
or an external user's course): 12,489 UTF-8 bytes with BOM, Chinese, accented text,
Greek/formula text, CRLF, literal markup and 200 paragraphs beyond the DOM excerpt.
Its deterministic input SHA-256 is
`ab02e23b4b023b8ca0e8c9ace0f91907a9d34b152c342270c121a37ad668f31d`.
The separate DOM artifact was 594 bytes, SHA-256
`ac3f24914d4852395e9a908f3ec7603b1553cb3cfd24f5fd6e1d8a59b3627ff6`.
The runner asserts full byte equality against HTTP readback; these hashes identify
the deterministic acceptance input, not a claim of device screenshot capture.

Actual PostgreSQL groups:

1. Actual `preview_local` bootstrap and HTTP import preserved complete document
   bytes, owned identity and `user_authorized`/learning provenance.
2. HTTP save atomically persisted DOM frame, both actual request objects, user
   observation and user-original note, with provider unavailable.
3. First API process terminated and was waited. A distinct new process restored
   exact source/version, bytes, frame/selection, requests and saved revision.
4. Same/new-key exact retries added no originals. Changed-body retry returned
   409, bad hash 422 and wrong identity 403; original record inventory stayed equal.
5. Existing source deletion erased source/preview content, retained opaque
   tombstones and rejected read/retry/new-version resurrection with 404.
6. Expired credentials returned 401; persisted authorization revocation returned
   403 before/after restart. The third auth-only probe did not bootstrap revoked
   identity. Launcher unit tests independently reject revocation revival.
7. All three owned ephemeral loopback API children terminated and were waited;
   live capture stayed off. The runner cleaned only its unique test actor and
   returned success only after cleanup succeeded.

Focused negative/domain checks additionally cover current membership/token checks
under lock, concurrent same-save retries, rollback before commit, immutable source
versions, exact historical readback after note head advances, original corruption,
NUL/invalid UTF-8/binding rejection, artifact pin/tombstone conflicts and deletion.
Independent review found an ASK timestamp issue: the original implementation used
the earlier frozen-frame timestamp for the later user request. The corrected
implementation records `selection.created_at` for the ASK observation, while
retaining the earlier frame timestamp, and has a specific reopen regression.

## Operate and hand off

See [API startup and request examples](../../../services/api/PREVIEW.md) and
[secret-free environment template](../../../services/api/preview.env.example).
Start `python -m services.api.preview_local --port 8174` in the foreground with
explicit local DB/token/IDs/opt-in. It binds 127.0.0.1 only. Optional exact
`LC_PREVIEW_UI_ORIGIN` enables only the trusted local app UI origin; course pages
and wildcard origins are refused. The default v1 app remains fail-closed.

Next owners: Web consumes the exact wire and connects the trusted document UI;
lead integrates; QA runs one actual integrated UI save/restart/reopen workflow.
Backend API/storage acceptance is complete for this finite slice. No browser UI,
Safari/iPad device, original-live-screen pen, pixel/video/audio capture, native
editable ink, official Notability import, paid provider, long-term retrieval,
production auth or PostgreSQL-server restart is accepted by these results.
This does not close V-DailyResume, V-ArchiveCompanionContinuity, P1 or G4/G7.
