"""Actual trusted-runtime HTTP to Learning; synthetic consent/identity/bytes only."""
from copy import deepcopy
from pathlib import Path
import json
import sys

sys.path.insert(0, sys.argv[1] if len(sys.argv) == 2 else str(Path(__file__).resolve().parents[3]))
from services.api.errors import DomainError
from services.api.image_resolver import AuthorizedImageResolver
from services.api.process_context import AuthorizedProcessContextReader
from services.api.tests.test_capture_runtime import TOKEN, setup, uploaded, stopped
from services.api.tests.test_desktop_capture_runtime import (
    desktop, build, register_display, gap_payload, submit, accepted,
)
from services.learning.process_context import prepare_observation_window

c = desktop.__wrapped__(setup.__wrapped__())
assert c.store._documents == {}
runtime = build(c)
register_display(c, runtime)
first_gap = gap_payload(c)
ack = accepted(c, submit(c, runtime, envelope=first_gap), first_gap)
assert ack['acknowledged'][0]['artifacts'] == []
assert not any(kind in {'artifact', 'frame', 'raw_capture_frame'} for kind, _ in c.store._documents[c.user])

def consumers(runtime, token):
    def guard(state):
        principal = runtime.app.state.authenticator.authenticate(token, c.instant[0])
        if principal != runtime.principal or state.get('generation') != principal.authorization_generation:
            raise DomainError(403, 'forbidden')
    return (AuthorizedProcessContextReader(c.store, c.user, guard).read_desktop,
            AuthorizedImageResolver(c.store, c.user, guard).resolve_desktop)

def compose(runtime, token, ids, resolve=None):
    read, resolver = consumers(runtime, token)
    return prepare_observation_window(ids, read, resolver if resolve is None else resolve, user_id=c.user)

gap_id = first_gap['batch']['records'][0]['record_id']
packet = compose(runtime, TOKEN, [gap_id])
assert packet['items'][0]['image'] == {'status': 'missing_frame'}
assert packet['items'][0]['frame'] is None and packet['attached_bytes'] == 0

uploaded(c, runtime)
later = deepcopy(c.desktop_envelope)
later['batch']['records'][0].update(sequence=2, causal_parents=[gap_id])
accepted(c, submit(c, runtime, envelope=later, request_key='runtime-pixels'), later)
ids = [gap_id, later['batch']['records'][0]['record_id']]
packet = compose(runtime, TOKEN, ids)
assert [x['image']['status'] for x in packet['items']] == ['missing_frame', 'attached']
assert packet['items'][1]['image']['data'] == c.data
assert packet['items'][1]['record']['artifacts'] == [c.ref, c.ink_ref]
assert packet['provider_receipt'] == 'not_attested'
assert packet['presentation_permission'] == 'not_granted'
assert packet['observation_window']['capture_chronology'] == 'unknown'

rotated = 'synthetic-context-rotated-token-' + 'r' * 32
before = deepcopy(c.store._documents)
reopened = build(c, fresh_consent=False, token=rotated)
runtime.app.state.authenticator.revoke(TOKEN)  # separate host tokens are explicitly revoked
assert compose(reopened, rotated, ids) == packet
assert c.store._documents == before
try:
    compose(runtime, TOKEN, ids)
except DomainError as error:
    assert error.status == 401
else:
    raise AssertionError('revoked old host token read source context')

# Stop changes capture authority, not the retained original historical selection.
runtime = build(c, fresh_consent=False)
stopped(c, runtime)
terminal = build(c, fresh_consent=False)
assert terminal.current_state['state'] == 'stopped'
assert compose(terminal, TOKEN, ids) == packet
assert submit(c, terminal, envelope=later, request_key='stopped-new-key').status_code == 409

# Token loss after pixel resolution must withhold the entire assembled window.
read, resolve = consumers(terminal, TOKEN)
def revoke_after_image(frame, **kwargs):
    result = resolve(frame, **kwargs)
    terminal.app.state.authenticator.revoke(TOKEN)
    return result
try:
    prepare_observation_window(ids, read, revoke_after_image, user_id=c.user)
except DomainError as error:
    assert error.status == 401
else:
    raise AssertionError('context escaped final current-token check')

assert TOKEN not in repr(c.store._documents) and rotated not in repr(c.store._documents)
print(json.dumps({'status': 'PASS', 'groups': 5,
    'path': 'trusted runtime / HTTP gaps+PNG+ink / same-store reopen / Learning / Stop / final token check',
    'identity_consent': 'synthetic', 'database_native_provider': 'not_run'}))
