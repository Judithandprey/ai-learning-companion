// Control window preload (sandboxed, CommonJS): the only calls the control page can make.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lc', {
  listDisplays: () => ipcRenderer.invoke('lc:list-displays'),
  sessionState: () => ipcRenderer.invoke('lc:session-state'),
  start: (sourceId) => ipcRenderer.invoke('lc:start', String(sourceId)),
  stop: () => ipcRenderer.invoke('lc:stop'),
  listInk: () => ipcRenderer.invoke('lc:list-ink'),
  openInk: (id) => ipcRenderer.invoke('lc:open-ink', String(id)),
  onSession: (fn) => ipcRenderer.on('lc:session', (_e, s) => fn(s)),
  onSample: (fn) => ipcRenderer.on('lc:sample', (_e, s) => fn(s)),
  onInkSaved: (fn) => ipcRenderer.on('lc:ink-saved', () => fn()),
});
