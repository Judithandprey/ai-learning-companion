"""Finite trusted-local HTTP surface; no implicit auth, fixture or provider."""

from datetime import datetime, timezone
import ipaddress
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jsonschema import ValidationError
from psycopg import Error as PostgresError

from packages.contracts.document_preview import CONTRACT_VERSION, validate
from services.api.errors import DomainError
from services.api.preview import DocumentPreview


MAX_BODY_BYTES = 4 * 1024 * 1024


def _loopback_name(value):
    if value == "localhost":
        return True
    try:
        return ipaddress.ip_address(value).is_loopback
    except ValueError:
        return False


def _origin(value):
    """Only exact HTTP loopback origins; never accept credentials or URL suffixes."""
    try:
        parts = urlsplit(value)
        if (parts.scheme != "http" or not _loopback_name(parts.hostname or "")
                or parts.username is not None or parts.password is not None
                or parts.path or parts.query or parts.fragment or parts.port is None
                or not 1 <= parts.port <= 65535 or value != f"http://{parts.netloc}"):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("Expected an exact trusted HTTP loopback origin with port") from None
    return value


def create_preview_app(store=None, authenticator=None, clock=None, *, user_id=None,
                       device_id=None, session_id=None, allowed_origins=frozenset()):
    """Trusted embedding supplies identity; document content supplies no credentials."""
    clock = clock or (lambda: datetime.now(timezone.utc))
    if type(allowed_origins) is not frozenset:
        raise ValueError("Explicit immutable origins required")
    for origin in allowed_origins:
        _origin(origin)
    app = FastAPI(title="Local Document Preview", version=CONTRACT_VERSION)
    app.state.store = store
    app.state.authenticator = authenticator
    app.state.paid_executor_enabled = False
    schema = Path(__file__).resolve().parents[2] / "packages/contracts/document_preview/generated/openapi.json"
    app.openapi = lambda: json.loads(schema.read_text())

    def error(status):
        status = 404 if status == 410 else status
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict",
                422: "invalid_request"}.get(status, "unavailable")
        headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        return JSONResponse({"contract_version": CONTRACT_VERSION, "code": code},
                            status_code=status, headers=headers)

    @app.exception_handler(DomainError)
    async def domain_error(_request, exc):
        return error(exc.status)

    @app.exception_handler(RequestValidationError)
    async def request_error(_request, _exc):
        return error(422)

    @app.exception_handler(PostgresError)
    async def database_error(_request, _exc):
        return error(503)

    if allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=sorted(allowed_origins),
                           allow_methods=["GET", "POST"],
                           allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])

    @app.middleware("http")
    async def local_boundary(request, call_next):
        # Do not use X-Forwarded-* for local authorization. The launcher disables
        # proxy_headers, and embedders must preserve the actual socket peer.
        if request.client is None or not _loopback_name(request.client.host):
            return error(403)
        hosts = request.headers.getlist("host")
        try:
            host = urlsplit("http://" + hosts[0]) if len(hosts) == 1 else None
            if (host is None or not _loopback_name(host.hostname or "") or host.username is not None
                    or host.password is not None or host.path or host.query or host.fragment):
                return error(403)
            _ = host.port
        except ValueError:
            return error(403)
        origins = request.headers.getlist("origin")
        if len(origins) > 1 or (origins and origins[0] not in {*allowed_origins, "http://" + hosts[0]}):
            return error(403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def authorize(request, scope):
        if authenticator is None or store is None or not all((user_id, device_id, session_id)):
            raise DomainError(503, "unavailable")
        values = request.headers.getlist("authorization")
        if len(values) != 1:
            raise DomainError(401, "unauthorized")
        parts = values[0].split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise DomainError(401, "unauthorized")
        token = parts[1]

        def principal():
            caller = authenticator.authenticate(token, clock())
            if caller.expires_at <= clock():
                raise DomainError(401, "unauthorized")
            if caller.user_id != user_id or caller.actor != "user" or scope not in caller.scopes:
                raise DomainError(403, "forbidden")
            return caller

        initial = principal()

        def guard(state):
            current = principal()
            if current != initial:
                raise DomainError(401, "unauthorized")
            if state.get("generation") != current.authorization_generation:
                raise DomainError(403, "forbidden")

        return DocumentPreview(store, guard, clock, device_id=device_id, session_id=session_id)

    async def body(request, definition):
        if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            raise DomainError(422, "invalid_request")
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_BODY_BYTES:
                raise DomainError(422, "invalid_request")
        try:
            from packages.contracts.document_preview.validation import _unique_object
            value = json.loads(bytes(data), object_pairs_hook=_unique_object)
            validate(definition, value)
        except (ValueError, TypeError, UnicodeError, RecursionError, ValidationError):
            raise DomainError(422, "invalid_request") from None
        return value

    def request_key(request):
        values = request.headers.getlist("idempotency-key")
        try:
            if len(values) != 1:
                raise ValueError()
            validate("Identifier", values[0])
        except (ValueError, ValidationError):
            raise DomainError(422, "invalid_request") from None
        return values[0]

    @app.get("/preview/v1/session")
    async def session(request: Request):
        return authorize(request, "document-preview:read").session(user_id)

    @app.post("/preview/v1/documents")
    async def import_document(request: Request):
        preview = authorize(request, "document-preview:write")
        payload = await body(request, "DocumentImport")
        return preview.import_document(user_id, payload, request_key(request))

    @app.post("/preview/v1/saves")
    async def save(request: Request):
        preview = authorize(request, "document-preview:write")
        payload = await body(request, "DocumentSave")
        return preview.save(user_id, payload, request_key(request))

    @app.get("/preview/v1/saves")
    async def library(request: Request):
        preview = authorize(request, "document-preview:read")
        parameters = request.query_params.multi_items()
        if (any(name not in {"limit", "cursor"} for name, _ in parameters)
                or len({name for name, _ in parameters}) != len(parameters)):
            raise DomainError(422, "invalid_query")
        limit = request.query_params.get("limit", "20")
        if re.fullmatch(r"(?:[1-9]|[1-4][0-9]|50)", limit) is None:
            raise DomainError(422, "invalid_limit")
        return preview.library(user_id, limit=int(limit), cursor=request.query_params.get("cursor"))

    @app.get("/preview/v1/saves/{note_id}")
    async def read(note_id: str, request: Request):
        preview = authorize(request, "document-preview:read")
        try:
            validate("Identifier", note_id)
        except ValidationError:
            raise DomainError(422, "invalid_request") from None
        return preview.read(user_id, note_id)

    return app
