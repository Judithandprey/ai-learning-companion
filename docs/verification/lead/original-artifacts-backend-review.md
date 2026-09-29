# OriginalArtifacts Backend bounded review

**Disposition: APPROVE integration of the internal persistence slice.** No
consequential code blocker found in this seven-file delta. This does not activate
HTTP uploads, control-backed artifact references, a stroke codec, capture or AI.

Reviewed `ce45657c9975a3a22db321833731458b51e6e9bc` against its parent
`0e036c21e5987ed833848655d6b1df5cf991027c`, then applied exactly that delta to an
isolated archive of main `cf722855d786a8b7b1fb3a17ae7ae467d8d70052`
(the continuation of assigned `5702bfd966562f77c2c44d20fd435e8c3dd1dd1c`).
Candidate: `/tmp/p0-original-artifacts-review-7savwgea`.
Main/worker source was not edited; the dirty QA plan was preserved.

## Findings

- `OriginalArtifacts` requires a callable trusted authorization guard. Put, read
  and identical replay execute current account authorization and exact source/
  snapshot checks inside the existing actor transaction. Source revocation and
  deletion remain effective; an ID alone does not grant another source's bytes.
  The embedding caller still authenticates the actor and supplies a real current
  guard. A test lambda is explicitly synthetic evidence, not authentication.
- The shared 0.2.2 validator checks closed shapes, immutable Python bytes, exact
  length/hash, kind/MIME and canonical base64. Put snapshots mutable request
  containers, preserves byte content, rejects legacy-ID adoption and uses the
  existing immutable artifact row. A receipt is returned only after transaction
  completion. Read validates authoritative binding and legacy aliases and returns
  detached content; corrupt typed storage fails closed.
- Typed note writes/replays/reads and capture ingest/replays/reads enforce exact
  source/version binding when accessing typed rows. Missing `original_binding`
  cannot silently downgrade residual typed metadata to legacy. Existing legacy
  metadata-read and legitimate shared-artifact semantics are preserved.
- Source deletion includes unreferenced typed uploads across versions. The
  transaction erases content and leaves ID-only tombstones; conflicts involving
  another source roll back rather than delete foreign evidence. The common
  `Archive._immutable` artifact fence also protects older ink, fixture-frame and
  preview write paths from restoring a deleted typed ID. Prior immutable ink IDs
  remain available for revisions until their source is explicitly deleted.
- No new store, migrations, dependencies, HTTP endpoints or contract edits.
  `ControlRegistry` still supplies `allow_artifact_references=False`. The existing
  legacy learning snapshot exporter does not export notes or these unreferenced
  typed originals; connecting Learning to authorized typed bytes remains a named
  later integration, as the delivery report states.

## Commands and results

The isolated candidate was created with `git archive cf722855...` and exactly
`git diff ce45657^ ce45657`, applied using `git apply --check -` then `git apply -`
inside `/tmp`. No branch merge was performed. All four source/English pairs match
`english-translation-manifest.json`; affected requirements/workflow content is
unchanged from the already reviewed `ae1f20b` baseline. Current workflow and
PONYTAIL LITE applied, preserving both §7.1 gates and the complete editing loop.

From the candidate directory:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider \
  services/api/tests/test_original_artifacts.py \
  services/api/tests/test_original_artifact_capture.py \
  -k 'current_auth_and_exact_source_version or source_delete_erases_pending or failed_transaction or matching_typed_capture or invalid_cross_source or lost_binding or legacy_note_metadata or legacy_raw_record'
```

**21 passed, 48 deselected in 0.25s.**

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/tmp/p0-original-artifacts-review-7savwgea \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/original-artifacts-independent-probes.py
```

**3 independent probe groups passed:** the guard runs inside the actor transaction
and request/receipt/read mutations cannot alter stored binding/bytes; legacy frame
import cannot restore tombstoned typed bytes and rolls back its tentative snapshot;
a legitimately shared legacy artifact survives deletion of only one source.

The complete delivery diff/evidence and relevant storage, note, capture, preview
and snapshot call paths were inspected. Owner-reported 479 tests and PostgreSQL
18.6 exit 0 remain owner evidence, not rerun results. No DB, network, provider,
preview/Paperclip, hosted build or device operation was performed. Physical ink
editing/reopening, production source ingress, real-provider receipt and full
screen/AI acceptance remain outside this internal persistence review.
