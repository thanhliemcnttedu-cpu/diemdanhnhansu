const { app, BrowserWindow, shell, ipcMain, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, fork } = require('child_process');
const http = require('http');

let logFilePath = null;
function getLogFilePath() {
  if (!logFilePath) {
    try {
      logFilePath = path.join(app.getPath('userData'), 'electron_debug.log');
    } catch (_) {
      logFilePath = path.join(process.cwd(), 'electron_debug.log');
    }
  }
  return logFilePath;
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch (_) {}
  console.log(...args);
}

// 🛡️ BẢO VỆ TOÀN CỤC: Bắt các ngoại lệ để không bao giờ văng popup JavaScript error dialog
process.on('uncaughtException', (err) => {
  log('🛡️ [Electron Main Uncaught Exception]:', err?.stack || err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  log('🛡️ [Electron Main Unhandled Rejection]:', reason);
});

let mainWindow = null;
let serverProcess = null;
let isServerReady = false;
const PORT = 3000;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Đọc vai trò đã được lựa chọn từ bộ cài đặt CSDL_LHHP.exe (nếu có)
function getInstalledRole() {
  try {
    const possiblePaths = [
      path.join(process.resourcesPath, 'installed_role.json'),
      path.join(app.getAppPath(), 'installed_role.json'),
      path.join(path.dirname(app.getPath('exe')), 'installed_role.json'),
      path.join(__dirname, '..', 'installed_role.json')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    log('Lỗi đọc installed_role.json:', err);
  }
  return null;
}

// Tìm đường dẫn file dist/index.html vật lý hoặc trong package
function getLocalIndexPath() {
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html'),
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html')
  ];
  return candidates.find(p => fs.existsSync(p));
}

// Kiểm tra xem cổng PORT có đang chạy hay chưa
function checkServerReady(url, timeoutMs = 20000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

// Khởi chạy Backend Express Server chạy ngầm
function startBackendServer() {
  return new Promise((resolve) => {
    // Kiểm tra xem server đã chạy sẵn trên cổng 3000 chưa
    http.get(`http://localhost:${PORT}/api/database/stats`, (res) => {
      log('✅ Server đã chạy sẵn trên cổng', PORT);
      isServerReady = true;
      resolve(true);
    }).on('error', () => {
      log('⏳ Khởi động server nội bộ của Lớp Học Hạnh Phúc...');
      const roleConfig = getInstalledRole();
      const env = { 
        ...process.env, 
        NODE_ENV: 'production',
        PORT: String(PORT),
        LHHP_INSTALLED_ROLE: roleConfig ? roleConfig.role : '',
        LHHP_PACKAGED: app.isPackaged ? 'true' : 'false',
        ELECTRON_RUN_AS_NODE: '1'
      };

      // Danh sách các đường dẫn tìm kiếm compiled server.js
      const compiledServerCandidates = [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-server', 'server.js'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js'),
        path.join(process.resourcesPath, 'server.js'),
        path.join(app.getAppPath(), 'server.js'),
        path.join(__dirname, '..', 'server.js'),
        path.join(__dirname, '..', 'dist-server', 'server.js')
      ];

      const compiledServer = compiledServerCandidates.find(p => fs.existsSync(p));

      if (compiledServer) {
        log('🚀 Khởi chạy backend server production từ:', compiledServer);
        try {
          if (utilityProcess && typeof utilityProcess.fork === 'function') {
            serverProcess = utilityProcess.fork(compiledServer, [], {
              env,
              serviceName: 'lhhp-backend',
              stdio: 'pipe'
            });

            if (serverProcess.stdout) {
              serverProcess.stdout.on('data', (d) => log(`[Backend stdout]: ${d.toString().trim()}`));
            }
            if (serverProcess.stderr) {
              serverProcess.stderr.on('data', (d) => log(`[Backend stderr]: ${d.toString().trim()}`));
            }
          } else {
            serverProcess = fork(compiledServer, [], {
              env,
              stdio: 'pipe'
            });
            if (serverProcess.stdout) {
              serverProcess.stdout.on('data', (d) => log(`[Backend stdout]: ${d.toString().trim()}`));
            }
            if (serverProcess.stderr) {
              serverProcess.stderr.on('data', (d) => log(`[Backend stderr]: ${d.toString().trim()}`));
            }
          }

          if (serverProcess) {
            serverProcess.on('error', (err) => {
              log('⚠️ [Server Process Error]:', err?.message || err);
            });
            serverProcess.on('exit', (code, signal) => {
              log(`ℹ️ [Server Process Exit]: code=${code}, signal=${signal}`);
            });
          }
        } catch (forkErr) {
          log('❌ Lỗi khi khởi tạo tiến trình server:', forkErr);
        }
      } else if (!app.isPackaged) {
        // CHỈ cho phép chạy tsx/npx khi ở môi trường DEV (chưa đóng gói)
        const serverScript = path.join(__dirname, '..', 'server.ts');
        const tsxCli = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');

        try {
          if (fs.existsSync(tsxCli)) {
            serverProcess = spawn(process.execPath, [tsxCli, serverScript], {
              cwd: path.join(__dirname, '..'),
              env,
              stdio: 'ignore'
            });
          } else {
            serverProcess = spawn('npx', ['tsx', 'server.ts'], {
              cwd: path.join(__dirname, '..'),
              env,
              shell: true,
              stdio: 'ignore'
            });
          }

          if (serverProcess) {
            serverProcess.on('error', (err) => {
              log('⚠️ [Dev Server Spawn Error]:', err?.message || err);
            });
          }
        } catch (spawnErr) {
          log('❌ Ngoại lệ khi spawn dev server:', spawnErr);
        }
      } else {
        log('⚠️ Ứng dụng đã đóng gói nhưng không tìm thấy file server.js compiled!');
      }

      checkServerReady(`http://localhost:${PORT}`).then((ready) => {
        isServerReady = ready;
        if (ready) {
          log('✅ Backend server đã sẵn sàng phục vụ!');
        } else {
          log('⚠️ Server không phản hồi trong 20s, sẽ kích hoạt chế độ nạp giao diện cục bộ...');
        }
        resolve(ready);
      });
    });
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    title: 'LỚP HỌC HẠNH PHÚC - HỆ SINH THÁI GIÁO DỤC THÔNG MINH',
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Hỗ trợ bật DevTools qua F12 hoặc Ctrl+Shift+I để hỗ trợ chẩn đoán nếu cần
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Bắt lỗi kết nối trang để tự động chuyển sang chế độ file giao diện cục bộ
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log(`⚠️ [did-fail-load]: Lỗi ${errorCode} (${errorDescription}) tại ${validatedURL}`);
    if (!validatedURL.startsWith('file:')) {
      const localIndex = getLocalIndexPath();
      if (localIndex) {
        log('🔄 Đang tự động chuyển sang nạp file cục bộ:', localIndex);
        mainWindow.loadFile(localIndex);
      }
    }
  });

  // ⚡ NẠP GIAO DIỆN TỨC THÌ (< 0.5s): Ưu tiên nạp thẳng file cục bộ dist/index.html
  const localIndex = getLocalIndexPath();
  const startUrl = `http://localhost:${PORT}`;

  if (localIndex) {
    log('📁 Nạp giao diện tức thì từ file cục bộ:', localIndex);
    mainWindow.loadFile(localIndex);
  } else {
    log('🌐 Thử nạp URL:', startUrl);
    mainWindow.loadURL(startUrl).catch((err) => {
      log('⚠️ loadURL lỗi:', err?.message);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Mở liên kết ngoài bằng trình duyệt mặc định của hệ thống
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 🎯 IPC 1: Lấy vai trò cài đặt cho renderer
ipcMain.handle('get-installed-role', () => {
  return getInstalledRole();
});

// 💾 IPC 2: Tự động ghi đè file JSON vào thư mục máy tính
ipcMain.handle('save-role-file', async (event, { customPath, fileName, data }) => {
  try {
    const targetDir = customPath || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const fullPath = path.join(targetDir, fileName);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(fullPath, content, 'utf8');
    const stats = fs.statSync(fullPath);
    log(`✅ [IPC save-role-file] Đã lưu thành công: ${fullPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    return {
      success: true,
      message: `Đã ghi đè thành công tệp ${fileName}`,
      filePath: fullPath,
      sizeKb: Math.round(stats.size / 1024 * 10) / 10
    };
  } catch (err) {
    log(`❌ [IPC save-role-file] Lỗi:`, err);
    return { success: false, message: err?.message || String(err) };
  }
});

// 📂 IPC 3: Đọc file dữ liệu từ thư mục máy tính
ipcMain.handle('read-role-file', async (event, { customPath, fileName }) => {
  try {
    const targetDir = customPath || path.resolve(process.cwd(), 'data');
    const fullPath = path.join(targetDir, fileName);
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, 'utf8');
      return { success: true, data: JSON.parse(raw) };
    }
    return { success: false, message: 'File not found' };
  } catch (err) {
    return { success: false, message: err?.message || String(err) };
  }
});

// 📂 IPC 3b: Liệt kê các file dữ liệu từ thư mục máy tính (Quản trị quét lớp)
ipcMain.handle('list-role-files', async (event, { customPath } = {}) => {
  try {
    const targetDir = customPath || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(targetDir)) {
      return { success: true, files: [] };
    }
    const files = fs.readdirSync(targetDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).map(f => {
      const fullPath = path.join(targetDir, f);
      const stat = fs.statSync(fullPath);
      return {
        name: f,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    });
    return { success: true, files: jsonFiles };
  } catch (err) {
    return { success: false, message: err?.message || String(err) };
  }
});

// ☁️ IPC 4: Đồng bộ dữ liệu liên tục lên Google Drive qua Node.js fetch (bỏ qua CORS & xử lý chuẩn Redirect 302 của Apps Script)
ipcMain.handle('proxy-drive-sync', async (event, { scriptUrl, payload }) => {
  try {
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return { success: false, message: 'URL Google Apps Script không hợp lệ.' };
    }
    const cleanUrl = scriptUrl.trim();
    const postData = typeof payload === 'string' ? payload : JSON.stringify(payload);

    log(`🚀 [IPC proxy-drive-sync] Bắt đầu đồng bộ tới: ${cleanUrl.slice(0, 45)}...`);

    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: postData,
      redirect: 'follow'
    });

    const responseText = await response.text();
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch (_) {
      // Nhận diện lỗi phổ biến: Google Apps Script yêu cầu đăng nhập do chưa chọn quyền "Anyone"
      if (responseText.includes('accounts.google.com') || responseText.includes('Sign in') || responseText.includes('ServiceLogin')) {
        return {
          success: false,
          isAuthError: true,
          message: 'Google Apps Script yêu cầu đăng nhập Google. Thầy/Cô cần mở Deploy -> Manage deployments -> Chọn biểu tượng chiếc bút (Edit) -> Chỉnh "Who has access" (Ai có quyền truy cập) thành "Anyone" (Bất kỳ ai) rồi bấm Deploy lại!'
        };
      }
      return {
        success: false,
        message: 'Google Apps Script phản hồi không đúng cấu trúc JSON: ' + responseText.slice(0, 200)
      };
    }

    log(`✅ [IPC proxy-drive-sync] Kết quả từ Google Apps Script: success=${parsedResult?.success}`);
    return parsedResult;
  } catch (err) {
    log('❌ [IPC proxy-drive-sync] Ngoại lệ khi đồng bộ:', err);
    return { success: false, message: 'Không thể kết nối đến máy chủ Google Apps Script: ' + (err?.message || String(err)) };
  }
});

// 🔍 IPC 5: Kiểm tra kết nối Ping tới Google Apps Script (GET)
ipcMain.handle('proxy-drive-ping', async (event, { scriptUrl }) => {
  try {
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return { success: false, message: 'Chưa điền URL Web App của Google Apps Script.' };
    }
    const cleanUrl = scriptUrl.trim();
    const targetUrl = cleanUrl.includes('?') ? `${cleanUrl}&action=ping` : `${cleanUrl}?action=ping`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data;
    } catch (_) {
      if (text.includes('accounts.google.com') || text.includes('Sign in') || text.includes('ServiceLogin')) {
        return {
          success: false,
          isAuthError: true,
          message: 'Google Apps Script yêu cầu đăng nhập Google. Thầy/Cô cần mở Deploy -> Manage deployments -> Chỉnh "Who has access" (Ai có quyền truy cập) thành "Anyone" (Bất kỳ ai).'
        };
      }
      return {
        success: false,
        message: 'Google Apps Script trả về nội dung không hợp lệ: ' + text.slice(0, 150)
      };
    }
  } catch (err) {
    return { success: false, message: 'Lỗi kiểm tra kết nối: ' + (err?.message || String(err)) };
  }
});

// 📥 IPC 6: Kéo dữ liệu từ Google Drive qua Google Apps Script (GET)
ipcMain.handle('proxy-drive-pull', async (event, { scriptUrl, folderId, fileName }) => {
  try {
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return { success: false, message: 'Thiếu scriptUrl' };
    }
    const cleanUrl = scriptUrl.trim();
    const targetFile = fileName || 'du_lieu_lop_hoc_hanh_phuc.json';
    const targetUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getLatest&folderId=${encodeURIComponent(String(folderId || ''))}&fileName=${encodeURIComponent(targetFile)}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data;
    } catch (_) {
      return { success: false, message: 'Dữ liệu trả về không đúng định dạng JSON: ' + text.slice(0, 150) };
    }
  } catch (err) {
    return { success: false, message: 'Lỗi kéo dữ liệu: ' + (err?.message || String(err)) };
  }
});

// 🏛️ IPC 7: Tổng hợp báo cáo toàn trường cho Ban Giám Hiệu (GET)
ipcMain.handle('proxy-drive-aggregate', async (event, { scriptUrl, folderId, date }) => {
  try {
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return { success: false, message: 'Thiếu scriptUrl' };
    }
    const cleanUrl = scriptUrl.trim();
    const dateStr = String(date || new Date().toISOString().slice(0, 10));
    const targetUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=aggregateAllClasses&folderId=${encodeURIComponent(String(folderId || ''))}&date=${encodeURIComponent(dateStr)}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data;
    } catch (_) {
      return { success: false, message: 'Dữ liệu tổng hợp không đúng định dạng JSON: ' + text.slice(0, 150) };
    }
  } catch (err) {
    return { success: false, message: 'Lỗi tổng hợp số liệu: ' + (err?.message || String(err)) };
  }
});

// Single Instance Lock: Đảm bảo chỉ có 1 cửa sổ phần mềm chạy cùng lúc
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    log('🚀 Electron app.whenReady() đã kích hoạt');
    createWindow();
    startBackendServer().catch(err => log('⚠️ Backend server error:', err));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (serverProcess) {
        try {
          if (typeof serverProcess.kill === 'function') {
            serverProcess.kill();
          }
        } catch (_) {}
      }
      app.quit();
    }
  });
}
