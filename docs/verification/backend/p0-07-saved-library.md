# Saved-library discovery: bounded backend checkpoint

2026-09-29 UTC; owner backend, `team/backend`. Assignment
`handoff_f85aba644088c60b0512b7fe36c8aced`, exact wire release
`handoff_d8129188ce990fd73e4b7b5e128f59e8`. Priority update
`handoff_c5a0fe663e7125070ee857f3d8ce164f` requests this nearest tested/committed
checkpoint, then no library/search/polish expansion while the lead coordinates
actual learning-screen entry and visual capture.

## Delivered behavior

Authenticated `GET /preview/v1/saves` discovers the caller's persisted preview
notes without browser-local note IDs. It returns only the six formal summary
fields, ordered by actual UTC creation instant descending then note ID descending.
Default page size is 20, maximum 50. Opaque account-bound cursors carry a position,
so deletion of an earlier page's anchor does not prevent continuation or duplicate
items. The normal exact-ID read still returns the original saved source/context.

Every page rechecks the current token, account generation and device/session
membership under the same actor transaction. Deleted/revoked sources and notes
are hidden. Original read validation catches inconsistent or missing retained
records; no partial list is returned. Existing durable save receipts additionally
detect missing saved-link metadata. Listing never rewrites originals, calls a
provider, starts capture, or creates another identity/archive/index.

Only `services/api/preview.py`, `preview_app.py`, focused module tests and this
evidence changed. No schema/dependency/migration edits. Lead's additive
`document-preview.0.1.0` contract is exactly
`06aa07f75b83497ef6ddbdd7f79087e57329cd21`. Baseline
`5218096e83b71da52864e44a226763446d69bba8` merged normally at `6a2a56a`; formal
wire merged at `a9daaa6`, preserving all API edits. Workflow/current decisions,
affected original/English R17/R27–32/A09–12 and V-ArchiveCompanionContinuity were
read; all eight translation-manifest content hashes matched. PONYTAIL LITE reused
the existing transaction, exact read and replay receipts, with no new dependency.

## Actual verification

Final focused command using the installed lead environment read-only:

```sh
python -m pytest -q services/api/tests/test_preview_library.py services/api/tests/test_preview_library_http.py services/api/tests/test_preview.py services/api/tests/test_preview_http.py packages/contracts/tests/test_document_preview.py
python -m packages.contracts.document_preview.generate --check
git diff --check
```

**273 passed in 4.22s** (46 library domain, 43 library HTTP, 60 existing preview
domain, 33 existing preview HTTP, 91 formal wire). Generated check/diff check pass.
An independent bounded reviewer examined authorization, cursor/filter behavior
and both corruption fixes without changing code. Tests cover isolated actors,
expiry while waiting for the actor transaction, revocation, malformed/unknown/
duplicate query fields, equivalent fractional UTC times, tied ordering, changed
page sizes, 52 saved notes beyond one maximum page, deleted cursor anchors, newer
insertions, exact reopen, unchanged originals and corrupted off-page records.

Two actual pre-fix failures were retained as regressions:

- `test_missing_saved_link_is_not_a_successful_empty_archive`: deleting only
  `preview_save` while its original note/commit receipt survived returned an empty
  success. The test failed with `DID NOT RAISE DomainError`. Receipt inventory now
  returns 503 instead of inventing an empty archive.
- `test_valid_but_contradictory_creation_time_is_corruption`: a valid-looking
  altered creation timestamp contradicted the immutable observation's receipt
  time but was listed. It likewise failed before the equality guard; now returns
  503. Normal later note revisions still reopen/list the original saved revision.

One **new focused** PostgreSQL check, not the old recovery campaign:

```sh
python -m services.api.tests.postgres_library_check
```

Actual exit 0 on dedicated `lc_p0_test`, PostgreSQL 18.6. The private DSN was loaded
without printing or committing it, through normal exact-command approval. The
runner verifies the configured and actual database, writes three unique-actor
preview originals, then a fresh supervised loopback API process discovers them
without local note IDs. It reopens every returned item, compares original-record
inventory, continues after deleting the anchor source, hides newly revoked source
metadata and rejects revoked account access with 403. Its one API child exited
and unique test actor cleanup succeeded. Existing migrations were used as-is;
no migration, database/service restart or other acceptance campaign was run.

No access to `lc_desktop_preview`, Paperclip, user-preview tokens/identities,
exports or services occurred. No browser or device was operated by this task.

## Next action and limits

Consumers use `GET /preview/v1/saves?limit=20`, then pass the exact `next_cursor`
with URL encoding. Null means no more eligible records at that read. Refresh to
see newer saves; this is a live authorized view, not a multi-request snapshot.
An old server's 404/405 means discovery unavailable, never an empty archive.

The current implementation scans and validates the actor's live saved originals
on each page. There is no whole-archive retention/discovery cap; large-history
latency and capacity are unmeasured. A storage-side paging optimization is not
part of this checkpoint. No new library/search/polish work is pending here.

Lead owns integration and the current learning-screen priority; Web consumes the
released wire if needed. Await a concrete same-archive capture dependency rather
than creating a second backend implementation. This desktop discovery checkpoint
does not pass full A09–12, V-ArchiveCompanionContinuity, actual Safari/iPad visual
capture, editable original-screen ink, provider/device acceptance or P1.
