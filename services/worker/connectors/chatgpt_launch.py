"""Product-owned launch boundary for the managed subscription connector.

The exact Linux binary/config combination follows Support's measured 0.158.0
report. Other builds and inherited configuration fail closed before inference.
Credentials belong to Codex; this module never opens or copies its auth files.
"""

from contextlib import asynccontextmanager, contextmanager
from functools import partial
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import sys
import tempfile

from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError
from services.worker.connectors.chatgpt_receipts import ReceiptWriter


_MARKER = ".lc-managed-chatgpt-v1"
_MARKER_BYTES = b"Learning Companion managed ChatGPT state v1\n"
_LOCK = ".lc-managed-chatgpt.lock"
SUPPORTED_BINARY_SHA256 = "167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9"
SUPPORTED_VERSION = "codex-cli 0.158.0"
MANAGED_PROVIDER = "lc_managed_chatgpt"
_BUNDLED_SKILLS = ("imagegen", "openai-docs", "plugin-creator", "review-agent", "skill-creator", "skill-installer")
_FORBIDDEN = frozenset((
    "config.toml", "config.json", "managed_config.toml", "requirements.toml",
    "agents.md", "agents.override.md", "hooks.json", "hooks", "skills",
    ".agents", ".codex", "plugins", "marketplaces",
))
_DISABLED = (
    "hooks", "shell_tool", "shell_snapshot", "code_mode", "code_mode_host",
    "code_mode_prewarm", "apps", "plugins", "remote_plugin", "browser_use",
    "computer_use", "image_generation", "view_image", "multi_agent",
    "multi_agent_v2", "goals", "memories", "skill_mcp_dependency_install",
    "skill_search", "tool_suggest", "workspace_dependencies", "daemon_auto_start",
    "enable_request_compression",
)


def _binary_identity(executable):
    if sys.platform != "linux" or platform.machine() != "x86_64":
        raise RPCError("isolation_unverified")
    path = Path(executable).resolve(strict=True)
    with path.open("rb") as binary:
        digest = hashlib.file_digest(binary, "sha256").hexdigest()
    if digest != SUPPORTED_BINARY_SHA256:
        raise RPCError("isolation_unverified")
    # This version is bound to the exact executable measured by Support and our
    # no-inference config probe, rather than trusting a replaceable version label.
    return {"executable": str(path), "version": SUPPORTED_VERSION, "sha256": digest}


def _settings(state=None):
    state = _state_path() if state is None else state
    return {
        "forced_login_method": "chatgpt", "cli_auth_credentials_store": "file",
        "approval_policy": "never", "sandbox_mode": "read-only", "web_search": "disabled",
        "project_doc_max_bytes": 0, "allow_login_shell": False,
        "analytics": {"enabled": False}, "shell_environment_policy": {"inherit": "none"},
        "features": {**{feature: False for feature in _DISABLED}, "skip_host_skill_discovery": True},
        # In this measured build folder overrides do not disable bundled skills;
        # the exact SKILL.md paths do, as verified by official skills/list.
        "skills": {"config": [{"path": str(state / "skills" / ".system" / name / "SKILL.md"),
                               "enabled": False} for name in _BUNDLED_SKILLS]},
        "model_provider": MANAGED_PROVIDER,
        "model_providers": {MANAGED_PROVIDER: {
            "name": "Learning Companion managed ChatGPT", "wire_api": "responses",
            "requires_openai_auth": True, "request_max_retries": 0,
            "stream_max_retries": 0, "supports_websockets": False,
        }},
    }


def _leaves(value, prefix=""):
    for key, child in value.items():
        name = f"{prefix}.{key}" if prefix else key
        if type(child) is dict:
            yield from _leaves(child, name)
        else:
            yield name, child


def _same(left, right):
    # JSON equality must not treat false as numeric zero in security settings.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


