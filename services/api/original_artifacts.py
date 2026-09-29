"""Internal source-bound original bytes; no HTTP, codec or capture activation.

All bytes and their binding live in the existing immutable artifact row. New
edits use new IDs; this layer never interprets or rewrites an ink document.
"""

import base64
from copy import deepcopy

from jsonschema import ValidationError

from packages.contracts.original_artifact import (
    CONTRACT_VERSION, decode_upload, validate, validate_bytes,
)
from services.api.domain import Archive, key
from services.api.errors import DomainError


def _validate(name, payload):
    try:
        validate(name, payload)
    except (ValidationError, ValueError, TypeError, RecursionError):
        raise DomainError(422, "invalid_contract") from None


def _source(tx, user_id, source):
    if source["user_id"] != user_id:
        raise DomainError(404, "source_not_found")
    current = Archive._source(tx, source["source_id"])
    snapshot = Archive._owned(tx, "snapshot", key(source["source_id"], int(source["source_version"])))
    if current.get("user_id") != user_id or snapshot.get("user_id") != user_id:
        raise DomainError(404, "source_not_found")
    if (current.get("source_id") != source["source_id"]
            or any(snapshot.get(field) != source[field] for field in ("source_id", "source_version"))):
        raise DomainError(503, "original_unavailable")
    from services.api.display_sources import is_display, load
    if is_display(current) or is_display(snapshot):
        return load(tx, user_id, source)
    return snapshot


def stored_upload(stored, user_id, artifact_id):
    """Validate both the authoritative typed binding and its legacy aliases."""
    try:
        binding = stored["original_binding"]
        upload = {**binding, "data_base64": stored["data_base64"]}
        decode_upload(upload, user_id=user_id)
        ref = binding["artifact"]
        expected = {"user_id": user_id, "id": artifact_id,
                    "kind": "ink" if binding["kind"] == "editable_ink" else "frame",
                    "content_hash": ref["sha256"], "byte_length": ref["byte_length"],
                    "media_type": ref["media_type"]}
        if ref["artifact_id"] != artifact_id or any(stored.get(k) != v for k, v in expected.items()):
            raise ValueError("inconsistent original metadata")
        return deepcopy(upload)
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "original_unavailable") from None


def is_typed(stored):
    # These aliases are written only by this seam for ink/frame rows. A lost
    # binding must not downgrade a typed original into a shareable legacy blob.
    if "original_binding" in stored:
        return True
    if stored.get("kind") in {"ink", "frame"} and ("byte_length" in stored or "media_type" in stored):
        raise DomainError(503, "original_unavailable")
    return False


def check_reference(tx, user_id, source, stored, artifact_id):
    """Extra ownership check only for typed rows; legacy semantics stay intact."""
    if tx.get("original_artifact_tombstone", artifact_id):
        raise DomainError(404, "original_not_found")
    if not is_typed(stored):
        return None
    upload = stored_upload(stored, user_id, artifact_id)
    if upload["source"] != source:
        raise DomainError(409, "original_source_conflict")
    _source(tx, user_id, source)
    return upload


def check_note(tx, user_id, note):
    """Typed ink cannot borrow another source/version's note or cached receipt."""
    artifact_id = note["ink_blob_id"]
    if artifact_id is None:
        return
    if tx.get("original_artifact_tombstone", artifact_id):
        raise DomainError(404, "original_not_found")
    stored = tx.get("artifact", artifact_id)
    # v1 metadata reads are not byte-read receipts. Preserve their legacy
    # behavior; ordinary note writes still require an existing ink row.
    if stored is None or not is_typed(stored):
        return
    upload = stored_upload(stored, user_id, artifact_id)
    if upload["kind"] != "editable_ink":
        raise DomainError(422, "invalid_ink")
    sources = {(s["source_id"], s["source_version"]) for s in note["context_segments"]}
    for event_id in note["source_event_ids"]:
        event = Archive._owned(tx, "event", event_id)
        sources.add((event["source_id"], event["source_version"]))
    source = upload["source"]
    if sources != {(source["source_id"], source["source_version"])}:
        raise DomainError(409, "original_source_conflict")
    check_reference(tx, user_id, source, stored, artifact_id)


