"""QA relay: runs the released connector as a real process behind real pipes, for sub_changed_backend.test.mjs.

It stands where wsl.exe stands on Windows. Offline only: no Windows, no codex, no account, no network, no database.

    python qa_connector_relay.py <tree> <fake tree> <launch folder> <mode> [<timeouts as JSON> [<option> ...]]
    options: hold-input-end | hold-input-end=<seconds> | ignore-term

WHAT IS RELEASED CODE (taken from <tree>, a `git archive` export of one commit; never from this worktree):
- the connector's own entrypoint `services.worker.connectors.chatgpt_local.main()` and everything it runs: the pipe
  adapters, `run_stream`, `SubscriptionBridge`, `chatgpt_rpc.ChatGPTAppServer`, the Learning owner's prepare and bind
  (`services.learning.subscription_ask`), and the receipt writer `chatgpt_receipts.ReceiptWriter`.

WHAT IS A STAND-IN, and why:
- This relay itself. The connector takes only FIFOs for its input and output, and a child of Node on Linux gets a
  socket pair, so the relay gives the connector two real pipes and copies the bytes both ways, unread and unchanged.
  When the connector ends, the relay ends with the connector's exit code. It is not wsl.exe and shows nothing about
  wsl.exe.
- The inner Codex App Server. It is the REPO'S OWN synthetic child: the `FAKE` program and the `client()` helper of
  services/worker/connectors/tests/test_chatgpt_rpc.py, loaded from <fake tree>. `chatgpt_launch.create_client` is
  replaced by a factory that yields it, the way the repo's own process tests do (`_fatal_rpc_stream_child`), before
  `main()` is called. So the launch checks of chatgpt_launch.py (the binary's pin, the configuration, the state lock)
  are NOT run here, and the real codex binary is never looked for and never started.
- Two further differences from a real launch follow from using that helper, and both are in what the inner client is
  told to expect. (1) The provider: the helper leaves `expected_provider` at the constructor's default 'openai',
  which the synthetic child answers; a real launch passes 'lc_managed_chatgpt' (chatgpt_launch.MANAGED_PROVIDER).
  (2) The isolation check: the helper is given `isolation_verified=True` and NO `verify_config`; a real launch
  passes `verify_config` (chatgpt_launch._verify_config), which makes the client read `config/read`,
  `configRequirements/read` and `skills/list` at its start and again before every question's thread. Here those
  reads are never sent: the synthetic child's log holds none of them, and nothing about that check is shown.
- The helper's short test timeouts (0.4 / 0.6 / 0.2 s) are replaced by the released constructor's own defaults, read
  from its signature, unless the test passes other values for one launch. The values used are written in end.json.
- The receipt writer is the released class, given stand-in facts about a binary: the stand-in path the test passed,
  version '0.0.0-qa-stand-in' and a digest of zeros. It writes only below the test's own temporary state folder.
- Signal USR1, sent by the test to this relay and passed on, makes the connector's process end the synthetic inner
  child it made (by its own process object, never by a number) and write inner-ended.json once that child is gone.
- `hold-input-end`: the end of this relay's input is not passed on, so the connector learns of it only when the relay
  is gone. It stands for a connector that has not ended when the client's wait for it is over (the repo's synthetic
  child ends at once when asked, so a slow close cannot be had from it).
  `hold-input-end=<seconds>`: the end of input is passed on that many seconds late, and the connector then ends by
  itself as always. It stands for a connector whose own end takes that long. The delay is this relay's sleep: no
  cleanup of the connector takes that time here.
- `ignore-term`: this relay ignores SIGTERM (set after the connector was started, so only the relay does). It stands
  for a wsl.exe shim that is still there after the client's kill; the test ends it later with SIGKILL.

The relay refuses to start unless LC_SUBSCRIPTION_CODEX_BIN and LC_SUBSCRIPTION_STATE_DIR are both set, so that
nothing here could fall back to a codex found on PATH; the connector's own PATH names only a folder that does not
exist.

It leaves in <launch folder>: `<mode>/requests.jsonl` (what the synthetic child was asked, written by that child),
`end.json` (written when the connector lets go of its client), `connector-stderr.txt`, `inner-ended.json` (only after
USR1), and `relay.json` (the connector's exit code, and whether its output ended while this relay's own input was
still open; written only by a relay that saw the connector end, so not by one that was killed).
"""
import json
import os
import signal
import subprocess
import sys
import threading
import time

