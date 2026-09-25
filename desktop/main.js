// Neon Tetris – Windows desktop app (Electron).
// Starts in fullscreen; F11 or Alt+Enter (handled in js/main.js) toggles it. Xbox controllers work through the
// Chromium Gamepad API (XInput), including rumble.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    fullscreen: true,
    show: false,
    title: 'Neon Tetris',
    backgroundColor: '#05060f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'game', 'index.html'));

  const sendFullscreen = () => win.webContents.send('fullscreen-changed', win.isFullScreen());
  win.on('enter-full-screen', sendFullscreen);
  win.on('leave-full-screen', sendFullscreen);

  // The game never opens other pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('closed', () => { win = null; });
}

ipcMain.on('toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('is-fullscreen', event => { event.returnValue = !!win && win.isFullScreen(); });
ipcMain.on('quit', () => app.quit());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
