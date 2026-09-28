"""Versioned transport shapes and local invariants; no persistence or providers."""

from .validation import CONTRACT_VERSION, validate, validate_selection_frame

__all__ = ["CONTRACT_VERSION", "validate", "validate_selection_frame"]