def _verify_config(response, requirements, skills, *, state, cwd):
    """Validate official effective configuration without exposing its contents."""
    _check_state(state)
    try:
        config, layers, origins = response["config"], response["layers"], response["origins"]
        expected = _settings(state)
        if type(config) is not dict or type(layers) is not list or not 1 <= len(layers) <= 4:
            raise ValueError()
        sessions = 0
        for layer in layers:
            if layer.get("disabledReason") is not None:
                raise ValueError()
            source = layer["name"]
            kind = source["type"]
            if kind == "sessionFlags":
                sessions += 1
                if not _same(layer["config"], expected):
                    raise ValueError()
            elif kind in {"user", "system"} and layer["config"] == {}:
                if kind == "user" and (source.get("file") != str(state / "config.toml") or source.get("profile") is not None):
                    raise ValueError()
            else:
                raise ValueError()
        if sessions != 1:
            raise ValueError()
        for key in ("hooks", "apps", "tools", "developer_instructions", "instructions",
                    "model_instructions_file", "notify", "profile", "model_catalog_json"):
            if key not in config or config[key] is not None:
                raise ValueError()
        for key in ("mcp_servers", "plugins", "profiles"):
            if config.get(key) != {}:
                raise ValueError()
        for key, value in _leaves(expected):
            current = config
            for part in key.split("."):
                current = current[part]
            if not _same(current, value):
                raise ValueError()
            if key == "skills.config":
                origin_keys = [f"skills.config.{index}.{field}" for index in range(len(value))
                               for field in ("path", "enabled")]
            else:
                origin_keys = [key + ".enabled" if key in {"features.code_mode", "features.multi_agent_v2"} else key]
            if any(origins[origin_key]["name"]["type"] != "sessionFlags" for origin_key in origin_keys):
                raise ValueError()
        providers = config["model_providers"]
        if set(providers) != {MANAGED_PROVIDER}:
            raise ValueError()
        provider = providers[MANAGED_PROVIDER]
        allowed = expected["model_providers"][MANAGED_PROVIDER]
        for key, value in provider.items():
            if key not in allowed and value is not None and not (key == "supports_standalone_web_search" and value is False):
                raise ValueError()
        # No endpoint is supplied: require the measured official managed default,
        # and reject any alternate API endpoint or account/token mechanism.
        if config.get("chatgpt_base_url") != "https://chatgpt.com/backend-api/" or config.get("openai_base_url") is not None:
            raise ValueError()
        required = requirements["requirements"]
        if required is not None:
            if type(required) is not dict:
                raise ValueError()
            for key, value in required.items():
                if value is not None and not (key == "allowedLoginMethods" and value == ["chatgpt"]):
                    raise ValueError()
        entries = skills["data"]
        if type(entries) is not list or len(entries) != 1 or entries[0]["cwd"] != cwd or entries[0]["errors"] != []:
            raise ValueError()
        rows = entries[0]["skills"]
        expected_paths = {row["path"] for row in expected["skills"]["config"]}
        if type(rows) is not list or len(rows) != len(expected_paths):
            raise ValueError()
        paths = set()
        for skill in rows:
            if skill["enabled"] is not False or skill["scope"] != "system" or skill.get("pluginId") is not None:
                raise ValueError()
            if skill["path"] not in expected_paths or skill["path"] in paths:
                raise ValueError()
            paths.add(skill["path"])
        return True
    except (KeyError, TypeError, ValueError, RecursionError):
        raise RPCError("isolation_unverified") from None


def _absolute_path(value):
    if type(value) is not str or not value or "\0" in value:
        raise RPCError("unavailable")
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise RPCError("unavailable")
    return path


def _no_symlinks(path):
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RPCError("unavailable")


def _state_path():
    supplied = os.environ.get("LC_SUBSCRIPTION_STATE_DIR")
    if supplied is not None:
        return _absolute_path(supplied)
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path.home() / ".local" / "share"
    return _absolute_path(str(base / "LearningCompanion" / "managed-chatgpt"))


def _check_state(state):
    _no_symlinks(state)
    if not state.is_dir():
        raise RPCError("unavailable")
    for entry in state.iterdir():
        if entry.name == "skills" and not entry.is_symlink():
            _check_bundled_tree(entry)
        elif entry.is_symlink() or entry.name.casefold() in _FORBIDDEN:
            raise RPCError("unavailable")
    marker = state / _MARKER
    if not marker.is_file() or marker.stat().st_size != len(_MARKER_BYTES) or marker.read_bytes() != _MARKER_BYTES:
        raise RPCError("unavailable")
    if os.name != "nt":
        metadata = state.stat()
        if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
            raise RPCError("unavailable")


