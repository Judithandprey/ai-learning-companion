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

from packages.contracts.process_v2 import (
    CaptureAuthority, canonical_record, validate, validate_ack,
    validate_record_frame, validate_submission,
)
from services.api.domain import Archive, fingerprint, key
from services.api.errors import DomainError


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
    artifacts = set()
    for row in tx.scan("capture_record"):
        record = _decode(row)["record"]
        if record["source"]["source_id"] == source_id:
            artifacts.update(a["artifact_id"] for a in record["artifacts"])
            tx.delete("capture_record", record["record_id"])
            tx.put("capture_tombstone", record["record_id"], {"record_id": record["record_id"]})
    for replay in tx.scan("capture_replay"):
        if source_id in replay.get("source_ids", []):
            tx.put("capture_replay", replay["key"], {"key": replay["key"], "deleted": True})
    # No canonical text, answer hash or receipt body is retained in tombstones.
    # Stream slot IDs remain reserved. Unrelated raw descendants remain originals;
    # their erased causal parent is unavailable, never reconstructed by replay.
    return artifacts


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
        return self._owned(tx, "snapshot", key(source["source_id"], int(source["source_version"])), user_id)

    def _authority(self, tx, user_id, batch):
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
            self._source(tx, record["source"], user_id, authority)
            if record["artifacts"] and not self.allow_artifact_references:
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

    def _dependencies(self, tx, user_id, batch, authority):
        """Resolve the complete owned parent graph, including stored ancestors."""
        local = {r["record_id"]: {**{k: batch[k] for k in ("device_id", "session_id", "stream_id")},
                                  "record": r} for r in batch["records"]}
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
                self._source(tx, record["source"], user_id, authority)
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

    def _artifact(self, tx, user_id, source, reference):
        artifact_id = reference["artifact_id"]
        if (tx.get("capture_artifact_tombstone", artifact_id)
                or tx.get("original_artifact_tombstone", artifact_id)):
            raise DomainError(404, "not_found")
        prior = tx.get("capture_artifact_ref", artifact_id)
        if prior is not None and prior != reference:
            raise DomainError(409, "record_conflict")
        stored = tx.get("artifact", artifact_id)
        if stored is None:
            return {**reference, "status": "pending"}
        if stored.get("user_id") != user_id:
            raise DomainError(404, "not_found")
        from services.api.original_artifacts import check_reference
        check_reference(tx, user_id, source, stored, artifact_id)
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
        try:
            batch = deepcopy(batch)
        except RecursionError:
            raise DomainError(422, "invalid_request") from None
        if isinstance(batch, dict) and "contract_version" in batch and batch["contract_version"] != "0.2.0":
            raise DomainError(422, "unsupported_version")
        _validate("ProcessBatch", batch)
        _validate("Identifier", user_id)
        _validate("IdempotencyKey", idempotency_key)
        cache_key = key("POST", "/v2/process/events:batch", idempotency_key)
        request_hash = fingerprint(batch)
        with self.store.transaction(user_id) as tx:
            authority, binding = self._authority(tx, user_id, batch)
            cached = tx.get("capture_replay", cache_key)
            if cached:
                if cached.get("deleted"):
                    raise DomainError(404, "not_found")
                if cached["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
            source_ids = self._dependencies(tx, user_id, batch, authority)
            receipts, records, refs, verified = [], [], {}, set()
            for record in batch["records"]:
                record_id = record["record_id"]
                canonical = canonical_record(batch, record_id).decode("utf-8")
                old = tx.get("capture_record", record_id)
                if old is not None and old["canonical_json"] != canonical:
                    raise DomainError(409, "record_conflict")
                # JSON Schema integers may be encoded as 1.0. Normalize storage
                # identity only; canonical originals retain their supplied bytes.
                slot_key = key(batch["device_id"], batch["stream_id"], int(record["sequence"]))
                slot = {"key": slot_key, "record_id": record_id}
                previous_slot = tx.get("capture_slot", slot_key)
                if previous_slot is not None and previous_slot != slot:
                    raise DomainError(409, "record_conflict")
                if record["frame_id"] is not None:
                    frame = self._owned(tx, "frame", record["frame_id"], user_id)
                    try:
                        validate_record_frame(batch, record_id, frame)
                    except ValidationError:
                        raise DomainError(422, "invalid_request") from None
                artifacts = []
                for reference in record["artifacts"]:
                    receipt = self._artifact(tx, user_id, record["source"], reference)
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
