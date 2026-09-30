"""Explicit shared-display provenance in the existing actor source store.

Historical descriptors are not transmission grants. Only registration and new
original uploads require a live current producer; reads retain their old binding.
"""

from copy import deepcopy
import json

from jsonschema import ValidationError

from packages.contracts.display_source import CONTRACT_VERSION, validate
from packages.contracts.process_control import validate as validate_control
from packages.contracts.process_v2 import CaptureAuthority
from services.api.domain import Archive, checked, key
from services.api.errors import DomainError


def is_display(value):
    # Unknown explicit variants cannot fall back to legacy text/URL semantics.
    return value.get("type") == "shared_display" or "contract_version" in value


def require_legacy(value):
    if is_display(value):
        raise DomainError(409, "unsupported_source")


def require_retained_source(tx, user_id, reference):
    """Opt-in ingress diagnostics for lost committed heads/snapshots.

    Account authorization precedes this call. Current revocation/deletion/foreign
    fences remain the ordinary access errors, rather than a corruption oracle.
    No record, descriptor or source version is reconstructed from a witness.
    """
    source_id, version = reference["source_id"], reference["source_version"]
    current = tx.get("source", source_id)
    if current is not None and (current.get("user_id") != user_id
                               or current.get("deleted") or current.get("revoked")):
        return
    snapshot = tx.get("snapshot", key(source_id, int(version)))
    if current is not None:
        latest = current.get("current_version")
        if snapshot is None:
            # Imports can skip versions. Numeric ordering cannot establish that
            # this exact older snapshot ever existed; require a retained witness.
            witnessed = (latest == version
                or any(all(r.get(k) == v for k, v in reference.items())
                       for kind in ("frame", "event") for r in tx.scan(kind))
                or any(r.get("original_binding", {}).get("source") == reference
                       and r.get("user_id") == user_id for r in tx.scan("artifact"))
                or any(json.loads(r["canonical_json"])["record"]["source"] == reference
                       for r in tx.scan("capture_record")))
            if witnessed:
                raise DomainError(503, "source_unavailable")
        return
    if (any(r.get("source_id") == source_id and r.get("user_id") == user_id
            for kind in ("snapshot", "frame") for r in tx.scan(kind))
            or any(r.get("original_binding", {}).get("source", {}).get("source_id") == source_id
                   and r.get("user_id") == user_id for r in tx.scan("artifact"))
            or any(json.loads(r["canonical_json"])["record"]["source"]["source_id"] == source_id
                   for r in tx.scan("capture_record"))
            or any(source_id in r.get("source_ids", []) for r in tx.scan("capture_replay"))):
        raise DomainError(503, "source_unavailable")


def _validate(snapshot, *, stored=False):
    try:
        validate(snapshot)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(503 if stored else 422,
                          "source_unavailable" if stored else "invalid_contract") from None


def load(tx, user_id, reference):
    """Read current source access plus immutable historical incarnation facts."""
    current = Archive._source(tx, reference["source_id"])
    if current.get("user_id") != user_id or reference["user_id"] != user_id:
        raise DomainError(404, "source_not_found")
    snapshot = tx.get("snapshot", key(reference["source_id"], int(reference["source_version"])))
    if snapshot is None:
        raise DomainError(404, "reference_not_found")
    _validate(snapshot, stored=True)
    try:
        fields = {"producer_id", "authorization_generation", "membership_revision",
                  "current_version", "generation", "deleted", "revoked"}
        if (set(current) != set(snapshot) | fields
                or any(snapshot[k] != v for k, v in reference.items())
                or any(current[k] != v for k, v in snapshot.items())
                or type(current["source_version"]) is not int
                or type(current["current_version"]) is not int
                or current["current_version"] != snapshot["source_version"]
                or type(current["deleted"]) is not bool or type(current["revoked"]) is not bool):
            raise ValueError("inconsistent display identity")
        for field in ("generation", "authorization_generation", "membership_revision"):
            validate_control("Revision", current[field])
        checked("Identifier", current["producer_id"])
        row = tx.get("control_stream", snapshot["stream_id"])
        state = row["state"]
        validate_control("StreamState", state)
        grant = tx.get("control_start", snapshot["stream_id"])
        if (row.get("deleted") or row["producer_id"] != current["producer_id"]
                or grant["status"] != "consumed" or grant["producer_id"] != current["producer_id"]
                or any(state[k] != snapshot[k] or grant[k] != snapshot[k]
                       for k in ("user_id", "device_id", "session_id", "stream_id"))
                or any(state[k] != current[k] or grant[k] != current[k]
                       for k in ("authorization_generation", "membership_revision"))):
            raise ValueError("inconsistent display incarnation")
        for kind in ("device", "session", "project"):
            identifier = snapshot[kind + "_id"]
            if identifier is not None:
                owned = tx.get(kind, identifier)
                if (owned is None or owned.get("user_id") != user_id
                        or owned.get("id") != identifier or owned.get("deleted")):
                    raise DomainError(404, "reference_not_found")
    except DomainError:
        raise
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "source_unavailable") from None
    return snapshot


