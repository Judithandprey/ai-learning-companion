"""Actual opt-in ASGI writes -> stored readers -> Learning, with synthetic PNGs.

MemoryStore and LocalTestAuthenticator do not prove a durable database, native
capture, production login, provider receipt or final presentation permission.
"""

from copy import deepcopy
import json

import pytest

from services.api.capture_app import create_capture_app
from services.api.errors import DomainError
from services.api.tests.test_control import USER, apply, command, documents, resolve_stop_fact, stop_fact
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.api.tests.test_windows_ingress_http import (
    CAPABILITIES, additional, raw_setup, registered, setup, submit, success, uploaded,
    windows_http, windows_setup,
)
from services.learning.process_context import prepare_observation_window, prepare_stored_process_context


@pytest.fixture
def composed_http(windows_http):
    c = windows_http
    c.windows_app = create_capture_app(
        c.store, c.auth, capabilities=CAPABILITIES, clock=lambda: c.instant[0],
        stop_fact_resolver=resolve_stop_fact, enable_windows_ingress=True,
    )
    return c


def prepare(c, ids=None, *, selected_resolver=None, window=False):
    images = resolver(c)
    function = prepare_observation_window if window else prepare_stored_process_context
    return function(ids or ["process-1"], reader(c).read_windows, images, user_id=USER,
                    windows_resolver=selected_resolver or images.resolve_windows)


def test_http_committed_dual_alias_raw_only_and_gap_reach_actual_learning(composed_http):
    c = composed_http
    envelope = deepcopy(c.windows_envelope)
    for sequence, variant in ((2, "alias"), (3, "raw-only")):
        item, frame = additional(c, record_id=variant, sequence=sequence, frame_id=variant + "-frame")
        if variant == "alias":
            frame["composed"]["image"] = deepcopy(frame["raw"])
        else:
            frame["composed"] = None
        item["artifacts"] = deepcopy([c.ref, c.ink_ref])
        envelope["batch"]["records"].append(item)
        envelope["frames"].append(frame)
    missing = gap(c, sequence=4, parents=["process-1"])
    envelope["batch"]["records"].append(missing)
    ack = success(c, submit(c, envelope), envelope)
    assert success(c, submit(c, envelope), envelope) == ack
    before = documents(c)
    for record in envelope["batch"]["records"]:
        stored = before[("capture_record", record["record_id"])]
        assert json.loads(stored["canonical_json"])["record"] == record
    for frame in envelope["frames"]:
        assert before[("raw_capture_frame", frame["frame_id"])] == frame

    ids = [missing["record_id"], "raw-only", "process-1", "alias"]
    packet = prepare(c, ids, window=True)
    absent, raw_only, distinct, alias = packet["items"]
    assert [item["record"]["record_id"] for item in packet["items"]] == ids
    assert absent["record"] == missing and absent["frame"] is None
    assert absent["image"]["status"] == "missing_frame" and "composed_image" not in absent
    assert raw_only["composed_image"] == {"status": "not_present", "image_role": "composed"}
    for item in (raw_only, distinct, alias):
        assert item["image"]["status"] == "attached"
        assert item["image"]["data"] == c.data and item["image"]["image_role"] == "raw"
        assert c.ink_ref in item["record"]["artifacts"]
        assert item["record"]["clock"] is item["record"]["observed_at"] is None
    assert distinct["composed_image"]["data"] == c.composed_data != c.data
    assert alias["composed_image"]["data"] == c.data
    assert distinct["frame"] == c.windows_frame
    assert packet["attached_bytes"] == 4 * len(c.data) + len(c.composed_data)
    assert packet["observation_window"]["capture_chronology"] == "unknown"
    for field in ("authorization_status", "commit_status", "live_status", "provider_receipt"):
        assert packet[field] == "not_attested"
    assert packet["presentation_permission"] == "not_granted"
    assert documents(c) == before
    stop_fact(c, 4)
    apply(c, command(c, boundary=4))
    stopped = documents(c)
    assert prepare(c, ids, window=True) == packet
    assert documents(c) == stopped


@pytest.mark.parametrize("failure,status", [
    ("composed-loss", 503), ("source-delete", 404), ("source-revoke", 403), ("token-revoke", 401),
])
def test_http_stored_learning_withholds_current_loss_or_revocation(composed_http, failure, status):
    c = composed_http
    success(c, submit(c))
    assert prepare(c)["items"][0]["composed_image"]["data"] == c.composed_data
    if failure == "composed-loss":
        with c.store.transaction(USER) as tx:
            tx.delete("artifact", c.composed_ref["artifact_id"])
    elif failure == "source-delete":
        c.archive.delete_source(USER, c.source["source_id"])
    elif failure == "source-revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    else:
        c.auth.revoke("read-token")
    before, published = documents(c), []
    with pytest.raises(DomainError) as error:
        published.append(prepare(c))
    assert error.value.status == status and not published
    assert documents(c) == before


def test_actual_final_read_rejects_revocation_after_both_images(composed_http):
    c = composed_http
    success(c, submit(c))
    images, roles, published = resolver(c), [], []

    def revoke_after_composed(frame, *, image_role, max_bytes):
        result = images.resolve_windows(frame, image_role=image_role, max_bytes=max_bytes)
        assert result["status"] == "available"
        roles.append(image_role)
        if image_role == "composed":
            c.auth.revoke("read-token")
        return result

    before = documents(c)
    with pytest.raises(DomainError) as error:
        published.append(prepare(c, selected_resolver=revoke_after_composed))
    assert error.value.status == 401 and roles == ["raw", "composed"] and not published
    assert documents(c) == before
