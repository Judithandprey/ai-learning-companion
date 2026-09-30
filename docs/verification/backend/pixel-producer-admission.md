# QA-DESKTOP-RT-01: trusted pixel-producer admission

Lead assignment `handoff_26e45440705d9b57a3878b06916119f2` adopts ADR 0002 §3 at
`061efe287fd965b5a8fcfeced36f1309c2540e2f`, merged normally into the clean backend
branch at `25dd67849941e53e4971ed67d0e62c63e140dfcf`. Scope: existing P0-08/P0-09,
R51/R52 and A30/A31. Complete source/English clauses and their distinction among
DOM operations, editable ink, external pixels, mixed acquisition and unknown gaps
remain applicable. This correction does not remove legitimate future mixed input.

## Problem and reproduced boundary

The previous desktop-specific fixture inherited `web_dom / structured / reselect /
trusted_input_event` from the generic Process example. QA demonstrated its actual
PostgreSQL commit/readback. A PNG and an ink MIME/hash establish neither a trusted
input event nor the source app's internal operation history.

The existing nine-case pure triage was rerun successfully against its retained
`775436f` source export at `/tmp/desktop-evidence-triage-gcucv6zd`. Structured,
mixed, relabelled-surface and own-ink declarations remain representable by the
released generic validators; visual-only internal-operation and trusted-event
claims are already syntactically rejected. That is a decoder boundary, not
producer admission. No released schema, generic example or decoder was changed.

## Trusted configuration and common gate

The local host now supplies:

```python
create_local_capture_runtime(
    # Existing explicit store, identity, registration, finite token and authority...
    enable_desktop_ingress=True,
    producer_profile="desktop_pixels",
    fresh_consent=True,  # only for the separately obtained initial scoped consent
)
```

Reopen with the same exact identities/registration/profile and
`fresh_consent=False`. Unknown or omitted desktop profile fails before mutation;
the route remains default-off. The value is trusted embedding configuration,
never copied from an HTTP record, image profile, source ID, capability name or
producer-name convention. A producer named `desktop_pixels` gains no authority
from that name.

For a host which already owns registration, the internal
`ControlRegistry.bind_pixel_producer(user_id, registration, producer_id=...)`
narrows that exact incarnation. It verifies current owner/device/session and
generation/membership pins, the original registration fingerprint, current
grant/state and exact registered producer. It grants no start or consent.
There is no corresponding public endpoint or permissive structured resolver.

The internal `producer_profile` marker is stored on the existing `control_start`
grant and propagated to `control_stream` upon registration. Adopting a consumed
incarnation updates both existing rows in one actor transaction. Reopening an
already-bound incarnation is read-only with respect to those documents. A
one-missing/unknown/mismatched paired marker fails closed and cannot be repaired by
repeating binding. Omitting the optional profile while opening a non-desktop
transport cannot remove the retained restriction.

`CaptureArchive._ingest` checks admission at the shared last read/validation point,
after current source/registration/lifecycle, artifact and record checks, before
either a cached successful ACK or any archive mutation. Thus the same registered
producer cannot bypass the restriction via legacy, raw, desktop or internal
capture entry points. Only `external_app / visual / coverage` records are admitted
for the current pixel profile. Whole mixed batches fail atomically when any
member claims structured/mixed input or an operation; separate ink originals and
references remain permitted without implying observed edits.

Compatibility is deliberately scoped: unmarked pre-extension generic
non-desktop capture keeps its prior authority/validation behavior. Desktop writes
require a known trusted binding. Retained 0.2.7 frames additionally witness lost
desktop configuration on another route; they can cause refusal, never grant a
profile. Arbitrarily deleting both configuration markers before any retained
desktop use cannot be distinguished from an unmarked historical generic stream;
this is not a caller-accessible mutation or a new general corruption-recovery
system. An explicit trusted host binding can establish the profile on a completely
unmarked historical incarnation; loss of both markers is indistinguishable from
that adoption at this host boundary. HTTP replay never supplies that authority.
No database migration, new archive or producer framework was introduced.

