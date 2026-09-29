"""Explicit control-only ASGI factory; no module app, listener or start grants.

The trusted embedding supplies a store, authenticator and immutable deployment
capabilities. It must issue process:control only to approved control clients;
neither a course page nor any HTTP payload can grant producer/start authority.
"""

import json
from pathlib import Path
import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jsonschema import ValidationError
from starlette.exceptions import HTTPException

from packages.contracts.process_control import CAPABILITY, CONTRACT_VERSION, validate
from services.api.auth import Authenticator, Principal
from services.api.control import ControlRegistry
from services.api.domain import utc_now
from services.api.errors import DomainError


MAX_CONTROL_BODY_BYTES = 16 * 1024  # Finite control metadata only, never source/image transport.
ERRORS = {
    401: ("unauthenticated",), 403: ("forbidden", "capability_required"),
    404: ("not_found",),
    409: ("invalid_transition", "stream_conflict", "idempotency_conflict", "stale_revision"),
    422: ("invalid_request", "unsupported_version"), 503: ("unavailable",),
}


def _error(status, code):
    if status not in ERRORS:
        status = 503
    if code not in ERRORS[status]:
        code = ERRORS[status][0]
    return JSONResponse({"contract_version": CONTRACT_VERSION, "error": code,
                         "retryable": code == "unavailable"}, status_code=status,
                        headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)


def _checked(name, value):
    try:
        validate(name, value)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_request") from None


def _unique_object(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("Duplicate JSON property")
        result[name] = value
    return result


def create_control_app(store=None, authenticator: Authenticator | None = None, *,
                       capabilities=None, stop_fact_resolver=None, clock=None):
    """Opt-in transport over the existing registry; no implicit env configuration."""
    clock = clock or utc_now
    app = FastAPI(title="Process Stream Control", version=CONTRACT_VERSION,
                  docs_url=None, redoc_url=None, redirect_slashes=False)
    app.state.store = store
    app.state.authenticator = authenticator
    app.state.paid_executor_enabled = False
    schema = Path(__file__).resolve().parents[2] / "packages/contracts/process_control/generated/openapi.json"
    app.openapi = lambda: json.loads(schema.read_text())

    @app.exception_handler(DomainError)
    async def domain_error(_request, error):
        return _error(error.status, error.code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error_value):
        return _error(422, "invalid_request")

    @app.exception_handler(HTTPException)
    async def routing_error(_request, _error_value):
        return _error(404, "not_found")

    @app.middleware("http")
    async def response_boundary(request, call_next):
        try:
            response = await call_next(request)
        except Exception:
            # Includes authenticator/store/transaction failures. Never reflect
            # exceptions, request contents or credentials into the wire error.
            response = _error(503, "unavailable")
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def authorize(request):
        if (store is None or not callable(getattr(store, "transaction", None))
                or authenticator is None or not callable(getattr(authenticator, "authenticate", None))
                or type(capabilities) is not frozenset or any(type(v) is not str for v in capabilities)
                or (stop_fact_resolver is not None and not callable(stop_fact_resolver))):
            raise DomainError(503, "unavailable")
        headers = request.headers.getlist("authorization")
        if len(headers) != 1 or len(headers[0]) > 8192:
            raise DomainError(401, "unauthenticated")
        match = re.fullmatch(r"(?i:Bearer) +([A-Za-z0-9._~+/-]+=*)", headers[0])
        if match is None:
            raise DomainError(401, "unauthenticated")
        token = match[1]

        def authenticate():
            try:
                principal = authenticator.authenticate(token, clock())
            except DomainError as error:
                if error.status not in {401, 403}:
                    # The legacy capture guard normalizes DomainError to 403.
                    # Auth-provider outages must remain retryable 503 here,
                    # including reauthentication after the actor lock is held.
                    raise RuntimeError("Control authenticator unavailable") from None
                raise
            if not isinstance(principal, Principal):
                raise DomainError(401, "unauthenticated")
            try:
                validate("Identifier", principal.user_id)
                validate("Revision", principal.authorization_generation)
                if (type(principal.scopes) is not frozenset
                        or any(type(v) is not str for v in principal.scopes)
                        or principal.expires_at <= clock()):
                    raise ValueError("Invalid current principal")
            except (ValidationError, ValueError, TypeError, AttributeError):
                raise DomainError(401, "unauthenticated") from None
            if "process:control" not in principal.scopes:
                raise DomainError(403, "forbidden")
            if CAPABILITY not in capabilities:
                raise DomainError(403, "capability_required")
            return principal

        initial = authenticate()

        def guard(state):
            current = authenticate()  # Reauthenticate under the actor transaction lock.
            if current != initial:
                raise DomainError(401, "unauthenticated")
            if (type(state.get("generation")) is not int
                    or state["generation"] != current.authorization_generation):
                raise DomainError(403, "forbidden")

        if request.query_params:
            raise DomainError(422, "invalid_request")
        registry = ControlRegistry(store, scopes=initial.scopes, capabilities=capabilities,
                                   authorization_guard=guard, stop_fact_resolver=stop_fact_resolver)
        return initial.user_id, registry

    async def bytes_body(request):
        lengths = request.headers.getlist("content-length")
        if (len(lengths) > 1 or (lengths and (
                re.fullmatch(r"[0-9]{1,8}", lengths[0]) is None
                or int(lengths[0]) > MAX_CONTROL_BODY_BYTES
                or request.headers.getlist("transfer-encoding")))):
            raise DomainError(422, "invalid_request")
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_CONTROL_BODY_BYTES:
                raise DomainError(422, "invalid_request")
            data.extend(chunk)
        if lengths and int(lengths[0]) != len(data):
            raise DomainError(422, "invalid_request")
        return data

    async def body(request, definition):
        types = request.headers.getlist("content-type")
        if (len(types) != 1 or re.fullmatch(r"application/json(?:\s*;\s*charset=utf-8)?",
                                           types[0], flags=re.IGNORECASE) is None):
            raise DomainError(422, "invalid_request")
        data = await bytes_body(request)
        try:
            value = json.loads(data.decode("utf-8"), object_pairs_hook=_unique_object)
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise DomainError(422, "invalid_request") from None
        if isinstance(value, dict) and "contract_version" in value and value["contract_version"] != CONTRACT_VERSION:
            raise DomainError(422, "unsupported_version")
        _checked(definition, value)
        return value

    def request_key(request):
        values = request.headers.getlist("idempotency-key")
        if len(values) != 1:
            raise DomainError(422, "invalid_request")
        _checked("IdempotencyKey", values[0])
        return values[0]

    @app.post("/v2/process/streams")
    async def register(request: Request):
        user_id, registry = authorize(request)
        payload = await body(request, "StreamRegistration")
        return registry.register(user_id, payload, request_key(request))

    @app.get("/v2/process/streams/{stream_id}")
    async def read(stream_id: str, request: Request):
        user_id, registry = authorize(request)
        _checked("Identifier", stream_id)
        if await bytes_body(request):
            raise DomainError(422, "invalid_request")
        return registry.read(user_id, stream_id)

    @app.post("/v2/process/streams/{stream_id}:control")
    async def command(stream_id: str, request: Request):
        user_id, registry = authorize(request)
        _checked("Identifier", stream_id)
        payload = await body(request, "StreamCommand")
        return registry.command(user_id, stream_id, payload, request_key(request))

    return app
