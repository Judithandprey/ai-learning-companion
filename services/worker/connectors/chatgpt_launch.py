"""Product-owned launch boundary for the managed subscription connector.

The candidate flags follow Support's 0.158.0 compatibility report. They are
defense in depth, not evidence of a tool-free runtime: inference stays disabled.
Credentials belong to Codex; this module never opens or copies its auth files.
"""

from contextlib import asynccontextmanager, contextmanager
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile

from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer, RPCError


_MARKER = ".lc-managed-chatgpt-v1"
_MARKER_BYTES = b"Learning Companion managed ChatGPT state v1\n"
_LOCK = ".lc-managed-chatgpt.lock"
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
)


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
        if entry.is_symlink() or entry.name.casefold() in _FORBIDDEN:
            raise RPCError("unavailable")
    marker = state / _MARKER
    if not marker.is_file() or marker.stat().st_size != len(_MARKER_BYTES) or marker.read_bytes() != _MARKER_BYTES:
        raise RPCError("unavailable")
    if os.name != "nt":
        metadata = state.stat()
        if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
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


def _command():
    supplied = os.environ.get("LC_SUBSCRIPTION_CODEX_BIN")
    executable = supplied if supplied is not None else shutil.which("codex")
    path = _absolute_path(executable)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RPCError("unavailable")
    # Resolve a trusted installed launcher symlink; argv never passes a shell.
    command = [str(path.resolve()), "app-server", "--listen", "stdio://", "--strict-config"]
    for setting in ('forced_login_method="chatgpt"', 'cli_auth_credentials_store="file"',
                    'approval_policy="never"', 'sandbox_mode="read-only"',
                    'web_search="disabled"', 'project_doc_max_bytes=0'):
        command.extend(("-c", setting))
    for feature in _DISABLED:
        command.extend(("--disable", feature))
    command.extend(("--enable", "skip_host_skill_discovery"))
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
        command = _command()
        state = _state_path()
        _prepare_state(state)
        with _state_lock(state):
            with tempfile.TemporaryDirectory(prefix="lc-subscription-work-") as work:
                client = ChatGPTAppServer(command, cwd=work, env=_environment(state),
                                          isolation_verified=False)
                try:
                    yield client
                finally:
                    await client.close()
    except OSError:
        raise RPCError("unavailable") from None
