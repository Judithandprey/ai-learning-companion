"""Internal persisted control checks. MemoryStore is not PostgreSQL evidence."""

from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.api.capture import CaptureArchive
from services.api.control import ControlRegistry
from services.api.domain import key
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.api.tests.postgres_check import _fixture
from services.api.tests.test_capture import capture_fixture, fails, record


ROOT = Path(__file__).resolve().parents[3]
USER = "control-fixture-user"
SCOPES = frozenset({"process:control", "process:capture"})
CAPABILITIES = frozenset({"process.control.v0.2.1", "process.capture.v0.2"})


def resolve_stop_fact(tx, user_id, stream_id):
    """Synthetic independent producer evidence, never copied from a command."""
    fact = tx.get("fixture_producer_stop", stream_id)
    if fact is None:
        return None
    assert fact["user_id"] == user_id and fact["stream_id"] == stream_id
    return fact["boundary"]


def stop_fact(setup, boundary, *, stream_id=None):
    stream_id = stream_id or setup.registration["stream_id"]
    with setup.store.transaction(setup.user) as tx:
        tx.put("fixture_producer_stop", stream_id, {
            "user_id": setup.user, "stream_id": stream_id, "boundary": boundary,
        })


def registration(setup, stream_id="stream-1", *, predecessor=None, **pins):
    device = setup.core["Frame"]["device_id"]
    session = setup.core["Frame"]["session_id"]
    with setup.store.transaction(setup.user) as tx:
        generation = tx.get("authorization", "state")["generation"]
        membership = tx.get("control_membership", key(device, session))
    return {
        "contract_version": "0.2.1", "device_id": device, "session_id": session,
        "stream_id": stream_id, "authorization_generation": generation,
        "membership_revision": membership["revision"] if membership else 1,
        "continuity": ({"kind": "restart", "previous_stream_id": predecessor, "gap": "unknown"}
                       if predecessor else {"kind": "initial"}), **pins,
    }


def command(setup, kind="stop", *, stream_id=None, revision=1, boundary=None):
    return {
        "contract_version": "0.2.1", "device_id": setup.registration["device_id"],
        "session_id": setup.registration["session_id"],
        "stream_id": stream_id or setup.registration["stream_id"],
        "expected_revision": revision,
        "action": {"kind": kind, **({} if kind == "withdraw" else {"pre_stop_sequence": boundary})},
    }


def start(setup, body=None, *, producer="screen", request_key="register-1"):
    body = setup.registration if body is None else body
    setup.registry.authorize_start(setup.user, body, producer_id=producer)
    return setup.registry.register(setup.user, body, request_key)


def control_fixture(store, actor, *, membership=True, registered=True):
    """Explicit synthetic service decisions; reusable by the real-DB runner."""
    archive, core = _fixture(store, actor)
    registry = ControlRegistry(store, scopes=SCOPES, capabilities=CAPABILITIES,
                               authorization_guard=lambda state: None,
                               stop_fact_resolver=resolve_stop_fact)
    setup = SimpleNamespace(store=store, user=actor, archive=archive, core=core, registry=registry)
    if membership:
        registry.set_membership(actor, core["Frame"]["device_id"], core["Frame"]["session_id"],
                                active=True, expected_revision=0)
    setup.registration = registration(setup)
    setup.batch = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]
    setup.batch.update(**{k: setup.registration[k] for k in ("device_id", "session_id", "stream_id")},
                       delivery_mode="live")
    setup.batch["records"][0].update(
        source={k: core["SourceSnapshot"][k] for k in ("user_id", "source_id", "source_version")},
        artifacts=[])
    if registered:
        start(setup)
    return setup


@pytest.fixture
def setup():
    return control_fixture(MemoryStore(), USER)


def apply(setup, body, request_key="control-1"):
    return setup.registry.command(setup.user, body["stream_id"], body, request_key)


def ingest(setup, batch=None, request_key="capture-1"):
    return setup.registry.capture.ingest(setup.user, setup.batch if batch is None else batch, request_key)


