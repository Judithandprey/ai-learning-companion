"""Bounded supplied process evidence; no storage, acquisition or permission grant."""

from copy import deepcopy
from concurrent.futures import CancelledError as FutureCancelledError

from packages.contracts import validate as validate_legacy
from packages.contracts.display_source import validate as validate_display, validate_display_record
from packages.contracts.original_artifact import validate_capture_frame
from packages.contracts.process_v2 import validate as validate_process, validate_record_frame

from .archive import canonical, digest, source_key
from .images import _resolve_frame_image, _validate_image_limits


def prepare_stored_process_context(record_ids, reader, resolver, *, user_id,
                                   max_metadata_bytes=64 * 1024, max_image_bytes=4 * 1024 * 1024,
                                   max_total_bytes=8 * 1024 * 1024, max_pixels=16_000_000):
    """Prepare stored evidence only if a final complete authorized read agrees.

    Inject the current-authorized Backend reader and image resolver. The reader
    returns exactly {batch, sources, frames}; its selection envelope is historical
    context, not an original transport batch/ACK. It must perform fresh coherent
    metadata reads, never serve a cached permission decision. Freeze 1–100 explicit
    IDs and read the SAME full selection twice, including omitted/frameless items.
    Reader errors and cancellation propagate; changed metadata withholds the whole
    packet. No retry, partial return, source store or dispatch callback is added.

    Complete metadata reads retain the reader's 4 MiB ceiling independently of the
    output budget. This last check is not atomic send/display or future authority:
    later use still requires current source and assistance permission at its actual
    boundary. Existing evidence/permission flags remain unchanged.
    """
    validate_legacy("Identifier", user_id)
    if type(record_ids) is not list or not 1 <= len(record_ids) <= 100:
        raise ValueError("Select 1–100 explicit stored record IDs")
    selection = tuple(record_ids)
    for record_id in selection:
        validate_legacy("Identifier", record_id)
    if len(set(selection)) != len(selection):
        raise ValueError("Duplicate stored record IDs")
    if not callable(reader) or not callable(resolver):
        raise ValueError("Current-authorized metadata reader and image resolver required")
    snapshot = deepcopy(reader(list(selection), max_metadata_bytes=4 * 1024 * 1024))
    if type(snapshot) is not dict or set(snapshot) != {"batch", "sources", "frames"}:
        raise ValueError("Reader must return complete batch, sources and frames")
    validate_process("ProcessBatch", snapshot["batch"])
    if snapshot["batch"]["delivery_mode"] != "historical":
        raise ValueError("Stored selection must be historical context")
    if tuple(record["record_id"] for record in snapshot["batch"]["records"]) != selection:
        raise ValueError("Reader result differs from the complete ordered selection")
    original_metadata = canonical(snapshot)
    if len(original_metadata) > 4 * 1024 * 1024:
        raise ValueError("Complete stored metadata exceeds 4 MiB")
    packet = compose_process_context(**snapshot, resolver=resolver, user_id=user_id,
        max_metadata_bytes=max_metadata_bytes, max_image_bytes=max_image_bytes,
        max_total_bytes=max_total_bytes, max_pixels=max_pixels)
    final_snapshot = reader(list(selection), max_metadata_bytes=4 * 1024 * 1024)
    if canonical(final_snapshot) != original_metadata:
        raise ValueError("Stored metadata changed during preparation; packet withheld")
    return packet


