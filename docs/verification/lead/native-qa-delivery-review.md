# Native retained-context QA delivery review

**Current state:** final correction `69e1298` is approved and integrated as
`94668c7`. All recorded source/helper HOLDs below are closed; exact-candidate
independent QA retest remains next. Historical failures and their boundaries stay
recorded. No real-device/provider or complete core-loop acceptance is claimed.

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

## Backend correction received and tested on main

Actual delivery `d1c3c7a11c36cb33b2a8a6fcd51dd7043050b25c` arrived in
`handoff_c41d96958a5c13daef1d40c07e6ec868` at07:36:36 UTC. Lead reviewed the
complete delta and affected `_ingest`/`_artifact`/original-binding call paths;
it integrates locally as `0e6d4a3`. Only capture.py, its module regressions and
Backend evidence change. No request, wire contract, dependency or migration changes.

After complete-wrapper fingerprint equality proves a raw HTTP replay, divergent
retained record/slot/frame/reference/binding is classified as503. New-key client
conflicts and changed-body idempotency conflicts remain409. Existing current
authorization/source/Stop/deletion checks still apply; no retained row is repaired.
The original-source exception is caught narrowly, not remapped with all service
errors. Legacy and internal raw behavior remain unchanged.

Actual integrated-main checks:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -q \
  services/api/tests/test_raw_replay_integrity.py \
  services/api/tests/test_raw_ingress_http.py \
  services/api/tests/test_raw_frame_ingress.py \
  services/api/tests/test_ingress_http.py
```

**313 passed in18.83s.** The unchanged QA file and original fixtures were then
run with the same `--runxfail` command above: **five passed,37 deselected in0.42s**,
compared with the earlier five failures. This is lead reproduction of the repair,
not QA's independent retest or removal of its markers. Main production/test files
are byte-equal to the delivered commit. The helper correction and exact-candidate
independent QA continuation remain separately owned.

Publication is **HOLD for one reproduced residual in the same classification
path**. Independent review exercised a committed child whose actual native
originals were retained but whose parent's original binding source version was
subsequently corrupted. An identical child request/key still returned409 rather
than503: `_dependencies` calls `_artifact` for retained ancestors without the
proven HTTP replay condition. First commit and intact exact replay both returned200;
the failing replay leaves storage unchanged. Three independent object-order,
new-key and original-deletion controls pass. The child metadata is explicitly
QA-derived, not native producer output.

Lead reproduced the same failure on local `0e6d4a3`: one failed,three deselected
in0.45s, using the unchanged
`/tmp/native01-backend-review-hj7766ar/test_independent_replay_scope.py` probe
against main modules. This retains the Low immutable-storage-bypass limitation;
it does not invalidate the five original closures or demonstrate data leakage.
ONE same-task Backend correction was accepted as
`handoff_3335343b89089f2237d94225b4043ffa` in reply to its delivery. The initial
receipt is unread/not started. The local correction commit remains preserved;
it is not pushed while this bounded omission is being corrected. No reset or
duplicate task was issued.

## QA helper correction and local evidence integration

Actual correction `239e780e0bba86a48a5f6f8553278759f1d2f5a5` arrived in
`handoff_eed6f87b277237084123897991a7a823` at07:41:19 UTC, directly above the
original QA delivery. Lead read its complete helper/report diff. It uses a uniquely
owned TemporaryDirectory, runs only under `__main__`, checks the copied-module
origins, and validates pytest exit codes and exact JUnit outcomes. The nine mutation
specifications and original acceptance file are unchanged. The report attributes
the discovery run and one actual representative mutation separately.

Independent bounded retest `/tmp/native-qa-helper-retest.md` approves all three
helper closures. Import/JUnit/temp-lifecycle controls pass, and one actual
representative mutation on historical source produces exactly its one expected
failure after a clean 37-pass/five-xfail baseline. No full nine-mutation campaign
was repeated.

Base and correction integrate locally as `5c357d6` / `4e3b245`; their final files
are byte-equal to the reviewed delivery. With actual pinned fixtures, the integrated
acceptance file under `--runxfail` passes **42 checks in2.13s**. This executes the
original five assertions normally and establishes lead integration behavior; it
does not remove QA's markers or accept the newly found ancestor case. No full
mutation or unrelated e2e campaign was repeated.

QA has received the ancestor reproduction and the final-candidate dependency in
`handoff_09b87b384ab23d8abbe69fa97fcb9521`. Once the final repair is released, its
same conditional retest includes that case plus relevant conflict/fence controls;
only then should QA remove the five markers and update its helper's historical
37/5 baseline metadata for the repaired candidate. No duplicate task is assigned.

## Final ancestor correction and release checks

Actual Backend delivery `69e129821ea8d0f608f77e4e22c0b121f2cb8d11` arrived in
`handoff_4f43dfda90a5a8ff881de7b35cae6938` at07:45:03 UTC, directly above
`d1c3c7a`. It integrates as `94668c7`, preserving all preceding local work.
Lead reviewed the complete delta: the existing exact raw HTTP replay condition
now reaches ancestor artifact checks through `_dependencies`, defaulting false
for other callers. Frame tombstones are checked after current source access and
before original diagnostics, for both submitted and ancestor frames. No extra
traversal, transaction, decoding, repair or error blanket is added.

Independent `/tmp/native01-ancestor-retest.md` approves the closure after all four
unchanged probes pass in0.19s against an exact archived source with module origins
asserted. Main files are byte-equal to the delivered correction. Actual main checks:

| Check on integrated `94668c7` | Result |
| --- | --- |
| `test_raw_replay_integrity.py` | 37 passed in2.32s |
| `test_raw_frame_ingress.py -k 'parent or ancestor'` | 17 passed,105 deselected in0.74s |
| Original QA five cases, unchanged assertions under `--runxfail` | 5 passed,37 deselected in0.47s |
| Unchanged four independent probes, main module origin asserted | 4 passed in0.38s |

These overlap earlier coverage and are not summed into a completion score. The
313-case and full42-case runs preceding this delta are retained as earlier results;
neither was repeated unnecessarily. No native/DB/device/provider campaign ran.
The code/QA-evidence milestone is ready for ordinary publication and the already
assigned independent QA retest, including coherent removal of the five markers
and update of helper baseline metadata after actual verification.
