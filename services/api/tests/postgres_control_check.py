"""Focused real PostgreSQL checks for internal persisted control 0.2.1.

Run only against the existing, explicitly dedicated local lc_p0_test database.
This does not run the older capture suite, provision a service, exercise HTTP,
or prove that a device stopped. Producer-stop facts are independently persisted
synthetic fixture rows; their resolver reads only the current actor transaction.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from copy import deepcopy
import json
import os
import subprocess
import sys
from threading import Event
from uuid import uuid4

from services.api.control import ControlRegistry
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.migrations import migrate
from services.api.storage import PostgresStore
from services.api.tests.postgres_capture_check import (
    _AbortAfterWrites, _ObservationAborted, _reject, _state,
    _wait_for_actor_lock, _wait_for_sessions_closed,
)
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.test_capture import record
from services.api.tests.test_control import (
    command, control_fixture, registration, resolve_stop_fact, start, stop_fact,
)


def _registry(setup, store):
    return ControlRegistry(store, scopes=setup.registry.scopes,
                           capabilities=setup.registry.capabilities,
                           authorization_guard=lambda state: None,
                           stop_fact_resolver=resolve_stop_fact)


def _ordered(dsn, actor, first_operation, second_operation):
    """Hold the real first operation before commit and observe its SQL waiter.

    Operations receive separate stores/connections. Releasing the holder happens
    before executor shutdown even if observation fails; both contexts then close.
    The first operation must succeed. Domain rejection of the second is an
    explicit result, not a successful mutation.
    """
    import psycopg
    from psycopg.conninfo import make_conninfo

    wrote, release, abort = Event(), Event(), Event()
    tag = "lc-control-" + uuid4().hex
    pids = {}

    class GatedStore(PostgresStore):
        def __init__(self, first):
            super().__init__(make_conninfo(dsn, application_name=tag + ("-first" if first else "-second")))
            self.first = first

        @contextmanager
        def transaction(self, user_id):
            assert user_id == actor, "race must touch only its assigned synthetic actor"
            with super().transaction(user_id) as tx:
                if abort.is_set():
                    raise _ObservationAborted("observation failed before worker entry")
                yield tx
                if self.first:
                    pids["holder"] = tx.connection.info.backend_pid
                    wrote.set()
                    assert release.wait(10), "first transaction was not released"
                    if abort.is_set():
                        raise _ObservationAborted("observation failed before commit")

    def execute(operation, store):
        try:
            return operation(store)
        except DomainError as exc:
            return exc.status, exc.code

    with psycopg.connect(dsn, autocommit=True) as observer:
        observer.execute("SET statement_timeout = '1s'")
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(execute, first_operation, GatedStore(True))
            try:
                assert wrote.wait(10), "first operation never reached its commit boundary"
                second = pool.submit(execute, second_operation, GatedStore(False))
                observed = _wait_for_actor_lock(observer, tag + "-second", pids["holder"])
                assert not second.done(), "waiter completed before holder release"
            except BaseException:
                abort.set()
                raise
            finally:
                release.set()
        results = first.result(timeout=20), second.result(timeout=20)
        _wait_for_sessions_closed(observer, [observed["holder_pid"], observed["waiter_pid"]])
    # A fresh transaction also checks that neither successful worker leaked its lock.
    with PostgresStore(dsn).transaction(actor):
        pass
    return results, {**observed, "workers_closed": True, "actor_reacquired": True}


def _capture_fence(dsn, actor, lifecycle, capture_first):
    setup = control_fixture(PostgresStore(dsn), actor)
    stream = setup.registration["stream_id"]
    source = setup.core["SourceSnapshot"]["source_id"]
    stop = command(setup, boundary=None)

    def capture(store):
        return _registry(setup, store).capture.ingest(actor, setup.batch, "race-capture")

    def fence(store):
        registry = _registry(setup, store)
        if lifecycle == "stop":
            return registry.command(actor, stream, stop, "race-stop")
        if lifecycle == "delete":
            return Archive(store).delete_source(actor, source)
        return registry.set_membership(actor, setup.registration["device_id"],
                                       setup.registration["session_id"], active=False,
                                       expected_revision=setup.registration["membership_revision"])

    operations = (capture, fence) if capture_first else (fence, capture)
    results, observed = _ordered(dsn, actor, *operations)
    captured = results[0 if capture_first else 1]
    error = {"stop": (409, "capture_stopped"), "delete": (404, "not_found"),
             "membership": (403, "forbidden")}[lifecycle]
    if capture_first:
        assert captured["acknowledged"][0]["disposition"] == "accepted"
    else:
        assert captured == error
    _reject(*error, lambda: setup.registry.capture.ingest(actor, setup.batch, "race-capture"))
    with setup.store.transaction(actor) as tx:
        assert len(tx.scan("capture_record")) == int(capture_first and lifecycle != "delete")
        assert len(tx.scan("capture_slot")) == int(capture_first)
        state = tx.get("control_stream", stream)["state"]
        if lifecycle == "stop":
            assert state["state"] == "stopped" and state["pre_stop_sequence"] is None
        elif lifecycle == "delete":
            assert tx.get("source", source)["deleted"] is True
            assert all(row.get("deleted") is True for row in tx.scan("capture_replay"))
        else:
            assert state["state"] == "withdrawn"
            assert all(row["active"] is False for row in tx.scan("control_membership"))
    return {"lifecycle": lifecycle, "first": "capture" if capture_first else "fence", **observed}


def _registration_generation_race(dsn, actor, registration_first):
    setup = control_fixture(PostgresStore(dsn), actor, registered=False)
    old = setup.registration
    setup.registry.authorize_start(actor, old, producer_id="screen")

    def register(store):
        return _registry(setup, store).register(actor, old, "delayed-register")

    if registration_first:
        # Registration holds an uncommitted consumed grant while revocation waits.
        def lifecycle(store):
            archive = Archive(store)
            archive.set_authorization(actor, False)
            return archive.set_authorization(actor, True)

        results, observed = _ordered(dsn, actor, register, lifecycle)
        assert results[0]["state"] == "live"
        assert results[1]["generation"] == old["authorization_generation"] + 2
    else:
        # Revocation already invalidated the original pending decision. Hold the
        # subsequent regrant before commit, so the delayed request actually waits
        # for generation +2 and cannot inherit it by arriving after re-enablement.
        setup.archive.set_authorization(actor, False)
        results, observed = _ordered(
            dsn, actor, lambda store: Archive(store).set_authorization(actor, True), register,
        )
        assert results[0]["generation"] == old["authorization_generation"] + 2
        assert results[1] == (403, "forbidden")
    _reject(403, "forbidden", lambda: setup.registry.register(actor, old, "delayed-register"))
    _reject(403, "forbidden", lambda: setup.registry.register(actor, old, "changed-request-key"))
    with setup.store.transaction(actor) as tx:
        grant = tx.get("control_start", old["stream_id"])
        assert grant["status"] == ("consumed" if registration_first else "invalidated")
        rows = tx.scan("control_stream")
        assert len(rows) == int(registration_first)
        if rows:
            assert rows[0]["state"]["state"] == "withdrawn"
        assert len(tx.scan("control_replay")) == int(registration_first)
        assert tx.scan("capture_record") == []
    # Only another explicit exact-ID start can register the newly current pins.
    fresh = registration(setup, "fresh-generation", predecessor=old["stream_id"] if registration_first else None)
    _reject(403, "forbidden", lambda: setup.registry.register(actor, fresh, "fresh-generation"))
    current = start(setup, fresh, request_key="fresh-generation")
    assert current["state"] == "live"
    assert current["authorization_generation"] == old["authorization_generation"] + 2
    return {"first": "registration" if registration_first else "regrant_after_revocation", **observed}


def _durable_lifecycle(dsn, actor):
    setup = control_fixture(PostgresStore(dsn), actor)
    registry, stream = setup.registry, setup.registration["stream_id"]
    original = deepcopy(setup.batch["records"][0])
    ack = registry.capture.ingest(actor, setup.batch, "capture-original")
    assert registry.capture.ingest(actor, setup.batch, "capture-original") == ack
    before = _state(setup.store, actor)
    changed = deepcopy(setup.batch)
    changed["records"][0]["record_id"] = "different-record"
    _reject(409, "idempotency_conflict", lambda: registry.capture.ingest(actor, changed, "capture-original"))
    assert _state(setup.store, actor) == before

    stop = command(setup, boundary=None)
    unknown = registry.command(actor, stream, stop, "stop-original")
    assert unknown["state"] == "stopped" and unknown["pre_stop_sequence"] is None
    assert registry.register(actor, setup.registration, "register-1") == unknown
    assert registry.command(actor, stream, stop, "stop-original") == unknown
    _reject(409, "idempotency_conflict", lambda: registry.command(
        actor, stream, command(setup, "withdraw"), "stop-original"))
    historical = {**setup.batch, "delivery_mode": "historical"}
    _reject(409, "capture_stopped", lambda: registry.capture.ingest(actor, historical, "unknown-history"))
    _reject(409, "invalid_transition", lambda: registry.command(
        actor, stream, command(setup, "seal_stop", revision=2, boundary=1), "seal-without-fact"))
    stop_fact(setup, 1)  # Independent producer fixture fact, persisted before command.
    sealed = registry.command(actor, stream, command(setup, "seal_stop", revision=2, boundary=1), "seal")
    assert sealed["pre_stop_sequence"] == 1 and sealed["revision"] == 3
    assert registry.register(actor, setup.registration, "register-1") == sealed
    assert registry.command(actor, stream, stop, "stop-original") == sealed
    history_ack = registry.capture.ingest(actor, historical, "sealed-history")
    assert history_ack["acknowledged"][0]["disposition"] == "duplicate"
    assert registry.capture.ingest(actor, historical, "sealed-history") == history_ack
    _reject(409, "capture_stopped", lambda: registry.capture.ingest(
        actor, {**historical, "records": [record(setup.batch, "past-boundary", 2)]}, "past-boundary"))
    withdrawn = registry.command(actor, stream, command(setup, "withdraw", revision=3), "withdraw")
    assert withdrawn["state"] == "withdrawn" and withdrawn["revision"] == 4
    assert registry.register(actor, setup.registration, "register-1") == withdrawn
    assert registry.command(actor, stream, stop, "stop-original") == withdrawn
    _reject(403, "forbidden", lambda: registry.capture.ingest(actor, historical, "sealed-history"))
    assert registry.capture.read_record(actor, original["record_id"])["record"] == original

    restarted_body = registration(setup, "restarted-stream", predecessor=stream)
    _reject(403, "forbidden", lambda: registry.register(actor, restarted_body, "restart"))
    restarted = start(setup, restarted_body, request_key="restart")
    assert restarted["continuity"] == {"kind": "restart", "previous_stream_id": stream, "gap": "unknown"}
    independent_body = registration(setup, "independent-microphone")
    independent = start(setup, independent_body, producer="microphone", request_key="independent")
    assert independent["state"] == "live"

    expected = {"registration": setup.registration, "stop": stop,
                "state": withdrawn, "original": original, "restart": restarted,
                "independent": independent}
    child = subprocess.run([sys.executable, "-c", """
