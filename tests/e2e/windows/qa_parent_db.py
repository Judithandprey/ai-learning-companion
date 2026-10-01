#!/usr/bin/env python3
"""QA helper for the Windows app-parent pass on the dedicated local test database (lc_p0_test). WSL side only.

  qa_parent_db.py preflight --backend <private copy> --out <json>
  qa_parent_db.py watch     --backend <private copy> --out <jsonl> --stop <file> [--control <dir>]
  qa_parent_db.py readback  --backend <private copy> --actor <id> --run <run out dir> --out <json>
  qa_parent_db.py cleanup   --backend <private copy> --actor <id> --out <json>

It imports only the released Backend's own guards and readers from the private exact-source copy. The DSN is read
from its handoff file into a local variable, passed through dedicated_test_dsn, and never printed, logged, written or
put in argv or the environment; errors are reported by exception type only. Every read is read-only or goes through the
released authorized readers after checking that the actor row exists; readback and cleanup refuse while any process
whose working folder is inside the private copy (a host of this run) is alive. Cleanup deletes only the one proven
actor id and then checks, read-only, that nothing of it remains. Frame and ink bytes are compared by sha256 only.
"""
import argparse
import base64
import hashlib
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from uuid import uuid4

DSN_FILE = "/home/agentsdock/Projects/learning-companion/automation/local-test-postgres/test-database.dsn"
WINDOWS_ROUTE = "/v2/process/windows-frames:batch"


def now():
    return datetime.now(timezone.utc).isoformat()


def own_processes(root):
    """(pid, ppid, start ticks) of processes whose working folder is inside the private copy (this run's hosts)."""
    found = []
    for pid in filter(str.isdigit, os.listdir("/proc")):
        if int(pid) == os.getpid():
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
            with open(f"/proc/{pid}/stat") as f:
                fields = f.read().rsplit(")", 1)[1].split()
        except OSError:
            continue
        if cwd == root or cwd.startswith(root + os.sep):
            found.append((int(pid), int(fields[1]), int(fields[19])))
    return sorted(found)


def backend(root):
    root = os.path.realpath(root)
    if os.path.realpath(os.getcwd()).startswith(root):
        raise SystemExit("the helper must not run inside the private copy (it would count as a host)")
    sys.path.insert(0, root)
    import services
    if not any(os.path.realpath(p).startswith(root) for p in services.__path__):
        raise SystemExit("services is not imported from the private copy")
    return root


def dsn():
    from services.api.tests.postgres_check import dedicated_test_dsn
    with open(DSN_FILE, encoding="utf-8") as f:
        configured = f.read().strip()
    return dedicated_test_dsn(configured)


def write(path, value):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f, indent=1, sort_keys=True)
        f.write("\n")


def preflight(a):
    root = backend(a.backend)
    if own_processes(root):  # a leftover host: this run's watcher would not know whose it is
        print("BLOCKED: a process is already working inside the private Backend copy", file=sys.stderr)
        return 2
    from services.api.tests.postgres_check import verify_test_database
    from services.api.tests.postgres_desktop_runtime_check import verify_pristine_actor
    from services.api.tests.postgres_ingress_http_check import verify_migrations
    actor = "lc-windows-http-" + uuid4().hex
    try:
        d = dsn()
        version = verify_test_database(d)
        migrations = verify_migrations(d)
        verify_pristine_actor(d, actor, windows=True)
    except Exception as error:  # never the message: it could carry connection details
        print(f"BLOCKED: dedicated migrated test database and a pristine actor required ({type(error).__name__})", file=sys.stderr)
        return 2
    write(a.out, {"at": now(), "postgresql": version, "migrations": migrations, "actor": {
        "user_id": actor, "device_id": "windows-qa" + uuid4().hex[:14], "session_id": "learning-qa" + uuid4().hex[:14],
        "producer_id": "windows-app-qa" + uuid4().hex[:14]}, "pristine": True})
    print(json.dumps({"actor": actor, "migrations": len(migrations)}))
    return 0


# The app gives one upload three sends of 60 s each before it reports the send as unanswered (about 182 s).
PAUSE_REQUEST, PAUSE_ACK, MAX_PAUSE_S = "host-pause.request", "host-pause.ack", 260


def proc_state(pid):
    try:
        with open(f"/proc/{pid}/stat") as f:
            return f.read().rsplit(")", 1)[1].split()[0]
    except OSError:
        return None


