"""Offline failure/privacy checks; never run a native speech process."""
import base64
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import windows_realtime_fixture as fixture


class FixtureChecks(unittest.TestCase):
    def test_generated_bytes_stay_in_memory(self):
        pcm = b"\x01\x00" * 12000
        result = subprocess.CompletedProcess([], 0, json.dumps({
            "pcm_base64": base64.b64encode(pcm).decode()
        }).encode(), b"")
        with patch.object(fixture.subprocess, "run", return_value=result):
            actual, metadata = fixture.generate()
        self.assertEqual(actual, pcm)
        self.assertEqual(metadata["duration_ms"], 500)
        self.assertNotIn("pcm_base64", metadata)
        self.assertFalse(metadata["audio_persisted"])

    def test_zero_or_truncated_audio_cannot_pass(self):
        for pcm in (bytes(24000), b"\x01" * 24001):
            result = subprocess.CompletedProcess([], 0, json.dumps({
                "pcm_base64": base64.b64encode(pcm).decode()
            }).encode(), b"")
            with self.subTest(length=len(pcm)), patch.object(
                fixture.subprocess, "run", return_value=result
            ), self.assertRaises(ValueError):
                fixture.generate()

    def test_existing_receipt_prevents_another_native_run(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "existing.json"
            path.write_text("original")
            with patch("sys.argv", ["fixture", "--output", str(path)]), patch.object(
                fixture, "generate"
            ) as generate, self.assertRaises(FileExistsError):
                fixture.main()
            generate.assert_not_called()
            self.assertEqual(path.read_text(), "original")

    def test_timeout_and_native_error_receipts_do_not_expose_logs(self):
        cases = [
            {"side_effect": subprocess.TimeoutExpired("PRIVATE_COMMAND", 20,
                                                     stderr=b"PRIVATE_STDERR")},
            {"return_value": subprocess.CompletedProcess([], 1, b"PRIVATE_STDOUT",
                                                         b"PRIVATE_STDERR")},
        ]
        for case in cases:
            with self.subTest(case=list(case)), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "result.json"
                displayed = io.StringIO()
                with patch("sys.argv", ["fixture", "--output", str(path)]), patch.object(
                    fixture.subprocess, "run", **case
                ), contextlib.redirect_stdout(displayed):
                    self.assertEqual(fixture.main(), 2)
                saved = path.read_text()
                self.assertNotIn("PRIVATE", saved + displayed.getvalue())
                self.assertFalse(json.loads(saved)["native_cleanup_observed"])


if __name__ == "__main__":
    unittest.main()
