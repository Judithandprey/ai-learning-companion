"""Internal legacy archive extraction, not a persisted archive or HTTP interface.

The caller supplies authenticated identity/authorization_guard and must reacquire
before later use: detached data is not an enduring authorization grant.
"""

import base64
from copy import deepcopy
import hashlib

from jsonschema import ValidationError

from packages.contracts import validate
from services.api.domain import checked, key
from services.api.errors import DomainError


def _require(condition):
    if not condition:
        raise DomainError(503, "unavailable")


def _records(tx, user_id, selected, kind, schema, identity):
    result, seen = {}, set()
    for row in tx.scan(kind):
        # Unclassifiable corruption cannot be silently omitted. No other store
        # kinds (notes/help/process capture) are scanned or exported here.
        try:
            validate("Identifier", row.get("source_id"))
        except (ValidationError, ValueError, TypeError):
            raise DomainError(503, "unavailable") from None
        try:
            validate(schema, row)
        except (ValidationError, ValueError, TypeError, RecursionError):
            raise DomainError(503, "unavailable") from None
        record_id = identity(row)
        _require(row["user_id"] == user_id and record_id not in seen)
        _require(tx.get(kind, record_id) == row)
        seen.add(record_id)
        source = tx.get("source", row["source_id"])
        _require(source is not None and source.get("user_id") == user_id
                 and source.get("source_id") == row["source_id"])
        if row["source_id"] in selected:
            result[record_id] = row
    return result


def export_learning_snapshot(archive, user_id, source_ids):
    checked("Identifier", user_id)
    if not isinstance(source_ids, (list, tuple)) or not source_ids:
        raise DomainError(422, "invalid_contract")
    source_ids = tuple(source_ids)
    for source_id in source_ids:
        checked("Identifier", source_id)
    if len(set(source_ids)) != len(source_ids):
        raise DomainError(422, "invalid_contract")

    with archive.store.transaction(user_id) as tx:
        archive._authorized(tx)
        selected = {}
        for source_id in source_ids:
            source = tx.get("source", source_id)
            if source is None or source.get("user_id") != user_id or source.get("source_id") != source_id:
                raise DomainError(404, "source_not_found")
            _require(type(source.get("deleted")) is bool and type(source.get("revoked")) is bool)
            archive._source(tx, source_id)
            try:
                validate("SourceRecord", archive._registration(source))
            except (ValidationError, ValueError, TypeError, KeyError, RecursionError):
                raise DomainError(503, "unavailable") from None
            selected[source_id] = source
        sources = _records(tx, user_id, selected, "snapshot", "SourceSnapshot",
                           lambda row: key(row["source_id"], row["source_version"]))
        frames = _records(tx, user_id, selected, "frame", "Frame", lambda row: row["frame_id"])
        observations = _records(tx, user_id, selected, "event", "Observation", lambda row: row["event_id"])

        versions = {}
        for source in sources.values():
            identity = source["source_id"], source["source_version"]
            _require(identity not in versions)
            versions[identity] = source
            try:
                digest = hashlib.sha256(source["text"].encode("utf-8")).hexdigest()
            except UnicodeError:
                raise DomainError(503, "unavailable") from None
            _require(digest == source["content_hash"])
        for source_id, head in selected.items():
            if head.get("current_version") is None:
                _require(not any(row["source_id"] == source_id for row in sources.values()))
                # A URL registration has no materialized source to hand off.
                raise DomainError(404, "reference_not_found")
            _require((source_id, head["current_version"]) in versions)

        artifacts = {}
        for record in [*frames.values(), *observations.values()]:
            _require((record["source_id"], record["source_version"]) in versions)
            for kind in ("device", "session"):
                owned = tx.get(kind, record[kind + "_id"])
                _require(owned is not None and owned.get("user_id") == user_id
                         and owned.get("id") == record[kind + "_id"])
        for frame in frames.values():
            artifact_id = frame["artifact_id"]
            artifact = tx.get("artifact", artifact_id)
            _require(artifact is not None and artifact.get("user_id") == user_id
                     and artifact.get("id") == artifact_id and artifact.get("kind") == "frame")
            try:
                data = base64.b64decode(artifact["data_base64"], validate=True)
            except (KeyError, TypeError, ValueError):
                raise DomainError(503, "unavailable") from None
            _require(hashlib.sha256(data).hexdigest() == artifact.get("content_hash") == frame["content_hash"])
            artifacts[artifact_id] = data

        sequences = set()
        for event_id, event in observations.items():
            sequence = event["device_id"], event["device_sequence"]
            _require(sequence not in sequences)
            sequences.add(sequence)
            receipt = tx.get("event_sequence", key(*sequence))
            _require(receipt is not None and receipt.get("event_id") == event_id and receipt.get("key") == key(*sequence))
            if event["frame_id"] is not None:
                frame = frames.get(event["frame_id"])
                _require(frame is not None and all(event[k] == frame[k] for k in
                         ("source_id", "source_version", "device_id", "session_id", "media_position")))
            if event["correction_of"] is not None:
                parent = observations.get(event["correction_of"])
                _require(parent is not None and parent["source_id"] == event["source_id"]
                         and parent["actor"] == event["actor"])
        # Existing ingest allows equal/backdated capture clocks. Verify actual
        # dependency edges, not a new timestamp-order rule or latest-only view.
        done = set()
        for event_id in observations:
            path = set()
            current = event_id
            while current is not None and current not in done:
                _require(current not in path)
                path.add(current)
                current = observations[current]["correction_of"]
            done.update(path)
        result = deepcopy({"sources": list(sources.values()), "frames": list(frames.values()),
                           "observations": list(observations.values()), "artifacts": artifacts})
    return result
