"""P0 has no account connector or paid executor. No network requests are made."""

from services.api.errors import DomainError


def execute_paid(*args, **kwargs):
    raise DomainError(503, "paid_executor_disabled")


def connect_account(*args, **kwargs):
    raise DomainError(503, "account_connector_disabled")
