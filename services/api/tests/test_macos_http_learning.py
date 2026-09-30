"""Real opt-in ASGI -> MemoryStore -> current Backend readers -> Learning.

PNG bytes come from the audited Swift synthetic fixture. This proves neither
native display capture, saved native ink, provider receipt nor durable storage.
"""

import asyncio
import base64
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
import json

import pytest

from packages.contracts import macos_capture_ingress as wire
from services.api.capture_app import create_capture_app
from services.api.errors import DomainError
from services.api.tests.macos_fixtures import (
    macos_setup, setup, registered, uploaded, raw_setup, additional, gap,
    references, retained_frame, upload_frame,
)
from services.api.tests.test_control import USER, apply, command, documents, resolve_stop_fact, stop_fact
from services.api.tests.test_ingress_http import CAPABILITIES as LEGACY_CAPABILITIES, request
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.learning.process_context import prepare_observation_window, prepare_stored_process_context


@pytest.fixture
def composed_http(macos_setup):
    c = macos_setup
    c.macos_app = create_capture_app(
        c.store, c.auth, capabilities=LEGACY_CAPABILITIES | {wire.CAPABILITY},
        clock=lambda: c.instant[0], stop_fact_resolver=resolve_stop_fact,
        enable_macos_ingress=True,
    )
    return c


