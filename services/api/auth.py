"""Explicit, injectable local-test identity adapter; never a production login."""

from dataclasses import dataclass
from datetime import datetime
from threading import RLock
from typing import Mapping, Protocol

from services.api.errors import DomainError


@dataclass(frozen=True)
class Principal:
    user_id: str
    scopes: frozenset[str]
    expires_at: datetime
    actor: str = "user"
    authorization_generation: int = 1

    def __post_init__(self):
        if not self.user_id or self.actor not in {"user", "assistant"}:
            raise ValueError("Invalid principal identity or actor")
        if self.expires_at.tzinfo is None or self.expires_at.utcoffset() is None:
            raise ValueError("Principal expiry must include a timezone")
        if type(self.authorization_generation) is not int or self.authorization_generation < 1:
            raise ValueError("Invalid authorization generation")
        object.__setattr__(self, "scopes", frozenset(self.scopes))


class Authenticator(Protocol):
    def authenticate(self, token: str, now: datetime) -> Principal: ...


class LocalTestAuthenticator:
    """Caller supplies fixture tokens explicitly. No default token or env login.

    Persisted user authorization and its generation are independently checked
    inside each operation's storage transaction. Revoking a token here is useful
    for local HTTP tests; it is not OAuth or a real provider connection.
    """

    def __init__(self, tokens: Mapping[str, Principal]):
        if any(not token or any(character.isspace() for character in token) for token in tokens):
            raise ValueError("Test tokens must be nonempty without whitespace")
        self._tokens = dict(tokens)
        self._lock = RLock()

    def authenticate(self, token: str, now: datetime) -> Principal:
        with self._lock:
            principal = self._tokens.get(token)
        if principal is None:
            raise DomainError(401, "invalid_token")
        if principal.expires_at <= now:
            raise DomainError(401, "expired_token")
        return principal

    def revoke(self, token: str) -> None:
        with self._lock:
            self._tokens.pop(token, None)
