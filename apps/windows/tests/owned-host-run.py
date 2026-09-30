"""The owned run of the Windows app's development capture link on the dedicated test database, through the released
foreground host (services.api.desktop_local) with its real PostgreSQL store. Test-only; run by hand, never by default.

  python tests/owned-host-run.py --backend <private copy of the released Backend> --dsn-file <test-database.dsn>
      --node <node> --evidence <folder>

It uses the Backend's own guards: the DSN must name lc_p0_test at one local endpoint (dedicated_test_dsn), the
database and its migrations are checked read-only, and every actor is a new lc-windows-http-<32 hex> checked absent
first (verify_pristine_actor). Then the Node flow (tests/owned-host-flow.test.ts) runs with those actors. Afterwards:
no host process of this run may remain (processes whose working folder is the private Backend copy); only then are
this run's actors deleted (cleanup), and never otherwise. The DSN is read from its file and passed to the flow only
as that file's path; it is never printed, logged or written. The evidence is facts only (kinds and counts of each
actor's documents, read-only, before cleanup).
"""
import argparse
import json
import os
import subprocess
import sys
from uuid import uuid4

SCENARIOS = ["app", "lost-answer", "lost-host", "restart", "service-stop"]


def own_processes(root):
    """PIDs whose working folder is inside the private Backend copy (this run's hosts)."""
    found = []
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            continue
        if cwd == root or cwd.startswith(root + os.sep):
            found.append(int(pid))
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--backend", required=True)
    p.add_argument("--dsn-file", required=True)
    p.add_argument("--node", required=True)
    p.add_argument("--evidence", required=True)
    a = p.parse_args()
    root = os.path.realpath(a.backend)
    sys.path.insert(0, root)
    from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
    from services.api.tests.postgres_desktop_runtime_check import verify_pristine_actor
    from services.api.tests.postgres_ingress_http_check import _documents, verify_migrations

    with open(a.dsn_file, encoding="utf-8") as f:
        configured = f.read().strip()
    actors = {name: "lc-windows-http-" + uuid4().hex for name in SCENARIOS}
    try:
        dsn = dedicated_test_dsn(configured)
        version = verify_test_database(dsn)
        migrations = verify_migrations(dsn)
        for actor in actors.values():
            verify_pristine_actor(dsn, actor, windows=True)
    except Exception as error:
        print(f"BLOCKED: dedicated migrated database and pristine actors required ({type(error).__name__})", file=sys.stderr)
        return 2
    os.makedirs(a.evidence, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith(("LC_TEST_DATABASE_URL", "LC_DATABASE_URL", "LC_HTTP_CHECK_CONFIG"))}
    env["LC_OWNED_RUN"] = json.dumps({"actors": actors, "dsn_file": os.path.realpath(a.dsn_file), "backend": root,
                                      "python": sys.executable, "evidence": os.path.realpath(a.evidence)})
    here = os.path.dirname(os.path.realpath(__file__))
    flow = subprocess.run([a.node, "--test", "--test-timeout=300000", "--test-concurrency=1", os.path.join(here, "owned-host-flow.test.ts")],
                          cwd=os.path.dirname(here), env=env, capture_output=True, text=True, timeout=1800)
    summary = [line for line in flow.stdout.splitlines() if line.startswith(("✔", "✖", "ℹ", "﹣", "  ✔", "  ✖"))]
    remaining = own_processes(root)
    facts = {}
    for name, actor in actors.items():
        kinds = {}
        for kind, _key, _payload in _documents(dsn, actor):
            kinds[kind] = kinds.get(kind, 0) + 1
        facts[name] = {"actor": actor, "documents_by_kind": dict(sorted(kinds.items()))}
    cleaned = False
    if not remaining:
        cleanup(dsn, list(actors.values()))
        cleaned = all(not _documents(dsn, actor) for actor in actors.values())
    result = {"flow_exit": flow.returncode, "flow_summary": summary, "postgresql": version, "migrations": migrations,
              "owned_processes_left": remaining, "database_facts_before_cleanup": facts,
              "cleanup": "this run's actors only, completed" if cleaned else "withheld: a host process of this run remains" if remaining else "incomplete",
              "provider": "not activated", "ai": "not connected"}
    with open(os.path.join(a.evidence, "owned-run.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, sort_keys=True)
        f.write("\n")
    if flow.returncode != 0:
        sys.stderr.write(flow.stdout[-6000:])
        sys.stderr.write(flow.stderr[-3000:])
    print(("PASS " if flow.returncode == 0 and cleaned else "FAILED ") + json.dumps({k: result[k] for k in ("flow_exit", "owned_processes_left", "cleanup")}))
    return 0 if flow.returncode == 0 and cleaned else 1


if __name__ == "__main__":
    raise SystemExit(main())