BOOTSTRAP = r'''
import asyncio, importlib.util, inspect, json, os, signal, sys
from contextlib import asynccontextmanager
from pathlib import Path
from services.worker.connectors import chatgpt_launch, chatgpt_local, chatgpt_rpc
from services.worker.connectors.chatgpt_receipts import ReceiptWriter

fake_tree, folder, mode, asked = sys.argv[1], Path(sys.argv[2]), sys.argv[3], json.loads(sys.argv[4])
spec = importlib.util.spec_from_file_location(
    "qa_repo_fake", Path(fake_tree) / "services/worker/connectors/tests/test_chatgpt_rpc.py")
fake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fake)
timeouts = {name: parameter.default for name, parameter in
            inspect.signature(chatgpt_rpc.ChatGPTAppServer.__init__).parameters.items() if name.endswith("_timeout")}
timeouts.update(asked)


@asynccontextmanager
async def stand_in_factory():
    receipts = ReceiptWriter(Path(os.environ["LC_SUBSCRIPTION_STATE_DIR"]), os.environ["LC_SUBSCRIPTION_CODEX_BIN"],
                             "0.0.0-qa-stand-in", "0" * 64, True)
    rpc = fake.client(folder, mode, isolation_verified=True, on_receipt=receipts)
    for name, value in timeouts.items():
        setattr(rpc, name, value)

    async def end_inner():       # only the synthetic child this connector made, by its own process object
        rpc._process.terminate()
        (folder / "inner-ended.json").write_text(json.dumps({"returncode": await rpc._process.wait()}))

    ending = []
    asyncio.get_running_loop().add_signal_handler(signal.SIGUSR1, lambda: ending.append(asyncio.ensure_future(end_inner())))
    try:
        yield rpc
    finally:
        await rpc.close()
        inner = rpc._process
        (folder / "end.json").write_text(json.dumps({
            "mode": mode, "fatal": rpc._fatal, "timeouts": timeouts,
            "inner_pid": inner.pid if inner else None, "inner_returncode": inner.returncode if inner else None,
            "receipts": receipts.directory.name,
            "limits": {"MAX_TURN_EVENTS": chatgpt_rpc.MAX_TURN_EVENTS,
                       "MAX_TURN_WIRE_BYTES": getattr(chatgpt_rpc, "MAX_TURN_WIRE_BYTES", None),
                       "MAX_HISTORY": chatgpt_local.MAX_HISTORY, "SHUTDOWN_SECONDS": chatgpt_local.SHUTDOWN_SECONDS,
                       "TERMINAL_REPLY_SECONDS": getattr(chatgpt_local, "TERMINAL_REPLY_SECONDS", None)}}))


chatgpt_launch.create_client = stand_in_factory      # before anything of the connector runs
sys.argv = ["qa-synthetic-chatgpt-local"]            # main() takes no argument
raise SystemExit(chatgpt_local.main())
'''


def main():
    if len(sys.argv) < 5:
        return 2
    tree, fake_tree, folder, mode = sys.argv[1:5]
    hold, ignore_term = None, False      # hold: None (the end of input is passed on at once), a delay in seconds, or inf
    for option in sys.argv[6:]:
        name, _, value = option.partition("=")
        if option == "ignore-term":
            ignore_term = True
        elif option == "hold-input-end":
            hold = float("inf")
        elif name == "hold-input-end" and value.replace(".", "", 1).isdigit():
            hold = float(value)
        else:
            return 2
    names = ("LC_SUBSCRIPTION_CODEX_BIN", "LC_SUBSCRIPTION_STATE_DIR")
    if not all(os.environ.get(name) for name in names):
        return 3
    env = {"PATH": "/nonexistent", "PYTHONDONTWRITEBYTECODE": "1", "HOME": folder, **{name: os.environ[name] for name in names}}
    with open(os.path.join(folder, "connector-stderr.txt"), "wb") as errors:
        child = subprocess.Popen(
            [sys.executable, "-u", "-c", BOOTSTRAP, fake_tree, folder, mode, sys.argv[5] if len(sys.argv) > 5 else "{}"],
            cwd=tree, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors)
    signal.signal(signal.SIGUSR1, lambda *_: child.poll() is None and child.send_signal(signal.SIGUSR1))
    if ignore_term:              # after the connector was started: the connector keeps its own handling of SIGTERM
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    input_ended = threading.Event()

    def to_connector():
        try:
            while chunk := os.read(0, 65536):
                child.stdin.write(chunk)
                child.stdin.flush()
        except OSError:
            pass
        input_ended.set()
        if hold == float("inf"):  # the end of input is not passed on: the connector sees it only when this relay is gone
            return
        if hold:                 # the end of input is passed on late
            time.sleep(hold)
        try:
            child.stdin.close()
        except OSError:
            pass

    threading.Thread(target=to_connector, daemon=True).start()
    try:
        while chunk := os.read(child.stdout.fileno(), 65536):
            os.write(1, chunk)
    except OSError:
        pass
    input_open = not input_ended.is_set()
    code = child.wait()
    with open(os.path.join(folder, "relay.json"), "w") as out:
        json.dump({"exit_code": code, "output_ended_while_input_open": input_open}, out)
    return code


if __name__ == "__main__":
    os._exit(main())
