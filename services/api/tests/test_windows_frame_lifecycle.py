"""Windows raw/composed originals share existing archive erasure/loss fences.

Synthetic MemoryStore probes; no database, native capture or provider activity.
"""

import base64
from copy import deepcopy

import pytest

from packages.contracts.windows_frame import validate
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.original_artifacts import OriginalArtifacts, require_retained_bytes
from services.api.tests.test_control import documents
from services.api.tests.test_raw_frame_ingress import denied
from services.api.tests.test_windows_frame_ingress import (
    ingest, raw_setup, registered, setup, uploaded, windows_setup,
)


def insert(c, frame=None):
    frame = c.windows_frame if frame is None else frame
    validate(frame)
    with c.store.transaction(c.user) as tx:
        Archive._immutable(tx, "raw_capture_frame", frame["frame_id"], frame)


def picture(frame, role):
    return frame["raw"] if role == "raw" else frame["composed"]["image"]


def test_delete_committed_windows_record_erases_both_images_and_preserves_foreign_source(windows_setup):
    c = windows_setup
    ingest(c)
    before = documents(c)
    c.archive.delete_source(c.user, c.source["source_id"])
    after = documents(c)
    for ref in (c.ref, c.composed_ref, c.ink_ref):
        identity = ref["artifact_id"]
        assert ("artifact", identity) not in after
        assert ("capture_artifact_ref", identity) not in after
        assert after[("original_artifact_tombstone", identity)] == {"artifact_id": identity}
        assert after[("capture_artifact_tombstone", identity)] == {"artifact_id": identity}
    identity = c.windows_frame["frame_id"]
    assert ("raw_capture_frame", identity) not in after
    assert after[("frame_tombstone", identity)] == {"frame_id": identity}
    record_id = c.batch["records"][0]["record_id"]
    assert ("capture_record", record_id) not in after
    assert after[("capture_tombstone", record_id)] == {"record_id": record_id}
    for identity in (("frame", c.core["Frame"]["frame_id"]),
                     ("artifact", c.core["Frame"]["artifact_id"])):
        assert after[identity] == before[identity]
    denied(c, lambda: ingest(c), 404)
    c.archive.delete_source(c.user, c.source["source_id"])
    assert documents(c) == after


