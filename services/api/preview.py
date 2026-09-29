"""Trusted local document preview over the authoritative archive.

The preview owns no second source store and never calls an AI provider. All
originals and receipts commit together under the existing actor transaction.
"""

import base64
from copy import deepcopy
import hashlib
import json
from uuid import uuid4

from jsonschema import ValidationError
from packages.contracts import validate as validate_v1
from packages.contracts.document_preview import (
    CONTRACT_VERSION, MAX_DOCUMENT_BYTES, decode_utf8, validate,
)
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError


def _checked(name, value, *, stored=False):
    try:
        validate(name, value)
    except (ValidationError, ValueError, TypeError, UnicodeError, RecursionError):
        raise DomainError(503 if stored else 422, "unavailable" if stored else "invalid_request") from None


def _require(condition):
    if not condition:
        raise DomainError(503, "unavailable")


def delete_preview_source(tx, source_id):
    """Remove preview-only metadata within Archive.delete_source's actor lock."""
    for kind, identity in (("preview_import", "key"), ("preview_save", "note_id")):
        for row in tx.scan(kind):
            if row["source_id"] == source_id:
                tx.delete(kind, row[identity])


class DocumentPreview:
    def __init__(self, store, authorization_guard, clock=None, *, device_id, session_id):
        if not callable(authorization_guard):
            raise ValueError("A current caller authorization guard is required")
        checked("Identifier", device_id)
        checked("Identifier", session_id)
        self.store = store
        self.archive = Archive(store, clock, authorization_guard)
        self.device_id, self.session_id = device_id, session_id

    def _authorized(self, tx, user_id):
        self.archive._authorized(tx)
        auth = tx.get("authorization", "state")
        _require(auth["enabled"] is True and type(auth.get("generation")) is int
                 and 0 < auth["generation"] <= 2**53 - 1)
        for kind, identifier in (("device", self.device_id), ("session", self.session_id)):
            row = tx.get(kind, identifier)
            if (not row or row.get("user_id") != user_id or row.get("id") != identifier
                    or row.get("deleted") or row.get("revoked")):
                raise DomainError(403, "forbidden")
        membership = tx.get("control_membership", key(self.device_id, self.session_id))
        if (not membership or membership.get("active") is not True or membership.get("deleted")
                or any(membership.get(k) != v for k, v in (
                    ("user_id", user_id), ("device_id", self.device_id), ("session_id", self.session_id)))):
            raise DomainError(403, "forbidden")
        _require(type(membership.get("revision")) is int and 0 < membership["revision"] <= 2**53 - 1)
        return auth, membership

    def _binding(self, user_id, payload):
        if any(payload.get(k) != v for k, v in (("device_id", self.device_id), ("session_id", self.session_id))):
            raise DomainError(403, "identity_mismatch")
        if "user_id" in payload:
            self.archive._identity(user_id, payload)

    @staticmethod
    def _request(name, payload):
        _checked(name, payload)
        return deepcopy(payload)

    def session(self, user_id):
        with self.store.transaction(user_id) as tx:
            auth, membership = self._authorized(tx, user_id)
            result = {"contract_version": CONTRACT_VERSION, "user_id": user_id,
                      "device_id": self.device_id, "session_id": self.session_id,
                      "authorization_generation": auth["generation"],
                      "membership_revision": membership["revision"], "project_id": None}
            _checked("SessionInfo", result, stored=True)
            return result

    def import_document(self, user_id, payload, idempotency_key):
        body = self._request("DocumentImport", payload)
        checked("Identifier", idempotency_key)
        self._binding(user_id, body)
        raw, content = decode_utf8(body["content_base64"], MAX_DOCUMENT_BYTES)
        request_hash = fingerprint(body)
        cache_key = key("preview-import", idempotency_key)
        sid, version = body["source_id"], body["source_version"]
        with self.store.transaction(user_id) as tx:
            self._authorized(tx, user_id)
            source = tx.get("source", sid)
            if source is not None:
                self.archive._source(tx, sid)  # Tombstones precede idempotent success.
            cached = self.archive._replay(tx, cache_key, request_hash)
            prior = tx.get("preview_import", key(sid, version))
            if cached or prior:
                if prior is None:
                    raise DomainError(503, "unavailable")
                if prior["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
                snapshot, metadata = self._snapshot(tx, user_id, sid, version)
                receipt = self._import_receipt(snapshot, metadata, True)
                self.archive._cache(tx, cache_key, request_hash, receipt, [sid])
                return receipt
            if source is not None and (source["type"] != "document"
                    or source["project_id"] != body["project_id"]
                    or tx.get("preview_import", key(sid, source["current_version"])) is None):
                raise DomainError(409, "source_identity_conflict")
            if version != ((source["current_version"] or 0) + 1 if source else 1):
                raise DomainError(409, "source_version_conflict")
            if body["project_id"] is not None:
                self.archive._owned(tx, "project", body["project_id"])
            now = self.archive._timestamp()
            url = f"urn:learning-companion:document:{user_id}:{sid}"
            snapshot = {"user_id": user_id, "source_id": sid, "source_version": version,
                        "project_id": body["project_id"], "type": "document", "original_url": url,
                        "canonical_url": url, "connection_id": None, "access_status": "ready",
                        "content_hash": body["sha256"], "fetched_at": now,
                        "source_timezone": body["source_timezone"], "locator_schema": "source-frame-v1",
                        "text": content, "provenance": {"origin": "user_authorized", "consent_scope": "learning",
                            "attribution": f"Imported by authenticated local user {user_id}",
                            "license": "User-provided; rights not independently verified"}}
            checked("SourceSnapshot", snapshot)
            source = source or {"user_id": user_id, "source_id": sid, "original_url": url,
                "canonical_url": url, "project_id": body["project_id"], "connection_id": None,
                "type": "document", "created_at": now, "generation": 0, "deleted": False, "revoked": False}
            source.update(current_version=version, access_status="ready", updated_at=now,
                          generation=source["generation"] + 1)
            metadata = {"key": key(sid, version), "source_id": sid, "source_version": version,
                        "filename": body["filename"], "byte_length": len(raw), "fingerprint": request_hash}
            self.archive._immutable(tx, "snapshot", key(sid, version), snapshot)
            self.archive._immutable(tx, "preview_import", key(sid, version), metadata)
            tx.put("source", sid, source)
            receipt = self._import_receipt(snapshot, metadata, False)
            self.archive._cache(tx, cache_key, request_hash, receipt, [sid])
            return receipt

    @staticmethod
    def _import_receipt(snapshot, metadata, replayed):
        receipt = {"contract_version": CONTRACT_VERSION, "source": snapshot,
                   "filename": metadata["filename"], "persistence": "server_committed", "replayed": replayed}
        _checked("ImportReceipt", receipt, stored=True)
        return receipt

    def _snapshot(self, tx, user_id, source_id, version):
        _require(tx.get("source", source_id) is not None)
        self.archive._source(tx, source_id)
        snapshot = tx.get("snapshot", key(source_id, version))
        metadata = tx.get("preview_import", key(source_id, version))
        _require(snapshot is not None and metadata is not None)
        try:
            validate_v1("SourceSnapshot", snapshot)
            raw = snapshot["text"].encode("utf-8")
            _require(snapshot["user_id"] == user_id and snapshot["source_id"] == source_id
                     and snapshot["source_version"] == version and snapshot["type"] == "document"
                     and snapshot["provenance"]["origin"] == "user_authorized"
                     and snapshot["provenance"]["consent_scope"] == "learning"
                     and metadata["source_id"] == source_id and metadata["source_version"] == version
                     and metadata["key"] == key(source_id, version)
                     and metadata["byte_length"] == len(raw) <= MAX_DOCUMENT_BYTES and "\x00" not in snapshot["text"]
                     and hashlib.sha256(raw).hexdigest() == snapshot["content_hash"])
        except (ValidationError, ValueError, TypeError, KeyError, UnicodeError):
            raise DomainError(503, "unavailable") from None
        return snapshot, metadata

    @staticmethod
    def _next_sequence(tx, device_id):
        maximum = 0
        for row in tx.scan("event_sequence"):
            try:
                parts = json.loads(row["key"])
                if not isinstance(parts, list) or len(parts) != 2 or type(parts[1]) is not int or not 0 < parts[1] < 2**53:
                    raise ValueError()
                validate_v1("EventAck", {"event_id": row["event_id"], "device_id": parts[0],
                                         "device_sequence": parts[1], "status": "accepted"})
                _require(row["key"] == key(*parts) and tx.get("event_sequence", row["key"]) == row)
                if parts[0] == device_id:
                    maximum = max(maximum, parts[1])
            except (ValidationError, ValueError, TypeError, KeyError):
                raise DomainError(503, "unavailable") from None
        if maximum == 2**53 - 1:
            raise DomainError(409, "sequence_exhausted")
        return maximum + 1

    @staticmethod
    def _save_receipt(note_id, replayed):
        receipt = {"contract_version": CONTRACT_VERSION, "note_id": note_id, "revision": 1,
                   "persistence": "server_committed", "replayed": replayed, "ai_status": "provider_unavailable"}
        _checked("SaveReceipt", receipt, stored=True)
        return receipt

    def save(self, user_id, payload, idempotency_key):
        body = self._request("DocumentSave", payload)
        checked("Identifier", idempotency_key)
        frame = body["frame"]
        self._binding(user_id, frame)
        note_id, sid = body["note_id"], frame["source_id"]
        request_hash = fingerprint(body)
        cache_key = key("preview-save", idempotency_key)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx, user_id)
            self.archive._source(tx, sid)
            if tx.get("note_tombstone", note_id):
                raise DomainError(410, "note_deleted")
            cached = self.archive._replay(tx, cache_key, request_hash)
            prior = tx.get("preview_save", note_id)
            if cached or prior:
                _require(prior is not None)
                if prior["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
                self._read(tx, user_id, note_id)
                receipt = self._save_receipt(note_id, True)
                self.archive._cache(tx, cache_key, request_hash, receipt, [sid])
                return receipt
            if tx.get("note", note_id) or tx.get("note_revision", key(note_id, 1)):
                raise DomainError(409, "note_revision_conflict")
            snapshot, _ = self._snapshot(tx, user_id, sid, frame["source_version"])
            if snapshot["source_timezone"] != frame["source_timezone"]:
                raise DomainError(422, "source_timezone_mismatch")
            if snapshot["project_id"] != body["request"]["project_id"]:
                raise DomainError(422, "project_mismatch")
            aid = frame["artifact_id"]
            if (tx.get("artifact", aid) or tx.get("capture_artifact_ref", aid)
                    or tx.get("capture_artifact_tombstone", aid) or tx.get("frame", frame["frame_id"])
                    or any(row.get("artifact_id") == aid for row in tx.scan("frame"))
                    or any(row.get("ink_blob_id") == aid for row in tx.scan("note_revision"))):
                raise DomainError(409, "artifact_conflict")
            now, event_id = self.archive._timestamp(), str(uuid4())
            event = {k: frame[k] for k in ("user_id", "source_id", "source_version", "device_id", "session_id",
                                         "captured_at", "source_timezone", "frame_id", "media_position")}
            event.update(event_id=event_id, device_sequence=self._next_sequence(tx, self.device_id),
                         captured_at=body["bridge_request"]["selection"]["created_at"],
                         received_at=now, actor="user", text=body["request_text"], confidence=1,
                         gap_flags=[], correction_of=None)
            note = {"user_id": user_id, "note_id": note_id, "kind": "ai", "project_id": snapshot["project_id"],
                    "concept_ids": [], "title": body["title"], "blocks": [
                        {"id": str(uuid4()), "layer": "user_original", "format": "text", "content": body["user_note"]}],
                    "ink_blob_id": None, "context_segments": [{"source_id": sid,
                        "source_version": frame["source_version"], "frame_id": frame["frame_id"],
                        "media_position": frame["media_position"], "source_event_ids": [event_id]}],
                    "source_event_ids": [event_id], "revision": 1, "base_revision": 0,
                    "authorship": "user", "created_at": now}
            # v1 has no typed-user-note kind. Authorship and original layers are
            # authoritative; this compatibility tag does not claim AI output.
            checked("Observation", event)
            checked("NoteRevision", note)
            metadata = {"note_id": note_id, "revision": 1, "source_id": sid,
                        "source_version": frame["source_version"], "frame_id": frame["frame_id"],
                        "event_id": event_id, "bridge_request": body["bridge_request"], "request": body["request"],
                        "fingerprint": request_hash}
            self.archive._immutable(tx, "artifact", aid, {"user_id": user_id, "id": aid,
                "kind": "frame", "content_hash": frame["content_hash"], "data_base64": body["frame_bytes_base64"]})
            self.archive._immutable(tx, "frame", frame["frame_id"], frame)
            self.archive._immutable(tx, "event", event_id, event)
            seq_key = key(self.device_id, event["device_sequence"])
            tx.put("event_sequence", seq_key, {"key": seq_key, "event_id": event_id})
            self.archive._immutable(tx, "note_revision", key(note_id, 1), note)
            tx.put("note", note_id, {"note_id": note_id, "revision": 1})
            self.archive._immutable(tx, "preview_save", note_id, metadata)
            receipt = self._save_receipt(note_id, False)
            self.archive._cache(tx, cache_key, request_hash, receipt, [sid])
            return receipt

    def read(self, user_id, note_id):
        checked("Identifier", note_id)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx, user_id)
            return self._read(tx, user_id, note_id)

    def _read(self, tx, user_id, note_id):
        if tx.get("note_tombstone", note_id):
            raise DomainError(410, "note_deleted")
        row = tx.get("preview_save", note_id)
        if row is None:
            _require(tx.get("note", note_id) is None and tx.get("note_revision", key(note_id, 1)) is None)
            raise DomainError(404, "note_not_found")
        try:
            snapshot, imported = self._snapshot(tx, user_id, row["source_id"], row["source_version"])
            frame = tx.get("frame", row["frame_id"])
            event = tx.get("event", row["event_id"])
            note = tx.get("note_revision", key(note_id, row["revision"]))
            head = tx.get("note", note_id)
            _require(frame is not None and event is not None and note is not None and head is not None)
            artifact = tx.get("artifact", frame["artifact_id"])
            _require(artifact is not None and artifact.get("user_id") == user_id
                     and artifact.get("id") == frame["artifact_id"] and artifact.get("kind") == "frame"
                     and artifact.get("content_hash") == frame["content_hash"])
            body = {"contract_version": CONTRACT_VERSION, "note_id": note_id, "frame": frame,
                    "frame_bytes_base64": artifact["data_base64"], "bridge_request": row["bridge_request"],
                    "request": row["request"], "title": note["title"], "request_text": event["text"],
                    "user_note": note["blocks"][0]["content"]}
            _checked("DocumentSave", body, stored=True)
            validate_v1("Observation", event)
            validate_v1("NoteRevision", note)
            _require(fingerprint(body) == row["fingerprint"] and row["note_id"] == note_id
                     and row["revision"] == note["revision"] == 1 and note["base_revision"] == 0
                     and note["note_id"] == note_id and note["user_id"] == user_id
                     and event["user_id"] == user_id and event["event_id"] == row["event_id"]
                     and frame["user_id"] == user_id and frame["frame_id"] == row["frame_id"]
                     and frame["source_id"] == row["source_id"] and frame["source_version"] == row["source_version"]
                     and note["source_event_ids"] == [row["event_id"]]
                     and note["authorship"] == "user" and len(note["blocks"]) == 1
                     and note["blocks"][0]["layer"] == "user_original" and note["blocks"][0]["format"] == "text"
                     and note["ink_blob_id"] is None and note["kind"] == "ai"
                     and note["concept_ids"] == [] and row["request"]["project_id"] == snapshot["project_id"]
                     and frame["source_timezone"] == snapshot["source_timezone"]
                     and event["actor"] == "user" and event["correction_of"] is None
                     and event["confidence"] == 1 and event["gap_flags"] == []
                     and event["captured_at"] == row["bridge_request"]["selection"]["created_at"]
                     and head["note_id"] == note_id and type(head["revision"]) is int and head["revision"] >= 1
                     and tx.get("event_tombstone", event["event_id"]) is None)
            segment = {k: frame[k] for k in ("source_id", "source_version", "frame_id", "media_position")}
            segment["source_event_ids"] = [event["event_id"]]
            _require(note["context_segments"] == [segment] and note["project_id"] == snapshot["project_id"]
                     and all(event[k] == frame[k] for k in ("source_id", "source_version", "frame_id", "device_id",
                                                          "session_id", "media_position", "source_timezone"))
                     and tx.get("event_sequence", key(event["device_id"], event["device_sequence"])) == {
                         "key": key(event["device_id"], event["device_sequence"]), "event_id": event["event_id"]})
            result = {"contract_version": CONTRACT_VERSION, "source": snapshot, "filename": imported["filename"],
                      "content_base64": base64.b64encode(snapshot["text"].encode("utf-8")).decode(),
                      "frame": frame, "frame_bytes_base64": artifact["data_base64"],
                      "bridge_request": row["bridge_request"], "request": row["request"],
                      "observation": event, "note": note, "request_text": event["text"],
                      "user_note": note["blocks"][0]["content"], "ai_status": "provider_unavailable",
                      "persistence": "server_committed"}
            _checked("SavedPreview", result, stored=True)
            return result
        except (ValidationError, ValueError, TypeError, KeyError, IndexError, UnicodeError, RecursionError):
            raise DomainError(503, "unavailable") from None
