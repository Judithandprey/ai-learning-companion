"""Independent QA API acceptance of Windows capture ingress 0.2.10 at main 7b71d7b (P0-13).

Method. Ingest runs through the actual opt-in trusted-local runtime (create_local_capture_runtime) and its composed
ASGI app over httpx ASGITransport and MemoryStore. Refused configurations construct create_capture_app /
create_ingress_app directly (the runtime refuses to build them). Archive domain calls stand in for external source
revoke/delete and account disable, which have no HTTP route. A QA reader guard, on the runtime's own clock, feeds the
current-authorized readers (read_windows / resolve_windows) and Learning.

Inputs. Trusted identities, token and consent are explicitly synthetic. The PNG bytes are the real producer files under
docs/verification/web/evidence/windows-retention-sample/frames/ (2560x1600 RGBA, file name = sha256), each paired
with its own released WindowsFrame 0.2.9 example descriptor (examples[0..3], producer-declared facts). QA changes
only identities, the distinct-ID alias's composed archive ID and raw-only's absent composition. The editable ink
is synthetic JSON. The backend never decodes pixels or recomputes pixels_sha256; those remain declarations.

Synthetic damage. Retained-row damage (receipt corruption, erasure markers, deleted/replaced originals, lost
producer markers) and in-transaction faults cannot be caused by any HTTP route; each is labelled where used.
No listener, database, native desktop app, display or provider.
"""

import asyncio
import base64
import hashlib
import json
import sys
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

httpx = pytest.importorskip("httpx")

from packages.contracts import windows_capture_ingress  # noqa: E402
from services.api import ingress_app  # noqa: E402
from services.api.auth import LocalTestAuthenticator, Principal  # noqa: E402
from services.api.capture_app import create_capture_app  # noqa: E402
from services.api.capture_runtime import create_local_capture_runtime  # noqa: E402
from services.api.domain import Archive, key  # noqa: E402
from services.api.errors import DomainError  # noqa: E402
from services.api.image_resolver import AuthorizedImageResolver  # noqa: E402
from services.api.process_context import AuthorizedProcessContextReader  # noqa: E402
from services.api.storage import MemoryStore, _MemoryTransaction  # noqa: E402
from services.learning.process_context import prepare_observation_window  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FRAMES_DIR = ROOT / "docs/verification/web/evidence/windows-retention-sample/frames"
EXAMPLES = json.loads((ROOT / "packages/contracts/windows_frame/examples/windows-retained.json").read_text())
NOW = datetime(2026, 9, 30, 15, 0, tzinfo=timezone.utc)
TOKEN = "qa-windows-0210-token-" + "q" * 20
USER, DEVICE, SESSION, STREAM, SOURCE = "qa-win-user", "qa-win-device", "qa-win-session", "qa-win-stream", "qa-win-display"
WINDOWS, RAW, STREAMS = "/v2/process/windows-frames:batch", "/v2/process/raw-frames:batch", "/v2/process/streams"
SCOPES = frozenset({"sources:read", "sources:write", "process:control", "process:capture"})
CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2", "process.ingress.v0.2.4",
                          "process.raw-ingress.v0.2.6", "process.windows-ingress.v0.2.10"})
REGISTRATION = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM,
                "authorization_generation": 1, "membership_revision": 1, "continuity": {"kind": "initial"}}
SRC = {"user_id": USER, "source_id": SOURCE, "source_version": 1}
PNG_NAMES = {  # real producer PNGs (content hash = file name) and the released example that declares them
    "rawonly": "d68d53bd7333ba67c3a3ed5de3ff008b10d8a18712baace0d01fab7f0489c715",  # examples[0] raw
    "alias": "9dc2b9a3aaa5261e70f7c1473caea09321db34a38ae69f581a3b5409ce898ce4",  # examples[1] raw
    "same": "035b8e37486902a27491bd26d3148b636ba27980f9808e44eb53d506590fe2cd",  # examples[2] raw = composed
    "raw1": "082c0c1e630909906209a7c91dd81a8adb83c0838934c5b72b427763af596546",  # examples[3] raw
    "comp1": "8a695b9896960c695d8c4cd3604aa20d7294baace363fadc3d3177ad07eaffb1",  # examples[3] composed (ink)
}
EXAMPLE_OF = {"rawonly": 0, "alias": 1, "same": 2, "raw1": 3}
INK = b'{"qa_synthetic_editable_ink":true,"strokes":[[[10,10],[40,12],[80,15]]]}\n'


def call(app, method, path, body=None, *, request_key=None):
    async def run():
        headers = {"Authorization": f"Bearer {TOKEN}"}
        if request_key:
            headers["Idempotency-Key"] = request_key
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://qa-windows.test") as client:
            return await client.request(method, path, headers=headers, **({} if body is None else {"json": body}))
    return asyncio.run(run())


