// Actual candidate + synthetic response doubles + controlled real local filesystem interleavings.
// No sockets, native apps, providers, or source modifications. Linux evidence, not a Windows race claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import test, { after } from 'node:test';
const root = process.env.LC_UPLOAD_REVIEW_ROOT;
if (!root) throw Error('Set LC_UPLOAD_REVIEW_ROOT to exact exported source directory');
const { frameRequest } = await import(pathToFileURL(path.join(root, 'apps/windows/src/shared/frame-ingress.ts')));
const { uploadRetained } = await import(pathToFileURL(path.join(root, 'apps/windows/src/main/uploader.ts')));
const evidence = path.join(root, 'docs/verification/web/evidence');
const meta = JSON.parse(fs.readFileSync(path.join(evidence, 'windows-frame-ingress/harness-ink.json'), 'utf8'));
const capture = path.dirname(path.join(evidence, meta.manifest));
const manifest = fs.readFileSync(path.join(evidence, meta.manifest), 'utf8').replace(/\r\n/g, '\n');
const dataRoot = fs.mkdtempSync('/tmp/windows-uploader-c09-files-data-');
const native = Object.fromEntries(['lstatSync', 'realpathSync', 'openSync', 'fstatSync', 'readFileSync'].map(k => [k, fs[k]]));
const baseFetch = globalThis.fetch;
const checks = [];
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function make(name) {
  const dir = path.join(dataRoot, name); fs.cpSync(capture, dir, { recursive: true });
  const plan = structuredClone(meta.plan);
  const authority = { origin: 'http://127.0.0.1:41234', token: 'synthetic-reviewed-ephemeral-bearer-0123456789', expires_at: '2099-01-01T00:00:00Z',
    owner: structuredClone(plan.source), incarnation: { device_id: plan.device_id, session_id: plan.session_id, stream_id: plan.stream_id } };
  const job = { capture_dir: dir, plan, prepared: frameRequest(manifest, plan) };
  return { job, authority, target: path.join(dir, 'frames', plan.entries[0].raw.artifact.sha256 + '.png') };
}
function responses(seen, callback = () => {}) {
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    seen.push({ method: options.method, url: String(url), headers: structuredClone(options.headers), text: options.body, body });
    if (options.method === 'PUT') {
      const bytes = Buffer.from(body.data_base64, 'base64');
      assert.equal(digest(bytes), body.artifact.sha256); assert.equal(bytes.length, body.artifact.byte_length);
      callback(seen.length, body);
      const { data_base64, ...receipt } = body;
      return new Response(JSON.stringify({ ...receipt, status: 'bytes_committed' }), { status: 200 });
    }
    const b = body.batch;
    return new Response(JSON.stringify({ contract_version: '0.2.0', batch_id: b.batch_id, user_id: b.records[0].source.user_id,
      device_id: b.device_id, session_id: b.session_id, stream_id: b.stream_id,
      acknowledged: b.records.map(r => ({ record_id: r.record_id, sequence: r.sequence, disposition: 'accepted', received_at: '2026-09-30T17:00:00Z', envelope: 'committed', artifacts: r.artifacts.map(a => ({ ...a, status: 'verified' })) })) }), { status: 200 });
  };
}
function run(name, fn) {
  test(name, async () => {
    try { checks.push({ name, assertions_passed: true, ...await fn() }); }
    catch (e) { checks.push({ name, assertions_passed: false, error: String(e) }); throw e; }
    finally { Object.assign(fs, native); syncBuiltinESMExports(); globalThis.fetch = baseFetch; }
  });
}
function fingerprint(dir) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, entry); if (fs.lstatSync(file).isFile()) result[entry] = digest(fs.readFileSync(file));
  }
  return result;
}
run('valid exact originals and body remain unchanged', async () => {
  const { job, authority } = make('valid'); const before = fingerprint(job.capture_dir); const seen = []; responses(seen);
  const result = await uploadRetained(authority, job);
  assert.equal(result.status, 'committed'); assert.equal(seen.length, 8); assert.equal(seen.at(-1).text, job.prepared.body);
  assert.deepEqual(result.originals, seen.filter(x => x.method === 'PUT').map(x => x.body.artifact.artifact_id));
  assert.deepEqual(fingerprint(job.capture_dir), before);
  return { status_with_response_double: result.status, puts: 7, exact_body_and_originals: true, local_files_unchanged: true };
});
for (const kind of ['leaf', 'parent']) run(`static outside ${kind} symlink refuses before request`, async () => {
  const { job, authority, target } = make('static-' + kind); const seen = []; responses(seen);
  const outside = job.capture_dir + '.outside';
  if (kind === 'leaf') { fs.renameSync(target, outside); fs.symlinkSync(outside, target); }
  else { fs.renameSync(path.join(job.capture_dir, 'frames'), outside); fs.symlinkSync(outside, path.join(job.capture_dir, 'frames'), 'dir'); }
  const result = await uploadRetained(authority, job); assert.equal(result.status, 'refused'); assert.equal(seen.length, 0);
  return { status: result.status, requests: 0 };
});
for (const kind of ['leaf', 'leaf-follow', 'parent']) run(`after-check ${kind} replacement refuses without reading outside bytes`, async () => {
  const { job, authority, target } = make('race-' + kind); const seen = []; responses(seen);
  const outside = job.capture_dir + '.outside', saved = job.capture_dir + '.saved', frames = path.join(job.capture_dir, 'frames');
  if (kind === 'parent') fs.cpSync(frames, outside, { recursive: true }); else fs.copyFileSync(target, outside);
  let resolved = 0, swapped = false, outsideRead = false;
  fs.realpathSync = function(p, ...args) {
    const real = native.realpathSync(p, ...args);
    if (String(p) === target && ++resolved === 2) {
      if (kind === 'parent') { fs.renameSync(frames, saved); fs.symlinkSync(outside, frames, 'dir'); }
      else { fs.renameSync(target, saved); fs.symlinkSync(outside, target); }
      swapped = true;
    }
    return real;
  };
  if (kind === 'leaf-follow') fs.openSync = (p, flags, ...args) => native.openSync(p, flags & ~(fs.constants.O_NOFOLLOW ?? 0), ...args);
  fs.readFileSync = function(p, ...args) {
    if (typeof p === 'number' && fs.readlinkSync(`/proc/self/fd/${p}`).startsWith(outside)) outsideRead = true;
    return native.readFileSync(p, ...args);
  };
  syncBuiltinESMExports(); const result = await uploadRetained(authority, job);
  assert.equal(swapped, true); assert.equal(result.status, 'refused'); assert.equal(seen.length, 0); assert.equal(outsideRead, false);
  return { status: result.status, requests: 0, swapped, outside_content_read: outsideRead, nofollow_deliberately_removed: kind === 'leaf-follow' };
});
run('post-open name replacement reads original fd bytes', async () => {
  const { job, authority, target } = make('post-open'); const seen = []; responses(seen); let count = 0, replaced = false;
  fs.openSync = function(p, ...args) {
    const fd = native.openSync(p, ...args);
    if (String(p) === target && ++count === 2) {
      const different = native.readFileSync(target); different[20] ^= 1;
      fs.writeFileSync(target + '.new', different); fs.renameSync(target + '.new', target); replaced = true;
    }
    return fd;
  };
  syncBuiltinESMExports(); const result = await uploadRetained(authority, job);
  assert.equal(replaced, true); assert.equal(result.status, 'committed'); assert.equal(seen.length, 8);
  return { status_with_response_double: result.status, replaced, puts: 7, all_sent_hashes_exact: true };
});
run('caller mutation during first response cannot change source IDs body directory or authority', async () => {
  const { job, authority } = make('input-snapshot'); const baseline = structuredClone({ job, authority }); const seen = [];
  const planned = [...new Set(job.prepared.request.batch.records.flatMap(r => r.artifacts.map(a => a.artifact_id)))];
  responses(seen, n => {
    if (n !== 1) return;
    for (const entry of job.plan.entries) if (entry.kind === 'frame') for (const binding of [entry.raw, entry.composed, entry.ink]) if (binding) {
      binding.artifact.artifact_id = 'never-planned'; binding.artifact.sha256 = '0'.repeat(64); binding.source.user_id = 'changed';
    }
    job.capture_dir = '/nonexistent'; job.prepared.body = '{}'; job.prepared.idempotency_key = 'changed'; job.prepared.request.batch.records.length = 0;
    authority.origin = 'http://127.0.0.1:9'; authority.token = 'changed'.repeat(8); authority.owner.user_id = 'changed'; authority.incarnation.stream_id = 'changed';
  });
  const result = await uploadRetained(authority, job); const puts = seen.filter(x => x.method === 'PUT');
  assert.equal(result.status, 'committed'); assert.deepEqual([...result.originals].sort(), planned.sort());
  assert.deepEqual(result.originals, puts.map(x => x.body.artifact.artifact_id)); assert.equal(seen.at(-1).text, baseline.job.prepared.body);
  assert.equal(seen.at(-1).headers['Idempotency-Key'], baseline.job.prepared.idempotency_key);
  assert(seen.every(x => x.url.startsWith(baseline.authority.origin + '/') && x.headers.Authorization === 'Bearer ' + baseline.authority.token));
  assert(puts.every(x => JSON.stringify(x.body.source) === JSON.stringify(baseline.authority.owner)));
  return { status_with_response_double: result.status, puts: puts.length, snapshotted_ids_body_key_owner_origin_token_and_directory: true };
});
run('later changed bytes refuse at send-time after one exact original', async () => {
  const { job, authority } = make('changed-later'); const a = job.plan.entries[0].ink.artifact; const seen = [];
  responses(seen, n => { if (n === 1) { const file = path.join(job.capture_dir, 'ink', a.sha256 + '.json'); const b = fs.readFileSync(file); b[5] ^= 1; fs.writeFileSync(file, b); } });
  const result = await uploadRetained(authority, job); assert.equal(result.status, 'refused'); assert.equal(result.stage, 'original'); assert.equal(seen.length, 1);
  assert.deepEqual(result.originals, [seen[0].body.artifact.artifact_id]);
  return { status: result.status, requests: 1, no_changed_bytes_sent: true, prior_original_retained: true };
});
for (const identical of [true, false]) run(`documented multi-lookup folder flip reads outside ${identical ? 'identical' : 'different'} bytes`, async () => {
  const { job, authority, target } = make('limit-' + identical); const seen = []; responses(seen);
  const frames = path.join(job.capture_dir, 'frames'), outside = job.capture_dir + '.outside', saved = job.capture_dir + '.saved';
  fs.cpSync(frames, outside, { recursive: true });
  if (!identical) { const file = path.join(outside, path.basename(target)); const b = fs.readFileSync(file); b[20] ^= 1; fs.writeFileSync(file, b); }
  let count = 0, flipped = false, armed = false, outsideRead = false, outsideIdentity = null, openedIdentity = null;
  function flip() { fs.renameSync(frames, saved); fs.symlinkSync(outside, frames, 'dir'); flipped = true; }
  function restore() { fs.unlinkSync(frames); fs.renameSync(saved, frames); flipped = false; }
  fs.lstatSync = function(p, ...args) {
    if (String(p) !== target || ++count !== 2) return native.lstatSync(p, ...args);
    flip(); const st = native.lstatSync(p, ...args); outsideIdentity = [String(st.dev), String(st.ino)]; restore(); armed = true; return st;
  };
  fs.realpathSync = function(p, ...args) {
    const real = native.realpathSync(p, ...args);
    if (String(p) === target && armed) { assert(real.startsWith(job.capture_dir + path.sep)); flip(); }
    return real;
  };
  fs.readFileSync = function(p, ...args) {
    const actual = typeof p === 'number' ? fs.readlinkSync(`/proc/self/fd/${p}`) : '';
    if (armed && actual.startsWith(outside + path.sep)) {
      outsideRead = true; const st = native.fstatSync(p, { bigint: true }); openedIdentity = [String(st.dev), String(st.ino)];
      const bytes = native.readFileSync(p, ...args); restore(); armed = false; return bytes;
    }
    return native.readFileSync(p, ...args);
  };
  syncBuiltinESMExports(); const result = await uploadRetained(authority, job);
  assert.equal(outsideRead, true); assert.deepEqual(openedIdentity, outsideIdentity); assert.equal(flipped, false);
  assert.equal(result.status, identical ? 'committed' : 'refused'); assert.equal(seen.length, identical ? 8 : 0);
  return { status_with_response_double: result.status, requests: seen.length, actual_outside_content_read: outsideRead,
    checked_and_opened_outside_identity_equal: true, exactly_expected_sha256: identical,
    classification: 'Known non-atomic folder lookup limitation; requires ability to rewrite trusted capture directory at multiple lookup boundaries; not arbitrary-content exfiltration' };
});
after(() => {
  fs.writeFileSync('/tmp/windows-uploader-c09-files-probes.json', JSON.stringify({ candidate: 'c09c1518024555afcc3f646195f2c1d0b617ed9d',
    platform: process.platform, node: process.version, mode: 'Actual source; synthetic fetch receipts/ACK; controlled actual local filesystem swaps; no socket/backend/native Windows',
    probe_data: dataRoot, passed: checks.filter(x => x.assertions_passed).length, failed: checks.filter(x => !x.assertions_passed).length, checks }, null, 2) + '\n');
});
