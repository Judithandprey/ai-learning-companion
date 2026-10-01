#!/usr/bin/env python3
"""Read-only process watch for the subscription-connector runs (WSL side). It signals and ends nothing.

  qa_sub_watch.py --root <folder> --out <jsonl> --stop <file>

Logs when a process whose working folder is inside <root> appears and exits (the connector, or QA's fake bridge: the app
starts either with `--cd <root>`), and the same for every descendant of such a process (the official Codex app server the
real connector starts runs in its own empty work folder, so it is found as a child, not by its folder). Each entry holds
the pid, the parent pid, the start ticks and the program's short name from /proc; no command line, no environment.
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def snapshot(root):
    """pid -> (ppid, start ticks, name, in_root) for every readable process."""
    procs = {}
    for pid in filter(str.isdigit, os.listdir("/proc")):
        if int(pid) == os.getpid():
            continue
        try:
            with open(f"/proc/{pid}/stat") as f:
                text = f.read()
            name = text[text.index("(") + 1:text.rindex(")")]
            fields = text.rsplit(")", 1)[1].split()
            try:
                cwd = os.readlink(f"/proc/{pid}/cwd")
            except OSError:
                cwd = ""
        except (OSError, ValueError):
            continue
        procs[int(pid)] = (int(fields[1]), int(fields[19]), name, cwd == root or cwd.startswith(root + os.sep))
    return procs


def owned(procs, tracked=()):
    """The processes in the root, those already tracked that still live, and all their descendants.

    Returns (pid, start ticks) -> (ppid, name, role). A descendant stays tracked after its parent has gone."""
    mine = {(pid, p[1]): (p[0], p[2], "in_root") for pid, p in procs.items() if p[3]}
    for pid, ticks in tracked:
        if pid in procs and procs[pid][1] == ticks and (pid, ticks) not in mine:
            mine[(pid, ticks)] = (procs[pid][0], procs[pid][2], "descendant")
    grew = True
    while grew:
        grew = False
        pids = {pid for pid, _ in mine}
        for pid, p in procs.items():
            if (pid, p[1]) not in mine and p[0] in pids:
                mine[(pid, p[1])] = (p[0], p[2], "descendant")
                grew = True
    return mine


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--root", required=True)
    a.add_argument("--out", required=True)
    a.add_argument("--stop", required=True)
    args = a.parse_args()
    root = os.path.realpath(args.root)
    seen = {}
    deadline = time.monotonic() + 3600
    with open(args.out, "a", encoding="utf-8") as log:
        def say(entry):
            log.write(json.dumps({**entry, "at": now()}) + "\n")
            log.flush()
        say({"event": "watch_start", "root_exists": os.path.isdir(root), "already_there": sorted(pid for pid, _ in owned(snapshot(root)))})
        while not os.path.exists(args.stop) and time.monotonic() < deadline:
            current = owned(snapshot(root), seen)
            for key in sorted(set(current) - set(seen)):
                say({"event": "appear", "pid": key[0], "ppid": current[key][0], "start_ticks": key[1], "name": current[key][1], "role": current[key][2]})
            for key in sorted(set(seen) - set(current)):
                say({"event": "exit", "pid": key[0], "start_ticks": key[1], "name": seen[key][1], "role": seen[key][2]})
            seen = current
            time.sleep(0.1)
        say({"event": "watch_end", "remaining": sorted(pid for pid, _ in seen)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
