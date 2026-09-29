"""Focused PostgreSQL acceptance for source-bound original bytes, contract 0.2.2.

Run: python -m services.api.tests.postgres_original_artifact_check
Requires private LC_TEST_DATABASE_URL for the already migrated local lc_p0_test.
Uses one unique synthetic actor; no HTTP, migration, service or provider action.
Byte preservation does not prove image decoding, an editable codec or live capture.
"""

import base64
from contextlib import contextmanager
from copy import deepcopy
import hashlib
import os
import sys
from uuid import uuid4

from packages.contracts.original_artifact import decode_upload, validate_receipt
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import (
    _fixture, _race, cleanup, dedicated_test_dsn, verify_test_database,
)


def _binding(source, artifact_id, data, kind="editable_ink"):
    return {"contract_version": "0.2.2", "source": deepcopy(source), "kind": kind,
            "artifact": {"artifact_id": artifact_id, "sha256": hashlib.sha256(data).hexdigest(),
                         "byte_length": len(data),
                         "media_type": "application/json" if kind == "editable_ink" else "image/png"}}


def _put(api, actor, binding, data):
    receipt = api.put(actor, binding["source"], binding["kind"], binding["artifact"], data)
    validate_receipt(binding, receipt)
    assert receipt == {**binding, "status": "bytes_committed"}
    return receipt


def _read(api, actor, binding, data):
    upload = api.read(actor, binding["source"], binding["artifact"]["artifact_id"])
    assert upload == {**binding, "data_base64": base64.b64encode(data).decode("ascii")}
    assert decode_upload(upload, user_id=actor) == data
    return upload


def _reject(status, code, operation):
    try:
        operation()
    except DomainError as exc:
        assert (exc.status, exc.code) == (status, code)
    else:
        raise AssertionError("original artifact operation unexpectedly succeeded")


class _InjectedWriteFailure(RuntimeError):
    pass


class _FailingPutStore(PostgresStore):
    @contextmanager
    def transaction(self, user_id):
        with super().transaction(user_id) as tx:
            put = tx.put

            def fail_after_put(kind, record_key, payload):
                put(kind, record_key, payload)
                if kind == "artifact":
                    raise _InjectedWriteFailure()

            tx.put = fail_after_put
            yield tx