def ref(artifact_id, data, media_type="image/png"):
    return {"artifact_id": artifact_id, "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data), "media_type": media_type}


class Rig:
    def __init__(self, store=None, *, raw_ingress=False):
        self.store = store or MemoryStore()
        self.instant = [NOW]
        self.raw_ingress = raw_ingress
        self.bytes = {name: (FRAMES_DIR / f"{digest}.png").read_bytes() for name, digest in PNG_NAMES.items()}
        self.refs = {name: ref(f"win-png-{PNG_NAMES[name]}", data) for name, data in self.bytes.items()}
        self.refs["alias_copy"] = ref("qa-alias-copy-of-9dc2", self.bytes["alias"])  # same bytes, distinct archive ID
        self.refs["ink"] = ref("qa-editable-ink", INK, "application/json")
        self.bytes["alias_copy"], self.bytes["ink"] = self.bytes["alias"], INK
        for name, index in EXAMPLE_OF.items():  # the real files are exactly the ones the released examples declare
            assert hashlib.sha256(self.bytes[name]).hexdigest() == PNG_NAMES[name]
            assert EXAMPLES[index]["raw"]["artifact"] == self.refs[name], name
        assert EXAMPLES[3]["composed"]["image"]["artifact"] == self.refs["comp1"]

    def open(self, *, fresh_consent=True, profile="desktop_pixels", windows=True):
        flags = {} if windows is None else {"enable_windows_ingress": windows}  # None: leave the factory default
        self.runtime = create_local_capture_runtime(
            store=self.store, user_id=USER, device_id=DEVICE, session_id=SESSION, producer_id="qa-windows-screen",
            registration=deepcopy(REGISTRATION), token=TOKEN, expires_at=NOW + timedelta(hours=1), scopes=SCOPES,
            capabilities=CAPABILITIES, fresh_consent=fresh_consent, enable_raw_ingress=self.raw_ingress,
            producer_profile=profile, clock=lambda: self.instant[0], **flags)
        return self.runtime

    @property
    def app(self):
        return self.runtime.app

    def start(self):
        response = call(self.app, "POST", STREAMS, REGISTRATION, request_key="qa-registration")
        assert response.status_code == 200 and response.json()["state"] == "live", response.text
        response = call(self.app, "PUT", f"/v2/process/display-sources/{SOURCE}",
                        {"contract_version": "0.2.4", "source_id": SOURCE, "stream_id": STREAM, "project_id": None, "source_timezone": "UTC"})
        assert response.status_code == 200, response.text
        self.descriptor = response.json()
        for name in ("raw1", "comp1", "same", "alias", "alias_copy", "rawonly", "ink"):
            body = {"contract_version": "0.2.2", "source": SRC, "kind": "editable_ink" if name == "ink" else "screen_image",
                    "artifact": self.refs[name], "data_base64": base64.b64encode(self.bytes[name]).decode()}
            response = call(self.app, "PUT", "/v2/process/originals/" + self.refs[name]["artifact_id"], body)
            assert response.status_code == 200 and response.json()["status"] == "bytes_committed", (name, response.text)

    def frame(self, frame_id, raw, composed="example", sample=None):
        """The released example that declares `raw`; composed: 'example' (as released), None (raw-only) or a
        refs key replacing only the composed archive ID (a distinct-ID alias of identical bytes)."""
        f = deepcopy(EXAMPLES[EXAMPLE_OF[raw]])
        f.update(frame_id=frame_id, device_id=DEVICE, session_id=SESSION, stream_id=STREAM, source=deepcopy(SRC))
        if sample is not None:  # a further frame of the same image needs its own sample ordinal
            f["profile"]["sample"].update(sample_seq=sample, frame_seq=sample, deferred_samples_not_retained=[])
        if composed is None:
            f["composed"] = None
        elif composed != "example":
            f["composed"]["image"]["artifact"] = deepcopy(self.refs[composed])
        return f

    def record(self, record_id, sequence, frame=None, parents=(), claims="honest"):
        artifacts = []
        if frame is not None:
            artifacts.append(deepcopy(frame["raw"]["artifact"]))
            if frame["composed"] and frame["composed"]["image"]["artifact"] != frame["raw"]["artifact"]:
                artifacts.append(deepcopy(frame["composed"]["image"]["artifact"]))
            artifacts.append(deepcopy(self.refs["ink"]))
        item = {"record_id": record_id, "sequence": sequence, "source": deepcopy(SRC), "scope": {"kind": "provisional_session"},
                "observed_at": None, "clock": None, "media_position": None, "surface": "external_app", "method": "visual",
                "causal_parents": list(parents), "artifacts": artifacts, "frame_id": frame["frame_id"] if frame else None,
                "evidence": {"kind": "coverage", "coverage": "observed_samples" if frame else "unknown", "from_clock_ms": None,
                             "through_clock_ms": None, "missing_sequences": [],
                             "limitations": ["sample_only", "unsupported_history"] if frame else ["unknown", "unsupported_history"]}}
        if claims == "structured":  # QA spoof: the generic example's web_dom / structured / operation claim
            example = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]["records"][0]
            item.update({k: deepcopy(example[k]) for k in ("surface", "method", "evidence")})
        return item

    def envelope(self, batch_id, records, frames):
        return {"contract_version": "0.2.10", "frames": frames,
                "batch": {"contract_version": "0.2.0", "batch_id": batch_id, "device_id": DEVICE, "session_id": SESSION,
                          "stream_id": STREAM, "delivery_mode": "live", "records": records}}

    def post(self, body, request_key, path=WINDOWS):
        return call(self.app, "POST", path, body, request_key=request_key)

    def documents(self):
        with self.store.transaction(USER) as tx:
            return deepcopy(tx.documents)

    def guard(self, state):
        principal = self.app.state.authenticator.authenticate(TOKEN, self.instant[0])  # the runtime's own clock
        if principal != self.runtime.principal or state.get("generation") != principal.authorization_generation:
            raise DomainError(403, "forbidden")


