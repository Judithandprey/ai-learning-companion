# Opt-in capture ingress HTTP

2026-09-29 — Backend P0-04/P0-09. Assignment
`handoff_3f6b29b449638555dbca45c430668140`; released baseline
`46042429f9e5d714359484d0203aa7cc999073b3`, normally merged as
`c8acd23adc70e182d82d4df546a2fd16dca9fb13` into the clean `team/backend` branch.

Refreshed current decisions, workflow, role/task guidance, complete affected
original/English R07/R29/R30/R35/R36/R46/R51/R52/R58/R59 and
A12/A14/A16/A30/A31/A44 clauses, §7.1, process evidence/surface rules,
V-ArchiveCompanionContinuity/V-SourceTimeRelations/V-MultiDeviceUnderstanding,
and AUDIO-08/13–15. All current source/English manifest hashes match. The complete
released capture_ingress README/helpers/OpenAPI and actual archive/control/original
call paths govern the implementation. Both §7.1 gates remain unaccepted.

## Constructed entry point

```python
from services.api.ingress_app import create_ingress_app

app = create_ingress_app(
    store=existing_actor_store,
    authenticator=trusted_authenticator,
    capabilities=frozenset({
        "process.ingress.v0.2.4",
        "process.control.v0.2.1",
        "process.capture.v0.2",
    }),
    stop_fact_resolver=independent_persisted_stop_fact_resolver,
)
```

This constructs an ASGI object only. It starts no server, reads no runtime tokens
or DSN, and mounts nothing into v1/control. The embedding must supply approved
client authentication/capabilities; a page cannot assert them or mint start grants.
The five operations are exactly the released wire:

| Operation | Successful result |
| --- | --- |
| PUT `/v2/process/display-sources/{source_id}` | 0.2.3 DisplaySourceSnapshot |
| GET same display-source path | retained 0.2.3 DisplaySourceSnapshot |
| PUT `/v2/process/originals/{artifact_id}` | 0.2.2 OriginalArtifactReceipt |
| GET `/v2/process/sources/{source_id}/versions/{source_version}/originals/{artifact_id}` | exact 0.2.2 OriginalArtifactUpload |
| POST `/v2/process/frames:batch` | 0.2.0 ProcessBatchAck from a 0.2.4 envelope |

All success responses are HTTP 200 after the existing store transaction exits.
Source registration resolves the actual producer from current stream and consumed
start facts inside that same actor transaction, without a client producer field.
Creation and replay require live authority. Display-original PUT and exact retries
also require live authority; stopped byte queues remain local/pending. Historical
GET needs only current `sources:read` plus ingress capability, while source/account
revocation, deletion, ownership and retained incarnation checks still apply.

The full validated batch wrapper is canonicalized with the released helper.
Owner is the actor transaction; method/full route/key scope the existing
`capture_replay` row. Array ordering and all versions are retained. The fingerprint
and exact ACK commit with Frame, process records, slots and references. Internal
frame-map replay and `/events:batch` equality remain unchanged. Every replay
rechecks authority, typed bytes, ancestors, stop limits, deletion and missing
committed evidence before returning success. Existing originals are never rebuilt
from a request or cached receipt.

PONYTAIL LITE reuses the existing Authenticator/Principal, ControlRegistry,
OriginalArtifacts, CaptureArchive and actor store. Small opt-in retention checks
distinguish loss from fresh absence without changing legacy callers. A verified
ACK can witness committed bytes; legacy pending metadata cannot. No second store,
identity model, migration, dependency, shared schema or background executor is added.

Strict raw streaming bounds precede decoding: metadata/batch 4,194,304 bytes;
original upload/response 48,933,548 bytes with the existing 32 MiB original limit.
The pure decoder/validators retain exact originals and closed shapes. Invalid JSON,
duplicate members, non-finite overflow, wrong encoding/type, unsafe version paths,
invalid keys/identity and unsupported versions have content-free released errors.
Authentication is repeated under the actor lock. Error responses reveal no original
content, credentials or exceptions. The exact released OpenAPI is exposed without
Swagger/ReDoc, default mounts, CORS permission or a module-level application.

## Actual checks

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_ingress_http.py
# 88 passed in 2.65s (test author's final run on the corrected implementation)

/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_capture.py services/api/tests/test_capture_frames.py \
  services/api/tests/test_display_sources.py services/api/tests/test_original_artifacts.py \
  services/api/tests/test_control.py services/api/tests/test_control_http.py \
  services/api/tests/test_http.py
# 477 passed in 3.93s

git diff --exit-code 46042429f9e5d714359484d0203aa7cc999073b3 -- \
  services/api/app.py services/api/auth.py services/api/control_app.py \
  packages/contracts services/api/migrations pyproject.toml uv.lock
