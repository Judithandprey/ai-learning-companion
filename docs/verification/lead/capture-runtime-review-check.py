"""Independent local-only probes plus Lead's actual runtime/context composition.

Run from the repository root with runpy.run_path(..., run_name='__main__').
All authority and pixels are synthetic; no server/DB/device/provider is used.
"""
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json

from services.api.capture_runtime import create_local_capture_runtime
from services.api.domain import Archive
from services.api.errors import DomainError
from services.api.storage import MemoryStore
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.learning.process_context import prepare_observation_window
from services.api.tests.test_capture_app import (
    context, USER, NOW, request, capture, RAW_FRAMES, original_path, original_body, ORIGINALS,
)
from services.api.tests.test_capture_runtime import build, options, uploaded, register, stopped, TOKEN

results = []

def fixture():
    c = context(MemoryStore(), USER)
    c.store = MemoryStore()
    c.instant = [NOW]
    del c.registry, c.archive
    return c

def refused(operation):
    try:
        operation()
    except DomainError as error:
        assert error.status in (401, 403, 404, 409), (error.status, error.code)
        return error.status
    raise AssertionError("expected refusal")

# Expiry crosses the lock boundary after initial configuration validation.
c = fixture()
original_transaction = c.store.transaction
@contextmanager
def expiry_at_lock(actor):
    with original_transaction(actor) as tx:
        c.instant[0] = NOW + timedelta(hours=2)
        yield tx
c.store.transaction = expiry_at_lock
assert refused(lambda: build(c)) == 401
assert c.store._documents == {}
results.append({"case": "expiry_at_bootstrap_lock_rolls_back_all_foundations", "pass": True})

# Account revocation occurs after HTTP header authentication but before lock entry.
c = fixture()
r = build(c)
uploaded(c, r)
original_transaction = c.store.transaction
revoked = [False]
@contextmanager
def revoke_before_lock(actor):
    if not revoked[0]:
        revoked[0] = True
        with original_transaction(actor) as tx:
            tx.put("authorization", "state", {"enabled": False, "generation": 2})
    with original_transaction(actor) as tx:
        yield tx
c.store.transaction = revoke_before_lock
assert register(c, r).status_code == 403
c.store.transaction = original_transaction
assert c.store._documents[USER][("control_stream", c.registration["stream_id"])]["state"]["revision"] == 1
results.append({"case": "account_rechecked_after_HTTP_authentication", "pass": True})

# Reopen reconciles control only: it cannot revive source heads or byte receipts.
for action in ("delete_source", "revoke_source"):
    c = fixture()
    r = build(c)
    uploaded(c, r)
    c.app = r.app
    capture(c, token=TOKEN)
    getattr(Archive(c.store), action)(USER, c.source["source_id"])
    before = deepcopy(c.store._documents)
    for consent in (False, True):
        reopened = build(c, fresh_consent=consent)
        assert reopened.start_status == "consumed"
        responses = [
            request(reopened.app, "GET", original_path(c), token=TOKEN),
            request(reopened.app, "PUT", c.display_path, body=c.display, token=TOKEN),
            request(reopened.app, "PUT", ORIGINALS + c.ref["artifact_id"], body=original_body(c), token=TOKEN),
            request(reopened.app, "POST", RAW_FRAMES, body=c.raw_envelope,
                    request_key="same-key-on-distinct-paths", token=TOKEN),
        ]
        assert all(response.status_code in (403, 404) for response in responses), [response.text for response in responses]
    assert c.store._documents == before
    results.append({"case": action + "_fences_reopened_original_and_raw_receipt_replay", "pass": True})

# Stop invalidates an already prepared successor for the same trusted producer.
c = fixture()
r = build(c)
assert register(c, r).status_code == 200
successor = {**c.registration, "stream_id": "future-incarnation",
             "continuity": {"kind": "restart", "previous_stream_id": c.registration["stream_id"], "gap": "unknown"}}
pending = build(c, registration=successor)
assert pending.start_status == "pending"
stopped(c, r)
before = deepcopy(c.store._documents)
for consent in (False, True):
    assert refused(lambda: build(c, registration=successor, fresh_consent=consent)) == 403
assert register(c, pending, body=successor, request_key="future-register").status_code == 403
assert c.store._documents == before
results.append({"case": "stop_invalidates_unconsumed_same_producer_successor", "pass": True})

# New account authorization cannot make an earlier stream or grant current.
c = fixture()
r = build(c)
uploaded(c, r)
archive = Archive(c.store)
archive.set_authorization(USER, False)
generation = archive.set_authorization(USER, True)["generation"]
before = deepcopy(c.store._documents)
assert refused(lambda: build(c, fresh_consent=False)) == 403
assert refused(lambda: build(c, registration={**c.registration, "authorization_generation": generation})) == 409
assert c.store._documents == before
successor = {**c.registration, "stream_id": "reauthorized-incarnation", "authorization_generation": generation,
             "continuity": {"kind": "restart", "previous_stream_id": c.registration["stream_id"], "gap": "unknown"}}
assert refused(lambda: build(c, registration=successor, fresh_consent=False)) == 403
fresh = build(c, registration=successor)
assert register(c, fresh, body=successor, request_key="reauthorized-register").status_code == 200
assert register(c, r).status_code == 403
results.append({"case": "account_reenable_requires_fresh_new_incarnation_with_original_lineage", "pass": True})

# Lead integration: compose the two newly delivered runtime/window callables
# through the existing original store and current-authorization reader.
c = fixture()
r = build(c)
uploaded(c, r)
c.app = r.app
capture(c, token=TOKEN)

def guard(state):
    assert c.store._local.in_transaction
    principal = r.app.state.authenticator.authenticate(TOKEN, c.instant[0])
    if (principal.user_id != USER or "sources:read" not in principal.scopes
            or state["generation"] != principal.authorization_generation):
        raise DomainError(403, "forbidden")

reader = AuthorizedProcessContextReader(c.store, USER, guard)
resolver = AuthorizedImageResolver(c.store, USER, guard)
ids = [record["record_id"] for record in c.batch["records"]]

def window():
    return prepare_observation_window(ids, reader.read_raw, resolver.resolve_raw, user_id=USER)

packet = window()
assert packet["items"][0]["image"]["data"] == c.data
assert packet["items"][0]["frame"] == c.raw_frame
assert packet["items"][0]["record"]["artifacts"] == [c.ref, c.ink_ref]
assert packet["live_status"] == packet["provider_receipt"] == "not_attested"
assert packet["presentation_permission"] == "not_granted"
stopped(c, r)
assert build(c, fresh_consent=False).current_state["state"] == "stopped"
assert window() == packet  # Stop preserves authorized historical originals.
r.app.state.authenticator.revoke(TOKEN)
assert refused(window) == 401
results.append({"case": "runtime_HTTP_original_to_Learning_window_stop_retention_and_token_revoke", "pass": True})

print(json.dumps({"backend_source": "e59c288625eeea24e875e101c9e82ce4f9bbe585",
                  "groups": results}, indent=2))
