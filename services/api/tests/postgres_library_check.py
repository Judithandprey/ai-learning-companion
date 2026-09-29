"""Focused real PostgreSQL discovery check; no prior restart campaign is rerun.

Requires private LC_TEST_DATABASE_URL for lc_p0_test with existing migrations.
No other database, existing preview identity, service lifecycle or export is used.
"""

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import sys
from uuid import uuid4

from services.api.domain import Archive
from services.api.preview import DocumentPreview
from services.api.preview_local import _bootstrap
from services.api.storage import PostgresStore
from services.api.tests.postgres_check import cleanup, dedicated_test_dsn, verify_test_database
from services.api.tests.postgres_http_check import _originals
from services.api.tests.postgres_preview_check import _preview_process, _request


def run(dsn, actor):
    config = {"mode": "local", "actor": actor, "device_id": "library-device", "session_id": "library-session",
              "token": secrets.token_urlsafe(48)}
    store = PostgresStore(dsn)
    _bootstrap(store, actor, config["device_id"], config["session_id"])
    examples = json.loads((Path(__file__).resolve().parents[3]
                           / "packages/contracts/document_preview/examples.json").read_text())
    preview = DocumentPreview(store, lambda state: None, lambda: datetime(2026, 9, 29, tzinfo=timezone.utc),
                              device_id=config["device_id"], session_id=config["session_id"])
    for name in ("a", "b", "z"):
        imported, saved = deepcopy(examples["DocumentImport"]), deepcopy(examples["DocumentSave"])
        imported.update(source_id="source-" + name, device_id=config["device_id"],
                        session_id=config["session_id"], filename=name + ".txt")
        saved.update(note_id=name, title="Saved " + name)
        for row in (saved["frame"], saved["bridge_request"]["selection"]):
            row.update(user_id=actor, source_id=imported["source_id"], device_id=config["device_id"],
                       session_id=config["session_id"], frame_id="frame-" + name)
        saved["frame"]["artifact_id"] = "artifact-" + name
        saved["bridge_request"]["selection"]["id"] = "selection-" + name
        saved["bridge_request"]["request_id"] = "bridge-" + name
        saved["request"].update(user_id=actor, selection_id="selection-" + name, request_id="request-" + name)
        preview.import_document(actor, imported, "import-" + name)
        preview.save(actor, saved, "save-" + name)
    before = _originals(store, actor)

    # A new API process discovers DB originals without any browser-supplied IDs.
    # The existing supervisor stops/waits only this run's ephemeral loopback child.
    with _preview_process(dsn, config) as (client, child):
        token = config["token"]
        first = _request(client, "GET", "/preview/v1/saves?limit=1", token, 200, contract="SavedLibrary")
        assert [item["note_id"] for item in first["items"]] == ["z"]
        whole = _request(client, "GET", "/preview/v1/saves", token, 200, contract="SavedLibrary")
        assert [item["note_id"] for item in whole["items"]] == ["z", "b", "a"]
        assert whole["next_cursor"] is None
        for item in whole["items"]:
            opened = _request(client, "GET", "/preview/v1/saves/" + item["note_id"], token, 200, contract="SavedPreview")
            assert item["title"] == opened["note"]["title"] and item["filename"] == opened["filename"]
            assert item["source_id"] == opened["source"]["source_id"]
        assert _originals(store, actor) == before
        Archive(store).delete_source(actor, "source-z")
        following = _request(client, "GET", "/preview/v1/saves?limit=2&cursor=" + first["next_cursor"],
                             token, 200, contract="SavedLibrary")
        assert [item["note_id"] for item in following["items"]] == ["b", "a"]
        assert following["next_cursor"] is None
        with store.transaction(actor) as tx:
            source = tx.get("source", "source-b")
            tx.put("source", "source-b", {**source, "revoked": True})
        visible = _request(client, "GET", "/preview/v1/saves", token, 200, contract="SavedLibrary")
        assert [item["note_id"] for item in visible["items"]] == ["a"]
        Archive(store).set_authorization(actor, False)
        _request(client, "GET", "/preview/v1/saves", token, 403)
    assert child.poll() is not None


def main():
    configured = os.environ.get("LC_TEST_DATABASE_URL")
    if not configured:
        print("BLOCKED: dedicated test DSN absent; PostgreSQL library unverified", file=sys.stderr)
        return 2
    try:
        dsn = dedicated_test_dsn(configured)
        version = verify_test_database(dsn)
    except Exception as exc:
        print("BLOCKED: dedicated lc_p0_test check failed (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    actor = "backend-library-" + uuid4().hex
    passed = False
    try:
        run(dsn, actor)
        passed = True
    except Exception as exc:
        print("FAILED: PostgreSQL library check (" + type(exc).__name__ + ")", file=sys.stderr)
    finally:
        try:
            cleanup(dsn, [actor])
        except Exception:
            passed = False
            print("FAILED: unique library actor cleanup incomplete", file=sys.stderr)
    if passed:
        print("PASS: fresh API discovers and reopens server-owned originals without local note IDs; originals unchanged")
        print("PASS: pagination survives deleted anchor; current source/account revocation is enforced")
        print("PASS: owned API process exited and unique actor cleanup completed; PostgreSQL " + version)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
