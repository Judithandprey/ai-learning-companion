#!/usr/bin/env python3
"""Foreground, test-owned loopback host for the Windows ingress Backend (tests/uploader.test.ts).

It serves the real composed capture app of an extracted Backend (control + ingress, Windows route on), with a
MemoryStore, synthetic identities read from a harness plan's display_source and explicit synthetic consent, on
127.0.0.1 only. This is synthetic test authority: no database, native capture, provider, user or real consent.

The bearer comes only from the environment (LC_WINDOWS_TEST_TOKEN, chosen by the test) and is never printed.
stdout: one JSON "ready" line. The host exits when stdin closes (the test ended) or on a signal.

  python -P tests/backend-host.py --backend <extracted services+packages> --identities <harness plan JSON>
"""
import argparse
import asyncio
import json
import os
import socket
import sys
import threading
from datetime import timedelta
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--backend", required=True)
p.add_argument("--identities", required=True)
p.add_argument("--ttl", type=float, default=600.0)
args = p.parse_args()

sys.dont_write_bytecode = True
sys.path.insert(0, args.backend)

import httpx  # noqa: E402
import uvicorn  # noqa: E402
from services.api.capture_runtime import create_local_capture_runtime  # noqa: E402
from services.api.domain import utc_now  # noqa: E402
from services.api.storage import MemoryStore  # noqa: E402

token = os.environ["LC_WINDOWS_TEST_TOKEN"]
d = json.loads(Path(args.identities).read_text())["display_source"]
expires_at = utc_now() + timedelta(seconds=args.ttl)
registration = {"contract_version": "0.2.1", "device_id": d["device_id"], "session_id": d["session_id"], "stream_id": d["stream_id"],
                "continuity": {"kind": "initial"}, "authorization_generation": 1, "membership_revision": 1}
display = {"contract_version": "0.2.4", "source_id": d["source_id"], "stream_id": d["stream_id"],
           "project_id": d["project_id"], "source_timezone": d["source_timezone"]}
runtime = create_local_capture_runtime(
    store=MemoryStore(), user_id=d["user_id"], device_id=d["device_id"], session_id=d["session_id"],
    producer_id="windows-test-producer", registration=registration, token=token, expires_at=expires_at,
    scopes=frozenset({"process:control", "process:capture", "sources:read", "sources:write"}),
    capabilities=frozenset({"process.control.v0.2.1", "process.capture.v0.2", "process.ingress.v0.2.4", "process.windows-ingress.v0.2.10"}),
    fresh_consent=True, enable_windows_ingress=True, producer_profile="desktop_pixels", clock=utc_now, stop_fact_resolver=None,
)


async def prepare():
    transport = httpx.ASGITransport(app=runtime.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1") as c:
        auth = {"Authorization": "Bearer " + token}
        r = await c.post("/v2/process/streams", json=registration, headers={**auth, "Idempotency-Key": "host-stream-registration"})
        assert r.status_code == 200, r.text
        s = await c.put("/v2/process/display-sources/" + d["source_id"], json=display, headers=auth)
        assert s.status_code == 200, s.text
        return r.json()


stream = asyncio.run(prepare())
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(("127.0.0.1", 0))
sock.listen(128)
server = uvicorn.Server(uvicorn.Config(runtime.app, http="h11", lifespan="off", log_level="warning", access_log=False))


def watch():
    sys.stdin.read()
    server.should_exit = True


threading.Thread(target=watch, daemon=True).start()
print(json.dumps({"ready": True, "base_url": f"http://127.0.0.1:{sock.getsockname()[1]}", "expires_at": expires_at.isoformat(), "stream": stream}), flush=True)
server.run(sockets=[sock])
