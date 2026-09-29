"""Internal persisted stream controls; no HTTP or producer/device activation.

The embedding service supplies authenticated scopes/capabilities and a current
authorization guard. Membership changes and authorize_start are trusted service
entries, never exposed to course pages. Producer IDs identify independent capture
paths internally; they are not a new wire field. A stop-fact resolver reads an
independently persisted producer fact, never the command's proposed boundary.
"""

from copy import deepcopy
from dataclasses import replace
import json

from jsonschema import ValidationError
from packages.contracts.process_control import (
    CAPABILITY, ControlAuthority, capture_authority, register_stream,
    transition_stream, validate,
)
from services.api.capture import CaptureArchive
from services.api.domain import key, fingerprint
from services.api.errors import DomainError


def _validate(name, value, *, stored=False):
    try:
        validate(name, value)
    except (ValidationError, TypeError, ValueError, RecursionError):
        raise DomainError(503 if stored else 422, "unavailable" if stored else "invalid_request") from None


def _copy_request(name, body):
    if isinstance(body, dict) and body.get("contract_version", "0.2.1") != "0.2.1":
        raise DomainError(422, "unsupported_version")
    _validate(name, body)
    return deepcopy(body)


def invalidate_control(tx, *, device_id=None, session_id=None, producer_id=None):
    """Restrict bindings/grants inside the caller's existing lifecycle transaction."""
    def affected(row):
        state = row.get("state", row)
        return ((device_id is None or state["device_id"] == device_id)
                and (session_id is None or state["session_id"] == session_id)
                and (producer_id is None or row["producer_id"] == producer_id))

    for row in tx.scan("control_start"):
        if row["status"] == "pending" and affected(row):
            row["status"] = "invalidated"
            tx.put("control_start", row["stream_id"], row)
    # A stream stop invalidates pending starts only; account/membership changes
    # also close old incarnations so a newly authorized restart can name them.
    if producer_id is None:
        for row in tx.scan("control_stream"):
            if not row.get("deleted") and affected(row) and row["state"]["state"] != "withdrawn":
                row["state"].update(state="withdrawn", pre_stop_sequence=None,
                                    revision=row["state"]["revision"] + 1)
                _validate("StreamState", row["state"], stored=True)
                tx.put("control_stream", row["state"]["stream_id"], row)


