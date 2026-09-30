# P0-09 desktop HTTP and explicit coverage gaps

Assigned published baseline `59ee862be3e7a51e3b51caa31878db8aa36f6d74` was normally
merged at `78db75e7bdb6a68f5c8c5f79af9513536e58f92c`, preserving completed internal
adoption `1c5eea2`. This implements the next bounded task from
`docs/verification/lead/desktop-ingress-release.md`. Only owned API code, module
tests and this evidence changed. PONYTAIL LITE reuses existing contracts, actor
transactions, sources, originals, control and HTTP helpers; no migration, table,
identity model, new dependency or separate archive is necessary.

## Callable outcome

Trusted embedding code can explicitly enable the separate route:

```python
app = create_ingress_app(
    store, authenticator, capabilities=capabilities,
    stop_fact_resolver=stop_fact_resolver, clock=clock,
    enable_desktop_ingress=True,
)
```

`create_capture_app` forwards the same independent flag. Both factories default
it to false. The default app, capture runtime and preview have not been mounted
or changed. The operation is `POST /v2/process/desktop-frames:batch`, with exactly
one Idempotency-Key, current Bearer authentication, `process:capture`,
`process.capture.v0.2` and `process.desktop-ingress.v0.2.8`. Existing registration
and PNG/ink upload/read retain their separate 0.2.4 permissions. There is no
runtime bootstrap, producer consent or provider activation in this delivery.

The complete ordered 0.2.8 envelope is validated and fingerprinted in the existing
capture transaction, with strict DesktopFrame 0.2.7 and ProcessBatch/ACK 0.2.0.
Object member ordering is irrelevant; frame/record/evidence array order is part
of HTTP equality. Actor + method + full route + key separate HTTP replay from
internal frame-map replay. Every typed original, including ink, is verified
before a success receipt; current fences and retained originals are rechecked on
retry. Commit failure or cancellation publishes no ACK or partial state.

Unlike the prior framed-only internal seam, this released HTTP entry can commit
`frames: []` with explicit frameless partial/unobserved/unknown coverage. It binds
the retained display source owner/version and device/session/stream, then checks
current producer, generation, control and membership through the existing
resolver. It atomically saves the original coverage record, sequence slot,
capture binding and replay receipt without inventing frames, artifacts, clocks
or observations. Accessible sources from another stream are rejected. Missing
record/slot/binding/source evidence cannot be recreated by a retry.

`read_desktop` now returns these exact historical gaps, without image bytes or a
live claim. It revalidates gap shape and retained source/incarnation; old readers
remain closed to this form. Retained gaps can be causal ancestors of a later
desktop/raw framed record or another gap, using each ancestor's original identity
and generation. Full batch causality/coverage and whole-selection validation
remain mandatory. Stop only permits the separately sealed historical sequence
ceiling; stored history remains readable with current access. Revocation/deletion
refuse access. A coverage gap never issues a Stop or restarts capture.

## Narrow deletion-marker correction

Lead supplied an inherited malformed-storage finding during this task: an existing
`frame_tombstone` row containing `{}` was ignored by CaptureArchive's truthiness
checks, while the byte resolver correctly treated it as present/missing. Normal
deletion already emits populated markers. No supported empty-marker producer was
demonstrated; this is a fail-closed storage consistency correction.

Before the fix, the focused test command with `-x` reported **1 failed, 8 passed
in 0.56s**: cached raw internal ingress returned an ACK despite the empty marker
(`DID NOT RAISE DomainError`). Three frame-marker checks now use existence, matching
the resolver and storage fence. **18 focused cases passed in 0.81s**, covering raw
and desktop, internal and HTTP, cached/new keys, empty/populated markers and
retained ancestors. No other tombstone family or general corruption audit changed.

## Executed evidence

Use existing locked `repo/.venv/bin/python -m pytest -q` with these files under
`services/api/tests/`:

| Test files | Actual result |
| --- | --- |
| `test_ingress_http.py`, `test_raw_ingress_http.py`, `test_capture_app_dispatch.py` | 199 passed in 6.18s |
| `test_desktop_gaps.py`, `test_desktop_frame_ingress.py`, `test_desktop_frame_readers.py`, `test_raw_frame_ingress.py`, `test_raw_replay_integrity.py` | 291 passed in 26.32s |
| `test_desktop_ingress_http.py`, `test_desktop_gaps.py`, `test_frame_tombstone_presence.py`, `test_raw_replay_integrity.py` (after marker correction) | 156 passed in 6.21s |
| `test_desktop_ingress_http.py -k composed_factory` (two subsequent tests) | 2 passed, 76 deselected in 0.31s |

Overlap is not double-counted: **586 distinct tests passed**, including 121 new
HTTP/gap/marker cases. Four raw/desktop flag combinations also passed the installed
OpenAPI validator; default schema is unchanged. The composed factory was actually
called at root and under an ASGI mount, verifying opt-in routing, 0.2.8 errors and
successful ingestion. No listening port was opened. `git diff --check` passed.
A bounded independent static review found no blocker in the new transport/gap
binding, retained ancestors, ordered replay, current authorization or cancellation.

Actual operations use project-authored PNG/ink uploaded/read through existing ASGI
handlers and MemoryStore with synthetic trusted authority/native metadata. Tests
check original byte equality, one actor transaction, same/new-key retries, first
gap with no uploaded pixels, mixed gap/frame histories, current Stop/revoke/delete,
lost evidence, under-lock expiry, strict transport/version precedence and injected
write/commit/cancellation failures. Initial test-only assumptions of 404 for an
accessible but mismatched stream (actual 422) and deletion after an earlier Stop
(existing Stop fence returns 409 first) were corrected to established semantics;
neither was an unexpected successful write or a production assertion weakened.

## Remaining limits and next owner

Lead owns integration and actual Backend-to-Learning composition. The previously
open transport representation for frameless display coverage is implemented here;
real producers still need to emit truthful gaps and the trusted runtime must
explicitly select this route. Default activation and full end-to-end acceptance
remain separate work. No DB campaign was repeated because storage constraints
did not change, and no PostgreSQL pass is claimed for this segment.

No native capture/compiler, real device/permission, paid provider, account action,
preview data or Notability import ran. Full-screen freshness, actual real-AI
receipt, original-screen ink/audio and both §7.1 gates remain open per platform.
R07/R27/R35/R36/R51/R52/R58 and A12/A14/A16/A30/A31 retain their complete original
goals; synthetic component tests cannot close those product acceptance cases.
