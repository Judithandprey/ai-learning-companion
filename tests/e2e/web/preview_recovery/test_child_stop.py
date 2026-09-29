"""Runs the bounded child-process probe for the preview-recovery harness cleanup (stopChild)."""

import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
PINNED = Path("/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node")
NODE = str(PINNED) if PINNED.exists() else shutil.which("node")


@pytest.mark.skipif(NODE is None or shutil.which("sleep") is None, reason="node and sleep required")
def test_stop_child_returns_for_live_signaled_and_exited_children():
    result = subprocess.run([NODE, str(HERE / "child-probe.mjs")], capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count("PASS") == 4
