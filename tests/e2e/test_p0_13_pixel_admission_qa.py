"""Independent QA retest of desktop pixel-producer admission at main d412ed9 (P0-13, QA-DESKTOP-RT-01).

Everything runs through the actual trusted local runtime factory (create_local_capture_runtime) and its
composed HTTP routes over httpx ASGITransport and MemoryStore: desktop 0.2.8, raw 0.2.6 and legacy 0.2.4.
Identities, consent, pixels and editable ink are synthetic test inputs; the structured claims are QA-made
spoofs of the generic Process example. Deleting both internal producer_profile fields is synthetic internal
damage (no HTTP route can do it), labelled where used. No database, listener, native producer or provider.
"""

import asyncio
import base64
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

httpx = pytest.importorskip("httpx")

from services.api.capture_runtime import create_local_capture_runtime  # noqa: E402
from services.api.domain import key, utc_now  # noqa: E402
from services.api.errors import DomainError  # noqa: E402
from services.api.process_context import AuthorizedProcessContextReader  # noqa: E402
from services.api.storage import MemoryStore  # noqa: E402
from services.api.tests.postgres_desktop_runtime_check import scenario  # noqa: E402
from services.api.tests.test_control import resolve_stop_fact  # noqa: E402
from services.api.tests.test_display_sources import reference  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 9, 30, 13, 0, tzinfo=timezone.utc)
TOKEN = "qa-pixel-admission-token-000000000000"
SCOPES = frozenset({"sources:read", "sources:write", "process:control", "process:capture"})
CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2", "process.ingress.v0.2.4",
                          "process.raw-ingress.v0.2.6", "process.desktop-ingress.v0.2.8"})
DESKTOP, RAW, LEGACY = "/v2/process/desktop-frames:batch", "/v2/process/raw-frames:batch", "/v2/process/frames:batch"
STREAMS = "/v2/process/streams"
PIXELS = "desktop_pixels"
EXAMPLE_RECORD = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]["records"][0]
STRUCTURED = {name: EXAMPLE_RECORD[name] for name in ("surface", "method", "evidence")}  # web_dom / structured / reselect B->C


def call(app, method, path, body=None, *, request_key=None):
    async def run():
        headers = {"Authorization": f"Bearer {TOKEN}"}
        if request_key:
            headers["Idempotency-Key"] = request_key
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://qa-admission.test") as client:
            return await client.request(method, path, headers=headers, **({"json": body} if body is not None else {}))
    return asyncio.run(run())


