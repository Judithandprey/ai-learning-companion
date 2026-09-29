"""Bounded QA context regressions; synthetic data, no provider/permission claims."""

import math

import pytest

from services.learning import context as ctx
from services.learning.archive import ArchiveSnapshot, FixtureArchive, canonical, digest
from services.learning.retrieval import RetrievalIndex
from test_memory import tiny_bundle

USER = "synthetic-learner"
QUERY = {"text": "basis physical arrow", "actor": "user"}


def build(bundle=None):
    archive = FixtureArchive(*(tiny_bundle() if bundle is None else bundle))
    return archive, RetrievalIndex(archive)


@pytest.mark.parametrize("query", [None, [], "basis", b"basis", {}, {"text": None}, {"text": 1},
    {"text": b"basis"}, {"text": {"basis"}}, {"text": "basis\ud800"},
    {"text": "basis", "project_id": {"algebra"}}, {"text": "basis", "project_id": b"algebra"},
    {"text": "basis", "actor": []}, {"text": "basis", "mode": []},
    {"text": "basis", "after": 1}, {"text": "basis", "before": "tomorrow"},
    *[{"text": "basis", "source_version": v} for v in (True, False, 1.0, 2.0, "1", 0, -1, math.nan)],
])
def test_invalid_query_rejects_before_search_or_evidence(monkeypatch, query):
    archive, index = build()

    def forbidden(*args, **kwargs):
        pytest.fail("Malformed query reached retrieval or evidence")

    monkeypatch.setattr(index, "search", forbidden)
    monkeypatch.setattr(archive, "evidence", forbidden)
    with pytest.raises(ValueError):
        ctx.assemble_context(archive, index, query, user_id=USER)


@pytest.mark.parametrize("field", ["user_id", "source_version", "max_bytes"])
def test_unencodable_echo_parameters_fail_early(monkeypatch, field):
    archive, index = build()
    query, kwargs = dict(QUERY), {"user_id": USER}
    if field == "source_version":
        query[field] = 10**5000
    else:
        kwargs[field] = "\ud800" if field == "user_id" else 10**5000
    monkeypatch.setattr(index, "search", lambda *args, **kwargs: pytest.fail("Unencodable envelope reached search"))
    with pytest.raises(ValueError, match="UTF-8 JSON encodable"):
        ctx.assemble_context(archive, index, query, **kwargs)


def test_valid_escapes_unicode_and_nullable_filters_remain_supported():
    archive, index = build()
    query = {"text": 'basis " \\ \x00 \x1f \ufeff λ 基底 👩🏽‍🔬 e\u0301', "source_version": 1,
             "project_id": None, "actor": None, "after": None, "before": None}
    packet = ctx.assemble_context(archive, index, query, user_id=USER)
    assert packet["items"]
    assert packet["query"] == {**query, "mode": "current"}
    assert canonical(packet)
    query["source_version"] = None
    assert ctx.assemble_context(archive, index, query, user_id=USER)["items"]