def documents(setup):
    with setup.store.transaction(setup.user) as tx:
        return deepcopy(tx.documents)


def test_explicit_registration_is_durable_detached_and_does_not_start_a_device(setup):
    expected = {**setup.registration, "user_id": USER, "revision": 1,
                "state": "live", "pre_stop_sequence": None}
    assert setup.registry.read(USER, "stream-1") == expected
    restarted = ControlRegistry(setup.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                authorization_guard=lambda state: None,
                                stop_fact_resolver=resolve_stop_fact)
    response = restarted.register(USER, setup.registration, "register-1")
    assert response == expected
    response["continuity"]["kind"] = "changed outside store"
    assert restarted.read(USER, "stream-1") == expected
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_start", "stream-1")["status"] == "consumed"
        assert tx.scan("capture_record") == []


@pytest.mark.parametrize("operation", ["membership", "grant", "register", "read", "command", "capture"])
@pytest.mark.parametrize("field", ["scopes", "capabilities"])
def test_control_and_capture_require_their_own_explicit_authority(setup, operation, field):
    required = (("process:capture", "process.capture.v0.2") if operation == "capture"
                else ("process:control", "process.control.v0.2.1"))
    original = getattr(setup.registry, field)
    setattr(setup.registry, field, original - {required[0 if field == "scopes" else 1]})
    actions = {
        "membership": lambda: setup.registry.set_membership(USER, setup.registration["device_id"],
              setup.registration["session_id"], active=False, expected_revision=1),
        "grant": lambda: setup.registry.authorize_start(USER, registration(setup, "next"), producer_id="other"),
        "register": lambda: setup.registry.register(USER, setup.registration, "register-1"),
        "read": lambda: setup.registry.read(USER, "stream-1"),
        "command": lambda: apply(setup, command(setup)), "capture": lambda: ingest(setup),
    }
    before = documents(setup)
    fails(403, "forbidden" if field == "scopes" else "capability_required", actions[operation])
    assert documents(setup) == before


@pytest.mark.parametrize("field,value", [
    ("scopes", "process:control process:capture"), ("scopes", {"process:control": True}),
    ("capabilities", "process.control.v0.2.1"), ("capabilities", ["process.control.v0.2.1"]),
    ("scopes", frozenset({"process:control", 1})),
])
def test_malformed_registry_collections_never_confer_access(setup, field, value):
    setattr(setup.registry, field, value)
    fails(403, "forbidden", lambda: setup.registry.read(USER, "stream-1"))


def test_owned_device_and_session_do_not_imply_membership_or_a_start():
    setup = control_fixture(MemoryStore(), USER, membership=False, registered=False)
    fails(404, "not_found", lambda: start(setup))
    setup.registry.set_membership(USER, setup.registration["device_id"], setup.registration["session_id"],
                                  active=True, expected_revision=0)
    fails(403, "forbidden", lambda: setup.registry.register(USER, setup.registration, "no-grant"))
    fails(404, "not_found", lambda: ingest(setup))
    with setup.store.transaction(USER) as tx:
        assert tx.scan("control_start") == [] and tx.scan("control_stream") == []


def test_start_grant_binds_exact_id_and_entire_original_request():
    setup = control_fixture(MemoryStore(), USER, registered=False)
    setup.registry.authorize_start(USER, setup.registration, producer_id="screen")
    fails(403, "forbidden", lambda: setup.registry.register(USER, registration(setup, "different-id"), "wrong"))
    changed = {**setup.registration, "continuity": {"kind": "restart", "previous_stream_id": "old", "gap": "unknown"}}
    fails(403, "forbidden", lambda: setup.registry.register(USER, changed, "changed"))
    assert setup.registry.register(USER, setup.registration, "register-1")["state"] == "live"
    fails(409, "stream_conflict", lambda: setup.registry.register(USER, setup.registration, "second-key"))


