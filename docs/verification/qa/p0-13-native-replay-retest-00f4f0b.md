# QA retest of the QA-FINDING-NATIVE-01 repair at `00f4f0b`

- **Assignment:** lead `handoff_8ce7c067616782573b6e850f42dcf106`. This is the one final
  changed-path retest for P0-07/P0-13, released after the dependency notice
  `handoff_09b87b384ab23d8abbe69fa97fcb9521`.
- **Candidate:** pushed main `00f4f0bcda9107ecc75b88c8f435e6c2a4ce7625`. It integrates:
  - Backend `d1c3c7a` and `69e1298`, as `0e6d4a3` and `94668c7`;
  - QA `02a47f7` and `239e780`, as `5c357d6` and `4e3b245`.
- **QA branch:** `team/qa` merged the candidate normally as `aa96c12`.
  - Against the candidate, it differs only in two older QA-only files
    (`p0-06a-contract-acceptance.md`, `test_p0_06a_contracts.py`).
  - The exercised production code is byte-equal to `00f4f0b`.
- **Decision: PASS.** QA-FINDING-NATIVE-01 is closed at `00f4f0b` (91 cases).
  - The original 5 retained-divergence cases now return 503 on exact replay.
  - So does the committed-child / retained-ancestor binding case.
  - Every unchanged same-key, new-key, Stop, current-access and deletion control holds.
  - The 5 strict xfail markers were removed only after they passed.
  - No new defect was found. One observation (ancestor `capture_record` rows) is recorded below.
  - **Both §7.1 core gates remain OPEN.**
- **Historical result:** the `81b7e18` result stays as recorded in
  [p0-13-native-raw-ingress-81b7e18.md](p0-13-native-raw-ingress-81b7e18.md): 37 passed plus
  5 strict xfails at test sha256 `acf8f9b1…423e`. This report is the final-candidate result; it
  does not rewrite that one.

## Scope and evidence level

This retest is in-process only: the native fixtures go through ASGI into `MemoryStore`, then through
the current-authorized reader, resolver and Learning code. It does not cover:

- native transport, iPad/ReplayKit or real AI;
- PostgreSQL or services;
- preview, Paperclip or paid APIs;
- configuration changes.

No production code was edited.

The affected requirements (R35/R36/R51/R52; A12/A14/A16/A30/A31) and the §7.1 limits are
unchanged. All divergences are direct storage mutations, outside the immutability guarantee that
the PostgreSQL `protect_document` triggers enforce.

**Fixtures:** the same hosted run 36677566096 folder,
`/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures`.

- It is the 48-file set pinned at digest `5c1dba09…79d2`.
- It is from `raw-frame-ingress-fixtures.zip`, sha256 `57b0f80b…79dd`. This equals the copy the lead
  committed at `docs/verification/lead/native-raw-ingress-hosted/`.

**QA-derived inputs, labelled in the test:**

- a committed child record: native live metadata, the other actual native original's PNG bytes, and
  `causal_parents` = `raw-record-1`;
- a cross-source variant, whose child and original belong to a second registered display source.
  This makes revoking or deleting the parent's source a real production path.

## Commands and results

```sh
export QA_NATIVE_FIXTURES=/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures PYTHONDONTWRITEBYTECODE=1
# before editing: the 239e780 test file on an exact 00f4f0b archive, markers ignored -> pre-edit-runxfail.txt
.venv/bin/python -m pytest -p no:cacheprovider -q --runxfail -k divergent_retained_row_is_unavailable tests/e2e/test_p0_13_native_raw_ingress_qa.py
#   5 passed   (with the markers still in place: 5 failed, 37 passed, because strict XPASS counts as failure)
.venv/bin/python -m pytest -p no:cacheprovider -v tests/e2e/test_p0_13_native_raw_ingress_qa.py
#   91 passed, 0 xfailed                                   -> pytest-verbose.txt
.venv/bin/python tests/e2e/qa_native_raw_ingress_mutations.py "reader relabels live" "replay recomputes received_at"
#   baseline OK (91 passed); 21 and 2 exactly-expected failures; exit 0   -> helper-representative.txt
.venv/bin/python -m pytest -p no:cacheprovider -q services/api/tests/test_raw_replay_integrity.py \
  services/api/tests/test_raw_ingress_http.py services/api/tests/test_capture_app.py
#   126 passed (Backend-owned regressions on the changed path)
```

The lead's **unchanged ancestor probe** was also run against an exact `git archive` of `00f4f0b`:

- `test_independent_replay_scope.py`, sha256 `785a0912…21b9`;
- its support module is the `02a47f7` QA test (`acf8f9b1…423e`);
- `capture.py` was byte-checked against `00f4f0b`.

Result: 4 passed. See `lead-probe-and-owner-regressions.txt`.

**Regression sensitivity** (`regression-sensitivity.txt`): the current test file was run against
exact archives of the production code.

