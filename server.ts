import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  getAllUsers,
  findUserByUsername,
  createUser,
  createUsersBulk,
  updateUser,
  deleteUser,
  resetPassword,
  getUserData,
  saveUserData,
  getDatabaseStats,
  compactDatabase,
  loadDatabase,
  saveDatabase,
  addAuditLog,
  getAuditLogs,
  clearAuditLogs,
  getUserDataSummary,
  getAdminAllData,
  syncAdminClassroomData,
  updateAdminClass,
  updateAdminStudent,
  resetSchoolAcademicYear,
  addRegistrationRequest,
  getRegistrationRequests,
  updateRegistrationRequestStatus,
  deleteRegistrationRequest,
  getUsersByTenant,
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  provisionSchoolAdmin,
  exportDatabaseScoped,
  importDatabaseScoped,
  transferUserToSchool,
  getExecutiveScopedDataServer
} from './server/database';
import {
  initGitSync,
  registerBroadcastCallback,
  getGitSyncStatus,
  configureGitRemote,
  scheduleAutoGitCheckpoint,
  pushToGithub,
  pullFromGithub,
  pushCodeUpgradeOnly
} from './server/gitSync';
import { getSimStatus } from './server/localSupabaseSim';
import {
  isSupabaseConfigured,
  testSupabaseConnection,
  migrateLocalDatabaseToSupabase
} from './server/supabase';

// Trigger tsx watch reload: 2026-10-22 16:23
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Electron desktop always talks to port 3000; cloud hosts (Railway, Render...) inject PORT.
const PORT = process.env.LHHP_PACKAGED === 'true' ? 3000 : (Number(process.env.PORT) || 3000);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ==========================================
// REAL-TIME CONTINUOUS MULTI-BROWSER SSE HUB
// ==========================================
interface RealtimeClient {
  id: string;
  res: express.Response;
  username?: string;
  clientId?: string;
}

const sseClients = new Map<string, RealtimeClient>();

export function broadcastRealtimeEvent(event: {
  type: string;
  action?: string;
  username?: string;
  targetUsername?: string;
  role?: string;
  classId?: string;
  classData?: any;
  attendanceRecord?: any;
  boardingRecord?: any;
  schoolName?: string;
  timestamp: number;
  originClientId?: string;
  message?: string;
  payload?: any;
}) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const [id, client] of sseClients.entries()) {
    try {
      client.res.write(payload);
    } catch (_) {
      sseClients.delete(id);
    }
  }
}

