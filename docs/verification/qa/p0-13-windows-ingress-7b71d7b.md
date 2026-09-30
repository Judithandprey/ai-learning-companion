# QA API acceptance of Windows capture ingress 0.2.10 at `7b71d7b`

- **Assignment:** lead `handoff_80bf0e1dad7ecaf6e8d7ddeaa2be8a86`, an independent API-only acceptance of the changed
  Windows 0.2.10 path.
- **Candidate:** exact pushed main `7b71d7b19db29f877948f21c9921b2352d9b7d00`. It contains Backend `72e928a` plus H1
  correction `7b46bec`, integrated as `6546cbe` / `e3b4fd0`.
- **QA branch:** `team/qa` merged the candidate normally as `56f8ecd`. `services/` and `packages/` are byte-identical to
  `7b71d7b`.
- **Decision: PASS for the assigned changed path, with one Low retained-corruption finding (QA-WIN0210-01).**
  - 49 of 49 acceptance cases pass through the actual opt-in trusted-local runtime and HTTP routes.
  - 5 strict-xfail cases pin QA-WIN0210-01. That finding needs two simultaneous synthetic faults in retained rows,
    and no HTTP route can produce either one.
  - QA sees no ordinary-client defect. Whether QA-WIN0210-01 blocks is the lead's decision; QA recommends a small
    Backend follow-up.
- **Scope:** in-process ASGI and MemoryStore only. Not covered: PostgreSQL, the Windows producer or its mapping and
  transport, native desktop, display, provider, user preview, and both §7.1 gates.
- **Test:** [tests/e2e/test_p0_13_windows_ingress_qa.py](../../../tests/e2e/test_p0_13_windows_ingress_qa.py),
  sha256 `f5546cc4…3f8c`.
- **Evidence** in [p0-13-windows-ingress-7b71d7b/](p0-13-windows-ingress-7b71d7b/):
  - `pytest-verbose.txt`, `runxfail.txt`, `future-clock.txt`, `regression-sensitivity.txt`;
  - `mutation-sensitivity.txt`, with the mutant edit scripts in `mutations/`;
  - `controls.txt`, `env.txt`.

## Method

- **Runtime:** every ingest case uses `create_local_capture_runtime` over MemoryStore, with
  `enable_windows_ingress=True`, `producer_profile="desktop_pixels"` and the fixed runtime clock `NOW`. Registration,
  display source, originals and batches all go through the composed app over `httpx.ASGITransport`.
- **Direct factories:** refused configurations (flag omitted, capability missing) use `create_capture_app` /
  `create_ingress_app` directly, because the runtime refuses to build them.
- **Stand-ins:** Archive domain calls stand in for source revoke/delete and account disable, which have no HTTP route.
- **Readers:** `read_windows`, `resolve_windows` and Learning's `prepare_observation_window` run on the stored data
  under a QA guard that uses the runtime clock.
- **Inputs:** the five real producer PNGs (2560×1600 RGBA, file name = sha256), each paired with **its own released
  WindowsFrame 0.2.9 example descriptor** (`examples[0..3]`), so every image fact is producer-declared.
  - QA changes only the identities, the distinct-ID alias's composed archive ID, and the raw-only frame's absent
    composition.
  - The editable ink is synthetic JSON. The backend never decodes pixels or recomputes `pixels_sha256`.
- **Refusal check:** every refusal must match the exact error body for its route version, contain no PNG bytes, and
  leave every actor document unchanged.
- **Crash spy:** an autouse spy fails any case where a 503 comes from the response boundary masking an unexpected
  exception rather than a deliberate `DomainError`. The only exception is the injected write fault.
- **Synthetic damage:** all retained-row damage and in-transaction faults are labelled in the test.

## Results (49 pass, 5 strict xfail)

