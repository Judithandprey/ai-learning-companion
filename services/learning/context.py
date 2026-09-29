"""Internal, provider-neutral evidence assembly; not a shared wire or answer format.

Callers supply a trusted user scope and a current validated archive snapshot on
every call. Reassemble after changes; an old packet is not authority to reuse old
evidence. Production authorization/deletion transactions remain backend-owned.
"""

from collections import defaultdict, deque
from copy import deepcopy
import math

from .archive import canonical, digest, event_key, source_key
from .timestamps import utc_instant_key


def _validated_query(query):
    """Validate the small existing query vocabulary before retrieval reads evidence."""
    if not isinstance(query, dict):
        raise ValueError("Context query must be a dictionary")
    allowed = {"text", "mode", "project_id", "actor", "source_version", "after", "before"}
    if set(query) - allowed:
        raise ValueError("Unsupported query field")
    if type(query.get("text")) is not str:
        raise ValueError("Query text must be a string")
    query = dict(query)
    query.setdefault("mode", "current")
    if query["mode"] not in ("current", "history"):
        raise ValueError("Query mode must be current or history")
    for field in ("project_id", "actor"):
        if query.get(field) is not None and type(query[field]) is not str:
            raise ValueError(f"Query {field} must be a string or null")
    version = query.get("source_version")
    if version is not None and (type(version) is not int or version <= 0):
        raise ValueError("Query source_version must be a positive integer or null")
    after = utc_instant_key(query["after"]) if query.get("after") is not None else None
    before = utc_instant_key(query["before"]) if query.get("before") is not None else None
    return query, after, before


def _snapshot_fingerprint(archive):
    # The archive hash covers records, not lookup keys. Check both before any use:
    # key-only remapping can otherwise bind a valid record to a different owner.
    for name, records, identity in (
        ("sources", archive.sources, source_key),
        ("frames", archive.frames, lambda frame: (frame["user_id"], frame["frame_id"])),
        ("events", archive.events, event_key),
    ):
        for key, record in records.items():
            try:
                expected = identity(record)
            except (KeyError, TypeError) as error:
                raise ValueError(f"Archive {name} mapping identity is invalid; reload the snapshot") from error
            if (type(key) is not tuple or key != expected
                    or any(type(part) is not type(intrinsic) for part, intrinsic in zip(key, expected))):
                raise ValueError(f"Archive {name} mapping identity mismatch; reload the snapshot")
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
    query, after, before = _validated_query(query)
    try:
        canonical({"query": query, "user_id": user_id, "max_bytes": max_bytes})
    except (ValueError, TypeError) as error:
        raise ValueError("Context query and parameters must be UTF-8 JSON encodable") from error
    fingerprint = _snapshot_fingerprint(archive)

    def check_freshness():
        if (fingerprint != _snapshot_fingerprint(archive)
                or fingerprint != _snapshot_fingerprint(index.archive)
                or fingerprint != index.payload["archive_fingerprint"]):
            raise ValueError("Index and archive snapshots differ; rebuild and reassemble")

    check_freshness()
    found = index.search(query, user_id=user_id, metadata=True, top_k=top_k)
    if (not isinstance(found, dict) or found.get("status") not in ("candidates", "ambiguous", "not_found")
            or not isinstance(found.get("hits"), list)
            or (found["status"] == "not_found") != (not found["hits"])):
        raise ValueError("Malformed retrieval result; reassemble with a valid index")
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

    ranked, seen = {}, set()
    scope_filtered = False
    for rank, hit in enumerate(found["hits"], 1):
        if (not isinstance(hit, dict) or type(hit.get("user_id")) is not str
                or type(hit.get("event_id")) is not str or type(hit.get("score")) not in (int, float)):
            raise ValueError("Malformed retrieval hit; reassemble with a valid index")
        try:
            finite_score = math.isfinite(hit["score"])
        except OverflowError:
            finite_score = False
        key = hit["user_id"], hit["event_id"]
        if not finite_score or key in seen:
            raise ValueError("Malformed retrieval hit; reassemble with a valid index")
        seen.add(key)
        if exclusion(key) is not None:
            scope_filtered = True
            continue
        ranked[key] = rank, hit["score"]
    if len(ranked) > top_k:
        raise ValueError("Retrieval returned too many eligible hits")
    pending = deque(ranked)
    eligible = set()
    while pending:
        key = pending.popleft()
        if key in eligible or exclusion(key) is not None:
            continue
        eligible.add(key)
        pending.extend(other for _, other in neighbors(key) if other not in eligible)
    scope_filtered = scope_filtered or any(key not in eligible for key in ranked)
    ranked = {key: rank_score for key, rank_score in ranked.items() if key in eligible}

    def correction_resolution(key):
        # Follow evidenced ancestors, never choose the last timestamp as a winner.
        filtered = False
        competing = False
        visited = set()
        while True:
            if key in visited:
                raise ValueError("Correction cycle encountered; reload a validated snapshot")
            visited.add(key)
            competing = competing or len(children[key]) > 1
            filtered = filtered or any(exclusion(child) is not None for child in children[key])
            parent = archive.events[key]["correction_of"]
            if parent is None:
                if competing:
                    return "competing_branches_unresolved"
                return "unknown_filtered_relation" if filtered else "links_only_not_confirmation"
            key = user_id, parent
            if exclusion(key) is not None:
                # Accessible children's own correction_of links establish this
                # fork without reading the excluded original or hidden siblings.
                if competing or sum(exclusion(child) is None for child in children[key]) > 1:
                    return "competing_branches_unresolved"
                return "unknown_filtered_relation"

    items = []
    ordered = [key for key in ranked if key in eligible] + sorted(eligible - ranked.keys())
    for key in ordered:
        # Recheck immediately before rehydration; a production caller still needs
        # its own atomic authorization fence around snapshot acquisition/use.
        if exclusion(key) is not None:
            raise ValueError("Evidence scope changed during assembly; reassemble")
        event = archive.events[key]
        resolution = correction_resolution(key)
        evidence = archive.evidence(key)
        evidence.update({field: deepcopy(event[field]) for field in
                         ("confidence", "received_at", "source_timezone", "device_id", "device_sequence", "session_id")})
        relations = []
        for direction, other in neighbors(key):
            reason = exclusion(other)
            if reason is None and other not in eligible:
                raise ValueError("Evidence scope changed during assembly; reassemble")
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
                      "correction_resolution": resolution, "correction_relations": relations,
                      "correction_reason": None, "unknown_fields": unknown})

    def packet(included):
        omitted_hits = len(ranked) - sum(item["origin"] == "retrieval" for item in included)
        omitted_neighbors = len(items) - len(included) - omitted_hits
        return {"kind": "internal_evidence_context", "archive_fingerprint": fingerprint,
                "user_id": user_id, "query": deepcopy(query),
                "temporal_semantics": "snapshot_current_not_as_of" if query["mode"] == "current" else "history_filtered_by_capture_time",
                "retrieval": {"status": "scope_filtered" if scope_filtered else found["status"], "returned_hit_count": len(ranked),
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