class Rig:
    """One actor's runtime over a shared store; request bodies come from the Backend runner's scenario."""

    def __init__(self, store, actor="qa-admission-user", *, stream="qa-stream-1", source="qa-display-1",
                 producer="qa-desktop-screen"):
        self.store, self.actor, self.producer = store, actor, producer
        c = scenario(actor)
        self.core_frame = c.core["Frame"]
        self.registration = {**c.registration, "stream_id": stream}
        self.source = {"user_id": actor, "source_id": source, "source_version": 1}
        self.display_path = f"/v2/process/display-sources/{source}"
        self.display = {**c.display, "source_id": source, "stream_id": stream}
        self.png, self.ink = c.data, c.ink_data
        self.batch_base = {**{k: c.batch[k] for k in ("contract_version", "device_id", "session_id")}, "stream_id": stream}
        self.record_base = deepcopy(c.batch["records"][0])  # an honest pixel record (external_app / visual / coverage)
        self.raw_base, self.desktop_base = deepcopy(c.raw_frame), deepcopy(c.desktop_frame)
        self.raw_base["timing"] = dict.fromkeys(self.raw_base["timing"])  # unknown times; record clock stays null
        self.runtime = None

    def open(self, *, profile, fresh_consent, desktop=None):
        self.runtime = create_local_capture_runtime(
            store=self.store, user_id=self.actor, device_id=self.registration["device_id"],
            session_id=self.registration["session_id"], producer_id=self.producer,
            registration=deepcopy(self.registration), token=TOKEN, expires_at=NOW + timedelta(hours=1),
            scopes=SCOPES, capabilities=CAPABILITIES, fresh_consent=fresh_consent, enable_raw_ingress=True,
            enable_desktop_ingress=(profile == PIXELS) if desktop is None else desktop,
            producer_profile=profile, clock=lambda: NOW, stop_fact_resolver=resolve_stop_fact)
        return self.runtime

    def post(self, path, body=None, *, request_key=None):
        return call(self.runtime.app, "POST" if body is not None or request_key else "GET", path, body, request_key=request_key)

    def put(self, path, body):
        return call(self.runtime.app, "PUT", path, body)

    def start(self):
        response = call(self.runtime.app, "POST", STREAMS, self.registration, request_key="qa-registration-" + self.registration["stream_id"])
        assert response.status_code == 200 and response.json()["state"] == "live", response.text
        assert self.put(self.display_path, self.display).status_code == 200

    def upload(self, name, *, ink=False):
        data = self.ink if ink else self.png
        ref = reference(data, name, "application/json" if ink else "image/png")
        body = {"contract_version": "0.2.2", "source": self.source, "kind": "editable_ink" if ink else "screen_image",
                "artifact": ref, "data_base64": base64.b64encode(data).decode()}
        assert self.put("/v2/process/originals/" + name, body).status_code == 200
        return ref

    def read(self, record_ids, *, raw):
        """The current-authorized reader, guarded by this runtime's own authenticator."""
        runtime = self.runtime

        def guard(state):
            principal = runtime.app.state.authenticator.authenticate(TOKEN, utc_now())
            if principal != runtime.principal or state.get("generation") != principal.authorization_generation:
                raise DomainError(403, "forbidden")
        reader = AuthorizedProcessContextReader(self.store, self.actor, guard)
        return (reader.read_raw if raw else reader)(record_ids)

    def documents(self):
        with self.store.transaction(self.actor) as tx:
            return deepcopy(tx.documents)

    def record(self, record_id, sequence, *, frame_id, artifacts, claims="honest", parents=()):
        item = {**deepcopy(self.record_base), "record_id": record_id, "sequence": sequence, "frame_id": frame_id,
                "artifacts": artifacts, "causal_parents": list(parents), "source": deepcopy(self.source)}
        if claims == "structured":
            item.update(deepcopy(STRUCTURED))
        elif claims == "gap":
            item["evidence"] = {**item["evidence"], "coverage": "unknown", "limitations": ["unknown", "unsupported_history"]}
        return item

    def batch(self, batch_id, records):
        return {**self.batch_base, "batch_id": batch_id, "delivery_mode": "live", "records": records}

    def desktop_frame(self, frame_id, ref):
        return {**deepcopy(self.desktop_base), "frame_id": frame_id, "artifact": ref, "source": deepcopy(self.source),
                "stream_id": self.registration["stream_id"]}

    def raw_frame(self, frame_id, ref):
        return {**deepcopy(self.raw_base), "frame_id": frame_id, "artifact": ref, "source": deepcopy(self.source),
                "stream_id": self.registration["stream_id"]}

    def legacy_frame(self, frame_id, ref):
        return {**self.core_frame, **self.source, "frame_id": frame_id, "artifact_id": ref["artifact_id"],
                "content_hash": ref["sha256"], "width": 2, "height": 2, "representation": "screen_capture",
                "device_id": self.registration["device_id"], "session_id": self.registration["session_id"]}

    def legacy_record(self, record_id, sequence, frame, ref, parents=()):
        """The generic structured example itself, bound to one legacy frame (a structured claim)."""
        return {**deepcopy(EXAMPLE_RECORD), "record_id": record_id, "sequence": sequence, "frame_id": frame["frame_id"],
                "artifacts": [ref], "causal_parents": list(parents), "source": deepcopy(self.source),
                "media_position": frame["media_position"]}

    # Route envelopes
    def desktop(self, batch, frames):
        return {"contract_version": "0.2.8", "batch": batch, "frames": frames}

    def raw(self, batch, frames):
        return {"contract_version": "0.2.6", "batch": batch, "frames": frames}

    def legacy(self, batch, frames):
        return {"contract_version": "0.2.4", "batch": batch, "frames": frames}


def forbidden(rig, path, body, request_key, version):
    before = rig.documents()
    response = rig.post(path, body, request_key=request_key)
    assert response.status_code == 403, response.text
    assert response.json() == {"contract_version": version, "error": "forbidden", "retryable": False}
    assert rig.documents() == before, "a refused batch wrote documents"


