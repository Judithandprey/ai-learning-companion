"""Dedicated PostgreSQL acceptance runner: missing DSN is BLOCKED, never PASS/skip.

Run with: python -m services.api.tests.postgres_check
LC_TEST_DATABASE_URL must name a dedicated local test database. This runner applies
the module migration and creates/deletes only unique synthetic actors of its run.
It does not create a database, provision a service or log connection credentials.
"""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from ipaddress import ip_address
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Barrier
from uuid import uuid4

from services.api.migrations import migrate
from services.api.storage import ImmutableDocumentError, PostgresStore


READBACK_SCRIPT = """
import os
import sys
from services.api.storage import PostgresStore
store = PostgresStore(os.environ['LC_TEST_DATABASE_URL'])
with store.transaction(sys.argv[1]) as tx:
    assert tx.get('snapshot', 'immutable') == {'version': 'v1', 'text': 'original source'}
print('readback verified')
"""


def dedicated_test_dsn(dsn: str) -> str:
    """Reject ambiguous/nonlocal targets before connecting or performing cleanup."""
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    parameters = conninfo_to_dict(dsn)
    if parameters.get("dbname") != "lc_p0_test":
        raise ValueError("explicit dedicated test database required")
    if (parameters.get("service") or parameters.get("hostaddr")
            or os.environ.get("PGSERVICE") or os.environ.get("PGHOSTADDR")):
        raise ValueError("indirect connection targets are not permitted")
    host = parameters.get("host", "")
    if not host or "," in host:
        raise ValueError("one explicit local endpoint required")
    if not host.startswith("/") and host not in {"127.0.0.1", "::1", "localhost"}:
        raise ValueError("local endpoint required")
    port = parameters.get("port") or os.environ.get("PGPORT", "5432")
    if not port.isascii() or not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise ValueError("one valid port required")
    # Bound test connections, including blocked executor threads and child processes.
    # Do not modify production store defaults or inherit arbitrary PGOPTIONS.
    return make_conninfo(
        dsn, host=host, port=port, dbname="lc_p0_test", connect_timeout=5,
        options="-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000",
    )


def verify_test_database(dsn: str) -> str:
    """Read-only identity check; PostgresStore would create an actor on entry."""
    import psycopg
    from psycopg.conninfo import conninfo_to_dict

    options = conninfo_to_dict(dsn)["options"] + " -c default_transaction_read_only=on"
    with psycopg.connect(dsn, options=options, autocommit=True) as connection:
        database, address, version = connection.execute(
            "SELECT current_database(), inet_server_addr()::text, current_setting('server_version')"
        ).fetchone()
    if database != "lc_p0_test" or (address is not None and not ip_address(address).is_loopback):
        raise ValueError("actual database is outside the dedicated local scope")
    return version


