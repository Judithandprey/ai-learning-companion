"""Bounded original-image materialization, without acquisition or provider delivery.

The caller supplies a freshly scoped assemble_context result and an authorized,
bounded artifact resolver. Nothing here opens a URL/path or grants lifecycle/help
permission. Images remain immutable original bytes, never rendered from text.
"""

from copy import deepcopy
import struct
import zlib

from .archive import canonical, digest, event_key, source_key
from .context import _snapshot_fingerprint


def _png_status(data, frame, max_pixels):
    """Validate a small static PNG subset, not a general-purpose image decoder.

    W3C PNG sections 5/9/10/11: RGB/RGBA 8-bit, non-interlaced, static pixels.
    Ancillary metadata is CRC-checked and retained opaque, never decompressed or
    used as evidence of pixel content. Unsupported variants are not converted.
    """
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "invalid_image"
    offset, header, compressed, ended = 8, None, bytearray(), False
    seen_data, data_closed, seen_palette = False, False, False
    while offset < len(data):
        if offset + 12 > len(data):
            return "invalid_image"
        length, kind = struct.unpack_from(">I4s", data, offset)
        if any(not (65 <= c <= 90 or 97 <= c <= 122) for c in kind) or kind[2] & 32:
            return "invalid_image"
        end = offset + 12 + length
        if end > len(data):
            return "invalid_image"
        chunk = data[offset + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        if zlib.crc32(kind + chunk) != crc:
            return "invalid_image"
        if kind == b"IHDR":
            if header is not None or offset != 8 or length != 13:
                return "invalid_image"
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunk)
            if not 0 < width <= 2**31 - 1 or not 0 < height <= 2**31 - 1:
                return "invalid_image"
            if (width, height) != (frame["width"], frame["height"]):
                return "dimension_mismatch"
            if width * height > max_pixels:
                return "pixel_limit"
            if depth != 8 or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0):
                return "unsupported_image_variant"
            header = width, height, 3 if color == 2 else 4
        elif header is None:
            return "invalid_image"
        elif kind == b"IDAT":
            if data_closed:
                return "invalid_image"
            seen_data = True
            compressed.extend(chunk)
        elif kind == b"IEND":
            if length or end != len(data) or not compressed:
                return "invalid_image"
            ended = True
            break
        else:
            if seen_data:
                data_closed = True
            if kind == b"PLTE":
                if seen_palette or seen_data or not 0 < length <= 768 or length % 3:
                    return "invalid_image"
                seen_palette = True
            elif not kind[0] & 32 or kind in (b"acTL", b"fcTL", b"fdAT"):
                return "unsupported_image_variant"
        offset = end
    if not ended:
        return "invalid_image"
    width, height, channels = header
    stride = 1 + width * channels  # One filter byte per scanline.
    expected = stride * height
    try:
        decoder = zlib.decompressobj()
        raw = decoder.decompress(compressed, expected + 1)
    except zlib.error:
        return "invalid_image"
    if (len(raw) != expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail
            or any(raw[row] > 4 for row in range(0, expected, stride))):
        return "invalid_image"
    return "attached"


def _validate_image_limits(max_image_bytes, max_total_bytes, max_pixels):
    for value, ceiling in ((max_image_bytes, 16 * 1024 * 1024),
                           (max_total_bytes, 64 * 1024 * 1024), (max_pixels, 16_000_000)):
        if type(value) is not int or not 0 < value <= ceiling:
            raise ValueError("Image limits must be positive bounded integers")


def _resolve_frame_image(frame, resolver, *, max_bytes, max_pixels):
    """Shared bounded result/PNG validation; resolver exceptions propagate."""
    if max_bytes == 0:
        return {"status": "byte_limit"}
    result = resolver(deepcopy(frame), max_bytes=max_bytes)
    if not isinstance(result, dict):
        raise ValueError("Malformed artifact resolver result")
    status = result.get("status")
    if status in ("missing", "revoked", "unavailable", "unobservable", "byte_limit"):
        return {"status": status}
    if status != "available":
        raise ValueError("Unknown artifact resolver status")
    if canonical(result.get("frame")) != canonical(frame):
        return {"status": "frame_mismatch"}
    data = result.get("data")
    if type(data) is not bytes:
        status = "invalid_image_bytes"
    elif not data or len(data) > max_bytes:
        status = "byte_limit"
    elif digest(data) != frame["content_hash"]:
        status = "hash_mismatch"
    elif result.get("media_type") != "image/png":
        status = "unsupported_media_type"
    else:
        status = _png_status(data, frame, max_pixels)
        if status == "attached":
            return {"status": status, "data": data, "media_type": "image/png", "byte_length": len(data)}
    return {"status": status}