@pytest.mark.parametrize("rejected", ["other_owner", "missing_event", "actor_filter", "unavailable_source"])
@pytest.mark.parametrize("all_rejected", [False, True])
@pytest.mark.parametrize("budget", [1600, 100000])
def test_scope_recheck_counts_only_eligible_ranked_items(monkeypatch, rejected, all_rejected, budget):
    sources, frames, events, artifacts = tiny_bundle()
    blocked = {**events[1], "event_id": "DENIED-EVENT", "device_sequence": 99,
               "text": "DENIED-QUOTE", "frame_id": None, "gap_flags": ["missing_frame"]}
    if rejected == "unavailable_source":
        sources.append({**sources[0], "source_id": "blocked-source", "access_status": "needs_auth"})
        blocked["source_id"] = "blocked-source"
    elif rejected == "actor_filter":
        blocked["actor"] = "teacher"
    if rejected in ("unavailable_source", "actor_filter"):
        events.append(blocked)
    archive, index = build((sources, frames, events, artifacts))
    good = {**archive.evidence((USER, "e-02-c")), "score": 0.5}
    denied = {"user_id": "DENIED-OWNER" if rejected == "other_owner" else USER,
              "event_id": "DENIED-EVENT", "score": 0.7, "text": "DENIED-QUOTE"}
    monkeypatch.setattr(index, "search", lambda *args, **kwargs:
                        {"status": "candidates", "hits": [denied] if all_rejected else [denied, good]})
    accessor = archive.evidence

    def checked(key):
        assert key[1] != "DENIED-EVENT" and key[0] == USER
        return accessor(key)

    monkeypatch.setattr(archive, "evidence", checked)
    packet = ctx.assemble_context(archive, index, QUERY, user_id=USER, top_k=2, max_bytes=budget)
    assert packet["retrieval"]["status"] == "scope_filtered"
    assert packet["retrieval"]["returned_hit_count"] == (0 if all_rejected else 1)
    assert all(s not in canonical(packet).decode() for s in ("DENIED-OWNER", "DENIED-EVENT", "DENIED-QUOTE"))
    counts = packet["budget"]
    assert counts["eligible_item_count"] == (0 if all_rejected else 2)
    assert counts["omitted_retrieval_items"] >= 0 and counts["omitted_correction_items"] >= 0
    assert counts["eligible_item_count"] == len(packet["items"]) + counts["omitted_retrieval_items"] + counts["omitted_correction_items"]
    assert (counts["status"] == "limited") == (len(packet["items"]) < counts["eligible_item_count"])
    assert len(canonical(packet)) <= budget
    assert all(i["retrieval_rank"] == 2 for i in packet["items"] if i["origin"] == "retrieval")


@pytest.mark.parametrize("damage", ["none", "no_hits", "bad_status", "contradictory_status", "empty_candidates",
                                   "bad_hits_type", "bad_hit", "bad_id", "bad_score", "nan_score", "duplicate"])
def test_malformed_retriever_results_fail_closed(monkeypatch, damage):
    archive, index = build()
    hit = {"user_id": USER, "event_id": "e-02-c", "score": 0.5}
    found = {"status": "candidates", "hits": [hit]}
    if damage == "none":
        found = None
    elif damage == "no_hits":
        del found["hits"]
    elif damage == "bad_status":
        found["status"] = []
    elif damage == "contradictory_status":
        found["status"] = "not_found"
    elif damage == "empty_candidates":
        found["hits"] = []
    elif damage == "bad_hits_type":
        found["hits"] = (hit,)
    elif damage == "bad_hit":
        found["hits"] = [None]
    elif damage == "bad_id":
        hit["event_id"] = []
    elif damage == "bad_score":
        hit["score"] = True
    elif damage == "nan_score":
        hit["score"] = math.nan
    else:
        found["hits"].append(dict(hit))
    monkeypatch.setattr(index, "search", lambda *args, **kwargs: found)
    monkeypatch.setattr(archive, "evidence", lambda *args: pytest.fail("Malformed result reached evidence"))
    with pytest.raises(ValueError, match="Malformed retrieval"):
        ctx.assemble_context(archive, index, QUERY, user_id=USER)


def test_observed_scope_restore_cannot_publish_a_relation_outside_eligible_set(monkeypatch):
    sources, frames, events, artifacts = tiny_bundle()
    sources.append({**sources[0], "source_version": 2})
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction.update(source_version=2, frame_id=None, gap_flags=["missing_frame"])
    archive, index = build((sources, frames, events, artifacts))
    found = index.search({**QUERY, "mode": "history"}, user_id=USER)
    source = archive.sources[(USER, sources[0]["source_id"], 2)]

    def revoked(*args, **kwargs):
        source["access_status"] = "needs_auth"
        return found

    accessor = archive.evidence

    def restored(key):
        assert key[1] != "e-02-c"
        source["access_status"] = "ready"
        return accessor(key)

    monkeypatch.setattr(index, "search", revoked)
    monkeypatch.setattr(archive, "evidence", restored)
    with pytest.raises(ValueError, match="scope changed"):
        ctx.assemble_context(archive, index, {**QUERY, "mode": "history"}, user_id=USER)


