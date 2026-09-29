"""Render this isolated schema and structural client types; no HTTP activation."""

import argparse
import json
from pathlib import Path

from ..generate_types import ts_type
from . import CONTRACT_VERSION, SCHEMA


def outputs():
    header = "// Generated; byte/authorization checks remain required.\n"
    header += f"export const CONTRACT_VERSION = {json.dumps(CONTRACT_VERSION)} as const;\n\n"
    return {
        "schema.json": json.dumps(SCHEMA, indent=2) + "\n",
        "contracts.ts": header + "\n\n".join(
            f"export type {name} = {ts_type(shape)};" for name, shape in SCHEMA["$defs"].items()) + "\n",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    folder = Path(__file__).parent / "generated"
    for name, content in outputs().items():
        path = folder / name
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f"Stale original-artifact output: {name}")
        else:
            folder.mkdir(exist_ok=True)
            path.write_text(content)
