# QA retest of desktop pixel-producer admission at `d412ed9` (QA-DESKTOP-RT-01)

- **Assignment:** lead `handoff_41583813c76f749512b5a52e8031931d`. This is the one conditional next task. It started
  after the Windows pass was delivered (`cba66c8`) and the display was released.
- **Candidate:** exact main `d412ed90495b0bb894ec6f7059d9ebf62a2186fb`. It contains Backend `81e5441` + `2209a11`,
  integrated as `e4b2d41` / `03feb72`.
- **QA branch:** `team/qa` merged the candidate normally as `133ce0a`. `services/` and `packages/` are byte-identical to
  `d412ed9`.
- **Decision: PASS, and QA-DESKTOP-RT-01 is closed for the current pixels-only producer.** 21 of 21 independent cases
  pass through the actual trusted runtime factory and HTTP routes.
  - A marked producer refuses structured and mixed claims on the desktop, raw and legacy routes. This includes a
    cached-success retry after trusted adoption.
  - The retained first-gap witness refuses fallback after both profile markers are lost.
  - Genuine never-desktop structured input, another actor, and another stream stay compatible.
  - Historical bytes, ACK, rows and read shape are unchanged.
  - No defect was found.
- **Scope:** in-process MemoryStore and ASGI only. Not covered: PostgreSQL, native producer, provider, user preview,
  and actual DOM/own-ink acquisition.
- **Test:** [tests/e2e/test_p0_13_pixel_admission_qa.py](../../../tests/e2e/test_p0_13_pixel_admission_qa.py),
  sha256 `54ae3a91…df62` after the clock correction below (first delivery `8b5b0f2`: `581e6164…eff4`).
- **Evidence:** [p0-13-pixel-admission-d412ed9/](p0-13-pixel-admission-d412ed9/):
  - original logs, kept unchanged: `pytest-verbose.txt`, `regression-sensitivity.txt`, `controls.txt`;
  - correction logs: `clock-correction.txt`, `pytest-verbose-clock-fix.txt`.

## Method

The test is independent of the author's registry-bound ingress-app tests.

- **Runtime:** every case builds `create_local_capture_runtime`, the trusted host seam, over MemoryStore.
  - A pixels-only producer uses `producer_profile="desktop_pixels"`, with desktop and raw ingress enabled.
  - A generic producer uses no profile.
  - Adoption of an existing incarnation is a runtime **reopen** with the profile and `fresh_consent=False`.
- **Requests:** registration, display source and originals are sent over HTTP to the composed app.
- **Routes:** desktop 0.2.8, raw 0.2.6 and legacy 0.2.4.
- **Inputs:**
  - Request bodies come from the Backend runner's corrected `scenario()`, with honest `external_app` / `visual` /
    coverage records.
  - Structured claims are QA-made spoofs: the generic example's `web_dom` / `structured` / `reselect` B→C with
    `trusted_input_event`.
- **Synthetic damage:** deleting both internal `producer_profile` fields is internal damage that no HTTP route can
  cause. It is labelled in the test (`damaged` fixture).
- **Refusal check:** every refusal must be exactly `403 {forbidden, retryable:false}` in its route's version, and
  every actor document must be unchanged.

## Results (21/21)

| Area | Cases | Actual |
| --- | --- | --- |
| Trusted binding | 2 | The reopened runtime marks both `control_start` and `control_stream` with `desktop_pixels` (grant consumed, same producer). An honest first gap and an honest frame are accepted. Desktop ingress without the trusted profile (none, `structured` or an unknown name) raises before any document is written |
| Structured claim, marked producer | 3 | Desktop, raw and legacy all refuse with 403 and no writes |
| Mixed batch | 2 | Honest plus spoof, in either order: 403, nothing committed |
| Honest pixels still work | 1 | An honest raw frame record on the marked stream is accepted |
| Cached success after adoption | 2 | A generic runtime commits a structured raw (or legacy) batch; its exact retry replays the same ACK; then the host reopens with the profile. After that, the exact retry is **403 with no writes**. The canonical record, the replay row with its original ACK, the original GET (exact PNG bytes) and the current-authorized read (`read_raw` / legacy reader) are all identical to before adoption. The old claim stays a retained declaration |
| First gap + both markers lost (synthetic) | 5 | After an honest desktop gap (no frame), removing both profile fields refuses fallback with no writes, in every tested case: structured raw, structured legacy, honest raw and honest desktop all give 403. A generic runtime reopen of the damaged incarnation cannot downgrade it either (structured raw gives 403) |
| Compatibility | 6 | Never-desktop (own store), another actor with the same stream id (shared store), and the same actor on another stream with another producer: a structured raw and legacy commit are accepted, the exact retry returns the same ACK, the stored record keeps `web_dom` / `structured`, and the marked incarnation's documents are unchanged |

