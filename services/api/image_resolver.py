"""Currently authorized image bytes for Learning's internal image materializer.

This callable performs point reads in one existing actor transaction. Detached
archive bytes are never consulted. Availability is not capture freshness, teaching
permission, image decoding, or provider delivery; the consumer keeps those gates.
"""

import base64
from copy import deepcopy
import hashlib

from packages.contracts.original_artifact import MAX_ARTIFACT_BYTES
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError
from services.api.original_artifacts import check_reference, is_typed


class AuthorizedImageResolver:
    def __init__(self, store, user_id, authorization_guard):
        checked("Identifier", user_id)
        if not callable(authorization_guard):
            raise ValueError("a current caller authorization guard is required")
        self.store = store
        self.user_id = user_id
        self.archive = Archive(store, authorization_guard=authorization_guard)

    def __call__(self, detached_frame, *, max_bytes):
        if type(max_bytes) is not int or max_bytes <= 0:
            raise ValueError("max_bytes must be a positive integer")
        limit = min(max_bytes, MAX_ARTIFACT_BYTES)
        try:
            frame = deepcopy(detached_frame)
            checked("Frame", frame)
            if frame["user_id"] != self.user_id:
                return {"status": "unavailable"}
            with self.store.transaction(self.user_id) as tx:
                state = tx.get("authorization", "state")
                if state is not None and (type(state.get("enabled")) is not bool
                        or type(state.get("generation")) is not int or state["generation"] <= 0):
                    return {"status": "unavailable"}
                self.archive._authorized(tx)
                result = self._resolve(tx, frame, limit)
            return result
        except DomainError as error:
            status = {401: "revoked", 403: "revoked", 404: "missing"}.get(error.status, "unavailable")
            return {"status": status}
        except Exception:
            # A storage/guard/transaction failure must never fall back to bytes
            # retained in an older Learning snapshot or expose exception details.
            return {"status": "unavailable"}

    def _resolve(self, tx, requested, limit):
        frame = tx.get("frame", requested["frame_id"])
        if frame is None:
            return {"status": "missing"}
        checked("Frame", frame)
        if fingerprint(frame) != fingerprint(requested):
            return {"status": "unavailable"}
        source_id, version = frame["source_id"], frame["source_version"]
        source = tx.get("source", source_id)
        if source is None:
            return {"status": "missing"}
        if (source.get("user_id") != self.user_id or source.get("source_id") != source_id
                or type(source.get("deleted")) is not bool or type(source.get("revoked")) is not bool):
            return {"status": "unavailable"}
        self.archive._source(tx, source_id)
        checked("SourceRecord", self.archive._registration(source))
        snapshot = tx.get("snapshot", key(source_id, int(version)))
        if snapshot is None:
            return {"status": "missing"}
        checked("SourceSnapshot", snapshot)
        binding = {"user_id": self.user_id, "source_id": source_id, "source_version": version}
        if (any(snapshot[k] != v for k, v in binding.items())
                or hashlib.sha256(snapshot["text"].encode("utf-8")).hexdigest() != snapshot["content_hash"]
                or snapshot["access_status"] != "ready"):
            return {"status": "unavailable"}
        for kind in ("device", "session"):
            record_id = frame[kind + "_id"]
            row = tx.get(kind, record_id)
            if row is None or row.get("user_id") != self.user_id or row.get("id") != record_id:
                return {"status": "unavailable"}
        if frame["representation"] == "dom_snapshot":
            return {"status": "unobservable"}
        artifact_id = frame["artifact_id"]
        if (tx.get("original_artifact_tombstone", artifact_id)
                or tx.get("capture_artifact_tombstone", artifact_id)):
            return {"status": "missing"}
        stored = tx.get("artifact", artifact_id)
        if stored is None:
            return {"status": "missing"}
        if (stored.get("user_id") != self.user_id or stored.get("id") != artifact_id
                or stored.get("kind") != "frame" or stored.get("content_hash") != frame["content_hash"]):
            return {"status": "unavailable"}
        encoded = stored.get("data_base64")
        if type(encoded) is not str:
            return {"status": "unavailable"}
        typed = is_typed(stored)
        # The existing JSON document store loads a row as a whole. Bound the
        # decoded allocation before decoding; no large-row storage redesign here.
        if len(encoded) > 4 * ((limit + 2) // 3):
            return {"status": "byte_limit"}
        if len(encoded) % 4:
            return {"status": "unavailable"}
        padding = 2 if encoded.endswith("==") else 1 if encoded.endswith("=") else 0
        if len(encoded) // 4 * 3 - padding > limit:
            return {"status": "byte_limit"}
        if typed:
            upload = check_reference(tx, self.user_id, binding, stored, artifact_id)
            if upload["kind"] != "screen_image" or upload["artifact"]["media_type"] != "image/png":
                return {"status": "unobservable"}
        data = base64.b64decode(encoded, validate=True)
        if base64.b64encode(data).decode("ascii") != encoded:
            return {"status": "unavailable"}
        if len(data) > limit:
            return {"status": "byte_limit"}
        if not data or hashlib.sha256(data).hexdigest() != frame["content_hash"]:
            return {"status": "unavailable"}
        # Legacy rows have no MIME label. Inspect actual bytes, not URL suffixes,
        # detached metadata or guessed OCR/rendering. Learning validates PNG pixels.
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return {"status": "unobservable"}
        return {"status": "available", "frame": deepcopy(frame), "media_type": "image/png", "data": data}