def run_storage_checks(dsn: str, actor: str) -> list[str]:
    import psycopg
    from psycopg.types.json import Jsonb

    store = PostgresStore(dsn)
    evidence = []
    migrate(dsn)
    assert migrate(dsn) == [], "migration replay must be a no-op"
    evidence.append("migration apply and idempotent reapply")

    with store.transaction(actor) as tx:
        tx.put("snapshot", "immutable", {"version": "v1", "text": "original source"})
        tx.put("head", "note", {"revision": 1, "text": "original ink"})
    # A fresh Python process plus fresh DB connection proves process restart
    # readback. This does not assert restart/recovery of the PostgreSQL server.
    restarted = subprocess.run(
        [sys.executable, "-c", READBACK_SCRIPT, actor],
        env={**os.environ, "LC_TEST_DATABASE_URL": dsn}, capture_output=True, text=True, timeout=20,
    )
    assert restarted.returncode == 0, "fresh process readback failed"
    assert restarted.stdout.strip() == "readback verified"
    evidence.append("fresh-process immutable source readback")

    with store.transaction(actor + "-other") as tx:
        assert tx.get("snapshot", "immutable") is None
        tx.put("snapshot", "immutable", {"owner": "other"})
    with store.transaction(actor) as tx:
        assert tx.get("snapshot", "immutable")["text"] == "original source"
    evidence.append("same-key authenticated actor storage isolation")

    try:
        with store.transaction(actor) as tx:
            tx.put("head", "note", {"revision": 999})
            tx.put("event", "rolled-back", {"text": "must not remain"})
            tx.delete("snapshot", "immutable")
            raise RuntimeError("test rollback")
    except RuntimeError:
        pass
    with PostgresStore(dsn).transaction(actor) as tx:
        assert tx.get("head", "note")["revision"] == 1
        assert tx.get("event", "rolled-back") is None
        assert tx.get("snapshot", "immutable")["version"] == "v1"
    evidence.append("transaction rollback preserves originals, head and atomic batch")

    try:
        with store.transaction(actor) as tx:
            tx.put("snapshot", "immutable", {"version": "changed"})
    except ImmutableDocumentError:
        pass
    else:
        raise AssertionError("repository accepted immutable overwrite")
    try:
        with psycopg.connect(dsn, connect_timeout=5) as connection:
            connection.execute(
                "UPDATE lc_backend.documents SET payload = %s WHERE user_id = %s AND kind = 'snapshot' AND doc_key = 'immutable'",
                (Jsonb({"version": "changed"}), actor),
            )
    except psycopg.errors.CheckViolation:
        pass
    else:
        raise AssertionError("DB trigger accepted immutable overwrite")
    try:
        with psycopg.connect(dsn, connect_timeout=5) as connection:
            connection.execute(
                "INSERT INTO lc_backend.documents(user_id, kind, doc_key, payload) VALUES (%s, 'snapshot', 'immutable', %s)",
                (actor, Jsonb({})),
            )
    except psycopg.errors.UniqueViolation:
        pass
    else:
        raise AssertionError("DB accepted duplicate document identity")
    evidence.append("repository immutability, DB immutable trigger and primary-key uniqueness")

    with store.transaction(actor):
        try:
            with psycopg.connect(dsn, connect_timeout=5) as other:
                other.execute("SET LOCAL lock_timeout = '100ms'")
                other.execute("SELECT user_id FROM lc_backend.actors WHERE user_id = %s FOR UPDATE", (actor,))
        except psycopg.errors.LockNotAvailable:
            pass
        else:
            raise AssertionError("actor row lock was not held through the transaction")
    evidence.append("second connection cannot enter locked actor transaction")

    start = Barrier(2)

    def cas():
        start.wait(timeout=5)
        with PostgresStore(dsn).transaction(actor) as tx:
            pid = tx.connection.execute("SELECT pg_backend_pid()").fetchone()[0]
            head = tx.get("head", "note")
            if head["revision"] != 1:
                return "conflict", pid
            tx.put("head", "note", {"revision": 2, "text": "original ink"})
            return "saved", pid

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: cas(), range(2)))
    assert sorted(result[0] for result in results) == ["conflict", "saved"]
    assert len({result[1] for result in results}) == 2
    evidence.append("two independent backend connections CAS: one save, one conflict")

    start = Barrier(2)

    def duplicate():
        start.wait(timeout=5)
        with PostgresStore(dsn).transaction(actor) as tx:
            old = tx.get("event", "same-event")
            if old is not None:
                assert old == {"text": "once", "sequence": 1}
                return "duplicate"
            tx.put("event", "same-event", {"text": "once", "sequence": 1})
            return "accepted"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: duplicate(), range(2)))
    assert sorted(results) == ["accepted", "duplicate"]
    with store.transaction(actor) as tx:
        assert len(tx.scan("event")) == 1
    evidence.append("two-connection immutable event replay: one insert, one duplicate")
    return evidence


def _fixture(store, actor):
    from services.api.domain import Archive

    examples = Path(__file__).resolve().parents[3] / "packages/contracts/examples"
    core = json.loads((examples / "core.json").read_text().replace('"fixture-user"', json.dumps(actor)))
    archive = Archive(store)
    archive.set_authorization(actor)
    archive.import_fixture(actor, core["SourceSnapshot"], core["Frame"], (examples / "frame.svg").read_bytes())
    return archive, core


def _race(left, right):
    start = Barrier(2)

    def run(operation):
        start.wait(timeout=5)
        return operation()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, operation) for operation in (left, right)]
        return [future.result(timeout=30) for future in futures]


