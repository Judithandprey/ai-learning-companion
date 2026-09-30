# Native retained-context QA delivery review

**Current state:** independent final QA at exact production `00f4f0b` passes.
QA-FINDING-NATIVE-01 is closed; QA delivery `87bcc07` integrates as `d1b82da`,
and the integrated main module passes 91 checks with no xfails. All source/helper
HOLDs below are historical and closed. Native control-client composition is the
next bounded implementation; trusted runtime grants, signing/device and real
provider remain separate dependencies. Neither core gate is accepted.

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

## Publication and actual final retest dispatch

Reviewed/tested release **`00f4f0bcda9107ecc75b88c8f435e6c2a4ce7625`** was pushed
normally to `origin/main`; `git ls-remote` confirmed the exact SHA. Existing
[P0 CI36685793026](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36685793026)
completed successfully for that exact source: Python3.12 / Node24.21 in4m15s
and Python3.14 / Node24.21 in4m30s. No native workflow was rerun for this
API/QA-only correction.

The already assigned final QA continuation was released with this exact baseline
as `handoff_8ce7c067616782573b6e850f42dcf106`. Its accepted receipt is initially
unread with `execution_started:false`, not an execution result. Subsequent
read-only worktree inspection observes actual QA baseline merge
`aa96c1287564a17d3b9a2a2825f1b3e575868c23`; Git ancestry confirms it contains
exact `00f4f0b`. This establishes baseline adoption/activity, not a passing retest.
It includes the
five original cases, the one ancestor omission and relevant conflict/current-fence
controls; no broader campaign or duplicated task is requested. Backend received
the actual integration/next-dependency notice as
`handoff_6c3f85f91540a52767db477fb21f3691`, with no acknowledgement requested.


## Final independent QA accepted and integrated

Actual reply `handoff_373f380b623dd74c4c542cdd72354698`, received at
2026-09-30 08:10:25 UTC, delivers `87bcc077d43f8e57adb5b8b97b59d3f18b272f26`.
Its parent `aa96c12` normally merged `00f4f0b`; production source is byte-equal
to the released candidate. Only QA-owned tests/evidence change. Lead cherry-picked
this delivery as **`d1b82da`**, without the two unrelated older QA branch files.

[Final QA report](../qa/p0-13-native-replay-retest-00f4f0b.md) and saved outputs
record 91 passed / zero xfailed. Before removing the five markers, QA ran the
unchanged assertions normally and observed all five pass; strict XPASS then
correctly failed the old marked file. Added cases cover reordered identical
requests, genuine new-key differences, ancestor binding/bytes and current
Stop/auth/source/deletion/frame-tombstone fences. Regression sensitivity detects
14 failures on pre-fix `81b7e18` and four on first-fix `0e6d4a3`.

Lead reviewed the complete diff, source equality and evidence. A bounded independent
read-only review approves the preserved assertions, mutation expectation map and
claims. The mutation helper now expects 91 ordinary passes; QA exercised two
representative mutations, not the full nine. Other historical runs remain attributed
to their original source. No extra campaign was requested or run by lead.

On integrated main `d1b82da`:

```sh
QA_NATIVE_FIXTURES=/tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures \
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -q \
  tests/e2e/test_p0_13_native_raw_ingress_qa.py
```

**91 passed in 5.23s.** Production directories and `pyproject.toml` are byte-equal
to `00f4f0b`, whose two CI matrices already passed. `git diff --check` passes.
This is ASGI/MemoryStore plus exact native harness outputs, not native transport,
PostgreSQL, ReplayKit, physical iPad, real AI, original-screen ink or Notability.
Both §7.1 gates remain open.

The separate ancestor-record observation is retained, not folded into this closed
finding: bypassing store immutability can leave a whitespace-rewritten ancestor
row accepted by child replay while its own reader returns503; a schema-valid
`method` edit can be served as stored. Neither recreates the false terminal client
conflict. No production write path was demonstrated and no claim of protection
against arbitrary schema-valid storage rewriting is made. Backend/lead retain
this boundary for any later integrity-scope change; it does not trigger another
repair/retest campaign now.

