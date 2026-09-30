import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
const root='/tmp/lc-windows-parent-5871981';
const main=fs.readFileSync(root+'/apps/windows/src/main/main.ts','utf8');
const control=fs.readFileSync(root+'/apps/windows/src/renderer/control.ts','utf8');
const {CaptureLink}=await import(pathToFileURL(root+'/apps/windows/src/main/capture-link.ts'));
const {seedRecord}=await import(pathToFileURL(root+'/apps/windows/tests/link-fakes.ts'));
const observations=[];
const quitSource=main.slice(main.indexOf('let linkQuitting:'),main.indexOf('function notifyLink()'));
function quitGate(link) {
 const events=new Map(); let quits=0;
 const scope={link,app:{on:(name,fn)=>events.set(name,fn),quit:()=>{quits++;}}};vm.createContext(scope);
 vm.runInContext(stripTypeScriptTypes(quitSource),scope);
 return {emit:()=>{let prevented=false;events.get('will-quit')({preventDefault:()=>{prevented=true;}});return prevented;},quits:()=>quits};
}
for(const ending of ['resolve','reject']) test('APP-Q1: repeated quit stays held until '+ending,async()=>{
 let complete;let calls=0;
 const pending=new Promise((resolve,reject)=>{complete=()=>ending==='resolve'?resolve():reject(new Error('synthetic shutdown failure'));});
 const gate=quitGate({quit:bound=>{assert.equal(bound,20000);calls++;return pending;}});
 const held=[gate.emit(),gate.emit(),gate.emit()]; assert.deepEqual(held,[true,true,true]); assert.equal(calls,1);assert.equal(gate.quits(),0);
 complete();for(let i=0;i<5;i++)await Promise.resolve();
 assert.equal(gate.quits(),1);assert.equal(gate.emit(),false);assert.equal(calls,1);
 observations.push({case:'quit_'+ending,held,shutdown_calls:calls,completion_quits:gate.quits(),final_event_allowed:true});
});
test('APP-Q1 control: disconnected application has no shutdown gate',()=>{
 const gate=quitGate(null);assert.equal(gate.emit(),false);assert.equal(gate.quits(),0);
 observations.push({case:'quit_off',held:false});
});
const FAULT='the capture link record could not be written, so further sends to the local test capture service have stopped';
function localLink(){
 const asked={dsn:0,spawn:0,transport:0};
 const link=new CaptureLink({userData:'/tmp/windows-parent-correction-no-data-'+process.pid,config:{launch:{kind:'wsl',distribution:'unused',user:'unused',cd:'/',python:'/unused'},dsn_file:'/unused'},notify:()=>{},endCapture:()=>{},readDsn:()=>{asked.dsn++;throw new Error('must not read');},host:{spawn:()=>{asked.spawn++;throw new Error('must not spawn');}},transport:async()=>{asked.transport++;throw new Error('must not send');}});
 return {link,asked};
}
function page(){const nodes={ai:{textContent:'',hidden:false},link:{textContent:'',hidden:true}};const scope={$:id=>nodes[id]};vm.createContext(scope);vm.runInContext(stripTypeScriptTypes(control.slice(control.indexOf('const AI_DEFAULT'),control.indexOf('lc.onLink(showLink);')))+'\nglobalThis.showLink=showLink;',scope);return {nodes,show:scope.showLink};}
test('APP-U1: prior committed/unknown outcomes and unconfirmed Stop survive fault teardown',()=>{
 const {link}=localLink();link.record=seedRecord();link.fault=FAULT;link.active=null;link.last={state:'stopped',detail:'the Stop is not confirmed'};
 const before=JSON.stringify(link.record);const status=link.status();const ui=page();ui.show(status);
 assert.deepEqual([status.mode,status.stored,status.unknown,status.earlier_unknown,status.sends_stopped],['development',2,1,1,true]);
 assert.match(status.detail,/the Stop is not confirmed/);assert.match(ui.nodes.link.textContent,/2 record\(s\) stored; 1 not known whether stored; 1 earlier stream\(s\) whose end is not known/);assert.match(ui.nodes.link.textContent,/the Stop is not confirmed/);
 assert.match(ui.nodes.ai.textContent,/Further sends .* have stopped/);assert.match(ui.nodes.ai.textContent,/No AI is connected/);assert.doesNotMatch(ui.nodes.ai.textContent,/nothing is sent anywhere/);assert.equal(JSON.stringify(link.record),before);
 observations.push({case:'prior_outcomes',status,header:ui.nodes.ai.textContent,line:ui.nodes.link.textContent,record_unchanged:true});
});
test('APP-U1 control: first failure with no record and ordinary off remain local only',()=>{
 const {link}=localLink();link.fault=FAULT;const status=link.status();assert.equal(status.mode,'unavailable');
 const ui=page();ui.show(status);assert.match(ui.nodes.ai.textContent,/nothing is sent anywhere/);ui.show({mode:'off'});assert.equal(ui.nodes.link.hidden,true);
 observations.push({case:'never_sent_control',status,off_hidden:true});
});
test('overlay ready marks storage only for development mode without a send fault',()=>{
 const handlers={};const scope={ipcMain:{handle:(name,fn)=>handlers[name]=fn},fromOverlay:()=>true,current:{sourceId:'synthetic',display:{},doc:{id:'ink'},retention:{policy:{}}},sha256:()=>'<synthetic>',linkStatus:null};vm.createContext(scope);
 const start=main.indexOf("ipcMain.handle('lc:overlay-ready'");const end=main.indexOf('// Retained frames keep arriving',start);vm.runInContext(stripTypeScriptTypes(main.slice(start,end)),scope);
 const cases=[{status:{mode:'off'},expected:false},{status:{mode:'unavailable',reason:FAULT},expected:false},{status:{mode:'development',sends_stopped:false},expected:true},{status:{mode:'development',sends_stopped:true},expected:false}];
 for(const c of cases){scope.linkStatus=c.status;assert.equal(handlers['lc:overlay-ready']({}).stored,c.expected);}
 observations.push({case:'overlay_ready',cases});
});
test('fault blocks fresh/renewed connection and another Start without DSN, child or request',async()=>{
 const {link,asked}=localLink();link.record=seedRecord();link.fault=FAULT;const active={rec:link.record.streams[0],state:'offline',detail:null};link.active=active;
 await link.connect(active,true);await link.connect(active,false);link.begin('later-capture','/tmp/not-read');
 assert.deepEqual(asked,{dsn:0,spawn:0,transport:0});assert.equal(link.active,active);assert.equal(link.status().state,'not connected');assert.equal(link.status().sends_stopped,true);
 observations.push({case:'no_reconnect_after_fault',asked,state:link.status().state});
});
after(()=>fs.writeFileSync('/tmp/windows-parent-app-correction-probes.json',JSON.stringify({candidate:'5871981524140e3be986268a941d34e99af25bb9',scope:'Linux Node exact-source callback/status/UI/guard tests; no host, native app, DB, listener or provider',observations},null,2)+'\n'));