def accepted(rig, path, body, request_key):
    response = rig.post(path, body, request_key=request_key)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def pixels():
    """A trusted pixels-only producer: runtime opened with producer_profile desktop_pixels, honest first gap and frame."""
    rig = Rig(MemoryStore())
    rig.open(profile=PIXELS, fresh_consent=True)
    rig.start()
    rig.png_ref, rig.ink_ref = rig.upload("qa-png"), rig.upload("qa-ink", ink=True)
    rig.raw_ref, rig.legacy_ref = rig.upload("qa-raw-png"), rig.upload("qa-legacy-png")
    gap = rig.record("qa-gap", 1, frame_id=None, artifacts=[], claims="gap")
    rig.gap_ack = accepted(rig, DESKTOP, rig.desktop(rig.batch("qa-gap-batch", [gap]), []), "qa-gap")
    frame = rig.desktop_frame("qa-desktop-frame", rig.png_ref)
    honest = rig.record("qa-honest", 2, frame_id=frame["frame_id"], artifacts=[rig.png_ref, rig.ink_ref], parents=["qa-gap"])
    rig.frame_ack = accepted(rig, DESKTOP, rig.desktop(rig.batch("qa-frame-batch", [honest]), [frame]), "qa-frame")
    rig.frame = frame
    return rig


def test_trusted_binding_marks_the_exact_incarnation(pixels):
    docs = pixels.documents()
    stream, grant = docs[("control_stream", "qa-stream-1")], docs[("control_start", "qa-stream-1")]
    assert stream["producer_profile"] == grant["producer_profile"] == PIXELS
    assert grant["status"] == "consumed" and stream["producer_id"] == grant["producer_id"] == "qa-desktop-screen"
    assert [r["disposition"] for r in pixels.gap_ack["acknowledged"] + pixels.frame_ack["acknowledged"]] == ["accepted", "accepted"]


def test_desktop_ingress_cannot_be_enabled_without_the_trusted_profile():
    rig = Rig(MemoryStore())
    for profile in (None, "structured", "desktop_pixels_v2"):
        with pytest.raises(ValueError):
            rig.open(profile=profile, fresh_consent=True, desktop=True)
    assert rig.store._documents == {}, "a refused runtime wrote documents"


@pytest.mark.parametrize("route", ["desktop", "raw", "legacy"])
def test_marked_producer_refuses_structured_claims_on_every_route(pixels, route):
    rig = pixels
    if route == "desktop":
        spoof = rig.record("qa-spoof", 3, frame_id=rig.frame["frame_id"], artifacts=[rig.png_ref, rig.ink_ref], claims="structured")
        forbidden(rig, DESKTOP, rig.desktop(rig.batch("qa-spoof-batch", [spoof]), [rig.frame]), "qa-spoof", "0.2.8")
    elif route == "raw":
        frame = rig.raw_frame("qa-raw-frame", rig.raw_ref)
        spoof = rig.record("qa-spoof", 3, frame_id=frame["frame_id"], artifacts=[rig.raw_ref], claims="structured")
        forbidden(rig, RAW, rig.raw(rig.batch("qa-spoof-batch", [spoof]), [frame]), "qa-spoof", "0.2.6")
    else:
        frame = rig.legacy_frame("qa-legacy-frame", rig.legacy_ref)
        spoof = rig.legacy_record("qa-spoof", 3, frame, rig.legacy_ref)
        forbidden(rig, LEGACY, rig.legacy(rig.batch("qa-spoof-batch", [spoof]), [frame]), "qa-spoof", "0.2.4")


@pytest.mark.parametrize("spoof_first", [False, True], ids=["honest-then-spoof", "spoof-then-honest"])
def test_mixed_honest_and_structured_batch_is_refused_atomically(pixels, spoof_first):
    rig = pixels
    honest = rig.record("qa-mixed-honest", 3, frame_id=rig.frame["frame_id"], artifacts=[rig.png_ref])
    spoof = rig.record("qa-mixed-spoof", 4, frame_id=rig.frame["frame_id"], artifacts=[rig.png_ref], claims="structured")
    records = [spoof, honest] if spoof_first else [honest, spoof]
    forbidden(rig, DESKTOP, rig.desktop(rig.batch("qa-mixed", records), [rig.frame]), "qa-mixed", "0.2.8")


