"""Disposable stdlib transport probe. Never imports the product host or a DB.

One synthetic UTF-8/LF record on a private FIFO; one readiness record on stdout.
The internal 12-second deadline is a failsafe for this owned process only.
"""

import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import signal
import socket
import stat
import sys
import threading


def emit_error(error):
    try:
        os.write(2, json.dumps({"probe_error": error}).encode("ascii") + b"\n")
    except OSError:
        pass


def deadline():
    emit_error("probe_deadline")
    os._exit(70)


def main():
    timer = threading.Timer(12, deadline)
    timer.daemon = True
    timer.start()
    server = None
    stopped = threading.Event()
    reason = [None]
    try:
        fd = sys.stdin.fileno()
        is_fifo = stat.S_ISFIFO(os.fstat(fd).st_mode)
        if not is_fifo or os.isatty(fd) or sys.argv[1:]:
            raise ValueError("not_private_fifo")
        raw = bytearray()
        while b"\n" not in raw:
            part = os.read(fd, 4096)
            if not part:
                raise ValueError("incomplete_record")
            raw.extend(part)
            if len(raw) > 65536:
                raise ValueError("oversized_record")
        if raw.index(b"\n") != len(raw) - 1:
            raise ValueError("unexpected_input")
        record = json.loads(raw.decode("utf-8"))
        if (set(record) != {"format", "probe_id", "text", "mode"}
                or record["format"] != "support-pipe-probe-v1"
                or record["text"] != "Synthetic only: α中文🙂"
                or record["mode"] not in {"normal", "ignore_eof"}):
            raise ValueError("invalid_synthetic_record")
        digest = hashlib.sha256(raw).hexdigest()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                expected_host = f"127.0.0.1:{self.server.server_port}"
                if (self.path != "/support-probe/" + record["probe_id"]
                        or self.headers.get("Host") != expected_host
                        or self.headers.get("Origin") is not None
                        or any(name.lower().startswith("sec-fetch-") for name in self.headers)):
                    self.send_error(403)
                    return
                body = json.dumps({"probe_id": record["probe_id"], "input_sha256": digest}).encode("ascii")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        server = HTTPServer(("127.0.0.1", 0), Handler, bind_and_activate=False)
        server.allow_reuse_address = False
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        server.server_bind()
        server.server_activate()
        server.timeout = 0.05

        def read_lifetime():
            try:
                extra = os.read(fd, 4096)
                if extra:
                    reason[0] = "unexpected_input"
                elif record["mode"] == "ignore_eof":
                    return
                else:
                    reason[0] = "eof"
                stopped.set()
            except OSError:
                reason[0] = "parent_input_lost"
                stopped.set()

        def on_signal(_signal, _frame):
            reason[0] = "signal_handler"
            stopped.set()

        signal.signal(signal.SIGTERM, on_signal)
        threading.Thread(target=read_lifetime, daemon=True).start()
        ready = {
            "format": "support-pipe-ready-v1", "origin": f"http://127.0.0.1:{server.server_port}",
            "probe_id": record["probe_id"], "input_sha256": digest, "input_bytes": len(raw),
            "stdin_is_fifo": is_fifo, "stdin_is_tty": os.isatty(fd),
            "python_platform": sys.platform, "python_version": sys.version.split()[0],
            "python_executable": sys.executable, "pid": os.getpid(), "cwd": os.getcwd(),
        }
        os.write(1, json.dumps(ready, ensure_ascii=True).encode("ascii") + b"\n")
        while not stopped.is_set():
            server.handle_request()
        if reason[0] != "eof":
            raise ValueError(reason[0] or "unknown_stop")
        emit_error("normal_eof")
        return 0
    except (ValueError, OSError):
        # The probe contains no secrets; still never echo the supplied record.
        emit_error(reason[0] or "invalid_startup")
        return 2
    finally:
        if server is not None:
            server.server_close()
        timer.cancel()


if __name__ == "__main__":
    raise SystemExit(main())
