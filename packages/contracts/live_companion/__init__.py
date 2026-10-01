"""Private additive desktop companion IPC. Validation is not capture/send authority."""
from copy import deepcopy
import json
import math
from jsonschema import Draft202012Validator, ValidationError
from ..validation import FORMATS, MAX_SAFE_INTEGER

VERSION = "lc-subscription-live/1"

def obj(properties):
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}

def nullable(shape):
    return {"anyOf": [shape, {"type": "null"}]}

def integer(low=0, high=MAX_SAFE_INTEGER):
    return {"type": "integer", "minimum": low, "maximum": high}

def text(limit=128):
    return {"type": "string", "minLength": 1, "maxLength": limit}

ID = {**text(), "pattern": r"^(?=.*\S)[^\u0000-\u001f\u007f-\u009f]+$"}
UTC = {"type": "string", "format": "date-time", "pattern": "Z$"}
HASH = {"type": "string", "pattern": "^[0-9a-f]{64}$", "minLength": 64, "maxLength": 64}
NUMBER = {"type": "number", "minimum": -MAX_SAFE_INTEGER, "maximum": MAX_SAFE_INTEGER}
POSITIVE = {"type": "number", "exclusiveMinimum": 0, "maximum": MAX_SAFE_INTEGER}
RECT = obj({"x": NUMBER, "y": NUMBER, "width": POSITIVE, "height": POSITIVE})
PIXEL_RECT = obj({"x": integer(), "y": integer(), "width": integer(1), "height": integer(1)})
IMAGE = obj({"png_base64": {**text(12 * 1024 * 1024), "pattern": "^[A-Za-z0-9+/]*={0,2}$"},
             "sha256": HASH, "width": integer(1, 16384), "height": integer(1, 16384)})
CONTEXT = obj({
    "capture_session_id": ID, "frame_seq": integer(), "frame_captured_at": nullable(UTC),
    "frame_width": integer(1, 16384), "frame_height": integer(1, 16384),
    "display": obj({"id": ID, "bounds": RECT, "scale_factor": POSITIVE}),
    "region_dip": RECT, "region_px": PIXEL_RECT,
    "ink_revision": nullable(integer()), "ink_sha256": nullable(HASH),
    "source_url": nullable(text(4096)), "source_version": nullable(integer(1)),
    "media_position": nullable({"type": "number", "minimum": 0, "maximum": MAX_SAFE_INTEGER}),
})
FOCUS = nullable(obj({"frame_seq": integer(), "region_dip": RECT, "region_px": PIXEL_RECT}))
AUDIO_SOURCE = nullable(obj({
    "source_id": ID, "track": {"enum": ["microphone", "system_playback", "mixed", "unknown"]},
    "speaker": {"enum": ["user", "teacher", "other", "unknown"]},
    "attribution": {"enum": ["confirmed", "inferred", "unknown"]},
    "started_at": nullable(UTC), "ended_at": nullable(UTC),
}))
HISTORY = obj({"kind": {"enum": ["user", "assistant", "observation", "source_transcript"]},
               "text": text(4000), "at": nullable(UTC), "frame_seq": nullable(integer()),
               "request_id": nullable(ID), "audio_source": AUDIO_SOURCE,
               "presentation": {"enum": ["shown", "spoken", "unconfirmed", "not_presented", None]}})
GAP = obj({"from_frame_seq": integer(), "to_frame_seq": integer(),
           "reason": {"enum": ["capture_gap", "coalesced", "backpressure", "budget", "permission_lost", "disconnected", "not_observed"]}})
TURN = obj({
    "request_id": ID, "session_id": ID, "epoch": integer(1), "permission_revision": integer(1),
    "trigger": {"enum": ["observation", "focus", "text_followup", "voice_followup"]},
    "allowed_assistance": {"enum": ["none", "hint", "explain", "full_solution"]},
    "presentation": {"enum": ["none", "silent", "spoken"]},
    "user_text": nullable(text(4000)), "audio_source": AUDIO_SOURCE,
    "image": IMAGE, "context": CONTEXT, "focus": FOCUS,
    "history": {"type": "array", "maxItems": 24, "items": HISTORY},
    "gaps": {"type": "array", "maxItems": 64, "items": GAP},
})
POLICY = obj({"max_submissions": integer(1, 100), "max_session_ms": integer(1000, 3600000),
              "min_observation_interval_ms": integer(500, 60000)})
