"""Independent QA API acceptance of Mac capture ingress 0.2.12 at main 576c62c (Backend 40ab42e + b83ee3e as
27cf448 / a244d56).

Method. Ingest runs through the actual opt-in trusted-local runtime (create_local_capture_runtime with
enable_macos_ingress and the desktop_pixels producer profile) and its composed ASGI app over httpx ASGITransport and
MemoryStore; refused configurations build create_capture_app directly. Stored data is read back through the
current-authorized readers (read_macos / resolve_macos) and the existing Learning consumer. Old-family frames
(raw 0.2.6) are written through their own ordinary HTTP route on the same runtime.

Inputs. The PNGs are the retained audited Swift-generated synthetic buffers (packages/contracts/macos_frame/examples/
provenance.json: "not display capture"), each paired with its own released MacRetainedFrame 0.2.11 descriptor and
uploaded under its audited archive ID. Identities, token, consent, process records and the editable ink JSON are
QA-synthetic. The 'unknown' composition outcome is QA-built from the contract shape (labelled). Retained-row damage and
in-transaction faults are SYNTHETIC; no HTTP route can cause them. No listener, database, native Mac, display, provider.
"""

import asyncio
import base64
import concurrent.futures
import hashlib
import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from packages.contracts import macos_capture_ingress
from services.api import ingress_app
from services.api.auth import LocalTestAuthenticator, Principal
from services.api.capture_app import create_capture_app
from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore, _MemoryTransaction
from services.learning.process_context import prepare_observation_window
from test_p0_13_windows_ingress_qa import crashes, during_transaction, reversed_members  # noqa: F401  (crashes: autouse fixture)

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_DIR = ROOT / "packages/contracts/macos_frame/examples"
PROVENANCE = json.loads((EXAMPLES_DIR / "provenance.json").read_text())
FIXTURE = ROOT / PROVENANCE["fixture_path"]
EX = json.loads((EXAMPLES_DIR / "macos-retained.json").read_text())
WEX = json.loads((ROOT / "packages/contracts/windows_frame/examples/windows-retained.json").read_text())
NOW = datetime(2026, 9, 30, 18, 0, tzinfo=timezone.utc)
TOKEN = "qa-macos-0212-token-" + "m" * 20
USER, DEVICE, SESSION, STREAM, SOURCE = "qa-mac-user", "qa-mac-device", "qa-mac-session", "qa-mac-stream", "qa-mac-display"
MAC, RAW, WINDOWS, STREAMS = "/v2/process/macos-frames:batch", "/v2/process/raw-frames:batch", "/v2/process/windows-frames:batch", "/v2/process/streams"
SCOPES = frozenset({"sources:read", "sources:write", "process:control", "process:capture"})
CAPS = frozenset({"process.control.v0.2.1", "process.capture.v0.2", "process.ingress.v0.2.4", "process.raw-ingress.v0.2.6",
                  "process.windows-ingress.v0.2.10", "process.macos-ingress.v0.2.12"})
REGISTRATION = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM,
                "authorization_generation": 1, "membership_revision": 1, "continuity": {"kind": "initial"}}
SRC = {"user_id": USER, "source_id": SOURCE, "source_version": 1}
INK = b'{"qa_synthetic_editable_ink":true,"strokes":[[[12,14],[40,18]]]}\n'
INK_REF = {"artifact_id": "qa-mac-ink", "sha256": hashlib.sha256(INK).hexdigest(), "byte_length": len(INK), "media_type": "application/json"}
UNKNOWN = {"kind": "unknown", "reason": "no_retained_outcome"}  # QA-built from the contract shape (not in the audited fixture)
MAX = 4 << 20


def call(app, method, path, body=None, *, request_key=None):
    import httpx

    async def run():
        headers = {"Authorization": f"Bearer {TOKEN}", **({"Idempotency-Key": request_key} if request_key else {})}
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://qa-macos.test") as client:
            return await client.request(method, path, headers=headers, **({} if body is None else {"json": body}))
    return asyncio.run(run())


