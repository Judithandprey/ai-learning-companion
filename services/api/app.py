"""P0 HTTP boundary: injected identity, shared wire contracts, disabled executors.

Run via ``uvicorn services.api.app:app`` with LC_DATABASE_URL for PostgreSQL.
The module-level app deliberately has no authentication adapter: protected routes
fail closed until the embedding deployment supplies a reviewed authenticator.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from typing import Annotated

from fastapi import FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jsonschema import ValidationError
from psycopg import Error as PostgresError

from packages.contracts.validation import validate
from services.api.auth import Authenticator, Principal
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.storage import PostgresStore
from services.worker.core.budget import Budget
from services.worker.core.jobs import Jobs


def _utcnow():
    return datetime.now(timezone.utc)


def create_app(store=None, authenticator: Authenticator | None = None, clock=None):
    """Explicit store injection is required for tests; never fall back to RAM."""
    clock = clock or _utcnow
    if store is None:
        dsn = os.environ.get("LC_DATABASE_URL")
        if dsn:
            store = PostgresStore(dsn)
    app = FastAPI(title="Learning Companion P0", version="0.1.0")
    app.state.store = store
    app.state.authenticator = authenticator
    app.state.paid_executor_enabled = False
    contract_path = Path(__file__).resolve().parents[2] / "packages/contracts/generated/openapi.json"
    app.openapi = lambda: json.loads(contract_path.read_text())

    def error_response(status, code, headers=None):
        # Internal diagnostic codes never reflect request data or credentials.
        public_code = {401: "unauthorized", 403: "forbidden", 404: "not_found",
                       409: "conflict", 410: "not_found", 422: "invalid_request"}.get(status, "internal_error")
        if code == "authentication_unconfigured":
            public_code = "needs_auth"
        if code == "budget_exceeded":
            public_code = "budget_exceeded"
        if code in {"source_unavailable", "source_revoked"}:
            public_code = "source_unavailable"
        return JSONResponse({"request_id": str(uuid4()), "code": public_code,
                             "message": code.replace("_", " ")},
                            status_code=404 if status == 410 else status, headers=headers)

    @app.exception_handler(DomainError)
    async def domain_error_handler(_request, error):
        headers = {"WWW-Authenticate": "Bearer"} if error.status == 401 else None
        return error_response(error.status, error.code, headers)

    @app.exception_handler(RequestValidationError)
    async def request_error_handler(_request, _error):
        return error_response(422, "invalid_request")

    @app.exception_handler(PostgresError)
    async def database_error_handler(_request, _error):
        return error_response(503, "database_unavailable")

    def required_key(value):
        if value is None:
            raise DomainError(422, "invalid_idempotency_key")
        identifier(value)
        return value

    def identifier(value):
        try:
            validate("Identifier", value)
        except ValidationError:
            raise DomainError(422, "invalid_request") from None

    def authorize(request: Request, scope: str):
        if authenticator is None:
            raise DomainError(503, "authentication_unconfigured")
        values = request.headers.getlist("authorization")
        if len(values) != 1:
            raise DomainError(401, "missing_bearer_token")
        parts = values[0].split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise DomainError(401, "invalid_bearer_token")
        token = parts[1]
        principal = authenticator.authenticate(token, clock())
        check_principal(principal, scope)
        if store is None:
            raise DomainError(503, "database_unconfigured")

        def guard(state):
            # Run under the repository transaction lock, including for reads.
            current = authenticator.authenticate(token, clock())
            check_principal(current, scope)
            if current != principal:
                raise DomainError(401, "invalid_token")
            if state.get("generation") != principal.authorization_generation:
                raise DomainError(403, "authorization_revoked")

        return principal, guard

    def check_principal(principal: Principal, scope: str):
        if principal.expires_at <= clock():
            raise DomainError(401, "expired_token")
        if scope not in principal.scopes:
            raise DomainError(403, "insufficient_scope")

    async def body(request, contract):
        try:
            value = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError, TypeError):
            raise DomainError(422, "invalid_request") from None
        try:
            validate(contract, value)
        except (ValidationError, TypeError):
            raise DomainError(422, "invalid_request") from None
        return value

    def archive(guard):
        return Archive(store, clock=clock, authorization_guard=guard)

    @app.post("/v1/sources")
    async def register_source(request: Request, idempotency_key: Annotated[str | None, Header()] = None):
        principal, guard = authorize(request, "sources:write")
        payload = await body(request, "SourceRegistrationRequest")
        result, created = archive(guard).register(
            principal.user_id, payload["original_url"], payload["project_id"], required_key(idempotency_key),
            source_type=payload.get("type", "web"), connection_id=payload.get("connection_id"), return_receipt=True,
        )
        return JSONResponse(result, status_code=201 if created else 200)

    @app.get("/v1/sources/{source_id}")
    async def get_source(source_id: str, request: Request):
        principal, guard = authorize(request, "sources:read")
        identifier(source_id)
        return archive(guard).read_source(principal.user_id, source_id)

    @app.get("/v1/sources/{source_id}/versions/{source_version}")
    async def get_snapshot(source_id: str, source_version: int, request: Request):
        principal, guard = authorize(request, "sources:read")
        identifier(source_id)
        if not 1 <= source_version <= 9007199254740991:
            raise DomainError(422, "invalid_request")
        return archive(guard).get_snapshot(principal.user_id, source_id, source_version)

    @app.post("/v1/events:batch")
    async def events(request: Request, idempotency_key: Annotated[str | None, Header()] = None):
        principal, guard = authorize(request, "events:write")
        payload = await body(request, "EventBatch")
        return archive(guard).events(principal.user_id, payload, idempotency_key=required_key(idempotency_key))

    @app.put("/v1/notes/{note_id}")
    async def put_note(note_id: str, request: Request, idempotency_key: Annotated[str | None, Header()] = None):
        principal, guard = authorize(request, "notes:write")
        identifier(note_id)
        payload = await body(request, "NoteRevision")
        result = archive(guard).put_note(principal.user_id, note_id, payload, actor=principal.actor,
                                       idempotency_key=required_key(idempotency_key), return_receipt=True)
        status = 201 if payload["base_revision"] == 0 and not result["replayed"] else 200
        return JSONResponse(result, status_code=status)

    @app.get("/v1/notes/{note_id}")
    async def get_note(note_id: str, request: Request, revision: Annotated[int | None, Query(ge=1, le=9007199254740991)] = None):
        principal, guard = authorize(request, "notes:read")
        identifier(note_id)
        return archive(guard).get_note(principal.user_id, note_id, revision=revision)

    @app.get("/v1/usage")
    async def usage(request: Request):
        principal, guard = authorize(request, "usage:read")
        return Budget(store, clock=clock, authorization_guard=guard).usage(principal.user_id)

    @app.post("/v1/jobs/{job_id}/cancel")
    async def cancel_job(job_id: str, request: Request):
        principal, guard = authorize(request, "jobs:cancel")
        identifier(job_id)
        if await request.body():
            raise DomainError(422, "invalid_request")
        job = Jobs(store, authorization_guard=guard).cancel(principal.user_id, job_id)
        return {"job_id": job["id"], "state": job["state"], "cancel_requested": job["cancel_requested"]}

    return app


app = create_app()
