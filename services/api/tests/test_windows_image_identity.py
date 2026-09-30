"""Windows declarations stay consistent across the existing original archive.

Normal submissions reproduce the cross-frame identity defect without decoding
pixels or bypassing storage. Retained-corruption tests separately simulate a
privileged rewrite of immutable rows; they do not model an ordinary writer.
"""

import base64

import pytest

from packages.contracts.windows_frame import validate
from services.api.tests.test_control import USER, documents
from services.api.tests.test_ingress_http import ORIGINALS, request, success
from services.api.tests.test_raw_frame_ingress import denied
from services.api.tests.test_windows_frame_ingress import (
    additional, ingest, raw_setup, registered, setup, uploaded, windows_setup,
)


def images(frame):
    return {"raw": frame["raw"], "composed": frame["composed"]["image"]}


def second_frame(c, *, alias=False, swap_roles=False):
    """Valid sequence-2 pair, optionally using typed byte aliases/cross-role reuse."""
    item, frame = additional(c, parents=["process-1"])
    if swap_roles:
        frame["raw"], frame["composed"]["image"] = frame["composed"]["image"], frame["raw"]
    if alias:
        for role, image in images(frame).items():
            original = image["artifact"]
            ref = {**original, "artifact_id": "windows-identity-alias-" + role}
            data = c.data if original["sha256"] == c.ref["sha256"] else c.composed_data
            body = {"contract_version": "0.2.2", "source": c.source, "kind": "screen_image",
                    "artifact": ref, "data_base64": base64.b64encode(data).decode("ascii")}
            success(request(c.app, "PUT", ORIGINALS + ref["artifact_id"], body=body), "OriginalArtifactReceipt")
            item["artifacts"] = [ref if value == original else value for value in item["artifacts"]]
            image["artifact"] = ref
    validate(frame)
    return item, frame


def contradict(frame, role, fact):
    if fact == "pixels_sha256":
        images(frame)[role]["pixels_sha256"] = "f" * 64
    else:
        # Both image roles must share geometry within one valid Windows frame.
        for image in images(frame).values():
            image["width"], image["height"] = 3, 4
    validate(frame)


@pytest.mark.parametrize("separate", [False, True], ids=["same-batch", "later-append"])
@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "byte-alias"])
@pytest.mark.parametrize("swap_roles", [False, True], ids=["same-roles", "cross-role"])
@pytest.mark.parametrize("role,fact", [
    ("raw", "pixels_sha256"), ("composed", "pixels_sha256"), ("raw", "dimensions"),
], ids=["raw-rgba", "composed-rgba", "pair-dimensions"])
def test_normal_cross_frame_contradiction_is_rejected_atomically(windows_setup, separate, alias, swap_roles, role, fact):
    c = windows_setup
    item, frame = second_frame(c, alias=alias, swap_roles=swap_roles)
    contradict(frame, role, fact)
    if separate:
        ingest(c)
        batch, frames = {**c.batch, "records": [item]}, [frame]
    else:
        batch = {**c.batch, "records": [c.batch["records"][0], item]}
        frames = [c.windows_frame, frame]
    denied(c, lambda: ingest(c, batch, frames, "contradictory-image-identity"), 409, "record_conflict")
    assert ("raw_capture_frame", frame["frame_id"]) not in documents(c)
    if not separate:
        assert ("raw_capture_frame", c.windows_frame["frame_id"]) not in documents(c)


@pytest.mark.parametrize("separate", [False, True], ids=["same-batch", "later-append"])
@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "byte-alias"])
@pytest.mark.parametrize("swap_roles", [False, True], ids=["same-roles", "cross-role"])
def test_consistent_originals_allow_aliases_and_cross_role_reuse(windows_setup, separate, alias, swap_roles):
    c = windows_setup
    item, frame = second_frame(c, alias=alias, swap_roles=swap_roles)
    if separate:
        original_ack = ingest(c)
        batch, frames = {**c.batch, "records": [item]}, [frame]
    else:
        batch = {**c.batch, "records": [c.batch["records"][0], item]}
        frames = [c.windows_frame, frame]
    ack = ingest(c, batch, frames, "consistent-image-identity")
    assert all(receipt["disposition"] == "accepted" for receipt in ack["acknowledged"])
    assert all(ref["status"] == "verified" for receipt in ack["acknowledged"] for ref in receipt["artifacts"])
    retained = documents(c)
    assert retained[("raw_capture_frame", c.windows_frame["frame_id"])] == c.windows_frame
    assert retained[("raw_capture_frame", frame["frame_id"])] == frame
    assert ingest(c, batch, frames, "consistent-image-identity") == ack
    if separate:
        assert ingest(c) == original_ack
    assert documents(c) == retained


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "byte-alias"])
@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("operation", ["cached-first", "cached-second", "new-append"])
def test_retained_contradiction_fails_closed_on_cached_or_new_ingress(windows_setup, alias, role, operation):
    c = windows_setup
    item, frame = second_frame(c, alias=alias)
    ingest(c)
    second_batch = {**c.batch, "records": [item]}
    ingest(c, second_batch, [frame], "retained-second")
    # Explicit privileged storage-corruption simulation, separate from the
    # ordinary valid-contract submissions exercised above.
    retained = c.store._documents[USER][("raw_capture_frame", frame["frame_id"])]
    contradict(retained, role, "pixels_sha256")
    if operation == "cached-first":
        action = lambda: ingest(c)
    elif operation == "cached-second":
        action = lambda: ingest(c, second_batch, [frame], "retained-second")
    else:
        third, third_frame = additional(c, record_id="windows-record-3", sequence=3,
                                        frame_id="windows-frame-3", parents=["process-1"])
        action = lambda: ingest(c, {**c.batch, "records": [third]}, [third_frame], "after-retained-conflict")
    denied(c, action, 503, "unavailable")
