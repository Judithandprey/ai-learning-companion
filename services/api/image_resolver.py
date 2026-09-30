"""Currently authorized image bytes for Learning's internal image materializer.

This callable performs point reads in one existing actor transaction. Detached
archive bytes are never consulted. Availability is not capture freshness, teaching
permission, image decoding, or provider delivery; the consumer keeps those gates.
"""

import base64
from concurrent.futures import CancelledError as FutureCancelledError
from copy import deepcopy
import hashlib

from packages.contracts.capture_frame import validate as validate_raw_frame
from packages.contracts.desktop_frame import validate as validate_desktop_frame
from packages.contracts.windows_frame import validate as validate_windows_frame
from packages.contracts.original_artifact import MAX_ARTIFACT_BYTES, validate as validate_original
from packages.contracts.process_v2 import validate as validate_process
from services.api.domain import Archive, checked, fingerprint, key
from services.api.errors import DomainError
from services.api.original_artifacts import check_reference, is_typed
from services.api.display_sources import is_display, load as load_display
from services.api.frame_variants import check_windows_image_consistency, raw_artifact_references


def _raw_original_binding(stored, user_id, frame, reference=None):
    """Check retained original metadata only, without decoding its blob column."""
    if stored is None:
        raise DomainError(503, "unavailable")
    if stored.get("user_id") != user_id:
        raise DomainError(404, "not_found")
    binding = stored.get("original_binding")
    validate_original("OriginalArtifactBinding", binding)
    reference = frame["artifact"] if reference is None else reference
    expected = {"id": reference["artifact_id"], "kind": "frame",
                "content_hash": reference["sha256"], "byte_length": reference["byte_length"],
                "media_type": "image/png"}
    if (binding["kind"] != "screen_image" or binding["source"] != frame["source"]
            or binding["artifact"] != reference or type(stored.get("byte_length")) is bool
            or any(stored.get(name) != value for name, value in expected.items())):
        raise DomainError(503, "unavailable")
    return binding


