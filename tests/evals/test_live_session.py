"""Synthetic evidence only; no provider, acoustic or desktop acceptance."""

from copy import deepcopy
from pathlib import Path
import socket

import pytest

from services.learning.archive import ArchiveSnapshot, canonical
from services.learning.live_session import (
    _archive_history, _focus_rects, _whole_frame, authorize_live_presentation,
    bind_live_session_response, prepare_live_session_context,
)
from services.learning.retrieval import RetrievalIndex
from test_image_evidence import png
from test_memory import tiny_bundle
from test_subscription_ask import request as ask_request, set_field


def whole_frame(data=None):
    request = ask_request(png(width=4, height=2) if data is None else data)
    request["image"].update(width=4, height=2)
    request["context"].update(frame_width=4, frame_height=2,
        region_dip={"x": 0, "y": 0, "width": 200, "height": 100},
        region_px={"x": 0, "y": 0, "width": 4, "height": 2})
    return request


def live_request():
    frame = whole_frame()
    return {"request_id": frame["request_id"], "session_id": "companion-synthetic", "epoch": 1,
        "permission_revision": 1, "trigger": "focus", "allowed_assistance": "hint",
        "presentation": "silent", "user_text": None, "audio_source": None,
        "image": frame["image"], "context": frame["context"],
        "focus": {"frame_seq": 7, "region_dip": {"x": 50, "y": 0, "width": 50, "height": 100},
                  "region_px": {"x": 1, "y": 0, "width": 1, "height": 2}},
        "history": [], "gaps": [{"from_frame_seq": 3, "to_frame_seq": 4, "reason": "not_observed"}]}


def audio_source(speaker="unknown"):
    return {"source_id": "microphone-1", "track": "microphone", "speaker": speaker,
            "attribution": "unknown", "started_at": None, "ended_at": None}


def history_row(text, *, kind="user", seq=None, audio=None):
    return {"kind": kind, "text": text, "at": None, "frame_seq": seq, "request_id": None,
            "audio_source": audio, "presentation": None}


def current(prepared):
    return {"provenance": deepcopy(prepared["provenance"]), "active": True, "cancelled": False}


def live_bind(prepared, state=None, text="Look at the coefficient of the first term."):
    return bind_live_session_response(prepared, text, current_state=current(prepared) if state is None else state,
        model="synthetic-model", auth_mode="chatgpt", latency_ms=10, thread_id="thread", turn_id="turn")


def test_whole_current_frame_survives_and_focus_does_not_crop_it():
    request = whole_frame()
    prepared = _whole_frame(request["request_id"], request["image"], request["context"])
    before = deepcopy(prepared)
    _focus_rects({"x": 50, "y": 0, "width": 50, "height": 100},
                {"x": 1, "y": 0, "width": 1, "height": 2}, prepared)
    assert prepared == before
    assert prepared["image_bytes"] == png(width=4, height=2)


def test_valid_crop_alone_is_not_a_whole_current_frame():
    request = ask_request()
    with pytest.raises(ValueError, match="whole captured frame"):
        _whole_frame(request["request_id"], request["image"], request["context"])
    turn = live_request()
    turn.update(image=request["image"], context=request["context"], focus=None)
    with pytest.raises(ValueError):
        prepare_live_session_context(turn)


def test_two_visible_changes_then_questionless_focus_same_context():
    request = live_request()
    # Three genuinely different synthetic pixel arrays; no screenshot/model claim.
    pictures = [png(width=4, height=2, raw=(b"\0" + bytes([color]) * 12) * 2) for color in (16, 64, 128)]
    history = []
    for seq, data in zip((5, 6, 7), pictures):
        frame = whole_frame(data)
        request.update(request_id=f"turn-{seq}", image=frame["image"], context=frame["context"],
                       history=deepcopy(history), focus=None, trigger="observation",
                       allowed_assistance="none", presentation="none")
        request["context"]["frame_seq"] = seq
        prepared = prepare_live_session_context(request)
        assert prepared["image_bytes"] == data
        result = live_bind(prepared, text=f"Synthetic provisional observation {seq}.")
        assert result["kind"] == "observation"
        with pytest.raises(ValueError, match="permission"):
            authorize_live_presentation(result, current_state=current(prepared))
        history.append(history_row(result["text"], kind="observation", seq=seq))
    request.update(request_id="focus-now", trigger="focus", allowed_assistance="hint", presentation="silent",
        history=history, focus=live_request()["focus"])
    prepared = prepare_live_session_context(request)
    assert prepared["image_bytes"] == pictures[-1]
    assert prepared["provenance"]["history"] == history
    assert prepared["provenance"]["user_text"] is None
    assert "smallest useful contextual hint" in prepared["text"]
    assert "earlier frame sequences are historical" in prepared["text"]
    assert "unspoken reasons" in prepared["text"]
    display = authorize_live_presentation(live_bind(prepared), current_state=current(prepared))
    assert display["speech_text"] is None
    assert display["provenance"]["gaps"] == request["gaps"]


