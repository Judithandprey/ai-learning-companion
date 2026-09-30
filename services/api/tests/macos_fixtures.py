"""Audited Swift synthetic PNGs, synthetic archive ownership and separate ink.

The native descriptor/image facts are retained; no display capture, native ink
upload, device permissions or provider receipt is established by these fixtures.
"""

import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest

from services.api.tests.test_capture import record
from services.api.tests.test_desktop_frame_ingress import pixel_record
from services.api.tests.test_desktop_ingress_http import gap
from services.api.tests.test_ingress_http import ORIGINALS, registered, request, setup, success, uploaded
from services.api.tests.test_raw_frame_ingress import denied, raw_setup

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = ROOT / "packages/contracts/macos_frame/examples/macos-retained.json"
PROVENANCE = json.loads((EXAMPLES.parent / "provenance.json").read_text())
NATIVE_FIXTURE = ROOT / PROVENANCE["fixture_path"]


def images(frame):
    return [frame["raw"]] + ([frame["composition"]["image"]]
                             if frame["composition"]["kind"] == "composed" else [])


def references(frame):
    return list({image["artifact"]["artifact_id"]: deepcopy(image["artifact"])
                 for image in images(frame)}.values())


def upload_original(c, reference, data, *, kind="screen_image"):
    body = {"contract_version": "0.2.2", "source": c.source, "kind": kind,
            "artifact": reference, "data_base64": base64.b64encode(data).decode("ascii")}
    return success(request(c.app, "PUT", ORIGINALS + reference["artifact_id"], body=body),
                   "OriginalArtifactReceipt")


def retained_frame(c, index=2, *, frame_id=None):
    """Bind an exact audited descriptor to the fixture's synthetic archive."""
    frame = json.loads(EXAMPLES.read_text())[index]
    frame.update(frame_id=frame_id or c.raw_frame["frame_id"], source=deepcopy(c.source),
                 **{name: c.batch[name] for name in ("device_id", "session_id", "stream_id")})
    return frame


def upload_frame(c, frame):
    """Read and upload every declared audited native image, without PNG rewriting."""
    uploaded_ids = set()
    for image in images(frame):
        ref = image["artifact"]
        data = (NATIVE_FIXTURE / image["native_file"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == ref["sha256"]
        assert len(data) == ref["byte_length"]
        if ref["artifact_id"] not in uploaded_ids:
            upload_original(c, ref, data)
            uploaded_ids.add(ref["artifact_id"])


@pytest.fixture
def macos_setup(raw_setup):
    c = raw_setup
    c.registry.bind_pixel_producer(c.user, c.registration, producer_id="screen")
    c.macos_frame = retained_frame(c)
    c.ref = deepcopy(c.macos_frame["raw"]["artifact"])
    c.data = (NATIVE_FIXTURE / c.macos_frame["raw"]["native_file"]).read_bytes()
    composed = c.macos_frame["composition"]["image"]
    c.composed_ref = deepcopy(composed["artifact"])
    c.composed_data = (NATIVE_FIXTURE / composed["native_file"]).read_bytes()
    upload_frame(c, c.macos_frame)
    c.structured_batch = deepcopy(c.batch)
    c.structured_batch["records"][0].update(clock=None, observed_at=None, media_position=None,
                                            artifacts=deepcopy([c.ref, c.composed_ref, c.ink_ref]))
    c.batch["records"][0] = pixel_record(c.structured_batch["records"][0])
    c.raw_frame.update(artifact=deepcopy(c.ref), raw_width=c.macos_frame["raw"]["width"],
                       raw_height=c.macos_frame["raw"]["height"])
    c.raw_frame["timing"].update(callback_clock=None, observed_at_estimate=None, estimate_basis=None)
    c.frame.update(artifact_id=c.ref["artifact_id"], content_hash=c.ref["sha256"],
                   width=c.macos_frame["raw"]["width"], height=c.macos_frame["raw"]["height"])
    c.envelope = {"contract_version": "0.2.12", "batch": c.batch, "frames": [c.macos_frame]}
    c.macos_envelope = c.envelope
    return c


def ingest(c, batch=None, frames=None, key="macos-frames-1"):
    return c.registry.ingest_macos_frames(c.user, c.batch if batch is None else batch,
                                         [c.macos_frame] if frames is None else frames, key)


def ingest_request(c, envelope=None, key="macos-http-1"):
    return c.registry.ingest_macos_frame_request(c.user, c.envelope if envelope is None else envelope, key)


def additional(c, *, record_id="macos-record-2", sequence=2, frame_id="macos-frame-2", parents=()):
    item = record(c.batch, record_id, sequence, frame_id=frame_id, causal_parents=list(parents))
    frame = deepcopy(c.macos_frame)
    frame["frame_id"] = frame_id
    return item, frame


@pytest.fixture
def macoscaptured(macos_setup):
    macos_setup.ack = ingest(macos_setup)
    return macos_setup
