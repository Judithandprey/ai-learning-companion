"""Bounded deec host boundary probes: actual ASGI/MemoryStore, no socket or DB.
CLI negative sends only synthetic invalid startup, which must fail before provisioning.
"""
import asyncio
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import traceback

ROOT = Path('/tmp/lc-desktop-local-deec')
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
from services.api import desktop_local as host
from services.api.capture_runtime import create_local_capture_runtime
from services.api.storage import MemoryStore
from services.api.tests.test_control_http import request
from services.api.tests.test_desktop_local import startup, encoded, TOKEN, DSN, FLAGS

RESULTS = []
PORT = 43129  # ASGI Host literal only: nothing binds/listens on this port.
HOST = ('Host', f'127.0.0.1:{PORT}')
PATHS = [('/v2/process/streams', '0.2.1'), ('/v2/process/streams/native:control', '0.2.1'),
         ('/v2/process/raw-frames:batch', '0.2.6'), ('/v2/process/desktop-frames:batch', '0.2.8'),
         ('/v2/process/windows-frames:batch', '0.2.10'), ('/v2/process/macos-frames:batch', '0.2.12')]


def check_error(response, status, version, code):
    assert response.status_code == status, (response.status_code, response.text)
    assert response.json() == {'contract_version': version, 'error': code, 'retryable': False}, response.text
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert not any(k.lower().startswith('access-control-') for k in response.headers)
    assert TOKEN not in response.text and DSN not in response.text


def build(enabled):
    body = startup.__wrapped__()
    body.update(fresh_consent=True, producer_profile='desktop_pixels', **{flag: enabled for flag in FLAGS})
    config = host.parse_startup(encoded(body))
    config.pop('port')
    config.pop('database_dsn')
    store = MemoryStore()
    runtime = create_local_capture_runtime(store=store, **config)
    app = host._ParentOnly(runtime.app, PORT, FLAGS if enabled else ())
    return body, store, runtime, app


def strict_record_controls():
    body = startup.__wrapped__()
    raw = encoded(body)
    # Semantic duplicate through JSON escape, finite overflow, and invalid Unicode.
    duplicate = raw.replace(b'"token":', b'"tok\\u0065n":"synthetic-duplicate", "token":')
    overflow = raw.replace(b'"port":0', b'"port":1e999')
    surrogate = json.dumps({**body, 'database_dsn': '\ud800'}, ensure_ascii=True).encode('ascii') + b'\n'
    controls = [duplicate, overflow, surrogate]
    for data in controls:
        try:
            host.parse_startup(data)
        except ValueError as error:
            assert str(error) == 'invalid_startup'
        else:
            raise AssertionError('Ambiguous or non-finite private record accepted')
    # Runtime receives the exact original pins and consent=False without inference.
    parsed = host.parse_startup(raw)
    assert parsed['registration'] == body['registration'] and parsed['fresh_consent'] is False
    assert all(parsed[flag] is False for flag in FLAGS)
    return {'malformed_private_records_refused': 3, 'fixed_error': 'invalid_startup',
            'false_consent_and_disabled_flags_preserved': True}


def host_headers_and_closed_versions(enabled):
    body, store, runtime, app = build(enabled)
    before = deepcopy(store._documents)
    boundary_requests = 0
    for path, family in PATHS:
        version = family if enabled or family == '0.2.1' else '0.2.4'
        for headers in ([('Host', 'foreign.invalid')], [HOST, ('Origin', '')],
                        [HOST, ('sEc-FeTcH-SiTe', 'none')], [HOST, ('HOST', HOST[1])]):
            check_error(request(app, 'POST', path, body={}, headers=headers, token=TOKEN,
                                request_key='independent-boundary'), 403, version, 'forbidden')
            boundary_requests += 1
    for path, family in PATHS[2:]:
        response = request(app, 'POST', path, body={}, headers=[HOST], token=TOKEN,
                           request_key='disabled-or-closed-body')
        check_error(response, 422 if enabled else 404, family if enabled else '0.2.4',
                    'invalid_request' if enabled else 'not_found')
    # Missing Host is tested directly because HTTPX normally inserts one.
    messages = []
    async def receive():
        raise AssertionError('Refused header request read its body')
    async def send(message):
        messages.append(message)
    asyncio.run(app({'type': 'http', 'method': 'POST', 'path': PATHS[-1][0], 'headers': [],
                     'query_string': b'', 'http_version': '1.1'}, receive, send))
    assert messages[0]['status'] == 403
    rejected = json.loads(messages[1]['body'])
    assert rejected['contract_version'] == ('0.2.12' if enabled else '0.2.4')
    assert store._documents == before
    assert runtime.start_status == 'pending' and runtime.current_state is None
    assert TOKEN not in repr(store._documents) and DSN not in repr(store._documents)
    return {'enabled_flags': enabled, 'header_refusals': boundary_requests + 1,
            'route_body_or_default_off_controls': 4, 'no_archive_mutation': True}


