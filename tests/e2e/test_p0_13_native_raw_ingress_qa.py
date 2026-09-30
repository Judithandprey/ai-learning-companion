"""Independent QA acceptance of native raw-ingress bytes at main 81b7e18 (P0-07/P0-13).

Inputs are the exact files from hosted native run 36677566096. The shared Swift sources
(uploader, FrameStore PNG encoder, frame mapper) were compiled with swiftc as the arm64 macOS
command-line check RawFrameIngressCheck and run against an in-process fake transport with
synthetic solid-colour CIImage pixels and harness identities. The iOS app targets were only
compiled (CODE_SIGNING_ALLOWED=NO); nothing ran in the app, Simulator or on an iPad.
Set QA_NATIVE_FIXTURES to the extracted raw-frame-ingress-fixtures folder; the 48-file set
is pinned by SHA-256.

The bytes go unchanged through production create_capture_app over httpx ASGITransport into
MemoryStore, then through the current-authorized readers and prepare_stored_process_context.
Synthetic and labelled here: account, membership, start grant and producer stop facts
(trusted-adapter stand-ins), the bearer authenticator (LocalTestAuthenticator), the caller
guard given to the reader and resolver, device/session rows, the service clock, direct
storage mutations (outside the immutability guarantee) and QA-derived bodies.
The Swift ACK/error rules are exercised through a Python port, not Swift execution.
This is not PostgreSQL, native network transport, device/ReplayKit, provider/AI, original-
screen ink, or a pass of either section 7.1 core gate.
"""

import asyncio
import base64
import hashlib
import json
import os
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from jsonschema import ValidationError

httpx = pytest.importorskip("httpx")

from packages.contracts import raw_capture_ingress as raw_wire  # noqa: E402
from services.api.auth import LocalTestAuthenticator, Principal  # noqa: E402
from services.api.capture_app import create_capture_app  # noqa: E402
from services.api.control import ControlRegistry  # noqa: E402
from services.api.domain import Archive, key  # noqa: E402
from services.api.errors import DomainError  # noqa: E402
from services.api.image_resolver import AuthorizedImageResolver  # noqa: E402
from services.api.process_context import AuthorizedProcessContextReader  # noqa: E402
from services.api.storage import MemoryStore  # noqa: E402
from services.learning.process_context import prepare_stored_process_context  # noqa: E402


FIXTURES = os.environ.get("QA_NATIVE_FIXTURES")
pytestmark = pytest.mark.skipif(not FIXTURES, reason="set QA_NATIVE_FIXTURES to the run 36677566096 fixtures")

FIXTURE_COUNT = 48
# The folder is raw-frame-ingress-fixtures.zip (sha256 57b0f80b495305e7acd04e7f989679f3de5f890002c50fd6100aa7b4746279dd
# in the run's SHA256SUMS), extracted and checked member by member. This digest is sha256 over
# "<name> <sha256>\n" for every extracted file, sorted by name.
FIXTURE_SET_DIGEST = "5c1dba09385d2e648791bd53556b712f913dfa3840811e40a33f54cb73ec79d2"
PINNED = {
    "request-live.json": "84a28c296497a312c58dba97e11baa0961effadb1e2aa9fd890e1c88a4b9a091",
    "request-historical-unknown-clock.json": "2dc9d968213bc0f24767745f8e58f7ef97f6c72f10f4eed5ed12857d302e0cec",
    "original-live.json": "0375299c3e291868a72bfa3ba5b39f0912763b866db3186d885c9e5533a8b999",
    "original-historical-unknown-clock.json": "c94446d495070b749fa56c546f7695c21bc3275701e97132f2f63878d50ca906",
    "manifest.json": "010737d74737b2c50ce2f83d27fd56c0ad3eff7cf34680ace2ab48a465da7f82",
    "ack-canonical.json": "351bee0b0d205ad00a7a10a0874f6c43fbb3a173187f0068815592a16a14bfa9",
    "error-capture_stopped.json": "cc58e0bcaae7bc2b0de084f527dcd1f3672101ab5fe385f134679552d12319cf",
    "error-idempotency_conflict.json": "ac4a51108a108e76bee3cf86fd9c0dbab8383cbb168b4402f5adce50203c5b96",
    "error-unavailable.json": "6bc240b989f3f4d07e5bfe20c0643ddffa97f73bc3df82ea0eeb63fd4485c006",
}
PNG_SHA256 = {
    "live": "ab89c6d23de2e7e580b8abe9f5c4318d06208cf4795d14e1ca191923ea54d361",
    "historical": "53d8152de8a37d4a953726323097ade5a8e46453c830843fbabcf92fc507d6a6",
}
FILES = {
    "live": ("request-live.json", "original-live.json"),
    "historical": ("request-historical-unknown-clock.json", "original-historical-unknown-clock.json"),
}

