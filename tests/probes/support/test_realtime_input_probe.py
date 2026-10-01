"""Fake-only regression tests. Never import a connector, spawn, or use audio I/O.

The foreign-turn and bemItemPromoted witnesses reproduce the independent review
of the original candidate. These tests cover the revised dormant probe only.
"""
import asyncio
from contextlib import asynccontextmanager, redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("realtime_input_probe", Path(__file__).with_name("realtime_input_probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def observer():
    result = probe.Observe(["seven", "matrix"])
    result.thread = "owned-thread"
    return result


def ready(result):
    result.feed("thread/realtime/started", {
        "threadId": result.thread, "version": "v2", "realtimeSessionId": "rt-session"})


def transcript(result, text, **kwargs):
    result.feed("thread/realtime/transcript/done", {
        "threadId": result.thread, "role": "user", "text": text, **kwargs})


class OfflineBoundaryTests(unittest.TestCase):
    def test_live_cli_blocks_before_paths_imports_fixtures_and_claims(self):
        argv = ["probe", "--live", "--permit-subscription-test", "--output", "/not-opened/receipt.json",
                "--state-dir", "/not-opened/state", "--wav", "/not-opened.wav", "--model", "fake",
                "--expect", "silver lantern"]
        with patch.object(probe.sys, "argv", argv), patch.object(Path, "exists", side_effect=AssertionError("path touched")), \
                patch.object(probe, "import_reviewed_connectors", side_effect=AssertionError("imported")), \
                patch.object(probe, "read_fixture", side_effect=AssertionError("fixture read")):
            with self.assertRaisesRegex(probe.Boundary, "managed_websocket_auth_and_internal_delegation"):
                probe.main()

    def test_direct_live_entry_blocks_before_reading_arguments(self):
        with self.assertRaisesRegex(probe.Boundary, "live_blocked"):
            asyncio.run(probe.run_live(None, None, None, None))

    def test_default_is_offline_and_preserves_codec_uncertainty(self):
        output = io.StringIO()
        with patch.object(probe.sys, "argv", ["probe"]), redirect_stdout(output):
            self.assertEqual(probe.main(), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "blocked_not_executed")
        self.assertIsNone(probe.VERIFIED_WIRE_CONTRACT)
        self.assertLessEqual(probe.NOMINAL_TIMEOUT, 60)

    def test_oracles_cannot_be_empty_prompted_or_trivial(self):
        for terms in ([], [""], [" "], ["x"], ["!"], ["speech"], ["seven "]):
            with self.subTest(terms=terms), self.assertRaises(probe.Boundary):
                probe.Observe(terms)
        probe.Observe(["silver lantern", "seven green triangles"])
        self.assertFalse(probe.oracle_matches("one", "none"))
        self.assertFalse(probe.oracle_matches("seven", "seventeen"))
        self.assertTrue(probe.oracle_matches("seven", "SEVEN, triangles"))

    def test_preinput_and_foreign_transcripts_cannot_supply_evidence(self):
        for startup in (False, True):
            item = observer()
            if startup:
                ready(item)
            transcript(item, "seven matrix")
            self.assertEqual(item.failure, "transcript_before_input")
            self.assertFalse(item.finals)
        item = observer()
        ready(item)
        item.input_started = True
        transcript(item, "seven matrix", threadId="foreign-thread")
        self.assertEqual(item.failure, "foreign_realtime_evidence")
        self.assertFalse(item.finals)

    def test_fragments_require_complete_input_and_all_terms(self):
        item = observer()
        ready(item)
        item.input_started = True
        transcript(item, "seven")
        item.complete_input()
        self.assertFalse(item.done.is_set())
        transcript(item, "matrix")
        self.assertTrue(item.done.is_set())
        self.assertTrue(all(item.evidence()["fixture_terms_matched"]))
        early = observer()
        ready(early)
        early.input_started = True
        transcript(early, "seven matrix")
        self.assertFalse(early.done.is_set())

    def test_poststop_transcripts_are_discarded_and_cannot_complete_oracle(self):
        item = observer()
        ready(item)
        item.input_started = True
        transcript(item, "seven")
        item.complete_input()
        item.stopping = True
        before = item.evidence()["transcript_sha256"]
        transcript(item, "matrix")
        self.assertFalse(item.done.is_set())
        self.assertEqual(before, item.evidence()["transcript_sha256"])
        self.assertEqual(item.late_transcripts, 1)

    def test_startup_is_exact_once_owned_thread_and_v2(self):
        for params in ({"threadId": "foreign", "version": "v2"},
                       {"threadId": "owned-thread", "version": "v1"},
                       {"threadId": "owned-thread", "version": "v3"},
                       {"threadId": "owned-thread"}):
            item = observer()
            item.feed("thread/realtime/started", params)
            self.assertIsNotNone(item.failure)
            self.assertFalse(item.ready.is_set())
        item = observer()
        ready(item)
        ready(item)
        self.assertEqual(item.failure, "repeated_or_late_startup")

    def test_turn_and_bem_witnesses_are_child_wide_before_thread_filter(self):
        for thread in ("owned-thread", "unexpected-helper", None):
            item = observer()
            item.feed("turn/started", {"threadId": thread, "turn": {"id": "unrequested-turn"}})
            self.assertEqual(item.failure, "unexpected_backing_turn")
            for method in ("thread/realtime/item/started", "thread/realtime/item/completed"):
                item = observer()
                item.feed(method, {"threadId": thread, "item": {
                    "type": "bemItemPromoted", "id": "promoted", "realtimeSessionId": "rt-session",
                    "item_id": "backing-output", "turn_id": "unrequested-turn",
                    "presentation": {"type": "wholeItem"}}})
                self.assertEqual(item.failure, "unexpected_backing_item")

    def test_ordinary_items_and_foreign_canonical_finals_are_rejected(self):
        for method in ("item/started", "item/completed"):
            item = observer()
            item.feed(method, {"threadId": "helper", "item": {"type": "agentMessage"}})
            self.assertEqual(item.failure, "unexpected_backing_item")
        for thread, session in (("helper", "rt-session"), ("owned-thread", "foreign-session")):
            item = observer()
            ready(item)
            item.input_started = True
            item.feed("thread/realtime/item/completed", {"threadId": thread, "item": {
                "type": "transcriptSegment", "realtimeSessionId": session, "role": "user", "text": "seven matrix"}})
            self.assertIsNotNone(item.failure)
            self.assertFalse(item.finals)

    def test_error_or_transport_closure_never_passes_as_requested_stop(self):
        for reason in ("error", "transport_closed", None, "unknown"):
            item = observer()
            ready(item)
            item.stopping = True
            item.feed("thread/realtime/closed", {"threadId": item.thread, "reason": reason})
            self.assertEqual(item.failure, "unclean_realtime_close")
        item = observer()
        ready(item)
        item.stopping = True
        item.feed("thread/realtime/closed", {"threadId": item.thread, "reason": "requested"})
        self.assertIsNone(item.failure)

    def test_source_pins_reject_changed_files_and_unreviewed_initializer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "services/worker/connector.py"
            source.parent.mkdir(parents=True)
            source.write_bytes(b"# synthetic only\n")
            with patch.object(probe, "SOURCE_HASHES", {"services/worker/connector.py": probe.digest(source.read_bytes())}):
                self.assertEqual(probe.verify_source_files(root), root)
                initializer = root / "services/__init__.py"
                initializer.write_text("# unreviewed synthetic initializer\n")
                with self.assertRaisesRegex(probe.Boundary, "unexpected_package_initializer"):
                    probe.verify_source_files(root)
                initializer.unlink()
                source.write_text("# altered\n")
                with self.assertRaisesRegex(probe.Boundary, "connector_import_source_changed"):
                    probe.verify_source_files(root)

    def test_durable_attempt_precedes_import_and_survives_failure_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "synthetic-repo"
            repo.mkdir()
            output = root / "receipt.json"
            claim = root / "receipt.json.attempt.json"
            argv = ["probe", "--live", "--permit-subscription-test", "--repo", str(repo),
                    "--output", str(output), "--state-dir", str(root / "unused-state"),
                    "--wav", str(root / "unused.wav"), "--model", "synthetic", "--expect", "silver lantern"]
            def refuse_import(path):
                self.assertTrue(claim.exists())
                self.assertTrue(json.loads(claim.read_text())["automatic_retry_forbidden"])
                raise probe.Boundary("synthetic_import_refused")
            with patch.object(probe.sys, "argv", argv), \
                    patch.object(probe, "require_live_preconditions", return_value=None), \
                    patch.object(probe, "verify_source_files", return_value=repo), \
                    patch.object(probe, "read_fixture", return_value=b"synthetic-fixture"), \
                    patch.object(probe, "import_reviewed_connectors", side_effect=refuse_import) as importer:
                with self.assertRaisesRegex(probe.Boundary, "synthetic_import_refused"):
                    probe.main()
                self.assertFalse(output.exists())
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as refused:
                    probe.main()
                self.assertEqual(refused.exception.code, 2)
                self.assertEqual(importer.call_count, 1)
                self.assertTrue(claim.exists())


class FakeRPCError(Exception):
    code = "protocol_error"


class FakeClient:
    """Only in-memory callbacks; this is not the real managed client."""
    cwd = "/synthetic"
    expected_provider = "synthetic-provider"
    shutdown_timeout = 3
    isolation_verified = True

    def __init__(self, scenario):
        self.scenario = scenario
        self.messages = []
        self._fatal = None
        self._closed = False
        self.terminal = asyncio.Event()
        self._process = SimpleNamespace(returncode=None)
        self.append_count = 0

    async def _send(self, message, **kwargs):
        self.messages.append(message)

    async def _notification(self, method, params):
        pass

    def _fail(self, reason):
        self._fatal = reason
        self.terminal.set()

    async def start(self):
        if self.scenario == "hang_start":
            await asyncio.Event().wait()
        await self._rpc("initialize", {"clientInfo": {"name": "learning_companion", "version": "0.1.0"},
                                      "capabilities": {"experimentalApi": True, "explicitGatewayOauth": True}})
        await self._send({"method": "initialized", "params": {}})
        await self._rpc("config/read", {"includeLayers": True, "cwd": self.cwd})
        await self._rpc("configRequirements/read", None)
        await self._rpc("skills/list", {"cwds": [self.cwd], "forceReload": True})

    async def _account(self):
        await self._rpc("account/read", {"refreshToken": False})
        return {"auth_mode": "chatgpt"}

    async def _rpc(self, method, params):
        await self._send({"id": len(self.messages), "method": method, "params": params})
        result = {}
        if method == "thread/start":
            result = {"model": "synthetic-model", "modelProvider": self.expected_provider,
                      "cwd": self.cwd, "instructionSources": [], "approvalPolicy": "never",
                      "sandbox": {"type": "readOnly", "networkAccess": False},
                      "thread": {"id": "owned-thread", "ephemeral": True}}
        elif method == "thread/realtime/start":
            await self._notification("thread/realtime/started", {"threadId": "owned-thread", "version": "v2"})
            if self.scenario in ("foreign_turn", "same_turn"):
                await self._notification("turn/started", {"threadId": "helper" if self.scenario == "foreign_turn" else "owned-thread"})
            elif self.scenario == "bem":
                await self._notification("thread/realtime/item/completed", {"threadId": "helper", "item": {
                    "type": "bemItemPromoted", "id": "promoted", "realtimeSessionId": "rt-session",
                    "item_id": "backing-output", "turn_id": "unrequested-turn", "presentation": {"type": "wholeItem"}}})
        elif method == "thread/realtime/appendAudio":
            self.append_count += 1
            if self.append_count == 1:
                await self._notification("thread/realtime/transcript/done", {
                    "threadId": "owned-thread", "role": "user", "text": "seven matrix"})
        elif method == "thread/realtime/stop":
            if self.scenario == "hang_stop":
                await asyncio.Event().wait()
            await self._notification("thread/realtime/closed", {
                "threadId": "owned-thread", "reason": "error" if self.scenario == "error_close" else "requested"})
        if self._fatal:
            raise FakeRPCError()
        return result

    async def close(self):
        self._closed = True
        self.terminal.set()
        if self.scenario != "unreaped":
            self._process.returncode = 0
        if self.scenario == "fatal_at_close":
            self._fatal = "synthetic-reader-error"


class AsyncFakeTests(unittest.IsolatedAsyncioTestCase):
    async def test_offline_self_test_and_wire_version_pin(self):
        self.assertEqual((await probe.self_test())["status"], "offline_self_test_passed")
        item = observer()
        client = FakeClient("ordinary")
        guard = probe.WireGuard(client, item, {})
        guard.phase = "probe"
        params = guard.start_params()
        self.assertEqual(params["version"], "v2")
        for invalid in ({k: v for k, v in params.items() if k != "version"}, {**params, "version": "v1"}):
            with self.assertRaises(probe.Boundary):
                await guard({"method": "thread/realtime/start", "params": invalid})
        await guard({"method": "thread/realtime/start", "params": params})
        with self.assertRaises(probe.Boundary):
            await guard({"method": "thread/realtime/start", "params": params})

    async def test_wait_event_checks_fatal_even_if_event_was_already_set(self):
        item = observer()
        item.done.set()
        for fatal, terminal in (("failed", False), (None, True)):
            client = FakeClient("ordinary")
            client._fatal = fatal
            if terminal:
                client.terminal.set()
            with self.assertRaisesRegex(probe.Boundary, "managed_child_failed"):
                await probe.wait_event(item.done, item, client, 0.1)

    async def fake_run(self, scenario):
        client = FakeClient(scenario)
        @asynccontextmanager
        async def factory():
            try:
                yield client
            finally:
                await client.close()
        launch = SimpleNamespace(_check_state=lambda path: None, create_client=factory)
        args = SimpleNamespace(expect=["seven", "matrix"], model="synthetic-model",
                               state_dir=Path("/synthetic-never-opened"), codex_bin=Path("/synthetic-never-executed"),
                               retain_fixture_transcript=False)
        sleep = asyncio.sleep
        async def no_pacing(seconds):
            await sleep(0)
        previous = {key: probe.os.environ.get(key) for key in ("LC_SUBSCRIPTION_STATE_DIR", "LC_SUBSCRIPTION_CODEX_BIN")}
        # Test-only patch of the gate with explicit fake dependencies. No CLI
        # flag or production execution can turn off this source-evidenced gate.
        with patch.object(probe, "require_live_preconditions", return_value=None), \
                patch.object(probe.asyncio, "sleep", no_pacing), \
                patch.object(probe, "PRIMARY_TIMEOUT", 0.02 if scenario == "hang_start" else 1), \
                patch.object(probe, "STOP_TIMEOUT", 0.02), patch.object(probe, "CLOSE_TIMEOUT", 0.02):
            report = await probe.run_live(args, b"\x01\x00" * 12000, SimpleNamespace(RPCError=FakeRPCError), launch)
        self.assertEqual(previous, {key: probe.os.environ.get(key) for key in previous})
        self.assertTrue(client._closed)
        self.assertFalse(any(message.get("method") == "turn/start" for message in client.messages))
        return report, client

    async def test_fake_full_lifecycle_has_one_start_stop_and_reaped_child(self):
        report, client = await self.fake_run("ordinary")
        self.assertEqual(report["status"], "fixture_transport_and_terms_passed")
        self.assertEqual(report["methods"]["thread/realtime/start"], 1)
        self.assertEqual(report["methods"]["thread/realtime/stop"], 1)
        self.assertEqual(client.append_count, 15)
        self.assertTrue(report["owned_child_reaped"])
        self.assertNotIn("fixture_transcript", report)

    async def test_fake_lifecycle_rejects_inference_errors_and_uncertain_cleanup(self):
        for scenario, failure in (("foreign_turn", "unexpected_backing_turn"), ("same_turn", "unexpected_backing_turn"),
                                  ("bem", "unexpected_backing_item"), ("error_close", "unclean_realtime_close"),
                                  ("fatal_at_close", "managed_child_failed"), ("unreaped", "owned_child_cleanup_unconfirmed"),
                                  ("hang_start", "deadline_or_vad_timeout"), ("hang_stop", "stop_or_close_unconfirmed")):
            with self.subTest(scenario=scenario):
                report, _ = await self.fake_run(scenario)
                self.assertEqual(report["status"], "not_passed")
                self.assertEqual(report["failure"], failure)


if __name__ == "__main__":
    unittest.main()
