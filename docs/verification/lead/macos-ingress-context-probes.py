#!/usr/bin/env python3
"""Compose supplied DesktopIngressTests files through trusted HTTP/archive/Learning.

Usage (existing locked base + backend + dev + backend-test environment):
  .venv/bin/python docs/verification/lead/macos-ingress-context-probes.py INGRESS_FIXTURE_DIR

Run after the owner's validate_desktop_ingress.py and corrected Swift source are
integrated. --validator permits that exact checker in a separate source export.
This also runs its checks before composition; it never generates fixture data or
rewrites historical requests. --simulated labels preparation with simulated files.

Only supplied request/PNG files are consumed. Consent, identity registration and
an expiring token are explicit synthetic local authority. HTTP is in-process;
storage is MemoryStore. No listener, database, native launch or provider is used.
Fixture generator text alone does not attest native provenance: retain the hosted
source/run and artifact hashes separately. No product/device acceptance is implied.
"""

import argparse
import base64
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True

from packages.contracts import desktop_capture_ingress as wire
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.storage import MemoryStore
from services.api.tests.test_capture_app import NOW, ORIGINALS, ingress_success, original_path, request
from services.api.tests.test_capture_runtime import TOKEN, stopped
from services.api.tests.test_desktop_capture_runtime import accepted, build, register_display
from services.api.tests.test_desktop_ingress_http import DESKTOP_ROUTE
from services.learning.process_context import prepare_observation_window


def fixture_hashes(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.rglob("*")) if p.is_file()}


