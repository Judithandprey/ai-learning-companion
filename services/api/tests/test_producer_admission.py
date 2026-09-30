"""Producer admission over synthetic control, originals and in-process HTTP.

No database, listener, native acquisition or provider attestation is involved.
The one historical-policy bypass is test-local and only seeds an old declaration.
"""

from copy import deepcopy
import json

import pytest

from packages.contracts import desktop_capture_ingress as desktop_wire
from packages.contracts import process_v2
from services.api.capture import CaptureArchive, PIXEL_PRODUCER_PROFILE
from services.api.capture_runtime import create_local_capture_runtime
from services.api.control import ControlRegistry
from services.api.image_resolver import AuthorizedImageResolver
from services.api.ingress_app import create_ingress_app
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests import test_capture_runtime as runtime_tests
from services.api.tests.test_control import (
    CAPABILITIES, SCOPES, USER, apply, command, control_fixture, documents, resolve_stop_fact,
)
from services.api.tests.test_desktop_frame_ingress import EXAMPLE, pixel_record
from services.api.tests.test_ingress_http import (
    CAPABILITIES as HTTP_CAPABILITIES, FRAMES, registered, request, setup, uploaded,
)
from services.api.tests.test_process_context_reader import current_guard, reader
from services.api.tests.test_raw_frame_ingress import denied, raw_setup
from services.learning.process_context import prepare_observation_window


DESKTOP = "/v2/process/desktop-frames:batch"
RAW = "/v2/process/raw-frames:batch"
runtime_setup = runtime_tests.setup


@pytest.fixture
def admission(raw_setup):
    """Keep generic fixtures unmarked; bind policy explicitly within each test."""
    c = raw_setup
    c.structured = deepcopy(c.batch)
    c.structured["records"][0].update(clock=None, observed_at=None, media_position=None)
    c.frame["media_position"] = None
    c.raw_frame["timing"] = dict.fromkeys(c.raw_frame["timing"])
    c.desktop_frame = json.loads(EXAMPLE.read_text())
    c.desktop_frame.update(frame_id=c.frame["frame_id"], source=deepcopy(c.source),
        artifact=deepcopy(c.ref), raw_width=2, raw_height=2,
        **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
    c.honest = deepcopy(c.structured)
    c.honest["records"][0] = pixel_record(c.honest["records"][0])
    c.all_routes = create_ingress_app(c.store, c.auth,
        capabilities=HTTP_CAPABILITIES | {"process.raw-ingress.v0.2.6", desktop_wire.CAPABILITY},
        stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0],
        enable_raw_ingress=True, enable_desktop_ingress=True)
    return c


def bind(c):
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")


def payload(c, batch):
    return {"contract_version": "0.2.8", "batch": batch, "frames": [c.desktop_frame]}


def ingest(c, batch, request_key="admission"):
    return c.registry.ingest_desktop_frame_request(c.user, payload(c, batch), request_key)


def test_generic_structured_contract_and_unmarked_non_desktop_callers_remain_valid(admission):
    c = admission
    original = json.loads((EXAMPLE.parents[2] / "process_v2/examples/capture.json").read_text())["ProcessBatch"]
    process_v2.validate("ProcessBatch", original)
    assert original["records"][0]["method"] == "structured"
    # A desktop PNG does not narrow the released pure wire's evidence vocabulary.
    body = payload(c, c.structured)
    encoded = desktop_wire.canonical_request("DesktopFrameBatchRequest", body)
    assert desktop_wire.decode_request("DesktopFrameBatchRequest", encoded) == body
    ack = c.registry.ingest_raw_frames(USER, c.structured, [c.raw_frame], "generic-raw")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.structured["records"][0]


def test_unknown_desktop_admission_refuses_even_honest_pixels(admission):
    c = admission
    denied(c, lambda: ingest(c, c.honest), 403, "forbidden")
    bind(c)
    before = documents(c)
    ack = ingest(c, c.honest)
    assert ack["acknowledged"][0]["artifacts"] == [
        {**ref, "status": "verified"} for ref in (c.ref, c.ink_ref)]
    after = documents(c)
    for ref in (c.ref, c.ink_ref):
        assert after[("artifact", ref["artifact_id"])] == before[("artifact", ref["artifact_id"])]
    assert ingest(c, c.honest) == ack and documents(c) == after


