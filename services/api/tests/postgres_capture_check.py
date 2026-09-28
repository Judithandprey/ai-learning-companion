"""Internal capture checks run only by the guarded dedicated PostgreSQL runner.

Registration and typed blob import below are explicit synthetic trusted context,
not released wire APIs or evidence of a working device/blob upload adapter.
"""

import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from copy import deepcopy
import json
import os
import subprocess
import sys
from threading import Event

from packages.contracts.process_v2 import canonical_record
from services.api.capture import CaptureArchive
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.migrations import migrate
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import _race
from services.api.tests.test_capture import blob_reference, capture_fixture, control, record


def _reject(status, code, operation):
    try:
        operation()
    except DomainError as exc:
        assert (exc.status, exc.code) == (status, code)
    else:
        raise AssertionError("capture operation unexpectedly succeeded")


def _state(store, actor):
    with store.transaction(actor) as tx:
        return tx.connection.execute(
            "SELECT kind, doc_key, payload FROM lc_backend.documents WHERE user_id = %s ORDER BY kind, doc_key",
            (actor,),
        ).fetchall()


class _AbortAfterWrites(PostgresStore):
    @contextmanager
    def transaction(self, user_id):
        with super().transaction(user_id) as tx:
            yield tx
            raise RuntimeError("synthetic pre-commit failure")


def _lifecycle_races(dsn, actor):
    """Hold the first transaction through writes; start its competing caller."""
    for lifecycle in ("stop", "delete"):
        for first_is_capture in (True, False):
            user = actor + "-" + lifecycle + ("-capture-first" if first_is_capture else "-fence-first")
            fixture = capture_fixture(PostgresStore(dsn), user)
            first_wrote, second_started, release = Event(), Event(), Event()

            class GatedStore(PostgresStore):
                def __init__(self, first):
                    super().__init__(dsn)
                    self.first = first

                @contextmanager
                def transaction(self, user_id):
                    if not self.first:
                        second_started.set()
                    with super().transaction(user_id) as tx:
                        yield tx
                        if self.first:
                            first_wrote.set()
                            assert release.wait(10), "test did not release first transaction"

            first_store, second_store = GatedStore(True), GatedStore(False)
            capture_store = first_store if first_is_capture else second_store
            fence_store = second_store if first_is_capture else first_store

            def capture():
                try:
                    return CaptureArchive(capture_store, fixture.resolver).ingest(user, fixture.batch, "race")
                except DomainError as exc:
                    return exc.status, exc.code

            def fence():
                if lifecycle == "stop":
                    control(fence_store, fixture.batch["stream_id"], user_id=user,
                            live_capture_allowed=False, historical_through_sequence=1)
                else:
                    Archive(fence_store).delete_source(user, fixture.core["SourceSnapshot"]["source_id"])

            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(capture if first_is_capture else fence)
                try:
                    assert first_wrote.wait(10), "first transaction never reached commit boundary"
                    second = pool.submit(fence if first_is_capture else capture)
                    assert second_started.wait(5), "competing caller did not start"
                    assert not second.done(), "second transaction bypassed first actor lock"
                finally:
                    release.set()
                first_result, second_result = first.result(timeout=20), second.result(timeout=20)
            captured = first_result if first_is_capture else second_result
            expected_error = (409, "capture_stopped") if lifecycle == "stop" else (404, "not_found")
            if first_is_capture:
                assert captured["acknowledged"][0]["disposition"] == "accepted"
            else:
                assert captured == expected_error
            _reject(*expected_error, lambda: fixture.capture.ingest(user, fixture.batch, "race"))
            with fixture.store.transaction(user) as tx:
                assert len(tx.scan("capture_record")) == int(lifecycle == "stop" and first_is_capture)
                if lifecycle == "stop":
                    assert tx.get("fixture_control", fixture.batch["stream_id"])["live_capture_allowed"] is False
                else:
                    assert tx.get("source", fixture.core["SourceSnapshot"]["source_id"])["deleted"] is True
                    assert all(row.get("deleted") is True for row in tx.scan("capture_replay"))


