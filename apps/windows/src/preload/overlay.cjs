// Overlay preload (sandboxed, CommonJS): the only calls the overlay page can make.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lc', {
  ready: () => ipcRenderer.invoke('lc:overlay-ready'),
  armCapture: () => ipcRenderer.invoke('lc:arm-capture'),
  sample: (s) => ipcRenderer.send('lc:sample', s),
  interactive: (on) => ipcRenderer.send('lc:interactive', Boolean(on)),
  saveInk: (doc, images) => ipcRenderer.invoke('lc:save-ink', doc, Array.isArray(images) ? images : []),
  loadResult: (id, ok, reason) => ipcRenderer.send('lc:load-result', { id: String(id), ok: ok === true, reason: String(reason ?? '') }),
  ended: (reason) => ipcRenderer.send('lc:capture-ended', String(reason)),
  stopped: (unsaved) => ipcRenderer.send('lc:stopped', unsaved == null ? null : String(unsaved)),
  onLoadDoc: (fn) => ipcRenderer.on('lc:load-doc', (_e, doc) => fn(doc)),
  onStop: (fn) => ipcRenderer.on('lc:stop', (_e, reason) => fn(reason)),
});
