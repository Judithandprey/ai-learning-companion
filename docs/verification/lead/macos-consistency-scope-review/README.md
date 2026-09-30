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
Actual QA delivery **`5793e6990c7639d7b640cdb24b674dd1fba5a0d6`** arrived as
`handoff_20733bf9e00c9bb699da23e45f4baba1`. Its exact candidate services/packages
match Backend; historical report/evidence is unchanged. QA replaces only the
three obsolete scope IDs, preserves meaningful refusal assertions and adds
native-session/path and final-reread controls. The [independent QA report](../../qa/p0-13-macos-scope-retest-17262c8.md)
records **44/44**, exact pre-fix sensitivity (four changed cases fail), future
clock and non-vacuous ancestor attribution. These are QA-reported candidate
checks, separate from Lead's integrated execution. The [independent delivery
audit](qa-delivery-audit.json) verifies the six delivered files, all 44 unique
PASS entries, preserved common assertions, exact execution hashes and meaningful
positive/negative controls; it ran no tests again.

Backend and QA integrate together as **`b262755` / `0fb4385`**. Integrated API,
Learning and contract trees equal the reviewed source; the QA test equals the
reviewed delivery. Lead ran the complete changed QA file once: **44 passed in
6.89 seconds**, with no xfail/skip. [Actual execution](integrated-qa-tests.txt),
[exact-source comparison](integrated-source-check.json). Earlier 264 author-path
checks and seven independent probes remain evidence; they were not repeated.

**QA-MAC-01 is closed for this demonstrated scope.** Related retained damage,
whole-chain replay/mixed selection, transitive dependencies and current fences
still refuse. The three old scope expectations remain preserved in their
historical exact-baseline report; they are not falsely claimed passing against
the correction. Malformed retained data remains globally fail-closed. The
`503 retryable:true` classification does not promise automatic repair or authorize
deleting originals. No repair API or provider path is introduced.

The existing in-memory alias walk can be quadratic on reverse-ordered chains;
no archive-scale performance claim follows. Original records remain retained.


## Next owner/action

The current Windows owner continues its existing parent/control/upload task and
the two concrete Windows hosted portability failures. The native owner continues
its existing immutable frame-bound editable-original task. QA's next executable
behavior pass requires a reviewed client candidate; no duplicate API campaign,
DB/native replay or acknowledgment loop is assigned. Lead reviews those actual
deliveries and releases exact candidates. Both desktop core gates, real provider
and interactive Mac remain open.