| Area | Cases | Actual |
| --- | --- | --- |
| Default closure and distinct capability | 1 | With the flag omitted, the runtime, composed app and ingress app all return 404 `not_found` in the 0.2.4 error version. With the flag on but the capability missing: 403 `capability_required` (0.2.10). The Windows capability alone does not open original GET or control GET (403, no writes). The runtime refuses the flag without `desktop_pixels` or without the capability, before any write |
| Ordered chain to verified ACK | 1 | One batch: frameless gap, raw-only, distinct-ID alias (same bytes, second archive ID), same-ID alias, distinct raw+composed with ink. The response is HTTP 200 with a ProcessBatchAck 0.2.0 in record order; the gap has 0 receipts; the others have 2/3/2/3 receipts, all `verified`. `validate_ack` passes, and each original GET returns exact bytes |
| Stored readers and Learning | 1 | `read_windows` is stable, historical, and returns the exact records, frames and descriptor. `resolve_windows` returns exact raw and composed bytes, and raw-only composed is `unobservable` (never a raw fallback). Learning keeps the supplied order: the gap is `missing_frame`; raw-only composed is `not_present`; images are `attached` with exact bytes; parents are included. Presentation is `not_granted`; provider/live/commit/alignment are `not_attested`; chronology, intervals and completeness are `unknown`; semantic change and user reasoning are `not_inferred`; every clock comparison is `no_process_capture_clock` |
| Each image role uses its own archive ID | 4 | Synthetic replacement of one stored original's bytes stops only the roles bound to that ID (resolver `unavailable`, Learning not attached). Distinct composed, alias composed, alias raw, or both roles of the same-ID alias. Identical bytes under another ID never stand in |
| Shape and image identity | 4 | A frameless record claiming observed samples or carrying an artifact, or an in-envelope alias with a contradictory `pixels_sha256`: 422 `invalid_request`. A distinct-ID alias contradicting retained facts: 409 `record_conflict`. Every refusal writes nothing, and each unchanged control request is accepted |
| Replay, order and key | 1 | An exact replay 10 minutes later returns the original ACK (still `accepted`). Deeply reordered object members, which differ on the wire, replay the same ACK. Reversed frames at the same key: 409 `idempotency_conflict`. A changed committed record under a new key: 409 `record_conflict`. The same body under a new key is `duplicate` and adds only its receipt row; committed rows are unchanged |
| Present malformed receipt | 5 | `{}`, `deleted:0`, bad fingerprint or invalid ACK JSON: 503 `unavailable`, with no mutation and no rebuilt ACK. The crash spy shows each 503 is deliberate. The exact erasure shape `{key, deleted:true}` returns 404 |
| Current fences before fresh and cached success | 22 | For both fresh and cached requests: token revoked or expired before the request, and **under the actor lock**: 401. Account disabled: 403. Source revoked or deleted: 404, and deletion leaves no retained original bytes. Stop: 409 `capture_stopped`. Withdraw: 403. Retained raw original lost: 503. All refusals write nothing. A no-fence positive control succeeds for the same requests |
| Atomicity | 4 | A late missing-ink dependency returns 409 `dependency_missing` with no rows. An injected storage failure at the 2nd `raw_capture_frame`, the 2nd `capture_record` or the final `capture_replay` write (rows already staged) returns 503 with no rows and no ACK |
| First-gap downgrade witness | 5 | After a Windows gap-only receipt and synthetic loss of both `producer_profile` fields, the raw route refuses honest, structured and cached-retry requests (403, no writes). The Windows route refuses the unmarked stream independently of the witness. Sensitivity control: removing the receipt row as well lets the structured request through, so the refusals come from the receipt |
| QA-WIN0210-01 | 1 pass + 5 xfail | See below |

## Finding QA-WIN0210-01 (Low, retained corruption, Backend)

- **Where:** `services/api/capture.py:138-139` in `_admit_evidence`, the unmarked-stream branch. The code is
  `if not replay.get("deleted") and replay.get("key", "").startswith(prefixes)`.
  - The Windows prefix at `:136` arrived with `6546cbe`.
  - The truthiness test itself is inherited from the desktop witness.
- **Steps:**
  1. On a `desktop_pixels` stream, commit a Windows gap-only batch and one honest raw 0.2.6 batch, whose exact retry
     replays its ACK.
  2. Synthetically delete both `producer_profile` fields (fault 1).
  3. Synthetically damage the gap receipt (fault 2) in one of three ways: `deleted: 1`, or `deleted: true` with every
     other receipt field intact, or replace the row with `{}`.
- **Expected:** corrupt committed evidence fails closed. Sources:
  - contract README: "corrupt/missing committed evidence … 503";
  - `correction-review.md:15`: "Nonboolean flags and malformed erasure shapes cannot masquerade as intentional
    deletion";
  - `pixel-admission-review.md:34`: "Malformed surviving witness data should not silently authorize downgrade".
  - The only writer erasure shape is exactly `{key, deleted:true}` (`capture.py:97-99`).
- **Actual** (`runxfail.txt`):
  - A fresh raw request with a structured `web_dom`/`structured`/operation claim returns **200 and is committed**, for
    both `deleted` variants.
  - A cached exact retry of the raw request returns **200 with its cached ACK**, for all three variants.
  - Control: with fault 1 alone, every request returns 403 with no writes.
  - `{}` with a fresh request returns 503, but from the absent-record receipt scan (`:620-625`), not from the witness.
- **Severity: Low.** It needs two simultaneous injected faults in retained rows, and no route or writer produces
  either one. The fresh variant still breaks the pixels-only admission rule that the witness exists to protect.