def compose_process_context(batch, sources, frames, resolver, *, user_id,
                            max_metadata_bytes=64 * 1024, max_image_bytes=4 * 1024 * 1024,
                            max_total_bytes=8 * 1024 * 1024, max_pixels=16_000_000):
    """Compose complete records from an actual supplied ProcessBatch (0.2.0).

    sources/frames are lists or tuples of exact snapshots/frames, not archive row
    envelopes. Only provisional_session is supported. All metadata is validated
    before byte resolution, including records later omitted by the budget.
    A missing named frame is a gap; extra frames/sources and missing sources fail.

    Caller must obtain coherent, currently authorized metadata transactionally,
    then recheck permission at final use. The resolver authorizes bytes only, not
    metadata. Historical/supplied values never attest current/live capture, commit,
    provider delivery, user intent, editable ink or presentation permission.

    Metadata budget covers canonical UTF-8 JSON of the entire returned dictionary
    with only item.image.data removed. Binary bytes have separate image ceilings.
    Conservative image/parent metadata reservation admits whole items in supplied
    array order (not chronology), skipping those that cannot fit. No truncation.
    Resolver exceptions become explicit gaps; cancellation/BaseException propagates.
    """
    validate_legacy("Identifier", user_id)
    if not callable(resolver):
        raise ValueError("A bounded authorized image resolver is required")
    _validate_image_limits(max_image_bytes, max_total_bytes, max_pixels)
    if type(max_metadata_bytes) is not int or not 0 < max_metadata_bytes <= 4 * 1024 * 1024:
        raise ValueError("Metadata limit must be a positive integer at most 4 MiB")
    if not isinstance(sources, (list, tuple)) or not isinstance(frames, (list, tuple)):
        raise ValueError("Supply explicit source and frame lists")
    original_inputs = batch, sources, frames
    batch, sources, frames = deepcopy(original_inputs)
    validate_process("ProcessBatch", batch)
    fingerprint = digest(canonical((batch, sources, frames)))
    source_map, frame_map, artifact_owners = {}, {}, {}
    for source in sources:
        if isinstance(source, dict) and source.get("type") == "shared_display":
            validate_display(source)
        else:
            validate_legacy("SourceSnapshot", source)
            if digest(source["text"].encode("utf-8")) != source["content_hash"]:
                raise ValueError("Source text hash mismatch")
        key = source_key(source)
        if key[0] != user_id or key in source_map:
            raise ValueError("Foreign or duplicate source snapshot")
        source_map[key] = source
    for frame in frames:
        validate_legacy("Frame", frame)
        if frame["user_id"] != user_id or frame["frame_id"] in frame_map:
            raise ValueError("Foreign or duplicate frame")
        frame_map[frame["frame_id"]] = frame
    records = batch["records"]
    if set(source_map) != {source_key(record["source"]) for record in records}:
        raise ValueError("Supply exactly the source versions referenced by this batch")
    if set(frame_map) - {record["frame_id"] for record in records}:
        raise ValueError("Unreferenced frame")
    for record in records:
        if record["scope"]["kind"] != "provisional_session":
            raise ValueError("Attempt scopes require a separate current relation/assistance boundary")
        key = source_key(record["source"])
        source = source_map[key]
        display = source["type"] == "shared_display"
        if display and any(source[field] != batch[field] for field in ("device_id", "session_id", "stream_id")):
            raise ValueError("Display source belongs to a different capture incarnation")
        for artifact in record["artifacts"]:
            owner = artifact_owners.setdefault(artifact["artifact_id"], key)
            if owner != key:
                raise ValueError("Artifact is bound to more than one source version")
        frame = frame_map.get(record["frame_id"])
        if frame is not None:
            if display:
                validate_display_record(source, batch, record["record_id"], frame)
            else:
                validate_record_frame(batch, record["record_id"], frame)
            if frame["representation"] == "screen_capture":
                artifact = next(a for a in record["artifacts"] if a["artifact_id"] == frame["artifact_id"])
                # Proposed binding validation, never a stored-binding/commit receipt.
                validate_capture_frame(batch, record["record_id"], frame, {
                    "contract_version": "0.2.2", "kind": "screen_image",
                    "source": record["source"], "artifact": artifact,
                })

    packet = {
        "kind": "internal_process_evidence", "user_id": user_id,
        "batch": {key: value for key, value in batch.items() if key != "records"},
        "evidence_scope": "supplied_batch", "ordering": "supplied_array_not_chronology",
        "authorization_status": "not_attested", "commit_status": "not_attested",
        "live_status": "not_attested", "provider_receipt": "not_attested",
        "presentation_permission": "not_granted", "capture_completeness": "unknown",
        "non_frame_artifacts": "references_only",
        "budget": {"max_metadata_bytes": max_metadata_bytes, "max_image_bytes": max_image_bytes,
                   "max_total_bytes": max_total_bytes, "max_pixels": max_pixels},
        "counts": {"supplied": len(records), "included": 0, "omitted": len(records)},
        "omission_reason": "metadata_budget", "items": [], "attached_bytes": max_total_bytes,
    }
    if len(canonical(packet)) > max_metadata_bytes:
        raise ValueError("Metadata budget cannot hold the empty envelope")
    for record in records:
        item = {"record": record, "source": source_map[source_key(record["source"])],
                "frame": frame_map.get(record["frame_id"]),
                "parents": [{"record_id": parent, "status": "outside_context_unknown"}
                            for parent in record["causal_parents"]],
                # This upper bound is replaced before returning, not an image claim.
                "image": {"status": "unsupported_image_variant", "media_type": "image/png",
                          "byte_length": max_image_bytes}}
        packet["items"].append(item)
        packet["counts"]["included"] += 1
        packet["counts"]["omitted"] -= 1
        if len(canonical(packet)) > max_metadata_bytes:
            packet["items"].pop()
            packet["counts"]["included"] -= 1
            packet["counts"]["omitted"] += 1

    included = {item["record"]["record_id"] for item in packet["items"]}
    total = 0
    for item in packet["items"]:
        for parent in item["parents"]:
            if parent["record_id"] in included:
                parent["status"] = "included"
        frame, source = item["frame"], item["source"]
        image = {"status": "missing_frame"}
        if source.get("access_status", "ready") != "ready":
            image = {"status": "source_unavailable"}
        elif frame is not None:
            artifact = next(a for a in item["record"]["artifacts"] if a["artifact_id"] == frame["artifact_id"])
            limit = min(max_image_bytes, max_total_bytes - total)
            if frame["representation"] == "dom_snapshot":
                image = {"status": "unobservable_pixels"}
            elif artifact["byte_length"] > limit:
                image = {"status": "byte_limit"}
            elif artifact["media_type"] != "image/png":
                image = {"status": "unsupported_media_type"}
            else:
                try:
                    image = _resolve_frame_image(frame, resolver, max_bytes=limit, max_pixels=max_pixels)
                except FutureCancelledError:
                    raise
                except PermissionError:
                    image = {"status": "revoked"}
                except FileNotFoundError:
                    image = {"status": "missing"}
                except Exception:
                    image = {"status": "resolver_failed"}
                if image["status"] == "attached":
                    if image["byte_length"] != artifact["byte_length"]:
                        image = {"status": "artifact_mismatch"}
                    else:
                        total += image["byte_length"]
        item["image"] = image
    packet["attached_bytes"] = total
    if digest(canonical(original_inputs)) != fingerprint:
        raise ValueError("Supplied metadata changed during composition; reacquire a coherent batch")
    return deepcopy(packet)
