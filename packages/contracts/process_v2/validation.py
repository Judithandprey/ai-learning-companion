"""Local process invariants, not authentication, storage or presentation permission."""

import copy
from dataclasses import dataclass
import json
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from ..validation import FORMATS, SCHEMA as LEGACY_SCHEMA, _check_safe_integers, validate as validate_legacy

CONTRACT_VERSION = "0.2.0"
SCHEMA = json.loads(Path(__file__).with_name("schema.json").read_text())
for _name in SCHEMA.pop("x-legacy-definitions"):
    if _name in SCHEMA["$defs"]:
        raise ValueError(f"Duplicate legacy definition: {_name}")
    SCHEMA["$defs"][_name] = copy.deepcopy(LEGACY_SCHEMA["$defs"][_name])


def _unique(values, what):
    if len(values) != len(set(values)):
        raise ValidationError(f"Duplicate {what}")


def _record(record):
    if record["record_id"] in record["causal_parents"]:
        raise ValidationError("A record cannot cause itself")
    artifacts = {item["artifact_id"] for item in record["artifacts"]}
    _unique([item["artifact_id"] for item in record["artifacts"]], "artifact identity")
    evidence = record["evidence"]
    if evidence["kind"] == "operation":
        for state in (evidence["before"], evidence["after"]):
            if state["kind"] == "artifact" and state["artifact_id"] not in artifacts:
                raise ValidationError("State artifact must have an explicit immutable reference")
        if evidence["actor_basis"] == "unknown" and evidence["observed_actor"] != "unknown":
            raise ValidationError("Unknown actor basis cannot assert an actor")
        if evidence["operation"] == "site_feedback" and evidence["observed_actor"] not in {"website", "unknown"}:
            raise ValidationError("Website feedback cannot be attributed to the learner")
        if record["method"] == "visual" and evidence["operation"] not in {"visible_change", "site_feedback"}:
            raise ValidationError("Pixels alone cannot assert an internal operation")
        if record["method"] == "visual" and evidence["actor_basis"] == "trusted_input_event":
            raise ValidationError("Visual-only evidence cannot claim an input event")
    else:
        start, end = evidence["from_clock_ms"], evidence["through_clock_ms"]
        if (start is None) != (end is None) or (start is not None and start > end):
            raise ValidationError("Coverage clock interval must be ordered or wholly unknown")
        if start is not None and (record["clock"] is None or end > record["clock"]["elapsed_ms"]):
            raise ValidationError("Coverage interval needs its containing capture clock")
        previous = 0
        for gap in evidence["missing_sequences"]:
            if not previous < gap["first"] <= gap["last"] < record["sequence"]:
                raise ValidationError("Missing sequence intervals must be ordered, disjoint and earlier")
            previous = gap["last"]
        if evidence["missing_sequences"] and (evidence["coverage"] == "observed_samples" or "missing_events" not in evidence["limitations"]):
            raise ValidationError("Missing sequences must be reported as incomplete coverage")


