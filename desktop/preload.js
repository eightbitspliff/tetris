// Exposes a small, safe API to the game as window.DesktopBridge (see js/main.js).
const { contextBridge, ipcRenderer } = require('electron');

let fullscreen = ipcRenderer.sendSync('is-fullscreen');
ipcRenderer.on('fullscreen-changed', (_event, value) => { fullscreen = value; });

contextBridge.exposeInMainWorld('DesktopBridge', {
  isFullscreen: () => fullscreen,
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  quit: () => ipcRenderer.send('quit'),
});
