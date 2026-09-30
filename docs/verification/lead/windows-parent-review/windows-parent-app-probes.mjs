import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = '/tmp/lc-windows-parent-d6ef68a';
const main = fs.readFileSync(root + '/apps/windows/src/main/main.ts','utf8');
const control = fs.readFileSync(root + '/apps/windows/src/renderer/control.ts','utf8');
const linkModule = await import(pathToFileURL(root + '/apps/windows/src/main/capture-link.ts'));
const observations = [];
// Exact will-quit callback; only its app/link boundaries are doubles. No Electron/process launch.
let settle;
const pending = new Promise(resolve => { settle = resolve; });
const events = new Map();
let quitCalls = 0, linkCalls = 0;
const context = {
  app: { on: (name, callback) => events.set(name,callback), quit: () => { quitCalls++; } },
  link: { quit: bound => { assert.equal(bound,20000); linkCalls++; return pending; } },
};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(main.slice(main.indexOf('let linkQuitDone = false;'),main.indexOf('function notifyLink()'))),context);
const gate = events.get('will-quit');
let firstPrevented = false, secondPrevented = false;
gate({ preventDefault: () => { firstPrevented = true; } });
gate({ preventDefault: () => { secondPrevented = true; } });
assert.equal(firstPrevented,true); assert.equal(secondPrevented,false);
assert.equal(linkCalls,1); assert.equal(quitCalls,0);
observations.push({case:'repeated_will_quit_before_link_settles',first_prevented:firstPrevented,second_prevented:secondPrevented,link_quit_calls:linkCalls,resume_quit_calls_before_settle:quitCalls,meaning:'The actual pending gate admits a second quit event before its awaited shutdown settles; native event ordering not executed.'});
settle(); await pending; await Promise.resolve();
assert.equal(quitCalls,1);
// Actual coordinator status method over explicit retained in-memory state, followed by actual renderer.
// No begin/reconcile/save/host/network call. This tests only presentation after the documented write-fault teardown.
const link = new linkModule.CaptureLink({userData:'/tmp/windows-parent-review-no-such-app-data',config:{},notify:()=>{},endCapture:()=>{}});
link.record = {streams:[{jobs:[{status:'committed',records:2},{status:'unknown',records:1}],final:null,notes:[]}]};
link.fault = 'the capture link record could not be written, so nothing more is sent';
link.active = null;
const status = link.status();
const nodes = {ai:{textContent:'',hidden:false},link:{textContent:'',hidden:true}};
const ui = {$:id=>nodes[id]}; vm.createContext(ui);
vm.runInContext(stripTypeScriptTypes(control.slice(control.indexOf('const AI_DEFAULT'),control.indexOf('lc.onLink(showLink);'))) + '\nglobalThis.showLink=showLink;',ui);
ui.showLink(status);
assert.equal(status.mode,'unavailable');
assert.equal('stored' in status,false); assert.equal('unknown' in status,false);
observations.push({case:'post_fault_teardown_loses_known_outcome_display',record_jobs:link.record.streams[0].jobs,status,header:nodes.ai.textContent,storage_line:nodes.link.textContent,meaning:'Actual status/renderer functions hide retained committed/unknown counts after write-fault teardown; this is a source-level explicit-state probe, not a runtime fault injection.'});
fs.writeFileSync('/tmp/windows-parent-app-probes.json',JSON.stringify({source:root,scope:'Linux Node exact-source callback/status/UI probes; no native app, network, host or database',observations},null,2)+'\n');
console.log(JSON.stringify(observations,null,2));
