"""Canonical actor-scoped storage. MemoryStore is a test double, never a fallback.

Domain checks and writes must share one transaction. PostgreSQL uses a durable
actor row lock so different connections/processes observe the same ordering.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import json
from threading import Lock, local
from typing import ContextManager, Iterator, Protocol


IMMUTABLE_KINDS = frozenset({
    "snapshot", "frame", "raw_capture_frame", "event", "note_revision", "artifact",
    "capture_record", "capture_binding", "capture_slot", "capture_artifact_ref",
})
_NO_KEY = object()


class ImmutableDocumentError(ValueError):
    """An original record cannot be replaced; write a new version instead."""


class Transaction(Protocol):
    def get(self, kind: str, key: str) -> dict | None: ...
    def put(self, kind: str, key: str, payload: dict) -> None: ...
    def delete(self, kind: str, key: str) -> None: ...
    def scan(self, kind: str) -> list[dict]: ...


class Store(Protocol):
    def transaction(self, user_id: str) -> ContextManager[Transaction]: ...


def _identifier(value: str) -> None:
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError("storage identifiers must be nonempty strings without NUL")


def _payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("document payload must be an object")
    # Match JSONB semantics, rejecting NaN/infinity before opening a write.
    return json.loads(json.dumps(payload, allow_nan=False))


def _same_payload(left: dict, right: dict) -> bool:
    # Python considers True == 1; JSON/JSONB distinguish those values.
    return json.dumps(left, sort_keys=True) == json.dumps(right, sort_keys=True)


class _TransactionBase:
    def __init__(self) -> None:
        self.active = True

    def check(self, kind: str, key=_NO_KEY) -> None:
        if not self.active:
            raise RuntimeError("transaction is closed")
        _identifier(kind)
        if key is not _NO_KEY:
            _identifier(key)

    def check_frame_identity(self, kind: str, key: str) -> None:
        if kind not in {"frame", "raw_capture_frame"}:
            return
        other = "raw_capture_frame" if kind == "frame" else "frame"
        if self.get("frame_tombstone", key) is not None:
            raise ImmutableDocumentError("deleted frame identity cannot be reused")
        if self.get(other, key) is not None:
            raise ImmutableDocumentError("frame identity belongs to another frame kind")


class _MemoryTransaction(_TransactionBase):
    def __init__(self, documents: dict[tuple[str, str], dict]) -> None:
        super().__init__()
        self.documents = documents

    def get(self, kind: str, key: str) -> dict | None:
        self.check(kind, key)
        return deepcopy(self.documents.get((kind, key)))

    def put(self, kind: str, key: str, payload: dict) -> None:
        self.check(kind, key)
        value = _payload(payload)
        self.check_frame_identity(kind, key)
        existing = self.documents.get((kind, key))
        if kind in IMMUTABLE_KINDS and existing is not None and not _same_payload(existing, value):
            raise ImmutableDocumentError("immutable document cannot be replaced")
        self.documents[(kind, key)] = value

    def delete(self, kind: str, key: str) -> None:
        self.check(kind, key)
        self.documents.pop((kind, key), None)

    def scan(self, kind: str) -> list[dict]:
        self.check(kind)
        return [deepcopy(value) for (stored_kind, _), value in sorted(self.documents.items())
                if stored_kind == kind]


class MemoryStore:
    """Explicit test-only, process-local store with isolation and atomic rollback.

    A fresh instance loses all state. Never select this because a DSN is absent.
    """

    test_only = True

    def __init__(self) -> None:
        self._documents: dict[str, dict[tuple[str, str], dict]] = {}
        self._locks: dict[str, Lock] = {}
        self._registry_lock = Lock()
        self._local = local()

    @contextmanager
    def transaction(self, user_id: str) -> Iterator[Transaction]:
        _identifier(user_id)
        if getattr(self._local, "in_transaction", False):
            raise RuntimeError("nested store transactions are not supported")
        with self._registry_lock:
            lock = self._locks.setdefault(user_id, Lock())
        with lock:
            self._local.in_transaction = True
            tx = _MemoryTransaction(deepcopy(self._documents.get(user_id, {})))
            try:
                yield tx
                self._documents[user_id] = tx.documents
            finally:
                tx.active = False
                self._local.in_transaction = False


class _PostgresTransaction(_TransactionBase):
    def __init__(self, connection, user_id: str) -> None:
        super().__init__()
        self.connection = connection
        self.user_id = user_id

    def get(self, kind: str, key: str) -> dict | None:
        self.check(kind, key)
        row = self.connection.execute(
            "SELECT payload FROM lc_backend.documents WHERE user_id = %s AND kind = %s AND doc_key = %s",
            (self.user_id, kind, key),
        ).fetchone()
        return deepcopy(row[0]) if row else None

    def put(self, kind: str, key: str, payload: dict) -> None:
        from psycopg.types.json import Jsonb

        self.check(kind, key)
        value = _payload(payload)
        self.check_frame_identity(kind, key)
        existing = self.get(kind, key) if kind in IMMUTABLE_KINDS else None
        if existing is not None and not _same_payload(existing, value):
            raise ImmutableDocumentError("immutable document cannot be replaced")
        self.connection.execute(
            "INSERT INTO lc_backend.documents(user_id, kind, doc_key, payload) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (user_id, kind, doc_key) DO UPDATE SET payload = EXCLUDED.payload",
            (self.user_id, kind, key, Jsonb(value)),
        )

    def delete(self, kind: str, key: str) -> None:
        self.check(kind, key)
        self.connection.execute(
            "DELETE FROM lc_backend.documents WHERE user_id = %s AND kind = %s AND doc_key = %s",
            (self.user_id, kind, key),
        )

    def scan(self, kind: str) -> list[dict]:
        self.check(kind)
        rows = self.connection.execute(
            "SELECT payload FROM lc_backend.documents WHERE user_id = %s AND kind = %s ORDER BY doc_key",
            (self.user_id, kind),
        ).fetchall()
        return [deepcopy(row[0]) for row in rows]


class PostgresStore:
    """Durable store; each transaction gets a connection and actor row lock.

    Holding this user-wide lock is intentional for P0 correctness. Do not perform
    network/provider calls in a transaction. There is no automatic memory fallback.
    """

    test_only = False

    def __init__(self, dsn: str) -> None:
        if not isinstance(dsn, str) or not dsn.strip():
            raise ValueError("a PostgreSQL DSN is required")
        self._dsn = dsn
        self._local = local()

    @contextmanager
    def transaction(self, user_id: str) -> Iterator[Transaction]:
        import psycopg

        _identifier(user_id)
        if getattr(self._local, "in_transaction", False):
            raise RuntimeError("nested store transactions are not supported")
        self._local.in_transaction = True
        try:
            with psycopg.connect(self._dsn, connect_timeout=5) as connection:
                # A fresh snapshot after waiting for the actor lock is required.
                connection.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
                connection.execute(
                    "INSERT INTO lc_backend.actors(user_id) VALUES (%s) ON CONFLICT DO NOTHING", (user_id,)
                )
                connection.execute(
                    "SELECT user_id FROM lc_backend.actors WHERE user_id = %s FOR UPDATE", (user_id,)
                ).fetchone()
                tx = _PostgresTransaction(connection, user_id)
                try:
                    yield tx
                finally:
                    tx.active = False
        finally:
            self._local.in_transaction = False
