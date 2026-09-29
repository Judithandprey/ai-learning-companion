"""Synthetic TEST DATA exercising production-shaped v0.1 provenance enums.

No actual user/provider capture, permission grant or backend transaction is tested.
The frozen corpus and its provenance labels are never rewritten.
"""

from copy import deepcopy
from pathlib import Path

from jsonschema import ValidationError
import pytest

from services.learning.archive import ArchiveSnapshot, FixtureArchive, canonical, digest
from services.learning.context import assemble_context
from services.learning.evaluate import FIXTURES, hashes
from services.learning.retrieval import InvalidIndexError, RetrievalIndex
from test_memory import tiny_bundle

USER = "synthetic-learner"
QUERY = {"text": "basis physical arrow", "actor": "user", "project_id": "algebra"}


def sample(origin="user_authorized", consent_scope="learning"):
    sources, frames, observations, artifacts = tiny_bundle()
    sources[0]["type"] = "web"
    sources[0]["text"] += "\nSYNTHETIC TEST DATA: 原文, e\u0301, basis.\n"
    sources[0]["content_hash"] = digest(sources[0]["text"].encode("utf-8"))
    sources[0]["provenance"] = {
        "origin": origin, "consent_scope": consent_scope,
        "attribution": "SYNTHETIC TEST DATA testing legal enums, not a real capture or consent.",
        "license": "project-test-fixture; simulated provenance only",
    }
    frames[0]["representation"] = "dom_snapshot"
    return sources, frames, observations, artifacts


def snapshot(bundle=None, **kwargs):
    return ArchiveSnapshot(*(sample() if bundle is None else bundle), user_id=kwargs.pop("user_id", USER), **kwargs)


def context(archive, query=None, index=None):
    return assemble_context(archive, index or RetrievalIndex(archive), QUERY if query is None else query, user_id=USER)


def by_id(packet):
    return {item["evidence"]["event_id"]: item for item in packet["items"]}


@pytest.mark.parametrize("origin", ["user_authorized", "public_licensed"])
@pytest.mark.parametrize("consent", ["learning", "test_only"])
def test_legal_provenance_preserves_exact_records_bytes_and_context(origin, consent):
    bundle = sample(origin, consent)
    sources, frames, events, artifacts = deepcopy(bundle)
    archive = snapshot(bundle)
    assert archive.user_id == USER
    assert list(archive.sources.values()) == sources
    assert list(archive.frames.values()) == frames
    assert list(archive.events.values()) == events
    assert dict(archive.artifacts) == artifacts
    assert archive.sources[(USER, sources[0]["source_id"], 1)]["text"].encode() == sources[0]["text"].encode()
    frame = frames[0]
    assert archive.artifacts[frame["artifact_id"]] == artifacts[frame["artifact_id"]]
    assert digest(archive.artifacts[frame["artifact_id"]]) == frame["content_hash"]
    packet = context(archive)
    assert packet["interpretation"]["presentation_permission"] == "not_granted"
    assert packet["interpretation"]["factual_accuracy"] == "not_verified"
    assert packet["interpretation"]["capture_completeness"] == "unknown"
    for row in packet["items"]:
        evidence = row["evidence"]
        event = next(e for e in events if e["event_id"] == evidence["event_id"])
        assert evidence["text"] == event["text"]
        assert evidence["actor"] == event["actor"]
        assert evidence["provenance"] == sources[0]["provenance"]
        assert evidence["source_hash"] == sources[0]["content_hash"]
        assert evidence["frame"] == frame
        assert evidence["captured_at"] == event["captured_at"]
        assert evidence["received_at"] is None
    assert "received_at" in packet["items"][0]["unknown_fields"]
    assert bundle == (sources, frames, events, artifacts)


@pytest.mark.parametrize("owner", [None, "", " ", 10, []])
def test_trusted_owner_is_required_even_for_empty_snapshot(owner):
    with pytest.raises((ValueError, ValidationError)):
        ArchiveSnapshot([], [], [], {}, user_id=owner)


def test_owner_cannot_be_omitted():
    with pytest.raises(TypeError, match="user_id"):
        ArchiveSnapshot([], [], [], {})


@pytest.mark.parametrize("family", [0, 1, 2, "all"])
def test_mixed_or_wrong_owner_is_rejected_not_filtered(family):
    bundle = sample()
    for records in bundle[:3] if family == "all" else [bundle[family]]:
        records[0]["user_id"] = "other-test-owner"
    with pytest.raises(ValueError, match="owner differs"):
        snapshot(bundle)


@pytest.mark.parametrize("family", [0, 1, 2])
def test_each_record_family_is_schema_validated(family):
    bundle = sample()
    bundle[family][0]["unreleased_field"] = True
    with pytest.raises(ValidationError):
        snapshot(bundle)


@pytest.mark.parametrize("family", [0, 1, 2])
def test_duplicate_record_identities_reject(family):
    bundle = sample()
    bundle[family].append(deepcopy(bundle[family][0]))
    with pytest.raises(ValueError, match="Duplicate"):
        snapshot(bundle)