@pytest.mark.parametrize("subject", ["device", "session"])
@pytest.mark.parametrize("failure", ["missing", "foreign", "deleted"])
def test_current_owned_subject_required_even_for_exact_replay(setup, subject, failure):
    identifier = setup.registration[subject + "_id"]
    with setup.store.transaction(USER) as tx:
        row = tx.get(subject, identifier)
        tx.delete(subject, identifier)
        if failure != "missing":
            row["user_id" if failure == "foreign" else "deleted"] = "other-user" if failure == "foreign" else True
            tx.put(subject, identifier, row)
    fails(404, "not_found", lambda: setup.registry.register(USER, setup.registration, "register-1"))
    fails(404, "not_found", lambda: ingest(setup))


@pytest.mark.parametrize("fence", ["authorization", "membership"])
def test_delayed_uncommitted_start_cannot_inherit_a_later_grant(fence):
    setup = control_fixture(MemoryStore(), USER, registered=False)
    setup.registry.authorize_start(USER, setup.registration, producer_id="screen")
    if fence == "authorization":
        setup.archive.set_authorization(USER, False)
        setup.archive.set_authorization(USER)
    else:
        for active, expected in [(False, 1), (True, 2)]:
            setup.registry.set_membership(USER, setup.registration["device_id"], setup.registration["session_id"],
                                          active=active, expected_revision=expected)
    fails(403, "forbidden", lambda: setup.registry.register(USER, setup.registration, "delayed"))
    refreshed = registration(setup)
    fails(403, "forbidden", lambda: setup.registry.register(USER, refreshed, "copied-new-generation"))
    fails(409, "stream_conflict", lambda: setup.registry.authorize_start(USER, refreshed, producer_id="screen"))
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_start", "stream-1")["status"] == "invalidated"
        assert tx.scan("control_stream") == []
    assert start(setup, registration(setup, "fresh"), request_key="fresh")["state"] == "live"


def test_exact_replay_returns_current_state_but_fresh_key_obeys_cas(setup):
    stop = command(setup)
    stopped = apply(setup, stop)
    assert (stopped["state"], stopped["revision"]) == ("stopped", 2)
    assert setup.registry.register(USER, setup.registration, "register-1") == stopped
    assert apply(setup, stop) == stopped
    fails(409, "stale_revision", lambda: apply(setup, stop, "new-key"))
    fails(409, "idempotency_conflict", lambda: apply(setup, command(setup, "withdraw", revision=2)))
    withdrawn = apply(setup, command(setup, "withdraw", revision=2), "withdraw")
    assert (withdrawn["state"], withdrawn["revision"]) == ("withdrawn", 3)
    assert apply(setup, stop) == withdrawn
    assert setup.registry.register(USER, setup.registration, "register-1") == withdrawn
    fails(409, "invalid_transition", lambda: apply(setup, command(setup, revision=3), "restart-old"))


def test_registration_replay_key_rejects_other_complete_body(setup):
    fails(409, "idempotency_conflict", lambda: setup.registry.register(USER, registration(setup, "other"), "register-1"))


def test_control_keys_are_scoped_to_full_stream_path(setup):
    second = registration(setup, "audio-stream")
    start(setup, second, producer="audio", request_key="audio-registration")
    assert apply(setup, command(setup), "same-key")["state"] == "stopped"
    assert apply(setup, command(setup, stream_id="audio-stream"), "same-key")["state"] == "stopped"


