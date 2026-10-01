"""Manual macOS metadata candidate check; never admits a production executable.

Only the official pinned 0.158.0 arm64 archive is used. No account, login,
model, thread or turn RPCs; no provider request or production admission change.
"""

import argparse
import asyncio
from datetime import datetime, timezone
from hashlib import file_digest, sha256
import json
import os
from pathlib import Path
import platform
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from services.worker.connectors.chatgpt_launch import (  # noqa: E402
    MANAGED_PROVIDER, SUPPORTED_VERSION, _command, _environment, _prepare_state,
    _settings, _state_lock, _verify_config,
)
from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError  # noqa: E402

VERSION = "codex-cli 0.158.0"
MEMBER = "codex-aarch64-apple-darwin"
ARCHIVE_URL = f"https://github.com/openai/codex/releases/download/rust-v0.158.0/{MEMBER}.tar.gz"
ARCHIVE_SHA256 = "341c4a08f9ce1935b3007376dc2a3d50a0a89112930e9a474ae61367218f6e8a"
BINARY_SHA256 = "788a818fbb9596869c7a487554507cb8bdca17584b8671112b23f9e225ba35c8"
METHODS = ("initialize", "initialized", "config/read", "configRequirements/read", "skills/list")


def digest(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def extract_candidate(archive, destination):
    if digest(archive) != ARCHIVE_SHA256:
        raise ValueError("archive_checksum_mismatch")
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        if (len(members) != 1 or members[0].name != MEMBER
                or not members[0].isfile() or members[0].size != 239662592):
            raise ValueError("archive_layout_mismatch")
        # Copy the single reviewed regular member, never unpack archive paths.
        with bundle.extractfile(members[0]) as source, destination.open("xb") as target:
            shutil.copyfileobj(source, target)
    if digest(destination) != BINARY_SHA256:
        raise ValueError("executable_checksum_mismatch")
    with destination.open("rb") as stream:
        if struct.unpack("<II", stream.read(8)) != (0xFEEDFACF, 0x0100000C):
            raise ValueError("executable_architecture_mismatch")
    destination.chmod(0o700)


def child_environment(state, home, temporary):
    # Reuse the connector's clean environment, narrowing it further for CI.
    inherited = _environment(state)
    return {"PATH": inherited["PATH"], "CODEX_HOME": inherited["CODEX_HOME"],
            "HOME": str(home), "TMPDIR": str(temporary), "LANG": "en_US.UTF-8"}


def restrict_metadata(client, methods):
    original_send = client._send

    async def send(message, **kwargs):
        if message.get("method") not in METHODS:
            raise ValueError("non_metadata_message_refused")
        methods.append(message["method"])
        return await original_send(message, **kwargs)

    client._send = send


async def measure(binary, scratch, receipt):
    state, cwd = scratch / "state", scratch / "work"
    home, temporary = scratch / "home", scratch / "tmp"
    for directory in (cwd, home, temporary):
        directory.mkdir(mode=0o700)
    _prepare_state(state)
    env = child_environment(state, home, temporary)
    with patch.dict(os.environ, {"LC_SUBSCRIPTION_CODEX_BIN": str(binary)}):
        command = _command(state)
    receipt["child_environment_keys"] = sorted(env)
    receipt["empty_cwd_before_start"] = not any(cwd.iterdir())
    receipt["settings_template_sha256"] = sha256(
        json.dumps(_settings(Path("/PRODUCT_STATE")), sort_keys=True).encode()).hexdigest()
    receipt["stage"] = "version"
    version = await asyncio.create_subprocess_exec(
        str(binary), "--version", cwd=str(cwd), env=env,
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, limit=1024)
    try:
        stdout, _ = await asyncio.wait_for(version.communicate(), 5)
        if version.returncode != 0 or stdout.strip() != VERSION.encode():
            raise ValueError("version_mismatch")
        receipt["version"] = VERSION
    finally:
        if version.returncode is None:
            version.kill()
        await asyncio.wait_for(version.wait(), 5)
        receipt["version_child_reaped"] = version.returncode is not None

    def verify(config, requirements, skills):
        # Complete unchanged production configuration/skills verifier; only
        # the Mac candidate measurement is separate from binary admission.
        receipt["configuration_verifier_entered"] = True
        receipt["metadata_step"] = "configuration_verifier"
        try:
            passed = _verify_config(config, requirements, skills, state=state, cwd=str(cwd))
        except RPCError as error:
            receipt["metadata_failure_code"] = error.code
            raise
        receipt["effective_configuration_passed"] = passed is True
        rows = skills["data"][0]["skills"]
        receipt["system_skills"] = {
            "count": len(rows), "all_disabled": all(row["enabled"] is False for row in rows)}
        return passed

    client = ChatGPTAppServer(command, cwd=str(cwd), env=env,
                              verify_config=verify, expected_provider=MANAGED_PROVIDER,
                              rpc_timeout=10, shutdown_timeout=3)
    receipt["outbound_methods"] = []
    restrict_metadata(client, receipt["outbound_methods"])
    original_rpc = client._rpc

    async def metadata_rpc(method, params, **kwargs):
        receipt["metadata_step"] = method
        try:
            return await original_rpc(method, params, **kwargs)
        except RPCError as error:
            # start() later normalizes errors; retain only the fixed code here.
            receipt["metadata_failure_code"] = error.code
            raise

    client._rpc = metadata_rpc
    receipt["stage"] = "metadata"
    with _state_lock(state):
        try:
            await asyncio.wait_for(client.start(), 50)
            if not client.isolation_verified or tuple(receipt["outbound_methods"]) != METHODS:
                raise ValueError("metadata_sequence_mismatch")
        finally:
            await client.close()
            receipt["app_server_child_reaped"] = (
                client._process is not None and client._process.returncode is not None)


def run(source_sha, output):
    receipt = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "scope": "macOS candidate metadata only; production binary admission unchanged",
        "expected_source_sha": source_sha, "assigned_baseline": "871aabd974a8b1c11d18072da7200b0a2413ae73",
        "platform": sys.platform, "architecture": platform.machine(),
        "macos_version": platform.mac_ver()[0], "python_version": platform.python_version(),
        "official_archive_url": ARCHIVE_URL, "official_asset_id": 594554175,
        "expected_archive_sha256": ARCHIVE_SHA256, "expected_executable_sha256": BINARY_SHA256,
        "effective_configuration_passed": False, "status": "failed", "stage": "source",
    }
    scratch = None
    try:
        actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        receipt["source_sha"] = actual
        if re.fullmatch(r"[0-9a-f]{40}", source_sha) is None or actual != source_sha:
            raise ValueError("source_sha_mismatch")
        subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=ROOT, check=True)
        source_files = (
            "services/worker/connectors/chatgpt_launch.py",
            "services/worker/connectors/chatgpt_rpc.py",
            "services/worker/connectors/chatgpt_receipts.py",
            "tests/probes/support/codex_macos_metadata.py",
            ".github/workflows/subscription-compatibility.yml")
        subprocess.run(["git", "ls-files", "--error-unmatch", "--", *source_files],
                       cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        receipt["source_file_sha256"] = {name: digest(ROOT / name) for name in source_files}
        receipt["stage"] = "platform"
        if sys.platform != "darwin" or platform.machine() != "arm64":
            raise ValueError("requires_native_macos_arm64")
        if SUPPORTED_VERSION != VERSION:
            raise ValueError("connector_version_changed")
        # Resolve macOS /var -> /private/var before the unchanged symlink checks.
        with tempfile.TemporaryDirectory(prefix="lc-macos-metadata-") as directory:
            scratch = Path(directory).resolve()
            archive, binary = scratch / "codex.tar.gz", scratch / MEMBER
            receipt["stage"] = "official_artifact"
            # No curlrc, inherited GitHub/provider credentials, retries or fallback.
            download = subprocess.run([
                "/usr/bin/curl", "-q", "--fail", "--silent", "--location",
                "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "10",
                "--max-time", "90", "--output", str(archive), "--write-out", "%{http_code}", ARCHIVE_URL,
            ], env={"PATH": os.defpath}, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=95)
            status = download.stdout.strip()
            receipt["download_http_status"] = status if re.fullmatch(r"[0-9]{3}", status) else "unavailable"
            download.check_returncode()
            receipt["archive_sha256"] = digest(archive)
            extract_candidate(archive, binary)
            receipt["executable_sha256"] = digest(binary)
            receipt["executable_architecture"] = "Mach-O 64-bit arm64"
            asyncio.run(measure(binary, scratch, receipt))
        receipt["stage"] = "complete"
        receipt["status"] = "passed"
    except Exception as error:
        # Never retain raw config, provider output, arbitrary error text or paths.
        receipt["failure_type"] = type(error).__name__
        if isinstance(error, ValueError):
            receipt["failure_code"] = str(error) if str(error) in {
                "archive_checksum_mismatch", "archive_layout_mismatch", "executable_checksum_mismatch",
                "executable_architecture_mismatch", "non_metadata_message_refused", "version_mismatch",
                "metadata_sequence_mismatch", "source_sha_mismatch", "requires_native_macos_arm64",
                "connector_version_changed",
            } else "invalid_metadata"
        elif isinstance(error, subprocess.CalledProcessError):
            receipt["failure_exit_code"] = error.returncode
        elif isinstance(error, RPCError):
            receipt["failure_code"] = error.code
    finally:
        receipt["temporary_state_removed"] = scratch is not None and not scratch.exists()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("status", "stage", "effective_configuration_passed")}))
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    raise SystemExit(run(args.source_sha, args.output))