class ControlRegistry:
    def __init__(self, store, *, scopes, capabilities, authorization_guard=None, stop_fact_resolver=None):
        if not callable(authorization_guard):
            raise ValueError("A current caller authorization guard is required")
        if stop_fact_resolver is not None and not callable(stop_fact_resolver):
            raise ValueError("Stop fact resolver must be callable")
        self.store = store
        self.scopes = scopes
        self.capabilities = capabilities
        self.stop_fact_resolver = stop_fact_resolver
        self.capture = CaptureArchive(store, self.resolve_capture, authorization_guard,
                                      allow_artifact_references=False)

    def ingest_frames(self, user_id, batch, frames, idempotency_key):
        """Explicit internal frame+process ingress with current registered control.

        No producer start, HTTP route or default capture-gate change. All frames,
        typed originals and process receipts share CaptureArchive's transaction.
        """
        if not isinstance(frames, (list, tuple)) or not frames:
            raise DomainError(422, "invalid_request")
        return self.capture._ingest(user_id, batch, idempotency_key, frames=frames)

    def _access(self, tx, *, capture=False):
        self.capture._authorized(tx)
        for values in (self.scopes, self.capabilities):
            if type(values) is not frozenset or any(type(v) is not str for v in values):
                raise DomainError(403, "forbidden")
        scope, capability = ("process:capture", "process.capture.v0.2") if capture else ("process:control", CAPABILITY)
        if scope not in self.scopes:
            raise DomainError(403, "forbidden")
        if capability not in self.capabilities:
            raise DomainError(403, "capability_required")
        auth = tx.get("authorization", "state")
        if auth["enabled"] is not True or type(auth["generation"]) is not int:
            raise DomainError(403, "forbidden")
        _validate("Revision", auth["generation"], stored=True)
        return auth["generation"]

    @staticmethod
    def _owned(tx, kind, identifier, user_id):
        row = tx.get(kind, identifier)
        if (row is None or row.get("user_id") != user_id or row.get("id") != identifier
                or row.get("deleted")):
            raise DomainError(404, "not_found")
        return row

    def _authority(self, tx, user_id, device_id, session_id, *, capture=False):
        generation = self._access(tx, capture=capture)
        self._owned(tx, "device", device_id, user_id)
        self._owned(tx, "session", session_id, user_id)
        membership = tx.get("control_membership", key(device_id, session_id))
        if membership is None or any(membership.get(k) != v for k, v in (
                ("user_id", user_id), ("device_id", device_id), ("session_id", session_id))):
            raise DomainError(404, "not_found")
        if membership["active"] is not True:
            raise DomainError(403, "forbidden")
        if type(membership["revision"]) is not int:
            raise DomainError(503, "unavailable")
        _validate("Revision", membership["revision"], stored=True)
        return ControlAuthority(user_id, device_id, session_id, generation, membership["revision"],
                                True, False, self.scopes, self.capabilities)

    @staticmethod
    def _generation(binding, authority):
        if any(binding[field] != getattr(authority, field) for field in
               ("authorization_generation", "membership_revision")):
            raise DomainError(403, "forbidden")

    def set_membership(self, user_id, device_id, session_id, *, active, expected_revision):
        """Trusted service membership decision, not inferred from two owned IDs."""
        for value in (user_id, device_id, session_id):
            _validate("Identifier", value)
        if type(active) is not bool or type(expected_revision) is not int or expected_revision < 0:
            raise DomainError(422, "invalid_request")
        with self.store.transaction(user_id) as tx:
            self._access(tx)
            self._owned(tx, "device", device_id, user_id)
            self._owned(tx, "session", session_id, user_id)
            identity = key(device_id, session_id)
            previous = tx.get("control_membership", identity)
            if expected_revision != (previous["revision"] if previous else 0):
                raise DomainError(409, "stale_revision")
            revision = expected_revision + 1
            _validate("Revision", revision)
            row = dict(user_id=user_id, device_id=device_id, session_id=session_id,
                       active=active, revision=revision)
            invalidate_control(tx, device_id=device_id, session_id=session_id)
            tx.put("control_membership", identity, row)
            return row

    @staticmethod
    def _stream(tx, user_id, stream_id):
        row = tx.get("control_stream", stream_id)
        if row is None or row.get("deleted"):
            raise DomainError(404, "not_found")
        state = row["state"]
        if state.get("user_id") != user_id or state.get("stream_id") != stream_id:
            raise DomainError(404, "not_found")
        _validate("StreamState", state, stored=True)
        return row

    @staticmethod
    def _unused(tx, stream_id):
        if tx.get("control_stream", stream_id) or tx.get("capture_binding", stream_id):
            raise DomainError(409, "stream_conflict")
        # Pre-control capture slots reserve an incarnation even if its content
        # was deleted. Never adopt/regrant that identity as a new stream.
        for slot in tx.scan("capture_slot"):
            if json.loads(slot["key"])[1] == stream_id:
                raise DomainError(409, "stream_conflict")

    def _predecessor(self, tx, user_id, body, producer_id):
        lineage_key = key(body["device_id"], body["session_id"], producer_id)
        lineage = tx.get("control_lineage", lineage_key)
        previous = self._stream(tx, user_id, lineage["stream_id"])["state"] if lineage else None
        expected = ({"kind": "restart", "previous_stream_id": previous["stream_id"], "gap": "unknown"}
                    if previous else {"kind": "initial"})
        if body["continuity"] != expected:
            raise DomainError(409, "invalid_transition")
        return lineage_key, previous

    def authorize_start(self, user_id, registration, *, producer_id):
        """Issue ONE exact-ID decision after independently obtaining scoped consent.

        Only a trusted adapter may call this entry; calling register, reconnecting,
        or possessing an old stream never calls it implicitly. Pins come from the
        original decision, not refreshed at registration. producer_id is stable
        trusted path identity (not a client-selected escape from known lineage).
        """
        body = _copy_request("StreamRegistration", registration)
        _validate("Identifier", user_id)
        _validate("Identifier", producer_id)
        with self.store.transaction(user_id) as tx:
            authority = self._authority(tx, user_id, body["device_id"], body["session_id"])
            self._generation(body, authority)
            self._unused(tx, body["stream_id"])
            if tx.get("control_start", body["stream_id"]) is not None:
                raise DomainError(409, "stream_conflict")
            self._predecessor(tx, user_id, body, producer_id)
            row = {**{k: body[k] for k in ("device_id", "session_id", "stream_id",
                    "authorization_generation", "membership_revision")},
                   "user_id": user_id, "producer_id": producer_id,
                   "fingerprint": fingerprint(body), "status": "pending"}
            tx.put("control_start", body["stream_id"], row)

    def _current(self, tx, user_id, stream_id, *, capture=False):
        self._access(tx, capture=capture)
        row = self._stream(tx, user_id, stream_id)
        state = row["state"]
        authority = self._authority(tx, user_id, state["device_id"], state["session_id"], capture=capture)
        self._generation(state, authority)
        return row, authority

    @staticmethod
    def _replay(tx, cache_key, body):
        cached = tx.get("control_replay", cache_key)
        if cached:
            if cached.get("deleted"):
                raise DomainError(404, "not_found")
            if cached["fingerprint"] != fingerprint(body):
                raise DomainError(409, "idempotency_conflict")
        return cached

    @staticmethod
    def _cache(tx, cache_key, body):
        tx.put("control_replay", cache_key, {"key": cache_key,
               "fingerprint": fingerprint(body), "stream_id": body["stream_id"]})

    def register(self, user_id, registration, idempotency_key):
        body = _copy_request("StreamRegistration", registration)
        _validate("Identifier", user_id)
        _validate("IdempotencyKey", idempotency_key)
        cache_key = key("POST", "/v2/process/streams", idempotency_key)
        with self.store.transaction(user_id) as tx:
            authority = self._authority(tx, user_id, body["device_id"], body["session_id"])
            self._generation(body, authority)
            if self._replay(tx, cache_key, body):
                row, _ = self._current(tx, user_id, body["stream_id"])
                return row["state"]
            self._unused(tx, body["stream_id"])
            grant = tx.get("control_start", body["stream_id"])
            if (grant is None or grant["status"] != "pending"
                    or grant["fingerprint"] != fingerprint(body)):
                raise DomainError(403, "forbidden")
            self._generation(grant, authority)
            lineage_key, predecessor = self._predecessor(tx, user_id, body, grant["producer_id"])
            authority = replace(authority, capture_start_authorized=True, start_stream_id=body["stream_id"])
            try:
                state = register_stream(body, authority, predecessor=predecessor)
            except ValidationError:
                raise DomainError(409, "invalid_transition") from None
            tx.put("control_stream", body["stream_id"], {"state": state, "producer_id": grant["producer_id"]})
            tx.put("control_lineage", lineage_key, {"stream_id": body["stream_id"]})
            grant["status"] = "consumed"
            tx.put("control_start", body["stream_id"], grant)
            self._cache(tx, cache_key, body)
            return deepcopy(state)

    def read(self, user_id, stream_id):
        """Last committed server control state, never proof of actual device capture."""
        _validate("Identifier", user_id)
        _validate("Identifier", stream_id)
        with self.store.transaction(user_id) as tx:
            return self._current(tx, user_id, stream_id)[0]["state"]

    @staticmethod
    def _committed_floor(tx, state):
        sequences = []
        for slot in tx.scan("capture_slot"):
            device_id, stream_id, sequence = json.loads(slot["key"])
            if (device_id, stream_id) == (state["device_id"], state["stream_id"]):
                if type(sequence) is not int or sequence < 1:
                    raise DomainError(503, "unavailable")
                sequences.append(sequence)
        return max(sequences, default=0)

    def _stop_fact(self, tx, user_id, state):
        try:
            fact = self.stop_fact_resolver(tx, user_id, state["stream_id"]) if self.stop_fact_resolver else None
        except DomainError:
            raise
        except Exception:
            raise DomainError(503, "unavailable") from None
        if fact is not None:
            if type(fact) is not int or fact < 0:
                raise DomainError(503, "unavailable")
            _validate("SequenceBoundary", fact, stored=True)
            if fact < self._committed_floor(tx, state):
                raise DomainError(409, "invalid_transition")
        return fact

    def command(self, user_id, stream_id, command, idempotency_key):
        body = _copy_request("StreamCommand", command)
        _validate("Identifier", user_id)
        _validate("Identifier", stream_id)
        _validate("IdempotencyKey", idempotency_key)
        if body["stream_id"] != stream_id:
            raise DomainError(404, "not_found")
        cache_key = key("POST", "/v2/process/streams/" + stream_id + ":control", idempotency_key)
        with self.store.transaction(user_id) as tx:
            row, authority = self._current(tx, user_id, stream_id)
            state = row["state"]
            if any(body[f] != state[f] for f in ("device_id", "session_id")):
                raise DomainError(404, "not_found")
            if self._replay(tx, cache_key, body):
                return state
            if body["expected_revision"] != state["revision"]:
                raise DomainError(409, "stale_revision")
            # Withdrawal/unknown stop must still work if producer evidence is
            # missing or contradictory. Only finite stop/seal consumes that fact.
            boundary = body["action"].get("pre_stop_sequence")
            verified = self._stop_fact(tx, user_id, state) if boundary is not None else None
            try:
                updated = transition_stream(state, body, authority,
                                            committed_through_sequence=self._committed_floor(tx, state),
                                            verified_pre_stop_sequence=verified)
            except ValidationError:
                raise DomainError(409, "invalid_transition") from None
            row["state"] = updated
            tx.put("control_stream", stream_id, row)
            invalidate_control(tx, device_id=state["device_id"], session_id=state["session_id"],
                               producer_id=row["producer_id"])
            self._cache(tx, cache_key, body)
            return deepcopy(updated)

    def resolve_capture(self, tx, user_id, stream_id):
        """Resolve inside CaptureArchive's transaction; no nested transaction/cache."""
        row, authority = self._current(tx, user_id, stream_id, capture=True)
        state = row["state"]
        fact = self._stop_fact(tx, user_id, state)
        if state["state"] == "live" and fact is not None:
            # Producer stop can precede synchronization of the control command.
            # Do not accept live data during that window or infer server stop ACK.
            raise DomainError(409, "capture_stopped")
        if state["state"] == "stopped" and state["pre_stop_sequence"] is not None and fact != state["pre_stop_sequence"]:
            raise DomainError(409, "capture_stopped")
        versions = set()
        for snapshot in tx.scan("snapshot"):
            source = tx.get("source", snapshot["source_id"])
            if (snapshot["user_id"] == user_id and source and source["user_id"] == user_id
                    and source["deleted"] is False and source["revoked"] is False):
                versions.add((snapshot["source_id"], int(snapshot["source_version"])))
        try:
            return capture_authority(state, authority, source_versions=frozenset(versions))
        except ValidationError:
            raise DomainError(403, "forbidden") from None
