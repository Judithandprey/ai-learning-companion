"""Bounded, currently authorized metadata for the existing Learning composer.

No wire protocol, byte extraction or final-use permission is introduced here.
The caller must recheck every source at final use; AuthorizedImageResolver checks
image bytes independently. External causal parents are not fetched or inferred.
"""

from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
from hashlib import sha256
import json

from jsonschema import ValidationError

from packages.contracts.capture_frame import validate as validate_raw_frame, validate_binding as validate_raw_binding
from packages.contracts.desktop_frame import validate as validate_desktop_frame, validate_binding as validate_desktop_binding
from packages.contracts.display_source import validate_display_record
from packages.contracts.original_artifact import validate_capture_frame
from packages.contracts.process_v2 import canonical_record, validate, validate_record_frame
from services.api.display_sources import is_display, load as load_display
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError
from services.api.image_resolver import _raw_original_binding


MAX_METADATA_BYTES = 4 * 1024 * 1024


def _size(value, limit):
    size = 0
    encoder = json.JSONEncoder(sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    for chunk in encoder.iterencode(value):
        size += len(chunk.encode("utf-8"))
        if size > limit:
            raise DomainError(413, "payload_too_large")
    return size


class AuthorizedProcessContextReader:
    def __init__(self, store, user_id, authorization_guard):
        checked("Identifier", user_id)
        if not callable(authorization_guard):
            raise ValueError("a current caller authorization guard is required")
        self.store = store
        self.user_id = user_id
        self.archive = Archive(store, authorization_guard=authorization_guard)

    def __call__(self, record_ids, *, max_metadata_bytes=MAX_METADATA_BYTES):
        """Read one historical incarnation using point reads in one actor lock.

        Returns exactly {batch, sources, frames}, using released objects. The
        context-* batch ID identifies this ordered selection, not an original
        upload/ACK. Original transport batch IDs/delivery modes are deliberately
        absent from stored canonical records. Original record clocks, revisions,
        evidence and parents remain untouched; received_at stays archive bookkeeping.
        """
        return self._context(record_ids, max_metadata_bytes, raw=False)

    def read_raw(self, record_ids, *, max_metadata_bytes=MAX_METADATA_BYTES):
        """Read released 0.2.5 descriptors without converting pixels or clock facts.

        The packet retains raw orientation and unknown capture time. It needs an
        explicitly raw-aware consumer; the legacy Learning composer is unchanged.
        Original binding metadata is checked without decoding or returning bytes.
        """
        return self._context(record_ids, max_metadata_bytes, raw=True)

    def read_desktop(self, record_ids, *, max_metadata_bytes=MAX_METADATA_BYTES):
        """Read only released 0.2.7 desktop descriptors and their exact records.

        Retains native clock/geometry facts and unknown capture time/orientation.
        Original metadata is checked without decoding bytes or deriving clocks.
        """
        return self._context(record_ids, max_metadata_bytes, raw=True, desktop=True)

    def _context(self, record_ids, max_metadata_bytes, *, raw, desktop=False):
        if (type(record_ids) is not list or not 1 <= len(record_ids) <= 100
                or type(max_metadata_bytes) is not int
                or not 0 < max_metadata_bytes <= MAX_METADATA_BYTES):
            raise DomainError(422, "invalid_request")
        record_ids = record_ids.copy()
        try:
            for record_id in record_ids:
                validate("Identifier", record_id)
            if len(set(record_ids)) != len(record_ids):
                raise ValueError("duplicate record IDs")
        except (ValidationError, ValueError, TypeError, RecursionError):
            raise DomainError(422, "invalid_request") from None
        try:
            with self.store.transaction(self.user_id) as tx:
                self._authorized(tx)
                result = self._read(tx, record_ids, max_metadata_bytes, raw=raw, desktop=desktop)
                # Token expiry/revocation may change independently of the actor
                # lock. Recheck the caller before any detached result is returned.
                self._authorized(tx)
            return deepcopy(result)
        except DomainError as exc:
            if exc.status in (422, 503):  # A retained shape/dependency is invalid.
                raise DomainError(503, "unavailable") from None
            if exc.status in (403, 404):
                raise DomainError(exc.status, "forbidden" if exc.status == 403 else "not_found") from None
            raise
        except FutureCancelledError:
            # Cancellation stops the caller; it is not an unavailable snapshot.
            raise
        except Exception:
            # Corrupt retained data, guard/storage failure and context exit errors
            # publish neither a partial snapshot nor internal exception details.
            raise DomainError(503, "unavailable") from None

    def _authorized(self, tx):
        state = tx.get("authorization", "state")
        if state is not None and (type(state.get("enabled")) is not bool
                or type(state.get("generation")) is not int or state["generation"] < 1):
            raise DomainError(503, "unavailable")
        try:
            self.archive._authorized(tx)
        except DomainError as exc:
            if exc.status in (401, 403):
                raise DomainError(exc.status, "unauthenticated" if exc.status == 401 else "forbidden") from None
            raise

    def _owned(self, tx, kind, identifier):
        row = tx.get(kind, identifier)
        if row is None:
            raise DomainError(503, "unavailable")
        if row.get("user_id") != self.user_id:
            raise DomainError(404, "not_found")
        if row.get("id") != identifier or type(row.get("deleted", False)) is not bool:
            raise DomainError(503, "unavailable")
        if row.get("deleted"):
            raise DomainError(404, "not_found")

    def _source(self, tx, reference, *, capture_generation):
        source_id, version = reference["source_id"], reference["source_version"]
        current = tx.get("source", source_id)
        if current is None:
            raise DomainError(503, "unavailable")
        if current.get("user_id") != self.user_id:
            raise DomainError(404, "not_found")
        if (current.get("source_id") != source_id or type(current.get("deleted")) is not bool
                or type(current.get("revoked")) is not bool):
            raise DomainError(503, "unavailable")
        if current["deleted"]:
            raise DomainError(404, "not_found")
        if current["revoked"]:
            raise DomainError(403, "forbidden")
        snapshot = tx.get("snapshot", key(source_id, int(version)))
        if snapshot is None:
            raise DomainError(503, "unavailable")
        if snapshot.get("user_id") != self.user_id:
            raise DomainError(404, "not_found")
        if is_display(current) or is_display(snapshot):
            snapshot = load_display(tx, self.user_id, reference)
            # load_display ties this retained generation to the original stream
            # and consumed start grant. Today's account generation is separate.
            if current["authorization_generation"] != capture_generation:
                raise DomainError(503, "unavailable")
            return snapshot
        checked("SourceRecord", self.archive._registration(current))
        checked("SourceSnapshot", snapshot)
        if (any(snapshot[k] != value for k, value in reference.items())
                or current["current_version"] is None or current["current_version"] < version
                or sha256(snapshot["text"].encode("utf-8")).hexdigest() != snapshot["content_hash"]):
            raise DomainError(503, "unavailable")
        for kind in ("project", "connection"):
            if snapshot[kind + "_id"] is not None:
                self._owned(tx, kind, snapshot[kind + "_id"])
        return snapshot

    def _read(self, tx, record_ids, limit, *, raw=False, desktop=False):
        records, sources, frames = [], {}, {}
        identity = None
        used = 0
        artifact_sources = {}
        original_bindings = {}
        batch_id = "context-" + fingerprint([self.user_id, record_ids])
        for record_id in record_ids:
            if tx.get("capture_tombstone", record_id) is not None:
                raise DomainError(404, "not_found")
            stored = tx.get("capture_record", record_id)
            if stored is None:
                raise DomainError(404, "not_found")
            if set(stored) != {"canonical_json", "received_at"} or type(stored["canonical_json"]) is not str:
                raise DomainError(503, "unavailable")
            if len(stored["canonical_json"]) > limit or len(stored["canonical_json"].encode("utf-8")) > limit:
                raise DomainError(413, "payload_too_large")
            validate("UtcTimestamp", stored["received_at"])
            original = json.loads(stored["canonical_json"])
            if set(original) != {"device_id", "session_id", "stream_id", "record"}:
                raise DomainError(503, "unavailable")
            record = original["record"]
            validate("ProcessRecord", record)
            if record["record_id"] != record_id:
                raise DomainError(503, "unavailable")
            if record["source"]["user_id"] != self.user_id:
                raise DomainError(404, "not_found")
            if record["scope"]["kind"] != "provisional_session":
                raise DomainError(409, "dependency_missing")
            current_identity = {k: original[k] for k in ("device_id", "session_id", "stream_id")}
            if identity is None:
                identity = current_identity
                for kind in ("device", "session"):
                    self._owned(tx, kind, identity[kind + "_id"])
                binding = tx.get("capture_binding", identity["stream_id"])
                if (binding is None or set(binding) != {*identity, "user_id", "authorization_generation"}
                        or any(binding[k] != v for k, v in identity.items())
                        or binding["user_id"] != self.user_id
                        or type(binding["authorization_generation"]) is not int
                        or binding["authorization_generation"] < 1):
                    raise DomainError(503, "unavailable")
            elif current_identity != identity:
                # The caller selected multiple individually stored incarnations.
                # This selection is unsupported; never combine their histories.
                raise DomainError(409, "dependency_missing")
            batch = {"contract_version": "0.2.0", "batch_id": batch_id,
                     **identity, "delivery_mode": "historical", "records": [record]}
            if canonical_record(batch, record_id).decode("utf-8") != stored["canonical_json"]:
                raise DomainError(503, "unavailable")
            slot_key = key(identity["device_id"], identity["stream_id"], int(record["sequence"]))
            if tx.get("capture_slot", slot_key) != {"key": slot_key, "record_id": record_id}:
                raise DomainError(503, "unavailable")
            source_key = (record["source"]["source_id"], record["source"]["source_version"])
            if source_key not in sources:
                sources[source_key] = self._source(tx, record["source"],
                    capture_generation=binding["authorization_generation"])
                if raw and not is_display(sources[source_key]):
                    raise DomainError(409, "dependency_missing")
                used += _size(sources[source_key], limit)
            for reference in record["artifacts"]:
                artifact_id = reference["artifact_id"]
                if any(tx.get(kind, artifact_id) is not None for kind in
                       ("capture_artifact_tombstone", "original_artifact_tombstone")):
                    raise DomainError(404, "not_found")
                pin = tx.get("capture_artifact_ref", artifact_id)
                validate("ArtifactReference", pin)
                if pin != reference or artifact_sources.setdefault(artifact_id, source_key) != source_key:
                    raise DomainError(503, "unavailable")
            frame_id = record["frame_id"]
            if frame_id is not None:
                if tx.get("frame_tombstone", frame_id) is not None:
                    raise DomainError(404, "not_found")
                if frame_id not in frames:
                    frame = tx.get("raw_capture_frame" if raw else "frame", frame_id)
                    other = tx.get("frame" if raw else "raw_capture_frame", frame_id)
                    if other is not None:
                        raise DomainError(503 if frame is not None else 409,
                                          "unavailable" if frame is not None else "dependency_missing")
                    if frame is None:
                        raise DomainError(503, "unavailable")
                    if raw:
                        validate_frame = validate_desktop_frame if desktop else validate_raw_frame
                        validate_frame(frame)
                    owner = frame["source"]["user_id"] if raw else frame.get("user_id")
                    if owner != self.user_id:
                        raise DomainError(404, "not_found")
                    frames[frame_id] = frame
                    used += _size(frame, limit)
                frame = frames[frame_id]
                if raw:
                    # The document store loads a whole artifact row. Only its
                    # binding/aliases are examined here; bytes belong to resolver.
                    artifact_id = frame["artifact"]["artifact_id"]
                    if artifact_id not in original_bindings:
                        original_binding = _raw_original_binding(
                            tx.get("artifact", artifact_id), self.user_id, frame)
                        original_bindings[artifact_id] = original_binding
                    original_binding = original_bindings[artifact_id]
                    validate_binding = validate_desktop_binding if desktop else validate_raw_binding
                    validate_binding(batch, record_id, frame, sources[source_key], original_binding)
                else:
                    validate_record_frame(batch, record_id, frame)
                    if is_display(sources[source_key]):
                        validate_display_record(sources[source_key], batch, record_id, frame)
                    if frame["representation"] == "screen_capture":
                        artifact = next(a for a in record["artifacts"] if a["artifact_id"] == frame["artifact_id"])
                        validate_capture_frame(batch, record_id, frame, {"contract_version": "0.2.2",
                            "kind": "screen_image", "source": record["source"], "artifact": artifact})
            elif is_display(sources[source_key]):
                raise DomainError(503, "unavailable")
            records.append(record)
            used += _size(record, limit)
            if used > limit:
                raise DomainError(413, "payload_too_large")
        batch["records"] = records
        # This also refuses incompatible coverage/backfill selections without
        # rewriting their original gap evidence or reordering requested records.
        validate("ProcessBatch", batch)
        result = {"batch": batch, "sources": list(sources.values()), "frames": list(frames.values())}
        _size(result, limit)
        return result