def require_live(tx, user_id, snapshot, resolver):
    if not callable(resolver):
        raise DomainError(403, "display_authority_required")
    authority = resolver(tx, user_id, snapshot["stream_id"])
    if not isinstance(authority, CaptureAuthority):
        raise DomainError(403, "display_capture_not_authorized")
    for field in ("scopes", "capabilities", "source_versions"):
        values = getattr(authority, field)
        if type(values) is not frozenset:
            raise DomainError(403, "display_capture_not_authorized")
        for value in values:
            valid = (type(value) is str if field != "source_versions" else
                     type(value) is tuple and len(value) == 2 and type(value[0]) is str
                     and type(value[1]) is int and value[1] > 0)
            if not valid:
                raise DomainError(403, "display_capture_not_authorized")
    if (any(getattr(authority, k) != snapshot[k]
                   for k in ("user_id", "device_id", "session_id", "stream_id"))
            or authority.transmission_allowed is not True
            or authority.live_capture_allowed is not True
            or "process:capture" not in authority.scopes
            or "process.capture.v0.2" not in authority.capabilities
            or (snapshot["source_id"], snapshot["source_version"]) not in authority.source_versions):
        raise DomainError(403, "display_capture_not_authorized")


def _used_identity(tx, source_id):
    """Surviving originals/receipts prevent replacing a missing source head."""
    for kind in ("snapshot", "frame", "event", "source_url", "registration_key"):
        if any(r.get("source_id") == source_id for r in tx.scan(kind)):
            return True
    if any(r["source"]["source_id"] == source_id for r in tx.scan("raw_capture_frame")):
        return True
    if any(source_id in r.get("source_ids", []) for r in tx.scan("http_replay")):
        return True
    if any(r.get("original_binding", {}).get("source", {}).get("source_id") == source_id
           for r in tx.scan("artifact")):
        return True
    if any(json.loads(r["canonical_json"])["record"]["source"]["source_id"] == source_id
           for r in tx.scan("capture_record")):
        return True
    if any(source_id in r.get("source_ids", []) for r in tx.scan("capture_replay")):
        return True
    if any(s["source_id"] == source_id for kind, field in (("job", "wire"), ("job_request", "input"))
           for r in tx.scan(kind) for s in r[field].get("source_versions", [])):
        return True
    return any(s["source_id"] == source_id for kind, field in
               (("note_revision", "context_segments"), ("derived", "source_versions"))
               for r in tx.scan(kind) for s in r.get(field, []))


def register(registry, user_id, source_id, stream_id, *, producer_id=None,
             project_id=None, source_timezone="UTC"):
    resolve_producer = producer_id is None
    for value in (user_id, source_id, stream_id):
        checked("Identifier", value)
    if producer_id is not None:
        checked("Identifier", producer_id)
    if project_id is not None:
        checked("Identifier", project_id)
    with registry.store.transaction(user_id) as tx:
        row, _ = registry._current(tx, user_id, stream_id)
        state = row["state"]
        if producer_id is None:
            # HTTP supplies no producer assertion. Resolve the consumed start
            # decision under this SAME actor lock; never grant or re-register.
            grant = tx.get("control_start", stream_id)
            if (grant is None or grant.get("status") != "consumed"
                    or grant.get("producer_id") != row.get("producer_id")
                    or any(grant.get(k) != state[k] for k in (
                        "user_id", "device_id", "session_id", "stream_id",
                        "authorization_generation", "membership_revision"))):
                raise DomainError(503, "source_unavailable")
            producer_id = row["producer_id"]
            try:
                validate_control("Identifier", producer_id)
            except (ValidationError, ValueError, TypeError, RecursionError):
                raise DomainError(503, "source_unavailable") from None
        # This also rechecks capture scope/capability and independent stop facts.
        authority = registry.resolve_capture(tx, user_id, stream_id)
        if (authority.live_capture_allowed is not True or authority.transmission_allowed is not True
                or row["producer_id"] != producer_id):
            raise DomainError(403, "display_capture_not_authorized")
        if resolve_producer and tx.get("source", source_id) is not None:
            require_retained_source(tx, user_id, {"user_id": user_id, "source_id": source_id,
                                                  "source_version": 1})
        if project_id is not None:
            registry._owned(tx, "project", project_id, user_id)
        old = tx.get("source", source_id)
        proposed = {"contract_version": CONTRACT_VERSION, "type": "shared_display",
                    "user_id": user_id, "source_id": source_id, "source_version": 1,
                    **{k: state[k] for k in ("device_id", "session_id", "stream_id")},
                    "project_id": project_id, "source_timezone": source_timezone,
                    "created_at": old["created_at"] if old else registry.capture.archive._timestamp()}
        _validate(proposed)
        if old:
            if not is_display(old):
                raise DomainError(409, "source_identity_conflict")
            previous = load(tx, user_id, {k: proposed[k] for k in ("user_id", "source_id", "source_version")})
            if previous != proposed or old["producer_id"] != producer_id:
                raise DomainError(409, "source_identity_conflict")
        else:
            if _used_identity(tx, source_id):
                raise DomainError(409, "source_identity_conflict")
            current = {**proposed, "producer_id": producer_id,
                       **{k: state[k] for k in ("authorization_generation", "membership_revision")},
                       "current_version": 1, "generation": 1, "deleted": False, "revoked": False}
            tx.put("source", source_id, current)
            registry.capture.archive._immutable(tx, "snapshot", key(source_id, 1), proposed)
            # Confirm the consumed producer grant/immutable incarnation too.
            load(tx, user_id, {k: proposed[k] for k in ("user_id", "source_id", "source_version")})
    return deepcopy(proposed)


def read(registry, user_id, source_id, version=1, *, check_retained=False):
    reference = {"user_id": user_id, "source_id": source_id, "source_version": version}
    from packages.contracts.process_v2 import validate as validate_process
    try:
        validate_process("SourceRef", reference)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_contract") from None
    with registry.store.transaction(user_id) as tx:
        registry.capture._authorized(tx)
        if check_retained:
            require_retained_source(tx, user_id, reference)
        snapshot = load(tx, user_id, reference)
    return snapshot
