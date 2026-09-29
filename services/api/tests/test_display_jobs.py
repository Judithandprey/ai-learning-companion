"""Legacy worker jobs must not adopt explicit display-source families.

Synthetic control and MemoryStore only: no queue service, executor, network,
database or paid call is started. Existing budget/job tests cover the unchanged
legacy lifecycle, cancellation and unknown-outcome reconciliation.
"""

from datetime import datetime, timezone

import pytest

from services.api.domain import key
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.api.tests.test_budget_jobs import PRICES
from services.api.tests.test_control import USER, control_fixture, documents
from services.worker.core.budget import Budget
from services.worker.core.jobs import Jobs


JOB, REQUEST, OUTPUT = "source-sync-job", "source-sync-request", "source-sync-output"
PAYLOAD = {"test_only": True, "text": "Synthetic derived output."}


@pytest.fixture
def setup():
    c = control_fixture(MemoryStore(), USER)
    c.jobs = Jobs(c.store, authorization_guard=lambda state: None)
    c.source = {field: c.core["SourceSnapshot"][field]
                for field in ("user_id", "source_id", "source_version")}
    c.budget = Budget(c.store, prices=PRICES,
                      clock=lambda: datetime(2026, 9, 29, tzinfo=timezone.utc))
    c.reservation = c.budget.reserve(USER, "synthetic-job-budget", "fixture", "price-1", "fx-1", 10, 1)
    return c


def enqueue(c):
    return c.jobs.enqueue(USER, JOB, "source_sync", [c.source], REQUEST,
                          budget_reservation=c.reservation["reservation_id"])


def unsupported_without_mutation(c, operation):
    before = documents(c)
    with pytest.raises(DomainError) as error:
        operation()
    assert (error.value.status, error.value.code) == (409, "unsupported_source")
    assert documents(c) == before


def variant_row(c, location):
    kind = "source" if location == "head" else "snapshot"
    identity = c.source["source_id"] if location == "head" else key(c.source["source_id"], 1)
    return c.store._documents[USER][(kind, identity)]


def test_registered_display_cannot_enter_legacy_source_sync_or_bind_reserved_budget(setup):
    c = setup
    descriptor = c.registry.register_display_source(
        USER, "display-job-source", c.batch["stream_id"], producer_id="screen")
    c.source = {field: descriptor[field] for field in ("user_id", "source_id", "source_version")}
    unsupported_without_mutation(c, lambda: enqueue(c))
    with c.store.transaction(USER) as tx:
        assert tx.get("budget_reservation", c.reservation["reservation_id"])["wire"] == c.reservation
        assert tx.get("budget_job", c.reservation["reservation_id"]) is None
        assert tx.scan("job") == tx.scan("job_request") == tx.scan("derived") == []


@pytest.mark.parametrize("location", ["head", "snapshot"])
def test_unknown_explicit_source_variant_cannot_enter_legacy_job(setup, location):
    c = setup
    # Deliberate storage fault injection, not a supported source migration.
    variant_row(c, location)["contract_version"] = "9.9.9"
    unsupported_without_mutation(c, lambda: enqueue(c))


def test_cached_input_cannot_hide_display_reference_in_persisted_job_wire(setup):
    c = setup
    enqueue(c)
    descriptor = c.registry.register_display_source(
        USER, "display-job-source", c.batch["stream_id"], producer_id="screen")
    display_ref = {field: descriptor[field] for field in ("user_id", "source_id", "source_version")}
    # Corrupt only the stored job, preserving the independently cached legacy
    # enqueue input. The returned job's actual references need their own guard.
    c.store._documents[USER][("job", JOB)]["wire"]["source_versions"] = [display_ref]
    c.jobs = Jobs(c.store, authorization_guard=lambda state: None)
    unsupported_without_mutation(c, lambda: enqueue(c))


@pytest.mark.parametrize("location", ["head", "snapshot"])
@pytest.mark.parametrize("operation", ["enqueue_queued", "enqueue_completed", "enqueue_stale",
                                        "begin", "commit", "completed_replay"])
def test_existing_job_paths_recheck_both_source_family_discriminators(setup, location, operation):
    c = setup
    assert enqueue(c)["state"] == "queued"
    if operation in {"enqueue_completed", "commit", "completed_replay"}:
        assert c.jobs.begin(USER, JOB)["state"] == "running"
    if operation in {"enqueue_completed", "completed_replay"}:
        assert c.jobs.commit(USER, JOB, OUTPUT, PAYLOAD)["state"] == "completed"
    if operation == "enqueue_stale":
        c.store._documents[USER][("source", c.source["source_id"])]["generation"] += 1
    # Preserve the old job/request/receipt and change only one stored source
    # discriminator, modelling old state which the new guard must not trust.
    variant_row(c, location)["type"] = "shared_display"
    c.jobs = Jobs(c.store, authorization_guard=lambda state: None)
    if operation.startswith("enqueue"):
        action = lambda: enqueue(c)
    elif operation == "begin":
        action = lambda: c.jobs.begin(USER, JOB)
    else:
        action = lambda: c.jobs.commit(USER, JOB, OUTPUT, PAYLOAD)
    unsupported_without_mutation(c, action)
