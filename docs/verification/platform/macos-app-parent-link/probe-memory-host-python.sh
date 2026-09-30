#!/bin/sh
# LINUX-HARNESS-ONLY: the actual services.api.desktop_local main(), with its PostgresStore replaced by one
# in-process MemoryStore (as services/api/tests/test_desktop_local.py does). Not PostgreSQL; not a Mac.
[ "$1 $2" = "-m services.api.desktop_local" ] && [ $# -eq 2 ] || exit 64
exec /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -u -c '
import services.api.desktop_local as host
from services.api.storage import MemoryStore
store = MemoryStore()
host.PostgresStore = lambda dsn: store
raise SystemExit(host.main())
'
