"""Bounded local-runtime checks on existing dedicated PostgreSQL, without migrations.

Supply LC_TEST_DATABASE_URL through the operator's existing private handoff.
Run from the worktree with its locked Python and runpy.run_path(..., run_name='__main__').
All request metadata comes from a separate MemoryStore; the tested target is
PostgresStore. No listener, preview database, provider or actual capture starts.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
import sys
from threading import Barrier
from uuid import uuid4

from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.storage import MemoryStore, PostgresStore
from services.api.tests.postgres_capture_check import _state
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.test_capture_app import (
    context, ingress_success, original_body, original_path, request, state,
)
from services.api.tests.test_capture_runtime import TOKEN, options, register, stopped, uploaded


def fixture(dsn, actor):
    c = context(MemoryStore(), actor)
    c.store = PostgresStore(dsn)
    c.instant = [datetime.now(timezone.utc)]
    del c.registry, c.archive
    return c


def runtime(c, **changes):
    return create_local_capture_runtime(**{
        **options(c), "expires_at": c.instant[0] + timedelta(hours=1), **changes,
    })


def refused(c, operation):
    before = _state(c.store, c.user)
    try:
        operation()
    except DomainError as exc:
        assert (exc.status, exc.code) == (403, "forbidden")
    else:
        raise AssertionError("restricted bootstrap unexpectedly succeeded")
    assert _state(c.store, c.user) == before


def checks(dsn, actors):
    c = fixture(dsn, actors[0])
    with c.store.transaction(c.user) as tx:
        assert tx.is_empty() is True
    refused(c, lambda: runtime(c))
    pending = runtime(c, fresh_consent=True)
    assert pending.start_status == "pending" and pending.current_state is None
    with c.store.transaction(c.user) as tx:
        assert tx.is_empty() is False
        assert len(tx.scan("control_start")) == 1
        assert tx.scan("control_stream") == []
        assert tx.get("session", c.registration["session_id"])["live_capture"] is False
    before = _state(c.store, c.user)
    c.store = PostgresStore(dsn)
    assert runtime(c).start_status == "pending"
    assert _state(c.store, c.user) == before
    print("PASS: PostgreSQL is_empty and atomic fresh-consent pending bootstrap; fresh-store reopen adds no grant", flush=True)

    descriptor = uploaded(c, pending)
    before = _state(c.store, c.user)
    c.store = PostgresStore(dsn)
    reopened = runtime(c)
    assert reopened.start_status == "consumed"
    assert state(register(c, reopened), "live") == reopened.current_state
    assert ingress_success(request(reopened.app, "GET", c.display_path, token=TOKEN), "DisplaySourceSnapshot") == descriptor
    for ink in (False, True):
        body = original_body(c, ink=ink)
        assert ingress_success(request(reopened.app, "GET", original_path(c, body["artifact"]["artifact_id"]),
                                       token=TOKEN), "OriginalArtifactUpload") == body
    assert _state(c.store, c.user) == before
    terminal = stopped(c, reopened)
    before = _state(c.store, c.user)
    for consent in (False, True):
        c.store = PostgresStore(dsn)
        current = runtime(c, fresh_consent=consent)
        assert current.start_status == "consumed" and current.current_state == terminal
        assert state(register(c, current), "stopped") == terminal
    assert _state(c.store, c.user) == before
    Archive(c.store).set_authorization(c.user, False)
    for consent in (False, True):
        refused(c, lambda: runtime(c, fresh_consent=consent))
    print("PASS: PostgreSQL ASGI registration/display/PNG/editable-ink readback and stopped/revoked reopen fences", flush=True)

    concurrent = fixture(dsn, actors[1])
    barrier = Barrier(2)

    def bootstrap():
        barrier.wait(timeout=5)
        return runtime(concurrent, store=PostgresStore(dsn), fresh_consent=True)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(bootstrap) for _ in range(2)]
        results = [future.result(timeout=30) for future in futures]
    assert all(result.start_status == "pending" and result.current_state is None for result in results)
    with concurrent.store.transaction(concurrent.user) as tx:
        assert len(tx.scan("control_start")) == 1 and len(tx.scan("control_membership")) == 1
        assert tx.scan("control_stream") == [] and tx.get("authorization", "state")["generation"] == 1
    print("PASS: concurrent exact setup on separate PostgreSQL connections retains one pending grant and original generations", flush=True)

    class LostResponseStore(PostgresStore):
        @contextmanager
        def transaction(self, actor):
            with super().transaction(actor) as tx:
                yield tx
            raise RuntimeError("synthetic response loss after commit")

    lost = fixture(dsn, actors[2])
    try:
        runtime(lost, store=LostResponseStore(dsn), fresh_consent=True)
    except RuntimeError as exc:
        assert str(exc) == "synthetic response loss after commit"
    else:
        raise AssertionError("synthetic lost response did not propagate")
    before = _state(lost.store, lost.user)
    assert runtime(lost).start_status == "pending"
    assert _state(lost.store, lost.user) == before
    print("PASS: committed setup with lost response reconciles read-only on a fresh connection", flush=True)

    damaged = fixture(dsn, actors[3])
    with damaged.store.transaction(damaged.user) as tx:
        tx.put("retained_unknown_kind", "original", {"original": "synthetic retained fact"})
        assert tx.is_empty() is False
    refused(damaged, lambda: runtime(damaged, fresh_consent=True))
    print("PASS: missing authorization plus retained arbitrary facts refuses bootstrap without repair or data change", flush=True)

    class AbortStore(PostgresStore):
        @contextmanager
        def transaction(self, actor):
            with super().transaction(actor) as tx:
                yield tx
                raise RuntimeError("synthetic pre-commit bootstrap failure")

    aborted = fixture(dsn, actors[4])
    try:
        runtime(aborted, store=AbortStore(dsn), fresh_consent=True)
    except RuntimeError as exc:
        assert str(exc) == "synthetic pre-commit bootstrap failure"
    else:
        raise AssertionError("synthetic bootstrap abort did not propagate")
    with aborted.store.transaction(aborted.user) as tx:
        assert tx.is_empty() is True
    assert runtime(aborted, fresh_consent=True).start_status == "pending"
    print("PASS: failed PostgreSQL bootstrap rolls back every identity/grant; explicit consent retry succeeds", flush=True)


def main():
    if not os.environ.get("LC_TEST_DATABASE_URL"):
        print("BLOCKED: LC_TEST_DATABASE_URL absent", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(os.environ["LC_TEST_DATABASE_URL"])
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated local database validation (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    prefix = "backend-runtime-" + uuid4().hex
    actors = [prefix + "-" + suffix for suffix in ("core", "concurrent", "lost", "damaged", "rollback")]
    successful = False
    try:
        checks(dsn, actors)
        successful = True
    except Exception as exc:
        print("FAILED: runtime PostgreSQL checks (" + type(exc).__name__ + ")", file=sys.stderr)
    finally:
        try:
            cleanup(dsn, actors)
        except Exception:
            successful = False
            print("FAILED: exact synthetic actor cleanup", file=sys.stderr)
    if not successful:
        return 1
    print("PASS: six focused runtime groups; exact synthetic actors cleaned; PostgreSQL " + version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