USER, DEVICE, SESSION = "user-1", "ipad-1", "learning-session-1"
STREAM, SOURCE, RECORD, KEY = "capture-stream-1", "display-source-1", "raw-record-1", "raw-key-1"
TOKEN = "qa-native-token"
# Equal to ack-canonical.json's received_at, so the server ACK can be compared with the
# ACK the native client accepted. received_at is service bookkeeping, never capture time.
NOW = datetime(2026, 9, 30, 5, 0, 0, 123456, tzinfo=timezone.utc)
RECEIVED_AT = "2026-09-30T05:00:00.123456Z"
SCOPES = frozenset({"sources:read", "sources:write", "process:control", "process:capture"})
CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2",
                          "process.ingress.v0.2.4", raw_wire.CAPABILITY})
RAW = "/v2/process/raw-frames:batch"
STREAMS = "/v2/process/streams"
STREAM_PATH = f"{STREAMS}/{STREAM}"
REGISTRATION = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION,
                "stream_id": STREAM, "authorization_generation": 1, "membership_revision": 1,
                "continuity": {"kind": "initial"}}
DISPLAY = {"contract_version": "0.2.4", "source_id": SOURCE, "stream_id": STREAM,
           "project_id": None, "source_timezone": "UTC"}


@pytest.fixture(scope="module")
def native():
    folder = Path(FIXTURES)
    files = {path.name: path.read_bytes() for path in sorted(folder.iterdir())}
    listing = "".join(f"{name} {hashlib.sha256(data).hexdigest()}\n" for name, data in files.items())
    assert len(files) == FIXTURE_COUNT
    assert hashlib.sha256(listing.encode()).hexdigest() == FIXTURE_SET_DIGEST
    for name, digest in PINNED.items():
        assert hashlib.sha256(files[name]).hexdigest() == digest, name
    return files


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR"
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


# --- Python port of the native rules (OriginalUpload.swift at 81b7e18) ---------------------

