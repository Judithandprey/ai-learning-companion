"""Manual metadata-only check of the installed, exact managed connector launch.

Uses fresh temporary product state and never sends account, login, thread or turn
RPCs. This is not a model/provider acceptance test and is not run by pytest.
"""

import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

from services.worker.connectors.chatgpt_launch import (
    SUPPORTED_VERSION, _binary_identity, _settings, create_client,
)


async def check():
    with tempfile.TemporaryDirectory(prefix="lc-managed-config-check-") as temporary:
        with patch.dict(os.environ, {"LC_SUBSCRIPTION_STATE_DIR": str(Path(temporary) / "state")}):
            async with create_client() as client:
                methods = []
                original = client._rpc
                provider = {}
                skill_inventory = {}

                async def metadata_only(method, params, **kwargs):
                    if method not in {"initialize", "config/read", "configRequirements/read", "skills/list"}:
                        raise AssertionError("Non-metadata RPC refused")
                    methods.append(method)
                    result = await original(method, params, **kwargs)
                    if method == "config/read":
                        selected = result["config"]["model_provider"]
                        actual = result["config"]["model_providers"][selected]
                        for key in ("requires_openai_auth", "request_max_retries", "stream_max_retries",
                                    "wire_api", "supports_websockets", "base_url", "env_key", "auth"):
                            provider[key] = actual[key]
                        provider["id"] = selected
                        provider["default_chatgpt_endpoint"] = result["config"]["chatgpt_base_url"]
                    elif method == "skills/list":
                        rows = result["data"][0]["skills"]
                        skill_inventory.update(count=len(rows),
                                               names=sorted(row["name"] for row in rows),
                                               all_disabled=all(row["enabled"] is False for row in rows))
                    return result

                client._rpc = metadata_only
                version_process = await asyncio.create_subprocess_exec(
                    client.command[0], "--version", cwd=client.cwd, env=client.env,
                    stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL, limit=1024)
                try:
                    stdout, _ = await asyncio.wait_for(version_process.communicate(), 5)
                    assert version_process.returncode == 0 and stdout.strip() == SUPPORTED_VERSION.encode()
                finally:
                    if version_process.returncode is None:
                        version_process.kill()
                        await version_process.wait()
                await client.start()
                assert client.isolation_verified is True
                result = {
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                    "scope": "Fresh-state metadata only; no account, login, thread or turn RPC",
                    "codex": _binary_identity(client.command[0]),
                    "explicit_bin_override": "LC_SUBSCRIPTION_CODEX_BIN" in os.environ,
                    "settings_template_sha256": sha256(json.dumps(_settings(Path("/PRODUCT_STATE")), sort_keys=True).encode()).hexdigest(),
                    "rpc_methods": methods, "effective_configuration_passed": True,
                    "managed_provider": provider,
                    "system_skills": skill_inventory,
                }
                process = client._process
            result["owned_child_reaped"] = process.returncode is not None
            result["empty_workdir_removed"] = not Path(client.cwd).exists()
    result["temporary_state_removed"] = not Path(temporary).exists()
    return result


if __name__ == "__main__":
    print(json.dumps(asyncio.run(check()), indent=2))
