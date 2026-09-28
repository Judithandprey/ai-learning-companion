// Minimal DOM/event doubles exercise the pinned round-2 exported page handler.
// They are not browser, pointer-routing or visual evidence.
import assert from 'node:assert/strict';
import { installProbe, CHANNEL } from './apps/safari-extension/src/page.ts';
import { ProbeSession } from './apps/safari-extension/src/session.ts';
import { unavailableTransport } from './apps/safari-extension/src/bridge.ts';
import { FIXTURE_EXPLANATIONS, SYNTHETIC_IDENTITY, resolveFixtureSource } from './apps/safari-extension/src/fixture-data.ts';
import { counterIds, snapshot } from './apps/safari-extension/tests/helpers.ts';

const rect = {x:100,y:200,left:100,top:200,right:400,bottom:240,width:300,height:40};
class Target {
  listeners = new Map();
  addEventListener(k, fn) {const fs=this.listeners.get(k) ?? []; fs.push(fn); this.listeners.set(k,fs);}
  removeEventListener(k,fn) {this.listeners.set(k,(this.listeners.get(k) ?? []).filter(f=>f!==fn));}
  fire(type, values={}) {for(const f of this.listeners.get(type) ?? []) f({type,isTrusted:false,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){},composedPath(){return [];},...values});}
}
class ElementDouble extends Target {
  constructor(tag='div') {super(); this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.hidden=false;this.textContent='';this.isConnected=true;}
  setAttribute() {}
  append(...nodes){this.children.push(...nodes);}
  attachShadow(){return new ElementDouble('shadow');}
  getContext(){return null;}
  getBoundingClientRect(){return this.tagName==='LC-WEB-PROBE' ? {...rect,left:0,top:0,x:0,y:0} : rect;}
  getClientRects(){return [rect];}
  contains(node){return this===node || this.children.some(n=>n===node || n.contains?.(node));}
  closest(selector){return selector.startsWith('script,') ? null : this;}
  querySelectorAll(){return this.children.flatMap(n=>[n,...(n.querySelectorAll?.('*') ?? [])]);}
  remove(){}
}
globalThis.HTMLElement=ElementDouble;
globalThis.Node={TEXT_NODE:3,ELEMENT_NODE:1};
globalThis.NodeFilter={SHOW_TEXT:4};
globalThis.HTMLMediaElement={HAVE_NOTHING:0};
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function setup(transport=unavailableTransport) {
  const doc=new Target(), win=new Target(), nodes=[];
  doc.documentElement=new ElementDouble('html');doc.documentElement.clientWidth=1000;doc.documentElement.clientHeight=800;
  const block=new ElementDouble('p');block.innerText='A change of basis changes coordinates.';
  const node={nodeType:3,textContent:'change of basis',parentElement:block,isConnected:true};
  doc.body=block;
  doc.createElement=tag=>{const e=new ElementDouble(tag);nodes.push(e);return e;};
  const range=()=>({commonAncestorContainer:node,startContainer:node,endContainer:node,startOffset:0,endOffset:node.textContent.length,
    getClientRects:()=>[rect],getBoundingClientRect:()=>rect,cloneRange:range,setStart(){},setEnd(){}});
  doc.createRange=range;
  doc.createTreeWalker=()=>{let used=false;return {nextNode(){if(used)return null;used=true;return node;}};};
  doc.elementFromPoint=()=>block;
  const video={getBoundingClientRect:()=>rect,querySelectorAll:()=>[],textTracks:[],readyState:2,currentSrc:'synthetic.webm',srcObject:null,error:null,currentTime:10,paused:false};
  doc.querySelectorAll=tag=>tag==='video'?[video]:[];
  const child={postMessage(){}};
  Object.assign(win,{document:doc,parent:null,frames:[child],devicePixelRatio:1,innerWidth:1000,innerHeight:800,scrollX:0,scrollY:0,
    location:{href:'http://localhost:4173/fixture/index.html'},CSSStyleSheet:class {replaceSync(){}},
    getSelection:()=>({isCollapsed:false,rangeCount:1,getRangeAt:range})});
  win.parent=win;
  let version='1';
  const session=new ProbeSession({identity:SYNTHETIC_IDENTITY,ids:counterIds(),clock:()=>new Date().toISOString(),transport,
    fixtures:FIXTURE_EXPLANATIONS,resolveSource:resolveFixtureSource,projectId:null,knowledgeProfileVersion:1});
  const events=[];
  const ui=installProbe({win,session,documentVersion:()=>version,role:'top',peerOrigins:['http://localhost:4173'],acceptSyntheticEvents:true,onEvent:e=>events.push(e)});
  const pointer=(type,extra={})=>win.fire(type,{pointerId:1,pointerType:'mouse',isPrimary:true,clientX:120,clientY:220,...extra});
  return {win,session,ui,child,events,nodes,node,video,pointer,setVersion:v=>version=v};
}
const results={};
for(const mode of ['NAV','WRITE','cancelled']) {
  const p=setup();
  if(mode==='cancelled'){p.session.press('ASK');p.session.cancelAsk();}else p.session.press(mode);
  p.win.fire('message',{source:p.child,origin:'http://localhost:4173',data:{channel:CHANNEL,type:'card',provenance:'fixture',source_id:'web-probe-fixture',source_version:1,selected_text:'change of basis'}});
  assert.equal(p.ui.cardSnapshot().hidden,true);
  assert.equal(p.session.explanationRequestCount,0);
  results[`relay_${mode}`]={mode:p.session.state.mode,requests:0,cardHidden:p.ui.cardSnapshot().hidden};
}
{
  const p=setup();p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointercancel');await tick();
  assert.equal(p.session.explanationRequestCount,0);
  results.mouse_cancel={requests:p.session.explanationRequestCount,mode:p.session.state.mode,cardHidden:p.ui.cardSnapshot().hidden};
}
{
  const p=setup();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'pen',clientX:245,clientY:190});
  p.pointer('pointermove',{pointerType:'pen',clientX:250,clientY:250});
  p.pointer('pointerup',{pointerType:'pen',clientX:250,clientY:250});
  assert(p.events.some(e=>e.type==='adjust'));
  p.video.currentTime=25;p.node.textContent='new board';p.setVersion('2');
  // Confirm the original adjustment after playback and source content changed.
  p.nodes.find(n=>n.className==='confirm').fire('click');await tick();
  const out=p.events.find(e=>e.type==='ask'&&e.outcome==='submitted').detail;
  assert.equal(out.selection.source_version,1);
  assert.equal(out.selection.media_position,10);
  assert.equal(out.selection.selected_text,'change of basis');
  results.adjust_mix={text:out.selection.selected_text,version:out.selection.source_version,media:out.selection.media_position,currentMedia:p.video.currentTime};
}
{
  const p=setup();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'touch'});
  p.pointer('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false});
  p.pointer('pointerup',{pointerType:'touch'});await tick();
  assert.equal(p.session.explanationRequestCount,0);
  results.multi_touch_control={requests:0,mode:p.session.state.mode};
  p.session.cancelAsk();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'pen'});p.pointer('pointercancel',{pointerType:'pen'});await tick();
  assert.equal(p.session.explanationRequestCount,0);
  results.pen_cancel_control={requests:0,mode:p.session.state.mode};
}
{
  const waiting=[];
  const p=setup({kind:'native',send:request=>new Promise(resolve=>waiting.push({request,resolve}))});
  p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointerup');await tick();
  assert.equal(waiting.length,1);
  p.node.textContent='eigenvector';
  p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointerup');await tick();
  const ack=i=>waiting[i].resolve({contract_version:'0.1.0',request_id:waiting[i].request.request_id,status:'accepted',error_code:null});
  ack(1);await tick();const current=p.ui.cardSnapshot().quote;
  ack(0);await tick();const late=p.ui.cardSnapshot().quote;
  assert(current.includes('eigenvector'));assert(late.includes('eigenvector'));
  assert.equal(p.events.filter(e=>e.type==='ask').at(-1).presented,false);
  results.late_card={current,late};
}
{
  // No DOM double: original snapshot function + a delayed SHA digest expose clock ordering.
  const {freezeDomSnapshot}=await import('./apps/safari-extension/src/frame.ts');
  let release;let now='2026-09-28T08:00:00Z';
  const original=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.digest=(...args)=>new Promise(resolve=>{release=()=>resolve(original(...args));});
  const snap={...snapshot(),captured_at:now};
  const pending=freezeDomSnapshot(snap,SYNTHETIC_IDENTITY,{source_id:'source',source_version:1,source_timezone:'UTC'},counterIds(),()=>now);
  now='2026-09-28T08:00:10Z';release();const out=await pending;
  globalThis.crypto.subtle.digest=original;
  results.capture_clock={snapshotAt:snap.captured_at,afterHashClock:now,capturedAt:out.frame.captured_at};
  assert.equal(out.frame.captured_at,snap.captured_at);
}


