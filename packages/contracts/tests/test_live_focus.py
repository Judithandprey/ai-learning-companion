"""Synthetic follow-up compatibility, not actual provider image retention."""
from copy import deepcopy
import base64
import hashlib
import json
from pathlib import Path
import struct
import zlib

import pytest
from jsonschema import ValidationError

from packages.contracts.live_companion.focus import carry_focus_into_followup
from services.learning.live_session import (
    authorize_live_presentation, bind_live_session_response, prepare_live_session_context,
)

EXAMPLE = Path(__file__).parents[1] / "live_companion/examples/focus.json"


def inputs(*, next_frame=False, voice=False):
    focused = json.loads(EXAMPLE.read_text())["params"]
    origin = prepare_live_session_context(focused)["provenance"]
    followup = deepcopy(focused)
    followup.update(request_id="followup", focus=None,
                    trigger="voice_followup" if voice else "text_followup",
                    user_text="I mean the sign in the earlier circle, not the answer.",
                    allowed_assistance="hint", presentation="spoken" if voice else "silent")
    if voice:
        followup["audio_source"] = dict(source_id="authorized-talk", track="microphone",
            speaker="unknown", attribution="unknown", started_at=None, ended_at=None)
    if next_frame:
        followup["context"]["frame_seq"] += 1
        followup["context"]["media_position"] = 11
        # An actual different valid PNG, rather than only relabeling metadata.
        def chunk(kind, data):
            return (struct.pack(">I", len(data)) + kind + data
                    + struct.pack(">I", zlib.crc32(kind + data)))
        width, height = followup["image"]["width"], followup["image"]["height"]
        data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress((b"\x00" + b"\x10\x80\xc0" * width) * height))
                + chunk(b"IEND", b""))
        followup["image"].update(png_base64=base64.b64encode(data).decode(), sha256=hashlib.sha256(data).hexdigest())
    return origin, followup


@pytest.mark.parametrize("voice", [False, True])
def test_same_frame_keeps_focus_actual_words_and_current_intent(voice):
    origin, request = inputs(voice=voice)
    before = deepcopy((origin, request))
    carried = carry_focus_into_followup(request, origin)
    assert carried["focus"] == origin["focus"]
    assert carried["user_text"] == request["user_text"]
    assert carried["audio_source"] == request["audio_source"]
    assert carried["history"] == request["history"]
    prepared = prepare_live_session_context(carried)
    assert prepared["provenance"]["focus"] == origin["focus"]
    assert (origin, request) == before


@pytest.mark.parametrize("voice", [False, True])
def test_later_video_frame_keeps_historical_focus_without_relabelling_pixels(voice):
    origin, request = inputs(next_frame=True, voice=voice)
    request["context"]["display"]["bounds"]["x"] = -1920
    carried = carry_focus_into_followup(request, origin)
    assert carried["focus"] is None
    assert carried["image"] == request["image"]
    assert carried["image"]["sha256"] != origin["image"]["sha256"]
    assert carried["context"] == request["context"]
    row = carried["history"][-1]
    reference = json.loads(row["text"])
    assert row["frame_seq"] == origin["context"]["frame_seq"]
    assert reference["context"] == origin["context"]
    assert reference["focus"] == origin["focus"]
    assert reference["image"] == origin["image"]
    assert reference["pixels_attached_to_this_request"] is False
    assert reference["provider_retention"] == "unverified"
    assert "png_base64" not in reference["image"]
    assert carry_focus_into_followup(carried, origin) == carried
    prepared = prepare_live_session_context(carried)
    assert "historical_focus_reference" in prepared["text"]
    assert "pixels are unavailable" in prepared["text"]
    assert prepared["provenance"]["context"]["frame_seq"] == request["context"]["frame_seq"]


@pytest.mark.parametrize("mutation", ["image", "source", "ink", "display", "future", "session", "capture", "epoch"])
def test_conflicting_frame_identity_and_foreign_origins_are_rejected(mutation):
    origin, request = inputs()
    if mutation == "image": request["image"]["sha256"] = "a" * 64
    elif mutation == "source": request["context"]["source_url"] = "https://example.invalid/other"
    elif mutation == "ink": request["context"]["ink_revision"] = 99
    elif mutation == "display": request["context"]["display"]["scale_factor"] += 1
    elif mutation == "future": request["context"]["frame_seq"] -= 1
    elif mutation == "capture": request["context"]["capture_session_id"] = "other"
    else: request[mutation if mutation != "session" else "session_id"] = 2 if mutation == "epoch" else "other"
    with pytest.raises(ValidationError):
        carry_focus_into_followup(request, origin)


def test_new_focus_is_not_overwritten_and_no_original_history_is_truncated():
    origin, request = inputs(next_frame=True)
    request["focus"] = deepcopy(origin["focus"])
    request["focus"]["frame_seq"] = request["context"]["frame_seq"]
    with pytest.raises(ValidationError):
        carry_focus_into_followup(request, origin)
    request["focus"] = None
    row = dict(kind="user", text="Original words", at=None, frame_seq=None,
               request_id=None, audio_source=None, presentation=None)
    request["history"] = [deepcopy(row) for _ in range(24)]
    before = deepcopy(request)
    with pytest.raises(ValidationError):
        carry_focus_into_followup(request, origin)
    assert request == before


def test_long_source_anchor_fails_explicitly_instead_of_losing_its_source():
    origin, request = inputs(next_frame=True)
    origin["context"]["source_url"] = "https://example.invalid/" + "x" * 4000
    before = deepcopy(origin)
    with pytest.raises(ValidationError):
        carry_focus_into_followup(request, origin)
    assert origin == before


def test_active_request_binding_survives_later_observation_but_stop_and_permission_fence_it():
    origin, request = inputs(next_frame=True)
    prepared = prepare_live_session_context(carry_focus_into_followup(request, origin))
    state = dict(active=True, cancelled=False, provenance=deepcopy(prepared["provenance"]))
    result = bind_live_session_response(prepared, "The old focus pixels are unavailable here.",
        current_state=state, model="synthetic", auth_mode="chatgpt", latency_ms=0,
        thread_id="synthetic-thread", turn_id="synthetic-turn")
    assert authorize_live_presentation(result, current_state=state)["text"] == result["text"]
    unrelated_frame_state = deepcopy(state)
    unrelated_frame_state["provenance"]["context"]["frame_seq"] += 1
    with pytest.raises(ValueError):
        authorize_live_presentation(result, current_state=unrelated_frame_state)
    # The trusted caller checks this active request, not a newest unrelated frame;
    # returning the result does not itself supply current authority.
    for key, value in [("active", False), ("cancelled", True)]:
        stopped = deepcopy(state)
        stopped[key] = value
        with pytest.raises(ValueError):
            authorize_live_presentation(result, current_state=stopped)
    changed = deepcopy(state)
    changed["provenance"]["permission_revision"] += 1
    with pytest.raises(ValueError):
        authorize_live_presentation(result, current_state=changed)
