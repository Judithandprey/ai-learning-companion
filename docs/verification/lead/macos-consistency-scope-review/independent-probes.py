"""Independent scoped-consistency probes; exact exported source, no service/DB.

Historical QA helpers are imported unchanged. Explicit synthetic storage rows
are used only in the pure-checker ordering/sibling case below.
"""
from copy import deepcopy
from itertools import permutations

import pytest

from services.api import capture, image_resolver, process_context
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.frame_variants import check_macos_image_consistency
from services.learning.process_context import prepare_observation_window
from test_p0_13_macos_ingress_qa import (
    chain, crashes, call, closed, fixture_bytes, MacRig, MAX, MAC, REGISTRATION,
    SOURCE, STREAM, TOKEN, USER, refused,
)


def add_conflict(rig, family, name, sequence, *, second_source=False):
    picture = rig.frames["f6"]["composition"]["image"]
    alias = {**deepcopy(picture["artifact"]), "artifact_id": name + "-alias"}
    if second_source:
        import base64
        source = {"user_id": USER, "source_id": "independent-second-source", "source_version": 1}
        response = call(rig.app, "PUT", "/v2/process/display-sources/" + source["source_id"],
            {"contract_version": "0.2.4", "source_id": source["source_id"], "stream_id": STREAM,
             "project_id": None, "source_timezone": "UTC"})
        assert response.status_code == 200
        body = {"contract_version": "0.2.2", "source": source, "kind": "screen_image",
                "artifact": alias, "data_base64": base64.b64encode(fixture_bytes(picture)).decode()}
        assert call(rig.app, "PUT", "/v2/process/originals/" + alias["artifact_id"], body).status_code == 200
    else:
        rig.put(alias, fixture_bytes(picture))
        source = None
    response = rig.post_old(family, name, sequence, alias, 201, 100, source=source)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("family", ["raw", "windows"])
