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
  inkContexts: (id) => ipcRenderer.invoke('lc:ink-contexts', String(id)),
  recoveries: () => ipcRenderer.invoke('lc:recoveries'),
  retryRecovery: (id) => ipcRenderer.invoke('lc:retry-recovery', String(id)),
  exportRecovery: (id) => ipcRenderer.invoke('lc:export-recovery', String(id)),
  discardRecovery: (id) => ipcRenderer.invoke('lc:discard-recovery', String(id)),
  onRecoveries: (fn) => ipcRenderer.on('lc:recoveries', (_e, list) => fn(list)),
  onCloseHeld: (fn) => ipcRenderer.on('lc:close-held', () => fn()),
  onRetention: (fn) => ipcRenderer.on('lc:retention', (_e, r) => fn(r)),
});
