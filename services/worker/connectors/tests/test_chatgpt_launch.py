"""Launch configuration/filesystem controls only; never start a Codex child."""

import asyncio
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
import tomllib

import pytest

from services.worker.connectors import chatgpt_launch as launch
from services.worker.connectors.chatgpt_rpc import RPCError


MEASURED_SHA256 = "167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9"
MEASURED_MACOS_SHA256 = "788a818fbb9596869c7a487554507cb8bdca17584b8671112b23f9e225ba35c8"
SYSTEM_SKILLS = ("imagegen", "openai-docs", "plugin-creator", "review-agent", "skill-creator", "skill-installer")


def synthetic_binary_identity(executable):
    """Metadata seam only; these factory tests never run the selected binary."""
    return {"executable": str(Path(executable).resolve()), "version": "codex-cli 0.158.0", "sha256": MEASURED_SHA256}


def measured_settings(state):
    """Independent synthetic statement of Support's complete measured controls."""
    return {
        "forced_login_method": "chatgpt",
        "cli_auth_credentials_store": "file",
        "approval_policy": "never",
        "sandbox_mode": "read-only",
        "web_search": "disabled",
        "project_doc_max_bytes": 0,
        "allow_login_shell": False,
        "analytics": {"enabled": False},
        "shell_environment_policy": {"inherit": "none"},
        "skills": {"config": [
            {"path": str(state / "skills" / ".system" / name / "SKILL.md"), "enabled": False}
            for name in SYSTEM_SKILLS
        ]},
        "features": {
            "hooks": False, "shell_tool": False, "shell_snapshot": False,
            "code_mode": False, "code_mode_host": False, "code_mode_prewarm": False,
            "apps": False, "plugins": False, "remote_plugin": False,
            "browser_use": False, "computer_use": False, "image_generation": False,
            "view_image": False, "multi_agent": False, "multi_agent_v2": False,
            "goals": False, "memories": False, "skill_mcp_dependency_install": False,
            "skill_search": False, "tool_suggest": False, "workspace_dependencies": False,
            "daemon_auto_start": False, "enable_request_compression": False,
            "skip_host_skill_discovery": True,
        },
        "model_provider": "lc_managed_chatgpt",
        "model_providers": {"lc_managed_chatgpt": {
            "name": "Learning Companion managed ChatGPT", "wire_api": "responses",
            "requires_openai_auth": True, "request_max_retries": 0,
            "stream_max_retries": 0, "supports_websockets": False,
        }},
    }


def config_leaves(value, prefix=""):
    for name, child in value.items():
        path = f"{prefix}.{name}" if prefix else name
        if isinstance(child, dict):
            yield from config_leaves(child, path)
        else:
            yield path, child


def effective_response(state):
    supplied = measured_settings(state)
    config = deepcopy(supplied)
    config.update(chatgpt_base_url="https://chatgpt.com/backend-api/", openai_base_url=None)
    config.update({key: None for key in (
        "hooks", "apps", "tools", "developer_instructions", "instructions",
        "model_instructions_file", "notify", "profile", "model_catalog_json",
    )})
    config.update(mcp_servers={}, plugins={}, profiles={})
    config["model_providers"]["lc_managed_chatgpt"].update(
        base_url=None, env_key=None, env_key_instructions=None, experimental_bearer_token=None,
        http_headers=None, env_http_headers=None, query_params=None,
        stream_idle_timeout_ms=None, websocket_connect_timeout_ms=None,
        supports_standalone_web_search=False,
    )
    # These two aliases are how 0.158.0 reports effective origins, even though
    # raw session flags and effective values use the unsuffixed feature names.
    origins = {}
    for key, _ in config_leaves(supplied):
        if key == "skills.config":
            continue
        if key in {"features.code_mode", "features.multi_agent_v2"}:
            key += ".enabled"
        origins[key] = {"name": {"type": "sessionFlags"}, "version": "synthetic"}
    # Official array origins identify each scalar, with no aggregate entry.
    for index in range(6):
        for field in ("path", "enabled"):
            origins[f"skills.config.{index}.{field}"] = {
                "name": {"type": "sessionFlags"}, "version": "synthetic"}
    return {
        "config": config,
        "origins": origins,
        "layers": [
            {"name": {"type": "system", "file": "/etc/codex/config.toml"}, "config": {}, "version": "synthetic"},
            {"name": {"type": "user", "file": str(state / "config.toml"), "profile": None}, "config": {}, "version": "synthetic"},
            {"name": {"type": "sessionFlags"}, "config": supplied, "version": "synthetic"},
        ],
    }


