"""Synthetic App Server probe, intended ONLY inside the documented private bwrap.

No credentials, official provider or real inference. /case is owned disposable data.
The fake endpoint records names/hashes/markers, never headers or raw prompt text.
"""

from hashlib import sha256
from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time


ROOT = Path('/case')
STATE = ROOT / 'state'
CWD = ROOT / 'parent' / 'empty'
MARKERS = ['LC_GLOBAL_AGENTS_CANARY_701', 'LC_PARENT_AGENTS_CANARY_702']
DISABLED = [
    'hooks', 'shell_tool', 'shell_snapshot', 'code_mode', 'code_mode_host',
    'code_mode_prewarm', 'apps', 'plugins', 'remote_plugin', 'browser_use',
    'computer_use', 'image_generation', 'view_image', 'multi_agent',
    'multi_agent_v2', 'goals', 'memories', 'skill_mcp_dependency_install',
    'skill_search', 'tool_suggest', 'workspace_dependencies', 'daemon_auto_start',
    'enable_request_compression',
]
report = {'scope': 'Synthetic loopback transport only; no managed auth or real inference',
          'requests': [], 'rpc_methods': [], 'server_requests_rejected': [],
          'disabled_features': DISABLED, 'probe_sha256': sha256(Path(__file__).read_bytes()).hexdigest()}


