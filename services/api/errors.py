"""Stable service errors; payloads and credentials are never included."""


class DomainError(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code
        super().__init__(code)
