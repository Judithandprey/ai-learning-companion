"""Comparable archive image facts remain consistent across released families.

Ordinary typed submissions reproduce the review defect. Native paths, clocks,
Windows RGBA digests and platform encoding labels are not cross-family facts.
"""

from copy import deepcopy
import json

import pytest

from packages.contracts import capture_frame, desktop_frame, windows_frame
from packages.contracts import macos_capture_ingress as wire
from services.api.capture_app import create_capture_app
from services.api.domain import Archive, checked
from services.api.original_artifacts import OriginalArtifacts
from services.api.tests.test_control import documents, resolve_stop_fact
from services.api.tests.test_ingress_http import CAPABILITIES, request
from services.api.tests.macos_fixtures import (
    ROOT, additional, denied, ingest_request, macos_setup, raw_setup,
    references, registered, setup, upload_original, uploaded,
)
from services.api.tests.test_raw_frame_readers import reader, resolver
from services.api.tests.test_macos_ingress_http import error, success


def old_frame(c, family, *, width_delta=0, role="raw"):
    image = c.macos_frame["raw"] if role == "raw" else c.macos_frame["composition"]["image"]
    ref = image["artifact"]
    if family == "windows":
        frame = json.loads((ROOT / "packages/contracts/windows_frame/examples/windows-retained.json").read_text())[0]
        frame.update(source=deepcopy(c.source),
                     **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
        frame["raw"].update(artifact=deepcopy(ref), width=image["width"] + width_delta,
                             height=image["height"], native_file="frames/" + ref["sha256"] + ".png")
        frame["composed"] = None
        windows_frame.validate(frame)
    elif family == "raw":
        frame = deepcopy(c.raw_frame)
        frame.update(artifact=deepcopy(ref), raw_width=image["width"] + width_delta, raw_height=image["height"])
        capture_frame.validate(frame)
    elif family == "desktop":
        frame = json.loads((ROOT / "packages/contracts/desktop_frame/examples/macos-synthetic.json").read_text())
        frame.update(source=deepcopy(c.source), artifact=deepcopy(ref),
                     raw_width=image["width"] + width_delta,
                     raw_height=image["height"],
                     **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
        desktop_frame.validate(frame)
    else:
        assert family == "legacy"
        frame = deepcopy(c.frame)
        frame.update(artifact_id=ref["artifact_id"], content_hash=ref["sha256"],
                     width=image["width"] + width_delta, height=image["height"])
    frame["frame_id"] = "older-family-frame"
    return frame


def retain_old(c, family, *, width_delta=0, role="raw", sequence=1):
    frame = old_frame(c, family, width_delta=width_delta, role=role)
    ref = c.ref if role == "raw" else c.composed_ref
    item = deepcopy(c.batch["records"][0])
    item.update(record_id="older-family-record", sequence=sequence,
                 frame_id=frame["frame_id"], artifacts=[deepcopy(ref)])
    if family == "legacy":
        item["media_position"] = frame["media_position"]
    batch = {**c.batch, "records": [item]}
    method = {"windows": c.registry.ingest_windows_frames, "raw": c.registry.ingest_raw_frames,
              "desktop": c.registry.ingest_desktop_frames, "legacy": c.registry.ingest_frames}[family]
    ack = method(c.user, batch, [frame], "older-family")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    return frame


def mac_envelope(c, *, alias=False, role="raw"):
    item, frame = additional(c, parents=["older-family-record"])
    if alias:
        image = frame["raw"] if role == "raw" else frame["composition"]["image"]
        image["artifact"]["artifact_id"] = "mac-cross-family-alias"
        upload_original(c, image["artifact"], c.data if role == "raw" else c.composed_data)
        item["artifacts"] = references(frame) + [deepcopy(c.ink_ref)]
    return {"contract_version": "0.2.12", "batch": {**c.batch, "records": [item]}, "frames": [frame]}


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "same-hash-alias"])
@pytest.mark.parametrize("family", ["raw", "desktop", "windows", "legacy"])
def test_old_family_width_contradiction_refuses_new_mac_image_atomically(macos_setup, alias, family):
    c = macos_setup
    retain_old(c, family, width_delta=1)
    envelope = mac_envelope(c, alias=alias)
    denied(c, lambda: ingest_request(c, envelope, "cross-family-conflict"), 409, "record_conflict")


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "same-hash-alias"])
@pytest.mark.parametrize("family", ["raw", "desktop", "windows", "legacy"])
def test_consistent_cross_family_originals_remain_usable_and_replay_exactly(macos_setup, alias, family):
    c = macos_setup
    old = retain_old(c, family)
    envelope = mac_envelope(c, alias=alias)
    ack = ingest_request(c, envelope, "cross-family-consistent")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    retained = documents(c)
    assert ingest_request(c, envelope, "cross-family-consistent") == ack
    selected = envelope["frames"][0]
    assert reader(c).read_macos([envelope["batch"]["records"][0]["record_id"]])["frames"] == [selected]
    for role, data in (("raw", c.data), ("composed", c.composed_data)):
        assert resolver(c).resolve_macos(selected, image_role=role, max_bytes=len(data))["data"] == data
    assert documents(c) == retained
    kind = "frame" if family == "legacy" else "raw_capture_frame"
    assert retained[(kind, old["frame_id"])] == old


