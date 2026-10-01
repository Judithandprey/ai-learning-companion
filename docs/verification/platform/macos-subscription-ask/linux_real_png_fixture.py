#!/usr/bin/env python3
"""LINUX-HARNESS-ONLY helper (not part of the product or its checks).

    python linux_real_png_fixture.py STUB_FIXTURE_DIR OUT_FIXTURE_DIR

The Linux Apple stubs do not write real PNG files (their images are a private stand-in chunk), so
the released validator cannot accept the image bytes of a request made on Linux. This copies
`ask-start.jsonl` and replaces only each request's PNG by a real grey 8-bit RGBA PNG of the same
width and height, with its SHA-256. Every other field stays exactly as Swift wrote it. What this
leaves unverified here, and only a macOS run can show: that ImageIO's own PNG is admitted.
"""
import base64, hashlib, json, struct, sys, zlib
from pathlib import Path


def png(width, height):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    rows = b"".join(b"\x00" + b"\x80\x80\x80\xff" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


source, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True)
lines = []
for line in (source / "ask-start.jsonl").read_bytes().split(b"\n")[:-1]:
    envelope = json.loads(line)
    image = envelope["params"]["request"]["image"]
    data = png(image["width"], image["height"])
    image["png_base64"] = base64.b64encode(data).decode("ascii")
    image["sha256"] = hashlib.sha256(data).hexdigest()
    lines.append(json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode() + b"\n")
(out / "ask-start.jsonl").write_bytes(b"".join(lines))
print(f"{len(lines)} requests copied with a real PNG each")
