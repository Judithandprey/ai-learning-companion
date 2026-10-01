"""Operational metadata only; synthetic receipts, no provider or Codex child."""

from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import stat

import pytest

from services.worker.connectors import chatgpt_receipts as receipts
from services.worker.connectors.chatgpt_rpc import ChatGPTAppServer


EXECUTABLE = "/synthetic/codex"
DIGEST = "a" * 64


@pytest.fixture
def state(tmp_path):
    path = tmp_path / "product-state"
    path.mkdir(mode=0o700)
    return path


@pytest.fixture
def snapshot():
    return {
        "request_id": "问题 / ASK:一", "input_types": ["text", "image"],
        "text_bytes": 17, "text_sha256": "b" * 64,
        "image_bytes": 120, "image_sha256": "c" * 64,
        "submission": "not_submitted", "terminal_status": None, "outcome": "pending",
        "produced_item_types": [], "thread_start_count": 0, "turn_start_count": 0,
        "actual_model": None, "thread_id": None, "turn_id": None,
    }


def writer(state, **overrides):
    settings = {"executable": EXECUTABLE, "version": "0.158.0",
                "executable_sha256": DIGEST, "explicit_bin_override": False}
    settings.update(overrides)
    return receipts.ReceiptWriter(state, **settings)


def destination(output, snapshot):
    return output.directory / (sha256(snapshot["request_id"].encode("utf-8")).hexdigest() + ".json")


def test_exact_private_receipt_and_atomic_lifecycle_replacement(state, snapshot, monkeypatch):
    output = writer(state)
    original = deepcopy(snapshot)
    assert output(snapshot) is None
    target = destination(output, snapshot)
    value = json.loads(target.read_text())
    assert value == {**snapshot, "format": "lc-subscription-ask-receipt/1",
                     "codex_executable": EXECUTABLE, "codex_version": "0.158.0",
                     "codex_sha256": DIGEST, "explicit_bin_override": False}
    assert output.directory.parent == state / "receipts"
    assert len(output.directory.name) == 32
    assert len(target.read_bytes()) <= 16 * 1024
    if os.name != "nt":
        assert stat.S_IMODE(target.stat().st_mode) == 0o600
        assert stat.S_IMODE(output.directory.stat().st_mode) == 0o700
        assert stat.S_IMODE(output.directory.parent.stat().st_mode) == 0o700
    before = target.read_bytes()
    replace = os.replace
    observed = []

    def check_replace(source, destination):
        assert target.read_bytes() == before
        assert Path(source).parent == output.directory
        assert json.loads(Path(source).read_text())["outcome"] == "completed"
        observed.append((source, destination))
        replace(source, destination)

    monkeypatch.setattr(receipts.os, "replace", check_replace)
    completed = {**snapshot, "submission": "acknowledged", "terminal_status": "completed",
                 "outcome": "completed", "produced_item_types": ["userMessage", "agentMessage"],
                 "thread_start_count": 1, "turn_start_count": 1, "actual_model": "synthetic-model",
                 "thread_id": "thread-1", "turn_id": "turn-1"}
    output(completed)
    assert json.loads(target.read_text())["outcome"] == "completed"
    assert len(observed) == 1 and list(output.directory.iterdir()) == [target]
    assert snapshot == original


def test_each_launch_uses_new_directory_and_never_reads_auth_or_earlier_json(state, snapshot, monkeypatch):
    auth = state / "auth.json"
    auth.write_bytes(b"SYNTHETIC PRIVATE SENTINEL")
    first = writer(state)
    first(snapshot)
    old = destination(first, snapshot)
    before = old.read_bytes()

    def forbidden(*args, **kwargs):
        pytest.fail("writer must not read credentials or existing receipt content")

    with monkeypatch.context() as patch:
        patch.setattr(Path, "read_bytes", forbidden)
        patch.setattr(Path, "read_text", forbidden)
        second = writer(state, explicit_bin_override=True)
        second(snapshot)
        second({**snapshot, "outcome": "not_submitted"})
    assert first.directory != second.directory
    assert old.read_bytes() == before
    assert auth.read_bytes() == b"SYNTHETIC PRIVATE SENTINEL"
    assert json.loads(destination(second, snapshot).read_text())["explicit_bin_override"] is True