@pytest.fixture(autouse=True)
def crashes(monkeypatch):
    """Every 503 must be a deliberate DomainError, not the response boundary masking an unexpected exception."""
    seen, original = [], ingress_app._error

    def spy(status, code, **kwargs):
        active = sys.exc_info()[1]
        if status == 503 and active is not None and not isinstance(active, DomainError):
            seen.append(repr(active))
        return original(status, code, **kwargs)

    monkeypatch.setattr(ingress_app, "_error", spy)
    yield seen
    assert seen == [], f"unexpected exceptions masked as 503: {seen}"


def reversed_members(value):
    """Same JSON value with every object's member order reversed (array order untouched)."""
    if isinstance(value, dict):
        return {k: reversed_members(value[k]) for k in reversed(list(value))}
    return [reversed_members(v) for v in value] if isinstance(value, list) else value


def refused(rig, body, request_key, status, code, path=WINDOWS, version="0.2.10"):
    before = rig.documents()
    response = rig.post(body, request_key, path)
    assert response.status_code == status, response.text
    assert response.json() == {"contract_version": version, "error": code, "retryable": code in {"unavailable", "dependency_missing"}}
    assert b"iVBOR" not in response.content
    assert rig.documents() == before, "a refused request changed the store"


@pytest.fixture
def chain():
    """One ordered batch: a frameless gap, then raw-only, distinct-ID alias, same-ID alias and distinct raw+composed."""
    rig = Rig()
    rig.open()
    rig.start()
    rig.frames = {"rawonly": rig.frame("qa-f-rawonly", "rawonly", None), "alias": rig.frame("qa-f-alias", "alias", "alias_copy"),
                  "same": rig.frame("qa-f-same", "same"), "distinct": rig.frame("qa-f-distinct", "raw1")}
    rig.records = [rig.record("qa-gap", 1)] + [rig.record(f"qa-{name}", i + 2, f, parents=["qa-gap"])
                                               for i, (name, f) in enumerate(rig.frames.items())]
    rig.body = rig.envelope("qa-chain", rig.records, list(rig.frames.values()))
    first = rig.post(rig.body, "qa-chain-key")
    assert first.status_code == 200, first.text
    rig.ack = first.json()
    rig.committed = rig.documents()
    return rig


# --------------------------------------------------------------------------- route closure / capability
def test_windows_route_is_default_off_and_needs_its_own_capability():
    closed = {"contract_version": "0.2.4", "error": "not_found", "retryable": False}
    store = MemoryStore()
    rig = Rig(store)
    rig.open(windows=None, profile=None)  # the runtime factory default, flag omitted
    assert (lambda r: (r.status_code, r.json()))(call(rig.app, "POST", WINDOWS, {"contract_version": "0.2.10"}, request_key="k")) == (404, closed)
    auth = LocalTestAuthenticator({TOKEN: Principal(USER, SCOPES, NOW + timedelta(hours=1))})
    for factory in (create_capture_app, ingress_app.create_ingress_app):  # composed and ingress factory defaults
        response = call(factory(store, auth, capabilities=CAPABILITIES, clock=lambda: NOW), "POST", WINDOWS,
                        {"contract_version": "0.2.10"}, request_key="k")
        assert (response.status_code, response.json()) == (404, closed), factory.__name__
    without = create_capture_app(store, auth, capabilities=CAPABILITIES - {"process.windows-ingress.v0.2.10"},
                                 clock=lambda: NOW, enable_windows_ingress=True)
    response = call(without, "POST", WINDOWS, {"contract_version": "0.2.10"}, request_key="k")
    assert (response.status_code, response.json()) == (403, {"contract_version": "0.2.10", "error": "capability_required", "retryable": False})
    # The Windows capability implies neither the 0.2.4 original authority nor control authority.
    only_windows = create_capture_app(store, auth, capabilities=frozenset({"process.capture.v0.2", "process.windows-ingress.v0.2.10"}),
                                      clock=lambda: NOW, enable_windows_ingress=True)
    before = deepcopy(store._documents)
    for method, path, version in (("GET", f"/v2/process/sources/{SOURCE}/versions/1/originals/qa-any", "0.2.4"),
                                  ("GET", f"{STREAMS}/{STREAM}", "0.2.1")):
        response = call(only_windows, method, path)
        assert (response.status_code, response.json()) == (403, {"contract_version": version, "error": "capability_required", "retryable": False})
    assert store._documents == before
    # The runtime flag needs the trusted pixels-only producer profile and the distinct capability, before any write.
    empty = Rig(MemoryStore())
    with pytest.raises(ValueError, match="desktop_pixels"):
        empty.open(profile=None)
    assert empty.store._documents == {}
    with pytest.raises(ValueError, match="Windows ingress requires"):
        create_local_capture_runtime(
            store=empty.store, user_id=USER, device_id=DEVICE, session_id=SESSION, producer_id="qa-windows-screen",
            registration=deepcopy(REGISTRATION), token=TOKEN, expires_at=NOW + timedelta(hours=1), scopes=SCOPES,
            capabilities=CAPABILITIES - {"process.windows-ingress.v0.2.10"}, fresh_consent=True, enable_windows_ingress=True,
            producer_profile="desktop_pixels", clock=lambda: NOW)
    assert empty.store._documents == {}


