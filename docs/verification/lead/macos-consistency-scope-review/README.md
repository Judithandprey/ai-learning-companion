# QA-MAC-01 target/dependency correction release

Backend delivered `17262c8f441bbd716f290c19efcb1a17576711b9` through
`handoff_f51947381874eb8924c4b0a87df58aab`, after its preserving merge
`daacde7c1f2db6b060967a38fd517abc23424d1b`. Lead read the complete production
delta, tests and owner evidence. The candidate parent matches current main API,
contracts and Learning sources; none of those changed during this review.

Lead exact-candidate checks: **264 passed in 15.45 seconds**. The preserved
[log](lead-focused-tests.txt) covers 34 new scope/dependency cases and 230
existing Mac-related cases. [Independent review](review.md): **seven groups
passed in 2.17 seconds**, including preserved actual conflicts, six scan-order
permutations, sibling scope and post-check revocation. These are MemoryStore,
ASGI and synthetic-descriptor checks, not PostgreSQL/native/provider acceptance.

The candidate narrows consistency to actual complete targets and their validated
stored ancestors. Artifact IDs, encoded hashes and native session/path aliases
remain transitively checked. A merely related descriptor's unrelated sibling
image does not expand scope. Malformed retained descriptors still fail closed;
current authority, source/original identity, actual relevant conflicts and final
checks remain required. No deletion, archive repair or wire change is involved.

The existing conditional QA task `handoff_1ef0062c0533e8cd7059b7905874fdd3`
received the exact candidate via **`handoff_bc0c64755d0cad3439ecd7533d775868`**.
This is an accepted delivery, not proof of execution. QA owns updating the three
historical actor-wide scope expectations, preserving real conflict refusals and
running its changed-case file. Source is **reviewed but not yet integrated**:
Lead will integrate the reviewed source and corresponding QA expectations
together after the actual independent delivery. Do not label the old full QA
file passing against this candidate yet.

The existing in-memory alias walk can be quadratic on reverse-ordered chains;
no archive-scale performance claim follows. Original records remain retained.
