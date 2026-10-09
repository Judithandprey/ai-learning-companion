// Candidate05 changed-boundary trace, lifecycle and Stop linkage probe. Only synthetic data and exported pure functions; no native or provider calls.
// Run under Node --permission with read access to this script and the exact QA source export only.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';
const root = process.argv[2] ?? '/tmp/support-live-df536b8-e51m6rig';
const load = name => import(pathToFileURL(`${root}/tests/e2e/windows/${name}`).href);
for (const [file, pin] of Object.entries({qa_live_ledger: '057f788b157bf84c6b8912cd5c46ea6a4e5ebe5ecc3a48ff16884ea8fbbacf90', qa_run_live_candidate: '58a0a9923f55631fcdd36426f567ed81469ded230146af04c933f412fc4e79f4'})) assert.equal(createHash('sha256').update(readFileSync(`${root}/tests/e2e/windows/${file}.mjs`)).digest('hex'), pin);
const { buildLedger, fenceVerdict, sourceAdmission, parseJsonl, evidence } = await load('qa_live_ledger.mjs');
const { judgeMechanics, interlockProduction, validateLiveAllocation, sanitizeReceipts, candidateDir } = await load('qa_run_live_candidate.mjs');
const { CONNECTOR } = await load('qa_live_candidate.mjs');
assert.equal(interlockProduction, '0ff325beadb7c689244610307b6aa16d638fd2e6'); // Source pin only, no execution authority.
const capture = '0123456789abcdef', otherCapture = 'fedcba9876543210';
const choice = { display_id: '3071609112', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 2 };
const mainFrom = lines => lines.filter(d => d.event === 'decision').map(d => ({ kind: 'decision', phase: d.phase, sample_seq: d.sample_seq ?? null, frame_seq: d.frame_seq ?? null, raw_sha256: d.raw_sha256 ?? null, raw_size: d.raw_size ?? null, request_id: d.request_id ?? null, image_sha256: d.image_sha256 ?? null, allowed: d.verdict === 'allow', denied: d.verdict !== 'allow', reason: d.reason ?? null, ms: 1 })).concat([{ kind: 'checker_end', spawned: true, exit_seen: true, code: 0, signal: null, killed: false }]);
const H = 'a'.repeat(64), A = 'a'.repeat(32), json = JSON.stringify;