# --------------------------------------------------------------------------- ordered chain to Learning
def test_ordered_batch_commits_with_verified_receipts_and_exact_originals(chain):
    rig = chain
    windows_capture_ingress.validate_ack(rig.body["batch"], rig.ack, user_id=USER, verified_artifacts={
        tuple(r[k] for k in ("artifact_id", "sha256", "byte_length", "media_type")) for r in rig.refs.values()})
    receipts = rig.ack["acknowledged"]
    assert [r["record_id"] for r in receipts] == [r["record_id"] for r in rig.records]
    assert receipts[0]["artifacts"] == [] and all(r["disposition"] == "accepted" for r in receipts)
    assert [[a["artifact_id"] for a in r["artifacts"]] for r in receipts] == [[a["artifact_id"] for a in r["artifacts"]] for r in rig.records]
    assert [len(r["artifacts"]) for r in receipts] == [0, 2, 3, 2, 3]  # raw-only, distinct-ID alias, same-ID alias, distinct
    assert all(a["status"] == "verified" for r in receipts for a in r["artifacts"])
    for name in ("raw1", "comp1", "same", "alias", "alias_copy", "rawonly", "ink"):
        got = call(rig.app, "GET", f"/v2/process/sources/{SOURCE}/versions/1/originals/{rig.refs[name]['artifact_id']}")
        assert got.status_code == 200 and base64.b64decode(got.json()["data_base64"]) == rig.bytes[name]


def test_stored_readers_and_learning_keep_order_images_and_unknowns(chain):
    rig = chain
    ids = [r["record_id"] for r in rig.records]
    reader = AuthorizedProcessContextReader(rig.store, USER, rig.guard)
    images = AuthorizedImageResolver(rig.store, USER, rig.guard)
    first, second = reader.read_windows(ids), reader.read_windows(ids)
    assert first == second
    assert first["batch"]["delivery_mode"] == "historical" and first["batch"]["records"] == rig.records
    assert first["frames"] == list(rig.frames.values()) and first["sources"] == [rig.descriptor]
    expect = {"rawonly": ("rawonly", None), "alias": ("alias", "alias_copy"), "same": ("same", "same"), "distinct": ("raw1", "comp1")}
    for name, frame in rig.frames.items():
        raw_name, comp_name = expect[name]
        raw = images.resolve_windows(frame, image_role="raw", max_bytes=4 << 20)
        assert raw["status"] == "available" and raw["data"] == rig.bytes[raw_name]
        comp = images.resolve_windows(frame, image_role="composed", max_bytes=4 << 20)
        if comp_name is None:
            assert comp["status"] == "unobservable" and "data" not in comp  # never a raw fallback
        else:
            assert comp["status"] == "available" and comp["data"] == rig.bytes[comp_name]
    packet = prepare_observation_window(ids, reader.read_windows, images, user_id=USER, windows_resolver=images.resolve_windows)
    items = dict(zip(["gap", *rig.frames], packet["items"]))
    assert [i["record"]["record_id"] for i in packet["items"]] == ids
    assert items["gap"]["image"] == {"status": "missing_frame"} and items["gap"]["frame"] is None
    for name, (raw_name, comp_name) in expect.items():
        assert items[name]["image"]["status"] == "attached" and items[name]["image"]["data"] == rig.bytes[raw_name]
        if comp_name is None:
            assert items[name]["composed_image"] == {"status": "not_present", "image_role": "composed"}
        else:
            assert items[name]["composed_image"]["status"] == "attached" and items[name]["composed_image"]["data"] == rig.bytes[comp_name]
        assert [p["record_id"] for p in items[name]["parents"]] == ["qa-gap"]
        assert items[name]["provider_image_alignment"] == "not_attested"
    assert packet["counts"] == {"supplied": 5, "included": 5, "omitted": 0}
    assert packet["presentation_permission"] == "not_granted" and packet["provider_receipt"] == "not_attested"
    assert packet["live_status"] == "not_attested" and packet["commit_status"] == "not_attested"
    assert packet["ordering"] == "supplied_array_not_chronology" and packet["capture_completeness"] == "unknown"
    window = packet["observation_window"]
    assert window["capture_chronology"] == "unknown" and window["capture_intervals"] == "unknown"
    assert window["semantic_change"] == "not_inferred" and window["user_reasoning"] == "not_inferred"
    assert [c["clock_readings"] for c in window["comparisons"]] == [{"status": "unknown", "reason": "no_process_capture_clock"}] * 4


