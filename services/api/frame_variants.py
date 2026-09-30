"""Known retained raw descriptors; ingress must select its own strict contract."""

from packages.contracts import capture_frame, desktop_frame


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
    raise ValueError("unknown retained raw frame version")