START = obj({"session_id": ID, "capture_session_id": ID, "epoch": integer(1), "model": ID,
             "policy": POLICY, "permissions": obj({"screen": {"const": True}, "microphone": {"type": "boolean"},
                                                   "system_audio": {"type": "boolean"}})})
METHODS = {
    "connection/read": obj({}), "connection/login/start": obj({}),
    "connection/login/cancel": obj({"login_id": ID}),
    "companion/start": START,
    "companion/turn": TURN,
    "companion/interrupt": obj({"session_id": ID, "epoch": integer(1), "request_id": nullable(ID)}),
    "companion/stop": obj({"session_id": ID, "epoch": integer(1)}),
}
CREDITS = nullable(obj({"has_credits": {"type": "boolean"}, "unlimited": {"type": "boolean"},
                       "balance": nullable({"type": "string", "maxLength": 128})}))
WINDOW = nullable(obj({"used_percent": integer(), "window_duration_mins": nullable(integer()),
                      "resets_at": nullable(UTC)}))
REACHED = nullable({"enum": ["rate_limit_reached", "workspace_owner_credits_depleted", "workspace_member_credits_depleted",
                            "workspace_owner_usage_limit_reached", "workspace_member_usage_limit_reached"]})
QUOTA = obj({"available": {"type": "boolean"}, "ordinary_usage_allowed": nullable({"type": "boolean"}),
             "windows": {"type": "array", "maxItems": 100, "items": obj({"limit_id": nullable(ID),
                 "normal_model_slug": nullable(ID), "primary": WINDOW, "secondary": WINDOW,
                 "credits": CREDITS, "rate_limit_reached_type": REACHED,
                 "spend_control_reached": nullable({"type": "boolean"}),
                 "individual_limit": nullable(obj({"limit": {"type": "string", "maxLength": 128},
                     "used": {"type": "string", "maxLength": 128},
                     "remaining_percent": integer(-2147483648, 2147483647), "resets_at": UTC}))})}})
ERROR_CODES = ("invalid_request", "busy", "cancelled", "session_stopped", "unavailable", "unauthenticated",
               "unsupported_model", "allowance_exhausted", "rate_limited", "allowance_unknown", "workspace_limit",
               "ordinary_usage_not_allowed", "context_limit", "overloaded",
               "interrupt_unconfirmed", "failed", "budget_reached", "stale_context")
ERROR = obj({"code": {"enum": list(ERROR_CODES)}, "submission": {"enum": ["not_submitted", "submitted", "unknown"]}})
PROVENANCE = deepcopy(TURN)
PROVENANCE["properties"]["image"] = obj({k: v for k, v in IMAGE["properties"].items() if k != "png_base64"})
RESULT = obj({"request_id": ID, "text": text(32000), "provenance": PROVENANCE,
              "model": ID, "auth_mode": {"const": "chatgpt"}, "latency_ms": {**NUMBER, "minimum": 0},
              "thread_id": ID, "turn_id": ID,
              "kind": {"enum": ["observation", "generated_assistance"]}})
CURRENT_STATE = obj({"active": {"type": "boolean"}, "cancelled": {"type": "boolean"},
                     "provenance": PROVENANCE})
CONNECTION = obj({
    "auth": obj({"state": {"enum": ["signed_in", "signed_out", "unknown"]},
                 "mode": {"enum": ["chatgpt", None]}, "plan": nullable(text())}),
    "quota": QUOTA,
    "models": {"type": "array", "maxItems": 256, "items": obj({
        "id": ID, "label": text(), "image_input": {"type": "boolean"}, "default": {"type": "boolean"}})},
})
SCHEMA = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://learning-companion.invalid/private/live/1",
          "$defs": {"Turn": TURN, "Start": START, "Quota": QUOTA, "Error": ERROR,
                    "Provenance": PROVENANCE, "Result": RESULT, "CurrentState": CURRENT_STATE,
                    "Connection": CONNECTION}}


def _json(value):
    try:
        json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ValidationError("Live IPC must be finite UTF-8 JSON") from exc


