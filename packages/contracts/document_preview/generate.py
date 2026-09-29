"""Generate the finite local document preview types/schema/OpenAPI."""

import argparse
import json
from pathlib import Path

from ..generate_openapi import body, reference, rewrite_refs
from ..generate_types import ts_type
from .validation import CONTRACT_VERSION, SCHEMA

ROOT = Path(__file__).parent


def operation(name, result, request=None, *, note_path=False):
    responses = {"200": {"description": "Durable owned result; exact retry is not a second save.", "content": body(result)}}
    for status, code in {"401": "unauthorized", "403": "forbidden", "404": "not_found",
                         "409": "conflict", "422": "invalid_request", "503": "unavailable"}.items():
        responses[status] = {"description": code, "content": body("PreviewError")}
    value = {"operationId": name, "responses": responses,
             "x-required-scope": "document-preview:write" if request else "document-preview:read"}
    if request:
        value["requestBody"] = {"required": True, "content": body(request)}
        value["parameters"] = [{"name": "Idempotency-Key", "in": "header", "required": True,
                                "schema": reference("Identifier")}]
    if note_path:
        value["parameters"] = [{"name": "note_id", "in": "path", "required": True,
                                "schema": reference("Identifier")}]
    return value


def build_document():
    return {"openapi": "3.1.1", "info": {"title": "Local Document Preview", "version": CONTRACT_VERSION},
            "jsonSchemaDialect": "https://json-schema.org/draft/2020-12/schema",
            "servers": [{"url": "/"}], "security": [{"BearerAuth": []}],
            "paths": {
                "/preview/v1/session": {"get": operation("readPreviewSession", "SessionInfo")},
                "/preview/v1/documents": {"post": operation("importPreviewDocument", "ImportReceipt", "DocumentImport")},
                "/preview/v1/saves": {"post": operation("saveDocumentPreview", "SaveReceipt", "DocumentSave")},
                "/preview/v1/saves/{note_id}": {"get": operation("readDocumentPreview", "SavedPreview", note_path=True)},
            },
            "components": {"securitySchemes": {"BearerAuth": {"type": "http", "scheme": "bearer"}},
                           "schemas": rewrite_refs(SCHEMA["$defs"])}}


def outputs():
    types = "// Generated structural types; runtime validation and trusted authorization are required.\n"
    types += f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    types += "\n\n".join(f"export type {n} = {ts_type(v)};" for n, v in SCHEMA["$defs"].items()) + "\n"
    return {"schema.json": json.dumps(SCHEMA, indent=2) + "\n", "contracts.ts": types,
            "openapi.json": json.dumps(build_document(), indent=2) + "\n"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, value in outputs().items():
        path = ROOT / "generated" / name
        if args.check:
            if not path.exists() or path.read_text() != value:
                raise SystemExit(f"Stale document preview artifact: {name}")
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(value)


if __name__ == "__main__":
    main()
