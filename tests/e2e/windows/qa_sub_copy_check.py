"""Run with `python -B -c <this text>` and the Backend copy as the working folder (see sub_copy.mjs).

Calls the connector's own preparation of a question (`services.worker.connectors.chatgpt_local._prepare`, which loads
`services.learning.subscription_ask` and, through it, `packages.contracts`) on a generated 2x2 picture. Offline: no Codex,
no account, nothing sent. Prints one JSON line: whether it worked, the prompt's size, and that every project module was
loaded from the working folder.
"""
import base64
import hashlib
import json
import os
import struct
import sys
import zlib


def png(width, height):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + b"\xf4\xf6\xf8" * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


picture = png(2, 2)
request = {
    "request_id": "qa-copy-check.1", "question": "QA copy check: nothing is sent.", "assistance": "explain",
    "image": {"png_base64": base64.b64encode(picture).decode(), "sha256": hashlib.sha256(picture).hexdigest(), "width": 2, "height": 2},
    "context": {"capture_session_id": "qa-copy-check", "frame_seq": 1, "frame_captured_at": "2026-01-01T00:00:00.000Z", "frame_width": 100, "frame_height": 100,
                "display": {"id": "qa", "bounds": {"x": 0, "y": 0, "width": 100, "height": 100}, "scale_factor": 1},
                "region_dip": {"x": 0, "y": 0, "width": 2, "height": 2}, "region_px": {"x": 0, "y": 0, "width": 2, "height": 2},
                "ink_revision": None, "ink_sha256": None, "source_url": None, "source_version": None, "media_position": None},
}
try:
    from services.worker.connectors import chatgpt_local
    prepared = chatgpt_local._prepare(request)
    here = os.path.realpath(os.getcwd()) + os.sep
    mine = {name: os.path.realpath(module.__file__) for name, module in sys.modules.items()
            if name.split(".")[0] in ("services", "packages") and getattr(module, "__file__", None)}
    outside = sorted(name for name, path in mine.items() if not path.startswith(here))
    text = prepared["text"].encode()
    print(json.dumps({"ok": not outside and len(mine) > 0 and prepared["image_bytes"] == picture, "prompt_bytes": len(text), "project_modules_loaded": len(mine),
                      "modules_loaded_from_elsewhere": outside, "packages_contracts_loaded": "packages.contracts" in mine}))
except Exception as error:  # the reason is the result
    print(json.dumps({"ok": False, "error": f"{type(error).__name__}: {str(error)[:200]}"}))
