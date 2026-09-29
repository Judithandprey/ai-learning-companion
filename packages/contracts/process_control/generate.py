"""Generate the additive stream control schema/types and specified HTTP surface."""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from .validation import CAPABILITY, CONTRACT_VERSION, SCHEMA

ROOT = Path(__file__).parent
ERROR_CODES = {
    "401": ["unauthenticated"], "403": ["forbidden", "capability_required"],
    "404": ["not_found"],
    "409": ["stream_conflict", "idempotency_conflict", "stale_revision", "invalid_transition"],
    "422": ["unsupported_version", "invalid_request"], "503": ["unavailable"],
}


def operation(name, request=None, *, stream_path=False):
    responses = {"200": {"description": "Transaction-current owned control state, also on exact command replay. This is not capture or artifact preservation evidence.",
                         "content": body("StreamState")}}
    for status, codes in ERROR_CODES.items():
        content = body("ControlError")
        content["application/json"]["schema"] = {
            "allOf": [reference("ControlError"), {"properties": {"error": {"enum": codes}}}]}
        responses[status] = {"description": f"No partial mutation. Codes: {', '.join(codes)}.", "content": content}
    result = {"operationId": name, "x-required-scope": "process:control",
              "x-required-capability": CAPABILITY,
              "description": "Trusted authenticated client only; current ownership, membership, generation and capability checks precede mutation AND replay. See README for required transactional invariants. No live server implementation is supplied.",
              "parameters": [], "responses": responses}
    if stream_path:
        result["parameters"].append({"name": "stream_id", "in": "path", "required": True,
                                     "schema": reference("Identifier")})
    if request:
        result["parameters"].append({"$ref": "#/components/parameters/IdempotencyKey"})
        result["requestBody"] = {"required": True, "content": body(request)}
    return result


def build_document():
    return {
        "openapi": "3.1.1", "info": {"title": "Process Stream Control", "version": CONTRACT_VERSION,
          "description": "Additive control-only contract; original /v1 and capture 0.2.0 payloads stay frozen. No endpoint, device, capture or provider capability is established."},
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/", "description": "Same-origin API; local development binds loopback."}],
        "security": [{"BearerAuth": []}],
        "paths": {
            "/v2/process/streams": {"post": operation("registerProcessStream", "StreamRegistration")},
            "/v2/process/streams/{stream_id}": {"get": operation("readProcessStream", stream_path=True)},
            "/v2/process/streams/{stream_id}:control": {"post": operation("controlProcessStream", "StreamCommand", stream_path=True)},
        },
        "components": {
            "securitySchemes": {"BearerAuth": {"type": "http", "scheme": "bearer",
                "description": "Trusted client token; never page/content-script supplied credentials. Test auth is explicitly configured."}},
            "parameters": {"IdempotencyKey": {"name": "Idempotency-Key", "in": "header", "required": True,
                "schema": reference("IdempotencyKey"),
                "description": "Owner/method/full-path/logical-command scoped. Same key + changed complete body conflicts. Exact replay does not repeat transitions; after current fences it returns CURRENT control state, never an old live state."}},
            "schemas": rewrite_refs(SCHEMA["$defs"]),
        },
    }


def outputs():
    types = "// Generated from process_control/schema.json. Structural types only; runtime checks required.\n"
    types += f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    types += "\n\n".join(f"export type {n} = {ts_type(v)};" for n, v in SCHEMA["$defs"].items()) + "\n"
    return {"schema.json": json.dumps(SCHEMA, indent=2) + "\n", "contracts.ts": types,
            "openapi.json": json.dumps(build_document(), indent=2) + "\n"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    directory = ROOT / "generated"
    for name, value in outputs().items():
        path = directory / name
        if args.check:
            if not path.exists() or path.read_text() != value:
                raise SystemExit(f"Stale control artifact: {name}; run python -m packages.contracts.process_control.generate")
        else:
            directory.mkdir(exist_ok=True)
            path.write_text(value)


if __name__ == "__main__":
    main()