def run_domain_checks(store, actor: str) -> list[str]:
    """Use production domain methods. Main always passes a PostgresStore."""
    from services.api.errors import DomainError
    from services.worker.core.budget import Budget
    from services.worker.core.jobs import Jobs

    evidence = []
    archive, core = _fixture(store, actor)

    def events():
        return archive.events(actor, deepcopy(core["EventBatch"]))["acknowledged"][0]["status"]

    assert sorted(_race(events, events)) == ["accepted", "duplicate"]
    evidence.append("domain concurrent EventBatch replay returns exact accepted/duplicate ACKs")
    batch = deepcopy(core["EventBatch"])
    valid = deepcopy(batch["events"][0])
    valid.update(event_id="event-2", device_sequence=2)
    invalid = deepcopy(batch["events"][0])
    invalid.update(event_id="event-conflict", device_sequence=1)
    batch["events"] = [valid, invalid]
    try:
        archive.events(actor, batch)
    except DomainError as exc:
        assert exc.status == 409 and exc.code == "sequence_conflict"
    else:
        raise AssertionError("domain accepted conflicting mixed event batch")
    with store.transaction(actor) as tx:
        assert tx.get("event", "event-2") is None
        assert len(tx.scan("event")) == 1
    evidence.append("domain mixed valid/conflicting EventBatch rolls back completely")

    original = deepcopy(core["NoteRevision"])
    archive.put_note(actor, original["note_id"], original, actor="assistant")

    def revise(title):
        changed = deepcopy(original)
        changed.update(revision=2, base_revision=1, title=title)
        try:
            archive.put_note(actor, changed["note_id"], changed, actor="assistant")
            return "saved"
        except DomainError as exc:
            assert exc.status == 409 and exc.code == "note_revision_conflict"
            return "conflict"

    assert sorted(_race(lambda: revise("revision A"), lambda: revise("revision B"))) == ["conflict", "saved"]
    assert archive.get_note(actor, original["note_id"], revision=1) == original
    assert archive.get_note(actor, original["note_id"])["revision"] == 2
    evidence.append("domain concurrent note CAS preserves revision 1 and commits exactly one revision 2")

    fixed_clock = lambda: datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)
    budget = Budget(store, clock=fixed_clock, prices={("fixture-no-call", "price-test", "fx-test"): 30_000})

    def reserve(request_id):
        try:
            return budget.reserve(actor, request_id, "fixture-no-call", "price-test", "fx-test", 1, 2)
        except DomainError as exc:
            assert exc.status == 409 and exc.code == "budget_exhausted"
            return None

    reservations = _race(lambda: reserve("request-a"), lambda: reserve("request-b"))
    winner = [reservation for reservation in reservations if reservation is not None]
    assert len(winner) == 1 and winner[0]["estimated_max_fen"] == 60_000
    assert winner[0]["budget_month"] == "2026-09"
    usage = budget.usage(actor)
    assert usage["reserved_fen"] == 60_000 and usage["remaining_fen"] == 40_000
    settle = lambda: budget.settle(actor, winner[0]["reservation_id"], 40_000)
    assert all(result["state"] == "settled" for result in _race(settle, settle))
    assert budget.usage(actor)["actual_fen"] == 40_000
    held = budget.reserve(actor, "uncertain", "fixture-no-call", "price-test", "fx-test", 1)
    budget.mark_unknown(actor, held["reservation_id"])
    try:
        budget.release(actor, held["reservation_id"])
    except DomainError as exc:
        assert exc.code == "reconciliation_required"
    else:
        raise AssertionError("unknown execution outcome released its reservation")
    assert budget.usage(actor)["reserved_fen"] == 30_000
    budget.reconcile(actor, held["reservation_id"], evidence="synthetic fixture proves no execution")
    assert budget.usage(actor)["reserved_fen"] == 0
    evidence.append("domain concurrent budget reservation/settlement, retry exposure, LA month and unknown-outcome retention")

    jobs = Jobs(store)

    def enqueue(job_actor, job_id):
        job_archive, job_core = _fixture(store, job_actor)
        source = job_core["SourceSnapshot"]
        refs = [{field: source[field] for field in ("user_id", "source_id", "source_version")}]
        jobs.enqueue(job_actor, job_id, "prepare_explanation", refs, job_id + "-key")
        jobs.begin(job_actor, job_id)
        return job_archive, source["source_id"]

    delete_actor = actor + "-delete"
    deleting_archive, source_id = enqueue(delete_actor, "delete-race")

    def commit_deleted():
        try:
            jobs.commit(delete_actor, "delete-race", "output-race", {"text": "synthetic output"})
            return "committed-before-delete"
        except DomainError as exc:
            assert exc.status in (404, 409)
            return "rejected-after-delete"

    _race(commit_deleted, lambda: deleting_archive.delete_source(delete_actor, source_id))
    with store.transaction(delete_actor) as tx:
        assert tx.get("source", source_id)["deleted"] is True
        assert tx.scan("derived") == []
        assert tx.scan("snapshot") == []
    assert commit_deleted() == "rejected-after-delete"
    evidence.append("domain source deletion races final job commit; no source/output resurrection")

    cancelled_actor = actor + "-cancel"
    enqueue(cancelled_actor, "cancelled-job")
    jobs.cancel(cancelled_actor, "cancelled-job")
    try:
        jobs.commit(cancelled_actor, "cancelled-job", "cancelled-output", {})
    except DomainError as exc:
        assert exc.code == "job_cancelled"
    else:
        raise AssertionError("cancelled job wrote an output")
    revoked_actor = actor + "-revoke"
    revoked_archive, _ = enqueue(revoked_actor, "revoked-job")
    revoked_archive.set_authorization(revoked_actor, False)
    revoked_archive.set_authorization(revoked_actor, True)
    try:
        jobs.commit(revoked_actor, "revoked-job", "revoked-output", {})
    except DomainError as exc:
        assert exc.code == "job_authorization_stale"
    else:
        raise AssertionError("revoked and regranted authorization revived a stale job")
    for user in (cancelled_actor, revoked_actor):
        with store.transaction(user) as tx:
            assert tx.scan("derived") == []
    evidence.append("domain cancelled jobs and stale authorization generations cannot write outputs")
    return evidence