def test_marked_producer_still_accepts_honest_pixels_on_raw(pixels):
    rig = pixels
    frame = rig.raw_frame("qa-raw-honest-frame", rig.raw_ref)
    honest = rig.record("qa-raw-honest", 3, frame_id=frame["frame_id"], artifacts=[rig.raw_ref])
    ack = accepted(rig, RAW, rig.raw(rig.batch("qa-raw-honest", [honest]), [frame]), "qa-raw-honest")
    assert ack["acknowledged"][0]["disposition"] == "accepted"


@pytest.mark.parametrize("route", ["raw", "legacy"])
def test_cached_structured_success_is_refused_after_trusted_adoption_and_history_is_unchanged(route):
    """A generic runtime committed a structured batch; the host then adopts the pixel profile by reopening."""
    rig = Rig(MemoryStore())
    rig.open(profile=None, fresh_consent=True)
    rig.start()
    ref = rig.upload("qa-history-png")
    if route == "raw":
        frame = rig.raw_frame("qa-history-frame", ref)
        body = rig.raw(rig.batch("qa-history", [rig.record("qa-history-record", 1, frame_id=frame["frame_id"], artifacts=[ref], claims="structured")]), [frame])
        path, version = RAW, "0.2.6"
    else:
        frame = rig.legacy_frame("qa-history-frame", ref)
        body = rig.legacy(rig.batch("qa-history", [rig.legacy_record("qa-history-record", 1, frame, ref)]), [frame])
        path, version = LEGACY, "0.2.4"
    ack = accepted(rig, path, body, "qa-history-key")
    history = rig.documents()
    original = call(rig.runtime.app, "GET", f"/v2/process/sources/qa-display-1/versions/1/originals/qa-history-png").json()
    replay_key = ("capture_replay", key("POST", path, "qa-history-key"))
    assert accepted(rig, path, body, "qa-history-key") == ack  # before adoption: the cached success replays
    read_before = rig.read(["qa-history-record"], raw=route == "raw")

    rig.open(profile=PIXELS, fresh_consent=False)  # trusted host adoption of the existing incarnation
    adopted = rig.documents()
    assert adopted[("control_stream", "qa-stream-1")]["producer_profile"] == PIXELS
    assert {k: v for k, v in adopted.items() if k[0] not in {"control_stream", "control_start"}} == \
        {k: v for k, v in history.items() if k[0] not in {"control_stream", "control_start"}}
    forbidden(rig, path, body, "qa-history-key", version)  # exact retry: current admission before cached success

    after = rig.documents()
    assert after[("capture_record", "qa-history-record")] == history[("capture_record", "qa-history-record")]
    assert after[replay_key] == history[replay_key] and json.loads(after[replay_key]["response_json"]) == ack
    assert call(rig.runtime.app, "GET", f"/v2/process/sources/qa-display-1/versions/1/originals/qa-history-png").json() == original
    assert base64.b64decode(original["data_base64"]) == rig.png
    read_after = rig.read(["qa-history-record"], raw=route == "raw")
    assert read_after == read_before  # read shape unchanged; the old claim stays a retained declaration
    assert read_after["batch"]["records"][0]["method"] == "structured"


@pytest.fixture
def damaged():
    """A first honest desktop gap, then SYNTHETIC internal damage: both producer_profile fields deleted."""
    rig = Rig(MemoryStore())
    rig.open(profile=PIXELS, fresh_consent=True)
    rig.start()
    rig.png_ref, rig.raw_ref, rig.legacy_ref = rig.upload("qa-png"), rig.upload("qa-raw-png"), rig.upload("qa-legacy-png")
    gap = rig.record("qa-gap", 1, frame_id=None, artifacts=[], claims="gap")
    accepted(rig, DESKTOP, rig.desktop(rig.batch("qa-gap-batch", [gap]), []), "qa-gap")
    documents = rig.store._documents[rig.actor]
    assert not any(kind == "raw_capture_frame" for kind, _ in documents)
    for kind in ("control_start", "control_stream"):
        del documents[(kind, "qa-stream-1")]["producer_profile"]  # synthetic: no HTTP route can do this
    return rig


