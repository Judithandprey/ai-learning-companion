// A stand-in subscription connector as a real child process, for tests of the pipes. SYNTHETIC: no Codex, no ChatGPT,
// no sign-in and no network. It reads lc-subscription-ask/1 requests on its input, one JSON line each, answers on its
// output, and ends at the end of its input.
import { createInterface } from 'node:readline';

const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'connection/read') {
    return out({ id: m.id, result: { auth: { state: 'signed_in', mode: 'chatgpt', plan: null }, rate_limits: null, models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }] } });
  }
  if (m.method === 'ask/start') {
    const r = m.params.request;
    return out({
      id: m.id,
      result: {
        request_id: r.request_id,
        text: `SYNTHETIC answer from the test connector: ${r.image.width}x${r.image.height} px, ${r.assistance}`,
        provenance: { request_id: r.request_id, question: r.question, assistance: r.assistance, image: { sha256: r.image.sha256, width: r.image.width, height: r.image.height }, context: r.context },
        model: m.params.model,
        auth_mode: 'chatgpt',
        latency_ms: 1,
        thread_id: 'thread-synthetic',
        turn_id: 'turn-synthetic',
      },
    });
  }
  out({ id: m.id, result: {} });
});
process.stdin.on('end', () => process.exit(0));