@pytest.mark.parametrize("alias", [False, True], ids=["same-artifact", "same-hash-alias"])
@pytest.mark.parametrize("family", ["raw", "windows"])
def test_composed_mac_image_also_checks_older_family_original_identity(macos_setup, alias, family):
    c = macos_setup
    retain_old(c, family, width_delta=1, role="composed")
    envelope = mac_envelope(c, alias=alias, role="composed")
    denied(c, lambda: ingest_request(c, envelope, "composed-cross-family-conflict"), 409, "record_conflict")


@pytest.mark.parametrize("family", ["raw", "desktop", "windows", "legacy"])
def test_ordinary_later_old_family_contradiction_withholds_cached_mac_read_and_resolve(macos_setup, family):
    c = macos_setup
    ack = ingest_request(c)
    # Old-family entrypoints keep their prior admission boundary. This ordinary
    # accepted write introduces retained disagreement after Mac's initial ACK;
    # no private store mutation is used to create or hide the contradictory row.
    retain_old(c, family, width_delta=1, sequence=2)
    denied(c, lambda: ingest_request(c), 503, "unavailable")
    denied(c, lambda: reader(c).read_macos(["process-1"]), 503, "unavailable")
    retained = documents(c)
    for role, data in (("raw", c.data), ("composed", c.composed_data)):
        assert resolver(c).resolve_macos(c.macos_frame, image_role=role, max_bytes=len(data)) == {"status": "unavailable"}
    assert documents(c) == retained
    assert ack["acknowledged"][0]["disposition"] == "accepted"


@pytest.mark.parametrize("width_delta", [0, 1], ids=["consistent", "contradictory"])
def test_actual_opt_in_asgi_checks_cross_family_hash_alias(macos_setup, width_delta):
    c = macos_setup
    retain_old(c, "windows", width_delta=width_delta)
    envelope = mac_envelope(c, alias=True)
    app = create_capture_app(c.store, c.auth, capabilities=CAPABILITIES | {wire.CAPABILITY},
        clock=lambda: c.instant[0], stop_fact_resolver=resolve_stop_fact, enable_macos_ingress=True)
    before = documents(c)
    response = request(app, "POST", "/v2/process/macos-frames:batch", body=envelope,
                       request_key="cross-family-http")
    if width_delta:
        error(response, 409, "record_conflict")
        assert documents(c) == before
    else:
        ack = success(c, response, envelope)
        retained = documents(c)
        repeated = request(app, "POST", "/v2/process/macos-frames:batch", body=envelope,
                           request_key="cross-family-http")
        assert success(c, repeated, envelope) == ack
        assert documents(c) == retained


@pytest.mark.parametrize("representation", ["dom_snapshot", "synthetic_fixture"])
def test_legacy_non_screen_dimensions_do_not_become_png_dimensions(macos_setup, representation):
    c = macos_setup
    # Explicit retained-legacy metadata fixture. The screen-ingress endpoint
    # intentionally refuses these representations; no DOM acquisition is claimed.
    # Viewport/fixture dimensions are not measured PNG dimensions, while the
    # immutable encoded-byte hash still has its usual meaning.
    source = {name: c.core["SourceSnapshot"][name] for name in ("user_id", "source_id", "source_version")}
    ref = {**c.ref, "artifact_id": "legacy-non-screen-byte-alias"}
    OriginalArtifacts(c.store, lambda state: None).put(c.user, source, "screen_image", ref, c.data)
    frame = {**deepcopy(c.core["Frame"]), **source, "frame_id": "legacy-non-screen",
             "artifact_id": ref["artifact_id"], "content_hash": ref["sha256"],
             "width": 901, "height": 503, "representation": representation,
             "device_id": c.batch["device_id"], "session_id": c.batch["session_id"]}
    checked("Frame", frame)
    with c.store.transaction(c.user) as tx:
        Archive._immutable(tx, "frame", frame["frame_id"], frame)
    envelope = c.envelope
    ack = ingest_request(c, envelope, "after-non-screen")
    retained = documents(c)
    assert ingest_request(c, envelope, "after-non-screen") == ack
    assert reader(c).read_macos([envelope["batch"]["records"][0]["record_id"]])["frames"] == envelope["frames"]
    assert documents(c) == retained


def test_privileged_legacy_hash_corruption_cannot_bypass_mac_current_reads(macos_setup):
    c = macos_setup
    old = retain_old(c, "legacy")
    envelope = mac_envelope(c)
    ingest_request(c, envelope, "legacy-hash-consistent")
    # This separately labeled private-store mutation simulates immutable-row
    # damage. Ordinary typed legacy submissions cannot rewrite this byte hash.
    c.store._documents[c.user][("frame", old["frame_id"])]["content_hash"] = "f" * 64
    denied(c, lambda: ingest_request(c, envelope, "legacy-hash-consistent"), 503, "unavailable")
    record_id = envelope["batch"]["records"][0]["record_id"]
    denied(c, lambda: reader(c).read_macos([record_id]), 503, "unavailable")
    retained = documents(c)
    assert resolver(c).resolve_macos(envelope["frames"][0], image_role="raw", max_bytes=len(c.data)) == {
        "status": "unavailable"}
    assert documents(c) == retained
