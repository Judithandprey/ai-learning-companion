"""Test-only: a stand-in host that gives a valid READY naming a port nothing listens on, then ends at once. Copied
into the private Backend copy as lc_test_brief_host.py; used to check the supervisor closes its input then too."""
import json
import os
import sys
import time

sys.stdin.buffer.readline()
os.write(1, (json.dumps({"format": "lc-desktop-capture-host-ready-v1", "status": "ready",
                         "origin": "http://127.0.0.1:9", "start_status": "pending"}) + "\n").encode())
time.sleep(0.2)