def skill_metadata(state, cwd):
    return {"data": [{"cwd": cwd, "errors": [], "skills": [
        {"name": name, "path": str(state / "skills" / ".system" / name / "SKILL.md"),
         "scope": "system", "enabled": False, "pluginId": None}
        for name in SYSTEM_SKILLS
    ]}]}


def verify_config(response, requirements, *, state, skills=None):
    cwd = str(state.parent / "controlled-work")
    if skills is None:
        skills = skill_metadata(state, cwd)
    return launch._verify_config(response, requirements, skills, state=state, cwd=cwd)


def generated_bundle(state):
    """Names/types only; synthetic contents are never executed or trusted."""
    system = state / "skills" / ".system"
    system.mkdir(parents=True)
    (system / ".codex-system-skills.marker").write_bytes(b"synthetic packaged marker")
    for name in SYSTEM_SKILLS:
        folder = system / name
        folder.mkdir()
        (folder / "SKILL.md").write_text("synthetic disabled skill", encoding="utf-8")
    return system


@pytest.fixture
def attestation(tmp_path):
    state = tmp_path / "config-gate-state"
    launch._prepare_state(state)
    return state, effective_response(state), {"requirements": {"allowedLoginMethods": ["chatgpt"], "allowedApprovalPolicies": None}}


def set_path(value, path, replacement):
    parts = path.split(".")
    for part in parts[:-1]:
        value = value[part]
    value[parts[-1]] = replacement


@pytest.fixture
def factory(tmp_path, monkeypatch):
    instances = []

    class FakeClient:
        def __init__(self, command, **kwargs):
            self.command = command
            self.options = kwargs
            self.closed = False
            instances.append(self)

        async def close(self):
            assert Path(self.options["cwd"]).is_dir()
            self.closed = True

    monkeypatch.setattr(launch, "ChatGPTAppServer", FakeClient)
    monkeypatch.setattr(launch, "_binary_identity", synthetic_binary_identity)
    monkeypatch.setenv("LC_SUBSCRIPTION_CODEX_BIN", sys.executable)
    monkeypatch.setenv("LC_SUBSCRIPTION_STATE_DIR", str(tmp_path / "owned-state"))
    return instances


def test_factory_constructs_without_starting_and_closes_before_removing_cwd(factory, tmp_path):
    async def scenario():
        async with launch.create_client() as client:
            work = Path(client.options["cwd"])
            assert work.is_dir() and not list(work.iterdir())
            assert work != tmp_path / "owned-state"
            assert client.options["env"]["CODEX_HOME"] == str(tmp_path / "owned-state")
            assert callable(client.options["verify_config"])
            assert client.options.get("isolation_verified", False) is False
            assert client.options["expected_provider"] == "lc_managed_chatgpt"
            assert not client.closed
        assert client.closed and not work.exists()
        assert (tmp_path / "owned-state" / launch._MARKER).read_bytes() == launch._MARKER_BYTES

    asyncio.run(scenario())
    assert len(factory) == 1


def test_managed_auth_is_never_opened_and_survives_reopen(factory, tmp_path, monkeypatch):
    async def scenario():
        async with launch.create_client():
            pass
        state = tmp_path / "owned-state"
        auth = state / "auth.json"
        synthetic = b"synthetic credential fixture never loaded by launcher"
        auth.write_bytes(synthetic)
        original_read = Path.read_bytes

        def deny_auth_read(path):
            assert path != auth, "launcher must not inspect credential bytes"
            return original_read(path)

        with monkeypatch.context() as patch:
            patch.setattr(Path, "read_bytes", deny_auth_read)
            async with launch.create_client() as client:
                assert client.options["env"]["CODEX_HOME"] == str(state)
        assert auth.read_bytes() == synthetic
        assert factory[0].options["cwd"] != factory[1].options["cwd"]

    asyncio.run(scenario())