def test_pending_profile_propagates_without_changing_registration_wire():
    c = control_fixture(MemoryStore(), USER, registered=False)
    c.registry.authorize_start(USER, c.registration, producer_id="screen")
    bind(c)
    assert documents(c)[("control_start", c.registration["stream_id"])]["producer_profile"] == PIXEL_PRODUCER_PROFILE
    state = c.registry.register(USER, c.registration, "marked-register")
    assert "producer_profile" not in state
    rows = documents(c)
    assert rows[("control_stream", c.registration["stream_id"])]["producer_profile"] == PIXEL_PRODUCER_PROFILE
    bind(c)
    assert documents(c) == rows


@pytest.mark.parametrize("field,value", [
    ("producer_id", "different-producer"), ("stream_id", "different-stream"),
    ("authorization_generation", 2), ("membership_revision", 2),
    ("continuity", {"kind": "restart", "previous_stream_id": "old-stream", "gap": "unknown"}),
])
def test_trusted_binding_requires_exact_existing_registration(admission, field, value):
    c = admission
    body = deepcopy(c.registration)
    producer = "screen"
    if field == "producer_id":
        producer = value
    else:
        body[field] = value
    denied(c, lambda: c.registry.bind_pixel_producer(USER, body, producer_id=producer), 403, "forbidden")


@pytest.mark.parametrize("kind,value", [
    ("control_start", None), ("control_stream", None),
    ("control_start", "unknown-profile"), ("control_stream", "unknown-profile"),
    ("control_start", {"desktop_pixels": True}), ("control_stream", 1),
    ("control_start", "missing"), ("control_stream", "missing"),
])
def test_malformed_or_one_missing_profile_cannot_downgrade_or_be_repaired(admission, kind, value):
    c = admission
    bind(c)
    row = c.store._documents[USER][(kind, c.registration["stream_id"])]
    if value == "missing":
        del row["producer_profile"]
    else:
        row["producer_profile"] = value
    denied(c, lambda: ingest(c, c.honest), 403, "forbidden")
    denied(c, lambda: bind(c), 403, "forbidden")


@pytest.mark.parametrize("field,value", [
    ("user_id", "other-user"), ("device_id", "other-device"), ("session_id", "other-session"),
    ("stream_id", "other-stream"), ("authorization_generation", 2),
    ("membership_revision", 2), ("producer_id", "other-producer"),
])
def test_common_gate_checks_exact_registered_pair_even_for_generic_capture(field, value):
    # A non-display source reaches the common gate without display-source checks
    # masking its independent grant/incarnation comparisons.
    c = control_fixture(MemoryStore(), USER)
    bind(c)
    c.batch["records"][0] = pixel_record(c.batch["records"][0], coverage="unknown")
    c.store._documents[USER][("control_start", c.registration["stream_id"])][field] = value
    denied(c, lambda: c.registry.capture.ingest(USER, c.batch, "generic-pair"), 403, "forbidden")


@pytest.mark.parametrize("variant", ["structured", "mixed", "relabelled_surface", "visual_operation", "owned_ink"])
def test_pixel_producer_refuses_ungranted_evidence_despite_exact_png_and_ink(admission, variant):
    c = admission
    bind(c)
    batch = deepcopy(c.structured)
    item = batch["records"][0]
    if variant == "mixed":
        item["method"] = "mixed"
    elif variant == "relabelled_surface":
        item["surface"] = "external_app"
    elif variant == "visual_operation":
        item.update(surface="external_app", method="visual")
        item["evidence"].update(operation="visible_change", observed_actor="unknown", actor_basis="unknown")
    elif variant == "owned_ink":
        item["surface"] = "original_screen_overlay"
    desktop_wire.validate_frame_batch(payload(c, batch), user_id=USER)
    denied(c, lambda: ingest(c, batch), 403, "forbidden")