class AuthorizedImageResolver:
    def __init__(self, store, user_id, authorization_guard):
        checked("Identifier", user_id)
        if not callable(authorization_guard):
            raise ValueError("a current caller authorization guard is required")
        self.store = store
        self.user_id = user_id
        self.archive = Archive(store, authorization_guard=authorization_guard)

    def __call__(self, detached_frame, *, max_bytes):
        return self._call(detached_frame, max_bytes, raw=False)

    def resolve_raw(self, detached_frame, *, max_bytes):
        """Return exact raw PNG bytes and 0.2.5 metadata, without orientation edits.

        This is a separate current authorization boundary. Callers must preserve
        unknown capture time and unapplied orientation through later final use.
        """
        return self._call(detached_frame, max_bytes, raw=True)

    def resolve_desktop(self, detached_frame, *, max_bytes):
        """Return exact PNG bytes and 0.2.7 metadata, preserving native unknowns.

        No pixel rotation, image decoding or clock conversion occurs here.
        Current authorization is checked independently of prior metadata reads.
        """
        return self._call(detached_frame, max_bytes, raw=True, desktop=True)

    def resolve_windows(self, detached_frame, *, image_role, max_bytes):
        """Resolve one explicitly selected original PNG from a complete 0.2.9 frame.

        Raw and composed remain distinct even when they share identical bytes.
        A missing composition never substitutes the raw image or editable ink.
        """
        return self._call(detached_frame, max_bytes, raw=True, windows=True,
                          image_role=image_role)

    def _call(self, detached_frame, max_bytes, *, raw, desktop=False,
              windows=False, image_role=None):
        if type(max_bytes) is not int or max_bytes <= 0:
            raise ValueError("max_bytes must be a positive integer")
        limit = min(max_bytes, MAX_ARTIFACT_BYTES)
        try:
            if windows and (type(image_role) is not str or image_role not in ("raw", "composed")):
                return {"status": "unavailable"}
            frame = deepcopy(detached_frame)
            if raw:
                validate_frame = (validate_windows_frame if windows else
                                  validate_desktop_frame if desktop else validate_raw_frame)
                validate_frame(frame)
            else:
                checked("Frame", frame)
            if (frame["source"]["user_id"] if raw else frame["user_id"]) != self.user_id:
                return {"status": "unavailable"}
            with self.store.transaction(self.user_id) as tx:
                state = tx.get("authorization", "state")
                if state is not None and (type(state.get("enabled")) is not bool
                        or type(state.get("generation")) is not int or state["generation"] <= 0):
                    return {"status": "unavailable"}
                self.archive._authorized(tx)
                result = self._resolve(tx, frame, limit, raw=raw, desktop=desktop,
                                       windows=windows, image_role=image_role)
                if raw:
                    self.archive._authorized(tx)
            return result
        except DomainError as error:
            status = {401: "revoked", 403: "revoked", 404: "missing"}.get(error.status, "unavailable")
            return {"status": status}
        except FutureCancelledError:
            # Do not let cancellation become an image gap in a partial result.
            raise
        except Exception:
            # A storage/guard/transaction failure must never fall back to bytes
            # retained in an older Learning snapshot or expose exception details.
            return {"status": "unavailable"}

    def _resolve(self, tx, requested, limit, *, raw=False, desktop=False,
                 windows=False, image_role=None):
        if raw and tx.get("frame_tombstone", requested["frame_id"]) is not None:
            return {"status": "missing"}
        frame = tx.get("raw_capture_frame" if raw else "frame", requested["frame_id"])
        if raw and tx.get("frame", requested["frame_id"]) is not None:
            return {"status": "unavailable"}
        if frame is None:
            return {"status": "missing"}
        if raw:
            validate_frame = (validate_windows_frame if windows else
                              validate_desktop_frame if desktop else validate_raw_frame)
            validate_frame(frame)
        else:
            checked("Frame", frame)
        if fingerprint(frame) != fingerprint(requested):
            return {"status": "unavailable"}
        reference = frame["source"] if raw else frame
        source_id, version = reference["source_id"], reference["source_version"]
        source = tx.get("source", source_id)
        if source is None:
            return {"status": "missing"}
        if (source.get("user_id") != self.user_id or source.get("source_id") != source_id
                or type(source.get("deleted")) is not bool or type(source.get("revoked")) is not bool):
            return {"status": "unavailable"}
        self.archive._source(tx, source_id)
        snapshot = tx.get("snapshot", key(source_id, int(version)))
        if snapshot is None:
            return {"status": "missing"}
        binding = {"user_id": self.user_id, "source_id": source_id, "source_version": version}
        display = is_display(source) or is_display(snapshot)
        if raw and not display:
            return {"status": "unavailable"}
        if display:
            snapshot = load_display(tx, self.user_id, binding)
            fields = ("device_id", "session_id", "stream_id") if raw else ("device_id", "session_id")
            if (any(frame[k] != snapshot[k] for k in fields)
                    or (not raw and frame["representation"] != "screen_capture")):
                return {"status": "unavailable"}
            if raw:
                expected = {name: frame[name] for name in fields}
                expected.update(user_id=self.user_id,
                                authorization_generation=source["authorization_generation"])
                capture_binding = tx.get("capture_binding", frame["stream_id"])
                if (capture_binding != expected
                        or type(capture_binding.get("authorization_generation")) is not int):
                    return {"status": "unavailable"}
        else:
            checked("SourceRecord", self.archive._registration(source))
            checked("SourceSnapshot", snapshot)
            if (any(snapshot[k] != v for k, v in binding.items())
                    or hashlib.sha256(snapshot["text"].encode("utf-8")).hexdigest() != snapshot["content_hash"]
                    or snapshot["access_status"] != "ready"):
                return {"status": "unavailable"}
        for kind in ("device", "session"):
            record_id = frame[kind + "_id"]
            row = tx.get(kind, record_id)
            if row is None or row.get("user_id") != self.user_id or row.get("id") != record_id:
                return {"status": "unavailable"}
        if not raw and frame["representation"] == "dom_snapshot":
            return {"status": "unobservable"}
        if windows:
            check_windows_image_consistency(tx)
            # Reauthorize the complete retained descriptor, including the image
            # not selected for decoding. A partial archive is not a full frame.
            for image_reference in raw_artifact_references(frame):
                image_id = image_reference["artifact_id"]
                if any(tx.get(kind, image_id) is not None for kind in
                       ("original_artifact_tombstone", "capture_artifact_tombstone")):
                    return {"status": "missing"}
                pin = tx.get("capture_artifact_ref", image_id)
                validate_process("ArtifactReference", pin)
                if pin != image_reference:
                    return {"status": "unavailable"}
                _raw_original_binding(tx.get("artifact", image_id), self.user_id,
                                      frame, image_reference)
            if image_role == "composed" and frame["composed"] is None:
                return {"status": "unobservable"}
            picture = frame["raw"] if image_role == "raw" else frame["composed"]["image"]
            artifact_reference = picture["artifact"]
        else:
            artifact_reference = frame["artifact"] if raw else None
        artifact_id = artifact_reference["artifact_id"] if raw else frame["artifact_id"]
        content_hash = artifact_reference["sha256"] if raw else frame["content_hash"]
        if raw:
            deleted = any(tx.get(kind, artifact_id) is not None for kind in
                          ("original_artifact_tombstone", "capture_artifact_tombstone"))
        else:
            deleted = (tx.get("original_artifact_tombstone", artifact_id)
                       or tx.get("capture_artifact_tombstone", artifact_id))
        if deleted:
            return {"status": "missing"}
        stored = tx.get("artifact", artifact_id)
        if stored is None:
            return {"status": "missing"}
        if (stored.get("user_id") != self.user_id or stored.get("id") != artifact_id
                or stored.get("kind") != "frame" or stored.get("content_hash") != content_hash):
            return {"status": "unavailable"}
        if raw:
            pin = tx.get("capture_artifact_ref", artifact_id)
            validate_process("ArtifactReference", pin)
            if pin != artifact_reference:
                return {"status": "unavailable"}
            _raw_original_binding(stored, self.user_id, frame, artifact_reference)
        encoded = stored.get("data_base64")
        if type(encoded) is not str:
            return {"status": "unavailable"}
        typed = is_typed(stored)
        if display and not typed:
            return {"status": "unavailable"}
        # The existing JSON document store loads a row as a whole. Bound the
        # decoded allocation before decoding; no large-row storage redesign here.
        if len(encoded) > 4 * ((limit + 2) // 3):
            return {"status": "byte_limit"}
        if len(encoded) % 4:
            return {"status": "unavailable"}
        padding = 2 if encoded.endswith("==") else 1 if encoded.endswith("=") else 0
        if len(encoded) // 4 * 3 - padding > limit:
            return {"status": "byte_limit"}
        if typed:
            upload = check_reference(tx, self.user_id, binding, stored, artifact_id)
            if upload["kind"] != "screen_image" or upload["artifact"]["media_type"] != "image/png":
                return {"status": "unobservable"}
        data = base64.b64decode(encoded, validate=True)
        if base64.b64encode(data).decode("ascii") != encoded:
            return {"status": "unavailable"}
        if len(data) > limit:
            return {"status": "byte_limit"}
        if not data or hashlib.sha256(data).hexdigest() != content_hash:
            return {"status": "unavailable"}
        # Legacy rows have no MIME label. Inspect actual bytes, not URL suffixes,
        # detached metadata or guessed OCR/rendering. Learning validates PNG pixels.
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return {"status": "unobservable"}
        result = {"status": "available", "frame": deepcopy(frame), "media_type": "image/png", "data": data}
        if windows:
            result["image_role"] = image_role
        return result