def validate(kind, value):
    """Reject invalid declared facts; Learning checks PNG bytes, client checks current permission."""
    _json(value)
    shape = SCHEMA["$defs"].get(kind)
    if shape is None:
        raise ValidationError("Unknown live IPC kind")
    Draft202012Validator(shape, format_checker=FORMATS).validate(value)
    if kind in {"Turn", "Provenance"}:
        c, image = value["context"], value["image"]
        w, h = c["frame_width"], c["frame_height"]
        if image["width"] != w or image["height"] != h or w * h > 16_000_000:
            raise ValidationError("A live turn requires the full declared display image")
        bounds = c["display"]["bounds"]
        sx, sy = w / bounds["width"], h / bounds["height"]
        if not math.isfinite(sx) or not math.isfinite(sy) or sx == 0 or sy == 0:
            raise ValidationError("Invalid frame/display ratio")
        if c["region_px"] != dict(x=0, y=0, width=w, height=h) or c["region_dip"] != dict(x=0, y=0, width=bounds["width"], height=bounds["height"]):
            raise ValidationError("Selection cannot replace whole-screen context")
        if c["ink_sha256"] is not None and c["ink_revision"] is None:
            raise ValidationError("Editable ink hash requires a revision")
        focus = value["focus"]
        if value["trigger"] == "focus" and focus is None:
            raise ValidationError("Focus trigger requires its matching rectangle")
        if focus is not None:
            r = focus["region_dip"]
            if focus["frame_seq"] != c["frame_seq"] or r["x"] < 0 or r["y"] < 0 or r["x"] + r["width"] > bounds["width"] or r["y"] + r["height"] > bounds["height"]:
                raise ValidationError("Focus must belong to the current full frame")
            x, y = math.floor(r["x"] * sx), math.floor(r["y"] * sy)
            expected = dict(x=x, y=y, width=min(w, math.ceil((r["x"]+r["width"])*sx))-x,
                            height=min(h, math.ceil((r["y"]+r["height"])*sy))-y)
            if focus["region_px"] != expected:
                raise ValidationError("Focus DIP/pixel coordinates disagree")
        if value["trigger"] in {"text_followup", "voice_followup"} and not (value["user_text"] or "").strip():
            raise ValidationError("A follow-up needs actual user words")
        if value["trigger"] == "voice_followup" and value["audio_source"] is None:
            raise ValidationError("Voice text requires its available audio attribution")
        if value["trigger"] == "focus" and value["user_text"] is None and value["allowed_assistance"] not in {"none", "hint"}:
            raise ValidationError("A circle alone does not expand disclosure beyond a small hint")
        if value["trigger"] == "observation" and (value["presentation"] != "none" or value["allowed_assistance"] != "none"):
            raise ValidationError("Observation alone does not authorize an answer")
        if value["allowed_assistance"] == "none" and value["presentation"] != "none":
            raise ValidationError("No assistance may not be presented")
        if sum(len(row["text"]) for row in value["history"]) > 32000:
            raise ValidationError("Recent context exceeds prompt budget; retain originals separately")
        for row in value["history"]:
            if row["kind"] == "source_transcript" and row["audio_source"] is None:
                raise ValidationError("Source transcript requires available track/speaker attribution")
            if row["frame_seq"] is not None and row["frame_seq"] > c["frame_seq"]:
                raise ValidationError("Future observation cannot be previous context")
        for gap in value["gaps"]:
            if gap["from_frame_seq"] > gap["to_frame_seq"] or gap["to_frame_seq"] > c["frame_seq"]:
                raise ValidationError("Capture gap lies outside observed timeline")
    elif kind == "Quota" and not value["available"]:
        if value["ordinary_usage_allowed"] is not None or value["windows"]:
            raise ValidationError("Unavailable quota cannot invent known allowance")
    elif kind == "Result":
        p = validate("Provenance", value["provenance"])
        expected_kind = "observation" if p["trigger"] == "observation" else "generated_assistance"
        if value["request_id"] != p["request_id"] or value["kind"] != expected_kind:
            raise ValidationError("Response does not match its originating request")
    elif kind == "Connection":
        validate("Quota", value["quota"])
    elif kind == "CurrentState":
        validate("Provenance", value["provenance"])
    return deepcopy(value)


def validate_request(value):
    _json(value)
    shape = obj({"version": {"const": VERSION}, "id": ID, "method": {"enum": list(METHODS)}, "params": {"type": "object"}})
    Draft202012Validator(shape).validate(value)
    method = value["method"]
    if method == "companion/turn":
        validate("Turn", value["params"])
    elif method == "companion/start":
        validate("Start", value["params"])
    else:
        Draft202012Validator(METHODS[method]).validate(value["params"])
    return deepcopy(value)