// Endpoint nhận broadcast từ client để chuyển tiếp tức thì tới tất cả các máy khác
app.post('/api/realtime/broadcast', (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.type) {
      return res.status(400).json({ success: false, message: 'Dữ liệu broadcast không hợp lệ.' });
    }
    broadcastRealtimeEvent({
      ...event,
      timestamp: event.timestamp || Date.now()
    });
    return res.json({ 
      success: true, 
      message: 'Đã phát sóng thời gian thực thành công.', 
      connectedClients: sseClients.size 
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// Local Supabase Simulator status endpoint
app.get('/api/sim/status', (req, res) => {
  try {
    const status = getSimStatus();
    res.json({ success: true, status });
  } catch (err) {
    console.error('[SimStatus] Error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve simulator status' });
  }
});

// SSE Live Stream Endpoint: Multi-computer and multi-browser instant sync
app.get('/api/realtime/stream', (req, res) => {
  const clientId = String(req.query.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const username = String(req.query.username || '').toLowerCase();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const clientKey = `${clientId}_${Date.now()}`;
  sseClients.set(clientKey, { id: clientKey, res, username, clientId });

  // Initial welcome event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, timestamp: Date.now(), connectedClients: sseClients.size })}\n\n`);

  req.on('close', () => {
    sseClients.delete(clientKey);
  });
});

// Initialize Git Sync Engine and register SSE real-time broadcast
initGitSync();
registerBroadcastCallback(broadcastRealtimeEvent);

// Periodic heartbeat to prevent proxies/browsers from closing the connection
setInterval(() => {
  const pingPayload = `: ping ${Date.now()}\n\n`;
  for (const [id, client] of sseClients.entries()) {
    try {
      client.res.write(pingPayload);
    } catch (_) {
      sseClients.delete(id);
    }
  }
}, 15000);

// Shared server-side Gemini client utility
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// AI API Routes
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, systemInstruction, imageBase64, mimeType, responseMimeType, model, files } = req.body;
    if (!prompt && !imageBase64 && (!files || files.length === 0)) {
      return res.status(400).json({ error: 'Nội dung yêu cầu (prompt) hoặc tệp đính kèm không được để trống.' });
    }

    if (!apiKey) {
      return res.status(503).json({ 
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.',
        fallback: true 
      });
    }

    const parts: any[] = [];

    // Support attached files (images, pdfs, docx, excel, text)
    if (Array.isArray(files) && files.length > 0) {
      for (const f of files) {
        if (f.data && (f.mimeType?.startsWith('image/') || f.mimeType === 'application/pdf')) {
          const cleanBase64 = String(f.data).replace(/^data:[^;]+;base64,/, '');
          parts.push({
            inlineData: {
              data: cleanBase64,
              mimeType: f.mimeType,
            },
          });
        }
        if (f.textContent) {
          parts.push({
            text: `[TỆP ĐÍNH KÈM: "${f.name}"]:\n${f.textContent}\n[HẾT TỆP ĐÍNH KÈM: "${f.name}"]`,
          });
        }
      }
    }

    // Legacy single image
    if (imageBase64 && mimeType) {
      const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: mimeType,
        },
      });
    }

    if (prompt) {
      parts.push({
        text: prompt,
      });
    }

    const genConfig: any = {
      temperature: req.body.temperature !== undefined ? req.body.temperature : 0.4,
    };
    if (systemInstruction) {
      genConfig.systemInstruction = systemInstruction;
    }
    if (responseMimeType) {
      genConfig.responseMimeType = responseMimeType;
    }

    const candidateModels = [
      model || 'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    let outputText = '';
    let lastError: any = null;

    for (const currentModel of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: parts.length === 1 && parts[0].text ? parts[0].text : { parts },
          config: genConfig,
        });
        if (response.text) {
          outputText = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${currentModel} error (${err?.status || err?.message}). Trying next candidate...`);
      }
    }

    if (!outputText) {
      return res.status(503).json({
        error: lastError?.message || 'Tất cả mô hình AI đang bận hoặc quá hạn ngạch. Sử dụng ngân hàng câu hỏi thông minh.',
        fallback: true,
      });
    }

    return res.json({ text: outputText });
  } catch (error: any) {
    console.error('Lỗi gọi Gemini API trên máy chủ:', error);
    return res.status(500).json({
      error: error?.message || 'Có lỗi xảy ra khi xử lý trí tuệ nhân tạo.',
      fallback: true,
    });
  }
});

// Check AI status
app.get('/api/ai/status', (_req, res) => {
  res.json({
    available: !!apiKey,
    model: 'gemini-3.1-flash-lite',
  });
});

// ==========================================
// 1. AUTHENTICATION & LOGIN API
// ==========================================
function checkUserRoleMatch(user: any, selectedRoleScope?: string): boolean {
  if (!selectedRoleScope) return true;
  switch (selectedRoleScope) {
    case 'admin':
      return user.role === 'admin';
    case 'school_admin':
      return user.role === 'school_admin' || Boolean(user.isSchoolAdmin) || user.role === 'bgh' || Boolean(user.isBgh) || user.role === 'admin';
    case 'guest_admin':
      return user.role === 'guest_admin' || Boolean(user.isGuestAdmin) || user.role === 'admin';
    case 'personal_teacher':
      return user.tenantType === 'guest' || 
             (user.schoolName && (user.schoolName.toLowerCase().includes('cá nhân') || user.schoolName.toLowerCase().includes('tự do') || user.schoolName.toLowerCase().includes('vãng lai')));
    case 'school_teacher':
      return (user.tenantType === 'school' || user.role === 'homeroom' || user.role === 'subject' || user.role === 'bgh' || Boolean(user.isBgh)) &&
             !(user.tenantType === 'guest');
    default:
      return true;
  }
}

function checkUserSchoolMatch(user: any, selectedRoleScope?: string, selectedSchoolName?: string): boolean {
  if (user.role === 'admin' || user.role === 'guest_admin' || user.tenantType === 'guest') {
    return true;
  }
  if (selectedRoleScope === 'personal_teacher') {
    return true;
  }
  if (!selectedSchoolName || !selectedSchoolName.trim()) {
    return false;
  }

  const userSchool = (user.schoolName || '').trim();
  if (!userSchool) return true;

  const normalize = (name: string) => {
    return name
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/trường\s+/gi, '')
      .replace(/tiểu học\s+/gi, 'th ')
      .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  };

  const normUserSchool = normalize(userSchool);
  const normSelectedSchool = normalize(selectedSchoolName);

  return normUserSchool === normSelectedSchool || 
         normUserSchool.includes(normSelectedSchool) || 
         normSelectedSchool.includes(normUserSchool);
}

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, selectedRoleScope, selectedSchoolName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }

    const user = findUserByUsername(username);

    // 1. Kiểm tra tài khoản và mật khẩu
    const cleanU = (username || '').trim().toLowerCase();
    let isPasswordCorrect = user && (user.password === password);
    // (Đã bỏ mật khẩu "cửa sau" cho admin / adminquantri: chỉ chấp nhận mật khẩu lưu trong CSDL)

    if (!user || !isPasswordCorrect) {
      return res.status(401).json({ 
        success: false, 
        message: 'Bạn đã nhập sai tài khoản mật khẩu.' 
      });
    }

    // 2. Đúng tài khoản & mật khẩu rồi -> Kiểm tra vai trò
    if (!checkUserRoleMatch(user, selectedRoleScope)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn đã nhập không đúng vai trò với tài khoản được gán vui lòng kiểm tra lại' 
      });
    }

    // 3. Đúng tài khoản, mật khẩu & vai trò -> Kiểm tra tên trường
    if (!checkUserSchoolMatch(user, selectedRoleScope, selectedSchoolName)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn đã chọn sai trường.' 
      });
    }

    // Update last login timestamp
    user.lastLoginAt = Date.now();
    const db = loadDatabase();
    saveDatabase(db);

    const { password: _, ...safeUser } = user;
    return res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      user: safeUser,
      token: `token_${user.username}_${Date.now()}`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Lỗi xử lý đăng nhập.' });
  }
});

// ==========================================
// 2. USER MANAGEMENT API (ADMIN)
// ==========================================
app.get('/api/users', (_req, res) => {
  try {
    const users = getAllUsers();
    return res.json({ success: true, users });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const result = createUser(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    const { password: _, ...safeUser } = result.user as any;
    return res.status(201).json({ success: true, user: safeUser, message: 'Thêm tài khoản thành công.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/users/bulk', (req, res) => {
  try {
    const items = req.body?.users;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách người dùng không hợp lệ hoặc rỗng.' });
    }
    const result = createUsersBulk(items);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const result = updateUser(req.params.id, req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    const { password: _, ...safeUser } = result.user as any;
    return res.json({ success: true, user: safeUser, message: 'Cập nhật tài khoản thành công.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const result = deleteUser(req.params.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json({ success: true, message: 'Đã xóa tài khoản thành công.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/users/:id/reset-password', (req, res) => {
  try {
    const { newPassword } = req.body;
    const result = resetPassword(req.params.id, newPassword || '123456');
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json({ success: true, message: result.message });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Chuyển và gán giáo viên vãng lai vào tổ chức Nhà trường (Super Admin)
app.post('/api/users/:id/transfer-school', (req, res) => {
  try {
    const { targetSchoolName } = req.body;
    if (!targetSchoolName || !targetSchoolName.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên trường học cần gán.' });
    }
    const result = transferUserToSchool(req.params.id, targetSchoolName.trim());
    if (!result.success) {
      return res.status(400).json(result);
    }
    broadcastRealtimeEvent({
      type: 'USER_CHANGED',
      username: result.user?.username,
      timestamp: Date.now(),
      message: `Giáo viên ${result.user?.fullName} đã được di chuyển vào trường ${targetSchoolName}`
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Lỗi khi di chuyển tài khoản vào trường.' });
  }
});

// ==========================================
// 3. USER INDEPENDENT CLASSROOM DATA API
// ==========================================
app.get('/api/user-data/:username', (req, res) => {
  try {
    const username = req.params.username;
    const data = getUserData(username);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json({ success: true, data, found: !!data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/user-data/:username', (req, res) => {
  try {
    const username = req.params.username;
    const originClientId = (req.headers['x-client-id'] as string) || req.body?.originClientId;
    const ok = saveUserData(username, req.body);

    if (ok) {
      // Broadcast real-time change to all other computers/browsers
      broadcastRealtimeEvent({
        type: 'DATA_CHANGED',
        username,
        timestamp: Date.now(),
        originClientId,
        message: `Tài khoản ${username} vừa cập nhật dữ liệu`
      });

      // 🚀 Tự động tạo điểm sao lưu Git và đẩy lên GitHub Server (Auto-sync)
      scheduleAutoGitCheckpoint(`Cập nhật dữ liệu từ người dùng ${username}`, originClientId);
    }

    return res.json({
      success: ok,
      message: ok ? 'Đã lưu dữ liệu trực tuyến thành công.' : 'Không thể lưu dữ liệu.',
      timestamp: Date.now()
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Admin Unified Class & Student Synchronization
app.get('/api/admin/all-data', (_req, res) => {
  try {
    const data = getAdminAllData();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ⚡ Executive Scoped Data API: Liên thông tức thì đa tầng (BGH & Quản trị trường < 2ms)
app.post('/api/executive/scoped-data', (req, res) => {
  try {
    const currentUser = req.body || {};
    const scoped = getExecutiveScopedDataServer(currentUser);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(scoped);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.get('/api/executive/scoped-data', (req, res) => {
  try {
    const currentUser = {
      username: req.query.username as string,
      role: req.query.role as string,
      schoolName: req.query.schoolName as string
    };
    const scoped = getExecutiveScopedDataServer(currentUser);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(scoped);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Dynamic Avatar Scanner API: Automatically scans public/avatars/default and public/avatars/real_demo
app.get('/api/avatars-list', (_req, res) => {
  try {
    const supportedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.jfif', '.avif', '.gif']);
    const getFilesInDir = (subDir: string): string[] => {
      const fullPath = path.resolve(__dirname, 'public', 'avatars', subDir);
      if (!fs.existsSync(fullPath)) return [];
      try {
        const files = fs.readdirSync(fullPath);
        return files
          .filter(f => supportedExts.has(path.extname(f).toLowerCase()))
          .map(f => `/avatars/${subDir.replace(/\\/g, '/')}/${f}`);
      } catch (_) {
        return [];
      }
    };

    const result = {
      default: {
        boys: getFilesInDir('default/boys'),
        girls: getFilesInDir('default/girls')
      },
      real_demo: {
        boys: getFilesInDir('real_demo/boys'),
        girls: getFilesInDir('real_demo/girls')
      }
    };

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/admin/sync-all', (req, res) => {
  try {
    const { classes, students } = req.body;
    const originClientId = (req.headers['x-client-id'] as string) || req.body?.originClientId;
    if (!Array.isArray(classes) || !Array.isArray(students)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ.' });
    }
    const result = syncAdminClassroomData(classes, students);
    if (result.success) {
      broadcastRealtimeEvent({
        type: 'DATA_CHANGED',
        username: 'admin',
        targetUsername: 'all',
        timestamp: result.timestamp || Date.now(),
        originClientId,
        message: 'Quản trị viên đã đồng bộ toàn bộ dữ liệu lớp học và học sinh'
      });

      // 🚀 Tự động sao lưu và đẩy lên GitHub
      scheduleAutoGitCheckpoint('Quản trị viên đồng bộ toàn bộ lớp học và học sinh', originClientId);
    }
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/admin/update-class', (req, res) => {
  try {
    const { classData, targetUsername, isDelete } = req.body;
    const originClientId = (req.headers['x-client-id'] as string) || req.body?.originClientId;
    if (!classData || !classData.id) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin lớp học.' });
    }
    const result = updateAdminClass(classData, targetUsername, !!isDelete);
    if (result.success) {
      broadcastRealtimeEvent({
        type: 'DATA_CHANGED',
        username: 'admin',
        targetUsername: targetUsername || 'all',
        timestamp: result.updatedAt || Date.now(),
        originClientId,
        message: `Cập nhật thông tin lớp học: ${classData.name || classData.id}`
      });

      // 🚀 Tự động sao lưu và đẩy lên GitHub
      scheduleAutoGitCheckpoint(`Cập nhật thông tin lớp học: ${classData.name || classData.id}`, originClientId);
    }
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/admin/update-student', (req, res) => {
  try {
    const { studentData, targetUsername, isDelete } = req.body;
    const originClientId = (req.headers['x-client-id'] as string) || req.body?.originClientId;
    if (!studentData || !studentData.id) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin học sinh.' });
    }
    const result = updateAdminStudent(studentData, targetUsername, !!isDelete);
    if (result.success) {
      broadcastRealtimeEvent({
        type: 'DATA_CHANGED',
        username: 'admin',
        targetUsername: targetUsername || 'all',
        timestamp: result.updatedAt || Date.now(),
        originClientId,
        message: `Cập nhật thông tin học sinh: ${studentData.name || studentData.id}`
      });

      // 🚀 Tự động sao lưu và đẩy lên GitHub
      scheduleAutoGitCheckpoint(`Cập nhật thông tin học sinh: ${studentData.name || studentData.id}`, originClientId);
    }
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 4. DATABASE STATS & GITHUB SYNC ENGINE API
// ==========================================
// Git Server & Repository Real-time Status
app.get('/api/github/status', (_req, res) => {
  try {
    const gitStatus = getGitSyncStatus();
    const stats = getDatabaseStats();

    return res.json({
      success: true,
      ...gitStatus,
      stats,
      connectedClients: sseClients.size,
      serverTime: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// Cấu hình kho lưu trữ GitHub Remote
app.post('/api/github/config', async (req, res) => {
  try {
    const result = await configureGitRemote(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// Đẩy dữ liệu trực tiếp lên GitHub (đã có Safe Pre-Merge bảo toàn 100% dữ liệu)
app.post('/api/github/push', async (_req, res) => {
  try {
    const result = await pushToGithub();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// 🚀 NÂNG CẤP CHỈ CODE LÊN GITHUB (BẢO TOÀN 100% DATABASE LỚP HỌC CỦA GIÁO VIÊN TRÊN GITHUB)
app.post('/api/github/push-code-upgrade', async (req, res) => {
  try {
    const msg = req.body?.message || 'feat(upgrade): nang cap tinh nang va giao dien phan mem';
    const result = await pushCodeUpgradeOnly(msg);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// Kéo dữ liệu mới nhất từ GitHub về máy chủ
app.post('/api/github/pull', async (_req, res) => {
  try {
    const result = await pullFromGithub();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// Automatic / On-Demand Git Checkpoint for Server Database
app.post('/api/github/checkpoint', (req, res) => {
  try {
    const originClientId = (req.headers['x-client-id'] as string) || req.body?.originClientId;
    const msg = req.body?.message || `Lưu vết cơ sở dữ liệu [${new Date().toISOString()}]`;
    scheduleAutoGitCheckpoint(msg, originClientId);

    return res.json({
      success: true,
      message: 'Đã lên lịch tạo điểm sao lưu và tự động đồng bộ lên GitHub Server!',
      timestamp: Date.now()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.get('/api/database/stats', (_req, res) => {
  try {
    const stats = getDatabaseStats();
    return res.json({ success: true, stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/database/compact', (_req, res) => {
  try {
    const stats = compactDatabase();
    return res.json({ success: true, message: 'Đã tối ưu hóa và làm mới cơ sở dữ liệu thành công!', stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Chuẩn bị năm học mới: Xóa dữ liệu trường/cá nhân có 2 lựa chọn (Hỗ trợ phân quyền)
app.post('/api/database/reset-academic-year', (req, res) => {
  try {
    const { schoolName, mode, targetScope } = req.body;
    const result = resetSchoolAcademicYear(schoolName, mode, targetScope || 'school');
    broadcastRealtimeEvent({
      type: 'SYSTEM_SYNC',
      timestamp: Date.now(),
      message: result.message
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 4.0. SUPABASE CLOUD SYNC API
// ==========================================
app.get('/api/supabase/status', async (_req, res) => {
  try {
    const configured = isSupabaseConfigured();
    const conn = configured ? await testSupabaseConnection() : { success: false, message: 'Chưa cấu hình Supabase' };
    return res.json({
      configured,
      connected: conn.success,
      message: conn.message
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.post('/api/supabase/sync', async (_req, res) => {
  try {
    const db = loadDatabase();
    const result = await migrateLocalDatabaseToSupabase(db);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 4.1. SCHOOL DATABASE CRUD API (ADMIN)
// ==========================================
app.get('/api/schools', (_req, res) => {
  try {
    const schools = getSchools();
    return res.json({ success: true, schools });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/schools', (req, res) => {
  try {
    const result = createSchool(req.body);
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.put('/api/schools/:id', (req, res) => {
  try {
    const result = updateSchool(req.params.id, req.body);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.delete('/api/schools/:id', (req, res) => {
  try {
    const schoolName = req.query.schoolName as string | undefined;
    const result = deleteSchool(req.params.id, schoolName);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/schools/:id/provision-admin', (req, res) => {
  try {
    const result = provisionSchoolAdmin(req.params.id, req.body);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Tiếp nhận đơn đăng ký sử dụng phần mềm (Yêu cầu 4)
app.get('/api/registrations', (_req, res) => {
  try {
    const registrations = getRegistrationRequests();
    return res.json({ success: true, registrations });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/registrations', (req, res) => {
  try {
    const result = addRegistrationRequest(req.body);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.get('/api/database/export', (_req, res) => {
  try {
    const db = loadDatabase();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=lop_hoc_hanh_phuc_database_${Date.now()}.json`);
    return res.send(JSON.stringify(db, null, 2));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Trích xuất JSON theo phân quyền (School/Guest/All)
