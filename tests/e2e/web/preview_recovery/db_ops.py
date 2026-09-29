"""Scoped operations for the QA preview-recovery check: verify the dedicated test database,
read this check's own actor, read a saved item directly from the API (bypassing the relay),
and remove only this check's actor. Never migrates, resets or restarts the database.

Usage: QA_SOURCE=<exact source copy> python db_ops.py verify|inventory|keys|cleanup <actor>
       ... python db_ops.py readback <note_id> <api_port>   (token on stdin)
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.environ["QA_SOURCE"])
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database  # noqa: E402

DSN_FILE = Path("/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn")
ACTOR = re.compile(r"qachk-[0-9a-f]{8}-user")
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")

try:
    dsn = dedicated_test_dsn(DSN_FILE.read_text().strip())
    version = verify_test_database(dsn)
    mode = sys.argv[1]
    if mode == "verify":
        print(json.dumps({"database": "lc_p0_test", "version": version, "verified_actual_target": True}))
    elif mode == "readback":
        import httpx
        note_id, port = sys.argv[2], int(sys.argv[3])
        assert IDENTIFIER.fullmatch(note_id) and port in (8175,)
        token = sys.stdin.read().strip()
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=10) as client:
            response = client.get("/preview/v1/saves/" + note_id, headers={"Authorization": "Bearer " + token})
        print(json.dumps({"status": response.status_code, "body": response.json()}))
    else:
        import psycopg
        actor = sys.argv[2]
        if not ACTOR.fullmatch(actor):
            raise ValueError("not this check's actor shape")
        with psycopg.connect(dsn) as connection:
            if mode == "inventory":
                rows = connection.execute("SELECT kind, count(*) FROM lc_backend.documents WHERE user_id = %s GROUP BY kind ORDER BY kind", (actor,)).fetchall()
                print(json.dumps(dict(rows)))
            elif mode == "keys":
                rows = connection.execute("SELECT kind, doc_key FROM lc_backend.documents WHERE user_id = %s AND kind IN ('note', 'preview_save', 'note_revision') ORDER BY kind, doc_key", (actor,)).fetchall()
                print(json.dumps([list(r) for r in rows]))
            elif mode == "cleanup":
                pass
            else:
                raise ValueError("unknown operation")
        if mode == "cleanup":
            cleanup(dsn, [actor])
            with psycopg.connect(dsn) as connection:
                documents = connection.execute("SELECT count(*) FROM lc_backend.documents WHERE user_id = %s", (actor,)).fetchone()[0]
                actors = connection.execute("SELECT count(*) FROM lc_backend.actors WHERE user_id = %s", (actor,)).fetchone()[0]
            assert documents == actors == 0
            print(json.dumps({"own_actor_removed": True, "remaining_documents": documents, "remaining_actors": actors}))
except Exception as exc:  # never print the DSN
    print("BLOCKED/FAILED: scoped PostgreSQL operation (" + type(exc).__name__ + ": " + str(exc)[:120] + ")", file=sys.stderr)
    raise SystemExit(1)