## Next existing-card implementation

P0-03/P0-11 iOS can now consume the already released control0.2.1 and ingress0.2.4
endpoints from the native client: explicitly supplied trusted registration inputs
→ validated current stream state → registered display source → existing original
and raw upload consumers. Restrictive Stop must persist locally before awaiting
server synchronization, preserve originals and never turn a stale/live response
into permission to resume. The task is scoped in the current board. Lead retains
trusted bootstrap/auth provisioning and hosted integration; the new client does
not create those grants or enable a default sender. No existing producer, real
provider, user-preview database/service or Paperclip configuration is activated.


## Publication, continuation and CI fixture wiring

Final QA integration/next-scope release **`2109ed36acea86b7190e9620022c8a53ee8cdf69`**
was pushed normally; `git ls-remote` confirms the exact SHA. Native implementation
handoff `handoff_3cfb4b3ddefec7dd93cbaec12ab26a68` is accepted on the existing iOS
route, initially unread/not started. Actual worktree inspection subsequently finds
normal iOS merge `e5e344dfadd95023a01b49c459aade572a31ccf7` containing this exact
baseline. This establishes adoption/activity only; no source delivery or native
check has arrived for the new task. Backend's final disposition/retained-observation
notice is accepted as `handoff_3d8e8a9bd1744672a9e2c3634e8e37a7`; no reply or new
Backend repair is requested. QA's delivered retest is complete, not waiting for
another acknowledgment.

Lead inspected the normal P0 workflow and found that it did not set
`QA_NATIVE_FIXTURES`, so the accepted91 cases would be skipped there. The bounded
root-CI change loads the committed native fixture ZIP only after checking its
reviewed SHA-256 `57b0f80b495305e7acd04e7f989679f3de5f890002c50fd6100aa7b4746279dd`,
extracts into a uniquely owned runner temporary directory, and exports its path
through `GITHUB_ENV` before the existing check script. The test's own48-file,
aggregate and per-file hashes stay unchanged. No dependency, workflow permission,
provider call, new fixture generation or macOS/device run is added.

Actual local verification executes that exact embedded Python step, observes all
48 files and its exported path, then runs the ten exact/reordered replay cases
against those extracted inputs: **10 passed,81 deselected in0.79s**. A changed-pin
negative exits before extraction or environment modification. Bounded independent
read-only review approves the YAML/call path and inspected archive; no traversal
or symlink members exist, and the aggregate digest matches the test. `git diff
--check` passes. The subsequent normal hosted matrix will separately establish
that these cases now run there; local checks do not preclaim that result.


## Hosted CI confirms the fixture regressions execute

Exact fixture-wiring source **`c4f2e380df1fc72f62e357618fd2c8180eed3f58`** was
pushed and confirmed by `git ls-remote`. Normal
[P0 CI36689071699](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36689071699)
completed **success** in both matrices:

| Environment | Job duration | Actual Python suite output |
| --- | --- | --- |
| Python3.12 / Node24.21 | 4m50s | 3390 passed,19 xfailed in263.60s; no skips |
| Python3.14 / Node24.21 | 5m19s | 3390 passed,19 xfailed in294.91s; no skips |

Both downloaded job logs show the successful pin/extraction step and the actual
`QA_NATIVE_FIXTURES` environment reaching the existing check step. The91 newly
enabled cases are included in these totals, not added again. The19 other expected
failures remain unrelated historical findings, not an unconditional product pass.
Generated-contract, TypeScript and Web probe checks also complete in the normal
workflow. No native or physical-device campaign is repeated by this change.

The earlier run36688675601 for `2109ed3` was cancelled by the existing concurrency
policy when this newer source was pushed (its Python3.14 job had passed; Python3.12
was cancelled). It is not reported as a completed pass. The newer complete result
above is the release evidence. Subsequent evidence-only changes do not change
these tested production, QA or workflow bytes. iOS retains the one active bounded
native control task at its observed exact-baseline merge; no duplicate QA task or
receipt-only message is needed.