def source_artifact_ids(tx, user_id, source_id):
    """Include uploads without references in the source's deletion transaction."""
    owned = set()
    for stored in tx.scan("artifact"):
        if not is_typed(stored):
            continue
        try:
            binding = stored["original_binding"]
            validate("OriginalArtifactBinding", binding)
            if binding["source"]["user_id"] != user_id or stored["user_id"] != user_id:
                raise ValueError("inconsistent owner")
            if binding["artifact"]["artifact_id"] != stored["id"]:
                raise ValueError("inconsistent artifact ID")
        except (ValidationError, ValueError, KeyError, TypeError, RecursionError):
            raise DomainError(503, "original_unavailable") from None
        if binding["source"]["source_id"] == source_id:
            owned.add(stored["id"])
    return owned


class OriginalArtifacts:
    def __init__(self, store, authorization_guard, *, display_authority_resolver=None):
        if not callable(authorization_guard):
            raise ValueError("a current caller authorization guard is required")
        self.store = store
        self.archive = Archive(store, authorization_guard=authorization_guard)
        self.display_authority_resolver = display_authority_resolver

    def put(self, user_id, source, kind, reference, original_bytes):
        try:
            binding = deepcopy({"contract_version": CONTRACT_VERSION, "source": source,
                                "kind": kind, "artifact": reference})
            validate_bytes(binding, original_bytes, user_id=user_id)
        except (ValidationError, ValueError, TypeError, RecursionError):
            raise DomainError(422, "invalid_contract") from None
        _validate("Identifier", user_id)
        source, reference = binding["source"], binding["artifact"]
        artifact_id = reference["artifact_id"]
        row = {"user_id": user_id, "id": artifact_id, "original_binding": binding,
               "kind": "ink" if kind == "editable_ink" else "frame",
               "content_hash": reference["sha256"], "byte_length": reference["byte_length"],
               "media_type": reference["media_type"],
               "data_base64": base64.b64encode(original_bytes).decode("ascii")}
        with self.store.transaction(user_id) as tx:
            self.archive._authorized(tx)
            snapshot = _source(tx, user_id, source)
            from services.api.display_sources import is_display, require_live
            if is_display(snapshot):
                require_live(tx, user_id, snapshot, self.display_authority_resolver)
            if (tx.get("original_artifact_tombstone", artifact_id)
                    or tx.get("capture_artifact_tombstone", artifact_id)):
                raise DomainError(404, "original_not_found")
            old = tx.get("artifact", artifact_id)
            if old is not None:
                if not is_typed(old):
                    raise DomainError(409, "original_identity_conflict")
                stored_upload(old, user_id, artifact_id)
            else:
                # IDs already referenced by older paths cannot acquire implicit
                # ownership. Upload typed originals before referencing them.
                from services.api.capture import capture_artifact_ids
                used = (tx.get("capture_artifact_ref", artifact_id) is not None
                        or any(r["artifact_id"] == artifact_id for r in tx.scan("frame"))
                        or any(r["ink_blob_id"] == artifact_id for r in tx.scan("note_revision"))
                        or artifact_id in capture_artifact_ids(tx))
                if used:
                    raise DomainError(409, "original_identity_conflict")
            self.archive._immutable(tx, "artifact", artifact_id, row)
        # A receipt is observable only after the actor transaction commits.
        return {**binding, "status": "bytes_committed"}

    def read(self, user_id, source, artifact_id):
        _validate("Identifier", user_id)
        _validate("Identifier", artifact_id)
        _validate("SourceRef", source)
        source = deepcopy(source)
        with self.store.transaction(user_id) as tx:
            self.archive._authorized(tx)
            _source(tx, user_id, source)
            stored = self.archive._owned(tx, "artifact", artifact_id)
            if not is_typed(stored):
                raise DomainError(404, "original_not_found")
            result = check_reference(tx, user_id, source, stored, artifact_id)
        return result