const message=(p,source,type,epoch,extra={})=>p.win.fire('message',{
 source,origin:'http://localhost:4173',data:{channel:CHANNEL,type,askEpoch:epoch,...extra}});
const relay={provenance:'fixture',source_id:'web-probe-fixture',source_version:1,selected_text:'change of basis'};
{
 const p=setup();p.session.press('ASK');const epoch=p.session.state.askEpoch;
 const other={postMessage(){}};p.win.frames.push(other);
 message(p,p.child,'ask_done',epoch);
 message(p,other,'card',epoch,relay);assert(p.ui.cardSnapshot().hidden);
 message(p,p.child,'card',epoch-1,relay);assert(p.ui.cardSnapshot().hidden);
 message(p,p.child,'card',epoch,relay);assert(!p.ui.cardSnapshot().hidden);
 message(p,p.child,'card',epoch,{...relay,selected_text:'eigenvector'});
 assert(p.ui.cardSnapshot().quote.includes('change of basis'));
 assert.equal(p.events.filter(e=>e.type==='card_relayed').length,1);
 results.one_use_frame={accepted:1,rejected:p.events.filter(e=>e.type==='message_rejected').map(e=>e.reason)};
}
for(const action of ['new_ask','dismiss','frame_cancel']) {
 const p=setup();p.session.press('ASK');const epoch=p.session.state.askEpoch;
 if(action==='frame_cancel')message(p,p.child,'ask_cancelled',epoch);
 else {
  message(p,p.child,'ask_done',epoch);
  if(action==='new_ask')p.session.press('ASK');
  else p.nodes.find(n=>n.className==='close').fire('click');
 }
 message(p,p.child,'card',epoch,relay);
 assert(p.ui.cardSnapshot().hidden);
 results['retired_frame_'+action]={cardHidden:true};
}
{
 const waiting=[];
 const p=setup({kind:'native',send:request=>new Promise(resolve=>waiting.push({request,resolve}))});
 p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointerup');await tick();
 p.nodes.find(n=>n.className==='close').fire('click');
 waiting[0].resolve({contract_version:'0.1.0',request_id:waiting[0].request.request_id,status:'accepted',error_code:null});
 await tick();assert(p.ui.cardSnapshot().hidden);
 assert.equal(p.events.filter(e=>e.type==='ask').at(-1).presented,false);
 results.dismissed_local={cardHidden:true,presented:false};
}
{
 const text=FIXTURE_EXPLANATIONS.find(x=>x.selected_text==='eigenvector').text;
 const witnesses=[-1,0,2].map(lambda=>({lambda,v:[1,0],Av:[lambda,0]}));
 assert(text.includes('negative λ reverses'));assert(text.includes('λ = 0 sends it to the zero vector'));
 for(const {lambda,v,Av} of witnesses)assert.deepEqual(Av,v.map(x=>lambda*x || 0));
 results.eigenvector={text,witnesses};
}
console.log(JSON.stringify({target:'cdc354c15c6382db4410045b54cdb36073c8e62b',kind:'synthetic_DOM_and_event_doubles_not_browser',results},null,2));
