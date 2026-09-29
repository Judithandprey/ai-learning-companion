"""Pure stream-control checks; callers supply trusted, transaction-current facts.

No token verification, persistence, capture, resume, deletion or HTTP implementation.
The stream ID is the incarnation; stopped IDs can never become live again.
"""

from copy import deepcopy
from dataclasses import dataclass
import json
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from ..validation import FORMATS, SCHEMA as LEGACY_SCHEMA, _check_safe_integers
from ..process_v2 import CaptureAuthority

CONTRACT_VERSION = "0.2.1"
CAPABILITY = "process.control.v0.2.1"
SCHEMA = json.loads(Path(__file__).with_name("schema.json").read_text())
for _name in SCHEMA.pop("x-legacy-definitions"):
    if _name in SCHEMA["$defs"]:
        raise ValueError("Duplicate legacy primitive")
    SCHEMA["$defs"][_name] = deepcopy(LEGACY_SCHEMA["$defs"][_name])


def validate(name, payload):
    if name not in SCHEMA["$defs"]:
        raise ValueError("Unknown process control definition")
    _check_safe_integers(payload)
    try:
        json.dumps(payload, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Payload must be finite UTF-8 JSON") from exc
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"}, format_checker=FORMATS).validate(payload)
    if name in {"StreamRegistration", "StreamState"}:
        continuity = payload["continuity"]
        if continuity["kind"] == "restart" and continuity["previous_stream_id"] == payload["stream_id"]:
            raise ValidationError("Restart requires a fresh stream identity")
    if name == "StreamState" and payload["state"] != "stopped" and payload["pre_stop_sequence"] is not None:
        raise ValidationError("Only stopped streams may have a historical boundary")
    if name == "ControlError" and payload["retryable"] and payload["error"] != "unavailable":
        raise ValidationError("Only unavailability permits automatic control retry")


@dataclass(frozen=True)
class ControlAuthority:
    """Trusted current service state, never filled from a page/request body.

    Device/session membership is an explicit relation, not two existing IDs.
    capture_start_authorized is a fresh scoped start decision, not prior capture.
    """

    user_id: str
    device_id: str
    session_id: str
    authorization_generation: int
    membership_revision: int
    membership_active: bool
    capture_start_authorized: bool
    scopes: frozenset[str]
    capabilities: frozenset[str]
    start_stream_id: str | None = None


def _bound(payload, authority, *, control):
    if not isinstance(authority, ControlAuthority):
        raise ValidationError("Trusted control authority required")
    for field in ("user_id", "device_id", "session_id"):
        validate("Identifier", getattr(authority, field))
        if field in payload and payload[field] != getattr(authority, field):
            raise ValidationError("Owned stream binding mismatch")
    for field in ("authorization_generation", "membership_revision"):
        value = getattr(authority, field)
        if type(value) is not int:
            raise ValidationError("Trusted revisions must be integers")
        validate("Revision", value)
        if field in payload and payload[field] != value:
            raise ValidationError("Stream authorization or membership is stale")
    if authority.membership_active is not True:
        raise ValidationError("Current device/session membership required")
    required = ("process:control", CAPABILITY) if control else ("process:capture", "process.capture.v0.2")
    if required[0] not in authority.scopes or required[1] not in authority.capabilities:
        raise ValidationError("Required scope and explicit capability missing")


def register_stream(request, authority, *, predecessor=None):
    """Construct a candidate state; service must enforce unused identity and commit.

    Restart must identify an already closed owned predecessor on this device/session.
    It declares a gap unknown, not continuity or new permission by itself.
    """
    validate("StreamRegistration", request)
    _bound(request, authority, control=True)
    if authority.capture_start_authorized is not True:
        raise ValidationError("A fresh authorized capture start is required")
    if authority.start_stream_id != request["stream_id"]:
        raise ValidationError("Start authorization must bind this exact new stream")
    continuity = request["continuity"]
    if continuity["kind"] == "restart":
        validate("StreamState", predecessor)
        if (predecessor["stream_id"] != continuity["previous_stream_id"]
                or any(predecessor[f] != getattr(authority, f) for f in ("user_id", "device_id", "session_id"))
                or predecessor["state"] == "live"):
            raise ValidationError("Restart requires the closed owned predecessor")
    elif predecessor is not None:
        raise ValidationError("An initial stream cannot conceal a predecessor")
    result = {**deepcopy(request), "user_id": authority.user_id,
              "authorization_generation": authority.authorization_generation,
              "membership_revision": authority.membership_revision,
              "revision": 1, "state": "live", "pre_stop_sequence": None}
    validate("StreamState", result)
    return result


def transition_stream(state, command, authority, *, committed_through_sequence, verified_pre_stop_sequence=None):
    """Compute a candidate restrictive transition, not commit or prove a device stop.

    Known boundaries require an independently resolved producer stop fact. Never
    copy the command boundary into verified_pre_stop_sequence to manufacture proof.
    Unknown stop blocks historical sync until an authorized seal_stop supplies it.
    """
    validate("StreamState", state)
    validate("StreamCommand", command)
    _bound(state, authority, control=True)
    if type(committed_through_sequence) is not int or committed_through_sequence < 0:
        raise ValidationError("Committed sequence floor must be a nonnegative integer")
    validate("SequenceBoundary", committed_through_sequence)
    if any(command[f] != state[f] for f in ("device_id", "session_id", "stream_id")):
        raise ValidationError("Command stream binding mismatch")
    if command["expected_revision"] != state["revision"]:
        raise ValidationError("Stale stream revision")
    action = command["action"]
    kind = action["kind"]
    if state["state"] == "withdrawn":
        raise ValidationError("Withdrawn stream cannot transition; replay is service-owned")
    result = deepcopy(state)
    if kind == "withdraw":
        result.update(state="withdrawn", pre_stop_sequence=None)
    else:
        if kind == "stop" and state["state"] != "live":
            raise ValidationError("Stop requires live state; use explicit seal for unknown boundary")
        if kind == "seal_stop" and (state["state"] != "stopped" or state["pre_stop_sequence"] is not None):
            raise ValidationError("Seal only an unknown stopped boundary once")
        boundary = action["pre_stop_sequence"]
        if boundary is not None and (type(verified_pre_stop_sequence) is not int
                                     or boundary != verified_pre_stop_sequence):
            raise ValidationError("Historical boundary needs independently verified pre-stop evidence")
        if boundary is not None and boundary < committed_through_sequence:
            raise ValidationError("Pre-stop boundary contradicts committed same-stream evidence")
        result.update(state="stopped", pre_stop_sequence=boundary)
    result["revision"] += 1
    validate("StreamState", result)
    return result


def capture_authority(state, authority, *, source_versions, attempts=frozenset()):
    """Map freshly resolved controls to the unchanged capture 0.2.0 helper.

    Caller resolves source ownership/access and attempts in the same transaction.
    No cached state or request field is authorization; fences must hold to commit.
    """
    validate("StreamState", state)
    _bound(state, authority, control=False)
    return CaptureAuthority(
        user_id=state["user_id"], device_id=state["device_id"], session_id=state["session_id"],
        stream_id=state["stream_id"], scopes=authority.scopes, capabilities=authority.capabilities,
        source_versions=frozenset(source_versions), attempts=frozenset(attempts),
        transmission_allowed=state["state"] != "withdrawn", live_capture_allowed=state["state"] == "live",
        historical_through_sequence=state["pre_stop_sequence"],
    )
