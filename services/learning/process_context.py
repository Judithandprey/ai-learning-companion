"""Bounded supplied process evidence; no storage, acquisition or permission grant."""

from copy import deepcopy
from concurrent.futures import CancelledError as FutureCancelledError

from packages.contracts import validate as validate_legacy
from packages.contracts.capture_frame import validate as validate_raw, validate_binding as validate_raw_binding
from packages.contracts.desktop_frame import validate as validate_desktop, validate_binding as validate_desktop_binding
from packages.contracts.display_source import validate as validate_display, validate_display_record
from packages.contracts.macos_frame import validate as validate_macos, validate_binding as validate_macos_binding
from packages.contracts.original_artifact import validate_capture_frame
from packages.contracts.process_v2 import validate as validate_process, validate_record_frame
from packages.contracts.windows_frame import validate as validate_windows, validate_binding as validate_windows_binding

from .archive import canonical, digest, source_key
from .images import _resolve_frame_image, _validate_image_limits


def _is_raw_frame(frame):
    return isinstance(frame, dict) and (frame.get("kind") == "raw_capture_frame"
                                      or frame.get("contract_version") in ("0.2.5", "0.2.7"))


def _is_windows_frame(frame):
    return isinstance(frame, dict) and frame.get("contract_version") == "0.2.9"


def _is_macos_frame(frame):
    return isinstance(frame, dict) and frame.get("contract_version") == "0.2.11"


def _composed_picture(frame):
    if _is_macos_frame(frame):
        result = frame["composition"]
        return result["image"] if result["kind"] == "composed" else None
    return frame["composed"]["image"] if frame["composed"] else None


def _composition_gap(frame):
    if _is_macos_frame(frame):
        result = frame["composition"]
        return {"status": result["kind"], "reason": result["reason"]}
    return {"status": "not_present"}