function fixture() {
  const steps = [{ as: 'live_policy' }, { stroke: [] }, { as: 'action3_submit' }, { as: 'action4_submit' }];
  const results = { steps: steps.map((_, i) => ({ i: i + 1, ok: true })), values: {
    action1: json({ used: 1, unwritten: 0 }), action2: json({ used: 2, unwritten: 0 }), action3: json({ used: 3, unwritten: 0 }),
    action4_after: json({ used: 3, unwritten: 0 }), action4_stop: json({ out_at_stop: 1 }),
    action3_card: json({ answer: 'prior answer' }), action4_card: json({ answer_hidden: true, answer: '' }),
  } };
  const liveLines = [{ kind: 'started', session_id: 'live-1', used: 0 }, { kind: 'look', session_id: 'live-1', request_id: 'look', image: { sha256: H } },
    { kind: 'looked', session_id: 'live-1', request_id: 'look', text: 'description', used: 1 }, { kind: 'ended', session_id: 'live-1', reason: 'stopped by you', used: 3 },
    { kind: 'settled', session_id: 'live-1', request_id: 'q3', submission: 'not_submitted', used: 3 }];
  const requests = [1, 2, 3].map(n => ({ request_id: `q${n}`, trigger: n === 1 ? 'focus' : 'text_followup',
    live_session_id: 'live-1', submitted_at: `2026-10-09T00:00:0${n}Z`, question: 'Explain the cards', assistance: 'hint', asked_as: 'silent',
    frame: { image: { sha256: H } }, submission: n === 3 ? 'not_submitted' : 'submitted',
    outcome: { status: n === 3 ? 'cancelled' : 'answered' }, shown: n !== 3, presentation: n === 3 ? undefined : 'shown' }));
  const receipts = Object.fromEntries(['look', 'q1', 'q2', 'q3'].map((request_id, i) => [request_id, {
    request_id, input_types: ['text', 'image'], text_bytes: 17, text_sha256: H, image_bytes: 100, image_sha256: H,
    submission: i === 3 ? 'not_submitted' : 'acknowledged', terminal_status: i === 3 ? null : 'completed',
    outcome: i === 3 ? 'not_submitted' : 'completed', produced_item_types: i === 3 ? [] : ['userMessage', 'agentMessage'],
    thread_start_count: Math.min(i + 1, 3), turn_start_count: Math.min(i + 1, 3), actual_model: 'fixture-model',
    thread_id: null, turn_id: null, format: 'lc-subscription-ask-receipt/1', codex_executable: '/fixture/codex',
    codex_version: '0.158.0', codex_sha256: CONNECTOR.codex_sha256, explicit_bin_override: true, __launch: A,
  }]));
  const checker = [{ event: 'ready' }];
  const decision = fields => ({ event: 'decision', capture_id: '0123456789abcdef', id: checker.length.toString(16).padStart(32, '0'), seq: checker.length, verdict: 'allow', reason: null,
    admission: { accepted: true, at: '2026-10-09T00:00:00Z' }, ...fields });
  checker.push(decision({ phase: 'arm', display: { id: choice.display_id, bounds: choice.bounds, scale_factor: choice.scale_factor }, overlay: {pid: 7, hwnd: '10'} }));
  for (const [i, request_id] of ['look', 'q1', 'q2'].entries()) {
    const frame = { sample_seq: i + 1, frame_seq: i + 1, raw_sha256: H, raw_size: { width: 10, height: 10 } };
    checker.push(decision({ phase: 'pre_acquire', sample_seq: i + 1 }));
    checker.push(decision({ phase: 'post_acquire', ...frame }));
    checker.push(decision({ phase: 'send', ...frame, request_id, image_sha256: H }));
  }
  checker.push({event:'eof',requests:checker.length-1});
  return { steps, results, liveLines, asks: [{ requests }], receipts, codexSha256: CONNECTOR.codex_sha256, checker };
}
// Execute the exact non-exported collector body with memory I/O and a synthetic receipt source.
// Its production source is unchanged; neither the run wrapper nor any native/process function is called.
const wrapperSource = readFileSync(`${root}/tests/e2e/windows/qa_run_live_candidate.mjs`, 'utf8');
const begin = wrapperSource.indexOf('function collect('), end = wrapperSource.indexOf('\nif (process.argv', begin);
assert.ok(begin >= 0 && end > begin);
const collectSource = wrapperSource.slice(begin, end);
function report(f) {
  const work='/synthetic/work', out='/synthetic/out';
  const groups=f.mainByCapture ?? {[capture]:mainFrom(f.checker)};
  const files=new Map(), output=new Map();
  const put=(p,v)=>files.set(p,Buffer.from(typeof v==='string'?v:json(v)));
  const jsonl=lines=>lines.map(json).join('\n')+'\n';
  put(`${work}/out/results.json`,{...f.results,values:{...f.results.values,display_choice:json(choice)}});
  put(join(candidateDir,'steps.json'),f.steps);
  put(`${work}/out/admission-checker.jsonl`,jsonl(f.checker));
  put(`${work}/userdata/captures/${capture}/live.jsonl`,jsonl(f.liveLines));
  put(`${work}/userdata/captures/${capture}/asks/selection.json`,f.asks[0]);
  for(const [cap,lines] of Object.entries(groups)) put(`${work}/userdata/captures/${cap}/admission.jsonl`,jsonl(lines));
  const folders=[...new Set([capture,...Object.keys(groups)])];
  const directories=new Map([[`${work}/userdata/captures`,folders],[`${work}/userdata/captures/${capture}/asks`,['selection.json']]]);
  const io={existsSync:p=>files.has(p)||directories.has(p),readdirSync:p=>{assert.ok(directories.has(p),p);return directories.get(p);},mkdirSync:()=>{},writeFileSync:(p,v)=>output.set(p,v)};
  const read=p=>{assert.ok(files.has(p),`memory fixture missing ${p}`);return files.get(p);};
  const collect=vm.runInNewContext(`(${collectSource})`,{join,candidateDir,parseJsonl,buildLedger,fenceVerdict,sourceAdmission,evidence,sanitizeReceipts,CONNECTOR,
    readOwnReceipts:()=>({errors:[],receipts:f.receipts,launches:[A],raw:[]}),msg:e=>String(e.message),rawReceiptsRoot:'/synthetic/raw'});
  const r={launcher:{status:0},owned_launch_cleanup_confirmed:true,connector_left_running:[],connector_watch:{state:'released',descendants:1}};
  collect(io,read,{work},out,r,[]);
  assert.equal(r.collect_errors.length,0,json(r.collect_errors));
  assert.ok(output.has(`${out}/captures/${capture}/live.jsonl`));
  return r;
}
const rows=[];
function check(name,change,expected,kind) {
  const f=fixture();change(f);
  const r=report(f),j=judgeMechanics(r);
  assert.equal(j.passed,expected,name);
  rows.push({name,kind,mechanical_pass:j.passed,source_bound:r.source_admission.all_bound,
    main_agrees:r.source_admission.main_record_agrees,checker_released:r.source_admission.checker_released,
    other_capture_records:r.source_admission.main_record.other_captures,fence:r.fence.verdict,session_identity:r.fence.session_identity,
    failed_terms:Object.entries(j.mechanics).filter(([,v])=>!v).map(([k])=>k)});
}
const noChange=()=>{};
const editMain=(f,change)=>{f.mainByCapture={[capture]:mainFrom(f.checker)};change(f.mainByCapture[capture]);};
check('complete capture trace and observed clean checker exit',noChange,true,'control');
check('unknown provider submission retains a valid same-session fence',f=>{
 f.asks[0].requests[2].submission='unknown';f.liveLines.at(-1).submission='unknown';
 Object.assign(f.receipts.q3,{submission:'uncertain',outcome:'uncertain',turn_start_count:4});
 const previous=f.checker.findLast(d=>d.phase==='send');f.checker.pop();
 f.checker.push({...previous,id:'b'.repeat(32),seq:previous.seq+1,request_id:'q3'});
 f.checker.push({event:'eof',requests:f.checker.filter(d=>d.event==='decision').length});
},true,'control');
check('R3-A missing Stop ask session',f=>{delete f.asks[0].requests[2].live_session_id;},false,'correction');
check('F3-C foreign capture on acquisition',f=>{f.checker.find(d=>d.phase==='post_acquire').capture_id=otherCapture;},false,'correction');
check('F3-D contradictory main allow verdict',f=>editMain(f,m=>Object.assign(m.find(d=>d.phase==='send'),{denied:true,reason:'synthetic refusal'})),false,'correction');
check('complete-trace main sends only',f=>{f.mainByCapture={[capture]:mainFrom(f.checker).filter(d=>d.phase==='send')};},false,'correction');
check('collector retains foreign folder provenance',f=>{f.mainByCapture={[capture]:mainFrom(f.checker),[otherCapture]:[mainFrom(f.checker)[0]]};},false,'negative');
check('collector does not relabel sole wrong folder',f=>{f.mainByCapture={[otherCapture]:mainFrom(f.checker)};},false,'negative');
check('missing main acquisition',f=>editMain(f,m=>m.splice(2,1)),false,'negative');
check('duplicated main acquisition',f=>editMain(f,m=>m.splice(2,0,{...m[2]})),false,'negative');
check('reordered main phases',f=>editMain(f,m=>{[m[1],m[2]]=[m[2],m[1]];}),false,'negative');
for(const [name,patch] of [['exit not observed',{exit_seen:false}],['nonzero exit',{code:1}],['signalled exit',{signal:'SIGTERM'}],['killed checker',{killed:true}]])
 check(name,f=>editMain(f,m=>Object.assign(m.at(-1),patch)),false,'negative');