def auth_and_readiness_do_not_grant_a_stream():
    body, store, runtime, app = build(True)
    registration = body['registration']
    path = '/v2/process/streams'
    before = deepcopy(store._documents)
    invalid = [[], [('Authorization', 'Basic arbitrary')], [('Authorization', 'Bearer wrong')],
               [('Authorization', 'Bearer')], [('Authorization', 'Bearer ' + TOKEN)] * 2,
               [('Authorization', 'Bearer ' + TOKEN + ',Bearer wrong')]]
    for headers in invalid:
        check_error(request(app, 'POST', path, body=registration, headers=[HOST, *headers],
                            token=None, request_key='independent-registration'), 401, '0.2.1', 'unauthenticated')
    for route, version in PATHS[2:]:
        check_error(request(app, 'POST', route, body={}, headers=[HOST], token=None,
                            request_key='no-token'), 401, version, 'unauthenticated')
    # Forwarded headers are not local credentials or enrollment authority.
    check_error(request(app, 'POST', path, body=registration, token=None,
                        headers=[HOST, ('X-Forwarded-Host', 'trusted.invalid'), ('X-Forwarded-For', '127.0.0.1')],
                        request_key='forwarded'), 401, '0.2.1', 'unauthenticated')
    stream_path = path + '/' + registration['stream_id']
    check_error(request(app, 'GET', stream_path, headers=[HOST], token=TOKEN), 404, '0.2.1', 'not_found')
    assert store._documents == before, 'Pending runtime must not auto-register'
    response = request(app, 'POST', path, body=registration, headers=[HOST], token=TOKEN,
                       request_key='independent-registration')
    assert response.status_code == 200 and response.json()['state'] == 'live', response.text
    assert response.json()['revision'] == 1
    assert store._documents[body['user_id']][('session', body['session_id'])]['live_capture'] is False
    committed = deepcopy(store._documents)
    runtime.app.state.authenticator.revoke(TOKEN)
    check_error(request(app, 'POST', path, body=registration, headers=[HOST], token=TOKEN,
                        request_key='independent-registration'), 401, '0.2.1', 'unauthenticated')
    assert store._documents == committed
    return {'malformed_auth_controls': len(invalid), 'capture_no_auth_controls': 4,
            'forwarded_headers_do_not_authorize': True, 'pending_get': 404,
            'explicit_registration': 200, 'physical_capture': False, 'revoked_cached_retry': 401}


def cli_invalid_secret_record_is_redacted():
    body = startup.__wrapped__()
    body['port'] = True
    result = subprocess.run([sys.executable, '-m', 'services.api.desktop_local'], input=encoded(body),
                            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
    assert result.returncode == 1 and result.stdout == b''
    assert json.loads(result.stderr) == {'format': host.ERROR_FORMAT, 'error': 'invalid_startup'}
    assert TOKEN.encode() not in result.stderr and DSN.encode() not in result.stderr
    assert b'Traceback' not in result.stderr
    return {'exit': 1, 'stdout_bytes': 0, 'stderr': json.loads(result.stderr), 'no_listener_or_DB_setup': True}


for name, action in (
    ('strict private record boundary', strict_record_controls),
    ('all ingress flags disabled', lambda: host_headers_and_closed_versions(False)),
    ('all explicit ingress flags enabled', lambda: host_headers_and_closed_versions(True)),
    ('real ASGI authentication and pending state', auth_and_readiness_do_not_grant_a_stream),
    ('real CLI invalid private record redaction', cli_invalid_secret_record_is_redacted),
):
    try:
        RESULTS.append({'name': name, 'passed': True, 'detail': action()})
    except Exception as error:
        RESULTS.append({'name': name, 'passed': False, 'error': repr(error), 'trace': traceback.format_exc()})
    print(json.dumps(RESULTS[-1], sort_keys=True))
receipt = {'candidate': 'deec5f4c8e3439c4ef05521ac442554a81415dbf', 'export': str(ROOT),
           'probe_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'results': RESULTS, 'passed': sum(r['passed'] for r in RESULTS),
           'failed': sum(not r['passed'] for r in RESULTS),
           'boundary': 'Actual ASGI/MemoryStore and malformed CLI only; no localhost listener, DB, native or provider'}
Path('/tmp/desktop-local-deec-auth-probes.json').write_text(json.dumps(receipt, indent=2) + '\n')
sys.exit(bool(receipt['failed']))