def test_private_environment_preserves_home_and_drops_agent_and_provider_inputs(factory, monkeypatch):
    original_home = os.environ.get("HOME")
    for name in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "CODEX_HOME", "CODEX_CONFIG",
                 "ANTHROPIC_API_KEY", "AGENTSDOCK_AUTHORITY_FILE", "PYTHONPATH",
                 "NODE_OPTIONS", "BASH_ENV", "LD_PRELOAD", "LC_SUBSCRIPTION_ISOLATION_VERIFIED"):
        monkeypatch.setenv(name, "synthetic-inherited-value")
    monkeypatch.setenv("PATH", "/synthetic/agent/helpers")

    async def scenario():
        async with launch.create_client() as client:
            env = client.options["env"]
            assert env.get("HOME") == original_home
            assert env["CODEX_HOME"] == os.environ["LC_SUBSCRIPTION_STATE_DIR"]
            assert callable(client.options["verify_config"])
            assert client.options.get("isolation_verified", False) is False
            assert not any("synthetic-inherited-value" == value for value in env.values())
            assert "LC_SUBSCRIPTION_STATE_DIR" not in env
            assert "LC_SUBSCRIPTION_CODEX_BIN" not in env
            assert env["PATH"] != os.environ["PATH"]

    asyncio.run(scenario())


def test_command_has_complete_measured_flags_and_managed_zero_retry_provider(factory):
    async def scenario():
        async with launch.create_client() as client:
            args = client.command
            assert args[:5] == [str(Path(sys.executable).resolve()), "app-server", "--listen", "stdio://", "--strict-config"]
            settings = [args[index + 1] for index, arg in enumerate(args) if arg == "-c"]
            assert 'forced_login_method="chatgpt"' in settings
            assert 'cli_auth_credentials_store="file"' in settings
            assert 'approval_policy="never"' in settings
            assert 'sandbox_mode="read-only"' in settings
            assert 'web_search="disabled"' in settings
            assert "project_doc_max_bytes=0" in settings
            actual = dict(value.split("=", 1) for value in settings)
            expected = measured_settings(Path(client.options["env"]["CODEX_HOME"]))
            # Parse real TOML, including the array of inline skill tables.
            # JSON object syntax for that argv value would not disable skills.
            assert json.dumps(tomllib.loads("\n".join(settings)), sort_keys=True) == json.dumps(expected, sort_keys=True)
            assert len(actual) == len(settings)
            # The measured aggregate tool restriction does not require the
            # printed unified_exec flag to be false.
            assert "features.unified_exec" not in actual
            assert client.options.get("isolation_verified", False) is False

    asyncio.run(scenario())


@pytest.mark.parametrize("value", ["relative-state", "", "/tmp/../relative-state"])
def test_state_path_must_be_explicitly_absolute_and_normal(factory, monkeypatch, value):
    monkeypatch.setenv("LC_SUBSCRIPTION_STATE_DIR", value)

    async def scenario():
        with pytest.raises(RPCError) as error:
            async with launch.create_client():
                pytest.fail("invalid state path was adopted")
        assert error.value.code == "unavailable"
        if value:
            assert value not in str(error.value)

    asyncio.run(scenario())
    assert factory == []


def test_unmarked_nonempty_state_is_not_adopted_or_changed(factory, tmp_path):
    state = tmp_path / "owned-state"
    state.mkdir()
    original = state / "auth.json"
    original.write_bytes(b"unrelated synthetic existing home")

    async def scenario():
        with pytest.raises(RPCError):
            async with launch.create_client():
                pytest.fail("nonempty unowned directory was adopted")

    asyncio.run(scenario())
    assert list(state.iterdir()) == [original]
    assert original.read_bytes() == b"unrelated synthetic existing home"
    assert factory == []


@pytest.mark.parametrize("name", ["config.toml", "AGENTS.md", "AGENTS.override.md", "hooks.json", "hooks", "skills", "plugins"])
def test_owned_state_refuses_instruction_tool_and_config_overrides(factory, tmp_path, name):
    async def scenario():
        async with launch.create_client():
            pass
        override = tmp_path / "owned-state" / name
        override.write_bytes(b"synthetic forbidden override")
        with pytest.raises(RPCError) as error:
            async with launch.create_client():
                pytest.fail("override was accepted")
        assert error.value.code == "unavailable"
        assert override.read_bytes() == b"synthetic forbidden override"

    asyncio.run(scenario())
    assert len(factory) == 1