def prepare_stored_process_context(record_ids, reader, resolver, *, user_id, windows_resolver=None, macos_resolver=None,
                                   max_metadata_bytes=64 * 1024, max_image_bytes=4 * 1024 * 1024,
                                   max_total_bytes=8 * 1024 * 1024, max_pixels=16_000_000):
    """Prepare stored evidence only if a final complete authorized read agrees.

    Inject the current-authorized Backend reader and image resolver. Windows/Mac
    retained frames require windows_resolver/macos_resolver with raw/composed roles.
    The reader
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
        windows_resolver=windows_resolver, macos_resolver=macos_resolver,
        max_metadata_bytes=max_metadata_bytes, max_image_bytes=max_image_bytes,
        max_total_bytes=max_total_bytes, max_pixels=max_pixels)
    final_snapshot = reader(list(selection), max_metadata_bytes=4 * 1024 * 1024)
    if canonical(final_snapshot) != original_metadata:
        raise ValueError("Stored metadata changed during preparation; packet withheld")
    return packet


def prepare_observation_window(record_ids, reader, resolver, *, user_id, windows_resolver=None, macos_resolver=None,
                               max_metadata_bytes=64 * 1024, max_image_bytes=4 * 1024 * 1024,
                               max_total_bytes=8 * 1024 * 1024, max_pixels=16_000_000):
    """Retain an explicit stored selection and compare its adjacent observations.

    Uses the same authorized readers, original-image checks and final full-selection
    recheck as prepare_stored_process_context. No deduplication, reordering, inferred
    intervening steps or archive scan. Every requested record must fit the metadata
    budget, including this comparison result, or the whole window is withheld.
    Image/decoder limits and unavailable bytes remain per-record gaps, never removals.

    Adjacency means caller selection order, not consecutive capture or chronology.
    Byte equality compares only attached original bytes, not hashes or image meaning.
    Windows/Mac pairs label the existing image comparison as raw and compare composed
    attachments separately; an absent composition or frameless item stays unknown.
    Same-domain clock subtraction describes recorded readings, not capture intervals,
    causality, freshness or certainty about order. Raw callback clocks stay distinct
    from other record clocks. Original sources, reasons, parents and ink refs remain
    intact; no diagnosis, teaching permission, model call or provider receipt results.
    Later dispatch/presentation still needs its own current access/help checks.
    """
    packet = prepare_stored_process_context(record_ids, reader, resolver, user_id=user_id,
        windows_resolver=windows_resolver, macos_resolver=macos_resolver,
        max_metadata_bytes=max_metadata_bytes, max_image_bytes=max_image_bytes,
        max_total_bytes=max_total_bytes, max_pixels=max_pixels)
    if packet["counts"]["omitted"]:
        raise ValueError("Observation window metadata limit would omit requested records; window withheld")
    comparisons = []
    for left, right in zip(packet["items"], packet["items"][1:]):
        comparison = {
            "left_record_id": left["record"]["record_id"],
            "right_record_id": right["record"]["record_id"],
            "source_reference": "identical" if left["record"]["source"] == right["record"]["source"] else "different",
            "source_snapshot": "identical" if left["source"] == right["source"] else "different",
            "retained_image_bytes": _compare_image_bytes(left["image"], right["image"]),
            "clock_readings": _compare_observation_clocks(left, right),
        }
        if "composed_image" in left or "composed_image" in right:
            comparison["retained_image_role"] = "raw"
            comparison["retained_composed_image_bytes"] = _compare_image_bytes(
                left.get("composed_image"), right.get("composed_image"))
        comparisons.append(comparison)
    packet["observation_window"] = {
        "selection": "all_explicit_record_ids",
        "adjacency": "requested_order_not_chronology",
        "capture_chronology": "unknown", "capture_intervals": "unknown",
        "semantic_change": "not_inferred", "user_reasoning": "not_inferred",
        "comparisons": comparisons,
    }
    # Include comparison metadata in the same ceiling without serializing PNGs.
    if len(canonical(_process_metadata(packet))) > max_metadata_bytes:
        raise ValueError("Observation window comparison metadata exceeds limit; window withheld")
    return packet


def _process_metadata(packet):
    """Remove only the two known binary payloads; retain role/status/byte metadata."""
    return {**packet, "items": [
        {key: ({name: value for name, value in field.items() if name != "data"}
               if key in ("image", "composed_image") else field)
         for key, field in item.items()}
        for item in packet["items"]
    ]}


def _compare_image_bytes(left, right):
    if left is None or right is None or left["status"] != "attached" or right["status"] != "attached":
        return "unknown"
    return "identical" if left["data"] == right["data"] else "different"


def _compare_observation_clocks(left, right):
    clocks = []
    for item in (left, right):
        frame = item["frame"]
        if frame is not None and frame.get("contract_version") in ("0.2.7", "0.2.9", "0.2.11"):
            # Native host/presentation readings have no released Process domain.
            # Even matching native-session strings do not authorize comparison.
            return {"status": "unknown", "reason": "no_process_capture_clock"}
        clocks.append(("raw_callback_clock", frame["timing"]["callback_clock"]) if _is_raw_frame(frame)
                      else ("record_clock", item["record"]["clock"]))
    (left_basis, a), (right_basis, b) = clocks
    if a is None or b is None:
        return {"status": "unknown", "reason": "missing_clock"}
    if left_basis != right_basis:
        return {"status": "unknown", "reason": "different_clock_basis"}
    if a["domain_id"] != b["domain_id"]:
        return {"status": "unknown", "reason": "different_clock_domain"}
    return {"status": "comparable_readings", "basis": left_basis, "domain_id": a["domain_id"],
            "right_minus_left_ms": b["elapsed_ms"] - a["elapsed_ms"],
            "left_uncertainty_ms": a["uncertainty_ms"], "right_uncertainty_ms": b["uncertainty_ms"]}


def compose_process_context(batch, sources, frames, resolver, *, user_id, windows_resolver=None, macos_resolver=None,
                            max_metadata_bytes=64 * 1024, max_image_bytes=4 * 1024 * 1024,
                            max_total_bytes=8 * 1024 * 1024, max_pixels=16_000_000):
    """Compose complete records from an actual supplied ProcessBatch (0.2.0).

    sources/frames are lists or tuples of exact snapshots/frames, not archive row
    envelopes. RawCaptureFrame 0.2.5 and DesktopFrame 0.2.7 require shared_display
    and retain raw pixels, unapplied orientation and unknown capture time. Desktop
    native host facts do not become Process clocks. WindowsFrame 0.2.9 requires
    windows_resolver and retains raw/composed images separately, including absence
    of composition. MacRetainedFrame 0.2.11 requires macos_resolver, retaining its
    composed/not_composed/unknown outcome. Exact versions select each validator;
    their shared retained_capture_frame kind does not select a platform.
    Both attachments count toward the total byte ceiling, even
    when identical. Only provisional_session is
    supported. All metadata is validated before byte resolution, including records
    later omitted by the budget.
    A missing named frame is a gap; extra frames/sources and missing sources fail.

    Caller must obtain coherent, currently authorized metadata transactionally,
    then recheck permission at final use. The resolver authorizes bytes only, not
    metadata. Historical/supplied values never attest current/live capture, commit,
    provider delivery, user intent, editable ink or presentation permission.

    Metadata budget covers canonical UTF-8 JSON of the entire returned dictionary
    with only item.image.data and item.composed_image.data removed. Binary bytes
    have separate image ceilings and a combined total ceiling.
    Conservative image/parent metadata reservation admits whole items in supplied
    array order (not chronology), skipping those that cannot fit. No truncation.
    Resolver exceptions become explicit gaps; cancellation/BaseException propagates.
    """
    validate_legacy("Identifier", user_id)
    if not callable(resolver):
        raise ValueError("A bounded authorized image resolver is required")
    if windows_resolver is not None and not callable(windows_resolver):
        raise ValueError("Windows image resolver must be callable")
    if macos_resolver is not None and not callable(macos_resolver):
        raise ValueError("Mac image resolver must be callable")
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
        if _is_macos_frame(frame):
            validate_macos(frame)
            if macos_resolver is None:
                raise ValueError("Mac frames require an explicit macos_resolver")
            owner = frame["source"]["user_id"]
        elif _is_windows_frame(frame):
            validate_windows(frame)
            if windows_resolver is None:
                raise ValueError("Windows frames require an explicit windows_resolver")
            owner = frame["source"]["user_id"]
        elif _is_raw_frame(frame):
            validate_frame = validate_desktop if frame.get("contract_version") == "0.2.7" else validate_raw
            validate_frame(frame)
            owner = frame["source"]["user_id"]
        else:
            validate_legacy("Frame", frame)
            owner = frame["user_id"]
        if owner != user_id or frame["frame_id"] in frame_map:
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
            if _is_windows_frame(frame) or _is_macos_frame(frame):
                if not display:
                    raise ValueError("Retained desktop frames require a shared-display source")
                composed = _composed_picture(frame)
                pictures = [frame["raw"]] + ([composed] if composed is not None else [])
                refs = {picture["artifact"]["artifact_id"]: picture["artifact"] for picture in pictures}
                validate_binding = validate_macos_binding if _is_macos_frame(frame) else validate_windows_binding
                # Proposed-reference binding, not a stored-original/commit receipt.
                validate_binding(batch, record["record_id"], frame, source, [
                    {"contract_version": "0.2.2", "kind": "screen_image", "source": record["source"],
                     "artifact": artifact} for artifact in refs.values()
                ])
            elif _is_raw_frame(frame):
                if not display:
                    raise ValueError("Raw captured frames require a shared-display source")
                # Pure proposed-reference binding, not a stored-original receipt.
                validate_binding = (validate_desktop_binding if frame["contract_version"] == "0.2.7"
                                    else validate_raw_binding)
                validate_binding(batch, record["record_id"], frame, source, {
                    "contract_version": "0.2.2", "kind": "screen_image",
                    "source": record["source"], "artifact": frame["artifact"],
                })
            elif display:
                validate_display_record(source, batch, record["record_id"], frame)
            else:
                validate_record_frame(batch, record["record_id"], frame)
            if not (_is_raw_frame(frame) or _is_windows_frame(frame) or _is_macos_frame(frame)) and frame["representation"] == "screen_capture":
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
        if _is_raw_frame(item["frame"]):
            item.update(pixel_orientation="raw_unapplied", provider_image_alignment="not_attested")
        elif _is_windows_frame(item["frame"]) or _is_macos_frame(item["frame"]):
            composed = (_composition_gap(item["frame"])
                        if _is_macos_frame(item["frame"]) and _composed_picture(item["frame"]) is None
                        else item["image"])
            item["composed_image"] = {**composed, "image_role": "composed"}
            item["image"]["image_role"] = "raw"
            item["provider_image_alignment"] = "not_attested"
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
        if _is_windows_frame(frame) or _is_macos_frame(frame):
            image_resolver = macos_resolver if _is_macos_frame(frame) else windows_resolver
            for role, picture in (("raw", frame["raw"]), ("composed", _composed_picture(frame))):
                if picture is None:
                    image = _composition_gap(frame)
                elif source.get("access_status", "ready") != "ready":
                    image = {"status": "source_unavailable"}
                else:
                    image = _process_image(frame, picture["artifact"], (picture["width"], picture["height"]),
                        image_resolver, min(max_image_bytes, max_total_bytes - total), max_pixels, image_role=role)
                if image["status"] == "attached":
                    total += image["byte_length"]
                item["image" if role == "raw" else "composed_image"] = {**image, "image_role": role}
            continue
        image = {"status": "missing_frame"}
        if source.get("access_status", "ready") != "ready":
            image = {"status": "source_unavailable"}
        elif frame is not None:
            raw = _is_raw_frame(frame)
            artifact = (frame["artifact"] if raw else
                        next(a for a in item["record"]["artifacts"] if a["artifact_id"] == frame["artifact_id"]))
            dimensions = (frame["raw_width"], frame["raw_height"]) if raw else (frame["width"], frame["height"])
            limit = min(max_image_bytes, max_total_bytes - total)
            if not raw and frame["representation"] == "dom_snapshot":
                image = {"status": "unobservable_pixels"}
            else:
                image = _process_image(frame, artifact, dimensions, resolver, limit, max_pixels)
                if image["status"] == "attached":
                    total += image["byte_length"]
        item["image"] = image
    packet["attached_bytes"] = total
    if digest(canonical(original_inputs)) != fingerprint:
        raise ValueError("Supplied metadata changed during composition; reacquire a coherent batch")
    return deepcopy(packet)


def _process_image(frame, artifact, dimensions, resolver, limit, max_pixels, *, image_role=None):
    if artifact["byte_length"] > limit:
        return {"status": "byte_limit"}
    if artifact["media_type"] != "image/png":
        return {"status": "unsupported_media_type"}
    try:
        image = _resolve_frame_image(frame, resolver, max_bytes=limit, max_pixels=max_pixels,
            content_hash=artifact["sha256"], dimensions=dimensions, image_role=image_role)
    except FutureCancelledError:
        raise
    except PermissionError:
        return {"status": "revoked"}
    except FileNotFoundError:
        return {"status": "missing"}
    except Exception:
        return {"status": "resolver_failed"}
    if image["status"] == "attached" and image["byte_length"] != artifact["byte_length"]:
        return {"status": "artifact_mismatch"}
    return image
