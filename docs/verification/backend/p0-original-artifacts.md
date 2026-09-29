# P0-04/P0-09 source-bound original bytes

2026-09-29. Backend delivery for lead task `handoff_f381823a98c26cef258ab7da0773bf26`
and additive boundary `handoff_5850d2a43787fe33d0d0edb866ecd92d`.
Started clean at `40aac5c`; preserved branch history and normally merged assigned
`1cbc38f`, then lead content `4626833` and provenance correction `e5bb658`.
Implementation parent is `0e036c21e5987ed833848655d6b1df5cf991027c`.
Refreshed the exact later release `ae1f20b7bf90cc52d2243942f5713e074ab3a5b3`
requirements §7.1, decisions and task changes without discarding work.
Relevant original/English R08/R46/R51/R52/R59 and original-goal clauses were reviewed;
the four translation/source manifest pairs match. Both core screen/AI gates stay unmet.

## Callable and integration

`services.api.original_artifacts.OriginalArtifacts(store, authorization_guard)`
requires a trusted callable current-caller guard, like existing internal services.
The embedding caller supplies its authenticated actor; the guard executes inside
the same actor transaction as current account/source/version checks.

- `put(user_id, source, kind, reference, original_bytes)` accepts exact immutable
  Python `bytes`, a `SourceRef`, `ArtifactReference`, and `screen_image` or
  `editable_ink`. Uses shared 0.2.2 `validate_bytes`. Returns the exact binding plus
  `status=bytes_committed` only after the transaction exits successfully.
- `read(user_id, source, artifact_id)` reauthorizes the exact source/version and
  returns `OriginalArtifactUpload`: binding plus canonical `data_base64`, checked
  using shared `decode_upload`. Knowledge of an ID alone does not grant access.
- PNG/JPEG and declared JSON originals use the shared 32 MiB engineering ceiling.
  Integrity validation does not decode images or establish a working ink codec.
  Original JSON whitespace, numbers and all bytes remain untouched.

The existing immutable `artifact` row contains the bytes and `original_binding`;
legacy `ink/frame` aliases remain for current consumers. No new archive, identity,
dependency or migration is needed. Existing 0001/0002 storage and immutability
rules suffice. One small `original_artifact_tombstone` document retains only the
artifact ID after deletion; it prevents old writers from restoring deleted data.

Identical replay succeeds after current authorization; changed binding, source,
version, MIME, hash, length or bytes conflicts. New typed IDs cannot adopt older
blobs or dangling frame/note/capture references: **put typed bytes before creating
references**. Existing legacy sharing retains its prior behavior.
New typed note/capture references enforce the exact source/version, including note
replay and reads. Erase/undo/corrections use separate immutable artifact IDs;
note CAS/history keeps prior originals. Source deletion also finds unreferenced
uploads, erases their bytes, and fences typed and legacy writers in one transaction.
Unexpected cross-source references fail deletion atomically in either direction.

Rollout is internal only. `ControlRegistry.allow_artifact_references=False`,
existing public routes, v1 0.1.0, capture 0.2.0 and control 0.2.1 are unchanged.
Lead owns any later transport/producer activation and compatibility review.
To withdraw this internal capability, stop invoking it; do not remove stored
originals or their deletion fences. Downgrading to code without these guards is
unsafe once typed originals exist. No destructive rollback migration is supplied.

## Checks and actual operation

Installed project Python was used without dependency changes:

```sh
python -m pytest -q \
  services/api/tests/test_archive.py services/api/tests/test_http.py \
  services/api/tests/test_preview.py services/api/tests/test_preview_http.py \
  services/api/tests/test_learning_snapshot.py services/api/tests/test_source_deletion.py \
  services/api/tests/test_capture.py services/api/tests/test_control.py \
  services/api/tests/test_original_artifact_capture.py services/api/tests/test_original_artifacts.py \
  packages/contracts/tests/test_original_artifact.py
```

Final result: **479 passed in 3.11s**, including explicit note revision
erase/undo-original history and legacy metadata-read compatibility.
The test byte documents represent opaque original snapshots; these are not UI
erase/undo or physical Pencil acceptance.

Independent read-only review reproduced a single-field corruption defect:
removing `original_binding` originally let capture treat typed bytes as legacy
and let unreferenced bytes escape source deletion. The common recognizer now
rejects residual typed metadata without its binding. The added regression checks
read, cross-source capture and deletion all fail with unchanged storage.
Review also narrowed note/capture metadata-read guards to typed rows so that
legacy metadata reads do not newly depend on byte availability/integrity. Such
metadata is not a typed byte receipt; missing typed bytes still fail protected
`OriginalArtifacts.read`. Two regression cases preserve that distinction.

Real PostgreSQL command, with `LC_TEST_DATABASE_URL` injected privately from the
operator handoff, never printed or committed:

```sh
python -m services.api.tests.postgres_original_artifact_check
```

Result: **exit 0**, PostgreSQL **18.6**, seven behavior groups plus cleanup passed:

1. Fresh independent `PostgresStore` reconstructs exact image/ink bytes and both
   source versions; wrong-version read rejects.
2. Concurrent equal puts on separate connections commit one original and return
   identical committed receipts.
3. Concurrent different bytes under one ID yield one commit/one immutable conflict.
4. Injected failure after INSERT rolls back with no receipt/residue; retry succeeds.
5. Caller-expiry callback, account revocation and source revocation block read/replay.
6. Deletion erases unreferenced uploads across versions, leaves ID-only fences,
   and preserves the other source's original.
7. Typed reuse and legacy ink/frame imports cannot resurrect deleted IDs; the
   failed fixture import also rolls back its snapshot.

Only verified dedicated `lc_p0_test` and one unique synthetic actor were used.
The runner reused existing isolation/cleanup helpers and migrations, then removed
that actor. No API service or database lifecycle operation was started. This is
real database persistence through fresh connections, not an HTTP-process restart
campaign. Completed prior DB/HTTP campaigns were not repeated.

## Remaining dependencies

Lead must release a trusted production source/frame/producer ingress before public
upload or capture activation. URL registration is not source ingestion; existing
`import_fixture` remains synthetic-only. Web/native owners still need a versioned
stroke/geometry codec and actual save/reopen/edit behavior. Learning must consume
authorized bytes through its evidence resolver; real provider input and outcome
remain separate. Continuous full-display AI, original-screen cross-app pen,
device/signing, audio, Notability import and full P1 acceptance are unverified here.
The user preview database/services and Paperclip were untouched.
