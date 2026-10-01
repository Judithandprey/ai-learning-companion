import asyncio
from contextlib import asynccontextmanager
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import sys

import pytest
from jsonschema import Draft7Validator

sys.path.insert(0, '/home/agentsdock/Projects/learning-companion/repo')
from services.worker.connectors import chatgpt_rpc as rpc

SOURCE = Path('/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/windows-live-experience-20261001/audio-route-next/realtime_input_probe.py')
spec = importlib.util.spec_from_file_location('candidate', SOURCE)
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)
SCHEMA = Path('/tmp/lc-support-codex-schema-uk50qj_h/experimental/v2')

class FakeProcess:
    def __init__(self, scenario):
        self.scenario = scenario
        self.stdout = asyncio.StreamReader()
        self.stdin = self
        self.returncode = None
        self.messages = []
        self.transcribed = False
    def emit(self, message):
        self.stdout.feed_data(json.dumps(message).encode() + b'\n')
    def event(self, method, params):
        self.emit({'method': method, 'params': params})
    def write(self, line):
        message = json.loads(line)
        self.messages.append(message)
        method = message.get('method')
        if 'id' not in message or method is None:
            return
        result = {}
        if method == 'account/read':
            result = {'account': {'type': 'chatgpt', 'planType': 'pro'}}
        elif method == 'thread/start':
            result = {'model': 'synthetic-model', 'modelProvider': 'synthetic-provider',
                      'cwd': '/synthetic', 'instructionSources': [], 'approvalPolicy': 'never',
                      'sandbox': {'type': 'readOnly', 'networkAccess': False},
                      'thread': {'id': 'owned-thread', 'ephemeral': True}}
        self.emit({'id': message['id'], 'result': result})
        if method == 'thread/realtime/start':
            self.event('thread/realtime/started', {'threadId': 'owned-thread', 'version': 'v2'})
            if self.scenario in ('same_thread_turn', 'foreign_thread_turn'):
                self.event('turn/started', {'threadId': 'owned-thread' if self.scenario == 'same_thread_turn' else 'unexpected-helper',
                                           'turn': {'id': 'unrequested-turn', 'items': [], 'status': 'inProgress', 'error': None}})
            elif self.scenario == 'bem_promotion':
                self.event('thread/realtime/item/completed', {'threadId': 'owned-thread', 'item': {
                    'id': 'promoted', 'realtimeSessionId': 'rt-session', 'type': 'bemItemPromoted',
                    'item_id': 'backing-output', 'turn_id': 'unrequested-turn', 'presentation': {'type': 'wholeItem'}}})
        elif method == 'thread/realtime/appendAudio' and not self.transcribed:
            self.transcribed = True
            self.event('thread/realtime/transcript/done', {'threadId': 'owned-thread', 'role': 'user', 'text': 'seven matrix'})
        elif method == 'thread/realtime/stop':
            self.event('thread/realtime/closed', {'threadId': 'owned-thread'})
    async def drain(self):
        await asyncio.sleep(0)
    def close(self):
        pass
    def terminate(self):
        self.returncode = 0
        self.stdout.feed_eof()
    def kill(self):
        self.returncode = -9
        self.stdout.feed_eof()
    async def wait(self):
        return self.returncode

async def run_synthetic(scenario):
    process = FakeProcess(scenario)
    client = rpc.ChatGPTAppServer(['synthetic-never-executed'], cwd='/synthetic', env={},
        expected_provider='synthetic-provider', verify_config=lambda *args: True)
    @asynccontextmanager
    async def factory():
        try:
            yield client
        finally:
            await client.close()
    async def fake_create(*args, **kwargs):
        return process
    launch = SimpleNamespace(_check_state=lambda path: None, create_client=factory)
    args = SimpleNamespace(expect=['seven', 'matrix'], state_dir=Path('/synthetic-state-never-opened'),
        codex_bin=Path('/synthetic-never-executed'), model='synthetic-model', retain_fixture_transcript=False)
    with patch.object(rpc.asyncio, 'create_subprocess_exec', fake_create), patch.dict(candidate.os.environ):
        result = await candidate.run_live(args, b'\x01\x00' * 12000, rpc, launch)
    Path('/tmp/realtime-input-candidate-review/' + scenario + '.json').write_text(json.dumps(result, indent=2) + '\n')
    assert process.returncode is not None
    assert not any(row.get('method') == 'turn/start' for row in process.messages)
    return result

def test_expected_synthetic_success_through_real_rpc_reader():
    result = asyncio.run(run_synthetic('ordinary'))
    assert result['status'] == 'fixture_transport_and_terms_passed'
    assert result['methods']['thread/realtime/start'] == result['methods']['thread/realtime/stop'] == 1
    assert result['methods']['thread/realtime/appendAudio'] == 15

def test_same_thread_backing_turn_is_refused_control():
    result = asyncio.run(run_synthetic('same_thread_turn'))
    assert result['status'] == 'not_passed'
    assert result['failure'] == 'unexpected_backing_turn'

def test_foreign_thread_backing_turn_must_not_pass():
    result = asyncio.run(run_synthetic('foreign_thread_turn'))
    assert result['status'] == 'not_passed', result

def test_canonical_backing_item_promotion_must_not_pass():
    result = asyncio.run(run_synthetic('bem_promotion'))
    assert result['status'] == 'not_passed', result

def test_candidate_schema_shapes_and_canonical_backing_witness():
    o = candidate.Observe(['seven', 'matrix'])
    o.thread = 'owned-thread'
    client = SimpleNamespace(cwd='/synthetic', _send=lambda *args: None)
    g = candidate.WireGuard(client, o, {})
    examples = {
        'ThreadRealtimeStartParams': g.start_params(),
        'ThreadRealtimeAppendAudioParams': {'threadId': o.thread, 'audio': candidate.chunk(b'\x01\x00' * 2400)},
        'ThreadRealtimeStopParams': {'threadId': o.thread},
        'ThreadRealtimeItemCompletedNotification': {'threadId': o.thread, 'item': {
            'id': 'promoted', 'realtimeSessionId': 'rt-session', 'type': 'bemItemPromoted',
            'item_id': 'backing-output', 'turn_id': 'unrequested-turn', 'presentation': {'type': 'wholeItem'}}},
    }
    for name, value in examples.items():
        Draft7Validator(json.loads((SCHEMA / (name + '.json')).read_text())).validate(value)
    assert not any(term in json.dumps(g.start_params()).casefold() for term in o.expected)

def test_empty_or_prompted_oracle_terms_must_not_claim_matching_evidence():
    # Both forms are currently accepted by --expect and the live preflight.
    for terms, transcript in [([''], 'unrelated utterance'), (['speech'], 'speech')]:
        observer = candidate.Observe(terms)
        observer.final('user', transcript)
        assert not all(observer.evidence()['fixture_terms_matched']), {
            'terms': terms, 'transcript': transcript,
            'actual': observer.evidence()['fixture_terms_matched'],
            'problem': 'vacuous term or term already present in the fixed prompt',
        }