def test_historical_late_conflict_keeps_actual_conflict_and_releases_unrelated_frame(chain, family):
    rig = chain
    add_conflict(rig, family, "independent-late-" + family, 6)
    reader, images = rig.readers()
    before = rig.documents()
    refused(rig, rig.body, "qa-mac-chain-key", 503, "unavailable")
    ids = [r["record_id"] for r in rig.records]
    with pytest.raises(DomainError) as caught:
        reader.read_macos(ids)
    assert caught.value.status == 503
    for role in ("raw", "composed"):
        assert images.resolve_macos(rig.frames["f6"], image_role=role, max_bytes=MAX) == {"status": "unavailable"}
        healthy = images.resolve_macos(rig.frames["f2"], image_role=role, max_bytes=MAX)
        assert healthy["status"] == "available"
        picture = rig.frames["f2"]["raw"] if role == "raw" else rig.frames["f2"]["composition"]["image"]
        assert healthy["data"] == fixture_bytes(picture)
    with pytest.raises(DomainError) as caught:
        prepare_observation_window(ids, reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    assert caught.value.status == 503
    packet = prepare_observation_window(["qa-gap", "qa-r2"], reader.read_macos, images,
                                       user_id=USER, macos_resolver=images.resolve_macos)
    assert packet["items"][0]["image"] == {"status": "missing_frame"}
    assert packet["items"][1]["composed_image"]["data"] == fixture_bytes(rig.frames["f2"]["composition"]["image"])
    assert rig.documents() == before


def test_historical_scope_observation_now_recovers_without_deleting_originals(chain):
    rig = chain
    add_conflict(rig, "raw", "independent-s2", 6, second_source=True)
    reader, images = rig.readers()
    before = rig.documents()
    assert reader.read_macos(["qa-gap"])["frames"] == []
    assert reader.read_macos(["qa-r2"])["frames"] == [rig.frames["f2"]]
    assert images.resolve_macos(rig.frames["f2"], image_role="raw", max_bytes=MAX)["status"] == "available"
    assert rig.documents() == before
    gap = rig.envelope("independent-gap", [rig.record("independent-gap", 7, coverage="partial")], [])
    response = rig.post(gap, "independent-gap-key")
    assert response.status_code == 200
    saved = rig.documents()
    assert rig.post(gap, "independent-gap-key").json() == response.json()
    assert rig.documents() == saved
    assert all(saved[k] == v for k, v in before.items())
    # Actual conflicting image is still withheld; source deletion is not used.
    assert images.resolve_macos(rig.frames["f6"], image_role="composed", max_bytes=MAX) == {"status": "unavailable"}
    fresh = MacRig().open().start()
    f = fresh.frame(1, "independent-unretained-frame")
    ref = {**deepcopy(f["raw"]["artifact"]), "artifact_id": "independent-raw-alias"}
    fresh.put(ref, fixture_bytes(f["raw"]))
    assert fresh.post_old("raw", "independent-old-a", 1, ref, 200, 100).status_code == 200
    assert fresh.post_old("raw", "independent-old-b", 2, ref, 201, 100).status_code == 200
    original = fresh.documents()
    body = fresh.envelope("independent-first-gap", [fresh.record("independent-first-gap", 3, coverage="partial")], [])
    first = fresh.post(body, "independent-first-gap-key")
    assert first.status_code == 200 and first.json()["acknowledged"][0]["artifacts"] == []
    assert all(fresh.documents()[k] == v for k, v in original.items())


def test_checker_ordering_and_per_image_sibling_boundaries():
    """Synthetic retained descriptor rows, not an ordinary mutation API.

    Exhaust all six orderings for a sibling conflict and a transitive alias
    conflict; no sockets, archive writes or byte-decoding are needed here.
    """
    rig = MacRig()
    selected = rig.frame(1, "independent-selected", {"kind": "unknown", "reason": "no_retained_outcome"})
    sibling = rig.frame(5, "independent-sibling")
    assert selected["raw"]["artifact"]["sha256"] == sibling["raw"]["artifact"]["sha256"]
    assert selected["raw"]["artifact"]["sha256"] != sibling["composition"]["image"]["artifact"]["sha256"]
    def raw(name, artifact, width=200):
        return rig.old_family("raw", name, 1, artifact, width, 100)["frames"][0]
    conflicting_sibling = raw("independent-sibling-conflict", sibling["composition"]["image"]["artifact"], 201)
    class Rows:
        def __init__(self, rows):
            self.rows = rows
        def scan(self, kind):
            assert kind in {"frame", "raw_capture_frame"}
            return [] if kind == "frame" else self.rows
    for order in permutations([selected, sibling, conflicting_sibling]):
        check_macos_image_consistency(Rows(order), targets=[selected])
        with pytest.raises(DomainError) as caught:
            check_macos_image_consistency(Rows(order), targets=[sibling])
        assert (caught.value.status, caught.value.code) == (503, "unavailable")
    # Target A/hash -> bridge B/hash -> B/other hash; B/other can precede bridge.
    bridge_ref = {**deepcopy(selected["raw"]["artifact"]), "artifact_id": "independent-bridge"}
    bridge = raw("independent-bridge", bridge_ref)
    damaged = raw("independent-damaged", {**bridge_ref, "sha256": "a" * 64})
    for order in permutations([selected, bridge, damaged]):
        with pytest.raises(DomainError) as caught:
            check_macos_image_consistency(Rows(order), targets=[selected])
        assert (caught.value.status, caught.value.code) == (503, "unavailable")


@pytest.mark.parametrize("operation", ["ingress", "reader", "resolver"])
def test_revoked_current_caller_after_scoped_scan_never_receives_success(chain, monkeypatch, operation):
    rig = chain
    reader, images = rig.readers()
    module = {"ingress": capture, "reader": process_context, "resolver": image_resolver}[operation]
    original = module.check_macos_image_consistency
    reached = []
    def checked_then_revoke(*args, **kwargs):
        result = original(*args, **kwargs)
        reached.append(True)
        rig.app.state.authenticator.revoke(TOKEN)
        return result
    monkeypatch.setattr(module, "check_macos_image_consistency", checked_then_revoke)
    before = rig.documents()
    if operation == "ingress":
        # Cached success is still subject to final current-caller authorization.
        response = rig.post(rig.body, "qa-mac-chain-key")
        assert (response.status_code, response.json()) == closed(401, "unauthenticated")
    elif operation == "reader":
        with pytest.raises(DomainError) as caught:
            reader.read_macos(["qa-r2"])
        assert caught.value.status == 401
    else:
        assert images.resolve_macos(rig.frames["f2"], image_role="raw", max_bytes=MAX) == {"status": "revoked"}
    assert reached == [True] and rig.documents() == before