@pytest.mark.parametrize("field,value", [
    ("request_id", "bad\nidentifier"), ("request_id", "x" * 129),
    ("request_id", "bad\ud800identifier"), ("input_types", ["text", "image", "image"]),
    ("input_types", ["text", "skill"]), ("text_bytes", True),
    ("text_bytes", 4 * 65536 + 1), ("image_bytes", 8 * 1024 * 1024 + 1),
    ("image_bytes", -1), ("text_sha256", "not-a-hash"),
    ("image_sha256", "F" * 64), ("submission", "auto-retried"),
    ("terminal_status", "success"), ("outcome", "unknown-freeform-error"),
    ("produced_item_types", ["https://private.example/token"]),
    ("produced_item_types", ["agentMessage"] * 65),
    ("thread_start_count", 4097), ("turn_start_count", -1),
    ("actual_model", "model\nprivate"), ("thread_id", "x" * 129),
    ("turn_id", "bad\x00id"),
])
def test_malformed_metadata_is_sanitized_and_never_replaces_receipt(state, snapshot, field, value):
    output = writer(state)
    output(snapshot)
    target = destination(output, snapshot)
    before = target.read_bytes()
    with pytest.raises(receipts.ReceiptError) as error:
        output({**snapshot, field: value})
    assert str(error.value) == "The managed request receipt is unavailable."
    assert target.read_bytes() == before
    assert list(output.directory.iterdir()) == [target]


@pytest.mark.parametrize("field", ["prompt", "png_base64", "auth_url", "token", "error", "codex_sha256"])
def test_unexpected_fields_are_rejected_without_storing_private_values(state, snapshot, field):
    output = writer(state)
    with pytest.raises(receipts.ReceiptError) as error:
        output({**snapshot, field: "SYNTHETIC PRIVATE SENTINEL"})
    assert "SENTINEL" not in str(error.value)
    assert not list(output.directory.iterdir())


def test_required_fields_and_nullable_hashes_are_not_silently_invented(state, snapshot):
    output = writer(state)
    missing = {key: value for key, value in snapshot.items() if key != "submission"}
    with pytest.raises(receipts.ReceiptError):
        output(missing)
    output({**snapshot, "text_sha256": None, "image_sha256": None,
            "produced_item_types": ["FutureSafeItem9"], "outcome": "uncertain", "submission": "uncertain"})
    saved = json.loads(destination(output, snapshot).read_text())
    assert saved["text_sha256"] is None and saved["image_sha256"] is None
    assert saved["produced_item_types"] == ["FutureSafeItem9"]


def test_actual_rpc_begin_and_finish_write_unknown_facts_without_starting_child(state):
    output = writer(state, version="codex-cli 0.158.0")
    client = ChatGPTAppServer([EXECUTABLE], cwd=str(state), env={}, on_receipt=output)
    client.begin_request("actual-rpc-callback")
    target = destination(output, {"request_id": "actual-rpc-callback"})
    saved = json.loads(target.read_text())
    assert saved == {
        "request_id": "actual-rpc-callback", "input_types": [],
        "text_bytes": None, "text_sha256": None, "image_bytes": None, "image_sha256": None,
        "submission": "not_submitted", "terminal_status": None, "outcome": "pending",
        "produced_item_types": [], "thread_start_count": 0, "turn_start_count": 0,
        "actual_model": None, "thread_id": None, "turn_id": None,
        "format": "lc-subscription-ask-receipt/1", "codex_executable": EXECUTABLE,
        "codex_version": "codex-cli 0.158.0", "codex_sha256": DIGEST,
        "explicit_bin_override": False,
    }
    client.finish_request("not_submitted")
    assert json.loads(target.read_text())["outcome"] == "not_submitted"
    assert client._process is None