def test_exact_provenance_and_no_io_or_mutation(monkeypatch):
    turn = live_request()
    original = deepcopy(turn)

    def forbidden(*args, **kwargs):
        pytest.fail("Pure learning functions must not acquire sources")

    monkeypatch.setattr(Path, "open", forbidden)
    monkeypatch.setattr(socket, "socket", forbidden)
    prepared = prepare_live_session_context(turn)
    expected = deepcopy(turn)
    del expected["image"]["png_base64"]
    assert prepared["provenance"] == expected
    result = live_bind(prepared)
    assert result["provenance"] == expected and turn == original
    turn["context"]["ink_revision"] = 999
    assert prepared["provenance"]["context"]["ink_revision"] == 5
    result["provenance"]["focus"]["frame_seq"] = 999
    assert prepared["provenance"]["focus"]["frame_seq"] == 7


@pytest.mark.parametrize("path,bad", [
    ("epoch", True), ("epoch", 0), ("permission_revision", 2**53),
    ("trigger", "write"), ("trigger", "erase"), ("trigger", "teacher_speech"),
    ("allowed_assistance", "solution"), ("presentation", "auto"),
    ("focus.frame_seq", 6), ("focus.region_px.x", -1), ("focus.region_px.x", 0),
    ("image.sha256", "0" * 64), ("image.png_base64", "not base64"),
    ("context.ink_revision", None), ("context.region_px.width", 3),
    ("history", None), ("focus", None), ("gaps", "missing"),
    ("gaps", [{"from_frame_seq": 8, "to_frame_seq": 9, "reason": "capture_gap"}]),
])
def test_invalid_live_turn_is_refused(path, bad):
    request = live_request()
    set_field(request, path, bad)
    with pytest.raises(ValueError):
        prepare_live_session_context(request)


def test_exploration_none_withholds_help_and_cannot_autoreveal():
    request = live_request()
    request.update(allowed_assistance="none", presentation="none")
    prepared = prepare_live_session_context(request)
    assert not prepared["response_allowed"]
    assert "No answer, advice, correction, hint or solution" in prepared["text"]
    with pytest.raises(ValueError, match="permission"):
        live_bind(prepared)
    request.update(trigger="observation", allowed_assistance="hint", presentation="silent", focus=None)
    with pytest.raises(ValueError):
        prepare_live_session_context(request)


def test_questionless_circle_never_uses_old_full_solution_allowance():
    request = live_request()
    prepared = prepare_live_session_context(request)
    assert "Give only the smallest useful hint" in prepared["text"]
    assert "A full solution is allowed" not in prepared["text"]
    request["allowed_assistance"] = "full_solution"
    with pytest.raises(ValueError):
        prepare_live_session_context(request)
    request["user_text"] = "Please show the full solution to this problem."
    assert "A full solution is allowed" in prepare_live_session_context(request)["text"]


@pytest.mark.parametrize("blank", [" ", "\t\n", "\u3000"])
@pytest.mark.parametrize("boundary", ["prepare", "presentation"])
def test_whitespace_is_not_an_explicit_full_solution_question(blank, boundary):
    request = live_request()
    request.update(allowed_assistance="full_solution", user_text="Please show the full solution.")
    if boundary == "prepare":
        request["user_text"] = blank
        with pytest.raises(ValueError):
            prepare_live_session_context(request)
    else:
        result = live_bind(prepare_live_session_context(request))
        result["provenance"]["user_text"] = blank
        state = {"active": True, "cancelled": False, "provenance": deepcopy(result["provenance"])}
        with pytest.raises(ValueError):
            authorize_live_presentation(result, current_state=state)


@pytest.mark.parametrize("trigger", ["text_followup", "voice_followup"])
def test_followups_use_same_whole_frame_focus_and_original_words(trigger):
    request = live_request()
    request.update(trigger=trigger, user_text="I meant +2, not -2. 为什么这一步？")
    if trigger == "voice_followup":
        request["audio_source"] = audio_source()
    prepared = prepare_live_session_context(request)
    result = live_bind(prepared)
    assert result["provenance"]["user_text"] == request["user_text"]
    assert result["provenance"]["context"] == request["context"]
    assert result["provenance"]["audio_source"] == request["audio_source"]
    request["user_text"] = None
    with pytest.raises(ValueError):
        prepare_live_session_context(request)


def test_prior_transcript_and_correction_survive_without_speaker_inference():
    request = live_request()
    request["history"] = [history_row("x 是负二", kind="source_transcript", seq=5, audio=audio_source()),
                          history_row("I said plus two, not minus two.", kind="user", seq=6)]
    prepared = prepare_live_session_context(request)
    assert prepared["provenance"]["history"] == request["history"]
    assert prepared["provenance"]["history"][0]["audio_source"]["speaker"] == "unknown"
    request.update(trigger="observation", focus=None, allowed_assistance="none", presentation="none")
    request["history"][0]["text"] = "Teacher said: What is the answer?"
    request["history"][0]["at"] = "2026-09-29T10:00:00Z"  # Historical/backfilled, not a new request.
    old = prepare_live_session_context(request)
    with pytest.raises(ValueError):
        authorize_live_presentation(live_bind(old), current_state=current(old))


