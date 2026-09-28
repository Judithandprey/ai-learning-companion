"""Generate the bounded P0 HTTP interface from the shared wire definitions.

This describes planned server behavior; it does not implement endpoints.
"""

import argparse
import json
from pathlib import Path

from .validation import CONTRACT_VERSION, SCHEMA

ROOT = Path(__file__).parent


def rewrite_refs(value):
    if isinstance(value, dict):
        return {key: (item.replace("#/$defs/", "#/components/schemas/") if key == "$ref" else rewrite_refs(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [rewrite_refs(item) for item in value]
    return value


def reference(name):
    return {"$ref": f"#/components/schemas/{name}"}


def body(name):
    return {"application/json": {"schema": reference(name)}}


def response(name, description):
    return {"description": description, "content": body(name)}


def operation(identifier, summary, result, scope, *, request=None, idempotent=False, created=False, description=""):
    result_responses = {"200": response(result, "Successful result; not proof of any external provider write.")}
    if created:
        result_responses["201"] = response(result, "New resource committed to the server archive.")
    for code, meaning in {"401": "Missing or expired authentication.", "403": "Authenticated scope is insufficient.", "404": "Resource absent or not owned by the caller.", "409": "Idempotency, source, or revision conflict.", "422": "Invalid request.", "503": "Required service unavailable; do not claim persistence."}.items():
        result_responses[code] = response("ApiError", meaning)
    result = {"operationId": identifier, "summary": summary, "description": description, "x-required-scope": scope, "responses": result_responses}
    if request:
        result["requestBody"] = {"required": True, "content": body(request)}
    if idempotent:
        result["parameters"] = [{"$ref": "#/components/parameters/IdempotencyKey"}]
    return result


def id_parameter(name):
    return {"name": name, "in": "path", "required": True, "schema": reference("Identifier")}


def build_document():
    paths = {
        "/v1/sources": {"post": operation("registerSource", "Register a source URL without claiming its contents are fetched", "SourceRegistrationResult", "sources:write", request="SourceRegistrationRequest", idempotent=True, created=True, description="Preserve meaningful query parameters. Server derives identity from authentication. New records start registered with no snapshot; duplicate registration returns 200. Merely storing a URL never proves access to its contents.")},
        "/v1/sources/{source_id}": {"parameters": [id_parameter("source_id")], "get": operation("getSource", "Read an owned source and available immutable versions", "SourceReadResult", "sources:read")},
        "/v1/sources/{source_id}/versions/{source_version}": {"parameters": [id_parameter("source_id"), {"name": "source_version", "in": "path", "required": True, "schema": {"type": "integer", "minimum": 1, "maximum": 9007199254740991}}], "get": operation("getSourceSnapshot", "Recover an exact original source version", "SourceSnapshot", "sources:read")},
        "/v1/events:batch": {"post": operation("ingestEventBatch", "Atomically persist events and return exact acknowledgements", "EventBatchAck", "events:write", request="EventBatch", idempotent=True, description="All-or-nothing write. Same stable IDs/content deduplicate; conflicting content or reused device sequence returns 409. Server assigns received_at and excludes it from replay fingerprints. No successful ACK before durable commit.")},
        "/v1/notes/{note_id}": {"parameters": [id_parameter("note_id")], "get": operation("getNote", "Read the current owned note revision", "NoteRevision", "notes:read"), "put": operation("putNote", "Create or update a note using base_revision compare-and-swap", "NoteWriteResult", "notes:write", request="NoteRevision", idempotent=True, created=True, description="Body note_id must match path. Body user_id must match authenticated identity. New notes require base 0/revision 1. Preserve ink, user originals and history. Identical key/payload replay returns the original committed result even after newer revisions; conflicting reuse returns 409.")},
        "/v1/jobs/{job_id}/cancel": {"parameters": [id_parameter("job_id")], "post": operation("cancelJob", "Request cancellation without claiming an executor has stopped", "JobCancelResult", "jobs:cancel", description="This operation is inherently idempotent. Return actual cancelling/cancelled/completed/failed state. Worker must recheck source versions, deletion, authorization and cancellation atomically with output commit.")},
        "/v1/usage": {"get": operation("getUsage", "Read API money and subscription quota separately", "UsageResult", "usage:read", description="Month is selected by server time in America/Los_Angeles. Unknown quota remains null; unknown pricing cannot permit paid calls. A displayed balance is not a reservation.")},
    }
    paths["/v1/notes/{note_id}"]["get"]["parameters"] = [{"name": "revision", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 1, "maximum": 9007199254740991}, "description": "Omit for current revision; specify an exact immutable historical revision."}]
    return {
        "openapi": "3.1.1",
        "info": {"title": "Learning Companion P0 API", "version": CONTRACT_VERSION, "description": "Contract only. Real login, database persistence, providers and device capabilities require separate implementation and evidence."},
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/", "description": "Same-origin API; development listeners bind loopback only."}],
        "security": [{"BearerAuth": []}],
        "paths": paths,
        "components": {
            "securitySchemes": {"BearerAuth": {"type": "http", "scheme": "bearer", "description": "Trusted client credentials only. No token or credential is sent to course content scripts; test authentication must be explicitly enabled."}},
            "parameters": {"IdempotencyKey": {"name": "Idempotency-Key", "in": "header", "required": True, "schema": reference("IdempotencyKey"), "description": "Stable per logical write. Scope by authenticated user, HTTP method and path. Reuse with changed payload returns 409; repeat after response loss returns the original result."}},
            "schemas": rewrite_refs(SCHEMA["$defs"]),
        },
    }


def render():
    return json.dumps(build_document(), indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = ROOT / "generated" / "openapi.json"
    output = render()
    if args.check:
        if not path.exists() or path.read_text() != output:
            raise SystemExit("Generated OpenAPI is stale; run python -m packages.contracts.generate_openapi")
    else:
        path.write_text(output)
