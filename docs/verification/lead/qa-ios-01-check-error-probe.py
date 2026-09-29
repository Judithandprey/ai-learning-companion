"""One exact QA-IOS-01 checker-error/summary reproduction; no native execution."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

checker = Path(sys.argv[1]) / "tests/e2e/ios/qa_ios_01/check.py"
out = Path(tempfile.mkdtemp(prefix="qa-ios-01-check-error-"))
log = out / "checks.jsonl"
bad = out / "ink.json"
bad.write_text("null\n")

def run(*args):
    return subprocess.run([sys.executable, str(checker), "--log", str(log), *args], capture_output=True, text=True)

setup = run("note", "setup", "installed app", "PASS", "probe setup only")
envelope = run("envelope", "1b", str(bad))
summary = run("summary", str(out), "checker error probe; no native execution")
print(f"output={out}")
print(f"setup_exit={setup.returncode}")
print(f"envelope_exit={envelope.returncode}")
print(f"envelope_error={envelope.stderr.splitlines()[-1]}")
print(f"summary_exit={summary.returncode}")
print(f"summary_counts={json.loads((out / 'summary.json').read_text())['counts']}")
assert envelope.returncode != 0
assert summary.returncode == 0
