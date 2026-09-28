from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from services.api.storage import IMMUTABLE_KINDS, ImmutableDocumentError, MemoryStore, PostgresStore


def test_actor_isolation_and_read_write_copies():
    store = MemoryStore()
    payload = {"id": "shared", "nested": {"ink": [1, 2]}}
    with store.transaction("alice") as tx:
        tx.put("head", "shared", payload)
        payload["nested"]["ink"].append(3)
        copy = tx.get("head", "shared")
        copy["nested"]["ink"].append(4)
        tx.scan("head")[0]["nested"]["ink"].append(5)
        assert tx.get("head", "shared")["nested"]["ink"] == [1, 2]
    with store.transaction("bob") as tx:
        assert tx.get("head", "shared") is None
        assert tx.scan("head") == []
        tx.put("head", "shared", {"id": "bob"})
    with store.transaction("alice") as tx:
        assert tx.get("head", "shared")["id"] == "shared"


def test_failed_batch_rolls_back_updates_inserts_and_deletes():
    store = MemoryStore()
    with store.transaction("alice") as tx:
        tx.put("head", "old", {"revision": 1})
        tx.put("event", "original", {"text": "original"})
    with pytest.raises(RuntimeError, match="invalid batch"):
        with store.transaction("alice") as tx:
            tx.put("head", "old", {"revision": 2})
            tx.delete("event", "original")
            tx.put("event", "new", {"text": "new"})
            raise RuntimeError("invalid batch")
    with store.transaction("alice") as tx:
        assert tx.get("head", "old") == {"revision": 1}
        assert tx.get("event", "original") == {"text": "original"}
        assert tx.get("event", "new") is None


@pytest.mark.parametrize("kind", sorted(IMMUTABLE_KINDS))
def test_originals_allow_exact_replay_but_reject_overwrite(kind):
    store = MemoryStore()
    with store.transaction("alice") as tx:
        tx.put(kind, "record", {"original": [1, 2]})
        tx.put(kind, "record", {"original": [1, 2]})
    with pytest.raises(ImmutableDocumentError):
        with store.transaction("alice") as tx:
            tx.put(kind, "record", {"original": [9]})
    with store.transaction("alice") as tx:
        assert tx.get(kind, "record") == {"original": [1, 2]}
        tx.delete(kind, "record")
        assert tx.get(kind, "record") is None


def test_transaction_cannot_be_reused_after_commit_or_failure():
    store = MemoryStore()
    with store.transaction("alice") as tx:
        tx.put("head", "first", {})
    with pytest.raises(RuntimeError, match="closed"):
        tx.put("head", "late", {})
    with pytest.raises(RuntimeError, match="failure"):
        with store.transaction("alice") as failed:
            raise RuntimeError("failure")
    with pytest.raises(RuntimeError, match="closed"):
        failed.get("head", "first")


def test_boolean_cannot_replace_original_numeric_value():
    store = MemoryStore()
    with store.transaction("alice") as tx:
        tx.put("event", "event", {"value": 1})
    with pytest.raises(ImmutableDocumentError):
        with store.transaction("alice") as tx:
            tx.put("event", "event", {"value": True})


def test_nested_transactions_fail_without_discarding_outer_writes():
    store = MemoryStore()
    with store.transaction("alice") as tx:
        tx.put("head", "value", {"revision": 1})
        with pytest.raises(RuntimeError, match="nested"):
            with store.transaction("alice"):
                pass
    with store.transaction("alice") as tx:
        assert tx.get("head", "value") == {"revision": 1}


def test_concurrent_actor_updates_do_not_lose_writes():
    store = MemoryStore()
    start = Barrier(8)
    with store.transaction("alice") as tx:
        tx.put("budget", "month", {"reserved": 0})

    def reserve():
        start.wait(timeout=5)
        for _ in range(20):
            with store.transaction("alice") as tx:
                record = tx.get("budget", "month")
                record["reserved"] += 1
                tx.put("budget", "month", record)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: reserve(), range(8)))
    with store.transaction("alice") as tx:
        assert tx.get("budget", "month")["reserved"] == 160


def test_invalid_payload_cannot_leave_partial_writes():
    store = MemoryStore()
    with pytest.raises(ValueError):
        with store.transaction("alice") as tx:
            tx.put("head", "valid", {})
            tx.put("head", "bad", {"cost": float("nan")})
    with store.transaction("alice") as tx:
        assert tx.scan("head") == []
    with pytest.raises(ValueError, match="DSN"):
        PostgresStore("")
