"""Generate the isolated process v0.2 schema, types and planned HTTP interface.

These artifacts describe shapes and service obligations, not a live endpoint.
Runtime validation and the service semantics in README.md remain required.
"""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from .validation import CONTRACT_VERSION, SCHEMA

ROOT = Path(__file__).resolve().parent

ERROR_CODES = {
    "401": ("unauthenticated",),
    "403": ("forbidden", "capability_required"),
    "404": ("not_found",),
    "409": ("record_conflict", "idempotency_conflict", "dependency_missing", "stale_scope", "capture_stopped"),
    "422": ("unsupported_version", "invalid_request"),
    "503": ("unavailable",),
}

ERROR_DESCRIPTIONS = {
    "401": "Missing or invalid authentication.",
    "403": "Authenticated scope is insufficient or the process.capture.v0.2 capability is missing.",
    "404": "A source or dependency is absent, foreign to the authenticated caller, or deleted.",
    "409": "Record, idempotency, dependency, scope, or capture-state conflict.",
    "422": "Unsupported contract version or invalid request.",
    "503": "Required service unavailable; do not claim persistence.",
}


def render_types():
    header = (
        "// Generated from process_v2/schema.json and resolved legacy primitives. Do not edit.\n"
        "// Structural types only; runtime validation and service authorization are required.\n"
        f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    )
    return header + "\n\n".join(f"export type {name} = {ts_type(value)};" for name, value in SCHEMA["$defs"].items()) + "\n"


def build_document():
    responses = {
        "200": {
            "description": "The entire batch envelope is durably committed, with exact per-record acknowledgements. Artifact receipts separately report pending or verified content; an envelope ACK does not prove artifact preservation or product acceptance.",
            "content": body("ProcessBatchAck"),
        }
    }
    for status, codes in ERROR_CODES.items():
        content = body("ProcessError")
        content["application/json"]["schema"] = {
            "allOf": [reference("ProcessError"), {"properties": {"error": {"enum": list(codes)}}}]
        }
        responses[status] = {
            "description": f"{ERROR_DESCRIPTIONS[status]} Error codes: {', '.join(codes)}. No partial acknowledgement or partial batch commit.",
            "content": content,
        }

    return {
        "openapi": "3.1.1",
        "info": {
            "title": "Learning Companion Process Capture API",
            "version": CONTRACT_VERSION,
            "description": "Bounded shape and service contract only; no live endpoint or product capability is established. See packages/contracts/process_v2/README.md for service semantics. The separate v0.1.0 contract remains unchanged.",
        },
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/", "description": "Same-origin API; development listeners bind loopback only."}],
        "security": [{"BearerAuth": []}],
        "paths": {
            "/v2/process/events:batch": {
                "post": {
                    "operationId": "ingestProcessBatch",
                    "summary": "Atomically persist captured process evidence and return exact acknowledgements",
                    "description": "Authenticate a trusted client, require process:capture scope and process.capture.v0.2 capability, and validate current ownership, dependencies, scope and capture authorization before committing. All-or-nothing batch: any failure returns ProcessError with no partial ACK or partial commit. No successful ACK before durable envelope commit. Artifact preservation is reported separately. This declaration does not implement an endpoint; service semantics are specified in packages/contracts/process_v2/README.md.",
                    "x-required-scope": "process:capture",
                    "x-required-capability": "process.capture.v0.2",
                    "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}],
                    "requestBody": {"required": True, "content": body("ProcessBatch")},
                    "responses": responses,
                }
            }
        },
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "description": "Trusted client credentials only. Never expose tokens or credentials to course pages or content scripts. Test authentication must be explicitly enabled.",
                }
            },
            "parameters": {
                "IdempotencyKey": {
                    "name": "Idempotency-Key",
                    "in": "header",
                    "required": True,
                    "schema": reference("IdempotencyKey"),
                    "description": "Stable per logical batch submission, scoped by authenticated user, HTTP method and path. Identical replay returns the original committed result; changed payload with the same key returns 409 idempotency_conflict. Service authorization and replay rules remain as specified in README.md.",
                }
            },
            "schemas": rewrite_refs(SCHEMA["$defs"]),
        },
    }


def render_openapi():
    return json.dumps(build_document(), indent=2) + "\n"


def render_schema():
    return json.dumps(SCHEMA, indent=2) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    outputs = {"contracts.ts": render_types(), "openapi.json": render_openapi(), "schema.json": render_schema()}
    directory = ROOT / "generated"
    if args.check:
        stale = [name for name, output in outputs.items() if not (directory / name).exists() or (directory / name).read_text() != output]
        if stale:
            raise SystemExit(f"Generated process v0.2 artifacts are stale ({', '.join(stale)}); run python -m packages.contracts.process_v2.generate")
    else:
        directory.mkdir(parents=True, exist_ok=True)
        for name, output in outputs.items():
            (directory / name).write_text(output)


if __name__ == "__main__":
    main()
