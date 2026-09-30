# QA retest of QA-WIN0210-01 (malformed receipt witness) at `b19930b`

- **Assignment:** lead `handoff_ae543ceafe81d8cfc3d0ff6c7235383c`, a focused changed-path retest run after the
  Windows display retest (`890aa3a`).
- **Candidate:** exact pushed main `b19930b1d6413ba2f289e2a77a4762356bd13ce0`. It contains Backend `7d19e09`,
  integrated as `f7ef3ac`: receipt classification now runs before witness prefix and deletion filtering.
- **QA branch:** `team/qa` merged the candidate normally as `f21c4b3`. The add/add conflicts on the QA file and its
  report were resolved to the lead's integrated versions (frozen fixtures, promoted xfail annotations). Code, the QA
  test and the fixtures are identical to `b19930b`.
- **Decision: PASS. QA-WIN0210-01 is closed for the tested malformed shapes.**
  - The six original cases now pass unchanged.
  - Intact-witness refusals hold.
  - 24 further malformed-receipt cases refuse with a deliberate 503 and no mutation.
  - Erasure and genuine unmarked controls are served.
  - The lead-declared key-semantics residual is pinned as a strict xfail.
- **Scope:** in-process MemoryStore/ASGI through the runtime rig of the 0.2.10 QA file. No DB, listener, display,
  native app or provider. As instructed, the 312/485 suites and the mutation campaign were not rerun.
- **Evidence:** [p0-13-windows-witness-retest-b19930b/](p0-13-windows-witness-retest-b19930b/): `pytest-verbose.txt`,
  `regression-sensitivity.txt`, `future-clock.txt`.

## Results (82 pass, 1 strict xfail)

| Area | File / cases | Actual |
| --- | --- | --- |
| Original QA-WIN0210-01 cases | `test_p0_13_windows_ingress_qa.py` `malformed_gap` ×6 | With both markers lost, the gap receipt is damaged: `{}`, `deleted:1`, or `deleted:true` on a full row. Fresh structured raw and cached raw retry both give 503 or 403 with no writes. The fresh-`{}` control still gives 503. The assertions are unchanged; only the lead removed the xfail annotations |
| Intact witness | same file, 3 cases, plus the Windows-route refusal | 403 for honest, structured and cached-retry raw requests, no writes. The Windows route refuses the unmarked stream on its own |
| Other malformed shapes | `test_p0_13_windows_witness_retest_qa.py`, 12 shapes × fresh/cached = 24 | Key empty, non-string or missing; `deleted` a string, null or missing; an extra member; a non-lowercase fingerprint; ACK not JSON or not an ACK; duplicate source IDs; an erasure shape with an empty key. Every case gives exactly `503 unavailable` (0.2.6 route), writes nothing, and the crash spy proves a deliberate `DomainError` rather than a masked exception |
| Deliberate erasure control | 2 | The exact `{key, deleted:true}` gap receipt is not treated as corruption (no 503). Like row removal (the existing control), it leaves no Windows-use witness, so the older-family request is served: fresh gives 200 accepted; cached gives its original ACK with no writes |
| Genuine unmarked generic capture | 1 | A never-Windows unmarked stream with valid receipts and a writer-shaped erasure row keeps working. Structured raw is accepted fresh, its exact replay returns the same ACK with no writes, and a further batch is accepted; the stored record keeps `web_dom`/`structured` |
| Breadth of fail-closed refusal | 1 | A truthy-deleted full receipt under an unrelated key refuses a fresh Windows batch on the marked stream (503, no writes). The committed batch's valid exact receipt still replays its original ACK |
| Residual (lead-declared) | 1 strict xfail (`raises=DowngradeAccepted`) | A well-formed receipt whose key is rewritten into a non-witness namespace still stops witnessing: 200 and committed. Key semantics are not validated, as the correction record states. This is not a new finding |

## Sensitivity

`regression-sensitivity.txt` runs both QA files, byte for byte, on exact archives.

- **Pre-correction `484e06a`** fails:
  - the 5 original failures;
  - 18 of the 24 new malformed-shape cases, plus the breadth case;
  - 2 more that error: for non-string keys the old code raised an unexpected exception masked as 503, and the crash
    spy caught it.
  - The ACK-not-JSON and wrong-shape rows were already refused with 503 before the fix, because their intact key
    still matched the witness prefix.
- **`f7ef3ac` and `b19930b`:** 82 pass, 1 xfail.
- **Future wall clock** (`utc_now` set to 2026-10-02): 82 pass, 1 xfail.

## Limits

- **Synthetic retained damage only:** no route or writer produces these rows. Severity stays Low: the defect needed
  two injected faults and had no ordinary-client exploit.
- **Arbitrary serialized-key semantic corruption** remains unvalidated (residual above). No general corruption-proof
  claim is made.
- **Not covered here:** PostgreSQL, native producer, provider and §7.1. The earlier 0.2.10 API evidence
  (`ee0faee`, 49 pass) stands as history, and the display retest is `890aa3a`.

## Reproduce

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v -rxX tests/e2e/test_p0_13_windows_ingress_qa.py tests/e2e/test_p0_13_windows_witness_retest_qa.py
```
