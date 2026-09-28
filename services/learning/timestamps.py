"""Exact comparison keys for the contract's UTC timestamps, without rounding."""

from datetime import datetime, timezone
import re

_UTC = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?Z")


def utc_instant_key(value: str) -> tuple[datetime, str]:
    """Return calendar seconds plus an exact normalized fractional-second key.

    Contract v0.1.0 accepts arbitrary decimal precision. datetime/float conversion
    of the full timestamp would lose digits beyond microsecond/float precision.
    Instead validate whole seconds with datetime and retain fractional digits as
    a string. Removing trailing zeroes makes .0/.000/absent fractions equal.
    Lexicographic order of these normalized digit strings is exact: a shorter
    prefix has only implicit zeroes, while a longer normalized suffix eventually
    contains a nonzero digit. No decimal context or integer-size limit is needed.
    This key is derived only; original timestamp strings remain untouched.
    """
    match = _UTC.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        raise ValueError("Expected a contract UTC timestamp ending in Z")
    whole_seconds = datetime(*(int(part) for part in match.groups()[:6]), tzinfo=timezone.utc)
    fraction = (match[7] or "").rstrip("0")
    return whole_seconds, fraction
