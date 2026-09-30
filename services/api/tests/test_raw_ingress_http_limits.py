"""The ordered HTTP envelope has its own ceiling, distinct from internal maps."""

from copy import deepcopy
import json

import pytest

from packages.contracts import raw_capture_ingress as wire
from services.api.errors import DomainError
from services.api.ingress_app import RAW_ROUTE, create_ingress_app
from services.api.tests.test_control import documents, resolve_stop_fact
from services.api.tests.test_control_http import request
from services.api.tests.test_raw_frame_ingress import (
    additional, raw_setup, registered, setup, uploaded,
)


def test_full_ordered_http_metadata_limit_is_not_the_internal_frame_map_limit(raw_setup):
    c = raw_setup
    pairs = [additional(c, record_id=f"http-limit-record-{i}", sequence=i,
                        frame_id=f"http-limit-frame-{i}") for i in range(1, 51)]
    batch = {**deepcopy(c.batch), "records": [record for record, _ in pairs]}
    frames = [frame for _, frame in pairs]
    payload = {"contract_version": "0.2.6", "batch": batch, "frames": frames}
    for record in batch["records"]:
        record["evidence"]["after"] = {"kind": "text", "text": ""}
    remaining = wire.MAX_METADATA_BODY_BYTES - len(wire.canonical_request("RawFrameBatchRequest", payload))
    width, extra = divmod(remaining, len(batch["records"]))
    assert width + 1 <= 100000  # Existing source-text limit, not a test-only relaxation.
    for index, record in enumerate(batch["records"]):
        record["evidence"]["after"]["text"] = "x" * (width + (index < extra))
    encoded = wire.canonical_request("RawFrameBatchRequest", payload)
    assert len(encoded) == wire.MAX_METADATA_BODY_BYTES
    by_id = {frame["frame_id"]: frame for frame in frames}
    map_bytes = json.dumps({"batch": batch, "frames": by_id}, sort_keys=True,
                           ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    assert len(map_bytes) > wire.MAX_METADATA_BODY_BYTES
    before = documents(c)
    with pytest.raises(DomainError) as error:
        c.registry.ingest_raw_frames(c.user, batch, frames, "internal-map-limit")
    assert (error.value.status, error.value.code) == (413, "payload_too_large")
    assert documents(c) == before

    app = create_ingress_app(c.store, c.auth,
        capabilities=frozenset({wire.CAPABILITY, "process.capture.v0.2"}),
        stop_fact_resolver=resolve_stop_fact, clock=lambda: c.instant[0], enable_raw_ingress=True)
    response = request(app, "POST", RAW_ROUTE, request_key="ordered-envelope-limit",
                       content=encoded, headers=[("Content-Type", "application/json")])
    assert response.status_code == 200, response.text
    verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                for ref in (c.ref, c.ink_ref)}
    wire.validate_ack(batch, response.json(), user_id=c.user, verified_artifacts=verified)
    assert len(response.json()["acknowledged"]) == 50
    with c.store.transaction(c.user) as tx:
        assert len(tx.scan("raw_capture_frame")) == 50
        for record in batch["records"]:
            saved = json.loads(tx.get("capture_record", record["record_id"])["canonical_json"])
            assert saved["record"] == record
