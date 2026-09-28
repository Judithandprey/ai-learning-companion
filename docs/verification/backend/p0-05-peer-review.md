# P0-05 backend peer review

Date: 2026-09-28. Reviewer: backend, `wt-backend`, `team/backend`.
Review began with a clean tree at `014d1807afcaa7b8a34ac4b6cf1c7639fc275d55`.
Task-board baseline read: `36d5e7d37d82f7be3d7b525db45e653f52bed68c`;
requirements baseline: `e43293760c70364584cb597ae01d34a261cc52cf`.
AGENTS, TEAM, backend role, directory, P0-05 card and its relevant requirements
were read. This is the lead-assigned P0-05 cross-review, separate from P0-04 QA.

Reviewed candidate: **`ccfcb2c0ad429ab6568727db7addf5f5a0ab14ee`**.
Parent: `699504c8dea0a9a4c7089781f15e2931baa0f926`.
Read-only review covered `services/learning/archive.py`, `retrieval.py`,
`timestamps.py`, `tests/evals/test_memory.py`, and supporting contract/evaluation
code and stored reports. No learning source, sample, label or historical report
was changed; no branch merge or dependency installation was required.

## Conclusion and compatibility finding

No blocking defect was found in the reviewed timestamp fix when used with the
lead's current shared contract. Exact decimal ordering avoids float/microsecond
rounding; zero-suffixed fractions compare equally without rewriting originals.
Correction validation rejects equal or reversed instants; filters implement an
inclusive `after` and exclusive `before`. User/project/actor/version filtering,
history/current distinction and exact source/frame/event references were reviewed.

One old-baseline compatibility difference must remain visible. The candidate's
own older contract accepts a timestamp ending in `Z\n` because of its `$` regex
anchor. Parent archive/index construction accepts it; candidate archive construction
accepts it but index construction raises `ValueError` at `retrieval.py:43` through
`timestamps.py:21–23`. The lead's existing `f02618f` contract correction, present
in `36d5e7d` and this backend branch, rejects that input at validation using
`Z(?![\s\S])` (`packages/contracts/schema.json:16`). **Retain that contract fix
when integrating**; do not weaken the new timestamp parser to accept trailing
newlines. This is a standalone old-contract compatibility finding, not a blocker
on the specified current integration baseline.

The archive is explicitly a synthetic fixture adapter, not a production ingestion
API. Constructor/evidence copies protect against caller-owned input or returned
object mutation; repeated retrieval and index save/reload preserve originals.
Duplicate fixture identities are rejected, rather than providing backend batch
ACK semantics. Public in-process dictionaries and derived index files are trusted
harness state, not an adversarial persistence/authentication boundary. No production
archive immutability, database idempotency or live authorization acceptance follows.

## Actual execution

The existing lead virtual environment was used read-only: Python 3.14.4,
jsonschema 4.26.0, rfc3339-validator 0.1.4. No provider or paid call was made.
The exact candidate was exported to `/tmp/backend-p005-review-or_c_n71`:

```sh
python3 - <<'PY'
import io, pathlib, subprocess, tarfile, tempfile
sha='ccfcb2c0ad429ab6568727db7addf5f5a0ab14ee'
root=pathlib.Path(tempfile.mkdtemp(prefix='backend-p005-review-'))
data=subprocess.check_output(['git','archive',sha,'packages/contracts','services/learning','tests/fixtures/memory','tests/evals','pyproject.toml'])
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    archive.extractall(root, filter='data')
print(root)
PY
```

