# QA native raw-ingress → retained-context acceptance at `81b7e18`

- **Assignment:** lead `handoff_a5c2b49e4f0f0c2405b798656b043e91`, continuing P0-07/P0-13. This
  is one bounded independent acceptance, not a Web/Simulator campaign. It includes the lead's
  manifest-count correction (`handoff_5416418e`).
- **Candidate:** main `81b7e182550d9f70ddc3bf4357bbab935488d6ea`.
  - QA ran from `team/qa` at `ac8f0b6`, the clean merge of `81b7e18`.
  - `git diff 81b7e18 ac8f0b6` touches only two unrelated QA files.
  - All six exercised modules are byte-equal to `81b7e18`: `capture_app.py`, `ingress_app.py`,
    `capture.py`, `process_context.py`, `image_resolver.py` and `learning/process_context.py`.
- **Decision:** the in-process acceptance passes, with one Low finding and one design
  observation.
  - Exact native request and original bytes commit through production `create_capture_app`.
  - They read back exactly, twice, through the current-authorized reader and resolver and
    `prepare_stored_process_context`.
  - Replay, Stop, revocation, deletion and corruption behave as the contract says, with one
    exception: **QA-FINDING-NATIVE-01**, a Low Backend finding reachable only by bypassing storage
    immutability.
  - **Both §7.1 core gates remain OPEN.**
- **Evidence:** [p0-13-native-raw-ingress-81b7e18/](p0-13-native-raw-ingress-81b7e18/)
  - `pytest-verbose.txt`: 37 passed, 5 xfailed.
  - `finding-native-01-observed.txt`
  - `mutation-check.txt`: 9 of 9 mutations caught (output of the first helper version at `02a47f7`; see
    "Mutation helper correction" below).
  - `inputs.sha256`
- **Test:** [tests/e2e/test_p0_13_native_raw_ingress_qa.py](../../../tests/e2e/test_p0_13_native_raw_ingress_qa.py),
  sha256 `acf8f9b1…423e`. Mutation helper:
  [tests/e2e/qa_native_raw_ingress_mutations.py](../../../tests/e2e/qa_native_raw_ingress_mutations.py).

## Evidence levels (kept separate)

| Level | What this acceptance used | Claimed here |
| --- | --- | --- |
| Source | `81b7e18` modules, read and exercised | yes |
| Hosted native | fixtures from run 36677566096 (see below); hosted checks were **not rerun** | inputs only |
| In-process HTTP | production composed app over httpx `ASGITransport`, `MemoryStore` | **yes, the tested layer** |
| Real DB / PostgreSQL | none | no |
| Physical iPad / ReplayKit / signing | none (`device_install_verified=false`) | no |
| Real AI / provider | none (packet flags stay `not_attested`) | no |

How the fixtures were made:

- The shared Swift sources (uploader, FrameStore PNG encoder, frame mapper) were compiled with
  `swiftc -target arm64-apple-macos14` as the command-line check `RawFrameIngressCheck`.
- They ran against an in-process fake transport, with synthetic solid-colour CIImage pixels and
  harness identities.
- The iOS app targets were only compiled (`CODE_SIGNING_ALLOWED=NO`); nothing ran in the app,
  the Simulator or on an iPad.
- The historical request was built natively but never POSTed natively (`posted: false`).
- The ACK variants were Swift-generated inputs for the parser, not server output.

## Environment and provenance (recomputed for this report)

- **Platform:** WSL2 Linux 6.18.33.2, Python 3.14.4, pytest 9.0.2, repo `.venv` (jsonschema
  4.26.0). No listener, port, database, service restart, provider, preview or Paperclip was used.
- **Artifact** `/tmp/lead-native-raw-ingress-36677566096` (from `inputs.log`):
  - `commit=81b7e182550d…`
  - run 36677566096, runner macos26
  - `source_tree=f3685759…`, which equals `git rev-parse 81b7e18:apps/ios/ScreenObserver`
- **`SHA256SUMS`:** 18 entries, `sha256sum -c` 18/18 OK. There are **19 top-level files**,
  including `SHA256SUMS` itself. The earlier start notice said "15"; that was wrong and is
  corrected here.
- **`source.zip`:** 105 entries, each byte-equal (git blob id) to `81b7e18:<path>`, 0 mismatches.
- **`raw-frame-ingress-fixtures.zip`** (sha256 `57b0f80b…79dd`, listed in `SHA256SUMS`): its
  48 members are byte-equal to the extracted folder. The test pins the 48-file set digest
  `5c1dba09…79d2` and 9 individual files; see `inputs.sha256`.
- **Hosted logs:**
  - `raw-frame-ingress-native-checks.log`: 35 PASS, 0 FAIL.
  - `build-results.json`: both SDK compiles succeeded; `device_install_verified: false`.

