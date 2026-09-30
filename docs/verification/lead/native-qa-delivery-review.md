# Native retained-context QA delivery review

Actual QA delivery `02a47f7bbd1f40ba87bb0bccb0966e8d44ef3c59` arrived in
`handoff_ac938634a83960b54637a377759990ce` at 2026-09-30 07:26:43 UTC.
It is a direct child of preserving merge `ac8f0b6`, testing exact production
source `81b7e182550d9f70ddc3bf4357bbab935488d6ea`. Main `4f5b5ed` changes only
lead evidence/task state from that source. The seven delivered files stay within
QA's test/evidence ownership; no production change is included.

## Result received, not an unconditional product pass

QA reports 37 passed and **five strict expected failures** for one low-severity
finding, plus nine mutation controls. All checks use the actual hosted Swift
fixtures through production ASGI/MemoryStore/readers/Learning with declared
synthetic authority. The report corrects its initial artifact-count error to
18/18 hashes, 105 exact archived source files and 48 unchanged fixture files.
The historical request remains natively built/enqueued, not natively POSTed.

The independent scenarios cover exact original bytes and record/source metadata,
replay after ASGI reconstruction, source/account/token revocation, source deletion,
Stop and authorized historical reads, mid-read/preparation revocation and retained
evidence corruption. The report's broader 314-pass suite is owner evidence, not a
new lead run. No hosted/device/DB/browser campaign is repeated for this review.
Both §7.1 core gates remain open.

## QA-FINDING-NATIVE-01 reproduced on main

Lead extracted the unchanged delivered test to
`/tmp/lead-native-qa-delivery/test_p0_13_native_raw_ingress_qa.py` and ran:

```sh
QA_NATIVE_FIXTURES=/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures \
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -c pyproject.toml \
  -p no:cacheprovider --import-mode=importlib -q --runxfail \
  /tmp/lead-native-qa-delivery/test_p0_13_native_raw_ingress_qa.py \
  -k exact_replay_over_a_divergent_retained_row_is_unavailable
```

Actual result: **five failed, 37 deselected in 0.68s**. Expected-failure handling
was explicitly disabled; these are real reproduced failures, not passing checks.
The retained frame hash, artifact reference, sequence slot and serialized record
divergences return `409 record_conflict`; the retained original's source-version
divergence returns `422 invalid_request`. On a same-key fingerprint-matching
committed replay these are server integrity failures, which the released raw
contract requires to be `503 unavailable`. Current readers already refuse them.

No original bytes leak or get repaired. These mutations bypass normal storage
immutability; the report therefore grades the finding Low. Nevertheless, native
handling makes `record_conflict` a permanent refusal, so classification matters.
Lead inspected `_ingest`, `_artifact`, retained binding validation and the released
0.2.6 replay/error clauses before dispatching the correction.

ONE Backend continuation under P0-09/P0-07 was accepted as
`handoff_67a741415017aa82a2a234c248c45a7a`, exact baseline `4f5b5ed`.
It must preserve genuine new-key/client conflicts, changed-body idempotency
conflicts, current authorization/Stop/deletion fences and legacy behavior. The
initial receipt was unread/not started. Actual start
`handoff_fe783202145882935298e32e15fe2694` at07:30:16 UTC confirms a clean
starting worktree and normal merge `616ce335d548b879bddbd12114d0959bed457c05`
of the exact baseline. The owner is implementing the same bounded repair; no
fix or passing result is claimed yet.
Backend owns API/module-test changes; lead reviews/integrates; QA removes the
five strict xfails only after its exact-candidate retest.

Independent exact-archive review also reproduces **37 passed / five strict xfailed
in 2.24s**, verifies 18 artifact hashes,105 source files,48 fixture members and
the six exercised production modules. It confirms the finding and the evidence
limits; these repeated counts are verification, not additional unique coverage.

## One QA-helper integration correction

The delivered mutation helper deletes the fixed shared temporary path
`/tmp/qa-native-mut-work`, executes on import and ignores pytest return codes.
Lead did not run it. A narrow same-delivery correction was accepted as
`handoff_884ce601dfe4c274a70d8edaefbb1742`: use a uniquely owned temporary directory,
a main guard and explicit baseline/mutation outcome checks. No production edits
or repeated full mutation/native campaign is requested. The prior observed QA
results remain evidence; integration of this helper waits for the correction.

## Recovery observation and next actions

The reported lost-ACK → Stop → sealed historical recovery behavior matches
current fences-before-replay policy. Rewriting a saved live request under its
existing key is an idempotency conflict, not an allowed silent recovery. Keep this
as input to lead/iOS's later bounded recovery/transport work; no defect or new
producer authority is invented from the observation.

Lead will integrate the reviewed QA evidence and corrected helper, review the
Backend repair, and release the exact candidate for the already named narrow QA
retest. Trusted app bootstrap/transport, signing/install and real provider remain
separate next dependencies. No services, user-preview data, Paperclip, paid APIs,
models, permissions or source requirements changed.
