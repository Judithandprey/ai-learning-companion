"""QA-MAC-01: preserve unrelated history while withholding conflicting images.

All contradictory declarations below use ordinary authorized old-family HTTP
submissions, not privileged store mutation or deletion as a repair. Audited Swift
synthetic PNGs prove archive behavior only, not native capture or AI receipt.
"""

from copy import copy, deepcopy

import pytest

from services.api.capture_app import create_capture_app
from services.api.capture_runtime import LOCAL_CAPABILITIES
from services.api.errors import DomainError
from services.api.tests.macos_fixtures import (
    NATIVE_FIXTURE, additional, gap, macos_setup, raw_setup, references, registered,
    retained_frame, setup, upload_frame, upload_original, uploaded,
)
from services.api.tests.test_control import documents, resolve_stop_fact
from services.api.tests.test_ingress_http import request
from services.api.tests.test_macos_cross_family_identity import old_frame
from services.api.tests.test_macos_ingress_http import error, submit, success
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.learning.process_context import prepare_observation_window


@pytest.fixture
def scope_http(macos_setup):
    c = macos_setup
    c.macos_app = create_capture_app(
        c.store, c.auth, capabilities=LOCAL_CAPABILITIES, clock=lambda: c.instant[0],
        stop_fact_resolver=resolve_stop_fact, enable_macos_ingress=True,
        enable_raw_ingress=True, enable_windows_ingress=True,
    )
    return c


def envelope(c, records, frames):
    return {"contract_version": "0.2.12", "batch": {**c.batch, "records": records}, "frames": frames}


def second_source(c):
    body = {**c.display, "source_id": "scope-other-display"}
    response = request(c.macos_app, "PUT", "/v2/process/display-sources/" + body["source_id"], body=body)
    assert response.status_code == 200, response.text
    return {**c.source, "source_id": body["source_id"]}


def retain_declared_image(c, target, *, sequence, name, family="raw", role="composed",
                          width_delta=1, source=None, alias=True):
    """Normal typed old-family submission, retaining its declared dimensions."""
    bound = copy(c)
    bound.source = deepcopy(source or c.source)
    bound.macos_frame = deepcopy(target)
    picture = bound.macos_frame["raw"] if role == "raw" else bound.macos_frame["composition"]["image"]
    if alias:
        picture["artifact"]["artifact_id"] = name + "-alias"
    upload_original(bound, picture["artifact"], (NATIVE_FIXTURE / picture["native_file"]).read_bytes())
    frame = old_frame(bound, family, width_delta=width_delta, role=role)
    frame.update(frame_id=name + "-frame", source=deepcopy(bound.source))
    item = deepcopy(c.batch["records"][0])
    item.update(record_id=name, sequence=sequence, source=deepcopy(bound.source),
                frame_id=frame["frame_id"], artifacts=[deepcopy(picture["artifact"])], causal_parents=[])
    body = {"contract_version": "0.2.6" if family == "raw" else "0.2.10",
            "batch": {**c.batch, "records": [item]}, "frames": [frame]}
    response = request(c.macos_app, "POST", f"/v2/process/{family}-frames:batch", body=body, request_key=name)
    assert response.status_code == 200, response.text
    assert response.json()["acknowledged"][0]["disposition"] == "accepted"
    return frame


@pytest.fixture
def two_frames(scope_http):
    c = scope_http
    c.good_envelope = deepcopy(c.macos_envelope)
    c.good_ack = success(c, submit(c, c.good_envelope, "scope-good"), c.good_envelope)
    item, _ = additional(c, record_id="scope-affected", sequence=2, frame_id="scope-affected-frame")
    c.affected = retained_frame(c, 1, frame_id=item["frame_id"])
    upload_frame(c, c.affected)
    assert c.affected["composition"]["image"]["artifact"]["sha256"] != c.composed_ref["sha256"]
    item["artifacts"] = references(c.affected) + [deepcopy(c.ink_ref)]
    c.affected_envelope = envelope(c, [item], [c.affected])
    c.affected_ack = success(c, submit(c, c.affected_envelope, "scope-affected"), c.affected_envelope)
    c.gap = gap(c, record_id="scope-gap", sequence=3)
    c.gap_envelope = envelope(c, [c.gap], [])
    c.gap_ack = success(c, submit(c, c.gap_envelope, "scope-gap"), c.gap_envelope)
    return c


