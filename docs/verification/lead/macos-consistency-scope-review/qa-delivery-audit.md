# QA Mac scope retest audit

**APPROVE** `5793e6990c7639d7b640cdb24b674dd1fba5a0d6`, parent merge `271bdf768e915113fa176ecc4eaff06f80df3a74`, against current-main baseline `4ae177ad8c29434ed8b2986bf00a739207332ef0`. No blocker. This is a read-only assertion/provenance audit; **zero tests or probes were run**. Lead can integrate reviewed Backend `17262c8f441bbd716f290c19efcb1a17576711b9` and this QA delivery, then run the 44-case file once.

Exact six-file export: `/tmp/qa-macos-579-review-y1d97q_q`. File names/hashes, source comparisons and audit details are retained in `/tmp/qa-macos-579-review.json`. No main/worker files were modified; no DB/native/provider/listener or other campaign was invoked.

The delivery contains the updated `tests/e2e/test_p0_13_macos_ingress_qa.py`, `docs/verification/qa/p0-13-macos-scope-retest-17262c8.md` and its four evidence files: `pytest-verbose.txt`, `regression-sensitivity.txt`, `future-clock.txt`, `attribution-probe.txt`. The QA `services/` and `packages/` trees exactly equal approved Backend 17262c8. The historical 576c62c report/evidence are unchanged from the assigned current main, including the clarified record-ACK wording and original executed failure-scope case ID.

Static AST comparison confirms all **15 common top-level functions**, plus imports, globals, classes and parameter tables, remain unchanged. Two old test functions covering three parameterized case IDs are deliberately replaced; two new functions add three cases. The existing 16 current-fence cases, selected-image/account/source final-reread refusals, fresh alias-conflict controls, ordered replay and six cancellation/late-failure cases are untouched.

The changed assertions preserve the valid integrity boundaries:

- Later raw/Windows contradictions still refuse whole-chain cached success, affected f6, both f6 image roles, mixed reads and mixed Learning. Exact error/no-write checks remain. Unrelated f2 now resolves both roles to exact fixture bytes and its selected gap/history packet succeeds.
- The scope case creates a genuine cross-source same-hash contradiction through the ordinary raw route. Parentless gaps and a gap with an unaffected framed parent succeed; direct and gap-chain descendants of affected f6 receive exact 503/no-write refusals. Original artifact rows remain equal without deleting either source. Lone-gap reading explicitly preserves existing external-parent semantics.
- The new native-path case is discriminating: it removes foreign-source ink with `ink=False`, expects exact `409 record_conflict` for the same native session, and succeeds when only that session identity changes. Thus the recorded initial `original_source_conflict` fixture error cannot satisfy the final test.
- The new final-reread positive control injects an unrelated ordinary raw contradiction between image resolution and the final metadata reread. Its packet remains attached; the existing selected-image and authority-change refusals are unchanged.

The attribution receipt includes the small scratch source and printed results: both corresponding conflict-free child gaps return 200 and r6 reads normally. Its successful sequential children use different sequence slots (10/11), whereas the two refusal probes can safely reuse slot 10 because neither commits. This supports causal attribution rather than rejection for an already occupied slot.

The retained verbose log contains **44 unique PASS case entries**. Test SHA-256 `527694b75078b33b96b68cb0ea0ec25cd1ab7f0a6d0c45d56e8690a604f85ea0` and helper SHA-256 `fbf9acb64ca30123ab590f6a4e0d22ac73f292a13490dd667f427953f2783d93` match exact Git bytes and all three execution logs. Sensitivity records exactly four changed-scope failures plus 40 passes at pre-correction `0c08415`, and 44 passes at 17262c8; future-clock evidence reports 44 passes. These are QA-reported executions audited here, not a second execution. No duration or unrecorded mutation result is inferred.

PONYTAIL LITE keeps this review to the delivered delta and existing evidence. Reported MemoryStore/ASGI and synthetic-input limits are accurate; native Mac, PostgreSQL durability, provider receipt and desktop product gates remain outside this result. The report does not claim to repeat Backend alias permutations or the earlier mutation/native/DB campaigns.
