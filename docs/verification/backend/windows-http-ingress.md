# Opt-in Windows HTTP ingress 0.2.10

Existing P0-04/09 task with explicit lead runtime delegation in
`handoff_6afaab82e8fb04bd9d312dd64d88d72c`. Exact integrated baseline
`d6a444cb9af00cbc61d047d60806e6c888b0acca` was normally merged into the clean
backend branch as `e7e5620ee05ca0e0d3aefb0c2e36415e32de2be6`, without conflicts or
resetting prior work. Current AGENTS/TEAM, role, workflow and source/English
requirements were unchanged. Read the full released 0.2.10 package, generated
OpenAPI, corrected internal call path and lead's stored Learning composition.

PONYTAIL LITE: add one explicit route to the existing ingress factory and use the
existing ordered-envelope transaction engine. No new archive, identity, framework,
schema, migration, dependency or root configuration. Scope is service/test/evidence
only; default app, preview, device/provider and external-account state are untouched.

## Delivered behavior

`POST /v2/process/windows-frames:batch` is present only with the independent
`enable_windows_ingress=True` boolean. It defaults false in the ingress,
single-origin composition and trusted-local-runtime factories. The route requires
current Bearer auth, capture scope, `process.capture.v0.2`, distinct
`process.windows-ingress.v0.2.10`, existing source/control membership and current
trusted `desktop_pixels` profile. The local runtime refuses incompatible authority
or profile before storage mutation; existing explicit fresh-consent rules remain.

Original PUT/GET and source/control setup reuse their released independent routes
and permissions. Windows capability grants none of those permissions. The
ingress-only OpenAPI adds only the enabled path/schema and exact Windows replay
description; the composed factory still withholds a combined schema.

The exact 0.2.10 wrapper, Process 0.2.0 records and Windows 0.2.9 descriptors share
one actor transaction and 0.2.0 verified ACK. Canonical equality includes the whole
ordered envelope, preserving frame/record/artifact/evidence array order; object
member order alone is irrelevant. Replay uses actor + POST + full Windows route +
Idempotency-Key. It does not reuse the internal sorted frame map or a wrapper cache.

Both PNGs and separate editable originals verify before new or cached success.
Raw-only, legal image aliases and restricted frameless coverage are retained
honestly. Current authorization, source/identity, Stop ceilings, withdrawal,
deletion/generation, immutable image facts and missing-witness checks stay in the
transaction. A Windows HTTP gap-only receipt now also witnesses lost producer
configuration, preventing both missing profile markers from downgrading through
generic/legacy/raw/desktop entries or prior cached success.

Errors follow 0.2.10 with existing strict auth/query/key/media/length/encoding/raw
size/JSON/version precedence. Invalid/duplicate/nonfinite JSON remains 400;
explicit unsupported outer/batch/frame versions precede generic shape failures.
Both metadata size ceilings remain 4 MiB; files remain at 32 MiB. Nothing is
trimmed or normalized into success. Late failure/cancellation emits no ACK or
partial mutation; current permissions are required for a clean retry.

## Actual execution

Use `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q`.
All tests below run in-process ASGI/MemoryStore with synthetic identities, consent
and PNGs. They establish no PostgreSQL persistence or Windows device operation.

- Final combined run of `test_windows_ingress_http.py`,
  `test_windows_ingress_transport.py`, `test_windows_capture_runtime.py` and
  `test_windows_http_learning.py`: **190 passed in 7.98s**. This includes actual
  request task cancellation during body reading in both ingress and composed
  apps: cancellation propagates and storage stays unchanged. Injected transaction
  failure/cancellation also leaves no ACK or partial state and permits a clean
  authorized retry. Injected `asyncio.CancelledError` inside the synchronous
  transaction becomes a failed ASGI response under the current middleware; this
  is distinct from actual request task cancellation propagation.
- Actual composed ASGI app -> stored `read_windows` / `resolve_windows` ->
  production Learning: `test_windows_http_learning.py`, **6 passed in 0.84s**.
  One batch includes distinct dual PNGs, shared-image alias, raw-only and frameless
  records. Exact records, source/ink references, both roles/bytes, requested order,
  unknown clocks and ungranted presentation survive actual PNG validation and
  final current metadata reads. Exact HTTP retry preserves ACK. Stop retains
  authorized history; missing composed bytes, source deletion/revocation and token
  revocation withhold the packet. A real token revoked after both actual image
  resolutions is caught by the final actual full-selection read.
- New trusted-runtime author run: **29 passed in 1.21s**. Three focused existing
  raw/desktop runtime/default-composition checks: **3 passed in 0.39s**.
- Focused old-route regression: `test_ingress_mounts.py`,
  `test_capture_app_dispatch.py`, and the raw/desktop explicit-version and ordered
  envelope cases: **93 passed in 2.54s**. This checks affected shared routing and
  envelope behavior without rerunning unrelated DB/native suites.
- Independent read-only production review found no blocking issue in current
  auth, ordered transactional replay, gap-only witness or Learning composition.
  `git diff --check` passed. Overlapping author/final runs are not summed.

## Remaining limits and next owner

No listener, preview DB/service, production identity, native producer, external
provider or Paperclip was activated. Local runtime consent and credentials are
synthetic test inputs, not production login or acquisition permission. Cancellation
injection at synchronous transaction boundaries is not a claim of interruptible
mid-commit scheduling. No new real-DB acceptance or restart of a database occurred.

Retained image identity checking still scans this actor's frame metadata once per
Windows ingress/read/resolver call. Raw/composed resolution scans independently;
scan work/memory is separate from bounded response size. Producer RGBA hashes and
native composition remain declarations; Learning validates supported PNG bytes
and dimensions without attesting those claims. Provider receipt, freshness, native
ink, audio, Notability and desktop core gates remain unverified by this slice.

Feature rollback disables the explicit flag while preserving originals, receipts
and tombstones. Next: Lead review/integration, focused existing QA, then Windows
owner adoption of the exact released transport after its current mapper work.
