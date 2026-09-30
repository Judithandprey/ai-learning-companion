"""Known retained raw descriptors; ingress must select its own strict contract."""

from jsonschema import ValidationError

from packages.contracts import capture_frame, desktop_frame, windows_frame, macos_frame
from services.api.errors import DomainError


def retained_raw_contract(frame):
    """Select only released variants for shared archive lifecycle checks.

    This is not an input-version negotiation or a fallback for unknown shapes.
    Callers still validate the complete descriptor/binding with the result.
    """
    version = frame.get("contract_version") if type(frame) is dict else None
    if version == capture_frame.CONTRACT_VERSION:
        return capture_frame
    if version == desktop_frame.CONTRACT_VERSION:
        return desktop_frame
    if version == windows_frame.CONTRACT_VERSION:
        return windows_frame
    if version == macos_frame.CONTRACT_VERSION:
        return macos_frame
    raise ValueError("unknown retained raw frame version")


def raw_artifact_references(frame):
    """Validated distinct PNG references; malformed retained facts fail closed."""
    try:
        contract = retained_raw_contract(frame)
        contract.validate(frame)
        if contract not in (windows_frame, macos_frame):
            return [frame["artifact"]]
        images = [frame["raw"]]
        if contract is macos_frame and frame["composition"]["kind"] == "composed":
            images.append(frame["composition"]["image"])
        elif contract is windows_frame and frame["composed"] is not None:
            images.append(frame["composed"]["image"])
        return list({image["artifact"]["artifact_id"]: image["artifact"] for image in images}.values())
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None


def validate_raw_binding(batch, record_id, frame, source, bindings):
    """Use each released variant's exact binding signature without conversion."""
    contract = retained_raw_contract(frame)
    contract.validate_binding(batch, record_id, frame, source,
                              bindings if contract in (windows_frame, macos_frame) else bindings[0])


def check_windows_image_consistency(tx, proposed=(), *, conflict=(409, "record_conflict")):
    """Compare declarations under the actor lock, without decoding any pixels.

    Reuse retained descriptors rather than a second mutable image-fact index.
    This scans this actor's raw-frame metadata once, including unselected images.
    Existing contradictions are unavailable; new conflicting declarations cannot
    change originals. Composition context is deliberately not image identity.
    """
    identities, files = {}, {}

    def remember(frame, refusal):
        windows_frame.validate(frame)
        pictures = [frame["raw"]]
        if frame["composed"] is not None:
            pictures.append(frame["composed"]["image"])
        for picture in pictures:
            artifact = picture["artifact"]
            previous = identities.setdefault(artifact["artifact_id"], picture)
            if previous != picture:
                raise DomainError(*refusal)
            facts = (artifact["byte_length"], picture["width"], picture["height"],
                     picture["pixels_sha256"])
            # The released validator binds native_file exactly to this digest.
            # Different archive IDs or image roles do not create different bytes.
            if files.setdefault(artifact["sha256"], facts) != facts:
                raise DomainError(*refusal)

    try:
        for frame in tx.scan("raw_capture_frame"):
            if retained_raw_contract(frame) is windows_frame:
                remember(frame, (503, "unavailable"))
        for frame in proposed:
            remember(frame, conflict)
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None


def check_macos_image_consistency(tx, proposed=(), *, conflict=(409, "record_conflict")):
    """Compare Mac image facts across batches in the existing actor transaction.

    Native paths belong to their native session, while archive identities and
    hashes describe immutable PNGs. Reuse descriptors rather than a second index.
    Previously retained contradictions are damage; proposed contradictions are
    client conflicts unless an exact committed replay already attests them.
    """
    identities, hashes, files = {}, {}, {}

    def remember(frame, refusal):
        macos_frame.validate(frame)
        pictures = [frame["raw"]]
        if frame["composition"]["kind"] == "composed":
            pictures.append(frame["composition"]["image"])
        for picture in pictures:
            artifact = picture["artifact"]
            facts = (artifact["sha256"], artifact["byte_length"], artifact["media_type"],
                     picture["width"], picture["height"], picture["encoding"])
            if identities.setdefault(artifact["artifact_id"], facts) != facts:
                raise DomainError(*refusal)
            if hashes.setdefault(artifact["sha256"], facts[1:]) != facts[1:]:
                raise DomainError(*refusal)
            native_file = (frame["profile"]["native_session_id"], picture["native_file"])
            if files.setdefault(native_file, facts) != facts:
                raise DomainError(*refusal)

    try:
        for frame in tx.scan("raw_capture_frame"):
            if retained_raw_contract(frame) is macos_frame:
                remember(frame, (503, "unavailable"))
        for frame in proposed:
            remember(frame, conflict)
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None
