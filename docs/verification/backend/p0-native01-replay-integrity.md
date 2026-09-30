# QA-FINDING-NATIVE-01: exact raw replay integrity errors

Date: 2026-09-30 UTC. Owner: Backend, bounded P0-09/P0-07 repair.
Assigned baseline: `4f5b5edab274fb2c32923d898f17eaa06ede462f`.
Preserving merge: `616ce335d548b879bddbd12114d0959bed457c05`.
QA source: `02a47f7bbd1f40ba87bb0bccb0966e8d44ef3c59`,
`tests/e2e/test_p0_13_native_raw_ingress_qa.py`.
Delivery is the commit containing this evidence; QA source was not edited.

## Reproduced problem

After a successful raw HTTP commit, direct MemoryStore corruption of retained
facts outside immutable storage APIs made an identical, same-key request return
client errors instead of the released 0.2.6 `503 unavailable`:

| Divergent retained fact | Before | After |
| --- | --- | --- |
| Raw frame artifact SHA-256 | 409 record_conflict | 503 unavailable |
| Capture artifact-reference SHA-256 | 409 record_conflict | 503 unavailable |
| Capture slot record ID | 409 record_conflict | 503 unavailable |
| Reserialized canonical record JSON | 409 record_conflict | 503 unavailable |
| Original binding source version | 422 invalid_request | 503 unavailable |

The request still matched its retained complete-wrapper fingerprint. Returning a
terminal client conflict misclassified committed storage integrity loss. No bytes
leaked and no rows were repaired before or after this change. QA classified the
finding Low; its reproducer bypasses PostgreSQL immutability rather than showing
an ordinary production write that can corrupt those rows.

## Bounded correction

The existing actor transaction enables the new classification only for raw HTTP
requests after current authority, nondeleted replay identity and complete request
fingerprint checks succeed. Existing record/slot/frame comparisons and binding
validation then treat divergence as unavailable. `_artifact` receives the same
proved-replay condition for retained reference/binding mismatches; its default
behavior is unchanged. The one caught service error is specifically
`409 original_source_conflict`, not arbitrary 403/404/409 failures.

Current authorization, Stop, source/ancestor dependencies and deletion still run.
An explicit frame-tombstone check precedes record/slot/frame integrity diagnosis.
No request or retained row is canonicalized, reconstructed or rewritten. No new
transaction, decoding pass, storage kind, migration or shared protocol was added.
Same-key changed requests still conflict; genuine new-key client conflicts,
legacy 0.2.4 and internal raw-map behavior remain unchanged. PONYTAIL LITE reused
the existing comparison points instead of a second validation/store layer.

Refreshed workflow, current unchanged decisions and affected full original/English
R35/R36/R51/R52, A12/A14/A16/A30/A31, and raw 0.2.6 replay/error clauses at the
assigned baseline. This fixes one error boundary, not those complete experiences.

## Actual verification

New module regressions first reproduced **5 failed, 16 passed in 1.23s**. The five
original refusal and no-mutation assertions were preserved through the fix. Final
focused module result: **26 passed in 1.27s**, including intact same-key replay,
new-key duplicate ACK, genuine changed-client conflicts, current Stop/auth/source
and replay/frame tombstones, non-frame ink binding corruption, and explicit
unchanged legacy/internal behavior.

The exact QA file was copied unchanged from its commit to
`/tmp/backend-native01-replay-20260930/test_native_replay_qa.py`. With
`QA_NATIVE_FIXTURES=/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures`,
the existing fixture pins verified the actual hosted Swift-emitted files. Command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  --runxfail --import-mode=importlib -c pyproject.toml \
  /tmp/backend-native01-replay-20260930/test_native_replay_qa.py \
  -k test_exact_replay_over_a_divergent_retained_row_is_unavailable --tb=short
```

Before correction: **5 failed, 37 deselected in 0.56s**. After correction:
**5 passed, 37 deselected in 0.39s**. `--runxfail` executes the unchanged strict-xfail
assertions normally; this does not remove QA's markers or claim QA acceptance.
The successful error bytes match the existing native unavailable-error fixture.

Final affected regression command:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q \
  services/api/tests/test_raw_replay_integrity.py \
  services/api/tests/test_raw_ingress_http.py \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_ingress_http.py
```

Result: **313 passed in 18.13s**, exit 0. Counts from overlapping runs above are
not additional unique coverage. Independent static review found no blocker;
`git diff --check` passed. Existing HTTP route handlers, shared contracts,
dependencies and migrations are unchanged.

## Limitations and next action

Only in-process ASGI/MemoryStore execution and retained native fixture consumption
ran. No new Swift/native execution, PostgreSQL campaign, CI run, service/listener,
database/restart, preview/Paperclip data, provider, account or device operation.
Original source/ink/history and unknown gaps remain intact. Both §7.1 core gates,
real AI delivery, original-screen interaction and Notability import remain open.

Lead next reviews/integrates this commit; QA owns the narrow changed-path retest
and removal of its five strict-xfail markers. Storage repair is not provided by
this classification change. The previously documented root-path deployment
limitation is unrelated and remains outside this repair.
