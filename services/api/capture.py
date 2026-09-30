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

from packages.contracts import capture_frame, desktop_frame, windows_frame, macos_frame
from packages.contracts.original_artifact import validate_capture_frame
from packages.contracts.display_source import validate_display_record
from packages.contracts.process_v2 import (
    CaptureAuthority, canonical_record, validate, validate_ack,
    validate_record_frame, validate_submission,
)
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError
from services.api.display_sources import is_display, load as load_display, validate_desktop_gap
from services.api.frame_variants import (
    check_macos_image_consistency, check_windows_image_consistency,
    raw_artifact_references, retained_raw_contract, validate_raw_binding,
)

PIXEL_PRODUCER_PROFILE = "desktop_pixels"


def _validate(name, value):
    try:
        validate(name, value)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_request") from None


def _decode(stored):
    try:
        result = json.loads(stored["canonical_json"])
        if set(result) != {"device_id", "session_id", "stream_id", "record"}:
            raise ValueError("invalid stored envelope")
        for field in ("device_id", "session_id", "stream_id"):
            validate("Identifier", result[field])
        validate("ProcessRecord", result["record"])
        validate("UtcTimestamp", stored["received_at"])
        return {**result, "received_at": stored["received_at"]}
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None


def _decode_ack(replay, *, expected_key=None):
    """Decode an active receipt; only the exact erasure shape has no ACK."""
    try:
        if (not isinstance(replay, dict) or type(replay.get("key")) is not str
                or not replay["key"] or (expected_key is not None and replay["key"] != expected_key)):
            raise ValueError("invalid retained replay key")
        if replay.get("deleted") is True and set(replay) == {"key", "deleted"}:
            return None
        if (set(replay) != {"key", "fingerprint", "response_json", "source_ids", "deleted"}
                or replay["deleted"] is not False
                or type(replay["fingerprint"]) is not str
                or len(replay["fingerprint"]) != 64
                or any(c not in "0123456789abcdef" for c in replay["fingerprint"])
                or type(replay["response_json"]) is not str
                or type(replay["source_ids"]) is not list or not replay["source_ids"]):
            raise ValueError("invalid retained replay receipt")
        for source_id in replay["source_ids"]:
            validate("Identifier", source_id)
        if replay["source_ids"] != sorted(set(replay["source_ids"])):
            raise ValueError("invalid retained source inventory")
        response = json.loads(replay["response_json"])
        validate("ProcessBatchAck", response)
        return response
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None


def _active_acks(tx):
    for replay in tx.scan("capture_replay"):
        ack = _decode_ack(replay)
        if ack is not None:
            yield ack