@pytest.mark.parametrize("component", ["state", "ancestor", "marker", "auth"])
def test_state_symlinks_are_rejected_without_following_contents(factory, tmp_path, monkeypatch, component):
    destination = tmp_path / "target"
    destination.mkdir()
    state = tmp_path / "owned-state"

    async def scenario():
        if component in ("marker", "auth"):
            async with launch.create_client():
                pass
            name = launch._MARKER if component == "marker" else "auth.json"
            existing = state / name
            if existing.exists():
                existing.unlink()
            existing.symlink_to(destination / "never-read")
        else:
            state.symlink_to(destination, target_is_directory=True)
            if component == "ancestor":
                monkeypatch.setenv("LC_SUBSCRIPTION_STATE_DIR", str(state / "nested"))
        with pytest.raises(RPCError):
            async with launch.create_client():
                pytest.fail("symlink state accepted")
        assert not list(destination.iterdir())

    asyncio.run(scenario())


def test_state_lock_prevents_overlapping_clients_and_releases_after_close(factory):
    async def scenario():
        async with launch.create_client() as first:
            with pytest.raises(RPCError) as error:
                async with launch.create_client():
                    pytest.fail("overlapping managed child allowed")
            assert error.value.code == "busy"
            assert not first.closed
        async with launch.create_client() as second:
            assert first.closed and second is not first

    asyncio.run(scenario())
    assert len(factory) == 2


@pytest.mark.parametrize("failure", [RuntimeError, asyncio.CancelledError])
def test_failure_or_cancellation_closes_client_and_releases_state(factory, failure):
    async def scenario():
        with pytest.raises(failure):
            async with launch.create_client() as client:
                work = Path(client.options["cwd"])
                raise failure("synthetic operation ended")
        assert client.closed and not work.exists()
        async with launch.create_client():
            pass

    asyncio.run(scenario())


def test_default_uses_product_local_data_and_installed_path_without_adopting_codex_home(factory, tmp_path, monkeypatch):
    monkeypatch.delenv("LC_SUBSCRIPTION_STATE_DIR")
    monkeypatch.delenv("LC_SUBSCRIPTION_CODEX_BIN")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.setattr(launch.shutil, "which", lambda name: sys.executable if name == "codex" else None)

    async def scenario():
        async with launch.create_client() as client:
            state = Path(client.options["env"]["CODEX_HOME"])
            assert state.name == "managed-chatgpt"
            assert state.parent.name == "LearningCompanion"
            assert state != tmp_path / ".codex"
            assert state.is_relative_to(tmp_path)

    asyncio.run(scenario())


@pytest.mark.parametrize("binary", ["relative-codex", "/definitely-missing/lc-codex"])
def test_missing_or_relative_trusted_binary_is_sanitized_before_state_creation(factory, tmp_path, monkeypatch, binary):
    monkeypatch.setenv("LC_SUBSCRIPTION_CODEX_BIN", binary)

    async def scenario():
        with pytest.raises(RPCError) as error:
            async with launch.create_client():
                pytest.fail("missing executable accepted")
        assert error.value.code == "unavailable"
        assert binary not in str(error.value)

    asyncio.run(scenario())
    assert not (tmp_path / "owned-state").exists()
    assert factory == []


@pytest.mark.parametrize("system,machine,digest_setting", [
    ("linux", "x86_64", "SUPPORTED_BINARY_SHA256"),
    ("darwin", "arm64", "SUPPORTED_MACOS_BINARY_SHA256"),
])
def test_binary_identity_hashes_synthetic_bytes_and_binds_the_measured_version(tmp_path, monkeypatch, system, machine, digest_setting):
    # Substitute only the expected digest for this inert test file. No executable
    # is launched, and this is not acceptance of an actual installed Codex build.
    assert launch.SUPPORTED_BINARY_SHA256 == MEASURED_SHA256
    assert launch.SUPPORTED_MACOS_BINARY_SHA256 == MEASURED_MACOS_SHA256
    binary = tmp_path / "not-executed-codex"
    contents = b"synthetic exact executable bytes"
    binary.write_bytes(contents)
    binary.chmod(0o700)
    monkeypatch.setattr(launch, digest_setting, hashlib.sha256(contents).hexdigest())
    monkeypatch.setattr(sys, "platform", system)
    monkeypatch.setattr(platform, "machine", lambda: machine)
    assert launch._binary_identity(str(binary)) == {
        "executable": str(binary.resolve()), "version": "codex-cli 0.158.0", "sha256": hashlib.sha256(contents).hexdigest()}
    binary.write_bytes(b"synthetic different version or substituted bytes")
    with pytest.raises(RPCError):
        launch._binary_identity(str(binary))


