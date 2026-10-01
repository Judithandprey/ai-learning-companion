"""Audit already-generated Codex 0.158.0 schemas; never start a server or read auth.

Usage: python3 tests/probes/support/codex_app_server_schema_check.py SCHEMA_ROOT
SCHEMA_ROOT contains stable/, experimental/, features.txt, feature-overrides.txt.
"""

import hashlib
import json
from pathlib import Path
import sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def audit(root):
    selected = [
        "ClientRequest.json", "ServerNotification.json", "JSONRPCError.json",
        "v1/InitializeParams.json", "v1/InitializeResponse.json",
        "v2/GetAccountParams.json", "v2/GetAccountResponse.json",
        "v2/LoginAccountParams.json", "v2/LoginAccountResponse.json",
        "v2/CancelLoginAccountParams.json", "v2/CancelLoginAccountResponse.json",
        "v2/AccountLoginCompletedNotification.json",
        "v2/AccountUpdatedNotification.json", "v2/GetAccountRateLimitsResponse.json",
        "v2/NullableGetAccountRateLimitsParams.json",
        "v2/AccountRateLimitsUpdatedNotification.json",
        "v2/ModelListParams.json", "v2/ModelListResponse.json",
        "v2/ThreadStartParams.json", "v2/ThreadStartResponse.json",
        "v2/TurnStartParams.json", "v2/TurnStartResponse.json",
        "v2/TurnInterruptParams.json", "v2/TurnInterruptResponse.json",
        "v2/TurnCompletedNotification.json", "v2/ErrorNotification.json",
        "v2/AgentMessageDeltaNotification.json", "v2/ConfigReadResponse.json",
    ]

    def schema(name, experimental=False):
        return json.loads((root / ("experimental" if experimental else "stable") / name).read_text())

    def methods(name):
        return {
            item["properties"]["method"]["enum"][0]
            for item in schema(name)["oneOf"]
        }

    required_requests = {
        "account/read", "account/login/start", "account/login/cancel",
        "account/rateLimits/read", "model/list", "thread/start", "turn/start",
        "turn/interrupt",
    }
    required_notifications = {
        "account/login/completed", "account/updated", "account/rateLimits/updated",
        "turn/completed", "error", "item/agentMessage/delta",
    }
    assert required_requests <= methods("ClientRequest.json")
    assert required_notifications <= methods("ServerNotification.json")
    turn = schema("v2/TurnStartParams.json")
    inputs = {
        item["properties"]["type"]["enum"][0]: item
        for item in turn["definitions"]["UserInput"]["oneOf"]
    }
    assert {"text", "image", "localImage"} <= inputs.keys()
    assert "path" in inputs["localImage"]["required"]
    assert any("url" in variant["properties"] for variant in inputs["image"]["anyOf"])
    assert any("fileId" in variant["properties"] for variant in inputs["image"]["anyOf"])
    model = schema("v2/ModelListResponse.json")["definitions"]["Model"]
    assert "inputModalities" in model["properties"]
    assert "inputModalities" not in model["required"]
    assert "supportedReasoningEfforts" in model["required"]
    assert set(schema("v2/TurnInterruptParams.json")["required"]) == {"threadId", "turnId"}
    statuses = schema("v2/TurnCompletedNotification.json")["definitions"]["TurnStatus"]["enum"]
    assert set(statuses) == {"inProgress", "completed", "failed", "interrupted"}

    # Record version-specific limits; do not silently treat newer docs as this build.
    for experimental in [False, True]:
        thread = schema("v2/ThreadStartParams.json", experimental)["properties"]
        assert "tools" not in thread and "toolConfig" not in thread
        sandbox = schema("v2/TurnStartParams.json", experimental)["definitions"]["SandboxPolicy"]
        readonly = next(item for item in sandbox["oneOf"] if item["title"] == "ReadOnlySandboxPolicy")
        assert set(readonly["properties"]) == {"type", "networkAccess"}
    assert "dynamicTools" not in schema("v2/ThreadStartParams.json")["properties"]
    assert "dynamicTools" in schema("v2/ThreadStartParams.json", True)["properties"]
    tools = schema("v2/ConfigReadResponse.json")["definitions"]["ToolsV2"]
    assert set(tools["properties"]) == {"web_search"}
    disabled_plugins = schema("v2/ThreadStartResponse.json")["properties"]["disabledPluginIds"]
    assert "Does not yet filter plugin capabilities" in disabled_plugins["description"]

    bundles = {}
    for kind in ["stable", "experimental"]:
        hashes = {
            str(path.relative_to(root / kind)): digest(path.read_bytes())
            for path in sorted((root / kind).rglob("*.json"))
        }
        manifest = "".join(f"{name}\0{value}\n" for name, value in sorted(hashes.items()))
        bundles[kind] = {
            "file_count": len(hashes),
            "manifest_sha256": digest(manifest.encode()),
            "selected_sha256": {name: hashes[name] for name in selected},
        }

    features = {}
    for name in ["features.txt", "feature-overrides.txt"]:
        text = (root / name).read_text()
        values = {
            parts[0]: parts[-1] == "true"
            for line in text.splitlines()
            if (parts := line.split()) and parts[-1] in {"true", "false"}
        }
        features[name] = {"sha256": digest(text.encode()), "values": values}
    # This observed mismatch is a finding, not a successful tool-disable claim.
    assert features["feature-overrides.txt"]["values"]["unified_exec"] is True
    assert features["feature-overrides.txt"]["values"]["hooks"] is False
    assert features["feature-overrides.txt"]["values"]["shell_tool"] is False
    return {
        "scope": "Offline schema and CLI feature-output audit only; no RPC, login or inference",
        "expected_cli": "codex-cli 0.158.0",
        "checks_passed": True,
        "bundles": bundles,
        "request_methods": sorted(required_requests),
        "notification_methods": sorted(required_notifications),
        "turn_statuses": statuses,
        "image_inputs": {name: inputs[name] for name in ["text", "image", "localImage"]},
        "observed_limits": {
            "readonly_access_field": False,
            "global_thread_tools_field": False,
            "dynamic_tools_experimental_only": True,
            "disabled_plugin_ids_filter_capabilities": False,
            "unified_exec_remained_enabled_after_disable": True,
            "tool_free_inference_verified": False,
            "account_entitlement_verified": False,
        },
        "feature_receipts": features,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(json.dumps(audit(Path(sys.argv[1])), indent=2, sort_keys=True))
