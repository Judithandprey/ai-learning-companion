// Independent actual-Chromium layout check. NO product main/preload, no real
// screen/mic/voice/model, no visible window, no remote debugging TCP endpoint.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const crypto = require('node:crypto');
const ROOT = __dirname;
const buildLabel = process.env.QA_OFFSCREEN_BUILD || 'build-9622b517b74020b2d9e8ffbb03f8d615ff32341d';
if (!/^build-(?:\d{2}|[a-f0-9]{7,40})$/.test(buildLabel)) throw new Error('Invalid external frozen build label');
const build = path.join(ROOT, buildLabel);
const runLabel=process.env.QA_OFFSCREEN_RUN || 'run-01';
if(!/^run-\d{2}$/.test(runLabel))throw new Error('Expected a new run-NN label');
const out = path.join(ROOT, runLabel);
if (fs.existsSync(out)) throw new Error('Refuse to overwrite offscreen evidence');
fs.mkdirSync(out, {recursive:true});
for(const name of ['run.cjs','preload.cjs','build.mjs'])fs.copyFileSync(path.join(ROOT,name),path.join(out,'executed-'+name));
for (const name of ['userData','sessionData','crashDumps','temp']) {
  const folder=path.join(out,name); fs.mkdirSync(folder); app.setPath(name,folder);
}
app.disableHardwareAcceleration();
for (const name of ['disable-background-networking','disable-component-update','disable-sync','no-pings','disable-default-apps']) app.commandLine.appendSwitch(name);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('disable-features','MediaRouter,OptimizationHints,Translate,AutofillServerCommunication');
const manifest=JSON.parse(fs.readFileSync(path.join(build,'source-manifest.json'),'utf8'));
if(!manifest.source_stable_during_snapshot) throw new Error('Unstable source snapshot');
const report={kind:'offscreen Chromium + synthetic media/IPC/voice; NOT OS/device/model acceptance',
  started_at:new Date().toISOString(), electron:process.versions.electron, chrome:process.versions.chrome,
  executable_sha256:crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex'),
  source_manifest:manifest, checks:[], restrictions:[], renderer_errors:[], requests:[], screenshots:[], wip:manifest.worktree_status!==''};
