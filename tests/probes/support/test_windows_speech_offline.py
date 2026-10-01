"""No Windows process: exercise launcher failure receipts and scope reporting."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("speech_probe", Path(__file__).with_name("windows_speech_offline.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ReceiptTests(unittest.TestCase):
    def check_failure(self, failure, *, result=None, error=None):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "receipt.json"
            with patch.object(probe.subprocess, "run", return_value=result, side_effect=error):
                self.assertEqual(probe.run(output), 1)
            receipt = json.loads(output.read_text())
            self.assertEqual(receipt["failure"], failure)
            self.assertEqual(receipt["runner_status"], "failed")
            self.assertEqual(receipt["native_process_cleanup"], "not_separately_observed")
            self.assertNotIn("private diagnostic", output.read_text())

    def test_nonzero_does_not_publish_raw_diagnostic(self):
        self.check_failure("powershell_nonzero_exit", result=subprocess.CompletedProcess(
            ["powershell.exe"], 1, b"", b"private diagnostic"))

    def test_timeout_does_not_claim_native_cleanup(self):
        self.check_failure("wsl_launcher_timeout", error=subprocess.TimeoutExpired("powershell.exe", 60))

    def test_malformed_receipt_is_not_success(self):
        self.check_failure("invalid_probe_receipt", result=subprocess.CompletedProcess(
            ["powershell.exe"], 0, b"not JSON", b""))

    def test_missing_launcher_has_receipt(self):
        self.check_failure("launcher_unavailable", error=FileNotFoundError())


if __name__ == "__main__":
    unittest.main()