def validate(name, payload):
    """Validate this explicit version, without interpreting facts as permissions."""
    if name not in SCHEMA["$defs"]:
        raise ValueError(f"Unknown process definition: {name}")
    try:
        json.dumps(payload, allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Payload must be finite UTF-8 JSON") from exc
    _check_safe_integers(payload)
    Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{name}"}, format_checker=FORMATS).validate(payload)
    if name == "ProcessRecord":
        _record(payload)
    elif name == "ProcessBatch":
        records = payload["records"]
        _unique([r["record_id"] for r in records], "record identity")
        _unique([r["sequence"] for r in records], "stream sequence")
        local = {r["record_id"]: r for r in records}
        declared_artifacts = {}
        for record in records:
            _record(record)
            for parent_id in record["causal_parents"]:
                if parent_id in local and local[parent_id]["sequence"] >= record["sequence"]:
                    raise ValidationError("Same-stream causal parents must precede the record")
            for artifact in record["artifacts"]:
                old = declared_artifacts.setdefault(artifact["artifact_id"], artifact)
                if old != artifact:
                    raise ValidationError("Conflicting immutable artifact reference")
        # A missing slot may arrive in a later batch, but cannot simultaneously
        # be declared missing and present in this one.
        sequences = {r["sequence"] for r in records}
        for record in records:
            evidence = record["evidence"]
            if evidence["kind"] == "coverage":
                for gap in evidence["missing_sequences"]:
                    if any(gap["first"] <= seq <= gap["last"] for seq in sequences):
                        raise ValidationError("A batch cannot contain its declared missing sequence")
    elif name == "ProcessBatchAck":
        _unique([r["record_id"] for r in payload["acknowledged"]], "acknowledged record")
        _unique([r["sequence"] for r in payload["acknowledged"]], "acknowledged sequence")
        for receipt in payload["acknowledged"]:
            _unique([a["artifact_id"] for a in receipt["artifacts"]], "artifact receipt")
    elif name == "ProcessError":
        if payload["retryable"] and payload["error"] not in {"unavailable", "dependency_missing"}:
            raise ValidationError("This error cannot authorize automatic retry")


@dataclass(frozen=True)
class CaptureAuthority:
    """Trusted service snapshot, NEVER deserialized from a request/page.

    The service must authenticate, resolve owned/undeleted references and hold
    lifecycle fences through commit. This helper only compares that snapshot.
    attempts entries are (problem_id, attempt_id, relation_revision).
    """

    user_id: str
    device_id: str
    session_id: str
    stream_id: str
    scopes: frozenset[str]
    capabilities: frozenset[str]
    source_versions: frozenset[tuple[str, int]]
    attempts: frozenset[tuple[str, str, int]]
    transmission_allowed: bool
    live_capture_allowed: bool
    historical_through_sequence: int | None


def validate_submission(batch, authority):
    """Check shape and caller-supplied trusted scope; does not verify a token/DB."""
    validate("ProcessBatch", batch)
    if "process:capture" not in authority.scopes or "process.capture.v0.2" not in authority.capabilities:
        raise ValidationError("Capture scope and explicit process capability are required")
    for key in ("device_id", "session_id", "stream_id"):
        if batch[key] != getattr(authority, key):
            raise ValidationError(f"Authenticated stream {key} mismatch")
    if not authority.transmission_allowed:
        raise ValidationError("Transmission authorization withdrawn, including historical replay")
    if batch["delivery_mode"] == "live" and not authority.live_capture_allowed:
        raise ValidationError("Live capture has stopped")
    for record in batch["records"]:
        source = record["source"]
        if source["user_id"] != authority.user_id or (source["source_id"], source["source_version"]) not in authority.source_versions:
            raise ValidationError("Source is absent, deleted or outside authenticated scope")
        scope = record["scope"]
        if scope["kind"] == "attempt" and (scope["problem_id"], scope["attempt_id"], scope["relation_revision"]) not in authority.attempts:
            raise ValidationError("Attempt relation is absent or stale")
        if not authority.live_capture_allowed:
            limit = authority.historical_through_sequence
            if limit is None or record["sequence"] > limit:
                raise ValidationError("Historical record exceeds the authorized pre-stop boundary")


def canonical_record(batch, record_id):
    """Equality bytes for immutable replay; never retain these after scoped deletion.

    Transport batch ID, live/history delivery and later server receive time do
    not alter captured originals. HTTP-key replay still compares the whole body.
    """
    validate("ProcessBatch", batch)
    record = next((r for r in batch["records"] if r["record_id"] == record_id), None)
    if record is None:
        raise ValueError("Record not in batch")
    payload = {key: batch[key] for key in ("device_id", "session_id", "stream_id")}
    payload["record"] = record
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def validate_record_frame(batch, record_id, frame):
    """Match an explicitly bound legacy frame, not prove its freshness or capture."""
    validate("ProcessBatch", batch)
    validate_legacy("Frame", frame)
    record = next((r for r in batch["records"] if r["record_id"] == record_id), None)
    if record is None:
        raise ValueError("Record not in batch")
    if record["frame_id"] != frame["frame_id"]:
        raise ValidationError("Record must explicitly name this legacy frame")
    for key in ("user_id", "source_id", "source_version"):
        if record["source"][key] != frame[key]:
            raise ValidationError(f"Frame source {key} mismatch")
    for key in ("device_id", "session_id"):
        if batch[key] != frame[key]:
            raise ValidationError(f"Frame {key} mismatch")
    if record["media_position"] != frame["media_position"]:
        raise ValidationError("Frame media position mismatch; cross-source alignment is not supported here")
    artifact = next((a for a in record["artifacts"] if a["artifact_id"] == frame["artifact_id"]), None)
    if artifact is None or artifact["sha256"] != frame["content_hash"]:
        raise ValidationError("Frame must match its immutable artifact reference")


def validate_ack(batch, ack, *, user_id, verified_artifacts=frozenset()):
    """Check exact receipt correspondence, using independently verified blob facts.

    verified_artifacts contains (id, sha256, byte_length, media_type). Neither
    this check nor a supplied tuple proves a durable transaction occurred.
    """
    validate("ProcessBatch", batch)
    validate("ProcessBatchAck", ack)
    for key in ("batch_id", "device_id", "session_id", "stream_id"):
        if batch[key] != ack[key]:
            raise ValidationError(f"ACK {key} mismatch")
    if ack["user_id"] != user_id or any(r["source"]["user_id"] != user_id for r in batch["records"]):
        raise ValidationError("ACK must match authenticated owner")
    originals = {r["record_id"]: r for r in batch["records"]}
    if set(originals) != {r["record_id"] for r in ack["acknowledged"]}:
        raise ValidationError("ACK must exhaust the exact submitted records")
    for receipt in ack["acknowledged"]:
        record = originals[receipt["record_id"]]
        if receipt["sequence"] != record["sequence"]:
            raise ValidationError("ACK sequence does not match its record")
        expected = {a["artifact_id"]: a for a in record["artifacts"]}
        if set(expected) != {a["artifact_id"] for a in receipt["artifacts"]}:
            raise ValidationError("ACK must list every referenced artifact, including pending bytes")
        for artifact in receipt["artifacts"]:
            ref = {k: v for k, v in artifact.items() if k != "status"}
            if ref != expected[artifact["artifact_id"]]:
                raise ValidationError("ACK changed an immutable artifact reference")
            identity = tuple(ref[k] for k in ("artifact_id", "sha256", "byte_length", "media_type"))
            if artifact["status"] == "verified" and identity not in verified_artifacts:
                raise ValidationError("Artifact bytes have not been independently verified")
