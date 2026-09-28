"""Internal, provider-neutral evidence assembly; not a shared wire or answer format.

Callers supply a trusted user scope and a current validated archive snapshot on
every call. Reassemble after changes; an old packet is not authority to reuse old
evidence. Production authorization/deletion transactions remain backend-owned.
"""

from collections import defaultdict, deque
from copy import deepcopy

from .archive import canonical, digest, source_key
from .timestamps import utc_instant_key


def _snapshot_fingerprint(archive):
    actual = digest(canonical({"sources": list(archive.sources.values()),
                               "frames": list(archive.frames.values()),
                               "observations": list(archive.events.values())}))
    if actual != archive.fingerprint:
        raise ValueError("Archive mutated; reload a validated snapshot and rebuild the index")
    return actual


def assemble_context(archive, index, query, *, user_id, top_k=5, max_bytes=32768):
    """Return whole original evidence items within a canonical UTF-8 JSON budget.

    Retrieval hits keep their ranks/scores. Accessible correction neighbors follow
    in stable identity order; they are context, not extra ranked hits. All metadata
    filters also apply to neighbors. Historical ancestors can appear in a current
    packet, explicitly labeled historical. Current plus a time filter is NOT as-of.
    A too-small budget for even the empty envelope raises ValueError. No provider,
    presentation permission, generated answer, confirmation or mastery is inferred.
    """
    if not isinstance(user_id, str) or not user_id.strip():
        raise ValueError("Explicit trusted user scope required")
    if type(top_k) is not int or not 1 <= top_k <= 100:
        raise ValueError("top_k must be an integer in [1, 100]")
    if type(max_bytes) is not int or max_bytes <= 0:
        raise ValueError("max_bytes must be a positive integer")
    query = deepcopy(query)
    query.setdefault("mode", "current")
    fingerprint = _snapshot_fingerprint(archive)

    def check_freshness():
        if (fingerprint != _snapshot_fingerprint(archive)
                or fingerprint != _snapshot_fingerprint(index.archive)
                or fingerprint != index.payload["archive_fingerprint"]):
            raise ValueError("Index and archive snapshots differ; rebuild and reassemble")

    check_freshness()
    found = index.search(query, user_id=user_id, metadata=True, top_k=top_k)
    after = utc_instant_key(query["after"]) if query.get("after") is not None else None
    before = utc_instant_key(query["before"]) if query.get("before") is not None else None
    children = defaultdict(list)
    latest = {}
    for source in archive.sources.values():
        if source["user_id"] == user_id:
            latest[source["source_id"]] = max(latest.get(source["source_id"], 0), source["source_version"])
    for key, event in sorted(archive.events.items()):
        if key[0] == user_id and event["correction_of"] is not None:
            children[(user_id, event["correction_of"])].append(key)

    def exclusion(key):
        # Check scope/access before using the raw evidence accessor, including expansion.
        if key[0] != user_id:
            return "outside_user_scope"
        event = archive.events.get(key)
        if event is None:
            return "missing_record"
        source = archive.sources.get(source_key(event))
        if source is None or source["access_status"] != "ready":
            return "source_unavailable"
        for field, value in (("project_id", source["project_id"]), ("actor", event["actor"]),
                             ("source_version", event["source_version"])):
            if query.get(field) is not None and query[field] != value:
                return f"outside_{field}_filter"
        captured = utc_instant_key(event["captured_at"])
        if (after is not None and captured < after) or (before is not None and captured >= before):
            return "outside_capture_time_filter"
        return None

    def neighbors(key):
        parent = archive.events[key]["correction_of"]
        if parent is not None:
            yield "corrects", (user_id, parent)
        for child in children[key]:
            yield "corrected_by", child

    ranked = {(hit["user_id"], hit["event_id"]): (rank, hit["score"])
              for rank, hit in enumerate(found["hits"], 1)}
    pending = deque(ranked)
    eligible = set()
    while pending:
        key = pending.popleft()
        if key in eligible or exclusion(key) is not None:
            continue
        eligible.add(key)
        pending.extend(other for _, other in neighbors(key) if other not in eligible)

    def correction_resolution(key):
        # Follow evidenced ancestors, never choose the last timestamp as a winner.
        filtered = False
        while True:
            if len(children[key]) > 1:
                return "competing_branches_unresolved"
            filtered = filtered or any(exclusion(child) is not None for child in children[key])
            parent = archive.events[key]["correction_of"]
            if parent is None:
                return "unknown_filtered_relation" if filtered else "links_only_not_confirmation"
            key = user_id, parent
            if exclusion(key) is not None:
                return "unknown_filtered_relation"

    items = []
    ordered = [key for key in ranked if key in eligible] + sorted(eligible - ranked.keys())
    for key in ordered:
        # Recheck immediately before rehydration; a production caller still needs
        # its own atomic authorization fence around snapshot acquisition/use.
        if exclusion(key) is not None:
            raise ValueError("Evidence scope changed during assembly; reassemble")
        event = archive.events[key]
        evidence = archive.evidence(key)
        evidence.update({field: deepcopy(event[field]) for field in
                         ("confidence", "received_at", "source_timezone", "device_id", "device_sequence", "session_id")})
        relations = []
        for direction, other in neighbors(key):
            reason = exclusion(other)
            relation = {"direction": direction, "availability": "eligible" if reason is None else "filtered_or_unavailable"}
            if reason is None:
                relation["event_id"] = other[1]
            else:
                relation["reason"] = reason
            relations.append(relation)
        unknown = [field for field in ("frame", "media_position", "received_at") if evidence[field] is None]
        if evidence["actor"] == "unknown":
            unknown.append("actor")
        rank, score = ranked.get(key, (None, None))
        superseded = bool(children[key])
        older_version = event["source_version"] != latest[event["source_id"]]
        items.append({"origin": "retrieval" if rank is not None else "correction_neighbor",
                      "retrieval_rank": rank, "retrieval_score": score, "evidence": evidence,
                      "snapshot_status": "historical" if superseded or older_version else "current_candidate",
                      "superseded_by_correction": superseded, "older_source_version": older_version,
                      "correction_resolution": correction_resolution(key), "correction_relations": relations,
                      "correction_reason": None, "unknown_fields": unknown})

    def packet(included):
        omitted_hits = len(ranked) - sum(item["origin"] == "retrieval" for item in included)
        omitted_neighbors = len(items) - len(included) - omitted_hits
        return {"kind": "internal_evidence_context", "archive_fingerprint": fingerprint,
                "user_id": user_id, "query": deepcopy(query),
                "temporal_semantics": "snapshot_current_not_as_of" if query["mode"] == "current" else "history_filtered_by_capture_time",
                "retrieval": {"status": found["status"], "returned_hit_count": len(ranked),
                              "top_k": top_k, "total_candidate_count": None},
                "interpretation": {"presentation_permission": "not_granted", "factual_accuracy": "not_verified",
                                   "capture_completeness": "unknown", "cross_device_order": "unknown",
                                   "item_order": "retrieval_rank_then_neighbor_identity_not_chronology",
                                   "confidence_kind": "observation_confidence_not_answer_confidence",
                                   "corrections": "v0.1_links_not_audio_or_diagnosis_confirmation",
                                   "relation_references": "eligible_references_may_be_omitted_from_items_by_budget",
                                   "no_hits": "not_found_does_not_mean_never_happened"},
                "budget": {"max_bytes": max_bytes, "encoding": "canonical_utf8_json",
                           "status": "limited" if len(included) < len(items) else "complete_for_eligible_items",
                           "eligible_item_count": len(items), "included_item_count": len(included),
                           "omitted_retrieval_items": omitted_hits, "omitted_correction_items": omitted_neighbors},
                "items": included}

    included = []
    if len(canonical(packet(included))) > max_bytes:
        raise ValueError("max_bytes cannot fit the context envelope; increase the transport budget")
    for item in items:
        if len(canonical(packet(included + [item]))) <= max_bytes:
            included.append(item)
    result = packet(included)
    check_freshness()
    return result