@pytest.mark.parametrize("damage,message", [
    ("source_text", "Source text hash"), ("artifact_bytes", "Frame artifact hash"),
    ("missing_artifact", "missing required artifact"), ("mutable_bytes", "immutable bytes"),
    ("missing_source", "matching source version/owner"), ("frame_source_version", "matching source version/owner"),
    ("event_source_version", "matching source version/owner"), ("missing_frame", "matching frame/owner"),
    ("unmarked_missing_frame", "Absent frame must be explicit"), ("missing_prior", "matching prior observation"),
    ("correction_actor", "correction ownership/order"), ("correction_source", "correction ownership/order"),
    ("correction_time", "correction ownership/order"), ("correction_self", "correction ownership/order"),
    ("duplicate_sequence", "Duplicate device sequence"),
])
def test_missing_or_inconsistent_originals_reject_explicitly(damage, message):
    sources, frames, events, artifacts = bundle = sample()
    correction = next(e for e in events if e["correction_of"] is not None)
    original = next(e for e in events if e["event_id"] == correction["correction_of"])
    artifact_id = frames[0]["artifact_id"]
    if damage == "source_text":
        sources[0]["text"] += " changed without new hash"
    elif damage == "artifact_bytes":
        artifacts[artifact_id] += b"wrong"
    elif damage == "missing_artifact":
        del artifacts[artifact_id]
    elif damage == "mutable_bytes":
        artifacts[artifact_id] = bytearray(artifacts[artifact_id])
    elif damage == "missing_source":
        sources.clear()
    elif damage == "frame_source_version":
        frames[0]["source_version"] = 2
    elif damage == "event_source_version":
        events[0]["source_version"] = 2
    elif damage == "missing_frame":
        frames.clear()
    elif damage == "unmarked_missing_frame":
        events[0]["frame_id"] = None
    elif damage == "missing_prior":
        correction["correction_of"] = "missing-test-event"
    elif damage == "correction_actor":
        correction["actor"] = "assistant"
    elif damage == "correction_source":
        other = deepcopy(sources[0])
        other["source_id"] = "other-test-source"
        sources.append(other)
        correction.update(source_id=other["source_id"], frame_id=None, gap_flags=["missing_frame"])
    elif damage == "correction_time":
        correction["captured_at"] = original["captured_at"]
    elif damage == "correction_self":
        correction["correction_of"] = correction["event_id"]
    elif damage == "duplicate_sequence":
        events[1]["device_sequence"] = events[0]["device_sequence"]
    with pytest.raises(ValueError, match=message):
        snapshot(bundle)


@pytest.mark.parametrize("field,value", [
    ("source_id", "another-test-source"), ("source_version", 2),
    ("device_id", "another-test-device"), ("session_id", "another-test-session"), ("media_position", 99.5),
])
def test_observation_cannot_rebind_frame(field, value):
    sources, frames, events, artifacts = bundle = sample()
    if field in ("source_id", "source_version"):
        other = deepcopy(sources[0])
        other[field] = value
        sources.append(other)
    events[0][field] = value
    with pytest.raises(ValueError, match=f"Observation/frame mismatch: {field}"):
        snapshot(bundle)


@pytest.mark.parametrize("origin,consent", [
    ("user_authorized", "learning"), ("public_licensed", "test_only"), ("synthetic", "learning"),
])
def test_fixture_adapter_keeps_its_synthetic_test_only_guard(origin, consent):
    with pytest.raises(ValueError, match="only accepts synthetic test-only"):
        FixtureArchive(*sample(origin, consent))


def test_fixture_load_does_not_admit_real_provenance(tmp_path):
    import json
    bundle = sample()
    sources, frames, events, artifacts = bundle
    files = {"records.json": canonical({"sources": sources, "frames": frames, "observations": events}),
             "source.txt": sources[0]["text"].encode(), "frame.svg": next(iter(artifacts.values()))}
    for name, content in files.items():
        (tmp_path / name).write_bytes(content)
    manifest = {"files": {name: digest(data) for name, data in files.items()},
                "artifacts": {frames[0]["artifact_id"]: "frame.svg"},
                "source_texts": {f"{USER}/{sources[0]['source_id']}/1": "source.txt"}}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="only accepts synthetic test-only"):
        FixtureArchive.load(tmp_path)


def test_copies_preserve_original_inputs_and_artifact_mapping():
    bundle = sample()
    archive = snapshot(bundle)
    packet = context(archive)
    initial = canonical(packet)
    bundle[0][0]["text"] = "caller changed its source"
    bundle[1][0]["content_hash"] = "0" * 64
    bundle[2][0]["text"] = "caller changed its observation"
    bundle[3].clear()
    packet["items"][0]["evidence"]["text"] = "caller edited returned packet"
    assert canonical(context(archive)) == initial
    assert archive.artifacts
    with pytest.raises(TypeError):
        archive.artifacts[next(iter(archive.artifacts))] = b"replacement"