@pytest.mark.parametrize("damaged,broken", [
    ("comp1", {("distinct", "composed")}),
    ("alias_copy", {("alias", "composed")}),
    ("alias", {("alias", "raw")}),
    ("same", {("same", "raw"), ("same", "composed")}),  # a same-ID alias has only one original
])
def test_each_image_role_resolves_through_its_own_archive_id(chain, damaged, broken):
    """SYNTHETIC retained damage: one stored original's bytes are replaced (declared hash unchanged). Only the image
    roles bound to that archive ID may stop resolving; identical bytes under another ID must not stand in."""
    rig = chain
    row = rig.store._documents[USER][("artifact", rig.refs[damaged]["artifact_id"])]
    row["data_base64"] = base64.b64encode(rig.bytes["rawonly" if damaged != "rawonly" else "same"]).decode()
    reader = AuthorizedProcessContextReader(rig.store, USER, rig.guard)
    images = AuthorizedImageResolver(rig.store, USER, rig.guard)
    expect = {"alias": ("alias", "alias_copy"), "same": ("same", "same"), "distinct": ("raw1", "comp1")}
    ids = [r["record_id"] for r in rig.records]
    items = dict(zip(["gap", *rig.frames], prepare_observation_window(
        ids, reader.read_windows, images, user_id=USER, windows_resolver=images.resolve_windows)["items"]))
    for name, names in expect.items():
        for role, original in zip(("raw", "composed"), names):
            resolved = images.resolve_windows(rig.frames[name], image_role=role, max_bytes=4 << 20)
            learned = items[name]["image" if role == "raw" else "composed_image"]
            if (name, role) in broken:
                assert resolved["status"] == "unavailable" and "data" not in resolved, (name, role)
                assert learned["status"] != "attached" and "data" not in learned, (name, role)
            else:
                assert resolved["status"] == "available" and resolved["data"] == rig.bytes[original], (name, role)
                assert learned["status"] == "attached" and learned["data"] == rig.bytes[original], (name, role)


# --------------------------------------------------------------------------- shape / image identity
@pytest.mark.parametrize("change", ["frameless_observed_samples", "frameless_with_artifact", "alias_contradiction_in_envelope"])
def test_changed_path_shape_refusals(change):
    rig = Rig()
    rig.open()
    rig.start()
    if change.startswith("frameless"):
        good = rig.envelope("qa-shape", [rig.record("qa-g", 1)], [])
        bad = deepcopy(good)
        item = bad["batch"]["records"][0]
        if change == "frameless_observed_samples":  # no frame cannot claim observed samples
            item["evidence"].update(coverage="observed_samples", limitations=["sample_only", "unsupported_history"])
        else:  # no frame cannot carry artifacts
            item["artifacts"] = [deepcopy(rig.refs["ink"])]
    else:  # identical bytes under another archive ID must carry the same declared image facts
        f = rig.frame("qa-f-alias", "alias", "alias_copy")
        good = rig.envelope("qa-shape", [rig.record("qa-a", 1, f)], [f])
        bad = deepcopy(good)
        bad["frames"][0]["composed"]["image"]["pixels_sha256"] = "0" * 64
    refused(rig, bad, "qa-shape-bad", 422, "invalid_request")
    control = rig.post(good, "qa-shape-good")  # the request without the single change is accepted
    assert control.status_code == 200, control.text


def test_distinct_id_alias_cannot_contradict_retained_image_facts(chain):
    rig = chain
    f = rig.frame("qa-f-alias2", "alias", sample=20)
    for picture in (f["raw"], f["composed"]["image"]):
        picture["artifact"] = deepcopy(rig.refs["alias_copy"])  # retained as the alias frame's composed image
    bad = deepcopy(f)
    bad["raw"]["pixels_sha256"] = bad["composed"]["image"]["pixels_sha256"] = "1" * 64
    refused(rig, rig.envelope("qa-contra", [rig.record("qa-contra", 6, bad)], [bad]), "qa-contra-key", 409, "record_conflict")
    control = rig.post(rig.envelope("qa-contra", [rig.record("qa-contra", 6, f)], [f]), "qa-contra-ok")
    assert control.status_code == 200 and control.json()["acknowledged"][0]["disposition"] == "accepted", control.text


