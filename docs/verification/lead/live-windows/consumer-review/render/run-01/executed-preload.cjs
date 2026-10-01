// Runs before any production renderer module. Main refuses to serve renderer JS
// until this preload acknowledges all restrictions. No real device/voice/network.
const { ipcRenderer } = require('electron');
const log = [];
const listeners = {};
let selection = 0, request = 0, lastRequest = null, speechResolve = null, talked = false, muted = false;
const deny = (name) => { throw new Error(`QA blocked ${name}`); };
const define = (target, name, value) => Object.defineProperty(target, name, { value, configurable: false, writable: false });
try {
  define(globalThis, 'fetch', () => Promise.reject(new Error('QA blocked fetch')));
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'AudioContext', 'webkitAudioContext', 'Audio', 'SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesisUtterance']) {
    define(globalThis, name, class { constructor() { deny(name); } });
  }
  define(globalThis, 'speechSynthesis', Object.freeze({ speak: () => deny('real speech'), cancel() {}, getVoices: () => [] }));
  define(navigator, 'sendBeacon', () => false);
  let timer;
  const syntheticDisplay = async () => {
    log.push({kind:'synthetic_canvas_capture'});
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700;
    const g = c.getContext('2d'); let tick = 0;
    const draw = () => { g.fillStyle = '#eaf1f8'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#17426d'; g.font = '24px sans-serif'; g.fillText('GENERATED OFFSCREEN QA SURFACE', 30, 250); g.fillRect(80 + (tick++ % 5), 300, 160, 90); };
    draw(); const stream = c.captureStream(10); const track = stream.getVideoTracks()[0];
    const getSettings = track.getSettings.bind(track);
    define(track, 'getSettings', () => ({...getSettings(), displaySurface:'monitor'}));
    timer = setInterval(draw, 100);
    addEventListener('unload', () => { clearInterval(timer); track.stop(); }, {once:true});
    return stream;
  };
  define(navigator, 'mediaDevices', Object.freeze({ getDisplayMedia: syntheticDisplay,
    getUserMedia: () => Promise.reject(new Error('QA blocked real microphone/camera')), enumerateDevices: async () => [] }));
  for (const name of ['getUserMedia','webkitGetUserMedia','mozGetUserMedia']) define(navigator,name,()=>deny(name));
  const call = (kind, ...args) => log.push({kind,args});
  define(globalThis, 'lc', Object.freeze({
    ready: () => ipcRenderer.invoke('qa:ready'), armCapture: async () => true,
    place: async (surface, place) => {call('place',surface,place); return ipcRenderer.invoke('qa:place',surface,place);},
    talk: (on, mute) => { talked=on; muted=mute; call('talk',on,mute); },
    say: (selectionId,requestId,at) => { call('fakeSay',selectionId,requestId,at); return new Promise(resolve=>{speechResolve=resolve;}); },
    hush: () => {call('hush');speechResolve?.({spoken:false});speechResolve=null;},
    onLive: fn => {listeners.live=fn;},
    speechRate: async rate => {call('rate',rate); return {saved:true,reason:null};},
    retainFrame: async () => ({ok:true}), notRetained: () => {}, observationGap: () => {}, stopping: () => {},
    sample: s => call('sample',{seq:s.seq}), interactive: on => call('interactive',on),
    saveInk: async (doc, images) => {call('saveInk',doc.ink.revision); return {ok:true,pictures_received:images.map(x=>x.sha256),pictures_invalid:[]};},
    loadResult: () => {}, ended: reason => call('ended',reason), stopped: reason => call('stopped',reason),
    onLoadDoc: fn => {listeners.load=fn;}, onStop: fn => {listeners.stop=fn;}, onWorkArea: fn => {listeners.area=fn;},
    askSelection: async () => {const sid=`qa-selection-${++selection}`,rid=`qa-request-${++request}`;call('askSelection',sid,rid);lastRequest={sid,rid,spoken:talked&&!muted};return {ok:true,selection_id:sid,request:{ok:true,request_id:rid,model:'SYNTHETIC-NO-MODEL',about:{captured_at:'2026-10-01T00:00:00Z',focus:'on_this_frame'}}};},
    askSubmit: async (sid,question,assistance) => {const rid=`qa-request-${++request}`;call('askSubmit',sid,rid,question,assistance);lastRequest={sid,rid,spoken:talked&&!muted};return {ok:true,request_id:rid,model:'SYNTHETIC-NO-MODEL',about:{captured_at:'2026-10-01T00:00:00Z',focus:'on_this_frame'}};},
    askCancel: (...a) => call('askCancel',...a), askClosed: () => call('askClosed'),
    askPresented: async (...a) => {call('askPresented',...a); return {saved:true,reason:null};},
    askSave: async () => ({saved:true,reason:null}), askSpoken: (...a) => call('askSpoken',...a),
    onAskResult: fn => {listeners.result=fn;},
  }));
  define(globalThis, '__qa', Object.freeze({
    log: () => structuredClone(log),
    reply: () => {if(!lastRequest)throw new Error('No renderer request');const {sid,rid,spoken}=lastRequest;listeners.result(sid,rid,{status:'answered',answer:{text:'SYNTHETIC QA caption about momentum, with no model or audio device involved.',model:'SYNTHETIC-NO-MODEL',latency_ms:1}},{saved:true,reason:null,speak:spoken});},
    area: (width,height) => listeners.area({x:0,y:0,width,height}),
    stop: () => listeners.stop('QA synthetic stop'),
    proof: () => ({fakeMedia:navigator.mediaDevices.getDisplayMedia===syntheticDisplay, noRealDevice:true, noRealVoice:true, noNetwork:true}),
  }));
  ipcRenderer.send('qa:preload-safe', { fakeMedia: navigator.mediaDevices.getDisplayMedia === syntheticDisplay });
} catch (error) {
  ipcRenderer.send('qa:preload-failed', String(error.stack || error));
}