def test_unknown_stop_blocks_all_transmission_until_independent_seal(setup):
    accepted = ingest(setup)
    original = setup.registry.capture.read_record(USER, "process-1")
    stop = command(setup)
    apply(setup, stop)
    fails(409, "capture_stopped", lambda: ingest(setup))
    historical = {**setup.batch, "delivery_mode": "historical"}
    fails(409, "capture_stopped", lambda: ingest(setup, historical, "historical"))
    seal = command(setup, "seal_stop", revision=2, boundary=3)
    fails(409, "invalid_transition", lambda: apply(setup, seal, "seal"))
    stop_fact(setup, 3)
    sealed = apply(setup, seal, "seal")
    assert (sealed["state"], sealed["revision"], sealed["pre_stop_sequence"]) == ("stopped", 3, 3)
    assert apply(setup, stop) == sealed
    fails(409, "capture_stopped", lambda: ingest(setup))
    retry = ingest(setup, historical, "historical")
    assert retry["acknowledged"][0]["disposition"] == "duplicate"
    assert retry["acknowledged"][0]["received_at"] == accepted["acknowledged"][0]["received_at"]
    late = {**historical, "records": [record(setup.batch, "late", 3)]}
    assert ingest(setup, late, "late")["acknowledged"][0]["disposition"] == "accepted"
    exceeds = {**historical, "records": [record(setup.batch, "too-late", 4)]}
    fails(409, "capture_stopped", lambda: ingest(setup, exceeds, "too-late"))
    fails(409, "invalid_transition", lambda: apply(setup, command(setup, "seal_stop", revision=3, boundary=3), "reseal"))
    assert setup.registry.capture.read_record(USER, "process-1") == original


@pytest.mark.parametrize("fact", [None, 0, 2])
def test_known_stop_does_not_trust_request_or_server_high_water(setup, fact):
    ingest(setup)
    if fact is not None:
        stop_fact(setup, fact)
    before = documents(setup)
    fails(409, "invalid_transition", lambda: apply(setup, command(setup, boundary=1)))
    assert documents(setup) == before


@pytest.mark.parametrize("delete", [False, True])
def test_verified_boundary_cannot_fall_below_committed_slots_even_after_deletion(setup, delete):
    batch = {**setup.batch, "records": [record(setup.batch, "sequence-4", 4)]}
    ingest(setup, batch)
    if delete:
        setup.archive.delete_source(USER, setup.core["SourceSnapshot"]["source_id"])
    stop_fact(setup, 0)
    fails(409, "invalid_transition", lambda: apply(setup, command(setup, boundary=0)))
    with setup.store.transaction(USER) as tx:
        assert len(tx.scan("capture_slot")) == 1
    assert apply(setup, command(setup))["state"] == "stopped"
    stop_fact(setup, 3)
    fails(409, "invalid_transition", lambda: apply(setup, command(setup, "seal_stop", revision=2, boundary=3), "bad-seal"))
    stop_fact(setup, 4)
    assert apply(setup, command(setup, "seal_stop", revision=2, boundary=4), "seal")["pre_stop_sequence"] == 4


def test_empty_stream_can_seal_at_zero_but_never_accept_sequence_one(setup):
    stop_fact(setup, 0)
    assert apply(setup, command(setup, boundary=0))["pre_stop_sequence"] == 0
    fails(409, "capture_stopped", lambda: ingest(setup, {**setup.batch, "delivery_mode": "historical"}))


@pytest.mark.parametrize("bad_fact", [True, -1, "3", 2.0])
def test_corrupt_stop_fact_blocks_finite_seal_but_not_restrictive_unknown_stop(setup, bad_fact):
    stop_fact(setup, bad_fact)
    fails(503, "unavailable", lambda: apply(setup, command(setup, boundary=3)))
    assert apply(setup, command(setup))["state"] == "stopped"
    assert apply(setup, command(setup, "withdraw", revision=2), "withdraw")["state"] == "withdrawn"


def test_independent_stop_fact_before_control_ack_fences_cached_live_capture(setup):
    ingest(setup)
    stop_fact(setup, 1)
    fails(409, "capture_stopped", lambda: ingest(setup))
    assert setup.registry.read(USER, "stream-1")["state"] == "live"
    assert apply(setup, command(setup, boundary=1))["state"] == "stopped"


def test_sealed_boundary_cannot_silently_follow_changed_producer_fact(setup):
    stop_fact(setup, 1)
    apply(setup, command(setup, boundary=1))
    historical = {**setup.batch, "delivery_mode": "historical"}
    ingest(setup, historical)
    stop_fact(setup, 2)
    fails(409, "capture_stopped", lambda: ingest(setup, historical))
    assert setup.registry.read(USER, "stream-1")["pre_stop_sequence"] == 1


