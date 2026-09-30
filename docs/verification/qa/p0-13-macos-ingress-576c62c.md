# QA API acceptance of Mac capture ingress 0.2.12 at `576c62c`

- **Assignment:** lead `handoff_b6ccea87b17bb39bdf6d28118155c98c`, run after the Windows run `8766f75`.
- **Candidate:** exact pushed main `576c62c6679cf0db4d6d18307abd0e727553ee9a`. It contains Backend `40ab42e` plus
  correction `b83ee3e`, integrated as `27cf448` / `a244d56`: the opt-in Mac 0.2.12 HTTP route, the archive, and
  `read_macos` / `resolve_macos` feeding the existing Learning consumer.
- **QA branch:** `team/qa` merged the candidate normally as `de5c391`. `services/` and `packages/` are identical to
  `576c62c`.
- **Decision: PASS for every assigned behaviour (40 acceptance cases), plus one scope finding for the lead to decide
  (QA-MAC-01, pinned by 1 observation case).** 41/41 pass.
- **Scope:** in-process ASGI and MemoryStore through the actual trusted-local runtime. No listener, DB, native Mac,
  display, provider or account work.
- **Test:** [tests/e2e/test_p0_13_macos_ingress_qa.py](../../../tests/e2e/test_p0_13_macos_ingress_qa.py), sha256
  `dcdf901c…4fee`. It reuses only the transport-independent crash spy, the in-lock fault helper and the
  member-reversal helper of the Windows QA file.
- **Evidence** in [p0-13-macos-ingress-576c62c/](p0-13-macos-ingress-576c62c/): `pytest-verbose.txt`,
  `regression-sensitivity.txt`, `future-clock.txt`, `controls.txt`.

## Method

- **Runtime:** `create_local_capture_runtime(enable_macos_ingress=True, producer_profile="desktop_pixels")` and its
  composed app, over `httpx.ASGITransport` and MemoryStore. Registration, display source and originals go over HTTP.
  Refused configurations use `create_capture_app` directly.
- **Older-family frames:** raw 0.2.6 (a 0.2.5 frame written out in the test) and Windows 0.2.10 (the released 0.2.9
  example, raw only). Each goes through its **own ordinary HTTP route on the same runtime**.
- **Readers:** the actual `read_macos` / `resolve_macos` and `prepare_observation_window`, under a QA guard on the
  runtime clock.
- **Inputs:** the retained audited Swift-generated synthetic PNGs ("not display capture", `provenance.json`), each
  with its own released MacRetainedFrame 0.2.11 descriptor and uploaded under its audited archive ID.
  - QA picked frames the author uses least: 2 and 6 (distinct raw and composed bytes), 7 (the fixture's genuine
    `refused`), and 4 with a **QA-built `unknown` outcome**.
  - Identities, token, consent, records and the ink JSON are QA-synthetic.
- **Checks:**
  - every refusal must be the exact 0.2.12 error body, contain no PNG bytes, and change nothing;
  - an autouse crash spy fails any 503 that masks an unexpected exception;
  - synthetic retained damage and in-transaction faults are labelled in the test.

## Results (41)

| Area | Cases | Actual |
| --- | --- | --- |
| Default-off, authority, old routes | 1 | With the flag omitted the route is 404 (0.2.4). Without the capability: 403 `capability_required`. The runtime refuses the flag without `desktop_pixels` or without the capability ("macOS ingress requires…") before any write. A valid Mac envelope sent to the raw and Windows routes, also relabelled to their versions, is 422 `unsupported_version` in each route's version, with no write |
| Gap-only admission | 1 | The first batch is a frameless gap before any upload: 200 with one record ACK and zero artifact receipts, no frame or artifact rows, and an exact replay. A gap claiming `observed_samples` or carrying an artifact: 422. An unmarked (generic) incarnation cannot use the Mac route even for a gap: 403, no write |
| Ordered chain | 1 | Gap, frame 2, frame 6, refused frame 7, unknown frame 4. The ACK passes `validate_ack`; receipts come in order with exact artifact lists, all `verified`. `read_macos` is stable and historical, returning the exact records, frames and descriptor. `resolve_macos` returns the exact fixture bytes for raw and composed of frames 2 and 6, **raw ≠ composed**. For the refused and unknown frames the composed image is `unobservable`, never raw |
| Learning | 1 | QA's own order is kept, with records exact and source = display descriptor. Frames are exact, including frame 6's stated **unknown pixel time** (`callback_admission`, null `source_seconds`, stated limit). The gap is `missing_frame`. Refused is `not_composed/refused` and unknown is `unknown/no_retained_outcome`. Presentation is `not_granted`; attestations are `not_attested`; chronology and intervals are unknown; clocks are `no_process_capture_clock`. The roles are compared separately (raw identical, composed different). A per-image budget gives an explicit `byte_limit`. Nothing is written |
| Final authorized reread | 3 | An account disable, a source revoke, or an ordinary older-family contradiction introduced after the last image resolution: Learning's final reread refuses (403 / 403 / 503) and no packet is published |
| Replay, order and key | 1 | An exact replay 20 minutes later returns the original ACK, and deeply reordered members do too. Reversed frames at the same key: 409 `idempotency_conflict`. The same body under a new key is `duplicate`; only its receipt is added |
| Current fences, fresh and cached | 16 | Positive controls pass. Token revoked **under the actor lock** (fresh/cached) or expired: 401. Account disabled: 403. Source revoked or deleted: 404, and deletion erases original bytes. Stop: 409 `capture_stopped`. Withdraw: 403. Committed ink lost (fresh/cached) or composed bytes substituted (cached): 503. No writes in any case |
| New Mac contradicting retained old-family facts | 8 | Raw or Windows family, raw or composed role, as a same-sha256 alias under a QA archive ID. An older frame at width 199, then the Mac frame at 200: **409 `record_conflict`, no write**. Width 200 (the control): 200, and an exact replay returns the same ACK |
| Later old-family contradiction | 2 | After the Mac chain, an ordinary raw or Windows write declares composed-6's bytes at width 201. The old route accepts it (declared residual) and keeps its own record. After that, Mac exact replay is **503, no write**; `read_macos` 503; `resolve_macos` `unavailable` for both roles of two frames; Learning raises 503; nothing written |
| Late failure and cancellation | 6 | A synthetic fault after rows are staged (`capture_binding`, 2nd `capture_slot`, 3rd `capture_artifact_ref`, and at transaction commit) is a deliberate 503 with no rows. `asyncio.CancelledError` gives 503 through Starlette's "No response returned." with no rows. `concurrent.futures.CancelledError` propagates **by design**: with `raise_app_exceptions=True` the same exception reaches the client, and the store is unchanged. Every retry with the same key commits cleanly |
| QA-MAC-01 observation | 1 | See below |