def prepare(c, ids, *, image_resolver=None):
    images = resolver(c)
    return prepare_observation_window(ids, reader(c).read_macos, images, user_id=c.user,
                                      macos_resolver=image_resolver or images.resolve_macos)


@pytest.mark.parametrize("family", ["raw", "windows"])
def test_unrelated_complete_frame_and_gap_remain_readable_without_erasing_conflict(two_frames, family):
    c = two_frames
    original = documents(c)
    conflict = retain_declared_image(c, c.affected, sequence=4, name="scope-conflict",
                                    family=family, source=second_source(c))
    retained = documents(c)
    selected = reader(c).read_macos(["scope-gap", "process-1"])
    assert selected["frames"] == [c.macos_frame]
    assert selected["batch"]["records"] == [c.gap, c.good_envelope["batch"]["records"][0]]
    for role, data in (("raw", c.data), ("composed", c.composed_data)):
        resolved = resolver(c).resolve_macos(c.macos_frame, image_role=role, max_bytes=len(data))
        assert resolved["status"] == "available" and resolved["data"] == data
    packet = prepare(c, ["scope-gap", "process-1"])
    assert packet["items"][0]["image"] == {"status": "missing_frame"}
    assert packet["items"][1]["image"]["data"] == c.data
    assert packet["items"][1]["composed_image"]["data"] == c.composed_data
    assert documents(c) == retained
    assert all(retained[key] == value for key, value in original.items())
    assert retained[("raw_capture_frame", conflict["frame_id"])] == conflict


def test_unrelated_cached_http_and_parentless_gap_admission_survive(two_frames):
    c = two_frames
    retain_declared_image(c, c.affected, sequence=4, name="scope-conflict")
    retained = documents(c)
    assert success(c, submit(c, c.good_envelope, "scope-good"), c.good_envelope) == c.good_ack
    assert success(c, submit(c, c.gap_envelope, "scope-gap"), c.gap_envelope) == c.gap_ack
    assert documents(c) == retained
    later = gap(c, record_id="scope-later-gap", sequence=5, coverage="partial")
    body = envelope(c, [later], [])
    ack = success(c, submit(c, body, "scope-later"), body)
    assert ack["acknowledged"][0]["artifacts"] == []
    saved = documents(c)
    assert success(c, submit(c, body, "scope-later"), body) == ack
    assert documents(c) == saved
    assert all(saved[key] == value for key, value in retained.items())


def test_first_mac_parentless_gap_ignores_valid_unrelated_raw_raw_disagreement(scope_http):
    c = scope_http
    retain_declared_image(c, c.macos_frame, sequence=1, name="old-width-200", role="raw", width_delta=0)
    retain_declared_image(c, c.macos_frame, sequence=2, name="old-width-201", role="raw")
    retained = documents(c)
    assert all(row.get("contract_version") != "0.2.11"
               for (kind, _), row in retained.items() if kind == "raw_capture_frame")
    item = gap(c, record_id="first-mac-gap", sequence=3)
    body = envelope(c, [item], [])
    ack = success(c, submit(c, body, "first-mac-gap"), body)
    assert ack["acknowledged"][0]["artifacts"] == []
    assert reader(c).read_macos([item["record_id"]])["frames"] == []
    assert prepare(c, [item["record_id"]])["items"][0]["image"] == {"status": "missing_frame"}
    assert all(documents(c)[key] == value for key, value in retained.items())