@pytest.mark.parametrize("route,claims", [("raw", "structured"), ("legacy", "structured"), ("raw", "honest"), ("desktop", "honest")])
def test_first_gap_witness_refuses_fallback_after_both_markers_are_lost(damaged, route, claims):
    rig = damaged
    if route == "raw":
        frame = rig.raw_frame("qa-raw-frame", rig.raw_ref)
        item = rig.record("qa-fallback", 2, frame_id=frame["frame_id"], artifacts=[rig.raw_ref], claims=claims, parents=["qa-gap"])
        forbidden(rig, RAW, rig.raw(rig.batch("qa-fallback", [item]), [frame]), "qa-fallback", "0.2.6")
    elif route == "legacy":
        frame = rig.legacy_frame("qa-legacy-frame", rig.legacy_ref)
        item = rig.legacy_record("qa-fallback", 2, frame, rig.legacy_ref, parents=["qa-gap"])
        forbidden(rig, LEGACY, rig.legacy(rig.batch("qa-fallback", [item]), [frame]), "qa-fallback", "0.2.4")
    else:
        frame = rig.desktop_frame("qa-desktop-frame", rig.png_ref)
        item = rig.record("qa-fallback", 2, frame_id=frame["frame_id"], artifacts=[rig.png_ref], parents=["qa-gap"])
        forbidden(rig, DESKTOP, rig.desktop(rig.batch("qa-fallback", [item]), [frame]), "qa-fallback", "0.2.8")


def test_generic_reopen_after_marker_loss_cannot_downgrade(damaged):
    rig = damaged
    rig.open(profile=None, fresh_consent=False)  # a generic host reopen of the damaged incarnation
    frame = rig.raw_frame("qa-raw-frame", rig.raw_ref)
    item = rig.record("qa-fallback", 2, frame_id=frame["frame_id"], artifacts=[rig.raw_ref], claims="structured", parents=["qa-gap"])
    forbidden(rig, RAW, rig.raw(rig.batch("qa-fallback", [item]), [frame]), "qa-fallback", "0.2.6")


def generic_structured(rig, route):
    ref = rig.upload("qa-generic-png")
    if route == "raw":
        frame = rig.raw_frame("qa-generic-frame", ref)
        return RAW, rig.raw(rig.batch("qa-generic", [rig.record("qa-generic-record", 1, frame_id=frame["frame_id"], artifacts=[ref], claims="structured")]), [frame])
    frame = rig.legacy_frame("qa-generic-frame", ref)
    return LEGACY, rig.legacy(rig.batch("qa-generic", [rig.legacy_record("qa-generic-record", 1, frame, ref)]), [frame])


@pytest.mark.parametrize("route", ["raw", "legacy"])
@pytest.mark.parametrize("scope", ["never-desktop", "other-actor-same-stream", "same-actor-other-stream"])
def test_genuine_generic_structured_input_remains_compatible(pixels, scope, route):
    if scope == "never-desktop":
        rig = Rig(MemoryStore())
    elif scope == "other-actor-same-stream":
        rig = Rig(pixels.store, actor="qa-other-actor")
    else:
        # A different producer: the same producer's next stream would be a restart of the marked one.
        rig = Rig(pixels.store, stream="qa-generic-stream", source="qa-display-2", producer="qa-generic-producer")
    prior = pixels.documents()
    rig.open(profile=None, fresh_consent=True)
    rig.start()
    path, body = generic_structured(rig, route)
    ack = accepted(rig, path, body, "qa-generic-key")
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert accepted(rig, path, body, "qa-generic-key") == ack  # exact retry of a genuine generic success
    stored = json.loads(rig.documents()[("capture_record", "qa-generic-record")]["canonical_json"])["record"]
    assert (stored["surface"], stored["method"], stored["evidence"]["kind"]) == ("web_dom", "structured", "operation")
    if scope != "never-desktop":
        after = pixels.documents()
        assert all(after.get(identity) == value for identity, value in prior.items() if identity[0] != "session"), \
            "the marked incarnation's documents changed"
