# Internal capture persistence and QA-14 integration

2026-09-28 UTC. Starting main: `b2f91722d72a5a4cb9259c70c588de0d6a40216d`.
This continues P0-08/P0-09 and reads actual deliveries; it is not product acceptance.

## Reviewed deliveries

| Native delivery | Owner commit → main | Result |
| --- | --- | --- |
| `handoff_ddc893184277c641bec60d9e08508f6e` | Backend `75f4e3327527af5fefa7f0d9ed9808b428cd47b7` → `76f206c` | Internal provisional operation/coverage archive, exact atomic ACK/replay, current lifecycle checks, owned dependencies/artifacts and deletion. Additive migration 0002; 0001 unchanged. |
| `handoff_18c851fc1b5dcfee97fc78eded771e73` | QA `c49747b97bfdd21041d4393bf1b56f6f2c10b8ac` → `03b2579` | Independent schema/helper evidence at exact `e63b28f`, including QA-14 and two low invariant gaps. Original report/results preserved. |

Two bounded read-only reviews found no capture implementation blocker. The
production reviewer passed all 60 new capture tests and three additional probes:
transitive ancestor deletion/replay invalidation, shared-blob last-reference
cleanup, and a reverse-ordered diamond dependency graph. The storage reviewer
passed 38 focused portable checks and verified prerequisites against main.
Neither reviewer connected to PostgreSQL. Lead reviewed the actual call flow and
contract obligations, not just the owner report.

The [Backend report](../backend/p0-09-capture-evidence.md) records **26 actual
PostgreSQL 18.6 groups** (19 existing plus 7 capture groups), fresh Python-process
readback, rollback injection, four SQL immutability guards and unsafe downgrade
refusal. These are owner-executed results, not independent QA or a lead DB rerun.
The first signed-zero ACK failure and its response-JSON-string correction remain
recorded. No database, service, account or provider was provisioned by this review.

**Concurrency qualification:** the runner's competing lifecycle test signals
second-call start before opening its connection. Both resulting serial commit
orders were exercised, but that signal does not prove the second PostgreSQL
backend actually waited on a lock before release. The stronger wording in the
historical owner report is qualified here; observed lock contention needs a
bounded Backend follow-up, not a false independent concurrency pass.

Migration 0002 up SHA-256 remains
`2e549ec626d325a3bbfabbf5fc9ad15c2441828a411889f0d785a7f5209194f2`.
The whole milestone diff check reports its one pre-existing added EOF blank line
(exit 2); applied/tested migration bytes were deliberately retained. All subsequent
lead edits pass `git diff --check`. No whitespace settings were relaxed. Apply the
migration and deletion-aware archive before capture writers; keep that archive
while capture state exists. Do not erase originals/fences to force downgrade.

## QA-14 repair and compatibility

Lead reproduced the three strict QA-14 failures before editing. An independent
read-only reviewer reproduced the baseline validators and both v1 events/source
HTTP crash paths, plus unsafe error rendering at shallower malformed depths.
Both validators now run the shared iterative structural/numeric guard first.
It traverses dictionaries, lists and Python JSON-encodable tuples, rejects cycles
or nesting beyond the engineering bound 64, and constructs no input-bearing error.
Every current closed shape fits: maximum depth 5 for v1, 6 for v2. No valid current
wire payload, field, namespace, generated artifact or example is changed.

Legacy `validation.py` is the explicit runtime safety exception to byte freezing:
old `fa91408753f048b673ccf129e5151fd4ae5ca26ad36519e89b38ea0649b61817`,
new `f3e2c3e7926865896a7dae6e56585b68cd72f84d498df9b6864f2fe613a1f254`.
Both compatibility suites record that exception; the independent baseline digest
and all other frozen-file comparisons remain. Direct-validator regressions build
deep values iteratively for supported Python parsers; the HTTP regression still
sends the actual nested JSON body. Three repaired xfails are promoted, while
QA-P08-01/02 remain strict xfails. The independent reviewer verified the repair
and HTTP `422 invalid_request`; this does not close unrelated QA findings.

