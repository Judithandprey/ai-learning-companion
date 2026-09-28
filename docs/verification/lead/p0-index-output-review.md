# P0 index-output finding and PostgreSQL contention integration

2026-09-28 UTC. Starting main: `6e50f749fc8ef7e3bb31451b67a328db507b099b`.
This handles two actual deliveries under existing P0-05/09/13 assignments.

| Native message | Owner commit → main | Review result |
| --- | --- | --- |
| `handoff_a19940da73dc7973491852e88661a47b` | QA `18ec8133216a0554b420ded9dd1a6d65c62b2009` → `068f593a1eca10031393968f6f081e0196947dfa` | Preserve independent local index/source-protection findings and add seven temporary-copy regressions. QA-L05-01 remains open. |
| `handoff_3459c458995a616525a1213e5864beff` | Backend `17a7dc88d5acb058fb4f0616e6f84bcdc61710b4` → `ca5c459e9b4cd890407cf6a09a0ef4a9ee3c56e1` | Actual lock-observation runner, portable tests and owner PostgreSQL evidence reviewed/integrated. |

The lead read both complete reports and changed test/runner call flows. Separate
bounded read-only reviews checked integration prerequisites and evidence. Neither
the lead nor those reviewers connected to the database. Production source, shared
contracts, migrations, dependencies and Learning implementation were unchanged by
these two integrations; `git diff 6e50f74 HEAD -- services/api/migrations
packages/contracts services/learning` was empty at `ca5c459`.

## Learning finding and evidence qualifications

The [QA report](../qa/p0-05-index-persistence.md) independently confirms the earlier
directory-alias rejection, safe external dedicated-cache controls, malformed
snapshot rejection and claimed local interrupted-save behavior. Its 109 owner
tests passed. Frozen retrieval quality was not re-measured.

**QA-L05-01 is open:** the evaluation directory is guarded, but the four output
files use direct writes that follow pre-planted symlinks or write through hard
links. The final three are written after the preservation comparison, so copied
originals can be overwritten while the report claims `file_hashes_unchanged:true`
and exit 0. The lead confirmed the unchanged vulnerable call flow, then reproduced
the two strict expected failures with QA's temporary-copy tests. No probe targeted
repository originals. A direct inventory comparison against the preserved
`p0-05-time-fix/preflight.json` found all **187** repository originals unchanged.

The report and detailed JSON are retained verbatim. Where the short report
overstates its own detailed evidence, the [original JSON](../qa/p0-05-index-persistence/review-findings.json)
governs this integration:

- Four kill stages occurred before replacement and retained the previous bytes;
  the fifth occurred after replacement, before cleanup, and retained a complete
  new index. This is not five pre-replacement tests.
- AG-05 is an unexecuted static TOCTOU observation, explicitly
  `reproduced:false`; the blanket statement that every finding was reproduced
  does not apply to it. Concurrent writers, power loss and directory fsync remain
  outside the established guarantees.
- The bind-mount alias is QA-reported actual Linux evidence. Case-insensitive
  APFS behavior is a hypothesis requiring a real platform check, not a macOS pass.

Adjacent demonstrated gaps concern non-manifest metadata aliases, directory
identity aliases and failed reruns mixing new preflight with old success outputs.
The dedicated-cache path contract does not authorize overwriting arbitrary project
files in tests. FIFO behavior and non-regular targets can be closed by the same
bounded path fix; a general filesystem framework was not requested.

The exact existing-card repair and accepted receipt are in
[learning-repair.json](p0-index-output-review/learning-repair.json):
**`handoff_ee50c8b9efb97596254985166eccb697`**. Learning owns implementation in its
existing scope; no new task ID, provider, dependency or frozen quality tuning.
At dispatch, state was `unread`, `execution_started:false`. No fix, read receipt or
completion is inferred from acceptance. QA reports starting its previously queued
exact `3f375217eeee8d809e5d906d615870afa08d7a23` capture/QA-14/context review;
that task is not interrupted or duplicated.

## PostgreSQL contention evidence

The [Backend follow-up](../backend/p0-09-lock-contention.md) corrects the prior
26-group evidence: ordered outcomes alone did not establish actual waiting.
The new runner checks the uniquely tagged waiter's current database/role, active
actor `FOR UPDATE` statement, transaction-ID wait, matching holder transaction
lock and `pg_blocking_pids` before releasing the held transaction. Four actual
stop/delete ordering observations and two injected observer-failure cleanup cases
are recorded. Polling/query time bounds, rollback, worker join, server-side session
disappearance and subsequent actor-lock reacquisition were reviewed.

The owner ran **27 real PostgreSQL 18.6 groups**, including the existing HTTP and
capture checks. A reviewer independently ran **25 portable runner tests**. The
lead's combined integrated check below contains those 25; it is not another real
DB execution. Production registration, typed upload, lifecycle/HTTP contracts and
independent DB acceptance remain open. No database or service was provisioned or
reconfigured by this integration. Applied migration 0002 up retains SHA-256
`2e549ec626d325a3bbfabbf5fc9ad15c2441828a411889f0d785a7f5209194f2`, including the
previously documented EOF blank line; migration 0001 also remains unchanged.

## Focused integrated checks and next dependencies

```sh
.venv/bin/python -m pytest -q tests/e2e/test_p0_05_index_persistence_qa.py services/api/tests/test_postgres_capture_check.py services/api/tests/test_postgres_check.py
```

Actual result: **30 passed, 2 xfailed in 8.36s**, exit 0;
[log](p0-index-output-review/focused-check.txt). Both strict xfails preserve the
new output-alias defect. No whole unchanged application suite or frozen ranking
benchmark was rerun. `git diff --check 6e50f74 HEAD` passed for the two picks.

Learning owns the concrete output/source-protection repair. QA owns its already
started capture/QA-14/context review. Lead P0-08 owns the next separately released
formal stream/membership/incarnation/lifecycle, typed-artifact and HTTP slice;
Backend's production adapter depends on that release. Existing Web work keeps its
owner; Support remains on demand. None of these checks establishes device,
provider, original-screen ink, Notability import, G6/G7 or P1 acceptance.

## Publication and useful follow-up

Normal push of **`2988dd60969240358dbe1ff8434c110af8693366`** succeeded;
`git ls-remote origin refs/heads/main` returned the identical SHA. Scoped staged
`git diff --check` and receipt/local-link validation passed before commit.

QA received a substantive same-review supplement as
**`handoff_5c7ee5d775f34448c27cc100216061be`**, replying to its actual index delivery:
the two evidence qualifications, the real Learning repair dispatch, and the exact
new Backend runner/evidence baseline. Production code of its current `3f37521`
review is unchanged; no review restart, duplicate task or DB provisioning was
requested. [Exact body and accepted receipt](p0-index-output-review/qa-followup.json).
At send it was unread with execution not started; this is not a read receipt.
The following evidence-only commit records publication and this actual notice.

## Subsequent repair delivered

Actual Learning delivery `handoff_757110736dcfe9978ffb7c260ead9390` supplies
`1504509`, now integrated as `07c684b`. The earlier open/awaiting-delivery state
above is historical: 215 Learning tests and seven promoted QA regressions pass
locally, with all 187 originals unchanged. Saved reports now require the matching
post-write stdout completion receipt. Independent role-QA retest is still pending;
see [repair integration](p0-output-repair-integration.md). Original QA evidence and
unverified platform/concurrent-write limitations are preserved.
