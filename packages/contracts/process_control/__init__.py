"""Explicit additive process-control namespace; default v0.1 and capture v0.2 stay unchanged."""

from .validation import (
    CAPABILITY, CONTRACT_VERSION, ControlAuthority, capture_authority,
    register_stream, transition_stream, validate,
)

__all__ = ["CAPABILITY", "CONTRACT_VERSION", "ControlAuthority", "capture_authority",
           "register_stream", "transition_stream", "validate"]