- **Suggested direction (Backend's choice):**
  - Classify each scanned receipt: skip only the exact erasure shape, and treat any other non-`False` deletion flag,
    non-string key or malformed row as 503.
  - The review workflow also noted two optional hardenings:
    - The surviving frameless display-source `capture_record` could act as an extra negative witness.
    - The same truthiness pattern at `:78`, `:349` and `:447` could share one classifier. These only choose between
      refusals or need further witness loss, so **no defect is claimed there**.
- **Retest:** the 5 strict xfails use `raises=DowngradeAccepted`, which fires only on HTTP 200, and should flip to pass
  once fixed.

## Sensitivity and controls

- **Regression sensitivity** (`regression-sensitivity.txt`, exact archives):
  - Pre-correction `6546cbe` fails exactly the H1 cases `empty` and `deleted_not_bool`.
  - `e3b4fd0` and `7b71d7b` pass 49 with 5 xfailed.
- **Mutation sensitivity** (`mutation-sensitivity.txt`): 14 single-point production mutants from the review workflow,
  built on `/tmp` copies of this exact code. 13 are caught, including:
  - cached success before fences;
  - the witness removed;
  - `if cached:`;
  - a composed alias decoded via the raw ID;
  - a sorted frame map, or member order in the fingerprint;
  - a non-atomic store;
  - no under-lock token recheck;
  - the route defaulting on;
  - receipt validation removed (caught by the crash spy);
  - a duplicate overwriting receive times.
  - **Not caught:** ignoring only the account `enabled` bit (m14), because disabling also bumps the generation. See
    Limits.
- **Future wall clock** (`future-clock.txt`): 49 pass and 5 xfail with `utc_now` set to 2026-10-02, so no guard
  depends on the wall clock.
- **Owner controls** (`controls.txt`, not independent):
  - the lead's 312-check list: 312 passed;
  - `test_windows_*.py` + `test_capture_replay_presence.py`: 485 passed;
  - the earlier QA pixel-admission suite: 21 passed.
- **Independent review:** a three-lens workflow (rigor, finding refutation, coverage) found no product defect beyond
  QA-WIN0210-01, and could not refute it. Its test-gap findings were fixed before this run:
  - alias identity;
  - the flag default;
  - under-lock token fences;
  - the crash spy;
  - late-write rollback;
  - changed-key overwrite;
  - producer-declared frames;
  - positive controls;
  - pinned xfails.

## Requirement relevance (API layer only)

This supports only the data-preservation layer of these requirements. None of them is accepted end to end.

- **R52 / A12 / A31:** external pixels stay `external_app`/`visual` with explicit gaps, and a gap is never an image.
  Replay neither duplicates nor overwrites, and Stop is not restarted. Chronology, reasoning and completeness stay
  unknown.
- **R07 / R46 / R59:** the original raw PNG, the composed PNG and the separate editable ink are retained and resolvable
  independently. This is **not** live original-screen annotation, AI-visible ink recovery or Notability evidence.
- **R35 / R36 / A16:** covered only as per-stream Stop/withdraw fences. There is no multi-device or combined-screen
  evidence.
- **R51 / A30:** attempt history, revisions and web/DOM inputs are untouched by this route. Honest pixel records carry
  no inferred operations.

## Limits

- **Evidence level:** MemoryStore/ASGI with synthetic identities, token, consent and ink; no PostgreSQL, triggers or
  concurrency. Real producer PNGs do not prove producer mapping, transport, composition or ink recovery.
- **Enabled bit:** it is not isolated from the generation bump (mutant m14 survives). Account disable is proven only as
  a whole operation.
- **Cached source deletion:** `source_deleted` for a cached request is also erased by the receipt rewrite, so its 404
  does not isolate the source check.
- **Not independently re-tested:** strict transport errors (media type, length, encoding, 4 MiB), historical
  pre-Stop ceilings and cancellation. Owner tests cover them (`test_windows_ingress_transport.py`,
  `test_windows_ingress_http.py`).
- **Reused, not repeated:** QA-DESKTOP-RT-01 evidence (`8b5b0f2` / `4a250bd`). The shared Windows display was not
  used.
- **Out of scope:** device, provider, presentation/disclosure and both per-OS §7.1 gates.

## Reproduce

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v -rxX tests/e2e/test_p0_13_windows_ingress_qa.py
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -q --runxfail -k malformed_gap tests/e2e/test_p0_13_windows_ingress_qa.py
PYTHONPATH=tests/e2e PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -p qa_future_wall_clock -q -s tests/e2e/test_p0_13_windows_ingress_qa.py
```