def _check_bundled_tree(skills):
    """Inspect only names/types of this binary's auto-created packaged resources.

    No content is trusted from these files: the effective config and official
    skill inventory must additionally report every discovered skill disabled.
    Existing user/project skills and extra roots remain refused, never deleted.
    """
    system = skills / ".system"
    if (not skills.is_dir() or {p.name for p in skills.iterdir()} != {".system"}
            or system.is_symlink() or not system.is_dir()
            or {p.name for p in system.iterdir()} != {*_BUNDLED_SKILLS, ".codex-system-skills.marker"}):
        raise RPCError("unavailable")
    if (not all((system / name).is_dir() for name in _BUNDLED_SKILLS)
            or not (system / ".codex-system-skills.marker").is_file()):
        raise RPCError("unavailable")
    for index, entry in enumerate(skills.rglob("*")):
        if index >= 512 or entry.is_symlink() or not (entry.is_file() or entry.is_dir()):
            raise RPCError("unavailable")


def _prepare_state(state):
    _no_symlinks(state)
    state.mkdir(parents=True, mode=0o700, exist_ok=True)
    _no_symlinks(state)
    if not any(state.iterdir()):
        # An empty explicitly selected directory may be claimed. Never adopt
        # another Codex home or add a marker to existing unrecognized contents.
        state.chmod(0o700)
        descriptor = os.open(state / _MARKER, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as marker:
            marker.write(_MARKER_BYTES)
    _check_state(state)


@contextmanager
def _state_lock(state):
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(state / _LOCK, flags, 0o600)
    with os.fdopen(descriptor, "r+b") as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise RPCError("unavailable")
        try:
            if os.name == "nt":
                import msvcrt
                if os.fstat(lock.fileno()).st_size == 0:
                    lock.write(b"\0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise RPCError("busy") from None
        try:
            _check_state(state)
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            # POSIX flock is released by closing this owned descriptor. Keeping
            # the file avoids unlink/recreate races and stale PID lock schemes.


def _command(state=None):
    supplied = os.environ.get("LC_SUBSCRIPTION_CODEX_BIN")
    executable = supplied if supplied is not None else shutil.which("codex")
    path = _absolute_path(executable)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RPCError("unavailable")
    # Resolve a trusted installed launcher symlink; argv never passes a shell.
    command = [str(path.resolve()), "app-server", "--listen", "stdio://", "--strict-config"]
    for key, value in _leaves(_settings(state)):
        if key == "skills.config":
            # TOML inline tables use '='; JSON object syntax is not TOML.
            encoded = "[" + ",".join("{path=" + json.dumps(row["path"]) + ",enabled=false}" for row in value) + "]"
        else:
            encoded = json.dumps(value)
        command.extend(("-c", f"{key}={encoded}"))
    return command


def _environment(state):
    # Deliberately omit inherited API/provider credentials, CODEX/AgentsDock
    # settings, shell hooks, Python/Node injection and desktop session handles.
    names = ("HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "WINDIR",
             "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ")
    env = {name: os.environ[name] for name in names if name in os.environ}
    if os.name == "nt":
        system = env.get("SYSTEMROOT") or env.get("WINDIR")
        if not system:
            raise RPCError("unavailable")
        env["PATH"] = os.pathsep.join((str(Path(system) / "System32"), system))
    else:
        env["PATH"] = os.defpath
    env["CODEX_HOME"] = str(state)
    return env


@asynccontextmanager
async def create_client():
    """Construct, but do not start, one child; retain managed auth across uses."""
    try:
        state = _state_path()
        command = _command(state)
        identity = _binary_identity(command[0])
        _prepare_state(state)
        with _state_lock(state):
            with tempfile.TemporaryDirectory(prefix="lc-subscription-work-") as work:
                receipts = ReceiptWriter(state, identity["executable"], identity["version"],
                                         identity["sha256"], "LC_SUBSCRIPTION_CODEX_BIN" in os.environ)
                client = ChatGPTAppServer(command, cwd=work, env=_environment(state),
                                          verify_config=partial(_verify_config, state=state, cwd=work),
                                          expected_provider=MANAGED_PROVIDER, on_receipt=receipts)
                try:
                    yield client
                finally:
                    await client.close()
    except OSError:
        raise RPCError("unavailable") from None