def test_unknowns_and_explicit_absent_media_are_preserved():
    sources, frames, events, artifacts = sample()
    event = deepcopy(events[0])
    event.update(actor="unknown", frame_id=None, media_position=None, received_at=None,
                 gap_flags=["missing_frame", "missing_audio", "uncertain_transcript"], confidence=0.4)
    archive = snapshot((sources, [], [event], {}))
    packet = context(archive, {"text": "basis", "actor": "unknown"})
    item, = packet["items"]
    assert item["unknown_fields"] == ["frame", "media_position", "received_at", "actor"]
    assert item["evidence"]["gap_flags"] == event["gap_flags"]
    assert item["evidence"]["confidence"] == 0.4
    assert item["evidence"]["frame"] is None


def test_current_history_and_old_packet_are_distinct_after_change_and_deletion(tmp_path):
    sources, frames, events, artifacts = bundle = sample()
    archive = snapshot(bundle)
    index = RetrievalIndex(archive)
    current = context(archive, index=index)
    old_packet = deepcopy(current)
    rows = by_id(current)
    assert rows["e-02-u"]["origin"] == "correction_neighbor"
    assert rows["e-02-u"]["snapshot_status"] == "historical"
    assert rows["e-02-c"]["snapshot_status"] == "current_candidate"
    assert by_id(context(archive, {**QUERY, "mode": "history"}))["e-02-u"]["origin"] == "retrieval"
    cache = tmp_path / "index.json"
    index.save(cache)
    updated = deepcopy(sources[0])
    updated.update(source_version=2, text="SYNTHETIC TEST DATA: a revised basis keeps the arrow fixed.")
    updated["content_hash"] = digest(updated["text"].encode())
    sources.append(updated)
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction.update(source_version=2, frame_id=None, gap_flags=["missing_frame"])
    changed = snapshot(bundle)
    with pytest.raises(ValueError, match="snapshots differ"):
        context(changed, index=index)
    with pytest.raises(InvalidIndexError, match="Stale"):
        RetrievalIndex.load(changed, cache)
    rebuilt = RetrievalIndex.load_or_rebuild(changed, cache)
    fresh = context(changed, index=rebuilt)
    assert old_packet["archive_fingerprint"] != fresh["archive_fingerprint"]
    assert by_id(fresh)["e-02-c"]["evidence"]["source_version"] == 2
    assert by_id(fresh)["e-02-u"]["evidence"]["source_version"] == 1
    assert by_id(fresh)["e-02-c"]["evidence"]["frame"] is None
    assert current == old_packet
    deleted = snapshot(([], [], [], {}))
    with pytest.raises(ValueError, match="snapshots differ"):
        context(deleted, index=rebuilt)
    recovered = RetrievalIndex.load_or_rebuild(deleted, cache)
    assert context(deleted, index=recovered)["items"] == []
    assert recovered.payload["docs"] == []
    assert not deleted.artifacts
    assert current == old_packet  # Historical Python objects are not retroactively revoked.
    # The caller must re-acquire/recheck a current authorized snapshot, never reuse old packets.


def test_access_status_and_owner_filters_still_apply():
    bundle = sample()
    bundle[0][0]["access_status"] = "needs_auth"
    archive = snapshot(bundle)
    assert context(archive)["items"] == []
    allowed = snapshot()
    assert assemble_context(allowed, RetrievalIndex(allowed), QUERY, user_id="other-test-owner")["items"] == []


def test_snapshot_internal_mutation_is_rejected_by_existing_context_fence():
    archive = snapshot()
    index = RetrievalIndex(archive)
    archive.events[(USER, "e-02-u")]["text"] = "invalid internal rewrite"
    with pytest.raises(ValueError, match="Archive mutated"):
        context(archive, index=index)


def test_same_fixture_inputs_keep_fingerprint_evidence_and_context_unchanged():
    bundle = tiny_bundle()
    fixture = FixtureArchive(*bundle)
    owner_snapshot = snapshot(bundle)
    assert owner_snapshot.fingerprint == fixture.fingerprint
    assert owner_snapshot.sources == fixture.sources
    assert owner_snapshot.frames == fixture.frames
    assert owner_snapshot.events == fixture.events
    assert context(owner_snapshot) == context(fixture)
    original_inventory = hashes(FIXTURES)
    assert len(original_inventory) == 187
    assert digest(canonical(original_inventory)) == "b57dea1aec1aadfc4b892c0ba95d275f14f56048849cd0ba523c020a61167997"
    assert FixtureArchive.load(FIXTURES).fingerprint == "d901387a7b8ab24c33b627ad88f20e8ae1a8ddbb9e2b09dee98cd8fdb6f3220f"


def test_construction_has_no_file_write_or_loader(monkeypatch):
    bundle = sample()

    def unexpected(*args, **kwargs):
        pytest.fail("Snapshot construction must not write files")

    monkeypatch.setattr(Path, "write_bytes", unexpected)
    monkeypatch.setattr(Path, "write_text", unexpected)
    archive = snapshot(bundle)
    assert not hasattr(archive, "load")
    assert context(archive)["items"]
