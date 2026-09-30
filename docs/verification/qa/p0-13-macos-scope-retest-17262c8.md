# QA-MAC-01 changed-case retest at Backend candidate `17262c8`

- **Assignment:** lead `handoff_bc0c64755d0cad3439ecd7533d775868`, releasing the conditional retest
  `handoff_1ef0062c0533e8cd7059b7905874fdd3`.
- **Candidate:** exact reviewed Backend candidate `17262c8f441bbd716f290c19efcb1a17576711b9`, "Scope Mac image
  consistency to selected frames and ancestors". Its parent is `daacde7`, a merge of the published `0c08415`. It is not
  yet on main.
- **QA branch:** `team/qa` merged the candidate normally as `271bdf7`. `services/` and `packages/` are identical to
  `17262c8`. The add/add conflict on the historical 576c62c report was resolved to the lead's clarified wording ("one
  record ACK with zero artifact receipts").
- **Decision: PASS.** The QA-MAC-01 scope is narrowed as the lead decided, and every integrity refusal is kept.
  - The updated file passes **44/44**.
  - The pre-correction baseline `0c08415` fails exactly the 4 changed-scope cases.
- **History preserved:** the [576c62c report](p0-13-macos-ingress-576c62c.md) and its evidence are unchanged. That
  includes the executed historical observation `test_observation_mac_withholding_scope_qa_mac_01`, which is in its
  `pytest-verbose.txt`.
- **Test:** [tests/e2e/test_p0_13_macos_ingress_qa.py](../../../tests/e2e/test_p0_13_macos_ingress_qa.py), sha256
  `527694b7…5ea0` (was `dcdf901c…4fee` at `4fd6b28`).
- **Evidence** in [p0-13-macos-scope-retest-17262c8/](p0-13-macos-scope-retest-17262c8/): `pytest-verbose.txt`,
  `regression-sensitivity.txt`, `future-clock.txt`, `attribution-probe.txt`.

## What changed in the QA file

**Three intentionally obsolete case IDs were replaced.** Every still-valid assertion is kept.

| Old ID (576c62c expectation) | New ID | Kept | Changed or added |
| --- | --- | --- | --- |
| `test_later_old_family_contradiction_withholds_mac_replay_read_and_resolve[raw/windows]` | `test_later_old_family_contradiction_withholds_the_affected_mac_frame_only[raw/windows]` | The older route accepts the contradiction and keeps its record. Whole-chain exact replay is 503 with no write. `read_macos` of the chain is 503. Both roles of affected f6 are `unavailable`. Learning on the chain is 503. No writes | `read_macos` of `[r6]` and of the mixed `[r2, r6]` is also 503. The unrelated `[gap, r2]` now reads exactly, resolves both roles with exact bytes, and prepares a packet |
| `test_observation_mac_withholding_scope_qa_mac_01` | `test_qa_mac_01_withholding_is_limited_to_affected_images_and_dependencies` | The second-source same-hash alias contradiction goes through the raw route; the older routes keep accepting | See below |

**New cases:**
- `test_mac_native_session_path_identity_is_checked_across_sources[same/other]`;
- `test_learning_final_reread_ignores_an_unrelated_new_contradiction`.

All other cases are unchanged: closure, gap-first, chain, Learning, the three final-reread refusals, replay, 16
fences, 8 new-contradiction 409/control cases, and 6 late-failure/cancellation cases.

## Results at 17262c8 (44/44)

A second source declares a same-hash alias of Mac composed-6 at width 201 through the ordinary raw route. The Mac data
is on source 1.

- **Unrelated operations succeed, and no source is deleted:**
  - `read_macos([gap, r2])` is exact;
  - `resolve_macos(f2)` returns the exact raw bytes;
  - Learning on `[r2]` attaches the composed image;
  - a new parentless gap is admitted and its exact replay returns the same ACK;
  - a gap whose framed parent is the unaffected `r2` is admitted.
- **Affected operations still refuse, atomically and without writes:**
  - `read_macos([r6])` and the mixed `[r2, r6]` give 503;
  - both roles of f6 are `unavailable`, including its uncontested raw image (the complete frame);
  - mixed Learning raises;
  - a new gap whose parent is `r6` (direct ancestor) is 503;
  - a new gap whose parent is a gap whose parent is `r6` (gap chain) is 503.
- **Attribution:** without the contradiction, the same two child gaps are accepted and `r6` reads normally
  (`attribution-probe.txt`).
- **Read semantics:** a read selection keeps its external-parent semantics. The lone gap `[gap-mid]` is returned, and
  its parent `r6` is not fetched.
- **Originals:** every original row is byte-identical before and after. Nothing is deleted or rewritten.
- **No Mac data at all:** an ordinary raw/raw disagreement no longer refuses the actor's first parentless Mac gap
  (200; it was 503 at 576c62c).
- **Native session/path identity across sources:** a new Mac frame on source 2 names frame 2's `frames/00000002.png`
  in the same native session with other bytes: 409 `record_conflict`, no write. The same path in a different native
  session is accepted.
  - While building this case, QA found its first draft was vacuous: a 409 `original_source_conflict` from a
    cross-source ink reference. It was fixed, and the discriminating pair is verified.
- **Final Learning reread:** a contradiction introduced between resolution and the final reread that concerns only an
  image outside the selection no longer withholds the packet. Selected-image changes still withhold it (the three
  existing cases).
- **Unchanged cases:** current fences, final-reread refusals, no-write refusals, the 409 alias and native
  contradictions, and atomic late failure/cancellation all pass as before.

## Sensitivity

`regression-sensitivity.txt` runs the updated file on exact archives:
- `0c08415` (published, before the correction) fails exactly 4 cases:
  - `…withholds_the_affected_mac_frame_only[raw]` and `[windows]`;
  - `test_qa_mac_01_withholding_is_limited_to_affected_images_and_dependencies`;
  - `test_learning_final_reread_ignores_an_unrelated_new_contradiction`.
- `17262c8` passes 44.

The future wall-clock run passes 44.

## Limits

- **Evidence level:** MemoryStore and ASGI with synthetic Swift buffers and QA-synthetic identities and ink. No
  native Mac, DB, listener, provider or screen-to-AI gate.
- **Not rerun:** the mutation, native and DB campaigns and the full owner suites, as instructed. The lead's 264
  affected checks and the independent review are component evidence, not counted here.
- **Retryable flag:** the released `503 unavailable, retryable:true` stays a dependency-repair classification; no
  non-destructive administrative repair API exists.
- **Alias chains:** QA did not re-derive the Backend's scan-order and transitive-alias permutations (six in the lead's
  review). QA covers one direct cross-source alias and one gap chain.

## Reproduce

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -v tests/e2e/test_p0_13_macos_ingress_qa.py
```
