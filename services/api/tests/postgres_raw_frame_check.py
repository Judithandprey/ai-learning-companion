"""Bounded real-DB checks invoked only by postgres_check --raw-frames-only.

Reuse the existing dedicated-database validation, migration and actor cleanup.
No HTTP process, listener, provider or native device is involved.
"""

from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256

from services.api.domain import key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.migrations import migrate
from services.api.original_artifacts import OriginalArtifacts
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import PostgresStore
from services.api.tests.test_control import control_fixture
from services.api.tests.test_image_resolver import png


def run_raw_frame_checks(dsn, actor):
    import psycopg
    from psycopg.types.json import Jsonb

    changed = migrate(dsn)
    assert migrate(dsn) == []
    store = PostgresStore(dsn)
    c = control_fixture(store, actor)
    legacy_before = c.archive.export_learning_snapshot(actor, [c.core["SourceSnapshot"]["source_id"]])
    source = c.registry.register_display_source(actor, "raw-db-display", c.batch["stream_id"])
    source_ref = {k: source[k] for k in ("user_id", "source_id", "source_version")}
    data = png()
    ref = {"artifact_id": "raw-db-png", "sha256": sha256(data).hexdigest(),
           "byte_length": len(data), "media_type": "image/png"}
    guard = lambda state: None  # Explicit synthetic caller, not HTTP identity acceptance.
    originals = OriginalArtifacts(store, guard, display_authority_resolver=c.registry.resolve_capture)
    originals.put(actor, source_ref, "screen_image", ref, data)
    raw = {"contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": "raw-db-frame",
           "source": source_ref, **{k: c.batch[k] for k in ("device_id", "session_id", "stream_id")},
           "artifact": ref, "raw_width": 2, "raw_height": 2, "buffer_sequence": 77,
           "captured_at": None, "media_position": None,
           "timing": {"observed_at_estimate": None, "estimate_basis": None,
                      "uncertainty_ms": None, "callback_clock": None, "sample_pts_seconds": -0.125},
           "orientation": {"system": "CGImagePropertyOrientation", "value": 7, "applied_to_pixels": False}}
    record = c.batch["records"][0]
    record.update(source=source_ref, frame_id=raw["frame_id"], artifacts=[ref],
                  observed_at=None, media_position=None, clock=None)
    ack = c.registry.ingest_raw_frames(actor, c.batch, [raw], "raw-db-1")
    assert c.registry.ingest_raw_frames(actor, c.batch, [raw], "raw-db-1") == ack
    fresh = PostgresStore(dsn)
    context = AuthorizedProcessContextReader(fresh, actor, guard).read_raw([record["record_id"]])
    assert context["frames"] == [raw] and context["batch"]["records"] == [record]
    result = AuthorizedImageResolver(fresh, actor, guard).resolve_raw(raw, max_bytes=len(data))
    assert result == {"status": "available", "frame": raw, "data": data, "media_type": "image/png"}
    assert c.archive.export_learning_snapshot(actor, [c.core["SourceSnapshot"]["source_id"]]) == legacy_before
    evidence = ["migration apply/replay: " + (", ".join(changed) or "already applied"),
                "fresh PostgreSQL connections retain exact raw metadata, PNG, ACK and unrelated legacy export"]

    def sql_refused(statement, parameters, expected):
        try:
            with psycopg.connect(dsn) as connection:
                connection.execute(statement, parameters)
        except expected:
            return
        raise AssertionError("SQL immutable/lifecycle fence was bypassed")

    changed_raw = deepcopy(raw)
    changed_raw["orientation"]["value"] = 1
    sql_refused("UPDATE lc_backend.documents SET payload = %s WHERE user_id = %s AND kind = 'raw_capture_frame' AND doc_key = %s",
                (Jsonb(changed_raw), actor, raw["frame_id"]), psycopg.errors.CheckViolation)
    insert = "INSERT INTO lc_backend.documents(user_id,kind,doc_key,payload) VALUES (%s,%s,%s,%s)"
    sql_refused(insert, (actor, "frame", raw["frame_id"], Jsonb(c.core["Frame"])), psycopg.errors.UniqueViolation)
    sql_refused(insert, (actor, "raw_capture_frame", c.core["Frame"]["frame_id"], Jsonb(raw)),
                psycopg.errors.UniqueViolation)
    evidence.append("SQL immutable update and both-order legacy/raw global-ID collisions refused")

    next_batch, next_raw = deepcopy(c.batch), deepcopy(raw)
    next_raw["frame_id"] = "rolled-back-raw"
    next_record = next_batch["records"][0]
    next_record.update(record_id="rolled-back-record", sequence=2, frame_id=next_raw["frame_id"])

    class LateFailureStore(PostgresStore):
        @contextmanager
        def transaction(self, owner):
            with super().transaction(owner) as tx:
                put = tx.put

                def fail(kind, identity, payload):
                    put(kind, identity, payload)
                    if kind == "capture_record":
                        raise RuntimeError("synthetic late transaction failure")

                tx.put = fail
                yield tx

    from services.api.control import ControlRegistry
    failed = ControlRegistry(LateFailureStore(dsn), scopes=c.registry.scopes,
                             capabilities=c.registry.capabilities, authorization_guard=guard)
    try:
        failed.ingest_raw_frames(actor, next_batch, [next_raw], "raw-db-failed")
    except RuntimeError:
        pass
    else:
        raise AssertionError("late transaction failure did not abort")
    with fresh.transaction(actor) as tx:
        assert tx.get("raw_capture_frame", next_raw["frame_id"]) is None
        assert tx.get("capture_record", next_record["record_id"]) is None
        assert tx.get("capture_slot", key(c.batch["device_id"], c.batch["stream_id"], 2)) is None
        assert tx.get("capture_replay", key("internal_raw_capture_frames", "raw-db-failed")) is None
        assert tx.get("raw_capture_frame", raw["frame_id"]) == raw
    evidence.append("late process-row failure rolls back raw frame, record, slot and replay atomically")

    # Review found that a new child could previously recreate a lost ancestor
    # pin. Remove only this runner's actor-owned pin and verify fail-closed state.
    with fresh.transaction(actor) as tx:
        tx.delete("capture_artifact_ref", ref["artifact_id"])
    next_record["causal_parents"] = [record["record_id"]]
    try:
        c.registry.ingest_raw_frames(actor, next_batch, [next_raw], "raw-db-lost-parent-pin")
    except DomainError as error:
        assert (error.status, error.code) == (503, "unavailable")
    else:
        raise AssertionError("child restored a lost committed artifact pin")
    with fresh.transaction(actor) as tx:
        assert tx.get("capture_artifact_ref", ref["artifact_id"]) is None
        assert tx.get("raw_capture_frame", next_raw["frame_id"]) is None
        assert tx.get("capture_record", next_record["record_id"]) is None
        assert tx.get("capture_replay", key("internal_raw_capture_frames", "raw-db-lost-parent-pin")) is None
    evidence.append("new child refuses a missing committed ancestor pin without restoring or partially writing data")

    c.archive.delete_source(actor, source["source_id"])
    with fresh.transaction(actor) as tx:
        assert tx.get("raw_capture_frame", raw["frame_id"]) is None
        assert tx.get("artifact", ref["artifact_id"]) is None
        assert tx.get("frame_tombstone", raw["frame_id"]) == {"frame_id": raw["frame_id"]}
    for kind in ("frame", "raw_capture_frame"):
        sql_refused(insert, (actor, kind, raw["frame_id"], Jsonb(raw)), psycopg.errors.CheckViolation)
    assert c.archive.export_learning_snapshot(actor, [c.core["SourceSnapshot"]["source_id"]]) == legacy_before
    evidence.append("source deletion and shared SQL tombstone prevent both frame kinds from reviving; legacy export unchanged")
    return evidence
