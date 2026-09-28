import copy
import errno
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from packages.contracts import validate
from packages.contracts import validation


EXAMPLES = json.loads((Path(__file__).parents[1] / "examples/core.json").read_text())
MAX_SAFE = 9007199254740991


@pytest.mark.parametrize("name,path", [
    ("Frame", ["media_position"]),
    ("BridgeRequest", ["selection", "media_position"]),
    ("EventBatch", ["events", 0, "media_position"]),
    ("NoteRevision", ["context_segments", 0, "media_position"]),
])
@pytest.mark.parametrize("literal", [str(MAX_SAFE + 1), str(-MAX_SAFE - 1), "1" + "0" * 400])
def test_unsafe_integer_literals_rejected_even_in_nested_number_fields(name, path, literal):
    payload = copy.deepcopy(EXAMPLES[name])
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = json.loads(literal)
    with pytest.raises(ValidationError, match="JavaScript safe integer"):
        validate(name, payload)


@pytest.mark.parametrize("value", [-MAX_SAFE, 0, MAX_SAFE, -0.5, 0.5, 1e308])
def test_safe_integer_limits_and_finite_floats_remain_valid(monkeypatch, value):
    # Isolate the shared numeric guard from domain-specific nonnegative limits.
    monkeypatch.setitem(validation.SCHEMA["$defs"], "NumericBoundaryProbe", {"type": "number"})
    validate("NumericBoundaryProbe", value)


@pytest.mark.parametrize("value", [False, True])
def test_booleans_keep_their_schema_type(value):
    validate("JobCancelResult", {"job_id": "job-1", "state": "completed", "cancel_requested": value})
    frame = copy.deepcopy(EXAMPLES["Frame"])
    frame["media_position"] = value
    with pytest.raises(ValidationError):
        validate("Frame", frame)


def test_deep_array_in_existing_scalar_field_is_a_validation_error():
    frame = copy.deepcopy(EXAMPLES["Frame"])
    nested = 1
    for _ in range(3000):
        nested = [nested]
    frame["media_position"] = nested
    outcome = "accepted"
    try:
        validate("Frame", frame)
    except ValidationError:
        outcome = "rejected"
    except RecursionError:
        outcome = "crashed"
    assert outcome == "rejected"


@pytest.mark.parametrize("zone", ["Z" * 256, "../UTC", "Not/ARealZone"])
def test_invalid_nested_timezone_is_a_validation_error(zone):
    batch = copy.deepcopy(EXAMPLES["EventBatch"])
    batch["events"][0]["source_timezone"] = zone
    with pytest.raises(ValidationError):
        validate("EventBatch", batch)


@pytest.mark.parametrize("zone", ["UTC", "America/Los_Angeles"])
def test_valid_timezones_remain_valid(zone):
    batch = copy.deepcopy(EXAMPLES["EventBatch"])
    batch["events"][0]["source_timezone"] = zone
    validate("EventBatch", batch)


def test_timezone_programming_errors_are_not_hidden(monkeypatch):
    def broken_zoneinfo(_value):
        raise RuntimeError("unexpected implementation failure")

    monkeypatch.setattr(validation, "ZoneInfo", broken_zoneinfo)
    with pytest.raises(RuntimeError, match="unexpected implementation failure"):
        validate("EventBatch", copy.deepcopy(EXAMPLES["EventBatch"]))


@pytest.mark.parametrize("code", [errno.EACCES, errno.EIO])
def test_timezone_environment_errors_are_not_reported_as_invalid_input(monkeypatch, code):
    fault = OSError(code, "tzdata unavailable")

    def broken_zoneinfo(_value):
        raise fault

    monkeypatch.setattr(validation, "ZoneInfo", broken_zoneinfo)
    with pytest.raises(OSError) as raised:
        validate("EventBatch", copy.deepcopy(EXAMPLES["EventBatch"]))
    assert raised.value is fault


@pytest.mark.parametrize("zone,code", [("America", errno.EISDIR), ("Z" * 256, errno.ENAMETOOLONG)])
def test_invalid_timezone_path_errors_remain_validation_errors(monkeypatch, zone, code):
    def invalid_zone(value):
        assert value == zone
        raise OSError(code, "invalid timezone key")

    monkeypatch.setattr(validation, "ZoneInfo", invalid_zone)
    batch = copy.deepcopy(EXAMPLES["EventBatch"])
    batch["events"][0]["source_timezone"] = zone
    with pytest.raises(ValidationError):
        validate("EventBatch", batch)