@pytest.mark.parametrize("family", ["desktop", "raw", "legacy"])
@pytest.mark.parametrize("transport", ["internal", "http"])
def test_new_registry_or_other_enabled_family_cannot_bypass_marked_producer(admission, family, transport):
    c = admission
    bind(c)
    c.registry = ControlRegistry(c.store, scopes=SCOPES, capabilities=CAPABILITIES,
        authorization_guard=lambda state: None, stop_fact_resolver=resolve_stop_fact)
    frame = {"desktop": c.desktop_frame, "raw": c.raw_frame, "legacy": c.frame}[family]
    if transport == "internal":
        method = {"desktop": c.registry.ingest_desktop_frames, "raw": c.registry.ingest_raw_frames,
                  "legacy": c.registry.ingest_frames}[family]
        denied(c, lambda: method(USER, c.structured, [frame], "fallback"), 403, "forbidden")
    else:
        version, route = {"desktop": ("0.2.8", DESKTOP), "raw": ("0.2.6", RAW),
                          "legacy": ("0.2.4", FRAMES)}[family]
        before = documents(c)
        response = request(c.all_routes, "POST", route, request_key="fallback",
            body={"contract_version": version, "batch": c.structured, "frames": [frame]})
        assert response.status_code == 403, response.text
        assert response.json() == {"contract_version": version, "error": "forbidden", "retryable": False}
        assert documents(c) == before


@pytest.mark.parametrize("spoof_first", [False, True])
def test_mixed_honest_and_spoofed_batch_refuses_atomically(admission, spoof_first):
    c = admission
    bind(c)
    honest, spoofed = deepcopy(c.honest["records"][0]), deepcopy(c.structured["records"][0])
    spoofed.update(record_id="spoofed-second", sequence=2, causal_parents=[honest["record_id"]])
    records = [spoofed, honest] if spoof_first else [honest, spoofed]
    batch = {**c.honest, "records": records}
    desktop_wire.validate_frame_batch(payload(c, batch), user_id=USER)
    denied(c, lambda: ingest(c, batch), 403, "forbidden")


def test_historical_structured_record_and_ack_survive_policy_narrowing(admission, monkeypatch):
    c = admission
    # Simulate a pre-policy writer only during this historical commit. There is
    # no permissive production callback or new structured-producer permission.
    with monkeypatch.context() as patch:
        patch.setattr(CaptureArchive, "_admit_evidence", staticmethod(lambda *args, **kwargs: None))
        old_ack = ingest(c, c.structured, "historical-structured")
    old_rows = documents(c)
    bind(c)
    before = documents(c)
    immutable_kinds = {"capture_record", "capture_replay", "raw_capture_frame", "artifact", "snapshot"}
    assert {k: v for k, v in old_rows.items() if k[0] in immutable_kinds} == {
        k: v for k, v in before.items() if k[0] in immutable_kinds}
    assert old_ack["acknowledged"][0]["disposition"] == "accepted"
    denied(c, lambda: ingest(c, c.structured, "historical-structured"), 403, "forbidden")
    assert c.registry.capture.read_record(USER, "process-1")["record"] == c.structured["records"][0]
    packet = prepare_observation_window(["process-1"], reader(c).read_desktop,
        AuthorizedImageResolver(c.store, USER, current_guard(c)).resolve_desktop, user_id=USER)
    assert packet["items"][0]["record"] == c.structured["records"][0]
    assert packet["items"][0]["image"]["data"] == c.data
    assert packet["authorization_status"] == "not_attested"
    assert packet["provider_receipt"] == "not_attested"
    assert packet["observation_window"]["user_reasoning"] == "not_inferred"
    assert documents(c) == before
    child = deepcopy(c.honest)
    child["records"][0].update(record_id="honest-child", sequence=2, causal_parents=["process-1"])
    assert ingest(c, child, "honest-child")["acknowledged"][0]["disposition"] == "accepted"
    assert {k: documents(c)[k] for k in before if k[0] in immutable_kinds} == {
        k: v for k, v in before.items() if k[0] in immutable_kinds}


@pytest.mark.parametrize("family", ["raw", "legacy"])
def test_retained_desktop_frame_witness_blocks_both_missing_markers(admission, family):
    c = admission
    bind(c)
    ingest(c, c.honest)
    for kind in ("control_start", "control_stream"):
        del c.store._documents[USER][(kind, c.registration["stream_id"])]["producer_profile"]
    batch = deepcopy(c.structured)
    batch["records"][0].update(record_id="fallback-record", sequence=2, frame_id="fallback-frame")
    frame = deepcopy(c.raw_frame if family == "raw" else c.frame)
    frame["frame_id"] = "fallback-frame"
    method = c.registry.ingest_raw_frames if family == "raw" else c.registry.ingest_frames
    denied(c, lambda: method(USER, batch, [frame], "lost-profile"), 403, "forbidden")


