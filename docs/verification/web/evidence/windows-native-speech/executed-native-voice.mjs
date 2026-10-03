// Main-process-only candidate; never expose this factory or its options to a renderer.
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

export function createNativeVoice({ helperPath, sink, culture = 'en-US', timeoutMs = 35000, onDiagnostic = () => {}, spawnProcess = spawn }) {
  if (!isAbsolute(helperPath) || !['memory', 'device'].includes(sink) || !['en-US', 'zh-CN'].includes(culture)) throw new Error('Invalid trusted native speech configuration');
  let processState = null, current = null, sequence = 0, disposed = false;
  const diagnostic = value => { try { onDiagnostic(value); } catch {} };
  function validWave(wave) {
    if (wave == null) return true;
    if (typeof wave !== 'object' || Array.isArray(wave)) return false;
    return ['bytes', 'audio_bytes', 'format', 'channels', 'sample_rate_hz', 'bits_per_sample'].every(key => Number.isSafeInteger(wave[key]) && wave[key] >= 0)
      && Number.isFinite(wave.duration_ms) && wave.duration_ms >= 0
      && typeof wave.sha256 === 'string' && /^[0-9a-f]{64}$/.test(wave.sha256);
  }
  function settle(ok) {
    if (!current) return;
    const utterance = current; current = null;
    clearTimeout(utterance.timer); utterance.resolve(ok);
  }
  function write(state, value) {
    try { return state.child.stdin.write(JSON.stringify(value) + '\n'); }
    catch { fail(state, 'stdin_failure'); return false; }
  }
  function fail(state, reason) {
    if (state.closing) return;
    state.closing = true;
    if (processState === state) settle(false);
    diagnostic({ reason });
    try { state.child.kill(); } catch {} // only an observed close confirms reaping
  }
  function sendCurrent(state) {
    if (!current || current.sent || !state.ready || state.closing || processState !== state || disposed) return;
    current.sent = true;
    write(state, { op: 'say', id: current.id, text: current.text, rate: current.rate });
  }
  function start() {
    let child;
    try { child = spawnProcess(helperPath, [sink, culture], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { return null; }
    const state = { child, ready: false, closing: false, closed: false, buffer: '', stderrBytes: 0 };
    state.closedPromise = new Promise(resolve => { state.resolveClose = resolve; });
    processState = state;
    child.stdin.on('error', () => fail(state, 'stdin_failure'));
    child.on('error', () => fail(state, 'child_error'));
    child.on('close', (code, signal) => {
      state.closed = true; state.closing = true;
      if (processState === state) { settle(false); processState = null; }
      diagnostic({ event: 'child_closed', code, signal }); state.resolveClose();
    });
    child.stderr.on('data', chunk => { state.stderrBytes += chunk.length; if (state.stderrBytes > 4096) fail(state, 'stderr_limit'); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (state.closing || state.closed || processState !== state) return;
      state.buffer += chunk;
      if (state.buffer.length > 8192) return fail(state, 'stdout_limit');
      for (;;) {
        if (state.closing || state.closed || processState !== state) return;
        const end = state.buffer.indexOf('\n'); if (end < 0) break;
        const line = state.buffer.slice(0, end); state.buffer = state.buffer.slice(end + 1);
        let msg; try { msg = JSON.parse(line); } catch { return fail(state, 'malformed_reply'); }
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return fail(state, 'malformed_reply');
        if (msg.type === 'ready' && !state.ready && msg.sink === sink && msg.culture === culture && msg.max_text === 220) {
          state.ready = true; diagnostic({ event: 'ready', sink, culture }); sendCurrent(state);
        } else if (msg.type === 'done' && typeof msg.id === 'string' && typeof msg.ok === 'boolean' && typeof msg.reason === 'string' && msg.sink === sink && validWave(msg.wave)) {
          if (current?.sent && msg.id === current.id) {
            settle(msg.ok === true && msg.reason === 'completed' && msg.sink === sink);
            diagnostic({ event: 'utterance_done', sink: msg.sink, ok: msg.ok, reason: msg.reason, wave: msg.wave ?? null });
          }
        } else return fail(state, 'unexpected_reply');
      }
    });
    return state;
  }
  function stop() {
    if (!current) return;
    const sent = current.sent; settle(false);
    if (sent && processState && !processState.closing) write(processState, { op: 'stop' });
  }
  function say(text, rate) {
    if (disposed || typeof text !== 'string' || !text.trim() || text.length > 220 || !Number.isFinite(rate) || rate < 0.5 || rate > 2) return Promise.resolve(false);
    stop();
    const state = processState || start();
    if (!state || state.closing) return Promise.resolve(false);
    return new Promise(resolve => {
      current = { id: String(++sequence), text, rate, resolve, sent: false, timer: setTimeout(() => fail(state, 'timeout'), timeoutMs) };
      sendCurrent(state);
    });
  }
  async function dispose() {
    disposed = true; stop();
    const state = processState; if (!state) return;
    if (!state.closing) {
      write(state, { op: 'shutdown' });
      try { state.child.stdin.end(); } catch { fail(state, 'stdin_failure'); }
    }
    const wait = ms => new Promise(resolve => { const timer = setTimeout(() => resolve(false), ms); state.closedPromise.then(() => { clearTimeout(timer); resolve(true); }); });
    if (!(await wait(1000))) { fail(state, 'dispose_timeout'); if (!(await wait(1000))) throw new Error('Native speech child exit not observed'); }
  }
  return { say, stop, dispose };
}
