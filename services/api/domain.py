"""Authoritative source archive. Every cross-reference is checked under one user lock.

Fixture ingestion and identity lifecycle are controlled Python entry points, not
unauthenticated HTTP routes. No method starts capture, fetches a URL or calls AI.
"""

import base64
import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlsplit
from uuid import uuid4

from jsonschema import ValidationError
from packages.contracts import validate
from services.api.errors import DomainError


def utc_now():
    return datetime.now(timezone.utc)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def key(*parts):
    # JSON tuple avoids ambiguous composite keys when IDs themselves contain ':'.
    return json.dumps(parts, separators=(",", ":"))


def checked(name, value):
    try:
        validate(name, value)
    except (ValidationError, ValueError, TypeError):
        raise DomainError(422, "invalid_contract") from None


class Archive:
    def __init__(self, store, clock=None, authorization_guard=None):
        self.store = store
        self.clock = clock or utc_now
        self.authorization_guard = authorization_guard

    def _authorized(self, tx):
        state = tx.get("authorization", "state")
        if not state or not state["enabled"]:
            raise DomainError(403, "authorization_revoked")
        if self.authorization_guard:
            self.authorization_guard(state)

    def set_authorization(self, user_id, enabled=True):
        """Local administrator hook; tokens must bind the returned generation."""
        checked("Identifier", user_id)
        with self.store.transaction(user_id) as tx:
            old = tx.get("authorization", "state")
            state = {"enabled": bool(enabled), "generation": (old or {}).get("generation", 0) + 1}
            from services.api.control import invalidate_control
            invalidate_control(tx)
            tx.put("authorization", "state", state)
            return state

    @staticmethod
    def _source(tx, source_id):
        source = tx.get("source", source_id)
        if not source or source["deleted"]:
            raise DomainError(404, "source_not_found")
        if source["revoked"]:
            raise DomainError(403, "source_revoked")
        return source

    @staticmethod
    def _owned(tx, kind, record_id):
        record = tx.get(kind, record_id)
        if record is None:
            raise DomainError(404, "reference_not_found")
        return record

    @staticmethod
    def _identity(user_id, payload):
        if payload["user_id"] != user_id:
            raise DomainError(403, "identity_mismatch")

    @staticmethod
    def _registration(source):
        from services.api.display_sources import require_legacy
        require_legacy(source)
        return {k: source[k] for k in ("user_id", "source_id", "original_url", "canonical_url",
                                       "project_id", "connection_id", "type", "access_status",
                                       "current_version", "created_at", "updated_at")}

    def _timestamp(self):
        return self.clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _replay(tx, cache_key, request_hash):
        cached = tx.get("http_replay", cache_key)
        if cached:
            if cached.get("deleted"):
                raise DomainError(410, "request_deleted")
            if cached["fingerprint"] != request_hash:
                raise DomainError(409, "idempotency_conflict")
            for sid in cached["source_ids"]:
                Archive._source(tx, sid)
        return cached

    @staticmethod
    def _cache(tx, cache_key, request_hash, response, source_ids):
        tx.put("http_replay", cache_key,
               {"key": cache_key, "fingerprint": request_hash, "response": response,
                "source_ids": sorted(set(source_ids)), "deleted": False})

    def register(self, user_id, original_url, project_id, idempotency_key,
                 source_type="web", connection_id=None, return_receipt=False):
        checked("Identifier", idempotency_key)
        if not isinstance(original_url, str):
            raise DomainError(422, "invalid_url")
        try:
            url = urlsplit(original_url)
            if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
                raise ValueError()
        except ValueError:
            raise DomainError(422, "invalid_url") from None
        checked("SourceRegistrationRequest", {"original_url": original_url, "project_id": project_id,
                                               "type": source_type, "connection_id": connection_id})
        request_hash = fingerprint([original_url, project_id, source_type, connection_id])
        cache_key = key("POST", "/v1/sources", idempotency_key)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            cached = self._replay(tx, cache_key, request_hash)
            if cached:
                result = cached["response"]
                return (result, False) if return_receipt else (result["source"], False)
            if project_id is not None:
                checked("Identifier", project_id)
                self._owned(tx, "project", project_id)
            if connection_id is not None:
                connection = self._owned(tx, "connection", connection_id)
                if not connection.get("enabled"):
                    raise DomainError(403, "connection_revoked")
            url_record = tx.get("source_url", request_hash)
            if url_record:
                source = self._source(tx, url_record["source_id"])
                created = False
            else:
                source = {"user_id": user_id, "source_id": str(uuid4()),
                          "original_url": original_url, "project_id": project_id,
                          "canonical_url": original_url, "type": source_type, "connection_id": connection_id,
                          "created_at": self._timestamp(), "updated_at": self._timestamp(),
                          "access_status": "registered", "current_version": None,
                          "deleted": False, "revoked": False, "generation": 1}
                tx.put("source", source["source_id"], source)
                tx.put("source_url", request_hash, {"key": request_hash, "source_id": source["source_id"]})
                created = True
            result = self._registration(source)
            receipt = {"source": result, "already_exists": not created, "job_id": None}
            self._cache(tx, cache_key, request_hash, receipt, [source["source_id"]])
            return (receipt, created) if return_receipt else (result, created)

    def get_source(self, user_id, source_id):
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            return self._registration(self._source(tx, source_id))

    def read_source(self, user_id, source_id):
        from services.api.display_sources import require_legacy
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            source = self._registration(self._source(tx, source_id))
            versions = []
            for snapshot in tx.scan("snapshot"):
                if snapshot["source_id"] == source_id:
                    require_legacy(snapshot)
                    versions.append(snapshot["source_version"])
            return {"source": source, "snapshot_versions": sorted(versions)}

    def _snapshot(self, tx, source_id, version):
        from services.api.display_sources import require_legacy
        require_legacy(self._source(tx, source_id))
        snapshot = self._owned(tx, "snapshot", key(source_id, version))
        require_legacy(snapshot)
        return snapshot

    def get_snapshot(self, user_id, source_id, version):
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            return self._snapshot(tx, source_id, version)

    def export_learning_snapshot(self, user_id, source_ids):
        """Detached legacy originals from one currently authorized transaction."""
        from services.api.learning_snapshot import export_learning_snapshot
        return export_learning_snapshot(self, user_id, source_ids)

    @staticmethod
    def _immutable(tx, kind, record_key, payload):
        if kind == "artifact" and tx.get("original_artifact_tombstone", record_key):
            raise DomainError(404, "original_not_found")
        if kind == "frame" and tx.get("frame_tombstone", record_key):
            raise DomainError(404, "frame_not_found")
        old = tx.get(kind, record_key)
        if old is not None and old != payload:
            raise DomainError(409, "immutable_conflict")
        if old is None:
            tx.put(kind, record_key, payload)

    def import_fixture(self, user_id, snapshot, frame, artifact_bytes):
        """Import checked synthetic fixtures only; not a production capture API."""
        from services.api.display_sources import require_legacy
        checked("SourceSnapshot", snapshot)
        checked("Frame", frame)
        self._identity(user_id, snapshot)
        self._identity(user_id, frame)
        if (snapshot["type"] != "synthetic" or snapshot["provenance"]["origin"] != "synthetic"
                or snapshot["provenance"]["consent_scope"] != "test_only"
                or frame["representation"] != "synthetic_fixture" or snapshot["connection_id"] is not None):
            raise DomainError(422, "fixture_only")
        if (hashlib.sha256(snapshot["text"].encode()).hexdigest() != snapshot["content_hash"]
                or hashlib.sha256(artifact_bytes).hexdigest() != frame["content_hash"]):
            raise DomainError(422, "hash_mismatch")
        if any(snapshot[k] != frame[k] for k in ("source_id", "source_version")):
            raise DomainError(422, "frame_source_mismatch")
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            sid = snapshot["source_id"]
            source = tx.get("source", sid)
            if source:
                self._source(tx, sid)
                require_legacy(source)
                if source["original_url"] != snapshot["original_url"] or source["project_id"] != snapshot["project_id"]:
                    raise DomainError(409, "source_identity_conflict")
            else:
                source = {"user_id": user_id, "source_id": sid, "original_url": snapshot["original_url"],
                          "project_id": snapshot["project_id"], "access_status": "registered",
                          "type": snapshot["type"], "connection_id": None,
                          "canonical_url": snapshot["canonical_url"], "created_at": self._timestamp(),
                          "updated_at": self._timestamp(), "current_version": None,
                          "deleted": False, "revoked": False, "generation": 1}
            self._immutable(tx, "snapshot", key(sid, snapshot["source_version"]), snapshot)
            self._immutable(tx, "artifact", frame["artifact_id"],
                            {"user_id": user_id, "id": frame["artifact_id"], "content_hash": frame["content_hash"],
                             "data_base64": base64.b64encode(artifact_bytes).decode(), "kind": "frame"})
            self._immutable(tx, "frame", frame["frame_id"], frame)
            if snapshot["source_version"] > (source["current_version"] or 0):
                source["current_version"] = snapshot["source_version"]
                source["access_status"] = snapshot["access_status"]
                source["generation"] += 1
                source["updated_at"] = self._timestamp()
            tx.put("source", sid, source)
            if snapshot["project_id"] is not None:
                tx.put("project", snapshot["project_id"], {"user_id": user_id, "id": snapshot["project_id"]})
            tx.put("device", frame["device_id"], {"user_id": user_id, "id": frame["device_id"]})
            # Import is historical. Never set a device/session's capture flag true.
            if tx.get("session", frame["session_id"]) is None:
                tx.put("session", frame["session_id"], {"user_id": user_id, "id": frame["session_id"],
                                                       "live_capture": False})
            return deepcopy(snapshot)

    def import_ink(self, user_id, artifact_id, original_bytes):
        """Controlled local original-ink ingest; transport is outside P0."""
        checked("Identifier", artifact_id)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            self._immutable(tx, "artifact", artifact_id,
                            {"user_id": user_id, "id": artifact_id, "kind": "ink",
                             "content_hash": hashlib.sha256(original_bytes).hexdigest(),
                             "data_base64": base64.b64encode(original_bytes).decode()})

    def events(self, user_id, batch, idempotency_key=None):
        checked("EventBatch", batch)
        canonical = deepcopy(batch)
        for event in canonical["events"]:
            event["received_at"] = None
        request_hash = fingerprint(canonical)
        cache_key = key("POST", "/v1/events:batch", idempotency_key)
        if idempotency_key is not None:
            checked("Identifier", idempotency_key)
        acknowledged = []
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            if idempotency_key is not None:
                cached = self._replay(tx, cache_key, request_hash)
                if cached:
                    return cached["response"]
            for incoming in batch["events"]:
                self._identity(user_id, incoming)
                event = deepcopy(incoming)
                event["received_at"] = None  # Transport timestamps never affect replay equality.
                eid = event["event_id"]
                if tx.get("event_tombstone", eid):
                    raise DomainError(409, "event_deleted")
                self._snapshot(tx, event["source_id"], event["source_version"])
                self._owned(tx, "device", event["device_id"])
                self._owned(tx, "session", event["session_id"])
                if event["frame_id"] is not None:
                    frame = self._owned(tx, "frame", event["frame_id"])
                    for field in ("source_id", "source_version", "session_id", "device_id", "media_position"):
                        if event[field] != frame[field]:
                            raise DomainError(422, "event_frame_mismatch")
                if event["correction_of"] is not None:
                    if event["correction_of"] == eid:
                        raise DomainError(422, "invalid_correction")
                    original = self._owned(tx, "event", event["correction_of"])
                    if original["source_id"] != event["source_id"] or original["actor"] != event["actor"]:
                        raise DomainError(422, "correction_provenance_mismatch")
                prior = tx.get("event", eid)
                seq_key = key(event["device_id"], event["device_sequence"])
                seq = tx.get("event_sequence", seq_key)
                if seq and seq["event_id"] != eid:
                    raise DomainError(409, "sequence_conflict")
                if prior:
                    compare = deepcopy(prior)
                    compare["received_at"] = None
                    if compare != event:
                        raise DomainError(409, "event_conflict")
                    status = "duplicate"
                else:
                    event["received_at"] = self.clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                    tx.put("event", eid, event)
                    tx.put("event_sequence", seq_key, {"key": seq_key, "event_id": eid})
                    status = "accepted"
                acknowledged.append({"event_id": eid, "device_id": event["device_id"],
                                     "device_sequence": event["device_sequence"], "status": status})
            if idempotency_key is not None:
                self._cache(tx, cache_key, request_hash,
                            {"contract_version": "0.1.0", "acknowledged": acknowledged},
                            [e["source_id"] for e in batch["events"]])
        result = {"contract_version": "0.1.0", "acknowledged": acknowledged}
        checked("EventBatchAck", result)
        return result

    def put_note(self, user_id, note_id, payload, actor="user", idempotency_key=None, return_receipt=False):
        checked("NoteRevision", payload)
        self._identity(user_id, payload)
        if actor not in {"user", "assistant"} or note_id != payload["note_id"]:
            raise DomainError(422, "note_identity_mismatch")
        if idempotency_key is not None:
            checked("Identifier", idempotency_key)
        cache_key = key("PUT", f"/v1/notes/{note_id}", idempotency_key)
        request_hash = fingerprint([payload, actor])
        def receipt(note, replayed):
            return {"note": note, "persistence": "server_committed", "replayed": replayed} if return_receipt else note
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            if tx.get("note_tombstone", note_id):
                raise DomainError(410, "note_deleted")
            from services.api.original_artifacts import check_note
            check_note(tx, user_id, payload)
            if idempotency_key is not None:
                cached = self._replay(tx, cache_key, request_hash)
                if cached:
                    return receipt(cached["response"], True)
            head = tx.get("note", note_id)
            revision = head["revision"] if head else 0
            if payload["base_revision"] != revision:
                # Retrying the exact already-persisted revision is safe.
                saved = tx.get("note_revision", key(note_id, payload["revision"]))
                if saved != payload:
                    raise DomainError(409, "note_revision_conflict")
                replayed = True
            else:
                replayed = False
            if payload["project_id"] is not None:
                self._owned(tx, "project", payload["project_id"])
            for eid in payload["source_event_ids"]:
                event = self._owned(tx, "event", eid)
                self._snapshot(tx, event["source_id"], event["source_version"])
            for segment in payload["context_segments"]:
                self._snapshot(tx, segment["source_id"], segment["source_version"])
                frame = self._owned(tx, "frame", segment["frame_id"])
                for field in ("source_id", "source_version", "media_position"):
                    if segment[field] != frame[field]:
                        raise DomainError(422, "note_frame_mismatch")
                for eid in segment["source_event_ids"]:
                    event = self._owned(tx, "event", eid)
                    if any(event[k] != segment[k] for k in ("source_id", "source_version")):
                        raise DomainError(422, "note_event_mismatch")
            if len({b["id"] for b in payload["blocks"]}) != len(payload["blocks"]):
                raise DomainError(422, "duplicate_block_id")
            if payload["ink_blob_id"] is not None:
                ink = self._owned(tx, "artifact", payload["ink_blob_id"])
                if ink["kind"] != "ink":
                    raise DomainError(422, "invalid_ink")
            if replayed:
                if idempotency_key is not None:
                    self._cache(tx, cache_key, request_hash, payload,
                                [self._owned(tx, "event", eid)["source_id"] for eid in payload["source_event_ids"]]
                                + [s["source_id"] for s in payload["context_segments"]])
                return receipt(deepcopy(payload), True)
            if actor == "assistant":
                prior = tx.get("note_revision", key(note_id, revision)) if revision else None
                originals = lambda n: [b for b in n["blocks"] if b["layer"] == "user_original"]
                if prior:
                    if (originals(prior) != originals(payload) or prior["ink_blob_id"] != payload["ink_blob_id"]
                            or prior["kind"] != payload["kind"]):
                        raise DomainError(403, "original_protected")
                    if originals(prior) or prior["ink_blob_id"] is not None:
                        if (prior["project_id"] != payload["project_id"]
                                or any(s not in payload["context_segments"] for s in prior["context_segments"])
                                or not set(prior["source_event_ids"]).issubset(payload["source_event_ids"])):
                            raise DomainError(403, "original_context_protected")
                elif originals(payload) or payload["ink_blob_id"] is not None:
                    raise DomainError(403, "original_protected")
            self._immutable(tx, "note_revision", key(note_id, payload["revision"]), payload)
            tx.put("note", note_id, {"note_id": note_id, "revision": payload["revision"]})
            if idempotency_key is not None:
                self._cache(tx, cache_key, request_hash, payload,
                            [self._owned(tx, "event", eid)["source_id"] for eid in payload["source_event_ids"]]
                            + [s["source_id"] for s in payload["context_segments"]])
            return receipt(deepcopy(payload), False)

    def get_note(self, user_id, note_id, revision=None):
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            head = self._owned(tx, "note", note_id)
            result = self._owned(tx, "note_revision", key(note_id, revision or head["revision"]))
            for segment in result["context_segments"]:
                self._source(tx, segment["source_id"])
            for eid in result["source_event_ids"]:
                event = self._owned(tx, "event", eid)
                self._source(tx, event["source_id"])
            from services.api.original_artifacts import check_note
            check_note(tx, user_id, result)
            return result

    def revoke_source(self, user_id, source_id):
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            source = self._source(tx, source_id)
            source["revoked"] = True
            source["generation"] += 1
            tx.put("source", source_id, source)

    def delete_source(self, user_id, source_id):
        """Erase linked content, rejecting histories that also belong to other sources."""
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            source = self._owned(tx, "source", source_id)
            if source["deleted"]:
                return
            from services.api.original_artifacts import source_artifact_ids
            typed_artifacts = source_artifact_ids(tx, user_id, source_id)
            events = {r["event_id"] for r in tx.scan("event") if r["source_id"] == source_id}
            revisions = tx.scan("note_revision")
            notes = {r["note_id"] for r in revisions
                     if any(s["source_id"] == source_id for s in r["context_segments"])
                     or events.intersection(r["source_event_ids"])}
            # P0 cannot separate per-source blocks/ink within a note's immutable
            # history. Check every revision before any writes: an AI supplement
            # must not make another course's original note eligible for erasure.
            for r in revisions:
                if r["note_id"] in notes and (
                        any(s["source_id"] != source_id for s in r["context_segments"])
                        or not set(r["source_event_ids"]).issubset(events)):
                    raise DomainError(409, "mixed_source_note_conflict")
            # Capture-only records share this archive and the same deletion lock.
            # Import locally to keep capture's use of Archive free of import cycles.
            from services.api.capture import capture_artifact_ids, delete_capture_source
            capture_artifacts, capture_frames = delete_capture_source(tx, source_id)
            from services.api.preview import delete_preview_source
            delete_preview_source(tx, source_id)
            from services.api.display_sources import is_display
            source.update(deleted=True, revoked=True, generation=source["generation"] + 1)
            if not is_display(source):
                source.update(original_url="", canonical_url="")
            tx.put("source", source_id, source)
            artifacts = set(capture_artifacts) | typed_artifacts
            for frame_id in capture_frames:
                linked = tx.get("frame", frame_id)
                if linked is not None and linked["source_id"] != source_id:
                    raise DomainError(409, "mixed_source_frame_conflict")
                tx.put("frame_tombstone", frame_id, {"frame_id": frame_id})
            for r in tx.scan("frame"):
                if r["source_id"] == source_id:
                    artifacts.add(r["artifact_id"])
                    tx.delete("frame", r["frame_id"])
                    if r["artifact_id"] in typed_artifacts:
                        tx.put("frame_tombstone", r["frame_id"], {"frame_id": r["frame_id"]})
            for r in tx.scan("snapshot"):
                if r["source_id"] == source_id:
                    tx.delete("snapshot", key(source_id, r["source_version"]))
            for eid in events:
                tx.delete("event", eid)
                tx.put("event_tombstone", eid, {"event_id": eid})
            # Sequence receipts stay as tombstones; same device slot cannot be reused.
            for r in revisions:
                if r["note_id"] in notes:
                    if r["ink_blob_id"]:
                        artifacts.add(r["ink_blob_id"])
                    tx.delete("note_revision", key(r["note_id"], r["revision"]))
            for nid in notes:
                tx.delete("note", nid)
                tx.put("note_tombstone", nid, {"note_id": nid})
            for r in tx.scan("derived"):
                if any(s["source_id"] == source_id for s in r.get("source_versions", [])):
                    tx.delete("derived", r["id"])
            for kind in ("registration_key", "source_url"):
                for r in tx.scan(kind):
                    if r["source_id"] == source_id:
                        tx.delete(kind, r["key"])
            for r in tx.scan("http_replay"):
                if source_id in r["source_ids"] or (r.get("response", {}).get("note_id") in notes):
                    tx.put("http_replay", r["key"], {"key": r["key"], "deleted": True, "source_ids": []})
            referenced = {r["artifact_id"] for r in tx.scan("frame")}
            referenced.update(r["ink_blob_id"] for r in tx.scan("note_revision"))
            referenced.update(capture_artifact_ids(tx))
            # Cross-source references to typed bytes indicate invalid storage;
            # fail the entire transaction instead of erasing foreign evidence
            # or claiming successful erasure while retaining owned originals.
            if typed_artifacts & referenced:
                raise DomainError(409, "original_source_conflict")
            for artifact in artifacts:
                stored = tx.get("artifact", artifact)
                if stored and "original_binding" in stored and artifact not in typed_artifacts:
                    raise DomainError(409, "original_source_conflict")
            for artifact in artifacts - referenced:
                tx.delete("artifact", artifact)
                if artifact in typed_artifacts:
                    tx.put("original_artifact_tombstone", artifact, {"artifact_id": artifact})
                if tx.get("capture_artifact_ref", artifact) is not None:
                    tx.delete("capture_artifact_ref", artifact)
                    tx.put("capture_artifact_tombstone", artifact, {"artifact_id": artifact})
