"""Private, bounded metadata receipts for one owned managed Codex child.

These are operational receipts, not a second source archive. No prompt, image
content, credential, raw provider error or earlier receipt is read or stored.
The launch factory holds the product-state lock for this writer's lifetime.
"""

from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from threading import Lock
import unicodedata
from uuid import uuid4


MAX_RECEIPT_BYTES = 16 * 1024
MAX_RECORDS = 4096
_FIELDS = frozenset((
    "request_id", "input_types", "text_bytes", "text_sha256", "image_bytes",
    "image_sha256", "submission", "terminal_status", "outcome",
    "produced_item_types", "thread_start_count", "turn_start_count",
    "actual_model", "thread_id", "turn_id",
))
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_TYPE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,63}\Z")
_MODEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}\Z")
_VERSION = re.compile(r"(?:codex-cli )?[0-9][A-Za-z0-9._+-]{0,63}\Z")


class ReceiptError(Exception):
    code = "unavailable"

    def __init__(self):
        super().__init__("The managed request receipt is unavailable.")


def _text(value, maximum):
    return (type(value) is str and 0 < len(value) <= maximum
            and all(unicodedata.category(char) not in ("Cc", "Cs") for char in value))


def _digest(value, *, nullable=True):
    return (nullable and value is None) or (type(value) is str and _HASH.fullmatch(value) is not None)


def _integer(value, maximum):
    return type(value) is int and 0 <= value <= maximum


def _no_symlinks(path):
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise ReceiptError()


def _private_directory(path):
    _no_symlinks(path)
    metadata = path.stat()
    if not stat.S_ISDIR(metadata.st_mode):
        raise ReceiptError()
    if os.name != "nt" and (metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077):
        raise ReceiptError()


def _metadata(value):
    if type(value) is not dict or value.keys() != _FIELDS:
        raise ReceiptError()
    if not _text(value["request_id"], 128):
        raise ReceiptError()
    inputs, produced = value["input_types"], value["produced_item_types"]
    if (type(inputs) is not list or len(inputs) > 2
            or any(type(item) is not str or item not in ("text", "image") for item in inputs)
            or len(inputs) != len(set(inputs))
            or type(produced) is not list or len(produced) > 64
            or any(type(item) is not str or _TYPE.fullmatch(item) is None for item in produced)):
        raise ReceiptError()
    for prefix, maximum in (("text", 4 * 65536), ("image", 8 * 1024 * 1024)):
        length, digest = value[prefix + "_bytes"], value[prefix + "_sha256"]
        if (length is None and digest is not None) or (length is not None and not _integer(length, maximum)):
            raise ReceiptError()
    for name in ("thread_start_count", "turn_start_count"):
        if not _integer(value[name], 4096):
            raise ReceiptError()
    if not all(_digest(value[name]) for name in ("text_sha256", "image_sha256")):
        raise ReceiptError()
    if (type(value["submission"]) is not str
            or value["submission"] not in ("not_submitted", "written", "acknowledged", "uncertain")
            or (value["terminal_status"] is not None and (type(value["terminal_status"]) is not str
                or value["terminal_status"] not in ("inProgress", "completed", "interrupted", "failed")))
            or type(value["outcome"]) is not str
            or value["outcome"] not in ("pending", "completed", "cancelled", "failed", "not_submitted", "uncertain")):
        raise ReceiptError()
    if value["actual_model"] is not None and (type(value["actual_model"]) is not str
                                              or _MODEL.fullmatch(value["actual_model"]) is None):
        raise ReceiptError()
    if any(value[name] is not None and not _text(value[name], 128) for name in ("thread_id", "turn_id")):
        raise ReceiptError()
    return {**value, "input_types": inputs.copy(), "produced_item_types": produced.copy()}


class ReceiptWriter:
    """One callable writer with an exclusive per-launch receipt directory."""

    def __init__(self, state, executable, version, executable_sha256, explicit_bin_override):
        try:
            if (not isinstance(state, Path) or not state.is_absolute() or ".." in state.parts
                    or not _text(executable, 4096) or not Path(executable).is_absolute()
                    or type(version) is not str or _VERSION.fullmatch(version) is None
                    or not _digest(executable_sha256, nullable=False)
                    or type(explicit_bin_override) is not bool):
                raise ReceiptError()
            _private_directory(state)
            root = state / "receipts"
            _no_symlinks(root)
            root.mkdir(mode=0o700, exist_ok=True)
            _private_directory(root)
            self.directory = root / uuid4().hex
            self.directory.mkdir(mode=0o700)
            _private_directory(self.directory)
            self._identity = {
                "format": "lc-subscription-ask-receipt/1", "codex_executable": executable,
                "codex_version": version, "codex_sha256": executable_sha256,
                "explicit_bin_override": explicit_bin_override,
            }
            self._created = {}
            self._lock = Lock()
        except (OSError, ValueError):
            raise ReceiptError() from None

    def __call__(self, metadata):
        snapshot = _metadata(metadata)
        try:
            encoded = (json.dumps({**snapshot, **self._identity}, ensure_ascii=False,
                                  separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
            if len(encoded) > MAX_RECEIPT_BYTES:
                raise ReceiptError()
            name = sha256(snapshot["request_id"].encode("utf-8")).hexdigest() + ".json"
            with self._lock:
                self._write(name, encoded)
        except (OSError, ValueError, UnicodeError):
            raise ReceiptError() from None

    def _write(self, name, encoded):
        _private_directory(self.directory.parent)
        _private_directory(self.directory)
        target = self.directory / name
        _no_symlinks(target)
        if name not in self._created:
            if len(self._created) >= MAX_RECORDS or target.exists():
                raise ReceiptError()
        else:
            metadata = target.stat()
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1
                    or self._created[name] != (metadata.st_dev, metadata.st_ino)):
                raise ReceiptError()
        temporary = None
        try:
            descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=self.directory)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            temporary = None
            metadata = target.stat()
            self._created[name] = (metadata.st_dev, metadata.st_ino)
        finally:
            if temporary is not None:
                Path(temporary).unlink(missing_ok=True)