_TIMESTAMP = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}[Tt]([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?Z")
_ERROR_STATUS = {
    "invalid_json": 400, "unauthenticated": 401, "forbidden": 403, "capability_required": 403,
    "not_found": 404, "source_identity_conflict": 409, "record_conflict": 409, "idempotency_conflict": 409,
    "dependency_missing": 409, "stale_scope": 409, "capture_stopped": 409, "unsupported_source": 409,
    "payload_too_large": 413, "unsupported_media_type": 415, "unsupported_version": 422,
    "invalid_request": 422, "unavailable": 503,
}


def _utc_timestamp(value):
    if type(value) is not str or not _TIMESTAMP.fullmatch(value):
        return False
    year, month, day = (int(part) for part in value[:10].split("-"))
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return year >= 1 and 1 <= day <= days


def _same(value, expected):
    if type(expected) is int:
        return type(value) is int and value == expected
    return type(value) is str and value == expected


def native_ack(data, request):
    """acceptedFrameBatchAck: the saved canonical ACK string, or None if refused."""
    sent = json.loads(request)
    batch = sent["batch"]
    record = batch["records"][0]
    artifact = record["artifacts"][0]
    try:
        ack = json.loads(data) if len(data) <= 64 * 1024 else None
    except ValueError:
        return None
    if type(ack) is not dict or set(ack) != {"contract_version", "batch_id", "user_id", "device_id",
                                             "session_id", "stream_id", "acknowledged"}:
        return None
    expected = {"contract_version": "0.2.0", "batch_id": batch["batch_id"], "user_id": record["source"]["user_id"],
                **{field: batch[field] for field in ("device_id", "session_id", "stream_id")}}
    if not all(_same(ack[field], value) for field, value in expected.items()):
        return None
    receipts = ack["acknowledged"]
    if type(receipts) is not list or len(receipts) != 1 or type(receipts[0]) is not dict:
        return None
    receipt = receipts[0]
    if (set(receipt) != {"record_id", "sequence", "disposition", "received_at", "envelope", "artifacts"}
            or not _same(receipt["record_id"], record["record_id"])
            or not _same(receipt["sequence"], record["sequence"])
            or not _same(receipt["envelope"], "committed")
            or receipt["disposition"] not in ("accepted", "duplicate")
            or not _utc_timestamp(receipt["received_at"])):
        return None
    artifacts = receipt["artifacts"]
    if type(artifacts) is not list or len(artifacts) != 1 or type(artifacts[0]) is not dict:
        return None
    got = artifacts[0]
    if (set(got) != {"artifact_id", "sha256", "byte_length", "media_type", "status"}
            or not all(_same(got[field], artifact[field])
                       for field in ("artifact_id", "sha256", "byte_length", "media_type"))
            or not _same(got["status"], "verified")):
        return None
    return canonical({**expected, "acknowledged": [{
        "record_id": record["record_id"], "sequence": record["sequence"], "disposition": receipt["disposition"],
        "received_at": receipt["received_at"], "envelope": "committed",
        "artifacts": [{**{field: artifact[field] for field in ("artifact_id", "sha256", "byte_length", "media_type")},
                       "status": "verified"}]}]}).decode()


def native_error(data, status, version="0.2.6"):
    """ingressErrorCode: the RawIngressError code, or None if the body is not a valid error."""
    try:
        body = json.loads(data) if len(data) <= 4096 else None
    except ValueError:
        return None
    if (type(body) is not dict or set(body) != {"contract_version", "error", "retryable"}
            or body["contract_version"] != version or type(body["retryable"]) is not bool
            or _ERROR_STATUS.get(body["error"]) != status
            or (body["retryable"] and body["error"] not in ("unavailable", "dependency_missing"))):
        return None
    return body["error"]


# --- In-process rig ------------------------------------------------------------------------

def stop_fact(tx, user_id, stream_id):
    """Synthetic independent producer stop evidence (trusted-adapter stand-in)."""
    fact = tx.get("qa_producer_stop", stream_id)
    return None if fact is None else fact["boundary"]


class Rig:
    def __init__(self):
        self.store = MemoryStore()
        self.instant = [NOW]
        self.archive = Archive(self.store)
        self.archive.set_authorization(USER)
        with self.store.transaction(USER) as tx:  # Trusted synthetic device/session rows.
            tx.put("device", DEVICE, {"user_id": USER, "id": DEVICE})
            tx.put("session", SESSION, {"user_id": USER, "id": SESSION, "live_capture": False})
        trusted = ControlRegistry(self.store, scopes=frozenset({"process:control", "process:capture"}),
                                  capabilities=CAPABILITIES, authorization_guard=lambda state: None,
                                  stop_fact_resolver=stop_fact)
        trusted.set_membership(USER, DEVICE, SESSION, active=True, expected_revision=0)
        trusted.authorize_start(USER, REGISTRATION, producer_id="qa-synthetic-producer")
        self.auth = LocalTestAuthenticator({TOKEN: Principal(USER, SCOPES, NOW + timedelta(hours=1))})
        self.app = self.build()
        assert self.call("POST", STREAMS, canonical(REGISTRATION), key="qa-register").status_code == 200
        response = self.call("PUT", f"/v2/process/display-sources/{SOURCE}", canonical(DISPLAY))
        assert response.status_code == 200, response.text
        self.descriptor = response.json()

    def build(self):
        return create_capture_app(self.store, self.auth, capabilities=CAPABILITIES,
                                  clock=lambda: self.instant[0], stop_fact_resolver=stop_fact,
                                  enable_raw_ingress=True)

    def call(self, method, path, content=None, *, key=None, app=None):
        async def run():
            headers = [("Authorization", f"Bearer {TOKEN}")]
            if key is not None:
                headers.append(("Idempotency-Key", key))
            if content is not None:
                headers.append(("Content-Type", "application/json"))
            transport = httpx.ASGITransport(app=app or self.app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://qa-native.test") as client:
                return await client.request(method, path, headers=headers, content=content)
        return asyncio.run(run())

    def upload(self, original):
        artifact_id = json.loads(original)["artifact"]["artifact_id"]
        return self.call("PUT", f"/v2/process/originals/{artifact_id}", original)

    def get_original(self, artifact_id):
        return self.call("GET", f"/v2/process/sources/{SOURCE}/versions/1/originals/{artifact_id}")

    def post(self, body, key=KEY, app=None):
        return self.call("POST", RAW, body, key=key, app=app)

    def control(self, kind, boundary=None, *, fact=None):
        if fact is not None:
            with self.store.transaction(USER) as tx:
                tx.put("qa_producer_stop", STREAM, {"boundary": fact})
        revision = self.call("GET", STREAM_PATH).json()["revision"]
        action = {"kind": kind} if kind == "withdraw" else {"kind": kind, "pre_stop_sequence": boundary}
        body = {"contract_version": "0.2.1", "device_id": DEVICE, "session_id": SESSION, "stream_id": STREAM,
                "expected_revision": revision, "action": action}
        response = self.call("POST", STREAM_PATH + ":control", canonical(body), key=f"qa-{kind}-{revision}")
        assert response.status_code == 200, response.text
        return response.json()

    def guard(self, state):
        principal = self.auth.authenticate(TOKEN, self.instant[0])
        if (principal.user_id != USER or "sources:read" not in principal.scopes
                or state["generation"] != principal.authorization_generation):
            raise DomainError(403, "forbidden")

    def reader(self):
        return AuthorizedProcessContextReader(self.store, USER, self.guard)

    def resolver(self):
        return AuthorizedImageResolver(self.store, USER, self.guard)

    def prepare(self, record_ids, resolve=None):
        return prepare_stored_process_context(record_ids, self.reader().read_raw,
                                              resolve or self.resolver().resolve_raw, user_id=USER)

    def documents(self):
        with self.store.transaction(USER) as tx:
            return deepcopy(tx.documents)


def refused(response, status, code, fixture=None):
    """A native-valid RawIngressError that carries no original bytes."""
    assert response.status_code == status, response.text
    assert native_error(response.content, status) == code
    assert b"iVBOR" not in response.content
    if fixture is not None:
        assert response.content == fixture


def committed(rig, native, mode):
    request, original = (native[name] for name in FILES[mode])
    assert rig.upload(original).status_code == 200
    response = rig.post(request)
    assert response.status_code == 200, response.text
    return response


def accepted(response, request):
    """HTTP 200 whose ACK the native rule would save; returns the saved canonical form."""
    assert response.status_code == 200, response.text
    saved = native_ack(response.content, request)
    assert saved is not None, response.text
    return saved


def check_packet(packet, request, png, context, descriptor):
    sent = json.loads(request)
    assert packet["user_id"] == USER and packet["kind"] == "internal_process_evidence"
    assert packet["batch"] == {k: v for k, v in context["batch"].items() if k != "records"}
    assert {k: packet["batch"][k] for k in ("device_id", "session_id", "stream_id", "delivery_mode")} == {
        **{k: sent["batch"][k] for k in ("device_id", "session_id", "stream_id")}, "delivery_mode": "historical"}
    assert packet["counts"] == {"supplied": 1, "included": 1, "omitted": 0}
    assert packet["attached_bytes"] == len(png) and packet["non_frame_artifacts"] == "references_only"
    assert (packet["authorization_status"], packet["commit_status"], packet["live_status"],
            packet["provider_receipt"]) == ("not_attested",) * 4
    assert (packet["presentation_permission"], packet["capture_completeness"]) == ("not_granted", "unknown")
    (item,) = packet["items"]
    assert item["record"] == sent["batch"]["records"][0]
    assert item["frame"] == sent["frames"][0]
    assert item["source"] == descriptor
    assert (item["pixel_orientation"], item["provider_image_alignment"]) == ("raw_unapplied", "not_attested")
    assert item["image"] == {"status": "attached", "data": png, "media_type": "image/png", "byte_length": len(png)}


# --- Tests ---------------------------------------------------------------------------------

def test_fixture_set_and_manifest_pairing_are_the_pinned_native_run(native):
    manifest = json.loads(native["manifest.json"])
    requests = {entry["name"]: entry for entry in manifest if entry["type"] == "request"}
    assert set(requests) == {"live", "historical-unknown-clock"}
    for name, mode, posted in (("live", "live", True), ("historical-unknown-clock", "historical", False)):
        entry = requests[name]
        request_name, original_name = FILES[mode]
        assert (entry["body"], entry["original"], entry["path"], entry["method"]) == (
            request_name, original_name, RAW, "POST")
        assert (entry["idempotency_key"], entry["user_id"], entry["posted"]) == (KEY, USER, posted)
        original = json.loads(native[original_name])
        assert entry["binding"] == {k: v for k, v in original.items() if k != "data_base64"}
        png = base64.b64decode(original["data_base64"], validate=True)
        assert hashlib.sha256(png).hexdigest() == PNG_SHA256[mode] == original["artifact"]["sha256"]
        assert len(png) == original["artifact"]["byte_length"] and png_size(png) == (64, 48)
        sent = json.loads(native[request_name])
        assert sent["batch"]["delivery_mode"] == mode
        assert sent["batch"]["records"][0]["artifacts"] == [original["artifact"]] == [sent["frames"][0]["artifact"]]
        assert native[request_name] == canonical(sent)  # Already canonical JSON.
    assert sum(entry["type"] == "ack" for entry in manifest) == 35


def test_python_port_reproduces_every_native_ack_and_error_verdict(native):
    manifest = json.loads(native["manifest.json"])
    request = native["request-live.json"]
    batch = json.loads(request)["batch"]
    artifact = batch["records"][0]["artifacts"][0]
    verified = {tuple(artifact[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))}
    for entry in (e for e in manifest if e["type"] == "ack"):
        data = native[entry["ack"]]
        port = "accepted" if native_ack(data, request) else "rejected"
        try:
            raw_wire.validate_ack(batch, json.loads(data), user_id=USER, verified_artifacts=verified)
            contract = "accepted"
        except (ValueError, ValidationError):  # JSONDecodeError is a ValueError.
            contract = "rejected"
        assert port == entry["swift_verdict"] == contract, entry["name"]
    for entry in (e for e in manifest if e["type"] in ("error", "invalid_error")):
        code = native_error(native[entry["body"]], entry["status"])
        assert (code is not None) == (entry["type"] == "error"), entry["name"]


@pytest.mark.parametrize("mode", ["live", "historical"])
def test_exact_native_bytes_commit_read_twice_replay_and_stop(native, mode):
    rig = Rig()
    request, original = (native[name] for name in FILES[mode])
    other = native[FILES["historical" if mode == "live" else "live"][0]]
    sent, upload = json.loads(request), json.loads(original)
    artifact_id = upload["artifact"]["artifact_id"]
    png = base64.b64decode(upload["data_base64"])

    before = rig.documents()
    refused(rig.post(request), 404, "not_found")  # Native: pending, uploader disabled.
    assert rig.documents() == before

    receipt = rig.upload(original)
    assert receipt.status_code == 200
    assert receipt.json() == {**{k: v for k, v in upload.items() if k != "data_base64"}, "status": "bytes_committed"}

    first = rig.post(request)
    saved = accepted(first, request)
    assert first.headers["cache-control"] == "no-store"
    ack = first.json()
    verified = {tuple(upload["artifact"][k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))}
    raw_wire.validate_ack(sent["batch"], ack, user_id=USER, verified_artifacts=verified)
    assert ack["acknowledged"][0]["disposition"] == "accepted"
    assert ack["acknowledged"][0]["received_at"] == RECEIVED_AT
    if mode == "live":
        assert ack == json.loads(native["ack-canonical.json"])

    stored = rig.documents()
    assert stored[("raw_capture_frame", sent["frames"][0]["frame_id"])] == sent["frames"][0]
    assert json.loads(stored[("capture_record", RECORD)]["canonical_json"])["record"] == sent["batch"]["records"][0]
    assert base64.b64decode(stored[("artifact", artifact_id)]["data_base64"]) == png
    got = rig.get_original(artifact_id)
    assert got.status_code == 200 and got.json() == upload

    reads = [rig.reader().read_raw([RECORD]) for _ in range(2)]
    assert reads[0] == reads[1]
    context = reads[0]
    assert context["batch"]["delivery_mode"] == "historical"  # Never re-labelled live.
    assert context["batch"]["batch_id"].startswith("context-")
    assert context["batch"]["records"] == sent["batch"]["records"]
    assert context["frames"] == sent["frames"] and context["sources"] == [rig.descriptor]
    frame = context["frames"][0]
    assert frame["captured_at"] is None and frame["media_position"] is None
    assert frame["orientation"] == {"system": "CGImagePropertyOrientation", "value": 6, "applied_to_pixels": False}
    if mode == "historical":
        assert context["batch"]["records"][0]["clock"] is None
        assert frame["timing"]["callback_clock"] is None and frame["timing"]["observed_at_estimate"] is None
    for _ in range(2):
        assert rig.resolver().resolve_raw(frame, max_bytes=4 << 20) == {
            "status": "available", "frame": frame, "media_type": "image/png", "data": png}
    packets = [rig.prepare([RECORD]) for _ in range(2)]
    assert packets[0] == packets[1]
    check_packet(packets[0], request, png, context, rig.descriptor)

    # Replay across ASGI reconstruction with a later service clock keeps the first ACK.
    rig.instant[0] = NOW + timedelta(minutes=5)
    rebuilt = rig.build()
    replay = rig.post(request, app=rebuilt)
    assert accepted(replay, request) == saved and replay.json() == ack
    assert replay.content.decode() == saved  # Replay bytes equal the native saved form.
    pretty = json.dumps(dict(reversed(list(sent.items()))), indent=2).encode()
    assert rig.post(pretty, app=rebuilt).json() == ack  # Canonical fingerprint.
    assert rig.documents() == stored
    duplicate = rig.post(request, key="qa-new-key", app=rebuilt)
    assert accepted(duplicate, request) == saved.replace('"accepted"', '"duplicate"')
    after_duplicate = rig.documents()
    assert set(after_duplicate) - set(stored) == {("capture_replay", key("POST", RAW, "qa-new-key"))}

    # Stop with an unknown boundary: every new or cached batch is refused; history stays readable.
    stopped = rig.control("stop", None)
    assert (stopped["state"], stopped["pre_stop_sequence"]) == ("stopped", None)
    before_stop_checks = rig.documents()
    refused(rig.post(request, app=rebuilt), 409, "capture_stopped", native["error-capture_stopped.json"])
    refused(rig.post(request, key="qa-after-stop"), 409, "capture_stopped", native["error-capture_stopped.json"])
    refused(rig.post(other, key="qa-other-after-stop"), 409, "capture_stopped", native["error-capture_stopped.json"])
    assert rig.upload(original).status_code == 403
    assert rig.documents() == before_stop_checks
    assert rig.get_original(artifact_id).json() == upload
    assert [rig.reader().read_raw([RECORD]) for _ in range(2)] == reads
    assert rig.prepare([RECORD]) == packets[0]


@pytest.mark.parametrize("boundary,admitted", [(100, False), (101, True)])
def test_known_stop_boundary_admits_only_historical_through_it(native, boundary, admitted):
    rig = Rig()
    history, original = (native[name] for name in FILES["historical"])
    assert rig.upload(original).status_code == 200  # Original retained while live.
    assert rig.control("stop", boundary, fact=boundary)["pre_stop_sequence"] == boundary
    response = rig.post(history)
    if admitted:
        accepted(response, history)
        packet = rig.prepare([RECORD])
        assert packet["items"][0]["record"]["clock"] is None  # Unknown clock stays unknown.
    else:
        refused(response, 409, "capture_stopped", native["error-capture_stopped.json"])
    refused(rig.post(native["request-live.json"], key="qa-live-after-stop"), 409, "capture_stopped")


def test_unknown_stop_then_seal_releases_only_historical_delivery(native):
    """Server Stop/seal policy using native-built bytes. The current native uploader cannot reach
    the post-seal step: after it receives capture_stopped it keeps the batch pending, unsent."""
    rig = Rig()
    history, original = (native[name] for name in FILES["historical"])
    assert rig.upload(original).status_code == 200
    assert rig.control("stop", None)["pre_stop_sequence"] is None
    refused(rig.post(history), 409, "capture_stopped")
    assert rig.control("seal_stop", 101, fact=101)["pre_stop_sequence"] == 101
    accepted(rig.post(history), history)
    refused(rig.post(native["request-live.json"], key="qa-live-after-seal"), 409, "capture_stopped")


def test_committed_batch_whose_ack_was_lost_stays_refused_after_stop_even_after_seal(native):
    """Observation for the separately authorized post-Stop recovery design (a named open
    dependency). The historical variant is a QA-made body that current native never sends."""
    rig = Rig()
    live = native["request-live.json"]
    committed(rig, native, "live")  # Suppose this ACK never reached the device.
    rig.control("stop", None)
    refused(rig.post(live), 409, "capture_stopped", native["error-capture_stopped.json"])
    assert rig.reader().read_raw([RECORD])["batch"]["records"] == json.loads(live)["batch"]["records"]
    rig.control("seal_stop", 101, fact=101)
    refused(rig.post(live), 409, "capture_stopped")
    derived = json.loads(live)
    derived["batch"]["delivery_mode"] = "historical"
    derived = canonical(derived)
    # Same key with a rewritten envelope: a 409 that native would record as a final refusal.
    refused(rig.post(derived), 409, "idempotency_conflict", native["error-idempotency_conflict.json"])
    # Only a new key plus historical delivery under the seal learns the existing commit.
    saved = accepted(rig.post(derived, key="qa-recovery-key"), derived)
    assert '"disposition":"duplicate"' in saved and RECEIVED_AT in saved


def test_cross_fixture_identity_conflicts_never_overwrite_the_live_record(native):
    rig = Rig()
    committed(rig, native, "live")
    history, original = (native[name] for name in FILES["historical"])
    assert rig.upload(original).status_code == 200
    before, read = rig.documents(), rig.reader().read_raw([RECORD])
    refused(rig.post(history), 409, "idempotency_conflict", native["error-idempotency_conflict.json"])
    refused(rig.post(history, key="qa-historical-key"), 409, "record_conflict")
    assert rig.documents() == before and rig.reader().read_raw([RECORD]) == read


def test_two_native_originals_keep_selection_order_and_image_correspondence(native):
    """QA-derived second live record that references the historical fixture's original."""
    rig = Rig()
    committed(rig, native, "live")
    history_original = json.loads(native["original-historical-unknown-clock.json"])
    assert rig.upload(native["original-historical-unknown-clock.json"]).status_code == 200
    second = json.loads(native["request-live.json"])
    record, frame = second["batch"]["records"][0], second["frames"][0]
    second["batch"]["batch_id"] = "raw-batch-2"
    record.update(record_id="raw-record-2", sequence=102, frame_id="raw-frame-2",
                  artifacts=[history_original["artifact"]])
    record["clock"]["elapsed_ms"] = 1250
    frame.update(frame_id="raw-frame-2", artifact=history_original["artifact"], buffer_sequence=42)
    frame["timing"]["callback_clock"] = deepcopy(record["clock"])
    accepted(rig.post(canonical(second), key="raw-key-2"), canonical(second))
    for order in (["raw-record-2", RECORD], [RECORD, "raw-record-2"]):
        context = rig.reader().read_raw(order)
        assert [r["record_id"] for r in context["batch"]["records"]] == order
        packet = rig.prepare(order)
        assert [item["record"]["record_id"] for item in packet["items"]] == order
        for item in packet["items"]:
            digest = hashlib.sha256(item["image"]["data"]).hexdigest()
            assert digest == item["frame"]["artifact"]["sha256"] == item["record"]["artifacts"][0]["sha256"]
    with pytest.raises(ValueError):
        rig.prepare([RECORD, RECORD])


def deactivate_membership(rig):
    trusted = ControlRegistry(rig.store, scopes=frozenset({"process:control", "process:capture"}),
                              capabilities=CAPABILITIES, authorization_guard=lambda state: None,
                              stop_fact_resolver=stop_fact)
    trusted.set_membership(USER, DEVICE, SESSION, active=False, expected_revision=1)


REVOKE = {
    "token_revoked": lambda rig: rig.auth.revoke(TOKEN),
    "account_disabled": lambda rig: rig.archive.set_authorization(USER, enabled=False),
    "source_revoked": lambda rig: rig.archive.revoke_source(USER, SOURCE),
    "source_deleted": lambda rig: rig.archive.delete_source(USER, SOURCE),
    "stream_withdrawn": lambda rig: rig.control("withdraw"),
    "membership_deactivated": deactivate_membership,
}
# Observed statuses at 81b7e18. case: (replay status, code, GET original, PUT original,
# reader/prepare status or None when history stays readable, resolver status)
REVOCATIONS = {
    "token_revoked": (401, "unauthenticated", 401, 401, 401, "revoked"),
    "account_disabled": (403, "forbidden", 403, 403, 403, "revoked"),
    "source_revoked": (404, "not_found", 403, 403, 403, "revoked"),
    "source_deleted": (404, "not_found", 404, 404, 404, "missing"),
    "stream_withdrawn": (403, "forbidden", 200, 403, None, "available"),
    "membership_deactivated": (403, "forbidden", 200, 403, None, "available"),
}


@pytest.mark.parametrize("case", sorted(REVOCATIONS))
def test_current_revocation_deletion_and_withdraw_at_http_reader_resolver_boundaries(native, case):
    rig = Rig()
    committed(rig, native, "live")
    live, upload = native["request-live.json"], json.loads(native["original-live.json"])
    frame = json.loads(live)["frames"][0]
    baseline = rig.prepare([RECORD])
    REVOKE[case](rig)
    replay_status, code, get_status, put_status, read_status, resolve_status = REVOCATIONS[case]
    before = rig.documents()
    refused(rig.post(live), replay_status, code)
    refused(rig.post(live, key="qa-new-after-" + case), replay_status, code)
    got = rig.get_original(upload["artifact"]["artifact_id"])
    assert got.status_code == get_status and (get_status == 200 or b"iVBOR" not in got.content)
    put = rig.upload(native["original-live.json"])
    assert put.status_code == put_status and b"iVBOR" not in put.content
    assert rig.resolver().resolve_raw(frame, max_bytes=4 << 20)["status"] == resolve_status
    if read_status is None:
        assert rig.reader().read_raw([RECORD])["frames"] == [frame]
        assert rig.prepare([RECORD]) == baseline  # Transmission ended; history stays readable.
    else:
        for operation in (lambda: rig.reader().read_raw([RECORD]), lambda: rig.prepare([RECORD])):
            with pytest.raises(DomainError) as error:
                operation()
            assert error.value.status == read_status
    assert rig.documents() == before  # No refusal wrote, repaired or resurrected anything.
    if case == "source_deleted":
        assert upload["data_base64"] not in json.dumps(list(before.values()))  # No retained PNG copy.
        assert ("capture_tombstone", RECORD) in before and ("frame_tombstone", frame["frame_id"]) in before


@pytest.mark.parametrize("when", ["before_image", "after_image"])
@pytest.mark.parametrize("case,status", [("source_revoked", 403), ("token_revoked", 401), ("account_disabled", 403)])
def test_revocation_during_preparation_withholds_the_whole_packet(native, case, status, when):
    rig = Rig()
    committed(rig, native, "live")
    resolver = rig.resolver()

    def resolve(frame, *, max_bytes):
        if when == "before_image":
            REVOKE[case](rig)
        result = resolver.resolve_raw(frame, max_bytes=max_bytes)
        if when == "after_image":
            REVOKE[case](rig)
        return result

    packets = []
    with pytest.raises(DomainError) as error:
        packets.append(rig.prepare([RECORD], resolve))
    assert error.value.status == status and not packets


def test_metadata_change_during_preparation_withholds_the_whole_packet(native):
    """Direct storage mutation stands in for any change between prepare's two complete reads."""
    rig = Rig()
    committed(rig, native, "live")
    resolver = rig.resolver()

    def resolve(frame, *, max_bytes):
        result = resolver.resolve_raw(frame, max_bytes=max_bytes)
        rig.store._documents[USER][("raw_capture_frame", "raw-frame-1")]["orientation"]["value"] = 1
        return result

    packets = []
    with pytest.raises(ValueError, match="withheld"):
        packets.append(rig.prepare([RECORD], resolve))
    assert not packets


def test_revocation_inside_an_open_read_is_rechecked_before_return(native):
    rig = Rig()
    committed(rig, native, "live")
    frame = json.loads(native["request-live.json"])["frames"][0]

    def revoking_guard():
        calls = []

        def guard(state):
            calls.append(state)
            rig.guard(state)
            rig.auth.revoke(TOKEN)  # The token disappears after the first successful check.
        return guard

    with pytest.raises(DomainError) as error:
        AuthorizedProcessContextReader(rig.store, USER, revoking_guard()).read_raw([RECORD])
    assert error.value.status == 401
    rig.auth = LocalTestAuthenticator({TOKEN: Principal(USER, SCOPES, NOW + timedelta(hours=1))})
    resolved = AuthorizedImageResolver(rig.store, USER, revoking_guard()).resolve_raw(frame, max_bytes=4 << 20)
    assert resolved == {"status": "revoked"}


ARTIFACT_ID = "so.20260930T050001Z-B0B0B001.00000001"


def corrupt(kind, identifier, path, value):
    def change(rows, native):
        row = rows[(kind, identifier)]
        for part in path[:-1]:
            row = row[part]
        row[path[-1]] = value
    return change


def swap_original_bytes(rows, native):
    other = json.loads(native["original-historical-unknown-clock.json"])["data_base64"]
    rows[("artifact", ARTIFACT_ID)]["data_base64"] = other


def corrupt_saved_ack(field):
    def change(rows, native):
        replay = rows[("capture_replay", key("POST", RAW, KEY))]
        ack = json.loads(replay["response_json"])
        receipt = ack["acknowledged"][0]
        if field == "sha256":
            receipt["artifacts"][0]["sha256"] = "0" * 64
        elif field == "received_at":
            receipt["received_at"] = "2026-09-30T05:00:01Z"
        else:
            ack["acknowledged"].append(deepcopy(receipt))
        replay["response_json"] = canonical(ack).decode()
    return change


# Direct storage mutations (outside the immutability guarantee). Observed at 81b7e18.
# case: (change, GET original status, resolver status, prepare image status or reader DomainError status)
CORRUPTIONS = {
    "original_bytes_swapped": (swap_original_bytes, 503, "unavailable", "unavailable"),
    "original_byte_length": (corrupt("artifact", ARTIFACT_ID, ["byte_length"], 290), 503, "unavailable", 503),
    "original_binding_sha256": (corrupt("artifact", ARTIFACT_ID, ["original_binding", "artifact", "sha256"], "0" * 64),
                                503, "unavailable", 503),
    "saved_ack_other_sha256": (corrupt_saved_ack("sha256"), 200, "available", "attached"),
    "saved_ack_other_received_at": (corrupt_saved_ack("received_at"), 200, "available", "attached"),
    "saved_ack_extra_receipt": (corrupt_saved_ack("extra"), 200, "available", "attached"),
}


@pytest.mark.parametrize("case", sorted(CORRUPTIONS))
def test_malformed_saved_ack_or_original_is_never_served(native, case):
    rig = Rig()
    committed(rig, native, "live")
    change, get_status, resolve_status, image = CORRUPTIONS[case]
    change(rig.store._documents[USER], native)
    before = rig.documents()
    refused(rig.post(native["request-live.json"]), 503, "unavailable", native["error-unavailable.json"])
    got = rig.get_original(ARTIFACT_ID)
    assert got.status_code == get_status
    if get_status == 200:
        assert got.json() == json.loads(native["original-live.json"])
    else:
        assert b"iVBOR" not in got.content
    frame = json.loads(native["request-live.json"])["frames"][0]
    assert rig.resolver().resolve_raw(frame, max_bytes=4 << 20)["status"] == resolve_status
    if type(image) is int:
        with pytest.raises(DomainError) as error:
            rig.prepare([RECORD])
        assert error.value.status == image
    else:
        packet_image = rig.prepare([RECORD])["items"][0]["image"]
        assert packet_image["status"] == image and (image == "attached" or "data" not in packet_image)
    assert rig.documents() == before  # Sanitized, not repaired.


def test_detached_frame_that_differs_from_the_retained_one_gets_no_bytes(native):
    rig = Rig()
    committed(rig, native, "live")
    changed = json.loads(native["request-live.json"])["frames"][0]
    changed["buffer_sequence"] = 42
    result = rig.resolver().resolve_raw(changed, max_bytes=4 << 20)
    assert result["status"] == "unavailable" and "data" not in result


# QA-FINDING-NATIVE-01 (Low, Backend). On a fingerprint-matching same-key replay the request is
# provably the committed one, so a schema-valid divergence of a retained row is server-side
# integrity loss. raw_capture_ingress/README.md classes corrupt committed evidence as 503
# unavailable, and the reader does so; the replay instead answers 409 record_conflict (native:
# final refusal) or 422 invalid_request (native: pending). Reachable only by bypassing storage
# immutability (PostgreSQL protect_document triggers); no bytes leak and nothing is repaired.
RETAINED_DIVERGENCE = {
    "frame_artifact_sha256": corrupt("raw_capture_frame", "raw-frame-1", ["artifact", "sha256"], "0" * 64),
    "artifact_ref_sha256": corrupt("capture_artifact_ref", ARTIFACT_ID, ["sha256"], "0" * 64),
    "slot_other_record": corrupt("capture_slot", key(DEVICE, STREAM, 101), ["record_id"], "other-record"),
    "record_reserialized": lambda rows, native: rows[("capture_record", RECORD)].update(
        canonical_json=json.dumps(json.loads(rows[("capture_record", RECORD)]["canonical_json"]))),
    "binding_source_version": corrupt("artifact", ARTIFACT_ID, ["original_binding", "source", "source_version"], 2),
}


@pytest.mark.parametrize("case", sorted(RETAINED_DIVERGENCE))
def test_retained_divergence_is_sanitized_by_the_reader_and_prepare(native, case):
    rig = Rig()
    committed(rig, native, "live")
    RETAINED_DIVERGENCE[case](rig.store._documents[USER], native)
    before = rig.documents()
    for operation in (lambda: rig.reader().read_raw([RECORD]), lambda: rig.prepare([RECORD])):
        with pytest.raises(DomainError) as error:
            operation()
        assert error.value.status == 503
    assert rig.documents() == before


@pytest.mark.xfail(strict=True,
                   reason="QA-FINDING-NATIVE-01: exact replay over a divergent retained row is 409/422, not 503")
@pytest.mark.parametrize("case", sorted(RETAINED_DIVERGENCE))
def test_exact_replay_over_a_divergent_retained_row_is_unavailable(native, case):
    rig = Rig()
    committed(rig, native, "live")
    RETAINED_DIVERGENCE[case](rig.store._documents[USER], native)
    before = rig.documents()
    response = rig.post(native["request-live.json"])
    assert rig.documents() == before and b"iVBOR" not in response.content
    refused(response, 503, "unavailable", native["error-unavailable.json"])


def test_backend_error_bytes_are_native_valid(native):
    """The unavailable fixture was written by the Swift generator and never passed through the
    uploader, so for it "native-valid" means the ported rule and the contract."""
    rig = Rig()
    auth = LocalTestAuthenticator({TOKEN: Principal(USER, SCOPES, NOW + timedelta(hours=1))})
    unconfigured = create_capture_app(None, auth, capabilities=CAPABILITIES, clock=lambda: NOW,
                                      enable_raw_ingress=True)
    refused(rig.post(native["request-live.json"], app=unconfigured), 503, "unavailable",
            native["error-unavailable.json"])
    refused(rig.post(b" " * (4 * 1024 * 1024 + 1)), 413, "payload_too_large")
