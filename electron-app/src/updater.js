const { app, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');

// Feed: generic provider membaca latest.yml / latest-mac.yml / latest-linux.yml
// dari public/downloads/ di server sendiri (dikonfigurasi di package.json > build.publish).
// Tidak perlu token — file-nya statis dan publik.

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 jam

let state = { status: 'idle', version: null, percent: null };
let onStateChange = null;
let checkTimer = null;

function setState(patch) {
  state = { ...state, ...patch };
  if (onStateChange) onStateChange(state);
}

function init(callback) {
  onStateChange = callback;

  // Auto-update butuh app terpasang (packaged) — di dev tidak ada installer
  // untuk dibandingkan, jadi lewati saja supaya tidak spam error di terminal.
  if (!app.isPackaged) {
    console.log('[Updater] Mode development — auto-update dilewati');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update tersedia:', info.version);
    setState({ status: 'downloading', version: info.version, percent: 0 });
  });

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'idle' });
  });

  autoUpdater.on('download-progress', (p) => {
    setState({ status: 'downloading', percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', version: info.version, percent: 100 });
    if (Notification.isSupported()) {
      new Notification({
        title: 'KKP Anwar KPI',
        body: `Update v${info.version} siap dipasang. Akan terpasang otomatis saat aplikasi ditutup, atau klik "Pasang Update Sekarang" di menu tray.`,
        silent: true,
      }).show();
    }
  });

  autoUpdater.on('error', (err) => {
    // Catatan macOS: build saat ini unsigned (identity: null di package.json).
    // Squirrel.Mac — mekanisme yang dipakai electron-updater di macOS — mewajibkan
    // app ditandatangani (Apple Developer ID) untuk memvalidasi paket update.
    // Tanpa sertifikat itu, pengecekan update akan berhasil tapi proses unduh/pasang
    // akan gagal di sini. Ini bukan bug — perlu beli Developer ID ($99/tahun) agar
    // auto-update macOS berfungsi penuh. Windows (NSIS) & Linux (AppImage) tidak
    // punya batasan ini dan auto-update tetap jalan meski unsigned.
    console.error('[Updater] Error:', err.message);
    setState({ status: 'error' });
  });

  checkNow();
  checkTimer = setInterval(checkNow, CHECK_INTERVAL_MS);
  checkTimer.unref?.();
}

function checkNow() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] Gagal cek update:', err.message);
  });
}

function installNow() {
  if (state.status !== 'downloaded') return;
  autoUpdater.quitAndInstall(false, true);
}

function getState() {
  return state;
}

module.exports = { init, checkNow, installNow, getState };
