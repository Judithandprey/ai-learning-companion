"""The owned run of the Windows app's development capture link on the dedicated test database, through the released
foreground host (services.api.desktop_local) with its real PostgreSQL store. Test-only; run by hand, never by default.

  python tests/owned-host-run.py --backend <private copy of the released Backend> --dsn-file <test-database.dsn>
      --node <node> --evidence <folder> [--windows-electron <Windows path of electron.exe>]

With --windows-electron, the flow runs on Windows instead (Electron run as Node, no window) from a copy staged in the
Windows temporary folder: the app's host is then launched through wsl.exe into this WSL distribution (the development
route), and the DSN file is read through \\wsl.localhost. Only the cases that need no /proc run there.

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


def run_on_windows(a, here, root, actors):
    """Stages apps/windows (source, tests, fixtures) in the Windows temporary folder and runs the flow there."""
    import shutil

    def copy_bytes(src, dst):
        # Bytes only: file metadata cannot be set on the Windows drive mount (EPERM).
        for folder, _dirs, files in os.walk(src):
            target = os.path.join(dst, os.path.relpath(folder, src))
            os.makedirs(target, exist_ok=True)
            for name in files:
                with open(os.path.join(folder, name), "rb") as fin, open(os.path.join(target, name), "wb") as fout:
                    fout.write(fin.read())

    win_temp = subprocess.run(["cmd.exe", "/c", "echo %TEMP%"], cwd="/mnt/c", capture_output=True, text=True).stdout.strip()
    stage = os.path.join(subprocess.run(["wslpath", "-u", win_temp], capture_output=True, text=True).stdout.strip(), "lc-web-owned-win")
    shutil.rmtree(stage, ignore_errors=True)
    app = os.path.dirname(here)
    repo = os.path.dirname(os.path.dirname(app))
    for d in ("src", "tests", "scripts"):
        copy_bytes(os.path.join(app, d), os.path.join(stage, "apps", "windows", d))
    for f in ("package.json", "tsconfig.json"):
        copy_bytes_file = os.path.join(stage, "apps", "windows", f)
        with open(os.path.join(app, f), "rb") as fin, open(copy_bytes_file, "wb") as fout:
            fout.write(fin.read())
    copy_bytes(os.path.join(repo, "apps", "safari-extension", "src"), os.path.join(stage, "apps", "safari-extension", "src"))
    copy_bytes(os.path.join(repo, "docs", "verification", "web", "evidence", "windows-frame-ingress"),
               os.path.join(stage, "docs", "verification", "web", "evidence", "windows-frame-ingress"))
    evidence = os.path.join(stage, "evidence")
    os.makedirs(evidence)
    to_win = lambda p: subprocess.run(["wslpath", "-w", p], capture_output=True, text=True).stdout.strip()
    distro = os.environ.get("WSL_DISTRO_NAME", "Ubuntu")
    spec = {"actors": actors, "dsn_file": to_win(os.path.realpath(a.dsn_file)), "backend": root, "python": sys.executable,
            "evidence": to_win(evidence), "wsl": {"distribution": distro, "user": os.environ.get("USER", "agentsdock")}}
    with open(os.path.join(stage, "run.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f)
    ps = ("$env:ELECTRON_RUN_AS_NODE='1'; $env:LC_OWNED_RUN_FILE=" + "'" + to_win(os.path.join(stage, "run.json")) + "'; "
          "Set-Location '" + to_win(os.path.join(stage, "apps", "windows")) + "'; "
          "& '" + a.windows_electron + "' --test --test-timeout=300000 --test-concurrency=1 tests\\owned-host-flow.test.ts; exit $LASTEXITCODE")
    flow = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps], cwd="/mnt/c", capture_output=True, text=True, timeout=1800)
    flow.stdout = flow.stdout.replace("\r", "")
    out = os.path.join(a.evidence, "windows")
    os.makedirs(out, exist_ok=True)
    for name in os.listdir(evidence):
        with open(os.path.join(evidence, name), "rb") as fin, open(os.path.join(out, name), "wb") as fout:
            fout.write(fin.read())
    shutil.rmtree(stage, ignore_errors=True)
    return flow


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--backend", required=True)
    p.add_argument("--dsn-file", required=True)
    p.add_argument("--node", required=True)
    p.add_argument("--evidence", required=True)
    p.add_argument("--windows-electron")
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
    if a.windows_electron:
        flow = run_on_windows(a, here, root, actors)
    else:
        flow = subprocess.run([a.node, "--test", "--test-timeout=300000", "--test-concurrency=1", os.path.join(here, "owned-host-flow.test.ts")],
                              cwd=os.path.dirname(here), env=env, capture_output=True, text=True, timeout=1800)
    summary = [line for line in flow.stdout.splitlines() if line.startswith(("✔", "✖", "ℹ", "﹣", "  ✔", "  ✖"))]
    # Passed only if the runner says so: no failure, and at least one case passed (an exit code alone is not trusted).
    passed_cases = next((int(line.split()[-1]) for line in summary if line.startswith("ℹ pass ")), 0)
    failed_cases = next((int(line.split()[-1]) for line in summary if line.startswith("ℹ fail ")), 1)
    flow_ok = flow.returncode == 0 and failed_cases == 0 and passed_cases > 0
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
    result["runtime"] = "windows (Electron run as Node), host through wsl.exe" if a.windows_electron else "wsl/linux"
    with open(os.path.join(a.evidence, "owned-run-windows.json" if a.windows_electron else "owned-run.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, sort_keys=True)
        f.write("\n")
    if not flow_ok:
        sys.stderr.write(flow.stdout[-6000:])
        sys.stderr.write(flow.stderr[-3000:])
    print(("PASS " if flow_ok and cleaned else "FAILED ") + json.dumps({k: result[k] for k in ("flow_exit", "owned_processes_left", "cleanup")} | {"cases_passed": passed_cases, "cases_failed": failed_cases}))
    return 0 if flow_ok and cleaned else 1


if __name__ == "__main__":
    raise SystemExit(main())
