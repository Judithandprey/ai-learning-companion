"""Offline guard and foreground-lifecycle checks, not Mac compatibility evidence."""

import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location(
    "mac_metadata_probe", Path(__file__).with_name("codex_macos_metadata.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def fake_cli(directory, *, version=probe.VERSION, silent=False):
    path = directory / "fake-codex"
    path.write_text(f"#!{sys.executable}\n" + """
import json, sys, time
if '--version' in sys.argv:
    print(VERSION)
    raise SystemExit(0)
for line in sys.stdin:
    message = json.loads(line)
    if SILENT:
        time.sleep(30)
    if 'id' in message:
        result = {'data': [{'skills': []}]} if message['method'] == 'skills/list' else {}
        print(json.dumps({'id': message['id'], 'result': result}), flush=True)
""".replace("VERSION", repr(version)).replace("SILENT", repr(silent)))
    path.chmod(0o700)
    return path


class Guards(unittest.TestCase):
    def test_child_environment_never_inherits_credentials_or_real_home(self):
        contaminated = {
            "GH_TOKEN": "fake-gh", "GITHUB_TOKEN": "fake-github", "OPENAI_API_KEY": "fake-api",
            "CODEX_HOME": "/personal-codex", "HOME": "/personal-home",
            "PYTHONPATH": "/injection", "DYLD_INSERT_LIBRARIES": "/injection",
            "HTTPS_PROXY": "https://fake.invalid", "PATH": "/untrusted-bin",
        }
        with patch.dict(os.environ, contaminated):
            env = probe.child_environment(Path("/owned/state"), Path("/owned/home"), Path("/owned/tmp"))
        self.assertEqual(env, {"PATH": os.defpath, "CODEX_HOME": "/owned/state",
                              "HOME": "/owned/home", "TMPDIR": "/owned/tmp", "LANG": "en_US.UTF-8"})

    def test_non_metadata_messages_never_reach_transport(self):
        async def check():
            client = type("FakeClient", (), {})()
            transport = client._send = AsyncMock()
            methods = []
            probe.restrict_metadata(client, methods)
            for method in ("account/read", "account/login/start", "model/list", "thread/start", "turn/start"):
                with self.assertRaisesRegex(ValueError, "non_metadata_message_refused"):
                    await client._send({"method": method})
            with self.assertRaises(ValueError):
                await client._send({"id": 1, "result": {}})
            transport.assert_not_awaited()
            self.assertEqual(methods, [])
        asyncio.run(check())

    def test_corrupt_archive_is_refused_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "untrusted.tar.gz"
            archive.write_bytes(b"not the pinned official archive")
            with self.assertRaisesRegex(ValueError, "archive_checksum_mismatch"):
                probe.extract_candidate(archive, root / "codex")
            self.assertFalse((root / "codex").exists())

    def test_wrong_source_sha_produces_sanitized_failure_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "receipt.json"
            self.assertEqual(probe.run("not-a-source-sha", output), 1)
            receipt = json.loads(output.read_text())
            self.assertEqual(receipt["stage"], "source")
            self.assertEqual(receipt["failure_code"], "source_sha_mismatch")
            self.assertFalse(receipt["effective_configuration_passed"])

    def test_unavailable_official_archive_reports_http_status_without_fallback(self):
        commands = []

        def command(args, **kwargs):
            commands.append(args)
            if args[0] == "/usr/bin/curl":
                return subprocess.CompletedProcess(args, 22, stdout="404")
            return subprocess.CompletedProcess(args, 0)

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "receipt.json"
            with (patch.object(probe.subprocess, "check_output", return_value="a" * 40),
                  patch.object(probe.subprocess, "run", side_effect=command),
                  patch.object(probe, "digest", return_value="0" * 64),
                  patch.object(probe.sys, "platform", "darwin"),
                  patch.object(probe.platform, "machine", return_value="arm64"),
                  patch.object(probe, "measure", new_callable=AsyncMock) as measure):
                self.assertEqual(probe.run("a" * 40, output), 1)
            receipt = json.loads(output.read_text())
            self.assertEqual(receipt["stage"], "official_artifact")
            self.assertEqual(receipt["download_http_status"], "404")
            self.assertEqual(receipt["failure_exit_code"], 22)
            self.assertTrue(receipt["temporary_state_removed"])
            measure.assert_not_awaited()
            self.assertEqual(len([args for args in commands if args[0] == "/usr/bin/curl"]), 1)


class Lifecycle(unittest.IsolatedAsyncioTestCase):
    async def test_synthetic_success_uses_metadata_only_and_reaps_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            receipt = {}
            binary = fake_cli(root)
            # This fixture tests transport/lifecycle only. The unchanged real
            # verifier's acceptance is deliberately NOT claimed by this test.
            with patch.object(probe, "_verify_config", return_value=True) as verify:
                await probe.measure(binary, root, receipt)
            verify.assert_called_once()
            self.assertEqual(tuple(receipt["outbound_methods"]), probe.METHODS)
            self.assertTrue(receipt["empty_cwd_before_start"])
            self.assertTrue(receipt["version_child_reaped"])
            self.assertTrue(receipt["app_server_child_reaped"])

    async def test_actual_verifier_rejects_fixture_and_reaps_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            receipt = {"effective_configuration_passed": False}
            with self.assertRaises(probe.RPCError):
                await probe.measure(fake_cli(root), root, receipt)
            self.assertTrue(receipt["configuration_verifier_entered"])
            self.assertFalse(receipt["effective_configuration_passed"])
            self.assertTrue(receipt["app_server_child_reaped"])
            self.assertEqual(receipt["metadata_step"], "configuration_verifier")
            self.assertEqual(receipt["metadata_failure_code"], "isolation_unverified")

    async def test_timeout_reaps_silent_foreground_child(self):
        real_client = probe.ChatGPTAppServer

        def bounded_client(*args, **kwargs):
            return real_client(*args, **{**kwargs, "rpc_timeout": 0.05})

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            receipt = {}
            with patch.object(probe, "ChatGPTAppServer", bounded_client):
                with self.assertRaises(probe.RPCError):
                    await probe.measure(fake_cli(root, silent=True), root, receipt)
            self.assertTrue(receipt["app_server_child_reaped"])
            self.assertEqual(receipt["outbound_methods"], ["initialize"])
            self.assertEqual(receipt["metadata_failure_code"], "timeout")

    async def test_wrong_version_never_starts_app_server(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            receipt = {}
            with self.assertRaisesRegex(ValueError, "version_mismatch"):
                await probe.measure(fake_cli(root, version="codex-cli 0.159.0"), root, receipt)
            self.assertTrue(receipt["version_child_reaped"])
            self.assertNotIn("outbound_methods", receipt)


if __name__ == "__main__":
    unittest.main()