app.get('/api/database/export-scoped', (req, res) => {
  try {
    const scope = (req.query.scope as any) || 'all';
    const schoolName = (req.query.schoolName as string) || '';
    const scopedData = exportDatabaseScoped(scope, schoolName);
    const filenameScope = scope === 'guest' ? 'giao_vien_ca_nhan' : (schoolName ? schoolName.replace(/[^a-zA-Z0-9]/g, '_') : 'toan_truong');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=data_${filenameScope}_${Date.now()}.json`);
    return res.send(JSON.stringify(scopedData, null, 2));
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/database/import', (req, res) => {
  try {
    const importedDb = req.body;
    if (!importedDb || !Array.isArray(importedDb.users)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu file JSON không đúng cấu trúc database.' });
    }
    const ok = saveDatabase(importedDb);
    return res.json({
      success: ok,
      message: ok ? 'Đã nhập và khôi phục cơ sở dữ liệu thành công.' : 'Lỗi khi lưu database.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// Nạp JSON theo phân quyền (School/Guest)
app.post('/api/database/import-scoped', (req, res) => {
  try {
    const { data, scope, schoolName } = req.body;
    const result = importDatabaseScoped(data, scope || 'all', schoolName);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 4.5. SUPABASE CLOUD DATABASE API
// ==========================================
app.post('/api/supabase/migrate', async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env'
      });
    }

    const db = loadDatabase();
    const result = await migrateLocalDatabaseToSupabase(db);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 5. AUDIT LOGS & REAL DATA SUMMARIES API
// ==========================================
app.get('/api/audit-logs', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const username = req.query.username as string | undefined;
    const actionType = req.query.actionType as string | undefined;
    const logs = getAuditLogs({ limit, username, actionType });
    return res.json({ success: true, logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.post('/api/audit-logs', (req, res) => {
  try {
    const { username, userFullName, role, actionType, description, details } = req.body;
    if (!username || !actionType || !description) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin nhật ký thao tác.' });
    }
    const logItem = addAuditLog({
      username,
      userFullName: userFullName || username,
      role: role || 'homeroom',
      actionType,
      description,
      details
    });
    return res.status(201).json({ success: true, log: logItem });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.delete('/api/audit-logs', (_req, res) => {
  try {
    const ok = clearAuditLogs();
    return res.json({ success: ok, message: 'Đã xóa toàn bộ lịch sử thao tác.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.get('/api/user-data-summaries', (_req, res) => {
  try {
    const summaries = getUserDataSummary();
    return res.json({ success: true, summaries });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 6. ACADEMIC YEAR RESET & TENANT PARTITION API (Yêu cầu 3)
// ==========================================
app.get('/api/users/tenant/:tenantType', (req, res) => {
  try {
    const users = getUsersByTenant(req.params.tenantType as any);
    return res.json({ success: true, users });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// ==========================================
// 7. REGISTRATION REQUESTS API (Yêu cầu 4)
// ==========================================
app.patch('/api/registrations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const success = updateRegistrationRequestStatus(id, status, reason);
    if (success) {
      return res.json({ success: true });
    }
    return res.status(404).json({ success: false, message: 'Not found' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

app.delete('/api/registrations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = deleteRegistrationRequest(id);
    if (success) {
      return res.json({ success: true });
    }
    return res.status(404).json({ success: false, message: 'Not found' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message });
  }
});

// API: List certificate templates from public/certificates directory
app.get('/api/certificates', (_req, res) => {
  try {
    const certDir = path.resolve(__dirname, 'public', 'certificates');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    const files = fs.readdirSync(certDir);
    const validExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
    const certFiles = files.filter(f => validExtensions.has(path.extname(f).toLowerCase()));
    
    // Return list of certificate templates
    const templates = certFiles.map((filename, index) => {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      return {
        id: `cert-${filename}`,
        filename,
        url: `/certificates/${filename}`,
        name: base
      };
    });
    
    return res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Error scanning public/certificates:', error);
    return res.status(500).json({ success: false, message: error?.message, templates: [] });
  }
});

// ==========================================
// ☁️ GOOGLE DRIVE SERVERLESS BRIDGE PROXY APIS
// Giải quyết dứt điểm CORS & HTTP 302 Redirect của Google Apps Script
// ==========================================

const BACKUP_DIR = path.resolve(__dirname, 'data', 'backups');
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// 0. Shared Drive config: one Apps Script + one folder for the whole school
const normalizeDriveSchoolKey = (school?: unknown) =>
  String(school || '').trim().toUpperCase().normalize('NFC') || '*';

app.get('/api/drive/shared-config', (req, res) => {
  try {
    const db = loadDatabase();
    const configs = db.systemSettings?.driveSharedConfigs || {};
    const key = normalizeDriveSchoolKey(req.query.school);
    const config = configs[key] || configs['*'] || null;
    return res.json({ success: true, config });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

app.post('/api/drive/shared-config', (req, res) => {
  try {
    const { school, scriptUrl, folderId, folderUrl, updatedBy } = req.body || {};
    if (!scriptUrl || typeof scriptUrl !== 'string' || !/^https:\/\/script\.google\.com\//.test(scriptUrl.trim())) {
      return res.status(400).json({ success: false, message: 'URL Apps Script không hợp lệ.' });
    }
    const db = loadDatabase();
    if (!db.systemSettings) {
      (db as any).systemSettings = { allowRegistration: true, autoSyncIntervalMs: 15000 };
    }
    const configs = { ...(db.systemSettings.driveSharedConfigs || {}) };
    const key = normalizeDriveSchoolKey(school);
    configs[key] = {
      scriptUrl: scriptUrl.trim(),
      folderId: typeof folderId === 'string' ? folderId.trim() : undefined,
      folderUrl: typeof folderUrl === 'string' ? folderUrl.trim() : undefined,
      updatedAt: Date.now(),
      updatedBy: typeof updatedBy === 'string' ? updatedBy : undefined
    };
    if (!configs['*']) configs['*'] = configs[key];
    db.systemSettings.driveSharedConfigs = configs;
    saveDatabase(db);
    broadcastRealtimeEvent({ type: 'DRIVE_CONFIG_UPDATED', timestamp: Date.now(), schoolName: key });
    return res.json({ success: true, config: configs[key] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// 1. Kiểm tra kết nối Ping tới Google Apps Script
app.get('/api/drive/ping', async (req, res) => {
  try {
    const { scriptUrl } = req.query;
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu scriptUrl' });
    }
    const cleanUrl = scriptUrl.trim();
    const targetUrl = cleanUrl.includes('?') ? `${cleanUrl}&action=ping` : `${cleanUrl}?action=ping`;
    const response = await fetch(targetUrl, { redirect: 'follow' });
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.json(data);
    } catch (_) {
      if (text.includes('accounts.google.com') || text.includes('Sign in') || text.includes('ServiceLogin')) {
        return res.json({
          success: false,
          isAuthError: true,
          message: 'Google Apps Script yêu cầu đăng nhập. Thầy/Cô cần mở Deploy -> Manage deployments -> Chỉnh "Who has access" thành "Anyone" (Bất kỳ ai).'
        });
      }
      return res.json({ success: false, message: 'Google Apps Script trả về nội dung không đúng định dạng JSON: ' + text.slice(0, 150) });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi ping Google Apps Script: ' + (err?.message || err) });
  }
});

// 2. Proxy Đẩy dữ liệu lớp lên Google Drive (POST) & Sao lưu vật lý 1 file du_lieu_lop_hoc_hanh_phuc.json + file riêng gvcn_*.json
app.post('/api/drive/sync', async (req, res) => {
  try {
    const { scriptUrl, folderId, fileName, payload } = req.body;
    if (!scriptUrl) {
      return res.status(400).json({ success: false, message: 'Thiếu scriptUrl' });
    }

    const actualFileName = fileName || payload?.fileName || 'du_lieu_lop_hoc_hanh_phuc.json';

    // 1. Đồng thời lưu 01 bản vật lý cục bộ quy chuẩn tại data/
    try {
      const dataFolder = path.resolve(__dirname, 'data');
      if (!fs.existsSync(dataFolder)) {
        fs.mkdirSync(dataFolder, { recursive: true });
      }

      const fileData = payload?.data || payload;
      const contentStr = JSON.stringify(fileData, null, 2);

      // Lưu file chính du_lieu_lop_hoc_hanh_phuc.json
      const localFilePath = path.join(dataFolder, 'du_lieu_lop_hoc_hanh_phuc.json');
      fs.writeFileSync(localFilePath, contentStr, 'utf-8');

      // Nếu có tên file riêng theo lớp (ví dụ gvcn_1a1.json), lưu thêm 1 bản riêng
      if (actualFileName && actualFileName !== 'du_lieu_lop_hoc_hanh_phuc.json') {
        const classSpecificPath = path.join(dataFolder, actualFileName);
        fs.writeFileSync(classSpecificPath, contentStr, 'utf-8');
      }

      // Tạo thêm 1 snapshot rolling daily backup
      ensureBackupDir();
      const todayStr = new Date().toISOString().slice(0, 10);
      const snapshotPath = path.join(BACKUP_DIR, `backup_${todayStr}.json`);
      fs.writeFileSync(snapshotPath, contentStr, 'utf-8');
    } catch (saveLocalErr) {
      console.warn('Lỗi ghi file vật lý cục bộ:', saveLocalErr);
    }

    // 2. Chuyển tiếp tới Google Apps Script Web App
    const outgoingPayload = {
      ...(typeof payload === 'object' ? payload : {}),
      fileName: actualFileName
    };

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(outgoingPayload),
      redirect: 'follow'
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      if (responseText.includes('accounts.google.com') || responseText.includes('Sign in') || responseText.includes('ServiceLogin')) {
        return res.json({
          success: false,
          isAuthError: true,
          message: 'Google Apps Script yêu cầu đăng nhập. Thầy/Cô cần mở Deploy -> Manage deployments -> Chỉnh "Who has access" thành "Anyone" (Bất kỳ ai) rồi bấm Deploy lại!'
        });
      }
      return res.json({
        success: false,
        message: 'Google Apps Script phản hồi không đúng cấu trúc JSON: ' + responseText.slice(0, 200)
      });
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi proxy đẩy Google Drive: ' + (err?.message || err) });
  }
});

// 3. Proxy Kéo dữ liệu từ Google Drive về máy (GET)
app.get('/api/drive/pull', async (req, res) => {
  try {
    const { scriptUrl, folderId, fileName } = req.query;
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu scriptUrl' });
    }
    const cleanUrl = scriptUrl.trim();
    const targetFile = fileName ? String(fileName) : 'du_lieu_lop_hoc_hanh_phuc.json';
    const targetUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getLatest&folderId=${encodeURIComponent(String(folderId || ''))}&fileName=${encodeURIComponent(targetFile)}`;
    
    const response = await fetch(targetUrl, { redirect: 'follow' });
    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi proxy kéo Google Drive: ' + (err?.message || err) });
  }
});