let win, safe=false, gateResolve, gateReject, gate, area={x:0,y:0,width:1000,height:700}, places={};
const resetGate=()=>{safe=false;gate=new Promise((ok,no)=>{gateResolve=ok;gateReject=no;});gate.catch(()=>{});};
resetGate();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(id,pass,details={})=>{report.checks.push({id,status:pass?'PASS':'FAIL',details});};
const owned=e=>win && e.sender===win.webContents;
const display={display_id:'qa-generated-display',label:'QA synthetic display',bounds:{x:0,y:0,width:1000,height:700},scale_factor:1};
ipcMain.on('qa:preload-safe',(e,proof)=>{if(!owned(e)||proof.fakeMedia!==true)return;safe=true;report.restrictions.push({preload_before_modules:true,at:new Date().toISOString()});gateResolve();});
ipcMain.on('qa:preload-failed',(e,error)=>{if(owned(e)){report.renderer_errors.push({preload:error});gateReject(new Error(error));}});
ipcMain.handle('qa:ready',e=>{
  if(!owned(e)||!safe)throw new Error('Preload restrictions were not installed');
  const address='a'.repeat(64);
  return {source_id:'qa-generated-only',display,address_sha256:address,development:false,subscription:true,
    work_area:area,places,speech_rate:1.3,voice:{audible:false},live:{state:'on',model:'SYNTHETIC-NO-MODEL',max_submissions:60,used:0,reserve:12,expires_at:new Date(Date.now()+1800000).toISOString(),paused:null,missed:null,ended:null,seen:null,frames:0,out:0,unwritten:0},
    doc:{format:'lc-desktop-ink/v1',id:'0123456789abcdef',created_at:'2026-10-01T00:00:00Z',forked_from:null,display,
      ink:{format:'lc-web-ink/v1',page:{origin:'desktop',address_sha256:address},revision:0,strokes:{},visible:[],history:[]},evidence:{}}};
});
ipcMain.handle('qa:place',(e,surface,place)=>{
  if(!owned(e)||!['toolbar','caption'].includes(surface))throw new Error('Unexpected placement');
  places={...places,[surface]:place}; fs.writeFileSync(path.join(out,'places.json'),JSON.stringify(places,null,2));
  return {saved:true,reason:null};
});
const evaluate=code=>win.webContents.executeJavaScript(code,true);
async function until(code,ms=7000){const end=Date.now()+ms;while(Date.now()<end){try{if(await evaluate(code))return;}catch{}await delay(40);}throw new Error('Timed out: '+code);}
async function snap(){return evaluate(`(() => {const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,hidden:e.hidden,display:s.display,fx:e.style.getPropertyValue('--fx'),fy:e.style.getPropertyValue('--fy'),hit:top===e||e.contains(top),top:top?.id,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};};return {width:innerWidth,height:innerHeight,toolbar:box('toolbar'),card:box('card'),answer:box('answer'),cardHandle:box('cardHandle'),controls:Object.fromEntries(['toolbarHandle','talk','mute','slower','rate','faster','interrupt'].map(id=>[id,box(id)])),state:__lcOverlay.state(),log:__qa.log(),proof:__qa.proof()};})()`);}
async function center(selector){return evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing target');const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const top=document.elementFromPoint(x,y);if(!r.width||!r.height||!(top===e||e.contains(top)))throw new Error('Target clipped or covered: '+${JSON.stringify(selector)});return {x,y};})()`);}
async function pointer(type,x,y,down=false){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!down?'none':'left',buttons:down?1:0,clickCount:1,pointerType:'mouse'});}
async function click(selector){const p=await center(selector);await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,true);await pointer('mouseReleased',p.x,p.y);await delay(100);}
async function drag(selector,dx,dy){const p=await center(selector);await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,true);for(let i=1;i<=8;i++){await pointer('mouseMoved',p.x+dx*i/8,p.y+dy*i/8,true);await delay(15);}await pointer('mouseReleased',p.x+dx,p.y+dy);await delay(150);}
async function scrollCard(deltaY){const p=await center('#card');await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:p.y,deltaX:0,deltaY,pointerType:'mouse'});await delay(250);report.restrictions.push({qa_scrolled_card:deltaY,reason:'reach actual controls without bypassing hit-testing'});}
const inkCount=s=>s.state.doc.history.length;
const calls=(s,name)=>s.log.filter(x=>x.kind===name).length;
const inside=(r,s)=>r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=s.width+1&&r.bottom<=s.height+1;
async function screenshot(name){if(win.isVisible())throw new Error('Unexpected visible window');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(80);const img=await win.webContents.capturePage();fs.writeFileSync(path.join(out,name+'.png'),img.toPNG());report.screenshots.push({name,scope:'owned offscreen renderer pixels only; not desktop',paint_wait:'two animation frames and 80ms after the DOM measurements'});}
async function select(){await click('[data-mode="ASK"]');await pointer('mouseMoved',290,400);await pointer('mousePressed',290,400,true);for(const [x,y]of [[360,400],[380,440],[350,490],[285,480],[270,440],[290,400]]){await pointer('mouseMoved',x,y,true);await delay(25);}await pointer('mouseReleased',290,400);await until('document.getElementById("askForm").hidden === false && !document.getElementById("askCancel").hidden');}
const watchdog=setTimeout(()=>{report.fatal='45-second watchdog';fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));app.exit(2);},55000);
async function run(){
  await app.whenReady();
  const ses=session.fromPartition('qa-offscreen-'+Date.now(),{cache:false});
  ses.setPermissionCheckHandler(()=>false);
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  ses.setDisplayMediaRequestHandler((_request,callback)=>{report.restrictions.push({unexpected_real_display_request:true});callback({});});
  ses.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{
    const allowed=details.url.startsWith('file:')||details.url.startsWith('data:')||details.url.startsWith('blob:');
    if(!allowed)report.requests.push({blocked_url_scheme:details.url.split(':')[0]});
    callback({cancel:!allowed});
  });
  const dist=path.join(build,'dist');
  await ses.protocol.handle('file',async req=>{
    const filename=path.resolve(fileURLToPath(req.url));
    if(!filename.startsWith(dist+path.sep))return new Response('Blocked',{status:403});
    if(filename.endsWith('.js')){
      await Promise.race([gate,delay(3000).then(()=>{throw new Error('Preload gate did not open');})]);
      if(!safe)return new Response('Preload not safe',{status:403});
    }
    const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html';
    return new Response(fs.readFileSync(filename),{headers:{'content-type':type}});
  });
  win=new BrowserWindow({width:1000,height:700,useContentSize:true,show:false,focusable:false,skipTaskbar:true,
    webPreferences:{session:ses,preload:path.join(ROOT,'preload.cjs'),offscreen:true,backgroundThrottling:false,
      nodeIntegration:false,contextIsolation:false,sandbox:true,webSecurity:true,spellcheck:false}});
  win.on('show',()=>{report.fatal='Unexpected show event';app.exit(3);});
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:'))event.preventDefault();});
  win.webContents.on('console-message',details=>{if(details.level==='error')report.renderer_errors.push({console:details.message});});
  win.webContents.on('preload-error',(_event,_path,error)=>{report.renderer_errors.push({preload:String(error)});gateReject(error);});
  win.webContents.debugger.attach('1.3');
  const html=path.join(dist,'apps/windows/src/renderer/overlay.html');
  await win.loadFile(html);
  await until('!!globalThis.__lcOverlay && __lcOverlay.state().frame !== null');
  await evaluate(`globalThis.__qaPointerEvents=[];for(const kind of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(kind,e=>{if(__qaPointerEvents.length<500)__qaPointerEvents.push({kind,target:e.target.id,buttons:e.buttons,button:e.button,pointerId:e.pointerId,x:e.clientX,y:e.clientY});},true)`);
  let s=await snap();
  check('restrictions_before_modules',safe&&s.proof.fakeMedia&&!win.isVisible(),{proof:s.proof,visible:win.isVisible()});
  const layout=async(name)=>{const t=await snap();report.layouts??={};report.layouts[name]=t;check(name+'_toolbar_inside',inside(t.toolbar,t),t.toolbar);check(name+'_toolbar_no_overflow',t.toolbar.scrollHeight<=t.toolbar.clientHeight+1&&t.toolbar.scrollWidth<=t.toolbar.clientWidth+1,t.toolbar);for(const [id,box]of Object.entries(t.controls)){if(!box.hidden&&box.display!=='none')check(name+'_'+id+'_reachable',inside(box,t)&&box.hit,box);}await screenshot(name);return t;};
  await layout('01-wide-talk-off');
  await click('#talk');await layout('02-wide-talk-on-before-response');
  const initial=await snap();await drag('#toolbarHandle',-140,95);s=await snap();
  check('toolbar_real_drag',Math.hypot(s.toolbar.x-initial.toolbar.x,s.toolbar.y-initial.toolbar.y)>1&&calls(s,'place')>calls(initial,'place'),{before:initial.toolbar,after:s.toolbar});
  check('toolbar_drag_no_ink_or_ask',inkCount(s)===inkCount(initial)&&calls(s,'askSelection')===calls(initial,'askSelection')&&calls(s,'askSubmit')===0&&s.state.mode===initial.state.mode);
  await click('[data-mode="WRITE"]');await click('#mouse');const beforeButton=await snap();await click('#eraser');const afterButton=await snap();
  check('eraser_button_no_drag_or_ink',afterButton.state.tool==='eraser'&&calls(afterButton,'place')===calls(beforeButton,'place')&&inkCount(afterButton)===inkCount(beforeButton));
  await drag('#toolbarHandle',-30,35);s=await snap();check('write_drag_no_erase_or_ask',inkCount(s)===inkCount(afterButton)&&s.state.mode==='WRITE'&&calls(s,'askSelection')===calls(afterButton,'askSelection'));
  // Home uses the production handle keyboard listener; place toolbar above the owned synthetic circle.
  await evaluate('document.getElementById("toolbarHandle").focus()');await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  await select();await evaluate('__qa.reply()');await until('document.getElementById("answerBox").hidden === false');await delay(100);
  s=await layout('03-wide-response-speaking');
  check('answer_visible_without_manual_scroll',s.answer.y>=s.cardHandle.bottom&&s.answer.bottom<=s.card.bottom+1&&s.answer.hit,{card:s.card,answer:s.answer,handle:s.cardHandle});
  check('six_talk_controls_visible',Object.entries(s.controls).filter(([id])=>id!=='toolbarHandle').every(([,b])=>!b.hidden&&b.display!=='none'),s.controls);
  check('voice_only_inert_boundary',calls(s,'fakeSay')===1,{fakeSay:s.log.filter(x=>x.kind==='fakeSay'),scope:'index-only fake boundary, no audio'});
  const oldCard=s;await drag('#cardHandle',-190,-70);s=await snap();
  check('card_real_drag',Math.hypot(s.card.x-oldCard.card.x,s.card.y-oldCard.card.y)>40&&calls(s,'place')>calls(oldCard,'place'),{before:oldCard.card,after:s.card});
  check('card_drag_no_ink_or_submit',inkCount(s)===inkCount(oldCard)&&calls(s,'askSubmit')===calls(oldCard,'askSubmit')&&calls(s,'askSelection')===calls(oldCard,'askSelection'));
  const beforeClamp=s;await drag('#cardHandle',-1500,-1000);s=await snap();check('card_drag_clamps_inside',inside(s.card,s),{card:s.card});check('clamp_drag_no_ink_or_submit',inkCount(s)===inkCount(beforeClamp)&&calls(s,'askSelection')===calls(beforeClamp,'askSelection'));
  // Put card back to its default with Home before narrow work-area measurement.
  await evaluate('document.getElementById("cardHandle").focus()');await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  area={x:0,y:0,width:440,height:320};win.setContentSize(440,320);await until('innerWidth===440&&innerHeight===320');await evaluate('__qa.area(440,320)');await delay(100);
  s=await layout('04-narrow-response-speaking');check('narrow_card_inside',inside(s.card,s),s.card);check('narrow_answer_visible',s.answer.y>=s.cardHandle.bottom&&s.answer.bottom<=s.card.bottom+1&&s.answer.hit,{answer:s.answer,card:s.card,handle:s.cardHandle});
  // Closing with the actual sticky button reveals the toolbar if card and toolbar overlap.
  await click('#close');await layout('05-narrow-talk-on');await click('#talk');await layout('06-narrow-talk-off');
  area={x:0,y:0,width:1000,height:700};win.setContentSize(1000,700);await until('innerWidth===1000');await evaluate('__qa.area(1000,700)');await delay(100);
  const savedPlaces=structuredClone(places);report.pointer_events=await evaluate('__qaPointerEvents');report.pre_reload_fixture_log=(await snap()).log;
  resetGate();await win.loadFile(html);await until('!!globalThis.__lcOverlay && __lcOverlay.state().frame !== null');s=await snap();
  check('reload_restores_toolbar_place',!!savedPlaces.toolbar&&inside(s.toolbar,s)&&Math.abs(Number(s.toolbar.fx)-savedPlaces.toolbar.fx)<1e-6&&Math.abs(Number(s.toolbar.fy)-savedPlaces.toolbar.fy)<1e-6,{place:savedPlaces.toolbar,toolbar:s.toolbar});
  await select();s=await snap();check('reopened_card_restores_place',!!savedPlaces.caption&&inside(s.card,s)&&Math.abs(Number(s.card.fx)-savedPlaces.caption.fx)<1e-6&&Math.abs(Number(s.card.fy)-savedPlaces.caption.fy)<1e-6,{place:savedPlaces.caption,card:s.card});
  check('window_never_shown',!win.isVisible());check('no_network_attempt',report.requests.length===0);report.final_fixture_log=s.log;
  await evaluate('__qa.stop()');await delay(100);
}
run().catch(error=>{report.fatal=String(error.stack||error);}).finally(()=>{
  clearTimeout(watchdog);report.ended_at=new Date().toISOString();report.pass=report.checks.filter(x=>x.status==='PASS').length;report.fail=report.checks.filter(x=>x.status==='FAIL').length;
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,fail:report.fail,fatal:report.fatal??null,wip:report.wip}));
  if(win&&!win.isDestroyed())win.destroy();app.exit(report.fatal?2:report.fail?1:0);
});
