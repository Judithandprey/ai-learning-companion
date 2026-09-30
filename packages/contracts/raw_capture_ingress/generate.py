"""Generate the standalone raw-frame schema, structural types and HTTP description."""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from . import CAPABILITY, CONTRACT_VERSION, ERROR_CODES, SCHEMA, body_limit


def build_document():
    responses = {"200": {
        "description": "Existing ProcessBatchAck 0.2.0 only after one atomic actor commit. Every artifact receipt must be verified from exact retained typed-original bytes; no partial ACK, pending originals or pre-commit success.",
        "content": body("ProcessBatchAck"),
    }}
    for status, codes in ERROR_CODES.items():
        responses[status] = {
            "description": "Closed content-free error; no partial mutation or ACK. " + ", ".join(codes),
            "content": {"application/json": {"schema": {"allOf": [reference("RawIngressError"),
                {"properties": {"error": {"enum": codes}}}]}}},
        }
    return {
        "openapi": "3.1.1",
        "info": {
            "title": "Raw Process Capture Ingress",
            "version": CONTRACT_VERSION,
            "description": "Pure contract; route and capability default OFF. No handler, activation, control authority, producer grant, new upload or authentication identity. Existing registration/original routes remain 0.2.4 with their independently negotiated capabilities and scopes. README transaction and deterministic-error rules are normative.",
        },
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/"}],
        "security": [{"BearerAuth": []}],
        "paths": {"/v2/process/raw-frames:batch": {"post": {
            "operationId": "ingestRawProcessFrames",
            "description": "Exactly outer 0.2.6, ProcessBatch 0.2.0 and 1–100 RawCaptureFrame 0.2.5 descriptors. Frame IDs uniquely exhaust named record frames. Validate the whole batch and exact metadata membership; Backend must use retained DisplaySourceSnapshot 0.2.3 and OriginalArtifactBinding 0.2.2, exact bytes, ancestors, current authority/stop/revoke/delete fences and lost-original witnesses in the same actor transaction. Current internal Backend adoption supports provisional sessions; unresolved attempts are dependency_missing and frameless shared-display records are unsupported_source. Never manufacture a frame, source, timestamp or legacy fallback. Authentication and syntactic transport checks precede explicit outer/batch/frame version checks, which precede generic shape validation. No query parameters. Only one Content-Type application/json (optional charset=utf-8), identity content encoding, valid unambiguous Content-Length and a single valid Idempotency-Key. Raw and canonical metadata ceilings both apply; invalid JSON is 400, unsupported media is 415, invalid headers/query/shapes are 422 and raw oversize is 413. See README for exact precedence. Current fences and retained bytes are rechecked before cached success.",
            "x-required-scopes": ["process:capture"],
            "x-required-capabilities": [CAPABILITY, "process.capture.v0.2"],
            "x-max-body-bytes": body_limit("RawFrameBatchRequest"),
            "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}],
            "requestBody": {"required": True, "content": body("RawFrameBatchRequest")},
            "responses": responses,
        }}},
        "components": {
            "securitySchemes": {"BearerAuth": {
                "type": "http", "scheme": "bearer",
                "description": "Current trusted embedding resolves authenticated principal, owned device/session membership, stream producer and capabilities; request/page assertions and token possession alone are insufficient. Never expose credentials to course pages/content scripts. process.raw-ingress.v0.2.6 does not imply process.ingress.v0.2.4 or process control authority.",
            }},
            "parameters": {"IdempotencyKey": {
                "name": "Idempotency-Key", "in": "header", "required": True,
                "schema": reference("IdempotencyKey"),
                "description": "Exactly one valid header, keyed by authenticated owner + method + full path + key. Compare the full ordered 0.2.6 HTTP envelope including all nested versions and frame/record/evidence array order; only object member order is irrelevant. Changed body is 409 idempotency_conflict. Exact replay needs current fences and exact retained bytes. HTTP equality, receipt, raw descriptors, records and references commit in the SAME actor transaction; the internal canonical frame-ID map alone is insufficient.",
            }},
            "schemas": rewrite_refs(SCHEMA["$defs"]),
        },
    }


def outputs():
    types = "// Generated structural types; current authority, exact bytes and atomic commit remain service obligations.\n"
    types += f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    types += "\n\n".join(f"export type {name} = {ts_type(shape)};" for name, shape in SCHEMA["$defs"].items()) + "\n"
    return {"schema.json": json.dumps(SCHEMA, indent=2) + "\n", "contracts.ts": types,
            "openapi.json": json.dumps(build_document(), indent=2) + "\n"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    folder = Path(__file__).parent / "generated"
    for name, content in outputs().items():
        path = folder / name
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f"Stale raw-capture-ingress output: {name}")
        else:
            folder.mkdir(exist_ok=True)
            path.write_text(content)
