"""Trusted local runtime over a pristine actor store and the existing ASGI app.

Identity/consent and bytes are synthetic. No listener, database, preview, desktop
capture, production login or provider is started by these checks.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
from threading import Barrier

import pytest

from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive, key
from services.api.errors import DomainError
from services.api.storage import MemoryStore, _MemoryTransaction
from services.api.tests.test_capture_app import (
    CAPABILITIES, COLLECTION, NOW, ORIGINALS, RAW_FRAMES, SCOPES, USER,
    capture, context, control_error, ingress_error, ingress_success,
    original_body, original_path, raw_error, request, state,
)
from services.api.tests.test_control import command, resolve_stop_fact


TOKEN = "synthetic-local-runtime-token-" + "x" * 32


@pytest.fixture
def setup():
    # Assemble valid request metadata elsewhere; the runtime's actual store is empty.
    c = context(MemoryStore(), USER)
    c.store = MemoryStore()
    del c.registry, c.archive
    c.instant = [NOW]
    assert c.store._documents == {}
    return c


def options(c):
    return dict(store=c.store, user_id=c.user, device_id=c.registration["device_id"],
                session_id=c.registration["session_id"], producer_id="local-desktop-screen",
                registration=deepcopy(c.registration), token=TOKEN, expires_at=NOW + timedelta(hours=1),
                scopes=SCOPES, capabilities=CAPABILITIES, clock=lambda: c.instant[0],
                stop_fact_resolver=resolve_stop_fact)


def build(c, **changes):
    return create_local_capture_runtime(**{**options(c), "fresh_consent": True,
                                          "enable_raw_ingress": True, **changes})


def register(c, runtime, *, request_key="runtime-registration", body=None, token=TOKEN):
    return request(runtime.app, "POST", COLLECTION, body=c.registration if body is None else body,
                   request_key=request_key, token=token)


def uploaded(c, runtime):
    state(register(c, runtime), "live")
    descriptor = ingress_success(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN),
                                  "DisplaySourceSnapshot")
    for ink in (False, True):
        body = original_body(c, ink=ink)
        receipt = ingress_success(request(runtime.app, "PUT", ORIGINALS + body["artifact"]["artifact_id"],
                                           body=body, token=TOKEN), "OriginalArtifactReceipt")
        assert receipt["status"] == "bytes_committed"
    return descriptor


def stopped(c, runtime, action="stop"):
    return state(request(runtime.app, "POST", c.stream_path + ":control", body=command(c, action),
                         request_key="runtime-stop", token=TOKEN), "stopped" if action == "stop" else "withdrawn")


def refused_without_changes(c, operation):
    before = deepcopy(c.store._documents)
    with pytest.raises(DomainError):
        operation()
    assert c.store._documents == before


def test_pristine_runtime_requires_explicit_consent_and_only_issues_pending_grant(setup, monkeypatch):
    c = setup
    refused_without_changes(c, lambda: create_local_capture_runtime(**options(c)))
    assert c.store._documents == {}
    original_transaction = c.store.transaction
    entries = []

    @contextmanager
    def counted(actor):
        entries.append(actor)
        with original_transaction(actor) as tx:
            yield tx

    original = deepcopy(c.registration)
    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", counted)
        runtime = build(c)
    assert entries == [USER]
    assert runtime.start_status == "pending" and runtime.current_state is None
    assert runtime.registration == original and runtime.registration is not c.registration
    assert runtime.producer_id == "local-desktop-screen"
    assert runtime.principal.user_id == USER and runtime.principal.scopes == SCOPES
    assert runtime.principal.authorization_generation == original["authorization_generation"]
    rows = c.store._documents[USER]
    assert set(rows) == {("authorization", "state"), ("device", original["device_id"]),
                         ("session", original["session_id"]),
                         ("control_membership", key(original["device_id"], original["session_id"])),
                         ("control_start", original["stream_id"])}
    assert rows[("authorization", "state")] == {"enabled": True, "generation": 1}
    assert rows[("control_membership", key(original["device_id"], original["session_id"]))]["revision"] == 1
    assert rows[("session", original["session_id"])]["live_capture"] is False
    assert runtime.app.state.paid_executor_enabled is False
    assert TOKEN not in repr(runtime) and TOKEN not in repr(rows)
    runtime.registration["stream_id"] = "detached-result"
    assert c.registration == original
    reopened = build(c, fresh_consent=False)
    assert reopened.registration == original and reopened.start_status == "pending"
    assert reopened.current_state is None


def test_runtime_http_registration_originals_raw_ack_and_reopen_share_existing_store(setup):
    c = setup
    runtime = build(c)
    descriptor = uploaded(c, runtime)
    c.app = runtime.app
    ack = capture(c, token=TOKEN)
    before = deepcopy(c.store._documents)
    reopened = build(c, fresh_consent=False)
    assert reopened.start_status == "consumed"
    assert reopened.current_state == state(request(reopened.app, "GET", c.stream_path, token=TOKEN), "live")
    assert state(register(c, reopened), "live") == reopened.current_state
    c.app = reopened.app
    assert capture(c, token=TOKEN) == ack
    for ink in (False, True):
        body = original_body(c, ink=ink)
        assert ingress_success(request(reopened.app, "GET", original_path(c, body["artifact"]["artifact_id"]),
                                       token=TOKEN), "OriginalArtifactUpload") == body
    assert ingress_success(request(reopened.app, "GET", c.display_path, token=TOKEN), "DisplaySourceSnapshot") == descriptor
    assert c.store._documents == before


@pytest.mark.parametrize("action", ["stop", "withdraw"])
def test_reopen_consumed_stopped_grant_returns_current_state_without_regrant(setup, action):
    c = setup
    runtime = build(c)
    uploaded(c, runtime)
    terminal = stopped(c, runtime, action)
    before = deepcopy(c.store._documents)
    for consent in (False, True):
        reopened = build(c, fresh_consent=consent)
        assert reopened.start_status == "consumed" and reopened.current_state == terminal
        assert state(register(c, reopened), terminal["state"]) == terminal
        ingress_error(request(reopened.app, "PUT", c.display_path, body=c.display, token=TOKEN), 403, "forbidden")
        body = original_body(c)
        ingress_error(request(reopened.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=body, token=TOKEN),
                      403, "forbidden")
        assert ingress_success(request(reopened.app, "GET", original_path(c), token=TOKEN), "OriginalArtifactUpload") == body
    assert c.store._documents == before


def test_restart_needs_new_incarnation_predecessor_and_fresh_consent(setup):
    c = setup
    runtime = build(c)
    state(register(c, runtime), "live")
    previous = stopped(c, runtime)
    restarted = {**c.registration, "stream_id": "new-desktop-incarnation",
                 "continuity": {"kind": "restart", "previous_stream_id": c.registration["stream_id"], "gap": "unknown"}}
    refused_without_changes(c, lambda: build(c, registration=restarted, fresh_consent=False))
    refused_without_changes(c, lambda: build(c, registration={**restarted, "continuity": {"kind": "initial"}}))
    fresh = build(c, registration=restarted)
    assert fresh.start_status == "pending" and fresh.current_state is None
    assert state(register(c, fresh, body=restarted, request_key="restart-registration"), "live")["stream_id"] == restarted["stream_id"]
    assert state(request(fresh.app, "GET", c.stream_path, token=TOKEN), "stopped") == previous


@pytest.mark.parametrize("outcome", ["grant_commit", "registration_response"])
def test_unknown_outcome_is_reconciled_without_new_consent_or_duplicate_grant(setup, monkeypatch, outcome):
    c = setup
    if outcome == "grant_commit":
        original_transaction = c.store.transaction

        @contextmanager
        def lost_commit_result(actor):
            with original_transaction(actor) as tx:
                yield tx
            raise RuntimeError("synthetic result loss after committed grant")

        with monkeypatch.context() as patch:
            patch.setattr(c.store, "transaction", lost_commit_result)
            with pytest.raises(RuntimeError, match="result loss"):
                build(c)
        assert c.store._documents[USER][("control_start", c.registration["stream_id"])]["status"] == "pending"
    else:
        runtime = build(c)
        # The server response succeeds but is deliberately discarded by this caller.
        assert register(c, runtime).status_code == 200
    before = deepcopy(c.store._documents)
    reopened = build(c, fresh_consent=False)
    assert reopened.start_status == ("pending" if outcome == "grant_commit" else "consumed")
    assert c.store._documents == before
    state(register(c, reopened), "live")
    after = deepcopy(c.store._documents)
    assert state(register(c, reopened), "live") == state(request(reopened.app, "GET", c.stream_path, token=TOKEN), "live")
    assert c.store._documents == after


@pytest.mark.parametrize("failure", ["control_membership", "control_start", "commit"])
def test_bootstrap_failures_roll_back_every_new_identity(setup, monkeypatch, failure):
    c = setup
    original_put, original_transaction = _MemoryTransaction.put, c.store.transaction
    observed = []

    def put(tx, kind, identifier, value):
        original_put(tx, kind, identifier, value)
        if kind == failure:
            observed.append(failure)
            raise RuntimeError("synthetic bootstrap failure")

    @contextmanager
    def failed_commit(actor):
        with original_transaction(actor) as tx:
            yield tx
            observed.append("commit")
            raise RuntimeError("synthetic bootstrap failure")

    with monkeypatch.context() as patch:
        if failure == "commit":
            patch.setattr(c.store, "transaction", failed_commit)
        else:
            patch.setattr(_MemoryTransaction, "put", put)
        with pytest.raises(RuntimeError, match="bootstrap failure"):
            build(c)
    assert observed == [failure] and c.store._documents == {}
    assert build(c).start_status == "pending"


def test_concurrent_exact_consents_reconcile_one_pending_start(setup):
    c = setup
    barrier = Barrier(2)

    def start():
        barrier.wait(timeout=5)
        return build(c)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(start) for _ in range(2)]
        runtimes = [future.result(timeout=10) for future in futures]
    assert [runtime.start_status for runtime in runtimes] == ["pending", "pending"]
    assert sum(kind == "control_start" for kind, _ in c.store._documents[USER]) == 1
    before = deepcopy(c.store._documents)
    assert build(c, fresh_consent=False).start_status == "pending"
    assert c.store._documents == before


def test_readonly_reopen_never_writes_or_grants(setup, monkeypatch):
    c = setup
    build(c)
    before = deepcopy(c.store._documents)

    def unexpected_put(*args):
        raise AssertionError("read-only reopen attempted a write")

    with monkeypatch.context() as patch:
        patch.setattr(_MemoryTransaction, "put", unexpected_put)
        assert build(c, fresh_consent=False).start_status == "pending"
        different = {**c.registration, "stream_id": "ungiven-start"}
        with pytest.raises(DomainError):
            build(c, registration=different, fresh_consent=False)
    assert c.store._documents == before


@pytest.mark.parametrize("consumed", [False, True])
@pytest.mark.parametrize("kind", ["authorization", "device", "session", "control_membership", "control_start"])
def test_lost_retained_foundations_are_not_recreated(setup, consumed, kind):
    c = setup
    runtime = build(c)
    if consumed:
        state(register(c, runtime), "live")
    identity = {"authorization": "state", "device": c.registration["device_id"],
                "session": c.registration["session_id"], "control_start": c.registration["stream_id"],
                "control_membership": key(c.registration["device_id"], c.registration["session_id"])}[kind]
    del c.store._documents[USER][(kind, identity)]
    # Fresh consent cannot repair witnessed loss. A pending-only grant leaves no
    # per-stream witness when erased; reopening without consent must still refuse.
    for consent in ((False,) if kind == "control_start" and not consumed else (False, True)):
        refused_without_changes(c, lambda: build(c, fresh_consent=consent))


@pytest.mark.parametrize("corruption", ["producer", "body", "invalidated", "old_pins", "foreign_device", "deleted_session", "inactive_membership", "revoked"])
def test_existing_authority_is_not_relabelled_reactivated_or_rebound(setup, corruption):
    c = setup
    build(c)
    rows, changes = c.store._documents[USER], {}
    if corruption == "producer":
        changes["producer_id"] = "other-producer"
    elif corruption == "body":
        changes["registration"] = {**c.registration, "continuity": {"kind": "restart", "previous_stream_id": "other-stream", "gap": "unknown"}}
    elif corruption == "invalidated":
        rows[("control_start", c.registration["stream_id"])]["status"] = "invalidated"
    elif corruption == "old_pins":
        rows[("authorization", "state")]["generation"] = 2
    elif corruption == "foreign_device":
        rows[("device", c.registration["device_id"])]["user_id"] = "other-user"
    elif corruption == "deleted_session":
        rows[("session", c.registration["session_id"])]["deleted"] = True
    elif corruption == "inactive_membership":
        rows[("control_membership", key(c.registration["device_id"], c.registration["session_id"]))]["active"] = False
    else:
        Archive(c.store).set_authorization(USER, False)
    for consent in (False, True):
        refused_without_changes(c, lambda: build(c, fresh_consent=consent, **changes))


@pytest.mark.parametrize("fence", ["expiry", "revoke", "account_revoke"])
def test_current_credentials_are_rechecked_on_http_and_cached_registration(setup, fence):
    c = setup
    runtime = build(c)
    uploaded(c, runtime)
    if fence == "expiry":
        c.instant[0] = NOW + timedelta(hours=2)
    elif fence == "revoke":
        runtime.app.state.authenticator.revoke(TOKEN)
    else:
        Archive(c.store).set_authorization(USER, False)
    before = deepcopy(c.store._documents)
    status, code = (403, "forbidden") if fence == "account_revoke" else (401, "unauthenticated")
    control_error(register(c, runtime), status, code)
    ingress_error(request(runtime.app, "GET", original_path(c), token=TOKEN), status, code)
    raw_error(request(runtime.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key="raw", token=TOKEN), status, code)
    assert c.store._documents == before


def test_principal_cannot_read_or_capture_another_actor(setup):
    c = setup
    runtime = build(c)
    uploaded(c, runtime)
    other = build(c, user_id="other-user", token="other-local-runtime-token-" + "y" * 32)
    other_token = "other-local-runtime-token-" + "y" * 32
    before = deepcopy(c.store._documents)
    ingress_error(request(runtime.app, "GET", c.display_path, token=other_token), 401, "unauthenticated")
    ingress_error(request(other.app, "GET", c.display_path, token=other_token), 404, "not_found")
    raw_error(request(other.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key="foreign", token=other_token), 404, "not_found")
    assert c.store._documents == before


def test_raw_route_default_and_explicit_scopes_do_not_expand_permissions(setup):
    c = setup
    runtime = create_local_capture_runtime(**options(c), fresh_consent=True)
    ingress_error(request(runtime.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key="off", token=TOKEN), 404, "not_found")
    scoped = build(c, fresh_consent=False, scopes=frozenset({"process:control"}),
                   capabilities=frozenset({"process.control.v0.2.1"}), enable_raw_ingress=False)
    state(register(c, scoped), "live")
    before = deepcopy(c.store._documents)
    ingress_error(request(scoped.app, "PUT", c.display_path, body=c.display, token=TOKEN), 403, "forbidden")
    ingress_error(request(scoped.app, "POST", RAW_FRAMES, body=c.raw_envelope, request_key="no-capture", token=TOKEN), 404, "not_found")
    assert c.store._documents == before


@pytest.mark.parametrize("change", [
    {"token": "x" * 31}, {"token": "x" * 4097}, {"token": "bad token " + "x" * 32},
    {"expires_at": NOW}, {"expires_at": NOW.replace(tzinfo=None)},
    {"scopes": {"process:control"}}, {"scopes": frozenset({"process:capture"})},
    {"scopes": SCOPES | {"unreleased:scope"}}, {"capabilities": set(CAPABILITIES)},
    {"capabilities": CAPABILITIES - {"process.control.v0.2.1"}},
    {"capabilities": CAPABILITIES | {"unreleased.capability"}},
    {"fresh_consent": 1}, {"enable_raw_ingress": 1},
    {"device_id": "different-device"}, {"session_id": "different-session"},
    {"clock": None}, {"stop_fact_resolver": "not-callable"},
])
def test_malformed_configuration_fails_before_any_store_transaction(setup, monkeypatch, change):
    c = setup

    def forbidden_transaction(actor):
        raise AssertionError("invalid config reached the actor transaction")

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", forbidden_transaction)
        with pytest.raises(ValueError):
            build(c, **change)
    assert c.store._documents == {}


@pytest.mark.parametrize("pin", ["authorization_generation", "membership_revision"])
def test_new_store_cannot_satisfy_invented_later_generation_pins(setup, pin):
    c = setup
    refused_without_changes(c, lambda: build(c, registration={**c.registration, pin: 2}))
    assert c.store._documents == {}


@pytest.mark.parametrize("change", [{"producer_id": ""}, {"registration": {"contract_version": "0.2.1"}}])
def test_malformed_shared_identity_or_registration_is_rejected_before_mutation(setup, monkeypatch, change):
    c = setup

    def forbidden_transaction(actor):
        raise AssertionError("invalid shared contract reached the actor transaction")

    with monkeypatch.context() as patch:
        patch.setattr(c.store, "transaction", forbidden_transaction)
        with pytest.raises(DomainError) as exc:
            build(c, **change)
    assert exc.value.status == 422
    assert c.store._documents == {}


def test_second_device_and_session_join_only_with_their_own_consent(setup):
    c = setup
    first = build(c)
    state(register(c, first), "live")
    before = deepcopy(c.store._documents)
    second_body = {**c.registration, "device_id": "second-desktop", "session_id": "second-session",
                   "stream_id": "second-desktop-stream"}
    second_args = dict(device_id=second_body["device_id"], session_id=second_body["session_id"],
                       registration=second_body)
    refused_without_changes(c, lambda: build(c, fresh_consent=False, **second_args))
    second = build(c, **second_args)
    assert second.start_status == "pending" and second.current_state is None
    rows = c.store._documents[USER]
    assert {identity: rows[identity] for identity in before[USER]} == before[USER]
    assert state(register(c, second, body=second_body, request_key="second-register"), "live")["device_id"] == "second-desktop"
    stopped(c, first)
    assert state(request(second.app, "GET", COLLECTION + "/second-desktop-stream", token=TOKEN), "live")["session_id"] == "second-session"


def test_consumed_stream_cannot_rebind_to_another_legitimate_owned_device(setup):
    c = setup
    first = build(c)
    state(register(c, first), "live")
    second_body = {**c.registration, "device_id": "other-owned-device", "stream_id": "other-device-stream"}
    build(c, device_id=second_body["device_id"], registration=second_body)
    c.store._documents[USER][("control_stream", c.registration["stream_id"])]["state"]["device_id"] = second_body["device_id"]
    for consent in (False, True):
        refused_without_changes(c, lambda: build(c, fresh_consent=consent))


@pytest.mark.parametrize("subject,flag", [
    ("device", "revoked"), ("session", "revoked"),
    ("control_membership", "deleted"), ("control_membership", "revoked"),
])
def test_current_identity_lifecycle_fences_cached_registration_uploads_and_reopen(setup, subject, flag):
    c = setup
    runtime = build(c)
    uploaded(c, runtime)
    identity = {"device": c.registration["device_id"], "session": c.registration["session_id"],
                "control_membership": key(c.registration["device_id"], c.registration["session_id"])}[subject]
    c.store._documents[USER][(subject, identity)][flag] = True
    before = deepcopy(c.store._documents)
    control_error(register(c, runtime), 403, "forbidden")
    ingress_error(request(runtime.app, "PUT", c.display_path, body=c.display, token=TOKEN), 403, "forbidden")
    ingress_error(request(runtime.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c), token=TOKEN),
                  403, "forbidden")
    for consent in (False, True):
        refused_without_changes(c, lambda: build(c, fresh_consent=consent))
    assert c.store._documents == before


@pytest.mark.parametrize("kind", ["source", "event", "source_tombstone"])
def test_any_retained_document_prevents_auth_loss_from_looking_like_pristine_actor(setup, kind):
    c = setup
    # Only this opaque retained original/fence exists: no control witness, grant,
    # membership, device/session or authorization row can aid loss detection.
    with c.store.transaction(USER) as tx:
        tx.put(kind, "unrelated-history", {"user_id": USER, "id": "unrelated-history"})
    assert set(c.store._documents[USER]) == {(kind, "unrelated-history")}
    refused_without_changes(c, lambda: build(c, fresh_consent=True))