Only submitted records are checked against current admission. Historical
ancestors, canonical records, source/original bytes and old ACK bodies are neither
relabeled nor deleted. Current admission may refuse exact retransmission of an
old ungranted claim. Existing readers retain those claims with their existing
unverified/`not_attested` status; no old ACK or attached image becomes attestation.

## Fixtures and operation evidence

Only desktop-specific fixture derivations changed: framed pixel samples use
`external_app / visual / observed_samples` with `sample_only` and
`unsupported_history`; frameless records retain unknown coverage and limits.
PNG/editable-ink references remain unchanged. The generic structured Process
example and raw fixture retain their original values. The complete-metadata
size test now uses valid large desktop metadata instead of an operation field.

The retained hosted Swift fixture ZIP hash was verified as
`daa355d6a0e3dfa5f9f7898461522cb590f9bf99cf5fd6887bce9db0de88f1b5`, extracted into
a fresh temporary directory, and passed the existing native fixture checker and
`docs/verification/lead/macos-ingress-context-probes.py` through the new explicit
host binding. **Three unchanged requests, 15 records (eight frameless), three
frames** passed actual in-process HTTP/archive/Learning/reopen/Stop composition.
[Execution output](pixel-producer-native-composition.txt) retains request hashes.
This consumes previously generated Swift synthetic buffers; no compiler, desktop
launch, OS permission, real capture, database or provider was run for that check.

## Focused verification

Executed with the existing lead `.venv/bin/python`, `PYTHONDONTWRITEBYTECODE=1`,
and `-m pytest -q` (root batches also used `-p no:cacheprovider`):

| Test modules under `services/api/tests/` | Result |
| --- | --- |
| `test_desktop_frame_ingress.py`, `test_desktop_ingress_http.py`, `test_desktop_capture_runtime.py` | 169 passed |
| `test_control.py`, `test_capture_runtime.py` | 148 passed |
| `test_desktop_frame_readers.py`, `test_ingress_mounts.py` | 87 passed |
| `test_producer_admission.py` | 43 passed initially; five additional runtime cases passed separately |

**452 distinct pytest cases passed.** The five added cases were selected with
`-k 'runtime_profile_refusal or runtime_generic_reopen or runtime_paired_profile_binding'`
(43 already-passed cases deselected). They verify refusal before any store
transaction, retained policy after generic runtime reopen and atomic rollback
when paired marker writes fail. No failed assertion was weakened.

The admission suite independently exercises all three capture families through
internal and HTTP entry points, atomic mixed-batch rejection in both input orders,
exact-registration binding, missing/malformed paired authority, current replay
refusal, historical canonical/ACK/read preservation and Stop/revoke/delete
precedence. Historical structured evidence is seeded through a single test-local
old-policy simulation; no permissive production resolver was added.

One new focused real PostgreSQL scenario ran with the existing runner's dedicated
`lc_p0_test` guards, schema checks, unique actor and exact-actor cleanup:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m services.api.tests.postgres_producer_admission_check
```

`LC_TEST_DATABASE_URL` was supplied privately from the operator's existing handoff,
without printing or saving connection details. [Actual output](pixel-producer-postgres.txt)
records PostgreSQL 18.6, **16 HTTP checks / five groups**, and completed cleanup of
the one generated actor. It used actual PostgresStore plus in-process ASGI HTTP,
without a listener or API/database restart. The original installed migrations
0001–0003 were verified, not reapplied. Fresh honest gaps, PNG/ink originals and a
frame commit; schema-valid structured/mixed/ink spoof batches fail with 403 before
any document or ACK mutation; exact retries honor current missing/corrupt profile
refusals; retained content and original bytes remain unchanged. Only synthetic
profile faults on that test actor were restored. Previous DB/restart campaigns
were not repeated, and this is not new process-restart evidence.

## Limits and next owner

This is current producer admission, not evidence of independently acquired DOM,
own-ink editing history, real-screen coverage, semantic understanding or mastery.
The complete mixed-source product remains required and needs separately reviewed
acquisition authority. Real provider receipt, disclosure permission, native
host/producer operation, full R51/R52/A30/A31 and both per-desktop §7.1 gates remain
open. No user preview, Paperclip, paid provider/account action or database restart
is part of this correction. Lead owns integration and downstream host configuration;
focused independent QA follows on the integrated boundary.