def cleanup(dsn: str, actors: list[str]) -> None:
    import psycopg

    with psycopg.connect(dsn, connect_timeout=5) as connection:
        for actor in actors:
            connection.execute("DELETE FROM lc_backend.documents WHERE user_id = %s", (actor,))
            connection.execute("DELETE FROM lc_backend.actors WHERE user_id = %s", (actor,))


def main() -> int:
    dsn = os.environ.get("LC_TEST_DATABASE_URL")
    if not dsn:
        print("BLOCKED: LC_TEST_DATABASE_URL is absent; real PostgreSQL acceptance is unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(dsn)
        version = verify_test_database(dsn)
    except Exception as exc:
        # Validation is outside the mutation/cleanup block. Never reveal DSN details.
        print("BLOCKED: dedicated local lc_p0_test validation failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    actor = "backend-acceptance-" + uuid4().hex
    cleanup_ok = True
    phase = "storage"
    try:
        evidence = run_storage_checks(dsn, actor)
        phase = "domain/budget/jobs"
        evidence += run_domain_checks(PostgresStore(dsn), actor + "-domain")
        phase = "HTTP process restart"
        from services.api.tests.postgres_http_check import run_http_checks
        evidence += run_http_checks(dsn, actor + "-http")
        phase = "internal process capture"
        from services.api.tests.postgres_capture_check import run_capture_checks
        evidence += run_capture_checks(dsn, actor + "-capture")
    except Exception as exc:
        # psycopg failures may contain credentials/connection details.
        print("FAILED: real PostgreSQL " + phase + " acceptance (" + type(exc).__name__ + ")", file=sys.stderr)
        return 1
    finally:
        try:
            cleanup(dsn, [actor, actor + "-other", actor + "-domain", actor + "-domain-delete",
                          actor + "-domain-cancel", actor + "-domain-revoke", actor + "-http", actor + "-capture",
                          *[actor + "-capture-" + gate + "-" + order for gate in ("stop", "delete")
                            for order in ("capture-first", "fence-first")]])
        except Exception:
            cleanup_ok = False
            print("WARNING: synthetic actor cleanup incomplete", file=sys.stderr)
    if not cleanup_ok:
        print("FAILED: acceptance cleanup did not complete", file=sys.stderr)
        return 1
    for item in evidence:
        print("PASS: " + item)
    print("PostgreSQL version: " + version)
    print("PASS: real PostgreSQL storage/domain/budget/job/HTTP restart/internal capture suite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