import json, os, sys
from services.api.control import ControlRegistry
from services.api.storage import PostgresStore
from services.api.tests.test_control import resolve_stop_fact
data = json.loads(os.environ['LC_CONTROL_EXPECTED'])
user = sys.argv[1]
registry = ControlRegistry(PostgresStore(os.environ['LC_TEST_DATABASE_URL']),
    scopes=frozenset(['process:control', 'process:capture']),
    capabilities=frozenset(['process.control.v0.2.1', 'process.capture.v0.2']),
    authorization_guard=lambda state: None,
    stop_fact_resolver=resolve_stop_fact)
stream = data['registration']['stream_id']
assert registry.read(user, stream) == data['state']
assert registry.register(user, data['registration'], 'register-1') == data['state']
assert registry.command(user, stream, data['stop'], 'stop-original') == data['state']
assert registry.capture.read_record(user, data['original']['record_id'])['record'] == data['original']
assert registry.read(user, data['restart']['stream_id']) == data['restart']
assert registry.read(user, data['independent']['stream_id']) == data['independent']
print('control fresh-process readback verified')
""", actor], env={**os.environ, "LC_TEST_DATABASE_URL": dsn,
                   "LC_CONTROL_EXPECTED": json.dumps(expected)},
        capture_output=True, text=True, timeout=20)
    assert child.returncode == 0 and child.stdout.strip() == "control fresh-process readback verified", \
        "fresh-process control readback failed (child output withheld)"
    return "fresh-process state/original readback, current replay, unknown-to-seal, withdrawal, exact-ID restart and independent producer"


def _zero_boundary(dsn, actor):
    setup = control_fixture(PostgresStore(dsn), actor)
    stop_fact(setup, 0)
    stopped = setup.registry.command(actor, setup.registration["stream_id"], command(setup, boundary=0), "zero-stop")
    assert stopped["state"] == "stopped" and stopped["pre_stop_sequence"] == 0
    _reject(409, "capture_stopped", lambda: setup.registry.capture.ingest(
        actor, {**setup.batch, "delivery_mode": "historical"}, "no-ever-assigned-record"))
    with setup.store.transaction(actor) as tx:
        assert tx.scan("capture_slot") == [] and tx.scan("capture_record") == []
    return "independent zero stop fact accepted only for an empty incarnation; sequence one rejected"


def _retained_floor(dsn, actor):
    setup = control_fixture(PostgresStore(dsn), actor)
    batch = {**setup.batch, "records": [record(setup.batch, "early", 1), record(setup.batch, "late", 7)]}
    setup.registry.capture.ingest(actor, batch, "before-delete")
    stream = setup.registration["stream_id"]
    setup.registry.command(actor, stream, command(setup, boundary=None), "stop-before-delete")
    setup.archive.delete_source(actor, setup.core["SourceSnapshot"]["source_id"])
    with setup.store.transaction(actor) as tx:
        assert tx.scan("capture_record") == [] and len(tx.scan("capture_slot")) == 2
        assert all(set(row) == {"key", "deleted"} for row in tx.scan("capture_replay"))
    stop_fact(setup, 0)
    before = _state(setup.store, actor)
    _reject(409, "invalid_transition", lambda: setup.registry.command(
        actor, stream, command(setup, "seal_stop", revision=2, boundary=0), "incorrect-zero"))
    assert _state(setup.store, actor) == before
    stop_fact(setup, 7)
    sealed = setup.registry.command(actor, stream, command(setup, "seal_stop", revision=2, boundary=7), "actual-final")
    assert sealed["pre_stop_sequence"] == 7
    _reject(404, "not_found", lambda: setup.registry.capture.ingest(
        actor, {**batch, "delivery_mode": "historical"}, "erased-replay"))
    # Retained slots belong to their own incarnation, not every stream of owner.
    other = registration(setup, "unassigned-other-producer")
    start(setup, other, producer="microphone", request_key="other-register")
    stop_fact(setup, 0, stream_id=other["stream_id"])
    zero = setup.registry.command(actor, other["stream_id"],
                                  command(setup, stream_id=other["stream_id"], boundary=0), "other-zero")
    assert zero["pre_stop_sequence"] == 0
    return "deleted originals retain same-stream committed floor seven; contradictory zero rejects atomically, unrelated empty stream stays zero"


def _rollback(dsn, actor):
    setup = control_fixture(PostgresStore(dsn), actor)
    setup.registry.capture.ingest(actor, setup.batch, "before-rollback")
    pending = registration(setup, "pending-independent")
    setup.registry.authorize_start(actor, pending, producer_id="microphone")
    before = _state(setup.store, actor)
    registry = _registry(setup, _AbortAfterWrites(dsn))
    for operation in (
        lambda: registry.register(actor, pending, "aborted-registration"),
        lambda: registry.command(actor, setup.registration["stream_id"], command(setup), "aborted-stop"),
        lambda: Archive(_AbortAfterWrites(dsn)).delete_source(actor, setup.core["SourceSnapshot"]["source_id"]),
    ):
        try:
            operation()
        except RuntimeError as exc:
            assert str(exc) == "synthetic pre-commit failure"
        else:
            raise AssertionError("synthetic transaction abort did not propagate")
        assert _state(setup.store, actor) == before
    assert setup.registry.read(actor, setup.registration["stream_id"])["state"] == "live"
    assert setup.registry.capture.read_record(actor, setup.batch["records"][0]["record_id"])["record"] == setup.batch["records"][0]
    # Rolled-back grant consumption and idempotency entries must remain retryable.
    assert setup.registry.register(actor, pending, "aborted-registration")["state"] == "live"
    return "failed registration/control/source deletion roll back grant, replay, state and originals; exact registration retry then succeeds"


def main():
    dsn = os.environ.get("LC_TEST_DATABASE_URL")
    if not dsn:
        print("BLOCKED: LC_TEST_DATABASE_URL is absent; real PostgreSQL control checks are unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(dsn)
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated local lc_p0_test validation failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2

    prefix = "backend-control-" + uuid4().hex
    actors = []
    phase = "migration compatibility"
    cleanup_ok = True
    try:
        migrate(dsn)
        assert migrate(dsn) == [], "migration reapply was not a no-op"
        checks = [("durable", _durable_lifecycle), ("zero", _zero_boundary),
                  ("retained-floor", _retained_floor), ("rollback", _rollback)]
        for lifecycle in ("stop", "delete", "membership"):
            for capture_first in (True, False):
                label = lifecycle + ("-capture-first" if capture_first else "-fence-first")
                checks.append((label, lambda database, actor, gate=lifecycle, first=capture_first:
                               _capture_fence(database, actor, gate, first)))
        for registration_first in (True, False):
            label = "registration-first" if registration_first else "regrant-first"
            checks.append((label, lambda database, actor, first=registration_first:
                           _registration_generation_race(database, actor, first)))
        for phase, check in checks:
            actor = prefix + "-" + phase
            actors.append(actor)
            result = check(dsn, actor)
            detail = result if isinstance(result, str) else json.dumps(result, sort_keys=True)
            print("PASS: " + phase + ": " + detail, flush=True)
    except Exception as exc:
        # Preserve which bounded case failed without leaking psycopg DSN details.
        print("FAILED: real PostgreSQL control " + phase + " (" + type(exc).__name__ + ")", file=sys.stderr)
        return 1
    finally:
        try:
            cleanup(dsn, actors)
        except Exception:
            cleanup_ok = False
            print("FAILED: synthetic control actor cleanup incomplete", file=sys.stderr)
    if not cleanup_ok:
        return 1
    print("PostgreSQL version: " + version)
    print("PASS: 12 focused internal control groups; 8 contain observed PostgreSQL lock evidence")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
