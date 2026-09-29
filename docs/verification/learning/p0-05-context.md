# P0-05: callable provenance-preserving context

Implemented `services.learning.context.assemble_context` under the existing P0-05
card, dispatched in `handoff_0d6c9be85043602431af8b46c7edb056`. Read the complete
card, role, R27–32/R53/R58, current intent and V-ArchiveCompanionContinuity /
V-ModelSwitchContext at **7b36ccbaf86879f2a7518f39e419a345e136ade8**. All four
source/English manifest pairs matched. Worktree parent:
`56787145591c3223ea597c5b0ed676822a6ce247`; no reset or baseline merge. The four
archive/retrieval/timestamp/evaluation modules match that integrated baseline.
Latest contract validation was additionally checked in an isolated baseline export.

The callable returns an internal provider-neutral packet with the source snapshot
fingerprint. It defaults to current, keeps explicit history separate and never
interprets a current time filter as as-of reconstruction. Ranked hits retain their
scores; metadata/access-checked correction neighbors carry their own original
provenance and historical labels. Competing branches remain unresolved. Quotes,
actor, observation confidence, separate capture/receive times, source/frame/hash
references and gaps are preserved. Scope-filtered relations remain explicit.

Canonical UTF-8 byte budgeting omits whole items with counts for ranked hits and
correction context. Total retriever candidates remain unknown. A budget too small
even for metadata raises an error. Snapshot mismatch/mutation fails closed before
or after rehydration; every call rebuilds its packet and no packet cache is created.
There is no generated answer, presentation grant, provider call or model activation.

## Reproduction and results

From this worktree, using the existing environment without installation:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_context.py tests/evals/test_memory.py tests/evals/test_index_persistence.py -q
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m services.learning.evaluate --output /tmp/p005-context-evaluation
```

**137 passed in 14.56s**, including 28 new context cases. Coverage includes both
users and teacher/user/assistant separation; source-version/frame integrity;
current/history and future corrections beyond a time filter; exact fractional
timestamps; inaccessible/filtered parents and children; competing branches and
their descendants; confidence zero, unknown actor/times, missing media/no-hit/ties;
whole Unicode quotes at exact byte boundaries; truthful omissions; output mutation;
stale/deleted and in-place-mutated snapshots; mutation during rehydration; and byte
equality after saved-index restart in a fresh Python process.

An exact temporary export of assigned main `7b36ccb`, with only the new context
module and tests overlaid, also passed **85 context/memory tests** against main's
updated v0.1 validators. This is isolated compatibility evidence, not a main merge
or a claim that the lead's integrated tree has run this delivery.

The frozen evaluation still has **50/50 exact and 25/30 fuzzy** for lexical+metadata
and 50/50 + 17/30 for lexical-only. All 160 complete result rows, including scores,
citations and failures, equal `p0-05-time-fix/report.json` after excluding latency.
The five fuzzy failures `03/22/24/26/29` remain. All **187 source/fixture hashes**
match the original inventory; corpus, labels, queries and failure artifacts were
not edited. Provider calls/tokens/paid API cost: **0**.

## Deterministic packet examples

[Executable outputs](p0-05-context-examples.json) contain current, history,
current-before-a-future-correction and limited-budget packets. Canonical packet
sizes are respectively **4460, 4460, 1132 and 1110 bytes**; the first two contain
two whole items, while the last two distinguish no-hit from budget omission.
These authored synthetic examples are not independent semantic acceptance.

```sh
python3 - <<'PY'
import json
from pathlib import Path
from services.learning.archive import FixtureArchive, canonical, digest
from services.learning.context import assemble_context
from services.learning.evaluate import FIXTURES
from services.learning.retrieval import RetrievalIndex
archive = FixtureArchive.load(FIXTURES)
index = RetrievalIndex(archive)
examples = json.loads(Path('docs/verification/learning/p0-05-context-examples.json').read_text())
for expected in examples.values():
    actual = assemble_context(archive, index, expected['query'], user_id=expected['user_id'],
                              top_k=expected['retrieval']['top_k'], max_bytes=expected['budget']['max_bytes'])
    assert actual == expected
    assert len(canonical(actual)) <= actual['budget']['max_bytes']
assert digest(canonical(examples)) == '40d7f90cbaf85321236fab2c99551e0ddae168fd8c5c0a529475c52d3e4783fe'
print('Four packets reproduced exactly.')
PY
```

The API and caller obligations are documented in `services/learning/README.md`.
This is synthetic local evidence assembly, not production authorization, database
transactions, causal completeness, confirmed audio/diagnosis repair, semantic
multilingual retrieval, preference continuity, a real model switch or device proof.
Backend still owns the actual archive/authorization/deletion transaction boundary.
Old packets must not be reused after changes; a hash check is not that production
transaction. R53 presentation checks remain the future presenter’s responsibility.
G6, V-ModelSwitchContext and P1 remain open. No new shared wire, identity, archive,
dependency or provider was introduced; lead integration and independent QA remain.
