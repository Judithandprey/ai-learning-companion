"""Offline privacy/failure checks. All subprocess calls are mocked."""
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import windows_target_identity as probe


class IdentityReceiptTests(unittest.TestCase):
    def record(self, **changes):
        return dict(status='observed', pid=100568,
                    expected_created_ticks='639267186912717160',
                    creation_source='CIM CreationDate.ToUniversalTime().Ticks',
                    identity_matches=True, classification='unknown',
                    observed_utc='2026-10-07T08:00:00.0000000Z',
                    product='Electron', company='GitHub, Inc.', description='Electron',
                    child_argument_present=False, executable_matches_candidate=False,
                    known_launch='unknown', **changes)

    def exercise(self, result):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'receipt.json'
            console = StringIO()
            with patch.object(probe.subprocess, 'run', return_value=result) as call, redirect_stdout(console):
                code = probe.run(output)
            call.assert_called_once()
            text = output.read_text() + console.getvalue()
            self.assertNotIn('PRIVATE_SECRET', text)
            return code, json.loads(output.read_text())

    def test_observed_unknown_is_preserved(self):
        result = subprocess.CompletedProcess([], 0, json.dumps(self.record()).encode(), b'')
        code, receipt = self.exercise(result)
        self.assertEqual(code, 0)
        self.assertEqual(receipt['observation']['classification'], 'unknown')

    def test_stop_states_do_not_require_product_fields(self):
        for status in ('absent', 'creation_mismatch', 'unreadable'):
            record = {k: v for k, v in self.record().items() if k in {
                'status', 'pid', 'expected_created_ticks', 'creation_source',
                'identity_matches', 'classification', 'observed_utc'}}
            record.update(status=status, identity_matches=False)
            self.assertEqual(probe.safe_observation(record), record)

    def test_raw_field_or_unrecognized_resource_is_not_saved(self):
        for key in ('command_line', 'product'):
            record = self.record()
            record[key] = 'PRIVATE_SECRET'
            code, receipt = self.exercise(subprocess.CompletedProcess([], 0, json.dumps(record).encode(), b''))
            self.assertEqual(code, 2)
            self.assertNotIn('observation', receipt)

    def test_nonzero_or_malformed_output_is_not_saved(self):
        for result in (subprocess.CompletedProcess([], 1, b'PRIVATE_SECRET', b'PRIVATE_SECRET'),
                       subprocess.CompletedProcess([], 0, b'PRIVATE_SECRET', b'')):
            code, receipt = self.exercise(result)
            self.assertEqual(code, 2)
            self.assertEqual(receipt['native_invocations'], 1)

    def test_wrong_identity_or_false_success_rejected(self):
        for key, value in [('pid', 100569), ('expected_created_ticks', '639267186912717161'),
                           ('identity_matches', False)]:
            record = self.record()
            record[key] = value
            with self.assertRaises(ValueError):
                probe.safe_observation(record)

    def test_existing_output_prevents_native_invocation(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'receipt.json'
            output.write_text('original')
            with patch.object(probe.subprocess, 'run') as call, self.assertRaises(FileExistsError):
                probe.run(output)
            call.assert_not_called()
            self.assertEqual(output.read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
