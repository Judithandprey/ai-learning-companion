"""Focused real-DB snapshot evidence; reuse the existing dedicated-DB guards.

Run as a foreground module. Never falls back to MemoryStore or provisions a DB.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from copy import deepcopy
import json
import os
import sys
from threading import Event
from uuid import uuid4

from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.migrations import migrate
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_capture_check import _wait_for_actor_lock, _wait_for_sessions_closed
from services.api.tests.test_learning_snapshot import SOURCE_IDS, assert_snapshot_equal, seed_snapshot_history


def _reject(status, code, operation):
    try:
        operation()
    except DomainError as exc:
        assert (exc.status, exc.code) == (status, code)
    else:
        raise AssertionError("snapshot unexpectedly succeeded")


def _consistent_read(dsn, actor, expected):
    import psycopg
    from psycopg.conninfo import make_conninfo

    scanned, release, abort = Event(), Event(), Event()
    holder = []

    class PausingReadStore(PostgresStore):
        @contextmanager
        def transaction(self, user_id):
            with super().transaction(user_id) as tx:
                scan = tx.scan

                def paused_scan(kind):
                    rows = scan(kind)
                    if kind == "snapshot":
                        holder.append(tx.connection.info.backend_pid)
                        scanned.set()
                        assert release.wait(10), "snapshot reader was not released"
                        if abort.is_set():
                            raise RuntimeError("snapshot observation aborted")
                    return rows

                tx.scan = paused_scan
                yield tx

    name = "lc-snapshot-" + uuid4().hex
    reader = Archive(PausingReadStore(dsn))
    writer = Archive(PostgresStore(make_conninfo(dsn, application_name=name)))
    event = {**deepcopy(expected["observations"][0]), "event_id": "concurrent-original", "device_sequence": 20,
             "text": "Original added concurrently, never a summary."}
    with psycopg.connect(dsn, autocommit=True) as observer:
        observer.execute("SET statement_timeout = '1s'")
        with ThreadPoolExecutor(max_workers=2) as pool:
            reading = pool.submit(reader.export_learning_snapshot, actor, SOURCE_IDS)
            try:
                assert scanned.wait(10), "reader did not enter its snapshot scan"
                writing = pool.submit(writer.events, actor, {"contract_version": "0.1.0", "events": [event]})
                evidence = _wait_for_actor_lock(observer, name, holder[0])
            except BaseException:
                abort.set()
                raise
            finally:
                release.set()
        before, ack = reading.result(), writing.result()
        _wait_for_sessions_closed(observer, [evidence["holder_pid"], evidence["waiter_pid"]])
    assert_snapshot_equal(before, expected)
    assert ack["acknowledged"][0]["status"] == "accepted"
    after = Archive(PostgresStore(dsn)).export_learning_snapshot(actor, SOURCE_IDS)
    assert len(after["observations"]) == len(expected["observations"]) + 1
    added = next(row for row in after["observations"] if row["event_id"] == event["event_id"])
    assert added["text"] == event["text"] and added["received_at"] is not None
    assert_snapshot_equal({**after, "observations": [row for row in after["observations"]
                                                     if row["event_id"] != event["event_id"]]}, expected)
    return evidence


def run_snapshot_checks(dsn, actor):
    store = PostgresStore(dsn)
    archive, expected = seed_snapshot_history(store, actor)
    other, other_expected = seed_snapshot_history(store, actor + "-other")
    exported = archive.export_learning_snapshot(actor, SOURCE_IDS)
    assert_snapshot_equal(exported, expected)
    assert_snapshot_equal(other.export_learning_snapshot(actor + "-other", SOURCE_IDS), other_expected)
    exported["sources"][0]["text"] = "caller changed its detached copy"
    exported["artifacts"].clear()
    assert_snapshot_equal(Archive(PostgresStore(dsn)).export_learning_snapshot(actor, SOURCE_IDS), expected)
    evidence = ["snapshot exact versions, raw correction branches, binary bytes, two-owner isolation and detachment"]

    artifact_id = next(iter(expected["artifacts"]))
    with store.transaction(actor) as tx:
        saved = tx.get("artifact", artifact_id)
        tx.delete("artifact", artifact_id)
    _reject(503, "unavailable", lambda: archive.export_learning_snapshot(actor, SOURCE_IDS))
    with store.transaction(actor) as tx:
        tx.put("artifact", artifact_id, saved)
    assert_snapshot_equal(archive.export_learning_snapshot(actor, SOURCE_IDS), expected)
    evidence.append("snapshot missing referenced bytes rejects the whole extraction; restored synthetic original reads exactly")

    observation = _consistent_read(dsn, actor, expected)
    evidence.append("snapshot single-transaction view excludes a concurrently blocked writer until commit " + json.dumps(observation))

    def expired(state):
        raise DomainError(401, "identity_expired")

    _reject(401, "identity_expired", lambda: Archive(store, authorization_guard=expired).export_learning_snapshot(actor, SOURCE_IDS))
    archive.set_authorization(actor, False)
    _reject(403, "authorization_revoked", lambda: archive.export_learning_snapshot(actor, SOURCE_IDS))
    archive.set_authorization(actor, True)
    archive.revoke_source(actor, SOURCE_IDS[0])
    _reject(403, "source_revoked", lambda: archive.export_learning_snapshot(actor, SOURCE_IDS))
    archive.delete_source(actor, SOURCE_IDS[0])
    _reject(404, "source_not_found", lambda: archive.export_learning_snapshot(actor, SOURCE_IDS))
    remaining = archive.export_learning_snapshot(actor, [SOURCE_IDS[1]])
    assert remaining["sources"] and all(row["source_id"] == SOURCE_IDS[1] for row in remaining["sources"])
    with store.transaction(actor) as tx:
        assert tx.get("source", SOURCE_IDS[0])["deleted"]
        assert all(row["source_id"] != SOURCE_IDS[0] for row in tx.scan("snapshot") + tx.scan("event"))
    evidence.append("snapshot expiry/auth/source revocation/deletion gates reject fresh reads; no resurrection or partial multi-source result")
    return evidence


def main():
    dsn = os.environ.get("LC_TEST_DATABASE_URL")
    if not dsn:
        print("BLOCKED: LC_TEST_DATABASE_URL is absent; PostgreSQL snapshot acceptance unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(dsn)
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated local lc_p0_test validation failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    actor = "backend-snapshot-" + uuid4().hex
    cleanup_ok = True
    try:
        migrate(dsn)  # Existing immutable migration files only; normally a no-op.
        evidence = run_snapshot_checks(dsn, actor)
    except Exception as exc:
        print("FAILED: real PostgreSQL archive snapshot checks (" + type(exc).__name__ + ")", file=sys.stderr)
        return 1
    finally:
        try:
            cleanup(dsn, [actor, actor + "-other"])
        except Exception:
            cleanup_ok = False
            print("FAILED: exact synthetic snapshot actor cleanup incomplete", file=sys.stderr)
    if not cleanup_ok:
        return 1
    for item in evidence:
        print("PASS: " + item)
    print("PostgreSQL version: " + version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