## Finding QA-MAC-01 (scope; for the lead's decision)

The refusal itself is intended. The correction record says "subsequent Mac admission/replay/read/resolution must then
refuse it", and older writers are deliberately unchanged. What is not disclosed is how far it reaches. All of the
following happens through ordinary HTTP only:

- **Every Mac read is withheld for the actor.** This includes records on another source, gap-only records, and images
  that do not touch the contradiction (503 / `unavailable`).
- **Every new Mac admission is refused** (`503 unavailable`, `retryable: true`), while the older routes keep
  accepting.
- **It happens even without any Mac data.** Two raw-route frames that contradict each other refuse the actor's first
  Mac gap-only batch.
- **Recovery:** deleting the source that holds the contradicting declaration restores Mac access; Mac history on
  other sources is kept. Nothing else QA tried recovers it.
- **`retryable: true`** reports a condition that no retry can resolve. This is the codebase's general mapping for
  retained-evidence 503s, not Mac-specific.

**Severity:** Low to Medium. It affects availability, not integrity: nothing is exposed and nothing is written. It can
be reached through the older writers, which are unchanged by design.

**Decision needed:** keep this as an account-wide fail-closed limit and disclose it, or narrow it to contradictions
involving the requested Mac images. The observation case pins the current behaviour either way.

## Sensitivity and controls

- **Archives** (`regression-sensitivity.txt`):
  - Pre-correction `27cf448` fails exactly the 8 contradiction-dependent cases: 4 refusals × families/roles, the later
    contradiction × 2, the final reread with a contradiction, and the observation.
  - `a244d56` and `576c62c` pass 41.
- **Mutation:** the review workflow ran 26 production mutations on `/tmp` copies. One of them, M23 (the Windows family
  skipped in the Mac scan, the exact corrected case), initially survived; the Windows-family cases added afterwards
  catch it (3 failures).
- **Future wall clock:** 41 pass.
- **Owner controls (not independent):** author Mac suites 411 passed; the earlier QA Windows files 82 passed and 1
  xfail.

## Requirement relevance (API layer only)

- **R29 / R30 / R52 / A12 / A30 / A31:** exact text, images and gaps are kept, with no inferred chronology or
  reasoning. Replay neither duplicates nor overwrites, and Stop is not restarted.
- **R46 / R59 / A44:** raw and composed images and separate ink are retained and resolvable. This is **not** native
  ink, own-app exclusion, live-screen annotation or an AI receipt.
- **R35 / R36 / A14:** covered only as per-stream Stop/withdraw fences. There is no multi-device evidence.
- **G7:** synthetic buffers and MemoryStore stay "unverified" for the real Mac path.

## Limits

- **Evidence level:** synthetic Swift buffers and QA-synthetic identities and ink. No native Mac, ScreenCaptureKit,
  permissions, own-app exclusion, hosted build, interactive Mac, PostgreSQL, listener, provider or either screen-to-AI
  gate.
- **Backend compares declared facts only;** it does not decode the PNG header.
- **Not independently re-tested** (author tests cover them): transport precedence, the flag matrix, internal
  entrypoints and witness-loss campaigns, and historical pre-Stop ceilings.
- **Not repeated:** earlier native, DB and receipt campaigns.

## Reproduce

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v tests/e2e/test_p0_13_macos_ingress_qa.py
```