def materialize_image_evidence(archive, context, resolver, *, user_id, capture_states=None,
                               max_image_bytes=4 * 1024 * 1024, max_total_bytes=8 * 1024 * 1024,
                               max_pixels=16_000_000):
    """Return per-context-item images/gaps linked to unchanged archive identities.

    resolver(detached_frame, *, max_bytes) returns either
    {status: available, frame: exact_frame, media_type: image/png, data: bytes}
    or {status: missing|revoked|unavailable|unobservable|byte_limit}.
    The resolver owns bounded reading and current authorization; it must not use
    this call as permission to fetch. Unexpected resolver exceptions propagate.

    capture_states maps (session_id, device_id) to active/stopped/disconnected/
    stale/unknown. Missing entries mean unknown. These caller-supplied restrictions
    never attest freshness. Explicit history is archived evidence even when capture
    stops; it still requires current artifact authorization. No shared wire format.
    """
    _validate_image_limits(max_image_bytes, max_total_bytes, max_pixels)
    if not callable(resolver) or not isinstance(user_id, str) or not user_id.strip():
        raise ValueError("Trusted user scope and callable artifact resolver required")
    states = {} if capture_states is None else deepcopy(capture_states)
    if not isinstance(states, dict) or any(
            type(key) is not tuple or len(key) != 2 or any(type(v) is not str for v in key)
            or value not in ("active", "stopped", "disconnected", "stale", "unknown")
            for key, value in states.items()):
        raise ValueError("Capture states must be keyed by session and device")
    packet = deepcopy(context)
    fingerprint = _snapshot_fingerprint(archive)
    if (not isinstance(packet, dict) or packet.get("kind") != "internal_evidence_context"
            or packet.get("user_id") != user_id or packet.get("archive_fingerprint") != fingerprint
            or not isinstance(packet.get("query"), dict) or packet["query"].get("mode") not in ("current", "history")
            or not isinstance(packet.get("items"), list)):
        raise ValueError("A current scoped context from the same archive is required")

    # Check every binding before invoking any resolver, including later items.
    seen = set()
    corrected = {(e["user_id"], e["correction_of"]) for e in archive.events.values() if e["correction_of"]}
    latest = {}
    for source in archive.sources.values():
        key = source["user_id"], source["source_id"]
        latest[key] = max(latest.get(key, 0), source["source_version"])
    for item in packet["items"]:
        evidence = item.get("evidence") if isinstance(item, dict) else None
        if not isinstance(evidence, dict):
            raise ValueError("Malformed context evidence")
        key = (evidence.get("user_id"), evidence.get("event_id"))
        if key[0] != user_id or type(key[1]) is not str or key in seen or key not in archive.events:
            raise ValueError("Context evidence identity mismatch")
        seen.add(key)
        expected = archive.evidence(key)
        if any(field not in evidence or canonical(evidence[field]) != canonical(value)
               for field, value in expected.items()):
            raise ValueError("Context evidence differs from original snapshot")
        historical = key in corrected or evidence["source_version"] != latest[(user_id, evidence["source_id"])]
        if item.get("snapshot_status") != ("historical" if historical else "current_candidate"):
            raise ValueError("Context snapshot status differs from original snapshot")

    items, total = [], 0
    for item in packet["items"]:
        evidence = item["evidence"]
        event = archive.events[event_key(evidence)]
        frame = evidence["frame"]
        state = states.get((event["session_id"], event["device_id"]), "unknown")
        reference = {field: deepcopy(evidence[field]) for field in
                     ("user_id", "source_id", "source_version", "source_hash", "event_id", "frame_id", "actor",
                      "captured_at", "media_position", "provenance", "gap_flags", "frame")}
        reference.update({field: deepcopy(event[field]) for field in
                          ("device_id", "device_sequence", "session_id", "received_at")})
        row = {"reference": reference, "snapshot_status": item["snapshot_status"],
               "context_mode": packet["query"]["mode"], "capture_state": state, "status": "missing_frame"}
        items.append(row)
        if archive.sources[source_key(event)]["access_status"] != "ready":
            row["status"] = "source_unavailable"
        elif packet["query"]["mode"] == "current" and state != "active":
            row["status"] = "capture_" + state
        elif frame is None or "missing_frame" in evidence["gap_flags"]:
            pass
        elif packet["query"]["mode"] == "current" and "stale_frame" in evidence["gap_flags"]:
            row["status"] = "stale_frame"
        elif frame["representation"] == "dom_snapshot":
            row["status"] = "unobservable_pixels"
        else:
            limit = min(max_image_bytes, max_total_bytes - total)
            row.update(_resolve_frame_image(frame, resolver, max_bytes=limit, max_pixels=max_pixels))
            if row["status"] == "attached":
                row["evidence_kind"] = ("synthetic_image" if (frame["representation"] == "synthetic_fixture"
                    or evidence["provenance"]["origin"] == "synthetic") else "screen_capture_record")
                total += row["byte_length"]
    if _snapshot_fingerprint(archive) != fingerprint:
        raise ValueError("Archive changed during image materialization; reassemble")
    return {"kind": "internal_image_evidence", "user_id": user_id, "archive_fingerprint": fingerprint,
            "context_budget": deepcopy(packet.get("budget")), "items": items, "attached_bytes": total,
            "live_status": "not_attested", "provider_receipt": "not_attested",
            "presentation_permission": "not_granted", "capture_completeness": "unknown"}