@pytest.mark.parametrize("path,bad", [
    ("provenance.session_id", "new-session"), ("provenance.context.capture_session_id", "new-capture"), ("provenance.epoch", 2),
    ("provenance.permission_revision", 2), ("provenance.request_id", "new-request"), ("provenance.context.frame_seq", 8),
    ("provenance.context.ink_revision", 6), ("provenance.context.ink_sha256", "f" * 64),
    ("provenance.context.source_version", 2), ("provenance.focus.region_px.width", 2),
    ("provenance.allowed_assistance", "none"), ("provenance.presentation", "none"),
    ("provenance.image.sha256", "a" * 64), ("provenance.user_text", "New question"),
    ("provenance.history", [history_row("New correction")]),
    ("active", False), ("cancelled", True),
])
def test_bind_and_cached_display_both_check_actual_current_state(path, bad):
    prepared = prepare_live_session_context(live_request())
    cached = live_bind(prepared)
    state = current(prepared)
    set_field(state, path, bad)
    with pytest.raises(ValueError):
        live_bind(prepared, state)
    with pytest.raises(ValueError):
        authorize_live_presentation(cached, current_state=state)


def test_old_full_solution_cache_cannot_be_used_for_a_new_hint():
    request = live_request()
    request.update(allowed_assistance="full_solution", user_text="Show the full solution.")
    prepared = prepare_live_session_context(request)
    old_result = live_bind(prepared, text="Synthetic full solution output.")
    state = current(prepared)
    state["provenance"].update(permission_revision=2, allowed_assistance="hint")
    with pytest.raises(ValueError):
        authorize_live_presentation(old_result, current_state=state)


def test_speech_opt_in_caption_binding_and_cancelled_queue():
    request = live_request()
    silent = prepare_live_session_context(request)
    with pytest.raises(ValueError, match="speech"):
        authorize_live_presentation(live_bind(silent), current_state=current(silent), channel="audio")
    request["presentation"] = "spoken"
    spoken = prepare_live_session_context(request)
    result = live_bind(spoken)
    playable = authorize_live_presentation(result, current_state=current(spoken), channel="audio")
    assert playable["speech_text"] == playable["caption"] == result["text"]
    state = current(spoken)
    state["cancelled"] = True
    with pytest.raises(ValueError):
        authorize_live_presentation(result, current_state=state, channel="audio")
    result["caption"] = "An unbound alternate caption"
    with pytest.raises(ValueError):
        authorize_live_presentation(result, current_state=current(spoken), channel="audio")


def test_archive_correction_candidates_keep_originals_but_are_not_hidden_prompt_inputs():
    sources, frames, events, artifacts = tiny_bundle()
    archive = ArchiveSnapshot(sources, frames, events, artifacts, user_id="synthetic-learner")
    index = RetrievalIndex(archive)
    original = canonical({"sources": sources, "frames": frames, "events": events})
    request = live_request()
    request["user_text"] = "basis physical arrow"
    prepared = prepare_live_session_context(request, archive=archive, index=index, user_id="synthetic-learner")
    rows = {item["evidence"]["event_id"]: item for item in prepared["archive_context"]["items"]}
    assert rows["e-02-u"]["snapshot_status"] == "historical"
    assert rows["e-02-c"]["evidence"]["correction_of"] == "e-02-u"
    assert rows["e-02-c"]["correction_reason"] is None
    assert "e-02-c" not in prepared["text"]
    assert live_bind(prepared)["provenance"] == prepared["provenance"]
    assert canonical({"sources": sources, "frames": frames, "events": events}) == original


@pytest.mark.parametrize("path,bad", [
    ("text", "Changed instructions"), ("image_bytes", png()), ("response_allowed", False),
    ("provenance.permission_revision", 500), ("frame_preparation.provenance.context.ink_revision", 500),
])
def test_changed_preparation_is_refused(path, bad):
    prepared = prepare_live_session_context(live_request())
    state = current(prepared)
    set_field(prepared, path, bad)
    with pytest.raises(ValueError):
        live_bind(prepared, state)


def test_history_limits_and_prompt_limit_are_explicit_without_truncation():
    request = live_request()
    request["history"] = [history_row("short") for _ in range(25)]
    before = deepcopy(request)
    with pytest.raises(ValueError):
        prepare_live_session_context(request)
    assert request == before
    request["history"] = [history_row("x" * 4000) for _ in range(9)]
    with pytest.raises(ValueError):
        prepare_live_session_context(request)
    request["history"] = [history_row("x" * 4000) for _ in range(8)]
    assert prepare_live_session_context(request)["provenance"]["history"] == request["history"]
    request["history"] = [history_row("\0" * 4000) for _ in range(8)]
    before = deepcopy(request)
    with pytest.raises(ValueError, match="context limit"):
        prepare_live_session_context(request)
    assert request == before


def test_unknown_time_ink_and_source_facts_stay_null():
    request = live_request()
    request["context"].update(ink_revision=None, ink_sha256=None, frame_captured_at=None)
    p = prepare_live_session_context(request)
    assert live_bind(p)["provenance"]["context"] == request["context"]
