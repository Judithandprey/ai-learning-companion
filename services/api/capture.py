"""Internal capture-only archive; no HTTP route, registration or help capability.

The embedding service must authenticate the caller and supply a resolver that
reads registered stream membership and current lifecycle fences in this actor
transaction. A request-derived/static CaptureAuthority is not such a resolver.
"""

import base64
from copy import deepcopy
import hashlib
import json

from jsonschema import ValidationError

from packages.contracts.original_artifact import validate_capture_frame
from packages.contracts.display_source import validate_display_record
from packages.contracts.process_v2 import (
    CaptureAuthority, canonical_record, validate, validate_ack,
    validate_record_frame, validate_submission,
)
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError
from services.api.display_sources import is_display, load as load_display


def _validate(name, value):
    try:
        validate(name, value)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_request") from None


def _decode(stored):
    return {**json.loads(stored["canonical_json"]), "received_at": stored["received_at"]}


def capture_artifact_ids(tx):
    return {a["artifact_id"] for row in tx.scan("capture_record")
            for a in _decode(row)["record"]["artifacts"]}


def delete_capture_source(tx, source_id):
    """Called by Archive.delete_source under its SAME actor transaction."""
    artifacts, frames = set(), set()
    for row in tx.scan("capture_record"):
        record = _decode(row)["record"]
        if record["source"]["source_id"] == source_id:
            artifacts.update(a["artifact_id"] for a in record["artifacts"])
            if record["frame_id"] is not None:
                frames.add(record["frame_id"])
            tx.delete("capture_record", record["record_id"])
            tx.put("capture_tombstone", record["record_id"], {"record_id": record["record_id"]})
    for replay in tx.scan("capture_replay"):
        if source_id in replay.get("source_ids", []):
            tx.put("capture_replay", replay["key"], {"key": replay["key"], "deleted": True})
    # No canonical text, answer hash or receipt body is retained in tombstones.
    # Stream slot IDs remain reserved. Unrelated raw descendants remain originals;
    # their erased causal parent is unavailable, never reconstructed by replay.
    return artifacts, frames


