"""Carry a retained focus into a follow-up without changing the live/1 wire.

The caller retains the original frame/provenance in its existing source store.
This helper neither stores pixels nor proves their retention in a provider thread.
"""
import json

from jsonschema import ValidationError

from . import validate


def carry_focus_into_followup(followup, origin):
    """Return a validated Turn; never move old coordinates onto a newer frame.

    `origin` is the retained, validated Provenance of the focused request. A
    same-frame follow-up keeps that rectangle only when the complete image/context
    binding is unchanged. A newer-frame follow-up instead carries a historical
    metadata entry that explicitly says the old pixels are not attached here.
    Current disclosure, user words and audio attribution always come from followup.
    Bounds fail closed; this function never truncates or deletes original history.
    Validation is not source access, PNG decoding or submission authority.
    """
    request = validate("Turn", followup)
    previous = validate("Provenance", origin)
    if request["trigger"] not in {"text_followup", "voice_followup"}:
        raise ValidationError("Retained focus is only used for an explicit follow-up")
    if previous["focus"] is None:
        raise ValidationError("The original request has no retained focus")
    for key in ("session_id", "epoch"):
        if request[key] != previous[key]:
            raise ValidationError("Retained focus belongs to a different session")
    current, old = request["context"], previous["context"]
    if current["capture_session_id"] != old["capture_session_id"]:
        raise ValidationError("Retained focus belongs to a different capture")
    if current["frame_seq"] < old["frame_seq"]:
        raise ValidationError("Retained focus cannot come from a future frame")
    if current["frame_seq"] == old["frame_seq"]:
        image = {key: value for key, value in request["image"].items() if key != "png_base64"}
        if current != old or image != previous["image"]:
            raise ValidationError("A retained frame identity may not change")
        if request["focus"] not in (None, previous["focus"]):
            raise ValidationError("A new focus must not be replaced with an old focus")
        request["focus"] = previous["focus"]
    else:
        if request["focus"] is not None:
            raise ValidationError("A new focus must not be replaced with an old focus")
        reference = {
            "kind": "historical_focus_reference",
            "request_id": previous["request_id"],
            "image": previous["image"],
            "context": old,
            "focus": previous["focus"],
            "pixels_attached_to_this_request": False,
            "provider_retention": "unverified",
            "limitation": "This is an earlier focus, not a rectangle on the current image. "
                          "Its pixels are unavailable in this request. Do not infer their content "
                          "from these coordinates or claim a provider thread retained them.",
        }
        row = {
            "kind": "observation", "text": json.dumps(reference, ensure_ascii=False, sort_keys=True),
            "at": old["frame_captured_at"], "frame_seq": old["frame_seq"],
            "request_id": previous["request_id"], "audio_source": None,
            "presentation": "not_presented",
        }
        if row not in request["history"]:
            request["history"].append(row)
    return validate("Turn", request)
