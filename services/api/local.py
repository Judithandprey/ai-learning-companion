"""Explicit local-test server factory; this is not OAuth or a provider connection.

Use only a loopback listener after manually applying the documented migration:
``uvicorn services.api.local:create_local_app --factory --host 127.0.0.1 --port 8173``.
No server, migration, synthetic import, or account connection starts on import.
"""

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path

from psycopg import Error as PostgresError

from services.api.app import create_app
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.storage import PostgresStore


LOCAL_USER = "fixture-user"
LOCAL_SCOPES = frozenset({
    "sources:read", "sources:write", "events:write", "notes:read", "notes:write",
    "usage:read", "jobs:cancel",
})


def _utcnow():
    return datetime.now(timezone.utc)


def create_local_app():
    """Build an explicit PostgreSQL-backed synthetic identity for local testing.

    LC_ENABLE_LOCAL_TEST_AUTH=1, LC_DATABASE_URL, and a caller-created
    LC_LOCAL_TEST_TOKEN (at least 32 printable ASCII characters, no whitespace)
    are mandatory. The credential expires one hour after this factory invocation.
    Restart preserves the stored authorization generation and never re-enables a
    revoked identity. LC_IMPORT_SYNTHETIC_FIXTURE=1 separately opts into importing
    the project-authored fixed fixture; it does not fetch or connect a course.
    """
    if os.environ.get("LC_ENABLE_LOCAL_TEST_AUTH") != "1":
        raise RuntimeError("Local test authentication requires explicit opt-in")
    dsn = os.environ.get("LC_DATABASE_URL", "")
    if not dsn.strip():
        raise RuntimeError("LC_DATABASE_URL is required for local test mode")
    token = os.environ.get("LC_LOCAL_TEST_TOKEN", "")
    if len(token) < 32 or any(not 33 <= ord(character) <= 126 for character in token):
        raise RuntimeError("LC_LOCAL_TEST_TOKEN must contain at least 32 printable ASCII characters without whitespace")
    store = PostgresStore(dsn)
    try:
        with store.transaction(LOCAL_USER) as tx:
            state = tx.get("authorization", "state")
            if state is None:
                state = {"enabled": True, "generation": 1}
                tx.put("authorization", "state", state)
            if (state.get("enabled") is not True or type(state.get("generation")) is not int
                    or state["generation"] < 1):
                raise RuntimeError("Local test identity is revoked or unavailable; startup cannot re-enable it")
        if os.environ.get("LC_IMPORT_SYNTHETIC_FIXTURE") == "1":
            directory = Path(__file__).resolve().parents[2] / "packages/contracts/examples"
            examples = json.loads((directory / "core.json").read_text())
            Archive(store).import_fixture(
                LOCAL_USER, examples["SourceSnapshot"], examples["Frame"], (directory / "frame.svg").read_bytes(),
            )
    except PostgresError:
        raise RuntimeError("Local PostgreSQL is unavailable; verify its configuration and documented migration") from None
    except DomainError:
        raise RuntimeError("Local synthetic fixture import was rejected; existing data and revocations were preserved") from None
    principal = Principal(
        LOCAL_USER, LOCAL_SCOPES, _utcnow() + timedelta(hours=1),
        actor="user", authorization_generation=state["generation"],
    )
    return create_app(store, LocalTestAuthenticator({token: principal}))
