"""Generate the standalone windows-frame schema, structural types and HTTP description."""

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
            "content": {"application/json": {"schema": {"allOf": [reference("WindowsIngressError"),
                {"properties": {"error": {"enum": codes}}}]}}},
        }
    return {
        "openapi": "3.1.1",
        "info": {
            "title": "Windows Process Capture Ingress",
            "version": CONTRACT_VERSION,
            "description": "Pure contract; route and capability default OFF. No handler, activation, control authority, producer grant, new upload or authentication identity. Existing registration/original routes remain 0.2.4 with their independently negotiated capabilities and scopes. README transaction and deterministic-error rules are normative.",
        },
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/"}],
        "security": [{"BearerAuth": []}],
        "paths": {"/v2/process/windows-frames:batch": {"post": {
            "operationId": "ingestWindowsProcessFrames",
            "description": "Exactly outer 0.2.10, ProcessBatch 0.2.0 and 0–100 WindowsFrame 0.2.9 descriptors. Frame IDs uniquely exhaust named record frames. Validate the whole batch and every complete raw/composed PNG reference on each selected record. Image identity and native-file facts must also be consistent across frames. Backend must call windows_frame.validate_binding with STORED DisplaySourceSnapshot 0.2.3 and every distinct OriginalArtifactBinding 0.2.2, then verify every retained original, ancestors, current authority/stop/revoke/delete fences and lost-original witnesses in the same actor transaction. Frameless records require explicit partial/unobserved/unknown coverage, no artifacts and null observation/media/Process clocks; retained shared-display identity and current authority still bind them. Never accept operation evidence or observed_samples without a frame. Generic framed Process vocabulary remains unchanged; trusted pixel-producer admission is a separate current service check before success or replay. Legacy entrypoints keep their old restrictions. Do not turn refused/deferred/unwritten/Stop into images or infer absent gap durations, capture UTC or Process clocks. Authentication and syntactic transport checks precede explicit unsupported outer 0.2.10, batch 0.2.0 and frame 0.2.9 versions, which precede generic shape validation. No query parameters. Only one Content-Type application/json (optional charset=utf-8), identity content encoding, valid unambiguous Content-Length and a single valid Idempotency-Key. Raw and canonical metadata ceilings both apply; invalid JSON is 400, unsupported media is 415, invalid headers/query/shapes are 422 and raw oversize is 413. See README for exact precedence. Current fences and retained bytes are rechecked before cached success.",
            "x-required-scopes": ["process:capture"],
            "x-required-capabilities": [CAPABILITY, "process.capture.v0.2"],
            "x-max-body-bytes": body_limit("WindowsFrameBatchRequest"),
            "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}],
            "requestBody": {"required": True, "content": body("WindowsFrameBatchRequest")},
            "responses": responses,
        }}},
        "components": {
            "securitySchemes": {"BearerAuth": {
                "type": "http", "scheme": "bearer",
                "description": "Current trusted embedding resolves authenticated principal, owned device/session membership, stream producer and capabilities; request/page assertions and token possession alone are insufficient. Never expose credentials to course pages/content scripts. process.windows-ingress.v0.2.10 does not imply process.ingress.v0.2.4 or process control authority.",
            }},
            "parameters": {"IdempotencyKey": {
                "name": "Idempotency-Key", "in": "header", "required": True,
                "schema": reference("IdempotencyKey"),
                "description": "Exactly one valid header, keyed by authenticated owner + method + full path + key. Compare the full ordered 0.2.10 HTTP envelope including all nested versions and frame/record/evidence array order; only object member order is irrelevant. Changed body is 409 idempotency_conflict. Exact replay needs current fences and exact retained bytes. HTTP equality, receipt, windows descriptors, records and references commit in the SAME actor transaction; the internal canonical frame-ID map alone is insufficient.",
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
                raise SystemExit(f"Stale windows-capture-ingress output: {name}")
        else:
            folder.mkdir(exist_ok=True)
            path.write_text(content)