@pytest.mark.parametrize("system,machine", [
    ("darwin", "x86_64"), ("win32", "AMD64"), ("linux", "aarch64"),
    ("darwin", "aarch64"), ("linux", "arm64"), ("freebsd", "x86_64"),
])
def test_matching_bytes_do_not_authorize_unmeasured_platform(tmp_path, monkeypatch, system, machine):
    binary = tmp_path / "synthetic-codex"
    binary.write_bytes(b"synthetic bytes")
    binary.chmod(0o700)
    digest = hashlib.sha256(binary.read_bytes()).hexdigest()
    monkeypatch.setattr(launch, "SUPPORTED_BINARY_SHA256", digest)
    monkeypatch.setattr(launch, "SUPPORTED_MACOS_BINARY_SHA256", digest)
    monkeypatch.setattr(sys, "platform", system)
    monkeypatch.setattr(platform, "machine", lambda: machine)

    def refuse_open(*args, **kwargs):
        pytest.fail("unknown platform must be refused before reading binary bytes")

    monkeypatch.setattr(Path, "open", refuse_open)
    with pytest.raises(RPCError):
        launch._binary_identity(str(binary))


@pytest.mark.parametrize("system,machine,wrong_contents", [
    ("linux", "x86_64", b"synthetic Darwin arm64 executable"),
    ("darwin", "arm64", b"synthetic Linux x86_64 executable"),
])
def test_platform_cannot_admit_the_other_platforms_known_hash(tmp_path, monkeypatch, system, machine, wrong_contents):
    # Expected hashes are substituted only for inert fixture files; the actual
    # file hashing and platform-to-digest selection still execute normally.
    monkeypatch.setattr(launch, "SUPPORTED_BINARY_SHA256", hashlib.sha256(b"synthetic Linux x86_64 executable").hexdigest())
    monkeypatch.setattr(launch, "SUPPORTED_MACOS_BINARY_SHA256", hashlib.sha256(b"synthetic Darwin arm64 executable").hexdigest())
    monkeypatch.setattr(sys, "platform", system)
    monkeypatch.setattr(platform, "machine", lambda: machine)
    binary = tmp_path / "not-executed-cross-platform-codex"
    binary.write_bytes(wrong_contents)
    with pytest.raises(RPCError) as error:
        launch._binary_identity(str(binary))
    assert error.value.code == "isolation_unverified"


def test_unverified_binary_cannot_create_state_or_construct_client(factory, tmp_path, monkeypatch):
    def refuse(_executable):
        raise RPCError("isolation_unverified")

    monkeypatch.setattr(launch, "_binary_identity", refuse)
    monkeypatch.setenv("LC_SUBSCRIPTION_ISOLATION_VERIFIED", "true")

    async def scenario():
        with pytest.raises(RPCError):
            async with launch.create_client():
                pytest.fail("an environment flag bypassed measured executable identity")

    asyncio.run(scenario())
    assert factory == [] and not (tmp_path / "owned-state").exists()


def test_config_gate_accepts_complete_measured_configuration_without_mutating_it(attestation):
    state, response, requirements = attestation
    response["config"]["features"]["unified_exec"] = True
    original = deepcopy((response, requirements))
    assert verify_config(response, requirements, state=state) is True
    assert (response, requirements) == original
    # The official response also permits an explicit null requirements object.
    assert verify_config(response, {"requirements": None}, state=state) is True


