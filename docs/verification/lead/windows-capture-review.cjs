// Independent failure characterization for exact Windows candidate 6584ab1.
// Injected VM/I/O only; not an Electron or physical-device acceptance check.
// LC_WINDOWS_REVIEW_ROOT must point at an extraction of that exact commit.
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { EventEmitter } = require('node:events');
const root = process.env.LC_WINDOWS_REVIEW_ROOT || process.cwd();
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function harness() {
 const source=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/main/main.ts','utf8'))
 .replace(/^import .*;$/gm,'').replace(/export /g,'').replace("dirname(fileURLToPath(import.meta.url))", "'/mock/dist/apps/windows/src/main'");
 const windows=[], timers=[], sources=[]; const handlers={},permission={};
 class Window extends EventEmitter {
  constructor(opts){super();this.opts=opts; this.id=windows.length+1; this.destroyed=false;this.shown=false;this.webContents=Object.assign(new EventEmitter(),{mainFrame:{},send:(...args)=>{this.sent.push(args)},setWindowOpenHandler(){}});this.sent=[];windows.push(this);}
  removeMenu(){} setAlwaysOnTop(){} setContentProtection(){} setIgnoreMouseEvents(){} setBounds(){} show(){this.shown=true} showInactive(){this.shown=true} isDestroyed(){return this.destroyed} destroy(){this.destroyed=true;this.emit('closed')} loadURL(){return Promise.resolve()}
 }
 const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit(){},getPath:()=>'/tmp/lc-mock-ink',setPath(){}});
 const session={defaultSession:{setPermissionRequestHandler:f=>permission.request=f,setPermissionCheckHandler:f=>permission.check=f,setDisplayMediaRequestHandler:f=>permission.display=f}};
 const display={id:1,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1};
 const sourceItem={id:'screen:1:0',display_id:'1',name:'monitor',thumbnail:{toDataURL:()=>''}};
 const desktopCapturer={getSources:()=>sources.length?sources.shift():Promise.resolve([sourceItem])};
 const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>[display],getPrimaryDisplay:()=>display});
 const sandbox={...require('node:crypto'),...require('node:path'),...require('node:url'),...require('node:fs'),release:()=>'',app,BrowserWindow:Window,desktopCapturer,screen,session,protocol:{registerSchemesAsPrivileged(){},handle(){}},Menu:{setApplicationMenu(){}},net:{},ipcMain:{handle:(n,f)=>handlers[n]=f,on:(n,f)=>handlers[n]=f},process:{...process,env:{}},setTimeout:(f,n)=>timers.push({f,n}),newDesktopInk:(id,sha,at,display)=>({id,display,ink:{history:[],visible:[]}}),isSessionId:()=>true,parseDesktopInk:()=>({ok:false}),summarize:()=>null,Response,console};
 vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.review={start,end,current:()=>current,control:()=>control};',sandbox);
 return { ...sandbox.review,windows,timers,sources,permission,handlers,sourceItem };
}
(async()=>{
 let h=harness();await Promise.resolve();await Promise.resolve();
 let pending=defer();h.sources.push(pending.promise);let p=h.start('screen:1:0');h.end('STOP during Start enumeration');pending.resolve([h.sourceItem]);let out=await p;
 console.log(JSON.stringify({case:'stop-during-start-enumeration',result:out,currentAfterStop:!!h.current(),overlayShown:h.current()?.overlay.shown}));
 h=harness();await Promise.resolve();await Promise.resolve();let a=defer(),b=defer();h.sources.push(a.promise,b.promise);const p1=h.start('screen:1:0'),p2=h.start('screen:1:0');a.resolve([h.sourceItem]);const r1=await p1;const first=h.current();b.resolve([h.sourceItem]);const r2=await p2;const second=h.current();h.end('STOP');
 console.log(JSON.stringify({case:'concurrent-starts',first:r1,second:r2,liveOverlays:h.windows.filter(x=>x.opts.transparent&&!x.destroyed).length,orphanFirst:first!==second&&!first.overlay.isDestroyed(),firstReceivedStop:first.overlay.sent.some(x=>x[0]==='lc:stop'),secondReceivedStop:second.overlay.sent.some(x=>x[0]==='lc:stop')}));
 h=harness();await Promise.resolve();await Promise.resolve();await h.start('screen:1:0');const s=h.current();h.handlers['lc:arm-capture']({sender:s.overlay.webContents});let permissionGranted;h.permission.request(s.overlay.webContents,'media',r=>permissionGranted=r,{isMainFrame:true,mediaTypes:[]});const wait=defer();h.sources.push(wait.promise);let cb;const req=h.permission.display({frame:s.overlay.webContents.mainFrame,videoRequested:true,audioRequested:false},r=>cb=r);h.end('STOP while display enumeration pending');wait.resolve([h.sourceItem]);await req;
 console.log(JSON.stringify({case:'display-grant-after-stop',permissionGranted,ending:s.ending,callbackGrantedVideo:!!cb.video,chosen:cb.video?.id}));
 h=harness();await Promise.resolve();await Promise.resolve();await h.start('screen:1:0');const failedSession=h.current();h.handlers['lc:arm-capture']({sender:failedSession.overlay.webContents});h.permission.request(failedSession.overlay.webContents,'media',()=>{},{isMainFrame:true,mediaTypes:[]});h.sources.push(Promise.reject(new Error('enumeration unavailable')));let replied=false,thrown='';try{await h.permission.display({frame:failedSession.overlay.webContents.mainFrame,videoRequested:true,audioRequested:false},()=>replied=true)}catch(e){thrown=e.message}for(const timer of h.timers.filter(x=>x.n===3000))timer.f();console.log(JSON.stringify({case:'display-enumeration-failure',thrown,callbackReplied:replied,captureState:failedSession.capture,ending:failedSession.ending,currentAlive:!!h.current()}));
 // Exact renderer startCapture/endCapture functions with only I/O mocked.
 const overlay=stripTypeScriptTypes(fs.readFileSync(root+'/apps/windows/src/renderer/overlay.ts','utf8'));
 const funcs=overlay.slice(overlay.indexOf('async function startCapture('),overlay.indexOf('/** A grid of the frame'));
 const armed=defer(),media=defer();let requested=0,stops=0,played=0;
 const ctx={lc:{armCapture:()=>armed.promise,ended(){}},navigator:{mediaDevices:{getDisplayMedia:()=>{requested++;return media.promise}}},video:{requestVideoFrameCallback(){},play:async()=>{played++}},onFrame(){},takeSample:async()=>{},render(){}};
 vm.createContext(ctx);vm.runInContext('let stream=null,ended=false,endReason="",sampling=Promise.resolve();'+funcs+'\nglobalThis.test={startCapture,endCapture,status:()=>({ended,hasStream:!!stream})}',ctx);
 let run=ctx.test.startCapture();armed.resolve(true);await Promise.resolve();ctx.test.endCapture('STOP while getDisplayMedia is pending');const track={getSettings:()=>({displaySurface:'monitor'}),addEventListener(){},stop(){stops++}};media.resolve({getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]});await run;
 console.log(JSON.stringify({case:'renderer-stream-resolves-after-stop',...ctx.test.status(),getDisplayMediaCalls:requested,trackStops:stops,videoPlayCalls:played}));
})();
