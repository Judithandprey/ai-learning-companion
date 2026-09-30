"""Explicit capture-ingress ASGI factory; no default routes, grants or producers.

Only the trusted embedding supplies authentication, deployment capabilities and
independent stop facts. Originals and receipts use existing actor transactions.
"""

from concurrent.futures import CancelledError as FutureCancelledError
import json
from pathlib import Path
import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from jsonschema import ValidationError
from starlette.exceptions import HTTPException

from packages.contracts import capture_ingress as wire
from packages.contracts import raw_capture_ingress as raw_wire
from packages.contracts.process_control import validate as validate_control
from services.api.auth import Authenticator, Principal
from services.api.control import ControlRegistry
from services.api.control_app import _unique_object
from services.api.domain import utc_now
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts


RAW_ROUTE = "/v2/process/raw-frames:batch"


def _error(status, code, *, contract=wire):
    # Internal details, corrupt originals and unknown service errors never leak.
    aliases = {
        "invalid_contract": "invalid_request", "source_not_found": "not_found",
        "reference_not_found": "not_found", "original_not_found": "not_found",
        "frame_not_found": "not_found", "original_identity_conflict": "record_conflict",
        "original_source_conflict": "record_conflict", "immutable_conflict": "record_conflict",
        "display_authority_required": "forbidden", "display_capture_not_authorized": "forbidden",
        "authorization_revoked": "forbidden", "source_revoked": "forbidden",
        "original_unavailable": "unavailable", "source_unavailable": "unavailable",
    }
    if contract is raw_wire and code == "frame_identity_conflict":
        code = "record_conflict"
    code = aliases.get(code, code)
    if status == 401:
        code = "unauthenticated"
    if code not in contract.ERROR_CODES.get(str(status), ()):
        status, code = 503, "unavailable"
    return JSONResponse({"contract_version": contract.CONTRACT_VERSION, "error": code,
                         "retryable": code in {"unavailable", "dependency_missing"}},
                        status_code=status,
                        headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)


def _checked(check, *args, **kwargs):
    try:
        return check(*args, **kwargs)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_request") from None


def _nonfinite(_value):
    raise ValueError("Non-finite JSON")


def _decode(definition, data, *, contract=wire):
    try:
        return contract.decode_request(definition, data)
    except ValidationError:
        # The pure decoder intentionally reports one validation exception.
        # Classify only failures again to implement the released HTTP precedence
        # without coupling errors to its diagnostic text or copying the schemas.
        try:
            payload = json.loads(data.decode("utf-8"), object_pairs_hook=_unique_object,
                                 parse_constant=_nonfinite)
            json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        except (ValueError, UnicodeError, RecursionError):
            raise DomainError(400, "invalid_json") from None
        versions = [(payload, "0.2.2" if definition == "OriginalArtifactUpload" else contract.CONTRACT_VERSION)]
        if definition in {"FrameBatchRequest", "RawFrameBatchRequest"} and isinstance(payload, dict):
            versions.append((payload.get("batch"), "0.2.0"))
            if definition == "RawFrameBatchRequest" and isinstance(payload.get("frames"), list):
                versions.extend((frame, "0.2.5") for frame in payload["frames"])
        for value, expected in versions:
            if isinstance(value, dict) and "contract_version" in value and value["contract_version"] != expected:
                raise DomainError(422, "unsupported_version") from None
        raise DomainError(422, "invalid_request") from None


