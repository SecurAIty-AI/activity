const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let tray = null;
const PORT = 3400;

// ─── Backend Management ──────────────────────────────────────────

function startBackend() {
  const serverPath = path.join(__dirname, '..', 'dist', 'server.js');
  
  backendProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[backend]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('[backend]', data.toString().trim());
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    // Auto-restart on crash
    if (code !== 0 && code !== null) {
      console.log('Restarting backend in 2 seconds...');
      setTimeout(startBackend, 2000);
    }
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// ─── Wait for backend to be ready ────────────────────────────────

function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const http = require('http');
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Backend failed to start'));
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Backend failed to start'));
        }
      });
      req.end();
    };
    check();
  });
}

// ─── Window ──────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Activity by SecurAIty',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Tray ────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    tray = new Tray(icon);
  } catch (e) {
    // No tray icon file — skip tray
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: `Proxy: localhost:${PORT}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Activity by SecurAIty');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
    else createWindow();
  });
}

// ─── App Menu ────────────────────────────────────────────────────

function createMenu() {
  const template = [
    {
      label: 'Activity by SecurAIty',
      submenu: [
        { label: 'About Activity', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' }
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' }, { role: 'close' }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ───────────────────────────────────────────────

app.whenReady().then(async () => {
  createMenu();
  startBackend();

  try {
    await waitForBackend();
  } catch (e) {
    dialog.showErrorBox('Startup Error', 'The backend server failed to start. Please restart the app.');
    app.quit();
    return;
  }

  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  stopBackend();
});

// ─── IPC Handlers ────────────────────────────────────────────────

ipcMain.handle('get-port', () => PORT);
ipcMain.handle('get-version', () => app.getVersion());
