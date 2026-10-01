// A stand-in subscription connector as a real child process, for tests of the pipes. SYNTHETIC: no Codex, no ChatGPT,
// no sign-in and no network. It reads lc-subscription-live/1 requests on its input, one JSON line each, answers on its
// output, and ends at the end of its input. A "response" here is text this file wrote, never a model's.
import { createInterface } from 'node:readline';

const VERSION = 'lc-subscription-live/1';
const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);
/** The sessions started here and not stopped, by their id. */
const sessions = new Map();
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  const fail = (code, submission = 'not_submitted') => out({ id: m.id, error: { code, submission, message: 'a raw message that must never be shown' } });
  // One version for one child: a line of another version is refused, never read as this one.
  if (m.version !== VERSION) return fail('invalid_request');
  if (m.method === 'connection/read') {
    return out({ id: m.id, result: { auth: { state: 'signed_in', mode: 'chatgpt', plan: null }, quota: { available: false, ordinary_usage_allowed: null, windows: [] }, models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }] } });
  }
  if (m.method === 'companion/start') {
    const s = m.params;
    sessions.set(s.session_id, s);
    return out({ id: m.id, result: { session_id: s.session_id, epoch: s.epoch, remaining_submissions: s.policy.max_submissions, expires_in_ms: s.policy.max_session_ms } });
  }
  if (m.method === 'companion/turn') {
    const t = m.params;
    const s = sessions.get(t.session_id);
    if (!s || s.epoch !== t.epoch) return fail('session_stopped');
    const { png_base64, ...image } = t.image;
    return out({
      id: m.id,
      result: {
        request_id: t.request_id,
        text: `SYNTHETIC answer from the test connector: ${image.width}x${image.height} px, ${Buffer.from(png_base64, 'base64').length} bytes, ${t.trigger}, ${t.allowed_assistance}`,
        provenance: { ...t, image }, // the turn as it came, without its picture's bytes
        model: s.model,
        auth_mode: 'chatgpt',
        latency_ms: 1,
        thread_id: 'thread-synthetic',
        turn_id: 'turn-synthetic',
        kind: t.trigger === 'observation' ? 'observation' : 'generated_assistance',
      },
    });
  }
  // Every turn is answered at once here, so nothing is ever out to interrupt.
  if (m.method === 'companion/interrupt') return out({ id: m.id, result: { cancelled: false, uncertain: false } });
  if (m.method === 'companion/stop') {
    sessions.delete(m.params.session_id);
    return out({ id: m.id, result: { cancelled: false, uncertain: false } });
  }
  out({ id: m.id, result: {} });
});
process.stdin.on('end', () => process.exit(0));
