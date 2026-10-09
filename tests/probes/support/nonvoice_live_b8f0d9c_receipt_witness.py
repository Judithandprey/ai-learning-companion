import subprocess
qa = 'b8f0d9c23a0091c76fd2def239f445d1b8d04854'
def source(path):
    return subprocess.check_output(['git', 'show', qa + ':' + path], text=True)
ledger = source('tests/e2e/windows/qa_live_ledger.mjs')
wrapper = source('tests/e2e/windows/qa_run_live_candidate.mjs')
judge = wrapper[wrapper.index('export function judgeMechanics('):wrapper.index('/** This run\'s own results')]
probe = r'''
const H = 'a'.repeat(64), PIN = 'b'.repeat(64);
const json = JSON.stringify;
function fixture() {
  const steps = [{as:'live_policy'}, {stroke:[]}, {as:'action3_submit'}, {as:'action4_submit'}];
  const results = {steps: steps.map((_,i)=>({i:i+1,ok:true})), values:{
    action1:json({used:1,unwritten:0}), action2:json({used:2,unwritten:0}), action3:json({used:3,unwritten:0}),
    action4_after:json({used:3,unwritten:0}), action4_stop:json({out_at_stop:1}),
    action3_card:json({answer:'prior answer'}), action4_card:json({answer_hidden:true,answer:''})}};
  const liveLines = [{kind:'started',used:0},{kind:'look',request_id:'look',image:{sha256:H}},
    {kind:'looked',request_id:'look',text:'description',used:1},{kind:'ended',reason:'stopped by you',used:3},
    {kind:'settled',request_id:'q3',submission:'not_submitted',used:3}];
  const requests = [1,2,3].map((n)=>({request_id:'q'+n,trigger:n===1?'focus':'text_followup',
    submitted_at:'2026-10-09T00:00:0'+n+'Z',question:'Explain the cards',assistance:'hint',asked_as:'silent',
    frame:{image:{sha256:H}},submission:n===3?'not_submitted':'submitted',
    outcome:{status:n===3?'cancelled':'answered'},shown:n!==3,presentation:n===3?undefined:'shown'}));
  const receipts = Object.fromEntries(['look','q1','q2','q3'].map((id,i)=>[id,{
    input_types:['text','image'],image_sha256:H,submission:i===3?'not_submitted':'acknowledged',
    produced_item_types:i===3?[]:['userMessage','reasoning','agentMessage'],codex_sha256:PIN,
    thread_start_count:Math.min(i+1,3),turn_start_count:Math.min(i+1,3)}]));
  return {steps,results,liveLines,asks:[{requests}],receipts,codexSha256:PIN};
}
function report(f) {
  const ledger=buildLedger(f), fence=fenceVerdict(ledger,f.liveLines,f.results.values);
  return {launcher:{status:0},steps_ok:true,owned_launch_cleanup_confirmed:true,
    connector_left_running:[],connector_watch:{state:'released'},ledger,fence,evidence:{leaks_in_questions:[]}};
}
function emit(name,r,extra={}) { console.log(json({case:name,passed:judgeMechanics(r).passed,fence:r.fence.verdict,...extra})); }
const base=report(fixture()); emit('control',base);
const missing=report(fixture()); missing.collect_errors=['receipts: invalid JSON']; emit('collection_error',missing,{errors:missing.collect_errors});
const f4=fixture(); f4.asks[0].requests[2].submission='submitted'; f4.liveLines.at(-1).submission='submitted'; f4.liveLines.at(-1).used=4;
f4.results.values.action4_after=json({used:4,unwritten:0}); f4.receipts.q3.submission='acknowledged'; f4.receipts.q3.produced_item_types=['commandExecution'];
const tools4=report(f4); emit('fourth_turn_tool',tools4,{non_plain_items:tools4.ledger.slots[3].transport.non_plain_items});
const fi=fixture(); fi.receipts.q1.codex_sha256='c'.repeat(64); const ident=report(fi); emit('wrong_connector_digest',ident,{matches:ident.ledger.slots[1].transport.codex_sha256_matches});
const fc=fixture(); fc.receipts.q2.turn_start_count=5; const counts=report(fc); emit('five_provider_turns',counts,{attempts:counts.ledger.attempts_used,receipt_turns:counts.ledger.slots[2].transport.turn_start_count});
const fp=fixture(); fp.asks[0].requests[2].submission='submitted'; const phase=report(fp); emit('contradictory_fence_phase',phase,{receipt_submission:phase.ledger.slots[3].transport.submission,settled_submission:fp.liveLines.at(-1).submission});
const u=transport({...fixture().receipts.q1,submission:'uncertain'},H,{codexSha256:PIN}); console.log(json({case:'uncertain_receipt',submission:u.submission,verdict:u.verdict}));
'''
subprocess.run(['/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node','--permission','--input-type=module','-'],input=ledger+'\n'+judge+'\n'+probe,text=True,check=True)