## Commands

```sh
export QA_NATIVE_FIXTURES=/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v -rxX tests/e2e/test_p0_13_native_raw_ingress_qa.py
#   37 passed, 5 xfailed (the 5 strict xfails are QA-FINDING-NATIVE-01)
.venv/bin/python tests/e2e/qa_native_raw_ingress_mutations.py [NAME ...]  # exit 0 only if the baseline is clean and
#   every selected mutation fails exactly its expected tests (9/9 at 02a47f7)
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -q tests/e2e
#   314 passed, 1 skipped, 24 xfailed (whole e2e Python suite, fixtures set)
```

Without `QA_NATIVE_FIXTURES`, the file skips all 42 cases. The fixtures are not committed.

**Synthetic stand-ins**, labelled in the test:

- account authorization, membership, one-use start grant and producer stop facts (trusted-adapter
  stand-ins);
- `LocalTestAuthenticator` and the caller guard given to the reader and resolver;
- device and session rows;
- the service clock, set to `2026-09-30T05:00:00.123456Z` so the server ACK can be compared with
  the native-accepted `ack-canonical.json`;
- direct `MemoryStore` mutations;
- QA-derived bodies.

The Swift ACK and error rules run through a **Python port** of `OriginalUpload.swift`, not Swift.

## Results

| # | Check (test) | Input | Status | Actual |
| --- | --- | --- | --- | --- |
| 1 | Fixture set pinned; manifest pairing, binding = original minus bytes, PNG sha/length/64×48, request already canonical | native | pass | |
| 2 | The Python port reproduces all 35 `swift_verdict`s (6 accepted, 29 rejected). The Python contract `validate_ack` agrees on all 35. The 3 error bodies are valid and the 5 invalid ones are rejected | native | pass | `error-unavailable.json` came from the generator, not the uploader, so for it this is port and contract only |
| 3 | Live and historical, each in its own store: POST before PUT, exact PUT, exact POST, stored rows, GET, read twice, resolve twice, prepare twice, replay, Stop | native | pass | See details below the table |
| 4 | Known Stop boundary: 100 refuses the historical sequence 101 with `capture_stopped`; 101 admits it (unknown clock stays null); live is refused in both cases | native bytes, server policy | pass | |
| 5 | Unknown Stop, then `seal_stop(101)`: historical refused before the seal, accepted after; live still refused | native bytes, server policy | pass | The current native uploader cannot reach the post-seal step, because after `capture_stopped` it keeps the batch pending and unsent |
| 6 | Cross-fixture conflicts: historical with the same key gives `idempotency_conflict` (bytes = fixture); with a new key gives `record_conflict`; the store and the live read are unchanged | native | pass | |
| 7 | Two originals in one store: selection order `[2,1]` and `[1,2]` is kept in the reader and the packet; each item's image sha equals its frame and record artifact; duplicate IDs are refused | second record QA-derived, both originals native | pass | Multi-record order is not exercised by native producer bytes |
| 8 | Revocation, deletion and withdraw, checked at the cached and new-key POST, GET and PUT original, `resolve_raw`, `read_raw` and prepare | native | pass | See the table below |
| 9 | Revocation during prepare (source, token or account; before or after the image resolve) withholds the whole packet | native | pass | 403, 401 or 403, with no packet |
| 10 | Token revoked inside an open read is rechecked before return | native | pass | reader 401; resolver `{"status":"revoked"}` |
| 11 | Retained metadata changed between prepare's two reads: packet withheld | direct mutation | pass | `ValueError … withheld` |
| 12 | Malformed saved ACK (other sha256, other `received_at`, extra receipt) or original (swapped bytes, `byte_length`, binding sha256) | direct mutation | pass | Replay 503 with bytes equal to `error-unavailable.json`. For originals: GET 503 with no PNG; resolver `unavailable`; prepare gap or 503. For saved ACKs, reads are unaffected. The store is unchanged: sanitized, not repaired |
| 13 | A detached frame that differs from the retained one gets no bytes | QA-derived | pass | `unavailable` |
| 14 | A divergent retained row is sanitized by the reader and prepare | direct mutation | pass | 503 in all 5 cases |
| 15 | **Exact replay over a divergent retained row returns 503** | direct mutation | **xfail (strict), QA-FINDING-NATIVE-01** | 409 `record_conflict` in 4 cases, 422 `invalid_request` in 1 |
| 16 | Backend error bytes: unconfigured app gives 503 equal to `error-unavailable.json`; >4 MiB gives 413 `payload_too_large`, not retryable | native / QA | pass | |

Details for row 3:

- A POST before the original PUT gives 404 `not_found`, and the store is unchanged. Natively this
  means pending with the uploader disabled.
