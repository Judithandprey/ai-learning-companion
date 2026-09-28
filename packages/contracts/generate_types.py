"""Generate structural TS types for our deliberately small JSON Schema subset.

Constraints such as numeric ranges and cross-record authorization still require
runtime validation. Unknown structural schema keywords fail generation.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).parent
SCHEMA = json.loads((ROOT / "schema.json").read_text())


def ts_type(schema):
    supported = {"$ref", "type", "const", "enum", "anyOf", "properties", "required", "additionalProperties", "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "description", "title"}
    unknown = set(schema) - supported
    if unknown:
        raise ValueError(f"Unsupported schema keywords: {unknown}")
    if "$ref" in schema:
        if set(schema) - {"$ref", "description", "title"}:
            raise ValueError("Unsupported $ref siblings")
        return schema["$ref"].removeprefix("#/$defs/")
    if "const" in schema:
        return json.dumps(schema["const"])
    if "enum" in schema:
        return " | ".join(json.dumps(x) for x in schema["enum"])
    if "anyOf" in schema:
        return " | ".join(ts_type(x) for x in schema["anyOf"])
    kind = schema["type"]
    if isinstance(kind, list):
        return " | ".join(ts_type({**schema, "type": x}) for x in kind)
    if kind == "object":
        if schema.get("additionalProperties") is not False:
            raise ValueError("Unsupported open object schema")
        required = schema["required"]
        return "{\n" + "\n".join(f"  readonly {json.dumps(k)}{'' if k in required else '?'}: {ts_type(v)};" for k, v in schema["properties"].items()) + "\n}"
    if kind == "array":
        return f"ReadonlyArray<{ts_type(schema['items'])}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}[kind]


def render():
    return "// Generated from schema.json. Do not edit. Runtime validation is required.\nexport const CONTRACT_VERSION = '0.1.0' as const;\n\n" + "\n\n".join(f"export type {name} = {ts_type(value)};" for name, value in SCHEMA["$defs"].items()) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = ROOT / "generated" / "contracts.ts"
    output = render()
    if args.check:
        if not path.exists() or path.read_text() != output:
            raise SystemExit("Generated types are stale; run python -m packages.contracts.generate_types")
    else:
        path.write_text(output)