The legacy spoof body is valid. The same builder is accepted on generic streams, and the same batch is accepted
before adoption and refused after it. So its 403 on the marked stream comes from admission, not validation.

## Regression sensitivity and controls

- **Sensitivity** (`regression-sensitivity.txt`): the same test file was run on exact archives.
  - Pre-correction integration `e4b2d41` fails 4 cases: the three raw/legacy fallbacks after marker loss and the
    generic-reopen downgrade.
  - `03feb72` and `d412ed9` pass all 21.
  - So the retest detects the gap the correction closed.
- **History control** (`controls.txt`): QA's earlier native raw-ingress suite passes 91/91 at `d412ed9`. Generic
  unmarked capture with native fixture bytes is unaffected.
- **Owner evidence, rerun separately:** `services/api/tests/test_producer_admission.py` passes 56/56. This is not
  independent evidence.
- **Not rerun:** the earlier PostgreSQL results (Backend 16 HTTP checks; QA `24cbcf8`) keep their original commit
  scope. No DB campaign was rerun, as instructed.

## Clock correction (after lead review of `8b5b0f2`)

The lead's bounded review (`handoff_dce7d28756421c656638adfa5e0ab49c`) found a QA test defect. It is not a product
defect.

- **The defect:** the historical-read controls authenticated the reader guard with the wall clock (`utc_now()`),
  while the runtime used the injected clock `NOW`, and the test token expires at `NOW + 1 h`, 2026-09-30T14:00Z.
- **Consequence:** the two cached-success cases would fail after that wall time regardless of the production fix.
  Their first-delivery pass (13:1x UTC) was valid only because it ran before 14:00.
- **Correction:** the guard now uses the same fixed `NOW`, and the wall-clock import is gone. No assertion changed.

| Check | Result |
| --- | --- |
| The `8b5b0f2` test file under a future wall clock (`tests/e2e/qa_future_wall_clock.py` sets `utc_now` to 2026-10-02) | exactly the 2 historical-read controls fail with `unauthenticated`; 19 pass |
| Corrected test, real clock (13:26 UTC) | 21 passed |
| Corrected test, future wall clock | 21 passed |

The other 19 cases also pass under the future wall clock, which shows the production paths exercised here use the
runtime's injected clock. The regression-sensitivity archives were not rerun: only the reader guard's clock changed.

## Limits

- **Evidence level:** MemoryStore/ASGI with synthetic identities, consent, 2×2 PNG and ink. Not covered: PostgreSQL
  triggers, native mapper output, or the Windows producer, which is not yet bound to this profile.
- **What is not accepted:** this restricts the current pixels-only producer. It does not accept real DOM, own-ink or
  mixed acquisition, which a future producer needs with reviewed acquisition authority.
- **Synthetic damage:** marker loss is internal damage only. As in the lead's correction review, simultaneous
  destruction of every witness field is not covered.
- **Out of scope:** provider input, presentation/disclosure, and both per-OS §7.1 gates remain open.

## Reproduce

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v tests/e2e/test_p0_13_pixel_admission_qa.py
# future wall-clock check (the plugin only replaces utc_now after collection):
PYTHONPATH=tests/e2e PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -p qa_future_wall_clock -q -s tests/e2e/test_p0_13_pixel_admission_qa.py
```
