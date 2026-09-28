"""Domain safety tests on the explicit memory double; these do not verify PG."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import Barrier

import pytest

from packages.contracts import validate
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.worker.core.budget import Budget
from services.worker.core.jobs import Jobs
from services.worker.connectors.disabled import connect_account, execute_paid


USER = "user-a"
REFS = [{"user_id": USER, "source_id": "source-a", "source_version": 1}]
PRICES = {("fixture", "price-1", "fx-1"): 10}


@pytest.fixture
def store():
    store = MemoryStore()
    for user in (USER, "user-b"):
        with store.transaction(user) as tx:
            tx.put("authorization", "state", {"enabled": True, "generation": 1})
    with store.transaction(USER) as tx:
        tx.put("source", "source-a", {
            "user_id": USER, "source_id": "source-a", "current_version": 1,
            "deleted": False, "revoked": False, "generation": 1,
        })
        tx.put("snapshot", key("source-a", 1), {
            "user_id": USER, "source_id": "source-a", "source_version": 1,
            "fixture": "immutable source",
        })
    return store


@pytest.fixture
def budget(store):
    return Budget(store, clock=lambda: datetime(2026, 9, 28, tzinfo=timezone.utc), prices=PRICES)


def reserve(budget, request="request-a", units=100, attempts=1):
    return budget.reserve(USER, request, "fixture", "price-1", "fx-1", units, attempts)


def enqueue(jobs, job_id="job-a", request="request-a", **kwargs):
    return jobs.enqueue(USER, job_id, "rebuild_index", REFS, request, **kwargs)


def patch_source(store, **changes):
    with store.transaction(USER) as tx:
        source = tx.get("source", "source-a")
        source.update(changes)
        tx.put("source", "source-a", source)


def assert_no_output(store):
    with store.transaction(USER) as tx:
        assert tx.scan("derived") == []


def test_unknown_price_and_fx_fail_closed(store):
    for prices in (None, {("fixture", "price-1", "fx-1"): 0}, {("fixture", "price-1", "fx-1"): True}):
        with pytest.raises(DomainError, match="price_or_fx_unknown"):
            reserve(Budget(store, prices=prices))
    with pytest.raises(DomainError, match="price_or_fx_unknown"):
        Budget(store, prices=PRICES).reserve(USER, "r", "fixture", "price-1", "unknown", 1)


def test_retry_exposure_and_settlement_idempotency(budget):
    reservation = reserve(budget, units=1000, attempts=4)
    validate("BudgetReservation", reservation)
    assert reservation["estimated_max_fen"] == 40000
    assert budget.usage(USER)["remaining_fen"] == 60000
    settled = budget.settle(USER, reservation["reservation_id"], 25000)
    assert budget.settle(USER, reservation["reservation_id"], 25000) == settled
    assert reserve(budget, units=1000, attempts=4) == settled
    assert budget.usage(USER)["actual_fen"] == 25000
    assert budget.usage(USER)["reserved_fen"] == 0
    with pytest.raises(DomainError, match="reservation_finalized"):
        budget.release(USER, reservation["reservation_id"])


def test_parallel_reservations_never_overallocate(budget):
    barrier = Barrier(24)

    def attempt(index):
        barrier.wait()
        try:
            return reserve(budget, request=f"request-{index}", units=1000)
        except DomainError as error:
            assert error.code == "budget_exhausted"
            return None

    with ThreadPoolExecutor(max_workers=24) as pool:
        results = list(pool.map(attempt, range(24)))
    assert len([item for item in results if item]) == 10
    assert budget.usage(USER)["reserved_fen"] == 100000
    assert budget.usage(USER)["remaining_fen"] == 0


def test_parallel_duplicate_reservation_is_charged_once(budget):
    barrier = Barrier(12)

    def attempt(_):
        barrier.wait()
        return reserve(budget)

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(attempt, range(12)))
    assert len({item["reservation_id"] for item in results}) == 1
    assert budget.usage(USER)["reserved_fen"] == 1000


def test_conflicting_replay_does_not_change_budget(budget):
    reserve(budget)
    with pytest.raises(DomainError, match="budget_idempotency_conflict"):
        reserve(budget, units=101)
    assert budget.usage(USER)["reserved_fen"] == 1000
    assert budget.usage(USER)["actual_fen"] == 0


def test_true_settlement_overage_is_recorded_and_blocks_new_spend(budget):
    reservation = reserve(budget)
    budget.settle(USER, reservation["reservation_id"], 100100)
    usage = budget.usage(USER)
    validate("UsageResult", usage)
    assert usage["actual_fen"] == 100100
    assert usage["remaining_fen"] == 0
    assert usage["reserved_fen"] == 0
    with pytest.raises(DomainError, match="budget_exhausted"):
        reserve(budget, "next-request", units=1)


def test_release_is_idempotent_and_cannot_rereserve_same_request(budget):
    reservation = reserve(budget)
    released = budget.release(USER, reservation["reservation_id"])
    assert budget.release(USER, reservation["reservation_id"]) == released
    assert reserve(budget) == released
    assert budget.usage(USER)["remaining_fen"] == 100000


@pytest.mark.parametrize("actual", [None, 200])
def test_unknown_outcome_retains_funds_until_reconciliation(budget, actual):
    reservation = reserve(budget)
    rid = reservation["reservation_id"]
    assert budget.mark_unknown(USER, rid)["state"] == "reserved"
    with pytest.raises(DomainError, match="reconciliation_required"):
        budget.release(USER, rid)
    with pytest.raises(DomainError, match="reconciliation_required"):
        budget.settle(USER, rid, 200)
    assert budget.usage(USER)["reserved_fen"] == 1000
    result = budget.reconcile(USER, rid, evidence="trusted-local-fixture-query", actual_fen=actual)
    assert result["state"] == ("released" if actual is None else "settled")
    assert budget.reconcile(USER, rid, evidence="trusted-local-fixture-query", actual_fen=actual) == result
    with pytest.raises(DomainError, match="reconciliation_conflict"):
        budget.reconcile(USER, rid, evidence="different-query", actual_fen=actual)
    assert budget.usage(USER)["reserved_fen"] == 0
    assert budget.usage(USER)["actual_fen"] == (actual or 0)


def test_month_is_server_los_angeles_and_replays_do_not_shift_month(store):
    clock = [datetime(2026, 10, 1, 6, 59, tzinfo=timezone.utc)]
    budget = Budget(store, clock=lambda: clock[0], prices=PRICES)
    old = reserve(budget)
    assert old["budget_month"] == "2026-09"
    clock[0] = datetime(2026, 10, 1, 7, 1, tzinfo=timezone.utc)
    assert reserve(budget) == old
    budget.settle(USER, old["reservation_id"], 400)
    assert budget.usage(USER)["budget_month"] == "2026-10"
    assert budget.usage(USER)["actual_fen"] == 0
    assert budget.usage(USER)["reserved_fen"] == 0
    with store.transaction(USER) as tx:
        assert tx.get("budget_month", "2026-09")["spent_fen"] == 400


@pytest.mark.parametrize("units,attempts", [(True, 1), (1, True), (0, 1), (1, 0), (-1, 1), (1.5, 1)])
def test_invalid_bounds_are_rejected(budget, units, attempts):
    with pytest.raises(DomainError, match="invalid_budget_bound"):
        reserve(budget, units=units, attempts=attempts)


def test_jobs_complete_and_replay_preserving_provenance(store):
    jobs = Jobs(store)
    queued = enqueue(jobs)
    validate("BackgroundJob", queued)
    assert enqueue(jobs) == queued
    assert jobs.begin(USER, "job-a")["attempts"] == 1
    completed = jobs.commit(USER, "job-a", "output-a", {"text": "Derived only"})
    validate("BackgroundJob", completed)
    assert jobs.commit(USER, "job-a", "output-a", {"text": "Derived only"}) == completed
    with store.transaction(USER) as tx:
        assert tx.get("derived", "output-a")["source_versions"] == REFS
        assert tx.get("snapshot", key("source-a", 1))["fixture"] == "immutable source"
    assert jobs.cancel(USER, "job-a")["state"] == "completed"


@pytest.mark.parametrize("after_begin", [False, True])
@pytest.mark.parametrize("change", ["deleted", "revoked", "version", "source_generation", "auth_generation"])
def test_jobs_cannot_resurrect_deleted_revoked_or_changed_sources(store, after_begin, change):
    jobs = Jobs(store)
    enqueue(jobs)
    if after_begin:
        jobs.begin(USER, "job-a")
    if change == "version":
        patch_source(store, current_version=2)
    elif change == "source_generation":
        # Revoked and then regranted: same source version, new fence.
        patch_source(store, generation=3, revoked=False)
    elif change == "auth_generation":
        with store.transaction(USER) as tx:
            tx.put("authorization", "state", {"enabled": True, "generation": 3})
    else:
        patch_source(store, **{change: True})
    with pytest.raises(DomainError):
        if after_begin:
            jobs.commit(USER, "job-a", "output-a", {"text": "stale"})
        else:
            jobs.begin(USER, "job-a")
    assert_no_output(store)


@pytest.mark.parametrize("after_begin", [False, True])
def test_cancel_stops_future_local_commit(store, after_begin):
    jobs = Jobs(store)
    enqueue(jobs)
    if after_begin:
        jobs.begin(USER, "job-a")
    cancelled = jobs.cancel(USER, "job-a")
    assert cancelled["state"] == ("cancelling" if after_begin else "cancelled")
    assert jobs.cancel(USER, "job-a") == cancelled
    assert jobs.acknowledge_cancel(USER, "job-a")["state"] == "cancelled"
    assert jobs.acknowledge_cancel(USER, "job-a")["state"] == "cancelled"
    with pytest.raises(DomainError, match="job_cancelled"):
        jobs.commit(USER, "job-a", "output-a", {})
    assert_no_output(store)


def test_unknown_execution_never_claims_successful_cancellation(store, budget):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    jobs.begin(USER, "job-a")
    jobs.mark_unknown(USER, "job-a")
    with pytest.raises(DomainError, match="reconciliation_required"):
        budget.release(USER, reservation["reservation_id"])
    with pytest.raises(DomainError, match="reconciliation_required"):
        budget.settle(USER, reservation["reservation_id"], 100)
    assert jobs.cancel(USER, "job-a")["state"] == "cancelling"
    with pytest.raises(DomainError, match="reconciliation_required"):
        jobs.acknowledge_cancel(USER, "job-a")
    assert budget.usage(USER)["reserved_fen"] == 1000
    with pytest.raises(DomainError):
        jobs.commit(USER, "job-a", "output-a", {})
    assert_no_output(store)


def test_mark_unknown_rejects_finalized_reservation_without_partial_job_write(store, budget):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    jobs.begin(USER, "job-a")
    budget.settle(USER, reservation["reservation_id"], 100)
    with pytest.raises(DomainError, match="budget_reservation_required"):
        jobs.mark_unknown(USER, "job-a")
    with store.transaction(USER) as tx:
        assert tx.get("job", "job-a")["outcome_unknown"] is False
        assert tx.get("budget_reservation", reservation["reservation_id"])["wire"]["state"] == "settled"
    assert budget.usage(USER)["actual_fen"] == 100
    assert budget.usage(USER)["reserved_fen"] == 0


def test_unknown_budget_outcome_keeps_job_cancelling(store, budget):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    jobs.begin(USER, "job-a")
    budget.mark_unknown(USER, reservation["reservation_id"])
    assert jobs.cancel(USER, "job-a")["state"] == "cancelling"
    with pytest.raises(DomainError, match="reconciliation_required"):
        jobs.acknowledge_cancel(USER, "job-a")
    assert budget.usage(USER)["reserved_fen"] == 1000


def test_budget_cannot_back_two_jobs_or_execute_after_release(store, budget):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    with pytest.raises(DomainError, match="reservation_already_assigned"):
        enqueue(jobs, "job-b", "request-b", budget_reservation=reservation["reservation_id"])
    budget.release(USER, reservation["reservation_id"])
    with pytest.raises(DomainError, match="budget_reservation_required"):
        jobs.begin(USER, "job-a")


def test_cancel_commit_race_has_one_truthful_outcome(store):
    jobs = Jobs(store)
    enqueue(jobs)
    jobs.begin(USER, "job-a")
    barrier = Barrier(2)

    def finish():
        barrier.wait()
        try:
            return jobs.commit(USER, "job-a", "race-output", {})["state"]
        except DomainError as error:
            assert error.code == "job_cancelled"
            return "commit-rejected"

    def cancel():
        barrier.wait()
        return jobs.cancel(USER, "job-a")["state"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        completion, cancellation = pool.submit(finish), pool.submit(cancel)
        results = (completion.result(), cancellation.result())
    with store.transaction(USER) as tx:
        outputs = tx.scan("derived")
    if results[1] == "completed":
        assert results[0] == "completed" and len(outputs) == 1
    else:
        assert results == ("commit-rejected", "cancelling") and outputs == []
        assert jobs.acknowledge_cancel(USER, "job-a")["state"] == "cancelled"


def test_revocation_retains_unknown_reservations_without_retry_permission(store, budget):
    reservation = reserve(budget)
    rid = reservation["reservation_id"]
    budget.mark_unknown(USER, rid)
    with store.transaction(USER) as tx:
        tx.put("authorization", "state", {"enabled": False, "generation": 2})
    for operation in (lambda: budget.release(USER, rid), lambda: budget.reconcile(USER, rid, evidence="fixture")):
        with pytest.raises(DomainError, match="authorization_required"):
            operation()
    with store.transaction(USER) as tx:
        assert tx.get("budget_reservation", rid)["outcome_unknown"] is True
        assert tx.get("budget_month", "2026-09")["reserved_fen"] == 1000


def test_ownership_and_snapshot_required(store, budget):
    jobs = Jobs(store)
    enqueue(jobs)
    with pytest.raises(DomainError, match="job_not_found"):
        jobs.cancel("user-b", "job-a")
    with pytest.raises(DomainError, match="identity_mismatch"):
        jobs.enqueue("user-b", "job-b", "rebuild_index", REFS, "request-b")
    reservation = reserve(budget)
    with pytest.raises(DomainError, match="reservation_not_found"):
        budget.release("user-b", reservation["reservation_id"])
    with store.transaction(USER) as tx:
        tx.delete("snapshot", key("source-a", 1))
    with pytest.raises(DomainError, match="source_snapshot_required"):
        jobs.begin(USER, "job-a")


def test_authorization_revocation_and_request_guard_fail_closed(store, budget):
    jobs = Jobs(store)
    enqueue(jobs)
    with store.transaction(USER) as tx:
        tx.put("authorization", "state", {"enabled": False, "generation": 2})
    for operation in (lambda: budget.usage(USER), lambda: reserve(budget), lambda: jobs.begin(USER, "job-a"), lambda: jobs.cancel(USER, "job-a")):
        with pytest.raises(DomainError, match="authorization_required"):
            operation()
    with store.transaction(USER) as tx:
        tx.put("authorization", "state", {"enabled": True, "generation": 3})

    def guard(auth):
        assert auth["generation"] == 3
        raise DomainError(401, "token_generation_stale")

    for operation in (lambda: Budget(store, authorization_guard=guard).usage(USER), lambda: Jobs(store, authorization_guard=guard).cancel(USER, "job-a")):
        with pytest.raises(DomainError, match="token_generation_stale"):
            operation()


def test_real_account_and_paid_executor_are_disabled():
    for operation in (execute_paid, connect_account):
        with pytest.raises(DomainError) as error:
            operation()
        assert error.value.status == 503


def test_archive_import_and_delete_integrate_with_worker_fences(store):
    fixtures_dir = Path(__file__).resolve().parents[3] / "packages/contracts/examples"
    fixture = json.loads((fixtures_dir / "core.json").read_text())
    snapshot, frame = fixture["SourceSnapshot"], fixture["Frame"]
    snapshot["user_id"] = frame["user_id"] = USER
    archive = Archive(store)
    archive.import_fixture(USER, snapshot, frame, (fixtures_dir / "frame.svg").read_bytes())
    refs = [{"user_id": USER, "source_id": snapshot["source_id"], "source_version": 1}]
    jobs = Jobs(store)
    jobs.enqueue(USER, "integrated-job", "rebuild_index", refs, "integrated-request")
    jobs.begin(USER, "integrated-job")
    jobs.commit(USER, "integrated-job", "integrated-output", {"fixture": "derived"})
    jobs.enqueue(USER, "stale-job", "rebuild_index", refs, "stale-request")
    jobs.begin(USER, "stale-job")
    archive.delete_source(USER, snapshot["source_id"])
    with pytest.raises(DomainError, match="source_unavailable"):
        jobs.commit(USER, "stale-job", "stale-output", {})
    assert_no_output(store)


def test_completed_job_exact_replay_survives_budget_settlement(store, budget):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    jobs.begin(USER, "job-a")
    original = jobs.commit(USER, "job-a", "output-a", {"version": 1})
    budget.settle(USER, reservation["reservation_id"], 500)
    assert jobs.commit(USER, "job-a", "output-a", {"version": 1}) == original
    for output_id, payload in (("output-a", {"version": 2}), ("output-a", {"version": True}), ("output-b", {"version": 1})):
        with pytest.raises(DomainError, match="job_completion_conflict"):
            jobs.commit(USER, "job-a", output_id, payload)
    assert budget.usage(USER)["actual_fen"] == 500
    with store.transaction(USER) as tx:
        assert len(tx.scan("derived")) == 1


@pytest.mark.parametrize("change", ["deleted", "revoked", "source_generation", "auth_generation"])
def test_completed_settled_replay_still_checks_lifecycle_fences(store, budget, change):
    reservation = reserve(budget)
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=reservation["reservation_id"])
    jobs.begin(USER, "job-a")
    jobs.commit(USER, "job-a", "output-a", {})
    budget.settle(USER, reservation["reservation_id"], 500)
    if change == "source_generation":
        patch_source(store, generation=3)
    elif change == "auth_generation":
        with store.transaction(USER) as tx:
            tx.put("authorization", "state", {"enabled": True, "generation": 3})
    else:
        patch_source(store, **{change: True})
    with pytest.raises(DomainError):
        jobs.commit(USER, "job-a", "output-a", {})


def test_unknown_job_reconciliation_requires_matching_known_budget_result(store, budget):
    reservation = reserve(budget)
    rid = reservation["reservation_id"]
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=rid)
    jobs.begin(USER, "job-a")
    jobs.mark_unknown(USER, "job-a")
    assert jobs.cancel(USER, "job-a")["state"] == "cancelling"
    with pytest.raises(DomainError, match="reconciliation_required"):
        jobs.reconcile_unknown(USER, "job-a", evidence="fixture-absent", outcome="not_executed")
    budget.reconcile(USER, rid, evidence="fixture-absent", actual_fen=None)
    for evidence, outcome in (("different-evidence", "not_executed"), ("fixture-absent", "executed")):
        with pytest.raises(DomainError, match="reconciliation_conflict"):
            jobs.reconcile_unknown(USER, "job-a", evidence=evidence, outcome=outcome)
    with pytest.raises(DomainError, match="reconciliation_required"):
        jobs.acknowledge_cancel(USER, "job-a")
    reconciled = jobs.reconcile_unknown(USER, "job-a", evidence="fixture-absent", outcome="not_executed")
    assert reconciled["state"] == "cancelling"
    assert jobs.reconcile_unknown(USER, "job-a", evidence="fixture-absent", outcome="not_executed") == reconciled
    assert jobs.acknowledge_cancel(USER, "job-a")["state"] == "cancelled"
    assert budget.usage(USER)["reserved_fen"] == 0
    assert budget.usage(USER)["actual_fen"] == 0
    with pytest.raises(DomainError, match="job_cancelled"):
        jobs.begin(USER, "job-a")
    with pytest.raises(DomainError, match="reconciliation_conflict"):
        jobs.reconcile_unknown(USER, "job-a", evidence="fixture-absent", outcome="executed")
    assert_no_output(store)


@pytest.mark.parametrize("actual", [0, 300])
def test_reconciled_charge_never_fabricates_completion_or_retry(store, budget, actual):
    reservation = reserve(budget)
    rid = reservation["reservation_id"]
    jobs = Jobs(store)
    enqueue(jobs, budget_reservation=rid)
    jobs.begin(USER, "job-a")
    jobs.mark_unknown(USER, "job-a")
    jobs.cancel(USER, "job-a")
    budget.reconcile(USER, rid, evidence="fixture-executed", actual_fen=actual)
    with pytest.raises(DomainError, match="reconciliation_conflict"):
        jobs.reconcile_unknown(USER, "job-a", evidence="fixture-executed", outcome="not_executed")
    result = jobs.reconcile_unknown(USER, "job-a", evidence="fixture-executed", outcome="executed")
    assert result["state"] == "failed"
    assert result["outputs"] == []
    assert jobs.cancel(USER, "job-a")["state"] == "failed"
    with pytest.raises(DomainError, match="cancellation_not_requested"):
        jobs.acknowledge_cancel(USER, "job-a")
    with pytest.raises(DomainError):
        jobs.begin(USER, "job-a")
    with pytest.raises(DomainError):
        jobs.commit(USER, "job-a", "unsafe-output", {})
    assert budget.usage(USER)["actual_fen"] == actual
    assert_no_output(store)


@pytest.mark.parametrize("cancel_requested", [False, True])
def test_no_budget_unknown_job_still_requires_evidence_and_no_automatic_retry(store, cancel_requested):
    jobs = Jobs(store)
    enqueue(jobs)
    jobs.begin(USER, "job-a")
    with pytest.raises(DomainError, match="unknown_outcome_required"):
        jobs.reconcile_unknown(USER, "job-a", evidence="fixture-absent", outcome="not_executed")
    jobs.mark_unknown(USER, "job-a")
    if cancel_requested:
        jobs.cancel(USER, "job-a")
    with pytest.raises(DomainError, match="reconciliation_evidence_required"):
        jobs.reconcile_unknown(USER, "job-a", evidence=" ", outcome="not_executed")
    result = jobs.reconcile_unknown(USER, "job-a", evidence="trusted-fixture-query", outcome="not_executed")
    assert result["state"] == ("cancelling" if cancel_requested else "failed")
    if cancel_requested:
        assert jobs.acknowledge_cancel(USER, "job-a")["state"] == "cancelled"
    with pytest.raises(DomainError):
        jobs.begin(USER, "job-a")
    with pytest.raises(DomainError):
        jobs.commit(USER, "job-a", "unsafe-output", {})
    assert_no_output(store)
