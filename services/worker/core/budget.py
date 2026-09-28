"""Atomic local budget ledger; this module never invokes a paid provider.

Only trusted application configuration supplies the versioned price/FX allowlist.
Each price is an integer CNY-fen upper bound per unit, rounded up by the operator;
max_units covers all billable modalities and max_attempts includes the first try.
No supplied price means no reservation. Reconciliation is an internal operation,
not a public API; external evidence must be independently verified by its caller.
Revocation fails all operations closed: pending reservations remain held, and
there is no privileged post-revocation reconciliation path in P0. A returned
reservation/idempotent replay is accounting state, never permission to retry an
uncertain provider call. Such calls require future trusted reconciliation.
"""

from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from packages.contracts import validate
from services.api.errors import DomainError


LIMIT_FEN = 100_000
BUDGET_TIMEZONE = "America/Los_Angeles"


def _authorized(tx, authorization_guard=None):
    auth = tx.get("authorization", "state")
    if not auth or not auth.get("enabled"):
        raise DomainError(403, "authorization_required")
    if authorization_guard is not None:
        authorization_guard(auth)
    return auth


def _positive(value):
    return type(value) is int and value > 0


class Budget:
    def __init__(self, store, clock=None, prices=None, authorization_guard=None):
        self.store = store
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.prices = dict(prices or {})
        self.authorization_guard = authorization_guard

    def _now(self):
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise DomainError(503, "trusted_clock_required")
        return now

    @staticmethod
    def _ledger(tx, month):
        return tx.get("budget_month", month) or {
            "budget_month": month, "spent_fen": 0, "reserved_fen": 0,
        }

    def reserve(self, user_id, request_id, backend, price_version, fx_version,
                max_units, max_attempts=1):
        """Reserve all allowed attempts, returning the shared BudgetReservation."""
        if not _positive(max_units) or not _positive(max_attempts):
            raise DomainError(422, "invalid_budget_bound")
        inputs = {
            "backend": backend, "price_version": price_version,
            "fx_version": fx_version, "max_units": max_units,
            "max_attempts": max_attempts,
        }
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            previous = tx.get("budget_request", request_id)
            if previous:
                if previous["input"] != inputs:
                    raise DomainError(409, "budget_idempotency_conflict")
                return tx.get("budget_reservation", previous["reservation_id"])["wire"]
            now = self._now()
            month = now.astimezone(ZoneInfo(BUDGET_TIMEZONE)).strftime("%Y-%m")
            unit_fen = self.prices.get((backend, price_version, fx_version))
            if not _positive(unit_fen):
                raise DomainError(409, "price_or_fx_unknown")
            amount = unit_fen * max_units * max_attempts
            ledger = self._ledger(tx, month)
            if ledger["spent_fen"] + ledger["reserved_fen"] + amount > LIMIT_FEN:
                raise DomainError(409, "budget_exhausted")
            reservation = {
                "user_id": user_id, "reservation_id": str(uuid4()),
                "request_id": request_id, "backend": backend,
                "budget_month": month, "budget_timezone": BUDGET_TIMEZONE,
                "price_version": price_version, "fx_version": fx_version,
                "currency": "CNY", "estimated_max_fen": amount,
                "actual_fen": None, "state": "reserved",
                "created_at": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            validate("BudgetReservation", reservation)
            ledger["reserved_fen"] += amount
            tx.put("budget_month", month, ledger)
            tx.put("budget_reservation", reservation["reservation_id"], {
                "wire": reservation, "outcome_unknown": False,
                "reconciliation": None,
            })
            tx.put("budget_request", request_id, {
                "input": inputs, "reservation_id": reservation["reservation_id"],
            })
            return reservation

    @staticmethod
    def _record(tx, reservation_id):
        record = tx.get("budget_reservation", reservation_id)
        if record is None:
            raise DomainError(404, "reservation_not_found")
        return record

    @staticmethod
    def _finish(tx, record, actual_fen):
        wire = record["wire"]
        desired = "released" if actual_fen is None else "settled"
        if wire["state"] == desired and wire["actual_fen"] == actual_fen:
            return wire
        if wire["state"] != "reserved":
            raise DomainError(409, "reservation_finalized")
        if actual_fen is not None and (
            type(actual_fen) is not int or actual_fen < 0
        ):
            raise DomainError(422, "invalid_actual_fen")
        # A trusted settlement records the real charge even after an unexpected
        # provider overage. Hiding that cost would allow further overspending.
        # Reservation admission below remains strictly capped at LIMIT_FEN.
        ledger = Budget._ledger(tx, wire["budget_month"])
        ledger["reserved_fen"] -= wire["estimated_max_fen"]
        ledger["spent_fen"] += actual_fen or 0
        wire["state"] = desired
        wire["actual_fen"] = actual_fen
        validate("BudgetReservation", wire)
        tx.put("budget_month", wire["budget_month"], ledger)
        tx.put("budget_reservation", wire["reservation_id"], record)
        return wire

    def settle(self, user_id, reservation_id, actual_fen):
        if type(actual_fen) is not int or actual_fen < 0:
            raise DomainError(422, "invalid_actual_fen")
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, reservation_id)
            if record["outcome_unknown"]:
                raise DomainError(409, "reconciliation_required")
            return self._finish(tx, record, actual_fen)

    def release(self, user_id, reservation_id):
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, reservation_id)
            if record["outcome_unknown"]:
                raise DomainError(409, "reconciliation_required")
            return self._finish(tx, record, None)

    def mark_unknown(self, user_id, reservation_id):
        """Keep the full reservation after a timeout or an uncertain execution."""
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, reservation_id)
            if record["wire"]["state"] != "reserved":
                raise DomainError(409, "reservation_finalized")
            record["outcome_unknown"] = True
            tx.put("budget_reservation", reservation_id, record)
            return record["wire"]

    def reconcile(self, user_id, reservation_id, *, evidence, actual_fen=None):
        """Trusted caller confirms actual charge or proven nonexecution (None)."""
        if not isinstance(evidence, str) or not evidence.strip():
            raise DomainError(422, "reconciliation_evidence_required")
        if actual_fen is not None and (type(actual_fen) is not int or actual_fen < 0):
            raise DomainError(422, "invalid_actual_fen")
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, reservation_id)
            reconciliation = {"evidence": evidence, "actual_fen": actual_fen}
            if record["reconciliation"] is not None:
                if record["reconciliation"] != reconciliation:
                    raise DomainError(409, "reconciliation_conflict")
                return record["wire"]
            if not record["outcome_unknown"]:
                raise DomainError(409, "unknown_outcome_required")
            record["outcome_unknown"] = False
            record["reconciliation"] = reconciliation
            return self._finish(tx, record, actual_fen)

    def usage(self, user_id):
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            now = self._now()
            month = now.astimezone(ZoneInfo(BUDGET_TIMEZONE)).strftime("%Y-%m")
            ledger = self._ledger(tx, month)
            result = {
                "user_id": user_id, "budget_month": month,
                "budget_timezone": BUDGET_TIMEZONE, "currency": "CNY",
                "monthly_limit_fen": LIMIT_FEN, "actual_fen": ledger["spent_fen"],
                "reserved_fen": ledger["reserved_fen"],
                "remaining_fen": max(0, LIMIT_FEN - ledger["spent_fen"] - ledger["reserved_fen"]),
                "pricing_status": "known" if self.prices and all(
                    _positive(value) for value in self.prices.values()
                ) else "unknown",
                "subscriptions": [],
                "as_of": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "paid_executor_enabled": False,
            }
            validate("UsageResult", result)
            return result