def watch(a):
    """Host appear/exit events (pid, ppid, start ticks, UTC) for processes working inside the private copy.

    With --control <dir>: while <dir>/host-pause.request exists, every host of this run is paused with SIGSTOP, so a send
    gets no answer; removing the request resumes them with SIGCONT. Only a process that appeared after this watcher
    started, whose working folder is inside the private copy at that moment, is signalled (anything already there at the
    start is never touched), and it is resumed only while its start ticks are unchanged (never a reused PID). A pause
    never lasts longer than MAX_PAUSE_S and is undone when the watcher ends, also on SIGTERM/SIGHUP. Only a SIGKILL of
    the watcher cannot undo it: the paused PID is in the log and is then continued by hand, by that exact PID.
    """
    root = os.path.realpath(a.backend)
    for number in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(number, lambda *_: sys.exit(143))  # main() re-raises SystemExit, so the finally below runs
    baseline = {(p[0], p[2]) for p in own_processes(root)}  # not started under this watcher: never signalled
    seen = {}
    paused = {}  # pid -> start ticks
    paused_at = None
    spent = False  # a request that reached the pause limit pauses nothing again until it is removed
    deadline = time.monotonic() + 3600
    request = os.path.join(a.control, PAUSE_REQUEST) if a.control else None
    ack = os.path.join(a.control, PAUSE_ACK) if a.control else None
    with open(a.out, "a", encoding="utf-8") as log:
        def say(event):
            log.write(json.dumps({**event, "at": now()}) + "\n")
            log.flush()

        def resume(reason):
            nonlocal paused_at
            done = []
            for pid, ticks in sorted(paused.items()):
                same = [p for p in own_processes(root) if p[0] == pid and p[2] == ticks]
                try:
                    if same:
                        os.kill(pid, signal.SIGCONT)
                    done.append({"pid": pid, "continued": bool(same), "state_after": proc_state(pid)})
                except ProcessLookupError:
                    done.append({"pid": pid, "continued": False, "gone": True})
            paused.clear()
            paused_at = None
            say({"event": "resumed", "reason": reason, "hosts": done})

        say({"event": "watch_start", "monotonic": time.monotonic(), "already_there": sorted(p for p, _ in baseline)})
        try:
            while not os.path.exists(a.stop) and time.monotonic() < deadline:
                current = {p[0]: p for p in own_processes(root)}
                for pid, p in current.items():
                    if pid not in seen:
                        log.write(json.dumps({"event": "appear", "pid": pid, "ppid": p[1], "start_ticks": p[2], "at": now()}) + "\n")
                for pid in set(seen) - set(current):
                    log.write(json.dumps({"event": "exit", "pid": pid, "at": now()}) + "\n")
                seen = current
                want = bool(request) and os.path.exists(request)
                if want and paused_at is None and not spent:
                    hosts = []
                    for pid, p in sorted(current.items()):
                        if (pid, p[2]) in baseline:
                            continue
                        before = proc_state(pid)
                        paused[pid] = p[2]  # recorded first: an interruption after the signal still resumes it
                        try:
                            os.kill(pid, signal.SIGSTOP)
                            hosts.append({"pid": pid, "state_before": before})
                        except ProcessLookupError:
                            del paused[pid]
                    paused_at = time.monotonic()
                    time.sleep(0.05)
                    for h in hosts:
                        h["state_after"] = proc_state(h["pid"])
                    say({"event": "paused", "hosts": hosts})
                    try:
                        with open(ack + ".tmp", "w", encoding="utf-8") as f:
                            json.dump({"at": now(), "hosts": hosts}, f)
                        os.replace(ack + ".tmp", ack)  # the runner never reads a half-written answer
                    except OSError as error:
                        say({"event": "ack_error", "error": type(error).__name__})
                elif paused_at is not None and not want:
                    resume("the request was removed")
                elif paused_at is not None and time.monotonic() - paused_at > MAX_PAUSE_S:
                    resume(f"the {MAX_PAUSE_S} s pause limit was reached")
                    spent = True
                if not want:
                    spent = False
                if ack and paused_at is None and os.path.exists(ack):
                    try:
                        os.remove(ack)  # tried again at the next turn if Windows holds the file
                    except OSError as error:
                        say({"event": "ack_error", "error": type(error).__name__})
                log.flush()
                time.sleep(0.2)
        finally:
            if paused:
                resume("the watcher ended")
            log.write(json.dumps({"event": "watch_end", "at": now(), "remaining": sorted(seen)}) + "\n")
    return 0