def run_capture_checks(dsn, actor):
    import psycopg
    from psycopg.types.json import Jsonb

    evidence = []
    store = PostgresStore(dsn)
    fixture = capture_fixture(store, actor)
    batch = deepcopy(fixture.batch)
    original = batch["records"][0]
    original["source"]["source_version"] = 1.0
    original["sequence"] = 1.0
    original["media_position"] = -0.0
    original["evidence"].update(operation="text_edit", before={"kind": "text", "text": "original\x00text"},
                                after={"kind": "text", "text": "original\x00edit"})
    data = b""  # Valid empty artifact tests exact numeric representation in receipts.
    reference = blob_reference(data)
    reference["byte_length"] = -0.0
    original["artifacts"] = [reference]
    capture = fixture.capture

    def ingest(value=batch, request="initial"):
        return capture.ingest(actor, value, request)

    def parallel(request):
        # Separate store/connection per caller; actor lock serializes the commits.
        return CaptureArchive(PostgresStore(dsn), fixture.resolver).ingest(actor, batch, request)

    receipts = _race(lambda: parallel("parallel-a"), lambda: parallel("parallel-b"))
    assert sorted(a["acknowledged"][0]["disposition"] for a in receipts) == ["accepted", "duplicate"]
    pending = ingest()
    assert pending["acknowledged"][0]["artifacts"][0]["status"] == "pending"
    assert json.dumps(ingest(), sort_keys=True) == json.dumps(pending, sort_keys=True), "cached ACK changed representation"
    expected = canonical_record(batch, original["record_id"]).decode()
    with store.transaction(actor) as tx:
        assert tx.get("capture_record", original["record_id"])["canonical_json"] == expected
        assert len(tx.scan("capture_record")) == 1
    child = subprocess.run(
        [sys.executable, "-c", """
import json, os, sys
from services.api.capture import CaptureArchive
from services.api.storage import PostgresStore
actual = CaptureArchive(PostgresStore(os.environ['LC_TEST_DATABASE_URL'])).read_record(sys.argv[1], sys.argv[2])
actual.pop('received_at')
assert json.dumps(actual, sort_keys=True, ensure_ascii=False, separators=(',', ':')) == os.environ['LC_CAPTURE_EXPECTED']
print('capture readback verified')
""", actor, original["record_id"]],
        env={**os.environ, "LC_TEST_DATABASE_URL": dsn, "LC_CAPTURE_EXPECTED": expected},
        capture_output=True, text=True, timeout=20,
    )
    assert child.returncode == 0 and child.stdout.strip() == "capture readback verified"
    evidence.append("capture concurrent insert/replay and fresh-process exact originals including NUL and negative zero")

    before = _state(store, actor)
    changed = deepcopy(batch)
    changed["records"][0]["evidence"]["after"]["text"] = "overwrite"
    _reject(409, "idempotency_conflict", lambda: ingest(changed))
    mixed = {**batch, "records": [record(batch, "new-record", 2), changed["records"][0]]}
    _reject(409, "record_conflict", lambda: ingest(mixed, "mixed"))
    occupied = {**batch, "records": [record(batch, "occupied", 1)]}
    _reject(409, "record_conflict", lambda: ingest(occupied, "occupied"))
    assert _state(store, actor) == before
    for operation in (
        lambda: CaptureArchive(_AbortAfterWrites(dsn), fixture.resolver).ingest(
            actor, {**batch, "records": [record(batch, "abort", 2)]}, "abort"),
        lambda: Archive(_AbortAfterWrites(dsn)).delete_source(actor, original["source"]["source_id"]),
    ):
        try:
            operation()
        except RuntimeError as exc:
            assert str(exc) == "synthetic pre-commit failure"
        else:
            raise AssertionError("synthetic transaction failure did not propagate")
        assert _state(store, actor) == before
    evidence.append("capture mixed batch/changed replay/normalized slot conflicts and failed commit/delete preserve all originals")

    blob = {"user_id": actor, "id": reference["artifact_id"], "kind": "capture",
            "content_hash": reference["sha256"], "data_base64": base64.b64encode(data).decode(),
            "media_type": reference["media_type"]}
    with store.transaction(actor) as tx:
        tx.put("artifact", reference["artifact_id"], blob)
    assert ingest() == pending
    verified = ingest(request="verified")
    assert verified["acknowledged"][0]["artifacts"][0]["status"] == "verified"
    assert verified["acknowledged"][0]["received_at"] == pending["acknowledged"][0]["received_at"]
    with store.transaction(actor) as tx:
        tx.delete("artifact", reference["artifact_id"])
    _reject(503, "unavailable", lambda: ingest(request="verified"))
    with store.transaction(actor) as tx:
        tx.put("artifact", reference["artifact_id"], blob)
    evidence.append("capture pending blob preserved; separately imported bytes verified; missing bytes fence cached verified ACK")

    for kind in ("capture_record", "capture_binding", "capture_slot", "capture_artifact_ref"):
        try:
            with psycopg.connect(dsn) as connection:
                result = connection.execute(
                    "UPDATE lc_backend.documents SET payload = %s WHERE user_id = %s AND kind = %s",
                    (Jsonb({"changed": True}), actor, kind),
                )
                assert result.rowcount > 0
        except psycopg.errors.CheckViolation:
            pass
        else:
            raise AssertionError("DB trigger accepted capture overwrite")
    before = _state(store, actor)
    try:
        migrate(dsn, rollback=True)
    except psycopg.errors.CheckViolation:
        pass
    else:
        raise AssertionError("migration rollback removed live capture protection")
    assert _state(store, actor) == before and migrate(dsn) == []
    evidence.append("capture four immutable kinds protected by DB trigger; unsafe migration rollback refused with originals intact")

    control(store, batch["stream_id"], user_id=actor, live_capture_allowed=False, historical_through_sequence=1)
    _reject(409, "capture_stopped", lambda: ingest())
    assert capture.read_record(actor, original["record_id"])["record"] == original
    history = {**batch, "delivery_mode": "historical"}
    assert ingest(history, "history")["acknowledged"][0]["disposition"] == "duplicate"
    _reject(409, "capture_stopped", lambda: ingest(
        {**history, "records": [record(batch, "post-stop", 2)]}, "post-stop"))
    control(store, batch["stream_id"], user_id=actor, transmission_allowed=False)
    _reject(403, "forbidden", lambda: ingest(history, "history"))
    control(store, batch["stream_id"], user_id=actor, transmission_allowed=True)
    with store.transaction(actor) as tx:
        assert tx.get("fixture_control", batch["stream_id"])["live_capture_allowed"] is False
    evidence.append("capture stop and transmission withdrawal checked before cached ACK; bounded history never restarts capture")

    fixture.archive.delete_source(actor, original["source"]["source_id"])
    _reject(404, "not_found", lambda: ingest(history, "history"))
    _reject(404, "not_found", lambda: capture.read_record(actor, original["record_id"]))
    with store.transaction(actor) as tx:
        assert tx.scan("capture_record") == []
        assert tx.scan("capture_artifact_ref") == []
        assert tx.get("artifact", reference["artifact_id"]) is None
        assert tx.get("capture_tombstone", original["record_id"]) == {"record_id": original["record_id"]}
        assert tx.get("capture_artifact_tombstone", reference["artifact_id"]) is not None
        assert len(tx.scan("capture_slot")) == 1
        assert all(set(row) == {"key", "deleted"} and row["deleted"] for row in tx.scan("capture_replay"))
    evidence.append("capture source deletion atomically scrubs originals/blobs/receipt hashes and preserves replay fences")
    _lifecycle_races(dsn, actor)
    evidence.append("capture versus stop and deletion: both forced commit orders across competing PostgreSQL connections")
    return evidence