# --------------------------------------------------------------------------- replay / order / key
def test_exact_replay_keeps_the_original_accepted_ack_and_order_is_part_of_the_key(chain):
    rig = chain
    rig.instant[0] = NOW + timedelta(minutes=10)
    again = rig.post(rig.body, "qa-chain-key")
    assert again.status_code == 200 and again.json() == rig.ack and all(r["disposition"] == "accepted" for r in again.json()["acknowledged"])
    reordered_members = reversed_members(rig.body)
    assert json.dumps(reordered_members) != json.dumps(rig.body) and reordered_members == rig.body
    assert rig.post(reordered_members, "qa-chain-key").json() == rig.ack
    assert rig.documents() == rig.committed
    swapped = deepcopy(rig.body)
    swapped["frames"] = list(reversed(swapped["frames"]))
    refused(rig, swapped, "qa-chain-key", 409, "idempotency_conflict")
    changed = deepcopy(rig.body)  # a different key cannot overwrite a committed immutable record
    changed["batch"]["records"][0]["evidence"]["coverage"] = "partial"
    refused(rig, changed, "qa-chain-changed-key", 409, "record_conflict")
    duplicate = rig.post(rig.body, "qa-chain-other-key")
    assert duplicate.status_code == 200 and {r["disposition"] for r in duplicate.json()["acknowledged"]} == {"duplicate"}
    after = rig.documents()
    assert set(after) - set(rig.committed) == {("capture_replay", key("POST", WINDOWS, "qa-chain-other-key"))}
    assert all(after[k] == v for k, v in rig.committed.items())


@pytest.mark.parametrize("damage", ["empty", "deleted_not_bool", "bad_fingerprint", "invalid_ack_json"])
def test_present_malformed_receipt_is_503_and_never_rebuilt(chain, damage):
    """SYNTHETIC retained damage to the committed receipt row of the exact cache key."""
    rig = chain
    row_key = ("capture_replay", key("POST", WINDOWS, "qa-chain-key"))
    row = rig.store._documents[USER][row_key]
    if damage == "empty":
        rig.store._documents[USER][row_key] = {}
    elif damage == "deleted_not_bool":
        row["deleted"] = 0
    elif damage == "bad_fingerprint":
        row["fingerprint"] = "not-a-fingerprint"
    else:
        row["response_json"] = "{broken"
    refused(rig, rig.body, "qa-chain-key", 503, "unavailable")


def test_deliberate_erasure_marker_is_404_not_a_new_success(chain):
    rig = chain
    row_key = ("capture_replay", key("POST", WINDOWS, "qa-chain-key"))
    rig.store._documents[USER][row_key] = {"key": row_key[1], "deleted": True}  # SYNTHETIC: the deletion writer's shape
    refused(rig, rig.body, "qa-chain-key", 404, "not_found")


# --------------------------------------------------------------------------- current fences before fresh and cached success
def during_transaction(monkeypatch, action):
    """SYNTHETIC in-transaction fault: act once when the Windows engine first reads its replay row under the lock."""
    original, done = _MemoryTransaction.get, []

    def get(self, kind, row_key):
        if kind == "capture_replay" and not done:
            done.append(row_key)
            action()
        return original(self, kind, row_key)

    monkeypatch.setattr(_MemoryTransaction, "get", get)
    return done


def fence(rig, name, monkeypatch):
    if name == "token_revoked":
        rig.app.state.authenticator.revoke(TOKEN)
    elif name == "token_expired":
        rig.instant[0] = NOW + timedelta(hours=1)  # the runtime clock reaches the token expiry
    elif name == "token_revoked_under_lock":
        return during_transaction(monkeypatch, lambda: rig.app.state.authenticator.revoke(TOKEN))
    elif name == "token_expired_under_lock":
        return during_transaction(monkeypatch, lambda: rig.instant.__setitem__(0, NOW + timedelta(hours=1)))
    elif name == "account_disabled":
        Archive(rig.store).set_authorization(USER, enabled=False)
    elif name == "source_revoked":
        Archive(rig.store).revoke_source(USER, SOURCE)
    elif name == "source_deleted":
        Archive(rig.store).delete_source(USER, SOURCE)
    elif name in {"stopped", "withdrawn"}:
        revision = call(rig.app, "GET", f"{STREAMS}/{STREAM}").json()["revision"]
        action = {"kind": "stop", "pre_stop_sequence": None} if name == "stopped" else {"kind": "withdraw"}
        body = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM,
                "expected_revision": revision, "action": action}
        response = call(rig.app, "POST", f"{STREAMS}/{STREAM}:control", body, request_key="qa-" + name)
        assert response.status_code == 200 and response.json()["state"] == name, response.text
    elif name == "raw_original_lost":  # SYNTHETIC retained damage: the committed raw PNG row disappears
        del rig.store._documents[USER][("artifact", rig.refs["raw1"]["artifact_id"])]
    else:
        assert name == "none"


def retained_originals(rig):
    return {i: v["content_hash"] for (k, i), v in rig.documents().items() if k == "artifact" and v.get("data_base64")}


FENCES = {"token_revoked": (401, "unauthenticated"), "token_expired": (401, "unauthenticated"),
          "token_revoked_under_lock": (401, "unauthenticated"), "token_expired_under_lock": (401, "unauthenticated"),
          "account_disabled": (403, "forbidden"), "source_revoked": (404, "not_found"), "source_deleted": (404, "not_found"),
          "stopped": (409, "capture_stopped"), "withdrawn": (403, "forbidden"), "raw_original_lost": (503, "unavailable")}