- The PUT receipt equals the binding plus `bytes_committed`.
- The live ACK is exactly `ack-canonical.json`. The port accepts both ACKs, and `validate_ack`
  passes.
- The stored frame equals the request frame, and the stored record equals the request record.
- Reads keep `delivery_mode` "historical" with a `context-*` batch id. They keep orientation 6
  unapplied, and `captured_at`/`media_position` null. For the historical request, the record
  clock, callback clock and estimate stay null.
- The resolver returns the exact PNG, and the packet matches exactly:
  - the batch equals the reader batch;
  - the source equals the descriptor;
  - `attached_bytes`, flags and `raw_unapplied` are correct.
- Replay after rebuilding the app with a clock 5 minutes later keeps the first ACK. The replay
  bytes equal the native saved canonical form.
- A pretty or reordered body gives the same ACK. A new key gives `duplicate` with the original
  `received_at`, and adds only one replay row.
- After an unknown-boundary Stop:
  - the cached, new-key and other-fixture POSTs all get 409 with bytes equal to
    `error-capture_stopped.json`;
  - the PUT gets 403;
  - the store is unchanged;
  - GET, both reads and prepare are identical to before the Stop.

Revocation table (observed at `81b7e18`; the store is unchanged after every refusal, and no refusal
carries PNG bytes):

| Case | POST (cached and new key) | GET original | PUT original | reader / prepare | resolver |
| --- | --- | --- | --- | --- | --- |
| token revoked | 401 `unauthenticated` | 401 | 401 | 401 | revoked |
| account disabled | 403 `forbidden` | 403 | 403 | 403 | revoked |
| source revoked | 404 `not_found` | 403 | 403 | 403 | revoked |
| source deleted | 404 `not_found` | 404 | 404 | 404 | missing |
| stream withdrawn | 403 `forbidden` | 200 | 403 | readable, packet unchanged | available |
| membership deactivated | 403 `forbidden` | 200 | 403 | readable, packet unchanged | available |

After deletion, no retained document contains the PNG base64, and the record and frame tombstones
exist. The token result at the reader and resolver shows that they consult the caller guard on
every read. The guard itself is QA-written.

## Finding QA-FINDING-NATIVE-01 (Low; next owner Backend, via the lead)

**Behaviour:** on an exact same-key replay whose fingerprint matches, the request is provably the
committed one. Even so, a retained row that has diverged but still passes the schema gets:

- 409 `record_conflict` for the frame `artifact.sha256`, the `capture_artifact_ref.sha256`, the
  `capture_slot.record_id`, or `capture_record.canonical_json` re-serialized;
- 422 `invalid_request` for `original_binding.source.source_version`.

The reader and prepare classify the same rows as 503. `packages/contracts/raw_capture_ingress/README.md`
says corrupt committed evidence is 503 `unavailable`.

**Impact:**

- Native records 409 `record_conflict` as a final refusal ("refused"; see
  `docs/verification/platform/raw-frame-ingress.md`). So a server-side integrity fault would
  finalize a batch as refused instead of leaving it pending.
- The 422 leaves the batch pending.
- No bytes leak, and nothing is repaired or rewritten.

**Reachability:** only by bypassing storage immutability. Here that is a direct `MemoryStore`
mutation; PostgreSQL `protect_document` triggers refuse such updates. Hence Low.

**Evidence:** `finding-native-01-observed.txt`, and 5 strict xfails in the test. They turn into
failures (XPASS) when this is fixed, so the xfail markers must then be removed.