def test_independent_producers_survive_other_stream_stop_and_restart(setup):
    audio = registration(setup, "audio")
    start(setup, audio, producer="audio", request_key="audio")
    apply(setup, command(setup))
    fails(409, "invalid_transition", lambda: start(setup, registration(setup, "hidden-predecessor"), request_key="hidden"))
    restart = registration(setup, "screen-next", predecessor="stream-1")
    assert start(setup, restart, request_key="restart")["continuity"] == {
        "kind": "restart", "previous_stream_id": "stream-1", "gap": "unknown"}
    assert setup.registry.read(USER, "audio")["state"] == "live"
    assert setup.registry.read(USER, "stream-1")["state"] == "stopped"
    fails(409, "stream_conflict", lambda: setup.registry.authorize_start(USER, setup.registration, producer_id="screen"))
    audio_batch = {**setup.batch, "stream_id": "audio", "records": [record(setup.batch, "audio-original", 1)]}
    assert ingest(setup, audio_batch, "audio")["acknowledged"][0]["disposition"] == "accepted"


def test_restart_requires_closed_actual_producer_predecessor(setup):
    body = registration(setup, "too-soon", predecessor="stream-1")
    setup.registry.authorize_start(USER, body, producer_id="screen")
    fails(409, "invalid_transition", lambda: setup.registry.register(USER, body, "too-soon"))
    apply(setup, command(setup))
    fails(403, "forbidden", lambda: setup.registry.register(USER, body, "too-soon"))
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_start", "too-soon")["status"] == "invalidated"
    wrong = registration(setup, "wrong", predecessor="missing")
    fails(409, "invalid_transition", lambda: start(setup, wrong, request_key="wrong"))


@pytest.mark.parametrize("fence", ["authorization", "membership"])
def test_regrant_requires_new_incarnation_and_rejects_old_replay(setup, fence):
    ingest(setup)
    if fence == "authorization":
        setup.archive.set_authorization(USER, False)
        setup.archive.set_authorization(USER)
    else:
        for active, expected in [(False, 1), (True, 2)]:
            setup.registry.set_membership(USER, setup.registration["device_id"], setup.registration["session_id"],
                                          active=active, expected_revision=expected)
    fails(403, "forbidden", lambda: setup.registry.read(USER, "stream-1"))
    fails(403, "forbidden", lambda: setup.registry.register(USER, setup.registration, "register-1"))
    fails(403, "forbidden", lambda: ingest(setup))
    next_body = registration(setup, "fresh-generation", predecessor="stream-1")
    assert start(setup, next_body, request_key="fresh")["state"] == "live"
    fresh_batch = {**setup.batch, "stream_id": "fresh-generation",
                   "records": [record(setup.batch, "fresh-original", 1)]}
    assert ingest(setup, fresh_batch, "fresh-original")["acknowledged"][0]["disposition"] == "accepted"
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_stream", "stream-1")["state"]["state"] == "withdrawn"
        assert tx.get("capture_record", "process-1") is not None
        assert tx.get("capture_binding", "fresh-generation")["authorization_generation"] == next_body["authorization_generation"]


def test_stop_invalidates_only_pending_starts_for_same_producer(setup):
    screen = registration(setup, "screen-next", predecessor="stream-1")
    audio = registration(setup, "audio-next")
    setup.registry.authorize_start(USER, screen, producer_id="screen")
    setup.registry.authorize_start(USER, audio, producer_id="audio")
    apply(setup, command(setup))
    fails(403, "forbidden", lambda: setup.registry.register(USER, screen, "delayed-screen"))
    assert setup.registry.register(USER, audio, "audio-next")["state"] == "live"


