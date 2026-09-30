"""Trusted LOCAL desktop embedding; no listener, environment setup or OAuth.

The host supplies stable identities, an ephemeral bearer token and its original
0.2.1 registration (including generation/membership pins). Only after obtaining
fresh, scoped system/user consent may it pass fresh_consent=True. Persisting that
boolean as an auto-start preference is not consent. Reopen with False and the
same registration to reconcile an unknown outcome without minting a new grant.

The host still POSTs the registration with its retained Idempotency-Key, then
reads current state before producing. A stopped incarnation never becomes live
again: a new ID, explicit consent and the released predecessor relationship are
required. This callable proves neither OS permission nor actual producer start.
Use an explicitly supplied PostgresStore for durability; MemoryStore is test-only.
The host owns loopback-only serving and secure token delivery; never pass this
factory or token to course content, log it, or persist it with source documents.
"""

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime
import re

from services.api.auth import LocalTestAuthenticator, Principal
from services.api.capture_app import create_capture_app
from services.api.capture import PIXEL_PRODUCER_PROFILE
from services.api.control import ControlRegistry, _copy_request, _validate
from services.api.domain import fingerprint, key, utc_now
from services.api.errors import DomainError


LOCAL_SCOPES = frozenset({"process:control", "process:capture", "sources:read", "sources:write"})
LOCAL_CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2",
                                "process.ingress.v0.2.4", "process.raw-ingress.v0.2.6",
                                "process.desktop-ingress.v0.2.8"})


@dataclass(frozen=True)
class CaptureRuntime:
    app: object = field(repr=False)
    principal: Principal
    registration: dict
    producer_id: str
    start_status: str
    current_state: dict | None


def _foundations(tx, user_id, device_id, session_id, *, fresh_consent):
    """Initialize new identities only; never repair a retained lifecycle."""
    authorization = tx.get("authorization", "state")
    if authorization is None:
        # Checking ALL actor documents prevents a surviving archive or tombstone
        # from looking like a new user merely because its authorization is lost.
        if not fresh_consent or not tx.is_empty():
            raise DomainError(403, "forbidden")
        tx.put("authorization", "state", {"enabled": True, "generation": 1})
    elif (authorization.get("enabled") is not True or authorization.get("deleted")
          or authorization.get("revoked")):
        raise DomainError(403, "forbidden")

    # Existing control/membership/binding rows retain identity use even after a
    # source is deleted. Absence with such a witness is damage, not enrollment.
    witnesses = []
    for kind in ("control_membership", "control_start", "control_stream", "capture_binding"):
        witnesses.extend(row.get("state", row) for row in tx.scan(kind))
    for kind, identifier, member_field in (("device", device_id, "device_id"),
                                           ("session", session_id, "session_id")):
        row = tx.get(kind, identifier)
        if row is None:
            if not fresh_consent or any(w.get(member_field) == identifier for w in witnesses):
                raise DomainError(403, "forbidden")
            row = {"user_id": user_id, "id": identifier}
            if kind == "session":
                row["live_capture"] = False
            tx.put(kind, identifier, row)
        elif (row.get("user_id") != user_id or row.get("id") != identifier
              or row.get("deleted") or row.get("revoked")):
            raise DomainError(403, "forbidden")

    membership_key = key(device_id, session_id)
    membership = tx.get("control_membership", membership_key)
    if membership is None:
        if not fresh_consent or any(w.get("device_id") == device_id and
                                    w.get("session_id") == session_id for w in witnesses):
            raise DomainError(403, "forbidden")
        tx.put("control_membership", membership_key, {
            "user_id": user_id, "device_id": device_id, "session_id": session_id,
            "active": True, "revision": 1,
        })
    elif (membership.get("active") is not True or membership.get("deleted")
          or membership.get("revoked")):
        raise DomainError(403, "forbidden")


