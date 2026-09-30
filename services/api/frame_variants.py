"""Known retained raw descriptors; ingress must select its own strict contract."""

from jsonschema import ValidationError

from packages.contracts import capture_frame, desktop_frame, windows_frame, macos_frame
from packages.contracts import validate as validate_legacy
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
    """Compare common image facts on Mac admission/read, across retained families.

    Archive IDs and encoded hashes describe the same original regardless of its
    descriptor family. Compare only facts each family actually supplies; native
    paths, clocks, composition and Windows RGBA hashes are not common PNG facts.
    Mac paths retain their own native-session namespace. Reuse descriptors rather
    than a second index. Retained contradictions are damage, proposed ones are
    conflicts unless an exact committed replay already attests them.
    """
    identities, hashes, files = {}, {}, {}

    def remember_image(artifact_id, facts, refusal):
        for index, identity, values in (
            (identities, artifact_id, facts),
            (hashes, facts["sha256"], {k: v for k, v in facts.items() if k != "sha256"}),
        ):
            previous = index.setdefault(identity, {})
            if any(name in previous and previous[name] != value for name, value in values.items()):
                raise DomainError(*refusal)
            previous.update(values)

    def remember(frame, contract, refusal):
        contract.validate(frame)
        if contract in (capture_frame, desktop_frame):
            pictures = [{"artifact": frame["artifact"],
                         "width": frame["raw_width"], "height": frame["raw_height"]}]
        else:
            pictures = [frame["raw"]]
            if contract is macos_frame and frame["composition"]["kind"] == "composed":
                pictures.append(frame["composition"]["image"])
            elif contract is windows_frame and frame["composed"] is not None:
                pictures.append(frame["composed"]["image"])
        for picture in pictures:
            artifact = picture["artifact"]
            facts = {name: artifact[name] for name in ("sha256", "byte_length", "media_type")}
            facts.update(width=picture["width"], height=picture["height"])
            remember_image(artifact["artifact_id"], facts, refusal)
            if contract is macos_frame:
                native_file = (frame["profile"]["native_session_id"], picture["native_file"])
                native_facts = {**facts, "encoding": picture["encoding"]}
                if files.setdefault(native_file, native_facts) != native_facts:
                    raise DomainError(*refusal)

    try:
        for frame in tx.scan("frame"):
            validate_legacy("Frame", frame)
            # Legacy frames omit MIME/length. DOM and synthetic fixtures do not
            # promise PNG pixels; their viewport dimensions are not PNG facts.
            facts = {"sha256": frame["content_hash"]}
            if frame["representation"] == "screen_capture":
                facts.update(width=frame["width"], height=frame["height"])
            remember_image(frame["artifact_id"], facts, (503, "unavailable"))
        for frame in tx.scan("raw_capture_frame"):
            remember(frame, retained_raw_contract(frame), (503, "unavailable"))
        for frame in proposed:
            remember(frame, macos_frame, conflict)
    except (ValidationError, KeyError, ValueError, TypeError, RecursionError):
        raise DomainError(503, "unavailable") from None
