// Independent actual-Chromium layout check. NO product main/preload, no real
// screen/mic/voice/model, no visible window, no remote debugging TCP endpoint.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const crypto = require('node:crypto');
const ROOT = __dirname;
const qaLiveId = crypto.randomUUID(); // unique synthetic session identity, separate from timestamp freshness
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
    work_area:area,places,speech_rate:1.3,voice:{audible:false},live:{state:'on',id:qaLiveId,since:new Date().toISOString(),model:'SYNTHETIC-NO-MODEL',max_submissions:60,used:0,reserve:12,expires_at:new Date(Date.now()+1800000).toISOString(),paused:null,missed:null,ended:null,seen:null,frames:0,out:0,unwritten:0},
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
async function snap(){return evaluate(`(() => {const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,hidden:e.hidden,display:s.display,fx:e.style.getPropertyValue('--fx'),fy:e.style.getPropertyValue('--fy'),hit:top===e||e.contains(top),top:top?.id,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollTop:e.scrollTop,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};};return {width:innerWidth,height:innerHeight,toolbar:box('toolbar'),card:box('card'),answer:box('answer'),cardHandle:box('cardHandle'),controls:Object.fromEntries(['toolbarHandle','talk','mute','slower','rate','faster','interrupt'].map(id=>[id,box(id)])),state:__lcOverlay.state(),log:__qa.log(),proof:__qa.proof()};})()`);}
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
  const measured=async(name)=>{const t=await snap();report.layouts??={};report.layouts[name]=t;await screenshot(name);return t;};
  await click('[data-mode="WRITE"]');await click('#mouse');await click('#talk');await select();await evaluate('__qa.reply()');await until('document.getElementById("answerBox").hidden === false');await delay(100);
  const wide=await measured('01-wide-fresh-response');
  check('wide_answer_visible',wide.answer.y>=wide.cardHandle.bottom&&wide.answer.bottom<=wide.card.bottom+1&&wide.answer.hit,{answer:wide.answer,card:wide.card});
  // No focus(), Home, card drag, or scrolling between the response and this resize.
  area={x:0,y:0,width:440,height:320};win.setContentSize(440,320);await until('innerWidth===440&&innerHeight===320');await evaluate('__qa.area(440,320)');await delay(100);
  const narrow=await measured('02-direct-resize');
  check('direct_resize_keeps_answer_visible',narrow.answer.y>=narrow.cardHandle.bottom&&narrow.answer.bottom<=narrow.card.bottom+1&&narrow.answer.hit,{wide:{answer:wide.answer,card:wide.card},narrow:{answer:narrow.answer,card:narrow.card}});
  check('narrow_talk_stop_unobstructed',['talk','mute','slower','rate','faster','interrupt'].every(id=>inside(narrow.controls[id],narrow)&&narrow.controls[id].hit),narrow.controls);
  const r=narrow.controls.interrupt;await pointer('mouseMoved',r.x+r.width/2,r.y+r.height/2);await pointer('mousePressed',r.x+r.width/2,r.y+r.height/2,true);await pointer('mouseReleased',r.x+r.width/2,r.y+r.height/2);await delay(100);s=await snap();
  check('click_at_stop_reading_rect_reaches_hush',calls(s,'hush')>calls(narrow,'hush'),{hit:narrow.controls.interrupt.top,before:calls(narrow,'hush'),after:calls(s,'hush'),interruptStillShown:!s.controls.interrupt.hidden});
  check('occluded_stop_click_no_ink_or_ask',inkCount(s)===inkCount(narrow)&&calls(s,'askSelection')===calls(narrow,'askSelection'));
  await click('#close');s=await snap();check('close_card_still_reaches_hush',calls(s,'hush')>calls(narrow,'hush'));
  await click('[data-mode="ASK"]');await pointer('mouseMoved',50,278);await pointer('mousePressed',50,278,true);for(const [x,y]of [[140,278],[140,307],[50,307],[50,278]]){await pointer('mouseMoved',x,y,true);await delay(25);}await pointer('mouseReleased',50,278);await until('document.getElementById("askForm").hidden === false && !document.getElementById("askCancel").hidden');await evaluate('__qa.reply()');await until('document.getElementById("answerBox").hidden === false');await delay(100);
  const fresh=await measured('03-narrow-fresh-response');
  check('fresh_narrow_answer_visible',fresh.answer.y>=fresh.cardHandle.bottom&&fresh.answer.bottom<=fresh.card.bottom+1&&fresh.answer.hit,{answer:fresh.answer,card:fresh.card,handle:fresh.cardHandle});
  check('fresh_narrow_talk_stop_unobstructed',['talk','mute','slower','rate','faster','interrupt'].every(id=>inside(fresh.controls[id],fresh)&&fresh.controls[id].hit),fresh.controls);
  
  const beforeDrag=await snap();await drag('#toolbarHandle',0,170);const afterDrag=await snap();
  check('narrow_drag_retains_source_ink_mode',inkCount(beforeDrag)===inkCount(afterDrag)&&beforeDrag.state.mode===afterDrag.state.mode&&calls(beforeDrag,'askSelection')===calls(afterDrag,'askSelection')&&calls(beforeDrag,'askSubmit')===calls(afterDrag,'askSubmit'),{before:beforeDrag.state.mode,after:afterDrag.state.mode});
  const apart=(t,c)=>c.y>=t.bottom+5||c.bottom<=t.y-5||c.x>=t.right+5||c.right<=t.x-5;
  check('narrow_drag_preserves_caption_and_surface_access',apart(afterDrag.toolbar,afterDrag.card)&&afterDrag.controls.toolbarHandle.hit&&afterDrag.cardHandle.hit&&afterDrag.answer.hit&&afterDrag.answer.y>=afterDrag.cardHandle.bottom&&afterDrag.answer.bottom<=afterDrag.card.bottom+1,{toolbar:afterDrag.toolbar,card:afterDrag.card,answer:afterDrag.answer,handle:afterDrag.cardHandle});
  await delay(1200);const settled=await snap();check('narrow_idle_fit_does_not_jitter',Math.abs(settled.card.y-afterDrag.card.y)<1&&Math.abs(settled.card.height-afterDrag.card.height)<1,{before:afterDrag.card,after:settled.card});
  await screenshot('04-narrow-after-drag');report.layouts['04-narrow-after-drag']=afterDrag;
  check('window_never_shown',!win.isVisible());check('no_network_attempt',report.requests.length===0);report.pointer_events=await evaluate('__qaPointerEvents');report.final_fixture_log=fresh.log;
  await evaluate('__qa.stop()');await delay(100);
}
run().catch(error=>{report.fatal=String(error.stack||error);}).finally(()=>{
  clearTimeout(watchdog);report.ended_at=new Date().toISOString();report.pass=report.checks.filter(x=>x.status==='PASS').length;report.fail=report.checks.filter(x=>x.status==='FAIL').length;
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,fail:report.fail,fatal:report.fatal??null,wip:report.wip}));
  if(win&&!win.isDestroyed())win.destroy();app.exit(report.fatal?2:report.fail?1:0);
});
