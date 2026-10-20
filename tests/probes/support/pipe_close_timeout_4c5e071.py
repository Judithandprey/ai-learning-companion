"""Bounded local child reproducer; never starts Codex or opens a network."""

import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time


CHILD = """
import os, signal, time
def terminate(signum, frame):
    # Close stdout after the client's parser is cancelled, but keep stdin open.
    try:
        os.close(1)
    except OSError:
        pass
signal.signal(signal.SIGTERM, terminate)
print("synthetic-child-ready", flush=True)
time.sleep(5)
"""


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def scenario(module, label):
    loop = asyncio.get_running_loop()
    callback_errors = []
    previous_handler = loop.get_exception_handler()
    loop.set_exception_handler(
        lambda _, context: callback_errors.append(type(context.get("exception")).__name__)
    )
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-c", CHILD, cwd="/tmp", env={"PATH": os.defpath},
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    client = module.ChatGPTAppServer(
        ["synthetic-never-launched"], cwd="/tmp", env={}, shutdown_timeout=0.05
    )
    client._process = process
    wait_calls = 0
    actual_wait = process.wait

    async def observed_wait():
        nonlocal wait_calls
        wait_calls += 1
        return await actual_wait()

    process.wait = observed_wait
    try:
        assert await asyncio.wait_for(process.stdout.readline(), 1) == b"synthetic-child-ready\n"
        client._reader = asyncio.create_task(client._read_loop())
        await asyncio.sleep(0)
        # A pending large protocol write can leave stdin buffered during close.
        process.stdin.write(b"x" * (4 * 1024 * 1024))
        buffered = process.stdin.transport.get_write_buffer_size()
        assert buffered > 0
        start = time.monotonic()
        try:
            await asyncio.wait_for(client.close(), 1)
            outcome = "returned"
        except BaseException as error:
            outcome = type(error).__name__
        duration = time.monotonic() - start
        at_return = process.returncode
        calls_at_return = wait_calls
        # Harness owns and reaps only this synthetic child, even on a witness.
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await asyncio.wait_for(actual_wait(), 1)
        await asyncio.sleep(0)
        try:
            await asyncio.wait_for(client.close(), 1)
            repeat = "returned"
        except BaseException as error:
            repeat = type(error).__name__
        return {
            "version": label, "stdin_buffered_bytes": buffered,
            "first_close": outcome, "first_close_seconds": duration,
            "returncode_at_first_close": at_return,
            "process_wait_calls_at_first_close": calls_at_return,
            "second_close_after_harness_reap": repeat,
            "loop_callback_errors": callback_errors,
            "harness_final_returncode": process.returncode,
            "harness_final_transport_closing": process._transport.is_closing(),
        }
    finally:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await asyncio.wait_for(actual_wait(), 1)
        if client._reader is not None:
            client._reader.cancel()
            await asyncio.gather(client._reader, return_exceptions=True)
        await asyncio.sleep(0)
        loop.set_exception_handler(previous_handler)


async def main():
    export, parent_source = map(Path, sys.argv[1:3])
    sys.path.insert(0, str(export))
    source = export / "services/worker/connectors/chatgpt_rpc.py"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == "1408456395c346d353ec88c75bbc8907e32666afa90504297176853e5efd8231"
    rows = []
    for label, path in [("parent-4e840a4", parent_source), ("candidate-4c5e071", source)]:
        rows.append(await scenario(load(label, path), label))
    print(json.dumps({"python": sys.version, "rows": rows}, indent=2))
    assert rows[0]["first_close"] == rows[0]["second_close_after_harness_reap"] == "returned"
    assert rows[1]["first_close"] == rows[1]["second_close_after_harness_reap"] == "CancelledError"
    assert rows[1]["process_wait_calls_at_first_close"] == 0
    assert all(row["harness_final_returncode"] is not None for row in rows)


if __name__ == "__main__":
    asyncio.run(main())