def test_source_resolver_retains_old_versions_but_rechecks_current_deletion(setup):
    snapshot = {**setup.core["SourceSnapshot"], "source_version": 2}
    frame = {**setup.core["Frame"], "source_version": 2, "frame_id": "frame-version-2"}
    setup.archive.import_fixture(USER, snapshot, frame, (ROOT / "packages/contracts/examples/frame.svg").read_bytes())
    assert ingest(setup)["acknowledged"][0]["disposition"] == "accepted"
    second = record(setup.batch, "version-2", 2, source={**setup.batch["records"][0]["source"], "source_version": 2})
    assert ingest(setup, {**setup.batch, "records": [second]}, "v2")["acknowledged"][0]["disposition"] == "accepted"
    setup.archive.delete_source(USER, snapshot["source_id"])
    fails(404, "not_found", lambda: ingest(setup))
    fails(404, "not_found", lambda: setup.registry.capture.read_record(USER, "process-1"))
    assert setup.registry.read(USER, "stream-1")["state"] == "live"
    with setup.store.transaction(USER) as tx:
        assert tx.scan("capture_record") == []
        assert len(tx.scan("capture_slot")) == 2
        assert all(row.get("deleted") for row in tx.scan("capture_replay"))


def test_revoked_source_cannot_reuse_capture_ack(setup):
    ingest(setup)
    setup.archive.revoke_source(USER, setup.core["SourceSnapshot"]["source_id"])
    fails(404, "not_found", lambda: ingest(setup))
    assert setup.registry.read(USER, "stream-1")["state"] == "live"


def test_control_backed_capture_keeps_unreleased_artifact_and_attempt_paths_closed(setup):
    original = json.loads((ROOT / "packages/contracts/process_v2/examples/capture.json").read_text())["ProcessBatch"]
    artifacts = deepcopy(setup.batch)
    artifacts["records"][0]["artifacts"] = original["records"][0]["artifacts"]
    fails(409, "dependency_missing", lambda: ingest(setup, artifacts))
    attempt = deepcopy(setup.batch)
    attempt["records"][0]["scope"] = {"kind": "attempt", "problem_id": "problem", "attempt_id": "attempt", "relation_revision": 1}
    fails(409, "dependency_missing", lambda: ingest(setup, attempt))
    with setup.store.transaction(USER) as tx:
        assert tx.scan("capture_record") == [] and tx.scan("capture_replay") == []


def test_expired_guard_precedes_control_and_capture_cached_success(setup):
    ingest(setup)
    calls = []

    def expired(state):
        calls.append(state["generation"])
        raise DomainError(401, "unauthenticated")

    setup.registry.capture.archive.authorization_guard = expired
    for operation in (
        lambda: setup.registry.read(USER, "stream-1"),
        lambda: setup.registry.register(USER, setup.registration, "register-1"),
        lambda: apply(setup, command(setup)), lambda: ingest(setup),
    ):
        fails(401, "unauthenticated", operation)
    assert calls == [1] * 4


@pytest.mark.parametrize("guard", [None, True, "authenticated"])
def test_registry_requires_an_explicit_current_caller_guard(guard):
    with pytest.raises(ValueError, match="authorization guard"):
        ControlRegistry(MemoryStore(), scopes=SCOPES, capabilities=CAPABILITIES,
                        authorization_guard=guard)


def test_registry_rejects_noncallable_stop_resolver():
    with pytest.raises(ValueError, match="Stop fact resolver"):
        ControlRegistry(MemoryStore(), scopes=SCOPES, capabilities=CAPABILITIES,
                        authorization_guard=lambda state: None, stop_fact_resolver={"boundary": 1})


@pytest.mark.parametrize("failure", [RuntimeError("private producer diagnostics"), DomainError(403, "forbidden")])
def test_stop_fact_failure_is_closed_atomic_and_does_not_disable_unknown_stop(setup, failure):
    def unavailable(tx, user_id, stream_id):
        assert tx.get("control_stream", stream_id)["state"]["user_id"] == user_id
        raise failure

    setup.registry.stop_fact_resolver = unavailable
    before = documents(setup)
    status, code = (failure.status, failure.code) if isinstance(failure, DomainError) else (503, "unavailable")
    fails(status, code, lambda: apply(setup, command(setup, boundary=1)))
    fails(status, code, lambda: ingest(setup))
    assert documents(setup) == before
    assert apply(setup, command(setup))["state"] == "stopped"
    assert apply(setup, command(setup, "withdraw", revision=2), "withdraw")["state"] == "withdrawn"


