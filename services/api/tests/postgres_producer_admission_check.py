"""One focused PostgreSQL/ASGI desktop-producer admission scenario.

Run: python -m services.api.tests.postgres_producer_admission_check
LC_TEST_DATABASE_URL is supplied privately to the existing desktop runner's
dedicated lc_p0_test preflight and exact-actor cleanup. No listener, process
restart, migration, native capture, provider or previous campaign is run.
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import secrets
from unittest.mock import patch

from packages.contracts import capture_ingress, desktop_capture_ingress, process_control
from services.api.storage import PostgresStore
from services.api.tests import postgres_desktop_runtime_check as desktop
from services.api.tests.postgres_ingress_http_check import _documents
from services.api.tests.test_capture_app import COLLECTION, ORIGINALS, original_body, original_path
from services.api.tests.test_control_http import request
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE


def spoof_batches(c):
    """Each valid request includes a fresh honest member before the forged one."""
    for label, surface, method in (("structured", "web_dom", "structured"),
                                   ("mixed", "external_app", "mixed"),
                                   ("ink", "owned_canvas", "structured")):
        frame = deepcopy(c.desktop_frame)
        frame["frame_id"] = "ungranted-frame-" + label
        frame["callback_sequence"] += 1
        honest = deepcopy(c.batch["records"][0])
        honest.update(record_id="uncommitted-honest-" + label, sequence=3,
                      frame_id=frame["frame_id"], causal_parents=[c.batch["records"][0]["record_id"]])
        forged = deepcopy(honest)
        forged.update(record_id="ungranted-" + label, sequence=4,
                      causal_parents=[honest["record_id"]], surface=surface, method=method)
        forged["evidence"] = {
            "kind": "operation", "operation": "ink_edit" if label == "ink" else "reselect",
            "observed_actor": "user", "actor_basis": "trusted_input_event", "reason_quote": None,
            "before": {"kind": "unknown", "reason": "not_observed"},
            "after": ({"kind": "artifact", "artifact_id": c.ink_ref["artifact_id"]}
                      if label == "ink" else {"kind": "choices", "selected_option_ids": ["C"]}),
        }
        envelope = {"contract_version": "0.2.8", "batch": {**c.batch, "records": [honest, forged]},
                    "frames": [frame]}
        desktop_capture_ingress.validate("DesktopFrameBatchRequest", envelope)
        yield label, envelope


def run_admission_check(dsn, actor):
    c = desktop.scenario(actor)
    assert _documents(dsn, actor) == []
    config = {"actor": actor, "registration": c.registration, "fresh_consent": True,
              "token": secrets.token_hex(32),
              "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
    runtime = desktop.runtime_for_check(dsn, config)
    calls = []

    def call(label, method, path, *, body=None, key=None, status=200, schema=None, family=capture_ingress):
        response = request(runtime.app, method, path, body=body,
                           request_key=key, token=config["token"])
        calls.append({"check": label, "status": response.status_code})
        assert response.status_code == status, label + ": unexpected HTTP status"
        assert response.headers["cache-control"] == "no-store"
        value = response.json()
        if schema:
            family.validate(schema, value)
        if status == 403:
            assert value == {"contract_version": "0.2.8", "error": "forbidden", "retryable": False}
        return value

    def submit(label, envelope, key, *, status=200):
        desktop_capture_ingress.validate("DesktopFrameBatchRequest", envelope)
        ack = call(label, "POST", DESKTOP_ROUTE, body=envelope, key=key, status=status,
                   schema="DesktopIngressError" if status == 403 else None, family=desktop_capture_ingress)
        if status == 200:
            references = [ref for row in envelope["batch"]["records"] for ref in row["artifacts"]]
            verified = {tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
                        for ref in references}
            desktop_capture_ingress.validate_ack(envelope["batch"], ack, user_id=actor, verified_artifacts=verified)
        return ack

    assert call("register", "POST", COLLECTION, body=c.registration, key="admission-register",
                schema="StreamState", family=process_control)["state"] == "live"
    call("display", "PUT", c.display_path, body=c.display, schema="DisplaySourceSnapshot")
    submit("first-gap", c.first_gap, "admission-gap")
    for ink in (False, True):
        body = original_body(c, ink=ink)
        receipt = call("put-ink" if ink else "put-png", "PUT", ORIGINALS + body["artifact"]["artifact_id"],
                       body=body, schema="OriginalArtifactReceipt")
        assert receipt["status"] == "bytes_committed"
    honest_ack = submit("honest-frame", c.envelope, "admission-honest")
    before = _documents(dsn, actor)
    for label, envelope in spoof_batches(c):
        submit("deny-" + label, envelope, "admission-deny-" + label, status=403)
        assert _documents(dsn, actor) == before, "denied batch mutated retained documents"
    assert submit("exact-honest-retry", c.envelope, "admission-honest") == honest_ack
    assert _documents(dsn, actor) == before

    store, stream_id = PostgresStore(dsn), c.registration["stream_id"]
    with store.transaction(actor) as tx:
        profiles = {kind: tx.get(kind, stream_id) for kind in ("control_start", "control_stream")}
        assert all(row["producer_profile"] == "desktop_pixels" for row in profiles.values())
    for failure in ("lost-grant-profile", "corrupt-stream-profile", "lost-both-profiles"):
        try:
            with store.transaction(actor) as tx:
                for kind, original in profiles.items():
                    changed = deepcopy(original)
                    if failure == "lost-both-profiles" or (failure == "lost-grant-profile" and kind == "control_start"):
                        changed.pop("producer_profile")
                    if failure == "corrupt-stream-profile" and kind == "control_stream":
                        changed["producer_profile"] = "unrecognized-authority"
                    tx.put(kind, stream_id, changed)
            damaged = _documents(dsn, actor)
            submit(failure, c.envelope, "admission-honest", status=403)
            assert _documents(dsn, actor) == damaged, "replay repaired or changed damaged authority"
        finally:
            # Restore only this test actor's synthetic profile fault, never content.
            with store.transaction(actor) as tx:
                for kind, original in profiles.items():
                    tx.put(kind, stream_id, original)
        assert _documents(dsn, actor) == before
    assert submit("honest-after-profile-restoration", c.envelope, "admission-honest") == honest_ack
    for ink in (False, True):
        body = original_body(c, ink=ink)
        assert call("read-ink" if ink else "read-png", "GET", original_path(c, body["artifact"]["artifact_id"]),
                    schema="OriginalArtifactUpload") == body
    assert _documents(dsn, actor) == before
    return {"scenario": "QA-DESKTOP-RT-01 producer admission", "actor": actor, "http": calls,
            "transport": "in-process HTTP over actual PostgresStore; no listener",
            "input": "synthetic scoped consent, native metadata, PNG and separate editable ink",
            "groups": ["honest gap/originals/frame accepted", "three schema-valid mixed batches rejected atomically",
                       "exact honest retry unchanged", "three profile loss/corruption cases reject cached success",
                       "retained history and original bytes unchanged"]}


def main():
    # Reuse all existing target/schema/pristine-actor/signal/cleanup safeguards.
    # Replace only its test scenario; the previous restart campaign is not run.
    with patch.object(desktop, "run_desktop_checks", run_admission_check):
        return desktop.main(desktop_runtime=True)


if __name__ == "__main__":
    raise SystemExit(main())
