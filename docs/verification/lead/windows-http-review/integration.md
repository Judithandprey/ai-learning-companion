# Windows HTTP ingress: reviewed implementation release

Held owner **72e928a4bfd9664b2c733c7d32d8d14d2d2fb813** plus correction
**7b46bec8efaca109f622541cfa551cfdf794589d** integrate as **6546cbe** and
**e3b4fd0196e7b2cd01a60861d6f1d7ed0601e372**. The entire `services/api` tree is
byte-identical to the corrected owner. The old H1 failure and original probe are
preserved; [independent correction review](correction-review.md) closes that HOLD
with 41 actual focused passes, including the unchanged 503/no-mutation regression.

The Windows0.2.10 route now has an implemented, explicitly opt-in handler in the
existing ingress/composed/trusted-local factories. Every default remains OFF.
It reuses registered shared-display sources, typed original upload, current
control/admission and one actor transaction. Ordered full-envelope replay is
separate from the internal map namespace. Current permissions, source/lifecycle,
both PNG originals, editable references, image consistency and retained witnesses
are checked before fresh/cached success. Present malformed receipts cannot be
reconstructed by retry; exact valid ACKs and deliberate erasure remain intact.

## Resulting-main checks

At exact e3b4fd0, existing locked interpreter, no bytecode/cache/plugin loading:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_windows_ingress_http.py \
  services/api/tests/test_windows_ingress_transport.py \
  services/api/tests/test_windows_capture_runtime.py \
  services/api/tests/test_windows_http_learning.py \
  services/api/tests/test_capture_replay_presence.py \
  services/api/tests/test_ingress_mounts.py \
  services/api/tests/test_capture_app_dispatch.py \
  docs/verification/lead/windows-http-review/original-defect-probes.py
```

**312 passed in 11.66 seconds.** This includes the original eight independent
probes and the previously failing H1 unchanged. The main run establishes combined
behavior after integration; overlapping owner/independent counts are not summed.
`git diff --check` passes. Lead checked all 62 merged OpenAPI schema components
across enabled families: no incompatible shared name. No existing wire shape,
migration, dependency or runtime activation changed.

Tests use in-process ASGI, MemoryStore, synthetic identity/consent and test PNGs.
They exercise actual handler/archive/reader/resolver/Learning code, not a fake ACK,
but do not prove PostgreSQL durability, a Windows producer connection, real AI,
physical input, audio, Notability or either complete desktop gate. Native fixture
composition and independent role-QA remain separately reported. The per-actor
metadata scan cost and producer-declared RGBA hashes remain explicit limitations.

Next: existing QA gets one independent API-only changed-path pass on this release;
no shared desktop or DB campaign. Web's current mapper/alignment fixes remain
owned and preserved; its later transport adoption follows approved mapper and HTTP
baselines. Product trusted bootstrap, credentials/provider and interactive Mac
remain their own dependencies, not activated by this library/factory release.

## Independent QA started

At exact published **7b71d7b19db29f877948f21c9921b2352d9b7d00**, native dispatch
**handoff_80bf0e1dad7ecaf6e8d7ddeaa2be8a86** was accepted. Actual reply
**handoff_cd409ee4278a2e3459ba30841cd4d1cc**, 2026-09-30 14:30:55 UTC, confirms
QA merged it normally as **56f8ecd** and started the bounded API behavior pass.
Lead compared both `services` and `packages` trees: zero differences. Three QA
report merge conflicts retain Lead's qualified historical Windows evidence.
This is start evidence, not an acceptance result. The task uses MemoryStore and
synthetic consent with real test bytes; no listener, DB, display or provider.