| Archive | Result | What failed |
| --- | --- | --- |
| `81b7e18` (before any fix) | 14 failed | the 5 exact and 5 reordered replays; the 2 ancestor binding `source_version` cases; the 2 parent frame-tombstone ordering cases |
| `0e6d4a3` (first Backend fix, before the ancestor correction) | 4 failed | the 2 ancestor binding `source_version` cases (same- and cross-source) and the 2 parent frame-tombstone ordering cases |
| `00f4f0b` | 91 passed | nothing |

`69e1298` made two changes:

- it passed the exact-replay proof to the ancestor artifact check;
- it moved the frame-tombstone fence into each dependency node.

The new regression detects both. The two frame-tombstone cases were added after the bounded claims
check pointed out that the first 89-case version detected only the first change.

Static check: all 9 helper mutation patterns still occur exactly once in the candidate source.
The full 9-mutation campaign, the whole e2e suite, and the native, DB, Simulator and Web runs were
not rerun, as instructed.

## Results (`tests/e2e/test_p0_13_native_raw_ingress_qa.py`, 91 cases)

| Check | Cases | Status | Actual at `00f4f0b` |
| --- | --- | --- | --- |
| Original five: exact same-key replay over a divergent retained row (frame sha, artifact-ref sha, slot, record re-serialized, binding `source_version`) | 5 | pass (xfail removed) | 503 with bytes equal to `error-unavailable.json`; store unchanged; no PNG. At `81b7e18` these were 409 `record_conflict` (×4) or 422 |
| Same five, same envelope with members reversed and indented | 5 | pass | 503, same fingerprint |
| Same five, new key (unwitnessed) | 5 | pass | Ordinary client classification kept: 409 `record_conflict` (×4), 422 `invalid_request` (binding) |
| Fences before diagnosis: 5 cases × {Stop with unknown boundary, token revoked, stream withdrawn, source deleted} | 20 | pass | 409 `capture_stopped` / 401 / 403 / 404; store unchanged. Source deletion also erases the divergent rows, so those cases show 404 rather than 503 after erasure; the other three test the ordering |
| Reader and prepare sanitize the 5 divergent rows | 5 | pass (unchanged) | 503 |
| **Ancestor:** exact child same-key replay after the committed parent's binding `source_version`, binding sha256, artifact-ref sha256, frame sha256, slot, or original bytes changed; same- and cross-source | 12 | pass | 503 (exact and reordered bodies). New key: 503, except binding `source_version`, which stays 409 `record_conflict`. Store unchanged. The child's record stays readable and names only the parent id |
| **Ancestor fences** (cross-source, parent binding changed), both keys | 5 | pass | Stop 409 `capture_stopped`, token 401, withdraw 403, parent source revoked 404, parent source deleted 404; store unchanged. Parent read: 503 / 401 / 503 / 403 / 404. After parent-source revoke or delete, the child stays readable |
| **Parent frame tombstone** (direct stand-in) plus a parent artifact-ref or slot divergence: exact child replay | 2 | pass | 404 `not_found`, store unchanged. At `0e6d4a3` this was 503 |
| All other earlier 81b7e18 acceptance checks (exact bytes, replay, Stop, revocation, corruption, order, error bytes) | 32 | pass | unchanged |

After the first commit and before any change, every committed child is replayed once with its same
key: the same saved ACK comes back and the store is unchanged.

## Helper coherence

`BASELINE` is now `{"passed": 91}` for `00f4f0b`. The comment keeps the historical
37 passed / 5 xfailed for `81b7e18`.

`EXPECTED_FAILURES` is unchanged. The new tests check HTTP classification, the store and reader
records only, and none of them depends on a mutated behaviour. The representative run confirms this
for the widest reader mutation (21 failures) and for the `capture.py` mutation next to the repair
(2 failures).

## Observation (not blocking; for Backend or the lead)

On a child replay, the committed parent's own `capture_record` row is parsed semantically and not
re-verified. See `ancestor-observations.txt`:

- A whitespace-only re-serialization of the parent record: the child's same-key replay returns its
  cached 200 `accepted` ACK, and a new key returns 200 `duplicate`. Meanwhile `read_raw` of the
  parent returns 503.
- A schema-valid edit (`method` visual → structured): the child replay returns 200 the same way, and
  the parent read serves `method=structured`. This is the known "schema-valid edits are served as
  stored" limit.

Nothing here misclassifies the child's own commit as a client conflict, so native gets no false
final refusal. It is reachable only by bypassing storage immutability. It is recorded so the owner
can decide whether ancestor record rows need the same replay witness as ancestor bindings.

## Limits

- The child/ancestor inputs are QA-derived. Native producers were not shown to emit multi-record
  graphs.
- Single stream only (A16 other-stream independence not exercised).
- MemoryStore only; no PostgreSQL trigger run.
- The hosted native checks were not rerun (no defect required it).
- Physical iPad, ReplayKit, signing, real AI or provider, R59/A44 original-screen ink, Notability,
  the nav/WRITE/ASK/save chain, G3 and G7 are all outside this retest.
- Both §7.1 gates remain OPEN.