def test_membership_cas_failure_leaves_current_stream_and_pending_grant_intact(setup):
    pending = registration(setup, "pending", predecessor="stream-1")
    setup.registry.authorize_start(USER, pending, producer_id="screen")
    before = documents(setup)
    fails(409, "stale_revision", lambda: setup.registry.set_membership(
        USER, setup.registration["device_id"], setup.registration["session_id"],
        active=False, expected_revision=0))
    assert documents(setup) == before


def test_same_wire_ids_and_replay_keys_remain_owner_isolated(setup):
    other = control_fixture(setup.store, "other-user")
    ingest(setup)
    ingest(other)
    apply(setup, command(setup, "withdraw"))
    assert setup.registry.read(USER, "stream-1")["state"] == "withdrawn"
    assert other.registry.register(other.user, other.registration, "register-1")["state"] == "live"
    assert ingest(other)["acknowledged"][0]["disposition"] == "accepted"
    original = other.registry.capture.read_record(other.user, "process-1")["record"]
    assert original["source"]["user_id"] == "other-user"
    fails(403, "forbidden", lambda: ingest(setup))


@pytest.mark.parametrize("retained", ["binding", "slot_after_delete"])
def test_legacy_capture_identity_is_never_adopted_by_new_registration(retained):
    legacy = capture_fixture(MemoryStore(), USER)
    legacy.capture.ingest(USER, legacy.batch, "legacy")
    if retained == "slot_after_delete":
        legacy.archive.delete_source(USER, legacy.core["SourceSnapshot"]["source_id"])
        # Exercise the independent retained-slot fence, without a binding row.
        with legacy.store.transaction(USER) as tx:
            tx.delete("capture_binding", legacy.batch["stream_id"])
            assert tx.scan("capture_record") == [] and len(tx.scan("capture_slot")) == 1
    legacy.registry = ControlRegistry(legacy.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                      authorization_guard=lambda state: None)
    legacy.registry.set_membership(USER, legacy.batch["device_id"], legacy.batch["session_id"],
                                    active=True, expected_revision=0)
    body = registration(legacy, legacy.batch["stream_id"])
    before = documents(legacy)
    fails(409, "stream_conflict", lambda: legacy.registry.authorize_start(USER, body, producer_id="screen"))
    fails(409, "stream_conflict", lambda: legacy.registry.register(USER, body, "legacy-adoption"))
    assert documents(legacy) == before


def test_opaque_stream_tombstone_hides_state_and_cannot_be_regranted(setup):
    with setup.store.transaction(USER) as tx:
        tx.put("control_stream", "stream-1", {"deleted": True})
    before = documents(setup)
    fails(404, "not_found", lambda: setup.registry.read(USER, "stream-1"))
    fails(404, "not_found", lambda: apply(setup, command(setup)))
    fails(404, "not_found", lambda: setup.registry.register(USER, setup.registration, "register-1"))
    fails(404, "not_found", lambda: ingest(setup))
    fails(409, "stream_conflict", lambda: setup.registry.authorize_start(USER, setup.registration, producer_id="screen"))
    fails(409, "stream_conflict", lambda: setup.registry.register(USER, setup.registration, "new-key"))
    assert documents(setup) == before


def test_regrant_needs_new_caller_context_not_only_new_request_generation(setup):
    def guard(generation):
        def check(state):
            if state["generation"] != generation:
                raise DomainError(401, "unauthenticated")
        return check

    setup.registry.capture.archive.authorization_guard = guard(1)
    setup.archive.set_authorization(USER, False)
    new_authorization = setup.archive.set_authorization(USER)
    fresh = registration(setup, "fresh-caller", predecessor="stream-1")
    fails(401, "unauthenticated", lambda: start(setup, fresh, request_key="fresh-caller"))
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_start", "fresh-caller") is None
    setup.registry = ControlRegistry(setup.store, scopes=SCOPES, capabilities=CAPABILITIES,
                                    authorization_guard=guard(new_authorization["generation"]),
                                    stop_fact_resolver=resolve_stop_fact)
    assert start(setup, fresh, request_key="fresh-caller")["state"] == "live"
    fails(403, "forbidden", lambda: setup.registry.register(USER, setup.registration, "register-1"))


