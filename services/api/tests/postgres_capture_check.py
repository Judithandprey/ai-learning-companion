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
from time import monotonic, sleep
from uuid import uuid4

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


def _wait_for_actor_lock(observer, application_name, holder_pid, *, timeout=5):
    """Return actual contention evidence, never infer it from elapsed time.

    Autocommit gives each poll a fresh statistics snapshot. The caller owns the
    tagged connections and already holds the intended actor transaction open.
    """
    assert observer.autocommit, "lock observation requires fresh snapshots"
    deadline = monotonic() + timeout
    while True:
        row = observer.execute(
            "SELECT waiter.pid, waiter.wait_event, waiting.transactionid::text, pg_blocking_pids(waiter.pid) "
            "FROM pg_stat_activity waiter "
            "JOIN pg_locks waiting ON waiting.pid = waiter.pid "
            "JOIN pg_locks holding ON holding.transactionid = waiting.transactionid "
            "WHERE waiter.datname = current_database() AND waiter.usename = current_user "
            "AND waiter.application_name = %s AND waiter.pid <> %s "
            "AND waiter.state = 'active' AND waiter.wait_event_type = 'Lock' "
            "AND waiter.query LIKE 'SELECT user_id FROM lc_backend.actors %%FOR UPDATE' "
            "AND waiting.locktype = 'transactionid' AND waiting.mode = 'ShareLock' AND NOT waiting.granted "
            "AND holding.pid = %s AND holding.locktype = 'transactionid' "
            "AND holding.mode = 'ExclusiveLock' AND holding.granted "
            "AND %s = ANY(pg_blocking_pids(waiter.pid))",
            (application_name, holder_pid, holder_pid, holder_pid),
        ).fetchone()
        if row is not None:
            waiter_pid, wait_event, transaction_id, blockers = row
            return {"holder_pid": holder_pid, "waiter_pid": waiter_pid,
                    "wait_event": wait_event, "transaction_id": transaction_id, "blocking_pids": blockers}
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise TimeoutError("intended PostgreSQL actor lock wait was not observed")
        sleep(min(0.01, remaining))  # Throttle queries; sleep is never evidence.


class _ObservationAborted(RuntimeError):
    """Roll back both owned workers when observation fails before release."""


def _wait_for_sessions_closed(observer, pids, *, timeout=5):
    """Client close precedes server removal; observe removal with a bounded poll."""
    assert observer.autocommit, "session observation requires fresh snapshots"
    deadline = monotonic() + timeout
    while observer.execute(
        "SELECT count(*) FROM pg_stat_activity WHERE pid = ANY(%s)", (pids,),
    ).fetchone()[0]:
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise TimeoutError("owned PostgreSQL worker sessions did not close")
        sleep(min(0.01, remaining))


def _lifecycle_race(dsn, user, lifecycle, first_is_capture, *, observe=_wait_for_actor_lock):
    import psycopg
    from psycopg.conninfo import make_conninfo

    fixture = capture_fixture(PostgresStore(dsn), user)
    first_wrote, release, abort = Event(), Event(), Event()
    tag = "lc-capture-" + uuid4().hex  # Both names fit PostgreSQL's 63-byte limit.
    pids = {}

    class GatedStore(PostgresStore):
        def __init__(self, first):
            super().__init__(make_conninfo(dsn, application_name=tag + ("-first" if first else "-second")))
            self.first = first

        @contextmanager
        def transaction(self, user_id):
            with super().transaction(user_id) as tx:
                if abort.is_set():
                    raise _ObservationAborted("observation failed before worker entry")
                yield tx
                if self.first:
                    pids["holder"] = tx.connection.info.backend_pid
                    first_wrote.set()
                    assert release.wait(10), "test did not release first transaction"
                    if abort.is_set():
                        raise _ObservationAborted("observation failed before commit")

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

    # Connect before holding the first writer; no connection startup eats its gate
    # budget. Polling has a five-second deadline plus at most one one-second query.
    with psycopg.connect(dsn, autocommit=True) as observer:
        observer.execute("SET statement_timeout = '1s'")
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(capture if first_is_capture else fence)
            try:
                assert first_wrote.wait(10), "first transaction never reached commit boundary"
                second = pool.submit(fence if first_is_capture else capture)
                observed = observe(observer, tag + "-second", pids["holder"])
                assert not second.done(), "observed waiter completed before lock release"
            except BaseException:
                abort.set()
                raise
            finally:
                # This runs BEFORE executor shutdown/join, including observation
                # denial/timeout. Both worker transaction contexts then close.
                release.set()
        first_result, second_result = first.result(timeout=20), second.result(timeout=20)
        _wait_for_sessions_closed(observer, [observed["holder_pid"], observed["waiter_pid"]])

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
    return {"lifecycle": lifecycle, "first": "capture" if first_is_capture else "fence", **observed}


def _lifecycle_races(dsn, actor):
    evidence = []
    for lifecycle in ("stop", "delete"):
        for first_is_capture in (True, False):
            user = actor + "-" + lifecycle + ("-capture-first" if first_is_capture else "-fence-first")
            evidence.append(_lifecycle_race(dsn, user, lifecycle, first_is_capture))
    return evidence


def _observation_failure_checks(dsn, actor):
    """Both workers are truly blocked/held before injecting observer failure."""
    import psycopg

    evidence = []
    for failure in ("timeout", "observer-error"):
        user = actor + "-" + failure
        observed = []

        def fail(observer, application_name, holder_pid):
            observed.append(_wait_for_actor_lock(observer, application_name, holder_pid))
            if failure == "timeout":
                # An unrelated blocker must never satisfy the observation, even
                # when the correctly tagged waiter is demonstrably blocked.
                return _wait_for_actor_lock(observer, application_name, observer.info.backend_pid, timeout=0.05)
            raise RuntimeError("synthetic observer failure")

        try:
            _lifecycle_race(dsn, user, "delete", False, observe=fail)
        except (TimeoutError, RuntimeError) as exc:
            assert type(exc) is (TimeoutError if failure == "timeout" else RuntimeError)
            assert str(exc) == ("intended PostgreSQL actor lock wait was not observed" if failure == "timeout"
                                else "synthetic observer failure")
        else:
            raise AssertionError("injected observation failure did not propagate")
        assert len(observed) == 1
        with psycopg.connect(dsn, autocommit=True) as observer:
            observer.execute("SET statement_timeout = '1s'")
            _wait_for_sessions_closed(observer, [observed[0]["holder_pid"], observed[0]["waiter_pid"]])
        # Reacquiring the actor transaction proves no leaked actor lock. Both
        # aborted operations leave the synthetic fixture and no replay effects.
        with PostgresStore(dsn).transaction(user) as tx:
            assert all(not source["deleted"] for source in tx.scan("source"))
            assert len(tx.scan("snapshot")) == 1
            assert tx.scan("capture_record") == [] and tx.scan("capture_replay") == []
        evidence.append({"failure": failure, **observed[0], "workers_closed": True, "actor_reacquired": True})
    return evidence


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
    observations = _lifecycle_races(dsn, actor)
    evidence.append("capture versus stop/deletion: actual actor lock waits in both commit orders " + json.dumps(observations))
    failures = _observation_failure_checks(dsn, actor)
    evidence.append("capture lock observation timeout/error: workers closed and actor reacquired " + json.dumps(failures))
    return evidence
