# P0-09 design evidence

Date: 2026-09-28. Branch `team/backend`. Initial design started clean at
`803916ff5d1663cb970636b22bb897d89d083da0` and was delivered in
`43a0e811f38b1309494c85be4a15936fa9188d24`. This continuation started clean at that
design commit, preserving the original delivery and its V01–V17 vectors unchanged.
P0-04 implementation/tests were not repeated. Earlier specification/task SHA reads:
`57aee9cfc86dfa0dcde674d118034063163ddb13` and
`e8b02c5be9c343c35698dc7d67bb58cfbb5cb3e6`.
Latest reading baseline: `e43293760c70364584cb597ae01d34a261cc52cf`, including its
AGENTS, TEAM, backend role, P0-09 card, main requirement updates and complete detailed
specification (content revision `a2567fa63cdc9c73e9902af57eabf5032a15e5a7`).
All were inspected with exact `git show SHA:path`; no baseline merge was needed for
these document-only changes. Existing implementation and contract 0.1.0 remain
unchanged. Delivery is sent through the configured lead's actual mailbox reply route.

Deliverables:

- [Process persistence design](p0-09-process-design.md): entity relationships,
  causal branches, original ink, coverage gaps, transactions, help/presentation
  fences, diagnosis corrections, preference scopes, deletion and dependencies.
- [25 synthetic declarative vectors](p0-09-transaction-vectors.json): duplicate and
  conflicting replay, branches, undo/redo ABA, gaps, partial/unknown help, stale
  caches, revoke/regrant, disconnected display, language overrides, diagnosis,
  erasure, crashes, offline intent and assistance-aware evidence for A37. New
  V18–V25 cover A42–A46 and linked A26–A28: multiple web/formula/ink entries,
  website-feedback attribution, live-screen anchors and AI input evidence, stop
  fences, explicit fallbacks, independent AI layers and actual target import.

The amended task adds R54/R55/A37. V06/V16/V17 distinguish generated but not
presented, unknown/partial presentation, self-correction, post-hint correction and
post-solution completion. They retain user-request scope, allowed disclosure,
reported actual help and attempt/step versions as proposed evidence. None implies
understanding or independent mastery from assisted completion.

An independent local read-only review supplied 12 adversarial schedules. Its
distributed-presentation finding is explicit in the design: a backend transaction
cannot atomically revoke pixels/audio on a disconnected device; receipts and a
measured client freshness/race policy are still required. No external platform
capability was researched or claimed from this review.

Continuation review added eight edge-case schedules, including unknown attribution
of website-script changes, view-epoch changes during ink, missing overlays in AI
input, untrusted historical-upload flags, and uncertain target import. The design
explicitly records R59 as a clarification of existing classroom requirements:
original live screen to editable original/context to independent AI layers to
verified supported Notability import. A45 fallback success cannot pass A44, and
export/share success cannot establish actual import or native editable target ink.

## Executed static checks

From this worktree, the following checks parse the fixture, validate descriptive
coverage and mark every schedule unexecuted. They do not simulate any proposed
transaction, presentation or teaching behavior.

```sh
python3 - <<'PY'
import json
import subprocess
from pathlib import Path
p = Path('docs/verification/backend/p0-09-transaction-vectors.json')
x = json.loads(p.read_text())
assert x['artifact_kind'] == 'declarative_design_vectors_not_wire'
assert x['specification_sha'] == 'e43293760c70364584cb597ae01d34a261cc52cf'
assert x['task_card_sha'] == x['specification_sha']
assert x['provenance']['contains_real_user_history'] is False
assert 'contract_version' not in x
vectors = x['vectors']
assert len(vectors) == len({v['id'] for v in vectors}) == 25
previous = json.loads(subprocess.check_output([
    'git', 'show', '43a0e811f38b1309494c85be4a15936fa9188d24:' + str(p)
]))
assert vectors[:17] == previous['vectors']
requirements, acceptance = set(), set()
for v in vectors:
    assert v['execution_status'] == 'not_executed'
    assert v['preconditions'] and v['expected'] and v['required_execution_layer']
    assert [s['ordinal'] for s in v['schedule']] == list(range(1, len(v['schedule']) + 1))
    assert all(s['actor'] and s['action'] for s in v['schedule'])
    requirements.update(v['requirements'])
    acceptance.update(v['acceptance'])
assert requirements == {'R46','R47','R48','R51','R52','R53','R54','R55','R57','R58','R59'}
assert acceptance == {'A26','A27','A28','A30','A31','A34','A37','A38','A40','A42','A43','A44','A45','A46'}
print('PASS: 25 design vectors; original 17 unchanged; structure and assigned coverage only')
PY
git diff --cached --check
```

Result: exit 0 for static fixture checks and staged whitespace validation. Only
these three design/evidence files are changed by this delivery. No new executable
test suite is added, and the previously reported 195 P0-04 tests are not reused as
evidence for this new design.

## What remains unverified

P0-08 must settle and commit the versioned shared contracts, transport ACK/CAS
semantics, help/preference scope and final-presentation rules before implementation.
Learning/platform/web results still need coordination through the lead; the exact
inspected specification tree did not contain those new evidence deliveries.

No process protocol, migration, persistence implementation, model teaching result,
semantic-disclosure check or real-device test ran. No new PostgreSQL acceptance
ran; P0-04 remains blocked by missing dedicated `LC_TEST_DATABASE_URL`. Future
two-connection races, restart recovery and migration checks are specified, not
passed. G5/G7 and the assigned A26–A28/A30/A31/A34/A37/A38/A40/A42–A46 remain
unaccepted, including original-live-screen R59/A44 and actual Notability import.
No account writes, paid
calls, dependency installation, publication or persistent service was performed.
