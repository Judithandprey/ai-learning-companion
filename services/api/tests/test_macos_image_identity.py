"""Same PNG identity across Mac frames and batches, separate from byte decoding.

Constructed alias descriptors use the audited original bytes. Privileged stored
row corruption is explicitly separated from ordinary valid client submissions.
"""

from copy import deepcopy

import pytest

from packages.contracts.macos_frame import validate
from packages.contracts.process_v2 import validate as validate_process
from services.api.tests.test_control import documents
from services.api.tests.macos_fixtures import (
    additional, denied, ingest, macos_setup, raw_setup, references, registered,
    retained_frame, setup, upload_frame, upload_original, uploaded,
)


def second_image(c, *, role="raw", alias=False):
    """One raw image reusing either original role, with an unknown outcome."""
    item, frame = additional(c, parents=["process-1"])
    frame["raw"] = deepcopy(c.macos_frame["raw"] if role == "raw" else c.macos_frame["composition"]["image"])
    frame.update(callback_sequence=8, composition={"kind": "unknown", "reason": "no_retained_outcome"})
    frame["raw"]["native_file"] = "frames/00000008.png"
    if alias:
        ref = frame["raw"]["artifact"]
        ref["artifact_id"] = "macos-byte-alias"
        upload_original(c, ref, c.data if role == "raw" else c.composed_data)
    item["artifacts"] = references(frame) + [deepcopy(c.ink_ref)]
    validate(frame)
    return item, frame


def batch_for(c, item, frame, separate):
    if separate:
        ingest(c)
        return {**c.batch, "records": [item]}, [frame]
    return {**c.batch, "records": [c.batch["records"][0], item]}, [c.macos_frame, frame]


@pytest.mark.parametrize("separate", [False, True], ids=["same-batch", "later-batch"])
@pytest.mark.parametrize("alias", [False, True], ids=["artifact-identity", "hash-identity"])
@pytest.mark.parametrize("role", ["raw", "composed"])
def test_consistent_image_aliases_allow_cross_role_and_path_reuse(macos_setup, separate, alias, role):
    c = macos_setup
    item, frame = second_image(c, role=role, alias=alias)
    batch, frames = batch_for(c, item, frame, separate)
    ack = ingest(c, batch, frames, "consistent-alias")
    assert all(row["disposition"] == "accepted" for row in ack["acknowledged"])
    retained = documents(c)
    assert retained[("raw_capture_frame", frame["frame_id"])] == frame
    assert ingest(c, batch, frames, "consistent-alias") == ack
    assert documents(c) == retained


@pytest.mark.parametrize("separate", [False, True], ids=["same-batch", "later-batch"])
@pytest.mark.parametrize("alias", [False, True], ids=["artifact-identity", "hash-identity"])
@pytest.mark.parametrize("role", ["raw", "composed"])
def test_individually_valid_supplied_frame_cannot_contradict_retained_image_dimensions(macos_setup, separate, alias, role):
    c = macos_setup
    item, frame = second_image(c, role=role, alias=alias)
    frame["raw"]["width"] += 1
    validate(frame)
    batch, frames = batch_for(c, item, frame, separate)
    validate_process("ProcessBatch", batch)
    denied(c, lambda: ingest(c, batch, frames, "contradictory-alias"), 409, "record_conflict")
    assert ("raw_capture_frame", frame["frame_id"]) not in documents(c)


@pytest.mark.parametrize("separate", [False, True], ids=["same-batch", "later-batch"])
@pytest.mark.parametrize("different_session", [False, True])
def test_different_png_bytes_at_same_relative_filename_require_distinct_native_session(macos_setup, separate, different_session):
    c = macos_setup
    item, frame = second_image(c, role="composed")
    frame["callback_sequence"] = c.macos_frame["callback_sequence"]
    frame["raw"]["native_file"] = c.macos_frame["raw"]["native_file"]
    if different_session:
        frame["profile"]["native_session_id"] = "second-native-session"
    validate(frame)
    batch, frames = batch_for(c, item, frame, separate)
    if different_session:
        ack = ingest(c, batch, frames, "native-file-reuse")
        assert ingest(c, batch, frames, "native-file-reuse") == ack
        assert documents(c)[("raw_capture_frame", frame["frame_id"])] == frame
    else:
        denied(c, lambda: ingest(c, batch, frames, "native-file-reuse"), 409, "record_conflict")


@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("entry", ["cached-first", "cached-second", "new-append"])
def test_retained_cross_image_contradiction_denies_replay_and_append(macos_setup, role, entry):
    c = macos_setup
    item, frame = second_image(c, role=role, alias=True)
    ingest(c)
    batch = {**c.batch, "records": [item]}
    ingest(c, batch, [frame], "second-retained")
    # Direct MemoryStore mutation models privileged corruption of immutable
    # storage. This is not a mutation available to ordinary contract clients.
    retained = c.store._documents[c.user][("raw_capture_frame", frame["frame_id"])]
    retained["raw"]["height"] += 1
    validate(retained)
    if entry == "cached-first":
        action = lambda: ingest(c)
    elif entry == "cached-second":
        action = lambda: ingest(c, batch, [frame], "second-retained")
    else:
        third, third_frame = additional(c, record_id="mac-third", sequence=3, frame_id="mac-third-frame")
        action = lambda: ingest(c, {**c.batch, "records": [third]}, [third_frame], "third")
    denied(c, action, 503, "unavailable")


def test_empty_ink_one_native_file_can_have_two_distinct_archive_aliases(macos_setup):
    c = macos_setup
    frame = retained_frame(c, 0)
    frame["composition"]["image"]["artifact"]["artifact_id"] = "empty-ink-alias"
    upload_frame(c, frame)
    c.batch["records"][0]["artifacts"] = references(frame) + [c.ink_ref]
    ack = ingest(c, frames=[frame])
    assert len(ack["acknowledged"][0]["artifacts"]) == 3
    assert ingest(c, frames=[frame]) == ack


def test_nonempty_offscreen_ink_may_use_same_bytes_at_separate_native_files(macos_setup):
    c = macos_setup
    frame = deepcopy(c.macos_frame)
    # Explicit constructed edge: this does not claim the audited composition
    # itself had offscreen ink; it checks a valid same-byte native-file alias.
    frame["composition"]["image"]["artifact"] = deepcopy(c.ref)
    c.batch["records"][0]["artifacts"] = [c.ref, c.ink_ref]
    validate(frame)
    ack = ingest(c, frames=[frame])
    assert len(ack["acknowledged"][0]["artifacts"]) == 2
    assert documents(c)[("raw_capture_frame", frame["frame_id"])] == frame
    assert ingest(c, frames=[frame]) == ack
