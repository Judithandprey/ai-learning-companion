"""Launch configuration/filesystem controls only; never start a Codex child."""

import asyncio
import os
from pathlib import Path
import sys

import pytest

from services.worker.connectors import chatgpt_launch as launch
from services.worker.connectors.chatgpt_rpc import RPCError


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
            assert client.options["isolation_verified"] is False
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
            assert client.options["isolation_verified"] is False
            assert not any("synthetic-inherited-value" == value for value in env.values())
            assert "LC_SUBSCRIPTION_STATE_DIR" not in env
            assert "LC_SUBSCRIPTION_CODEX_BIN" not in env
            assert env["PATH"] != os.environ["PATH"]

    asyncio.run(scenario())


def test_candidate_command_has_explicit_managed_bounds_without_claiming_tool_isolation(factory):
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
            disabled = {args[index + 1] for index, arg in enumerate(args) if arg == "--disable"}
            assert {"hooks", "shell_tool", "apps", "plugins", "computer_use", "browser_use", "memories"} <= disabled
            # Support observed unified_exec remained true despite its disable
            # flags. This candidate does not present that as verified removal.
            assert "unified_exec" not in disabled
            assert client.options["isolation_verified"] is False

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
