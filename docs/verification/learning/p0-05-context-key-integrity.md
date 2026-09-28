# P0-05 context follow-up: mapping identity integrity

Parent `d25efe89b94eae8767553615f166db222424b4a6`; bounded review request
`handoff_6bc6aa6d5298f2331d94aab103564138`. Assigned task/requirements baseline
remains `7b36ccbaf86879f2a7518f39e419a345e136ade8`. This is a normal follow-up;
the prior implementation/evidence is preserved, without reset or amendment.

The values-only snapshot hash missed key-only remapping. Independently reproduced
the lead's exact in-memory frame-owner swap on two validated synthetic owners with
overlapping frame IDs: the hash stayed unchanged, while returned evidence belonged
to `synthetic-learner` and its frame to `other-user`. This was corrupted local
snapshot behavior, not a demonstrated remote attack. The prior blanket mutated-
snapshot protection claim did not cover this case.

Before accepting either archive's fingerprint, `_snapshot_fingerprint` now verifies
each source key against `source_key(record)`, each frame key against its intrinsic
owner/frame ID, and each event key against `event_key(record)`. Tuple components
must also retain their intrinsic types (Python's `True == 1 == 1.0` is insufficient).
Any mismatch rejects before retrieval or raw evidence access. No archive/index
format, identity, source records, retrieval semantics or shared contract changed.

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_context.py -q
```

**51 passed in 2.01s**. The 23 added cases cover all seven identity components
across the three maps in shared, separate supplied-archive and separate index-archive
paths (21 cases), plus two Python-equal source-version type substitutions. Each
remapping retains the values/order and defeats the old hash-only check; sentinels
verify rejection before `index.search` or either raw accessor. The first new test
failed on the old code as expected. The exact frame-owner repro now raises:

`ValueError: Archive frames mapping identity mismatch; reload the snapshot`

The documented four-packet reproduction check still passes with identical bytes
and original example hash. All 187 original file hashes, frozen archive/retrieval/
evaluation code and original failure artifacts are unchanged. No provider calls.
The prior 160-row quality comparison and lead-reported 327 additional budget probes
were reused, not rerun or relabeled as new validation. This closes the tested
mapping-remap hole; it is not production transactional authorization or a remote
security claim. Real model switching, G6 and P1 remain open.