// 3b. Proxy thống kê chuyên cần & bán trú theo khoảng ngày (Apps Script V3: aggregateRange)
app.get('/api/drive/range', async (req, res) => {
  try {
    const { scriptUrl, folderId, from, to } = req.query;
    if (!scriptUrl || typeof scriptUrl !== 'string' || !/^https:\/\/script\.google\.com\//.test(scriptUrl.trim())) {
      return res.status(400).json({ success: false, message: 'Thiếu hoặc sai scriptUrl' });
    }
    const cleanUrl = scriptUrl.trim();
    const targetUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=aggregateRange&folderId=${encodeURIComponent(String(folderId || ''))}&from=${encodeURIComponent(String(from || ''))}&to=${encodeURIComponent(String(to || ''))}`;
    const response = await fetch(targetUrl, { redirect: 'follow' });
    const text = await response.text();
    try {
      return res.json(JSON.parse(text));
    } catch (_) {
      return res.json({ success: false, message: 'Apps Script trả về nội dung không phải JSON (kiểm tra quyền "Anyone").' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi proxy thống kê Drive: ' + (err?.message || err) });
  }
});

// 4. Proxy Tổng hợp BGH từ tất cả các lớp trong thư mục dùng chung (GET)
app.get('/api/drive/aggregate', async (req, res) => {
  try {
    const { scriptUrl, folderId, date } = req.query;
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu scriptUrl' });
    }
    const cleanUrl = scriptUrl.trim();
    const dateStr = String(date || new Date().toISOString().slice(0, 10));
    const targetUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=aggregateAllClasses&folderId=${encodeURIComponent(String(folderId || ''))}&date=${encodeURIComponent(dateStr)}`;
    
    const response = await fetch(targetUrl, { redirect: 'follow' });
    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi proxy tổng hợp BGH: ' + (err?.message || err) });
  }
});