@pytest.mark.parametrize("role", ["raw", "composed"])
def test_relevant_cross_source_hash_alias_withholds_both_roles_and_mixed_results(two_frames, role):
    c = two_frames
    old = retain_declared_image(c, c.affected, sequence=4, name="cross-source-conflict",
                                role=role, source=second_source(c))
    target = c.affected["raw"] if role == "raw" else c.affected["composition"]["image"]
    assert old["artifact"]["artifact_id"] != target["artifact"]["artifact_id"]
    assert old["artifact"]["sha256"] == target["artifact"]["sha256"]
    retained = documents(c)
    error(submit(c, c.affected_envelope, "scope-affected"), 503, "unavailable")
    next_frame = {**deepcopy(c.affected), "frame_id": "affected-later-frame"}
    item, _ = additional(c, record_id="affected-later", sequence=5, frame_id=next_frame["frame_id"])
    item["artifacts"] = references(next_frame) + [deepcopy(c.ink_ref)]
    error(submit(c, envelope(c, [item], [next_frame]), "affected-later"), 503, "unavailable")
    for ids in (["scope-affected"], ["scope-gap", "process-1", "scope-affected"],
                ["scope-affected", "process-1"]):
        published = []
        with pytest.raises(DomainError) as caught:
            published.append(reader(c).read_macos(ids))
        assert caught.value.status == 503 and not published
    for image_role in ("raw", "composed"):
        assert resolver(c).resolve_macos(c.affected, image_role=image_role, max_bytes=4 << 20) == {
            "status": "unavailable"}
    published = []
    with pytest.raises(DomainError) as caught:
        published.append(prepare(c, ["scope-gap", "process-1", "scope-affected"]))
    assert caught.value.status == 503 and not published
    assert documents(c) == retained


def test_new_conflicting_image_is_409_and_does_not_commit_healthy_sibling(scope_http):
    c = scope_http
    affected = retained_frame(c, 1, frame_id="fresh-affected-frame")
    upload_frame(c, affected)
    retain_declared_image(c, affected, sequence=1, name="old-first", source=second_source(c))
    good_record, good_frame = additional(c, record_id="fresh-good", sequence=2, frame_id="fresh-good-frame")
    affected_record, _ = additional(c, record_id="fresh-affected", sequence=3, frame_id=affected["frame_id"])
    affected_record["artifacts"] = references(affected) + [deepcopy(c.ink_ref)]
    before = documents(c)
    body = envelope(c, [good_record, affected_record], [good_frame, affected])
    error(submit(c, body, "fresh-mixed-conflict"), 409, "record_conflict")
    assert documents(c) == before
    assert ("capture_record", "fresh-good") not in before


@pytest.mark.parametrize("relevant", [False, True], ids=["unrelated-change", "selected-change"])
def test_final_learning_reread_checks_current_selected_scope(two_frames, relevant):
    c = two_frames
    images, roles, published, after_write = resolver(c), [], [], []
    original = documents(c)

    def append_after_last_image(frame, *, image_role, max_bytes):
        result = images.resolve_macos(frame, image_role=image_role, max_bytes=max_bytes)
        assert result["status"] == "available"
        roles.append(image_role)
        if image_role == "composed":
            target = c.macos_frame if relevant else c.affected
            retain_declared_image(c, target, sequence=4, name="during-learning", source=second_source(c))
            after_write.append(documents(c))
        return result

    if relevant:
        with pytest.raises(DomainError) as caught:
            published.append(prepare(c, ["scope-gap", "process-1"], image_resolver=append_after_last_image))
        assert caught.value.status == 503 and not published
    else:
        published.append(prepare(c, ["scope-gap", "process-1"], image_resolver=append_after_last_image))
        assert published[0]["items"][0]["image"] == {"status": "missing_frame"}
        assert published[0]["items"][1]["image"]["data"] == c.data
        assert published[0]["items"][1]["composed_image"]["data"] == c.composed_data
    assert roles == ["raw", "composed"]
    assert len(after_write) == 1 and documents(c) == after_write[0]
    assert all(after_write[0][key] == value for key, value in original.items())
