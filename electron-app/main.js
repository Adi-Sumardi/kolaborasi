const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, systemPreferences, shell } = require('electron');
const path = require('path');
const store = require('./src/store');
const socketAgent = require('./src/socket-agent');
const capture = require('./src/capture');
const idleDetector = require('./src/idle-detector');

let mainWindow = null;
let tray = null;
let currentUser = null;
let serverUrl = null;

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// --- Server URL ---

// Default server URL — change this before building for production
const DEFAULT_SERVER_URL = 'http://localhost:3000';

async function getServerUrl() {
  // 1. Environment variable (for dev override)
  if (process.env.KOLABORASI_SERVER_URL) {
    return process.env.KOLABORASI_SERVER_URL;
  }

  // 2. Stored URL from previous session (user changed it)
  try {
    const stored = store.get('serverUrl');
    if (stored) return stored;
  } catch (e) {
    console.log('[Main] Store read error, clearing:', e.message);
    store.clear();
  }

  // 3. Use default URL (baked at build time)
  if (DEFAULT_SERVER_URL) {
    return DEFAULT_SERVER_URL;
  }

  // 4. Prompt user for URL (fallback)
  return await promptForServerUrl();
}

async function promptForServerUrl() {
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'question',
    title: 'KKP Anwar KPI - Setup',
    message: 'Masukkan URL server Kolaborasi:',
    detail: 'Contoh: https://kolaborasi.perusahaan.com',
    buttons: ['OK'],
  });

  // Use input dialog since showMessageBox doesn't have input
  // Fallback: create a small window for URL input
  return new Promise((resolve) => {
    const setupWindow = new BrowserWindow({
      width: 420,
      height: 250,
      resizable: false,
      maximizable: false,
      minimizable: false,
      frame: true,
      title: 'KKP Anwar KPI - Setup',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 30px; background: #f8fafc; }
          h2 { margin: 0 0 8px; font-size: 18px; color: #1e293b; }
          p { margin: 0 0 20px; font-size: 13px; color: #64748b; }
          input { width: 100%; padding: 10px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; box-sizing: border-box; outline: none; }
          input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
          button { width: 100%; margin-top: 16px; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
          button:hover { background: #1d4ed8; }
          button:disabled { background: #94a3b8; cursor: not-allowed; }
        </style>
      </head>
      <body>
        <h2>KKP Anwar KPI</h2>
        <p>Masukkan URL server untuk memulai</p>
        <input type="url" id="url" placeholder="https://kolaborasi.perusahaan.com" autofocus />
        <button id="btn" onclick="submit()" disabled>Lanjutkan</button>
        <script>
          const input = document.getElementById('url');
          const btn = document.getElementById('btn');
          input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) submit(); });
          function submit() {
            const url = input.value.trim().replace(/\\/$/, '');
            require('electron').ipcRenderer.send('setup:server-url', url);
          }
        </script>
      </body>
      </html>
    `)}`);

    ipcMain.once('setup:server-url', (_event, url) => {
      store.set('serverUrl', url);
      setupWindow.close();
      resolve(url);
    });

    setupWindow.on('closed', () => {
      resolve(null);
    });
  });
}

// --- Window & Tray ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'KKP Anwar KPI',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(serverUrl);

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing (only for karyawan/sdm with active capture)
    if (!app.isQuitting && currentUser) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle page title
  mainWindow.webContents.on('page-title-updated', (e) => {
    e.preventDefault();
    mainWindow.setTitle('KKP Anwar KPI');
  });
}

async function createTray() {
  let trayIcon;
  try {
    const iconPath = path.join(__dirname, 'build', 'tray-icon.png');
    const sharp = require('sharp');
    // Generate 16x16 @1x and 32x32 @2x for retina
    const buf1x = await sharp(iconPath).resize(16, 16).png().toBuffer();
    const buf2x = await sharp(iconPath).resize(32, 32).png().toBuffer();
    // Use @2x for retina macs
    trayIcon = nativeImage.createFromBuffer(buf2x, { scaleFactor: 2.0 });
  } catch (e) {
    console.log('[Main] Tray icon error:', e.message);
    trayIcon = createDefaultIcon();
  }

  tray = new Tray(trayIcon);

  updateTrayMenu('Menunggu login...');

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createDefaultIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 37;      // R
    canvas[i * 4 + 1] = 99;  // G
    canvas[i * 4 + 2] = 235; // B
    canvas[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu(status) {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Buka KKP Anwar KPI',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Status: ${status}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`KKP Anwar KPI - ${status}`);
}

// --- Screen Permission ---

async function checkScreenPermission() {
  if (process.platform !== 'darwin') return true;

  const status = systemPreferences.getMediaAccessStatus('screen');
  console.log(`[Main] Screen recording permission: ${status}`);

  if (status !== 'granted') {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Izin Screen Recording Diperlukan',
      message: 'Aplikasi memerlukan izin Screen Recording untuk monitoring desktop.',
      detail: 'Buka System Settings → Privacy & Security → Screen Recording → Aktifkan untuk "Electron" atau "Kolaborasi".\n\nSetelah mengaktifkan, restart aplikasi ini.',
      buttons: ['Buka System Settings', 'Nanti'],
      defaultId: 0
    });

    if (response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    return false;
  }
  return true;
}

// --- Agent Logic ---

let agentStarted = false;

async function startAgent(token, user) {
  if (!token || !user) return;

  // Prevent duplicate starts
  if (agentStarted) {
    console.log('[Main] Agent already started, skipping duplicate');
    return;
  }
  agentStarted = true;

  currentUser = user;
  const role = user.role;

  console.log(`[Main] User logged in: ${user.name || user.email} (${role})`);

  // Only start capture for karyawan/sdm
  if (role === 'karyawan' || role === 'sdm') {
    // Check screen recording permission on macOS
    await checkScreenPermission();

    const socket = socketAgent.connect(serverUrl, token);
    if (!socket) return;

    updateTrayMenu('Terhubung');

    socket.on('connect', () => {
      updateTrayMenu('Terhubung');
      console.log('[Main] Agent socket connected');
    });

    socket.on('disconnect', () => {
      updateTrayMenu('Terputus - Menghubungkan ulang...');
      capture.stopCapture();
      console.log('[Main] Agent socket disconnected');
    });

    // Handle config from server (start/stop capture)
    socketAgent.onConfig((config) => {
      if (config.fps > 0) {
        updateTrayMenu('Monitoring aktif');
        capture.startCapture(config.fps, (frameBuffer) => {
          socketAgent.emitScreenshot(frameBuffer);
        });
      } else {
        updateTrayMenu('Terhubung');
        capture.stopCapture();
      }
    });

    // Start idle detection
    idleDetector.start(
      () => socketAgent.emitIdle(),
      () => socketAgent.emitActive()
    );
  } else {
    // Admin/owner - no capture needed
    updateTrayMenu(`${user.name || user.email} (Admin)`);
    console.log('[Main] Admin user - skipping capture');
  }
}

function stopAgent() {
  console.log('[Main] Stopping agent');
  capture.stopCapture();
  idleDetector.stop();
  socketAgent.disconnect();
  currentUser = null;
  agentStarted = false;
  updateTrayMenu('Menunggu login...');
}

// --- IPC Handlers ---

ipcMain.on('auth:login', (_event, { token, user }) => {
  console.log('[Main] Received auth:login from web app');
  startAgent(token, user);
});

ipcMain.on('auth:logout', () => {
  console.log('[Main] Received auth:logout from web app');
  stopAgent();
});

// --- App Lifecycle ---

// Set app name (shows in macOS dock and menu bar)
app.setName('KKP Anwar KPI');

app.whenReady().then(async () => {
  serverUrl = await getServerUrl();

  if (!serverUrl) {
    console.log('[Main] No server URL provided, quitting');
    app.quit();
    return;
  }

  console.log(`[Main] Server URL: ${serverUrl}`);

  await createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Don't quit on window close (tray app)
});

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else if (!mainWindow) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  capture.stopCapture();
  idleDetector.stop();
  socketAgent.disconnect();
});

// Auto-start on login (Windows/Mac) - only for packaged builds
if (app.isPackaged) {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true
  });
}
