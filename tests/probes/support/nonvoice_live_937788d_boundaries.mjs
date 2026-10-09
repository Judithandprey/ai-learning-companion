// Exact-source, offline boundary review. All watcher/receipt I/O below is in memory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
assert.ok(root, 'pass the immutable QA export');
const base = join(root, 'tests/e2e/windows');
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(readFileSync(join(base, 'qa_run_live_candidate.mjs'))), '3a537fa1df6b1b74311e3146ba7f3ec021d7b64291313d6b2d3504564a68487b');
assert.equal(hash(readFileSync(join(base, 'qa_live_candidate.mjs'))), '9e74d6ff7b5dc64bc2a6bb210e489ae320d1ec43a252f462f586908ef11eee8f');
const w = await import(pathToFileURL(join(base, 'qa_run_live_candidate.mjs')));
const { CONNECTOR } = await import(pathToFileURL(join(base, 'qa_live_candidate.mjs')));
const observations = [];
const record = (name, kind, facts) => observations.push({ name, kind, ...facts });

// The public/default allocation path stays refused; never call runLiveCandidate or override its gate.
assert.equal(w.interlockProduction, null);
assert.throws(() => w.validateLiveAllocation({}, { production_commit: CONNECTOR.commit }, '', Date.now()), /does not pin a reviewed production/);
record('interim execution gate', 'control', { refused: true });

const model = 'review-model';
const startRecord = { event:'watch_start', root_exists:true, already_there:[], at:'2026-10-09T00:00:00Z' };
for (const alreadyExited of [false,true]) {
  const fakeChild = {pid:7, on(event,callback){ if(alreadyExited && event==='exit') callback(1); }};
  const io = {readFileSync:()=>JSON.stringify(startRecord)+'\n',existsSync:()=>false,writeFileSync:()=>{}};
  const watch = await w.startWatch(io,()=>fakeChild,async()=>{},'/synthetic/output');
  assert.equal(watch.ready.ready,!alreadyExited);
  record(alreadyExited ? 'exited watcher refused' : 'live watcher readiness',alreadyExited?'fixed':'control',{ready:watch.ready.ready});
}
// No process is read: assertWatchRunning receives only in-memory stat text or a synthetic read error.
for (const [name,state,stat,rejected] of [
  ['live own watcher',{pid:7,exited:false,error:null},'7 (python3) S 1 0',false],
  ['exit delivered before prelaunch',{pid:7,exited:true,error:null},'7 (python3) S 1 0',true],
  ['zombie before exit callback',{pid:7,exited:false,error:null},'7 (python3) Z 1 0',true],
  ['missing own proc entry',{pid:7,exited:false,error:null},null,true],
]) {
  let refused=false;
  try {await w.assertWatchRunning({state},{readFileSync(path){assert.equal(path,'/proc/7/stat');if(stat===null)throw Error('synthetic missing');return stat;}});}
  catch(e){assert.match(e.message,/watch is no longer running/);refused=true;}
  assert.equal(refused,rejected,name);record(name,rejected?'fixed':'control',{refused});
}
const appear={event:'appear',pid:7,start_ticks:70,role:'in_root',name:'python3'}, gone={event:'exit',pid:7,start_ticks:70,role:'in_root'}, end={event:'watch_end',remaining:[]};
for (const [name,events,state] of [
 ['ordered lifecycle',[startRecord,appear,gone,end],'released'],
 ['exit before appearance',[startRecord,gone,appear,end],'unknown'],
 ['watch lost before end',[startRecord,appear,gone],'unknown'],
 ['record after end',[startRecord,appear,gone,end,appear],'unknown']
]) {
 const s=w.watchSummary({readFileSync:()=>events.map(e=>JSON.stringify(e)).join('\n')},'synthetic',true);
 assert.equal(s.state,state);record(name,state==='released'?'control':'fixed',{state:s.state,disorder:s.disorder??null});
}

const receiptRoot = '/synthetic/receipts', launch = 'a'.repeat(32), rid = 'synthetic-request';
const receipt = {
  request_id: rid, input_types: ['text', 'image'], text_bytes: 10, text_sha256: 'b'.repeat(64), image_bytes: 20, image_sha256: 'c'.repeat(64),
  submission: 'acknowledged', terminal_status: 'completed', outcome: 'completed', produced_item_types: ['userMessage', 'agentMessage'],
  thread_start_count: 1, turn_start_count: 1, actual_model: model, thread_id: 'SYNTHETIC_THREAD', turn_id: 'SYNTHETIC_TURN',
  format: 'lc-subscription-ask-receipt/1', codex_executable: '/synthetic/codex', codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true,
};
function readReceipt(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const io = { existsSync: () => true, lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: p => p,
    readdirSync: () => [launch], openSync: () => 9, fstatSync: () => ({ isFile: () => true, nlink: 1, size: bytes.length }),
    readFileSync: () => bytes, closeSync: () => {} };
  return w.readOwnReceipts(io, [], [rid], receiptRoot);
}
const good = readReceipt(receipt);
assert.equal(good.errors.length, 0);
assert.equal(good.raw.length, 1);
const sanitized = w.sanitizeReceipts(good.receipts)[rid];
assert.equal('thread_id' in sanitized || 'turn_id' in sanitized || 'codex_executable' in sanitized, false);
record('well-formed receipt projection', 'control', { admitted: true, top_level_private_fields_omitted: true });
const wrongId = readReceipt({ ...receipt, request_id: 'another-request' });
assert.equal(wrongId.raw.length, 0);
assert.equal(wrongId.errors.length, 1);
record('wrong request identity', 'control', { admitted: false });
const malformed = readReceipt({ ...receipt, actual_model: { thread_id: 'SYNTHETIC_NESTED_THREAD', turn_id: 'SYNTHETIC_NESTED_TURN' } });
assert.equal(malformed.errors.length, 1);
assert.equal(malformed.raw.length, 0);
assert.deepEqual(malformed.receipts, {});
const projected = w.sanitizeReceipts({[rid]:{...receipt,actual_model:{thread_id:'SYNTHETIC_NESTED_THREAD'}}})[rid];
assert.equal('actual_model' in projected,false);
record('malformed nested field rejected before copy and omitted from projection','fixed',{reader_errors:malformed.errors.length,copied_receipts:malformed.raw.length,nested_value_omitted:true});

console.log(JSON.stringify({ source: '937788ded4e2bff1db8b94dce175a7152e01609d',
  scope: 'Synthetic objects only, no native/private-state/provider operation; wrapper execution gate never bypassed.',
  assertions: observations.length, controls: observations.filter(x => x.kind === 'control').length,
  fixed: observations.filter(x => x.kind === 'fixed').length, observations }, null, 2));
