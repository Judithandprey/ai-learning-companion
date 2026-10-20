"""Shutdown regressions using owned synthetic children, never Codex or a network."""

import asyncio
import os
import signal
import sys

import pytest

from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer


CHILD = """
import os, signal, time
def terminate(signum, frame):
    # Make stdout reach EOF, but leave buffered parent stdin unable to flush.
    try:
        os.close(1)
    except OSError:
        pass
signal.signal(signal.SIGTERM, terminate)
print("synthetic-child-ready", flush=True)
time.sleep(5)
"""


@pytest.mark.skipif(os.name != "posix", reason="Requires the Unix SIGTERM pipe witness")
@pytest.mark.parametrize("cancel_first_close", [False, True])
def test_buffered_stdin_survives_close_deadline_or_caller_cancellation(tmp_path, cancel_first_close):
    async def run():
        loop = asyncio.get_running_loop()
        callback_errors = []
        previous_handler = loop.get_exception_handler()
        loop.set_exception_handler(lambda _, context: callback_errors.append(context))
        process = None
        tasks = []
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-c", CHILD, cwd=tmp_path, env={"PATH": os.defpath},
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            actual_wait = process.wait
            actual_kill = process.kill
            wait_calls = 0
            kill_calls = 0
            parser_started = asyncio.Event()
            stdout_eof = asyncio.Event()
            actual_readline = process.stdout.readline
            actual_read = process.stdout.read

            async def observed_wait():
                nonlocal wait_calls
                wait_calls += 1
                return await actual_wait()

            def observed_kill():
                nonlocal kill_calls
                kill_calls += 1
                actual_kill()

            async def observed_readline():
                parser_started.set()
                return await actual_readline()

            async def observed_read(maximum):
                assert client._reader.done(), "Discard must follow parser termination"
                data = await actual_read(maximum)
                if not data:
                    stdout_eof.set()
                return data

            process.wait = observed_wait
            process.kill = observed_kill
            assert await asyncio.wait_for(actual_readline(), 1) == b"synthetic-child-ready\n"
            process.stdout.readline = observed_readline
            process.stdout.read = observed_read
            client = ChatGPTAppServer(
                ["synthetic-never-launched"], cwd=str(tmp_path), env={},
                shutdown_timeout=.05,
            )
            client._process = process
            client._reader = asyncio.create_task(client._read_loop())
            tasks.append(client._reader)
            await asyncio.wait_for(parser_started.wait(), 1)
            process.stdin.write(b"x" * (4 * 1024 * 1024))
            assert process.stdin.transport.get_write_buffer_size() > 0

            closing = asyncio.create_task(client.close())
            tasks.append(closing)
            if cancel_first_close:
                await asyncio.wait_for(stdout_eof.wait(), 1)
                assert not closing.done() and process.returncode is None
                assert process.stdin.transport.get_write_buffer_size() > 0
                closing.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await closing
                closing = asyncio.create_task(client.close())
                tasks.append(closing)
            await asyncio.wait_for(closing, 1)

            assert stdout_eof.is_set()
            assert process.returncode == -signal.SIGKILL
            assert kill_calls == 1
            assert wait_calls == 2 + int(cancel_first_close)
            assert client._reader.cancelled()

            repeated = asyncio.create_task(client.close())
            tasks.append(repeated)
            await asyncio.wait_for(repeated, 1)
            assert kill_calls == 1
            # A fresh public waiter must observe closure, not a shared future
            # poisoned by either the shutdown deadline or caller cancellation.
            stdin_closed = asyncio.create_task(process.stdin.wait_closed())
            tasks.append(stdin_closed)
            try:
                await asyncio.wait_for(stdin_closed, 1)
            except (BrokenPipeError, ConnectionResetError):
                pass
            assert not stdin_closed.cancelled()
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            try:
                if process is not None:
                    if process.returncode is None:
                        try:
                            process.kill()
                        except ProcessLookupError:
                            pass
                    await asyncio.wait_for(actual_wait(), 1)
                    if process.stdin.transport.get_write_buffer_size():
                        process.stdin.transport.abort()
                    # Let owned-pipe callbacks run before restoring the handler.
                    await asyncio.sleep(0)
            finally:
                loop.set_exception_handler(previous_handler)
        assert callback_errors == []
        assert all(task.done() for task in tasks)

    asyncio.run(run())