def _stream_committed(tx, stream_id):
    """Surviving originals or fences cannot authorize binding reconstruction."""
    if any(_decode(row)["stream_id"] == stream_id for row in tx.scan("capture_record")):
        return True
    for slot in tx.scan("capture_slot"):
        try:
            parts = json.loads(slot["key"])
            if type(parts) is not list or len(parts) != 3:
                raise ValueError("invalid retained slot")
        except (KeyError, ValueError, TypeError):
            raise DomainError(503, "unavailable") from None
        if parts[1] == stream_id:
            return True
    if any(row.get("stream_id") == stream_id for row in tx.scan("raw_capture_frame")):
        return True
    return any(ack["stream_id"] == stream_id for ack in _active_acks(tx))


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

    @staticmethod
    def _admit_evidence(tx, user_id, batch, *, desktop):
        """Current producer restriction, not decoding or historical attestation.

        Only trusted host control code binds this internal profile. A marked
        incarnation cannot evade it through a different route or registry.
        Unmarked pre-extension generic capture retains its existing boundary.
        """
        stream = tx.get("control_stream", batch["stream_id"])
        grant = tx.get("control_start", batch["stream_id"])
        marked = any(isinstance(row, dict) and "producer_profile" in row for row in (stream, grant))
        if not marked:
            # Retained desktop use witnesses lost configuration; it grants no
            # authority and cannot become a downgrade into generic capture.
            retained_desktop = any(row.get("contract_version") in {"0.2.7", "0.2.9", "0.2.11"}
                and row.get("stream_id") == batch["stream_id"]
                for row in tx.scan("raw_capture_frame"))
            if desktop or retained_desktop:
                raise DomainError(403, "forbidden")
            # A first desktop gap has no frame, but its retained route receipt
            # still witnesses this incarnation's desktop use under the actor lock.
            prefixes = (key("POST", "/v2/process/desktop-frames:batch")[:-1] + ",",
                        key("POST", "/v2/process/windows-frames:batch")[:-1] + ",",
                        key("POST", "/v2/process/macos-frames:batch")[:-1] + ",",
                        key("internal_windows_capture_frames")[:-1] + ",",
                        key("internal_macos_capture_frames")[:-1] + ",")
            for replay in tx.scan("capture_replay"):
                ack = _decode_ack(replay)
                if ack is not None and replay["key"].startswith(prefixes):
                    if ack["user_id"] == user_id and ack["stream_id"] == batch["stream_id"]:
                        raise DomainError(403, "forbidden")
            return
        if (not isinstance(stream, dict) or not isinstance(grant, dict)
                or stream.get("producer_profile") != PIXEL_PRODUCER_PROFILE
                or grant.get("producer_profile") != PIXEL_PRODUCER_PROFILE
                or grant.get("status") != "consumed" or grant.get("deleted")
                or stream.get("deleted") or not isinstance(stream.get("producer_id"), str)
                or not stream["producer_id"] or grant.get("producer_id") != stream["producer_id"]):
            raise DomainError(403, "forbidden")
        state = stream.get("state", {})
        if (state.get("user_id") != user_id or any(state.get(name) != batch[name]
                for name in ("device_id", "session_id", "stream_id"))
                or any(grant.get(name) != state.get(name) for name in (
                    "user_id", "device_id", "session_id", "stream_id",
                    "authorization_generation", "membership_revision"))):
            raise DomainError(403, "forbidden")
        for record in batch["records"]:
            if (record["surface"] != "external_app" or record["method"] != "visual"
                    or record["evidence"]["kind"] != "coverage"):
                raise DomainError(403, "forbidden")

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

    def _authority(self, tx, user_id, batch, *, typed_originals=False, desktop_gaps=False):
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
        # Every entry writes this binding, including frameless legacy capture.
        # Changing ingress family cannot turn a lost committed stream into new.
        if previous is None and _stream_committed(tx, batch["stream_id"]):
            raise DomainError(503, "unavailable")
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
            if desktop_gaps and record["frame_id"] is None:
                if not is_display(snapshot):
                    raise DomainError(409, "unsupported_source")
                try:
                    validate_desktop_gap(snapshot, batch, record)
                except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
                    raise DomainError(422, "invalid_request") from None
            elif is_display(snapshot) and (not typed_originals or record["frame_id"] is None):
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

    @staticmethod
    def _retained_frame(tx, user_id, frame_id, *, check_retained):
        if tx.get("frame_tombstone", frame_id) is not None:
            raise DomainError(404, "not_found")
        legacy, raw = tx.get("frame", frame_id), tx.get("raw_capture_frame", frame_id)
        if legacy is not None and raw is not None:
            raise DomainError(503, "unavailable")
        frame = raw if raw is not None else legacy
        if frame is None:
            raise DomainError(503 if check_retained else 404,
                              "unavailable" if check_retained else "not_found")
        try:
            if raw is not None:
                artifact_ids = [ref["artifact_id"] for ref in raw_artifact_references(frame)]
                owner = frame["source"]["user_id"]
            else:
                checked("Frame", frame)
                owner, artifact_ids = frame["user_id"], [frame["artifact_id"]]
            if frame["frame_id"] != frame_id:
                raise ValueError("stored frame identity differs")
        except (ValidationError, DomainError, KeyError, ValueError, TypeError, RecursionError):
            raise DomainError(503, "unavailable") from None
        if owner != user_id:
            raise DomainError(404, "not_found")
        return frame, artifact_ids, raw is not None

    def _dependencies(self, tx, user_id, batch, authority, *, typed_originals=False,
                      check_retained=False, committed=False, retained_frames=None):
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
                if tx.get("capture_tombstone", record_id) is not None:
                    raise DomainError(404, "not_found")
                node = local.get(record_id)
                if node is None:
                    stored = tx.get("capture_record", record_id)
                    if stored is None:
                        if check_retained and (
                                any(r["record_id"] == record_id for r in tx.scan("capture_slot"))
                                or any(record_id in _decode(r)["record"]["causal_parents"]
                                       for r in tx.scan("capture_record"))
                                or any(receipt["record_id"] == record_id
                                       for ack in _active_acks(tx)
                                       for receipt in ack["acknowledged"])):
                            raise DomainError(503, "unavailable")
                        raise DomainError(409, "dependency_missing")
                    node = _decode(stored)
                    local[record_id] = node
                record = node["record"]
                if check_retained:
                    from services.api.display_sources import require_retained_source
                    require_retained_source(tx, user_id, record["source"])
                snapshot = self._source(tx, record["source"], user_id, authority)
                if (committed and record["frame_id"] is not None
                        and tx.get("frame_tombstone", record["frame_id"]) is not None):
                    # Current access and deletion precede replay diagnostics,
                    # for submitted frames and retained ancestors alike.
                    raise DomainError(404, "not_found")
                if check_retained:
                    from services.api.original_artifacts import require_retained_bytes
                    for reference in record["artifacts"]:
                        require_retained_bytes(tx, reference["artifact_id"])
                if typed_originals and record_id not in submitted:
                    self._ready_snapshot(tx, user_id, record["source"], snapshot)
                    identity = {k: node[k] for k in ("device_id", "session_id", "stream_id")}
                    binding = tx.get("capture_binding", node["stream_id"])
                    if (binding is None or set(binding) != {*identity, "user_id", "authorization_generation"}
                            or any(binding[k] != value for k, value in identity.items())
                            or binding["user_id"] != user_id
                            or type(binding["authorization_generation"]) is not int
                            or binding["authorization_generation"] < 1
                            or (is_display(snapshot) and binding["authorization_generation"]
                                != tx.get("source", record["source"]["source_id"])["authorization_generation"])):
                        raise DomainError(503, "unavailable")
                    slot_key = key(node["device_id"], node["stream_id"], int(record["sequence"]))
                    if tx.get("capture_slot", slot_key) != {"key": slot_key, "record_id": record_id}:
                        raise DomainError(503, "unavailable")
                    ancestor_batch = {**batch, **identity, "records": [record]}
                    if is_display(snapshot) and record["frame_id"] is None:
                        try:
                            validate_desktop_gap(snapshot, ancestor_batch, record)
                        except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
                            raise DomainError(503, "unavailable") from None
                    # Includes ancestors already prefetched below. A causal
                    # reference cannot promote old untyped or missing bytes.
                    for reference in record["artifacts"]:
                        if tx.get("capture_artifact_ref", reference["artifact_id"]) != reference:
                            raise DomainError(503, "unavailable")
                        self._artifact(tx, user_id, record["source"], reference,
                                       require_typed=True, committed=committed)
                    if record["frame_id"] is not None:
                        frame, artifact_ids, raw = self._retained_frame(
                            tx, user_id, record["frame_id"], check_retained=check_retained)
                        originals = [self._owned(tx, "artifact", artifact_id, user_id)
                                     for artifact_id in artifact_ids]
                        # Stored originals omit transport-only fields. Reuse
                        # this envelope solely for the pure binding validator,
                        # retaining the ancestor's actual stream and record.
                        try:
                            if raw:
                                validate_raw_binding(ancestor_batch, record_id, frame, snapshot,
                                                     [original["original_binding"] for original in originals])
                            else:
                                validate_capture_frame(ancestor_batch, record_id, frame, originals[0]["original_binding"])
                            if not raw and is_display(snapshot):
                                validate_display_record(snapshot, ancestor_batch, record_id, frame)
                        except (ValidationError, KeyError, ValueError, TypeError):
                            raise DomainError(503, "unavailable") from None
                        if retained_frames is not None:
                            retained_frames.append(frame)
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

    def _artifact(self, tx, user_id, source, reference, *, require_typed=False, committed=False):
        # A matched complete HTTP or desktop-internal replay proves these
        # references were accepted. Other callers retain client conflicts.
        conflict = (503, "unavailable") if committed else (409, "record_conflict")
        artifact_id = reference["artifact_id"]
        if (tx.get("capture_artifact_tombstone", artifact_id) is not None
                or tx.get("original_artifact_tombstone", artifact_id) is not None):
            raise DomainError(404, "not_found")
        prior = tx.get("capture_artifact_ref", artifact_id)
        if require_typed and prior is None:
            recorded = any(any(ref["artifact_id"] == artifact_id
                               for ref in _decode(row)["record"]["artifacts"])
                           for row in tx.scan("capture_record"))
            raw_frame = any(ref["artifact_id"] == artifact_id for row in tx.scan("raw_capture_frame")
                            for ref in raw_artifact_references(row))
            acknowledged = any(ref["artifact_id"] == artifact_id
                               for ack in _active_acks(tx)
                               for receipt in ack["acknowledged"]
                               for ref in receipt["artifacts"])
            if recorded or raw_frame or acknowledged:
                raise DomainError(503, "unavailable")
        if prior is not None and prior != reference:
            raise DomainError(*conflict)
        stored = tx.get("artifact", artifact_id)
        if stored is None:
            if require_typed:
                raise DomainError(409, "dependency_missing")
            return {**reference, "status": "pending"}
        if stored.get("user_id") != user_id:
            raise DomainError(404, "not_found")
        from services.api.original_artifacts import check_reference
        try:
            upload = check_reference(tx, user_id, source, stored, artifact_id)
        except DomainError as error:
            if committed and error.status == 409 and error.code == "original_source_conflict":
                raise DomainError(503, "unavailable") from None
            raise
        if require_typed:
            if upload is None:
                raise DomainError(409, "dependency_missing")
            if upload["artifact"] != reference:
                raise DomainError(*conflict)
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

    def _ingest(self, user_id, batch, idempotency_key, *, frames=None, request_envelope=None,
                raw=False, desktop=False, windows=False, macos=False):
        """Shared transaction engine; frames are opted in by ControlRegistry only."""
        if ((desktop or windows or macos) and not raw) or sum((desktop, windows, macos)) > 1:
            raise DomainError(422, "invalid_request")
        raw_wire = (macos_frame if macos else windows_frame if windows else
                    desktop_frame if desktop else capture_frame)
        desktop_gaps = macos or windows or (desktop and request_envelope is not None)
        try:
            batch = deepcopy(batch)
        except RecursionError:
            raise DomainError(422, "invalid_request") from None
        if isinstance(batch, dict) and "contract_version" in batch and batch["contract_version"] != "0.2.0":
            raise DomainError(422, "unsupported_version")
        _validate("ProcessBatch", batch)
        _validate("Identifier", user_id)
        _validate("IdempotencyKey", idempotency_key)
        if raw and frames is None:
            raise DomainError(422, "invalid_request")
        frame_kind = "raw_capture_frame" if raw else "frame"
        other_frame_kind = "frame" if raw else "raw_capture_frame"
        check_retained = raw or request_envelope is not None
        proposed = None
        if frames is not None:
            if (not isinstance(frames, (list, tuple)) or (not frames and not desktop_gaps)
                    or (raw and len(frames) > 100)):
                raise DomainError(422, "invalid_request")
            proposed = {}
            for supplied in frames:
                if raw:
                    try:
                        raw_wire.validate(supplied)
                    except (ValidationError, ValueError, TypeError, RecursionError):
                        raise DomainError(422, "invalid_request") from None
                else:
                    checked("Frame", supplied)
                if supplied["frame_id"] in proposed:
                    raise DomainError(422, "invalid_request")
                proposed[supplied["frame_id"]] = deepcopy(supplied)
            if set(proposed) != {r["frame_id"] for r in batch["records"] if r["frame_id"] is not None}:
                raise DomainError(422, "invalid_request")
        typed_originals = proposed is not None
        cache_key = (key("internal_capture_frames", idempotency_key) if typed_originals
                     else key("POST", "/v2/process/events:batch", idempotency_key))
        if raw and request_envelope is None:
            namespace = ("internal_macos_capture_frames" if macos else
                         "internal_windows_capture_frames" if windows else
                         "internal_desktop_capture_frames" if desktop else "internal_raw_capture_frames")
            cache_key = key(namespace, idempotency_key)
            metadata = json.dumps({"batch": batch, "frames": proposed}, ensure_ascii=False,
                                  sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
            if len(metadata) > 4 * 1024 * 1024:
                raise DomainError(413, "payload_too_large")
        request_hash = fingerprint({"batch": batch, "frames": proposed} if typed_originals else batch)
        ack_validator = validate_ack
        if request_envelope is not None:
            from packages.contracts import (
                capture_ingress, raw_capture_ingress, desktop_capture_ingress,
                windows_capture_ingress, macos_capture_ingress,
            )
            if macos:
                envelope_wire, definition = macos_capture_ingress, "MacOSFrameBatchRequest"
                route = "/v2/process/macos-frames:batch"
            elif windows:
                envelope_wire, definition = windows_capture_ingress, "WindowsFrameBatchRequest"
                route = "/v2/process/windows-frames:batch"
            elif desktop:
                envelope_wire, definition = desktop_capture_ingress, "DesktopFrameBatchRequest"
                route = "/v2/process/desktop-frames:batch"
            else:
                envelope_wire = raw_capture_ingress if raw else capture_ingress
                definition = "RawFrameBatchRequest" if raw else "FrameBatchRequest"
                route = "/v2/process/raw-frames:batch" if raw else "/v2/process/frames:batch"
            if raw:
                ack_validator = envelope_wire.validate_ack
            try:
                encoded = envelope_wire.canonical_request(definition, request_envelope)
                if (request_envelope["batch"] != batch
                        or request_envelope["frames"] != frames):
                    raise ValueError("Envelope differs from submitted originals")
            except (ValidationError, ValueError, TypeError, RecursionError):
                raise DomainError(422, "invalid_request") from None
            # Actor transaction supplies owner scope. Retain the whole wrapper,
            # array ordering and all versions, unlike legacy internal map replay.
            cache_key = key("POST", route, idempotency_key)
            request_hash = hashlib.sha256(encoded).hexdigest()
        with self.store.transaction(user_id) as tx:
            if check_retained:
                self._authorized(tx)
                from services.api.display_sources import require_retained_source
                for record in batch["records"]:
                    require_retained_source(tx, user_id, record["source"])
            authority, binding = self._authority(tx, user_id, batch, typed_originals=typed_originals,
                                                 desktop_gaps=desktop_gaps)
            cached = tx.get("capture_replay", cache_key)
            if cached is not None:
                # A present corrupt receipt is never permission to reconstruct
                # its ordered request identity or ACK from a submitted retry.
                response = _decode_ack(cached, expected_key=cache_key)
                if response is None:
                    raise DomainError(404, "not_found")
                if cached["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
            exact_raw_replay = raw and (request_envelope is not None or desktop or windows or macos) and cached is not None
            conflict = (503, "unavailable") if exact_raw_replay else (409, "record_conflict")
            dependency_frames = [] if macos else None
            source_ids = self._dependencies(tx, user_id, batch, authority, typed_originals=typed_originals,
                                           check_retained=check_retained, committed=exact_raw_replay,
                                           retained_frames=dependency_frames)
            if raw and cached is not None and cached["source_ids"] != sorted(source_ids):
                raise DomainError(503, "unavailable")
            absent_records = {r["record_id"] for r in batch["records"]
                              if tx.get("capture_record", r["record_id"]) is None}
            if absent_records:
                # Every entry writes records. Switching to unframed legacy
                # capture cannot release a witnessed, previously committed ID.
                if any(row["record_id"] in absent_records for row in tx.scan("capture_slot")):
                    raise DomainError(503, "unavailable")
                for response in _active_acks(tx):
                    if any(r["record_id"] in absent_records for r in response["acknowledged"]):
                        raise DomainError(503, "unavailable")
            absent_frames = set()
            if typed_originals:
                for fid in proposed:
                    if tx.get(other_frame_kind, fid) is not None:
                        if exact_raw_replay:
                            raise DomainError(503, "unavailable")
                        raise DomainError(409, "frame_identity_conflict")
                absent_frames = {fid for fid in proposed if tx.get(frame_kind, fid) is None}
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
                if typed_originals and old is not None:
                    _decode(old)
                if typed_originals and cached is not None and old is None:
                    raise DomainError(503, "unavailable")
                if old is not None and old["canonical_json"] != canonical:
                    raise DomainError(*conflict)
                # JSON Schema integers may be encoded as 1.0. Normalize storage
                # identity only; canonical originals retain their supplied bytes.
                slot_key = key(batch["device_id"], batch["stream_id"], int(record["sequence"]))
                slot = {"key": slot_key, "record_id": record_id}
                previous_slot = tx.get("capture_slot", slot_key)
                if previous_slot is not None and previous_slot != slot:
                    raise DomainError(*conflict)
                if typed_originals and old is not None and previous_slot is None:
                    raise DomainError(503, "unavailable")
                if record["frame_id"] is not None:
                    if typed_originals:
                        frame = proposed[record["frame_id"]]
                        stored_frame = tx.get(frame_kind, record["frame_id"])
                        if tx.get("frame_tombstone", record["frame_id"]) is not None:
                            raise DomainError(404, "not_found")
                        if (old is not None or cached is not None) and stored_frame is None:
                            # Missing committed originals are not permission to
                            # restore them from a late request or cached ACK.
                            raise DomainError(503, "unavailable")
                        if raw and stored_frame is not None:
                            try:
                                retained_raw_contract(stored_frame).validate(stored_frame)
                                if stored_frame["frame_id"] != record["frame_id"]:
                                    raise ValueError("retained frame key differs")
                            except (ValidationError, ValueError, TypeError, RecursionError):
                                raise DomainError(503, "unavailable") from None
                        if stored_frame is not None and stored_frame != frame:
                            raise DomainError(*conflict)
                        artifact_ids = ([ref["artifact_id"] for ref in raw_artifact_references(frame)]
                                        if raw else [frame["artifact_id"]])
                        originals = [self._owned(tx, "artifact", artifact_id, user_id)
                                     for artifact_id in artifact_ids]
                        from services.api.original_artifacts import is_typed, stored_upload
                        for original, artifact_id in zip(originals, artifact_ids):
                            if not is_typed(original):
                                raise DomainError(409, "dependency_missing")
                            if check_retained:
                                # Stored corruption is unavailable, not invalid
                                # client descriptor metadata below.
                                stored_upload(original, user_id, artifact_id)
                    else:
                        frame = self._owned(tx, "frame", record["frame_id"], user_id)
                    try:
                        if typed_originals:
                            snapshot = self._source(tx, record["source"], user_id, authority)
                            if raw:
                                validate_raw_binding(batch, record_id, frame, snapshot,
                                                     [original["original_binding"] for original in originals])
                            else:
                                validate_capture_frame(batch, record_id, frame, originals[0]["original_binding"])
                            if not raw and is_display(snapshot):
                                validate_display_record(snapshot, batch, record_id, frame)
                        else:
                            validate_record_frame(batch, record_id, frame)
                    except ValidationError:
                        if exact_raw_replay:
                            raise DomainError(503, "unavailable") from None
                        raise DomainError(422, "invalid_request") from None
                artifacts = []
                for reference in record["artifacts"]:
                    if raw and old is not None and tx.get("capture_artifact_ref", reference["artifact_id"]) is None:
                        raise DomainError(503, "unavailable")
                    receipt = self._artifact(tx, user_id, record["source"], reference,
                                             require_typed=typed_originals, committed=exact_raw_replay)
                    artifacts.append(receipt)
                    refs.setdefault(reference["artifact_id"], reference)
                    if receipt["status"] == "verified":
                        verified.add(tuple(reference[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")))
                received_at = old["received_at"] if old else self.archive._timestamp()
                records.append((record_id, {"canonical_json": canonical, "received_at": received_at}, slot))
                receipts.append({"record_id": record_id, "sequence": record["sequence"],
                                 "disposition": "duplicate" if old else "accepted", "received_at": received_at,
                                 "envelope": "committed", "artifacts": artifacts})
            self._admit_evidence(tx, user_id, batch, desktop=desktop or windows or macos)
            if windows:
                check_windows_image_consistency(tx, proposed.values(), conflict=conflict)
            if macos:
                check_macos_image_consistency(tx, proposed.values(), targets=dependency_frames,
                                              conflict=conflict)
            if cached is not None:
                try:
                    ack_validator(batch, response, user_id=user_id, verified_artifacts=verified)
                    retained_times = {receipt["record_id"]: receipt["received_at"] for receipt in receipts}
                    if raw and any(receipt["received_at"] != retained_times[receipt["record_id"]]
                                   for receipt in response["acknowledged"]):
                        raise ValueError("cached receipt time differs from retained original")
                except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
                    raise DomainError(503, "unavailable") from None
                if check_retained and any(
                        artifact["status"] != "verified" for receipt in response["acknowledged"]
                        for artifact in receipt["artifacts"]):
                    # Legacy ACKs may retain pending bytes. Typed ingress requires
                    # verified receipts, including an unchanged cached response.
                    raise DomainError(503, "unavailable")
                if raw:
                    self._authorized(tx)
                return response
            ack = {"contract_version": "0.2.0", "user_id": user_id,
                   **{k: batch[k] for k in ("batch_id", "device_id", "session_id", "stream_id")},
                   "acknowledged": receipts}
            ack_validator(batch, ack, user_id=user_id, verified_artifacts=verified)
            if typed_originals:
                for frame_id, frame in proposed.items():
                    self.archive._immutable(tx, frame_kind, frame_id, frame)
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
            if raw:
                self._authorized(tx)
        return deepcopy(ack)

    def read_record(self, user_id, record_id):
        _validate("Identifier", user_id)
        _validate("Identifier", record_id)
        with self.store.transaction(user_id) as tx:
            self._authorized(tx)
            if tx.get("capture_tombstone", record_id) is not None:
                raise DomainError(404, "not_found")
            stored = tx.get("capture_record", record_id)
            if stored is None:
                raise DomainError(404, "not_found")
            result = _decode(stored)
            self._source(tx, result["record"]["source"], user_id)
            from services.api.original_artifacts import is_typed
            for reference in result["record"]["artifacts"]:
                artifact_id = reference["artifact_id"]
                if tx.get("original_artifact_tombstone", artifact_id) is not None:
                    raise DomainError(404, "not_found")
                artifact = tx.get("artifact", artifact_id)
                if artifact is not None and is_typed(artifact):
                    self._artifact(tx, user_id, result["record"]["source"], reference)
            return result