@pytest.mark.parametrize("which", ["fresh", "cached"])
@pytest.mark.parametrize("name", ["none", *sorted(FENCES)])
def test_current_fences_precede_fresh_and_cached_success(chain, name, which, monkeypatch):
    rig = chain
    assert len(retained_originals(rig)) == 7
    if which == "cached":
        body, request_key = rig.body, "qa-chain-key"
    else:
        f = rig.frame("qa-f-new", "raw1", sample=11)
        body, request_key = rig.envelope("qa-new", [rig.record("qa-new", 6, f, parents=["qa-distinct"])], [f]), "qa-new-key"
    triggered = fence(rig, name, monkeypatch)
    if name == "none":  # positive control: the same request succeeds without a fence
        response = rig.post(body, request_key)
        assert response.status_code == 200, response.text
        assert response.json() == rig.ack if which == "cached" else response.json()["acknowledged"][0]["disposition"] == "accepted"
        return
    refused(rig, body, request_key, *FENCES[name])
    if triggered is not None:
        assert triggered == [key("POST", WINDOWS, request_key)], "the fault did not fire under the actor lock"
    if name == "source_deleted":
        assert retained_originals(rig) == {}, "deleted source still retains original bytes"


def test_bounded_validation_failure_leaves_no_partial_state():
    """A batch whose last record names an ink original that was never uploaded commits nothing at all."""
    rig = Rig()
    rig.open()
    rig.start()
    good, bad = rig.frame("qa-f-good", "raw1"), rig.frame("qa-f-bad", "same")
    missing_ink = ref("qa-never-uploaded-ink", b'{"missing":true}', "application/json")
    bad_record = rig.record("qa-bad", 2, bad)
    bad_record["artifacts"] = [a for a in bad_record["artifacts"] if a["media_type"] == "image/png"] + [missing_ink]
    body = rig.envelope("qa-partial", [rig.record("qa-good", 1, good), bad_record], [good, bad])
    refused(rig, body, "qa-partial-key", 409, "dependency_missing")
    assert not any(kind in {"capture_record", "raw_capture_frame", "capture_replay"} for kind, _ in rig.documents())


@pytest.mark.parametrize("failing_kind,occurrence", [("raw_capture_frame", 2), ("capture_record", 2), ("capture_replay", 1)])
def test_late_write_failure_rolls_back_the_whole_batch(chain, failing_kind, occurrence, monkeypatch, crashes):
    """SYNTHETIC storage fault after some of the batch's rows are already staged: no ACK and no partial rows."""
    rig = chain
    f1, f2 = rig.frame("qa-f-late1", "raw1", sample=11), rig.frame("qa-f-late2", "same", sample=12)
    body = rig.envelope("qa-late", [rig.record("qa-late1", 6, f1, parents=["qa-distinct"]), rig.record("qa-late2", 7, f2)], [f1, f2])
    original, writes = _MemoryTransaction.put, []

    def put(self, kind, row_key, payload):
        writes.append(kind)
        if kind == failing_kind and writes.count(kind) == occurrence:
            raise RuntimeError("qa synthetic storage failure")
        return original(self, kind, row_key, payload)

    monkeypatch.setattr(_MemoryTransaction, "put", put)
    refused(rig, body, "qa-late-key", 503, "unavailable")
    assert writes[-1] == failing_kind and len(writes) > 1, writes  # rows were already staged when the fault hit
    assert crashes == ["RuntimeError('qa synthetic storage failure')"]
    crashes.clear()


# --------------------------------------------------------------------------- first-gap downgrade witness
GAP_RECEIPT = ("capture_replay", key("POST", WINDOWS, "qa-gap-key"))


