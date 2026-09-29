"""Synthetic MemoryStore integration probe; no production edits or database calls."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path

from packages.contracts import validate
from services.api.domain import Archive
from services.api.storage import MemoryStore
from services.learning.archive import ArchiveSnapshot
from services.learning.context import assemble_context
from services.learning.retrieval import RetrievalIndex

USER = "fixture-user"
ROOT = Path(__file__).parent
EXAMPLES = ROOT / "packages/contracts/examples"
results = []

for case in ("valid_later_correction", "null_frame_no_gap", "equal_capture_correction", "backdated_capture_correction"):
    core = json.loads((EXAMPLES / "core.json").read_text())
    archive = Archive(MemoryStore(), clock=lambda: datetime(2026, 9, 29, tzinfo=timezone.utc))
    archive.set_authorization(USER)
    archive.import_fixture(USER, core["SourceSnapshot"], core["Frame"], (EXAMPLES / "frame.svg").read_bytes())
    original = deepcopy(core["Observation"])
    original["captured_at"] = "2026-09-28T12:00:00Z"
    events = [original]
    if case == "null_frame_no_gap":
        original.update(frame_id=None, media_position=None, gap_flags=[])
    else:
        time = {"valid_later_correction": "2026-09-28T12:00:01Z",
                "equal_capture_correction": original["captured_at"],
                "backdated_capture_correction": "2026-09-28T11:59:59Z"}[case]
        events.append({**deepcopy(original), "event_id": "correction-review", "device_sequence": 2,
                       "correction_of": original["event_id"], "captured_at": time})
    for event in events:
        validate("Observation", event)
    ack = archive.events(USER, {"contract_version": "0.1.0", "events": events})
    assert all(row["status"] == "accepted" for row in ack["acknowledged"])
    supplied = archive.export_learning_snapshot(USER, [core["SourceSnapshot"]["source_id"]])
    exported_by_id = {row["event_id"]: row for row in supplied["observations"]}
    for raw in events:
        exported = exported_by_id[raw["event_id"]]
        assert {k: v for k, v in exported.items() if k != "received_at"} == {
            k: v for k, v in raw.items() if k != "received_at"}
    result = {"case": case, "shared_schema": "accepted", "backend_ingest": "accepted",
              "backend_export": "accepted_exact_observations", "observation_count": len(events)}
    try:
        snapshot = ArchiveSnapshot(**supplied, user_id=USER)
        packet = assemble_context(snapshot, RetrievalIndex(snapshot), {"text": "basis", "mode": "history"}, user_id=USER)
        result.update(learning_snapshot="accepted", context_item_count=len(packet["items"]))
    except ValueError as error:
        result.update(learning_snapshot="rejected", error=str(error))
    results.append(result)

assert results[0]["learning_snapshot"] == "accepted"
assert results[1]["error"] == "Absent frame must be explicit"
assert all(result["error"] == "Invalid correction ownership/order" for result in results[2:])
print(json.dumps(results, indent=2))
