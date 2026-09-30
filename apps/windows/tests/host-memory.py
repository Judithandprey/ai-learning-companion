"""Test-only: the released foreground host (services.api.desktop_local) exactly, with an in-memory store in place of
PostgreSQL. It is copied into a private copy of the Backend as lc_test_memory_host.py and run as
`python -m lc_test_memory_host`. Its startup record, READY, Host/Origin guard, routes and lifetime are the released
code's; only the store differs. When the DSN's host is an existing directory (a test's private folder), the store's
documents are kept there between host processes (a pickle written after each committed transaction), so a relaunch
or an app restart sees the same state; otherwise nothing persists past this process.
"""
from contextlib import contextmanager
import json
import os
import pickle
import re
import time

from services.api import desktop_local
from services.api.storage import MemoryStore


class _Kept(MemoryStore):
    def __init__(self, path):
        super().__init__()
        self._path = path
        if path and os.path.exists(path):
            with open(path, "rb") as f:
                self._documents = pickle.load(f)

    @contextmanager
    def transaction(self, user_id):
        with super().transaction(user_id) as tx:
            yield tx
        if self._path:
            tmp = self._path + ".tmp"
            with open(tmp, "wb") as f:
                pickle.dump(self._documents, f)
            os.replace(tmp, self._path)


def _store(dsn):
    m = re.search(r"host='?([^' ]+)'?", dsn)
    folder = m.group(1) if m else ""
    return _Kept(os.path.join(folder, "memory-store.pickle") if folder.startswith("/") and os.path.isdir(folder) else None)


def _folder(dsn):
    m = re.search(r"host='?([^' ]+)'?", dsn)
    folder = m.group(1) if m else ""
    return folder if folder.startswith("/") and os.path.isdir(folder) else None


_parse = desktop_local.parse_startup


def _observed_parse(raw):
    """The released parser; then, in the test's private folder only: each startup's consent and stream are appended
    to startups.jsonl (never the token or DSN), and a file `slow` holding seconds delays the start before READY."""
    config = _parse(raw)
    folder = _folder(config["database_dsn"])
    if folder:
        with open(os.path.join(folder, "startups.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps({"fresh_consent": config["fresh_consent"], "stream_id": config["registration"]["stream_id"]}) + "\n")
        slow = os.path.join(folder, "slow")
        if os.path.exists(slow):
            with open(slow, encoding="utf-8") as f:
                time.sleep(float(f.read().strip() or "0"))
    return config


desktop_local.parse_startup = _observed_parse
desktop_local.PostgresStore = _store
raise SystemExit(desktop_local.main())