def fixture_bytes(picture):
    data = (FIXTURE / picture["native_file"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == picture["artifact"]["sha256"] and len(data) == picture["artifact"]["byte_length"]
    return data


def closed(status, code, version="0.2.12"):
    return status, {"contract_version": version, "error": code, "retryable": code in {"unavailable", "dependency_missing"}}


class MacRig:
    def __init__(self, store=None):
        self.store = store or MemoryStore()
        self.instant = [NOW]
        self.uploaded = set()

    def open(self, *, mac=True, raw=True, windows=False, profile="desktop_pixels", fresh_consent=True):
        flags = {} if mac is None else {"enable_macos_ingress": mac}
        self.runtime = create_local_capture_runtime(
            store=self.store, user_id=USER, device_id=DEVICE, session_id=SESSION, producer_id="qa-mac-screen",
            registration=deepcopy(REGISTRATION), token=TOKEN, expires_at=NOW + timedelta(hours=1), scopes=SCOPES, capabilities=CAPS,
            fresh_consent=fresh_consent, enable_raw_ingress=raw, enable_windows_ingress=windows, producer_profile=profile,
            clock=lambda: self.instant[0], **flags)
        return self

    @property
    def app(self):
        return self.runtime.app

    def start(self):
        response = call(self.app, "POST", STREAMS, REGISTRATION, request_key="qa-mac-registration")
        assert response.status_code == 200 and response.json()["state"] == "live", response.text
        response = call(self.app, "PUT", f"/v2/process/display-sources/{SOURCE}",
                        {"contract_version": "0.2.4", "source_id": SOURCE, "stream_id": STREAM, "project_id": None, "source_timezone": "UTC"})
        assert response.status_code == 200, response.text
        self.descriptor = response.json()
        self.put(INK_REF, INK, "editable_ink")
        return self

    def put(self, ref, data, kind="screen_image"):
        body = {"contract_version": "0.2.2", "source": SRC, "kind": kind, "artifact": ref, "data_base64": base64.b64encode(data).decode()}
        response = call(self.app, "PUT", "/v2/process/originals/" + ref["artifact_id"], body)
        assert response.status_code == 200 and response.json()["status"] == "bytes_committed", response.text
        self.uploaded.add(ref["artifact_id"])

    def upload(self, frame):
        pictures = [frame["raw"]] + ([frame["composition"]["image"]] if frame["composition"]["kind"] == "composed" else [])
        for picture in pictures:
            if picture["artifact"]["artifact_id"] not in self.uploaded:
                self.put(picture["artifact"], fixture_bytes(picture))

    def frame(self, index, frame_id, composition=None):
        f = deepcopy(EX[index])
        f.update(frame_id=frame_id, device_id=DEVICE, session_id=SESSION, stream_id=STREAM, source=deepcopy(SRC))
        if composition is not None:
            f["composition"] = deepcopy(composition)
        return f

    def record(self, record_id, sequence, frame=None, parents=(), coverage="unobserved", ink=True):
        artifacts = []
        if frame is not None:
            artifacts.append(deepcopy(frame["raw"]["artifact"]))
            if frame["composition"]["kind"] == "composed" and frame["composition"]["image"]["artifact"] != frame["raw"]["artifact"]:
                artifacts.append(deepcopy(frame["composition"]["image"]["artifact"]))
            if ink:
                artifacts.append(deepcopy(INK_REF))
        return {"record_id": record_id, "sequence": sequence, "source": deepcopy(SRC), "scope": {"kind": "provisional_session"},
                "observed_at": None, "clock": None, "media_position": None, "surface": "external_app", "method": "visual",
                "causal_parents": list(parents), "artifacts": artifacts, "frame_id": frame["frame_id"] if frame else None,
                "evidence": {"kind": "coverage", "coverage": "observed_samples" if frame else coverage, "from_clock_ms": None,
                             "through_clock_ms": None, "missing_sequences": [],
                             "limitations": ["sample_only", "unsupported_history"] if frame else ["unknown", "unsupported_history"]}}

    def envelope(self, batch_id, records, frames, version="0.2.12"):
        return {"contract_version": version, "frames": frames,
                "batch": {"contract_version": "0.2.0", "batch_id": batch_id, "device_id": DEVICE, "session_id": SESSION,
                          "stream_id": STREAM, "delivery_mode": "live", "records": records}}

    def post(self, body, request_key, path=MAC):
        return call(self.app, "POST", path, body, request_key=request_key)

    def documents(self):
        with self.store.transaction(USER) as tx:
            return deepcopy(tx.documents)

    def guard(self, state):
        principal = self.app.state.authenticator.authenticate(TOKEN, self.instant[0])
        if principal != self.runtime.principal or state.get("generation") != principal.authorization_generation or state.get("enabled") is not True:
            raise DomainError(403, "forbidden")

    def readers(self):
        return AuthorizedProcessContextReader(self.store, USER, self.guard), AuthorizedImageResolver(self.store, USER, self.guard)

    def old_family(self, family, record_id, sequence, artifact, width, height, parents=(), source=None):
        """An ordinary older-family envelope with one pixel-honest record declaring `artifact` at width x height:
        raw 0.2.6 (a 0.2.5 frame written out here) or Windows 0.2.10 (the released 0.2.9 example, raw only)."""
        source = deepcopy(source or SRC)
        if family == "raw":
            frame = {"contract_version": "0.2.5", "kind": "raw_capture_frame", "frame_id": record_id + "-frame", "source": source,
                     "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM, "artifact": deepcopy(artifact), "raw_width": width,
                     "raw_height": height, "buffer_sequence": 1000 + sequence, "captured_at": None, "media_position": None,
                     "timing": {"observed_at_estimate": None, "estimate_basis": None, "uncertainty_ms": None, "callback_clock": None, "sample_pts_seconds": None},
                     "orientation": {"system": "CGImagePropertyOrientation", "value": 1, "applied_to_pixels": False}}
            route_version = "0.2.6"
        else:
            frame = deepcopy(WEX[0])
            frame.update(frame_id=record_id + "-frame", source=source, device_id=DEVICE, session_id=SESSION, stream_id=STREAM, composed=None)
            frame["raw"].update(artifact=deepcopy(artifact), width=width, height=height, native_file="frames/" + artifact["sha256"] + ".png",
                                pixels_sha256=hashlib.sha256(b"qa-declared-rgba-" + record_id.encode()).hexdigest())
            route_version = "0.2.10"
        item = self.record(record_id, sequence, None, parents)
        item.update(source=deepcopy(source), frame_id=frame["frame_id"], artifacts=[deepcopy(artifact)])
        item["evidence"] = {**item["evidence"], "coverage": "observed_samples", "limitations": ["sample_only", "unsupported_history"]}
        return {"contract_version": route_version, "frames": [frame], "batch": {"contract_version": "0.2.0", "batch_id": record_id, "device_id": DEVICE,
                "session_id": SESSION, "stream_id": STREAM, "delivery_mode": "live", "records": [item]}}

    def post_old(self, family, record_id, sequence, artifact, width, height, source=None):
        path = RAW if family == "raw" else WINDOWS
        return self.post(self.old_family(family, record_id, sequence, artifact, width, height, source=source), record_id + "-key", path)


def refused(rig, body, request_key, status, code, path=MAC, version="0.2.12"):
    before = rig.documents()
    response = rig.post(body, request_key, path)
    assert (response.status_code, response.json()) == closed(status, code, version), response.text
    assert b"iVBOR" not in response.content
    assert rig.documents() == before, "a refused request changed the store"


@pytest.fixture
def chain():
    """One ordered Mac batch: a frameless gap, two frames with distinct raw/composed bytes (fixture frames 2 and 6),
    the fixture's genuine refused composition (frame 7), and a QA-built unknown outcome (on fixture frame 4)."""
    rig = MacRig().open(windows=True).start()
    rig.frames = {"f2": rig.frame(1, "qa-mf-2"), "f6": rig.frame(5, "qa-mf-6"), "f7": rig.frame(6, "qa-mf-7"),
                  "f4u": rig.frame(3, "qa-mf-4u", UNKNOWN)}
    for f in rig.frames.values():
        rig.upload(f)
    rig.records = [rig.record("qa-gap", 1), rig.record("qa-r2", 2, rig.frames["f2"], ["qa-gap"]), rig.record("qa-r6", 3, rig.frames["f6"]),
                   rig.record("qa-r7", 4, rig.frames["f7"]), rig.record("qa-r4u", 5, rig.frames["f4u"])]
    rig.body = rig.envelope("qa-mac-chain", rig.records, list(rig.frames.values()))
    first = rig.post(rig.body, "qa-mac-chain-key")
    assert first.status_code == 200, first.text
    rig.ack = first.json()
    rig.committed = rig.documents()
    return rig


# --------------------------------------------------------------------------- closure, old routes, gap-only admission
def test_mac_route_is_default_off_needs_its_own_authority_and_old_routes_reject_it():
    rig = MacRig().open(mac=None, profile=None)  # the factory default: flag omitted
    assert (lambda r: (r.status_code, r.json()))(rig.post({"contract_version": "0.2.12"}, "k")) == closed(404, "not_found", "0.2.4")
    auth = LocalTestAuthenticator({TOKEN: Principal(USER, SCOPES, NOW + timedelta(hours=1))})
    without = create_capture_app(rig.store, auth, capabilities=CAPS - {"process.macos-ingress.v0.2.12"}, clock=lambda: NOW, enable_macos_ingress=True)
    response = call(without, "POST", MAC, {"contract_version": "0.2.12"}, request_key="k")
    assert (response.status_code, response.json()) == closed(403, "capability_required")
    for kwargs, match in (({"profile": None}, "desktop_pixels"), ({"profile": "desktop_pixels", "caps": CAPS - {"process.macos-ingress.v0.2.12"}}, "macOS ingress requires")):
        empty = MemoryStore()
        with pytest.raises(ValueError, match=match):
            create_local_capture_runtime(
                store=empty, user_id=USER, device_id=DEVICE, session_id=SESSION, producer_id="p", registration=deepcopy(REGISTRATION), token=TOKEN,
                expires_at=NOW + timedelta(hours=1), scopes=SCOPES, capabilities=kwargs.get("caps", CAPS), fresh_consent=True,
                enable_macos_ingress=True, producer_profile=kwargs["profile"], clock=lambda: NOW)
        assert empty._documents == {}
    # A valid Mac envelope sent to the older routes of a runtime that enables them all: refused there, nothing written.
    live = MacRig().open(windows=True).start()
    f = live.frame(1, "qa-mf-2")
    live.upload(f)
    body = live.envelope("qa-old", [live.record("qa-old", 1, f)], [f])
    for path, version in ((RAW, "0.2.6"), (WINDOWS, "0.2.10")):
        refused(live, body, "qa-old-" + version, 422, "unsupported_version", path=path, version=version)
        relabelled = {**deepcopy(body), "contract_version": version}
        refused(live, relabelled, "qa-old-relabel-" + version, 422, "unsupported_version", path=path, version=version)


def test_frameless_gap_first_admission_and_its_limits():
    rig = MacRig().open().start()
    before = rig.documents()
    gap = rig.envelope("qa-gap-only", [rig.record("qa-gap", 1, coverage="partial")], [])
    first = rig.post(gap, "qa-gap-key")
    assert first.status_code == 200 and [r["artifacts"] for r in first.json()["acknowledged"]] == [[]], first.text
    added = {kind for kind, _ in set(rig.documents()) - set(before)}
    assert "raw_capture_frame" not in added and "artifact" not in added and {"capture_record", "capture_replay"} <= added
    assert rig.post(gap, "qa-gap-key").json() == first.json()
    bad = deepcopy(gap)
    bad["batch"]["records"][0]["evidence"].update(coverage="observed_samples", limitations=["sample_only", "unsupported_history"])
    refused(rig, bad, "qa-gap-bad", 422, "invalid_request")
    with_artifact = deepcopy(gap)
    with_artifact["batch"]["records"][0]["artifacts"] = [deepcopy(INK_REF)]
    refused(rig, with_artifact, "qa-gap-artifact", 422, "invalid_request")
    # An unmarked (generic) incarnation cannot use the Mac route even for a gap.
    generic = MacRig().open(mac=False, profile=None).start()
    unmarked = create_capture_app(generic.store, generic.app.state.authenticator, capabilities=CAPS, clock=lambda: NOW, enable_macos_ingress=True)
    before = generic.documents()
    response = call(unmarked, "POST", MAC, generic.envelope("qa-gap-only", [generic.record("qa-gap", 1)], []), request_key="qa-gap-key")
    assert (response.status_code, response.json()) == closed(403, "forbidden") and generic.documents() == before


# --------------------------------------------------------------------------- ordered chain to Learning
def test_chain_commits_distinct_raw_and_composed_and_explicit_outcomes(chain):
    rig = chain
    macos_capture_ingress.validate_ack(rig.body["batch"], rig.ack, user_id=USER, verified_artifacts={
        tuple(a[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for r in rig.records for a in r["artifacts"]})
    receipts = rig.ack["acknowledged"]
    assert [r["record_id"] for r in receipts] == [r["record_id"] for r in rig.records] and {r["disposition"] for r in receipts} == {"accepted"}
    assert [[a["artifact_id"] for a in r["artifacts"]] for r in receipts] == [
        [], ["synthetic-raw-2", "synthetic-composed-2", "qa-mac-ink"], ["synthetic-raw-6", "synthetic-composed-6", "qa-mac-ink"],
        ["synthetic-raw-7", "qa-mac-ink"], ["synthetic-raw-4", "qa-mac-ink"]]
    assert all(a["status"] == "verified" for r in receipts for a in r["artifacts"])
    reader, images = rig.readers()
    ids = [r["record_id"] for r in rig.records]
    stored = reader.read_macos(ids)
    assert stored == reader.read_macos(ids) and stored["batch"]["records"] == rig.records and stored["frames"] == list(rig.frames.values())
    assert stored["sources"] == [rig.descriptor] and stored["batch"]["delivery_mode"] == "historical"
    for name in ("f2", "f6"):
        f = rig.frames[name]
        raw, comp = (images.resolve_macos(f, image_role=role, max_bytes=MAX) for role in ("raw", "composed"))
        assert raw["status"] == comp["status"] == "available" and raw["frame"] == comp["frame"] == f
        assert raw["data"] == fixture_bytes(f["raw"]) and comp["data"] == fixture_bytes(f["composition"]["image"]) and raw["data"] != comp["data"]
    for name in ("f7", "f4u"):  # no composition was retained (refused) or its outcome is unknown: never the raw image instead
        assert images.resolve_macos(rig.frames[name], image_role="composed", max_bytes=MAX) == {"status": "unobservable"}
        assert images.resolve_macos(rig.frames[name], image_role="raw", max_bytes=MAX)["status"] == "available"


def test_learning_keeps_order_source_time_limits_and_gaps(chain):
    rig = chain
    reader, images = rig.readers()
    order = ["qa-r6", "qa-gap", "qa-r2", "qa-r4u", "qa-r7"]  # QA's own order, not the submission order
    by_id = {r["record_id"]: r for r in rig.records}
    frame_of = {"qa-r6": "f6", "qa-r2": "f2", "qa-r4u": "f4u", "qa-r7": "f7"}
    before = rig.documents()
    packet = prepare_observation_window(order, reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    assert rig.documents() == before
    items = {i["record"]["record_id"]: i for i in packet["items"]}
    assert [i["record"]["record_id"] for i in packet["items"]] == order and all(items[k]["record"] == by_id[k] for k in order)
    assert all(i["source"] == rig.descriptor for i in packet["items"])
    assert items["qa-gap"]["frame"] is None and items["qa-gap"]["image"] == {"status": "missing_frame"}
    for rid, name in frame_of.items():
        f = rig.frames[name]
        assert items[rid]["frame"] == f  # exact producer clock, ink strokes, mapping and limit strings
        assert items[rid]["image"]["status"] == "attached" and items[rid]["image"]["data"] == fixture_bytes(f["raw"])
    for rid in ("qa-r6", "qa-r2"):
        assert items[rid]["composed_image"]["status"] == "attached"
        assert items[rid]["composed_image"]["data"] == fixture_bytes(rig.frames[frame_of[rid]]["composition"]["image"])
    assert items["qa-r7"]["composed_image"] == {"status": "not_composed", "reason": "refused", "image_role": "composed"}
    assert items["qa-r4u"]["composed_image"] == {"status": "unknown", "reason": "no_retained_outcome", "image_role": "composed"}
    assert [p["record_id"] for p in items["qa-r2"]["parents"]] == ["qa-gap"]
    # Fixture frame 6 states that its pixels' own time is unknown: kept as stated, never filled in.
    ink6 = items["qa-r6"]["frame"]["composition"]["ink"]
    assert ink6["pixels_time"] == "callback_admission" and items["qa-r6"]["frame"]["profile"]["host_clock"]["source_seconds"] is None
    assert any("pixels' own time is unknown" in limit for limit in ink6["limits"])
    assert packet["presentation_permission"] == "not_granted" and packet["capture_completeness"] == "unknown"
    assert {packet[k] for k in ("authorization_status", "commit_status", "live_status", "provider_receipt")} == {"not_attested"}
    window = packet["observation_window"]
    assert window["capture_chronology"] == "unknown" and window["capture_intervals"] == "unknown"
    assert all(c["clock_readings"] == {"status": "unknown", "reason": "no_process_capture_clock"} for c in window["comparisons"])
    # A per-image budget below the composed PNG leaves an explicit, reasoned gap instead of shrinking or substituting it.
    small = prepare_observation_window(["qa-r6"], reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos,
                                       max_image_bytes=800)
    item = small["items"][0]
    assert item["image"]["status"] == "attached" and item["composed_image"] == {"status": "byte_limit", "image_role": "composed"}
    # The two roles are compared separately: identical raw bytes (the fixture's raw buffers) but different composed images.
    pair = prepare_observation_window(["qa-r6", "qa-r2"], reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    comparison = pair["observation_window"]["comparisons"][0]
    assert comparison["retained_image_bytes"] == "identical" and comparison["retained_composed_image_bytes"] == "different"


@pytest.mark.parametrize("change", ["account_disabled", "source_revoked", "raw_contradiction"])
def test_learning_final_authorized_reread_withholds_the_packet(chain, change):
    """Between the last image resolution and Learning's final reread, current authority or retained consistency changes:
    no packet is published."""
    rig = chain
    reader, images = rig.readers()
    order = ["qa-r2", "qa-r6"]
    calls = []

    def resolver(frame, *, image_role, max_bytes):
        result = images.resolve_macos(frame, image_role=image_role, max_bytes=max_bytes)
        calls.append((frame["frame_id"], image_role))
        if len(calls) == 4:  # after the last image, before the final reread
            if change == "account_disabled":
                Archive(rig.store).set_authorization(USER, enabled=False)
            elif change == "source_revoked":
                Archive(rig.store).revoke_source(USER, SOURCE)
            else:  # an ordinary older-family HTTP write contradicting the composed image's retained facts
                alias = {**deepcopy(rig.frames["f6"]["composition"]["image"]["artifact"]), "artifact_id": "qa-alias-composed-6"}
                rig.put(alias, fixture_bytes(rig.frames["f6"]["composition"]["image"]))
                response = rig.post_old("raw", "qa-old-contradiction", 6, alias, 201, 100)
                assert response.status_code == 200, response.text
        return result

    with pytest.raises(DomainError) as error:
        prepare_observation_window(order, reader.read_macos, images, user_id=USER, macos_resolver=resolver)
    # Readers keep 403 for a revoked source (services/api/process_context.py:172-173, as the snapshot API does at
    # services/api/README.md:118); ingress maps it to 404.
    assert error.value.status == {"account_disabled": 403, "source_revoked": 403, "raw_contradiction": 503}[change]


# --------------------------------------------------------------------------- replay and current fences
def test_exact_ordered_replay_keeps_the_original_ack(chain):
    rig = chain
    rig.instant[0] = NOW + timedelta(minutes=20)
    assert rig.post(rig.body, "qa-mac-chain-key").json() == rig.ack
    members = reversed_members(rig.body)
    assert json.dumps(members) != json.dumps(rig.body) and rig.post(members, "qa-mac-chain-key").json() == rig.ack
    assert rig.documents() == rig.committed
    swapped = deepcopy(rig.body)
    swapped["frames"] = list(reversed(swapped["frames"]))
    refused(rig, swapped, "qa-mac-chain-key", 409, "idempotency_conflict")
    duplicate = rig.post(rig.body, "qa-mac-other-key")
    assert duplicate.status_code == 200 and {r["disposition"] for r in duplicate.json()["acknowledged"]} == {"duplicate"}
    assert set(rig.documents()) - set(rig.committed) == {("capture_replay", key("POST", MAC, "qa-mac-other-key"))}


def mac_fence(rig, name, monkeypatch):
    docs = rig.store._documents[USER]
    if name == "token_revoked_under_lock":
        return during_transaction(monkeypatch, lambda: rig.app.state.authenticator.revoke(TOKEN))
    if name == "token_expired":
        rig.instant[0] = NOW + timedelta(hours=1)
    elif name == "account_disabled":
        Archive(rig.store).set_authorization(USER, enabled=False)
    elif name == "source_revoked":
        Archive(rig.store).revoke_source(USER, SOURCE)
    elif name == "source_deleted":
        Archive(rig.store).delete_source(USER, SOURCE)
    elif name in {"stopped", "withdrawn"}:
        revision = call(rig.app, "GET", f"{STREAMS}/{STREAM}").json()["revision"]
        action = {"kind": "stop", "pre_stop_sequence": None} if name == "stopped" else {"kind": "withdraw"}
        body = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM, "expected_revision": revision, "action": action}
        assert call(rig.app, "POST", f"{STREAMS}/{STREAM}:control", body, request_key="qa-" + name).json()["state"] == name
    elif name == "ink_lost":  # SYNTHETIC retained damage: the committed ink original disappears
        del docs[("artifact", "qa-mac-ink")]
    elif name == "composed_substituted":  # SYNTHETIC: the committed composed row now holds other bytes under its declared hash
        docs[("artifact", "synthetic-composed-6")]["data_base64"] = base64.b64encode(fixture_bytes(rig.frames["f2"]["composition"]["image"])).decode()
    else:
        assert name == "none"


FENCES = [("none", "fresh", None), ("none", "cached", None),
          ("token_revoked_under_lock", "fresh", (401, "unauthenticated")), ("token_revoked_under_lock", "cached", (401, "unauthenticated")),
          ("token_expired", "cached", (401, "unauthenticated")), ("account_disabled", "fresh", (403, "forbidden")),
          ("account_disabled", "cached", (403, "forbidden")), ("source_revoked", "fresh", (404, "not_found")), ("source_revoked", "cached", (404, "not_found")),
          ("source_deleted", "cached", (404, "not_found")), ("stopped", "fresh", (409, "capture_stopped")), ("stopped", "cached", (409, "capture_stopped")),
          ("withdrawn", "cached", (403, "forbidden")), ("ink_lost", "fresh", (503, "unavailable")), ("ink_lost", "cached", (503, "unavailable")),
          ("composed_substituted", "cached", (503, "unavailable"))]


@pytest.mark.parametrize("name,which,expected", FENCES)
def test_current_fences_precede_fresh_and_cached_success(chain, name, which, expected, monkeypatch):
    rig = chain
    if which == "cached":
        body, request_key = rig.body, "qa-mac-chain-key"
    else:  # a new frame (fixture frame 4 with its own composed image) that also names the shared ink original
        f = rig.frame(3, "qa-mf-4")
        rig.upload(f)
        body, request_key = rig.envelope("qa-mac-new", [rig.record("qa-new", 6, f, ["qa-r6"])], [f]), "qa-mac-new-key"
    triggered = mac_fence(rig, name, monkeypatch)
    if expected is None:
        response = rig.post(body, request_key)
        assert response.status_code == 200, response.text
        assert response.json() == rig.ack if which == "cached" else response.json()["acknowledged"][0]["disposition"] == "accepted"
        return
    refused(rig, body, request_key, *expected)
    if triggered is not None:
        assert triggered == [key("POST", MAC, request_key)], "the fault did not fire under the actor lock"
    if name == "source_deleted":
        assert not [k for k, v in rig.documents().items() if k[0] == "artifact" and v.get("data_base64")], "a deleted source kept original bytes"


# --------------------------------------------------------------------------- common artifact / hash contradiction
@pytest.mark.parametrize("width", [199, 200])
@pytest.mark.parametrize("role", ["raw", "composed"])
@pytest.mark.parametrize("family", ["raw", "windows"])
def test_new_mac_frame_contradicting_retained_old_family_facts_is_409_without_writes(family, role, width):
    """An older-family frame first declares one of the Mac frame's PNGs (a same-sha256 alias under a QA archive ID) at
    some width; a later Mac frame declaring those bytes at 200 is refused unless the facts agree (width 200 is the control)."""
    rig = MacRig().open(windows=True).start()
    f = rig.frame(1, "qa-mf-2")
    picture = f["raw"] if role == "raw" else f["composition"]["image"]
    alias = {**deepcopy(picture["artifact"]), "artifact_id": "qa-alias-" + role}
    rig.put(alias, fixture_bytes(picture))
    old = rig.post_old(family, "qa-old", 1, alias, width, 100)
    assert old.status_code == 200, old.text
    rig.upload(f)
    body = rig.envelope("qa-mac-after-old", [rig.record("qa-r2", 2, f, ["qa-old"])], [f])
    if width == 200:
        response = rig.post(body, "qa-mac-key")
        assert response.status_code == 200 and rig.post(body, "qa-mac-key").json() == response.json(), response.text
    else:
        refused(rig, body, "qa-mac-key", 409, "record_conflict")


@pytest.mark.parametrize("family", ["raw", "windows"])
def test_later_old_family_contradiction_withholds_the_affected_mac_frame_only(chain, family):
    """After the Mac chain, an ordinary older-family write (raw 0.2.6 or Windows 0.2.10) declares Mac composed-6's bytes
    (alias) at width 201. The old route still accepts it (declared residual). The affected frame is withheld completely
    (both roles), and so is anything that includes it (whole-chain replay, mixed read, mixed Learning), atomically and
    without writes; the unrelated frame 2 and the gap stay readable, resolvable and preparable.
    (Replaces ..._withholds_mac_replay_read_and_resolve, whose f2 expectation QA-MAC-01 made obsolete at 17262c8.)"""
    rig = chain
    reader, images = rig.readers()
    ids = [r["record_id"] for r in rig.records]
    assert reader.read_macos(ids)["frames"] == list(rig.frames.values())
    alias = {**deepcopy(rig.frames["f6"]["composition"]["image"]["artifact"]), "artifact_id": "qa-alias-composed-6"}
    rig.put(alias, fixture_bytes(rig.frames["f6"]["composition"]["image"]))
    old = rig.post_old(family, "qa-old-contradiction", 6, alias, 201, 100)
    assert old.status_code == 200, old.text
    if family == "raw":  # the older family keeps its own record
        assert reader.read_raw(["qa-old-contradiction"])["frames"][0]["raw_width"] == 201
    else:
        assert reader.read_windows(["qa-old-contradiction"])["frames"][0]["raw"]["width"] == 201
    refused(rig, rig.body, "qa-mac-chain-key", 503, "unavailable")
    before = rig.documents()
    for selection in (ids, ["qa-r6"], ["qa-r2", "qa-r6"]):
        with pytest.raises(DomainError) as error:
            reader.read_macos(selection)
        assert error.value.status == 503
    for role in ("raw", "composed"):  # the complete affected frame, including its uncontested raw image
        assert images.resolve_macos(rig.frames["f6"], image_role=role, max_bytes=MAX) == {"status": "unavailable"}
    with pytest.raises(DomainError) as learning_error:
        prepare_observation_window(ids, reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    assert learning_error.value.status == 503
    unrelated = ["qa-gap", "qa-r2"]
    stored = reader.read_macos(unrelated)
    assert stored["batch"]["records"] == rig.records[:2] and stored["frames"] == [rig.frames["f2"]]
    for role in ("raw", "composed"):
        resolved = images.resolve_macos(rig.frames["f2"], image_role=role, max_bytes=MAX)
        picture = rig.frames["f2"]["raw"] if role == "raw" else rig.frames["f2"]["composition"]["image"]
        assert resolved["status"] == "available" and resolved["data"] == fixture_bytes(picture)
    packet = prepare_observation_window(unrelated, reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    assert [i["record"]["record_id"] for i in packet["items"]] == unrelated and packet["items"][1]["composed_image"]["status"] == "attached"
    assert rig.documents() == before


# --------------------------------------------------------------------------- cancellation and late failure
@pytest.mark.parametrize("failing_kind,occurrence,error", [
    ("capture_binding", 1, RuntimeError), ("capture_slot", 2, RuntimeError), ("capture_artifact_ref", 3, RuntimeError),
    ("commit", 1, RuntimeError), ("capture_record", 2, asyncio.CancelledError), ("capture_replay", 1, concurrent.futures.CancelledError)])
def test_late_failure_or_cancellation_leaves_no_partial_state(failing_kind, occurrence, error, monkeypatch, crashes):
    """SYNTHETIC faults after rows are staged ('commit': after every write, when the actor transaction would commit)."""
    rig = MacRig().open().start()
    frames = [rig.frame(1, "qa-mf-2"), rig.frame(5, "qa-mf-6")]
    for f in frames:
        rig.upload(f)
    body = rig.envelope("qa-late", [rig.record("qa-late-2", 1, frames[0]), rig.record("qa-late-6", 2, frames[1])], frames)
    original, writes = _MemoryTransaction.put, []

    def put(self, kind, row_key, payload):
        writes.append(kind)
        if kind == failing_kind and writes.count(kind) == occurrence:
            raise error("qa synthetic")
        return original(self, kind, row_key, payload)

    original_transaction = MemoryStore.transaction

    @contextmanager
    def failing_commit(self, user_id):
        with original_transaction(self, user_id) as tx:
            yield tx
            if "capture_replay" in writes:  # the Mac batch's transaction, everything staged
                raise error("qa synthetic")

    before = rig.documents()
    if failing_kind == "commit":
        monkeypatch.setattr(_MemoryTransaction, "put", lambda self, kind, row_key, payload: (writes.append(kind), original(self, kind, row_key, payload))[1])
        monkeypatch.setattr(MemoryStore, "transaction", failing_commit)
    else:
        monkeypatch.setattr(_MemoryTransaction, "put", put)
    response = rig.post(body, "qa-late-key")
    monkeypatch.setattr(_MemoryTransaction, "put", original)
    monkeypatch.setattr(MemoryStore, "transaction", original_transaction)
    assert response.status_code != 200 and b"acknowledged" not in response.content
    assert len(writes) > 1 and (failing_kind == "commit" or writes[-1] == failing_kind) and rig.documents() == before
    if error is RuntimeError:
        assert (response.status_code, response.json()) == closed(503, "unavailable") and crashes == ["RuntimeError('qa synthetic')"]
    elif error is asyncio.CancelledError:  # Starlette turns the cancelled handler into a missing response
        assert response.status_code == 503 and crashes == ["RuntimeError('No response returned.')"]
    else:  # cancellation propagates for the Mac contract (by design, no success is produced); the transport shows it as 500
        assert response.status_code == 500 and crashes == []
        writes.clear()
        monkeypatch.setattr(_MemoryTransaction, "put", put)

        async def raising():
            import httpx
            transport = httpx.ASGITransport(app=rig.app, raise_app_exceptions=True)
            async with httpx.AsyncClient(transport=transport, base_url="http://qa-macos.test") as client:
                return await client.post(MAC, json=body, headers={"Authorization": f"Bearer {TOKEN}", "Idempotency-Key": "qa-late-key"})
        with pytest.raises(concurrent.futures.CancelledError):
            asyncio.run(raising())
        monkeypatch.setattr(_MemoryTransaction, "put", original)
        assert rig.documents() == before
    crashes.clear()
    retry = rig.post(body, "qa-late-key")
    assert retry.status_code == 200 and [r["disposition"] for r in retry.json()["acknowledged"]] == ["accepted", "accepted"], retry.text


def test_qa_mac_01_withholding_is_limited_to_affected_images_and_dependencies(chain):
    """QA-MAC-01 retest at 17262c8 (replaces the historical observation test pinned at 576c62c, where every Mac operation
    of the actor was withheld). A contradiction on a second source (a same-hash alias of Mac composed-6 declared at width
    201 through the raw route) now withholds only what depends on the contradicted image: the complete frame, selections
    that include it, and new records whose stored framed ancestors (directly or through gaps) include it. Unrelated
    reads, resolution, Learning and parentless gap admission succeed without deleting any source; old routes still accept."""
    rig = chain
    reader, images = rig.readers()
    # Before the contradiction: a gap whose only parent is the soon-affected frame 6 (a gap chain back to it).
    assert rig.post(rig.envelope("qa-mid", [rig.record("qa-gap-mid", 6, parents=["qa-r6"], coverage="partial")], []), "qa-mid-key").status_code == 200
    second = {"user_id": USER, "source_id": "qa-mac-display-2", "source_version": 1}
    response = call(rig.app, "PUT", "/v2/process/display-sources/qa-mac-display-2",
                    {"contract_version": "0.2.4", "source_id": "qa-mac-display-2", "stream_id": STREAM, "project_id": None, "source_timezone": "UTC"})
    assert response.status_code == 200, response.text
    alias = {**deepcopy(rig.frames["f6"]["composition"]["image"]["artifact"]), "artifact_id": "qa-alias-composed-6-s2"}
    body = {"contract_version": "0.2.2", "source": second, "kind": "screen_image", "artifact": alias,
            "data_base64": base64.b64encode(fixture_bytes(rig.frames["f6"]["composition"]["image"])).decode()}
    assert call(rig.app, "PUT", "/v2/process/originals/" + alias["artifact_id"], body).status_code == 200
    assert rig.post_old("raw", "qa-old-s2", 7, alias, 201, 100, source=second).status_code == 200
    originals = {k: v for k, v in rig.documents().items() if k[0] == "artifact"}
    # Unrelated: source-1 gap and frame 2 read, resolve and prepare; new parentless gaps are admitted (and replay).
    assert reader.read_macos(["qa-gap", "qa-r2"])["frames"] == [rig.frames["f2"]]
    assert images.resolve_macos(rig.frames["f2"], image_role="raw", max_bytes=MAX)["data"] == fixture_bytes(rig.frames["f2"]["raw"])
    packet = prepare_observation_window(["qa-r2"], reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    assert packet["items"][0]["composed_image"]["status"] == "attached"
    later = rig.envelope("qa-mac-gap-later", [rig.record("qa-gap-later", 8, coverage="partial")], [])
    first = rig.post(later, "qa-gap-later-key")
    assert first.status_code == 200 and rig.post(later, "qa-gap-later-key").json() == first.json(), first.text
    ok_child = rig.envelope("qa-child-ok", [rig.record("qa-gap-child-ok", 9, parents=["qa-r2"], coverage="partial")], [])
    assert rig.post(ok_child, "qa-child-ok-key").status_code == 200  # an unaffected framed ancestor is fine
    # Affected: the complete frame 6, mixed selections, and records depending on it directly or through the gap chain.
    for selection in (["qa-r6"], ["qa-r2", "qa-r6"]):
        with pytest.raises(DomainError) as error:
            reader.read_macos(selection)
        assert error.value.status == 503, selection
    # A read selection keeps its external-parent semantics: the lone gap is returned, its parent is not fetched.
    assert reader.read_macos(["qa-gap-mid"])["frames"] == []
    assert all(images.resolve_macos(rig.frames["f6"], image_role=r, max_bytes=MAX) == {"status": "unavailable"} for r in ("raw", "composed"))
    with pytest.raises(DomainError):
        prepare_observation_window(["qa-r2", "qa-r6"], reader.read_macos, images, user_id=USER, macos_resolver=images.resolve_macos)
    for parent, request_key in (("qa-r6", "qa-child-direct"), ("qa-gap-mid", "qa-child-chain")):
        child = rig.envelope(request_key, [rig.record(request_key, 10, parents=[parent], coverage="partial")], [])
        refused(rig, child, request_key + "-key", 503, "unavailable")
    assert rig.post_old("raw", "qa-old-again", 11, alias, 201, 100, source=second).status_code == 200  # older routes still accept
    assert {k: v for k, v in rig.documents().items() if k[0] == "artifact"} == originals  # nothing deleted or rewritten
    # No Mac data at all: an ordinary raw/raw disagreement no longer refuses the actor's first parentless Mac gap.
    fresh = MacRig().open().start()
    f = fresh.frame(1, "qa-mf-2")
    raw_alias = {**deepcopy(f["raw"]["artifact"]), "artifact_id": "qa-alias-raw"}
    fresh.put(raw_alias, fixture_bytes(f["raw"]))
    assert fresh.post_old("raw", "qa-old-a", 1, raw_alias, 200, 100).status_code == 200
    assert fresh.post_old("raw", "qa-old-b", 2, raw_alias, 201, 100).status_code == 200
    assert fresh.post(fresh.envelope("qa-mac-first", [fresh.record("qa-gap", 3, coverage="partial")], []), "qa-mac-first-key").status_code == 200


@pytest.mark.parametrize("session", ["same", "other"])
def test_mac_native_session_path_identity_is_checked_across_sources(chain, session):
    """A new Mac frame on a second source names frame 2's native file in the same native session with other bytes (a
    path-only conflict): 409, no write. The same path in a different native session is a different file: accepted."""
    rig = chain
    call(rig.app, "PUT", "/v2/process/display-sources/qa-mac-display-2",
         {"contract_version": "0.2.4", "source_id": "qa-mac-display-2", "stream_id": STREAM, "project_id": None, "source_timezone": "UTC"})
    second = {"user_id": USER, "source_id": "qa-mac-display-2", "source_version": 1}
    other_bytes = fixture_bytes(rig.frames["f6"]["composition"]["image"])
    artifact = {"artifact_id": "qa-other-bytes-at-frame-2-path", "sha256": hashlib.sha256(other_bytes).hexdigest(), "byte_length": len(other_bytes), "media_type": "image/png"}
    body = {"contract_version": "0.2.2", "source": second, "kind": "screen_image", "artifact": artifact, "data_base64": base64.b64encode(other_bytes).decode()}
    assert call(rig.app, "PUT", "/v2/process/originals/" + artifact["artifact_id"], body).status_code == 200
    f = rig.frame(1, "qa-mf-path", UNKNOWN)
    f["source"] = deepcopy(second)
    f["raw"]["artifact"] = artifact  # native_file stays frames/00000002.png
    if session == "other":
        f["profile"]["native_session_id"] = "20260930T180000Z-QA000001"
    record = rig.record("qa-path", 6, f, ink=False)  # the QA ink original belongs to source 1
    record["source"] = deepcopy(second)
    request = rig.envelope("qa-path", [record], [f])
    if session == "same":
        refused(rig, request, "qa-path-key", 409, "record_conflict")
    else:
        response = rig.post(request, "qa-path-key")
        assert response.status_code == 200, response.text


def test_learning_final_reread_ignores_an_unrelated_new_contradiction(chain):
    """Control for the final reread: a contradiction introduced between resolution and the final reread that concerns
    only an image outside the selection no longer withholds the packet."""
    rig = chain
    reader, images = rig.readers()
    calls = []

    def resolver(frame, *, image_role, max_bytes):
        result = images.resolve_macos(frame, image_role=image_role, max_bytes=max_bytes)
        calls.append(image_role)
        if len(calls) == 2:
            alias = {**deepcopy(rig.frames["f6"]["composition"]["image"]["artifact"]), "artifact_id": "qa-alias-composed-6"}
            rig.put(alias, fixture_bytes(rig.frames["f6"]["composition"]["image"]))
            assert rig.post_old("raw", "qa-old-unrelated", 6, alias, 201, 100).status_code == 200
        return result

    packet = prepare_observation_window(["qa-r2"], reader.read_macos, images, user_id=USER, macos_resolver=resolver)
    assert packet["items"][0]["image"]["status"] == packet["items"][0]["composed_image"]["status"] == "attached"
