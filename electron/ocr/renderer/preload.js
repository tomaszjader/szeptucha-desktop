const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ocr', {
  platform: process.platform,
  capture: () => ipcRenderer.send('capture'),
  select: rect => ipcRenderer.send('selection', rect),
  cancel: () => ipcRenderer.send('cancel'),
  imageReady: success => ipcRenderer.send('image-ready', success),
  copy: () => ipcRenderer.send('copy'),
  clear: () => ipcRenderer.send('clear'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  copyHistory: id => ipcRenderer.send('copy-history', id),
  restoreHistory: id => ipcRenderer.send('restore-history', id),
  deleteHistory: id => ipcRenderer.send('delete-history', id),
  clearHistory: () => ipcRenderer.send('clear-history'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: settings => ipcRenderer.send('set-settings', settings),
  getStatus: () => ipcRenderer.invoke('get-status'),
  onStatus: callback => ipcRenderer.on('status', (_event, data) => callback(data)),
  onImage: callback => ipcRenderer.on('capture-image', (_event, data) => callback(data))
});