def tool_inventory(tools):
    result = []
    for tool in tools:
        item = {k: tool[k] for k in ('type', 'name') if k in tool}
        if isinstance(tool.get('function'), dict):
            item['function_name'] = tool['function'].get('name')
        if 'tools' in tool:
            item['children'] = tool_inventory(tool['tools'])
        result.append(item)
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        report['unexpected_http_get'] = self.path
        self.send_error(404)

    def do_POST(self):
        self.connection.settimeout(2)
        length = int(self.headers.get('Content-Length', '0'))
        if self.path != '/v1/responses' or not 0 < length <= 2_000_000:
            self.send_error(400)
            return
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError):
            report['body_not_json'] = True
            self.send_error(400)
            return
        serialized = json.dumps(body)
        report['requests'].append({
            'model': body.get('model'), 'stream': body.get('stream'),
            'body_sha256': sha256(raw).hexdigest(), 'body_bytes': len(raw),
            'tools': tool_inventory(body.get('tools', [])),
            'tools_sha256': sha256(json.dumps(body.get('tools', []), sort_keys=True).encode()).hexdigest(),
            'tool_choice': body.get('tool_choice'),
            'canaries_in_body': {m: m in serialized for m in MARKERS},
        })
        if report['transient_failure']:
            payload = b'{"error":{"message":"Synthetic transient failure","type":"server_error"}}'
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        # Exactly one response; no tool invocation and no retry-producing error.
        output = {'type': 'message', 'id': 'msg_synthetic', 'role': 'assistant',
                  'status': 'completed', 'content': [{'type': 'output_text',
                  'text': 'SYNTHETIC_LOCAL_RESPONSE_ONLY', 'annotations': []}]}
        completed = {'id': 'resp_synthetic', 'object': 'response', 'created_at': 0,
                     'status': 'completed', 'model': body.get('model'), 'output': [output],
                     'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
        events = [
            {'type': 'response.output_item.done', 'sequence_number': 0,
             'output_index': 0, 'item': output},
            {'type': 'response.completed', 'sequence_number': 1, 'response': completed},
        ]
        payload = ''.join(f'event: {e["type"]}\ndata: {json.dumps(e)}\n\n' for e in events).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def read_lines(stream, events, stderr=False):
    for line in iter(lambda: stream.readline(2_000_001), ''):
        if len(line) > 2_000_000:
            events.put({'probe_error': 'oversize child line'})
            return
        if stderr:
            # Hash diagnostics rather than retaining potential header/prompt content.
            if 'error' in line.lower() or 'warn' in line.lower():
                report.setdefault('stderr_diagnostics', []).append(sha256(line.encode()).hexdigest())
            continue
        try:
            events.put(json.loads(line))
        except ValueError:
            events.put({'probe_error': 'non-JSON child stdout'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--clean-state', action='store_true')
    parser.add_argument('--transient-failure', action='store_true')
    args = parser.parse_args()
    report.update(clean_state=args.clean_state, transient_failure=args.transient_failure)
    assert ROOT.is_dir() and not (Path('/home/agentsdock/.codex')).exists()
    assert not Path('/mnt/c').exists() and not Path('/run').exists()
    STATE.mkdir()
    CWD.mkdir(parents=True)
    if not args.clean_state:
        (STATE / 'AGENTS.md').write_text(MARKERS[0])
    (CWD.parent / 'AGENTS.md').write_text(MARKERS[1])
    (STATE / 'hooks.json').write_text(json.dumps({'hooks': {'SessionStart': [{
        'hooks': [{'type': 'command', 'command': "printf canary > /case/hook-fired", 'timeout': 1}]
    }]}}))
    server = HTTPServer(('127.0.0.1', 0), Handler)
    server.timeout = 0.25
    stop = threading.Event()

    def serve():
        while not stop.is_set():
            server.handle_request()

    http_thread = threading.Thread(target=serve)
    model = 'lc-support-synthetic'
    config = '\n'.join([
        f'model={json.dumps(model)}', 'model_provider="lc_probe"',
        'cli_auth_credentials_store="file"', 'approval_policy="never"',
        'sandbox_mode="read-only"', 'web_search="disabled"',
        'project_doc_max_bytes=0', 'allow_login_shell=false',
        '[analytics]', 'enabled=false', '[shell_environment_policy]', 'inherit="none"',
        '[model_providers.lc_probe]', 'name="Synthetic loopback only"',
        f'base_url="http://127.0.0.1:{server.server_port}/v1"', 'wire_api="responses"',
        'requires_openai_auth=false', 'supports_websockets=false',
        'request_max_retries=0', 'stream_max_retries=0', 'stream_idle_timeout_ms=5000',
        '[mcp_servers.probe_canary]', 'enabled=false', 'command="/usr/bin/python3"',
        'args=["-c", "open(\'/case/mcp-fired\',\'w\').write(\'canary\')"]',
        '[features]', 'skip_host_skill_discovery=true',
        *[f'{feature}=false' for feature in DISABLED],
    ]) + '\n'
    (STATE / 'config.toml').write_text(config)
    report.update({'selected_model': model, 'provider': 'lc_probe',
                   'config': config, 'config_sha256': sha256(config.encode()).hexdigest(),
                   'cwd_initially_empty': not any(CWD.iterdir())})
    env = {'PATH': '/usr/bin:/bin', 'HOME': os.environ['HOME'], 'CODEX_HOME': str(STATE),
           'LANG': 'C.UTF-8', 'SHELL': '/bin/sh'}
    child = None
    readers = []
    events = queue.Queue()
    deadline = time.monotonic() + 35
    started = time.monotonic()
    try:
        http_thread.start()
        child = subprocess.Popen(['/opt/codex', 'app-server', '--listen', 'stdio://', '--strict-config'],
                                 cwd=CWD, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True, bufsize=1)
        report['child_pid'] = child.pid
        for stream, is_stderr in [(child.stdout, False), (child.stderr, True)]:
            reader = threading.Thread(target=read_lines, args=(stream, events, is_stderr))
            reader.start()
            readers.append(reader)

        def send(obj):
            child.stdin.write(json.dumps(obj) + '\n')
            child.stdin.flush()

        def receive(predicate):
            while time.monotonic() < deadline:
                if child.poll() is not None and events.empty():
                    raise RuntimeError('app-server exited before expected response')
                try:
                    event = events.get(timeout=0.2)
                except queue.Empty:
                    continue
                if 'probe_error' in event:
                    raise RuntimeError(event['probe_error'])
                if 'method' in event:
                    report['rpc_methods'].append(event['method'])
                    if event['method'] == 'error':
                        report.setdefault('error_notifications', []).append({
                            'willRetry': event['params'].get('willRetry'),
                            'cause': event['params'].get('error', {}).get('codexErrorInfo')})
                    if 'id' in event:
                        report['server_requests_rejected'].append(event['method'])
                        send({'id': event['id'], 'error': {'code': -32601, 'message': 'Probe rejects tools and approvals'}})
                        raise RuntimeError('unexpected server request rejected')
                if predicate(event):
                    if 'error' in event:
                        report['rpc_error_code'] = event['error'].get('code')
                        raise RuntimeError('RPC rejected synthetic probe')
                    return event
            raise TimeoutError('bounded probe deadline')

        send({'id': 1, 'method': 'initialize', 'params': {'clientInfo': {
            'name': 'lc_support_probe', 'version': '0.1'}, 'capabilities': {'experimentalApi': False}}})
        init = receive(lambda e: e.get('id') == 1)
        report['initialized'] = 'result' in init
        send({'method': 'initialized'})
        send({'id': 2, 'method': 'thread/start', 'params': {'model': model, 'cwd': str(CWD),
              'approvalPolicy': 'never', 'sandbox': 'read-only', 'ephemeral': True}})
        thread = receive(lambda e: e.get('id') == 2)['result']
        report['thread_effective'] = {k: thread.get(k) for k in [
            'model', 'modelProvider', 'approvalPolicy', 'sandbox', 'cwd', 'instructionSources']}
        send({'id': 3, 'method': 'turn/start', 'params': {'threadId': thread['thread']['id'],
              'input': [{'type': 'text', 'text': 'Synthetic local transport test. Return one harmless line; use no tools.'}]}})
        receive(lambda e: e.get('id') == 3)
        terminal = receive(lambda e: e.get('method') == 'turn/completed')['params']['turn']
        report['turn_status'] = terminal['status']
        report['turn_error_cause'] = (terminal.get('error') or {}).get('codexErrorInfo')
        report['turn_item_types'] = [item['type'] for item in terminal.get('items', [])]
    except Exception as exc:
        report['probe_error'] = str(exc)
    finally:
        if child:
            try:
                child.stdin.close()
            except (BrokenPipeError, OSError):
                report['stdin_close_error'] = True
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                report['owned_child_terminate'] = True
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    report['owned_child_kill'] = True
                    child.kill()
                    child.wait(timeout=3)
            report['child_exit_code'] = child.returncode
        for reader in readers:
            reader.join(timeout=2)
        stop.set()
        http_thread.join(timeout=2)
        server.server_close()
        report['owned_threads_closed'] = not http_thread.is_alive() and all(not r.is_alive() for r in readers)
        report['hook_marker_created'] = (ROOT / 'hook-fired').exists()
        report['mcp_marker_created'] = (ROOT / 'mcp-fired').exists()
        report['elapsed_ms'] = round((time.monotonic() - started) * 1000)
    report['observation_complete'] = (
        report.get('turn_status') == ('failed' if args.transient_failure else 'completed')
        and len(report['requests']) == 1 and report.get('child_exit_code') == 0
        and report['owned_threads_closed'] and not report['hook_marker_created']
        and not report['mcp_marker_created'] and not report.get('owned_child_terminate'))
    if args.clean_state:
        report['clean_instruction_sources'] = not report.get('thread_effective', {}).get('instructionSources')
        report['observation_complete'] &= report['clean_instruction_sources'] and all(
            not any(r['canaries_in_body'].values()) for r in report['requests'])
    print(json.dumps(report, indent=2))
    return 0 if report['observation_complete'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