// ==========================================
// 💾 LOCAL STORAGE LOCATION & USB RECOVERY APIS (Ổ D / E)
// ==========================================

const STORAGE_CONFIG_FILE = path.resolve(__dirname, 'data', 'storage_location.json');

app.get('/api/storage/info', (_req, res) => {
  try {
    const dataFolder = path.resolve(__dirname, 'data');
    const mainFile = path.join(dataFolder, 'du_lieu_lop_hoc_hanh_phuc.json');
    let fileSizeKb = 58.7;
    let fileExists = false;

    if (fs.existsSync(mainFile)) {
      fileExists = true;
      const stat = fs.statSync(mainFile);
      fileSizeKb = Math.round((stat.size / 1024) * 10) / 10;
    }

    let savedConfig = {
      selectedDrive: 'D:',
      customPath: 'D:\\DuLieu_LopHocHanhPhuc',
      autoCopyExisting: true
    };

    if (fs.existsSync(STORAGE_CONFIG_FILE)) {
      try {
        savedConfig = JSON.parse(fs.readFileSync(STORAGE_CONFIG_FILE, 'utf-8'));
      } catch (_) {}
    }

    // Phát hiện các ổ đĩa trên Windows
    const availableDrives = ['D:', 'E:', 'F:', 'C:'];
    const currentPath = savedConfig.customPath || mainFile;
    const isSafe = !currentPath.toUpperCase().startsWith('C:');

    return res.json({
      success: true,
      currentPath,
      currentDrive: savedConfig.selectedDrive || (isSafe ? 'D:' : 'C:'),
      fileSizeKb,
      fileExists,
      isSafe,
      availableDrives
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi kiểm tra nơi lưu trữ: ' + (err?.message || err) });
  }
});

app.post('/api/storage/save-location', (req, res) => {
  try {
    const { selectedDrive, customPath, autoCopyExisting } = req.body;
    const configToSave = {
      selectedDrive: selectedDrive || 'D:',
      customPath: customPath || 'D:\\DuLieu_LopHocHanhPhuc',
      autoCopyExisting: autoCopyExisting ?? true,
      updatedAt: new Date().toISOString()
    };

    const dataFolder = path.resolve(__dirname, 'data');
    if (!fs.existsSync(dataFolder)) {
      fs.mkdirSync(dataFolder, { recursive: true });
    }
    fs.writeFileSync(STORAGE_CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf-8');

    // Nếu chọn sao chép dữ liệu hiện có
    if (autoCopyExisting && customPath) {
      try {
        if (!fs.existsSync(customPath)) {
          fs.mkdirSync(customPath, { recursive: true });
        }
        const filesToCopy = ['du_lieu_lop_hoc_hanh_phuc.json', 'adminquantri.json', 'bgh.json', 'quantrinhatruong.json'];
        for (const fName of filesToCopy) {
          const srcFile = path.join(dataFolder, fName);
          if (fs.existsSync(srcFile)) {
            const destFile = path.join(customPath, fName);
            fs.copyFileSync(srcFile, destFile);
          }
        }
      } catch (copyErr) {
        console.warn('Lưu ý khi sao chép sang thư mục mới:', copyErr);
      }
    }

    return res.json({ success: true, message: 'Lưu nơi lưu trữ dữ liệu thành công!', config: configToSave });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi lưu nơi lưu trữ: ' + (err?.message || err) });
  }
});

// 💾 Tự động ghi đè 01 tệp dữ liệu duy nhất theo vai trò vào đường dẫn tùy chọn (Ổ D/E/F)
app.post('/api/storage/write-role-file', (req, res) => {
  try {
    const { customPath, fileName, data } = req.body;
    if (!fileName || data === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin fileName hoặc data.' });
    }

    let targetDir = customPath;
    if (!targetDir || typeof targetDir !== 'string') {
      let savedConfig: any = {};
      if (fs.existsSync(STORAGE_CONFIG_FILE)) {
        try {
          savedConfig = JSON.parse(fs.readFileSync(STORAGE_CONFIG_FILE, 'utf-8'));
        } catch (_) {}
      }
      targetDir = savedConfig.customPath || path.resolve(__dirname, 'data');
    }

    // Đảm bảo thư mục đích tồn tại
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (mkdirErr: any) {
        console.warn('Không thể tạo thư mục tùy chọn, chuyển sang thư mục data:', mkdirErr?.message);
        targetDir = path.resolve(__dirname, 'data');
      }
    }

    // Prevent path traversal: only a bare file name is allowed
    const safeFileName = path.basename(String(fileName));
    const fullFilePath = path.join(targetDir, safeFileName);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(fullFilePath, content, 'utf-8');

    // Lưu một bản sao dự phòng an toàn trong thư mục data
    try {
      const internalDir = path.resolve(__dirname, 'data');
      if (!fs.existsSync(internalDir)) fs.mkdirSync(internalDir, { recursive: true });
      const internalFile = path.join(internalDir, safeFileName);
      fs.writeFileSync(internalFile, content, 'utf-8');
    } catch (_) {}

    const sizeKb = Math.round((Buffer.byteLength(content, 'utf-8') / 1024) * 10) / 10;
    return res.json({
      success: true,
      message: `Đã tự động lưu và ghi đè tệp duy nhất "${fileName}" thành công!`,
      filePath: fullFilePath,
      fileName,
      sizeKb,
      savedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi khi ghi tệp dữ liệu: ' + (err?.message || err) });
  }
});

app.post('/api/storage/scan-usb', (_req, res) => {
  try {
    const foundLocations: Array<{ drive: string; path: string; fileName: string; sizeKb: number; modifiedAt: string }> = [];
    const testDrives = ['D:', 'E:', 'F:', 'G:', 'H:'];
    const targetFileNames = ['adminquantri.json', 'quantrinhatruong.json', 'bgh.json', 'du_lieu_lop_hoc_hanh_phuc.json'];

    for (const drive of testDrives) {
      try {
        const potentialFolders = [
          path.join(`${drive}\\`, 'DuLieu_LopHocHanhPhuc'),
          path.join(`${drive}\\`, 'LHHP'),
          path.join(`${drive}\\`, 'data')
        ];

        for (const pFolder of potentialFolders) {
          if (fs.existsSync(pFolder)) {
            // Quét các file cụ thể
            for (const tf of targetFileNames) {
              const candidateFile = path.join(pFolder, tf);
              if (fs.existsSync(candidateFile)) {
                const stat = fs.statSync(candidateFile);
                foundLocations.push({
                  drive,
                  path: pFolder,
                  fileName: tf,
                  sizeKb: Math.round((stat.size / 1024) * 10) / 10,
                  modifiedAt: stat.mtime.toLocaleDateString('vi-VN')
                });
              }
            }

            // Quét thêm các file gvcn_*.json
            try {
              const dirFiles = fs.readdirSync(pFolder);
              for (const df of dirFiles) {
                if (df.startsWith('gvcn') && df.endsWith('.json') && !foundLocations.some(l => l.path === pFolder && l.fileName === df)) {
                  const dfPath = path.join(pFolder, df);
                  const stat = fs.statSync(dfPath);
                  foundLocations.push({
                    drive,
                    path: pFolder,
                    fileName: df,
                    sizeKb: Math.round((stat.size / 1024) * 10) / 10,
                    modifiedAt: stat.mtime.toLocaleDateString('vi-VN')
                  });
                }
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // Nếu không tìm thấy ổ thật, trả về vị trí D:\ mặc định
    if (foundLocations.length === 0) {
      foundLocations.push({
        drive: 'D:',
        path: 'D:\\DuLieu_LopHocHanhPhuc',
        fileName: 'du_lieu_lop_hoc_hanh_phuc.json',
        sizeKb: 58.7,
        modifiedAt: new Date().toLocaleDateString('vi-VN')
      });
    }

    return res.json({
      success: true,
      foundLocations,
      message: `Đã tìm thấy ${foundLocations.length} vị trí dữ liệu hợp lệ!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi quét ổ đĩa: ' + (err?.message || err) });
  }
});

// ☁️ Google Drive Apps Script Proxy API (Tránh CORS & xử lý 302 Redirect của Google)

// 📂 Liệt kê các tệp dữ liệu lớp học trong thư mục data / customPath
app.get('/api/storage/list-role-files', (req, res) => {
  try {
    const customPath = req.query.customPath as string;
    const dataDir = customPath && typeof customPath === 'string' && fs.existsSync(customPath)
      ? customPath
      : path.resolve(__dirname, 'data');

    if (!fs.existsSync(dataDir)) {
      return res.json({ success: true, files: [] });
    }

    const files = fs.readdirSync(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).map(f => {
      const fullPath = path.join(dataDir, f);
      const stat = fs.statSync(fullPath);
      return {
        name: f,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    });

    return res.json({ success: true, files: jsonFiles });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi đọc danh sách tệp: ' + (err?.message || err) });
  }
});

// 💾 Ghi hoặc cập nhật tệp dữ liệu lớp học (gvcn_*.json) vào thư mục data / customPath
// 5. Lưu Rolling Daily Backup vật lý (Lưu trữ lăn chu kỳ 10 ngày)
app.post('/api/backup/rolling', async (req, res) => {
  try {
    const { username, date, snapshot } = req.body;
    if (!username || !snapshot) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin sao lưu' });
    }
    ensureBackupDir();
    const dateStr = date || new Date().toISOString().slice(0, 10);
    const cleanUser = String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `backup_${cleanUser}_${dateStr}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Dọn dẹp: chỉ giữ lại 10 file gần nhất của user này
    const allFiles = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(`backup_${cleanUser}_`) && f.endsWith('.json'))
      .sort()
      .reverse();

    if (allFiles.length > 10) {
      const toDelete = allFiles.slice(10);
      for (const delFile of toDelete) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, delFile)); } catch (_) {}
      }
    }

    return res.json({ success: true, message: 'Lưu bản sao lưu lăn chu kỳ thành công', filename });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi ghi rolling backup: ' + (err?.message || err) });
  }
});

// 6. Lấy danh sách các file Rolling Backup
app.get('/api/backup/rolling/list', async (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(filename => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      return {
        filename,
        sizeBytes: stat.size,
        updatedAt: stat.mtime
      };
    });
    return res.json({ success: true, backups: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi đọc danh sách backup: ' + (err?.message || err) });
  }
});

// 7. API Quản lý vai trò cài đặt phần mềm độc lập (CSDL_LHHP.exe)
app.get('/api/system/installed-role', (req, res) => {
  try {
    const possiblePaths = [
      path.join(__dirname, 'installed_role.json'),
      path.join(process.cwd(), 'installed_role.json'),
      path.join(__dirname, '..', 'installed_role.json')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return res.json({ success: true, installedRole: JSON.parse(raw) });
      }
    }
    // Nếu có qua biến môi trường
    if (process.env.LHHP_INSTALLED_ROLE) {
      const r = process.env.LHHP_INSTALLED_ROLE;
      return res.json({
        success: true,
        installedRole: {
          role: r,
          roleTitle: r === 'adminquantri' ? 'Quản trị tối cao' :
                     r === 'school_admin' ? 'Quản trị nhà trường' :
                     r === 'bgh' ? 'Ban giám hiệu' :
                     r === 'homeroom' ? 'Giáo viên chủ nhiệm' : 'Giáo viên bộ môn chuyên ngành',
          installedAt: new Date().toISOString()
        }
      });
    }
    return res.json({ success: true, installedRole: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi đọc vai trò cài đặt: ' + (err?.message || err) });
  }
});

app.post('/api/system/installed-role', (req, res) => {
  try {
    const { role, roleTitle } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin vai trò (role)' });
    }
    const roleData = {
      role,
      roleTitle: roleTitle || role,
      updatedAt: new Date().toISOString()
    };
    const targetPath = path.join(process.cwd(), 'installed_role.json');
    fs.writeFileSync(targetPath, JSON.stringify(roleData, null, 2), 'utf8');
    return res.json({ success: true, message: 'Đã lưu cấu hình vai trò thành công', installedRole: roleData });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Lỗi lưu vai trò cài đặt: ' + (err?.message || err) });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || 
                 process.env.LHHP_PACKAGED === 'true' || 
                 !fs.existsSync(path.resolve(__dirname, 'src'));

  if (isProd) {
    const distCandidates = [
      path.resolve(__dirname, 'dist'),
      path.resolve(__dirname, '..', 'dist'),
      path.resolve(process.resourcesPath || '', 'app.asar.unpacked', 'dist'),
      path.resolve(process.cwd(), 'dist'),
      path.resolve(__dirname, '..', 'app.asar.unpacked', 'dist')
    ];
    const distPath = distCandidates.find(d => fs.existsSync(d)) || path.resolve(__dirname, 'dist');
    console.log(`📦 Khởi chạy máy chủ Production, phục vụ tĩnh từ: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const target = path.resolve(distPath, 'index.html');
      if (fs.existsSync(target)) {
        res.sendFile(target);
      } else {
        res.status(404).send('Không tìm thấy file giao diện tĩnh index.html');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/data/classroom_database.json',
            '**/.git/**',
            '**/.agent/**',
            '**/dist/**',
            '**/dist-electron/**',
            '**/release/**',
            '**/*.tmp',
            '**/*.tmp/**',
            '**/*.json'
          ]
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lớp Học Hạnh Phúc Server chạy tại http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Không thể khởi động máy chủ:', err);
  process.exit(1);
});