def raw_body(rig, claims, record_id="qa-raw-fallback", sequence=3):
    from services.api.tests.postgres_desktop_runtime_check import scenario
    base = scenario(USER).raw_frame
    frame = {**deepcopy(base), "frame_id": record_id + "-frame", "artifact": deepcopy(rig.refs["same"]), "source": deepcopy(SRC),
             "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM, "raw_width": 2560, "raw_height": 1600}
    frame["timing"] = dict.fromkeys(frame["timing"])
    item = rig.record(record_id, sequence, None, parents=["qa-gap"], claims=claims)
    item.update(frame_id=frame["frame_id"], artifacts=[deepcopy(rig.refs["same"])])
    if claims == "honest":
        item["evidence"] = {**item["evidence"], "coverage": "observed_samples", "limitations": ["sample_only", "unsupported_history"]}
    return {"contract_version": "0.2.6", "frames": [frame], "batch": {"contract_version": "0.2.0", "batch_id": record_id, "device_id": DEVICE,
            "session_id": SESSION, "stream_id": STREAM, "delivery_mode": "live", "records": [item]}}


@pytest.fixture
def witness_rig():
    """A pixels-only stream whose only Windows use is a frameless gap receipt, plus an honest raw commit, then the
    SYNTHETIC loss of both internal producer_profile fields (no HTTP route can cause it)."""
    rig = Rig(raw_ingress=True)
    rig.open()
    rig.start()
    gap = rig.post(rig.envelope("qa-gap-only", [rig.record("qa-gap", 1)], []), "qa-gap-key")
    assert gap.status_code == 200 and gap.json()["acknowledged"][0]["artifacts"] == [], gap.text
    rig.cached_raw = raw_body(rig, "honest", "qa-raw-cached", 2)
    first = rig.post(rig.cached_raw, "qa-raw-cached-key", RAW)
    assert first.status_code == 200, first.text
    assert rig.post(rig.cached_raw, "qa-raw-cached-key", RAW).json() == first.json()
    rig.cached_ack = first.json()
    for kind in ("control_start", "control_stream"):
        del rig.store._documents[USER][(kind, STREAM)]["producer_profile"]
    return rig


def test_windows_route_refuses_an_unmarked_stream(witness_rig):
    """Independent of the receipt witness: the Windows route never admits a stream without the pixels profile."""
    rig = witness_rig
    f = rig.frame("qa-f-after", "raw1")
    refused(rig, rig.envelope("qa-after", [rig.record("qa-after", 3, f, parents=["qa-gap"])], [f]), "qa-after-key", 403, "forbidden")


@pytest.mark.parametrize("request_kind", ["honest", "structured", "cached_retry"])
def test_windows_gap_receipt_witnesses_lost_markers(witness_rig, request_kind):
    rig = witness_rig
    if request_kind == "cached_retry":  # the exact retry that succeeded before the loss is not cached success afterwards
        refused(rig, rig.cached_raw, "qa-raw-cached-key", 403, "forbidden", path=RAW, version="0.2.6")
    else:
        refused(rig, raw_body(rig, request_kind), "qa-raw-key", 403, "forbidden", path=RAW, version="0.2.6")


def test_witness_control_without_the_gap_receipt(witness_rig):
    """Sensitivity control, not an acceptance claim: with the receipt row ALSO removed (a further synthetic fault),
    the older-family structured request is accepted, so the refusals above come from the Windows gap receipt."""
    rig = witness_rig
    del rig.store._documents[USER][GAP_RECEIPT]
    response = rig.post(raw_body(rig, "structured"), "qa-raw-key", RAW)
    assert response.status_code == 200 and response.json()["acknowledged"][0]["disposition"] == "accepted", response.text


class DowngradeAccepted(AssertionError):
    """The specific QA-WIN0210-01 outcome: HTTP 200 instead of a fail-closed refusal."""


QA_WIN0210_01 = pytest.mark.xfail(raises=DowngradeAccepted, strict=True, reason=(
    "QA-WIN0210-01: the downgrade-witness scan (capture.py:138-142) skips a malformed Windows gap receipt instead "
    "of failing closed"))


@pytest.mark.parametrize("request_kind,damage", [
    ("fresh", "empty"),  # refused 503 by the absent-record receipt scan (capture.py:620-625), not by the witness
    pytest.param("fresh", "deleted_int", marks=QA_WIN0210_01),
    pytest.param("fresh", "deleted_true_full_row", marks=QA_WIN0210_01),
    pytest.param("cached", "empty", marks=QA_WIN0210_01),
    pytest.param("cached", "deleted_int", marks=QA_WIN0210_01),
    pytest.param("cached", "deleted_true_full_row", marks=QA_WIN0210_01),
])
def test_malformed_gap_receipt_does_not_open_a_downgrade(witness_rig, request_kind, damage):
    """SECOND synthetic fault on top of the lost markers: the witness receipt itself is damaged. Corrupt committed
    evidence must fail closed (403, or 503 per the contract), never become generic acceptance or cached success.
    The exact erasure shape {key, deleted:true} is deliberate erasure and is not tested here."""
    rig = witness_rig
    row = rig.store._documents[USER][GAP_RECEIPT]
    if damage == "empty":
        rig.store._documents[USER][GAP_RECEIPT] = {}
    elif damage == "deleted_int":
        row["deleted"] = 1
    else:
        row["deleted"] = True  # full receipt fields remain: not the exact erasure shape
    before = rig.documents()
    if request_kind == "fresh":  # a structured claim that the pixels-only stream must never admit
        response = rig.post(raw_body(rig, "structured"), "qa-raw-key", RAW)
    else:
        response = rig.post(rig.cached_raw, "qa-raw-cached-key", RAW)
    if response.status_code == 200:
        raise DowngradeAccepted(f"{request_kind}/{damage}: 200, store changed: {rig.documents() != before}, "
                                f"cached ACK replayed: {response.json() == rig.cached_ack}")
    assert response.status_code in (403, 503), response.text
    code = "forbidden" if response.status_code == 403 else "unavailable"
    assert response.json() == {"contract_version": "0.2.6", "error": code, "retryable": code == "unavailable"}
    assert rig.documents() == before
