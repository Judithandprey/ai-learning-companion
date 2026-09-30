"""Generate the Mac retained-frame schema, structural types and HTTP description."""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from . import CAPABILITY, CONTRACT_VERSION, ERROR_CODES, SCHEMA, body_limit


def build_document():
    responses = {"200": {
        "description": "Existing ProcessBatchAck 0.2.0 only after one atomic actor commit. Every artifact receipt must be verified from exact retained typed-original bytes, including separate editable ink; no partial ACK, pending originals or pre-commit success.",
        "content": body("ProcessBatchAck"),
    }}
    for status, codes in ERROR_CODES.items():
        responses[status] = {
            "description": "Closed content-free error; no partial mutation or ACK. " + ", ".join(codes),
            "content": {"application/json": {"schema": {"allOf": [reference("MacOSIngressError"),
                {"properties": {"error": {"enum": codes}}}]}}},
        }
    return {
        "openapi": "3.1.1",
        "info": {
            "title": "MacOS Process Capture Ingress",
            "version": CONTRACT_VERSION,
            "description": "Released additive metadata contract; route and capability default OFF. No handler, activation, control authority, producer grant, new upload or authentication identity. Existing registration/original routes remain 0.2.4 with independently negotiated capabilities and scopes. README transaction and deterministic-error rules are normative; Use the exact Lead-published source and generated revision.",
        },
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/"}],
        "security": [{"BearerAuth": []}],
        "paths": {"/v2/process/macos-frames:batch": {"post": {
            "operationId": "ingestMacOSProcessFrames",
            "description": (
                "Exactly outer 0.2.12, ProcessBatch 0.2.0 and 0–100 MacRetainedFrame 0.2.11 descriptors. "
                "Frame IDs uniquely exhaust named record frames. Validate the whole batch and every complete raw/composed PNG reference on each selected record. "
                "Artifact identity and encoded-byte hash facts must agree across frames; native_file is scoped by profile.native_session_id, so different native sessions may reuse relative filenames for different bytes. "
                "Preserve all 0.2.11 native clocks, geometry, raw relation, ink revisions/stroke order/limitations, and composed/not_composed/unknown outcomes exactly. "
                "Unknown or refused composition never means successful empty ink, Stop, live capture or permission to substitute raw as composed. PNGs and native document paths do not prove editable-ink saving, structured input acquisition or provider receipt. "
                "Backend must call macos_frame.validate_binding with STORED DisplaySourceSnapshot 0.2.3 and every distinct OriginalArtifactBinding 0.2.2, then verify every retained original, known older ancestor, current authority/stop/revoke/delete/cancel fence and lost-original witness in the same actor transaction. "
                "Unknown or corrupt retained variants are unavailable, never request-version errors or permission to reconstruct originals. Retained and proposed cross-frame image facts must also be checked inside that transaction; envelope validation alone cannot protect later appends or replay. "
                "Frameless records require explicit partial/unobserved/unknown coverage, no artifacts and null observation/media/Process clocks; retained shared-display identity and current authority still bind them. "
                "Never accept operation evidence or observed_samples without a frame. Generic framed Process vocabulary remains unchanged; trusted pixel-producer admission is a separate service check before success or replay. "
                "Stopped historical uploads obey an independently sealed pre-stop ceiling and cannot restart live capture. Keep missing/refused/unwritten capture distinct from PNGs; infer no capture UTC, orientation, latency or Process clock. "
                "Authenticate and check current scopes/capabilities first, then query and Idempotency-Key syntax, then media/length/encoding/raw size and strict JSON. "
                "Malformed, duplicate-member, nonfinite or invalid-UTF-8 JSON is 400; explicit unsupported outer 0.2.12, batch 0.2.0 and frame 0.2.11 versions then precede generic shape errors (422 unsupported_version). "
                "Missing versions and other shape/integrity failures are 422 invalid_request; raw oversize is 413 and canonical oversize is 422. "
                "No query parameters. Require exactly one Content-Type application/json (optional charset=utf-8, case-insensitive), absent or single identity Content-Encoding, a single unsigned-decimal Content-Length matching received bytes if present, no Content-Length with Transfer-Encoding, and exactly one valid Idempotency-Key. "
                "Duplicate Content-Type and invalid/duplicate lengths or keys are 422; missing/unsupported type or encoding is 415. Reject oversized streams before parsing. "
                "Preserve finite safe integral numeric representations without rounding or mutating caller metadata. Current fences and exact retained bytes precede cached success. "
                "Reuse 0.2.4 internal error aliases without content disclosure; only unavailable and dependency_missing are retryable, with dependency retries awaiting actual resolution. See README for complete transport and transactional obligations."
            ),
            "x-required-scopes": ["process:capture"],
            "x-required-capabilities": [CAPABILITY, "process.capture.v0.2"],
            "x-max-body-bytes": body_limit("MacOSFrameBatchRequest"),
            "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}],
            "requestBody": {"required": True, "content": body("MacOSFrameBatchRequest")},
            "responses": responses,
        }}},
        "components": {
            "securitySchemes": {"BearerAuth": {
                "type": "http", "scheme": "bearer",
                "description": "Current trusted embedding resolves authenticated principal, owned device/session membership, stream producer, generation and independent acquisition authority; native labels, request/page assertions and token possession alone are insufficient. Never expose credentials to course pages/content scripts. process.macos-ingress.v0.2.12 implies neither process.ingress.v0.2.4 nor process control authority.",
            }},
            "parameters": {"IdempotencyKey": {
                "name": "Idempotency-Key", "in": "header", "required": True,
                "schema": reference("IdempotencyKey"),
                "description": "Exactly one valid header, keyed by authenticated owner + method + full path + key. Compare the full ordered 0.2.12 HTTP envelope including all nested versions and frame/record/artifact/evidence/stroke/limitation array order; only object member order is irrelevant. Changed body is 409 idempotency_conflict. Exact replay needs current fences and exact retained bytes. HTTP equality, receipt, Mac descriptors, records and references commit in the SAME actor transaction; an internal canonical frame-ID map or wrapper cache is insufficient. Cancellation, late failure or commit failure publishes no partial ACK or mutation.",
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
                raise SystemExit(f"Stale macos-capture-ingress output: {name}")
        else:
            folder.mkdir(exist_ok=True)
            path.write_text(content)