@pytest.mark.parametrize("path,value", [
    ("forced_login_method", "api"),
    ("approval_policy", "on-request"),
    ("sandbox_mode", "workspace-write"),
    ("web_search", "live"),
    ("project_doc_max_bytes", False),
    ("allow_login_shell", True),
    ("analytics.enabled", 0),
    ("shell_environment_policy.inherit", "all"),
    ("features.hooks", True),
    ("features.shell_tool", True),
    ("features.enable_request_compression", True),
    ("features.skip_host_skill_discovery", False),
    ("model_provider", "openai"),
    ("chatgpt_base_url", "https://synthetic.invalid/backend-api/"),
    ("openai_base_url", "https://synthetic.invalid/v1"),
])
def test_effective_config_drift_refuses_even_with_intact_session_flags(attestation, path, value):
    state, response, requirements = attestation
    set_path(response["config"], path, value)
    with pytest.raises(RPCError) as error:
        verify_config(response, requirements, state=state)
    assert error.value.code == "isolation_unverified"
    assert "synthetic.invalid" not in str(error.value)


@pytest.mark.parametrize("key,value", [
    ("request_max_retries", 1), ("request_max_retries", False),
    ("stream_max_retries", "0"), ("stream_max_retries", None),
    ("requires_openai_auth", False), ("wire_api", "chat"),
    ("supports_websockets", True),
    ("base_url", "https://synthetic.invalid/v1"),
    ("env_key", "SYNTHETIC_API_KEY"),
    ("experimental_bearer_token", "synthetic-not-a-token"),
    ("http_headers", {"x-synthetic": "override"}),
])
def test_managed_provider_must_preserve_auth_default_endpoint_and_zero_retries(attestation, key, value):
    state, response, requirements = attestation
    response["config"]["model_providers"]["lc_managed_chatgpt"][key] = value
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


def test_missing_retry_setting_and_additional_provider_refuse(attestation):
    state, response, requirements = attestation
    missing = deepcopy(response)
    del missing["config"]["model_providers"]["lc_managed_chatgpt"]["stream_max_retries"]
    with pytest.raises(RPCError):
        verify_config(missing, requirements, state=state)
    response["config"]["model_providers"]["unselected"] = {"base_url": "https://synthetic.invalid"}
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


@pytest.mark.parametrize("key,value", [
    ("hooks", {"SessionStart": [{"command": "synthetic-never-executed"}]}),
    ("skills", {"enabled": True}), ("apps", {"enabled": True}),
    ("tools", {"web_search": True}), ("mcp_servers", {"synthetic": {"command": "never-executed"}}),
    ("plugins", {"synthetic": True}), ("profiles", {"synthetic": {"approval_policy": "never"}}),
    ("developer_instructions", "synthetic hidden instruction"),
    ("instructions", "synthetic hidden instruction"),
    ("model_instructions_file", "/synthetic/AGENTS.md"),
    ("notify", ["synthetic-never-executed"]), ("profile", "synthetic"),
    ("model_catalog_json", "/synthetic/catalog.json"),
])
def test_inherited_effective_tools_and_instruction_overrides_refuse(attestation, key, value):
    state, response, requirements = attestation
    response["config"][key] = value
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


@pytest.mark.parametrize("mutation", [
    "nonempty-system", "nonempty-user", "project", "foreign-user",
    "profile", "disabled", "extra-session-key", "duplicate-session", "missing-session",
])
def test_config_layer_provenance_must_be_the_owned_active_session(attestation, mutation):
    state, response, requirements = attestation
    layers = response["layers"]
    if mutation in {"nonempty-system", "nonempty-user"}:
        layers[mutation == "nonempty-user"]["config"] = {"features": {"hooks": False}}
    elif mutation == "project":
        layers[0]["name"] = {"type": "project", "dotCodexFolder": "/synthetic/.codex"}
    elif mutation == "foreign-user":
        layers[1]["name"]["file"] = "/synthetic/foreign/config.toml"
    elif mutation == "profile":
        layers[1]["name"]["profile"] = "synthetic"
    elif mutation == "disabled":
        layers[2]["disabledReason"] = "synthetic disabled session"
    elif mutation == "extra-session-key":
        layers[2]["config"]["mcp_servers"] = {}
    elif mutation == "duplicate-session":
        layers.append(deepcopy(layers[2]))
    else:
        layers.pop()
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