def run(directory, validator_path, *, simulated=False):
    if simulated:
        print("SIMULATED PREPARATION ONLY: the checker below reads simulated files; no Swift ran.")
    before_files = fixture_hashes(directory)
    spec = importlib.util.spec_from_file_location("native_ingress_checker", validator_path)
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    assert checker.main(directory) == 0, "Owner fixture/contract validation failed"
    manifest = json.loads((directory / "manifest.json").read_bytes())
    assert manifest["generator"] == "DesktopCaptureTests.testPreparesRequestsAndWritesFixtures"
    source = manifest["display_source"]
    identity = {name: source[name] for name in ("device_id", "session_id", "stream_id")}
    cases = [case for case in manifest["cases"] if case["type"] == "request"]
    assert len(cases) == 3, "Expected the framed, frameless and mixed native fixture plans"
    c = SimpleNamespace(user=manifest["user_id"], store=MemoryStore(), instant=[NOW],
        registration={"contract_version": "0.2.1", **identity, "authorization_generation": 1,
                      "membership_revision": 1, "continuity": {"kind": "initial"}},
        source={name: source[name] for name in ("user_id", "source_id", "source_version")},
        display={"contract_version": "0.2.4", "source_id": source["source_id"],
                 "stream_id": source["stream_id"], "project_id": source["project_id"],
                 "source_timezone": source["source_timezone"]},
        display_path="/v2/process/display-sources/" + source["source_id"],
        stream_path="/v2/process/streams/" + source["stream_id"])
    assert c.store._documents == {}
    runtime = build(c)  # fresh explicit synthetic consent; it does not register/capture a device
    descriptor = register_display(c, runtime)
    # Source creation time belongs to the server registration, not to the native
    # manifest's proposed snapshot. All other binding/incarnation facts must agree.
    assert {k: v for k, v in descriptor.items() if k != "created_at"} == {
        k: v for k, v in source.items() if k != "created_at"}

    _, native_frames, _ = checker.native_session(directory / manifest["native_session"])
    frames, images, records, requests = {}, {}, [], []
    for case in cases:
        body = (directory / case["body"]).read_bytes()
        payload = wire.decode_request("DesktopFrameBatchRequest", body)
        assert payload["batch"]["delivery_mode"] == "historical"
        assert all(payload["batch"][name] == value for name, value in identity.items())
        for frame in payload["frames"]:
            old = frames.setdefault(frame["frame_id"], frame)
            assert old == frame, "The same native frame changed between fixture plans"
            if frame["frame_id"] in images:
                continue
            native = native_frames[frame["callback_sequence"]]
            data = (directory / manifest["native_session"] / native["file"]).read_bytes()
            assert checker.png_problem(data, frame) is None
            binding = manifest["bindings"][frame["artifact"]["artifact_id"]]
            upload = {**binding, "data_base64": base64.b64encode(data).decode("ascii")}
            receipt = ingress_success(request(runtime.app, "PUT", ORIGINALS + binding["artifact"]["artifact_id"],
                                               body=upload, token=TOKEN), "OriginalArtifactReceipt")
            assert receipt == {**binding, "status": "bytes_committed"}
            reread = ingress_success(request(runtime.app, "GET", original_path(c, binding["artifact"]["artifact_id"]),
                                              token=TOKEN), "OriginalArtifactUpload")
            assert reread == upload
            images[frame["frame_id"]] = data
        response = request(runtime.app, "POST", DESKTOP_ROUTE, content=body,
                           headers=[("Content-Type", "application/json")],
                           request_key=case["idempotency_key"], token=TOKEN)
        ack = accepted(c, response, payload)
        assert all(item["disposition"] == "accepted" for item in ack["acknowledged"])
        records.extend(payload["batch"]["records"])
        requests.append((case, body, payload, ack))

    assert {frame["callback_sequence"] for frame in frames.values()} == {1, 3, 6}
    by_callback = {frame["callback_sequence"]: frame for frame in frames.values()}
    third, sixth = by_callback[3]["profile"], by_callback[6]["profile"]
    assert third["host_clock"]["display_time_ticks_decimal"] == "18446744073709551615"
    assert third["sample"]["presentation_time_seconds"] == -2.5
    assert third["sample"]["dirty_rects"] == [] and third["sample"]["content_rect"] is None
    assert sixth["sample"]["dirty_rects"] is None and sixth["sample"]["presentation_time_seconds"] is None
    assert sixth["host_clock"]["display_time_ticks_decimal"] is None
    assert all(record["clock"] is None and record["observed_at"] is None for record in records)
    assert all(all(value is None for value in frame["timing"].values()) for frame in frames.values())
    ids = [record["record_id"] for record in records]
    assert len(ids) == len(set(ids)) == 15

    def consumers(current):
        def guard(state):
            principal = current.app.state.authenticator.authenticate(TOKEN, c.instant[0])
            if principal != current.principal or state.get("generation") != principal.authorization_generation:
                raise DomainError(403, "forbidden")
        return (AuthorizedProcessContextReader(c.store, c.user, guard).read_desktop,
                AuthorizedImageResolver(c.store, c.user, guard).resolve_desktop)

    read, resolve = consumers(runtime)
    snapshot = read(ids)
    assert snapshot["batch"]["records"] == records
    assert snapshot["sources"] == [descriptor]
    assert {frame["frame_id"]: frame for frame in snapshot["frames"]} == frames
    packet = prepare_observation_window(ids, read, resolve, user_id=c.user)
    assert packet["provider_receipt"] == "not_attested"
    assert packet["presentation_permission"] == "not_granted"
    window = packet["observation_window"]
    assert window["capture_chronology"] == window["capture_intervals"] == "unknown"
    assert all(pair["clock_readings"]["status"] == "unknown" for pair in window["comparisons"])
    assert [item["record"] for item in packet["items"]] == records
    for item in packet["items"]:
        assert item["source"] == descriptor
        fid = item["record"]["frame_id"]
        if fid is None:
            assert item["frame"] is None and item["image"] == {"status": "missing_frame"}
            assert item["record"]["artifacts"] == []
        else:
            assert item["frame"] == frames[fid]
            assert item["image"]["status"] == "attached" and item["image"]["data"] == images[fid]

    before = deepcopy(c.store._documents)
    reopened = build(c, fresh_consent=False)
    for case, body, payload, ack in requests:
        response = request(reopened.app, "POST", DESKTOP_ROUTE, content=body,
                           headers=[("Content-Type", "application/json")],
                           request_key=case["idempotency_key"], token=TOKEN)
        assert accepted(c, response, payload) == ack
    assert prepare_observation_window(ids, *consumers(reopened), user_id=c.user) == packet
    assert c.store._documents == before

    # Native host timestamps and plan sequences do not attest a control replay
    # boundary. Stop with unknown boundary; retained selection remains readable.
    assert stopped(c, reopened)["pre_stop_sequence"] is None
    terminal = build(c, fresh_consent=False)
    assert terminal.current_state["state"] == "stopped"
    assert prepare_observation_window(ids, *consumers(terminal), user_id=c.user) == packet
    before = deepcopy(c.store._documents)
    case, body, payload, _ = requests[-1]
    historical = request(terminal.app, "POST", DESKTOP_ROUTE, content=body,
                         headers=[("Content-Type", "application/json")],
                         request_key=case["idempotency_key"], token=TOKEN)
    live = deepcopy(payload)  # negative control only; never rewrite the supplied file
    live["batch"]["delivery_mode"] = "live"
    denied = request(terminal.app, "POST", DESKTOP_ROUTE, body=live,
                     request_key="negative-live-after-unknown-stop", token=TOKEN)
    assert historical.status_code == denied.status_code == 409
    assert historical.json()["error"] == denied.json()["error"] == "capture_stopped"
    assert c.store._documents == before and TOKEN not in repr(before)
    assert fixture_hashes(directory) == before_files, "Supplied originals changed"
    print(json.dumps({"status": "PASS", "requests": len(requests), "records": len(records),
        "frames": len(frames), "frameless_records": sum(r["frame_id"] is None for r in records),
        "fixture_origin": "simulated_preparation_only" if simulated else "supplied_files_provenance_not_attested",
        "request_sha256": {case["body"]: hashlib.sha256(body).hexdigest() for case, body, _, _ in requests},
        "provider_receipt": packet["provider_receipt"], "native_database_provider": "not_run",
        "authority": "synthetic trusted registration; unknown Stop boundary; no replay grant inferred"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture_directory", type=Path)
    parser.add_argument("--validator", type=Path, default=ROOT / "apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py")
    parser.add_argument("--simulated", action="store_true", help="label simulated preparation, never native execution")
    args = parser.parse_args()
    run(args.fixture_directory.resolve(), args.validator.resolve(), simulated=args.simulated)