def documents(d, actor):
    from services.api.tests.postgres_ingress_http_check import _readonly
    with _readonly(d) as connection:
        row = connection.execute("SELECT EXISTS (SELECT 1 FROM lc_backend.actors WHERE user_id = %s)", (actor,)).fetchone()[0]
        docs = connection.execute(
            "SELECT kind, doc_key, payload, created_at FROM lc_backend.documents WHERE user_id = %s ORDER BY created_at, kind, doc_key",
            (actor,)).fetchall()
    return row, docs


def readback(a):
    root = backend(a.backend)
    if own_processes(root):
        print("BLOCKED: a host of this run is still alive", file=sys.stderr)
        return 3
    from services.api.domain import key
    from services.api.image_resolver import AuthorizedImageResolver
    from services.api.original_artifacts import OriginalArtifacts
    from services.api.process_context import AuthorizedProcessContextReader
    from services.api.storage import PostgresStore
    from services.api.tests.postgres_ingress_http_check import _digest
    d = dsn()
    actor = a.actor
    exists, docs = documents(d, actor)
    facts = {"actor_row": exists, "by_kind": {}, "documents": []}
    for kind, doc_key, payload, created in docs:
        facts["by_kind"][kind] = facts["by_kind"].get(kind, 0) + 1
        entry = {"kind": kind, "key": doc_key, "created_at": created.astimezone(timezone.utc).isoformat(), "digest": _digest(payload)}
        if kind == "artifact":
            data = base64.b64decode(payload.get("data_base64") or "")
            entry["artifact"] = {"id": payload.get("id"), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        elif kind == "control_stream":
            entry["stream"] = {"state": payload.get("state", {}).get("state"), "revision": payload.get("state", {}).get("revision"),
                               "pre_stop_sequence": payload.get("state", {}).get("pre_stop_sequence")}
        elif kind == "capture_record":
            try:
                stored = json.loads(payload["canonical_json"])  # {device_id, record, session_id, stream_id}
                record = stored["record"]
                entry["record"] = {"stream_id": stored.get("stream_id"), "record_id": record["record_id"], "sequence": record["sequence"], "frame_id": record["frame_id"],
                                   "source": record["source"], "artifacts": [x["artifact_id"] for x in record["artifacts"]],
                                   "received_at": payload.get("received_at")}
            except Exception as error:
                entry["record"] = {"unreadable": type(error).__name__}
        elif kind == "capture_replay":
            entry["replay"] = {"key": payload.get("key"), "response_sha256": hashlib.sha256((payload.get("response_json") or "").encode()).hexdigest()}
        facts["documents"].append(entry)
    out = {"at": now(), "actor": actor, "database": facts, "streams": []}
    if not exists:
        write(a.out, out)
        return 0

    def guard(state):
        from services.api.errors import DomainError
        if state.get("enabled") is not True or state.get("generation") != 1:
            raise DomainError(403, "forbidden")

    store = PostgresStore(d)
    reader = AuthorizedProcessContextReader(store, actor, guard)
    images = AuthorizedImageResolver(store, actor, guard)
    originals = OriginalArtifacts(store, guard)
    record = json.load(open(os.path.join(a.run, "capture-host", "coordination.json"), encoding="utf-8"))
    local = lambda cap, rel: os.path.join(a.run, "captures", cap, rel)
    replays = {e["replay"]["key"]: e for e in facts["documents"] if e["kind"] == "capture_replay"}
    for stream in record["streams"]:
        s = {"stream_id": stream["stream_id"], "source_id": stream["source_id"], "final": stream["final"], "grant": stream["grant"],
             "jobs": [], "records_read": 0, "frames_compared": 0, "mismatches": []}
        # The records the server holds for this stream's source, in sequence order (a job may cover fewer records than lines).
        held = sorted((e["record"]["sequence"], e["record"]["record_id"]) for e in facts["documents"]
                      if e["kind"] == "capture_record" and "record_id" in e.get("record", {}) and e["record"]["source"]["source_id"] == stream["source_id"])
        ids = [rid for _, rid in held]
        s["server_records"] = len(ids)
        for start in range(0, len(ids), 100):
            chunk = ids[start:start + 100]
            try:
                got = reader.read_windows(chunk)
            except Exception as error:
                s["mismatches"].append({"read": chunk[0], "error": type(error).__name__, "status": getattr(error, "status", None)})
                continue
            s["records_read"] += len(got["batch"]["records"])
            for frame in got["frames"]:
                for role in ("raw", "composed"):
                    picture = frame["raw"] if role == "raw" else (frame.get("composed") or {}).get("image")
                    if picture is None:
                        continue
                    r = images.resolve_windows(frame, image_role=role, max_bytes=32 << 20)
                    server = hashlib.sha256(r["data"]).hexdigest() if r.get("status") == "available" else None
                    local = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(a.run, "captures")) for f in fs if f == picture["artifact"]["sha256"] + ".png"]
                    local_sha = hashlib.sha256(open(local[0], "rb").read()).hexdigest() if local else None
                    s["frames_compared"] += 1
                    if not (server == picture["artifact"]["sha256"] == local_sha):
                        s["mismatches"].append({"frame": frame["frame_id"], "role": role, "status": r.get("status"), "local": bool(local)})
        for job in stream["jobs"]:
            replay = replays.get(key("POST", WINDOWS_ROUTE, job["key"]))
            j = {"key": job["key"], "status": job["status"], "from": job["from"], "through": job["through"], "records": job["records"],
                 "server_receipt": bool(replay), "receipt_created_at": replay["created_at"] if replay else None, "ink_originals": []}
            for artifact_id in job.get("originals") or []:
                if ".ink." not in artifact_id:
                    continue
                sha = artifact_id.rsplit(".ink.", 1)[1]
                try:
                    got = originals.read(actor, {"user_id": actor, "source_id": stream["source_id"], "source_version": 1}, artifact_id, check_retained=True)
                    data = base64.b64decode(got["data_base64"])
                    server = hashlib.sha256(data).hexdigest()
                except Exception as error:
                    server = f"error:{type(error).__name__}"
                local_files = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(a.run, "captures")) for f in fs if f == sha + ".json"]
                local_sha = hashlib.sha256(open(local_files[0], "rb").read()).hexdigest() if local_files else None
                j["ink_originals"].append({"artifact_id": artifact_id, "server_sha256": server, "local_sha256": local_sha})
            s["jobs"].append(j)
        out["streams"].append(s)
    exists_after, docs_after = documents(d, actor)
    out["database_unchanged_by_readback"] = exists_after and [(k, dk, _digest(p), c) for k, dk, p, c in docs_after] == [(k, dk, _digest(p), c) for k, dk, p, c in docs]
    write(a.out, out)
    return 0