@pytest.mark.parametrize("mutation", ["user-origin", "missing-origin", "missing-value", "missing-config", "empty-layers"])
def test_missing_or_wrong_effective_attestation_is_not_trusted(attestation, mutation):
    state, response, requirements = attestation
    if mutation == "user-origin":
        response["origins"]["features.code_mode.enabled"]["name"]["type"] = "user"
    elif mutation == "missing-origin":
        del response["origins"]["features.multi_agent_v2.enabled"]
    elif mutation == "missing-value":
        del response["config"]["features"]["shell_tool"]
    elif mutation == "missing-config":
        del response["config"]
    else:
        response["layers"] = []
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


@pytest.mark.parametrize("requirements", [
    {}, {"requirements": []}, {"requirements": {"allowedLoginMethods": ["chatgpt", "api"]}},
    {"requirements": {"allowedApprovalPolicies": ["never"]}},
    {"requirements": {"mcpServers": {}}}, {"requirements": {"hooks": {}}},
])
def test_managed_requirements_cannot_silently_add_policy_or_tools(attestation, requirements):
    state, response, _ = attestation
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


def test_factory_callback_rechecks_owned_state_and_retains_evidence_on_failure(factory, tmp_path):
    async def scenario():
        state = tmp_path / "owned-state"
        with pytest.raises(RPCError):
            async with launch.create_client() as client:
                response = effective_response(state)
                verify = client.options["verify_config"]
                assert verify(response, {"requirements": None}, skill_metadata(state, client.options["cwd"])) is True
                # This is a synthetic post-startup local change, not a copied
                # account file. The same callback runs before each real thread.
                instruction = state / "AGENTS.md"
                instruction.write_text("synthetic unexpected instructions", encoding="utf-8")
                verify(response, {"requirements": None}, skill_metadata(state, client.options["cwd"]))
        assert client.closed
        assert not Path(client.options["cwd"]).exists()
        assert instruction.read_text(encoding="utf-8") == "synthetic unexpected instructions"

    asyncio.run(scenario())


@pytest.mark.parametrize("mutation", [
    "enabled", "numeric-false", "user", "repo", "admin", "foreign-path",
    "plugin", "missing", "extra", "duplicate", "errors", "missing-errors",
    "wrong-cwd", "extra-cwd", "missing-data",
])
def test_skill_inventory_requires_exact_disabled_system_paths(attestation, mutation):
    state, response, requirements = attestation
    metadata = skill_metadata(state, str(state.parent / "controlled-work"))
    entry = metadata["data"][0]
    rows = entry["skills"]
    if mutation == "enabled":
        rows[0]["enabled"] = True
    elif mutation == "numeric-false":
        rows[0]["enabled"] = 0
    elif mutation in {"user", "repo", "admin"}:
        rows[0]["scope"] = mutation
    elif mutation == "foreign-path":
        rows[0]["path"] = str(state.parent / ".codex" / "skills" / "imagegen" / "SKILL.md")
    elif mutation == "plugin":
        rows[0]["pluginId"] = "synthetic-plugin"
    elif mutation == "missing":
        rows.pop()
    elif mutation == "extra":
        rows.append({**rows[0], "path": str(state / "skills" / "additional" / "SKILL.md")})
    elif mutation == "duplicate":
        rows[-1] = deepcopy(rows[0])
    elif mutation == "errors":
        entry["errors"] = [{"path": "/synthetic/skill", "message": "synthetic failure"}]
    elif mutation == "missing-errors":
        del entry["errors"]
    elif mutation == "wrong-cwd":
        entry["cwd"] = str(state)
    elif mutation == "extra-cwd":
        metadata["data"].append(deepcopy(entry))
    else:
        del metadata["data"]
    with pytest.raises(RPCError) as error:
        verify_config(response, requirements, state=state, skills=metadata)
    assert error.value.code == "isolation_unverified"


@pytest.mark.parametrize("mutation", ["folder", "foreign-state", "missing", "enabled", "origin"])
def test_skill_disable_config_is_bound_to_each_owned_skill_file(attestation, mutation):
    state, response, requirements = attestation
    rows = response["config"]["skills"]["config"]
    if mutation == "folder":
        rows[0]["path"] = str(Path(rows[0]["path"]).parent)
    elif mutation == "foreign-state":
        rows[0]["path"] = str(state.parent / "other-state" / "skills" / ".system" / "imagegen" / "SKILL.md")
    elif mutation == "missing":
        rows.pop()
    elif mutation == "enabled":
        rows[0]["enabled"] = True
    else:
        response["origins"]["skills.config.0.path"]["name"]["type"] = "user"
    with pytest.raises(RPCError):
        verify_config(response, requirements, state=state)


