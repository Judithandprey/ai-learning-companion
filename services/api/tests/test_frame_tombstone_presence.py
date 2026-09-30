"""Present empty frame markers must fence replay like ordinary deletion markers."""

from copy import deepcopy

import pytest

from services.api.errors import DomainError
from services.api.tests.test_control import USER, documents
from services.api.tests.test_desktop_frame_ingress import (
    additional, desktop_setup, desktop_ingest, registered, setup, uploaded, raw_setup,
)
from services.api.tests.test_desktop_ingress_http import desktop_http, submit as desktop_http_ingest
from services.api.tests.test_raw_frame_ingress import ingest as raw_ingest
from services.api.tests.test_raw_frame_readers import resolver
from services.api.tests.test_raw_ingress_http import raw_http, ingest as raw_http_ingest


@pytest.mark.parametrize("family", ["raw", "desktop", "raw_http", "desktop_http"])
@pytest.mark.parametrize("new_key", [False, True])
@pytest.mark.parametrize("empty", [False, True])
def test_present_frame_tombstone_fences_every_retry(request, family, new_key, empty):
    c = request.getfixturevalue("raw_http" if family == "raw_http" else
                                "desktop_http" if family == "desktop_http" else "desktop_setup")
    call = {"raw": raw_ingest, "desktop": desktop_ingest,
            "raw_http": raw_http_ingest, "desktop_http": desktop_http_ingest}[family]
    result = call(c, request_key="initial")
    if family.endswith("http"):
        assert result.status_code == 200
    else:
        assert result["acknowledged"]
    frame = c.raw_frame if family.startswith("raw") else c.desktop_frame
    c.store._documents[USER][("frame_tombstone", frame["frame_id"])] = {} if empty else {"frame_id": frame["frame_id"]}
    before = documents(c)
    key = "new-key" if new_key else "initial"
    if family.endswith("http"):
        result = call(c, request_key=key)
        assert result.status_code == 404, result.text
        assert result.json()["error"] == "not_found"
    else:
        with pytest.raises(DomainError) as error:
            call(c, request_key=key)
        assert (error.value.status, error.value.code) == (404, "not_found")
    assert documents(c) == before
    resolve = resolver(c).resolve_raw if family.startswith("raw") else resolver(c).resolve_desktop
    assert resolve(frame, max_bytes=len(c.data)) == {"status": "missing"}


@pytest.mark.parametrize("family", ["raw", "desktop"])
def test_empty_frame_tombstone_fences_retained_ancestor(desktop_setup, family):
    c = desktop_setup
    call = raw_ingest if family == "raw" else desktop_ingest
    call(c)
    c.store._documents[USER][("frame_tombstone", c.raw_frame["frame_id"])] = {}
    child, frame = additional(c, family=family, parents=["process-1"])
    batch = {**deepcopy(c.batch), "records": [child]}
    before = documents(c)
    with pytest.raises(DomainError) as error:
        call(c, batch, [frame], "child-with-erased-frame")
    assert (error.value.status, error.value.code) == (404, "not_found")
    assert documents(c) == before
