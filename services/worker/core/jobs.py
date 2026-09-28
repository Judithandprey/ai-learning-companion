"""Transactionally guarded local jobs. No real queue, capture or executor starts.

Generation fences are recorded at enqueue and checked at begin and commit. The
final check shares the transaction/row lock with the derived output write, so a
source deletion or revoked-and-regranted authorization cannot resurrect data.
"""

from packages.contracts import validate
from services.api.domain import fingerprint, key
from services.api.errors import DomainError
from services.worker.core.budget import _authorized


class Jobs:
    def __init__(self, store, authorization_guard=None):
        self.store = store
        self.authorization_guard = authorization_guard

    @staticmethod
    def _record(tx, job_id):
        record = tx.get("job", job_id)
        if record is None:
            raise DomainError(404, "job_not_found")
        return record

    @staticmethod
    def _sources(tx, user_id, refs):
        generations = {}
        for ref in refs:
            validate("SourceRef", ref)
            if ref["user_id"] != user_id:
                raise DomainError(403, "identity_mismatch")
            source = tx.get("source", ref["source_id"])
            if not source or source.get("user_id") != user_id:
                raise DomainError(404, "source_not_found")
            if source.get("deleted") or source.get("revoked"):
                raise DomainError(409, "source_unavailable")
            if source["current_version"] != ref["source_version"]:
                raise DomainError(409, "source_version_stale")
            if not tx.get("snapshot", key(ref["source_id"], ref["source_version"])):
                raise DomainError(409, "source_snapshot_required")
            generations[ref["source_id"]] = source["generation"]
        return generations

    def _guard(self, tx, user_id, record, *, require_reserved_budget=True):
        auth = _authorized(tx, self.authorization_guard)
        if auth["generation"] != record["authorization_generation"]:
            raise DomainError(409, "job_authorization_stale")
        if record["wire"]["cancel_requested"]:
            raise DomainError(409, "job_cancelled")
        generations = self._sources(tx, user_id, record["wire"]["source_versions"])
        if generations != record["source_generations"]:
            raise DomainError(409, "job_source_stale")
        reservation_id = record["wire"]["budget_reservation"]
        if reservation_id is not None and require_reserved_budget:
            reservation = tx.get("budget_reservation", reservation_id)
            if not reservation or reservation["wire"]["state"] != "reserved":
                raise DomainError(409, "budget_reservation_required")
            if reservation["outcome_unknown"]:
                raise DomainError(409, "reconciliation_required")

    def enqueue(self, user_id, job_id, kind, source_versions, idempotency_key,
                budget_reservation=None):
        wire = {
            "user_id": user_id, "id": job_id, "kind": kind,
            "source_versions": source_versions, "idempotency_key": idempotency_key,
            "state": "queued", "checkpoint": None,
            "budget_reservation": budget_reservation, "attempts": 0,
            "cancel_requested": False, "outputs": [],
        }
        validate("BackgroundJob", wire)
        with self.store.transaction(user_id) as tx:
            auth = _authorized(tx, self.authorization_guard)
            existing = tx.get("job_request", idempotency_key)
            if existing:
                if existing["input"] != wire:
                    raise DomainError(409, "job_idempotency_conflict")
                return self._record(tx, existing["job_id"])["wire"]
            if tx.get("job", job_id):
                raise DomainError(409, "job_id_conflict")
            generations = self._sources(tx, user_id, source_versions)
            if budget_reservation is not None:
                reservation = tx.get("budget_reservation", budget_reservation)
                if not reservation or reservation["wire"]["state"] != "reserved":
                    raise DomainError(409, "budget_reservation_required")
                if reservation["outcome_unknown"]:
                    raise DomainError(409, "reconciliation_required")
                if tx.get("budget_job", budget_reservation):
                    raise DomainError(409, "reservation_already_assigned")
                tx.put("budget_job", budget_reservation, {"job_id": job_id})
            tx.put("job", job_id, {
                "wire": wire, "authorization_generation": auth["generation"],
                "source_generations": generations, "outcome_unknown": False,
            })
            tx.put("job_request", idempotency_key, {"input": wire, "job_id": job_id})
            return wire

    def begin(self, user_id, job_id):
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            self._guard(tx, user_id, record)
            wire = record["wire"]
            if wire["state"] != "queued":
                raise DomainError(409, "job_not_queued")
            wire["state"] = "running"
            wire["attempts"] += 1
            tx.put("job", job_id, record)
            return wire

    def commit(self, user_id, job_id, output_id, payload):
        """Persist a derived artifact and complete under the same user mutex."""
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            wire = record["wire"]
            self._guard(tx, user_id, record, require_reserved_budget=wire["state"] != "completed")
            if record["outcome_unknown"]:
                raise DomainError(409, "reconciliation_required")
            output = {
                "user_id": user_id, "id": output_id, "job_id": job_id,
                "source_versions": wire["source_versions"], "payload": payload,
            }
            existing = tx.get("derived", output_id)
            if wire["state"] == "completed":
                if existing is not None and fingerprint(existing) == fingerprint(output) and wire["outputs"] == [output_id]:
                    return wire
                raise DomainError(409, "job_completion_conflict")
            if wire["state"] != "running":
                raise DomainError(409, "job_not_running")
            if existing is not None:
                raise DomainError(409, "output_id_conflict")
            wire["state"] = "completed"
            wire["outputs"] = [output_id]
            validate("BackgroundJob", wire)
            tx.put("derived", output_id, output)
            tx.put("job", job_id, record)
            return wire

    def mark_unknown(self, user_id, job_id):
        """Record an unresolved started call, including during cancellation.

        Requesting cancellation does not establish the external call's outcome.
        Keep both uncertainty flags in this transaction until trusted reconciliation;
        neither an unstarted task nor a resolved call can enter this state.
        """
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            wire = record["wire"]
            if (wire["state"] not in ("running", "cancelling")
                    or wire["attempts"] == 0 or record.get("reconciliation") is not None):
                raise DomainError(409, "job_not_running")
            reservation_id = record["wire"]["budget_reservation"]
            if reservation_id is not None:
                reservation = tx.get("budget_reservation", reservation_id)
                if not reservation or reservation["wire"]["state"] != "reserved":
                    raise DomainError(409, "budget_reservation_required")
                reservation["outcome_unknown"] = True
                tx.put("budget_reservation", reservation_id, reservation)
            record["outcome_unknown"] = True
            tx.put("job", job_id, record)
            return record["wire"]

    def cancel(self, user_id, job_id):
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            wire = record["wire"]
            if wire["state"] in ("completed", "failed", "cancelled"):
                return wire
            reservation = (
                tx.get("budget_reservation", wire["budget_reservation"])
                if wire["budget_reservation"] is not None else None
            )
            unknown = record["outcome_unknown"] or bool(reservation and reservation["outcome_unknown"])
            wire["cancel_requested"] = True
            wire["state"] = "cancelled" if wire["state"] == "queued" and not unknown else "cancelling"
            validate("BackgroundJob", wire)
            tx.put("job", job_id, record)
            return wire

    def reconcile_unknown(self, user_id, job_id, *, evidence, outcome):
        """Trusted local reconciliation only; never executes or retries a call.

        `not_executed` means verified absence of the external action; `executed`
        means the action occurred, without claiming a usable derived output. For
        budgeted work, first reconcile its reservation with the identical evidence
        (None actual amount for nonexecution, an integer amount for execution).
        A nonexecution under cancellation may then acknowledge stopped. Other
        reconciled jobs fail locally and require a separately reviewed new task.
        """
        if not isinstance(evidence, str) or not evidence.strip():
            raise DomainError(422, "reconciliation_evidence_required")
        if outcome not in ("not_executed", "executed"):
            raise DomainError(422, "invalid_reconciliation_outcome")
        reconciliation = {"evidence": evidence, "outcome": outcome}
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            wire = record["wire"]
            previous = record.get("reconciliation")
            if previous is not None:
                if previous != reconciliation:
                    raise DomainError(409, "reconciliation_conflict")
                return wire
            if not record["outcome_unknown"]:
                raise DomainError(409, "unknown_outcome_required")
            reservation_id = wire["budget_reservation"]
            if reservation_id is not None:
                reservation = tx.get("budget_reservation", reservation_id)
                if not reservation or reservation["outcome_unknown"] or not reservation["reconciliation"]:
                    raise DomainError(409, "reconciliation_required")
                known = reservation["reconciliation"]
                known_outcome = "not_executed" if known["actual_fen"] is None else "executed"
                expected_state = "released" if known_outcome == "not_executed" else "settled"
                if (known["evidence"] != evidence or known_outcome != outcome
                        or reservation["wire"]["state"] != expected_state):
                    raise DomainError(409, "reconciliation_conflict")
            record["outcome_unknown"] = False
            record["reconciliation"] = reconciliation
            wire["checkpoint"] = f"reconciled_{outcome}"
            if outcome == "not_executed" and wire["cancel_requested"]:
                wire["state"] = "cancelling"
            else:
                # A reconciled billing result is not a completed local artifact,
                # nor permission to perform an uncertain external action again.
                wire["state"] = "failed"
            validate("BackgroundJob", wire)
            tx.put("job", job_id, record)
            return wire

    def acknowledge_cancel(self, user_id, job_id):
        """Internal worker safe point: it has stopped and will not commit output.

        This hook is deliberately absent from HTTP. Unknown external outcomes must
        be reconciled before an executor can truthfully report stopped.
        """
        with self.store.transaction(user_id) as tx:
            _authorized(tx, self.authorization_guard)
            record = self._record(tx, job_id)
            wire = record["wire"]
            if wire["state"] == "cancelled":
                return wire
            if wire["state"] != "cancelling" or not wire["cancel_requested"]:
                raise DomainError(409, "cancellation_not_requested")
            reservation = (
                tx.get("budget_reservation", wire["budget_reservation"])
                if wire["budget_reservation"] is not None else None
            )
            if record["outcome_unknown"] or (reservation and reservation["outcome_unknown"]):
                raise DomainError(409, "reconciliation_required")
            wire["state"] = "cancelled"
            validate("BackgroundJob", wire)
            tx.put("job", job_id, record)
            return wire
