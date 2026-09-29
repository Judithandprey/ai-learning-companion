"""Explicit foreground launcher for the local real-document preview.

Run ``python -m services.api.preview_local [--port 8174]`` after applying the
documented database migrations. The listener is always 127.0.0.1. Set
LC_ENABLE_DOCUMENT_PREVIEW=1, LC_DATABASE_URL, LC_PREVIEW_TOKEN and explicit,
stable LC_PREVIEW_USER_ID, LC_PREVIEW_DEVICE_ID, LC_PREVIEW_SESSION_ID values.
There are no identity defaults: keep the same IDs to reopen saved documents.
Generate a fresh token with ``secrets.token_urlsafe(32)`` in a trusted local
environment; never put it in document content or a course content script.
If a trusted local UI runs on another port, set LC_PREVIEW_UI_ORIGIN to its exact
HTTP loopback origin with an explicit port, such as http://127.0.0.1:5173. Leave
it unset or empty to allow no additional browser origin. Paths, credentials,
queries, fragments, wildcards and non-loopback origins are not accepted.

This is local development authentication, not OAuth. Tokens expire after one
hour; startup preserves the persisted authorization generation and never
re-enables a revoked identity/membership. No fixture, migration, browser, external
account connection, or background service is started by this module.
"""

import argparse
from datetime import datetime, timedelta, timezone
import os

from jsonschema import ValidationError
from psycopg import Error as PostgresError
import uvicorn

from packages.contracts.validation import validate
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.domain import key
from services.api.preview_app import _origin, create_preview_app
from services.api.storage import PostgresStore


PREVIEW_SCOPES = frozenset({"document-preview:read", "document-preview:write"})


def _utcnow():
    return datetime.now(timezone.utc)


def _identifier_config(name):
    value = os.environ.get(name, "")
    try:
        validate("Identifier", value)
    except ValidationError:
        raise RuntimeError(f"{name} must be a valid explicit identifier") from None
    return value


def _bootstrap(store, user_id, device_id, session_id):
    """Create only missing local ownership records under the canonical actor lock."""
    with store.transaction(user_id) as tx:
        state = tx.get("authorization", "state")
        if state is None:
            state = {"enabled": True, "generation": 1}
            tx.put("authorization", "state", state)
        if (state.get("enabled") is not True or type(state.get("generation")) is not int
                or not 1 <= state["generation"] <= 9007199254740991):
            raise RuntimeError("Preview identity is revoked or unavailable; startup cannot re-enable it")

        for kind, identifier in (("device", device_id), ("session", session_id)):
            row = tx.get(kind, identifier)
            if row is None:
                row = {"user_id": user_id, "id": identifier}
                if kind == "session":
                    row["live_capture"] = False
                tx.put(kind, identifier, row)
            elif (row.get("user_id") != user_id or row.get("id") != identifier
                    or row.get("deleted") or row.get("revoked")):
                raise RuntimeError("Preview device or session is unavailable; startup cannot restore it")

        membership_key = key(device_id, session_id)
        membership = tx.get("control_membership", membership_key)
        if membership is None:
            membership = {"user_id": user_id, "device_id": device_id,
                          "session_id": session_id, "active": True, "revision": 1}
            tx.put("control_membership", membership_key, membership)
        elif (any(membership.get(field) != value for field, value in (
                ("user_id", user_id), ("device_id", device_id), ("session_id", session_id)))
                or membership.get("active") is not True
                or type(membership.get("revision")) is not int
                or not 1 <= membership["revision"] <= 9007199254740991
                or membership.get("deleted")):
            raise RuntimeError("Preview membership is revoked or unavailable; startup cannot re-enable it")
        return state["generation"]


def create_local_preview_app():
    """Build the explicitly enabled preview on PostgreSQL; never fall back to RAM."""
    if os.environ.get("LC_ENABLE_DOCUMENT_PREVIEW") != "1":
        raise RuntimeError("Document preview requires explicit opt-in")
    dsn = os.environ.get("LC_DATABASE_URL", "")
    if not dsn.strip():
        raise RuntimeError("LC_DATABASE_URL is required for document preview")
    token = os.environ.get("LC_PREVIEW_TOKEN", "")
    if len(token) < 32 or any(not 33 <= ord(character) <= 126 for character in token):
        raise RuntimeError("LC_PREVIEW_TOKEN must contain at least 32 printable ASCII characters without whitespace")
    user_id = _identifier_config("LC_PREVIEW_USER_ID")
    device_id = _identifier_config("LC_PREVIEW_DEVICE_ID")
    session_id = _identifier_config("LC_PREVIEW_SESSION_ID")
    ui_origin = os.environ.get("LC_PREVIEW_UI_ORIGIN", "")
    try:
        allowed_origins = frozenset({_origin(ui_origin)}) if ui_origin else frozenset()
    except ValueError:
        raise RuntimeError("LC_PREVIEW_UI_ORIGIN must be an exact trusted HTTP loopback origin with port") from None

    try:
        store = PostgresStore(dsn)
        generation = _bootstrap(store, user_id, device_id, session_id)
    except PostgresError:
        raise RuntimeError("Local PostgreSQL is unavailable; verify its configuration and documented migrations") from None

    principal = Principal(user_id, PREVIEW_SCOPES, _utcnow() + timedelta(hours=1),
                          actor="user", authorization_generation=generation)
    return create_preview_app(store, LocalTestAuthenticator({token: principal}),
                              user_id=user_id, device_id=device_id, session_id=session_id,
                              allowed_origins=allowed_origins)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the local document preview on 127.0.0.1")
    parser.add_argument("--port", type=int, default=8174)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    try:
        app = create_local_preview_app()
    except RuntimeError as error:
        parser.error(str(error))
    # Ignore forwarded client headers: the preview boundary checks the real peer.
    # Disable URL access logging so local document/request content stays private.
    uvicorn.run(app, host="127.0.0.1", port=args.port, proxy_headers=False, access_log=False)


if __name__ == "__main__":
    main()