check('missing main checker end',f=>editMain(f,m=>m.pop()),false,'negative');
check('duplicated main checker end',f=>editMain(f,m=>m.push({...m.at(-1)})),false,'negative');
check('missing QA EOF',f=>f.checker.pop(),false,'negative');
check('wrong QA EOF request count',f=>{f.checker.at(-1).requests--;},false,'negative');
check('earlier QA EOF followed by decisions and another EOF',f=>f.checker.splice(2,0,{event:'eof',requests:1}),true,'counterexample');

// Only the pure allocation validator is used. An active-shaped IN-MEMORY control is not a lease.
const template=JSON.parse(readFileSync(`${root}/docs/verification/qa/p0-13-live-0ff325b/driver-nonvoice-05/allocation.template.json`));
const candidate=JSON.parse(readFileSync(`${root}/docs/verification/qa/p0-13-live-0ff325b/candidate-nonvoice-05/candidate.json`));
const now=Date.parse('2026-10-09T12:00:00Z'),until='2026-10-09T12:20:00Z';
const active={...structuredClone(template),connector:structuredClone(CONNECTOR),state:'active',lead_reviewed:true,valid_from_utc:'2026-10-09T11:59:00Z',valid_until_utc:until};
const gateRows=[];
function gate(name,record,product,expected) {
 let returned=null,error=null;
 try{returned=validateLiveAllocation(record,product,template.wrapper_sha256,now);}catch(e){error=e.message;}
 assert.equal(error===null,expected,name);
 if(expected)assert.equal(returned,Date.parse(until));
 gateRows.push({name,accepted_shape:!error,error,execution:false});
}
gate('synthetic active-shaped validator control',active,candidate,true);
gate('saved inactive template',template,candidate,false);
gate('mismatched candidate product',active,{...candidate,production_commit:'52be105a148a28e677f83cc4b7077665f2ff372c'},false);
gate('mismatched allocation source',{...active,launch_identity:{...active.launch_identity,source:'52be105a148a28e677f83cc4b7077665f2ff372c'}},candidate,false);
gate('expired synthetic allocation',{...active,valid_until_utc:'2026-10-09T11:59:59Z'},candidate,false);
console.log(json({source:'df536b84eada2782b30ccca9c6781d12ea48e050',scope:'Exact pure functions and unchanged collector body with synthetic in-memory files/receipts. No runLiveCandidate, native operation, child process or real private/process read. Active-shaped validator control is memory only, not an allocation.',
 trace_rows:rows.length,controls:rows.filter(r=>r.kind==='control').length,corrections:rows.filter(r=>r.kind==='correction').length,
 negatives:rows.filter(r=>r.kind==='negative').length,counterexamples:rows.filter(r=>r.kind==='counterexample').length,
 gate_rows:gateRows.length,collector_source_sha256:createHash('sha256').update(collectSource).digest('hex'),observations:rows,gates:gateRows}));