@pytest.mark.parametrize("filter_by", ["after", "project_id", "source_version", "access_status"])
@pytest.mark.parametrize("visible_branches", [1, 2])
def test_observable_fork_survives_filtered_original_without_hidden_content(monkeypatch, filter_by, visible_branches):
    sources, frames, events, artifacts = tiny_bundle()
    old = next(e for e in events if e["event_id"] == "e-02-u")
    old["text"] = "INACCESSIBLE-ORIGINAL-TEXT"
    sources.append({**sources[0], "source_version": 2, "project_id": "current-project"})
    correction = next(e for e in events if e["event_id"] == "e-02-c")
    correction.update(source_version=2, frame_id=None, gap_flags=["missing_frame"])
    hidden = {**correction, "event_id": "HIDDEN-SIBLING-ID", "text": "HIDDEN-SIBLING-TEXT", "device_sequence": 99,
              "source_version": 1, "captured_at": "2025-01-03T00:05:00Z"}
    events.append(hidden)
    if visible_branches == 2:
        events.append({**correction, "event_id": "visible-branch", "device_sequence": 100})
    query = dict(QUERY)
    if filter_by == "access_status":
        sources[0]["access_status"] = "needs_auth"
    else:
        query[filter_by] = {"after": "2025-01-03T00:30:00Z", "project_id": "current-project", "source_version": 2}[filter_by]
    archive, index = build((sources, frames, events, artifacts))
    accessor = archive.evidence

    def checked(key):
        assert key[1] not in ("e-02-u", "HIDDEN-SIBLING-ID")
        return accessor(key)

    monkeypatch.setattr(archive, "evidence", checked)
    packet = ctx.assemble_context(archive, index, query, user_id=USER)
    assert len(packet["items"]) == visible_branches
    expected = "competing_branches_unresolved" if visible_branches == 2 else "unknown_filtered_relation"
    assert all(i["correction_resolution"] == expected for i in packet["items"])
    assert all(i["evidence"]["correction_of"] == "e-02-u" for i in packet["items"])
    assert all("event_id" not in relation for i in packet["items"] for relation in i["correction_relations"])
    assert all(secret not in canonical(packet).decode() for secret in
               ("INACCESSIBLE-ORIGINAL-TEXT", "HIDDEN-SIBLING-ID", "HIDDEN-SIBLING-TEXT", "e-02-frame"))
    assert all(i["correction_reason"] is None for i in packet["items"])


@pytest.mark.parametrize("cycle", ["self", "two_with_fork"])
def test_forged_cycle_terminates_with_value_error(monkeypatch, cycle):
    archive, _ = build()
    archive.events[(USER, "e-02-u")]["correction_of"] = "e-02-u" if cycle == "self" else "e-02-c"
    if cycle == "two_with_fork":
        branch = {**archive.events[(USER, "e-02-c")], "event_id": "branch", "device_sequence": 99}
        archive.events[(USER, "branch")] = branch
    archive.fingerprint = digest(canonical({"sources": list(archive.sources.values()),
        "frames": list(archive.frames.values()), "observations": list(archive.events.values())}))
    index = RetrievalIndex(archive)  # Deliberately forged-consistent trusted-caller misuse.
    parse = ctx.utc_instant_key
    calls = 0

    def bounded(value):
        nonlocal calls
        calls += 1
        assert calls < 100, "Cycle guard missing; stop this regression before it can hang"
        return parse(value)

    monkeypatch.setattr(ctx, "utc_instant_key", bounded)
    with pytest.raises(ValueError, match="Correction cycle"):
        ctx.assemble_context(archive, index, {**QUERY, "mode": "history"}, user_id=USER)


@pytest.mark.parametrize("access", ["registered", "fetched", "parsed", "indexed", "ready", "needs_auth",
                                     "temporarily_unavailable", "unsupported", "failed"])
def test_newer_version_without_observations_never_revives_old_current(access):
    sources, frames, events, artifacts = tiny_bundle()
    sources.append({**sources[0], "source_version": 2, "access_status": access})
    archive = ArchiveSnapshot(sources, frames, events, artifacts, user_id=USER)
    index = RetrievalIndex(archive)
    current = ctx.assemble_context(archive, index, QUERY, user_id=USER)
    assert current["retrieval"]["status"] == "not_found" and not current["items"]
    history = ctx.assemble_context(archive, index, {**QUERY, "mode": "history"}, user_id=USER)
    assert {i["evidence"]["event_id"] for i in history["items"]} == {"e-02-u", "e-02-c"}
    assert all(i["older_source_version"] and i["snapshot_status"] == "historical" for i in history["items"])
