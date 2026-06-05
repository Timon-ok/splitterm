import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { CONTROL_CHANNELS } from '@shared/ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isMac = process.platform === 'darwin';

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1024,
    height: 680,
    minWidth: 480,
    minHeight: 320,
    backgroundColor: '#1E1F22', // no white flash before first paint
    show: false,
    titleBarStyle: 'hidden',
    // Native min/max/close on Windows/Linux; macOS shows traffic lights with 'hidden'.
    ...(isMac
      ? { trafficLightPosition: { x: 12, y: 11 } }
      : { titleBarOverlay: { color: '#1E1F22', symbolColor: '#CED0D6', height: 36 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep terminals rendering when unfocused
    },
  });

  win.once('ready-to-show', () => win.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
};

// Minimal control handlers. PTY + settings handlers land in M1/M3.
ipcMain.handle(CONTROL_CHANNELS.appVersion, () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