@pytest.mark.parametrize("fence,status,code", [
    ("stop", 409, "capture_stopped"), ("source_revoke", 404, "not_found"),
    ("source_delete", 404, "not_found"), ("account_revoke", 403, "forbidden"),
])
def test_existing_lifecycle_fences_precede_new_admission(admission, monkeypatch, fence, status, code):
    c = admission
    bind(c)
    if fence == "stop":
        apply(c, command(c))
    elif fence == "source_revoke":
        c.archive.revoke_source(USER, c.source["source_id"])
    elif fence == "source_delete":
        c.archive.delete_source(USER, c.source["source_id"])
    else:
        c.archive.set_authorization(USER, False)

    def unreachable(*args, **kwargs):
        pytest.fail("admission ran before the existing lifecycle fence")

    monkeypatch.setattr(CaptureArchive, "_admit_evidence", staticmethod(unreachable))
    denied(c, lambda: ingest(c, c.structured), status, code)


@pytest.mark.parametrize("profile", ["omitted", None, "unreviewed-profile"])
def test_runtime_profile_refusal_precedes_any_store_transaction(runtime_setup, monkeypatch, profile):
    c = runtime_setup
    config = {**runtime_tests.options(c), "fresh_consent": True, "enable_desktop_ingress": True}
    config["capabilities"] |= {desktop_wire.CAPABILITY}
    if profile != "omitted":
        config["producer_profile"] = profile

    def forbidden(*args, **kwargs):
        pytest.fail("invalid desktop producer profile entered a store transaction")

    monkeypatch.setattr(c.store, "transaction", forbidden)
    with pytest.raises(ValueError, match="producer admission"):
        create_local_capture_runtime(**config)
    assert c.store._documents == {}


def test_runtime_generic_reopen_preserves_pixel_binding_and_refuses_structured_raw(runtime_setup):
    c = runtime_setup
    config = runtime_tests.options(c)
    marked = create_local_capture_runtime(**{**config, "fresh_consent": True,
        "capabilities": config["capabilities"] | {desktop_wire.CAPABILITY},
        "enable_desktop_ingress": True, "producer_profile": PIXEL_PRODUCER_PROFILE})
    runtime_tests.uploaded(c, marked)
    before = deepcopy(c.store._documents)
    # No desktop capability, desktop route or profile argument in this reopen.
    reopened = create_local_capture_runtime(**{**runtime_tests.options(c),
        "fresh_consent": False, "enable_raw_ingress": True})
    assert reopened.start_status == "consumed" and reopened.current_state["state"] == "live"
    assert c.store._documents == before
    for kind in ("control_start", "control_stream"):
        assert before[c.user][(kind, c.registration["stream_id"])]["producer_profile"] == PIXEL_PRODUCER_PROFILE
    response = request(reopened.app, "POST", RAW, token=runtime_tests.TOKEN,
        request_key="generic-reopen-bypass", body=c.raw_envelope)
    assert response.status_code == 403, response.text
    assert response.json() == {"contract_version": "0.2.6", "error": "forbidden", "retryable": False}
    assert c.store._documents == before


def test_runtime_paired_profile_binding_rolls_back_if_second_write_fails(runtime_setup, monkeypatch):
    c = runtime_setup
    generic = create_local_capture_runtime(**{**runtime_tests.options(c), "fresh_consent": True})
    assert runtime_tests.register(c, generic).status_code == 200
    before = deepcopy(c.store._documents)
    config = {**runtime_tests.options(c), "fresh_consent": False, "enable_desktop_ingress": True,
              "producer_profile": PIXEL_PRODUCER_PROFILE}
    config["capabilities"] |= {desktop_wire.CAPABILITY}
    original_put, writes = _MemoryTransaction.put, []

    def fail_second_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if value.get("producer_profile") == PIXEL_PRODUCER_PROFILE:
            writes.append(kind)
            if kind == "control_start":
                raise RuntimeError("synthetic paired profile write failure")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", fail_second_write)
        with pytest.raises(RuntimeError, match="paired profile write failure"):
            create_local_capture_runtime(**config)
    assert writes == ["control_stream", "control_start"]
    assert c.store._documents == before
    assert create_local_capture_runtime(**config).start_status == "consumed"
    for kind in ("control_start", "control_stream"):
        assert c.store._documents[c.user][(kind, c.registration["stream_id"])]["producer_profile"] == PIXEL_PRODUCER_PROFILE