def submit(c, envelope=None):
    envelope = c.macos_envelope if envelope is None else envelope
    response = request(c.macos_app, "POST", "/v2/process/macos-frames:batch",
                       request_key="macos-learning", body=envelope)
    assert response.status_code == 200, response.text
    refs = [ref for item in envelope["batch"]["records"] for ref in item["artifacts"]]
    verified = {tuple(ref[key] for key in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in refs}
    wire.validate_ack(envelope["batch"], response.json(), user_id=USER, verified_artifacts=verified)
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def prepare(c, ids=None, *, selected_resolver=None, window=False, **limits):
    images = resolver(c)
    function = prepare_observation_window if window else prepare_stored_process_context
    return function(ids or ["process-1"], reader(c).read_macos, images, user_id=USER,
                    macos_resolver=selected_resolver or images.resolve_macos, **limits)


def test_http_originals_alias_refusal_unknown_and_gap_reach_actual_learning(composed_http):
    c = composed_http
    envelope = deepcopy(c.macos_envelope)
    for sequence, name, index in ((2, "alias", 0), (3, "refused", 6), (4, "unknown", 2)):
        item, _ = additional(c, record_id=name, sequence=sequence, frame_id=name + "-frame")
        frame = retained_frame(c, index, frame_id=item["frame_id"])
        if name == "unknown":
            frame["composition"] = {"kind": "unknown", "reason": "no_retained_outcome"}
        upload_frame(c, frame)
        item["artifacts"] = references(frame) + [deepcopy(c.ink_ref)]
        envelope["batch"]["records"].append(item)
        envelope["frames"].append(frame)
    missing = gap(c, sequence=5, parents=["process-1"])
    envelope["batch"]["records"].append(missing)
    originals = {identity: row for identity, row in documents(c).items() if identity[0] == "artifact"}
    ack = submit(c, envelope)
    assert submit(c, envelope) == ack
    before = documents(c)
    for item in envelope["batch"]["records"]:
        stored = before[("capture_record", item["record_id"])]
        assert json.loads(stored["canonical_json"])["record"] == item
    for frame in envelope["frames"]:
        assert before[("raw_capture_frame", frame["frame_id"])] == frame
    assert {identity: row for identity, row in before.items() if identity[0] == "artifact"} == originals

    ids = [missing["record_id"], "unknown", "process-1", "alias", "refused"]
    packet = prepare(c, ids, window=True)
    absent, unknown, distinct, alias, refused = packet["items"]
    assert [item["record"]["record_id"] for item in packet["items"]] == ids
    assert absent["record"] == missing and absent["frame"] is None
    assert absent["image"]["status"] == "missing_frame" and "composed_image" not in absent
    assert unknown["composed_image"] == {
        "status": "unknown", "reason": "no_retained_outcome", "image_role": "composed"}
    assert refused["composed_image"] == {
        "status": "not_composed", "reason": "refused", "image_role": "composed"}
    for item in (unknown, distinct, alias, refused):
        assert item["image"]["status"] == "attached"
        assert item["image"]["data"] == c.data and item["image"]["image_role"] == "raw"
        assert c.ink_ref in item["record"]["artifacts"]
        assert item["record"]["clock"] is item["record"]["observed_at"] is None
    assert distinct["composed_image"]["data"] == c.composed_data != c.data
    assert alias["composed_image"]["data"] == c.data
    assert distinct["frame"] == c.macos_frame
    assert packet["attached_bytes"] == 5 * len(c.data) + len(c.composed_data)
    assert packet["observation_window"]["capture_chronology"] == "unknown"
    assert packet["non_frame_artifacts"] == "references_only"
    for field in ("authorization_status", "commit_status", "live_status", "provider_receipt"):
        assert packet[field] == "not_attested"
    assert packet["presentation_permission"] == "not_granted"
    assert documents(c) == before
    stop_fact(c, 5)
    apply(c, command(c, boundary=5))
    stopped = documents(c)
    assert prepare(c, ids, window=True) == packet and documents(c) == stopped


@pytest.mark.parametrize("failure,status", [
    ("composed-loss", 503), ("source-delete", 404), ("source-revoke", 403), ("token-revoke", 401),
])
def test_learning_withholds_current_missing_original_or_revocation(composed_http, failure, status):
    c = composed_http
    submit(c)
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
    assert error.value.status == status and not published and documents(c) == before


@pytest.mark.parametrize("change,status", [("token", 401), ("original", 503), ("record-marker", 404)])
def test_actual_final_metadata_reread_withholds_after_images_resolved(composed_http, change, status):
    c = composed_http
    submit(c)
    images, roles, published = resolver(c), [], []

    def change_after_composed(frame, *, image_role, max_bytes):
        result = images.resolve_macos(frame, image_role=image_role, max_bytes=max_bytes)
        assert result["status"] == "available"
        roles.append(image_role)
        if image_role == "composed":
            if change == "token":
                c.auth.revoke("read-token")
            elif change == "original":
                with c.store.transaction(USER) as tx:
                    tx.delete("artifact", c.composed_ref["artifact_id"])
            else:
                with c.store.transaction(USER) as tx:
                    tx.put("capture_tombstone", "process-1", {})
        return result

    with pytest.raises(DomainError) as error:
        published.append(prepare(c, selected_resolver=change_after_composed))
    assert error.value.status == status and roles == ["raw", "composed"] and not published


def test_image_and_pixel_budgets_leave_explicit_gaps_and_keep_editable_ink(composed_http):
    c = composed_http
    submit(c)
    before = documents(c)
    limited = prepare(c, max_total_bytes=len(c.data) + len(c.composed_data) - 1)
    item = limited["items"][0]
    assert item["image"]["data"] == c.data
    assert item["composed_image"] == {"status": "byte_limit", "image_role": "composed"}
    assert c.ink_ref in item["record"]["artifacts"]
    pixels = prepare(c, max_pixels=200 * 100 - 1)
    assert pixels["attached_bytes"] == 0
    assert pixels["items"][0]["image"]["status"] == "pixel_limit"
    assert pixels["items"][0]["composed_image"]["status"] == "pixel_limit"
    assert documents(c) == before


def test_corrupt_selected_png_is_a_gap_without_raw_composition_substitution(composed_http):
    c = composed_http
    submit(c)
    c.store._documents[USER][("artifact", c.composed_ref["artifact_id"])]["data_base64"] = (
        base64.b64encode(c.composed_data[:-1] + bytes([c.composed_data[-1] ^ 1])).decode("ascii"))
    packet = prepare(c)
    item = packet["items"][0]
    assert item["image"]["data"] == c.data
    assert item["composed_image"] == {"status": "unavailable", "image_role": "composed"}
    assert item["frame"] == c.macos_frame and c.ink_ref in item["record"]["artifacts"]


@pytest.mark.parametrize("error_type", [FutureCancelledError, asyncio.CancelledError])
def test_cancellation_after_raw_image_never_publishes_a_partial_learning_packet(composed_http, error_type):
    c = composed_http
    submit(c)
    images, roles, published = resolver(c), [], []
    failure = error_type("PRIVATE test-only cancellation")

    def cancel_composed(frame, *, image_role, max_bytes):
        roles.append(image_role)
        if image_role == "composed":
            raise failure
        return images.resolve_macos(frame, image_role=image_role, max_bytes=max_bytes)

    before = documents(c)
    with pytest.raises(error_type) as error:
        published.append(prepare(c, selected_resolver=cancel_composed))
    assert error.value is failure and roles == ["raw", "composed"] and not published
    assert documents(c) == before