@pytest.mark.parametrize("prefix", ["text", "image"])
def test_unknown_byte_count_cannot_claim_computed_hash(state, snapshot, prefix):
    output = writer(state)
    with pytest.raises(receipts.ReceiptError):
        output({**snapshot, prefix + "_bytes": None})
    assert not list(output.directory.iterdir())


def test_encoded_receipt_size_limit_is_checked_before_writing(state, snapshot):
    output = writer(state, executable="/" + "𠮷" * 4095)
    with pytest.raises(receipts.ReceiptError):
        output(snapshot)
    assert not list(output.directory.iterdir())


def test_per_launch_record_cap_allows_updates_without_claiming_another_record(state, snapshot, monkeypatch):
    assert receipts.MAX_RECORDS == 4096
    monkeypatch.setattr(receipts, "MAX_RECORDS", 2)
    output = writer(state)
    output(snapshot)
    second = {**snapshot, "request_id": "second"}
    output(second)
    output({**snapshot, "outcome": "cancelled"})
    with pytest.raises(receipts.ReceiptError):
        output({**snapshot, "request_id": "third"})
    assert len(list(output.directory.iterdir())) == 2
    assert json.loads(destination(output, snapshot).read_text())["outcome"] == "cancelled"


def test_failed_atomic_replace_preserves_previous_snapshot_and_removes_staging(state, snapshot, monkeypatch):
    output = writer(state)
    output(snapshot)
    target = destination(output, snapshot)
    before = target.read_bytes()

    def fail_replace(*args):
        raise OSError("SYNTHETIC PRIVATE PATH")

    with monkeypatch.context() as patch:
        patch.setattr(receipts.os, "replace", fail_replace)
        with pytest.raises(receipts.ReceiptError) as error:
            output({**snapshot, "outcome": "failed"})
    assert "PRIVATE" not in str(error.value)
    assert target.read_bytes() == before and list(output.directory.iterdir()) == [target]
    output({**snapshot, "outcome": "cancelled"})


@pytest.mark.parametrize("component", ["state", "receipts", "launch", "file"])
def test_symlink_paths_are_rejected_without_touching_destination(state, snapshot, tmp_path, component):
    target = tmp_path / "unowned"
    target.mkdir(mode=0o700)
    sentinel = target / "sentinel"
    sentinel.write_bytes(b"keep this original")
    if component in ("state", "receipts"):
        link = tmp_path / "linked-state" if component == "state" else state / "receipts"
        link.symlink_to(target, target_is_directory=True)
        with pytest.raises(receipts.ReceiptError):
            writer(link if component == "state" else state)
    else:
        output = writer(state)
        if component == "launch":
            output.directory.rmdir()
            output.directory.symlink_to(target, target_is_directory=True)
        else:
            destination(output, snapshot).symlink_to(sentinel)
        with pytest.raises(receipts.ReceiptError):
            output(snapshot)
    assert sentinel.read_bytes() == b"keep this original"
    assert list(target.iterdir()) == [sentinel]


def test_writer_refuses_preexisting_or_replaced_file_in_its_namespace(state, snapshot):
    output = writer(state)
    target = destination(output, snapshot)
    target.write_bytes(b"unowned existing content")
    with pytest.raises(receipts.ReceiptError):
        output(snapshot)
    assert target.read_bytes() == b"unowned existing content"
    target.unlink()
    output(snapshot)
    replacement = output.directory / "replacement"
    replacement.write_bytes(b"another owner's content")
    os.replace(replacement, target)
    with pytest.raises(receipts.ReceiptError):
        output(snapshot)
    assert target.read_bytes() == b"another owner's content"