class CaptureArchive:
    def __init__(self, store, authority_resolver=None, authorization_guard=None, clock=None,
                 *, allow_artifact_references=True):
        self.store = store
        self.resolve = authority_resolver
        self.allow_artifact_references = allow_artifact_references
        self.archive = Archive(store, clock=clock, authorization_guard=authorization_guard)

    def _authorized(self, tx):
        try:
            self.archive._authorized(tx)
        except DomainError as exc:
            raise DomainError(401 if exc.status == 401 else 403,
                              "unauthenticated" if exc.status == 401 else "forbidden") from None

    @staticmethod
    def _owned(tx, kind, identifier, user_id):
        row = tx.get(kind, identifier)
        if row is None or row.get("user_id") != user_id:
            raise DomainError(404, "not_found")
        return row

    def _source(self, tx, source, user_id, authority=None):
        if source["user_id"] != user_id:
            raise DomainError(404, "not_found")
        if authority is not None and (source["source_id"], source["source_version"]) not in authority.source_versions:
            raise DomainError(404, "not_found")
        current = self._owned(tx, "source", source["source_id"], user_id)
        if current["deleted"]:
            raise DomainError(404, "not_found")
        if current["revoked"]:
            raise DomainError(403, "forbidden")
        snapshot = self._owned(tx, "snapshot", key(source["source_id"], int(source["source_version"])), user_id)
        if is_display(current) or is_display(snapshot):
            return load_display(tx, user_id, source)
        return snapshot

    def _authority(self, tx, user_id, batch, *, typed_originals=False):
        self._authorized(tx)
        if self.resolve is None:
            raise DomainError(503, "unavailable")
        authority = self.resolve(tx, user_id, batch["stream_id"])
        if not isinstance(authority, CaptureAuthority) or authority.user_id != user_id:
            raise DomainError(404, "not_found")
        # Trusted callbacks are still a type boundary: string/dict membership
        # must not turn a malformed authority into a permission grant.
        for field in ("scopes", "capabilities", "source_versions", "attempts"):
            values = getattr(authority, field)
            if type(values) is not frozenset:
                raise DomainError(403, "forbidden")
            if field in ("scopes", "capabilities"):
                if any(type(value) is not str for value in values):
                    raise DomainError(403, "forbidden")
            else:
                for value in values:
                    count = 2 if field == "source_versions" else 3
                    if (type(value) is not tuple or len(value) != count
                            or any(type(part) is not str for part in value[:-1])
                            or type(value[-1]) is not int or value[-1] < 1):
                        raise DomainError(403, "forbidden")
        if "process:capture" not in authority.scopes:
            raise DomainError(403, "forbidden")
        if "process.capture.v0.2" not in authority.capabilities:
            raise DomainError(403, "capability_required")
        for field in ("device_id", "session_id", "stream_id"):
            if batch[field] != getattr(authority, field):
                raise DomainError(404, "not_found")
        self._owned(tx, "device", batch["device_id"], user_id)
        self._owned(tx, "session", batch["session_id"], user_id)
        # Resolver attests registration/incarnation AND membership, not just two
        # separately existing IDs. Persisting this binding does not register it.
        binding = {field: getattr(authority, field) for field in
                   ("user_id", "device_id", "session_id", "stream_id")}
        binding["authorization_generation"] = tx.get("authorization", "state")["generation"]
        previous = tx.get("capture_binding", batch["stream_id"])
        if previous is not None and previous != binding:
            raise DomainError(403, "forbidden")
        if authority.transmission_allowed is not True:
            raise DomainError(403, "forbidden")
        if type(authority.live_capture_allowed) is not bool:
            raise DomainError(409, "capture_stopped")
        if not authority.live_capture_allowed:
            limit = authority.historical_through_sequence
            if (batch["delivery_mode"] != "historical" or type(limit) is not int
                    or limit < 0 or any(r["sequence"] > limit for r in batch["records"])):
                raise DomainError(409, "capture_stopped")
        for record in batch["records"]:
            snapshot = self._source(tx, record["source"], user_id, authority)
            if is_display(snapshot) and (not typed_originals or record["frame_id"] is None):
                raise DomainError(409, "unsupported_source")
            if typed_originals:
                self._ready_snapshot(tx, user_id, record["source"], snapshot)
            if record["artifacts"] and not self.allow_artifact_references and not typed_originals:
                # New control-backed capture cannot activate cross-family blob
                # sharing before the lead-owned typed upload/deletion rule.
                raise DomainError(409, "dependency_missing")
            if record["scope"]["kind"] != "provisional_session":
                # No authoritative attempt/relation resolver has been released.
                raise DomainError(409, "dependency_missing")
        try:
            validate_submission(batch, authority)
        except ValidationError:
            raise DomainError(422, "invalid_request") from None
        return authority, binding

    @staticmethod
    def _ready_snapshot(tx, user_id, source, snapshot):
        """The opt-in path binds an already ingested original, never a URL stub."""
        if is_display(snapshot):
            load_display(tx, user_id, source)
            return
        try:
            checked("SourceSnapshot", snapshot)
            current = tx.get("source", source["source_id"])
            if (any(snapshot[k] != v for k, v in source.items())
                    or current.get("source_id") != source["source_id"]
                    or current.get("user_id") != user_id
                    or snapshot["access_status"] != "ready"
                    or hashlib.sha256(snapshot["text"].encode()).hexdigest() != snapshot["content_hash"]):
                raise ValueError("invalid source snapshot")
        except (DomainError, ValueError, KeyError, TypeError, UnicodeError):
            raise DomainError(503, "unavailable") from None
        if (snapshot["type"] == "synthetic" or current.get("type") == "synthetic"
                or snapshot["provenance"]["origin"] == "synthetic"
                or snapshot["provenance"]["consent_scope"] != "learning"):
            raise DomainError(409, "dependency_missing")

    def _dependencies(self, tx, user_id, batch, authority, *, typed_originals=False):
        """Resolve the complete owned parent graph, including stored ancestors."""
        local = {r["record_id"]: {**{k: batch[k] for k in ("device_id", "session_id", "stream_id")},
                                  "record": r} for r in batch["records"]}
        submitted = set(local)
        visiting, done, sources = set(), set(), set()
        for root in list(local):
            stack = [(root, False)]
            while stack:
                record_id, leaving = stack.pop()
                if leaving:
                    visiting.remove(record_id)
                    done.add(record_id)
                    continue
                if record_id in done:
                    continue
                if record_id in visiting:
                    raise DomainError(422, "invalid_request")
                if tx.get("capture_tombstone", record_id):
                    raise DomainError(404, "not_found")
                node = local.get(record_id)
                if node is None:
                    stored = tx.get("capture_record", record_id)
                    if stored is None:
                        raise DomainError(409, "dependency_missing")
                    node = _decode(stored)
                    local[record_id] = node
                record = node["record"]
                snapshot = self._source(tx, record["source"], user_id, authority)
                if typed_originals and record_id not in submitted:
                    self._ready_snapshot(tx, user_id, record["source"], snapshot)
                    if is_display(snapshot) and record["frame_id"] is None:
                        raise DomainError(409, "unsupported_source")
                    # Includes ancestors already prefetched below. A causal
                    # reference cannot promote old untyped or missing bytes.
                    for reference in record["artifacts"]:
                        self._artifact(tx, user_id, record["source"], reference, require_typed=True)
                    if record["frame_id"] is not None:
                        if tx.get("frame_tombstone", record["frame_id"]):
                            raise DomainError(404, "not_found")
                        frame = self._owned(tx, "frame", record["frame_id"], user_id)
                        original = self._owned(tx, "artifact", frame["artifact_id"], user_id)
                        # Stored originals omit transport-only fields. Reuse
                        # this envelope solely for the pure binding validator,
                        # retaining the ancestor's actual stream and record.
                        ancestor_batch = {**batch, **{k: node[k] for k in
                                          ("device_id", "session_id", "stream_id")}, "records": [record]}
                        try:
                            validate_capture_frame(ancestor_batch, record_id, frame, original["original_binding"])
                            if is_display(snapshot):
                                validate_display_record(snapshot, ancestor_batch, record_id, frame)
                        except (ValidationError, KeyError, ValueError, TypeError):
                            raise DomainError(503, "unavailable") from None
                sources.add(record["source"]["source_id"])
                visiting.add(record_id)
                stack.append((record_id, True))
                for parent_id in record["causal_parents"]:
                    parent = local.get(parent_id)
                    if parent is None:
                        stored = tx.get("capture_record", parent_id)
                        if stored is not None:
                            parent = _decode(stored)
                            local[parent_id] = parent
                    if parent is not None and all(parent[k] == node[k] for k in ("device_id", "stream_id")):
                        if parent["record"]["sequence"] >= record["sequence"]:
                            raise DomainError(422, "invalid_request")
                    stack.append((parent_id, False))
        return sources

    def _artifact(self, tx, user_id, source, reference, *, require_typed=False):
        artifact_id = reference["artifact_id"]
        if (tx.get("capture_artifact_tombstone", artifact_id)
                or tx.get("original_artifact_tombstone", artifact_id)):
            raise DomainError(404, "not_found")
        prior = tx.get("capture_artifact_ref", artifact_id)
        if prior is not None and prior != reference:
            raise DomainError(409, "record_conflict")
        stored = tx.get("artifact", artifact_id)
        if stored is None:
            if require_typed:
                raise DomainError(409, "dependency_missing")
            return {**reference, "status": "pending"}
        if stored.get("user_id") != user_id:
            raise DomainError(404, "not_found")
        from services.api.original_artifacts import check_reference
        upload = check_reference(tx, user_id, source, stored, artifact_id)
        if require_typed:
            if upload is None:
                raise DomainError(409, "dependency_missing")
            if upload["artifact"] != reference:
                raise DomainError(409, "record_conflict")
            return {**reference, "status": "verified"}
        try:
            data = base64.b64decode(stored["data_base64"], validate=True)
        except (ValueError, KeyError, TypeError):
            raise DomainError(503, "unavailable") from None
        digest = hashlib.sha256(data).hexdigest()
        if digest != stored.get("content_hash"):
            raise DomainError(503, "unavailable")
        if digest != reference["sha256"] or len(data) != reference["byte_length"]:
            raise DomainError(409, "record_conflict")
        media_type = stored.get("media_type")
        if media_type is not None and media_type != reference["media_type"]:
            raise DomainError(409, "record_conflict")
        # Legacy blobs have no independently stored MIME fact. Never infer it
        # from a new request; matching bytes alone remain conservatively pending.
        return {**reference, "status": "verified" if media_type is not None else "pending"}

    def ingest(self, user_id, batch, idempotency_key):
        return self._ingest(user_id, batch, idempotency_key)

    def _ingest(self, user_id, batch, idempotency_key, *, frames=None):
        """Shared transaction engine; frames are opted in by ControlRegistry only."""
        try:
            batch = deepcopy(batch)
        except RecursionError:
            raise DomainError(422, "invalid_request") from None
        if isinstance(batch, dict) and "contract_version" in batch and batch["contract_version"] != "0.2.0":
            raise DomainError(422, "unsupported_version")
        _validate("ProcessBatch", batch)
        _validate("Identifier", user_id)
        _validate("IdempotencyKey", idempotency_key)
        proposed = None
        if frames is not None:
            if not isinstance(frames, (list, tuple)) or not frames:
                raise DomainError(422, "invalid_request")
            proposed = {}
            for supplied in frames:
                checked("Frame", supplied)
                if supplied["frame_id"] in proposed:
                    raise DomainError(422, "invalid_request")
                proposed[supplied["frame_id"]] = deepcopy(supplied)
            if set(proposed) != {r["frame_id"] for r in batch["records"] if r["frame_id"] is not None}:
                raise DomainError(422, "invalid_request")
        typed_originals = proposed is not None
        cache_key = (key("internal_capture_frames", idempotency_key) if typed_originals
                     else key("POST", "/v2/process/events:batch", idempotency_key))
        request_hash = fingerprint({"batch": batch, "frames": proposed} if typed_originals else batch)
        with self.store.transaction(user_id) as tx:
            authority, binding = self._authority(tx, user_id, batch, typed_originals=typed_originals)
            cached = tx.get("capture_replay", cache_key)
            if cached:
                if cached.get("deleted"):
                    raise DomainError(404, "not_found")
                if cached["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
            source_ids = self._dependencies(tx, user_id, batch, authority, typed_originals=typed_originals)
            if typed_originals:
                absent_records = {r["record_id"] for r in batch["records"]
                                  if tx.get("capture_record", r["record_id"]) is None}
                if absent_records:
                    # A new request key/sequence/stream cannot replace a lost
                    # original witnessed by any existing committed receipt.
                    if any(row["record_id"] in absent_records for row in tx.scan("capture_slot")):
                        raise DomainError(503, "unavailable")
                    for replay in tx.scan("capture_replay"):
                        if replay.get("deleted") is True and "response_json" not in replay:
                            continue  # Erasure leaves only key/deleted; tombstones fence IDs.
                        try:
                            response = json.loads(replay["response_json"])
                            validate("ProcessBatchAck", response)
                        except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
                            raise DomainError(503, "unavailable") from None
                        if any(r["record_id"] in absent_records for r in response["acknowledged"]):
                            raise DomainError(503, "unavailable")
                absent_frames = {fid for fid in proposed if tx.get("frame", fid) is None}
                if absent_frames or absent_records:
                    for row in tx.scan("capture_record"):
                        original = _decode(row)["record"]
                        if (original["frame_id"] in absent_frames
                                or absent_records.intersection(original["causal_parents"])):
                            # A surviving committed record witnesses its frame
                            # and parents. Never restore them from a late retry.
                            raise DomainError(503, "unavailable")
            receipts, records, refs, verified = [], [], {}, set()
            for record in batch["records"]:
                record_id = record["record_id"]
                canonical = canonical_record(batch, record_id).decode("utf-8")
                old = tx.get("capture_record", record_id)
                if typed_originals and cached and old is None:
                    raise DomainError(503, "unavailable")
                if old is not None and old["canonical_json"] != canonical:
                    raise DomainError(409, "record_conflict")
                # JSON Schema integers may be encoded as 1.0. Normalize storage
                # identity only; canonical originals retain their supplied bytes.
                slot_key = key(batch["device_id"], batch["stream_id"], int(record["sequence"]))
                slot = {"key": slot_key, "record_id": record_id}
                previous_slot = tx.get("capture_slot", slot_key)
                if previous_slot is not None and previous_slot != slot:
                    raise DomainError(409, "record_conflict")
                if typed_originals and old is not None and previous_slot is None:
                    raise DomainError(503, "unavailable")
                if record["frame_id"] is not None:
                    if typed_originals:
                        frame = proposed[record["frame_id"]]
                        stored_frame = tx.get("frame", record["frame_id"])
                        if tx.get("frame_tombstone", record["frame_id"]):
                            raise DomainError(404, "not_found")
                        if (old is not None or cached) and stored_frame is None:
                            # Missing committed originals are not permission to
                            # restore them from a late request or cached ACK.
                            raise DomainError(503, "unavailable")
                        if stored_frame is not None and stored_frame != frame:
                            raise DomainError(409, "record_conflict")
                        original = self._owned(tx, "artifact", frame["artifact_id"], user_id)
                        from services.api.original_artifacts import is_typed
                        if not is_typed(original):
                            raise DomainError(409, "dependency_missing")
                    else:
                        frame = self._owned(tx, "frame", record["frame_id"], user_id)
                    try:
                        if typed_originals:
                            validate_capture_frame(batch, record_id, frame, original["original_binding"])
                            snapshot = self._source(tx, record["source"], user_id, authority)
                            if is_display(snapshot):
                                validate_display_record(snapshot, batch, record_id, frame)
                        else:
                            validate_record_frame(batch, record_id, frame)
                    except ValidationError:
                        raise DomainError(422, "invalid_request") from None
                artifacts = []
                for reference in record["artifacts"]:
                    receipt = self._artifact(tx, user_id, record["source"], reference,
                                             require_typed=typed_originals)
                    artifacts.append(receipt)
                    refs.setdefault(reference["artifact_id"], reference)
                    if receipt["status"] == "verified":
                        verified.add(tuple(reference[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")))
                received_at = old["received_at"] if old else self.archive._timestamp()
                records.append((record_id, {"canonical_json": canonical, "received_at": received_at}, slot))
                receipts.append({"record_id": record_id, "sequence": record["sequence"],
                                 "disposition": "duplicate" if old else "accepted", "received_at": received_at,
                                 "envelope": "committed", "artifacts": artifacts})
            if cached:
                response = json.loads(cached["response_json"])
                try:
                    validate_ack(batch, response, user_id=user_id, verified_artifacts=verified)
                except ValidationError:
                    raise DomainError(503, "unavailable") from None
                return response
            ack = {"contract_version": "0.2.0", "user_id": user_id,
                   **{k: batch[k] for k in ("batch_id", "device_id", "session_id", "stream_id")},
                   "acknowledged": receipts}
            validate_ack(batch, ack, user_id=user_id, verified_artifacts=verified)
            if typed_originals:
                for frame_id, frame in proposed.items():
                    self.archive._immutable(tx, "frame", frame_id, frame)
            tx.put("capture_binding", batch["stream_id"], binding)
            for record_id, stored, slot in records:
                tx.put("capture_record", record_id, stored)
                tx.put("capture_slot", slot["key"], slot)
            for artifact_id, reference in refs.items():
                if tx.get("capture_artifact_ref", artifact_id) is None:
                    tx.put("capture_artifact_ref", artifact_id, reference)
            tx.put("capture_replay", cache_key, {"key": cache_key, "fingerprint": request_hash,
                   # JSONB number normalization must not change exact receipts.
                   "response_json": json.dumps(ack, sort_keys=True, ensure_ascii=False, separators=(",", ":")),
                   "source_ids": sorted(source_ids), "deleted": False})
        return deepcopy(ack)

    def read_record(self, user_id, record_id):
        _validate("Identifier", user_id)
        _validate("Identifier", record_id)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            stored = tx.get("capture_record", record_id)
            if stored is None:
                raise DomainError(404, "not_found")
            result = _decode(stored)
            self._source(tx, result["record"]["source"], user_id)
            from services.api.original_artifacts import is_typed
            for reference in result["record"]["artifacts"]:
                artifact_id = reference["artifact_id"]
                if tx.get("original_artifact_tombstone", artifact_id):
                    raise DomainError(404, "not_found")
                artifact = tx.get("artifact", artifact_id)
                if artifact is not None and is_typed(artifact):
                    self._artifact(tx, user_id, result["record"]["source"], reference)
            return result
