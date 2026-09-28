"""Bounded observer control-flow tests; PostgreSQL proof is in the real runner."""

from types import SimpleNamespace

import pytest

from services.api.tests import postgres_capture_check as checks


def test_observer_rejects_stale_transaction_snapshot():
    with pytest.raises(AssertionError, match="fresh snapshots"):
        checks._wait_for_actor_lock(SimpleNamespace(autocommit=False), "owned-tag", 17)


def test_observer_requires_database_evidence_before_return(monkeypatch):
    rows = iter([None, (23, "transactionid", "901", [17])])
    queries, pauses = [], []

    def execute(query, parameters):
        queries.append(parameters)
        return SimpleNamespace(fetchone=lambda: next(rows))

    monkeypatch.setattr(checks, "sleep", pauses.append)
    observer = SimpleNamespace(autocommit=True, execute=execute)
    assert checks._wait_for_actor_lock(observer, "owned-tag", 17) == {
        "holder_pid": 17, "waiter_pid": 23, "wait_event": "transactionid",
        "transaction_id": "901", "blocking_pids": [17],
    }
    assert len(queries) == 2 and len(pauses) == 1
    assert all(values == ("owned-tag", 17, 17, 17) for values in queries)


def test_observer_deadline_expires_without_fabricating_a_wait(monkeypatch):
    ticks = iter([10, 10.01, 10.05])
    queries, pauses = [], []
    monkeypatch.setattr(checks, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(checks, "sleep", pauses.append)

    def execute(query, parameters):
        queries.append(parameters)
        return SimpleNamespace(fetchone=lambda: None)

    observer = SimpleNamespace(autocommit=True, execute=execute)
    with pytest.raises(TimeoutError, match="actor lock wait was not observed"):
        checks._wait_for_actor_lock(observer, "owned-tag", 17, timeout=0.05)
    assert len(queries) == 2 and len(pauses) == 1


def test_observer_error_is_preserved_without_retry(monkeypatch):
    failure = PermissionError("synthetic observation denial")

    def execute(*args):
        raise failure

    monkeypatch.setattr(checks, "sleep", lambda _: pytest.fail("unexpected retry"))
    with pytest.raises(PermissionError) as caught:
        checks._wait_for_actor_lock(SimpleNamespace(autocommit=True, execute=execute), "owned-tag", 17)
    assert caught.value is failure


def test_session_close_waits_for_server_removal(monkeypatch):
    counts, pauses = iter([2, 1, 0]), []
    monkeypatch.setattr(checks, "sleep", pauses.append)

    def execute(query, parameters):
        assert parameters == ([17, 23],)
        return SimpleNamespace(fetchone=lambda: (next(counts),))

    checks._wait_for_sessions_closed(SimpleNamespace(autocommit=True, execute=execute), [17, 23])
    assert len(pauses) == 2


def test_session_close_failure_is_bounded(monkeypatch):
    ticks = iter([10, 15])
    monkeypatch.setattr(checks, "monotonic", lambda: next(ticks))
    observer = SimpleNamespace(autocommit=True, execute=lambda *args: SimpleNamespace(fetchone=lambda: (1,)))
    with pytest.raises(TimeoutError, match="worker sessions did not close"):
        checks._wait_for_sessions_closed(observer, [17, 23])
