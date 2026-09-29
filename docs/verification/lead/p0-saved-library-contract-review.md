# Saved-library additive contract review

Decision: **APPROVE** the reviewed uncommitted addition over
`5218096e83b71da52864e44a226763446d69bba8`. No contract integration blocker found.
Reviewed exactly the eight delegated preview/schema/generator/generated/example/
README/test files. Their exact SHA-256 snapshot is preserved at
`/tmp/library-contract-review-dun__hxr/reviewed-files.json`; none changed between
snapshot and final check. No main/worker file was edited.

## Compatibility and specification

- Source schema retains all eight previous definitions unchanged; emitted schema
  retains all 23 previous definitions unchanged. Exactly four definitions are
  added: LibraryCursor, SavedLibraryQuery, SavedLibraryItem and SavedLibrary.
- All four previously emitted OpenAPI operations, schemas and authentication
  schemes remain identical. GET /preview/v1/saves correctly uses read scope,
  optional bounded limit with default 20 and the rewritten LibraryCursor component
  reference. Existing POST save/idempotency and explicit-ID read remain intact.
- TypeScript is the exact previous emitted text plus four additive exports; the
  query fields are optional and next_cursor is required string-or-null.
- New objects are closed, items/cursors/metadata are bounded, source versions are
  positive safe integers, timestamps reuse the existing UTC format, and the generic
  validator still rejects bool versions, nonfinite values, NUL and invalid Unicode.
- README clearly specifies descending creation instant/note-ID ordering, position
  cursors that survive deletion of the anchor, live authorization on every page,
  invalid retained metadata as unavailable, no silent empty/partial archive, and
  explicit old-server discovery-unavailable handling. Page limits are not history
  retention limits. Full originals stay behind the existing explicit reopen path.

No additional contract layer is needed. Query-string parsing (including repeated
keys), opaque cursor decoding, per-actor/per-source permission, unique ordered rows,
strict cursor progress, no repeated/skipped equal-time notes, and invalid retained
metadata behavior remain Backend runtime obligations. Structural schema validation
alone does not establish those dynamic properties. Web still needs actual paging,
unavailable/error presentation and exact-note reopen acceptance; neither owner was
reimplemented or reviewed here.

## Focused evidence

Refreshed complete original/English R17/R27–32/A09–12 and
V-ArchiveCompanionContinuity plus current task/workflow; all eight translation
manifest hashes match. Scope remains bounded desktop continuity, not complete
original-goal, long-term memory, cross-device or native acceptance.

Isolated candidate `/tmp/library-contract-review-dun__hxr` was built from
`git archive 5218096e83b71da52864e44a226763446d69bba8 packages/contracts pyproject.toml`
plus copies of exactly the eight uncommitted changed files. Commands from it:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider packages/contracts/tests/test_document_preview.py -k 'library or generated_wire'
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/library-contract-compatibility-probe.py /tmp/library-contract-review-dun__hxr
```

- **22 passed, 69 deselected in 0.75s**: new library cases plus emitted artifact
  equality, schema/OpenAPI validation and examples. Did not repeat the full 91.
- Independent compatibility probe verifies exact old definitions/operations/types,
  repaired default/reference, and six rejected numeric/UTF-8/date mutations plus
  a valid maximum source-version/512-character-cursor case.

No provider, DB, browser, hosted trial, network or owner-runtime access. No claims
about implementation, durable paging or end-to-end saved-library usability yet.