**Suggested direction (Backend's decision):**

- When `raw and cached`, class retained/request divergence as 503: the equality sites in `_ingest`,
  the prior-ref check in `_artifact`, and a `validate_raw_binding` `ValidationError` against
  retained rows.
- Keep 409 for a new key, which has no fingerprint witness.
- Add these variants to
  `test_raw_ingress_http.py::test_corrupt_retained_raw_evidence_is_sanitized_not_repaired`.

## Observation for the post-Stop recovery design (no defect; next owner lead/Platform)

Scenario: a live batch is committed but its ACK is lost, then Stop happens with an unknown
boundary.

- A same-key replay gets 409 `capture_stopped` even though the record is committed and readable.
  Native then keeps the batch pending and stops.
- After `seal_stop(101)`:
  - a same-key replay is still refused;
  - a same-key historical rewrite gets `idempotency_conflict`, which native would record as a final
    refusal;
  - only a **new key with historical delivery** learns the existing commit (`duplicate`, with the
    original `received_at`).

This matches the documented design: fences come before exact replay, and recovery after Stop is a
named, separately authorized dependency. It is input for that recovery design.

## Independent audit

A workflow ran 4 lenses (false passes, native-rule fidelity, finding check, coverage), and each
lens's issues went to a refute-stage verifier: 8 agents. All work was in `/tmp` copies; the
worktree was untouched. The surviving issues were fixed before this report:

- revocation of the caller's own token or account during prepare, and inside an open read;
- a stronger packet check (batch identity, source, `user_id`, `attached_bytes`, `non_frame_artifacts`);
- a GET check for original corruption, plus metadata corruptions and a detached-frame case;
- the finding changed from a pinned pass to a strict xfail, covering all 5 affected paths;
- HTTP 200 required before an ACK counts as natively saved;
- a removed inequality between first-reply and replay bytes, which no contract requires;
- corrected provenance wording (a swiftc macOS CLI check, not the app or Simulator);
- labels for server-policy steps that native cannot reach.

Refuted issues:

- The port is stricter than Swift on whole-number floats; the server always emits ints.
- `native_error` raises on non-string codes; that fails loudly, and the server never emits them.

The later mutation check found one more gap: prepare's re-read comparison was not covered. It was
fixed (row 11) and all 9 mutations are now caught.

## Mutation helper correction (follow-up to the lead's integration review)

The lead found a safety gap in the first helper at `02a47f7`: on import it deleted the fixed path
`/tmp/qa-native-mut-work`, and it judged results only from pytest's last stdout line. The corrected
helper:

- is import-safe (runs only under `__main__`);
- works in its own `tempfile.TemporaryDirectory` and never deletes or overwrites a preexisting path;
- refuses a temporary folder inside the worktree;
- runs its child without inherited `PYTHON*`/`PYTEST_*` settings and with `TMPDIR` inside the owned
  folder;
- requires a clean baseline: exit 0, exactly 37 passed and 5 xfailed in the JUnit report, and all 4
  mutated modules imported from the copy;
- gives every mutation a copy of the same baseline snapshot;
- requires each mutation to apply exactly once, exit 1, fail exactly its expected test ids, keep the
  collected set, and leave the xfails unchanged;
- exits 1 for a missing pattern, an unexpected outcome, an unreadable report, a timeout, a missing
  `QA_NATIVE_FIXTURES` or an unknown name.

The mutation list and the tested scope are unchanged (compared with `02a47f7`).

The expected failing sets came from one private discovery run of all 9 mutations. That run used
this helper's own copy, mutate and JUnit functions before the expectations were encoded, and its
per-test output is not committed. Each set was then checked against the mutation's intent:

- set sizes are 5/1/1/2/2/2/21/2/6, equal to the committed `mutation-check.txt` counts;
- a source revocation is still caught by the reader's row check when caller authorization is cached.

The full 9-mutation campaign was not rerun with the final helper. Controlled checks, each in a
private `TMPDIR` holding a sentinel at the old fixed path:

- the representative mutation "reader authorizes once per instance" exits 0, even with hostile
  `PYTEST_ADDOPTS`, `PYTHONPATH` and `PYTHONSAFEPATH` in the caller;
- a forced missing pattern, a wrong expected set and an empty fixture folder (unclean baseline) each
  exit 1, and so does a `TMPDIR` inside the worktree, which creates nothing there;
- a truncated JUnit report and a simulated timeout are reported as errors;
- the owned folder is removed afterwards and the sentinel is left intact.

An independent two-lens review (filesystem safety, check correctness) found no false-pass path. Its
hermeticity and robustness items were applied as listed above.

Test-file note: with an empty fixture folder the 5 strict xfails still count as xfailed, because an
xfail without `raises=` also absorbs setup errors. The 37 other cases error in that situation, so the
baseline check fails closed. Adding `raises=AssertionError` would pin the finding more tightly, but
was left out of this helper-only correction.

## Not tested, blocked, and limits

- **Not rerun:** hosted native checks (no concrete defect required it).
- **Not tested:** PostgreSQL / realDB, restart or crash recovery, native network or TLS transport,
  trusted bootstrap/auth, the native POST of the historical request, and multi-record or
  multi-stream native producer order. Rows 7 and 8 are QA-derived or single-stream.
- **Not tested:** A16 independence of another stream, attempt scope (`dependency_missing`), and
  real pixels or semantics (the PNGs are synthetic solid colour).
- **Blocked or out of scope:**
  - physical iPad, ReplayKit, signing and install;
  - real AI or provider receipt, freshness and coverage;
  - original-screen ink (R59/A44) and Notability import;
  - the navigation/WRITE/ASK/save/reopen chain;
  - G3 and G7.
- **Gates:** single-frame capture and storage with fixture or mock data does **not** pass the §7.1
  core loop or either gate. Both gates remain OPEN.
- **Storage mutation:** direct storage mutation lies outside the immutability guarantee. Schema-valid
  edits to frame orientation or `buffer_sequence`, or to the saved ACK disposition, are served as
  stored. The only other witness is the replay fingerprint, so this is a stated limit, not a finding.
