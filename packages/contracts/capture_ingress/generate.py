"""Generate the isolated capture ingress schema, structural types and HTTP contract."""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from . import CAPABILITY, CONTRACT_VERSION, ERROR_CODES, SCHEMA, body_limit


def operation(name, result, *, scopes, capabilities=(), request=None, paths=(), description=""):
    responses = {"200": {"description": "Owned durable result after current fences; no live/provider/codec claim.",
                         "content": body(result)}}
    for status, codes in ERROR_CODES.items():
        responses[status] = {"description": "No partial mutation or ACK. " + ", ".join(codes),
            "content": {"application/json": {"schema": {"allOf": [reference("IngressError"),
                {"properties": {"error": {"enum": codes}}}]}}}}
    value = {"operationId": name, "description": description,
             "x-required-scopes": list(scopes), "x-required-capabilities": [CAPABILITY, *capabilities],
             "parameters": [{"name": field, "in": "path", "required": True,
                             "schema": reference("SourceVersion" if field == "source_version" else "Identifier")}
                            for field in paths], "responses": responses}
    if request:
        value["requestBody"] = {"required": True, "content": body(request)}
        value["x-max-body-bytes"] = body_limit(request)
    return value


def build_document():
    register = operation("registerDisplaySource", "DisplaySourceSnapshot",
        request="DisplaySourceRegistration", paths=("source_id",),
        scopes=("sources:write", "process:control", "process:capture"),
        capabilities=("process.control.v0.2.1", "process.capture.v0.2"),
        description="Exact source path/body equality. Trusted adapter resolves producer from the current consumed stream grant in the same actor transaction; never creates or accepts a client start grant. Creation AND exact ID replay require current live authority. Server supplies creation time; immutable source-ID replay needs no Idempotency-Key.")
    read_source = operation("readDisplaySource", "DisplaySourceSnapshot", paths=("source_id",),
        scopes=("sources:read",), description="Read the retained 0.2.3 descriptor after current account/source/ownership checks. No current live capture or process-control grant is required; a scoped stop is distinct from revoked/deleted source access.")
    upload = operation("putProcessOriginal", "OriginalArtifactReceipt", request="OriginalArtifactUpload",
        paths=("artifact_id",), scopes=("sources:write",),
        description="Existing 0.2.2 upload: exact path/body/owner/source/version, canonical base64, byte length and hash. Immutable artifact-ID replay rechecks all current fences; no Idempotency-Key. Shared-display sources additionally require current live capture authority even for exact byte retry; a stopped queue is not an upload grant.")
    upload["x-display-source-required-scopes"] = ["process:capture"]
    upload["x-display-source-required-capabilities"] = ["process.capture.v0.2"]
    read_original = operation("readProcessOriginal", "OriginalArtifactUpload",
        paths=("source_id", "source_version", "artifact_id"), scopes=("sources:read",),
        description="Return exact retained 0.2.2 original bytes bound to every path value and authenticated owner. Current account/source access and tombstones apply; scoped stop does not forbid ordinary history reads. No current live grant required; do not synthesize or reconstruct missing bytes.")
    frames = operation("ingestProcessFrames", "ProcessBatchAck", request="FrameBatchRequest",
        scopes=("process:capture",), capabilities=("process.capture.v0.2",),
        description="One transaction commits all frames, process records, references and exact ACK after current authority, owned source/display incarnation, typed-original byte and ancestor checks. Frame IDs uniquely exhaust the non-null record frame IDs. Only already stored typed originals; no pending artifacts. Current backend rejects frameless display records and unresolved attempt scopes. Full HTTP envelope equality retains frame-array order; existing internal frame-map replay alone does not implement this boundary. No partial ACK or resurrection.")
    frames["parameters"].append({"$ref": "#/components/parameters/IdempotencyKey"})
    return {"openapi": "3.1.1", "info": {"title": "Process Capture Ingress", "version": CONTRACT_VERSION,
        "description": "Additive pure contract only; no server activation, start grant, archive, codec or AI capability. Existing wire versions stay unchanged. README transaction/error rules are normative."},
        "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
        "servers": [{"url": "/"}], "security": [{"BearerAuth": []}],
        "paths": {
            "/v2/process/display-sources/{source_id}": {"put": register, "get": read_source},
            "/v2/process/originals/{artifact_id}": {"put": upload},
            "/v2/process/sources/{source_id}/versions/{source_version}/originals/{artifact_id}": {"get": read_original},
            "/v2/process/frames:batch": {"post": frames},
        },
        "components": {
            "securitySchemes": {"BearerAuth": {"type": "http", "scheme": "bearer",
                "description": "Trusted authenticated adapter only; no credentials, capabilities or producer grants from course pages/content scripts. Capability advertisement and routes default off until Backend integration is explicitly released."}},
            "parameters": {"IdempotencyKey": {"name": "Idempotency-Key", "in": "header", "required": True,
                "schema": reference("IdempotencyKey"),
                "description": "Owner + method + full path + key. Compare the whole validated 0.2.4 envelope, preserving array order and nested versions; object key order alone is irrelevant. Changed body conflicts, exact replay returns the committed ACK only after fresh fences. HTTP equality/receipt and record/frame commit share one transaction; no separate check-then-commit wrapper."}},
            "schemas": rewrite_refs(SCHEMA["$defs"]),
        }}


def outputs():
    types = "// Generated structural types; local validation and transaction-current authority remain required.\n"
    types += f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    types += "\n\n".join(f"export type {name} = {ts_type(shape)};" for name, shape in SCHEMA["$defs"].items()) + "\n"
    return {"schema.json": json.dumps(SCHEMA, indent=2) + "\n", "contracts.ts": types,
            "openapi.json": json.dumps(build_document(), indent=2) + "\n"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    folder = Path(__file__).parent / "generated"
    for name, content in outputs().items():
        path = folder / name
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f"Stale capture-ingress output: {name}")
        else:
            folder.mkdir(exist_ok=True)
            path.write_text(content)


if __name__ == "__main__":
    main()
