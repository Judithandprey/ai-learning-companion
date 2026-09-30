# Windows frame-bound editable originals — review hold

Candidate `46dbb9023768d7d738b84ffca4d8f8c725b02953`, parent `f277362b5f13a0681a6cd9e5ea5f04e67b05ed86`; API/contracts/Learning baseline `6036026da8de99f8e1737cbed51a18c9cdd4179e`. Original review held the candidate; reviewed correction and integration are recorded below. R08/R46/R51/R52/R59, A26/A30/A31/A44; full per-OS core gates remain open.

Two independent source reviews require a bounded Web correction:

- [Core](core-review.md): an existing content-addressed ink file is reused based only on existence. Actual changed bytes or a directory at that address receive a false retained-original acknowledgement. Preserve unexpected files and fail honestly instead. The unchanged control passes.
- [Mapper](mapper-review.md): contradictory retained-plus-refused metadata silently drops the refusal. Reject malformed union shapes. This is a malformed-input boundary failure, not normal healthy-writer output.

One consolidated correction was actually accepted through the native Web route as `handoff_471d4245b1866d3179ac41903d7d8d8b`, replying to delivery `handoff_e733164cba7a58884effaa8be2e8250e`. Acceptance was unread/execution_started=false at send; it is not a claim of owner start or closure. Scope remains apps/windows and Web evidence; QA retains the display and its existing current/next assignments. No native run or provider/bootstrap is added.

## Passed, bounded evidence

The core review directly ran 11 new ink, 13 lifecycle and 5 Stop cases; the mapper review ran 23 named cases and all three fixture checks. An independent delayed-hash/Open control preserves the exact pre-await document, the next sample uses the reopened document, and Stop follows both writes. [Artifact audit](artifact-audit.json) binds four records to three actual immutable JSON originals at revisions 0,1,1,5. Old body bytes remain unchanged.

Lead's [composition probe](composition-probe.py) used the exact 13,015-byte producer request through actual in-process HTTP, archive readers and Learning. It verified actual PNG/JSON PUT and byte-exact GET, fresh ACK, no-write replay, same-MemoryStore app-factory recreation with token rotation, historical read after Stop, stopped submit refusal and revocation withholding. [Result](composition-results.json) retains source hashes and receipts. This is not a PostgreSQL/process restart or native run. Non-frame editable originals stay separately retained/referenced; the Learning packet does not claim to render them.

The fixture uses real modules with fake Electron/canvas boundaries: its fake stroke function does not draw and raw/composed PNGs are byte-identical within each frame. The declared pixel digest is synthetic rather than the decoded PNG digest. Therefore this proves exact byte retention, version binding and service composition, **not physical capture/rendering, meaningful visual changes or provider receipt**. Native placeholder ink remains unavailable; no substitute bytes were invented.

## Reproduction

Reports/probes/logs are frozen verbatim from /tmp. Recreate the named /tmp exports from the exact candidate Git archive before rerunning their absolute imports; the probes mutate only harness-owned temporary data. The Open probe also uses the included helper copied to its recorded /tmp name. Failure probes assert the original faulty behavior and are not release tests. The composition probe accepts explicit backend/fixture roots and verifies their exact Git blobs before use. Its fixture generator only regenerates request bytes in memory; it does not regenerate or overwrite captures.

Next: Web supplies the narrow correction; Lead compares the same failures and passing controls, integrates only approved source, then schedules appropriate changed-path QA after its already assigned work. Existing hosted/native/provider evidence is neither replayed nor promoted.

## Corrected integration

Web delivered `e7bdbde46e7cb7f8f744a0407085b747eb2bc359` as `handoff_0f18a1745d460ac115275cac7362fb31`. Independent correction review approves the changed source: existing ink and PNG addresses must be regular files of the exact length/hash; mismatches are refused and left untouched, transient reads/writes remain retryable. Mapper union shapes are now exact and disjoint. Original failures are retained above.

Base/correction integrate as `4ef4d44`/`bdab30d`. Main build and **101 named tests passed in4.07s** with no skip/xfail. Independent focused review additionally reports41 named changed-path cases,7 actual-main/filesystem groups and15 mapper boundary cases, including ENOTDIR retry/recovery, raw/composed alias at exact byte cap and EACCES retry. These checks overlap; counts are not additive coverage. Full [correction review](correction-review.md), independent probes/results and logs are retained alongside the original failures.

The committed producer fixture bytes are unchanged from46dbb90, and API/Learning plus all previously released contract implementation bytes are unchanged from the actual composition baseline6036026 (only the separate new Mac family/root documentation is added). Therefore the exact fixture-to-service result above remains applicable; no redundant service campaign was run. This source correction does not close independent native QA or either full core gate. QA keeps its currently assigned display task and one next receipt retest; no third task is dispatched. Lead will run the existing Windows build/package workflow on the published exact source.