def create_local_capture_runtime(*, store, user_id, device_id, session_id, producer_id,
                                 registration, token, expires_at, scopes, capabilities,
                                 fresh_consent=False, enable_raw_ingress=False,
                                 enable_desktop_ingress=False, producer_profile=None,
                                 clock=utc_now, stop_fact_resolver=None):
    """Return an app and reconciled binding, without starting/registering capture.

    Exact setup retries reuse control_start, including after a commit whose
    response was lost. Invalidated grants refuse; consumed grants return the
    current state (including stopped/withdrawn). No token/expiry is persisted.
    Caller-supplied pins are never replaced by the current database revision.
    """
    for identifier in (user_id, device_id, session_id, producer_id):
        _validate("Identifier", identifier)
    body = _copy_request("StreamRegistration", registration)
    if body["device_id"] != device_id or body["session_id"] != session_id:
        raise ValueError("Registration must match the explicit local binding")
    if (not callable(getattr(store, "transaction", None)) or not callable(clock)
            or (stop_fact_resolver is not None and not callable(stop_fact_resolver))
            or type(fresh_consent) is not bool or type(enable_raw_ingress) is not bool
            or type(enable_desktop_ingress) is not bool):
        raise ValueError("Explicit store, clock and boolean gates are required")
    if (type(token) is not str or not 32 <= len(token) <= 4096
            or re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token) is None):
        raise ValueError("An explicit ephemeral bearer token of 32..4096 characters is required")
    if (not isinstance(expires_at, datetime) or expires_at.tzinfo is None
            or expires_at.utcoffset() is None or expires_at <= clock()):
        raise ValueError("An explicit finite future token expiry is required")
    for values, allowed, required in (
        (scopes, LOCAL_SCOPES, "process:control"),
        (capabilities, LOCAL_CAPABILITIES, "process.control.v0.2.1"),
    ):
        if (type(values) is not frozenset or any(type(v) is not str for v in values)
                or not values <= allowed or required not in values):
            raise ValueError("Only explicit released local control/ingress authority is allowed")
    if enable_raw_ingress and ("process.raw-ingress.v0.2.6" not in capabilities
                              or "process.capture.v0.2" not in capabilities
                              or "process:capture" not in scopes):
        raise ValueError("Raw ingress requires its explicit released capture authority")
    if enable_desktop_ingress and ("process.desktop-ingress.v0.2.8" not in capabilities
                                  or "process.capture.v0.2" not in capabilities
                                  or "process:capture" not in scopes):
        raise ValueError("Desktop ingress requires its explicit released capture authority")
    if (producer_profile not in (None, PIXEL_PRODUCER_PROFILE)
            or (enable_desktop_ingress and producer_profile != PIXEL_PRODUCER_PROFILE)):
        raise ValueError("Desktop ingress requires explicit trusted desktop_pixels producer admission")

    principal = Principal(user_id, scopes, expires_at,
                          authorization_generation=body["authorization_generation"])
    authenticator = LocalTestAuthenticator({token: principal})

    def guard(state):
        current = authenticator.authenticate(token, clock())
        if (current != principal or type(state.get("generation")) is not int
                or state["generation"] != principal.authorization_generation):
            raise DomainError(403, "forbidden")

    registry = ControlRegistry(store, scopes=scopes, capabilities=capabilities,
                               authorization_guard=guard, stop_fact_resolver=stop_fact_resolver)
    # Prepare the purely in-process transport before any durable mutation.
    app = create_capture_app(store, authenticator, capabilities=capabilities, clock=clock,
                             stop_fact_resolver=stop_fact_resolver,
                             enable_raw_ingress=enable_raw_ingress,
                             enable_desktop_ingress=enable_desktop_ingress)
    with store.transaction(user_id) as tx:
        _foundations(tx, user_id, device_id, session_id, fresh_consent=fresh_consent)
        authority = registry._authority(tx, user_id, device_id, session_id)
        registry._generation(body, authority)
        grant = tx.get("control_start", body["stream_id"])
        current_state = None
        if grant is None:
            if not fresh_consent:
                raise DomainError(403, "forbidden")
            registry._authorize_start(tx, user_id, body, producer_id)
            status = "pending"
        else:
            expected = {"user_id": user_id, "device_id": device_id, "session_id": session_id,
                        "stream_id": body["stream_id"], "producer_id": producer_id,
                        "authorization_generation": body["authorization_generation"],
                        "membership_revision": body["membership_revision"],
                        "fingerprint": fingerprint(body)}
            if any(grant.get(k) != v for k, v in expected.items()):
                raise DomainError(409, "stream_conflict")
            status = grant.get("status")
            if grant.get("deleted") or status not in {"pending", "consumed"}:
                raise DomainError(403, "forbidden")
            if status == "pending":
                registry._unused(tx, body["stream_id"])
                registry._predecessor(tx, user_id, body, producer_id)
            else:
                row, _ = registry._current(tx, user_id, body["stream_id"])
                if (row.get("producer_id") != producer_id or any(
                    row["state"].get(k) != expected[k] for k in (
                        "user_id", "device_id", "session_id", "stream_id",
                        "authorization_generation", "membership_revision",
                    )
                )):
                    raise DomainError(403, "forbidden")
                current_state = deepcopy(row["state"])
        if producer_profile == PIXEL_PRODUCER_PROFILE:
            registry._bind_pixel_producer(tx, user_id, body, producer_id)
    return CaptureRuntime(app, principal, body, producer_id, status, current_state)
