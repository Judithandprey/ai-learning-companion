"""Test-only: a stand-in host that gives a valid READY and answers, but does not end at the end of its input
(it ends on SIGTERM). Copied into the private Backend copy as lc_test_stubborn_host.py; used only to check that the
supervisor then kills this child alone and says the host did not end by itself."""
import json
import os
import signal
import socket
import sys
import threading

sys.stdin.buffer.readline()
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
sock.listen(4)
port = sock.getsockname()[1]
os.write(1, (json.dumps({"format": "lc-desktop-capture-host-ready-v1", "status": "ready",
                         "origin": f"http://127.0.0.1:{port}", "start_status": "pending"}) + "\n").encode())


def serve():
    while True:
        conn, _ = sock.accept()
        conn.recv(65536)
        conn.sendall(b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
        conn.close()


threading.Thread(target=serve, daemon=True).start()
signal.signal(signal.SIGTERM, lambda *_: os._exit(0))
sys.stdin.buffer.read()  # end of input is ignored
threading.Event().wait()