def cleanup(a):
    root = backend(a.backend)
    from services.api.tests.postgres_check import cleanup as delete
    from services.api.tests.postgres_desktop_runtime_check import _actor
    _actor(a.actor, windows=True)
    # Only this run's proven actor: the preflight's pristine actor, the seeded record and the app's record must all name it.
    pre = json.load(open(os.path.join(a.run, "preflight.json"), encoding="utf-8"))["actor"]["user_id"]
    rec = json.load(open(os.path.join(a.run, "capture-host", "coordination.json"), encoding="utf-8"))["actor"]["user_id"]
    seed = json.load(open(os.path.join(a.run, "out", "results.json"), encoding="utf-8-sig"))["values"]["seed"]["user_id"]
    if not a.actor == pre == rec == seed:
        write(a.out, {"at": now(), "cleanup": "withheld: the actor is not this run's proven actor"})
        return 4
    remaining = own_processes(root)
    if remaining:
        write(a.out, {"at": now(), "cleanup": "withheld: a host of this run remains", "remaining": remaining})
        return 3
    d = dsn()
    row, docs = documents(d, a.actor)
    delete(d, [a.actor])
    row_after, docs_after = documents(d, a.actor)
    write(a.out, {"at": now(), "cleanup": "this run's proven actor only", "before": {"actor_row": row, "documents": len(docs)},
                  "after": {"actor_row": row_after, "documents": len(docs_after)}})
    return 0 if not row_after and not docs_after else 1


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["preflight", "watch", "readback", "cleanup"])
    p.add_argument("--backend", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--actor")
    p.add_argument("--run")
    p.add_argument("--stop")
    p.add_argument("--control")
    a = p.parse_args()
    try:
        return {"preflight": preflight, "watch": watch, "readback": readback, "cleanup": cleanup}[a.command](a)
    except SystemExit:
        raise
    except Exception as error:  # the type only: a database message could carry connection details
        print(f"FAILED ({type(error).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