def run_original_artifact_checks(dsn, actor):
    store = PostgresStore(dsn)
    archive, core = _fixture(store, actor)
    # Explicit synthetic caller only; this does not test HTTP/token authentication.
    guard = lambda state: None
    originals = OriginalArtifacts(store, authorization_guard=guard)
    source = {name: core["SourceSnapshot"][name]
              for name in ("user_id", "source_id", "source_version")}
    ink_before = '{ "strokes": [[0, 1.00]], "label": "原稿\\u0000" }\n'.encode()
    ink_after = b'{"strokes": [], "operation": "erase"}\n'
    image_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=")
    ink = _binding(source, "ink-before", ink_before)
    image = _binding(source, "original-image", image_bytes, "screen_image")
    _put(originals, actor, ink, ink_before)
    _put(originals, actor, image, image_bytes)

    with store.transaction(actor) as tx:
        legacy_bytes = base64.b64decode(tx.get("artifact", core["Frame"]["artifact_id"])["data_base64"])
    second_snapshot, second_frame = deepcopy(core["SourceSnapshot"]), deepcopy(core["Frame"])
    second_snapshot["source_version"] = 2
    second_frame.update(source_version=2, frame_id="frame-version-2", artifact_id="fixture-version-2")
    archive.import_fixture(actor, second_snapshot, second_frame, legacy_bytes)
    edited = _binding({**source, "source_version": 2}, "ink-after", ink_after)
    _put(originals, actor, edited, ink_after)

    fresh = OriginalArtifacts(PostgresStore(dsn), authorization_guard=guard)
    for binding, data in ((ink, ink_before), (image, image_bytes), (edited, ink_after)):
        _read(fresh, actor, binding, data)
    assert Archive(PostgresStore(dsn)).get_snapshot(actor, source["source_id"], 1) == core["SourceSnapshot"]
    assert Archive(PostgresStore(dsn)).get_snapshot(actor, source["source_id"], 2) == second_snapshot
    _reject(409, "original_source_conflict",
            lambda: fresh.read(actor, edited["source"], ink["artifact"]["artifact_id"]))
    evidence = ["fresh PostgresStore reconstructs exact image/ink bytes and both source versions; wrong-version read rejected"]

    replay = _binding(source, "concurrent-identical", ink_before)

    def equal_put():
        api = OriginalArtifacts(PostgresStore(dsn), authorization_guard=guard)
        return _put(api, actor, replay, ink_before)

    assert _race(equal_put, equal_put) == [{**replay, "status": "bytes_committed"}] * 2
    with store.transaction(actor) as tx:
        assert len([row for row in tx.scan("artifact") if row["id"] == "concurrent-identical"]) == 1
    _read(fresh, actor, replay, ink_before)
    evidence.append("concurrent identical puts on independent connections return exact committed receipts and one original")

    alternatives = [(data, _binding(source, "concurrent-conflict", data)) for data in (ink_before, ink_after)]

    def changed_put(data, binding):
        api = OriginalArtifacts(PostgresStore(dsn), authorization_guard=guard)
        try:
            return "committed", _put(api, actor, binding, data), data
        except DomainError as exc:
            assert (exc.status, exc.code) == (409, "immutable_conflict")
            return "conflict", None, data

    raced = _race(lambda: changed_put(*alternatives[0]), lambda: changed_put(*alternatives[1]))
    assert sorted(row[0] for row in raced) == ["committed", "conflict"]
    winner = next(row for row in raced if row[0] == "committed")
    winner_binding = {name: winner[1][name] for name in ("contract_version", "source", "kind", "artifact")}
    _read(fresh, actor, winner_binding, winner[2])
    with store.transaction(actor) as tx:
        assert len([row for row in tx.scan("artifact") if row["id"] == "concurrent-conflict"]) == 1
    evidence.append("concurrent different bytes under one ID yield one commit/one immutable conflict; winner survives unchanged")

    rollback = _binding(source, "rolled-back-original", ink_before)
    failing = OriginalArtifacts(_FailingPutStore(dsn), authorization_guard=guard)
    try:
        _put(failing, actor, rollback, ink_before)
    except _InjectedWriteFailure:
        pass
    else:
        raise AssertionError("receipt escaped a failed original-byte transaction")
    with PostgresStore(dsn).transaction(actor) as tx:
        assert tx.get("artifact", "rolled-back-original") is None
        assert tx.get("original_artifact_tombstone", "rolled-back-original") is None
    _read(fresh, actor, ink, ink_before)
    _put(fresh, actor, rollback, ink_before)
    _read(fresh, actor, rollback, ink_before)
    evidence.append("injected failure after artifact INSERT rolls back without receipt or residue; retry commits exact bytes")

    def expired(state):
        raise DomainError(401, "identity_expired")

    expired_api = OriginalArtifacts(store, authorization_guard=expired)
    _reject(401, "identity_expired", lambda: _read(expired_api, actor, ink, ink_before))
    _reject(401, "identity_expired", lambda: _put(expired_api, actor, ink, ink_before))
    archive.set_authorization(actor, False)
    _reject(403, "authorization_revoked", lambda: _read(fresh, actor, ink, ink_before))
    _reject(403, "authorization_revoked", lambda: _put(fresh, actor, ink, ink_before))
    archive.set_authorization(actor, True)
    archive.revoke_source(actor, source["source_id"])
    _reject(403, "source_revoked", lambda: _read(fresh, actor, ink, ink_before))
    _reject(403, "source_revoked", lambda: _put(fresh, actor, ink, ink_before))
    evidence.append("fresh reads and identical replay recheck caller expiry, account revocation and source revocation")

    kept_snapshot, kept_frame = deepcopy(core["SourceSnapshot"]), deepcopy(core["Frame"])
    kept_snapshot.update(source_id="retained-source", original_url="https://example.invalid/retained",
                         canonical_url="https://example.invalid/retained")
    kept_frame.update(source_id="retained-source", frame_id="retained-frame", artifact_id="retained-fixture")
    archive.import_fixture(actor, kept_snapshot, kept_frame, legacy_bytes)
    kept_source = {name: kept_snapshot[name] for name in source}
    kept = _binding(kept_source, "retained-original", ink_before)
    _put(fresh, actor, kept, ink_before)
    with store.transaction(actor) as tx:
        deleted_ids = {row["id"] for row in tx.scan("artifact")
                       if row.get("original_binding", {}).get("source", {}).get("source_id") == source["source_id"]}
        # These uploads have no frame/note/capture references yet: pending use
        # still belongs to the source and must participate in source deletion.
        assert deleted_ids and not any(row["artifact_id"] in deleted_ids for row in tx.scan("frame"))
        assert tx.scan("note_revision") == [] and tx.scan("capture_record") == []
    archive.delete_source(actor, source["source_id"])
    archive.delete_source(actor, source["source_id"])
    with PostgresStore(dsn).transaction(actor) as tx:
        for artifact_id in deleted_ids:
            assert tx.get("artifact", artifact_id) is None
            assert tx.get("original_artifact_tombstone", artifact_id) == {"artifact_id": artifact_id}
        assert not any(row["source_id"] == source["source_id"] for row in tx.scan("snapshot"))
        assert tx.get("session", core["Frame"]["session_id"])["live_capture"] is False
    _read(fresh, actor, kept, ink_before)
    _reject(404, "source_not_found", lambda: _read(fresh, actor, ink, ink_before))
    _reject(404, "source_not_found", lambda: _put(fresh, actor, ink, ink_before))
    evidence.append("source deletion erases unreferenced uploads across versions, leaves ID-only fences and retains other-source originals")

    reused = {**ink, "source": kept_source}
    _reject(404, "original_not_found", lambda: _put(fresh, actor, reused, ink_before))
    _reject(404, "original_not_found",
            lambda: archive.import_ink(actor, ink["artifact"]["artifact_id"], ink_before))
    late_snapshot, late_frame = deepcopy(kept_snapshot), deepcopy(kept_frame)
    late_snapshot["source_version"] = 2
    late_frame.update(source_version=2, frame_id="late-legacy-frame",
                      artifact_id=image["artifact"]["artifact_id"], content_hash=image["artifact"]["sha256"])
    _reject(404, "original_not_found",
            lambda: archive.import_fixture(actor, late_snapshot, late_frame, image_bytes))
    with PostgresStore(dsn).transaction(actor) as tx:
        assert tx.get("snapshot", key(kept_source["source_id"], 2)) is None
        assert tx.get("frame", "late-legacy-frame") is None
        assert tx.get("source", kept_source["source_id"])["current_version"] == 1
        for artifact_id in deleted_ids:
            assert tx.get("artifact", artifact_id) is None
            assert tx.get("original_artifact_tombstone", artifact_id) == {"artifact_id": artifact_id}
    _read(fresh, actor, kept, ink_before)
    evidence.append("typed reuse and legacy ink/frame imports cannot resurrect deleted IDs; failed fixture import rolls back its snapshot")
    return evidence


def main():
    configured = os.environ.get("LC_TEST_DATABASE_URL")
    if not configured:
        print("BLOCKED: dedicated test DSN absent; PostgreSQL original bytes unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(configured)
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated lc_p0_test check failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    actor = "backend-original-artifact-" + uuid4().hex
    passed = False
    try:
        evidence = run_original_artifact_checks(dsn, actor)
        passed = True
    except Exception as exc:
        # Do not print exception bodies: database errors may contain credentials.
        print("FAILED: PostgreSQL original bytes check (" + type(exc).__name__ + ")", file=sys.stderr)
    finally:
        try:
            cleanup(dsn, [actor])
        except Exception:
            passed = False
            print("FAILED: unique original-artifact actor cleanup incomplete", file=sys.stderr)
    if passed:
        for item in evidence:
            print("PASS: " + item)
        print("PASS: unique original-artifact actor cleanup completed; PostgreSQL " + version)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
