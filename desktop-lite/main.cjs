/**
 * LỚP HỌC HẠNH PHÚC – BẢN CÀI ĐẶT GỌN (chạy giống hệt bản web/Vercel)
 *
 * - Không có máy chủ Express, không node_modules: chỉ mở giao diện đã build (dist/) qua giao thức nội bộ
 *   app://lhhp/ → ứng dụng tự nhận là "bản web tĩnh" (/api trả 404) và làm việc trực tiếp với
 *   Google Apps Script + thư mục Drive dùng chung, y như trên Vercel.
 * - Dữ liệu trình duyệt (localStorage/IndexedDB) lưu bền vững trong %APPDATA%/LopHocHanhPhuc.
 * - Liên kết ngoài (Drive, Zalo, YouTube…) mở bằng trình duyệt mặc định.
 */
const { app, BrowserWindow, protocol, net, shell, session, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createUpdater } = require('./updater.cjs');

const APP_SCHEME = 'app';
const APP_HOST = 'lhhp';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const BUNDLED_DIST_DIR = path.join(__dirname, 'dist');
// UI folder being served: the bundled one, or a newer one installed by the hot updater (see updater.cjs)
let DIST_DIR = BUNDLED_DIST_DIR;
let updater = null;

/** Update channel + author's public key ship inside the installer; without both, hot update stays off */
function readUpdateSettings() {
  let manifestUrl = '';
  let publicKeyPem = '';
  try { manifestUrl = String(JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'), 'utf8')).manifestUrl || '').trim(); } catch (_) { /* no channel */ }
  try { publicKeyPem = fs.readFileSync(path.join(__dirname, 'update-public-key.pem'), 'utf8'); } catch (_) { /* no key */ }
  // Only https (plain http is accepted for a local test server); the package is still signature-checked
  if (!/^https:\/\//i.test(manifestUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(manifestUrl)) manifestUrl = '';
  return { manifestUrl, publicKeyPem };
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

app.setAppUserModelId('com.lhhp.lophochanhphuc.desktop');

let mainWindow = null;

function resolveDistFile(urlPath) {
  let rel = decodeURIComponent(urlPath || '/').replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  const full = path.normalize(path.join(DIST_DIR, rel));
  if (!full.startsWith(DIST_DIR)) return null; // chặn ../
  return full;
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not Found', { status: 404 });
    // Không có máy chủ: mọi /api/* trả 404 giống bản web tĩnh
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
    let file = resolveDistFile(url.pathname);
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      const st = fs.statSync(file);
      if (st.isDirectory()) file = path.join(file, 'index.html');
    } catch (_) {
      // Đường dẫn của ứng dụng 1 trang → trả index.html (giống "rewrites" của Vercel)
      if (!path.extname(file)) file = path.join(DIST_DIR, 'index.html');
      else return new Response('Not Found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.ico');
  mainWindow = new BrowserWindow({
    title: 'Lớp Học Hạnh Phúc',
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Cửa sổ con: liên kết web → trình duyệt mặc định; cửa sổ in/xem trước (about:blank) → cho phép
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) || /^mailto:|^tel:|^zalo:/i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // F5: tải lại • F11: toàn màn hình • Ctrl+Shift+I: công cụ kiểm tra (hỗ trợ kỹ thuật)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { mainWindow.webContents.reload(); event.preventDefault(); }
    if (input.key === 'F11') { mainWindow.setFullScreen(!mainWindow.isFullScreen()); event.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') { mainWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });

  // A freshly installed UI update that cannot load → go back to the previous UI at once
  mainWindow.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame && updater && updater.reportLoadFailure()) {
      DIST_DIR = updater.activeDir();
      mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
    }
  });

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupUpdater() {
  const settings = readUpdateSettings();
  updater = createUpdater({
    userDataDir: app.getPath('userData'),
    bundledDir: BUNDLED_DIST_DIR,
    shellVersion: app.getVersion(),
    manifestUrl: settings.manifestUrl,
    publicKeyPem: settings.publicKeyPem,
    fetch: (url, init) => net.fetch(url, init),
    onState: (info) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lhhp-update:state', info); },
  });
  updater.beginStart();
  DIST_DIR = updater.activeDir();

  const fromApp = (event) => String(event.senderFrame && event.senderFrame.url || '').startsWith(APP_ORIGIN);
  ipcMain.handle('lhhp-update:info', (e) => (fromApp(e) ? updater.info() : null));
  ipcMain.handle('lhhp-update:check', (e) => (fromApp(e) ? updater.checkAndInstall() : null));
  ipcMain.handle('lhhp-update:ui-ready', (e) => { if (fromApp(e)) updater.confirmStarted(); return true; });
  // Use the downloaded UI now: flush browser storage, switch folder, reload the window (no reinstall, no app restart)
  ipcMain.handle('lhhp-update:apply', (e) => {
    if (!fromApp(e) || !mainWindow) return false;
    try { session.defaultSession.flushStorageData(); } catch (_) { /* ignore */ }
    DIST_DIR = updater.activeDir();
    mainWindow.webContents.reloadIgnoringCache();
    return true;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    setupUpdater();
    registerAppProtocol();
    // Cho phép camera (dò khuôn mặt, chụp ảnh lớp), toàn màn hình, thông báo, sao chép
    const allowed = new Set(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'clipboard-read']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
    createWindow();
    // Look for a newer UI shortly after start (never blocks opening the app; offline = keep the current UI)
    setTimeout(() => { updater.checkAndInstall().catch(() => {}); }, 8000);
    // Ghi dữ liệu trình duyệt (localStorage/IndexedDB) xuống đĩa định kỳ & khi rời cửa sổ:
    // tránh mất thao tác gần nhất nếu máy tắt đột ngột / mất điện.
    const flush = () => { try { session.defaultSession.flushStorageData(); } catch (_) { /* ignore */ } };
    setInterval(flush, 20000);
    app.on('browser-window-blur', flush);
    app.on('before-quit', flush);
  });

  app.on('window-all-closed', () => app.quit());
}
