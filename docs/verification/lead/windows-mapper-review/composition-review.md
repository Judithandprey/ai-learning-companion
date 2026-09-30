# Windows mapper → actual Backend → Learning composition

**HOLD the unchanged mapper's integration claim.** Schema-valid output does not cross the current producer admission boundary. The unchanged harness request returns **403 forbidden**; the unchanged native request returns **409 dependency_missing** because its declared editable-ink original is unavailable. Both refusals leave all store documents unchanged after the separately successful PNG uploads. The single explicitly derived, surface-only harness diagnostic reaches Learning successfully; it does not turn either original request into a pass.

Scope: exact mapper `80da708f21ad87a11073de0ab5749b9cb8fee468`; Backend/contract/Learning export `7b46bec8efaca109f622541cfa551cfdf794589d`. Applied project PONYTAIL LITE: existing factory, HTTP helpers, archive/readers/resolvers and Learning entrypoint; no alternate API, mock ACK, admission bypass, production edits or added host.

## Reproduction and provenance

From `/home/agentsdock/Projects/learning-companion/repo`:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/windows-mapper-composition.py > /tmp/windows-mapper-composition.log 2>&1
```

Final probe exited **0**, verifying the expected integration refusals and diagnostic successes. `0` is the probe result, not unchanged mapper acceptance. The script accepts explicit `--backend-root`, `--fixtures`, `--source-git`, `--output` paths and verifies the recorded exact commit bytes before testing. Default export: `/tmp/windows-mapper-backend-7b46bec`; supplied fixtures: `/tmp/lc-windows-mapper-fixtures/docs/verification/web/evidence`.

Verified **17/17 fixture files** byte-for-byte against mapper Git blobs; **218/218** exported blobs against Backend Git (99 `services/api`, 9 `services/learning`, 110 `packages/contracts`). All 17 supplied fixture hashes also match before and after the probe. Unchanged bodies go to the actual ASGI route as their original bytes, with original keys; real PNG bytes are PUT through typed-original HTTP and GET back exactly. No missing ink data is synthesized.

| Actual input | Bytes | SHA-256 | Result |
|---|---:|---|---|
| Unchanged harness body | 11265 | `c68d363ed0dc156e1b729836bc0efc682274303fad314f0fdd77a8b8037b4892` | 403 forbidden |
| Unchanged native body | 17651 | `087439df2ee792e35e92140a62eecaad1cfa99f2281b9138da5d15a97aa1242b` | 409 dependency_missing |
| Diagnostic surface-only harness clone | 11188 | `928fa52b0357f186a0b5cc6299ca94ecf090a1cc2aec588592a1276ce9a692af` | 200, actual archive and Learning |

## Blocking seam and minimal owner correction

**P1 — producer surface incompatible with its current granted acquisition profile.** `apps/windows/src/shared/frame-ingress.ts:79,337` types/emits `surface: original_screen_overlay` for every Process record, including gaps. The actual consented runtime uses `desktop_pixels`; `services/api/capture.py:158–161` admits only `external_app / visual / coverage`, checked at line 726 before commit. With a pristine MemoryStore, synthetic explicit identities, consent, registered live stream, registered display and all three real harness PNG originals uploaded/read back, the unchanged seven-record request returns `{contract_version:0.2.10,error:forbidden,retryable:false}`. No capture records, raw frame rows or replay receipt exist; the full store equals its pre-request snapshot.

Minimal Web correction: emit the current allowed pixel-observation surface while retaining all actual WindowsFrame raw/composed/ink/source facts, unknowns and gaps; regenerate fixtures and verify an unchanged emitted body through this real boundary. Do not loosen Backend admission or relabel observed pixels as permission for structured edit-history acquisition. This is a producer/consumer compatibility defect, not evidence of a Backend auth bypass.

**Native original-availability limit.** The native body names `example-ink-example-native`, SHA-256 `3c8b25cdc03650301b6155b26d564f74c8d4ea57f6d5e1e53d755c1a0024f941`, declared 4096-byte JSON. Supplied files contain no such bytes. Eight real PNG artifact identities (seven distinct files, one intentionally duplicated raw/composed identity pair) upload/read back; submitting the unchanged eight-record/five-frame body returns retryable 409 `dependency_missing`, with no capture/frame/replay writes. Dependency validation precedes surface admission, so **403 is not the observed native result**. Its same surface mismatch remains visible in source/body. Schema/binding validation alone cannot establish original-byte availability. Supply a real independently retained matching ink original in a future fixture or label that fixture metadata-only; never fabricate the missing original or silently remove its record.

## Diagnostic positive evidence — only the derived harness

Parent explicitly authorized one diagnostic clone. It changes only `/batch/records/0..6/surface` to `external_app`; a reverse-change equality assertion proves every other decoded field unchanged. IDs, sequences, idempotency key, source, WindowsFrames and PNG bytes are identical. The original files stay untouched; clone is `/tmp/windows-mapper-diagnostic-external-app.body.json`.

Actual `create_local_capture_runtime` → consent/registration/typed-original HTTP → `/v2/process/windows-frames:batch` → committed `CaptureArchive` → current-authorized `read_windows`/`resolve_windows` → `prepare_observation_window` verifies:

- Same-key clean retry after the original refused request; actual ACK accepts all seven records. Canonical archived records and WindowsFrame rows equal the submitted diagnostic objects.
- Learning retains **7/7 records, 0 omitted**, three frames (samples 2/4/6), and **6 raw/composed attachments totaling 35,310 bytes**. Each attachment exactly equals its supplied 5,885-byte PNG; identical raw/composed originals retain distinct roles rather than being deduplicated. Four frameless records remain `missing_frame`, with their original unknown/partial/missing-events coverage.
- Whole record/frame/source equality preserves all supplied native facts, gap profile, null capture/process clocks and provisional scope. All adjacent clock comparisons, chronology and capture intervals stay unknown. Mapper `unrepresented` notes and original manifest retain details such as known gap duration and session end not encoded as Process fields; the probe does not invent those details in Learning.
- Exact replay is unchanged and writes nothing. Recreating the actual factory over the same MemoryStore with a rotated token preserves the exact ACK/packet; the old token gets 401 in the new runtime.
- Real Stop with unknown pre-stop boundary survives factory recreation; historical Learning reads remain exact, while cached submission returns 409 `capture_stopped` without writes. Revoking the current token withholds the whole Learning packet and HTTP returns 401, with no writes.
- Provider receipt stays `not_attested`; presentation permission stays `not_granted`.

Display registration is real Backend behavior: the returned descriptor preserves the supplied identity/source fields and uses server-controlled `created_at`, not the proposal's timestamp. Tests use a fixed injected synthetic auth clock (`2026-09-29T12:00:00Z`), not fixture timestamps as evidence of current authorization.

## Files and limits

`/tmp/windows-mapper-composition-results.json` records exact response bodies, original bindings/hash/length, ACK, per-record image hashes/counts, missing-original metadata, manifest-only notes, source provenance and lifecycle flags. `/tmp/windows-mapper-composition.log` is the final successful probe transcript.

- Probe SHA-256: `a720c4be7262c03e93ed1db6566f764908794ed3bed6dd479a2439373e219127`.
- Results SHA-256: `18fc3dc1fc3b0a3cea4f695be5237ffda19dc58b5c041c528111b653ad726ffa`.
- Log SHA-256: `397fb5fb2a5ff0be7e40f0292f262dc5670e992d051fd0f48b715c7ce34678dd`.

No Windows/native app, display, hardware pen, listener, DB, provider or real learner authority was used. Harness PNGs are the author's fake-renderer outputs; native PNGs remain historical author-capture evidence with synthetic archive identities, not a new independent native run. Same-store factory recreation is not database/process-restart durability. No original-body full composition succeeded, no native no-ink subset was manufactured, no actual AI delivery/presentation or product acceptance is claimed. Main, worker trees and supplied original artifacts were not modified.