@pytest.mark.parametrize("key,mutation", [
    ("skills.config.5.path", "missing"), ("skills.config.5.enabled", "changed"),
])
def test_single_skill_element_origin_cannot_be_missing_or_inherited(attestation, key, mutation):
    state, response, requirements = attestation
    assert "skills.config" not in response["origins"]
    assert verify_config(response, requirements, state=state) is True
    if mutation == "missing":
        del response["origins"][key]
    else:
        response["origins"][key]["name"]["type"] = "system"
    with pytest.raises(RPCError) as error:
        verify_config(response, requirements, state=state)
    assert error.value.code == "isolation_unverified"


def test_reopened_generated_bundle_is_disabled_without_reading_or_removing_its_contents(factory, tmp_path, monkeypatch):
    async def scenario():
        state = tmp_path / "owned-state"
        async with launch.create_client():
            pass
        system = generated_bundle(state)
        (system / "imagegen" / "resources").mkdir()
        (system / "imagegen" / "resources" / "synthetic.txt").write_bytes(b"never trusted")
        original_read_bytes = Path.read_bytes
        original_read_text = Path.read_text

        def safe_bytes(path):
            assert not path.is_relative_to(state / "skills"), "bundle content must not be consumed"
            return original_read_bytes(path)

        def safe_text(path, *args, **kwargs):
            assert not path.is_relative_to(state / "skills"), "bundle content must not be consumed"
            return original_read_text(path, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(Path, "read_bytes", safe_bytes)
            patch.setattr(Path, "read_text", safe_text)
            async with launch.create_client() as client:
                verify = client.options["verify_config"]
                assert verify(effective_response(state), {"requirements": None},
                              skill_metadata(state, client.options["cwd"])) is True
        assert client.closed
        assert (system / "imagegen" / "SKILL.md").read_text() == "synthetic disabled skill"
        assert (system / "imagegen" / "resources" / "synthetic.txt").read_bytes() == b"never trusted"

    asyncio.run(scenario())


@pytest.mark.parametrize("component", ["system", "skill", "skill-file", "resource"])
def test_known_bundle_symlinks_still_refuse_without_following_targets(factory, tmp_path, component):
    async def scenario():
        state = tmp_path / "owned-state"
        async with launch.create_client():
            pass
        system = generated_bundle(state)
        paths = {"system": system, "skill": system / "imagegen", "skill-file": system / "imagegen" / "SKILL.md"}
        target = tmp_path / "synthetic-unread-target"
        target.write_bytes(b"unchanged synthetic target")
        if component == "resource":
            replaced = system / "imagegen" / "resource-link"
        else:
            replaced = paths[component]
            replaced.rename(tmp_path / "retained-original-bundle-part")
        replaced.symlink_to(target)
        with pytest.raises(RPCError):
            async with launch.create_client():
                pytest.fail("a generated bundle symlink was accepted")
        assert target.read_bytes() == b"unchanged synthetic target"
        assert replaced.is_symlink()

    asyncio.run(scenario())
    assert len(factory) == 1


@pytest.mark.parametrize("mutation", ["extra-root", "extra-system-skill", "missing-skill", "skill-is-file"])
def test_known_bundle_allowance_does_not_adopt_arbitrary_skill_roots(factory, tmp_path, mutation):
    async def scenario():
        state = tmp_path / "owned-state"
        async with launch.create_client():
            pass
        system = generated_bundle(state)
        if mutation == "extra-root":
            (state / "skills" / "synthetic-user").mkdir()
        elif mutation == "extra-system-skill":
            (system / "synthetic-added").mkdir()
        else:
            (system / "imagegen").rename(tmp_path / "retained-imagegen")
            if mutation == "skill-is-file":
                (system / "imagegen").write_text("synthetic wrong file type")
        with pytest.raises(RPCError):
            async with launch.create_client():
                pytest.fail("unexpected bundle structure was adopted")

    asyncio.run(scenario())
    assert len(factory) == 1
