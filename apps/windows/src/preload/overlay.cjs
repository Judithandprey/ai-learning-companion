// Overlay preload (sandboxed, CommonJS): the only calls the overlay page can make.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lc', {
  ready: () => ipcRenderer.invoke('lc:overlay-ready'),
  armCapture: () => ipcRenderer.invoke('lc:arm-capture'),
  retainFrame: (facts, raw, composed, ink) => ipcRenderer.invoke('lc:retain-frame', facts, raw, composed ?? null, ink ?? null),
  notRetained: (run) => ipcRenderer.send('lc:not-retained', run),
  observationGap: (gap) => ipcRenderer.send('lc:observation-gap', gap),
  stopping: (pending) => ipcRenderer.send('lc:stopping', Array.isArray(pending) ? pending : []),
  sample: (s) => ipcRenderer.send('lc:sample', s),
  interactive: (on) => ipcRenderer.send('lc:interactive', Boolean(on)),
  saveInk: (doc, images) => ipcRenderer.invoke('lc:save-ink', doc, Array.isArray(images) ? images : []),
  loadResult: (id, ok, reason) => ipcRenderer.send('lc:load-result', { id: String(id), ok: ok === true, reason: String(reason ?? '') }),
  ended: (reason) => ipcRenderer.send('lc:capture-ended', String(reason)),
  stopped: (unsaved) => ipcRenderer.send('lc:stopped', unsaved == null ? null : String(unsaved)),
  onLoadDoc: (fn) => ipcRenderer.on('lc:load-doc', (_e, doc) => fn(doc)),
  onStop: (fn) => ipcRenderer.on('lc:stop', (_e, reason) => fn(reason)),
  // ASK with the AI's session: a circle is kept with the whole frame it is on (and a small hint asked for at once,
  // when the session runs); a follow-up is sent only by askSubmit, with a fresh whole frame.
  askSelection: (facts, png, ink) => ipcRenderer.invoke('lc:ask-selection', facts, png, ink ?? null),
  askSubmit: (selectionId, question, assistance, facts, png, ink) => ipcRenderer.invoke('lc:ask-submit', String(selectionId), String(question), String(assistance), facts, png, ink ?? null),
  onLive: (fn) => ipcRenderer.on('lc:live', (_e, live) => fn(live)),
  askCancel: (selectionId) => ipcRenderer.send('lc:ask-cancel', String(selectionId)),
  askClosed: () => ipcRenderer.send('lc:ask-closed'),
  askPresented: (selectionId, requestId, shown) => ipcRenderer.invoke('lc:ask-presented', String(selectionId), String(requestId), shown === true),
  askSave: (selectionId) => ipcRenderer.invoke('lc:ask-save', String(selectionId)),
  // A response read aloud: the page says only which piece of the current response is next. The main process owns
  // the voice, the text, the language, the rate and the output.
  talk: (on, muted) => ipcRenderer.send('lc:talk', on === true, muted === true),
  say: (selectionId, requestId, at) => ipcRenderer.invoke('lc:say', String(selectionId), String(requestId), Number(at)),
  hush: () => ipcRenderer.send('lc:hush'),
  // Where the movable surfaces are, and the speech rate: kept by the main process, per display.
  place: (surface, place) => ipcRenderer.invoke('lc:place', String(surface), { fx: Number(place?.fx), fy: Number(place?.fy) }),
  speechRate: (rate) => ipcRenderer.invoke('lc:speech-rate', Number(rate)),
  onWorkArea: (fn) => ipcRenderer.on('lc:work-area', (_e, area) => fn(area)),
  onAskResult: (fn) => ipcRenderer.on('lc:ask-result', (_e, selectionId, requestId, outcome, record) => fn(selectionId, requestId, outcome, record)),
});