Focused contracts + QA + capture checks: **362 passed, 2 xfailed**. Before the
explicit pin/xfail updates, the focused run correctly failed on two changed pins
and three strict XPASS results; these were test integration changes, not hidden
production failures. `python` was absent on PATH; commands used the existing
`.venv/bin/python` without installing dependencies.

Integrated `bash scripts/check.sh`: **807 passed, 16 xfailed**, generation checks,
TypeScript, eleven Web test-file runs and build passed. [Actual log](p0-09-capture-integration/integrated-check.txt).
The 16 are 14 existing expected failures plus the two newly recorded low capture
invariant gaps. No extra provider/device/DB result is inferred from this check.

## Remaining boundaries and next actions

- Lead P0-08: production stream membership/incarnation and lifecycle commands,
  typed artifact upload and HTTP adapter need a separately committed formal slice.
  No current `/v2` endpoint/capability is activated. Attempt/permission/presenter/
  linked-v1/diagnosis/export/audio families remain separate unreleased work.
- Backend P0-09: observe actual competing DB lock wait in both stop/delete orders,
  retaining the real test evidence and original migration bytes. This is the next
  bounded continuation, not a duplicated ingestion task.
- QA: finish already assigned Learning persistence review, then check this exact
  integrated capture/QA-14 candidate at a safe boundary. Independent DB acceptance
  is still pending. Learning context delivery `d25efe8` and iOS documentation
  delivery `ea39a3d`/`e221793` are held for the bounded corrections below.
- Web D1/ORG-3/EO-1 work keeps its owner; Support remains on demand. Actual device,
  provider, original-screen/Pencil, Notability import, G6/G7 and full P1 stay open.

Publication SHA and actual native handoff receipts are appended after the normal
push. An accepted send is not proof of worker reading, implementation or acceptance.

## Additional deliveries: preserve work, repair concrete defects

Learning delivered `d25efe89b94eae8767553615f166db222424b4a6` through
`handoff_6bd9704ee6fc8f25663e4860d66aba6d`. Two independent bounded reviews passed
the 28 new context tests, exact four examples, fresh-process stability and budget
probes; the budget reviewer also ran 327 Unicode/metadata boundary probes and
confirmed all 187 originals unchanged. No frozen evaluation was rerun.
The access reviewer found that fingerprints omit dictionary identity keys. Lead
reproduced this in the exact candidate export: swap two synthetic owners' frame
keys, retain values/order, and assembly still reports a fresh fingerprint while
returning `other-user`'s frame for `synthetic-learner`'s event. This is local corrupt
snapshot handling, not a remote endpoint exploit. Integration is held. The actual
existing-card repair was sent as **`handoff_6bc6aa6d5298f2331d94aab103564138`**:
validate source/frame/event map keys against intrinsic record identity on both
archives before search/rehydration, and add precise regressions. No original,
retrieval ranking, corpus, labels, shared wire or task was replaced.

iOS delivered `ea39a3d` plus `e221793` through
`handoff_d4a10fd4c7817af9866f45068d04741b`. The isolated document checker passed
both profiles (72 P0-03 / 48 P0-11 rows; 23 / 28 self-test rejections). This does
not independently verify its official-source research or hardware claims. A
concrete contradiction remains: plan §17 item 7 and checklist AV06 prohibit all
media files except transient buffers, conflicting with retained source keyframes
and editable originals. Lead confirmed the exact clauses and sent bounded repair
**`handoff_c1691b710b60972afca802128e948ea4`**. Restrict that prohibition to
continuous AV recordings/buffers and preserve authorized durable originals and
pre-stop queues. No duplicate research/device task or mode activation was sent.
The future safe integration sequence is `ea39a3d` (retain both header paragraphs
at its overlap), `e221793`, then the owner's follow-up; do not cherry-pick the
intermediate merge `01207b8`. These documents remain unintegrated until repaired.

Both repair receipts are accepted/unread/execution_started=false; only actual
delivery proves later work. Exact English bodies and receipts are retained in
[handoffs.json](p0-09-capture-integration/handoffs.json).