def test_registration_failure_rolls_back_grant_consumption_lineage_state_and_replay(monkeypatch):
    from services.api.storage import _MemoryTransaction

    setup = control_fixture(MemoryStore(), USER, registered=False)
    setup.registry.authorize_start(USER, setup.registration, producer_id="screen")
    before = documents(setup)
    original_put = _MemoryTransaction.put

    def fail_after_replay_write(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == "control_replay":
            raise RuntimeError("synthetic precommit failure")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", fail_after_replay_write)
        with pytest.raises(RuntimeError, match="synthetic precommit failure"):
            setup.registry.register(USER, setup.registration, "register-1")
    assert documents(setup) == before
    assert setup.registry.register(USER, setup.registration, "register-1")["state"] == "live"
    with setup.store.transaction(USER) as tx:
        assert tx.get("control_start", "stream-1")["status"] == "consumed"
        assert len(tx.scan("control_lineage")) == len(tx.scan("control_stream")) == len(tx.scan("control_replay")) == 1


@pytest.mark.parametrize("field,value", [
    ("scopes", "process:capture"), ("scopes", {"process:capture": True}),
    ("capabilities", "process.capture.v0.2"), ("capabilities", ["process.capture.v0.2"]),
    ("source_versions", {("linear-algebra", 1)}), ("source_versions", frozenset({"linear-algebra"})),
    ("source_versions", frozenset({("linear-algebra", True)})),
    ("source_versions", frozenset({("linear-algebra", 1.0)})),
    ("attempts", {"problem": "attempt"}), ("attempts", frozenset({("problem", "attempt", True)})),
    ("attempts", frozenset({("problem", "attempt")})), ("scopes", frozenset({"process:capture", 0})),
])
def test_direct_capture_authority_collections_fail_closed(field, value):
    setup = capture_fixture(MemoryStore(), USER)

    def malformed(tx, user_id, stream_id):
        return replace(setup.resolver(tx, user_id, stream_id), **{field: value})

    capture = CaptureArchive(setup.store, malformed)
    before = documents(setup)
    fails(403, "forbidden", lambda: capture.ingest(USER, setup.batch, "malformed"))
    assert documents(setup) == before


def test_identity_scope_and_body_path_mismatch_do_not_expose_existing_stream(setup):
    setup.archive.set_authorization("other-user")
    fails(404, "not_found", lambda: setup.registry.read("other-user", "stream-1"))
    fails(404, "not_found", lambda: setup.registry.command(USER, "different", command(setup), "mismatch"))
    changed = {**command(setup), "session_id": "different-session"}
    fails(404, "not_found", lambda: apply(setup, changed))


@pytest.mark.parametrize("body,code", [
    ({"contract_version": "9.9.9"}, "unsupported_version"),
    ({"capture_start_authorized": True}, "invalid_request"),
    ({"membership_revision": True}, "invalid_request"),
])
def test_control_registration_rejects_unknown_version_fields_and_boolean_revision(setup, body, code):
    fails(422, code, lambda: setup.registry.register(USER, {**setup.registration, **body}, "invalid"))


def test_control_registry_does_not_install_public_http_routes(setup):
    from services.api.app import create_app
    from services.api.tests.test_http import request

    app = create_app(setup.store)
    assert request(app, "POST", "/v2/process/streams", json=setup.registration).status_code == 404
    assert request(app, "GET", "/v2/process/streams/stream-1").status_code == 404
    assert request(app, "POST", "/v2/process/streams/stream-1:control", json=command(setup)).status_code == 404
    assert request(app, "GET", "/openapi.json", token=None).json() == json.loads(
        (ROOT / "packages/contracts/generated/openapi.json").read_text())