def create_ingress_app(store=None, authenticator: Authenticator | None = None, *,
                       capabilities=None, stop_fact_resolver=None, clock=None, enable_raw_ingress=False):
    """Construct legacy ingress, optionally adding the explicitly enabled raw route."""
    if type(enable_raw_ingress) is not bool:
        raise ValueError("enable_raw_ingress must be a boolean")
    clock = clock or utc_now
    app = FastAPI(title="Process Capture Ingress", version=wire.CONTRACT_VERSION,
                  docs_url=None, redoc_url=None, redirect_slashes=False)
    app.state.store = store
    app.state.authenticator = authenticator
    app.state.paid_executor_enabled = False
    contracts = Path(__file__).resolve().parents[2] / "packages/contracts"

    def openapi():
        schema = json.loads((contracts / "capture_ingress/generated/openapi.json").read_text())
        if enable_raw_ingress:
            raw_schema = json.loads((contracts / "raw_capture_ingress/generated/openapi.json").read_text())
            schema["paths"].update(raw_schema["paths"])
            for name, definition in raw_schema["components"]["schemas"].items():
                schema["components"]["schemas"].setdefault(name, definition)
        return schema

    app.openapi = openapi

    def response_contract(request):
        return raw_wire if enable_raw_ingress and request.url.path == RAW_ROUTE else wire

    @app.exception_handler(DomainError)
    async def domain_error(_request, error):
        return _error(error.status, error.code, contract=response_contract(_request))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error_value):
        return _error(422, "invalid_request", contract=response_contract(_request))

    @app.exception_handler(HTTPException)
    async def routing_error(_request, _error_value):
        return _error(404, "not_found", contract=response_contract(_request))

    @app.middleware("http")
    async def response_boundary(request, call_next):
        try:
            response = await call_next(request)
        except FutureCancelledError:
            if response_contract(request) is raw_wire:
                raise
            response = _error(503, "unavailable")
        except Exception:
            response = _error(503, "unavailable", contract=response_contract(request))
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def authorize(request, scopes, extra_capabilities=(), *, contract=wire):
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
                    # CaptureArchive normalizes DomainError from guards to 403;
                    # preserve provider failures as 503 both before/under lock.
                    raise RuntimeError("Ingress authenticator unavailable") from None
                raise DomainError(error.status, "unauthenticated" if error.status == 401 else "forbidden") from None
            if not isinstance(principal, Principal):
                raise DomainError(401, "unauthenticated")
            try:
                wire.validate("Identifier", principal.user_id)
                validate_control("Revision", principal.authorization_generation)
                if (type(principal.scopes) is not frozenset
                        or any(type(v) is not str for v in principal.scopes)
                        or principal.expires_at <= clock()):
                    raise ValueError("Invalid current principal")
            except (ValidationError, ValueError, TypeError, AttributeError):
                raise DomainError(401, "unauthenticated") from None
            if not set(scopes).issubset(principal.scopes):
                raise DomainError(403, "forbidden")
            if not {contract.CAPABILITY, *extra_capabilities}.issubset(capabilities):
                raise DomainError(403, "capability_required")
            return principal

        initial = authenticate()

        def guard(state):
            current = authenticate()
            if current != initial:
                raise DomainError(401, "unauthenticated")
            if (state.get("enabled") is not True or type(state.get("generation")) is not int
                    or state["generation"] != current.authorization_generation):
                raise DomainError(403, "forbidden")

        if request.query_params:
            raise DomainError(422, "invalid_request")
        registry = ControlRegistry(store, scopes=initial.scopes, capabilities=capabilities,
                                   authorization_guard=guard, stop_fact_resolver=stop_fact_resolver)
        registry.capture.archive.clock = clock
        originals = OriginalArtifacts(store, guard, display_authority_resolver=registry.resolve_capture)
        return initial.user_id, registry, originals

    async def bytes_body(request, limit):
        encodings = request.headers.getlist("content-encoding")
        if len(encodings) > 1 or (encodings and encodings[0].lower() != "identity"):
            raise DomainError(415, "unsupported_media_type")
        lengths = request.headers.getlist("content-length")
        if (len(lengths) > 1 or (lengths and (
                re.fullmatch(r"[0-9]+", lengths[0]) is None
                or request.headers.getlist("transfer-encoding")))):
            raise DomainError(422, "invalid_request")
        # Compare canonical decimal text before int conversion, including giant
        # digit strings. Never allocate/read an oversized declared body.
        declared = (lengths[0].lstrip("0") or "0") if lengths else None
        if declared is not None and (len(declared) > len(str(limit))
                or (len(declared) == len(str(limit)) and declared > str(limit))):
            raise DomainError(413, "payload_too_large")
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > limit:
                raise DomainError(413, "payload_too_large")
            data.extend(chunk)
        if declared is not None and int(declared) != len(data):
            raise DomainError(422, "invalid_request")
        return bytes(data)

    async def body(request, definition, *, contract=wire):
        types = request.headers.getlist("content-type")
        if len(types) > 1:
            raise DomainError(422, "invalid_request")
        if (not types or re.fullmatch(r"application/json(?:\s*;\s*charset=utf-8)?",
                                     types[0], flags=re.IGNORECASE) is None):
            raise DomainError(415, "unsupported_media_type")
        return _decode(definition, await bytes_body(request, contract.body_limit(definition)), contract=contract)

    async def empty_body(request):
        if await bytes_body(request, wire.MAX_METADATA_BODY_BYTES):
            raise DomainError(422, "invalid_request")

    @app.put("/v2/process/display-sources/{source_id}")
    async def register_source(source_id: str, request: Request):
        user, registry, _ = authorize(request, {"sources:write", "process:control", "process:capture"},
                                      {"process.control.v0.2.1", "process.capture.v0.2"})
        payload = await body(request, "DisplaySourceRegistration")
        _checked(wire.validate_registration, payload, source_id=source_id)
        return registry.register_display_source(user, source_id, payload["stream_id"],
                                                project_id=payload["project_id"],
                                                source_timezone=payload["source_timezone"])

    @app.get("/v2/process/display-sources/{source_id}")
    async def read_source(source_id: str, request: Request):
        user, registry, _ = authorize(request, {"sources:read"})
        _checked(wire.validate, "Identifier", source_id)
        await empty_body(request)
        return registry.read_display_source(user, source_id, check_retained=True)

    @app.put("/v2/process/originals/{artifact_id}")
    async def put_original(artifact_id: str, request: Request):
        user, _, originals = authorize(request, {"sources:write"})
        payload = await body(request, "OriginalArtifactUpload")
        if payload["source"]["user_id"] != user:
            raise DomainError(404, "not_found")
        data = _checked(wire.validate_upload, payload, artifact_id=artifact_id, user_id=user)
        return originals.put(user, payload["source"], payload["kind"], payload["artifact"], data,
                             check_retained=True)

    @app.get("/v2/process/sources/{source_id}/versions/{source_version}/originals/{artifact_id}")
    async def read_original(source_id: str, source_version: str, artifact_id: str, request: Request):
        user, _, originals = authorize(request, {"sources:read"})
        for value in (source_id, artifact_id):
            _checked(wire.validate, "Identifier", value)
        if re.fullmatch(r"[1-9][0-9]{0,15}", source_version) is None:
            raise DomainError(422, "invalid_request")
        version = int(source_version)
        _checked(wire.validate, "SourceVersion", version)
        await empty_body(request)
        result = originals.read(user, {"user_id": user, "source_id": source_id,
                                       "source_version": version}, artifact_id, check_retained=True)
        try:
            wire.validate_original_read(result, source_id=source_id, source_version=version,
                                        artifact_id=artifact_id, user_id=user)
            # Canonical response uses the SAME finite bound as upload. Validate
            # stored evidence as server state, never as a client shape error.
            encoded = wire.canonical_request("OriginalArtifactUpload", result)
        except (ValidationError, ValueError, TypeError, RecursionError):
            raise DomainError(503, "unavailable") from None
        return Response(encoded, media_type="application/json")

    @app.post("/v2/process/frames:batch")
    async def ingest_frames(request: Request):
        user, registry, _ = authorize(request, {"process:capture"}, {"process.capture.v0.2"})
        values = request.headers.getlist("idempotency-key")
        if len(values) != 1:
            raise DomainError(422, "invalid_request")
        _checked(wire.validate, "IdempotencyKey", values[0])
        payload = await body(request, "FrameBatchRequest")
        if any(record["source"]["user_id"] != user for record in payload["batch"]["records"]):
            raise DomainError(404, "not_found")
        return registry.ingest_frame_request(user, payload, values[0])

    if enable_raw_ingress:
        @app.post(RAW_ROUTE)
        async def ingest_raw_frames(request: Request):
            user, registry, _ = authorize(request, {"process:capture"}, {"process.capture.v0.2"},
                                          contract=raw_wire)
            values = request.headers.getlist("idempotency-key")
            if len(values) != 1:
                raise DomainError(422, "invalid_request")
            _checked(raw_wire.validate, "IdempotencyKey", values[0])
            payload = await body(request, "RawFrameBatchRequest", contract=raw_wire)
            if any(record["source"]["user_id"] != user for record in payload["batch"]["records"]):
                raise DomainError(404, "not_found")
            return registry.ingest_raw_frame_request(user, payload, values[0])

    return app
