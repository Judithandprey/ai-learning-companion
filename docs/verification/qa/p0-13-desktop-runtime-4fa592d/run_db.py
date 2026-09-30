"""QA wrapper: private DSN, one runner main, then a read-only post-cleanup actor check. Never prints the DSN."""
import contextlib, io, json, os, sys
from pathlib import Path
which = sys.argv[1]
os.environ["LC_TEST_DATABASE_URL"] = Path(
    "/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn").read_text().strip()
from services.api.tests.postgres_check import dedicated_test_dsn
from services.api.tests.postgres_ingress_http_check import _readonly, main
from services.api.tests import postgres_desktop_runtime_check as backend_runner
if which == "qa":
    import tests.e2e.qa_desktop_runtime_postgres as qa
    backend_runner.run_desktop_checks = qa.run_qa_regression
elif which != "author":
    raise SystemExit("usage: run_db.py author|qa")

class Tee(io.TextIOBase):
    def __init__(self): self.lines = []
    def write(self, s): sys.__stdout__.write(s); sys.__stdout__.flush(); self.lines.append(s); return len(s)
tee = Tee()
with contextlib.redirect_stdout(tee):
    code = main(desktop_runtime=True)
print(f"RUNNER_EXIT {which} {code}", flush=True)
passed = [l for l in "".join(tee.lines).splitlines() if l.startswith("PASS ")]
if passed:
    actor = json.loads(passed[-1][5:])["actor"]
    with _readonly(dedicated_test_dsn(os.environ["LC_TEST_DATABASE_URL"])) as connection:
        documents, actors = connection.execute(
            "SELECT (SELECT count(*) FROM lc_backend.documents WHERE user_id = %s), "
            "(SELECT count(*) FROM lc_backend.actors WHERE user_id = %s)", (actor, actor)).fetchone()
    print(f"POST_CLEANUP_READONLY actor={actor} documents={documents} actors={actors}", flush=True)
raise SystemExit(code)