@pytest.mark.parametrize("variant", ["distinct", "shared_alias", "raw_only"])
def test_delete_isolated_windows_frame_fences_every_lost_original(windows_setup, variant):
    c = windows_setup
    frame = c.windows_frame
    if variant == "shared_alias":
        frame["composed"]["image"] = deepcopy(frame["raw"])
    elif variant == "raw_only":
        frame["composed"] = None
    insert(c)
    references = [frame["raw"]["artifact"]]
    if frame["composed"] is not None:
        references.append(frame["composed"]["image"]["artifact"])
    with c.store.transaction(c.user) as tx:
        assert tx.scan("capture_record") == []
        assert tx.scan("capture_artifact_ref") == []
        for artifact_id in {ref["artifact_id"] for ref in references}:
            tx.delete("artifact", artifact_id)
    before = documents(c)
    c.archive.delete_source(c.user, c.source["source_id"])
    after = documents(c)
    assert ("raw_capture_frame", frame["frame_id"]) not in after
    assert after[("frame_tombstone", frame["frame_id"])] == {"frame_id": frame["frame_id"]}
    for ref in references:
        identity = ref["artifact_id"]
        assert ("artifact", identity) not in after
        assert after[("original_artifact_tombstone", identity)] == {"artifact_id": identity}
        denied(c, lambda: c.archive.import_ink(c.user, identity, b"cannot-recreate"),
               404, "original_not_found")
    foreign_frame = ("frame", c.core["Frame"]["frame_id"])
    foreign_original = ("artifact", c.core["Frame"]["artifact_id"])
    assert after[foreign_frame] == before[foreign_frame]
    assert after[foreign_original] == before[foreign_original]
    denied(c, lambda: insert(c), 404, "frame_not_found")
    c.archive.delete_source(c.user, c.source["source_id"])
    assert documents(c) == after


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_surviving_windows_image_blocks_reconstruction_without_capture_receipts(windows_setup, role):
    c = windows_setup
    insert(c)
    reference = picture(c.windows_frame, role)["artifact"]
    with c.store.transaction(c.user) as tx:
        stored = tx.get("artifact", reference["artifact_id"])
        tx.delete("artifact", reference["artifact_id"])
        assert tx.scan("capture_record") == []
        assert tx.scan("capture_replay") == []
    originals = OriginalArtifacts(c.store, lambda state: None,
                                  display_authority_resolver=c.registry.resolve_capture)
    data = base64.b64decode(stored["data_base64"], validate=True)
    for retained, status, code in ((False, 409, "original_identity_conflict"),
                                    (True, 503, "original_unavailable")):
        denied(c, lambda: originals.put(c.user, c.source, "screen_image", reference, data,
                                        check_retained=retained), status, code)
    with c.store.transaction(c.user) as tx:
        with pytest.raises(DomainError) as error:
            require_retained_bytes(tx, reference["artifact_id"])
        assert (error.value.status, error.value.code) == (503, "original_unavailable")


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_surviving_foreign_windows_image_refuses_partial_source_erasure(windows_setup, role):
    c = windows_setup
    insert(c)
    foreign = deepcopy(c.windows_frame)
    foreign["frame_id"] = "foreign-windows-frame"
    foreign["source"]["source_id"] = c.core["SourceSnapshot"]["source_id"]
    # Only the selected image keeps the owned reference, so either role must
    # independently prevent deletion of its original.
    other = picture(foreign, "composed" if role == "raw" else "raw")
    other["artifact"]["artifact_id"] = "unrelated-foreign-image"
    insert(c, foreign)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]),
           409, "original_source_conflict")


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_windows_frame_cannot_erase_typed_image_owned_by_another_source(windows_setup, role):
    c = windows_setup
    frame = deepcopy(c.windows_frame)
    image = picture(frame, role)
    with c.store.transaction(c.user) as tx:
        stored = tx.get("artifact", image["artifact"]["artifact_id"])
    data = base64.b64decode(stored["data_base64"], validate=True)
    image["artifact"]["artifact_id"] = "other-source-windows-image"
    foreign_source = {field: c.core["SourceSnapshot"][field]
                      for field in ("user_id", "source_id", "source_version")}
    OriginalArtifacts(c.store, lambda state: None).put(
        c.user, foreign_source, "screen_image", image["artifact"], data)
    insert(c, frame)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]),
           409, "original_source_conflict")


@pytest.mark.parametrize("change", ["version", "owner", "key", "composed", "contradictory_alias"])
def test_corrupt_windows_descriptor_withholds_erasure_without_writes(windows_setup, change):
    c = windows_setup
    frame = deepcopy(c.windows_frame)
    identity = frame["frame_id"]
    if change == "version":
        frame["contract_version"] = "0.2.99"
    elif change == "owner":
        frame["source"]["user_id"] = "another-owner"
    elif change == "key":
        identity = "wrong-stored-key"
    elif change == "composed":
        del frame["composed"]["image"]
    else:
        frame["composed"]["image"]["artifact"]["artifact_id"] = frame["raw"]["artifact"]["artifact_id"]
        frame["composed"]["image"]["pixels_sha256"] = "f" * 64
    with c.store.transaction(c.user) as tx:
        tx.put("raw_capture_frame", identity, frame)
    denied(c, lambda: c.archive.delete_source(c.user, c.source["source_id"]), 503, "unavailable")


@pytest.mark.parametrize("change", ["version", "missing_image", "contradictory_alias"])
def test_corrupt_retained_frame_cannot_authorize_original_reconstruction(windows_setup, change):
    c = windows_setup
    frame = deepcopy(c.windows_frame)
    reference = deepcopy(frame["composed"]["image"]["artifact"])
    if change == "version":
        frame["contract_version"] = "0.2.99"
    elif change == "missing_image":
        del frame["composed"]["image"]
    else:
        frame["composed"]["image"]["artifact"]["artifact_id"] = frame["raw"]["artifact"]["artifact_id"]
        frame["composed"]["image"]["pixels_sha256"] = "f" * 64
    with c.store.transaction(c.user) as tx:
        tx.put("raw_capture_frame", frame["frame_id"], frame)
        stored = tx.get("artifact", reference["artifact_id"])
        tx.delete("artifact", reference["artifact_id"])
    originals = OriginalArtifacts(c.store, lambda state: None,
                                  display_authority_resolver=c.registry.resolve_capture)
    denied(c, lambda: originals.put(c.user, c.source, "screen_image", reference,
                                    base64.b64decode(stored["data_base64"], validate=True)),
           503, "unavailable")