# exit 0: default/control apps, auth, contracts, migration and dependency bytes unchanged
```

The HTTP sequence uses synthetic trusted start/member/stop decisions and actual
project-authored PNG bytes: register descriptor, PUT/read exact screen and editable
ink bytes, atomically ingest frames/process records, repeat the same request and
read retained originals. Frame/record array changes with the same key conflict;
object member reorder replays exactly. Scoped stop/withdrawal prevents live writes
while read-only history remains available. A separately evidenced finite stop
accepts only bounded historical records whose original bytes were already stored.

Injected staged writes and transaction-exit failures leave no partial descriptor,
original, Frame, record or ACK; identical retries succeed after the fault is removed.
Lost originals, frames, records or source snapshots refuse rather than reconstruct.
An ACK-only byte witness also prevents GET/PUT resurrection. Foreign owners,
revocation, stale membership/generation, transaction-time token expiry and adapter
outages are checked through actual ASGI requests. Streaming over-limit reads stop
before decoding; the exact 4 MiB metadata boundary remains valid.

Independent review found and reproduced an initial missing `Revision` validator
in the ingress namespace (valid callers incorrectly received 401); this now uses
the existing control validator. Review also drove precise 503 handling for lost
committed evidence/stored binding versions and distinguished legacy pending-byte
metadata from verified receipts. Focused regression tests preserve these failures.
Final independent ASGI probes passed current-state replay, read-only history after
stop/withdrawal, strict error precedence, response-byte equality, bounded reads,
transaction-exit rollback, source-loss classification, pending-only legacy refs
and ACK-only missing ancestor rejection. No blocking finding remained. These are
independent focused probes, not an additional invented aggregate test count.

## Limits and next owner

All new HTTP checks use HTTPX AsyncClient/ASGITransport and synthetic MemoryStore
decisions. App recreation in a test does not prove process/database restart.
No database campaign, socket listener, device, provider, preview/Paperclip, account,
paid executor or deployment operation occurred. No claims of physical pixels,
codec validity, AI receipt, continuous display coverage, editable device reopen,
original-screen pen or Notability import follow from storage/HTTP ACKs.

Lead next reviews/integrates and releases the constructed boundary. iOS consumes
only the coordinated explicit wire. Native transport/authentication, actual durable
deployment and both §7.1 device/provider gates remain separate evidence work.

## Integration correction: cached ingress ACK must remain fully verified

Lead review `handoff_198c8e0ac2c5b7a9ce4d34622703a23f`, against delivery
`01241958a5810e2ed81512e6650f480c10a87fd7`, reproduced one contract mismatch:
changing only the first cached artifact receipt from `verified` to `pending`
still yielded HTTP 200 on exact replay, although the underlying originals and
records remained intact. The legacy `validate_ack` deliberately accepts pending
receipts; the ingress release requires every receipt to be verified.

The new exact ASGI regression first confirms valid unchanged replay, mutates only
that cached status, and requires content-free 503 `unavailable` with the complete
actor state unchanged. Before the fix it failed with the reported 200/pending
response (1 failed, 88 deselected). The six-line production correction applies
only when `request_envelope` is present, after normal cached ACK validation and
current evidence checks. It refuses the inconsistent cache without repairing it
from available bytes. Internal frame/event replay retains its legacy behavior.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_ingress_http.py services/api/tests/test_capture.py \
  services/api/tests/test_capture_frames.py
# 269 passed in 3.96s after the correction
git diff --check
# exit 0
```

This correction uses synthetic MemoryStore/ASGI evidence only. No listener,
database, device, provider, default route or shared contract changed.

The independent two-record ACK probe also changed the last artifact in the last
cached receipt: replay returned 503 with no store mutation. Valid replay remained
exact; legacy pending replay after bytes arrived still returned its original
pending ACK, while a fresh legacy key returned verified with the original timestamp.

## Integration correction: sparse source versions are not missing history

The second verified finding, `handoff_4e5abacfb7b3b7fff37db7149173e287`, showed that
authorized fixture import can legitimately create only source version 3. The new
retention diagnostic incorrectly treated absent version 1 as lost committed
history because `1 <= current_version`. Before the fix, the lead's exact local
probe reproduced stored versions `[3]`, legacy read 404, ingress GET/PUT 503, and
unchanged actor state. That 503 incorrectly marked an unissued version retryable.

An absent snapshot now requires the same committed current version or a retained
exact-version frame/event, typed original binding or process record before it is
classified as unavailable. Numeric ordering alone supplies no evidence. Unissued
lower versions remain 404; actual lost current/older committed versions remain
503, with authorization/revocation/deletion checks and no reconstruction preserved.

Independent ASGI checks used actual `Archive.import_fixture` imports: only version
3 gave 404 for GET/PUT versions 1 and 2, while version 3 PUT/GET passed. Removing
the current version 3 snapshot gave 503. Separate imports of versions 1 then 3,
followed by loss of snapshot 1 with an isolated frame, typed original or process
record witness, each gave 503 for version 1 and 404 for unissued version 2. Failed
requests left the complete actor state unchanged. No remaining blocker was found.

Final test-author run after both corrections:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_ingress_http.py
# 95 passed in 2.73s; includes the exact cached pending-receipt case and six
# sparse-version cases, with actual imports and unchanged-store assertions.
```

The earlier 269-test command above separately includes existing internal capture
and frame replay regressions; those legacy paths are unchanged by the subsequent
opt-in source-version diagnostic correction. No broader campaign was rerun.