From that printed directory (substitute its new path on a rerun):

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest packages/contracts/tests tests/evals -q -p no:cacheprovider
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.learning.evaluate --output /tmp/backend-p005-review-or_c_n71/output
```

Results: **99 passed in 0.87 s** (42 contracts + 57 learning); evaluation exit 0.
These are independently executed candidate tests, not the backend's 195-test result.
The evaluation exercised 80 queries against each of two local candidates:

| Candidate | Exact complete / n | Fuzzy complete / n | Exact P95 ms | Fuzzy P95 ms |
| --- | --- | --- | --- | --- |
| Lexical only | 50/50 | 17/30 | 2.214 | 2.202 |
| Lexical + metadata | 50/50 | 25/30 | 1.494 | 1.710 |

Single local timing run, not a device/production latency guarantee. The 875
observations, 90 sources and 89 frames are synthetic. Fresh-process restart,
rebuild, deterministic index bytes and unchanged original-file checks passed.

## Independent report preservation comparison

Parent final report, committed corrected report and this new execution were
compared directly, without trusting the candidate's `comparison.json` claim.
Only each result's measured `latency_ms` was excluded. All **160 complete result
rows**, including rankings, scores, queries, expected anchors, actual provenance
and failure details, matched. All **18 failure rows** matched. All **187 fixture
file hashes** matched. The metadata failures remain `fuzzy-03`, `fuzzy-22`,
`fuzzy-24`, `fuzzy-26`, `fuzzy-29`; lexical-only retains 13 failures.

Executed from the backend worktree:

```sh
python3 - <<'PY'
import json, subprocess
from pathlib import Path
parent='699504c8dea0a9a4c7089781f15e2931baa0f926'
sha='ccfcb2c0ad429ab6568727db7addf5f5a0ab14ee'
def read(commit,path):
    return json.loads(subprocess.check_output(['git','show',commit+':'+path]))
def strip_times(rows):
    return [{k:v for k,v in row.items() if k!='latency_ms'} for row in rows]
old=read(parent,'docs/verification/learning/p0-05-final/report.json')
new=read(sha,'docs/verification/learning/p0-05-time-fix/report.json')
run=json.loads(Path('/tmp/backend-p005-review-or_c_n71/output/report.json').read_text())
for name in old['candidates']:
    assert strip_times(old['candidates'][name]['results'])==strip_times(new['candidates'][name]['results'])==strip_times(run['candidates'][name]['results'])
assert old['preflight']['fixture_file_hashes']==new['preflight']['fixture_file_hashes']==run['preflight']['fixture_file_hashes']
oldfail=read(parent,'docs/verification/learning/p0-05-final/failures.json')
newfail=read(sha,'docs/verification/learning/p0-05-time-fix/failures.json')
runfail=json.loads(Path('/tmp/backend-p005-review-or_c_n71/output/failures.json').read_text())
assert strip_times(oldfail)==strip_times(newfail)==strip_times(runfail)
for path in ['tests/fixtures/memory','docs/verification/learning/p0-05-final','docs/verification/learning/p0-05-run']:
    assert subprocess.check_output(['git','rev-parse',parent+':'+path])==subprocess.check_output(['git','rev-parse',sha+':'+path])
print('PASS independent frozen-report comparison')
PY
```

Original fixture tree: `6920fae161af252857c0e2f6530c340f387221d1`.
Original final-report tree: `21f1229230d68d1667068b7a070a778df9361ad1`.
Original first-run tree: `a0232564026f02b9483876342bac28b8d00e53bf`.
All three are identical between parent and candidate. Reproduced signatures:

```text
archive: d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f
ranking: b5922ddd8314665e09498c795fc11763f727c126e0a791be3d01d432be157a46
```

Additional stdin probes passed constructor-input and nested evidence-return
isolation, repeated-query equality, exact returned-source references, unknown-user
isolation and byte-identical save/reload. A delegated read-only timestamp review
also checked independent rational-number ordering and current-contract parser
compatibility; it identified the old-contract newline difference above.

## Limits

G6 remains incomplete: Graphiti was not run. No human semantic labeling, live
course, provider, device, PostgreSQL, model switch or context-compaction trial
ran. The known fuzzy failures remain failures. This checks the assigned candidate
and its frozen synthetic report, not main integration or all product requirements.
P0-04 fixes were separately prioritized when the lead reported them; their results
are recorded in their own evidence and do not count toward this review.
